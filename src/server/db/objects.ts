import type { SQLInputValue } from 'node:sqlite'
import type { Db } from './database'
import { escapeLike } from './database'
import { kindOf, nameOf, type ReviewedObject, type ReviewStatus } from '@/domains/ReviewedObject/model'

export type ObjectRow = {
  bucket: string
  key: string
  etag: string | null
  size: number | null
  content_type: string | null
  last_modified: string | null
  status: ReviewStatus
  status_updated_at: string | null
  reviewer: string | null
  indexed_at: string
}

export function toReviewedObject(row: ObjectRow): ReviewedObject {
  return {
    bucket: row.bucket,
    key: row.key,
    name: nameOf(row.key),
    etag: row.etag,
    size: row.size,
    contentType: row.content_type,
    kind: kindOf(row.content_type),
    lastModified: row.last_modified,
    status: row.status,
    statusUpdatedAt: row.status_updated_at,
    reviewer: row.reviewer,
    indexedAt: row.indexed_at,
  }
}

export function findObject(db: Db, bucket: string, key: string): ObjectRow | null {
  return (db.prepare('SELECT * FROM objects WHERE bucket = ? AND key = ?').get(bucket, key) as ObjectRow | undefined) ?? null
}

export function upsertObject(db: Db, row: ObjectRow): void {
  db.prepare(
    `INSERT INTO objects (bucket, key, etag, size, content_type, last_modified, status, status_updated_at, reviewer, indexed_at)
     VALUES (@bucket, @key, @etag, @size, @content_type, @last_modified, @status, @status_updated_at, @reviewer, @indexed_at)
     ON CONFLICT (bucket, key) DO UPDATE SET
       etag = excluded.etag, size = excluded.size, content_type = excluded.content_type, last_modified = excluded.last_modified,
       status = excluded.status, status_updated_at = excluded.status_updated_at, reviewer = excluded.reviewer, indexed_at = excluded.indexed_at`,
  ).run(row)
}

export function updateObjectStatus(
  db: Db,
  bucket: string,
  key: string,
  status: { status: ReviewStatus; updatedAt: string | null; reviewer: string | null },
): void {
  db.prepare('UPDATE objects SET status = ?, status_updated_at = ?, reviewer = ? WHERE bucket = ? AND key = ?').run(
    status.status,
    status.updatedAt,
    status.reviewer,
    bucket,
    key,
  )
}

export function deleteObject(db: Db, bucket: string, key: string): void {
  db.prepare('DELETE FROM objects WHERE bucket = ? AND key = ?').run(bucket, key)
  db.prepare('DELETE FROM comments WHERE bucket = ? AND key = ?').run(bucket, key)
}

/** 今回の索引で見なかった行（indexed_at が古い）を消す */
export function deleteObjectsIndexedBefore(db: Db, bucket: string, startedAt: string): number {
  const stale = db.prepare('SELECT key FROM objects WHERE bucket = ? AND indexed_at < ?').all(bucket, startedAt) as Array<{ key: string }>
  for (const { key } of stale) deleteObject(db, bucket, key)
  return stale.length
}

export function hasAnyObject(db: Db, bucket: string): boolean {
  return db.prepare('SELECT 1 FROM objects WHERE bucket = ? LIMIT 1').get(bucket) !== undefined
}

/** prefix の直下にある「フォルダ」名（"foo/" の形） */
export function listChildPrefixes(db: Db, bucket: string, prefix: string): string[] {
  const offset = prefix.length + 1
  const rows = db
    .prepare(
      `SELECT DISTINCT substr(key, ?1, instr(substr(key, ?1), '/')) AS folder
       FROM objects
       WHERE bucket = ?2 AND key LIKE ?3 ESCAPE '\\' AND substr(key, ?1) LIKE '%/%'
       ORDER BY folder`,
    )
    .all(offset, bucket, `${escapeLike(prefix)}%`) as Array<{ folder: string }>
  return rows.map((r) => r.folder)
}

export type ListOptions = {
  bucket: string
  prefix: string
  /** 指定時はフォルダを無視して prefix 以下を平らに並べる */
  status?: ReviewStatus | null
  limit: number
  offset: number
}

function listWhere(o: ListOptions): { where: string; params: SQLInputValue[] } {
  const params: SQLInputValue[] = [o.bucket, `${escapeLike(o.prefix)}%`]
  let where = `bucket = ? AND key LIKE ? ESCAPE '\\'`
  if (o.status) {
    where += ' AND status = ?'
    params.push(o.status)
  } else {
    where += ` AND substr(key, ?) NOT LIKE '%/%'`
    params.push(o.prefix.length + 1)
  }
  return { where, params }
}

export function listObjects(db: Db, o: ListOptions): ObjectRow[] {
  const { where, params } = listWhere(o)
  return db.prepare(`SELECT * FROM objects WHERE ${where} ORDER BY key LIMIT ? OFFSET ?`).all(...params, o.limit, o.offset) as ObjectRow[]
}

export function countObjects(db: Db, o: ListOptions): number {
  const { where, params } = listWhere(o)
  return (db.prepare(`SELECT count(*) AS c FROM objects WHERE ${where}`).get(...params) as { c: number }).c
}

/** prefix 以下（再帰）のステータス別件数 */
export function countByStatus(db: Db, bucket: string, prefix: string): Partial<Record<ReviewStatus, number>> {
  const rows = db
    .prepare(`SELECT status, count(*) AS c FROM objects WHERE bucket = ? AND key LIKE ? ESCAPE '\\' GROUP BY status`)
    .all(bucket, `${escapeLike(prefix)}%`) as Array<{ status: ReviewStatus; c: number }>
  return Object.fromEntries(rows.map((r) => [r.status, r.c]))
}
