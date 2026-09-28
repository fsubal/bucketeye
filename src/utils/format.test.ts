import { describe, expect, test } from "vitest";
import { formatBytes } from "./format";

describe("format", () => {
  test("formatBytes", () => {
    expect(formatBytes(null)).toBe("-");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(120 * 1024 * 1024)).toBe("120 MB");
  });
});
