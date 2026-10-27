import { describe, expect, test } from "bun:test";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { makeSandbox, harness, rowStarting, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("mouse", () => {
  const click = (h: Harness, x: number, y: number) => {
    h.app.mouse.handle({ type: "down", x, y, button: 0 });
    h.app.mouse.handle({ type: "up", x, y, button: 0 });
    h.frame();
  };
  test("double-click selects a word, triple-click the row; both copy", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    const pane = h.app.geometry!.panes[0]!;
    const row = rowStarting(h, "Back to");
    const y = pane.y + row - h.app.view!.top;
    click(h, pane.textX + 1, y);
    click(h, pane.textX + 1, y);
    expect(h.copied.at(-1)).toBe("Back");
    click(h, pane.textX + 1, y);
    expect(h.copied.at(-1)).toBe("Back to index and on to beta.");
  });
  test("scrollbar click and drag jump through the note", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md" });
    h.frame();
    const bar = h.app.geometry!.scrollbars[0]!;
    // The whole bar is a ▐ column: the track faint, the thumb (at the top here) stronger.
    const c = h.canvas();
    for (let y = bar.y; y < bar.y + bar.h; y++) expect(c.rows[y]![bar.x]).toBe("▐");
    expect(c.styles[bar.y]![bar.x]!.fg).toBe(h.app.theme.roles.scrollbar.fg!);
    expect(c.styles[bar.y + bar.h - 1]![bar.x]!.fg).toBe(h.app.theme.roles.scrollbar_track.fg!);
    click(h, bar.x, bar.y + bar.h - 1);
    expect(h.app.view!.top).toBeGreaterThan(100);
    h.app.mouse.handle({ type: "down", x: bar.x, y: bar.y + bar.h - 1, button: 0 });
    h.app.mouse.handle({ type: "drag", x: bar.x, y: bar.y, button: 0 });
    h.app.mouse.handle({ type: "up", x: bar.x, y: bar.y, button: 0 });
    expect(h.app.view!.top).toBe(0);
  });
  test("side panes get a scrollbar when their rows overflow; clicking it pins the scroll", async () => {
    const h = await harness({
      open: "samples/handbook/operations-handbook.md",
      width: 160,
      height: 20,
      config: (c) => (c.ui.outline = true),
    });
    h.frame();
    const outline = h.app.geometry!.scrollbars.find((b) => b.pane === "outline")!;
    expect(outline).toBeDefined();
    const c = h.canvas();
    for (let y = outline.y; y < outline.y + outline.h; y++) expect(c.rows[y]![outline.x]).toBe("▐");
    click(h, outline.x, outline.y + outline.h - 1);
    expect(h.app.outline.scroll).toBe(outline.total - outline.h);
    expect(h.app.outline.pinned).toBe(true);
    // The note didn't move.
    expect(h.app.view!.top).toBe(0);
  });
  test("side panes scroll sideways when rows are wider than the pane", async () => {
    const h = await harness({
      open: "samples/handbook/operations-handbook.md",
      width: 160,
      height: 30,
      config: (c) => (c.ui.outline = true),
    });
    h.frame();
    expect(h.app.region).toBe("content");
    const bar = h.app.geometry!.scrollbars.find((b) => b.pane === "outline" && b.horizontal)!;
    expect(bar).toBeDefined();
    expect(bar.total).toBeGreaterThan(bar.w);
    const c = h.canvas();
    expect(c.rows[bar.y]!.slice(bar.x, bar.x + bar.w).join("")).toBe("▄".repeat(bar.w));
    // Rows are clipped, not cut with an ellipsis, and the list stops above the bar.
    const list = h.app.geometry!.outline!;
    expect(list.y + list.h).toBe(bar.y);
    const rows = c.rows.slice(list.y, list.y + list.h).map((r) => r.slice(list.x, list.x + list.w).join(""));
    expect(rows.some((r) => r.includes("…"))).toBe(false);
    // Dragging to the end shows the ends of the longest rows; the wheel comes back.
    h.app.mouse.handle({ type: "down", x: bar.x + bar.w - 1, y: bar.y, button: 0 });
    h.app.mouse.handle({ type: "up", x: bar.x + bar.w - 1, y: bar.y, button: 0 });
    h.frame();
    expect(h.app.outline.left).toBe(bar.total - bar.w);
    for (let k = 0; k < 100; k++)
      h.app.mouse.handle({
        type: "scroll",
        x: list.x + 2,
        y: list.y + 1,
        button: 0,
        scroll: { direction: "left", delta: 1 },
      });
    h.frame();
    expect(h.app.outline.left).toBe(0);
    h.app.mouse.handle({
      type: "scroll",
      x: list.x + 2,
      y: list.y + 1,
      button: 0,
      scroll: { direction: "right", delta: 1 },
    });
    h.frame();
    expect(h.app.outline.left).toBeGreaterThan(0);
    // Clicking a pane's bar focuses the pane, like any click in it.
    expect(h.app.region).toBe("outline");
  });
  test("wrapping off: a horizontal scrollbar under the text scrolls sideways", async () => {
    const h = await harness({
      open: "samples/equipment/telescope-comparison.md",
      width: 100,
      height: 30,
      config: (c) => ((c.ui.wrap = false), (c.ui.sidebar = false)),
    });
    h.frame();
    const v = h.app.view!;
    const bar = h.app.geometry!.scrollbars.find((b) => b.horizontal)!;
    expect(bar).toBeDefined();
    const pane = h.app.geometry!.panes[0]!;
    // Its own row, under the text: the text rows end above it.
    expect(bar.y).toBe(pane.y + pane.h);
    expect(v.height).toBe(pane.h);
    const c = h.canvas();
    expect(c.rows[bar.y]!.slice(bar.x, bar.x + bar.w).join("")).toBe("▄".repeat(bar.w));
    expect(c.styles[bar.y]![bar.x]!.fg).toBe(h.app.theme.roles.scrollbar.fg!);
    expect(c.styles[bar.y]![bar.x + bar.w - 1]!.fg).toBe(h.app.theme.roles.scrollbar_track.fg!);
    click(h, bar.x + bar.w - 1, bar.y);
    expect(v.left).toBe(bar.total - bar.w);
    h.app.mouse.handle({ type: "down", x: bar.x + bar.w - 1, y: bar.y, button: 0 });
    h.app.mouse.handle({ type: "drag", x: bar.x, y: bar.y, button: 0 });
    h.app.mouse.handle({ type: "up", x: bar.x, y: bar.y, button: 0 });
    expect(v.left).toBe(0);
    // A note that fits keeps the row (the text doesn't jump) but draws no bar.
    await h.keys("space", "u", "w", "space", "u", "w");
    const n = await harness({
      open: "notes/alpha.md",
      width: 100,
      height: 30,
      config: (c) => ((c.ui.wrap = false), (c.ui.sidebar = false)),
    });
    n.frame();
    expect(n.app.geometry!.scrollbars.some((b) => b.horizontal)).toBe(false);
    expect(n.app.view!.height).toBe(n.app.geometry!.panes[0]!.h);
  });
  test("an overlaid pane joins the borders it crosses", async () => {
    const h = await harness({
      open: "samples/handbook/operations-handbook.md",
      width: 60,
      height: 24,
      config: (c) => (c.ui.sidebar = false),
    });
    await h.keys("space", "e");
    const f = h.frame();
    const lines = f.split("\n");
    // The explorer's border meets the rules above and below it with tee joints, never a crossing.
    const pane = h.app.geometry!.sidebarPane!;
    const x = pane.x + pane.w - 3;
    const col = lines.map((l) => [...l][x] ?? "").join("");
    expect(col).not.toContain("╋");
    for (const joint of ["┳", "┻"]) expect(col).toContain(joint);
  });
  test("dragging borders resizes the explorer, the outline and the split", async () => {
    const h = await harness({
      open: "samples/handbook/operations-handbook.md",
      width: 170,
      config: (c) => (c.ui.outline = true),
    });
    await h.keys("ctrl+w", "v");
    h.frame();
    const seps = h.app.geometry!.separators;
    const side = seps.find((s) => s.kind === "sidebar")!;
    h.app.mouse.handle({ type: "down", x: side.x, y: side.y + 3, button: 0 });
    h.app.mouse.handle({ type: "drag", x: side.x + 8, y: side.y + 3, button: 0 });
    h.app.mouse.handle({ type: "up", x: side.x + 8, y: side.y + 3, button: 0 });
    expect(h.app.panels.sideW).toBe(side.x + 8 - h.app.panels.leftRailWidth);
    const out = seps.find((s) => s.kind === "outline")!;
    h.app.mouse.handle({ type: "down", x: out.x, y: out.y + 3, button: 0 });
    h.app.mouse.handle({ type: "drag", x: out.x - 6, y: out.y + 3, button: 0 });
    h.app.mouse.handle({ type: "up", x: out.x - 6, y: out.y + 3, button: 0 });
    expect(h.app.panels.outW).toBe(170 - h.app.panels.rightRailWidth - (out.x - 6) - 1);
    h.frame();
    const split = h.app.geometry!.separators.find((s) => s.kind === "split-side")!;
    h.app.mouse.handle({ type: "down", x: split.x, y: split.y + 3, button: 0 });
    h.app.mouse.handle({ type: "drag", x: split.area!.x + Math.round(split.area!.w * 0.3), y: split.y + 3, button: 0 });
    h.app.mouse.handle({ type: "up", x: split.x, y: split.y + 3, button: 0 });
    expect(h.app.tab!.ratio).toBeCloseTo(0.3, 1);
  });
  test("explorer: click a folder to fold it; a click selects a note, a double-click or enter opens it", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    h.frame();
    const sb = h.app.geometry!.sidebar!;
    const rowOf = (path: string) =>
      h.app.explorer.treeRows().findIndex((r) => r.path === path) - h.app.sidebar.scroll + sb.y;
    click(h, sb.x + 3, rowOf("notes"));
    expect(h.app.explorer.treeRows().some((r) => r.path === "notes/beta.md")).toBe(false);
    click(h, sb.x + 3, rowOf("notes"));
    expect(h.app.explorer.treeRows().some((r) => r.path === "notes/beta.md")).toBe(true);
    const y = rowOf("notes/beta.md");
    const selected = () => h.app.explorer.treeRows()[h.app.sidebar.selected]?.path;
    click(h, sb.x + 6, y); // one click: selected, not opened
    expect(h.app.tabs).toHaveLength(1);
    expect(selected()).toBe("notes/beta.md");
    click(h, sb.x + 6, y); // the second of a double-click: opened as a tab
    expect(h.app.tabs).toHaveLength(2);
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
    expect(h.app.tabs[0]!.views[0]!.buf.rel).toBe("notes/alpha.md"); // the first tab is untouched
    // Enter on a selected note opens it too (a second time: the tab it has).
    await Bun.sleep(450); // past the double-click window
    click(h, sb.x + 6, rowOf("notes/alpha.md"));
    expect(h.app.tabs).toHaveLength(2);
    expect(selected()).toBe("notes/alpha.md");
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    expect(h.app.tabs).toHaveLength(2);
  });
  test("outline: click the fold marker folds; click the text jumps", async () => {
    const h = await harness({
      open: "samples/handbook/operations-handbook.md",
      width: 160,
      config: (c) => (c.ui.outline = true),
    });
    h.frame();
    const o = h.app.geometry!.outline!;
    const before = h.app.outlineView.rows().length;
    const first = h.app.outlineView.rows()[0]!;
    click(h, o.x + 1 + (first.level - 1) * 2, o.y);
    expect(h.app.outlineView.rows().length).toBeLessThan(before);
    click(h, o.x + 1 + (first.level - 1) * 2, o.y);
    click(h, o.x + 10, o.y + 2);
    expect(h.app.view!.cur.row).toBe(h.app.outlineView.rows()[2]!.line);
  });
  test("which-key entries are clickable", async () => {
    const h = await harness({ width: 160 });
    await h.keys("space");
    h.frame();
    const u = h.app.geometry!.hot.find((r) => r.id === "wk:u")!;
    click(h, u.x + 2, u.y);
    expect(h.app.pending).toEqual(["space", "u"]);
    await Bun.sleep(1); // keys are handled one at a time: let the first one's turn end
    const z = h.app.geometry!.hot.find((r) => r.id === "wk:z")!;
    click(h, z.x + 2, z.y);
    await Bun.sleep(1);
    expect(h.app.ui.zen).toBe(true);
  });
  test("floating windows have a margin in their own colour: a row above and below, two columns aside", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 140, height: 40 });
    await h.keys(":");
    h.frame();
    const r = h.app.geometry!.overlay!;
    const c = h.canvas();
    const bg = h.app.theme.roles.overlay.bg!;
    for (const [x, y] of [
      [r.x - 1, r.y + 3],
      [r.x - 2, r.y + 3],
      [r.x + r.w, r.y + 3],
      [r.x + r.w + 1, r.y + 3],
      [r.x + 5, r.y - 1],
      [r.x + 5, r.y + r.h],
    ] as const) {
      expect(c.rows[y]![x]).toBe(" ");
      expect(c.styles[y]![x]!.bg).toBe(bg);
    }
    // The explorer over the content (narrow): a blank column past its border.
    const n = await harness({ width: 70, height: 30 });
    await n.keys("space", "e");
    n.frame();
    const p = n.app.geometry!.sidebarPane!; // over the note, the pane's area includes its border and margin
    const nc = n.canvas();
    for (let y = p.y; y < p.y + p.h; y++) expect(nc.rows[y]!.slice(p.x + p.w - 2, p.x + p.w).join("")).toBe("  ");
  });
  test("the wheel scrolls a list; the selection moves only to stay in view", async () => {
    const h = await harness({ width: 140, height: 40 });
    await h.keys("space", "?");
    h.frame();
    const o = h.app.overlay as ListOverlay;
    const r = h.app.geometry!.overlay!;
    const wheel = (direction: string) => {
      h.app.mouse.handle({ type: "scroll", x: r.x + 5, y: r.listY + 3, button: 0, scroll: { direction, delta: 1 } });
      h.frame();
    };
    expect(o.selected).toBe(2);
    wheel("down");
    expect(o.scroll).toBe(3); // the view moved three rows
    expect(o.selected).toBe(3); // row 2 left the view, so the selection moved to its top
    for (let i = 0; i < 5; i++) wheel("down");
    expect(o.scroll).toBe(18);
    expect(o.selected).toBeGreaterThanOrEqual(18); // kept in view, at its top
    expect(o.filtered[o.selected]!.item.header).toBeFalsy();
    const kept = o.selected;
    wheel("up");
    expect(o.scroll).toBe(15);
    expect(o.selected).toBe(kept); // still in view: untouched
    await h.keys("down"); // keys move the selection again, and the view follows it
    expect(o.selected).toBeGreaterThan(kept);
  });
});

describe("review cycle 5 (TUI journeys: the mouse)", () => {
  test("a double-click on a link follows it once: nothing in the note it opens is clicked or copied", async () => {
    const h = await harness({ open: "index.md", width: 130, height: 34 });
    const v = h.app.view!;
    const l = h.app.currentLayout(v).links.find((x) => x.kind === "markdown" && x.target === "notes/alpha.md")!;
    const pane = h.app.geometry!.panes[0]!;
    const x = pane.textX + l.col + 1;
    const y = pane.y + l.line - v.top;
    for (let k = 0; k < 2; k++) {
      h.app.mouse.handle({ type: "down", x, y, button: 0 });
      h.app.mouse.handle({ type: "up", x, y, button: 0 });
      await Bun.sleep(5);
    }
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    expect(h.copied).toEqual([]);
    expect(h.app.view!.sel).toBeNull();
  });
});
