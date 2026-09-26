import { Hono } from "hono";
import { logger } from "hono/logger";
import type { Config } from "./config";
import type { Db } from "./db/database";
import type { AuthProvider } from "./auth";
import { authenticate, type AuthEnv } from "./auth/middleware";
import type { S3Port } from "./s3/port";
import type { StatusStore } from "./s3/statusStore";
import type { CommentStore } from "./s3/commentStore";
import type { WebhookStore } from "./s3/webhookStore";
import type { Dispatcher } from "./webhooks/dispatcher";
import type { Poller } from "./indexer/poller";
import { HttpProblem, problem } from "./routes/problem";
import {
  commentsRoutes,
  objectsRoutes,
  statusesRoutes,
  textsRoutes,
} from "./routes/objects";
import { webhooksRoutes } from "./routes/webhooks";
import { meRoutes } from "./routes/me";
import { devRoutes } from "./routes/dev";
import { adminRoutes } from "./routes/admin";
import { DeveloperProvider } from "./auth/providers/developer";

/** ルートが受け取る依存。テストでは MemoryS3 と :memory: の SQLite で組む */
export type AppDeps = {
  config: Config;
  db: Db;
  s3: S3Port;
  statusStore: StatusStore;
  commentStore: CommentStore;
  webhookStore: WebhookStore;
  auth: AuthProvider;
  dispatcher: Dispatcher;
  poller: Poller;
};

export type AppEnv = AuthEnv & { Variables: { deps: AppDeps } };

export function createApp(deps: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  if (!deps.config.production || process.env["LOG_REQUESTS"] === "true")
    app.use(logger());

  app.get("/up", (c) => c.text("ok"));

  const api = new Hono<AppEnv>();
  api.use("*", async (c, next) => {
    c.set("deps", deps);
    await next();
  });
  api.onError((err, c) => {
    if (err instanceof HttpProblem)
      return problem(c, err.status, err.title, err.detail);
    console.error(err);
    return problem(
      c,
      500,
      "internal_error",
      deps.config.production ? undefined : String(err),
    );
  });
  api.notFound((c) => problem(c, 404, "not_found"));

  // 開発用ログインだけは未認証で叩ける
  if (deps.auth instanceof DeveloperProvider)
    api.route("/dev", devRoutes(deps.auth));

  api.use("*", authenticate(deps.auth, deps.config.auth.apiTokens));
  api.route("/", meRoutes());
  api.route("/objects", objectsRoutes());
  api.route("/texts", textsRoutes());
  api.route("/comments", commentsRoutes());
  api.route("/statuses", statusesRoutes());
  api.route("/webhooks", webhooksRoutes());
  api.route("/admin", adminRoutes());

  app.route("/api/v1", api);
  return app;
}
