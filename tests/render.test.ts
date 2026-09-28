// Rendering: snapshot the pure layout stage (0.4) and property-test the table allocator (2.3).

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { glyphsFor } from "../src/core/glyphs.ts";
import { layoutToAnsi } from "../src/core/layout/ansi.ts";
import type { Layout } from "../src/core/layout/ir.ts";
import { renderMarkdown } from "../src/core/layout/render.ts";
import { allocate } from "../src/core/layout/table.ts";
import { loadTheme } from "../src/core/theme/index.ts";
import { stringWidth } from "../src/core/width.ts";

// Isolation (testing.md): never read or write the real config, cache or state directories.
const sandbox = mkdtempSync(join(tmpdir(), "slipbox-render-"));
process.env.XDG_STATE_HOME = join(sandbox, "state");
process.env.XDG_CACHE_HOME = join(sandbox, "cache");
process.env.XDG_CONFIG_HOME = join(sandbox, "config");
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));


// The demo vault's notes, by path inside it.
const SAMPLES = join(import.meta.dir, "..", "examples", "vault");
const samples = (readdirSync(SAMPLES, { recursive: true }) as string[]).filter((f) => f.endsWith(".md")).sort();
const unicode = glyphsFor("unicode");
const text = (l: Layout) => l.lines.map((line) => line.spans.map((s) => s.text).join("").replace(/\s+$/, "")).join("\n");

describe("no rendered row ever exceeds the layout width", () => {
  for (const file of samples) {
    test(file, () => {
      const src = readFileSync(join(SAMPLES, file), "utf8");
      for (const width of [24, 37, 60, 80, 101, 140]) {
        for (const glyphs of [unicode, glyphsFor("ascii")]) {
          const layout = renderMarkdown(src, { width, glyphs, showUrls: false });
          for (const [i, line] of layout.lines.entries()) {
            const w = line.spans.reduce((a, s) => a + stringWidth(s.text), 0);
            if (w > width) throw new Error(`${file} @${width}: row ${i} is ${w} wide: ${line.spans.map((s) => s.text).join("")}`);
          }
        }
      }
    });
  }
});

describe("snapshots of the layout IR as text", () => {
  for (const file of samples) {
    test(`${file} @ 80`, () => {
      const src = readFileSync(join(SAMPLES, file), "utf8");
      expect(text(renderMarkdown(src, { width: 80, glyphs: unicode, showUrls: true }))).toMatchSnapshot();
    });
  }
  test("wrap-probe @ 44 (narrow)", () => {
    const src = readFileSync(join(SAMPLES, "scratch", "wrap-probe.md"), "utf8");
    expect(text(renderMarkdown(src, { width: 44, glyphs: unicode, showUrls: false }))).toMatchSnapshot();
  });
});

