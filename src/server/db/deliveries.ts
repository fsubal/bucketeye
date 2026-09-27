import type { Db } from './database'
import { MAX_ATTEMPTS, RETRY_SCHEDULE_SECONDS, type Delivery, type WebhookEvent } from '@/domains/Webhook/model'

/** webhook_deliveries の行（列名は snake_case のまま）。API に出すときは toDelivery で camelCase にする */
export type DeliveryRow = {
  id: string
  webhook_id: string
  event_type: string
  payload: string
  attempts: number
  next_attempt_at: string | null
  last_status: number | null
  last_error: string | null
  delivered_at: string | null
  dead_at: string | null
  created_at: string
}

export function toDelivery(row: DeliveryRow): Delivery {
  return {
    id: row.id,
    webhookId: row.webhook_id,
    eventType: row.event_type,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    lastStatus: row.last_status,
    lastError: row.last_error,
    deliveredAt: row.delivered_at,
    deadAt: row.dead_at,
    createdAt: row.created_at,
  }
}

export function enqueueDelivery(db: Db, id: string, webhookId: string, event: WebhookEvent): void {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO webhook_deliveries (id, webhook_id, event_type, payload, attempts, next_attempt_at, created_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`,
  ).run(id, webhookId, event.type, JSON.stringify(event), now, now)
}

// 時刻はすべて ms 精度の ISO8601（文字列比較で順序が正しくなるよう形式を揃える）
export function dueDeliveries(db: Db, limit: number, now: string = new Date().toISOString()): DeliveryRow[] {
  return db
    .prepare(
      `SELECT * FROM webhook_deliveries
       WHERE delivered_at IS NULL AND dead_at IS NULL AND next_attempt_at <= ?
       ORDER BY next_attempt_at LIMIT ?`,
    )
    .all(now, limit) as DeliveryRow[]
}

export function markDelivered(db: Db, id: string, status: number): void {
  db.prepare(
    'UPDATE webhook_deliveries SET attempts = attempts + 1, last_status = ?, last_error = NULL, delivered_at = ?, next_attempt_at = NULL WHERE id = ?',
  ).run(status, new Date().toISOString(), id)
}

/** 失敗: 次回時刻をバックオフ表から決める。回数を使い切ったら dead */
export function markFailed(db: Db, row: DeliveryRow, status: number | null, error: string | null, now: Date = new Date()): void {
  const attempts = row.attempts + 1
  if (attempts >= MAX_ATTEMPTS) {
    db.prepare(
      'UPDATE webhook_deliveries SET attempts = ?, last_status = ?, last_error = ?, dead_at = ?, next_attempt_at = NULL WHERE id = ?',
    ).run(attempts, status, error, now.toISOString(), row.id)
    return
  }
  const delay = RETRY_SCHEDULE_SECONDS[attempts - 1] ?? RETRY_SCHEDULE_SECONDS[RETRY_SCHEDULE_SECONDS.length - 1]!
  const next = new Date(now.getTime() + delay * 1000).toISOString()
  db.prepare('UPDATE webhook_deliveries SET attempts = ?, last_status = ?, last_error = ?, next_attempt_at = ? WHERE id = ?').run(
    attempts,
    status,
    error,
    next,
    row.id,
  )
}

export function listDeliveries(db: Db, webhookId: string, limit = 50): Delivery[] {
  const rows = db
    .prepare('SELECT * FROM webhook_deliveries WHERE webhook_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(webhookId, limit) as DeliveryRow[]
  return rows.map(toDelivery)
}
