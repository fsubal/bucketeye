import { toIsoSeconds } from "@/utils/datetime";
import { parseSource, ulidOf } from "@/domains/Annotation/model";
import type { Config } from "../config";
import { type Db, nowIso } from "../db/database";
import { deleteCommentsNotIn, upsertComment } from "../db/comments";
import {
  deleteObjectsIndexedBefore,
  findObject,
  upsertObject,
  type ObjectRow,
} from "../db/objects";
import { deleteWebhooksIndexedBefore, upsertWebhook } from "../db/webhooks";
import type { CommentStore } from "../s3/commentStore";
import type { S3Port } from "../s3/port";
import { PENDING, type StatusStore } from "../s3/statusStore";
import type { WebhookStore } from "../s3/webhookStore";

export type IndexResult = {
  objects: number;
  comments: number;
  webhooks: number;
  removed: number;
};

export type IndexerDeps = {
  config: Config;
  db: Db;
  s3: S3Port;
  statusStore: StatusStore;
  commentStore: CommentStore;
  webhookStore: WebhookStore;
};

/**
 * バケットをクロールして SQLite の索引を作り直す。
 * ステータスはオブジェクトごとに読む（tags 戦略なら GetObjectTagging が N 回飛ぶ。数千件までは許容。
 * 大規模化したら S3 イベント通知や S3 Inventory で差分化する）
 */
export async function runIndex(deps: IndexerDeps): Promise<IndexResult> {
  const { config, db, s3 } = deps;
  const startedAt = nowIso();
  const bucket = s3.bucket;

  let objects = 0;
  for await (const entry of s3.eachObject({ prefix: config.s3.targetPrefix })) {
    if (skip(config, entry.key)) continue;
    const existing = findObject(db, bucket, entry.key);
    let row: ObjectRow;
    if (
      existing &&
      existing.etag === entry.etag &&
      existing.content_type !== null
    ) {
      row = existing;
    } else {
      const head = await s3.head(entry.key);
      if (!head) continue;
      row = {
        bucket,
        key: entry.key,
        etag: head.etag,
        size: head.size,
        content_type: head.contentType,
        last_modified: head.lastModified
          ? toIsoSeconds(head.lastModified)
          : null,
        status: "pending",
        status_updated_at: null,
        reviewer: null,
        indexed_at: startedAt,
      };
    }
    const status = (await deps.statusStore.read(entry.key)) ?? PENDING;
    upsertObject(db, {
      ...row,
      status: status.status,
      status_updated_at: status.updatedAt
        ? toIsoSeconds(status.updatedAt)
        : null,
      reviewer: status.reviewer,
      indexed_at: startedAt,
    });
    objects++;
  }

  let comments = 0;
  const seen = new Set<string>();
  for await (const annotation of deps.commentStore.eachAnnotation()) {
    const src = parseSource(annotation.target.source);
    if (!src || src.bucket !== bucket || !findObject(db, bucket, src.key))
      continue;
    upsertComment(db, bucket, src.key, annotation);
    seen.add(ulidOf(annotation));
    comments++;
  }

  let webhooks = 0;
  for await (const webhook of deps.webhookStore.each()) {
    upsertWebhook(db, webhook, startedAt);
    webhooks++;
  }

  const removed = db.transaction(() => {
    deleteCommentsNotIn(db, bucket, seen);
    deleteWebhooksIndexedBefore(db, startedAt);
    return deleteObjectsIndexedBefore(db, bucket, startedAt);
  });

  return { objects, comments, webhooks, removed };
}

/** サイドカーの prefix と、"フォルダ" を表す 0 バイトのプレースホルダは対象外 */
export function skip(config: Config, key: string): boolean {
  return (
    key.endsWith("/") ||
    (config.s3.reviewPrefixInTargetBucket &&
      key.startsWith(config.s3.reviewPrefix))
  );
}

/** /objects/*key で受けたキーが対象範囲（TARGET_PREFIX 以下、サイドカー以外）か */
export function isTargetKey(config: Config, key: string): boolean {
  return (
    key.length > 0 &&
    key.startsWith(config.s3.targetPrefix) &&
    !skip(config, key)
  );
}
