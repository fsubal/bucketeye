import { z } from "zod";

/**
 * 日時は JS の Date ではなく Temporal で扱う（ブラウザ・Node ともにまだ標準で入っていないので polyfill）。
 * Date.prototype の拡張（install）はせず、AWS SDK などが返す Date は fromDate() で明示的に変換する。
 * 参考: https://github.com/fsubal/youdotfm/blob/main/src/utils/datetime.ts
 */
import { Temporal } from "temporal-polyfill-lite";

export { Temporal };

/**
 * ある瞬間（タイムゾーンを持たない時刻）。JSON や S3 / SQLite 上では ISO 8601 の文字列（例 `2026-09-26T14:53:19Z`）、
 * アプリの中では Temporal.Instant として扱う。
 * Temporal.Instant は toJSON を持つので、サーバが c.json() で返すとそのまま同じ形式の文字列になる
 */
export const Instant = z.codec(
  z.iso.datetime({ offset: true, message: "must be an ISO 8601 date-time" }),
  z.instanceof(Temporal.Instant),
  {
    decode: (str) => Temporal.Instant.from(str),
    encode: (instant) => toIsoSeconds(instant),
  },
);
export type Instant = z.infer<typeof Instant>;

/** 今の時刻。記録に残す時刻は秒精度で揃える（保存形式・API の出力が今までと同じになるように） */
export function now(): Temporal.Instant {
  return Temporal.Now.instant().round({
    smallestUnit: "second",
    roundingMode: "trunc",
  });
}

/** 今の時刻をミリ秒精度で（Webhook の配送キューのように、文字列比較で順序を決める所で使う） */
export function nowMillis(): Temporal.Instant {
  return Temporal.Now.instant().round({
    smallestUnit: "millisecond",
    roundingMode: "trunc",
  });
}

/** `2026-09-26T14:53:19Z`（秒精度。S3 のタグ・SQLite の大半の列・API の出力の形式） */
export function toIsoSeconds(instant: Temporal.Instant): string {
  return instant.toString({ smallestUnit: "second" });
}

/**
 * `2026-09-26T14:53:19.000Z`（ミリ秒 3 桁固定。Date#toISOString と同じ形式）。
 * 桁数が揃っているので文字列の大小比較が時刻の前後と一致する
 */
export function toIsoMillis(instant: Temporal.Instant): string {
  return instant.toString({ fractionalSecondDigits: 3 });
}

/** 保存層（SQLite の列、S3 のタグ）の文字列を Instant にする。空なら null */
export function parseInstant(
  value: string | null | undefined,
): Temporal.Instant | null {
  return value ? Temporal.Instant.from(value) : null;
}

/** 人が書き換えうる値（S3 のタグなど）用。壊れていたら null */
export function tryParseInstant(
  value: string | null | undefined,
): Temporal.Instant | null {
  try {
    return parseInstant(value);
  } catch {
    return null;
  }
}

/** 外部ライブラリ（AWS SDK など）が返す Date を変換する境界でだけ使う */
export function fromDate(date: Date): Temporal.Instant {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime());
}

/** 画面表示用。閲覧者のタイムゾーンで `2026/9/26 23:53:19` のように出す */
export function formatDateTime(
  instant: Temporal.Instant | null | undefined,
): string {
  if (!instant) return "-";
  return instant
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .toLocaleString(undefined, {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
}
