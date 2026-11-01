import { describe, expect, test } from "bun:test";
import {
  type Layout,
  type Line,
  scrolledCol,
  scrolledInSight,
  unscrolledCol,
} from "../../../../../src/core/rendering/layout/ir.ts";
import { blockDiff } from "../../../../../src/core/foundation/text/blockdiff.ts";
import { layoutBlockDiff } from "../../../../../src/core/rendering/layout/diff/blockdiff.ts";
import { layoutDiff } from "../../../../../src/core/rendering/layout/diff/diff.ts";
import { layoutSplitDiff, splitColumns, splitRows } from "../../../../../src/core/rendering/layout/diff/splitdiff.ts";
import { layoutScreen, type ScreenPart, screenText } from "../../../../../src/core/rendering/layout/screen.ts";
import { comparable, diffView, unseenRows } from "../../../../../src/core/workspace/git/merge/merge.ts";
import { stringWidth } from "../../../../../src/core/foundation/text/width.ts";
import { unicode, text } from "../../../../support/render-layout.ts";
import { makeRenderSandbox } from "../../../../support/render-sandbox.ts";

makeRenderSandbox();

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
