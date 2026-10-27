import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { diffLines, merge3 } from "../../../../../src/core/workspace/git/merge/merge.ts";
import { makeCoreSandbox } from "../../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("diff and three-way merge (5.5)", () => {
  const base = "one\ntwo\nthree\nfour\nfive\n";
  test("diffLines: the smallest set of replaced runs", () => {
    expect(diffLines(["a", "b", "c"], ["a", "x", "c", "d"])).toEqual([
      { aStart: 1, aLen: 1, bStart: 1, bLen: 1 },
      { aStart: 3, aLen: 0, bStart: 3, bLen: 1 },
    ]);
    const big = Array.from({ length: 20000 }, (_, i) => `line ${i}`);
    const changed = [...big];
    changed[100] = "x";
    changed.splice(19000, 1);
    const t = performance.now();
    expect(diffLines(big, changed).length).toBe(2);
    expect(performance.now() - t).toBeLessThan(200);
  });
  test("merge3: one side's changes taken, the same change once, overlapping ones marked", () => {
    expect(merge3(base, "ONE\ntwo\nthree\nfour\nfive\n", "one\ntwo\nthree\nfour\nFIVE\n")).toEqual({
      text: "ONE\ntwo\nthree\nfour\nFIVE\n",
      conflicts: 0,
    });
    expect(merge3(base, "one\ntwo\nadded\nthree\nfour\nfive\n", "one\ntwo\nthree\nfour\nfive\nend\n").text).toBe(
      "one\ntwo\nadded\nthree\nfour\nfive\nend\n",
    );
    expect(merge3(base, "one\nsame\nthree\nfour\nfive\n", "one\nsame\nthree\nfour\nfive\n").conflicts).toBe(0);
    expect(merge3(base, "one\nTWO\nthree\nfour\nfive\n", "one\ntwo-t\nthree\nfour\nfive\n")).toEqual({
      text: "one\n<<<<<<< yours\nTWO\n=======\ntwo-t\n>>>>>>> theirs\nthree\nfour\nfive\n",
      conflicts: 1,
    });
    // Both inserting at the same place differently: a conflict too.
    expect(merge3(base, "one\ntwo\nA\nthree\nfour\nfive\n", "one\ntwo\nB\nthree\nfour\nfive\n").conflicts).toBe(1);
  });

  /** A seeded generator: the same inputs every run. */
  const seeded = (seed: number) => () => {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    return seed / 0x80000000;
  };
  /** The hunks applied to `a`: `b`, when they're right. Each hunk in order, with an unchanged line before the next. */
  const applied = (a: string[], b: string[], hunks: ReturnType<typeof diffLines>) => {
    const out: string[] = [];
    let i = 0;
    for (const h of hunks) {
      expect(h.aLen + h.bLen).toBeGreaterThan(0);
      expect(h.aStart > i || (h.aStart === i && i === 0 && out.length === 0)).toBe(true);
      expect(h.bStart - out.length).toBe(h.aStart - i);
      out.push(...a.slice(i, h.aStart), ...b.slice(h.bStart, h.bStart + h.bLen));
      i = h.aStart + h.aLen;
    }
    return [...out, ...a.slice(i)];
  };
  /** The longest common subsequence's length, the slow way. */
  const lcs = (a: string[], b: string[]) => {
    let prev = new Int32Array(b.length + 1);
    for (const x of a) {
      const cur = new Int32Array(b.length + 1);
      for (let j = 1; j <= b.length; j++) cur[j] = x === b[j - 1] ? prev[j - 1]! + 1 : Math.max(prev[j]!, cur[j - 1]!);
      prev = cur;
    }
    return prev[b.length]!;
  };
  const edits = (hunks: ReturnType<typeof diffLines>) => hunks.reduce((n, h) => n + h.aLen + h.bLen, 0);

  test("diffLines on random pairs: the hunks turn one into the other, with as few lines removed and added as can be", () => {
    const rnd = seeded(20261017);
    const pick = (n: number, alphabet: number) =>
      Array.from({ length: n }, () => `line ${Math.floor(rnd() * alphabet)}`);
    // Small: few kinds of line, so many shortest diffs to choose from.
    for (let t = 0; t < 3000; t++) {
      const k = 1 + Math.floor(rnd() * 5);
      const a = pick(Math.floor(rnd() * 20), k);
      const b = pick(Math.floor(rnd() * 20), k);
      const h = diffLines(a, b);
      expect(applied(a, b, h)).toEqual(b);
      expect(edits(h)).toBe(a.length + b.length - 2 * lcs(a, b));
    }
    // A few hundred lines, and edits below the search's cost: still the fewest.
    for (let t = 0; t < 40; t++) {
      const a = pick(100 + Math.floor(rnd() * 300), 2 + Math.floor(rnd() * 40));
      const b = a.flatMap((l) => (rnd() < 0.1 ? [] : rnd() < 0.1 ? [l, `new ${rnd()}`] : rnd() < 0.05 ? ["x"] : [l]));
      const h = diffLines(a, b);
      expect(applied(a, b, h)).toEqual(b);
      expect(edits(h)).toBe(a.length + b.length - 2 * lcs(a, b));
    }
    // Past the search's cost (thousands of lines of a few kinds, rewritten): coarser, but right.
    for (const [n, k] of [
      [3000, 3],
      [6000, 20],
    ] as const) {
      const a = pick(n, k);
      const b = pick(n, k);
      const h = diffLines(a, b);
      expect(applied(a, b, h)).toEqual(b);
      expect(edits(h)).toBeLessThan(2 * n);
    }
  });

  test("diffLines: a 10,000-line rewrite in bounded time and memory", () => {
    // Every line different; then a reformat, every line changed but its blank lines and braces, which still match.
    const n = 10_000;
    const a = Array.from({ length: n }, (_, i) => `line ${i} as it was`);
    const b = Array.from({ length: n }, (_, i) => `line ${i} as it is now`);
    const braces = ["{", "}", "", "  return;"];
    const c = Array.from({ length: n }, (_, i) => (i % 3 ? `code ${i}` : braces[(i * 7) % 4]!));
    const d = Array.from({ length: n }, (_, i) => (i % 4 ? `rewritten ${i}` : braces[(i * 5) % 4]!));
    Bun.gc(true);
    const rss = process.memoryUsage().rss;
    const t = performance.now();
    expect(diffLines(a, b)).toEqual([{ aStart: 0, aLen: n, bStart: 0, bLen: n }]);
    const h = diffLines(c, d);
    const ms = performance.now() - t;
    const grew = process.memoryUsage().rss - rss;
    expect(applied(c, d, h)).toEqual(d);
    expect(ms).toBeLessThan(1000);
    expect(grew).toBeLessThan(256 * 1024 * 1024);
  });
});

describe("review cycle 1 (core)", () => {
  test("merge conflict markers in a CRLF note are CRLF", () => {
    const r = merge3("a\r\nb\r\n", "A\r\nb\r\n", "Z\r\nb\r\n");
    expect(r.conflicts).toBe(1);
    expect(r.text.replace(/\r\n/g, "")).not.toContain("\n");
  });
});
