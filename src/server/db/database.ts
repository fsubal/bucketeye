import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * SQLite は「消えてよいキャッシュ + Webhook の配送キュー」。ORM は使わず、各リポジトリ（objects.ts 等）に
 * prepared statement を閉じ込めた関数を置く。node:sqlite が足りなくなったらここだけ better-sqlite3 に差し替える
 */
export type Db = DatabaseSync;

const MIGRATIONS: ReadonlyArray<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
      CREATE TABLE objects (
        bucket TEXT NOT NULL,
        key TEXT NOT NULL,
        etag TEXT,
        size INTEGER,
        content_type TEXT,
        last_modified TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        status_updated_at TEXT,
        reviewer TEXT,
        indexed_at TEXT NOT NULL,
        PRIMARY KEY (bucket, key)
      ) WITHOUT ROWID;
      CREATE INDEX objects_status ON objects (bucket, status);

      CREATE TABLE comments (
        ulid TEXT PRIMARY KEY,
        bucket TEXT NOT NULL,
        key TEXT NOT NULL,
        author_email TEXT NOT NULL,
        author_name TEXT,
        body TEXT NOT NULL,
        selector TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX comments_object ON comments (bucket, key, ulid);

      CREATE TABLE webhooks (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        events TEXT NOT NULL,
        secret TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        description TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        indexed_at TEXT NOT NULL
      );

      CREATE TABLE webhook_deliveries (
        id TEXT PRIMARY KEY,
        webhook_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT,
        last_status INTEGER,
        last_error TEXT,
        delivered_at TEXT,
        dead_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX webhook_deliveries_due ON webhook_deliveries (next_attempt_at) WHERE delivered_at IS NULL AND dead_at IS NULL;
      CREATE INDEX webhook_deliveries_webhook ON webhook_deliveries (webhook_id, created_at);

      CREATE TABLE index_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        objects INTEGER,
        comments INTEGER,
        webhooks INTEGER,
        removed INTEGER,
        error TEXT
      );
    `,
  },
];

export function openDatabase(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  migrate(db);
  return db;
}

export function migrate(db: Db): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const applied = new Set(
    (
      db.prepare("SELECT version FROM schema_migrations").all() as Array<{
        version: number;
      }>
    ).map((r) => r.version),
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    db.exec("BEGIN");
    try {
      db.exec(m.sql);
      db.prepare(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
      ).run(m.version, new Date().toISOString());
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
}

/** 同期トランザクション。node:sqlite は同期 API なので素朴に BEGIN/COMMIT でよい */
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** LIKE のワイルドカードをエスケープ（ESCAPE '\' と組で使う） */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
