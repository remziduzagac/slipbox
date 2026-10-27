import { describe, expect, test } from "bun:test";
import { makeSandbox, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review round 1", () => {
  const click = (h: Harness, x: number, y: number, button = 0) => {
    h.app.mouse.handle({ type: "down", x, y, button });
    h.app.mouse.handle({ type: "up", x, y, button });
    h.frame();
  };
  test("the wheel scrolls the explorer and outline, and on narrow screens not the note under them", async () => {
    const h = await harness({
      open: "samples/handbook/operations-handbook.md",
      width: 120,
      height: 20,
      config: (c) => (c.ui.outline = true),
    });
    h.frame();
    const sb = h.app.geometry!.sidebarPane!;
    h.app.mouse.handle({
      type: "scroll",
      x: sb.x + 3,
      y: sb.y + 4,
      button: 0,
      scroll: { direction: "down", delta: 1 },
    });
    h.frame();
    expect(h.app.sidebar.scroll).toBeGreaterThan(0);
    const op = h.app.geometry!.outlinePane!;
    h.app.mouse.handle({
      type: "scroll",
      x: op.x + 3,
      y: op.y + 4,
      button: 0,
      scroll: { direction: "down", delta: 1 },
    });
    h.frame();
    expect(h.app.outline.scroll).toBeGreaterThan(0);
    const n = await harness({ open: "samples/handbook/operations-handbook.md", width: 70, height: 20 });
    await n.keys("space", "e");
    n.frame();
    const p = n.app.geometry!.sidebarPane!;
    const top = n.app.view!.top;
    n.app.mouse.handle({ type: "scroll", x: p.x + 3, y: p.y + 4, button: 0, scroll: { direction: "down", delta: 1 } });
    expect(n.app.view!.top).toBe(top);
  });
  test("clicks on an overlaid explorer or outline don't reach what's under it", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 80, height: 24 });
    await h.keys("]", "]");
    await h.keys("space", "e");
    h.frame();
    const p = h.app.geometry!.sidebarPane!;
    const row = h.app.view!.cur.row;
    click(h, p.x + 3, p.y);
    expect(h.app.view!.cur.row).toBe(row);
    expect(h.app.region).toBe("sidebar");
  }); // 29 harnesses
});

describe("review round 2", () => {
  const click = (h: Harness, x: number, y: number) => {
    h.app.mouse.handle({ type: "down", x, y, button: 0 });
    h.app.mouse.handle({ type: "up", x, y, button: 0 });
    h.frame();
  };
  test("an overlaid explorer keeps clicks on its border and margin", async () => {
    const h = await harness({ open: "samples/about-this-vault.md", width: 70, height: 30 });
    await h.keys("space", "e");
    h.frame();
    const p = h.app.geometry!.sidebarPane!;
    const cur = { ...h.app.view!.cur };
    click(h, p.x + p.w - 1, p.y + 6); // the margin, over the note
    expect(h.app.view!.cur).toEqual(cur);
    expect(h.app.region).toBe("sidebar");
  });
});
