import { describe, expect, test } from "vitest";
import { runIndex } from "./indexer";
import { syncObject } from "./sync";
import { createTestDeps, identity } from "../../../test/helpers";
import { findObject } from "../db/objects";
import { listComments } from "../db/comments";
import { Temporal } from "@/utils/datetime";

describe("runIndex", () => {
  test("TARGET_PREFIX 以下を索引し、サイドカーと対象外を除き、消えたものを削除する。冪等", async () => {
    const t = createTestDeps();
    t.s3.put("submissions/a/cover.png", "PNG", { contentType: "image/png" });
    t.s3.put("submissions/a/body.pdf", "PDF", {
      contentType: "application/pdf",
    });
    t.s3.put("submissions/readme.txt", "hello", { contentType: "text/plain" });
    t.s3.put("submissions/folder/", "", {
      contentType: "application/x-directory",
    });
    t.s3.put("other/ignored.txt", "x");
    await t.statusStore.write(
      "submissions/a/cover.png",
      "approved",
      "alice@example.com",
    );
    await t.commentStore.append("submissions/a/cover.png", {
      body: "hi",
      creator: identity(),
    });
    await t.commentStore.append("submissions/readme.txt", {
      body: "text comment",
      creator: identity(),
    });
    await t.webhookStore.save({
      id: "W1",
      url: "https://h.example/",
      events: ["comment.created"],
      secret: "x".repeat(16),
      active: true,
      description: "",
      createdBy: "a",
      createdAt: Temporal.Instant.from("2026-01-01T00:00:00Z"),
    });
    t.db
      .prepare(
        "INSERT INTO objects (bucket, key, indexed_at) VALUES ('test-bucket', 'submissions/gone.txt', '2000-01-01T00:00:00Z')",
      )
      .run();

    const r = await runIndex(t);
    expect(r).toEqual({ objects: 3, comments: 2, webhooks: 1, removed: 1 });
    expect(t.db.prepare("SELECT key FROM objects ORDER BY key").all()).toEqual([
      { key: "submissions/a/body.pdf" },
      { key: "submissions/a/cover.png" },
      { key: "submissions/readme.txt" },
    ]);
    expect(
      findObject(t.db, "test-bucket", "submissions/a/cover.png"),
    ).toMatchObject({
      status: "approved",
      reviewer: "alice@example.com",
      content_type: "image/png",
    });
    expect(
      listComments(t.db, "test-bucket", "submissions/a/cover.png").map(
        (c) => c.body,
      ),
    ).toEqual(["hi"]);

    // 2 回目は同じ結果（HEAD は etag が同じなら省く）
    await runIndex(t);
    expect(t.db.prepare("SELECT count(*) c FROM objects").get()).toEqual({
      c: 3,
    });
    expect(t.db.prepare("SELECT count(*) c FROM comments").get()).toEqual({
      c: 2,
    });
  });

  test("syncObject は 1 件だけ読み直し、無くなっていれば行を消す", async () => {
    const t = createTestDeps();
    t.s3.put("submissions/readme.txt", "hello", { contentType: "text/plain" });
    const o = await syncObject(t, "submissions/readme.txt");
    expect(o).toMatchObject({ kind: "text", size: 5 });
    await t.s3.deleteObject("submissions/readme.txt", "test-bucket");
    expect(await syncObject(t, "submissions/readme.txt")).toBeNull();
    expect(
      findObject(t.db, "test-bucket", "submissions/readme.txt"),
    ).toBeNull();
  });
});
