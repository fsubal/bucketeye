import { describe, expect, test } from "vitest";
import {
  Annotation,
  buildAnnotation,
  commentOf,
  generateUlid,
  parseSource,
  ulidOf,
} from "./model";
import { Temporal } from "@/utils/datetime";

describe("Annotation", () => {
  test("W3C Web Annotation の形で組み立て、スキーマを通る", () => {
    const a = buildAnnotation({
      bucket: "b",
      key: "k/x.png",
      body: "hi",
      creator: { email: "a@example.com", name: "A" },
    });
    expect(Annotation.parse(a)).toEqual(a);
    expect(a["@context"]).toBe("http://www.w3.org/ns/anno.jsonld");
    expect(a.target).toEqual({ source: "s3://b/k/x.png" }); // MVP は selector なし
    expect(parseSource(a.target.source)).toEqual({
      bucket: "b",
      key: "k/x.png",
    });
    expect(commentOf(a)).toMatchObject({
      id: ulidOf(a),
      authorEmail: "a@example.com",
      body: "hi",
      selector: null,
    });
  });

  test("selector 付きも受理し、不正な selector は拒否する", () => {
    const a = buildAnnotation({
      bucket: "b",
      key: "k",
      body: "region",
      creator: { email: "a@example.com", name: "A" },
      selector: {
        type: "FragmentSelector",
        conformsTo: "http://www.w3.org/TR/media-frags/",
        value: "xywh=pixel:1,2,3,4",
      },
    });
    expect(Annotation.safeParse(a).success).toBe(true);
    expect(
      Annotation.safeParse({
        ...a,
        target: { ...a.target, selector: { type: "Bogus" } },
      }).success,
    ).toBe(false);
  });

  test("ULID は 26 文字で、同一ミリ秒内でも単調増加", () => {
    const t = Temporal.Instant.fromEpochMilliseconds(1_700_000_000_000);
    const a = generateUlid(t);
    const b = generateUlid(t);
    const c = generateUlid(t.add({ milliseconds: 1 }));
    expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(a < b).toBe(true);
    expect(b < c).toBe(true);
  });
});
