import { describe, expect, test } from "vitest";
import { formatBytes, formatDate } from "./format";

describe("format", () => {
  test("formatBytes", () => {
    expect(formatBytes(null)).toBe("-");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(120 * 1024 * 1024)).toBe("120 MB");
  });
  test("formatDate は不正な値をそのまま返す", () => {
    expect(formatDate(null)).toBe("-");
    expect(formatDate("garbage")).toBe("garbage");
  });
});
