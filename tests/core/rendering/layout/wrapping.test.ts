import type { Span } from "../../../../src/core/rendering/layout/ir.ts";
import { describe, expect, test } from "bun:test";
import { countLines, measure, wrapGraphemes, wrapSpans } from "../../../../src/core/rendering/layout/wrap.ts";
import { makeRenderSandbox } from "../../../support/render-sandbox.ts";

makeRenderSandbox();

describe("the allocator predicts exactly what is drawn (review cycle 2)", () => {
  test("countLines(measure(x), w) === wrapSpans(x, w).length for random mixed text", () => {
    let seed = 7;
    const rand = (n: number) => {
      // Math.imul: a plain * exceeds 2^53 and loses the low bits, which then take few values.
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
      return (seed >>> 8) % n; // the high bits: an LCG's low ones repeat quickly
    };
    const pieces = [
      "a",
      "word",
      "漢",
      "字",
      "、",
      "。",
      "（",
      "）",
      "「",
      "」",
      "ｱ",
      "ー",
      "…",
      "🎉",
      "👨‍👩‍👧",
      "é",
      " ",
      "  ",
      "/",
      "-",
      ".",
      ",",
      "\n",
      "longidentifier_with.parts/and-more",
    ];
    for (let k = 0; k < 3000; k++) {
      const parts = Array.from({ length: 1 + rand(14) }, () => pieces[rand(pieces.length)]!);
      const cut = rand(parts.length);
      const spans: Span[] = [parts.slice(0, cut).join(""), parts.slice(cut).join("")]
        .filter(Boolean)
        .map((text) => ({ text, role: "text", attrs: 0 }));
      if (!spans.length) continue;
      for (let w = 2; w <= 14; w++) {
        const predicted = countLines(measure(spans), w);
        const drawn = wrapSpans(spans, w).length;
        if (predicted !== drawn)
          throw new Error(`${JSON.stringify(spans.map((x) => x.text))} @${w}: predicted ${predicted}, drawn ${drawn}`);
      }
    }
  });
  test("an ellipsis after a CJK character never starts a row: `…` and `‥` measure 1, yet close (kinsoku)", () => {
    for (const mark of ["…", "‥", "……"]) {
      const spans: Span[] = [{ text: `漢字漢字漢字漢字${mark}`, role: "text", attrs: 0 }];
      for (let w = 4; w <= 18; w++) {
        const rows = wrapSpans(spans, w).map((r) => r.map((x) => x.text).join(""));
        for (const row of rows) expect(row.startsWith(mark[0]!)).toBe(false);
        expect(countLines(measure(spans), w)).toBe(rows.length);
      }
    }
    expect(
      wrapSpans([{ text: "漢字漢字漢字漢字…", role: "text", attrs: 0 }], 16).map((r) => r.map((x) => x.text).join("")),
    ).toEqual(["漢字漢字漢字漢", "字…"]);
  });
});

describe("wrapping ASCII by ranges gives the grapheme wrap's rows, exactly (15.1)", () => {
  test("a long paragraph wraps in linear time: eight times the spans, eight times the spans read (never each row scanning them all)", () => {
    const spans = (n: number): Span[] =>
      Array.from({ length: n }, (_, i) => ({
        text: `lat=54.7425${i % 10} lon=-3.2049 `,
        role: i % 2 ? "text" : "link",
        attrs: 0,
      }));
    // Counted, not timed: how often the wrap reads a span. A clock's ratio swung with a busy runner's pauses — 33 where
    // 8 was linear and 64 quadratic, on CI's macOS (#40) — and a count is the same on every machine.
    const reads = (n: number) => {
      let count = 0;
      const watched = new Proxy(spans(n), {
        get: (target, key, receiver) => {
          if (typeof key === "string" && /^\d+$/.test(key)) count++;
          return Reflect.get(target, key, receiver);
        },
      });
      expect(wrapSpans(watched, 60).length).toBe(n / 2);
      return count;
    };
    // Each span read a few times, whatever their number: a row scanning them all from the first reads hundreds, then
    // thousands.
    const few = reads(1000);
    const many = reads(8000);
    expect([few / 1000, many / 8000].map((r) => r < 5)).toEqual([true, true]);
    expect(many / few).toBeCloseTo(8, 1);
  });
  test("random spans of words, runs of spaces, separators, long words, empty spans, at every width", () => {
    let seed = 11;
    const rand = (n: number) => {
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
      return (seed >>> 8) % n;
    };
    const pieces = [
      "a",
      "word",
      " ",
      "  ",
      "   ",
      "/",
      "-",
      ".",
      ",",
      "?",
      "=",
      "|",
      "_",
      "x/y",
      "a-b-c",
      "longidentifier_with.parts/and-more",
      "https://example.org/a?b=c&d",
      "!",
      "(",
      "~",
      "",
    ];
    const roles = ["text", "strong", "link"] as const;
    let fast = 0;
    for (let k = 0; k < 4000; k++) {
      const spans: Span[] = Array.from({ length: 1 + rand(4) }, () => ({
        text: Array.from({ length: rand(7) }, () => pieces[rand(pieces.length)]!).join(""),
        role: roles[rand(roles.length)]!,
        attrs: rand(3),
      }));
      for (let w = 1; w <= 24; w++) {
        const a = wrapSpans(spans, w);
        const b = wrapGraphemes(spans, w);
        if (JSON.stringify(a) !== JSON.stringify(b))
          throw new Error(
            `${JSON.stringify(spans.map((x) => x.text))} @${w}:\n${JSON.stringify(a)}\n${JSON.stringify(b)}`,
          );
        fast++;
      }
    }
    expect(fast).toBe(4000 * 24);
    // Anything else takes the grapheme path: the same function, so the same rows.
    const mixed: Span[] = [{ text: "naïve 漢字 text", role: "text", attrs: 0 }];
    expect(wrapSpans(mixed, 6)).toEqual(wrapGraphemes(mixed, 6));
  });
});
