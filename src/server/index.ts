import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createDeps } from "./deps";
import { mountStatic } from "./static";
import { WebhookWorker } from "./webhooks/worker";

// 運用・開発の操作（再索引、S3 の状態の確認など）は CLI ではなく admin の API にある。
// 開発中は `npm run api`（Hono CLI の hono request、エントリは src/index.ts）で叩く
main();

function main() {
  let deps;
  try {
    deps = createDeps();
  } catch (e) {
    console.error(`[bucketeye] ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
  const { config } = deps;
  const app = createApp(deps);
  const staticMounted = mountStatic(app);

  const worker = new WebhookWorker(deps.db, {
    intervalSeconds: config.webhookWorkerIntervalSeconds,
    log: console.log,
  });
  deps.poller.start(config.reindexOnBoot);
  worker.start();

  const server = serve(
    { fetch: app.fetch, port: config.port, hostname: config.host },
    (info) => {
      console.log(
        `[bucketeye] listening on http://${info.address}:${info.port} ` +
          `(auth=${config.auth.provider}, bucket=s3://${config.s3.bucket}/${config.s3.targetPrefix}, status=${config.s3.statusStrategy}, ui=${staticMounted ? "dist/web" : "none (run vite dev)"})`,
      );
    },
  );

  const shutdown = () => {
    console.log("[bucketeye] shutting down");
    deps.poller.stop();
    worker.stop();
    server.close(() => {
      deps.db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
