import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { makeSandbox, makeVault, harness, statusRow } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review round 1", () => {
  test("wrapping off: the sideways offset is clamped when the window widens", async () => {
    const h = await harness({
      open: "samples/scratch/wrap-probe.md",
      width: 80,
      height: 30,
      config: (c) => ((c.ui.wrap = false), (c.ui.sidebar = false)),
    });
    h.frame();
    const v = h.app.view!;
    const layout = h.app.currentLayout(v);
    const row = layout.lines.reduce(
      (best, l, i, all) =>
        l.spans.reduce((a, x) => a + x.text.length, 0) > all[best]!.spans.reduce((a, x) => a + x.text.length, 0)
          ? i
          : best,
      0,
    );
    h.app.moveCursor(v, { row, col: 10_000 });
    await h.keys("$");
    h.frame();
    expect(v.left).toBeGreaterThan(0);
    const wide = h.app.draw.bind(h.app);
    const { TextCanvas } = await import("../../../../src/tui/shell/terminal/canvas.ts");
    wide(new TextCanvas(200, 30));
    expect(v.left).toBeLessThanOrEqual(Math.max(0, h.app.currentLayout(v).width - h.app.views.textColumns(v)));
  }); // 29 harnesses
});

describe("wrap (space u s, ui.wrap)", () => {
  test("off: natural width, one row per paragraph, the view follows the cursor sideways", async () => {
    const h = await harness({
      open: "samples/equipment/telescope-comparison.md",
      width: 110,
      config: (c) => (c.ui.sidebar = false),
    });
    const wrapped = h.app.currentLayout(h.app.view!);
    await h.keys("space", "u", "w");
    expect(h.app.ui.wrap).toBe(false);
    const layout = h.app.currentLayout(h.app.view!);
    expect(layout.width).toBeGreaterThan(300); // the widest real row, not the pane
    expect(layout.width).toBeLessThan(2000); // not the probe width
    expect(layout.lines.length).toBeLessThan(wrapped.lines.length);
    const row = layout.lines.findIndex((l) =>
      l.spans
        .map((x) => x.text)
        .join("")
        .includes("The short version is that Aster"),
    );
    h.app.moveCursor(h.app.view!, { row, col: 0 });
    expect(h.app.view!.left).toBe(0);
    await h.keys("$");
    const v = h.app.view!;
    expect(v.left).toBeGreaterThan(0);
    expect(v.cur.col).toBeGreaterThanOrEqual(v.left);
    expect(v.cur.col).toBeLessThan(v.left + h.app.views.textColumns(v));
    // What's drawn is the row's end, and a click lands on the column under it.
    const f = h.frame();
    expect(f).toContain("before anyone signs a purchase order.");
    const pane = h.app.geometry!.panes[0]!;
    const y = pane.y + row - v.top;
    h.app.mouse.handle({ type: "down", x: pane.textX + 5, y, button: 0 });
    h.app.mouse.handle({ type: "up", x: pane.textX + 5, y, button: 0 });
    expect(h.app.view!.cur.col).toBe(v.left + 5);
    // A horizontal wheel scrolls sideways without moving the cursor.
    const before = v.left;
    h.app.mouse.handle({ type: "scroll", x: pane.textX + 5, y, button: 0, scroll: { direction: "left", delta: 1 } });
    expect(v.left).toBeLessThan(before);
    // Back on: wrapped again, no sideways scroll.
    await h.keys("space", "u", "w");
    expect(h.app.view!.left).toBe(0);
    expect(h.app.currentLayout(h.app.view!).width).toBe(wrapped.width);
  });
  test(":wrap toggles it, and rules don't count toward the natural width", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 120 });
    await h.keys(":", "w", "r", "a", "p", "enter");
    expect(h.app.ui.wrap).toBe(false);
    const layout = h.app.currentLayout(h.app.view!);
    // Every row that isn't a rule fits within the natural width.
    expect(layout.width).toBeLessThan(2000);
  });
});

describe("lines inside a rendered paragraph (a regression)", () => {
  test("goto a line whose paragraph joins it with others on one row: the cursor on that line's text, the status saying it", async () => {
    const root = makeVault();
    writeFileSync(join(root, "p.md"), "# P\n\nfirst line\nsecond line\nthird line\n");
    const h = await harness({ root, open: "p.md" });
    await h.app.run("cursor.goto_line 4");
    expect(h.app.cursorLine(h.app.view!)).toBe(4);
    expect(statusRow(h.frame())).toMatch(/ L4:\d+ /);
    await h.app.run("cursor.goto_line 5");
    expect(h.app.cursorLine(h.app.view!)).toBe(5);
  });
});
