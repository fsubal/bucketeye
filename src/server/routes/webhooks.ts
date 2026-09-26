import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { generateUlid, toIso } from "@/domains/Annotation/model";
import {
  publicWebhook,
  WebhookInput,
  type Webhook,
} from "@/domains/Webhook/model";
import type { AppEnv } from "../app";
import { requireAdmin } from "../auth/middleware";
import { nowIso } from "../db/database";
import { listDeliveries } from "../db/deliveries";
import {
  deleteWebhook,
  findWebhook,
  listWebhooks,
  upsertWebhook,
} from "../db/webhooks";
import { HttpProblem } from "./problem";

/** Webhook の登録は admin だけ。真実は S3（webhookStore）、SQLite は写し */
export function webhooksRoutes() {
  const r = new Hono<AppEnv>();
  r.use("*", requireAdmin);

  r.get("/", (c) =>
    c.json({ webhooks: listWebhooks(c.get("deps").db).map(publicWebhook) }),
  );

  r.post("/", async (c) => {
    const deps = c.get("deps");
    const input = WebhookInput.safeParse(await c.req.json().catch(() => ({})));
    if (!input.success)
      throw new HttpProblem(
        422,
        "invalid_webhook",
        input.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      );
    const secret = input.data.secret ?? randomBytes(24).toString("base64url");
    const webhook: Webhook = {
      id: generateUlid(),
      url: input.data.url,
      events: input.data.events,
      secret,
      active: input.data.active ?? true,
      description: input.data.description ?? "",
      created_by: c.get("identity").email,
      created_at: toIso(new Date()),
    };
    await deps.webhookStore.save(webhook);
    upsertWebhook(deps.db, webhook, nowIso());
    // secret は作成時のレスポンスにだけ丸ごと入れる（以後は hint のみ）
    return c.json({ webhook: { ...publicWebhook(webhook), secret } }, 201);
  });

  r.patch("/:id", async (c) => {
    const deps = c.get("deps");
    const existing = findWebhook(deps.db, c.req.param("id"));
    if (!existing) throw new HttpProblem(404, "not_found");
    const input = WebhookInput.partial().safeParse(
      await c.req.json().catch(() => ({})),
    );
    if (!input.success)
      throw new HttpProblem(
        422,
        "invalid_webhook",
        input.error.issues.map((i) => i.message).join("; "),
      );
    const webhook: Webhook = {
      ...existing,
      ...input.data,
      description: input.data.description ?? existing.description,
    };
    await deps.webhookStore.save(webhook);
    upsertWebhook(deps.db, webhook, nowIso());
    return c.json({ webhook: publicWebhook(webhook) });
  });

  r.delete("/:id", async (c) => {
    const deps = c.get("deps");
    const id = c.req.param("id");
    if (!findWebhook(deps.db, id)) throw new HttpProblem(404, "not_found");
    await deps.webhookStore.remove(id);
    deleteWebhook(deps.db, id);
    return c.body(null, 204);
  });

  r.get("/:id/deliveries", (c) => {
    const deps = c.get("deps");
    const id = c.req.param("id");
    if (!findWebhook(deps.db, id)) throw new HttpProblem(404, "not_found");
    return c.json({ deliveries: listDeliveries(deps.db, id) });
  });

  r.post("/:id/ping", (c) => {
    const deps = c.get("deps");
    const id = c.req.param("id");
    if (!findWebhook(deps.db, id)) throw new HttpProblem(404, "not_found");
    return c.json({ event: deps.dispatcher.ping(id) }, 202);
  });

  return r;
}
