// Rendering: snapshot the pure layout stage (0.4) and property-test the table allocator (2.3).

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { glyphsFor } from "../src/core/glyphs.ts";
import { layoutToAnsi } from "../src/core/layout/ansi.ts";
import { A_BOLD, type Layout, type Line, scrolledCol, scrolledInSight, unscrolledCol } from "../src/core/layout/ir.ts";
import { blockDiff } from "../src/core/blockdiff.ts";
import { layoutBlockDiff } from "../src/core/layout/blockdiff.ts";
import { layoutDiff } from "../src/core/layout/diff.ts";
import { layoutSplitDiff, splitColumns, splitRows } from "../src/core/layout/splitdiff.ts";
import { layoutScreen, type ScreenPart, screenText } from "../src/core/layout/screen.ts";
import { comparable, diffView, unseenRows } from "../src/core/merge.ts";
import { type PictureSource, renderMarkdown, renderTree } from "../src/core/layout/render.ts";
import { dataLinks, parseData } from "../src/core/data.ts";
import { classify } from "../src/core/filetypes.ts";
import { loadMermaid } from "../src/core/diagrams.ts";
import { loadRasterizer } from "../src/core/svg.ts";
import { loadTypesetter } from "../src/core/typeset.ts";
import { paintJobs } from "../src/core/paint-jobs.ts";
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

// What loads lazily is the process's, shared by the test files run in it (16.6): one run before this, export's, may
// have loaded the Mermaid library already. Loaded before any render here, the layouts never depend on what ran first:
// the samples' diagrams are drawn as the TUI draws them once it's in.
beforeAll(async () => {
  await loadMermaid();
});

// The demo vault's notes, by path inside it.
const SAMPLES = join(import.meta.dir, "..", "examples", "vault");
const samples = (readdirSync(SAMPLES, { recursive: true }) as string[]).filter((f) => f.endsWith(".md")).sort();
const unicode = glyphsFor("unicode");
async function renderReady(...args: Parameters<typeof renderMarkdown>): Promise<Layout> {
  renderMarkdown(...args);
  await loadMermaid();
  return renderMarkdown(...args);
}

const text = (l: Layout) =>
  l.lines
    .map((line) =>
      line.spans
        .map((s) => s.text)
        .join("")
        .replace(/\s+$/, ""),
    )
    .join("\n");

