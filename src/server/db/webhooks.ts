import type { Db } from "./database";
import { Webhook, type WebhookEventType } from "@/domains/Webhook/model";

type WebhookRow = {
  id: string;
  url: string;
  events: string;
  secret: string;
  active: number;
  description: string;
  created_by: string;
  created_at: string;
  indexed_at: string;
};

function toWebhook(row: WebhookRow): Webhook {
  return Webhook.parse({
    id: row.id,
    url: row.url,
    events: JSON.parse(row.events),
    secret: row.secret,
    active: row.active === 1,
    description: row.description,
    createdBy: row.created_by,
    createdAt: row.created_at,
  });
}

export function upsertWebhook(db: Db, w: Webhook, indexedAt: string): void {
  db.prepare(
    `INSERT INTO webhooks (id, url, events, secret, active, description, created_by, created_at, indexed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET url = excluded.url, events = excluded.events, secret = excluded.secret, active = excluded.active,
       description = excluded.description, created_by = excluded.created_by, created_at = excluded.created_at, indexed_at = excluded.indexed_at`,
  ).run(
    w.id,
    w.url,
    JSON.stringify(w.events),
    w.secret,
    w.active ? 1 : 0,
    w.description,
    w.createdBy,
    w.createdAt,
    indexedAt,
  );
}

export function deleteWebhook(db: Db, id: string): void {
  db.prepare("DELETE FROM webhooks WHERE id = ?").run(id);
}

export function deleteWebhooksIndexedBefore(db: Db, startedAt: string): number {
  return Number(
    db.prepare("DELETE FROM webhooks WHERE indexed_at < ?").run(startedAt)
      .changes,
  );
}

export function findWebhook(db: Db, id: string): Webhook | null {
  const row = db.prepare("SELECT * FROM webhooks WHERE id = ?").get(id) as
    WebhookRow | undefined;
  return row ? toWebhook(row) : null;
}

export function listWebhooks(db: Db): Webhook[] {
  return (
    db
      .prepare("SELECT * FROM webhooks ORDER BY created_at")
      .all() as WebhookRow[]
  ).map(toWebhook);
}

export function listActiveWebhooksFor(
  db: Db,
  event: WebhookEventType,
): Webhook[] {
  return listWebhooks(db).filter((w) => w.active && w.events.includes(event));
}
