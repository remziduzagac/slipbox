// Rendering: snapshot the pure layout stage (0.4) and property-test the table allocator (2.3).

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { glyphsFor } from "../src/core/glyphs.ts";
import { layoutToAnsi } from "../src/core/layout/ansi.ts";
import type { Layout } from "../src/core/layout/ir.ts";
import { renderMarkdown, renderTree } from "../src/core/layout/render.ts";
import { dataLinks, parseData } from "../src/core/data.ts";
import { classify } from "../src/core/filetypes.ts";
import { parseNoteFile } from "../src/core/readers.ts";
import { findHeading, headingFragment } from "../src/core/landing.ts";
import { headingsOf, parseMarkdown } from "../src/core/parse.ts";
import { allocate } from "../src/core/layout/table.ts";
import { countLines, measure, wrapGraphemes, wrapSpans } from "../src/core/layout/wrap.ts";
import type { Span } from "../src/core/layout/ir.ts";
import { blend, listThemes, loadTheme } from "../src/core/theme/index.ts";
import { layoutWidth } from "../src/core/note.ts";
import { stringWidth } from "../src/core/width.ts";

// Isolation (testing.md): never read or write the real config, cache or state directories.
const sandbox = mkdtempSync(join(tmpdir(), "slipbox-render-"));
process.env.XDG_STATE_HOME = join(sandbox, "state");
process.env.XDG_CACHE_HOME = join(sandbox, "cache");
process.env.XDG_CONFIG_HOME = join(sandbox, "config");
process.env.XDG_DATA_HOME = join(sandbox, "data"); // the home vault (17.2)
delete process.env.SLIPBOX_CONFIG; // it would win over XDG_CONFIG_HOME: never the developer's own config
process.env.SLIPBOX_CLIPBOARD = "file"; // copies never reach the developer's clipboard
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
          // The renderer cuts any row to the width as a last defence; a cut is a block's bug and
          // lost text, so none may happen (the width check alone could never fail).
          if (layout.clipped) throw new Error(`${file} @${width}: ${layout.clipped} row(s) had to be clipped`);
          for (const [i, line] of layout.lines.entries()) {
            const w = line.spans.reduce((a, s) => a + stringWidth(s.text), 0);
            if (w > width) throw new Error(`${file} @${width}: row ${i} is ${w} wide: ${line.spans.map((s) => s.text).join("")}`);
          }
        }
      }
    });
  }
});

