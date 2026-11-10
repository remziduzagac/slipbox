import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, spyOn, test } from "bun:test";
import { layoutSource, newSourceCache, scanHeadings } from "../../../../../src/core/rendering/layout/code/source.ts";
import { A_BOLD, A_ITALIC, A_STRIKE, type Layout } from "../../../../../src/core/rendering/layout/ir.ts";
import { layoutDiff } from "../../../../../src/core/rendering/layout/diff/diff.ts";
import { newDiffStyles } from "../../../../../src/core/rendering/layout/diff/diff-styles.ts";
import { composeLive } from "../../../../../src/core/rendering/layout/markdown/live.ts";
import * as parse from "../../../../../src/core/documents/markdown/parse.ts";
import { BACKGROUND_PARSE, stopParsePool } from "../../../../../src/core/documents/markdown/parse-pool.ts";
import { diffView } from "../../../../../src/core/workspace/git/merge/merge.ts";
import { unicode } from "../../../../support/render-layout.ts";
import { makeCoreSandbox } from "../../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

const base = { width: 200, wrap: false, headings: "scan" as const };
const styled = (source: string, o: object = {}) => layoutSource(source, { ...base, styles: {}, ...o });
const plain = (source: string) => layoutSource(source, base);
/** A row as runs: `text|role`, `+attrs` and `/background` where it has them. */
const runs = (l: Layout, row = 0) =>
  l.lines[row]!.spans.map((s) => `${s.text}|${s.role}${s.attrs ? `+${s.attrs}` : ""}${s.bg ? `/${s.bg}` : ""}`);
const rowText = (l: Layout, row = 0) => l.lines[row]!.spans.map((s) => s.text).join("");
const B = A_BOLD;
const I = A_ITALIC;

