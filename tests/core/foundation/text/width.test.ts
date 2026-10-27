import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { expandTabs, sanitize, sanitizeMap } from "../../../../src/core/foundation/text/sanitize.ts";

import { graphemes, stringWidth, truncate } from "../../../../src/core/foundation/text/width.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("width (0.7)", () => {
  test("ASCII, CJK, emoji, ZWJ, combining marks", () => {
    expect(stringWidth("abcdefgh")).toBe(8);
    expect(stringWidth("日本語のテキスト")).toBe(16);
    expect(stringWidth("🌍🚀")).toBe(4);
    expect(stringWidth("👨‍👩‍👧‍👦")).toBe(2);
    expect(graphemes("👨‍👩‍👧‍👦")).toHaveLength(1);
    expect(stringWidth("e\u0301")).toBe(1);
    expect(stringWidth("é")).toBe(1);
    expect(stringWidth("a\u200Bb")).toBe(2);
  });
  test("truncate never splits a wide grapheme", () => {
    expect(truncate("日本語", 5)).toBe("日本…");
    expect(stringWidth(truncate("日本語テキスト", 6))).toBeLessThanOrEqual(6);
  });
});

describe("sanitize (2.9)", () => {
  test("strips CSI, OSC and bare controls, keeps text", () => {
    expect(sanitize("a\x1b[2Jb\x1b[31mred\x1b[0m")).toBe("abred");
    expect(sanitize("x\x1b]52;c;aGk=\x07y")).toBe("xy");
    expect(sanitize("tab\tnewline\nok")).toBe("tab\tnewline\nok");
    expect(sanitize("bell\x07 del\x7f c1\x9b")).toBe("bell del c1");
    expect(sanitize("rtl\u202Eoverride")).toBe("rtloverride");
  });
  test("an unterminated OSC or DCS string takes the rest of its line, never the lines after it", () => {
    expect(sanitize("line one \x1b]0;title\nline two\nline three")).toBe("line one \nline two\nline three");
    expect(sanitize("a\x1bPq#0\nb\nc")).toBe("a\nb\nc");
    expect(sanitizeMap("x\x1b]0;t\ny").text).toBe("x\ny");
  });
  test("sanitizeMap: the same text, and where each raw index went (-1 for one taken out)", () => {
    for (const raw of [
      "plain",
      "bell\x07ring.md",
      "a\x1b[31mred\x1b[0m b",
      "x\x1b]0;t\x07y\u2028z",
      "c1\x9b31mq\u202Er",
      "e\x1b",
    ]) {
      const m = sanitizeMap(raw);
      expect(m.text).toBe(sanitize(raw));
      expect(m.at.length).toBe(raw.length);
      // Every kept index lands on its own character, in order.
      const kept = m.at.map((to, i) => [to, i] as const).filter(([to]) => to >= 0);
      expect(kept.map(([to]) => to)).toEqual([...m.text].map((_, k) => k));
      for (const [to, i] of kept) expect(m.text[to]).toBe(raw[i] === "\u2028" ? " " : raw[i]);
    }
    expect(sanitizeMap("bell\x07ring").at.slice(4)).toEqual([-1, 4, 5, 6, 7]);
    expect(sanitizeMap("a\x1b[31mb").at).toEqual([0, -1, -1, -1, -1, -1, 1]);
  });
});

describe("review round 2 (core)", () => {
  test("tab stops count display columns", () => {
    expect(expandTabs("日本\tx")).toBe("日本    x");
  });
});

describe("review cycle 5 (core, from mutation testing)", () => {
  test("tabs reach the next stop, counting display columns", () => {
    expect(expandTabs("ab\tc")).toBe("ab  c");
    expect(expandTabs("日\tx")).toBe("日  x");
    expect(expandTabs("abcd\tx")).toBe("abcd    x");
  });
  test("truncateStart keeps as much of the end as fits", async () => {
    const { truncateStart } = await import("../../../../src/core/foundation/text/width.ts");
    expect(truncateStart("abcdef", 4)).toBe("…def");
    expect(truncateStart("abcdef", 6)).toBe("abcdef");
    expect(stringWidth(truncateStart("日本語の文", 6))).toBeLessThanOrEqual(6);
    expect(truncateStart("日本語の文", 6)).toBe("…の文");
  });
  test("VS16 makes a text-default symbol wide", async () => {
    const { graphemeWidth } = await import("../../../../src/core/foundation/text/width.ts");
    expect(graphemeWidth("\u{1F02C}️")).toBe(2);
    expect(graphemeWidth("❤️")).toBe(2);
  });
});