describe("blocks and inlines (2.2)", () => {
  const r = (md: string, width = 60) => text(renderMarkdown(md, { width, glyphs: unicode, showUrls: false }));
  test("headings, lists, tasks, quotes, rules", () => {
    expect(r("# Title\n\n- a\n  - b\n- [x] done\n- [ ] todo\n\n> quoted\n\n---\n")).toMatchSnapshot();
  });
  test("callouts", () => {
    expect(r("> [!warning] Mind the gap\n> Body text here.\n\n> [!NOTE]\n> Plain note.\n")).toMatchSnapshot();
  });
  test("code blocks are full width, labelled, and hard-wrapped", () => {
    const layout = renderMarkdown("```ts\nconst x = 1; // a comment that is long enough to wrap around\n```\n", { width: 40, glyphs: unicode, showUrls: false });
    expect(layout.lines.every((l) => l.fill === "code_block")).toBe(true);
    expect(text(layout)).toMatchSnapshot();
    const roles = new Set(layout.lines.flatMap((l) => l.spans.map((s) => s.role)));
    expect(roles.has("syn_keyword")).toBe(true);
    expect(roles.has("syn_comment")).toBe(true);
  });
  test("escapes never reach the IR (2.9)", () => {
    const out = r("red \x1b[31mtext\x1b[0m and `\x1b]52;c;aGk=\x07code`");
    expect(out).not.toContain("\x1b");
    expect(out).toContain("red text");
  });
  test("links: statuses become roles; hard breaks and <br> split lines", () => {
    const layout = renderMarkdown("[[a]] [[b]] [[c]] [x](https://e.invalid)<br>next", {
      width: 60,
      glyphs: unicode,
      showUrls: false,
      resolveLink: (_k, t) => (t === "a" ? "resolved" : t === "b" ? "unresolved" : "ambiguous"),
    });
    const roles = layout.lines[0]!.spans.filter((s) => s.link !== undefined).map((s) => s.role);
    expect(roles).toEqual(["wikilink", "link_unresolved", "link_ambiguous", "link"]);
    expect(layout.lines[1]!.spans.map((s) => s.text).join("")).toBe("next");
    expect(layout.links.map((l) => [l.line, l.col])).toEqual([[0, 0], [0, 2], [0, 4], [0, 6]]);
  });
  test("source lines survive wrapping (3.5 anchors on them)", () => {
    const layout = renderMarkdown("# H\n\npara one\nline two\n\nsecond para\n", { width: 6, glyphs: unicode, showUrls: false });
    const srcs = layout.lines.filter((l) => l.spans.length).map((l) => l.src);
    expect(srcs[0]).toBe(1);
    expect(srcs).toContain(4);
    expect(srcs[srcs.length - 1]).toBe(6);
  });
  test("frontmatter renders as properties, with the parse error when broken", () => {
    expect(r("---\ntitle: T\ntags: [a, b]\n---\n\nbody\n")).toMatchSnapshot();
    expect(r("---\ntitle: [unclosed\n---\n\nbody\n")).toContain("title: [unclosed");
  });
  test("a table that cannot fit collapses to records instead of overflowing", () => {
    const md = "| one | two | three | four | five |\n|---|---|---|---|---|\n| a | b | c | d | e |\n";
    const out = r(md, 24);
    expect(out).toMatch(/^one {4}a$/m);
    expect(out).toMatch(/^five {3}e$/m);
  });
});

describe("table allocator (2.3) — properties over generated inputs", () => {
  let seed = 42;
  const rand = (n: number) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
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
      a.widths.forEach((w, i) => {
        expect(w).toBeLessThanOrEqual(desired[i]!);
        expect(w).toBeGreaterThanOrEqual(Math.min(5, desired[i]!));
      });
      const minFits = minimum.reduce((x, y) => x + y, 0) <= width - (n + 1);
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
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  test("same invariants, and never worse than water-filling (height + split words)", async () => {
    const { measure, fit } = await import("../src/core/layout/wrap.ts");
    const { longestWord, naturalWidth } = await import("../src/core/layout/wrap.ts");
    const words = ["a", "to", "the", "window", "configuration", "pipe_table.wrap", "~/workshop/<project>/", "x", "individual", "日本語"];
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

describe("ANSI writer", () => {
  test("plain output has no escapes; colour output resets every line", () => {
    const layout = renderMarkdown("# Hi\n\n**bold** `code`\n", { width: 30, glyphs: unicode, showUrls: false });
    const theme = loadTheme("tokyo-night").theme;
    expect(layoutToAnsi(layout, theme, { depth: "none" })).not.toContain("\x1b");
    const colour = layoutToAnsi(layout, theme, { depth: "truecolor" });
    expect(colour).toContain("\x1b[0;38;2;");
    for (const line of colour.trimEnd().split("\n")) expect(line.endsWith("\x1b[0m")).toBe(true);
    expect(layoutToAnsi(layout, theme, { depth: "256" })).toContain("38;5;");
  });
});
