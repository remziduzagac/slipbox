import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import { stringWidth } from "../../../../src/core/foundation/text/width.ts";
import { loadMermaid } from "../../../../src/core/rendering/media/diagrams/diagrams.ts";
import { codeBlocks } from "../../../../src/tui/documents/views/code.ts";
import { makeSandbox, makeVault, harness, type Harness, type Opts } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("code blocks that scroll sideways ([render] code_wrap)", () => {
  /** A note with a tree too wide for a 70-column window — two long lines, a short one after — and a long command in a
   *  list item. */
  const LONG_ONE =
    "├── src/core/layout/render.ts     the layout: mdast to rows, every block and inline, the code anchovy";
  const LONG_TWO =
    "├── src/tui/draw.ts               the drawing: rows to cells, and each code block from its offset bergamot";
  const COMMAND =
    'echo "a long command line inside a list item that goes well past the right edge of the window" cardamom';
  const TREE = [
    "# Tree",
    "",
    "Before the block, a paragraph long enough to wrap in a narrow window, as paragraphs always do.",
    "",
    "```text",
    LONG_ONE,
    LONG_TWO,
    "└── README.md",
    "```",
    "",
    "After the block.",
    "",
    "- an item",
    "",
    "  ```sh",
    `  ${COMMAND}`,
    "  ```",
    "",
  ].join("\n");
  const tree = async (opts: Opts = {}) => {
    const root = opts.root ?? makeVault();
    writeFileSync(join(root, "tree.md"), TREE);
    return harness({
      width: 70,
      height: 30,
      ...opts,
      root,
      open: "tree.md",
      config: (c) => {
        c.ui.sidebar = false;
        opts.config?.(c);
      },
    });
  };
  const rowOf = (h: Harness, text: string) =>
    h.app.currentLayout(h.app.view!).lines.findIndex((l) =>
      l.spans
        .map((s) => s.text)
        .join("")
        .includes(text),
    );
  /** The block holding `row`: its scroll, and how far it's scrolled. */
  const block = (h: Harness, row: number) => {
    const layout = h.app.currentLayout(h.app.view!);
    return { s: layout.lines[row]!.scroll!, off: h.app.code.offset(h.app.view!, layout, row) };
  };
  /** A scrolling row's code: its text from where its code starts. */
  const codeOf = (h: Harness, row: number) => {
    const l = h.app.currentLayout(h.app.view!).lines[row]!;
    return [...l.spans.map((s) => s.text).join("")].slice(l.scroll!.x).join("");
  };

  test("each line of a block too wide is one row, whole, from its code's start; paragraphs still wrap; drawn, the block's width of it", async () => {
    const h = await tree();
    const layout = h.app.currentLayout(h.app.view!);
    const one = rowOf(h, "anchovy");
    expect(codeOf(h, one)).toBe(LONG_ONE);
    expect(codeOf(h, rowOf(h, "bergamot"))).toBe(LONG_TWO);
    expect(rowOf(h, "bergamot")).toBe(one + 1);
    expect(layout.lines.some((l) => l.spans.some((s) => s.text.includes("↪")))).toBe(false);
    const { s } = block(h, one);
    expect(s).toEqual({ x: 1, w: layout.width - 2, total: stringWidth(LONG_TWO) });
    // In the list item, its code starts past the item's indent.
    const three = rowOf(h, "cardamom");
    expect(block(h, three).s.x).toBe(3);
    expect(codeOf(h, three)).toBe(COMMAND);
    // The paragraph wraps as ever.
    expect(rowOf(h, "Before the block")).toBeLessThan(rowOf(h, "always do."));
    // Drawn: the block's width of each line, a › where more is to the right; nothing past the window.
    const f = h.frame();
    expect(f).not.toContain("anchovy");
    expect(f).toContain(`${[...LONG_ONE].slice(0, s.w).join("")}›`);
    expect(f).toMatch(/ {5}└── README\.md\n/);
    expect(
      f
        .split("\n")
        .filter((r) => r.includes("├──") || r.includes("└──"))
        .join(""),
    ).not.toContain("‹");
  });

  test("the cursor drives it: l to four columns from the edge, $ and 0, w and b, f; up and down keep the column on screen; off the block its offset stays", async () => {
    const h = await tree();
    const v = h.app.view!;
    const one = rowOf(h, "anchovy");
    h.app.moveCursor(v, { row: one, col: 0 });
    await h.keys("0");
    const { s } = block(h, one);
    expect(v.cur.col).toBe(s.x); // 0: the code's start, past the gutter
    // l scrolls once the cursor is within 4 columns of the right edge, a column at a time.
    for (let i = 0; i < s.w - 5; i++) await h.keys("l");
    expect(block(h, one).off).toBe(0);
    await h.keys("l");
    expect(block(h, one).off).toBe(1);
    await h.keys("l", "l");
    expect(block(h, one).off).toBe(3);
    // h scrolls back only within 4 columns of the left edge.
    for (let i = 0; i < s.w - 9; i++) await h.keys("h");
    expect(block(h, one).off).toBe(3);
    await h.keys("h");
    expect(block(h, one).off).toBe(2);
    // $ shows the line's end, drawn; 0 its start.
    await h.keys("$");
    expect(v.cur.col).toBe(s.x + stringWidth(LONG_ONE) - 1);
    expect(block(h, one).off).toBe(stringWidth(LONG_ONE) - s.w + 4);
    expect(h.frame()).toContain("the code anchovy");
    await h.keys("0");
    expect(block(h, one).off).toBe(0);
    // w along the words: the block follows, the cursor in sight; b back.
    for (let i = 0; i < 20; i++) await h.keys("w");
    expect(block(h, one).off).toBeGreaterThan(0);
    const inSight = () => v.cur.col - s.x - block(h, one).off;
    expect(inSight()).toBeGreaterThanOrEqual(4);
    expect(inSight()).toBeLessThan(s.w - 4);
    for (let i = 0; i < 20; i++) await h.keys("b");
    expect(block(h, one).off).toBe(0);
    // Down to the next long line: the same column on screen, the block where it was.
    await h.keys("$");
    const off = block(h, one).off;
    const screen = v.cur.col - off;
    await h.keys("j");
    expect(v.cur.row).toBe(one + 1);
    expect(block(h, one).off).toBe(off);
    expect(v.cur.col - off).toBe(screen);
    // Off the block (up past its first line and its label): its offset as it was.
    await h.keys("k", "k", "k");
    expect(v.cur.row).toBeLessThan(one - 1);
    expect(block(h, one).off).toBe(off);
    expect(h.frame()).toContain(`‹${[...LONG_ONE].slice(off, off + s.w).join("")}`);
    // Through it at the window's left edge (the gutter's column, which never moves): its offset stays too.
    await h.keys("0", "j", "j", "j", "j", "j", "j");
    expect(v.cur.row).toBeGreaterThan(one + 1);
    expect(block(h, one).off).toBe(off);
    // The list's block has an offset of its own; f to a character past its edge, and ; on: it follows.
    const three = rowOf(h, "cardamom");
    expect(block(h, three).off).toBe(0);
    h.app.moveCursor(v, { row: three, col: 0 });
    await h.keys("0", "f", "+");
    expect(v.cur.col).toBe(block(h, three).s.x); // no + on the line: nothing moved
    await h.keys("f", "w", ";", ";", ";", ";");
    expect(COMMAND[v.cur.col - block(h, three).s.x]).toBe("w");
    expect(block(h, three).off).toBeGreaterThan(0);
  });

  test("the mouse: a sideways wheel, or shift and the wheel, over a block scrolls it, the cursor staying; a click lands on the character drawn there", async () => {
    const h = await tree({ height: 18 });
    const v = h.app.view!;
    h.frame();
    const pane = h.app.geometry!.panes[0]!;
    const one = rowOf(h, "anchovy");
    const y = pane.y + one - v.top;
    const cur = { ...v.cur };
    const wheel = (direction: string, shift = false, at = y) =>
      h.app.mouse.handle({
        type: "scroll",
        x: pane.textX + 10,
        y: at,
        button: 0,
        scroll: { direction, delta: 1 },
        shift,
      });
    wheel("right");
    expect(block(h, one).off).toBe(6);
    wheel("down", true);
    expect(block(h, one).off).toBe(12);
    wheel("up", true);
    expect(block(h, one).off).toBe(6);
    expect(v.cur).toEqual(cur);
    expect(v.top).toBe(0);
    for (let i = 0; i < 40; i++) wheel("right");
    expect(block(h, one).off).toBe(block(h, one).s.total - block(h, one).s.w);
    for (let i = 0; i < 40; i++) wheel("left");
    expect(block(h, one).off).toBe(0);
    // Over the label row too: it's the block's.
    wheel("right", false, y - 1);
    expect(block(h, one).off).toBe(6);
    // The list's block didn't move; the window didn't scroll sideways.
    expect(block(h, rowOf(h, "cardamom")).off).toBe(0);
    expect(v.left).toBe(0);
    // A click on the block, scrolled: the cursor on the character drawn under the pointer.
    h.app.mouse.handle({ type: "down", x: pane.textX + 11, y, button: 0 });
    h.app.mouse.handle({ type: "up", x: pane.textX + 11, y, button: 0 });
    expect(v.cur).toEqual({ row: one, col: 11 + 6 });
    expect(block(h, one).off).toBe(6);
    expect(h.canvas().rows[pane.y + one - v.top]![pane.textX + 11]).toBe([...LONG_ONE][10 + 6]);
    // The cursor in the block, the wheel takes it out of sight: it stays there through a re-layout (an answer from a
    // linter, the watcher), until the cursor moves.
    for (let i = 0; i < 10; i++) wheel("right");
    const away = block(h, one).off;
    expect(away).toBeGreaterThan(17);
    h.app.relayoutAll();
    h.frame();
    expect(block(h, one).off).toBe(away);
    await h.keys("l");
    expect(v.cur.col).toBe(18);
    expect(block(h, one).off).toBe(18 - 1 - 4); // its code column, less the margin
    // shift and the wheel over a paragraph scrolls the note, as the wheel does.
    wheel("down", true, pane.y + rowOf(h, "Before the block"));
    expect(v.top).toBeGreaterThan(0);
  });

  test("its scrollbar: on the block's last row, under its code, only while it overflows; a click or a drag moves the block, never the window", async () => {
    const h = await tree();
    const v = h.app.view!;
    h.frame();
    const pane = h.app.geometry!.panes[0]!;
    const bars = h.app.geometry!.scrollbars.filter((b) => b.block !== undefined);
    expect(bars.length).toBe(2); // the tree's and the list's
    const one = rowOf(h, "anchovy");
    const { s } = block(h, one);
    const b = codeBlocks(h.app.currentLayout(v)).byRow.get(one)!;
    const bar = bars.find((x) => x.block === b.key)!;
    expect([bar.x, bar.y, bar.w, bar.total]).toEqual([pane.textX + s.x, pane.y + b.last - v.top, s.w, s.total]);
    const c = h.canvas();
    expect(c.rows[bar.y]!.slice(bar.x, bar.x + bar.w).join("")).toBe("▄".repeat(bar.w));
    expect(c.styles[bar.y]![bar.x]!.fg).toBe(h.app.theme.roles.scrollbar.fg!);
    expect(c.styles[bar.y]![bar.x + bar.w - 1]!.fg).toBe(h.app.theme.roles.scrollbar_track.fg!);
    // On the code's background.
    expect(c.styles[bar.y]![bar.x]!.bg).toBe(h.app.theme.roles.code_block.bg!);
    h.app.mouse.handle({ type: "down", x: bar.x + bar.w - 1, y: bar.y, button: 0 });
    h.app.mouse.handle({ type: "up", x: bar.x + bar.w - 1, y: bar.y, button: 0 });
    expect(block(h, one).off).toBe(s.total - s.w);
    expect(h.frame()).toContain("bergamot");
    h.app.mouse.handle({ type: "down", x: bar.x + bar.w - 1, y: bar.y, button: 0 });
    h.app.mouse.handle({ type: "drag", x: bar.x, y: bar.y, button: 0 });
    h.app.mouse.handle({ type: "up", x: bar.x, y: bar.y, button: 0 });
    expect(block(h, one).off).toBe(0);
    expect([v.left, v.top]).toEqual([0, 0]);
    // Wide enough for every line: no block scrolls, none has a bar.
    const wide = await tree({ width: 180 });
    wide.frame();
    expect(wide.app.geometry!.scrollbars.some((x) => x.block !== undefined)).toBe(false);
    expect(wide.app.currentLayout(wide.app.view!).lines.some((l) => l.scroll)).toBe(false);
  });

  test("find: a match past the block's edge scrolls the block to it, the whole match in sight", async () => {
    const h = await tree();
    const v = h.app.view!;
    /** The block's row as drawn. */
    const drawn = (row: number) => {
      const c = h.canvas();
      const pane = h.app.geometry!.panes[0]!;
      return c.rows[pane.y + row - v.top]!.join("");
    };
    const one = rowOf(h, "anchovy");
    await h.keys("/", "a", "n", "c", "h", "o", "v", "y", "enter");
    expect(v.cur.row).toBe(one);
    expect(block(h, one).off).toBeGreaterThan(0);
    expect(drawn(one)).toContain("the code anchovy");
    // The next match, in another block: the whole word, though it ends past where the cursor's margin would.
    await h.keys("/", "w", "e", "l", "l", "space", "p", "a", "s", "t", "enter");
    const three = rowOf(h, "cardamom");
    expect(v.cur.row).toBe(three);
    expect(drawn(three)).toContain("well past");
    await h.keys("/", "b", "e", "r", "g", "a", "m", "o", "t", "enter");
    expect(drawn(rowOf(h, "bergamot"))).toContain("its offset bergamot");
  });

  test("copy takes whole lines, never the slice drawn: a selection along a line, a line selection, y y", async () => {
    const h = await tree();
    const v = h.app.view!;
    const one = rowOf(h, "anchovy");
    h.app.moveCursor(v, { row: one, col: 0 });
    await h.keys("0", "v", "$", "y");
    expect(h.copied.at(-1)).toBe(LONG_ONE);
    h.app.moveCursor(v, { row: one, col: 0 });
    await h.keys("shift+v", "j", "y");
    expect(h.copied.at(-1)).toBe(` ${LONG_ONE}\n ${LONG_TWO}`);
    h.app.moveCursor(v, { row: one + 1, col: 0 });
    await h.keys("y", "y");
    expect(h.copied.at(-1)).toBe(LONG_TWO);
  });

  test("the scratch's code scrolls too: a long line captured is one row there", async () => {
    const h = await tree();
    const v = h.app.view!;
    h.app.moveCursor(v, { row: rowOf(h, "anchovy"), col: 0 });
    // Captured, the scratch shows it floating, typing a note in its Markdown (edit_in = "source" here): rendered again.
    await h.keys("shift+v", "space", "s", "a", "escape", "ctrl+k");
    expect(h.app.floating?.kind).toBe("scratch");
    const sv = h.app.floating!.view;
    expect(sv.source).toBeFalsy();
    const layout = h.app.currentLayout(sv);
    const row = layout.lines.findIndex((l) => l.spans.some((s) => s.text.includes("anchovy")));
    expect(layout.lines[row]!.scroll).toBeDefined();
    expect(layout.lines[row]!.spans.map((s) => s.text).join("")).toContain(LONG_ONE);
  });

  test("its offsets go with the note: another note shown in the window, and back, starts each block from the left", async () => {
    const h = await tree();
    h.frame();
    const pane = h.app.geometry!.panes[0]!;
    const three = rowOf(h, "cardamom");
    const scroll = { direction: "right", delta: 1 };
    h.app.mouse.handle({ type: "scroll", x: pane.textX + 10, y: pane.y + three, button: 0, scroll });
    expect(block(h, three).off).toBe(6);
    h.app.open("notes/alpha.md");
    await h.keys("ctrl+o");
    expect(h.app.view!.buf.key).toBe("tree.md");
    expect(block(h, three).off).toBe(0);
  });

  test('[render] code_wrap = "wrap": long lines wrap, marked ↪, as before; the UI settings switch it, kept for the next start', async () => {
    const root = makeVault();
    const config = (c: Config) => ((c.render.code_wrap = "wrap"), (c.ui.restore_session = true));
    const h = await tree({ root, config });
    const layout = () => h.app.currentLayout(h.app.view!);
    expect(layout().lines.some((l) => l.scroll)).toBe(false);
    const one = rowOf(h, "├── src/core");
    expect(layout().lines[one + 1]!.spans[0]!.text).toBe("↪");
    expect(h.frame()).toContain("anchovy");
    await h.keys("space", "u", "u");
    expect(h.frame()).toMatch(/Code blocks +wrap/);
    await h.keys("escape");
    await h.app.run("ui.code_wrap");
    expect(h.app.messages.at(-1)!.text).toBe("Code blocks: scroll sideways");
    expect(codeOf(h, rowOf(h, "anchovy"))).toBe(LONG_ONE);
    h.app.quit();
    const again = await tree({ root, config });
    expect(again.app.ui.code_wrap).toBe("scroll");
    // A value saved that isn't one: dropped, the config's taken.
    const { loadSession, saveSession } = await import("../../../../src/core/workspace/session/position.ts");
    again.app.quit();
    const saved = loadSession(again.app.loc)!;
    saveSession(again.app.loc, { ...saved, ui: { ...saved.ui, code_wrap: { value: "fold", base: "wrap" } } });
    const bogus = await tree({ root, config });
    expect(bogus.app.ui.code_wrap).toBe("wrap");
  });

  test("wrapping off: the window scrolls sideways and a block follows it, never scrolling on its own", async () => {
    const h = await tree({ config: (c) => (c.ui.wrap = false) });
    const v = h.app.view!;
    expect(h.app.currentLayout(v).lines.some((l) => l.scroll)).toBe(false);
    const one = rowOf(h, "anchovy");
    h.app.moveCursor(v, { row: one, col: 0 });
    await h.keys("$");
    expect(v.left).toBeGreaterThan(0);
    expect(h.frame()).toContain("anchovy");
    expect(h.app.geometry!.scrollbars.some((b) => b.block !== undefined)).toBe(false);
  });

  test("a Mermaid diagram too wide is drawn all the same, and scrolls as a code block does", async () => {
    await loadMermaid();
    const root = makeVault();
    const nodes = Array.from({ length: 9 }, (_, i) => `N${i}[node number ${i}]`).join(" --> ");
    writeFileSync(join(root, "wide.md"), `# Wide\n\n${"```"}mermaid\nflowchart LR\n  ${nodes}\n${"```"}\n`);
    const h = await harness({ root, open: "wide.md", width: 70, config: (c) => (c.ui.sidebar = false) });
    h.canvas();
    await loadMermaid();
    const v = h.app.view!;
    const layout = h.app.currentLayout(v);
    const row = layout.lines.findIndex((l) => l.spans.some((s) => s.text.includes("node number 0")));
    expect(row).toBeGreaterThan(0);
    expect(layout.lines[row]!.scroll).toBeDefined();
    expect(h.frame()).not.toContain("too wide to draw");
    h.app.moveCursor(v, { row, col: 0 });
    await h.keys("$");
    expect(h.app.code.offset(v, layout, row)).toBeGreaterThan(0);
    expect(h.frame()).toContain("node number 8");
    // Wrapping instead (the setting): its code, saying why, as before.
    await h.app.run("ui.code_wrap");
    h.canvas();
    await loadMermaid();
    expect(h.frame()).toContain("too wide to draw");
  });
});
