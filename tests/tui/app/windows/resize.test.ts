import { describe, expect, test } from "bun:test";
import type { Config } from "../../../../src/core/application/config/config.ts";
import { TextCanvas } from "../../../../src/tui/shell/terminal/canvas.ts";
import { makeSandbox, makeVault, harness, statusRow, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("resize mode (ctrl+alt+w, space w r)", () => {
  test("enter, resize the split with h l and arrows, equalize, leave", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 160 });
    await h.keys("ctrl+w", "v", "ctrl+w", "h"); // left window active
    const t = h.app.tab!;
    const f = await h.keys("space", "w", "r");
    expect(h.app.panels.resizeMode).toBe(true);
    expect(statusRow(f)).toContain("RESIZE");
    expect(f).toContain("Wider");
    const w0 = h.app.geometry!.panes[0]!.w;
    await h.keys("l", "l", "right");
    expect(h.app.geometry!.panes[0]!.w).toBeGreaterThan(w0 + 4);
    await h.keys("h", "left");
    await h.keys("=");
    expect(t.ratio).toBe(0.5);
    await h.keys("escape");
    expect(h.app.panels.resizeMode).toBe(false);
  });
  test("ctrl+w > < + - resize one step, then stay in the mode so the key repeats", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 160, height: 40 });
    await h.keys("ctrl+w", "v", "ctrl+w", "h");
    const t = h.app.tab!;
    await h.keys("ctrl+w", ">");
    expect(h.app.panels.resizeMode).toBe(true);
    const once = t.ratio;
    expect(once).toBeGreaterThan(0.5);
    await h.keys(">", ">");
    expect(t.ratio).toBeGreaterThan(once);
    await h.keys("<", "<", "<");
    expect(t.ratio).toBeCloseTo(0.5, 5);
    await h.keys("escape", "ctrl+w", "o", "ctrl+w", "s");
    expect(t.views.length).toBe(2); // ctrl+w - no longer splits; ctrl+w s does
    await h.keys("ctrl+w", "k", "ctrl+w", "+", "+");
    const taller = t.ratio;
    expect(taller).toBeGreaterThan(0.5);
    await h.keys("-", "escape", "space", "w", "-");
    expect(t.ratio).toBeLessThan(taller);
    await h.keys("escape", "ctrl+w", "=");
    expect(t.ratio).toBe(0.5);
    expect(t.views.length).toBe(2);
  });
  test("any other key leaves the mode and does its normal job", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md" });
    await h.keys("space", "w", "r");
    expect(h.app.panels.resizeMode).toBe(true);
    await h.keys("ctrl+d");
    expect(h.app.panels.resizeMode).toBe(false);
    expect(h.app.view!.top).toBeGreaterThan(0);
  });
  test("stacked splits resize with j k; the right window grows by lowering the ratio", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 160, height: 40 });
    await h.keys("ctrl+w", "s", "space", "w", "r", "j", "j", "escape");
    expect(h.app.tab!.ratio).toBeLessThan(0.5); // the lower (second) window got taller
    await h.keys("ctrl+w", "v", "space", "w", "r", "k");
    expect(h.app.transient!.text).toContain("h / l");
  });
  test("the focused explorer or outline resizes its own width; sizes persist in the session", async () => {
    const root = makeVault();
    const h = await harness({ root, width: 160, config: (c) => (c.ui.outline = true) });
    await h.keys("ctrl+w", "h", "space", "w", "r", "l", "l", "escape");
    expect(h.app.panels.sideW).toBe(34);
    await h.keys("ctrl+w", "l", "ctrl+w", "l", "space", "w", "r", "h", "escape");
    expect(h.app.region).toBe("outline");
    expect(h.app.panels.outW).toBe(30);
    await h.keys("ctrl+w", "h", "ctrl+w", "v", "space", "w", "r", "l", "escape");
    const ratio = h.app.tab!.ratio;
    h.app.quit();
    const again = await harness({ root, open: null, width: 160, config: (c) => (c.ui.restore_session = true) });
    expect(again.app.panels.sideW).toBe(34);
    expect(again.app.panels.outW).toBe(30);
    expect(again.app.panels.outlineShown).toBe(true); // the outline pane itself is restored too
    expect(again.app.tab!.ratio).toBeCloseTo(ratio, 5);
  });
  test("resize keys and the default split ratio come from config", async () => {
    const h = await harness({
      open: "samples/handbook/operations-handbook.md",
      width: 160,
      config: (c) => ((c.ui.split_ratio = 0.3), (c.keys = { resize: { a: "wider" } } as unknown as Config["keys"])),
    });
    await h.keys("ctrl+w", "v", "ctrl+w", "h");
    expect(h.app.tab!.ratio).toBe(0.3);
    await h.keys("space", "w", "r", "a");
    expect(h.app.tab!.ratio).toBeGreaterThan(0.3);
  });
});

describe("review cycle 1 (TUI)", () => {
  test("resize mode: every step changes the drawn width", async () => {
    const h = await harness({ width: 100, height: 30, config: (c) => (c.ui.outline = true) });
    await h.app.run("explorer.cycle");
    await h.app.run("explorer.cycle"); // focus it
    for (let i = 0; i < 15; i++) await h.app.run("window.wider");
    await h.keys("escape");
    await h.app.run("outline.cycle");
    let last = h.app.panels.outlineWidth();
    for (let i = 0; i < 3; i++) {
      await h.app.run("window.narrower");
      h.frame();
      expect(h.app.panels.outlineWidth()).toBeLessThan(last);
      last = h.app.panels.outlineWidth();
    }
  });
});

describe("review cycle 5 (TUI journeys: a resize round trip)", () => {
  const drawAt = (h: Harness, w: number, ht: number) => h.app.draw(new TextCanvas(w, ht));
  test("the window's top comes back to the same row: a wrapped paragraph's, a table's", async () => {
    const h = await harness({ open: "samples/logs/observing-log-2026.md", width: 130, height: 36 });
    const v = h.app.view!;
    for (const start of [0, 7, 19, 33, 51]) {
      h.app.views.scrollBy(v, start - v.top, false);
      drawAt(h, 130, 36);
      const top = v.top;
      drawAt(h, 130, 20);
      drawAt(h, 130, 36);
      expect(v.top).toBe(top);
      drawAt(h, 100, 36);
      drawAt(h, 130, 36);
      expect(v.top).toBe(top);
    }
  });
  test("a cursor on a table's bottom border stays there through a resize", async () => {
    const h = await harness({ open: "samples/scratch/wrap-probe.md", width: 130, height: 40 });
    const v = h.app.view!;
    const rows = h.app.currentLayout(v).lines.map((l) => l.spans.map((s) => s.text).join(""));
    const bottom = rows.findLastIndex((r) => r.startsWith("└"));
    expect(bottom).toBeGreaterThan(0);
    h.app.moveCursor(v, { row: bottom, col: 0 });
    drawAt(h, 90, 40);
    drawAt(h, 130, 40);
    expect(v.cur.row).toBe(bottom);
  });
});
