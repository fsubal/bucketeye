import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  jsonPointer,
  PROBLEM_DOCS_URL,
  PROBLEM_TYPES,
  problemTypeUri,
} from "./model";

describe("Problem", () => {
  test("type URI は docs/problems.md の見出しを指し、見出しが実在する", () => {
    const doc = readFileSync(
      new URL("../../../docs/problems.md", import.meta.url),
      "utf8",
    );
    for (const name of Object.keys(PROBLEM_TYPES) as Array<
      keyof typeof PROBLEM_TYPES
    >) {
      const t = PROBLEM_TYPES[name];
      expect(problemTypeUri(name)).toBe(`${PROBLEM_DOCS_URL}#${t.slug}`);
      expect(doc, t.slug).toContain(`\n## ${t.slug}\n`);
      // その見出しの節（次の "## " まで）の表に title と status がある。Prettier が表の桁を揃えるので空白の量は問わない
      const section = doc.split(`\n## ${t.slug}\n`)[1]!.split("\n## ")[0]!;
      const cell = (label: string, value: string | number) =>
        new RegExp(
          `^\\|\\s*${label}\\s*\\|\\s*${String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\|$`,
          "m",
        );
      expect(section, t.slug).toMatch(cell("title", t.title));
      expect(section, t.slug).toMatch(cell("status", t.status));
    }
  });

  test("jsonPointer は RFC 6901 の URI フラグメント表現", () => {
    expect(jsonPointer([])).toBe("#");
    expect(jsonPointer(["body"])).toBe("#/body");
    expect(jsonPointer(["events", 0])).toBe("#/events/0");
    expect(jsonPointer(["a/b", "c~d", "e f"])).toBe("#/a~1b/c~0d/e%20f");
  });
});
