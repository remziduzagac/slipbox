import { describe, expect, test } from "bun:test";
import { allocate } from "../../../../../src/core/rendering/layout/markdown/table.ts";
import { makeRenderSandbox } from "../../../../support/render-sandbox.ts";

makeRenderSandbox();

describe("table allocator (2.3) — properties over generated inputs", () => {
  let seed = 42;
  const rand = (n: number) => {
    // Math.imul: a plain * exceeds 2^53 and loses the low bits, which then take few values.
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    return (seed >>> 8) % n; // the high bits: an LCG's low ones repeat quickly
  };
  test("never exceeds the budget; never below a column's minimum when minimums fit", () => {
    for (let run = 0; run < 5000; run++) {
      const n = 1 + rand(8);
      const minimum = Array.from({ length: n }, () => 3 + rand(30));
      const desired = minimum.map((m) => m + rand(80));
      const width = 10 + rand(200);
      const a = allocate(desired, minimum, width);
      if (a.mode === "records") {
        // Only when a grid cannot give every column a useful width (6 content columns).
        const budget = width - (n + 1);
        const minFits = minimum.reduce((x, y) => x + y, 0) <= budget;
        expect(budget < n * 5 || (!minFits && Math.floor(budget / n) - 2 < 6)).toBe(true);
        continue;
      }
      const total = a.widths.reduce((x, y) => x + y, 0) + n + 1;
      expect(total).toBeLessThanOrEqual(width);
      const minFits = minimum.reduce((x, y) => x + y, 0) <= width - (n + 1);
      // The floor of 3 content columns holds wherever it fits beside whole words.
      const floorsFit = minimum.reduce((x, m, i) => x + Math.max(m, Math.min(5, desired[i]!)), 0) <= width - (n + 1);
      a.widths.forEach((w, i) => {
        expect(w).toBeLessThanOrEqual(desired[i]!);
        if (!minFits || floorsFit) expect(w).toBeGreaterThanOrEqual(Math.min(5, desired[i]!));
      });
      if (minFits) {
        expect(a.breaksWords).toBe(false);
        a.widths.forEach((w, i) => expect(w).toBeGreaterThanOrEqual(minimum[i]!));
      }
      if (desired.reduce((x, y) => x + y, 0) <= width - (n + 1)) expect(a.widths).toEqual(desired);
    }
  });
});

describe("table allocator — height minimisation over generated tables", () => {
  let seed = 7;
  const rand = (n: number) => {
    // Math.imul: a plain * exceeds 2^53 and loses the low bits, which then take few values.
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    return (seed >>> 8) % n; // the high bits: an LCG's low ones repeat quickly
  };
  test("same invariants, and never worse than water-filling (height + split words)", async () => {
    const { measure, fit } = await import("../../../../../src/core/rendering/layout/wrap.ts");
    const { longestWord, naturalWidth } = await import("../../../../../src/core/rendering/layout/wrap.ts");
    const words = [
      "a",
      "to",
      "the",
      "window",
      "configuration",
      "pipe_table.wrap",
      "~/workshop/<project>/",
      "x",
      "individual",
      "日本語",
    ];
    for (let run = 0; run < 400; run++) {
      const cols = 1 + rand(5);
      const rows = 1 + rand(8);
      const cells = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => {
          const n = rand(c0(cols));
          const text = Array.from({ length: n }, () => words[rand(words.length)]).join(" ");
          return [{ text, role: "text" as const, attrs: 0 }];
        }),
      );
      const desired = Array.from({ length: cols }, (_, c) => Math.max(...cells.map((r) => naturalWidth(r[c]!)), 1) + 2);
      const minimum = Array.from({ length: cols }, (_, c) => Math.max(...cells.map((r) => longestWord(r[c]!)), 1) + 2);
      const width = 12 + rand(120);
      const m = cells.map((r) => r.map((sp) => measure(sp)));
      const linesAt = (c: number, w: number) => {
        let splits = 0;
        const lines = m.map((r) => {
          const f = fit(r[c]!, w);
          splits += f.splits;
          return f.lines;
        });
        return { lines, splits };
      };
      const smart = allocate(desired, minimum, width, linesAt);
      const plain = allocate(desired, minimum, width);
      expect(smart.mode).toBe(plain.mode);
      if (smart.mode === "records") continue;
      const budget = width - (cols + 1);
      expect(smart.widths.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(budget);
      smart.widths.forEach((w, i) => expect(w).toBeLessThanOrEqual(desired[i]!));
      if (!smart.breaksWords) smart.widths.forEach((w, i) => expect(w).toBeGreaterThanOrEqual(minimum[i]!));
      const cost = (ws: number[]) => {
        let h = 0;
        let s = 0;
        const per = ws.map((w, c) => linesAt(c, Math.max(1, w - 2)));
        for (let r = 0; r < rows; r++) h += Math.max(...per.map((p) => p.lines[r]!));
        for (const p of per) s += p.splits;
        return h + s;
      };
      expect(cost(smart.widths)).toBeLessThanOrEqual(cost(plain.widths));
    }
  });
});

function c0(cols: number): number {
  return cols > 3 ? 6 : 14;
}
