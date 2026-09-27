import { beforeEach, describe, expect, test } from "vitest";
import { createTestDeps, identity, type TestDeps } from "../../../test/helpers";

let t: TestDeps;
const admin = { Authorization: "Bearer test-admin-token" };
const reviewer = { Authorization: "Bearer test-api-token" };

beforeEach(() => {
  t = createTestDeps();
  t.s3.put("submissions/a/cover.png", "PNG", { contentType: "image/png" });
  t.s3.put("submissions/b.txt", "hello", { contentType: "text/plain" });
  t.s3.put("other/secret.txt", "x", { contentType: "text/plain" });
});

const get = async (path: string, headers: Record<string, string>) => {
  const res = await t.app.request(path, { headers });
  return { status: res.status, body: (await res.json()) as any };
};

describe("ADMIN_API_TOKENS", () => {
  test("admin のトークンは admin、API_TOKENS は reviewer のまま", async () => {
    expect((await get("/api/v1/me", admin)).body.identity).toMatchObject({
      provider: "api_token",
      role: "admin",
    });
    expect((await get("/api/v1/me", reviewer)).body.identity).toMatchObject({
      provider: "api_token",
      role: "reviewer",
    });
    expect((await get("/api/v1/admin/index-runs", admin)).status).toBe(200);
    expect((await get("/api/v1/admin/index-runs", reviewer)).status).toBe(403);
  });
});

describe("POST /admin/reindex", () => {
  test("?wait=true は終わるまで待って件数を返す", async () => {
    const res = await t.app.request("/api/v1/admin/reindex?wait=true", {
      method: "POST",
      headers: admin,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.running).toBe(false);
    expect(body.result).toEqual({
      objects: 2,
      comments: 0,
      webhooks: 0,
      removed: 0,
    });
    expect(body.run).toMatchObject({ objects: 2, error: null });
    expect(body.run.finishedAt).not.toBeNull();
  });

  test("wait なしは今までどおり待たずに 202", async () => {
    const res = await t.app.request("/api/v1/admin/reindex", {
      method: "POST",
      headers: admin,
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ started: true, running: true });
    await t.poller.runNow();
  });

  test("失敗したら 500 の problem+json で理由を返す", async () => {
    t.s3.eachObject = () => {
      throw new Error("bucket is gone");
    };
    const res = await t.app.request("/api/v1/admin/reindex?wait=true", {
      method: "POST",
      headers: admin,
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      type: "about:blank",
      title: "Internal Server Error",
      detail: "Error: bucket is gone",
    });
  });
});

describe("GET /admin/storage/*", () => {
  test("タグとサイドカーの生の状態を返す", async () => {
    await t.statusStore.write(
      "submissions/a/cover.png",
      "approved",
      "alice@example.com",
      new Date("2026-06-01T00:00:00Z"),
    );
    await t.commentStore.append("submissions/a/cover.png", {
      body: "hi",
      creator: identity(),
    });

    const { status, body } = await get(
      "/api/v1/admin/storage/submissions/a/cover.png",
      admin,
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({
      bucket: "test-bucket",
      key: "submissions/a/cover.png",
      head: { size: 3, contentType: "image/png" },
      statusStrategy: "tags",
      tags: {
        "review-status": "approved",
        "review-updated-at": "2026-06-01T00:00:00Z",
        "review-reviewer": "alice@example.com",
      },
      tagsError: null,
      sidecar: { bucket: "test-bucket", status: null },
    });
    expect(body.sidecar.prefix).toMatch(/^\.review\/objects\/[0-9a-f]{64}\/$/);
    expect(body.sidecar.commentKeys).toHaveLength(1);
    expect(body.sidecar.commentKeys[0]).toMatch(
      /\/comments\/[0-9A-HJKMNP-TV-Z]{26}\.json$/,
    );
  });

  test("sidecar 戦略では status.json の中身が見える", async () => {
    t = createTestDeps({ STATUS_STRATEGY: "sidecar" });
    t.s3.put("submissions/b.txt", "hello", { contentType: "text/plain" });
    await t.statusStore.write(
      "submissions/b.txt",
      "rejected",
      "bob@example.com",
    );
    const { body } = await get(
      "/api/v1/admin/storage/submissions/b.txt",
      admin,
    );
    expect(body.statusStrategy).toBe("sidecar");
    expect(body.tags).toEqual({});
    expect(body.sidecar.status).toMatchObject({
      status: "rejected",
      reviewer: "bob@example.com",
    });
  });

  test("タグを読めないバックエンドでも他の情報は返す", async () => {
    t.s3.getTags = async () => {
      throw new Error("NotImplemented");
    };
    const { status, body } = await get(
      "/api/v1/admin/storage/submissions/b.txt",
      admin,
    );
    expect(status).toBe(200);
    expect(body.tags).toBeNull();
    expect(body.tagsError).toBe("Error: NotImplemented");
  });

  test("対象外・存在しないキーは 404、reviewer は 403", async () => {
    expect(
      (await get("/api/v1/admin/storage/other/secret.txt", admin)).status,
    ).toBe(404);
    expect(
      (await get("/api/v1/admin/storage/submissions/missing.png", admin))
        .status,
    ).toBe(404);
    expect(
      (await get("/api/v1/admin/storage/submissions/b.txt", reviewer)).status,
    ).toBe(403);
  });
});
