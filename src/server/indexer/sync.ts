import { toIso } from '@/domains/Annotation/model'
import type { Comment } from '@/domains/Annotation/model'
import type { ReviewedObject } from '@/domains/ReviewedObject/model'
import { nowIso } from '../db/database'
import { replaceComments } from '../db/comments'
import { deleteObject, findObject, toReviewedObject, upsertObject } from '../db/objects'
import type { IndexerDeps } from './indexer'
import { PENDING } from '../s3/statusStore'

/** 詳細画面用: S3 から 1 件読み直して upsert する。オブジェクトが無ければ行を消して null */
export async function syncObject(deps: Pick<IndexerDeps, 'db' | 's3' | 'statusStore'>, key: string): Promise<ReviewedObject | null> {
  const { db, s3 } = deps
  const head = await s3.head(key)
  if (!head) {
    deleteObject(db, s3.bucket, key)
    return null
  }
  const status = (await deps.statusStore.read(key)) ?? PENDING
  const row = {
    bucket: s3.bucket,
    key,
    etag: head.etag,
    size: head.size,
    content_type: head.contentType,
    last_modified: head.lastModified ? toIso(head.lastModified) : null,
    status: status.status,
    status_updated_at: status.updatedAt,
    reviewer: status.reviewer,
    indexed_at: nowIso(),
  }
  upsertObject(db, row)
  return toReviewedObject(row)
}

export async function syncComments(deps: Pick<IndexerDeps, 'db' | 's3' | 'commentStore'>, key: string): Promise<Comment[]> {
  return replaceComments(deps.db, deps.s3.bucket, key, await deps.commentStore.list(key))
}

/** 索引にあればそれを、無ければ S3 から同期して返す */
export async function findOrSyncObject(deps: Pick<IndexerDeps, 'db' | 's3' | 'statusStore'>, key: string): Promise<ReviewedObject | null> {
  const row = findObject(deps.db, deps.s3.bucket, key)
  return row ? toReviewedObject(row) : syncObject(deps, key)
}
