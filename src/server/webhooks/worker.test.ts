import { describe, expect, test } from "vitest";
import { MAX_ATTEMPTS } from "@/domains/Webhook/model";
import { createTestDeps, json, signIn } from "../../../test/helpers";
import { WebhookWorker } from "./worker";
import { verify } from "./signature";
import { Temporal } from "@/utils/datetime";

async function registerWebhook(
  t: ReturnType<typeof createTestDeps>,
  url = "https://hook.example/receive",
) {
  const admin = await signIn(t.app, "admin@example.com");
  const res = await t.app.request("/api/v1/webhooks", {
    method: "POST",
    ...json({ url, events: ["object.status_changed"] }, admin),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as any).webhook as { id: string; secret: string };
}

describe("WebhookWorker", () => {
  test("承認で outbox に積まれ、HMAC 署名付きで POST される", async () => {
    const t = createTestDeps();
    t.s3.put("submissions/a.png", "PNG", { contentType: "image/png" });
    const webhook = await registerWebhook(t);
    // 登録は S3 にも書かれている
    expect(
      t.s3
        .keysIn("test-bucket")
        .some((k) => k === `.review/webhooks/${webhook.id}.json`),
    ).toBe(true);

    await t.app.request("/api/v1/statuses/submissions/a.png", {
      method: "PUT",
      ...json({ status: "approved" }, await signIn(t.app)),
    });

    const received: Array<{ url: string; headers: Headers; body: string }> = [];
    const worker = new WebhookWorker(t.db, {
      intervalSeconds: 60,
      fetchImpl: async (input, init) => {
        received.push({
          url: String(input),
          headers: new Headers(init?.headers),
          body: String(init?.body),
        });
        return new Response("ok", { status: 200 });
      },
    });
    expect(await worker.tick()).toBe(1);
    expect(received).toHaveLength(1);
    const r = received[0]!;
    expect(r.url).toBe("https://hook.example/receive");
    expect(r.headers.get("X-Bucketeye-Event")).toBe("object.status_changed");
    expect(
      verify(webhook.secret, r.body, r.headers.get("X-Bucketeye-Signature")),
    ).toBe(true);
    expect(
      verify("wrong-secret", r.body, r.headers.get("X-Bucketeye-Signature")),
    ).toBe(false);
    const payload = JSON.parse(r.body);
    expect(payload).toMatchObject({
      type: "object.status_changed",
      url: "https://review.example.com/objects/submissions/a.png",
      data: {
        key: "submissions/a.png",
        status: "approved",
        previousStatus: "pending",
        reviewer: "reviewer@example.com",
      },
    });

    const deliveries = (await (
      await t.app.request(`/api/v1/webhooks/${webhook.id}/deliveries`, {
        headers: await signIn(t.app, "admin@example.com"),
      })
    ).json()) as any;
    expect(deliveries.deliveries[0]).toMatchObject({
      attempts: 1,
      lastStatus: 200,
      deadAt: null,
    });
    expect(deliveries.deliveries[0].deliveredAt).not.toBeNull();
    // 2 回目の tick では何も配送しない
    expect(await worker.tick()).toBe(0);
  });

  test("失敗はバックオフして再送し、回数を使い切ると dead", async () => {
    const t = createTestDeps();
    const webhook = await registerWebhook(t);
    t.dispatcher.ping(webhook.id);
    let status = 500;
    const worker = new WebhookWorker(t.db, {
      intervalSeconds: 60,
      fetchImpl: async () => new Response("nope", { status }),
    });

    let now = Temporal.Now.instant().add({ seconds: 1 });
    expect(await worker.tick(now)).toBe(1);
    let row = t.db
      .prepare(
        "SELECT attempts, next_attempt_at, last_status FROM webhook_deliveries",
      )
      .get() as {
      attempts: number;
      next_attempt_at: string;
      last_status: number;
    };
    expect(row).toMatchObject({ attempts: 1, last_status: 500 });
    expect(Temporal.Instant.from(row.next_attempt_at).epochMilliseconds).toBe(
      now.epochMilliseconds + 60_000,
    );

    // まだ期限前なら配送しない
    expect(await worker.tick(now.add({ seconds: 30 }))).toBe(0);

    // 期限を進めながら失敗を重ねると dead になる
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      row = t.db
        .prepare(
          "SELECT attempts, next_attempt_at, last_status FROM webhook_deliveries",
        )
        .get() as typeof row;
      now = Temporal.Instant.from(row.next_attempt_at);
      expect(await worker.tick(now)).toBe(1);
    }
    const final = t.db
      .prepare("SELECT attempts, dead_at, delivered_at FROM webhook_deliveries")
      .get() as {
      attempts: number;
      dead_at: string | null;
      delivered_at: string | null;
    };
    expect(final.attempts).toBe(MAX_ATTEMPTS);
    expect(final.dead_at).not.toBeNull();
    expect(final.delivered_at).toBeNull();
    expect(
      await worker.tick(Temporal.Instant.from("2030-01-01T00:00:00Z")),
    ).toBe(0);

    // 途中で成功すれば delivered（別の配送で確認）
    status = 200;
    t.dispatcher.ping(webhook.id);
    expect(
      await worker.tick(Temporal.Instant.from("2030-01-01T00:00:00Z")),
    ).toBe(1);
    expect(
      t.db
        .prepare(
          "SELECT count(*) c FROM webhook_deliveries WHERE delivered_at IS NOT NULL",
        )
        .get(),
    ).toEqual({ c: 1 });
  });

  test("登録は S3 に残り、再索引で SQLite に戻る。削除すると両方から消える", async () => {
    const t = createTestDeps();
    const webhook = await registerWebhook(t);
    t.db.prepare("DELETE FROM webhooks").run();
    const { runIndex } = await import("../indexer/indexer");
    expect((await runIndex(t)).webhooks).toBe(1);
    const admin = await signIn(t.app, "admin@example.com");
    const list = (await (
      await t.app.request("/api/v1/webhooks", { headers: admin })
    ).json()) as any;
    expect(list.webhooks).toHaveLength(1);
    expect(list.webhooks[0].secret).toBeUndefined();
    expect(list.webhooks[0].secretHint).toMatch(/…$/);

    expect(
      (
        await t.app.request(`/api/v1/webhooks/${webhook.id}`, {
          method: "DELETE",
          headers: admin,
        })
      ).status,
    ).toBe(204);
    expect(
      t.s3.keysIn("test-bucket").some((k) => k.startsWith(".review/webhooks/")),
    ).toBe(false);
    expect((await runIndex(t)).webhooks).toBe(0);
  });
});