// The reference set's notes too (examples/home): realistic and hostile, every block at its edges.
// Fewer widths than the demo's — the set is large; the narrow ones are where blocks break.
describe("no rendered row ever exceeds the layout width: the reference set", () => {
  const HOME = join(import.meta.dir, "..", "examples", "home");
  const notes = (readdirSync(HOME, { recursive: true }) as string[]).filter((f) => f.endsWith(".md")).sort();
  test("its notes are there", () => expect(notes.length).toBeGreaterThan(150));
  for (const file of notes) {
    test(file, () => {
      const src = readFileSync(join(HOME, file), "utf8");
      for (const [width, glyphs] of [[24, unicode], [37, glyphsFor("ascii")], [80, unicode], [140, unicode]] as const) {
        const layout = renderMarkdown(src, { width, glyphs, showUrls: false });
        if (layout.clipped) throw new Error(`${file} @${width}: ${layout.clipped} row(s) had to be clipped`);
        for (const [i, line] of layout.lines.entries()) {
          const w = line.spans.reduce((a, s) => a + stringWidth(s.text), 0);
          if (w > width) throw new Error(`${file} @${width}: row ${i} is ${w} wide: ${line.spans.map((s) => s.text).join("")}`);
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
  // The samples beyond markdown, each read by its own reader (16.11–16.13, 16.16, 16.17).
  const others = (readdirSync(SAMPLES, { recursive: true }) as string[]).filter((f) => /\.(toml|ya?ml|json|csv|tsv|ini|cfg|properties|env)$/.test(f) && !/broken|photometry/.test(f) && !f.split("/").includes(".slipbox")).sort(); // a vault's marker, nested ones too
  test("the samples beyond markdown are there", () => {
    expect(others.length).toBeGreaterThanOrEqual(6);
  });
  for (const file of others) {
    test(`${file} @ 80`, () => {
      const src = readFileSync(join(SAMPLES, file), "utf8");
      const kind = classify(file, ["md"]);
      const parsed = kind.group === "data" ? parseData(kind.format, src) : { ...parseNoteFile(file, src), error: null };
      expect(parsed.error).toBeNull();
      expect(text(renderTree(parsed.tree, { width: 80, glyphs: unicode, showUrls: true }))).toMatchSnapshot();
    });
  }
  test("a big CSV: its first 2,000 rows as a table, the rest counted (logs/photometry-2026.csv)", () => {
    const src = readFileSync(join(SAMPLES, "logs", "photometry-2026.csv"), "utf8");
    const parsed = parseData("csv", src);
    expect(parsed.error).toBeNull();
    const t = parsed.tree.children[0] as unknown as { type: string; children: { position: { start: { line: number } } }[] };
    expect(t.type).toBe("table");
    expect(t.children.length).toBe(2001); // the header and 2,000 rows
    expect(t.children[2000]!.position.start.line).toBe(2001);
    const out = text(renderTree(parsed.tree, { width: 120, glyphs: unicode, showUrls: false }));
    expect(out).toContain("… 600 more rows");
    const cells = (t.children as unknown as { children: { children: { value?: string }[] }[] }[]).flatMap((r) => r.children.map((c) => c.children[0]?.value ?? ""));
    expect(cells).toContain('"comparison star C3, not C2"'); // doubled quotes read as one
  });
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
    // A label wider than the row is cut with …: nothing left for the last defence to clip.
    const long = renderMarkdown("```a-very-long-language-name-that-is-wider-than-the-row\nx\n```\n", { width: 24, glyphs: unicode, showUrls: false });
    expect(long.clipped ?? 0).toBe(0);
    expect(long.lines[0]!.spans.map((s) => s.text).join("")).toBe("a-very-long-language-n… ");
  });
  test("escapes never reach the IR (2.9)", () => {
    const out = r("red \x1b[31mtext\x1b[0m and `\x1b]52;c;aGk=\x07code`");
    expect(out).not.toContain("\x1b");
    expect(out).toContain("red text");
  });
  test("links: statuses become roles; hard breaks and <br> split lines", () => {
    const layout = renderMarkdown("[a](a.md) [b](b.md) [[c]] [x](https://e.invalid)<br>next", {
      width: 60,
      glyphs: unicode,
      showUrls: false,
      resolveLink: (_k, t) => (t === "a.md" ? "resolved" : "unresolved"),
    });
    const roles = layout.lines[0]!.spans.filter((s) => s.link !== undefined).map((s) => s.role);
    expect(roles).toEqual(["link", "link_unresolved", "link_unresolved", "link"]); // [[c]] a link again (21.3)
    expect(layout.lines[0]!.spans.map((s) => s.text).join("")).toBe("a b c x");
    expect(layout.lines[1]!.spans.map((s) => s.text).join("")).toBe("next");
    expect(layout.links.map((l) => [l.line, l.col])).toEqual([[0, 0], [0, 2], [0, 4], [0, 6]]);
  });
  test("a picture embedded by name: its name shown, an image's glyph; `|300`, `|240x180` its size, other words its alt", () => {
    const shown = (md: string) => {
      const l = renderMarkdown(md, { width: 60, glyphs: unicode, showUrls: false, resolveLink: () => "resolved" });
      return l.lines[0]!.spans.filter((s) => s.link !== undefined).map((s) => [s.text, s.role]);
    };
    const img = unicode.image;
    expect(shown("a ![[attachments/dal.png|300]] b")).toEqual([[`${img} dal.png`, "image"]]);
    expect(shown("a ![[flip.JPG|240x180]] b")).toEqual([[`${img} flip.JPG`, "image"]]);
    expect(shown("a ![[dal.png|the finished dal]] b")).toEqual([[`${img} the finished dal`, "image"]]);
    expect(shown("a ![[dal.png|dal for 4]] b")).toEqual([[`${img} dal for 4`, "image"]]);
    // Not a picture: a note's or a file's embed, its `|…` its words still.
    expect(shown("a ![[Dal|300]] ![[pantry.csv]] b")).toEqual([[`${unicode.embed} 300`, "embed"], [`${unicode.embed} pantry.csv`, "embed"]]);
  });
  test("source lines survive wrapping (3.5 anchors on them)", () => {
    const layout = renderMarkdown("# H\n\npara one\nline two\n\nsecond para\n", { width: 6, glyphs: unicode, showUrls: false });
    const srcs = layout.lines.filter((l) => l.spans.length).map((l) => l.src);
    expect(srcs[0]).toBe(1);
    expect(srcs).toContain(4);
    expect(srcs[srcs.length - 1]).toBe(6);
  });
  test("an unterminated escape in a code block keeps the block's lines and their source lines", () => {
    const layout = renderMarkdown("para\n\n```\nline one \x1b]0;title\nline two\nline three\n```\n\nafter\n", { width: 40, glyphs: unicode, showUrls: false });
    const rows = layout.lines.map((l) => [l.src, l.spans.map((s) => s.text).join("").trim()] as const);
    expect(rows.filter(([, t]) => t.startsWith("line"))).toEqual([[4, "line one"], [5, "line two"], [6, "line three"]]);
    expect(rows.at(-1)).toEqual([9, "after"]);
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

describe("ANSI writer: colours the terminal can't show as given", () => {
  /** The SGR codes the writer gives a span of the text role, coloured `color`, at `depth`. */
  const codes = async (color: unknown, depth: "16" | "256" | "truecolor") => {
    const { lineToAnsi } = await import("../src/core/layout/ansi.ts");
    const { applyColorOverrides } = await import("../src/core/theme/index.ts");
    const { theme, warnings } = applyColorOverrides(loadTheme("tokyo-night").theme, { text: color });
    expect(warnings).toEqual([]);
    const out = lineToAnsi({ spans: [{ text: "x", role: "text", attrs: 0 }], src: 1 }, 1, theme, { depth });
    return /^\x1b\[0;([\d;]+)mx\x1b\[0m$/.exec(out)?.[1];
  };

  test("a palette number past 15 on a 16-colour terminal: the nearest of the 16, cube and greys alike", async () => {
    expect(await codes(196, "16")).toBe("91"); // #ff0000: bright red
    expect(await codes(21, "16")).toBe("94"); // #0000ff: bright blue
    expect(await codes(28, "16")).toBe("32"); // #008700: green
    expect(await codes(244, "16")).toBe("37"); // #808080: white, not bright
    expect(await codes(250, "16")).toBe("97"); // #bcbcbc: bright white
    expect(await codes(249, "16")).toBe("97"); // #b2b2b2: just bright
    expect(await codes(124, "16")).toBe("91"); // #af0000: just bright red
    expect(await codes(232, "16")).toBe("30"); // #080808: black
    expect(await codes({ fg: 4, bg: 196 }, "16")).toBe("34;101"); // the background's too
    expect(await codes(12, "16")).toBe("94"); // the 16 themselves as they are
    expect(await codes(196, "256")).toBe("38;5;196"); // as it is where the palette is there
  });

  test("a hex colour on a 256-colour terminal: the nearest of the cube or the greys; on 16, the nearest of those", async () => {
    expect(await codes("#ff0000", "256")).toBe("38;5;196");
    expect(await codes("#808080", "256")).toBe("38;5;244"); // a grey: the grey ramp, not the cube
    expect(await codes("#5f87af", "256")).toBe("38;5;67"); // on the cube exactly
    expect(await codes("#ff0000", "16")).toBe("91");
    expect(await codes("#303030", "16")).toBe("30"); // near black
    expect(await codes("#404040", "16")).toBe("90"); // a dark grey: bright black
    expect(await codes("#ff0000", "truecolor")).toBe("38;2;255;0;0");
  });
});

describe("rows back to their source (the layout IR)", () => {
  test("what's at a column comes from its span's own line, else the row's; where a line's text starts", async () => {
    const { posOfSrc, srcAt } = await import("../src/core/layout/ir.ts");
    const l = renderMarkdown("# T\n\none\ntwo\nthree\n\n- a\n", { width: 40, glyphs: unicode, showUrls: false });
    const para = l.lines.find((x) => x.spans.some((s) => s.text === "two"))!;
    expect([0, 3, 4, 7, 8, 12].map((c) => srcAt(para, c))).toEqual([3, 4, 4, 5, 5, 5]); // one two three, one row of three lines
    expect(srcAt(para, 100)).toBe(3); // past the text: the row's
    const item = l.lines.find((x) => x.spans.some((s) => s.text === "a"))!;
    expect(srcAt(item, 0)).toBe(7); // the bullet has no line of its own: the row's
    expect(posOfSrc(l.lines, 4)).toEqual({ row: l.lines.indexOf(para), col: 4 });
    expect(posOfSrc(l.lines, 7)).toEqual({ row: l.lines.indexOf(item), col: 2 }); // its text, after the bullet
    expect(posOfSrc(l.lines, 2)).toBeNull(); // a blank line has no text
    expect(posOfSrc(l.lines, 99)).toBeNull();
  });
});

describe("highlighting: languages and the cache's bounds (15.1)", () => {
  test("a language known or not; a block highlighted again once thousands of others have pushed it out", async () => {
    const { hasLanguage, highlight } = await import("../src/core/layout/highlight.ts");
    expect(hasLanguage("ts")).toBe(true);
    expect(hasLanguage("python")).toBe(true);
    expect(hasLanguage("no-such-language")).toBe(false);
    const first = highlight("let first = 0;", "ts")!;
    expect(highlight("let first = 0;", "ts")).toBe(first); // cached
    let last: ReturnType<typeof highlight> = null;
    for (let i = 0; i < 8000; i++) last = highlight(`let v${i} = ${i};`, "ts");
    const again = highlight("let first = 0;", "ts")!;
    expect(again).not.toBe(first); // the oldest went first
    expect(again).toEqual(first); // the same colours, worked out again
    expect(highlight("let v7999 = 7999;", "ts")).toBe(last); // the newest stayed
  });
});

describe("the allocator predicts exactly what is drawn (review cycle 2)", () => {
  test("countLines(measure(x), w) === wrapSpans(x, w).length for random mixed text", () => {
    let seed = 7;
    const rand = (n: number) => {
      // Math.imul: a plain * exceeds 2^53 and loses the low bits, which then take few values.
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
      return (seed >>> 8) % n; // the high bits: an LCG's low ones repeat quickly
    };
    const pieces = ["a", "word", "漢", "字", "、", "。", "（", "）", "「", "」", "ｱ", "ー", "…", "🎉", "👨‍👩‍👧", "é", " ", "  ", "/", "-", ".", ",", "\n", "longidentifier_with.parts/and-more"];
    for (let k = 0; k < 3000; k++) {
      const parts = Array.from({ length: 1 + rand(14) }, () => pieces[rand(pieces.length)]!);
      const cut = rand(parts.length);
      const spans: Span[] = [parts.slice(0, cut).join(""), parts.slice(cut).join("")].filter(Boolean).map((text) => ({ text, role: "text", attrs: 0 }));
      if (!spans.length) continue;
      for (let w = 2; w <= 14; w++) {
        const predicted = countLines(measure(spans), w);
        const drawn = wrapSpans(spans, w).length;
        if (predicted !== drawn) throw new Error(`${JSON.stringify(spans.map((x) => x.text))} @${w}: predicted ${predicted}, drawn ${drawn}`);
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
    expect(wrapSpans([{ text: "漢字漢字漢字漢字…", role: "text", attrs: 0 }], 16).map((r) => r.map((x) => x.text).join(""))).toEqual(["漢字漢字漢字漢", "字…"]);
  });
});

describe("wrapping ASCII by ranges gives the grapheme wrap's rows, exactly (15.1)", () => {
  test("a long paragraph wraps in linear time: twice the spans, about twice the time (never each row scanning them all)", () => {
    const spans = (n: number): Span[] => Array.from({ length: n }, (_, i) => ({ text: `lat=54.7425${i % 10} lon=-3.2049 `, role: i % 2 ? "text" : "link", attrs: 0 }));
    const time = (n: number) => {
      const s = spans(n);
      const t = performance.now();
      wrapSpans(s, 60);
      return performance.now() - t;
    };
    time(4000); // warmed up
    const once = Math.min(time(20_000), time(20_000));
    const twice = Math.min(time(40_000), time(40_000));
    expect(twice / once).toBeLessThan(3); // quadratic would be about 4
  });
  test("random spans of words, runs of spaces, separators, long words, empty spans, at every width", () => {
    let seed = 11;
    const rand = (n: number) => {
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
      return (seed >>> 8) % n;
    };
    const pieces = ["a", "word", " ", "  ", "   ", "/", "-", ".", ",", "?", "=", "|", "_", "x/y", "a-b-c", "longidentifier_with.parts/and-more", "https://example.org/a?b=c&d", "!", "(", "~", ""];
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
        if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(spans.map((x) => x.text))} @${w}:\n${JSON.stringify(a)}\n${JSON.stringify(b)}`);
        fast++;
      }
    }
    expect(fast).toBe(4000 * 24);
    // Anything else takes the grapheme path: the same function, so the same rows.
    const mixed: Span[] = [{ text: "naïve 漢字 text", role: "text", attrs: 0 }];
    expect(wrapSpans(mixed, 6)).toEqual(wrapGraphemes(mixed, 6));
  });
});

describe("deep nesting at the narrowest widths loses nothing (review cycle 2)", () => {
  const fixtures = [
    "> - a\n>   - b\n>\n>     | name | value |\n>     |---|---|\n>     | alpha | 1 |\n",
    "1. one\n   1. two\n      1. three\n\n         ```\n         code here\n         ```\n",
    "- - - - - 漢字\n",
    "> > > > quoted deeply with words\n",
    "text[^n]\n\n[^n]: - - a footnote in a list\n",
  ];
  for (const md of fixtures) {
    test(JSON.stringify(md.slice(0, 24)), () => {
      for (let width = 10; width <= 16; width++) {
        for (const glyphs of [glyphsFor("unicode"), glyphsFor("ascii")]) {
          const l = renderMarkdown(md, { width, glyphs, showUrls: false });
          expect(l.clipped).toBe(0);
          const shown = l.lines.map((x) => x.spans.map((sp) => sp.text).join("")).join("").replace(/[\s↪…]/g, "");
          // A word may wrap across rows (a record's value, a code line), with borders between the
          // pieces: every one of its letters must still be there, in order.
          const inOrder = (word: string) => {
            let at = 0;
            for (const ch of word) {
              at = shown.indexOf(ch, at);
              if (at < 0) return false;
              at++;
            }
            return true;
          };
          for (const word of ["alpha", "code", "here", "漢字", "deeply", "footnote"].filter((w) => md.includes(w))) {
            expect(inOrder(word)).toBe(true);
          }
        }
      }
    });
  }
});

describe("review cycle 2 (rendering)", () => {
  const lay = (md: string, width = 60, showUrls = false) => renderMarkdown(md, { width, glyphs: glyphsFor("unicode"), showUrls });
  const rows = (l: Layout) => l.lines.map((x) => x.spans.map((s) => s.text).join("").trimEnd());
  test("every link drawn is placed: in a record's header, and a badge's outer link", () => {
    const records = lay("| [[Alpha]] | [b](http://b) | c |\n|---|---|---|\n| 1 | 2 | 3 |\n", 12);
    expect(records.links.every((l) => l.line >= 0)).toBe(true);
    const badge = lay("[![build](b.svg)](https://ci.example.org)\n");
    const ci = badge.links.find((l) => l.target === "https://ci.example.org")!;
    expect(ci.line).toBe(0);
    expect(badge.links.some((l) => l.target === "b.svg")).toBe(false); // the image is the link's text
  });
  test("soft breaks join Han and kana, never Hangul words or emoji", () => {
    expect(rows(lay("漢字\nかな"))[0]).toBe("漢字かな");
    expect(rows(lay("한국어\n문장"))[0]).toBe("한국어 문장");
    expect(rows(lay("Shipped 🎉\n🚀 next"))[0]).toBe("Shipped 🎉 🚀 next");
  });
  test("with URLs shown, a URL the text already is isn't repeated", () => {
    expect(rows(lay("visit www.example.com\n", 60, true))[0]).toBe("visit www.example.com");
    expect(rows(lay("[](https://empty.example.org)\n", 60, true))[0]).toBe("https://empty.example.org");
    expect(rows(lay("[docs](https://docs.example.org)\n", 60, true))[0]).toContain("<https://docs.example.org>");
  });
  test("the mono theme (NO_COLOR) marks links and code, and link statuses differ", () => {
    const mono = loadTheme("mono").theme;
    for (const r of ["link", "wikilink", "link_unresolved", "code_inline", "footnote", "image"] as const) {
      const st = mono.roles[r];
      expect(!!(st.bold || st.italic || st.underline || st.dim)).toBe(true);
    }
    expect(JSON.stringify(mono.roles.link_unresolved)).not.toBe(JSON.stringify(mono.roles.wikilink));
  });
});

describe("review cycle 4 (markdown against the specs)", () => {
  const lay = (md: string, width = 60) => renderMarkdown(md, { width, glyphs: glyphsFor("unicode"), showUrls: false });
  const rows = (l: Layout) => l.lines.map((x) => x.spans.map((s) => s.text).join("").trimEnd());
  test("a heading's text and slug are the outline's: no footnote marks or image glyphs; repeats share a slug", () => {
    const l = lay("# Title[^1]\n\n# ![logo](l.png) Project\n\n# A\n\n# A\n\n[^1]: n\n");
    expect(l.headings.map((h) => [h.text, h.slug])).toEqual([["Title", "title"], ["Project", "project"], ["A", "a"], ["A", "a"]]);
  });
  test("footnote definitions are marked by identifier, with their paragraphs apart", () => {
    const l = lay("See[^Note].\n\n[^Note]: First.\n\n    Second.\n");
    expect(l.lines.find((x) => x.footnoteDef !== undefined)?.footnoteDef).toBe("note");
    const r = rows(l);
    expect(r[r.findIndex((x) => x.includes("First.")) + 1]).toBe("");
  });
  test("no-break spaces don't break; text between comments stays; the first definition wins", () => {
    expect(rows(lay("aaaa bbbb 10\u00a0km cccc\n", 12))).toEqual(["aaaa bbbb", "10\u00a0km cccc"]);
    expect(rows(lay("<!-- a --> middle <!-- b -->\n")).join("")).toContain("middle");
    expect(lay("[foo]\n\n[foo]: /first\n[foo]: /second\n").links[0]!.target).toBe("/first");
  });
  test("numbered tasks keep their numbers; indented code reports its own lines", () => {
    expect(rows(lay("1. [ ] a\n2. [x] b\n"))[0]).toMatch(/^1\. /);
    const code = lay("text\n\n    code1\n    code2\n");
    const c1 = code.lines.find((x) => x.spans.map((s) => s.text).join("").includes("code1"))!;
    expect(c1.src).toBe(3);
  });
});

describe("review cycle 5 (render, from mutation testing)", () => {
  test("an escape before a tab in a code block doesn't move the tab stop", () => {
    const rows = (code: string) => renderMarkdown(`\`\`\`\n${code}\n\`\`\`\n`, { width: 60, glyphs: glyphsFor("unicode"), showUrls: false }).lines.map((l) => l.spans.map((s) => s.text).join(""));
    expect(rows("ab\x1b[31mcd\x1b[0mef\tgh")).toEqual(rows("abcdef\tgh"));
  });
});

describe("review cycle 5 (render: what the snapshots can't see)", () => {
  test("each callout kind takes its own role; GitHub's capitals too; TOML frontmatter is a properties block", () => {
    const roleOf = (kind: string) => {
      const l = renderMarkdown(`> [!${kind}] T\n> body\n`, { width: 60, glyphs: glyphsFor("unicode"), showUrls: false });
      return l.lines[0]!.spans.find((s) => s.role.startsWith("callout_"))?.role;
    };
    expect(roleOf("note")).toBe("callout_note");
    expect(roleOf("tip")).toBe("callout_tip");
    expect(roleOf("IMPORTANT")).toBe("callout_important");
    expect(roleOf("warning")).toBe("callout_warning");
    expect(roleOf("caution")).toBe("callout_caution");
    expect(roleOf("bug")).toBe("callout_caution");
    // Lookalikes stay quotes: unclosed, a space after the !, no !, and an escaped bracket — the
    // author wanted the brackets — in a quote inside a list too (the escape is only in the source).
    for (const src of ["> [!note text\n", "> [! note] t\n", "> [note]\n", "> \\[!note] t\n", "- > \\[!tip] t\n"]) {
      const l = renderMarkdown(src, { width: 60, glyphs: glyphsFor("unicode"), showUrls: false });
      expect(l.lines.flatMap((x) => x.spans.map((sp) => sp.role)).some((r) => r.startsWith("callout_"))).toBe(false);
      expect(l.lines.map((x) => x.spans.map((sp) => sp.text).join("")).join("\n")).toContain("[");
    }
    const fm = renderMarkdown('+++\ntitle = "T"\ntags = ["a"]\n+++\n\nx\n', { width: 60, glyphs: glyphsFor("unicode"), showUrls: false });
    const rows = fm.lines.map((l) => l.spans.map((s) => s.text).join(""));
    expect(rows[0]).toContain("properties");
    expect(rows.some((r) => /title\s+T/.test(r))).toBe(true);
    expect(rows.some((r) => r.includes("+++"))).toBe(false);
  });
});

describe("the render cache (15.1)", () => {
  test("rendering with the last render's blocks gives exactly a fresh render, edit after edit", async () => {
    const { newParseCache, parseMarkdown } = await import("../src/core/parse.ts");
    const { newRenderCache, renderTree } = await import("../src/core/layout/render.ts");
    let seed = 3;
    const rand = (n: number) => {
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
      return (seed >>> 8) % n;
    };
    const blocksPool = ["# Heading", "## Sub [[link]]", "Some text with [ref] and [^fn] and **bold**.", "- [ ] task\n- [x] done\n  - nested", "```ts\nconst x = 1;\n```", "| a | b |\n| - | - |\n| 1 | 2 |", "> quote with [[other]]", "[ref]: https://example.invalid", "[^fn]: A footnote.", "1. one\n2. two", "<!-- comment -->", "---"];
    const pcache = newParseCache();
    const rcache = newRenderCache();
    let blocks = Array.from({ length: 60 }, () => blocksPool[rand(blocksPool.length)]!);
    for (let step = 0; step < 120; step++) {
      const at = rand(blocks.length);
      const r = rand(3);
      if (r === 0) blocks.splice(at, 0, blocksPool[rand(blocksPool.length)]!);
      else if (r === 1 && blocks.length > 2) blocks.splice(at, 1);
      else blocks[at] = `${blocks[at]} more`;
      const text = `${blocks.join("\n\n")}\n`;
      // Options change now and then (each change drops the cache), not at every step (then nothing is reused).
      const opts = { width: [40, 80][Math.floor(step / 20) % 2]!, glyphs: glyphsFor("unicode"), showUrls: Math.floor(step / 30) % 2 === 1 };
      const p = parseMarkdown(text, pcache);
      const cached = renderTree(p.tree, opts, p.frontmatter, rcache);
      const fresh = renderTree(parseMarkdown(text, undefined, { whole: true }).tree, opts, p.frontmatter);
      expect(JSON.stringify(cached)).toBe(JSON.stringify(fresh));
    }
  });
});

describe("narrow panes: embeds, callouts and data trees cut nothing (review cycle 1, 21.x)", () => {
  const unicodeG = glyphsFor("unicode");
  const fits = (l: Layout, what: string) => {
    if (l.clipped) throw new Error(`${what} @${l.width}: ${l.clipped} row(s) had to be clipped`);
    for (const [i, line] of l.lines.entries()) {
      const w = line.spans.reduce((a, s) => a + stringWidth(s.text), 0);
      if (w > l.width) throw new Error(`${what} @${l.width}: row ${i} is ${w} wide`);
    }
  };
  test("an embed of a note with a table and a list, nested or not, at widths 6 to 24", () => {
    const inner = parseNoteFile("inner.md", "| name | value |\n|---|---|\n| alpha | 1 |\n\n- one\n  - two words here\n").tree.children;
    const embed = () => ({ path: "/v/inner.md", title: "inner", nodes: inner });
    for (const md of ["![[inner]]\n", "- a\n  - ![[inner]]\n", "> > > ![[inner]]\n"]) {
      for (let width = 6; width <= 24; width++) {
        for (const glyphs of [unicodeG, glyphsFor("ascii")]) fits(renderMarkdown(md, { width, glyphs, showUrls: false, embed }), JSON.stringify(md));
      }
    }
  });
  test("a callout too narrow for its bar keeps its text's room, as a quote does", () => {
    const l = renderMarkdown("> [!warning] Warning\n> > [!note] Inner\n> > > [!tip] Deep words here\n", { width: 8, glyphs: unicodeG, showUrls: false });
    fits(l, "callouts");
    const shown = l.lines.map((x) => x.spans.map((s) => s.text).join("").trim());
    expect(shown.some((r) => r.includes("Warning"))).toBe(true); // not wrapped two columns wide
    expect(shown.some((r) => r.includes("words"))).toBe(true);
  });
  test("a deep data tree with records, and the reference set's data files, at 8 to 37", () => {
    const deep = parseData("yaml", "a:\n  b:\n    c:\n      d:\n        e:\n          f:\n            long_key_name: a value of several words\n            records:\n              - name: alpha\n                value: 1\n              - name: beta\n                value: 2\n            # a comment\n            k: v\n");
    expect(deep.error).toBeNull();
    const HOME = join(import.meta.dir, "..", "examples", "home");
    // The trees and key-value files under 64 KB (a CSV is one table, the big ones slow to sweep).
    const files = (readdirSync(HOME, { recursive: true }) as string[])
      .filter((f) => !f.split("/").includes(".slipbox") && classify(f, ["md"]).group === "data" && !/\.(csv|tsv)$/.test(f) && statSync(join(HOME, f)).size < 65_536)
      .sort();
    expect(files.length).toBeGreaterThan(20);
    const trees = [["deep.yaml", deep.tree] as const, ...files.flatMap((f) => {
      const p = parseData(classify(f, ["md"]).format, readFileSync(join(HOME, f), "utf8"));
      return p.error ? [] : [[f, p.tree] as const];
    })];
    for (const [name, tree] of trees) {
      for (const width of [8, 12, 16, 20, 24, 37]) {
        for (const glyphs of [unicodeG, glyphsFor("ascii")]) fits(renderTree(tree, { width, glyphs, showUrls: false }), name);
      }
    }
  });
});

describe("headings: the render, the graph and source mode read one text (review cycle 2, render)", () => {
  const md = "## Setup [^1] notes\n\n## Logo ![l](l.png) Title\n\n## a  b\n\n## Trailing [^1]\n\n[^1]: a note\n";
  test("the layout's headings are headingsOf's, inner white space kept, and a fragment lands", () => {
    const graph = headingsOf(parseMarkdown(md).tree);
    const layout = renderMarkdown(md, { width: 60, glyphs: unicode, showUrls: false }).headings;
    expect(layout.map((h) => [h.text, h.slug])).toEqual(graph.map((h) => [h.text, h.slug]));
    expect(graph.map((h) => h.slug)).toEqual(["setup--notes", "logo--title", "a--b", "trailing"]);
    // What jumpToHeading does with a fragment slipbox writes from the graph's headings.
    const heads = layout.map((h) => ({ depth: h.level, text: h.text, slug: h.slug, line: h.src, id: h.id }));
    graph.forEach((g, i) => expect(findHeading(heads, [], headingFragment(graph, i))?.line).toBe(g.line));
  });
});

describe("an HTML block's comments (review cycle 2, render)", () => {
  test("a comment over several lines keeps the rows after it on their source lines, and leaves no row", () => {
    const l = renderMarkdown("# T\n\n<div>\n<!-- a note\nspanning lines -->\n<p>x</p>\n<!-- one line -->\n</div>\n", { width: 60, glyphs: unicode, showUrls: false });
    const rows = l.lines.filter((x) => x.src >= 3).map((x) => [x.src, x.spans.map((s) => s.text).join("").trimEnd()]);
    expect(rows).toEqual([[3, "<div>"], [6, "<p>x</p>"], [8, "</div>"]]);
  });
});

describe("links inside a data file's records (review cycle 2, render)", () => {
  const cases: [format: string, text: string, targets: string[], lines: number[]][] = [
    ["yaml", "schemas:\n  - name: user\n    $ref: schemas/user.json\n  - name: post\n    $ref: schemas/post.json\n", ["schemas/user.json", "schemas/post.json"], [2, 4]],
    ["toml", '[[include]]\npath = "a.toml"\n[[include]]\npath = "b.toml"\n', ["a.toml", "b.toml"], [1, 3]],
    ["json", '{"servers": [\n  {"name": "a", "url": "https://a.example"},\n  {"name": "b", "url": "https://b.example"}\n]}\n', ["https://a.example", "https://b.example"], [2, 3]],
  ];
  for (const [format, text, targets, lines] of cases) {
    test(`${format}: the graph reads them and the render draws them as links`, () => {
      const { tree, error } = parseData(format, text);
      expect(error).toBeNull();
      expect(tree.children.some((n) => n.type === "table")).toBe(true); // still a table
      expect(dataLinks(tree).map((l) => [l.target, l.line, l.explicit])).toEqual(targets.map((t, i) => [t, lines[i]!, true]));
      const l = renderTree(tree, { width: 80, glyphs: unicode, showUrls: false, resolveLink: () => "unresolved" });
      expect(l.links.map((x) => [x.target, x.status])).toEqual(targets.map((t) => [t, t.startsWith("https:") ? "external" : "unresolved"]));
      // Each drawn on its record's row, a span carrying the link.
      for (const [i, link] of l.links.entries()) {
        const row = l.lines[link.line]!;
        expect(row.src).toBe(lines[i]!);
        expect(row.spans.some((sp) => sp.link === i && sp.text === targets[i])).toBe(true);
      }
    });
  }
  test("a path-like value in a record is a link only when it resolves, as a field's is", () => {
    const { tree } = parseData("yaml", "files:\n  - name: a\n    doc: docs/a.md\n  - name: b\n    doc: docs/b.md\n");
    expect(dataLinks(tree).map((l) => [l.target, l.key, l.explicit])).toEqual([["docs/a.md", "doc", false], ["docs/b.md", "doc", false]]);
    const l = renderTree(tree, { width: 80, glyphs: unicode, showUrls: false, resolveLink: (_k, t) => (t === "docs/a.md" ? "resolved" : "unresolved") });
    expect(l.links.map((x) => x.target)).toEqual(["docs/a.md"]);
  });
});

describe("what rendering.md promises (review: docs against the tests)", () => {
  const rows = (md: string, width = 60) => renderMarkdown(md, { width, glyphs: unicode, showUrls: false }).lines.map((l) => l.spans.map((s) => s.text).join(""));
  test("records: the labels' column is a third of the width at most, a long label wrapping inside it", () => {
    const md = "| a rather long column label | two | three | four | five |\n|---|---|---|---|---|\n| a | b | c | d | e |\n";
    const out = rows(md, 24);
    expect(out.every((r) => stringWidth(r) <= 24)).toBe(true);
    // floor(24 / 3) = 8 columns of label, two of gap: every value starts at column 10.
    expect(out.slice(1, 5).map((r) => r.trimEnd())).toEqual(["a rather  a", "long", "column", "label"]);
    expect(out.find((r) => r.startsWith("two"))).toBe("two       b");
  });
  test("tabs expand to stops of 4 in code blocks, HTML and raw frontmatter, and of 2 in inline code", () => {
    const out = rows("```\na\tb\n```\n\n`a\tb` x\n\n<div>\nc\td\n</div>\n");
    expect(out).toContain(" a   b"); // the code block's own one-column margin, then a stop of 4
    expect(out).toContain("a b x"); // inline code: a stop of 2
    expect(out).toContain("c   d"); // an HTML block
    // Frontmatter that doesn't parse is shown as written, its tabs expanded too.
    expect(rows("---\ntitle: [x\n\tq\n---\n\nbody\n")).toContain("     q");
  });
  test("readability defaults (2.7): the inset, capped at 5% of a narrow pane and never below 1", () => {
    expect(layoutWidth(120, 4)).toBe(116); // the default inset, whole
    expect(layoutWidth(60, 4)).toBe(57); // 5% of 60
    expect(layoutWidth(30, 4)).toBe(29); // 5% of 30, rounded down
    expect(layoutWidth(15, 4)).toBe(14); // 5% of 15 rounds to 0: never below 1
    expect(layoutWidth(120, 4, 80)).toBe(80); // render.max_width caps what's left
  });
  test("readability defaults (2.7): Tokyo Night's bold and inline code; every theme's heading bands blended 14% (dark) or 16% (light)", () => {
    const tn = loadTheme("tokyo-night").theme;
    expect(tn.roles.strong).toMatchObject({ fg: "#bcc5e6", bold: true });
    expect(tn.roles.code_inline).toMatchObject({ fg: "#c0caf5", bg: "#292e42", italic: true });
    const kinds = new Set<string>();
    for (const { name } of listThemes()) {
      const t = loadTheme(name).theme;
      if (!t.bg.startsWith("#")) continue; // the terminal's and mono have no colours to blend
      kinds.add(t.kind);
      for (const h of ["h1", "h2", "h3", "h4", "h5", "h6"] as const) {
        expect([name, h, t.roles[h].bg]).toEqual([name, h, blend(t.roles[h].fg!, t.bg, t.kind === "dark" ? 0.14 : 0.16)]);
      }
    }
    expect([...kinds].sort()).toEqual(["dark", "light"]);
  });
});
