import type { AppDeps } from "./app";
import { createAuthProvider } from "./auth";
import { buildConfig, type Config } from "./config";
import { openDatabase } from "./db/database";
import { Poller } from "./indexer/poller";
import { AwsS3 } from "./s3/aws";
import { CommentStore } from "./s3/commentStore";
import type { S3Port } from "./s3/port";
import { createStatusStore } from "./s3/statusStore";
import { WebhookStore } from "./s3/webhookStore";
import { Dispatcher } from "./webhooks/dispatcher";

/** 本番/開発の依存を組む。テストは同じ形を MemoryS3 と :memory: で作る（test/helpers.ts） */
export type CreateDepsOptions = {
  config?: Config;
  s3?: S3Port;
  dbPath?: string;
  /** 再索引などの運用ログの出力先。既定は標準出力。hono request では応答と混ざらないよう標準エラーにする */
  log?: (message: string) => void;
};

export function createDeps(options: CreateDepsOptions = {}): AppDeps {
  const config = options.config ?? buildConfig();
  const s3 = options.s3 ?? new AwsS3(config.s3);
  const dbPath = options.dbPath ?? `${config.dataDir}/bucketeye.sqlite`;
  const db = openDatabase(dbPath);
  const statusStore = createStatusStore(
    config.s3.statusStrategy,
    s3,
    config.s3.reviewPrefix,
  );
  const commentStore = new CommentStore(s3, config.s3.reviewPrefix);
  const webhookStore = new WebhookStore(s3, config.s3.reviewPrefix);
  const poller = new Poller(
    { config, db, s3, statusStore, commentStore, webhookStore },
    config.reindexEverySeconds,
    options.log,
  );
  return {
    config,
    db,
    s3,
    statusStore,
    commentStore,
    webhookStore,
    auth: createAuthProvider(config),
    dispatcher: new Dispatcher(db, config.publicUrl),
    poller,
  };
}
