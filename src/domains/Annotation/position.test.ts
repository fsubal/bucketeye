import { describe, expect, test } from "vitest";
import {
  describePosition,
  formatTimecode,
  fromSelector,
  isPositionAllowed,
  MEDIA_FRAGMENTS,
  PDF_FRAGMENTS,
  type Position,
  TEXT_FRAGMENTS,
  toSelector,
} from "./position";

const frag = (value: string, conformsTo?: string) => ({
  type: "FragmentSelector" as const,
  value,
  ...(conformsTo ? { conformsTo } : {}),
});

describe("toSelector / fromSelector", () => {
  test.each<[Position, string, string]>([
    [
      { kind: "region", x: 10, y: 20.5, w: 30, h: 40 },
      "xywh=percent:10,20.5,30,40",
      MEDIA_FRAGMENTS,
    ],
    [{ kind: "time", start: 65.2 }, "t=65.2", MEDIA_FRAGMENTS],
    [{ kind: "time", start: 5, end: 12.5 }, "t=5,12.5", MEDIA_FRAGMENTS],
    [{ kind: "page", page: 3 }, "page=3", PDF_FRAGMENTS],
    [{ kind: "lines", from: 10, to: 12 }, "line=9,12", TEXT_FRAGMENTS],
    [{ kind: "lines", from: 1, to: 1 }, "line=0,1", TEXT_FRAGMENTS],
  ])("%o ⇄ %s", (position, value, conformsTo) => {
    const selector = toSelector(position);
    expect(selector).toEqual(frag(value, conformsTo));
    expect(fromSelector(selector)).toEqual(position);
  });

  test("小数は 2 桁に丸めて書く", () => {
    expect(
      toSelector({ kind: "region", x: 1.23456, y: 0, w: 33.3333, h: 50 }).value,
    ).toBe("xywh=percent:1.23,0,33.33,50");
  });

  test("npt: 付きの時刻も読める", () => {
    expect(fromSelector(frag("t=npt:10,20"))).toEqual({
      kind: "time",
      start: 10,
      end: 20,
    });
  });

  test.each([
    "xywh=percent:90,0,20,10", // 右にはみ出す
    "xywh=percent:0,0,0,10", // 幅 0
    "xywh=10,10,20,20", // 単位（percent:）が無い = pixel。表示サイズに依存するので受け付けない
    "t=20,10", // 終わりが始まりより前
    "t=-1",
    "page=0",
    "line=5,5", // 0 行
    "garbage",
  ])("不正な値 %s は null（ファイル全体へのコメント扱い）", (value) => {
    expect(fromSelector(frag(value))).toBeNull();
  });

  test("FragmentSelector 以外・selector なしは null", () => {
    expect(fromSelector(null)).toBeNull();
    expect(
      fromSelector({ type: "TextPositionSelector", start: 0, end: 3 }),
    ).toBeNull();
  });
});

describe("種類との対応", () => {
  test("画像は範囲、動画・音声は時刻、PDF はページ、テキストは行だけ", () => {
    const region: Position = { kind: "region", x: 0, y: 0, w: 1, h: 1 };
    const time: Position = { kind: "time", start: 1 };
    expect(isPositionAllowed("image", region)).toBe(true);
    expect(isPositionAllowed("image", time)).toBe(false);
    expect(isPositionAllowed("video", time)).toBe(true);
    expect(isPositionAllowed("audio", time)).toBe(true);
    expect(isPositionAllowed("pdf", { kind: "page", page: 1 })).toBe(true);
    expect(isPositionAllowed("text", { kind: "lines", from: 1, to: 2 })).toBe(
      true,
    );
    expect(isPositionAllowed("other", region)).toBe(false);
  });
});

describe("表示", () => {
  test("formatTimecode", () => {
    expect(formatTimecode(0)).toBe("0:00");
    expect(formatTimecode(65.9)).toBe("1:05");
    expect(formatTimecode(3725)).toBe("1:02:05");
  });

  test("describePosition", () => {
    expect(describePosition({ kind: "region", x: 0, y: 0, w: 1, h: 1 })).toBe(
      "範囲",
    );
    expect(describePosition({ kind: "time", start: 65, end: 70 })).toBe(
      "1:05–1:10",
    );
    expect(describePosition({ kind: "page", page: 3 })).toBe("p.3");
    expect(describePosition({ kind: "lines", from: 4, to: 4 })).toBe("L4");
    expect(describePosition({ kind: "lines", from: 4, to: 9 })).toBe("L4–9");
  });
});