describe("no rendered row ever exceeds the layout width", () => {
  for (const file of samples) {
    test(file, async () => {
      const src = readFileSync(join(SAMPLES, file), "utf8");
      for (const width of [24, 37, 60, 80, 101, 140]) {
        for (const glyphs of [unicode, glyphsFor("ascii")]) {
          const layout = await renderReady(src, { width, glyphs, showUrls: false });
          // The renderer cuts any row to the width as a last defence; a cut is a block's bug and
          // lost text, so none may happen (the width check alone could never fail).
          if (layout.clipped) throw new Error(`${file} @${width}: ${layout.clipped} row(s) had to be clipped`);
          for (const [i, line] of layout.lines.entries()) {
            const w = line.spans.reduce((a, s) => a + stringWidth(s.text), 0);
            if (w > width)
              throw new Error(`${file} @${width}: row ${i} is ${w} wide: ${line.spans.map((s) => s.text).join("")}`);
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
    test(file, async () => {
      const src = readFileSync(join(HOME, file), "utf8");
      for (const [width, glyphs] of [
        [24, unicode],
        [37, glyphsFor("ascii")],
        [80, unicode],
        [140, unicode],
      ] as const) {
        const layout = await renderReady(src, { width, glyphs, showUrls: false });
        if (layout.clipped) throw new Error(`${file} @${width}: ${layout.clipped} row(s) had to be clipped`);
        for (const [i, line] of layout.lines.entries()) {
          const w = line.spans.reduce((a, s) => a + stringWidth(s.text), 0);
          if (w > width)
            throw new Error(`${file} @${width}: row ${i} is ${w} wide: ${line.spans.map((s) => s.text).join("")}`);
        }
      }
    });
  }
});

// With codeScroll (the TUI's `[render] code_wrap = "scroll"`) a code block's rows are as wide as its lines: what's
// before its code, and its window on it, still fit the width, and its code is whole.
describe("no rendered row exceeds the layout width but a scrolling code block's code, kept whole", () => {
  const HOME = join(import.meta.dir, "..", "examples", "home");
  const all = [
    ...samples.map((f) => join("vault", f)),
    ...(readdirSync(HOME, { recursive: true }) as string[])
      .filter((f) => f.endsWith(".md"))
      .map((f) => join("home", f)),
  ].sort();
  /** How many rows scrolled, in a note at a width. */
  const check = (file: string, width: number): number => {
    const src = readFileSync(join(import.meta.dir, "..", "examples", file), "utf8");
    const layout = renderMarkdown(src, { width, glyphs: unicode, showUrls: false, codeScroll: true });
    if (layout.clipped) throw new Error(`${file} @${width}: ${layout.clipped} row(s) had to be clipped`);
    let scrolled = 0;
    for (const [i, line] of layout.lines.entries()) {
      const row = line.spans.map((s) => s.text).join("");
      const s = line.scroll;
      if (s && !s.part) {
        scrolled++;
        if (s.x + s.w + 1 > width) throw new Error(`${file} @${width}: row ${i}'s code window ends past the width`);
        if (row.includes("↪")) throw new Error(`${file} @${width}: row ${i} wrapped`);
      } else if (stringWidth(row) > width) throw new Error(`${file} @${width}: row ${i} is too wide: ${row}`);
    }
    return scrolled;
  };
  for (const file of all) test(file, () => void [24, 60, 101].forEach((w) => check(file, w)));
  test("some scroll", () => expect(check("vault/handbook/writing-guide.md", 60)).toBeGreaterThan(5));
});

describe("snapshots of the layout IR as text", () => {
  for (const file of samples) {
    test(`${file} @ 80`, async () => {
      const src = readFileSync(join(SAMPLES, file), "utf8");
      expect(text(await renderReady(src, { width: 80, glyphs: unicode, showUrls: true }))).toMatchSnapshot();
    });
  }
  // The samples beyond markdown, each read by its own reader (16.11–16.13, 16.16, 16.17).
  const others = (readdirSync(SAMPLES, { recursive: true }) as string[])
    .filter(
      (f) =>
        /\.(toml|ya?ml|json|csv|tsv|ini|cfg|properties|env)$/.test(f) &&
        !/broken|photometry/.test(f) &&
        !f.split("/").includes(".slipbox"),
    )
    .sort(); // a vault's marker, nested ones too
  test("the samples beyond markdown are there", () => {
    expect(others.length).toBeGreaterThanOrEqual(6);
  });
  for (const file of others) {
    test(`${file} @ 80`, async () => {
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
    const t = parsed.tree.children[0] as unknown as {
      type: string;
      children: { position: { start: { line: number } } }[];
    };
    expect(t.type).toBe("table");
    expect(t.children.length).toBe(2001); // the header and 2,000 rows
    expect(t.children[2000]!.position.start.line).toBe(2001);
    const out = text(renderTree(parsed.tree, { width: 120, glyphs: unicode, showUrls: false }));
    expect(out).toContain("… 600 more rows");
    const cells = (t.children as unknown as { children: { children: { value?: string }[] }[] }[]).flatMap((r) =>
      r.children.map((c) => c.children[0]?.value ?? ""),
    );
    expect(cells).toContain('"comparison star C3, not C2"'); // doubled quotes read as one
  });
  test("wrap-probe @ 44 (narrow)", async () => {
    const src = readFileSync(join(SAMPLES, "scratch", "wrap-probe.md"), "utf8");
    expect(text(await renderReady(src, { width: 44, glyphs: unicode, showUrls: false }))).toMatchSnapshot();
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
    const layout = renderMarkdown("```ts\nconst x = 1; // a comment that is long enough to wrap around\n```\n", {
      width: 40,
      glyphs: unicode,
      showUrls: false,
    });
    expect(layout.lines.every((l) => l.fill === "code_block")).toBe(true);
    expect(text(layout)).toMatchSnapshot();
    const roles = new Set(layout.lines.flatMap((l) => l.spans.map((s) => s.role)));
    expect(roles.has("syn_keyword")).toBe(true);
    expect(roles.has("syn_comment")).toBe(true);
    // A label wider than the row is cut with …: nothing left for the last defence to clip.
    const long = renderMarkdown("```a-very-long-language-name-that-is-wider-than-the-row\nx\n```\n", {
      width: 24,
      glyphs: unicode,
      showUrls: false,
    });
    expect(long.clipped ?? 0).toBe(0);
    expect(long.lines[0]!.spans.map((s) => s.text).join("")).toBe("a-very-long-language-n… ");
  });
  test("with codeScroll, a block too wide keeps each line whole on one row, to scroll sideways; in a list or a quote, from past its indent; one that fits, or printed, as before", () => {
    const long = "find . -name '*.md' -newer index.md | xargs grep -l 'TODO' | sort | uniq -c";
    const md = `\`\`\`sh\n${long}\nls\n\`\`\`\n`;
    const opts = { width: 40, glyphs: unicode, showUrls: false, codeScroll: true };
    const l = renderMarkdown(md, opts);
    expect(l.clipped).toBe(0);
    expect(l.lines.length).toBe(4); // the label, a row per line, the last row
    const scroll = { x: 1, w: 38, total: stringWidth(long) };
    expect(l.lines.map((x) => x.scroll)).toEqual([
      { ...scroll, part: "top" },
      scroll,
      scroll,
      { ...scroll, part: "bar" },
    ]);
    expect(l.lines[1]!.spans.map((x) => x.text).join("")).toBe(` ${long}`);
    expect(l.lines[1]!.spans.slice(1).every((x) => x.src === 2)).toBe(true);
    expect(text(l)).not.toContain("↪");
    expect(l.lines.every((x) => x.fill === "code_block")).toBe(true);
    // Inside a list item and a quote: where its code starts moves past what's before it.
    const inList = renderMarkdown(`- item\n\n  \`\`\`sh\n  ${long}\n  \`\`\`\n`, opts);
    const row = inList.lines.find((x) => x.scroll && !x.scroll.part)!;
    expect(row.scroll!.x).toBe(3);
    expect([...row.spans.map((x) => x.text).join("")].slice(3).join("")).toBe(long);
    const inQuote = renderMarkdown(`> \`\`\`sh\n> ${long}\n> \`\`\`\n`, opts);
    expect(inQuote.lines.find((x) => x.scroll && !x.scroll.part)!.scroll!.x).toBe(3);
    // Room for every line: no scroll, as before.
    expect(renderMarkdown("```sh\nls\n```\n", opts).lines.some((x) => x.scroll)).toBe(false);
    // Without it (what's printed; [render] code_wrap = "wrap"): wrapped, the rows after the first marked ↪.
    const wrapped = renderMarkdown(md, { ...opts, codeScroll: false });
    expect(wrapped.lines.some((x) => x.scroll)).toBe(false);
    expect(wrapped.lines.length).toBeGreaterThan(4);
    expect(wrapped.lines[2]!.spans[0]!.text).toBe("↪");
    // A display's maths too wide falls back to its code, which scrolls too.
    const maths = renderMarkdown(`$$\n${"x + ".repeat(30)}y\n$$\n`, opts);
    expect(text(maths)).toContain("math — too wide to draw");
    expect(maths.lines.some((x) => x.scroll && !x.scroll.part)).toBe(true);
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
    expect(layout.links.map((l) => [l.line, l.col])).toEqual([
      [0, 0],
      [0, 2],
      [0, 4],
      [0, 6],
    ]);
  });
  test("Obsidian's ==highlight== on a background of its own, a link inside it too; `a == b`, `===x===`, `\\==y==` text; %%comments%% hidden — the space where one was made one, a paragraph of them no row, one over blank lines (a list's last line closing it) no rows", () => {
    const md =
      "%% Check with Mum. %%\n\nA ==splash of **vanilla** and [[Dal]]== here; a == b, ===x===, \\==y==.\nText %% a note %% goes on, %%across\nlines%% to the end, %%a last word%%\nthe last line %%really%%.\n\n%%\nA block, [[Dal]] in it:\n\n- over a blank line;\n- a list, the closing marks its last item's.\n%%\n\nAfter.\n";
    const layout = renderMarkdown(md, { width: 100, glyphs: unicode, showUrls: false, resolveLink: () => "resolved" });
    expect(text(layout)).toBe(
      "A splash of vanilla and Dal here; a == b, ===x===, ==y==. Text goes on, to the end, the last line.\n\nAfter.",
    );
    const spans = layout.lines[0]!.spans;
    expect(spans.filter((s) => s.role === "highlight" || s.bg === "highlight").map((s) => [s.text, s.role])).toEqual([
      ["splash of ", "highlight"],
      ["vanilla", "highlight"],
      [" and ", "highlight"],
      ["Dal", "wikilink"],
    ]);
    expect(spans.find((s) => s.text === "vanilla")!.attrs & A_BOLD).toBe(A_BOLD);
    // Rows keep their source lines: after a comment across lines, line 5's words; after one that ends a line, line 6's;
    // After. is line 15.
    expect(spans.find((s) => s.text.includes("to the end"))!.src).toBe(5);
    expect(spans.find((s) => s.text.includes("the last line"))!.src).toBe(6);
    expect(layout.lines.at(-1)!.src).toBe(15);
    // A comment over blank lines closes only at a `%%` of its own: an escaped one is text, and so is all of it.
    expect(text(renderMarkdown("%% opens\n\nends \\%%\n", { width: 60, glyphs: unicode, showUrls: false }))).toBe(
      "%% opens\n\nends %%",
    );
    // Only the links drawn are the layout's; a comment's are still the note's (what the index reads), only not drawn.
    expect(layout.links.map((l) => l.target)).toEqual(["Dal"]);
    expect(JSON.stringify(parseMarkdown(md).tree).match(/"wikiLink"/g)).toHaveLength(2);
    // Every theme draws it: a background, or reverse where there's no colour.
    for (const { name } of listThemes()) {
      const h = loadTheme(name).theme.roles.highlight;
      expect([name, !!(h.bg || h.inverse)]).toEqual([name, true]);
    }
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
    expect(shown("a ![[Dal|300]] ![[pantry.csv]] b")).toEqual([
      [`${unicode.embed} 300`, "embed"],
      [`${unicode.embed} pantry.csv`, "embed"],
    ]);
  });
  test("a picture embedded by name, alone in its paragraph, is asked for by its name and Obsidian's size (12.13); a note's embed, one beside text, a link to one, isn't", () => {
    const asked: PictureSource[] = [];
    const picture = (from: PictureSource) => (asked.push(from), { src: "/pictures/p.png", cols: 4, rows: 2 });
    const md =
      "![[dal.png]]\n\n![[a/dal.png|300]]\n\n![[flip.JPG|240x180]]\n\n![[dal.png|the finished dal]]\n\n![[Dal|300]]\n\nbeside ![[dal.png]] text\n\n[[dal.png]]\n";
    const l = renderMarkdown(md, { width: 60, glyphs: unicode, showUrls: false, picture });
    expect(asked).toEqual([
      { name: "dal.png", size: null },
      { name: "a/dal.png", size: { width: 300, height: null } },
      { name: "flip.JPG", size: { width: 240, height: 180 } },
      { name: "dal.png", size: null },
    ]);
    // Each picture precedes its boxed caption.
    const rows = l.lines.map((x) => (x.image ? "picture" : x.spans.map((s) => s.text).join("")));
    expect(rows.slice(0, 2)).toEqual(["picture", ""]);
    expect(l.lines[3]!.caption?.top).toBe(true);
    expect(rows[4]).toContain(`${unicode.image} dal.png`);
  });
  test("source lines survive wrapping (3.5 anchors on them)", () => {
    const layout = renderMarkdown("# H\n\npara one\nline two\n\nsecond para\n", {
      width: 6,
      glyphs: unicode,
      showUrls: false,
    });
    const srcs = layout.lines.filter((l) => l.spans.length).map((l) => l.src);
    expect(srcs[0]).toBe(1);
    expect(srcs).toContain(4);
    expect(srcs[srcs.length - 1]).toBe(6);
  });
  test("an unterminated escape in a code block keeps the block's lines and their source lines", () => {
    const layout = renderMarkdown("para\n\n```\nline one \x1b]0;title\nline two\nline three\n```\n\nafter\n", {
      width: 40,
      glyphs: unicode,
      showUrls: false,
    });
    const rows = layout.lines.map(
      (l) =>
        [
          l.src,
          l.spans
            .map((s) => s.text)
            .join("")
            .trim(),
        ] as const,
    );
    expect(rows.filter(([, t]) => t.startsWith("line"))).toEqual([
      [4, "line one"],
      [5, "line two"],
      [6, "line three"],
    ]);
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
          const shown = l.lines
            .map((x) => x.spans.map((sp) => sp.text).join(""))
            .join("")
            .replace(/[\s↪…]/g, "");
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
  const lay = (md: string, width = 60, showUrls = false) =>
    renderMarkdown(md, { width, glyphs: glyphsFor("unicode"), showUrls });
  const rows = (l: Layout) =>
    l.lines.map((x) =>
      x.spans
        .map((s) => s.text)
        .join("")
        .trimEnd(),
    );
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
  const rows = (l: Layout) =>
    l.lines.map((x) =>
      x.spans
        .map((s) => s.text)
        .join("")
        .trimEnd(),
    );
  test("a heading's text and slug are the outline's: no footnote marks or image glyphs; repeats share a slug", () => {
    const l = lay("# Title[^1]\n\n# ![logo](l.png) Project\n\n# A\n\n# A\n\n[^1]: n\n");
    expect(l.headings.map((h) => [h.text, h.slug])).toEqual([
      ["Title", "title"],
      ["Project", "project"],
      ["A", "a"],
      ["A", "a"],
    ]);
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
    const c1 = code.lines.find((x) =>
      x.spans
        .map((s) => s.text)
        .join("")
        .includes("code1"),
    )!;
    expect(c1.src).toBe(3);
  });
});

describe("review cycle 5 (render, from mutation testing)", () => {
  test("an escape before a tab in a code block doesn't move the tab stop", () => {
    const rows = (code: string) =>
      renderMarkdown(`\`\`\`\n${code}\n\`\`\`\n`, {
        width: 60,
        glyphs: glyphsFor("unicode"),
        showUrls: false,
      }).lines.map((l) => l.spans.map((s) => s.text).join(""));
    expect(rows("ab\x1b[31mcd\x1b[0mef\tgh")).toEqual(rows("abcdef\tgh"));
  });
});

describe("review cycle 5 (render: what the snapshots can't see)", () => {
  test("each callout kind takes its own role; GitHub's capitals too; TOML frontmatter is a properties block", () => {
    const roleOf = (kind: string) => {
      const l = renderMarkdown(`> [!${kind}] T\n> body\n`, {
        width: 60,
        glyphs: glyphsFor("unicode"),
        showUrls: false,
      });
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
    const fm = renderMarkdown('+++\ntitle = "T"\ntags = ["a"]\n+++\n\nx\n', {
      width: 60,
      glyphs: glyphsFor("unicode"),
      showUrls: false,
    });
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
    const blocksPool = [
      "# Heading",
      "## Sub [[link]]",
      "Some text with [ref] and [^fn] and **bold**.",
      "- [ ] task\n- [x] done\n  - nested",
      "```ts\nconst x = 1;\n```",
      `\`\`\`sh\necho ${"a long argument ".repeat(6)}\n\`\`\``,
      "| a | b |\n| - | - |\n| 1 | 2 |",
      "> quote with [[other]]",
      "[ref]: https://example.invalid",
      "[^fn]: A footnote.",
      "1. one\n2. two",
      "<!-- comment -->",
      "---",
    ];
    const pcache = newParseCache();
    const rcache = newRenderCache();
    const blocks = Array.from({ length: 60 }, () => blocksPool[rand(blocksPool.length)]!);
    for (let step = 0; step < 120; step++) {
      const at = rand(blocks.length);
      const r = rand(3);
      if (r === 0) blocks.splice(at, 0, blocksPool[rand(blocksPool.length)]!);
      else if (r === 1 && blocks.length > 2) blocks.splice(at, 1);
      else blocks[at] = `${blocks[at]} more`;
      const text = `${blocks.join("\n\n")}\n`;
      // Options change now and then (each change drops the cache), not at every step (then nothing is reused).
      const opts = {
        width: [40, 80][Math.floor(step / 20) % 2]!,
        glyphs: glyphsFor("unicode"),
        showUrls: Math.floor(step / 30) % 2 === 1,
        codeScroll: Math.floor(step / 10) % 2 === 1,
      };
      const p = parseMarkdown(text, pcache);
      const cached = renderTree(p.tree, opts, p.frontmatter, rcache);
      const fresh = renderTree(parseMarkdown(text, undefined, { whole: true }).tree, opts, p.frontmatter);
      expect(JSON.stringify(cached)).toBe(JSON.stringify(fresh));
    }
  });
  test("a code block too wide, cached wrapped, is laid out again to scroll sideways, and back", async () => {
    const { newParseCache, parseMarkdown } = await import("../src/core/parse.ts");
    const { newRenderCache, renderTree } = await import("../src/core/layout/render.ts");
    const text = `# Code\n\n\`\`\`sh\necho ${"a long argument ".repeat(6)}\n\`\`\`\n`;
    const pcache = newParseCache();
    const rcache = newRenderCache();
    for (const codeScroll of [false, true, false]) {
      const opts = { width: 40, glyphs: glyphsFor("unicode"), showUrls: false, codeScroll };
      const cached = renderTree(parseMarkdown(text, pcache).tree, opts, null, rcache);
      expect(JSON.stringify(cached)).toBe(JSON.stringify(renderTree(parseMarkdown(text).tree, opts, null)));
      expect(cached.lines.some((l) => l.scroll)).toBe(codeScroll);
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
    const inner = parseNoteFile("inner.md", "| name | value |\n|---|---|\n| alpha | 1 |\n\n- one\n  - two words here\n")
      .tree.children;
    const embed = () => ({ path: "/v/inner.md", title: "inner", nodes: inner });
    for (const md of ["![[inner]]\n", "- a\n  - ![[inner]]\n", "> > > ![[inner]]\n"]) {
      for (let width = 6; width <= 24; width++) {
        for (const glyphs of [unicodeG, glyphsFor("ascii")])
          fits(renderMarkdown(md, { width, glyphs, showUrls: false, embed }), JSON.stringify(md));
      }
    }
  });
  test("a callout too narrow for its bar keeps its text's room, as a quote does", () => {
    const l = renderMarkdown("> [!warning] Warning\n> > [!note] Inner\n> > > [!tip] Deep words here\n", {
      width: 8,
      glyphs: unicodeG,
      showUrls: false,
    });
    fits(l, "callouts");
    const shown = l.lines.map((x) =>
      x.spans
        .map((s) => s.text)
        .join("")
        .trim(),
    );
    expect(shown.some((r) => r.includes("Warning"))).toBe(true); // not wrapped two columns wide
    expect(shown.some((r) => r.includes("words"))).toBe(true);
  });
  test("a deep data tree with records, and the reference set's data files, at 8 to 37", () => {
    const deep = parseData(
      "yaml",
      "a:\n  b:\n    c:\n      d:\n        e:\n          f:\n            long_key_name: a value of several words\n            records:\n              - name: alpha\n                value: 1\n              - name: beta\n                value: 2\n            # a comment\n            k: v\n",
    );
    expect(deep.error).toBeNull();
    const HOME = join(import.meta.dir, "..", "examples", "home");
    // The trees and key-value files under 64 KB (a CSV is one table, the big ones slow to sweep).
    const files = (readdirSync(HOME, { recursive: true }) as string[])
      .filter(
        (f) =>
          !f.split("/").includes(".slipbox") &&
          classify(f, ["md"]).group === "data" &&
          !/\.(csv|tsv)$/.test(f) &&
          statSync(join(HOME, f)).size < 65_536,
      )
      .sort();
    expect(files.length).toBeGreaterThan(20);
    const trees = [
      ["deep.yaml", deep.tree] as const,
      ...files.flatMap((f) => {
        const p = parseData(classify(f, ["md"]).format, readFileSync(join(HOME, f), "utf8"));
        return p.error ? [] : [[f, p.tree] as const];
      }),
    ];
    for (const [name, tree] of trees) {
      for (const width of [8, 12, 16, 20, 24, 37]) {
        for (const glyphs of [unicodeG, glyphsFor("ascii")])
          fits(renderTree(tree, { width, glyphs, showUrls: false }), name);
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
    const l = renderMarkdown("# T\n\n<div>\n<!-- a note\nspanning lines -->\n<p>x</p>\n<!-- one line -->\n</div>\n", {
      width: 60,
      glyphs: unicode,
      showUrls: false,
    });
    const rows = l.lines
      .filter((x) => x.src >= 3)
      .map((x) => [
        x.src,
        x.spans
          .map((s) => s.text)
          .join("")
          .trimEnd(),
      ]);
    expect(rows).toEqual([
      [3, "<div>"],
      [6, "<p>x</p>"],
      [8, "</div>"],
    ]);
  });
});

describe("links inside a data file's records (review cycle 2, render)", () => {
  const cases: [format: string, text: string, targets: string[], lines: number[]][] = [
    [
      "yaml",
      "schemas:\n  - name: user\n    $ref: schemas/user.json\n  - name: post\n    $ref: schemas/post.json\n",
      ["schemas/user.json", "schemas/post.json"],
      [2, 4],
    ],
    ["toml", '[[include]]\npath = "a.toml"\n[[include]]\npath = "b.toml"\n', ["a.toml", "b.toml"], [1, 3]],
    [
      "json",
      '{"servers": [\n  {"name": "a", "url": "https://a.example"},\n  {"name": "b", "url": "https://b.example"}\n]}\n',
      ["https://a.example", "https://b.example"],
      [2, 3],
    ],
  ];
  for (const [format, text, targets, lines] of cases) {
    test(`${format}: the graph reads them and the render draws them as links`, () => {
      const { tree, error } = parseData(format, text);
      expect(error).toBeNull();
      expect(tree.children.some((n) => n.type === "table")).toBe(true); // still a table
      expect(dataLinks(tree).map((l) => [l.target, l.line, l.explicit])).toEqual(
        targets.map((t, i) => [t, lines[i]!, true]),
      );
      const l = renderTree(tree, { width: 80, glyphs: unicode, showUrls: false, resolveLink: () => "unresolved" });
      expect(l.links.map((x) => [x.target, x.status])).toEqual(
        targets.map((t) => [t, t.startsWith("https:") ? "external" : "unresolved"]),
      );
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
    expect(dataLinks(tree).map((l) => [l.target, l.key, l.explicit])).toEqual([
      ["docs/a.md", "doc", false],
      ["docs/b.md", "doc", false],
    ]);
    const l = renderTree(tree, {
      width: 80,
      glyphs: unicode,
      showUrls: false,
      resolveLink: (_k, t) => (t === "docs/a.md" ? "resolved" : "unresolved"),
    });
    expect(l.links.map((x) => x.target)).toEqual(["docs/a.md"]);
  });
});

describe("what rendering.md promises (review: docs against the tests)", () => {
  const rows = (md: string, width = 60) =>
    renderMarkdown(md, { width, glyphs: unicode, showUrls: false }).lines.map((l) =>
      l.spans.map((s) => s.text).join(""),
    );
  test("records: the labels' column is a third of the width at most, a long label wrapping inside it", () => {
    const md =
      "| a rather long column label | two | three | four | five |\n|---|---|---|---|---|\n| a | b | c | d | e |\n";
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
    expect(tn.roles.strong).toMatchObject({ fg: "#c0caf5", bold: true });
    expect(tn.roles.code_inline).toMatchObject({ fg: "#c0caf5", bg: "#292e42", italic: true });
    const kinds = new Set<string>();
    for (const { name } of listThemes()) {
      const t = loadTheme(name).theme;
      if (!t.bg.startsWith("#")) continue; // the terminal's and mono have no colours to blend
      kinds.add(t.kind);
      for (const h of ["h1", "h2", "h3", "h4", "h5", "h6"] as const) {
        expect([name, h, t.roles[h].bg]).toEqual([
          name,
          h,
          blend(t.roles[h].fg!, t.bg, t.kind === "dark" ? 0.14 : 0.16),
        ]);
      }
    }
    expect([...kinds].sort()).toEqual(["dark", "light"]);
  });
});

describe("Mermaid (12.10)", async () => {
  beforeAll(async () => {
    await loadMermaid();
  });
  const rows = (l: Layout) => l.lines.map((x) => x.spans.map((s) => s.text).join(""));
  const md = "# D\n\n```mermaid\ngraph TD\n  A[Write] --> B[Disk-cache]\n```\n\nafter\n";
  test("forty diagrams settle across repeated screen layouts and remain cached", async () => {
    const source = Array.from(
      { length: 40 },
      (_, n) => `\`\`\`mermaid\ngraph TD\n A[Screen ${n}] --> B\n\`\`\`\n`,
    ).join("\n");
    let layout = renderMarkdown(source, { width: 60, glyphs: unicode, showUrls: false });
    for (let pass = 0; pass < 10 && layout.pending?.includes("mermaid"); pass++) {
      await loadMermaid();
      layout = renderMarkdown(source, { width: 60, glyphs: unicode, showUrls: false });
    }
    expect(layout.pending ?? []).not.toContain("mermaid");
    expect(rows(layout).join("\n")).not.toContain("graph TD");
    const again = renderMarkdown(source, { width: 60, glyphs: unicode, showUrls: false });
    expect(again.pending ?? []).not.toContain("mermaid");
    expect(rows(again)).toEqual(rows(layout));
  });
  test("a diagram drawn in box drawing, every row at its block's line: its lines in the border colour, its words text", async () => {
    const l = await renderReady(md, { width: 60, glyphs: unicode, showUrls: false });
    const drawn = l.lines.filter(
      (x) => x.spans.some((s) => s.text.includes("┌")) || x.spans.some((s) => s.text.includes("Write")),
    );
    expect(rows(l).some((r) => /│\s+Write\s+│/.test(r))).toBe(true);
    expect(rows(l).join("\n")).not.toContain("A[Write]");
    expect(drawn.length).toBeGreaterThan(1);
    // All at the fence's line; no code block's background.
    const block = l.lines.filter((x) => x.src === 3);
    expect(block.length).toBeGreaterThan(5);
    expect(block.every((x) => !x.fill)).toBe(true);
    const spans = block.flatMap((x) => x.spans);
    expect(spans.find((s) => s.text.includes("Write"))!.role).toBe("text");
    expect(spans.find((s) => s.text.includes("Disk-cache"))!.role).toBe("text"); // a hyphen in a word stays a word
    expect(spans.filter((s) => /[┌─│▼]/.test(s.text)).every((s) => s.role === "table_border")).toBe(true);
    expect(rows(l).at(-1)).toBe("after");
  });
  test("with ASCII glyphs: drawn in ASCII, its `+ - |` the lines", async () => {
    const ascii = glyphsFor("ascii", {});
    const l = await renderReady(md, { width: 60, glyphs: ascii, showUrls: false });
    expect(rows(l).join("\n")).toMatch(/\|\s+Write\s+\|/);
    expect(rows(l).join("\n")).not.toMatch(/[┌│]/);
    expect(l.lines.flatMap((x) => x.spans).find((s) => s.text.startsWith("+"))!.role).toBe("table_border");
  });
  test("drawn while its library loads: its code, the layout saying it waited, the block not kept — drawn once it's in", async () => {
    // A process of its own: here the library is in already.
    const script = `
      import { parseMarkdown } from "./src/core/parse.ts";
      import { newRenderCache, renderTree } from "./src/core/layout/render.ts";
      import { glyphsFor } from "./src/core/glyphs.ts";
      import { loadMermaid } from "./src/core/diagrams.ts";
      const parsed = parseMarkdown("# D\\n\\n\`\`\`mermaid\\ngraph TD\\n  A[Write] --> B[Disk]\\n\`\`\`\\n");
      const cache = newRenderCache();
      const opts = { width: 60, glyphs: glyphsFor("unicode"), showUrls: false };
      const text = (l) => l.lines.map((x) => x.spans.map((s) => s.text).join("")).join("\\n");
      const first = renderTree(parsed.tree, opts, null, cache);
      // In a note embedded in this one: this one waited too.
      const inner = parseMarkdown("\`\`\`mermaid\\ngraph TD\\n  A --> B\\n\`\`\`\\n").tree.children;
      const embed = () => ({ path: "/inner.md", title: "inner", nodes: inner });
      const host = renderTree(parseMarkdown("![[inner]]\\n").tree, { ...opts, embed }, null);
      await loadMermaid();
      const second = renderTree(parsed.tree, opts, null, cache);
      console.log(JSON.stringify({ pending: [first.pending, second.pending ?? null, host.pending], code: text(first).includes("A[Write]"), drawn: /│\\s+Write\\s+│/.test(text(second)) }));
    `;
    const r = Bun.spawnSync(["bun", "-e", script], { cwd: join(import.meta.dir, "..") });
    expect(r.stderr.toString()).toBe("");
    expect(JSON.parse(r.stdout.toString())).toEqual({
      pending: [["mermaid"], null, ["mermaid"]],
      code: true,
      drawn: true,
    });
  });
  test("its rows as the text has them: no blank row after, no spaces at their ends", async () => {
    const l = await renderReady("```mermaid\nclassDiagram\n  class Graph\n```\n\nafter\n", {
      width: 60,
      glyphs: unicode,
      showUrls: false,
    });
    const drawn = rows(l).slice(0, rows(l).indexOf("after") - 1);
    expect(drawn.at(-1)).toMatch(/└─+┘/);
    expect(drawn.every((r) => r === r.trimEnd())).toBe(true);
  });
  test("one too wide at the library's spacing is drawn closer together, before it's given up on", async () => {
    // 51 columns at its own spacing, 45 a little closer, 42 closest.
    const md = "```mermaid\ngraph LR\n  A[Read] --> B[Parse] --> C[Lay out] --> D[Draw]\n```\n";
    for (const width of [46, 43]) {
      const r = rows(await renderReady(md, { width, glyphs: unicode, showUrls: false }));
      expect(r.some((x) => /│\s+Draw\s+│/.test(x))).toBe(true);
      expect(Math.max(...r.map(stringWidth))).toBeLessThanOrEqual(width);
    }
  });
  test("a kind it doesn't draw, or a diagram wider than the text: its code, the label saying why", async () => {
    const pie = await renderReady('```mermaid\npie title X\n  "a": 1\n```\n', {
      width: 60,
      glyphs: unicode,
      showUrls: false,
    });
    expect(rows(pie)[0]).toMatch(/mermaid — not drawn: pie $/);
    expect(rows(pie)[1]).toContain("pie title X");
    const chain = Array.from({ length: 8 }, (_, i) => `N${i}[Node number ${i}]`).join(" --> ");
    const wide = await renderReady(`\`\`\`mermaid\ngraph LR\n  ${chain}\n\`\`\`\n`, {
      width: 60,
      glyphs: unicode,
      showUrls: false,
    });
    expect(rows(wide)[0]).toMatch(/mermaid — too wide to draw $/);
    for (const r of rows(wide)) expect(stringWidth(r)).toBeLessThanOrEqual(60);
  });
  test("where it scrolls sideways (codeScroll), one wider than the text is drawn all the same, closest together, a column in from each edge and a row under it for its scrollbar", async () => {
    const chain = Array.from({ length: 8 }, (_, i) => `N${i}[Node number ${i}]`).join(" --> ");
    const wide = await renderReady(`\`\`\`mermaid\ngraph LR\n  ${chain}\n\`\`\`\n`, {
      width: 60,
      glyphs: unicode,
      showUrls: false,
      codeScroll: true,
    });
    expect(wide.clipped).toBe(0);
    expect(rows(wide).join("\n")).not.toContain("too wide to draw");
    expect(rows(wide).some((r) => r.includes("Node number 7"))).toBe(true);
    const scrolls = wide.lines.map((l) => l.scroll);
    expect(scrolls.every(Boolean)).toBe(true);
    expect(scrolls.at(-1)!.part).toBe("bar");
    expect(wide.lines.at(-1)!.spans).toEqual([]);
    const total = Math.max(...wide.lines.map((l) => stringWidth(l.spans.map((s) => s.text).join("")) - 1));
    expect(scrolls[0]).toEqual({ x: 1, w: 58, total });
    expect(total).toBeGreaterThan(60);
    // Every row at the block's line, as a drawn diagram's are.
    expect(new Set(wide.lines.map((l) => l.src))).toEqual(new Set([1]));
  });
});

describe("maths (12.11)", () => {
  const text = (l: Layout) => l.lines.map((x) => x.spans.map((s) => s.text).join(""));
  const render = (md: string, width = 60) => renderMarkdown(md, { width, glyphs: unicode, showUrls: false });
  test("in text: Unicode, in the maths colour; one that can't be, as written; money as text", () => {
    const l = render("Euler: $e^{i\\pi} + 1 = 0$; odd $\\nope x$; costs $5 and $10.\n");
    expect(text(l)[0]).toBe("Euler: e^(iπ) + 1 = 0; odd $\\nope x$; costs $5 and $10.");
    const spans = l.lines[0]!.spans;
    expect(spans.find((s) => s.text.includes("iπ"))!.role).toBe("math");
    expect(spans.find((s) => s.text.includes("\\nope"))!.role).toBe("math");
    expect(spans.find((s) => s.text.includes("$5"))!.role).toBe("text");
  });
  test("a display: its rows centred together, every row at its block's line, in the maths colour", () => {
    const l = render("# M\n\n$$\nf(x) = \\begin{cases} x & x \\ge 0 \\\\ -x & x < 0 \\end{cases}\n$$\n\nafter\n", 40);
    const rows = l.lines.filter((x) => x.src === 3 && x.spans.length);
    // 18 columns wide in 40: 11 before.
    expect(rows.map((x) => x.spans.map((s) => s.text).join(""))).toEqual([
      "           f(x) = ⎧ x   x ≥ 0",
      "                  ⎩ −x  x < 0",
    ]);
    expect(rows.every((x) => x.spans.at(-1)!.role === "math" && !x.fill)).toBe(true);
    expect(text(l).at(-1)).toBe("after");
  });
  test("a display it can't draw, or wider than the text: its source as LaTeX, the label saying why", () => {
    const tikz = text(render("$$\n\\begin{tikzpicture} x \\end{tikzpicture}\n$$\n"));
    expect(tikz[0]).toMatch(/math — as written $/);
    expect(tikz[1]).toContain("\\begin{tikzpicture}");
    // Highlighted as LaTeX.
    const src = render("$$\n\\begin{tikzpicture} x \\end{tikzpicture}\n$$\n").lines[1]!;
    expect(src.spans.some((s) => s.role.startsWith("syn_"))).toBe(true);
    const wide = text(render(`$$\n${Array.from({ length: 30 }, (_, i) => `x_${i}`).join(" + ")}\n$$\n`));
    expect(wide[0]).toMatch(/math — too wide to draw $/);
  });
});

describe("drawn as pictures, by choice (12.16, 12.17)", () => {
  beforeAll(async () => {
    await Promise.all([loadMermaid(), loadRasterizer(), loadTypesetter()]);
    draw(mermaid, { mermaid: true, math: false });
    await loadMermaid();
    draw(mermaid, { mermaid: false, math: true });
    await loadMermaid();
  });
  const colors = {
    bg: "#101010",
    fg: "#e0e0e0",
    line: "#707070",
    accent: "#3080f0",
    muted: "#909090",
    math: "#ff00ff",
  };
  const text = (l: Layout) => l.lines.map((x) => x.spans.map((s) => s.text).join(""));
  const draw = (md: string, drawings: { mermaid: boolean; math: boolean }, drawn = true) => {
    const asked: { from: PictureSource; width: number }[] = [];
    const picture = (from: PictureSource, width: number) => (
      asked.push({ from, width }), drawn && "svg" in from ? { src: "/drawn.png", cols: 10, rows: 3 } : null
    );
    return {
      l: renderMarkdown(md, {
        width: 40,
        glyphs: unicode,
        showUrls: false,
        picture,
        drawings: { ...drawings, colors },
      }),
      asked,
    };
  };
  const mermaid = "```mermaid\ngraph TD\n  A --> B\n```\n\nafter\n";
  test("a Mermaid diagram as a picture: asked for at a column less, centred — its first row the indent, the cursor's stop", () => {
    const { l, asked } = draw(mermaid, { mermaid: true, math: false });
    expect(asked).toEqual([{ from: { svg: expect.stringContaining("<svg"), kind: "diagram" }, width: 39 }]);
    expect((asked[0]!.from as { svg: string }).svg).toContain("#e0e0e0"); // the theme's colours
    const rows = l.lines.slice(0, 3);
    expect(rows[0]).toMatchObject({
      src: 1,
      image: { src: "/drawn.png", cols: 10, rows: 3 },
      spans: [{ text: " ".repeat(15), role: "text" }],
    });
    expect(rows.slice(1).every((x) => x.decor && !x.spans.length && x.src === 1)).toBe(true);
    expect(text(l).at(-1)).toBe("after");
  });
  test("one as wide as it can be still leaves a column before it: the cursor's stop", () => {
    const picture = () => ({ src: "/wide.png", cols: 39, rows: 2 });
    const l = renderMarkdown(mermaid, {
      width: 40,
      glyphs: unicode,
      showUrls: false,
      picture,
      drawings: { mermaid: true, math: false, colors },
    });
    expect(l.lines[0]).toMatchObject({ spans: [{ text: " " }], image: { cols: 39 } });
  });
  test("not chosen, or no picture of it (pictures not drawn, too big): drawn in the terminal's characters", () => {
    for (const { l } of [
      draw(mermaid, { mermaid: false, math: true }),
      draw(mermaid, { mermaid: true, math: false }, false),
    ]) {
      expect(l.lines.some((x) => x.image)).toBe(false);
      expect(text(l).some((r) => /│\s+A\s+│/.test(r))).toBe(true);
    }
  });
  test("a display's maths as a picture: typeset in the maths colour, centred; inline maths stays text; not chosen, text", async () => {
    const md = "Inline $x^2$.\n\n$$\n\\frac{a}{b}\n$$\n";
    // Typeset on the painting worker: text until it's in, then the picture.
    expect(draw(md, { mermaid: false, math: true }).asked).toEqual([]);
    await paintJobs.settle();
    const { l, asked } = draw(md, { mermaid: false, math: true });
    expect(asked).toEqual([{ from: { svg: expect.stringContaining('fill="#ff00ff"'), kind: "math" }, width: 39 }]);
    expect(text(l)[0]).toBe("Inline x².");
    expect(l.lines.find((x) => x.image)).toMatchObject({ src: 3, spans: [{ text: " ".repeat(15) }] });
    expect(draw(md, { mermaid: true, math: false }).l.lines.some((x) => x.image)).toBe(false);
    // One MathJax can't read: the text of it, as without pictures.
    draw("$$\n\\nope\n$$\n", { mermaid: false, math: true });
    await paintJobs.settle();
    const bad = draw("$$\n\\nope\n$$\n", { mermaid: false, math: true });
    expect(bad.asked).toEqual([]);
    expect(text(bad.l)[0]).toMatch(/math — as written $/);
  });
  test("drawn while what draws it loads: in text, the layout saying what it waited for", () => {
    // A process of its own: here they're in already. A diagram, a display, an SVG picture, each on its own.
    const script = `
      import { renderMarkdown } from "./src/core/layout/render.ts";
      import { glyphsFor } from "./src/core/glyphs.ts";
      const colors = { bg: "#000000", fg: "#ffffff", line: "#777777", accent: "#0000ff", muted: "#999999", math: "#ffffff" };
      const picture = (from) => ("svg" in from ? { src: "/p.png", cols: 4, rows: 2 } : null);
      const opts = { width: 40, glyphs: glyphsFor("unicode"), showUrls: false, picture, drawings: { mermaid: true, math: true, colors } };
      const seen = JSON.parse(process.env.MD).map((md) => {
        const l = renderMarkdown(md, opts);
        return { pending: [...(l.pending ?? [])].sort(), images: l.lines.filter((x) => x.image).length };
      });
      console.log(JSON.stringify(seen));
    `;
    const MD = JSON.stringify(["```mermaid\ngraph TD\n  A --> B\n```\n", "$$\nx\n$$\n", "![d](d.svg)\n"]);
    const r = Bun.spawnSync(["bun", "-e", script], { cwd: join(import.meta.dir, ".."), env: { ...process.env, MD } });
    expect(r.stderr.toString()).toBe("");
    // The display waits for its painting job; an SVG file's picture is its callback's to wait for (the TUI's asks the
    // rasteriser's job: tui.test.ts), and this one asks nothing.
    expect(JSON.parse(r.stdout.toString())).toEqual([
      { pending: ["mermaid"], images: 0 },
      { pending: ["pictures"], images: 0 },
      { pending: [], images: 0 },
    ]);
  });
});

describe("a diff's rows as drawn (GIT-D2)", () => {
  const code = `${Array.from({ length: 20 }, (_, i) => `const line${i + 1} = ${i + 1}; // line ${i + 1}`).join("\n")}\n`;
  const diff = (
    before: string,
    now: string,
    o: Partial<Parameters<typeof layoutDiff>[3]> = {},
    open: ReadonlySet<number> = new Set(),
  ) =>
    layoutDiff(diffView(before, now, open), before, now, {
      width: 60,
      glyphs: unicode,
      language: "typescript",
      wrap: true,
      codeScroll: true,
      ...o,
    });
  const textOf = (r: Line) => r.spans.map((s) => s.text).join("");
  const row = (l: Layout, starts: string) => l.lines.find((x) => textOf(x).startsWith(starts))!;
  /** The role and tint of the span holding the first character of `piece`, on the row starting with `starts`. */
  const at = (l: Layout, starts: string, piece: string) => {
    const r = row(l, starts);
    const i = textOf(r).indexOf(piece);
    let n = 0;
    for (const s of r.spans) {
      if (i >= 0 && i < n + s.text.length) return { role: s.role, bg: s.bg };
      n += s.text.length;
    }
    return null;
  };

  test("a row a line, its sign in the gutter, highlighted by its language; a changed line tinted, its changed words more", () => {
    const now = code.replace("const line2 = 2;", "const line2 = 22;");
    const l = diff(code, now);
    expect(text(l).split("\n")).toEqual([
      "@@ line 2",
      "  const line1 = 1; // line 1",
      "- const line2 = 2; // line 2",
      "+ const line2 = 22; // line 2",
      "  const line3 = 3; // line 3",
      "  const line4 = 4; // line 4",
      "  const line5 = 5; // line 5",
      "▸ 15 unchanged lines",
    ]);
    // The head and the fold: their own colours, the fold's row saying how many lines it holds.
    expect(row(l, "@@").spans[0]!.role).toBe("diff_head");
    expect(row(l, "▸").spans[0]!.role).toBe("dim");
    // A changed line: its sign in the colour, the row on its tint, the words the pair doesn't share on the stronger.
    expect(row(l, "- ").fill).toBe("diff_del");
    expect(row(l, "- ").spans[0]).toMatchObject({ text: "- ", role: "diff_del" });
    expect(at(l, "- ", "2;")).toEqual({ role: "syn_number", bg: "diff_del_word" });
    expect(at(l, "+ ", "22")).toEqual({ role: "syn_number", bg: "diff_add_word" });
    // The rest of the line: highlighted, on the line's tint.
    expect(at(l, "+ ", "const")).toEqual({ role: "syn_keyword", bg: "diff_add" });
    expect(at(l, "+ ", "// line 2")).toEqual({ role: "syn_comment", bg: "diff_add" });
    // An unchanged line: highlighted, not tinted.
    expect(at(l, "  const line1", "const")).toEqual({ role: "syn_keyword", bg: undefined });
    expect(row(l, "  const line1").fill).toBeUndefined();
    // A line removed with no line like it: tinted, no word marked.
    const gone = diff(code, code.replace("const line9 = 9; // line 9\n", ""));
    expect(
      row(gone, "- ")
        .spans.slice(1)
        .map((s) => s.bg),
    ).toEqual(
      row(gone, "- ")
        .spans.slice(1)
        .map(() => "diff_del"),
    );
    // A fold opened: its lines in its place.
    const opened = diff(code, now, {}, new Set([6]));
    expect(text(opened)).not.toContain("unchanged");
    expect(text(opened).split("\n").at(-1)).toBe("  const line20 = 20; // line 20");
  });

  test("a note's lines coloured as source mode colours them: what a line is follows from the lines before it", () => {
    const before = "# Sync\n\n```sh\n# a comment, not a heading\necho one\n```\n\n## Retry budget\n";
    const now = before.replace("echo one", "echo two").replace("## Retry budget", "## Retry limit");
    const l = diff(before, now, { language: null });
    // In the fence: its code, though the line read alone would be a heading.
    expect(at(l, "  # a comment", "a comment")?.role).toBe("syn_comment");
    expect(at(l, "+ echo two", "two")).toEqual({ role: "code_block", bg: "diff_add_word" });
    // A heading: its level's colour, the word changed marked.
    expect(at(l, "+ ## Retry limit", "Retry")).toEqual({ role: "h2", bg: "diff_add" });
    expect(at(l, "+ ## Retry limit", "limit")).toEqual({ role: "h2", bg: "diff_add_word" });
  });

  test("a line too long scrolls sideways as a code block does: whole, never cut; the heads and folds fixed, a row for its scrollbar", () => {
    const tail = ", and a tail long enough to go past the edge of a window sixty columns wide";
    const now = code.replace("// line 18\n", `// line 18${tail}\n`);
    const l = diff(code, now);
    const long = row(l, "+ ");
    expect(text(l)).not.toContain("…");
    expect(textOf(long)).toBe(`+ const line18 = 18; // line 18${tail}`);
    // One block: every row of it scrolls from the gutter's end, the head and the fold kept where they are.
    const total = stringWidth(`const line18 = 18; // line 18${tail}`);
    expect(long.scroll).toEqual({ x: 2, w: 57, total });
    expect(row(l, "@@").scroll).toEqual({ x: 2, w: 57, total, part: "top" });
    expect(row(l, "▸").scroll).toEqual({ x: 2, w: 57, total, part: "top" });
    expect(l.lines.at(-1)).toMatchObject({ spans: [], decor: true, scroll: { part: "bar" } });
    expect(l.lines.every((x) => x.scroll)).toBe(true);
    // A row's text from the gutter's end: where the cursor stops.
    expect(long.text?.[0]).toBe(2);
    // `[render] code_wrap = "wrap"`: wrapped, its rows after the first marked; none past the width.
    const wrapped = diff(code, now, { codeScroll: false });
    const rows = text(wrapped).split("\n");
    const first = rows.findIndex((r) => r.startsWith("+ "));
    expect(rows[first + 1]!.startsWith("↪ ")).toBe(true);
    expect(rows.every((r) => stringWidth(r) <= 60)).toBe(true);
    expect(wrapped.lines.some((x) => x.scroll)).toBe(false);
    // Wrapping off: the rows whole, the layout as wide as the widest; the window scrolls.
    const whole = diff(code, now, { wrap: false });
    expect(whole.lines.some((x) => x.scroll)).toBe(false);
    expect(whole.width).toBe(total + 3);
    // A diff whose lines fit: no block at all.
    expect(diff(code, code.replace("= 2;", "= 3;")).lines.some((x) => x.scroll)).toBe(false);
  });

  test("a tab before a combining mark shifts no mark: the changed word marked, unified and side by side", () => {
    const before = "x\t\u0301ab cd\n";
    const now = "x\t\u0301ab ce\n";
    const opts = { width: 180, glyphs: unicode, language: "text", wrap: false, codeScroll: false };
    const rows = diffView(before, now);
    const words = (l: Layout) =>
      l.lines.flatMap((r) => r.spans.filter((s) => String(s.bg ?? "").endsWith("_word")).map((s) => s.text));
    expect(words(layoutDiff(rows, before, now, opts))).toEqual(["cd", "ce"]);
    expect(words(layoutSplitDiff(rows, before, now, opts))).toEqual(["cd", "ce"]);
  });
});

describe("a note's diff before and after, laid out (GIT-D2)", () => {
  const note = [
    "# Sync",
    "",
    "## The retry policy",
    "",
    "The 409 case is the one that bit us: a conflict is not transient. Since 2.3 a 409 parks",
    "the op (see [the rules](rules.md)), and the loop goes on.",
    "",
    "- Two ops on the same field: the later one wins, and the loser stays in the log.",
    "",
    "| State | Meaning |",
    "| --- | --- |",
    "| parked | taken out after a conflict; it needs a human to look at it |",
    "",
    "The end of it.",
    "",
  ].join("\n");
  const lay = (to: string, width = 60) => layoutBlockDiff(blockDiff(note, to), { width, glyphs: unicode });
  const rowText = (r: Line) => r.spans.map((s) => s.text).join("");
  /** The frame (its label) and its text rows, as `label: text`, each row's text inside its rules. */
  const frames = (l: Layout) => {
    const out: string[] = [];
    let label = "";
    for (const r of l.lines) {
      const t = rowText(r);
      const top = /^┌ (\w+) /.exec(t);
      if (top) label = top[1]!;
      else if (t.startsWith("│ ")) out.push(`${label}: ${t.slice(2, -2).trimEnd()}`);
      else if (!t.startsWith("└")) out.push(t.trimEnd());
    }
    return out;
  };
  /** The words on a tint, by the frame they're in: `before`'s, `after`'s, an `added` or `removed` block's. */
  const marked = (l: Layout) => {
    const out: string[] = [];
    let label = "";
    for (const r of l.lines) {
      const top = /^┌ (\w+) /.exec(rowText(r));
      if (top) label = top[1]!;
      for (const s of r.spans) if (s.bg && s.text.trim()) out.push(`${label}: ${s.text.trim()} (${s.bg})`);
    }
    return out;
  };

  test("a paragraph: before and after, only the words that changed marked, its line breaks the frame's own", () => {
    const l = lay(note.replace("Since 2.3 a 409 parks\nthe op", "Since the incident a 409\nparks the op"));
    expect(frames(l)).toEqual([
      "▸ 4 unchanged lines",
      "@@ ## The retry policy  (line 5)",
      "before: The 409 case is the one that bit us: a conflict is not",
      "before: transient. Since 2.3 a 409 parks the op (see the rules),",
      "before: and the loop goes on.",
      "after: The 409 case is the one that bit us: a conflict is not",
      "after: transient. Since the incident a 409 parks the op (see",
      "after: the rules), and the loop goes on.",
      "▸ 8 unchanged lines",
    ]);
    expect(marked(l)).toEqual(["before: 2.3 (diff_del_word)", "after: the incident (diff_add_word)"]);
    // Its frames' rules: decoration, never the cursor's, in the signs' colours; every row as wide as the window.
    const top = l.lines.find((r) => rowText(r).startsWith("┌ before"))!;
    expect([top.decor, top.spans[0]!.role]).toEqual([true, "git_sign_delete"]);
    expect(l.lines.find((r) => rowText(r).startsWith("┌ after"))!.spans[0]!.role).toBe("git_sign_add");
    expect(l.lines.every((r) => stringWidth(rowText(r)) <= 60)).toBe(true);
    expect(l.lines.filter((r) => rowText(r).startsWith("│")).every((r) => stringWidth(rowText(r)) === 60)).toBe(true);
    // Lightly formatted: a link as its text, in its colour; the cursor only on the text, between the rules.
    const link = l.lines.flatMap((r) => r.spans).find((s) => s.text.includes("rules"))!;
    expect(link.role).toBe("link");
    expect(l.lines.find((r) => rowText(r).startsWith("│ The 409"))!.text).toEqual([2, 58]);
  });

  test("a list item and a table's row: the item's marker, the row's cells; a heading in its colour", () => {
    const to = note
      .replace("the later one wins", "the later ULID wins")
      .replace("taken out after a conflict", "taken out after a 409 conflict")
      .replace("## The retry policy", "## The retry budget");
    const l = lay(to, 100);
    expect(frames(l)).toEqual([
      "@@ line 1",
      "  Sync",
      "before: The retry policy",
      "after: The retry budget",
      "▸ 4 unchanged lines",
      "@@ ## The retry budget  (line 8)",
      "before: • Two ops on the same field: the later one wins, and the loser stays in the log.",
      "after: • Two ops on the same field: the later ULID wins, and the loser stays in the log.",
      "▸ 3 unchanged lines",
      "@@ ## The retry budget  (line 12)",
      "before: parked │ taken out after a conflict; it needs a human to look at it",
      "after: parked │ taken out after a 409 conflict; it needs a human to look at it",
      "  The end of it.",
    ]);
    expect(marked(l)).toEqual([
      "before: policy (diff_del_word)",
      "after: budget (diff_add_word)",
      "before: one (diff_del_word)",
      "after: ULID (diff_add_word)",
      "after: 409 (diff_add_word)",
    ]);
    // Inside the frame: past its left rule.
    const span = (starts: string, piece: string) =>
      l.lines
        .find((r) => rowText(r).includes(starts))!
        .spans.slice(1)
        .find((s) => s.text.includes(piece))!;
    expect(span("The retry budget", "budget").role).toBe("h2");
    expect(span("ULID", "•").role).toBe("list_marker");
    expect(span("409 conflict", "│").role).toBe("table_border");
  });

  test("a block added, and one removed: one frame each, its text on its sign's tint", () => {
    const to = note
      .replace("The end of it.\n", "The end of it.\n\nA paragraph the agent added.\n")
      .replace("- Two ops on the same field: the later one wins, and the loser stays in the log.\n\n", "");
    const l = lay(to);
    expect(frames(l)).toEqual([
      "▸ 7 unchanged lines",
      "@@ ## The retry policy  (line 8)",
      "removed: • Two ops on the same field: the later one wins, and the",
      "removed:   loser stays in the log.",
      "▸ 5 unchanged lines",
      "@@ ## The retry policy  (line 14)",
      "added: A paragraph the agent added.",
    ]);
    const tints = new Set(marked(l).map((m) => m.replace(/^.*\(/, "(").replace(/^(\w+):.*/, "$1")));
    expect(tints).toEqual(new Set(["(diff_del)", "(diff_add)"]));
    expect(
      marked(l)
        .filter((m) => m.startsWith("added:"))
        .every((m) => m.endsWith("(diff_add)")),
    ).toBe(true);
    expect(
      marked(l)
        .filter((m) => m.startsWith("removed:"))
        .every((m) => m.endsWith("(diff_del)")),
    ).toBe(true);
  });

  test("what the formatting hides, marked through what shows: a link's target, text made bold", () => {
    const l = lay(
      note.replace("[the rules](rules.md)", "[the rules](policy.md)").replace("The end of it.", "**The** end of it."),
    );
    expect(marked(l)).toEqual([
      "before: the rules (diff_del_word)",
      "after: the rules (diff_add_word)",
      "after: The (diff_add_word)",
    ]);
  });

  /** The words on a word's tint, in order. */
  const wordsMarked = (l: Layout) =>
    l.lines.flatMap((r) => r.spans.filter((s) => String(s.bg ?? "").endsWith("_word")).map((s) => s.text.trim()));
  const crlf = (s: string) => s.replace(/\n/g, "\r\n");

  test("a CRLF note's fence, front matter, maths and rule: no CR shown, the changed word still marked", () => {
    for (const [from, to, word] of [
      ["intro\n\n```js\nlet a = 1;\n```\n", "intro\n\n```js\nlet a = 2;\n```\n", "2"],
      ["---\ntitle: Hi\n---\n\nbody\n", "---\ntitle: Ho\n---\n\nbody\n", "Ho"],
      ["$$\na+b\n$$\n", "$$\na+c\n$$\n", "c"],
      ["a\n\n---\n\nb\n\n- - -\n\nc\n", "a\n\n---\n\nb\n\n***\n\nc\n", null],
    ] as const) {
      const d = blockDiff(crlf(from), crlf(to));
      const l = layoutBlockDiff(d, { width: 50, glyphs: unicode });
      expect(l.lines.filter((r) => rowText(r).includes("�")).map(rowText)).toEqual([]);
      // The window's lines, under the drawing, carry no CR either.
      expect(d.units.filter((u) => u.text.includes("\r"))).toEqual([]);
      if (word) expect(wordsMarked(l).filter((w) => !/^[-─]/.test(w))).toContain(word);
    }
  });

  test("a CRLF paragraph's line break reads as a space, as an LF one does", () => {
    const from = "intro\n\nalpha beta\ngamma delta\n";
    const to = "intro\n\nalpha beta\ngamma epsilon\n";
    for (const [a, b] of [
      [from, to],
      [crlf(from), crlf(to)],
    ])
      expect(frames(layoutBlockDiff(blockDiff(a!, b!), { width: 50, glyphs: unicode }))).toEqual([
        "@@ line 1",
        "  intro",
        "before: alpha beta gamma delta",
        "after: alpha beta gamma epsilon",
      ]);
  });

  test("a frame as wide as the window, however narrow: a deep list's indent goes before its text does", () => {
    const from =
      "- 一\n  - 二\n    - 三\n      - 四\n        - 五\n          - 你好 世界 and some words\n\nA paragraph here.\n";
    const to = from.replace("世界", "地界").replace("A paragraph", "The paragraph");
    const d = blockDiff(from, to, new Set(), { heads: false, folds: false });
    for (let width = 8; width <= 16; width++) {
      const l = layoutBlockDiff(d, { width, glyphs: unicode });
      const wide = l.lines.map(rowText).filter((t) => stringWidth(t) > width);
      expect([width, wide]).toEqual([width, []]);
      expect(wordsMarked(l)).toContain("地");
    }
  });

  test("a fence thousands of lines long lays out in time linear in its lines", () => {
    const fence = (n: number) =>
      `\`\`\`js\n${Array.from({ length: n }, (_, i) => `const v${i} = ${i}; // some comment`).join("\n")}\n\`\`\`\n`;
    const timed = (n: number) => {
      const d = blockDiff(fence(n), fence(n).replace("v5 =", "v5x ="));
      let best = Number.POSITIVE_INFINITY;
      let l: Layout | null = null;
      for (let k = 0; k < 3; k++) {
        const t = performance.now();
        l = layoutBlockDiff(d, { width: 80, glyphs: unicode });
        best = Math.min(best, performance.now() - t);
      }
      return { best, l: l!, d };
    };
    const small = timed(1000);
    const big = timed(8000);
    expect(big.best / Math.max(small.best, 1)).toBeLessThan(16);
    // Each code row goes to its own line: its unit's.
    const { l, d } = small;
    const row = l.lines.find((r) => rowText(r).includes("const v700 = 700;"))!;
    expect(d.units[row.src - 1]!.text).toContain("const v700 = 700;");
  });

  test("a block too big to diff by words: its changed lines on their sign's tint to the frame's edge, their words more", () => {
    const fence = `\`\`\`js\n${Array.from({ length: 300 }, (_, i) => `const v${i} = ${i}; // about ${i}`).join("\n")}\n\`\`\`\n`;
    const to = fence
      .replace("const v5 = 5;", "const v5x = 5;")
      .replace("const v9 = 9; // about 9\n", "")
      .replace("// about 20\n", "// about 20\n\n");
    const l = layoutBlockDiff(blockDiff(fence, to), { width: 50, glyphs: unicode });
    expect(l.lines.some((r) => /^┌ (removed|added) /.test(rowText(r)))).toBe(false);
    /** A frame's row, found by its label and the row before it: its text and padding, each piece's tint. */
    const tints = (label: string, after: string, k = 1) => {
      const top = l.lines.findIndex((r) => rowText(r).startsWith(`┌ ${label} `));
      const at = l.lines.findIndex((r, i) => i > top && rowText(r).includes(after)) + k - 1;
      return l.lines[at]!.spans.slice(1, -1).map((s) => `${s.text.trim() || "·"}:${s.bg ?? ""}`);
    };
    expect(tints("before", "const v4 =")).toEqual(["const v4 = 4; // about 4:", "·:"]);
    expect(tints("before", "const v5 =")).toEqual([
      "const:diff_del",
      "v5:diff_del_word",
      "= 5; // about 5:diff_del",
      "·:diff_del",
    ]);
    expect(tints("before", "const v9 =")).toEqual(["const v9 = 9; // about 9:diff_del", "·:diff_del"]);
    expect(tints("after", "const v5x =")).toEqual([
      "const:diff_add",
      "v5x:diff_add_word",
      "= 5; // about 5:diff_add",
      "·:diff_add",
    ]);
    // A blank line added: its row on the tint, though it has no text.
    expect(tints("after", "const v20 =", 2)).toEqual(["·:diff_add"]);
    expect(tints("after", "const v21 =")).toEqual(["const v21 = 21; // about 21:", "·:"]);
  });

  test("what no line shows: a dim row, in a note's blocks as in its lines and side by side", () => {
    const from = "# T\n\nalpha one\n\nbeta two\n".replace(/\n/g, "\r\n");
    const to = "# T\n\nalpha one\n\nbeta three";
    const unseen = unseenRows(from, to);
    const [a, b] = [comparable(from), comparable(to)];
    const rows = diffView(a, b, new Set(), 3, unseen);
    const opts = { width: 200, glyphs: unicode, language: null, wrap: true, codeScroll: true };
    for (const l of [
      layoutBlockDiff(blockDiff(a, b, new Set(), { unseen }), { width: 60, glyphs: unicode }),
      layoutDiff(rows, a, b, opts),
      layoutSplitDiff(rows, a, b, opts),
    ]) {
      const said = l.lines.filter((r) => rowText(r).startsWith("\\"));
      expect(said.map((r) => [rowText(r), r.spans.map((s) => s.role)])).toEqual([
        ["\\ line endings: CRLF → LF", ["dim"]],
        ["\\ no newline at end of file", ["dim"]],
      ]);
      expect([l.lines[0], l.lines.at(-1)]).toEqual(said);
    }
  });
});

describe("a code file's diff side by side (GIT-D7)", () => {
  const code = `${Array.from({ length: 20 }, (_, i) => `const line${i + 1} = ${i + 1}; // line ${i + 1}`).join("\n")}\n`;
  const now = code
    .replace("const line2 = 2;", "const line2 = 22;")
    .replace("const line4 = 4; // line 4\n", "")
    .replace("// line 6\n", "// line 6\nconst inserted = true;\n");
  const split = (to: string, o: Partial<Parameters<typeof layoutSplitDiff>[3]> = {}) =>
    layoutSplitDiff(diffView(code, to), code, to, {
      width: 200,
      glyphs: unicode,
      language: "typescript",
      wrap: true,
      codeScroll: true,
      ...o,
    });
  const rowText = (r: Line) => r.spans.map((s) => s.text).join("");

  test("each line beside the one it became: a changed line beside its pair, the unpaired beside nothing, the heads across", () => {
    const l = split(now);
    const rows = l.lines.map((r) => rowText(r).replace(/ {2,}/g, "  ").trimEnd());
    expect(rows.slice(0, 9)).toEqual([
      "@@ line 2",
      "  const line1 = 1; // line 1  │  const line1 = 1; // line 1",
      "- const line2 = 2; // line 2  │ + const line2 = 22; // line 2",
      "  const line3 = 3; // line 3  │  const line3 = 3; // line 3",
      "- const line4 = 4; // line 4  │",
      "  const line5 = 5; // line 5  │  const line5 = 5; // line 5",
      "  const line6 = 6; // line 6  │  const line6 = 6; // line 6",
      "  │ + const inserted = true;",
      "  const line7 = 7; // line 7  │  const line7 = 7; // line 7",
    ]);
    // Two columns of (200 - 8) / 2: the rule after the left's, the right's sign after it.
    expect(splitColumns(200)).toBe(96);
    const pair = l.lines.find((r) => rowText(r).startsWith("- const line2"))!;
    expect(rowText(pair).indexOf("│")).toBe(2 + 96 + 1);
    expect(rowText(pair).indexOf("+ const")).toBe(2 + 96 + 3);
    // Each side on its sign's tint, its changed words more strongly; `enter` there goes to the added line.
    const bgOf = (piece: string) => pair.spans.find((s) => s.text.trim() === piece)?.bg;
    expect([bgOf("-"), bgOf("2"), bgOf("+"), bgOf("22")]).toEqual([
      "diff_del",
      "diff_del_word",
      "diff_add",
      "diff_add_word",
    ]);
    expect(splitRows(diffView(code, now))[2]).toEqual({ left: 2, right: 3, unit: 3 });
    expect(pair.src).toBe(4);
  });

  test("a line too long for its side scrolls, both sides by the one offset; wrapped, each side in its column", () => {
    const tail = ", and a tail long enough to go well past the edge of a column ninety-six wide, to the end";
    const long = now.replace("// line 18\n", `// line 18${tail}\n`);
    const l = split(long);
    const total = stringWidth(`const line18 = 18; // line 18${tail}`);
    const row = l.lines.find((r) => rowText(r).includes("line 18,"))!;
    // Whole: the right's text after the left's, padded to the widest; one block, the heads fixed, a row for its bar.
    expect(row.scroll).toEqual({ x: 2, w: 96, total, right: 2 + total + 5 });
    expect(rowText(row).indexOf("+ const line18")).toBe(2 + total + 3);
    expect(l.lines.find((r) => rowText(r).startsWith("@@"))!.scroll?.part).toBe("top");
    expect(l.lines.at(-1)).toMatchObject({ decor: true, scroll: { part: "bar" } });
    // Where a column is drawn: the right's text `total - w` to the left, both texts less the offset.
    const s = row.scroll!;
    expect([scrolledCol(s, 2, 0), scrolledCol(s, s.right!, 0), scrolledCol(s, s.right!, 10)]).toEqual([
      2,
      2 + 96 + 5,
      2 + 96 + 5 - 10,
    ]);
    expect([
      scrolledInSight(s, 2 + 96, 0),
      scrolledInSight(s, 2 + 96, 10),
      scrolledInSight(s, s.right! + 5, 10),
    ]).toEqual([false, true, false]);
    expect(unscrolledCol(s, 2 + 96 + 5 + 3, 10)).toBe(s.right! + 13);
    expect(unscrolledCol(s, 2 + 96 + 1, 10)).toBe(2 + total + 1); // the rule, fixed
    // `[render] code_wrap = "wrap"`: each side wraps in its own column, the other's rows blank.
    const wrapped = split(long, { codeScroll: false });
    const at = wrapped.lines.findIndex((r) => rowText(r).includes("line 18,"));
    expect(rowText(wrapped.lines[at + 1]!)).toMatch(/^ {98} │ ↪ /);
    expect(wrapped.lines.every((r) => stringWidth(rowText(r)) <= 200)).toBe(true);
  });
});

describe("a screen of diffs: the review's and the merge screen's (GIT-D3, GIT-D5)", () => {
  const rowText = (r: Line) => r.spans.map((s) => s.text).join("");
  test("a note's part as its blocks, a code file's side by side, each row's line counted on from the parts before it", () => {
    const before = "A paragraph that the agent reworded a little.\n";
    const after = "A paragraph that the agent changed a little.\n";
    const blocks = blockDiff(before, after, new Set(), { heads: false, folds: false });
    const code = "const a = 1;\nconst b = 2;\n";
    const now = code.replace("= 2", "= 22");
    const parts: ScreenPart[] = [
      { spans: [{ text: "a head", role: "strong", attrs: 0 }] },
      { blocks },
      { rows: diffView(code, now), from: code, to: now },
    ];
    // The text: a line a row, the blocks' units, then the diff's rows.
    expect(screenText(parts).split("\n")).toEqual([
      "a head",
      "- A paragraph that the agent reworded a little.",
      "+ A paragraph that the agent changed a little.",
      "@@ line 2",
      "  const a = 1;",
      "- const b = 2;",
      "+ const b = 22;",
    ]);
    const l = layoutScreen(parts, {
      width: 200,
      glyphs: unicode,
      language: "typescript",
      wrap: true,
      codeScroll: true,
      split: true,
    });
    const at = (piece: string) => l.lines.find((r) => rowText(r).includes(piece))!;
    expect(at("┌ before").decor).toBe(true);
    expect(at("reworded").src).toBe(2);
    expect(at("changed a little").src).toBe(3);
    expect(at("changed a little").spans.find((s) => s.text.includes("changed"))?.src).toBe(3);
    // Side by side: the pair on one row, standing for the added line; one column, unsplit, without `split`.
    expect(rowText(at("- const b = 2;"))).toMatch(/- const b = 2; +│ \+ const b = 22;/);
    expect(at("- const b = 2;").src).toBe(7);
    const one = layoutScreen(parts, {
      width: 200,
      glyphs: unicode,
      language: "typescript",
      wrap: true,
      codeScroll: true,
    });
    expect(rowText(one.lines.find((r) => rowText(r).includes("- const b"))!).trim()).toBe("- const b = 2;");
  });
});
