import { Webhook } from "@/domains/Webhook/model";
import type { S3Port } from "./port";
import { webhookKey, webhooksPrefix } from "./keys";

/** Webhook 登録の真実は S3（<REVIEW_PREFIX>webhooks/<id>.json）。SQLite の webhooks テーブルは写し */
export class WebhookStore {
  constructor(
    private readonly s3: S3Port,
    private readonly reviewPrefix: string,
  ) {}

  async save(webhook: Webhook): Promise<void> {
    await this.s3.putJson(webhookKey(this.reviewPrefix, webhook.id), webhook);
  }

  async remove(id: string): Promise<void> {
    await this.s3.deleteObject(webhookKey(this.reviewPrefix, id));
  }

  async *each(): AsyncIterable<Webhook> {
    for await (const entry of this.s3.eachObject({
      prefix: webhooksPrefix(this.reviewPrefix),
      bucket: this.s3.reviewBucket,
    })) {
      if (!entry.key.endsWith(".json")) continue;
      const parsed = Webhook.safeParse(await this.s3.getJson(entry.key));
      if (parsed.success) yield parsed.data;
    }
  }
}
