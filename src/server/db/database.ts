import { DatabaseSync } from "node:sqlite";
import { now, nowMillis, toIsoMillis, toIsoSeconds } from "@/utils/datetime";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import schema20260927 from "./schema/20260927.sql";

const MIGRATIONS: ReadonlyArray<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: schema20260927,
  },
];

/**
 * SQLite は「消えてよいキャッシュ + Webhook の配送キュー」。ORM は使わず、各リポジトリ（objects.ts 等）に
 * prepared statement を閉じ込めた関数を置く。node:sqlite が足りなくなったらここだけ better-sqlite3 に差し替える
 */
export class Db {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.exec("PRAGMA journal_mode = WAL");
    this.exec("PRAGMA synchronous = NORMAL");
    this.exec("PRAGMA foreign_keys = ON");
    this.exec("PRAGMA busy_timeout = 5000");
  }

  static get inMemory(): Db {
    const db = new this(":memory:");
    db.#migrate();
    return db;
  }

  static open(path: string): Db {
    if (path === ":memory:") {
      return this.inMemory;
    }

    mkdirSync(dirname(path), { recursive: true });
    const db = new this(path);
    db.#migrate();
    return db;
  }

  prepare(sql: string) {
    return this.db.prepare(sql);
  }

  exec(sql: string) {
    return this.db.exec(sql);
  }

  close() {
    this.db.close();
  }

  /** 同期トランザクション。node:sqlite は同期 API なので素朴に BEGIN/COMMIT でよい */
  transaction<T>(fn: () => T): T {
    this.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.exec("COMMIT");
      return result;
    } catch (e) {
      this.exec("ROLLBACK");
      throw e;
    }
  }

  #migrate() {
    this.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
    );

    const applied = new Set(
      (
        this.prepare("SELECT version FROM schema_migrations").all() as Array<{
          version: number;
        }>
      ).map(({ version }) => version),
    );

    for (const { version, sql } of MIGRATIONS) {
      if (applied.has(version)) {
        continue;
      }

      this.exec("BEGIN");
      try {
        this.exec(sql);
        this.prepare(
          "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
        ).run(version, toIsoMillis(nowMillis()));
        this.exec("COMMIT");
      } catch (e) {
        this.exec("ROLLBACK");
        throw e;
      }
    }
  }
}

/** 今の時刻を保存用の文字列（秒精度 `…Z`）で。indexed_at など「今回の索引より古い行」の比較に使う */
export function nowIso(): string {
  return toIsoSeconds(now());
}

/** LIKE のワイルドカードをエスケープ（ESCAPE '\' と組で使う） */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
