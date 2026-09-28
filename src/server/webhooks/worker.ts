import { nowMillis, type Temporal } from "@/utils/datetime";
import {
  DELIVERY_HEADER,
  EVENT_HEADER,
  SIGNATURE_HEADER,
} from "@/domains/Webhook/model";
import type { Db } from "../db/database";
import {
  dueDeliveries,
  markDelivered,
  markFailed,
  type DeliveryRow,
} from "../db/deliveries";
import { findWebhook } from "../db/webhooks";
import { sign } from "./signature";

/**
 * outbox を定期的に見て配送する。2xx で delivered、失敗はバックオフ表に従って再送、回数を使い切ったら dead。
 * SQLite が消えると未配送分は失われる（README に明記。所感どおり許容）
 */
export class WebhookWorker {
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    private readonly db: Db,
    private readonly opts: {
      intervalSeconds: number;
      concurrency?: number;
      timeoutMs?: number;
      fetchImpl?: typeof fetch;
      log?: (msg: string) => void;
    },
  ) {}

  start(): void {
    this.timer = setInterval(
      () => void this.tick(),
      this.opts.intervalSeconds * 1000,
    );
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** 期限の来た配送をまとめて処理する。テストからも直接呼ぶ */
  async tick(now: Temporal.Instant = nowMillis()): Promise<number> {
    if (this.ticking) return 0;
    this.ticking = true;
    try {
      const rows = dueDeliveries(this.db, this.opts.concurrency ?? 4, now);
      await Promise.all(rows.map((row) => this.deliver(row, now)));
      return rows.length;
    } finally {
      this.ticking = false;
    }
  }

  private async deliver(
    row: DeliveryRow,
    now: Temporal.Instant,
  ): Promise<void> {
    const webhook = findWebhook(this.db, row.webhook_id);
    if (!webhook) {
      markFailed(
        this.db,
        { ...row, attempts: 99 },
        null,
        "webhook registration no longer exists",
        now,
      );
      return;
    }
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    try {
      const res = await fetchImpl(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "bucketeye-webhook/1",
          [EVENT_HEADER]: row.event_type,
          [DELIVERY_HEADER]: row.id,
          [SIGNATURE_HEADER]: sign(webhook.secret, row.payload),
        },
        body: row.payload,
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 10_000),
        redirect: "manual",
      });
      if (res.ok) {
        markDelivered(this.db, row.id, res.status);
      } else {
        markFailed(this.db, row, res.status, `HTTP ${res.status}`, now);
        this.opts.log?.(
          `[webhook] ${webhook.url} responded ${res.status} (delivery ${row.id}, attempt ${row.attempts + 1})`,
        );
      }
    } catch (e) {
      const message =
        e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      markFailed(this.db, row, null, message, now);
      this.opts.log?.(
        `[webhook] ${webhook.url} failed: ${message} (delivery ${row.id}, attempt ${row.attempts + 1})`,
      );
    }
  }
}
