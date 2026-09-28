import type { Db } from "./database";
import {
  commentOf,
  ulidOf,
  type Annotation,
  Comment,
  Selector,
} from "@/domains/Annotation/model";

type CommentRow = {
  ulid: string;
  bucket: string;
  key: string;
  author_email: string;
  author_name: string | null;
  body: string;
  selector: string | null;
  created_at: string;
};

function toComment(row: CommentRow): Comment {
  const parsed = row.selector
    ? Selector.safeParse(JSON.parse(row.selector))
    : null;

  return Comment.parse({
    id: row.ulid,
    authorEmail: row.author_email,
    authorName: row.author_name,
    body: row.body,
    selector: parsed?.data ?? null,
    // Comment の createdAt は codec なので、保存されている文字列を渡すと Temporal.Instant になる
    createdAt: row.created_at,
  });
}

export function upsertComment(
  db: Db,
  bucket: string,
  key: string,
  annotation: Annotation,
): Comment {
  const c = commentOf(annotation);
  db.prepare(
    `INSERT INTO comments (ulid, bucket, key, author_email, author_name, body, selector, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (ulid) DO UPDATE SET bucket = excluded.bucket, key = excluded.key, author_email = excluded.author_email,
       author_name = excluded.author_name, body = excluded.body, selector = excluded.selector, created_at = excluded.created_at`,
  ).run(
    ulidOf(annotation),
    bucket,
    key,
    c.authorEmail,
    c.authorName,
    c.body,
    c.selector ? JSON.stringify(c.selector) : null,
    // W3C Annotation の created（保存されている文字列）をそのまま写す
    annotation.created,
  );
  return c;
}

export function listComments(db: Db, bucket: string, key: string): Comment[] {
  const rows = db
    .prepare(
      "SELECT * FROM comments WHERE bucket = ? AND key = ? ORDER BY ulid",
    )
    .all(bucket, key) as CommentRow[];
  return rows.map(toComment);
}

/** S3 の一覧で置き換える（詳細画面を開いたとき） */
export function replaceComments(
  db: Db,
  bucket: string,
  key: string,
  annotations: Annotation[],
): Comment[] {
  db.prepare("DELETE FROM comments WHERE bucket = ? AND key = ?").run(
    bucket,
    key,
  );
  return annotations.map((a) => upsertComment(db, bucket, key, a));
}

export function deleteCommentsNotIn(
  db: Db,
  bucket: string,
  ulids: Set<string>,
): void {
  const rows = db
    .prepare("SELECT ulid FROM comments WHERE bucket = ?")
    .all(bucket) as Array<{ ulid: string }>;
  const del = db.prepare("DELETE FROM comments WHERE ulid = ?");
  for (const { ulid } of rows) if (!ulids.has(ulid)) del.run(ulid);
}
