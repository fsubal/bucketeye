import { generateUlid } from "@/domains/Annotation/model";
import { now } from "@/utils/datetime";
import type { WebhookEvent, WebhookEventType } from "@/domains/Webhook/model";
import type { Db } from "../db/database";
import { enqueueDelivery } from "../db/deliveries";
import { listActiveWebhooksFor } from "../db/webhooks";

type EventInput = {
  type: WebhookEventType;
  key: string | null;
  data: Extract<WebhookEvent, { type: WebhookEventType }>["data"];
};

/** イベントに合致する active な登録ごとに outbox（webhook_deliveries）へ 1 行入れる。配送は worker が行う */
export class Dispatcher {
  constructor(
    private readonly db: Db,
    private readonly publicUrl: string | null,
  ) {}

  emit(input: EventInput): WebhookEvent {
    const event = {
      id: generateUlid(),
      type: input.type,
      createdAt: now(),
      url:
        this.publicUrl && input.key
          ? `${this.publicUrl}/objects/${encodeURI(input.key)}`
          : null,
      data: input.data,
    } as WebhookEvent;
    const targets = listActiveWebhooksFor(this.db, input.type);
    this.db.transaction(() => {
      for (const w of targets)
        enqueueDelivery(this.db, generateUlid(), w.id, event);
    });
    return event;
  }

  /** 登録のテスト配送（イベント種別のフィルタを無視して 1 件だけ入れる） */
  ping(webhookId: string): WebhookEvent {
    const event: WebhookEvent = {
      id: generateUlid(),
      type: "ping",
      createdAt: now(),
      url: this.publicUrl,
      data: {
        webhookId,
        message: "bucketeye webhook test delivery",
      },
    };
    enqueueDelivery(this.db, generateUlid(), webhookId, event);
    return event;
  }
}
