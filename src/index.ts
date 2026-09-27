// `hono request`（Hono CLI）用のエントリ。npm run api から使う:
//   npm run api -- -P /api/v1/objects -H "Authorization: Bearer $API_TOKEN"
//   npm run api -- -X POST -P "/api/v1/admin/reindex?wait=true" -H "Authorization: Bearer $ADMIN_API_TOKEN"
//
// hono request はこのファイルを esbuild で束ね、default export の app に app.request() を投げる（サーバは立てない）。
// ここではサーバ起動・ポーリング・Webhook 配送・SPA 配信はしない（それは src/server/index.ts の役目）。

// 最初に読み込むこと。束ねた AWS SDK の CommonJS 部分が require("node:https") などを呼ぶので、
// data: URL から import された ESM でも require が使えるようにしておく
import "@/server/requireShim";
import { existsSync } from "node:fs";
import { createApp } from "@/server/app";
import { createDeps } from "@/server/deps";

// hono request には環境変数を渡す口がないので .env を読む（シェルで設定済みの値は上書きしない）
if (existsSync(".env")) process.loadEnvFile(".env");

export default createApp(
  createDeps({ log: (message) => console.error(message) }),
  { logRequests: false },
);
