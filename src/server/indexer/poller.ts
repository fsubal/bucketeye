import { finishIndexRun, startIndexRun } from "../db/indexRuns";
import { runIndex, type IndexerDeps, type IndexResult } from "./indexer";

/**
 * ジョブキューを使わないポーリング。起動時と REINDEX_EVERY ごとに runIndex を回し、結果を index_runs に残す。
 * 単一プロセス前提なので重複防止はメモリ上のフラグで足りる
 */
export class Poller {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<IndexResult | null> | null = null;

  constructor(
    private readonly deps: IndexerDeps,
    private readonly intervalSeconds: number,
    private readonly log: (msg: string) => void = (m) => console.log(m),
  ) {}

  start(runOnBoot: boolean): void {
    if (runOnBoot) void this.runNow();
    this.timer = setInterval(
      () => void this.runNow(),
      this.intervalSeconds * 1000,
    );
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get isRunning(): boolean {
    return this.running !== null;
  }

  /** 実行中なら同じ Promise を返す（同時に 2 本走らせない） */
  runNow(): Promise<IndexResult | null> {
    if (this.running) return this.running;
    this.running = this.execute().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async execute(): Promise<IndexResult | null> {
    const id = startIndexRun(this.deps.db);
    try {
      const result = await runIndex(this.deps);
      finishIndexRun(this.deps.db, id, result);
      this.log(
        `[reindex] objects=${result.objects} comments=${result.comments} webhooks=${result.webhooks} removed=${result.removed}`,
      );
      return result;
    } catch (e) {
      const error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      finishIndexRun(this.deps.db, id, { error });
      this.log(`[reindex] failed: ${error}`);
      return null;
    }
  }
}
