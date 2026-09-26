import type { AppDeps } from "@/server/app";
import { createApp } from "@/server/app";
import { buildConfig } from "@/server/config";
import { openDatabase } from "@/server/db/database";
import { Poller } from "@/server/indexer/poller";
import { CommentStore } from "@/server/s3/commentStore";
import { MemoryS3 } from "@/server/s3/memory";
import { createStatusStore } from "@/server/s3/statusStore";
import { WebhookStore } from "@/server/s3/webhookStore";
import { Dispatcher } from "@/server/webhooks/dispatcher";
import { createAuthProvider } from "@/server/auth";

export const TEST_ENV = {
  NODE_ENV: "test",
  S3_BUCKET: "test-bucket",
  TARGET_PREFIX: "submissions/",
  ADMIN_EMAILS: "admin@example.com",
  API_TOKENS: "test-api-token",
  AUTH_PROVIDER: "developer",
  SECRET_KEY: "test-secret-key-test-secret-key",
  PUBLIC_URL: "https://review.example.com",
} satisfies Record<string, string>;

/** :memory: の SQLite と MemoryS3 で AppDeps を組む */
export function createTestDeps(env: Record<string, string> = {}) {
  const config = buildConfig({ ...TEST_ENV, ...env });
  const s3 = new MemoryS3(config.s3.bucket, config.s3.reviewBucket);
  const db = openDatabase(":memory:");
  const statusStore = createStatusStore(
    config.s3.statusStrategy,
    s3,
    config.s3.reviewPrefix,
  );
  const commentStore = new CommentStore(s3, config.s3.reviewPrefix);
  const webhookStore = new WebhookStore(s3, config.s3.reviewPrefix);
  const indexerDeps = {
    config,
    db,
    s3,
    statusStore,
    commentStore,
    webhookStore,
  };
  const deps: AppDeps = {
    ...indexerDeps,
    auth: createAuthProvider(config),
    dispatcher: new Dispatcher(db, config.publicUrl),
    poller: new Poller(indexerDeps, 3600, () => {}),
  };
  return { ...deps, s3, app: createApp(deps) };
}

export type TestDeps = ReturnType<typeof createTestDeps>;

export const identity = (
  email = "reviewer@example.com",
  name = "Reviewer",
) => ({ email, name, provider: "test", role: "reviewer" as const });

/** developer ログインして Cookie ヘッダを返す */
export async function signIn(
  app: TestDeps["app"],
  email = "reviewer@example.com",
  name = "Rev",
): Promise<Record<string, string>> {
  const res = await app.request("/api/v1/dev/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, name }),
  });
  if (res.status !== 200)
    throw new Error(`login failed: ${res.status} ${await res.text()}`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { Cookie: cookie };
}

export const json = (body: unknown, headers: Record<string, string> = {}) => ({
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});