describe("Markdown's inline styles in SOURCE view (SIS)", () => {
  // Each style: its markers kept, as markup; what they hold drawn as the render draws it.
  const cases: [string, string[]][] = [
    ["a **bold** b", ["a |text", "**|markup", `bold|strong+${B}`, "**|markup", " b|text"]],
    [
      "*it* and _it_",
      ["*|markup", `it|emphasis+${I}`, "*|markup", " and |text", "_|markup", `it|emphasis+${I}`, "_|markup"],
    ],
    ["***both***", ["*|markup", `**|markup+${I}`, `both|emphasis+${B | I}`, `**|markup+${I}`, "*|markup"]],
    ["~~gone~~", ["~~|markup", `gone|strike+${A_STRIKE}`, "~~|markup"]],
    ["==marked==", ["==|markup", "marked|highlight/highlight", "==|markup"]],
    ["`co*de*`", ["`co*de*`|code_inline"]],
    ['[text](u.md "t")', ["[|markup", "text|link", "](|markup", 'u.md "t"|url', ")|markup"]],
    ["<https://a.b>", ["<|markup", "https://a.b|link", ">|markup"]],
    ["[[target|alias]]", ["[[|markup", "target|url", "||markup", "alias|wikilink", "]]|markup"]],
    [
      "![[pic.png]] ![[other]]",
      ["![[|markup", "pic.png|image", "]]|markup", " |text", "![[|markup", "other|embed", "]]|markup"],
    ],
    ["![alt](p.png)", ["![|markup", "alt|image", "](|markup", "p.png|url", ")|markup"]],
    ["#tag and $x^2$", ["#tag|tag", " and |text", "$|markup", "x^2|math", "$|markup"]],
    ["<b>h</b>", ["<b>|html", "h|text", "</b>|html"]],
    ["\\*not\\* %%hidden%%", ["\\|markup", "*not|text", "\\|markup", "* |text", "%%hidden%%|markup"]],
  ];
  for (const [source, want] of cases)
    test(`${source}: markers kept, the text styled`, () => {
      expect(runs(styled(source))).toEqual(want);
    });

  test("the text, its rows and where each cell comes from are as without them: only colours change", () => {
    const note = cases.map(([s]) => s).join("\n\n");
    for (const o of [base, { ...base, width: 9, wrap: true }]) {
      const on = layoutSource(note, { ...o, styles: {} });
      const off = layoutSource(note, o);
      expect(on.lines.map((l) => [l.src, l.srcMap, l.text, l.spans.map((s) => s.text).join("")])).toEqual(
        off.lines.map((l) => [l.src, l.srcMap, l.text, l.spans.map((s) => s.text).join("")]),
      );
      expect(on.headings).toEqual(off.headings);
    }
  });

  test("CommonMark's rules, as the render reads them, not a pattern's", () => {
    // A `*` in a code span, words joined by underscores, a `**` not closed yet, and 2*3*4, whose 3 is emphasis.
    expect(runs(styled("`a*b*c` snake_case_words a **open"))).toEqual([
      "`a*b*c`|code_inline",
      " snake_case_words a **open|text",
    ]);
    expect(runs(styled("2*3*4"))).toEqual(["2|text", "*|markup", `3|emphasis+${I}`, "*|markup", "4|text"]);
    // Emphasis across a paragraph's lines, and across a quote's, past its marks.
    const across = styled("**across\nlines** end\n\n> quoted **bold\n> more** end");
    expect(runs(across, 0)).toEqual(["**|markup", `across|strong+${B}`]);
    expect(runs(across, 1)).toEqual([`lines|strong+${B}`, "**|markup", " end|text"]);
    expect(runs(across, 3)).toEqual([">|quote_bar", " quoted |text", "**|markup", `bold|strong+${B}`]);
    expect(runs(across, 4)).toEqual([">|quote_bar", " |text", `more|strong+${B}`, "**|markup", " end|text"]);
    // A fence's lines are its own: never emphasis.
    expect(runs(styled("```\n**x**\n```"), 1).every((r) => r.endsWith("code_block"))).toBe(true);
  });

  test("in headings, list items, tables, a tab's indent and a CRLF line", () => {
    // A heading's colour stays, bold added; its band behind the markers too.
    expect(runs(styled("# Head **b** `c`"))).toEqual([
      "# Head |h1",
      "**|markup/h1",
      `b|h1+${B}/h1`,
      "**|markup/h1",
      " |h1",
      "`c`|code_inline",
    ]);
    const list = styled("- item **one**\n  - [ ] nested *two*");
    expect(runs(list, 0)).toEqual(["-|list_marker", " item |text", "**|markup", `one|strong+${B}`, "**|markup"]);
    expect(runs(list, 1).slice(-3)).toEqual(["*|markup", `two|emphasis+${I}`, "*|markup"]);
    const table = styled("| a | `b\\|c` |\n|---|---|\n| **x** | y |");
    expect(runs(table, 0)).toEqual([
      "||table_border",
      " a |text",
      "||table_border",
      " |text",
      "`b\\|c`|code_inline",
      " |text",
      "||table_border",
    ]);
    expect(runs(table, 1)).toEqual(["|---|---||table_border"]);
    expect(runs(table, 2).slice(0, 4)).toEqual(["||table_border", " |text", "**|markup", `x|strong+${B}`]);
    // A tab's four cells all its own: the paints after it found by offset. Alone, the line is indented code.
    expect(runs(styled("- a\n\n\t**tab**"), 2)).toEqual(["    |text", "**|markup", `tab|strong+${B}`, "**|markup"]);
    expect(runs(styled("\t**tab**"))).toEqual(["    **tab**|text"]);
    expect(runs(styled("a **b**\r\nc"))).toEqual(["a |text", "**|markup", `b|strong+${B}`, "**|markup"]);
    expect(rowText(styled("a **b**\r\nc"))).toBe(rowText(plain("a **b**\r\nc")));
  });

  test("a footnote or a reference defined elsewhere in the note, as the render's stand-ins read it", () => {
    const note = "See [^1] and [r][ref] and [^none].\n\n# Middle\n\nAgain [^1].\n\n[^1]: the note\n\n[ref]: x.md\n";
    const l = styled(note);
    expect(runs(l, 0)).toEqual([
      "See |text",
      "[^|markup",
      "1|footnote",
      "]|markup",
      " and |text",
      "[|markup",
      "r|link",
      "][|markup",
      "ref|url",
      "]|markup",
      " and [^none].|text",
    ]);
    expect(runs(l, 4)).toEqual(["Again |text", "[^|markup", "1|footnote", "]|markup", ".|text"]);
  });

  test("the note's parse at hand is used, not parsed again; past the limit, nothing is parsed and it says so", () => {
    const note = `# Title\n\n${Array.from({ length: 60 }, (_, i) => `Para **${i}** with [^1].`).join("\n\n")}\n\n[^1]: x\n`;
    const fresh = styled(note);
    const pc = parse.newParseCache();
    parse.parseMarkdown(note, pc);
    // With nothing to parse allowed here, the parse's chunks give every style, its stand-ins' too.
    const cache = newSourceCache();
    expect(JSON.stringify(layoutSource(note, { ...base, styles: { parsed: pc, limit: 0 } }, cache))).toBe(
      JSON.stringify(fresh),
    );
    expect(cache.styles.pending).toBe(false);
    // Without it, nothing is: the note with the light highlighting, pending.
    const none = newSourceCache();
    const waiting = layoutSource(note, { ...base, styles: { limit: 100 } }, none);
    expect(none.styles.pending).toBe(true);
    expect(runs(waiting, 2)).toEqual(["Para **0** with [^1].|text"]);
    // The same layout once it may parse: styled, the rows that didn't change kept.
    expect(JSON.stringify(layoutSource(note, { ...base, styles: {} }, none))).toBe(JSON.stringify(fresh));
    expect(none.styles.pending).toBe(false);
  });

  test("after any edit, the kept styles and rows give exactly a fresh layout", () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
      return (seed >>> 8) % n;
    };
    const pieces = [
      "",
      "text **bold",
      "close** *it*",
      "# Head _x_",
      "- **item**",
      "> quote **q",
      "```",
      "[^1] and [r][ref]",
      "[^1]: note",
      "[ref]: x.md",
      "| a | **b** |",
      "|---|---|",
      "a long **line** that will wrap at the narrow width",
    ];
    for (const [width, wrap] of [
      [14, true],
      [40, false],
    ] as const) {
      const cache = newSourceCache();
      let lines = Array.from({ length: 30 }, () => pieces[rand(pieces.length)]!);
      for (let step = 0; step < 300; step++) {
        const at = rand(lines.length + 1);
        const r = rand(4);
        if (r === 0) lines.splice(at, 0, pieces[rand(pieces.length)]!);
        else if (r === 1 && lines.length > 1) lines.splice(Math.min(at, lines.length - 1), 1);
        else if (at < lines.length) lines[at] = `${lines[at]}${pieces[rand(pieces.length)]!.slice(0, 3)}`;
        else lines = [pieces[rand(pieces.length)]!, ...lines];
        const text = `${lines.join("\n")}\n`;
        const opts = { width, wrap, styles: {} };
        const inc = layoutSource(text, { ...opts, headings: "scan" as const }, cache);
        const fresh = layoutSource(text, { ...opts, headings: scanHeadings(text) });
        expect(JSON.stringify(inc)).toBe(JSON.stringify(fresh));
      }
    }
  });

  test("a diff's lines styled as SOURCE view has them, a changed line's tint behind", () => {
    const filler = Array.from({ length: 12 }, (_, i) => `line ${i}`).join("\n\n");
    const before = `Some **bold** here and [^1].\n\n${filler}\n\n[^1]: the note\n`;
    const now = before.replace("here", "now");
    const l = layoutDiff(diffView(before, now), before, now, {
      width: 80,
      glyphs: unicode,
      language: null,
      wrap: true,
      codeScroll: true,
      styles: newDiffStyles(),
    });
    const row = l.lines.find((x) => rowText({ lines: [x] } as Layout).startsWith("+ "))!;
    const spans = row.spans.map((s) => `${s.text}|${s.role}${s.attrs ? `+${s.attrs}` : ""}${s.bg ? `/${s.bg}` : ""}`);
    expect(spans).toContain("**|markup/diff_add");
    expect(spans).toContain(`bold|strong+${B}/diff_add`);
    // Its footnote's definition is folded away, out of the diff's sight: still a footnote.
    expect(spans).toContain("1|footnote/diff_add");
    const off = layoutDiff(diffView(before, now), before, now, {
      width: 80,
      glyphs: unicode,
      language: null,
      wrap: true,
      codeScroll: true,
    });
    expect(off.lines.map((x) => x.spans.map((s) => s.text).join(""))).toEqual(
      l.lines.map((x) => x.spans.map((s) => s.text).join("")),
    );
  });

  test("a line not styled yet, its parse pending or failed, keeps the light highlighting: code spans, links", () => {
    const paras = Array.from({ length: 30 }, (_, i) => `Para ${i}: \`code ${i}\` and [link](x${i}.md).`);
    const note = `${paras.join("\n\n")}\n\n    \`indented\` code\n`;
    const cache = newSourceCache();
    const waiting = layoutSource(note, { ...base, styles: { limit: 10 } }, cache);
    expect(cache.styles.pending).toBe(true);
    expect(runs(waiting, 0)).toEqual([
      "Para 0: |text",
      "`code 0`|code_inline",
      " and |text",
      "[link](x0.md)|link",
      ".|text",
    ]);
    expect(runs(waiting, 60)).toEqual(runs(plain(note), 60));
    // Styled once it may parse: an indented code block's line, coloured by the pattern, made again as parsed.
    const fresh = styled(note);
    expect(runs(fresh, 60)).toEqual(["    `indented` code|text"]);
    expect(JSON.stringify(layoutSource(note, { ...base, styles: {} }, cache))).toBe(JSON.stringify(fresh));
  });

  /** Sections, each its own chunk of the render's, each paragraph marking a footnote the last defines. */
  const footnoted = (sections: number) => {
    const part = (s: number) => Array.from({ length: 25 }, (_, i) => `Para **${s}.${i}** with [^1].`).join("\n\n");
    const parts = Array.from({ length: sections }, (_, s) => `## Part ${s}\n\n${part(s)}`);
    return `${parts.join("\n\n")}\n\n[^1]: the note\n`;
  };
  /** What `parseChunk` parsed while `f` ran, in characters. */
  const parsedBy = <T>(f: () => T): [T, number] => {
    const spy = spyOn(parse, "parseChunk");
    try {
      const out = f();
      return [out, spy.mock.calls.reduce((n, c) => n + (c[0] as string).length, 0)];
    } finally {
      spy.mockRestore();
    }
  };

  test("the stand-ins' parses count against the budget; the render's parse of them is read, never parsed again", () => {
    const note = footnoted(4);
    const fresh = styled(note);
    // The chunks parsed, as the workers' first round leaves them; their stand-ins not.
    const pc = parse.newParseCache();
    parse.adoptChunks(
      pc,
      parse.noteChunks(note).map((c) => ({ text: c.text, children: parse.parseChunk(c.text, c.first) })),
    );
    expect(parse.standInChunks(note, pc).length).toBeGreaterThan(1);
    const cache = newSourceCache();
    const [waiting, spent] = parsedBy(() => layoutSource(note, { ...base, styles: { parsed: pc, limit: 100 } }, cache));
    expect(cache.styles.pending).toBe(true);
    expect(spent).toBe(0);
    expect(runs(waiting, 2)).toEqual(["Para |text", "**|markup", `0.0|strong+${B}`, "**|markup", " with [^1].|text"]);
    // Their second round: the chunks parsed again with their stand-ins, taken in. Nothing is left to parse here.
    parse.adoptStandIns(
      pc,
      parse.standInChunks(note, pc).map((c) => ({ ...c, children: parse.parseChunk(c.text, c.first) })),
    );
    expect(parse.standInChunks(note, pc)).toEqual([]);
    const [styledNow, none] = parsedBy(() =>
      layoutSource(note, { ...base, styles: { parsed: pc, limit: 0 } }, newSourceCache()),
    );
    expect(none).toBe(0);
    expect(JSON.stringify(styledNow)).toBe(JSON.stringify(fresh));
    // The render's own parse of the note reads them too, parsing nothing.
    const [tree, again] = parsedBy(() => parse.parseMarkdown(note, pc).tree);
    expect(again).toBe(0);
    expect(JSON.stringify(tree)).toBe(JSON.stringify(parse.parseMarkdown(note).tree));
  });

  test("a big note's diff: nothing parsed here past the budget, styled once its parse lands", async () => {
    const lines = Array.from({ length: 3000 }, (_, i) => `Line ${i} with **strong ${i}** words, to fill a row of it.`);
    const big = `${lines.join("\n\n")}\n`;
    expect(big.length).toBeGreaterThan(BACKGROUND_PARSE);
    let landed: () => void = () => {};
    const parsed = new Promise<void>((r) => (landed = r));
    const styles = newDiffStyles(() => landed());
    const opts = { width: 80, glyphs: unicode, language: null, wrap: false, codeScroll: true, styles };
    const rows = diffView("", big);
    const line1 = (l: Layout) => l.lines.find((x) => rowText({ lines: [x] } as Layout).startsWith("+ Line 1 with"))!;
    const [first, spent] = parsedBy(() => layoutDiff(rows, "", big, opts));
    expect(spent).toBe(0);
    expect(line1(first).spans.some((s) => s.attrs)).toBe(false);
    // Laid out again before it lands (a resize): still nothing parsed here.
    expect(parsedBy(() => layoutDiff(rows, "", big, { ...opts, width: 90 }))[1]).toBe(0);
    await parsed;
    expect(styles.version).toBe(1);
    const [after, then] = parsedBy(() => layoutDiff(rows, "", big, opts));
    expect(then).toBe(0);
    expect(line1(after).spans.map((s) => `${s.text}|${s.role}${s.attrs ? `+${s.attrs}` : ""}`)).toContain(
      `strong 1|strong+${B}`,
    );
    stopParsePool();
  });

  test("the lens's rows styled too, its block parsed alone", () => {
    const rendered: Layout = { lines: [], links: [], headings: [], width: 40 };
    const lens = composeLive(rendered, [1, 1], [1, 1], ["a **b** c"], { width: 40, wrap: true, styles: true });
    const row = lens.lines.find((x) => rowText({ lines: [x] } as Layout) === "a **b** c")!;
    expect(row.spans.map((s) => `${s.text}|${s.role}${s.attrs ? `+${s.attrs}` : ""}`)).toEqual([
      "a |text",
      "**|markup",
      `b|strong+${B}`,
      "**|markup",
      " c|text",
    ]);
  });

  test("off, the light highlighting of before", () => {
    expect(runs(plain("a **b** `c`"))).toEqual(["a **b** |text", "`c`|code_inline"]);
  });
});
