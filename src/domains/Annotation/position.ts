import type { ObjectKind } from "@/domains/ReviewedObject/model";
import type { z } from "zod";
import type { Comment, FragmentSelector, Selector } from "./model";

/**
 * コメントの「位置」。S3 に置く W3C Web Annotation では target.selector（FragmentSelector）として持ち、
 * アプリの中ではこの扱いやすい形に変換して使う。値の書式は既存の標準に合わせる:
 *
 * | 種類   | 対象         | FragmentSelector の value     | conformsTo                         |
 * |--------|--------------|-------------------------------|------------------------------------|
 * | region | 画像         | `xywh=percent:10,20,30,40`    | Media Fragments（W3C）             |
 * | time   | 動画・音声   | `t=65.2` / `t=65.2,70`        | Media Fragments（W3C）             |
 * | page   | PDF          | `page=3`                      | RFC 8118（PDF の fragment）        |
 * | lines  | テキスト     | `line=9,12`（10〜12 行目）    | RFC 5147（text/plain の fragment） |
 *
 * 画像の範囲を百分率で持つのは、表示サイズや元画像の解像度に左右されないようにするため
 */
export type Position =
  | { kind: "region"; x: number; y: number; w: number; h: number }
  | { kind: "time"; start: number; end?: number }
  | { kind: "page"; page: number }
  | { kind: "lines"; from: number; to: number };

export type PositionKind = Position["kind"];

export const MEDIA_FRAGMENTS = "http://www.w3.org/TR/media-frags/";
export const PDF_FRAGMENTS = "http://tools.ietf.org/rfc/rfc8118";
export const TEXT_FRAGMENTS = "http://tools.ietf.org/rfc/rfc5147";

/** ファイルの種類ごとに付けられる位置 */
const KIND_FOR_OBJECT: Partial<Record<ObjectKind, PositionKind>> = {
  image: "region",
  video: "time",
  audio: "time",
  pdf: "page",
  text: "lines",
};

export function positionKindFor(kind: ObjectKind): PositionKind | null {
  return KIND_FOR_OBJECT[kind] ?? null;
}

export function isPositionAllowed(kind: ObjectKind, p: Position): boolean {
  return positionKindFor(kind) === p.kind;
}

/** 小数は 2 桁まで（百分率・秒の精度として十分で、JSON が読みやすい） */
const round2 = (n: number) => Math.round(n * 100) / 100;

export function toSelector(p: Position): z.infer<typeof FragmentSelector> {
  switch (p.kind) {
    case "region":
      return {
        type: "FragmentSelector",
        conformsTo: MEDIA_FRAGMENTS,
        value: `xywh=percent:${[p.x, p.y, p.w, p.h].map(round2).join(",")}`,
      };
    case "time":
      return {
        type: "FragmentSelector",
        conformsTo: MEDIA_FRAGMENTS,
        value:
          p.end === undefined
            ? `t=${round2(p.start)}`
            : `t=${round2(p.start)},${round2(p.end)}`,
      };
    case "page":
      return {
        type: "FragmentSelector",
        conformsTo: PDF_FRAGMENTS,
        value: `page=${p.page}`,
      };
    case "lines":
      // RFC 5147 の line= は行の「境界」（0 始まり）で数えるので、1 始まりの from〜to 行目は line=from-1,to
      return {
        type: "FragmentSelector",
        conformsTo: TEXT_FRAGMENTS,
        value: `line=${p.from - 1},${p.to}`,
      };
  }
}

const NUM = String.raw`(\d+(?:\.\d+)?)`;
const EPS = 0.01;

/** selector を位置に戻す。知らない形式や範囲外の値なら null（ファイル全体へのコメントとして扱う） */
export function fromSelector(
  selector: Selector | null | undefined,
): Position | null {
  if (!selector || selector.type !== "FragmentSelector") return null;
  const v = selector.value.trim();

  let m = new RegExp(`^xywh=percent:${NUM},${NUM},${NUM},${NUM}$`).exec(v);
  if (m) {
    const [x, y, w, h] = m.slice(1).map(Number) as [
      number,
      number,
      number,
      number,
    ];
    const ok = w > 0 && h > 0 && x + w <= 100 + EPS && y + h <= 100 + EPS;
    return ok ? { kind: "region", x, y, w, h } : null;
  }

  m = new RegExp(`^t=(?:npt:)?${NUM}(?:,${NUM})?$`).exec(v);
  if (m) {
    const start = Number(m[1]);
    if (m[2] === undefined) return { kind: "time", start };
    const end = Number(m[2]);
    return end > start ? { kind: "time", start, end } : null;
  }

  m = /^page=(\d+)$/.exec(v);
  if (m) {
    const page = Number(m[1]);
    return page >= 1 ? { kind: "page", page } : null;
  }

  m = /^line=(\d+),(\d+)$/.exec(v);
  if (m) {
    const from = Number(m[1]) + 1;
    const to = Number(m[2]);
    return to >= from ? { kind: "lines", from, to } : null;
  }

  return null;
}

/** 65.2 → "1:05"、3725 → "1:02:05" */
export function formatTimecode(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** コメントに添える短い表示 */
export function describePosition(p: Position): string {
  switch (p.kind) {
    case "region":
      return "範囲";
    case "time":
      return p.end === undefined
        ? formatTimecode(p.start)
        : `${formatTimecode(p.start)}–${formatTimecode(p.end)}`;
    case "page":
      return `p.${p.page}`;
    case "lines":
      return p.from === p.to ? `L${p.from}` : `L${p.from}–${p.to}`;
  }
}

/** 位置付きのコメントに、プレビューとコメント欄で共通の通し番号（1 始まり、投稿順）を振る */
export type PositionedComment = {
  comment: Comment;
  position: Position;
  number: number;
};

export function positionedComments(
  comments: readonly Comment[],
): PositionedComment[] {
  const out: PositionedComment[] = [];
  for (const comment of comments) {
    const position = fromSelector(comment.selector);
    if (position) out.push({ comment, position, number: out.length + 1 });
  }
  return out;
}
