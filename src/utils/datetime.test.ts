import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
  formatDateTime,
  fromDate,
  Instant,
  now,
  nowMillis,
  parseInstant,
  Temporal,
  toIsoMillis,
  toIsoSeconds,
  tryParseInstant,
} from "./datetime";

// Temporal.Instant は toEqual では中身を比べられない（列挙できるプロパティが無い）ので、文字列や epoch で比べる
describe("Instant codec", () => {
  test("ISO 8601（タイムゾーン必須）を Temporal.Instant にし、秒精度の文字列に戻す", () => {
    const i = Instant.parse("2026-06-01T09:00:00+09:00");
    expect(i).toBeInstanceOf(Temporal.Instant);
    expect(i.toString()).toBe("2026-06-01T00:00:00Z");
    expect(
      Instant.encode(Temporal.Instant.from("2026-06-01T00:00:00.123Z")),
    ).toBe("2026-06-01T00:00:00Z");
  });

  test("タイムゾーンの無い値・日付だけの値・文字列でない値は拒否する", () => {
    for (const bad of ["2026-06-01T00:00:00", "2026-06-01", "garbage", 123]) {
      expect(Instant.safeParse(bad).success, String(bad)).toBe(false);
    }
  });

  test("スキーマに埋め込んでも、JSON にすると元と同じ形式の文字列になる（サーバの c.json）", () => {
    const Row = z.object({ at: Instant, maybe: Instant.nullable() });
    const row = Row.parse({ at: "2026-09-26T14:53:19Z", maybe: null });
    expect(JSON.stringify(row)).toBe(
      '{"at":"2026-09-26T14:53:19Z","maybe":null}',
    );
  });
});

describe("保存・出力の形式", () => {
  test("toIsoSeconds は `…Z`、toIsoMillis は Date#toISOString と同じ 3 桁", () => {
    const i = Temporal.Instant.from("2026-09-26T14:53:19.123456Z");
    expect(toIsoSeconds(i)).toBe("2026-09-26T14:53:19Z");
    expect(toIsoMillis(i)).toBe("2026-09-26T14:53:19.123Z");
    const whole = Temporal.Instant.from("2026-09-26T14:53:19Z");
    expect(toIsoMillis(whole)).toBe(
      new globalThis.Date(whole.epochMilliseconds).toISOString(),
    );
  });

  test("toIsoMillis は桁が揃うので文字列の大小が時刻の前後と一致する", () => {
    const a = Temporal.Instant.from("2026-09-26T14:53:19Z");
    const b = a.add({ milliseconds: 5 });
    const c = a.add({ seconds: 1 });
    expect([toIsoMillis(c), toIsoMillis(a), toIsoMillis(b)].sort()).toEqual([
      toIsoMillis(a),
      toIsoMillis(b),
      toIsoMillis(c),
    ]);
  });

  test("now() は秒、nowMillis() はミリ秒で切り捨てる", () => {
    expect(now().epochNanoseconds % 1_000_000_000n).toBe(0n);
    expect(nowMillis().epochNanoseconds % 1_000_000n).toBe(0n);
  });
});

describe("変換", () => {
  test("fromDate は AWS SDK などの Date を同じ時刻の Instant にする", () => {
    const d = new globalThis.Date("2026-01-02T03:04:05.678Z");
    expect(fromDate(d).toString()).toBe("2026-01-02T03:04:05.678Z");
  });

  test("parseInstant は空を null に、tryParseInstant は壊れた値も null にする", () => {
    expect(parseInstant(null)).toBeNull();
    expect(parseInstant("")).toBeNull();
    expect(parseInstant("2026-01-01T00:00:00Z")?.toString()).toBe(
      "2026-01-01T00:00:00Z",
    );
    expect(() => parseInstant("garbage")).toThrow();
    expect(tryParseInstant("garbage")).toBeNull();
  });

  test("formatDateTime は null を `-` にする", () => {
    expect(formatDateTime(null)).toBe("-");
    expect(
      formatDateTime(Temporal.Instant.from("2026-01-01T00:00:00Z")),
    ).toMatch(/2026/);
  });
});
