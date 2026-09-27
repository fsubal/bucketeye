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
export function createDeps(
  config: Config = buildConfig(),
  s3: S3Port = new AwsS3(config.s3),
  dbPath = `${config.dataDir}/bucketeye.sqlite`,
): AppDeps {
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
