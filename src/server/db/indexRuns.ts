import type { Db } from "./database";
import { nowIso } from "./database";

export type IndexRun = {
  id: number;
  started_at: string;
  finished_at: string | null;
  objects: number | null;
  comments: number | null;
  webhooks: number | null;
  removed: number | null;
  error: string | null;
};

export function startIndexRun(db: Db): number {
  const r = db
    .prepare("INSERT INTO index_runs (started_at) VALUES (?)")
    .run(nowIso());
  return Number(r.lastInsertRowid);
}

export function finishIndexRun(
  db: Db,
  id: number,
  result:
    | { objects: number; comments: number; webhooks: number; removed: number }
    | { error: string },
): void {
  if ("error" in result) {
    db.prepare(
      "UPDATE index_runs SET finished_at = ?, error = ? WHERE id = ?",
    ).run(nowIso(), result.error, id);
  } else {
    db.prepare(
      "UPDATE index_runs SET finished_at = ?, objects = ?, comments = ?, webhooks = ?, removed = ? WHERE id = ?",
    ).run(
      nowIso(),
      result.objects,
      result.comments,
      result.webhooks,
      result.removed,
      id,
    );
  }
  // 履歴は直近 50 件だけ残す
  db.prepare(
    "DELETE FROM index_runs WHERE id NOT IN (SELECT id FROM index_runs ORDER BY id DESC LIMIT 50)",
  ).run();
}

export function lastIndexRun(db: Db): IndexRun | null {
  return (
    (db.prepare("SELECT * FROM index_runs ORDER BY id DESC LIMIT 1").get() as
      | IndexRun
      | undefined) ?? null
  );
}

export function listIndexRuns(db: Db, limit = 20): IndexRun[] {
  return db
    .prepare("SELECT * FROM index_runs ORDER BY id DESC LIMIT ?")
    .all(limit) as IndexRun[];
}
