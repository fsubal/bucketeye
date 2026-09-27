import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import schema20260927 from "./schema/20260927.sql";

/**
 * SQLite は「消えてよいキャッシュ + Webhook の配送キュー」。ORM は使わず、各リポジトリ（objects.ts 等）に
 * prepared statement を閉じ込めた関数を置く。node:sqlite が足りなくなったらここだけ better-sqlite3 に差し替える
 */
export type Db = DatabaseSync;

const MIGRATIONS: ReadonlyArray<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: schema20260927,
  },
];

export function openDatabase(path: string): Db {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

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
    ).map(({ version }) => version),
  );

  for (const { version, sql } of MIGRATIONS) {
    if (applied.has(version)) {
      continue;
    }

    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
      ).run(version, new Date().toISOString());
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
