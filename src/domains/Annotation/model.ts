import { z } from "zod";
import { Instant, now, Temporal, toIsoSeconds } from "@/utils/datetime";
import { monotonicFactory } from "ulid";
import { Identity } from "@/domains/Identity/model";

/**
 * コメント 1 件を W3C Web Annotation Data Model（https://www.w3.org/TR/annotation-model/）で表す。
 * S3 に置く JSON はこの形そのもの（Rails 版 s3review とバイト互換）。
 * ファイル全体へのコメントは target.selector を持たない。位置指定コメント（画像の範囲・動画の時刻・PDF のページ・
 * テキストの行）は target.selector の FragmentSelector に入る。読み書きと検証は ./position.ts
 */
export const ANNOTATION_CONTEXT = "http://www.w3.org/ns/anno.jsonld";

const FragmentSelectorBase = z.object({
  type: z.literal("FragmentSelector"),
  conformsTo: z.string().optional(),
  value: z.string(),
});
/**
 * W3C の FragmentSelector。refinedBy で、その中をさらに絞り込める（例: PDF の page=3 の中の xywh= の範囲）。
 * 仕様上は何段でも入れ子にできるが、このアプリは 1 段だけ使う
 */
export const FragmentSelector = FragmentSelectorBase.extend({
  refinedBy: FragmentSelectorBase.optional(),
});
export const SvgSelector = z.object({
  type: z.literal("SvgSelector"),
  value: z.string(),
});
export const TextPositionSelector = z.object({
  type: z.literal("TextPositionSelector"),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});
export const Selector = z.discriminatedUnion("type", [
  FragmentSelector,
  SvgSelector,
  TextPositionSelector,
]);
export type Selector = z.infer<typeof Selector>;

export const Annotation = z.object({
  "@context": z.literal(ANNOTATION_CONTEXT),
  id: z.string().regex(/^urn:ulid:[0-9A-HJKMNP-TV-Z]{26}$/),
  type: z.literal("Annotation"),
  motivation: z.literal("commenting"),
  created: z.string(),
  creator: z.object({
    type: z.literal("Person"),
    email: z.string(),
    name: z.string().optional(),
  }),
  body: z.object({
    type: z.literal("TextualBody"),
    value: z.string(),
    format: z.literal("text/plain"),
  }),
  target: z.object({ source: z.string(), selector: Selector.optional() }),
});
export type Annotation = z.infer<typeof Annotation>;

export function sourceFor(bucket: string, key: string): string {
  return `s3://${bucket}/${key}`;
}

export function parseSource(
  source: string,
): { bucket: string; key: string } | null {
  const m = /^s3:\/\/([^/]+)\/(.+)$/.exec(source);
  return m ? { bucket: m[1]!, key: m[2]! } : null;
}

export function ulidOf(annotation: Pick<Annotation, "id">): string {
  return annotation.id.replace(/^urn:ulid:/, "");
}

export function buildAnnotation(input: {
  bucket: string;
  key: string;
  body: string;
  creator: Pick<z.infer<typeof Identity>, "email" | "name">;
  selector?: Selector;
  ulid?: string;
  created?: Temporal.Instant;
}): Annotation {
  const target: Annotation["target"] = {
    source: sourceFor(input.bucket, input.key),
  };
  if (input.selector) target.selector = input.selector;
  return {
    "@context": ANNOTATION_CONTEXT,
    id: `urn:ulid:${input.ulid ?? generateUlid()}`,
    type: "Annotation",
    motivation: "commenting",
    // W3C Web Annotation の created は xsd:dateTime の文字列（S3 にもこの形で置く）
    created: toIsoSeconds(input.created ?? now()),
    creator: {
      type: "Person",
      email: input.creator.email,
      name: input.creator.name,
    },
    body: { type: "TextualBody", value: input.body, format: "text/plain" },
    target,
  };
}

/** API / UI 向けの平たい形 */
export const Comment = z.object({
  id: z.string(),
  authorEmail: z.string(),
  authorName: z.string().nullable(),
  body: z.string(),
  selector: Selector.nullable(),
  createdAt: Instant,
});
export type Comment = z.infer<typeof Comment>;

export function commentOf(annotation: Annotation): Comment {
  return {
    id: ulidOf(annotation),
    authorEmail: annotation.creator.email,
    authorName: annotation.creator.name ?? null,
    body: annotation.body.value,
    selector: annotation.target.selector ?? null,
    createdAt: Temporal.Instant.from(annotation.created),
  };
}

// ---- ULID（時刻順にソートできる 26 文字の ID）。同一ミリ秒内でも単調増加になる monotonic 版を使う ----
const monotonicUlid = monotonicFactory();

export function generateUlid(
  at: Temporal.Instant = Temporal.Now.instant(),
): string {
  return monotonicUlid(at.epochMilliseconds);
}
