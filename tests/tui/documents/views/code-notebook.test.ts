import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import { stringWidth } from "../../../../src/core/foundation/text/width.ts";
import { A_BOLD, A_DIM, type Layout, srcAt } from "../../../../src/core/rendering/layout/ir.ts";
import { codeKind } from "../../../../src/core/documents/syntax/syntax.ts";
import { cells } from "../../../../src/tui/documents/editing/cursor.ts";
import { lineOf, offsetOf } from "../../../../src/tui/documents/editing/editing.ts";
import { makeSandbox, makeVault, harness, lineText, statusRow, type Harness, type Opts } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

/** The cursor's column in its source line (the code view's rows map each cell to it). */
function placedColumn(h: Harness): number {
  const v = h.app.view!;
  const l = h.app.currentLayout(v).lines[v.cur.row]!;
  const cs = cells(l);
  return cs.find((c) => v.cur.col >= c.x && v.cur.col < c.x + c.w)?.at ?? 0;
}

describe("code as a notebook (24.x, 24.13)", () => {
  const SAMPLE = [
    'import { readFileSync } from "node:fs";',
    'import { join } from "node:path";',
    'import type { Link } from "./links.ts";',
    "/**",
    " * Resolves a link written in a note: the note it reaches, or `null` when **nothing** matches.",
    " * @param from - the note it's written in",
    " * @param {string} target the link as written",
    " * @returns the link, or null",
    " * @deprecated use `reach` instead",
    " */",
    "export function resolve(from: string, target: string): Link | null {",
    "  if (!target) return null;",
    "  const hit = byName.get(normKey(target)) ?? byPath.get(join(from, target)) ?? byAlias.get(target.toLowerCase()) ?? null;",
    "  return hit;",
    "}",
    "export class Graph {",
    "  private notes = new Map<string, string>();",
    "  /** A note's text, as read. */",
    "  textOf(rel: string): string | undefined {",
    "    return this.notes.get(rel);",
    "  }",
    "",
    "  // Then writing.",
    "",
    '  add(rel: string): void { this.notes.set(rel, readFileSync(rel, "utf8")); }',
    "}",
    "const html = `",
    "<p>one</p>",
    "",
    "",
    "<p>two</p>",
    "`;",
    "const min = 1;",
    "",
  ].join("\n");
  const open = async (opts: Partial<Opts> = {}, file = "sample.ts", text = SAMPLE) => {
    const root = makeVault();
    writeFileSync(join(root, file), text);
    // The whole width the note's: no explorer beside it.
    const config = (c: Config) => ((c.ui.sidebar = false), opts.config?.(c));
    const h = await harness({ root, open: file, width: 100, height: 50, ...opts, config });
    for (let i = 0; i < 200 && h.app.view!.buf.syntax?.version !== h.app.view!.buf.version; i++) {
      h.frame();
      await Bun.sleep(10);
    }
    h.frame();
    return h;
  };
  /** The window's rows as drawn, from its text column. */
  const rows = (h: Harness) => {
    const frame = h.frame();
    const pane = h.app.geometry!.panes[0]!;
    return frame
      .split("\n")
      .slice(pane.y, pane.y + pane.h)
      .map((r) =>
        [...r]
          .slice(pane.textX, pane.x + pane.w - 1)
          .join("")
          .trimEnd(),
      );
  };
  const rowIndex = (h: Harness, text: string) => rows(h).findIndex((r) => r.includes(text));
  const hot = (h: Harness, id: string) => {
    h.frame();
    return h.app.geometry!.hot.find((x) => x.id === id);
  };
  const click = (h: Harness, at: { x: number; y: number }) => {
    for (const type of ["down", "up"]) h.app.mouse.handle({ type, x: at.x, y: at.y, button: 0 });
  };
  const line = (h: Harness) => srcAt(h.app.currentLayout(h.app.view!).lines[h.app.view!.cur.row]!, h.app.view!.cur.col);

  test("a TypeScript file as a notebook: prose at full width; a cell per definition in a box, its header its kind, name, lines and buttons; a class's head, then its methods", async () => {
    const h = await open({ height: 80 });
    const v = h.app.view!;
    expect(v.source).toBeFalsy();
    const r = rows(h);
    expect(r[0]).toBe("▸ imports  node:fs · node:path · ./links.ts (3)");
    // The cell, a blank row before it: its header (its lines its documentation's with its code's), a blank row under
    // it; its documentation — prose, then its terms; a blank row (the two belong together); its code, every token as
    // written. A box has its top and its left line only: no right one, no bottom.
    const head = rowIndex(h, "function: resolve");
    expect(head).toBe(2);
    expect(r[1]).toBe("");
    expect(r[head]).toMatch(/^┌─ function: resolve ─+ 4–15 ⇢ ⧉ ✎ ◎ ▾ ──$/);
    expect(r[head + 1]).toBe("│");
    expect(r[head + 2]).toBe("│ Resolves a link written in a note: the note it reaches, or null when nothing matches.");
    expect(r[head + 3]).toBe("│");
    expect(r.slice(head + 4, head + 8).join("\n")).toMatch(
      /^│ {3}from +the note it's written in\n│ {3}target +the link as written {2}string\n│ {3}returns +the link, or null\n│ {3}deprecated +use reach instead$/,
    );
    expect(r[head + 8]).toBe("│"); // no divider: a blank row
    expect(r[head + 9]).toBe("│ export function resolve(from: string, target: string): Link | null {");
    expect(r[head + 10]).toBe("│   if (!target) return null;");
    expect(r[head + 14]).toBe("│ }");
    expect(r[head + 15]).toBe(""); // the next box's blank row
    expect(r.filter((x) => /[┐┘└]/.test(x))).toEqual([]); // no right corner, no bottom, anywhere
    // Its lines in a colour of their own, brighter than the frame's: its top, its left line (drawn over its rows).
    const canvas = h.canvas();
    const pane = h.app.geometry!.panes[0]!;
    const cellLine = h.app.theme.roles.cell_line.fg!;
    expect(cellLine).not.toBe(h.app.theme.roles.border.fg);
    for (const y of [head, head + 2]) expect(canvas.styles[pane.y + y]![pane.textX]!.fg).toBe(cellLine);
    const layout = h.app.currentLayout(v);
    const top = layout.lines.findIndex((l) => l.decor && l.spans.some((sp) => sp.text === "resolve"));
    expect(layout.lines[top + 1]!.decor).toBe(true); // the blank row: decoration, no cursor stop
    // The class: a cell of its head; its methods each a cell, at their indentation, a method's doc above it; its brace.
    // The tree's lines, as the explorer's, join them: the class's left line on down, to each member's box a row under
    // its top, by its name — the same row for every one, its corner kept.
    const graph = rowIndex(h, "class: Graph");
    expect(graph).toBe(head + 16);
    expect(r[graph]).toMatch(/^┌─ class: Graph ─+ 16–17 ⇢ ⧉ ✎ ◎ ▾ ──$/);
    expect(r[graph + 3]).toBe("│   private notes = new Map<string, string>();");
    expect(r[graph + 4]).toBe("│"); // a member's blank row, on the class's line
    const textOf = rowIndex(h, "method: textOf");
    expect(textOf).toBe(graph + 5);
    expect(r[textOf]).toMatch(/^│ ┌─ method: textOf ─+ 18–21 ⇢ ⧉ ✎ ◎ ▾ ──$/);
    expect(r[textOf + 1]).toBe("├─┤"); // a row under its top, its left line drawn into the row
    for (const [y, x] of [
      [graph + 4, 0],
      [textOf + 1, 0],
      [textOf + 1, 2],
    ] as const)
      expect(canvas.styles[pane.y + y]![pane.textX + x]!.fg).toBe(cellLine); // the tree's lines, its joints
    expect(r[textOf + 2]).toBe("│ │ A note's text, as read.");
    expect(r[textOf + 3]).toBe("│ │"); // the blank row between its documentation and its code
    expect(r[textOf + 4]).toBe("│ │ textOf(rel: string): string | undefined {"); // its rows from its own edge
    // A comment that documents nothing: prose in a box of its own, at its indentation, its header its mark alone and
    // its buttons (no references: it defines nothing).
    const loose = rowIndex(h, "Then writing");
    expect(r.slice(loose - 2, loose + 2)).toEqual([
      "│",
      expect.stringMatching(/^│ ┌─ ¶ ─+ 23 ⧉ ✎ ◎ ▾ ──$/),
      "├─┤ Then writing.",
      "│",
    ]);
    expect(r[loose - 1]!.length).toBe(r[head]!.length); // its top to the edge
    expect(r[rowIndex(h, "method: add")]).toMatch(/^│ ┌─ method: add ─+ 25 ⇢ ⧉ ✎ ◎ ▾ ──$/);
    expect(r[rowIndex(h, "method: add") + 1]).toBe("├─┤"); // the last: the line on to the class's brace
    expect(r[rowIndex(h, "method: add") + 2]).toMatch(/^│ │ add\(rel: string\)/);
    // The class's closing brace: a row of the class's, on its left line — no box of its own — a blank row before it,
    // as after any box that no box follows.
    expect(r.slice(rowIndex(h, "method: add") + 3, rowIndex(h, "method: add") + 6)).toEqual(["│", "│ }", ""]);
    const brace = h.app.currentLayout(v).lines.find((l) => l.src === 26 && l.srcMap)!;
    expect(brace.spans.filter((sp) => sp.text.trim()).every((sp) => sp.attrs & 16)).toBe(true); // the class's closing brace, dimmed
    // Statements together: the values' names, no references (they're no definition); a string's blank lines its own.
    const vals = rowIndex(h, "html · min");
    expect(r[vals]).toMatch(/^┌─ • html · min ─+ 27–33 ⧉ ✎ ◎ ▾ ──$/);
    expect(r.slice(vals + 3, vals + 7).map((x) => x.replace(/^│ ?/, ""))).toEqual(["<p>one</p>", "", "", "<p>two</p>"]);
    // The name bold, what's before it dim, a brace dim; the rows of code the file's, cell by cell.
    const sig = h.app.currentLayout(v).lines.find((l) => l.src === 11 && l.srcMap)!;
    expect(sig.spans.find((sp) => sp.text.includes("resolve"))!.attrs & 1).toBe(1);
    expect(sig.spans.find((sp) => sp.text.includes("export"))!.attrs & 16).toBe(16);
    expect(sig.frame).toBeDefined();
    // The cursor on a cell's row is on its text, never on its border or padding.
    const sigRow = h.app.currentLayout(v).lines.indexOf(sig);
    h.app.moveCursor(v, { row: sigRow, col: 0 });
    expect(v.cur.col).toBe(2);
    // The outline's: the definitions, a class's methods under it — each at its cell's first row of code.
    expect(h.app.currentLayout(v).headings.map((x) => `${x.level} ${x.text}`)).toEqual([
      "1 resolve",
      "1 Graph",
      "2 textOf",
      "2 add",
    ]);
    for (const x of h.app.currentLayout(v).headings) expect(h.app.currentLayout(v).lines[x.line]!.srcMap).toBeDefined();
    // Its cells, for their buttons and keys.
    expect(h.app.currentLayout(v).cells!.map((c) => `${c.title} ${c.from}-${c.to}`)).toEqual([
      "resolve 4-15",
      "Graph 16-17",
      "textOf 18-21",
      "comment 23-23",
      "add 25-25",
      "html · min 27-33",
    ]);
    // The cursor on a cell's prose is on its text too, never its border.
    const prose = h.app
      .currentLayout(v)
      .lines.findIndex((l) => l.text && !l.srcMap && l.spans.some((sp) => sp.text.includes("Resolves")));
    h.app.moveCursor(v, { row: prose, col: 0 });
    expect(v.cur.col).toBe(2);
  });

  test("the tree's lines, as the explorer's: a class's members two columns in, however far the file indents them; a class in a class its own tree", async () => {
    const NEST = [
      "class Outer:",
      "    x = 1",
      "",
      "    def one(self):",
      "        pass",
      "",
      "    class Inner:",
      "        y = 2",
      "",
      "        def two(self):",
      "            pass",
      "",
    ].join("\n");
    const h = await open({ height: 60 }, "nest.py", NEST);
    const r = rows(h);
    const outer = rowIndex(h, "class: Outer");
    expect(r.slice(outer, outer + 19).map((x) => x.replace(/─{3,}.*$/, "─"))).toEqual([
      "┌─ class: Outer ─",
      "│",
      "│ class Outer:",
      "│     x = 1",
      "│", // a member's blank row, on the class's left line going on down
      "│ ┌─ method: one ─",
      "├─┤", // a row under its top, by its name
      "│ │ def one(self):",
      "│ │     pass",
      "│",
      "│ ┌─ class: Inner ─",
      "└─┤", // the last of its members: its line ends here; Inner's own tree from Inner's left line
      "  │ class Inner:",
      "  │     y = 2",
      "  │",
      "  │ ┌─ method: two ─",
      "  └─┤",
      "    │ def two(self):",
      "    │     pass",
    ]);
    // Too narrow for a member to sit further in: no tree, the boxes as they are.
    const narrow = h.app
      .view!.buf.codeLayout(28, true, h.app.glyphs)
      .lines.map((l) => l.spans.map((sp) => sp.text).join(""));
    // (Its word the first to go: its name fits.)
    expect(narrow.find((x) => x.includes(" one "))).toStartWith("┌─ one ");
    expect(narrow.find((x) => x.includes("Outer"))).toStartWith("┌─ Outer ");
  });

  test("a class's closing brace a row on its line, from its own edge; what's after its last method else its members' cells", async () => {
    // A class indented in the file (in a namespace): its closing brace from its own edge, as its cells are.
    const NS = ["export namespace N {", "  export class A {", "    m(): void {}", "  }", "}", ""].join("\n");
    let r = rows(await open({}, "ns.ts", NS));
    const m = r.findIndex((x) => x.includes("method: m"));
    expect(r.slice(m + 3, m + 6)).toEqual(["│", "│ }", ""]);
    // A field after the last method, braces in it: a member's cell; only the brace on its own line is the closing.
    r = rows(
      await open({}, "b.ts", ["export class B {", "  m(): void {}", "  static empty = {};", "}", ""].join("\n")),
    );
    expect(r.find((y) => y.includes("static empty"))).toMatch(/^│ │ static empty = \{\};$/);
    expect(r.filter((y) => /^│ \}$/.test(y))).toHaveLength(1);
    // Python's class has no closing: a value after its last method is a member's cell, on the tree.
    const PY = ["class A:", "    def m(self):", "        pass", "", "    x = 1", ""].join("\n");
    r = rows(await open({}, "a.py", PY));
    const x = r.findIndex((y) => y.includes("─ code ─"));
    expect(r[x]).toMatch(/^│ ┌─ code ─+ 5 ⧉ ✎ ◎ ▾ ──$/);
    expect(r[x + 1]).toBe("└─┤");
    expect(r[x + 2]).toBe("  │ x = 1");
  });

  test("a cell folds to its header — z a, space k f, its ▾ — and opens again; the imports fold on enter", async () => {
    const h = await open();
    const v = h.app.view!;
    h.app.placeAtLine(v, 13);
    await h.keys("z", "a");
    let r = rows(h);
    expect(r[rowIndex(h, "function: resolve")]).toMatch(/ 4–15 ⇢ ⧉ ✎ ◎ ▸ ──$/);
    expect(r.slice(rowIndex(h, "function: resolve") + 1, rowIndex(h, "function: resolve") + 3)).toEqual([
      "",
      expect.stringMatching(/^┌─ class: Graph /),
    ]); // its header alone
    expect(rowIndex(h, "if (!target)")).toBe(-1);
    // Its button: open again.
    const fold = hot(h, "cell:fold:4")!;
    click(h, fold);
    expect(rowIndex(h, "if (!target)")).toBeGreaterThan(0);
    // A member folded: the tree's line meets its box at its top.
    h.app.placeAtLine(v, 19);
    await h.keys("z", "a");
    expect(rows(h)[rowIndex(h, "method: textOf")]).toMatch(/^├─┬─ method: textOf ─+ 18–21 ⇢ ⧉ ✎ ◎ ▸ ──$/);
    // A class folded: its methods with it.
    h.app.placeAtLine(v, 16);
    await h.keys("space", "k", "f");
    expect(rowIndex(h, "method: textOf")).toBe(-1);
    // The imports: enter on their row.
    h.app.moveCursor(v, { row: 0, col: 0 });
    await h.keys("enter");
    r = rows(h);
    expect(r.slice(0, 2)).toEqual(["▾ imports (3)", 'import { readFileSync } from "node:fs";']);
  });

  test("z a folds the cell at the cursor and z a again opens it: a folded cell's header is the cursor's stop", async () => {
    const h = await open();
    const v = h.app.view!;
    const onRow = () =>
      h.app
        .currentLayout(v)
        .lines[v.cur.row]!.spans.map((s) => s.text)
        .join("");
    h.app.placeAtLine(v, 13);
    await h.keys("z", "a");
    expect(rowIndex(h, "if (!target)")).toBe(-1);
    expect(onRow()).toContain("function: resolve"); // on its header, the cell's one row
    await h.keys("z", "a");
    expect(rowIndex(h, "if (!target)")).toBeGreaterThan(0);
    expect(rowIndex(h, "class: Graph")).toBeGreaterThan(0); // the next cell as it was
    // Folded again: j leaves its header, k comes back to it, as to a line.
    await h.keys("z", "a");
    await h.keys("j");
    expect(onRow()).not.toContain("function: resolve");
    await h.keys("k");
    expect(onRow()).toContain("function: resolve");
  });

  test("a cell's buttons: copy its lines, edit it in the lens, add it to the scratch, its problems, where it's used", async () => {
    // The lens's least size one line: ✎'s lens is the cell's own lines, not its neighbours'.
    const h = await open({ config: (c) => ((c.editor.edit_in = "live"), (c.editor.lens_min_rows = 1)) });
    const v = h.app.view!;
    const lines = v.buf.lines();
    // ⧉: its lines, as the file has them.
    click(h, hot(h, "cell:copy:4")!);
    expect(h.copied.at(-1)).toBe(lines.slice(3, 15).join("\n")); // its documentation with its code
    expect(h.app.messages.at(-1)!.text).toBe("copied resolve — lines 4–15");
    // ✎: the lens on it, its lines whole.
    click(h, hot(h, "cell:edit:18")!);
    expect(v.live).toBe(true);
    const lens = h.app
      .currentLayout(v)
      .lines.filter((l) => l.lens === "source")
      .map((l) => l.src);
    expect([lens[0], lens.at(-1)]).toEqual([18, 22]); // its lines, and the blank line its last block takes
    await h.keys("escape", "escape");
    // ◎: the scratch, with its path and lines.
    click(h, hot(h, "cell:scratch:4")!);
    expect(h.app.messages.at(-1)!.text).toBe(
      "resolve — lines 4–15 added to the scratch; add a note, esc then q closes it",
    );
    expect(readFileSync(h.app.scratch.location().path, "utf8")).toContain("sample.ts:4-15");
    // Shown in the scratch, floating, typing its note (#43, D229); esc then q, back at the cell.
    expect([
      h.app.floating?.kind,
      h.app.view!.insert,
      h.app.view!.buf.source.split("\n")[lineOf(h.app.view!, offsetOf(h.app, h.app.view!)) - 1],
    ]).toEqual(["scratch", true, "**Note:** "]);
    await h.keys("escape", "q");
    expect(h.app.floating).toBeNull();
    // ⚠: a problem in it — counted on its header, the panel on it.
    const warning = (line: number, message: string) => ({
      start: { line, column: 3 },
      end: { line, column: 6 },
      severity: "warning" as const,
      source: "fake",
      code: null,
      message,
    });
    v.buf.serverProblems.set("fake", {
      version: v.buf.version,
      raw: [],
      list: [warning(2, "before it"), warning(13, "a warning"), warning(25, "after it")],
    });
    v.layoutKey = "";
    h.app.dismissToasts(); // the messages' boxes off the header
    expect(rows(h)[rowIndex(h, "function: resolve")]).toMatch(/ 4–15 ⚠ ⇢ ⧉ ✎ ◎ ▾ ──$/);
    click(h, hot(h, "cell:problems:4")!);
    expect(h.app.problems.panel).toMatchObject({ shown: true, tab: "file" });
    expect(h.app.problems.fileRows()[h.app.problems.panel.file.selected]!.message).toBe("a warning");
    // ⇢: from its name.
    h.app.problems.close();
    click(h, hot(h, "cell:references:4")!);
    expect(line(h)).toBe(11);
    expect(v.buf.lines()[10]!.slice(placedColumn(h))).toStartWith("resolve(");
    // A comment's box has them too, but where it's used: it defines nothing.
    expect(hot(h, "cell:references:23")).toBeUndefined();
    click(h, hot(h, "cell:copy:23")!);
    expect(h.copied.at(-1)).toBe("  // Then writing.");
    click(h, hot(h, "cell:fold:23")!);
    h.app.dismissToasts();
    expect(rowIndex(h, "Then writing")).toBe(-1);
    expect(rows(h)[rowIndex(h, "─ ¶ ─")]).toMatch(/ 23 ⧉ ✎ ◎ ▸ ──$/);
  });

  test("a problem across a cell's lines marks its text only — never its header, its borders or its padding", async () => {
    const h = await open();
    const v = h.app.view!;
    // An error over the whole function, its first line to its last.
    v.buf.serverProblems.set("fake", {
      version: v.buf.version,
      raw: [],
      list: [
        {
          start: { line: 11, column: 1 },
          end: { line: 15, column: 2 },
          severity: "error",
          source: "fake",
          code: null,
          message: "wrong",
        },
      ],
    });
    v.layoutKey = "";
    const c = h.canvas();
    const lines = c.toString().split("\n");
    const red = h.app.theme.roles.problem_error;
    const marked = (y: number, x: number) => {
      const st = c.styles[y]![x]!;
      return (red.fg !== undefined && st.fg === red.fg) || (red.underline === true && st.underline === true);
    };
    const pane = h.app.geometry!.panes[0]!;
    const y = (text: string) => lines.findIndex((l, i) => i >= pane.y && l.includes(text));
    const header = y("function: resolve");
    const sig = y("export function resolve");
    const between = sig - 1; // the blank row between its documentation and its code
    const next = y("class: Graph");
    const x = (row: number, text: string) => [...lines[row]!.slice(0, lines[row]!.indexOf(text))].length;
    expect(marked(sig, x(sig, "export"))).toBe(true); // the text
    // The header's border and title, the divider, the next box's top under the last line (its ⚠ button is red on
    // purpose).
    for (let k = pane.textX; k < pane.textX + 20; k++) expect(marked(header, k)).toBe(false);
    for (const row of [between, next])
      for (let k = pane.textX; k < pane.x + pane.w - 1; k++) expect(marked(row, k)).toBe(false);
    expect(marked(sig, x(sig, "{") + 2)).toBe(false); // the padding after the row's text
    expect(marked(sig, pane.textX)).toBe(false); // the border
  });

  test("a path in a comment's prose is a link, as in source mode: drawn as one, enter follows it (to its line); a note beside code too", async () => {
    const TOOL =
      "// See notes/alpha.md:7 for the plan.\nexport function plan() {\n  return 1; // and notes/beta.md\n}\n\n// Standing alone, `notes/beta.md` and notes/missing.md; [the docs](https://example.com).\n\nconst x = 1;\n";
    const h = await open({}, "tool.ts", TOOL);
    const layout = () => h.app.currentLayout(h.app.view!);
    /** The cursor on `needle`, in the first row of the code view holding `rowHas`: that row. */
    const onText = (rowHas: string, needle: string) => {
      const lines = layout().lines;
      const row = lines.findIndex((l) =>
        l.spans
          .map((s) => s.text)
          .join("")
          .includes(rowHas),
      );
      expect(row).toBeGreaterThanOrEqual(0);
      const text = lines[row]!.spans.map((s) => s.text).join("");
      h.app.moveCursor(h.app.view!, { row, col: stringWidth(text.slice(0, text.indexOf(needle))) + 1 });
      return lines[row]!;
    };
    // Drawn as links: the documentation's path, the box of its own's (in backticks too); a path to nothing isn't one.
    expect(
      layout()
        .links.filter((l) => l.target.startsWith("/notes/"))
        .map((l) => [l.target, l.text]),
    ).toEqual([
      ["/notes/alpha.md#L7", "notes/alpha.md:7"],
      ["/notes/beta.md", "notes/beta.md"],
    ]);
    // In the order they're drawn, a Markdown link's among them: the next link from the top is the first path.
    expect(layout().links.map((l) => l.target)).toEqual([
      "/notes/alpha.md#L7",
      "/notes/beta.md",
      "https://example.com",
    ]);
    h.app.moveCursor(h.app.view!, { row: 0, col: 0 });
    await h.app.run("link.next");
    expect(line(h)).toBe(1);
    const doc = onText("See notes/alpha.md", "notes/alpha.md");
    expect(doc.srcMap).toBeUndefined(); // a row of prose, not of code
    expect(doc.spans.find((s) => s.text === "notes/alpha.md:7")!.role).toBe("link");
    // The note beside the code: its row is code's, drawn as source mode draws a comment's link.
    expect(onText("and notes/beta.md", "notes/beta.md").srcMap).toBeDefined();
    const c = h.canvas();
    const frame = c.toString().split("\n");
    const y = frame.findIndex((r) => r.includes("and notes/beta.md"));
    const x = [...frame[y]!.slice(0, frame[y]!.indexOf("notes/beta.md"))].length;
    expect(c.styles[y]![x]!.fg).toBe(h.app.theme.roles.link.fg!);
    // enter on the documentation's path: the note, at its line.
    onText("See notes/alpha.md", "notes/alpha.md");
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    expect(line(h)).toBe(7);
    // The box of its own's, in backticks.
    await h.app.run("note.open tool.ts");
    expect(onText("Standing alone", "notes/beta.md").srcMap).toBeUndefined();
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
  });

  test("slipbox's own syntax errors, no server having spoken: marked on the text, the line's number red, counted in the cell's header and the status line", async () => {
    const h = await open(
      { config: (c) => (c.ui.line_numbers = true) },
      "broken.ts",
      "export function total(a: number) {\n  return a +;\n}\n\nexport const fine = 1;\n",
    );
    const v = h.app.view!;
    expect(v.source).toBeFalsy(); // the code view
    expect(v.buf.syntax!.errors.length).toBeGreaterThan(0);
    expect(h.app.problems.ofView(v).map((p) => p.source)).toContain("syntax");
    h.app.dismissToasts();
    // The cell's header counts them, its ⚠ button the panel's; the other cell has none.
    expect(hot(h, "cell:problems:1")).toBeDefined();
    expect(hot(h, "cell:problems:5")).toBeUndefined();
    // The mark on the line's text, in the syntax error's own role; its number red.
    const c = h.canvas();
    const lines = c.toString().split("\n");
    const at = lines.findIndex((l) => l.includes("return a +;"));
    const mark = h.app.theme.roles.syntax_error;
    const cols = [...lines[at]!].map((_, k) => c.styles[at]![k]!);
    expect(cols.some((st) => st.underline && (mark.fg === undefined || st.fg === mark.fg))).toBe(true);
    const num = [...lines[at]!].indexOf("2");
    expect(c.styles[at]![num]!.fg).toBe(h.app.theme.roles.error.fg!);
    expect(statusRow(h.frame())).toMatch(/✖ \d+/);
    // Once a server has said what it finds, its errors stand in for slipbox's.
    v.buf.serverProblems.set("fake", { version: v.buf.version, raw: [], list: [] });
    v.layoutKey = "";
    expect(h.app.problems.ofView(v)).toEqual([]);
    expect(hot(h, "cell:problems:1")).toBeUndefined();
  });

  test("boxes or bands: space u c; a band's header and code on a tint, no borders", async () => {
    const h = await open();
    await h.keys("space", "u", "c");
    expect(h.app.messages.at(-1)!.text).toBe("Code cells: bands");
    h.app.dismissToasts(); // the messages' boxes off the header
    const r = rows(h);
    const head = rowIndex(h, "function: resolve");
    expect(r[head]).toMatch(/^ function: resolve +4–15 ⇢ ⧉ ✎ ◎ ▾$/);
    expect(r[rowIndex(h, "method: textOf")]).toMatch(/^├─ method: textOf +18–21 /); // the tree's lines, bands or boxes: to its header
    expect(r[rowIndex(h, "class: Graph") - 1]).toBe(" }"); // bands touch: a band's header is a tint of its own
    expect(r[rowIndex(h, "method: textOf") + 3]).toMatch(/^│ {2}textOf\(rel/); // the line on past its rows
    expect(r[rowIndex(h, "private notes")]).toMatch(/^ {3}private notes/); // from the class's band, no corner to turn
    expect(r[head + 1]).toStartWith(" Resolves a link");
    expect(r[r.findIndex((x) => x.includes("export function resolve"))]).toStartWith(" export function resolve(");
    const layout = h.app.currentLayout(h.app.view!);
    expect(layout.lines.find((l) => l.src === 12 && l.srcMap)!.fill).toBe("code_block");
    expect(layout.lines.find((l) => l.src === 12 && l.srcMap)!.frame).toBeUndefined();
    // The class's closing brace on a band of its own, no line to it (no corner to turn).
    const brace = layout.lines.find((l) => l.src === 26 && l.srcMap)!;
    expect([
      brace.fill,
      brace.spans
        .map((sp) => sp.text)
        .join("")
        .trimEnd(),
    ]).toEqual(["code_block", " }"]);
    expect(layout.lines[layout.lines.indexOf(brace) - 1]!.srcMap).toBeDefined(); // right under the last member's band
    expect(r.some((x) => x.includes("┌"))).toBe(false);
    await h.keys("space", "u", "c");
    expect(h.app.messages.at(-1)!.text).toBe("Code cells: boxes");
  });

  test("a long line breaks at its structure inside its cell, its rest under its own indent; each row's cells still the file's", async () => {
    const h = await open({ width: 90 });
    const v = h.app.view!;
    const r = rows(h);
    const i = rowIndex(h, "const hit");
    expect(r[i]).toMatch(/^│ {3}const hit = byName\.get\(normKey\(target\)\)$/);
    expect(r[i + 1]).toMatch(/^│ {7}\?\? byPath\.get\(join\(from, target\)\)$/);
    const layout = h.app.currentLayout(v);
    // The status line's column is the file's: on `const`, its column in its line, the cell's border and padding not
    // counted.
    h.app.moveCursor(v, { row: i, col: r[i]!.indexOf("const") });
    expect(statusRow(h.frame())).toContain(` L13:${v.buf.lines()[12]!.indexOf("const") + 1} `);
    const row = layout.lines.findIndex((l) => l.src === 13) + 1;
    const line13 = v.buf.lines()[12]!;
    const col = [...layout.lines[row]!.spans.map((sp) => sp.text).join("")].join("").indexOf("??");
    expect(layout.lines[row]!.srcMap!.cells[col]).toBe(line13.indexOf("?? byPath"));
    h.app.moveCursor(v, { row, col });
    expect(v.cur).toEqual({ row, col });
    // Copied, it's the file's text, never its rows, borders or guides.
    h.app.views.select(v, { row: row - 1, col: 0 }, true);
    h.app.moveCursor(v, { row, col: 0 }, { extend: true });
    expect(h.app.views.selectionText(v)).toBe(line13);
    // ]]: from one definition to the next.
    v.sel = null;
    h.app.moveCursor(v, { row: 0, col: 0 });
    await h.keys("]", "]");
    expect(h.app.currentLayout(v).lines[v.cur.row]!.src).toBe(11);
    // Wrapping off: the line runs on, one row.
    await h.keys("space", "u", "w");
    expect(h.app.currentLayout(v).lines.filter((l) => l.src === 13 && l.srcMap)).toHaveLength(1);
  });

  test("the lens opens on the cursor's cell whole when it fits: a function with its documentation, a class's head; it moves to the next whole; a cell too tall, its lines", async () => {
    const h = await open();
    const v = h.app.view!;
    const lens = () => {
      const src = h.app
        .currentLayout(v)
        .lines.filter((l) => l.lens === "source")
        .map((l) => l.src);
      return [src[0], src.at(-1)];
    };
    // In a function: its JSDoc, its lines (no neighbours to make up the lens's least rows).
    h.app.placeAtLine(v, 12);
    await h.keys("space", "n", "l");
    expect(lens()).toEqual([4, 15]);
    await h.keys("escape");
    // On a class's line: its head — its line and its fields, up to its first member.
    h.app.placeAtLine(v, 16);
    await h.keys("space", "n", "l");
    expect(lens()).toEqual([16, 17]);
    // Past its edge: the next cell, whole — the lens moves to it rather than gathering it.
    await h.keys("j", "j");
    expect(lens()).toEqual([18, 22]); // a method with its doc comment, and the blank line after it
    await h.keys("escape");
    // Too tall for the lens's most (lens_max of the window): its lines, as before — the cursor's and its neighbours.
    const small = await open({ config: (c) => (c.editor.lens_max = 0.1) });
    small.app.placeAtLine(small.app.view!, 12);
    await small.keys("space", "n", "l");
    const rows = small.app
      .currentLayout(small.app.view!)
      .lines.filter((l) => l.lens === "source")
      .map((l) => l.src);
    expect(rows).toContain(12);
    expect(rows[0]).toBeGreaterThan(4);
  });

  test("the lens: the cursor's line as written, highlighted as code; esc esc back to the notebook", async () => {
    const h = await open({ config: (c) => (c.editor.edit_in = "live") });
    const v = h.app.view!;
    h.app.placeAtLine(v, 19, 3);
    await h.keys("i");
    expect(v.live).toBe(true);
    expect(h.app.messages.some((m) => m.text.startsWith("the lens:"))).toBe(false);
    const lens = h.app.currentLayout(v).lines.filter((l) => l.lens === "source");
    expect(lens.map(lineText)).toContain("    return this.notes.get(rel);");
    expect(lens.find((l) => l.src === 20)!.spans.find((sp) => sp.text.includes("return"))!.role).toBe("syn_keyword");
    expect(rows(h).some((x) => /^┌─ class: Graph ─/.test(x))).toBe(true); // around it, the notebook
    await h.keys("i", "x", "escape", "escape");
    expect(v.live).toBeFalsy();
    for (let k = 0; k < 200 && v.buf.syntax?.version !== v.buf.version; k++) {
      h.frame();
      await Bun.sleep(10);
    }
    expect(rows(h)[rowIndex(h, "method: xtextOf")]).toMatch(/^│ ┌─ method: xtextOf ─/);
  });

  test("space n v: source and back; edit_in = source: editing goes to source; [render] code = source; Go in source", async () => {
    const h = await open();
    const v = h.app.view!;
    await h.keys("space", "n", "v");
    expect(v.source).toBe(true);
    expect(h.app.messages.some((m) => m.text.startsWith("source —"))).toBe(false);
    expect(h.app.currentLayout(v).cells).toBeUndefined();
    await h.keys("space", "n", "v");
    expect(v.source).toBeFalsy();
    expect(h.app.messages.some((m) => m.text === "the code as a document")).toBe(false);
    await h.keys("i");
    expect(v.source).toBe(true);
    expect(v.insert).toBe(true); // to source mode, typing at once: no lens to show first
    expect(h.app.messages.some((m) => m.text.startsWith("source —"))).toBe(false);
    const plain = await open({ config: (c) => (c.render.code = false) });
    expect(plain.app.view!.source).toBe(true);
    // Go is drawn as a document (24.9); CSS, which has no definitions to be cells, in source mode.
    const go = await open({}, "tool.go", "package main\n\nfunc f() int { return 1 }\n");
    expect(go.app.view!.source).toBeFalsy();
    const css = await open({}, "site.css", "a {\n  color: red;\n}\n");
    expect(css.app.view!.source).toBe(true);
    // A cell's key outside a cell, or in source mode: said.
    await css.keys("z", "a");
    expect(css.app.messages.at(-1)!.text).toStartWith("a cell is the code view's");
  });

  test("a header says what it is in its language's word, in every glyph set: `function: resolve`, `class: Graph`", async () => {
    for (const glyphs of ["ascii", "nerd", "unicode"] as const) {
      const h = await open({ config: (c) => (c.render.glyphs = glyphs) });
      expect(rows(h)[rowIndex(h, "resolve ")]).toContain(" function: resolve ");
      expect(rows(h)[rowIndex(h, "Graph ")]).toContain(" class: Graph ");
      expect(rows(h)[rowIndex(h, "textOf ")]).toContain(" method: textOf ");
    }
  });
  describe("every grammar with definitions, by its own queries (24.9)", () => {
    const view = async (file: string, text: string, width = 100) => {
      const h = await open({ width }, file, text);
      return { h, layout: h.app.currentLayout(h.app.view!), text: rows(h).join("\n") };
    };
    const cellsOf = (l: Layout) => (l.cells ?? []).map((c) => `${c.title} ${c.from}–${c.to}`);
    test("each cell's header in its language's words: a struct, an impl, a trait, an interface, a function, a method", async () => {
      const heads = async (file: string, text: string) => {
        const h = await open({ width: 120 }, file, text);
        return rows(h)
          .filter((r) => r.includes("┌─"))
          .map((r) => /┌─ ([^─]+?) ─/.exec(r)![1]!);
      };
      expect(
        await heads(
          "w.rs",
          "pub struct F {}\npub enum E { A }\npub trait T {\n    fn t(&self);\n}\nimpl F {\n    pub fn new() -> Self { F {} }\n}\nfn free() {}\n",
        ),
      ).toEqual(["struct: F", "enum: E", "trait: T", "impl: F", "method: new", "function: free"]);
      expect(
        await heads(
          "w.go",
          "package w\n\ntype S struct{}\n\ntype I interface{}\n\ntype N int\n\nfunc (s S) M() {}\n\nfunc F() {}\n",
        ),
      ).toEqual(["code", "struct: S", "interface: I", "type: N", "method: M", "function: F"]);
      expect(
        await heads(
          "w.ts",
          "interface I {}\ntype T = number;\nenum E { A }\nconst f = () => 1;\nclass C {\n  m(): void {}\n}\nfunction* gen() {}\nabstract class A {}\n",
        ),
      ).toEqual([
        "interface: I",
        "type: T",
        "enum: E",
        "function: f",
        "class: C",
        "method: m",
        "function: gen",
        "class: A",
      ]);
      expect(
        await heads(
          "w.py",
          "def f():\n    pass\n\nclass C:\n    def m(self):\n        pass\n\nclass D:\n    x = 1\n\ndef g():\n    pass\n",
        ),
      ).toEqual(["function: f", "class: C", "method: m", "class: D", "function: g"]);
      expect(
        await heads(
          "w.swift",
          "struct P {\n    func area() -> Int { 1 }\n}\n\ntypealias Size = Int\n\nprotocol Q {\n    func q()\n}\n",
        ),
      ).toEqual(["struct: P", "method: area", "type: Size", "protocol: Q", "method: q"]);
      expect(await heads("m.rs", "mod inner {\n    fn f() {}\n}\n")).toEqual(["module: inner", "function: f"]); // a module's are functions
      expect(await heads("n.cpp", "namespace n {\nint g() { return 1; }\n}\n")).toEqual([
        "namespace: n",
        "function: g",
      ]);
      expect(await heads("w.cpp", "namespace n {\nclass K {\n public:\n  void k();\n};\n}\n")).toEqual([
        "namespace: n",
        "class: K",
        "method: k",
      ]);
      expect(await heads("w.c", "typedef int age;\nint add(int a);\n")).toEqual(["type: age", "function: add"]);
      expect(await heads("w.rb", "class R\n  def self.make\n  end\nend\nmodule M\nend\n")).toEqual([
        "class: R",
        "method: make",
        "module: M",
      ]);
      // The word dimmed, the name bold.
      const h = await open({}, "w2.ts", "function f(): void {}\n");
      const head = h.app.currentLayout(h.app.view!).lines.find((l) => l.spans.some((sp) => sp.text === "function: "))!;
      const word = head.spans.find((sp) => sp.text === "function: ")!;
      expect([word.role, word.attrs & A_BOLD]).toEqual(["dim", 0]);
      const name = head.spans.find((sp) => sp.text === "f")!;
      expect([name.role, name.attrs & A_BOLD]).toEqual(["strong", A_BOLD]); // the text's colour, bold: not the code's
    });
    test("a definition's kind by its node's type, in any grammar", () => {
      const kinds = [
        "function_item",
        "method_declaration",
        "init_declaration",
        "impl_item",
        "trait_item",
        "mod_item",
        "module",
        "namespace_definition",
        "struct_item",
        "type_spec",
        "enum_item",
        "interface_declaration",
        "method",
        "declaration",
        "comment",
      ].map(codeKind);
      expect(kinds).toEqual([
        "function",
        "function",
        "function",
        "class",
        "class",
        "class",
        "class",
        "class",
        "type",
        "type",
        "type",
        "type",
        "function",
        "function",
        undefined,
      ]);
    });
    test("Go: a declaration's comment lines its documentation, its imports folded, a method a cell; tabs as wide as drawn", async () => {
      const go =
        'package main\n\nimport (\n\t"fmt"\n\t"os"\n)\n\n// Run copies the files.\nfunc (u *Upload) Run(dry bool) {\n\tif dry {\n\t\tfmt.Println(os.Args)\n\t}\n}\n';
      const { layout, text } = await view("up.go", go);
      expect(text).toContain("▸ imports  fmt · os (2)");
      expect(cellsOf(layout)).toContain("Run 8–13");
      expect(text).toContain("Run copies the files.");
      expect(text).not.toContain("// Run");
      // Two tabs in: one guide (the first level is the box's border), not three.
      expect(
        text
          .split("\n")
          .find((r) => r.includes("fmt.Println"))!
          .match(/│/g)?.length,
      ).toBe(1 + 1);
    });
    test("Rust: `//!` a module's prose, `///` an item's, its attributes in its cell; `use` folded; an impl's methods its members", async () => {
      const rs =
        "//! The stacker.\n\nuse std::collections::HashMap;\n\n/// One frame.\n#[derive(Debug)]\npub struct Frame {\n    pub n: u32,\n}\n\nimpl Frame {\n    /// Its size.\n    pub fn size(&self) -> u32 {\n        self.n\n    }\n}\n";
      const { layout, text } = await view("lib.rs", rs);
      expect(text).toContain("The stacker.");
      expect(text).not.toMatch(/\/\/[!/]|! The/);
      expect(text).toContain("▸ imports  std::collections::HashMap (1)");
      expect(cellsOf(layout)).toEqual(expect.arrayContaining(["Frame 5–9", "size 12–15"]));
      expect(text).toContain("#[derive(Debug)]");
      // The blank line after `//!` — its comment takes its line's end with it — isn't a cell of its own.
      expect(cellsOf(layout).some((c) => c.startsWith("code 2"))).toBe(false);
    });
    test("Ruby: a class's `end` closes it, as a brace does; C: `#include`s folded", async () => {
      const rb = "# A route.\nclass Route\n  # Reads it.\n  def initialize(path)\n    @path = path\n  end\nend\n";
      const ruby = await view("route.rb", rb);
      expect(cellsOf(ruby.layout).some((c) => c.startsWith("code"))).toBe(false);
      const c = await view("h.c", '#include <stdio.h>\n#include "util.h"\n\nint main(void) { return 0; }\n');
      expect(c.text).toContain("▸ imports  stdio.h · util.h (2)");
      // C++'s class closes with `};`.
      const cpp = await view("w.cpp", "class W {\n public:\n  int n() { return 1; }\n};\n");
      expect(cellsOf(cpp.layout).some((x) => x.startsWith("code"))).toBe(false);
    });
    test("tags in line comments are terms (LuaDoc, Doxygen's `\\param`); PHPDoc's type before its name", async () => {
      const lua = await view(
        "g.lua",
        "--- Greets someone.\n-- @param name who\nlocal function greet(name)\n  return name\nend\n",
      );
      expect(lua.text).toMatch(/name\s+who/);
      expect(lua.text).not.toContain("@param");
      const c = await view("d.c", "/// Adds.\n/// \\param a the first\nint add(int a) { return a; }\n");
      expect(c.text).toMatch(/a\s+the first/);
      const php = await view(
        "g.php",
        "<?php\n/**\n * Greets.\n * @param string $name who\n */\nfunction greet(string $name) { return $name; }\n",
      );
      expect(php.text).toMatch(/\$name\s+who\s+string/);
    });
  });
  describe("a definition's long signature, a parameter a row (24.19)", () => {
    const sig =
      'export function resolveLink(link: LinkRef, fromRel: string, options: ResolveOptions = {}, pick: (a: number, b: number) => number): Target {\n  return go(link, fromRel, options, strict, { depth: 1, seen: new Set<string>(), mode: "strict" }, more, andMore);\n}\n';
    test("each parameter on its own row, four columns in; `)` and the rest at the line's indentation", async () => {
      const h = await open({ width: 80 }, "s.ts", sig);
      const r = rows(h);
      const at = r.findIndex((x) => x.includes("export function resolveLink("));
      // (Past the box's left line.)
      const bare = (x: string) => x.replace(/^[│\s]+/, "").trimEnd();
      expect(r.slice(at, at + 6).map(bare)).toEqual([
        "export function resolveLink(",
        "link: LinkRef,",
        "fromRel: string,",
        "options: ResolveOptions = {},",
        "pick: (a: number, b: number) => number",
        "): Target {",
      ]);
      expect(r[at + 1]!.indexOf("link") - r[at]!.indexOf("export")).toBe(4);
      expect(r[at + 5]!.indexOf(")")).toBe(r[at]!.indexOf("export"));
    });
    test("a Go method: its parameters, not its receiver's; one without parameters, any row", async () => {
      const go =
        "package m\n\nfunc (u *Upload) Run(target string, dryRun bool, verbose bool, retries int, timeout int) error {\n\treturn nil\n}\n\nfunc Long() map[string]map[string]map[string]map[string]map[string]map[string]int {\n\treturn nil\n}\n";
      const h = await open({ width: 80 }, "m.go", go);
      const r = rows(h).map((x) => x.replace(/^[│\s]+/, ""));
      expect(r).toContain("func (u *Upload) Run(");
      expect(r).toContain("target string,");
      expect(r.some((x) => x.endsWith("Long("))).toBe(false);
    });
    test("not a call's arguments; not a signature that fits", async () => {
      const h = await open({ width: 80 }, "s.ts", sig);
      const r = rows(h);
      const call = r.findIndex((x) => x.includes("return go("));
      expect(r[call]!.replace(/^[│\s]+/, "")).not.toBe("return go("); // broken as any row is, filled
      const fits = await open(
        { width: 100 },
        "f.ts",
        "function f(a: number, b: number): number {\n  return a + b;\n}\n",
      );
      expect(rows(fits).some((x) => x.replace(/^[│\s]+/, "") === "function f(a: number, b: number): number {")).toBe(
        true,
      );
    });
  });
  test("a receiver dimmed with its access — `this.`, `self.`, `$this->` — not a bare one, nor one in a string (24.21)", async () => {
    const h = await open(
      {},
      "r.ts",
      'class A {\n  n = 1;\n  get(): A {\n    const s = "this.x";\n    return this.n > 0 ? this : myself.n;\n  }\n}\n',
    );
    const line = h.app.currentLayout(h.app.view!).lines.find((l) => l.spans.some((s) => s.text.includes("return")))!;
    const cells = line.spans.flatMap((s) => [...s.text].map((ch) => ({ ch, dim: !!(s.attrs & A_DIM) })));
    const text = cells.map((c) => c.ch).join("");
    const dimAt = (k: number, n: number) => cells.slice(k, k + n).every((c) => c.dim);
    const first = text.indexOf("this.n");
    expect(dimAt(first, 5)).toBe(true); // `this.`
    expect(cells[first + 5]!.dim).toBe(false); // `n`
    const bare = text.indexOf("? this");
    expect(dimAt(bare + 2, 4)).toBe(false);
    expect(cells[text.indexOf("myself.") + 2]!.dim).toBe(false); // a word ending in `self` isn't one
    const str = h.app.currentLayout(h.app.view!).lines.find((l) => l.spans.some((s) => s.text.includes('"this.x"')))!;
    expect(str.spans.find((s) => s.text.includes("this.x"))!.attrs & A_DIM).toBe(0);
    const php = await open({}, "p.php", "<?php\nclass G {\n  function g() { return $this->prefix; }\n}\n");
    const pl = php.app.currentLayout(php.app.view!).lines.find((l) => l.spans.some((s) => s.text.includes("prefix")))!;
    const pc = pl.spans.flatMap((s) => [...s.text].map((ch) => ({ ch, dim: !!(s.attrs & A_DIM) })));
    const pt = pc.map((c) => c.ch).join("");
    expect(pc.slice(pt.indexOf("$this->"), pt.indexOf("$this->") + 7).every((c) => c.dim)).toBe(true);
    expect(pc[pt.indexOf("prefix")]!.dim).toBe(false);
  });
  describe("a licence header or a generated banner folded, as the imports are (24.22)", () => {
    const mit =
      "// Copyright 2026 Example Co.\n// Permission is hereby granted, free of charge, to any person obtaining a copy\n// of this software.\n\nexport const x = 1;\n";
    test("named where it says one — SPDX's, the MIT text's, what generated it; `enter` opens it, and again folds it", async () => {
      const h = await open({}, "m.ts", mit);
      expect(rows(h)).toContain("▸ license · MIT");
      expect(rows(h).join("\n")).not.toContain("Permission is hereby granted");
      h.app.moveCursor(h.app.view!, {
        row: h.app.currentLayout(h.app.view!).lines.findIndex((l) => l.fold !== undefined),
        col: 0,
      });
      await h.keys("enter");
      expect(rows(h).join("\n")).toContain("Permission is hereby granted");
      expect(rows(h)).toContain("▾ license");
      const spdx = await open(
        {},
        "s.ts",
        "/*\n * SPDX-License-Identifier: Apache-2.0\n * Copyright 2026 X\n */\nexport const y = 2;\n",
      );
      expect(rows(spdx)).toContain("▸ license · Apache-2.0");
      const gen = await open(
        {},
        "g.py",
        "#!/usr/bin/env python3\n# Code generated by protoc-gen-py. DO NOT EDIT.\n# source: a.proto\n\nX = 1\n",
      );
      expect(rows(gen)).toContain("▸ generated · protoc-gen-py");
      const unnamed = await open(
        {},
        "u.ts",
        "// Copyright 2026 X. All rights reserved.\n// Do with it as the licence says.\n\nexport const z = 3;\n",
      );
      expect(rows(unnamed)).toContain("▸ license · 2 lines");
      // Each licence by its words; Rust's line comments, each taking its line's end; PHP's past its opening tag; one
      // right above the imports, folded apart from them.
      const named: [string, string, string][] = [
        [
          "a.ts",
          '// Copyright 2026 X\n// Licensed under the Apache License, Version 2.0 (the "License");',
          "Apache-2.0",
        ],
        ["g.ts", "// Copyright (C) 2026 X\n// under the terms of the GNU General Public License, version 3", "GPL-3.0"],
        ["b.ts", "// Copyright 2026 X\n// Redistribution and use in source and binary forms, with or without", "BSD"],
        [
          "mp.ts",
          "// Copyright 2026 X. This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.\n// If a copy of the MPL was not distributed with this file, you can obtain one.",
          "MPL-2.0",
        ],
        ["r.rs", "// Copyright 2026 X\n// Permission is hereby granted, free of charge, to any person", "MIT"],
      ];
      for (const [file, header, name] of named)
        expect(rows(await open({}, file, `${header}\n\nconst q = 1;\n`))).toContain(`▸ license · ${name}`);
      const php = await open(
        {},
        "g.php",
        "<?php\n// Code generated by protoc-gen-php. DO NOT EDIT.\n// source: g.proto\n\n$x = 1;\n",
      );
      expect(rows(php)).toContain("▸ generated · protoc-gen-php");
      const above = await open(
        {},
        "i.ts",
        `${mit.split("\n\n")[0]}\nimport { a } from "./a.ts";\n\nexport const b = a;\n`,
      );
      expect(rows(above)).toEqual(expect.arrayContaining(["▸ license · MIT", "▸ imports  ./a.ts (1)"]));
    });
    test("not one line, not a comment after code, not one that isn't a licence, not one sharing a line with code", async () => {
      for (const [file, text] of [
        ["one.ts", "// Copyright 2026 X. MIT licensed.\nexport const a = 1;\n"],
        ["late.ts", "export const a = 1;\n// Copyright 2026 X\n// Licensed under MIT.\n"],
        ["prose.ts", "// A note about this file:\n// it is small.\n\nexport const a = 1;\n"],
        ["words.ts", "// Checks each package's license:\n// reads its LICENSE file.\n\nexport const a = 1;\n"],
        ["same.ts", "// Copyright 2026 X\n/* Licensed under the MIT License. */ export const a = 1;\n"],
      ] as const) {
        const h = await open({}, file, text);
        expect(rows(h).some((r) => /license|generated/.test(r) && r.includes("▸"))).toBe(false);
      }
    });
  });
});
