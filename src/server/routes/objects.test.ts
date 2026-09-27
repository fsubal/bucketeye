import { beforeEach, describe, expect, test } from "vitest";
import { runIndex } from "../indexer/indexer";
import {
  createTestDeps,
  json,
  signIn,
  type TestDeps,
} from "../../../test/helpers";

let t: TestDeps;
let auth: Record<string, string>;

beforeEach(async () => {
  t = createTestDeps();
  t.s3.put("submissions/2026/cover.png", "PNG", { contentType: "image/png" });
  t.s3.put("submissions/2026/body.pdf", "PDF", {
    contentType: "application/pdf",
  });
  t.s3.put("submissions/notes.txt", "some notes", {
    contentType: "text/plain",
  });
  t.s3.put("other/secret.txt", "x", { contentType: "text/plain" });
  t.s3.put(
    ".review/objects/zzz/comments/01ARZ3NDEKTSV4RRFFQ69G5FAV.json",
    "{}",
    { contentType: "application/json" },
  );
  await runIndex(t);
  auth = await signIn(t.app);
});

describe("認証", () => {
  test("未ログインは 401 problem+json で loginPath を返す", async () => {
    const res = await t.app.request("/api/v1/objects");
    expect(res.status).toBe(401);
    expect(res.headers.get("Content-Type")).toBe("application/problem+json");
    expect((await res.json()) as any).toMatchObject({
      type: "https://github.com/fsubal/bucketeye/blob/main/docs/problems.md#authentication-required",
      title: "Authentication required",
      status: 401,
      loginPath: "/dev/login",
    });
  });

  test("Bearer トークンでも通る。違うトークンは 401", async () => {
    expect(
      (
        await t.app.request("/api/v1/objects", {
          headers: { Authorization: "Bearer test-api-token" },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await t.app.request("/api/v1/objects", {
          headers: { Authorization: "Bearer nope" },
        })
      ).status,
    ).toBe(401);
  });

  test("/me はプロバイダ情報を返す", async () => {
    const res = await t.app.request("/api/v1/me", { headers: auth });
    expect((await res.json()) as any).toMatchObject({
      identity: { email: "reviewer@example.com", role: "reviewer" },
      provider: { provider: "developer" },
    });
  });
});

describe("一覧", () => {
  test("フォルダとファイルを分けて出し、ステータスで絞ると平らになる", async () => {
    let body = (await (
      await t.app.request("/api/v1/objects", { headers: auth })
    ).json()) as any;
    expect(body.folders).toEqual(["2026/"]);
    expect(body.objects.map((o: { key: string }) => o.key)).toEqual([
      "submissions/notes.txt",
    ]);
    expect(body.counts).toEqual({ pending: 3 });
    expect(body.indexed).toBe(true);

    body = (await (
      await t.app.request("/api/v1/objects?prefix=2026/", { headers: auth })
    ).json()) as any;
    expect(body.objects.map((o: { key: string }) => o.key)).toEqual([
      "submissions/2026/body.pdf",
      "submissions/2026/cover.png",
    ]);

    await t.statusStore.write(
      "submissions/2026/cover.png",
      "approved",
      "x@example.com",
    );
    await runIndex(t);
    body = (await (
      await t.app.request("/api/v1/objects?status=approved", { headers: auth })
    ).json()) as any;
    expect(body.objects.map((o: { key: string }) => o.key)).toEqual([
      "submissions/2026/cover.png",
    ]);
    expect(body.folders).toEqual([]);
    expect(body.counts.approved).toBe(1);
    expect(body.pagination).toEqual({ page: 1, per: 100, total: 1 });
  });

  test("不正なクエリは 400", async () => {
    expect(
      (await t.app.request("/api/v1/objects?status=bogus", { headers: auth }))
        .status,
    ).toBe(400);
  });
});

describe("詳細", () => {
  test("presigned URL とコメントを返し、対象外のキーは 404", async () => {
    const res = await t.app.request(
      "/api/v1/objects/submissions/2026/cover.png",
      { headers: auth },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.object).toMatchObject({
      key: "submissions/2026/cover.png",
      kind: "image",
      status: "pending",
    });
    expect(body.preview.url).toMatch(
      /fake\.example\/test-bucket\/submissions\/2026\/cover\.png/,
    );
    expect(body.comments).toEqual([]);

    const text = await t.app.request("/api/v1/texts/submissions/notes.txt", {
      headers: auth,
    });
    expect(await text.text()).toBe("some notes");

    for (const k of [
      "other/secret.txt",
      ".review/objects/zzz/comments/01ARZ3NDEKTSV4RRFFQ69G5FAV.json",
      "submissions/missing.png",
    ]) {
      expect(
        (await t.app.request(`/api/v1/objects/${k}`, { headers: auth })).status,
        k,
      ).toBe(404);
    }
  });
});

describe("コメント", () => {
  test("S3 に W3C Annotation を書いてから SQLite に写し、イベントを積む", async () => {
    await t.app.request("/api/v1/webhooks", {
      method: "POST",
      ...json(
        { url: "https://hook.example/x", events: ["comment.created"] },
        await signIn(t.app, "admin@example.com"),
      ),
    });
    const res = await t.app.request(
      "/api/v1/comments/submissions/2026/cover.png",
      { method: "POST", ...json({ body: "  needs a bleed margin  " }, auth) },
    );
    expect(res.status).toBe(201);
    expect(((await res.json()) as any).comment).toMatchObject({
      authorEmail: "reviewer@example.com",
      body: "needs a bleed margin",
      selector: null,
    });

    const annotations = await t.commentStore.list("submissions/2026/cover.png");
    expect(annotations.map((a) => a.body.value)).toEqual([
      "needs a bleed margin",
    ]);
    expect(
      t.s3.keysIn("test-bucket").filter((k) => k.includes("/comments/")),
    ).toHaveLength(2);

    const show = (await (
      await t.app.request("/api/v1/objects/submissions/2026/cover.png", {
        headers: auth,
      })
    ).json()) as any;
    expect(show.comments.map((c: { body: string }) => c.body)).toEqual([
      "needs a bleed margin",
    ]);

    const due = t.db.prepare("SELECT event_type FROM webhook_deliveries").all();
    expect(due).toEqual([{ event_type: "comment.created" }]);
  });

  test("空のコメントは 422", async () => {
    const res = await t.app.request(
      "/api/v1/comments/submissions/2026/cover.png",
      { method: "POST", ...json({ body: "   " }, auth) },
    );
    expect(res.status).toBe(422);
    expect((await res.json()) as any).toMatchObject({
      type: "https://github.com/fsubal/bucketeye/blob/main/docs/problems.md#validation-failed",
      title: "Request body failed validation",
      status: 422,
      detail: "コメントを入力してください",
      errors: [{ detail: "コメントを入力してください", pointer: "#/body" }],
    });
  });
});

describe("ステータス", () => {
  test("S3 のタグに書き戻し、変化したときだけイベントを積む", async () => {
    await signIn(t.app, "alice@example.com").then(async (h) => {
      const res = await t.app.request(
        "/api/v1/statuses/submissions/2026/body.pdf",
        { method: "PUT", ...json({ status: "changes_requested" }, h) },
      );
      expect(res.status).toBe(200);
      expect(((await res.json()) as any).object).toMatchObject({
        status: "changes_requested",
        reviewer: "alice@example.com",
      });
    });
    expect(await t.s3.getTags("submissions/2026/body.pdf")).toMatchObject({
      "review-status": "changes_requested",
      "review-reviewer": "alice@example.com",
    });
    expect(
      t.db
        .prepare(
          "SELECT status FROM objects WHERE key = 'submissions/2026/body.pdf'",
        )
        .get(),
    ).toEqual({ status: "changes_requested" });

    const bad = await t.app.request(
      "/api/v1/statuses/submissions/2026/body.pdf",
      { method: "PUT", ...json({ status: "bogus" }, auth) },
    );
    expect(bad.status).toBe(422);
  });

  test("sidecar 戦略ではタグを触らず status.json に書く", async () => {
    const s = createTestDeps({ STATUS_STRATEGY: "sidecar" });
    s.s3.put("submissions/a.png", "PNG", { contentType: "image/png" });
    const h = await signIn(s.app);
    await s.app.request("/api/v1/statuses/submissions/a.png", {
      method: "PUT",
      ...json({ status: "rejected" }, h),
    });
    expect(await s.s3.getTags("submissions/a.png")).toEqual({});
    const sidecar = s.s3
      .keysIn("test-bucket")
      .find((k) => k.endsWith("/status.json"))!;
    const written = (await s.s3.getJson(sidecar)) as Record<string, unknown>;
    expect(Object.keys(written).sort()).toEqual([
      "reviewer",
      "source",
      "status",
      "updatedAt",
    ]);
    expect(written).toMatchObject({
      status: "rejected",
      source: "s3://test-bucket/submissions/a.png",
      reviewer: "reviewer@example.com",
    });
    expect(written["updatedAt"]).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
    );
    expect(await s.statusStore.read("submissions/a.png")).toMatchObject({
      status: "rejected",
      reviewer: "reviewer@example.com",
      updatedAt: written["updatedAt"],
    });

    // 壊れた値は索引を止めずに pending / null として読む
    await s.s3.putJson(sidecar, { status: "bogus", updatedAt: 123 });
    expect(await s.statusStore.read("submissions/a.png")).toEqual({
      status: "pending",
      updatedAt: null,
      reviewer: null,
    });
  });
});

describe("admin", () => {
  test("再索引と Webhook 管理は admin だけ", async () => {
    expect(
      (
        await t.app.request("/api/v1/admin/reindex", {
          method: "POST",
          headers: auth,
        })
      ).status,
    ).toBe(403);
    expect(
      (await t.app.request("/api/v1/webhooks", { headers: auth })).status,
    ).toBe(403);
    const admin = await signIn(t.app, "admin@example.com");
    const res = await t.app.request("/api/v1/admin/reindex", {
      method: "POST",
      headers: admin,
    });
    expect(res.status).toBe(202);
    await t.poller.runNow();
    const runs = (await (
      await t.app.request("/api/v1/admin/index-runs", { headers: admin })
    ).json()) as any;
    expect(runs.runs[0]).toMatchObject({ objects: 3, error: null });
  });
});

describe("JSON API のキーは camelCase", () => {
  /** オブジェクトのキーを再帰的に集める。W3C Web Annotation の "@context" は JSON-LD の予約語なので対象外 */
  function snakeKeys(value: unknown, path = "$"): string[] {
    if (Array.isArray(value))
      return value.flatMap((v, i) => snakeKeys(v, `${path}[${i}]`));
    if (value === null || typeof value !== "object") return [];
    return Object.entries(value).flatMap(([k, v]) => [
      ...(k.includes("_") ? [`${path}.${k}`] : []),
      ...snakeKeys(v, `${path}.${k}`),
    ]);
  }

  test("主要なエンドポイントのレスポンスに snake_case のキーが無い", async () => {
    const admin = await signIn(t.app, "admin@example.com");
    const hook = (await (
      await t.app.request("/api/v1/webhooks", {
        method: "POST",
        ...json(
          {
            url: "https://hook.example/x",
            events: ["comment.created", "object.status_changed"],
          },
          admin,
        ),
      })
    ).json()) as any;
    await t.app.request("/api/v1/comments/submissions/2026/cover.png", {
      method: "POST",
      ...json({ body: "hi" }, admin),
    });
    await t.app.request("/api/v1/statuses/submissions/2026/cover.png", {
      method: "PUT",
      ...json({ status: "approved" }, admin),
    });
    await t.poller.runNow();

    const paths = [
      "/api/v1/me",
      "/api/v1/config",
      "/api/v1/objects",
      "/api/v1/objects?status=approved",
      "/api/v1/objects/submissions/2026/cover.png",
      "/api/v1/comments/submissions/2026/cover.png",
      "/api/v1/webhooks",
      `/api/v1/webhooks/${hook.webhook.id}/deliveries`,
      "/api/v1/admin/index-runs",
      "/api/v1/objects/other/secret.txt", // problem+json
    ];
    for (const path of paths) {
      const body = await (await t.app.request(path, { headers: admin })).json();
      expect(snakeKeys(body), path).toEqual([]);
    }
    expect(snakeKeys(hook), "POST /webhooks").toEqual([]);

    // Webhook の配送ペイロードも同じ
    const payloads = (
      t.db.prepare("SELECT payload FROM webhook_deliveries").all() as Array<{
        payload: string;
      }>
    ).map((r) => JSON.parse(r.payload));
    expect(payloads).toHaveLength(2);
    for (const p of payloads) expect(snakeKeys(p), p.type).toEqual([]);
  });
});

describe("RFC 9457 Problem Details", () => {
  /**
   * どのエラーも:
   *   - Content-Type が application/problem+json
   *   - status メンバーが HTTP ステータスと一致
   *   - type が about:blank なら title は HTTP の標準フレーズ（§4.2.1）
   *   - それ以外なら PROBLEM_TYPES に登録済みの type で、title はその種類の固定文言（§3.1.3）
   */
  test("すべてのエラー応答が type と title の規則を守る", async () => {
    const { HTTP_STATUS_PHRASES, PROBLEM_TYPES, problemTypeUri } =
      await import("@/domains/Problem/model");
    const knownTypes = new Map(
      (Object.keys(PROBLEM_TYPES) as Array<keyof typeof PROBLEM_TYPES>).map(
        (n) => [problemTypeUri(n), PROBLEM_TYPES[n]],
      ),
    );
    const admin = await signIn(t.app, "admin@example.com");
    const cases: Array<[string, RequestInit, number]> = [
      ["/api/v1/objects", {}, 401],
      ["/api/v1/objects", { headers: { Authorization: "Bearer nope" } }, 401],
      ["/api/v1/webhooks", { headers: auth }, 403],
      ["/api/v1/objects?status=bogus", { headers: auth }, 400],
      ["/api/v1/objects?updatedSince=garbage", { headers: auth }, 400],
      ["/api/v1/objects/other/secret.txt", { headers: auth }, 404],
      ["/api/v1/objects/submissions/missing.png", { headers: auth }, 404],
      ["/api/v1/nowhere", { headers: auth }, 404],
      [
        "/api/v1/comments/submissions/notes.txt",
        { method: "POST", ...json({ body: "" }, auth) },
        422,
      ],
      [
        "/api/v1/statuses/submissions/notes.txt",
        { method: "PUT", ...json({ status: "bogus" }, auth) },
        422,
      ],
      [
        "/api/v1/webhooks",
        { method: "POST", ...json({ url: "not a url", events: [] }, admin) },
        422,
      ],
      [
        "/api/v1/dev/session",
        { method: "POST", ...json({ email: "nope" }) },
        422,
      ],
    ];
    for (const [path, init, status] of cases) {
      const label = `${init.method ?? "GET"} ${path}`;
      const res = await t.app.request(path, init);
      expect(res.status, label).toBe(status);
      expect(res.headers.get("Content-Type"), label).toBe(
        "application/problem+json",
      );
      const body = (await res.json()) as any;
      expect(body.status, label).toBe(status);
      if (body.type === "about:blank") {
        expect(body.title, label).toBe(HTTP_STATUS_PHRASES[status]);
      } else {
        const known = knownTypes.get(body.type);
        expect(known, `${label}: unknown type ${body.type}`).toBeDefined();
        expect(body.title, label).toBe(known!.title);
        expect(known!.status, label).toBe(status);
      }
    }
  });

  test("クエリ不正は errors[].parameter、本文の不正は errors[].pointer で場所を示す", async () => {
    const q = (await (
      await t.app.request("/api/v1/objects?status=bogus&page=0", {
        headers: auth,
      })
    ).json()) as any;
    expect(
      q.errors.map((e: { parameter: string }) => e.parameter).sort(),
    ).toEqual(["page", "status"]);

    const admin = await signIn(t.app, "admin@example.com");
    const w = (await (
      await t.app.request("/api/v1/webhooks", {
        method: "POST",
        ...json({ url: "https://ok.example", events: ["nope"] }, admin),
      })
    ).json()) as any;
    expect(w.errors.map((e: { pointer: string }) => e.pointer)).toEqual([
      "#/events/0",
    ]);
  });
});
