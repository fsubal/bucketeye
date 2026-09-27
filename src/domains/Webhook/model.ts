import { z } from "zod";
import { Annotation } from "@/domains/Annotation/model";
import { ReviewedObject, ReviewStatus } from "@/domains/ReviewedObject/model";

export const WEBHOOK_EVENTS = [
  "object.status_changed",
  "comment.created",
] as const;
export const WebhookEventType = z.enum(WEBHOOK_EVENTS);
export type WebhookEventType = z.infer<typeof WebhookEventType>;

/** S3 に置く登録（<REVIEW_PREFIX>webhooks/<id>.json）。secret を含むので REVIEW_BUCKET の権限に注意 */
export const Webhook = z.object({
  id: z.string(),
  url: z.url(),
  events: z.array(WebhookEventType).min(1),
  secret: z.string().min(16),
  active: z.boolean(),
  description: z.string().default(""),
  createdBy: z.string(),
  createdAt: z.string(),
});
export type Webhook = z.infer<typeof Webhook>;

/** API が返す形（secret は先頭だけ） */
export const WebhookPublic = Webhook.omit({ secret: true }).extend({
  secretHint: z.string(),
});
export type WebhookPublic = z.infer<typeof WebhookPublic>;

export function publicWebhook(w: Webhook): WebhookPublic {
  const { secret, ...rest } = w;
  return { ...rest, secretHint: `${secret.slice(0, 4)}…` };
}

export const WebhookInput = z.object({
  url: z.url(),
  events: z.array(WebhookEventType).min(1),
  description: z.string().max(500).optional(),
  active: z.boolean().optional(),
  /** 省略時はサーバが生成する */
  secret: z.string().min(16).max(200).optional(),
});
export type WebhookInput = z.infer<typeof WebhookInput>;

/** 配送されるペイロード */
export const WebhookEvent = z.discriminatedUnion("type", [
  z.object({
    id: z.string(),
    type: z.literal("object.status_changed"),
    createdAt: z.string(),
    url: z.string().nullable(),
    data: z.object({
      bucket: z.string(),
      key: z.string(),
      status: ReviewStatus,
      previousStatus: ReviewStatus,
      reviewer: z.string(),
      object: ReviewedObject,
    }),
  }),
  z.object({
    id: z.string(),
    type: z.literal("comment.created"),
    createdAt: z.string(),
    url: z.string().nullable(),
    data: z.object({
      bucket: z.string(),
      key: z.string(),
      comment: Annotation,
      object: ReviewedObject,
    }),
  }),
  z.object({
    id: z.string(),
    type: z.literal("ping"),
    createdAt: z.string(),
    url: z.string().nullable(),
    data: z.object({ webhookId: z.string(), message: z.string() }),
  }),
]);
export type WebhookEvent = z.infer<typeof WebhookEvent>;

export const SIGNATURE_HEADER = "X-Bucketeye-Signature";
export const EVENT_HEADER = "X-Bucketeye-Event";
export const DELIVERY_HEADER = "X-Bucketeye-Delivery";

/** 再送間隔（秒）。使い切ったら dead */
export const RETRY_SCHEDULE_SECONDS = [
  60, 300, 1800, 7200, 43200, 86400, 86400, 86400,
] as const;
export const MAX_ATTEMPTS = RETRY_SCHEDULE_SECONDS.length;

export const Delivery = z.object({
  id: z.string(),
  webhookId: z.string(),
  eventType: z.string(),
  attempts: z.number().int(),
  nextAttemptAt: z.string().nullable(),
  lastStatus: z.number().int().nullable(),
  lastError: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  deadAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Delivery = z.infer<typeof Delivery>;
