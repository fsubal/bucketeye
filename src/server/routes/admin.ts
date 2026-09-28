import { Hono } from "hono";
import type { AppEnv } from "../app";
import { requireAdmin } from "../auth/middleware";
import { lastIndexRun, listIndexRuns } from "../db/indexRuns";
import { commentsPrefix, sidecarPrefix, statusSidecarKey } from "../s3/keys";
import { HttpProblem } from "./problem";
import { targetKey } from "./objects";

/**
 * 運用・調査用の admin エンドポイント。ブラウザからも、開発中は `npm run api`（hono request）からも叩く。
 * hono request を使うときは ADMIN_API_TOKENS のトークンを Authorization: Bearer で渡す
 */
export function adminRoutes() {
  const r = new Hono<AppEnv>();
  r.use("*", requireAdmin);

  /**
   * 再索引を今すぐ走らせる。
   * - 既定: 待たずに 202 を返す（ブラウザの「再索引」ボタン）
   * - ?wait=true: 終わるまで待って結果を返す。hono request はレスポンスを受け取るとプロセスが終わるので、こちらを使う
   */
  r.post("/reindex", async (c) => {
    const { poller, db } = c.get("deps");
    const alreadyRunning = poller.isRunning;
    const running = poller.runNow();
    if (c.req.query("wait") !== "true") {
      void running;
      return c.json({ started: !alreadyRunning, running: true }, 202);
    }
    const result = await running;
    const run = lastIndexRun(db);
    if (!result) {
      throw HttpProblem.status(500, run?.error ?? "reindex failed");
    }
    return c.json({ started: !alreadyRunning, running: false, result, run });
  });

  r.get("/index-runs", (c) =>
    c.json({
      runs: listIndexRuns(c.get("deps").db),
      running: c.get("deps").poller.isRunning,
    }),
  );

  /**
   * GET /admin/storage/*  — そのキーについて S3 に実際に何が置かれているかを返す（アプリの索引ではなく生の状態）。
   * 承認ステータスのタグ、sidecar 戦略の status.json、コメントのサイドカーのキーが分かる
   */
  r.get("/storage/*", async (c) => {
    const { s3, config } = c.get("deps");
    const key = targetKey(c, "/api/v1/admin/storage/");
    const head = await s3.head(key);
    if (!head) throw HttpProblem.notFound();

    // GCS の S3 互換 API などはタグに対応していないので、失敗しても他の情報は返す
    let tags: Record<string, string> | null = null;
    let tagsError: string | null = null;
    try {
      tags = await s3.getTags(key);
    } catch (e) {
      tagsError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }

    const reviewPrefix = config.s3.reviewPrefix;
    const commentKeys: string[] = [];
    for await (const entry of s3.eachObject({
      prefix: commentsPrefix(reviewPrefix, key),
      bucket: s3.reviewBucket,
    })) {
      commentKeys.push(entry.key);
    }
    const statusKey = statusSidecarKey(reviewPrefix, key);

    return c.json({
      bucket: s3.bucket,
      key,
      head: {
        etag: head.etag,
        size: head.size,
        contentType: head.contentType,
        lastModified: head.lastModified,
      },
      statusStrategy: config.s3.statusStrategy,
      tags,
      tagsError,
      sidecar: {
        bucket: s3.reviewBucket,
        prefix: sidecarPrefix(reviewPrefix, key),
        statusKey,
        status: await s3.getJson(statusKey, s3.reviewBucket),
        commentKeys: commentKeys.sort(),
      },
    });
  });

  return r;
}
