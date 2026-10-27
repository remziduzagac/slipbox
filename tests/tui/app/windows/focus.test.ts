import { describe, expect, test } from "bun:test";
import { makeSandbox, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review cycle 2 (TUI navigation)", () => {
  const click = (h: Harness, x: number, y: number) => {
    h.app.mouse.handle({ type: "down", x, y, button: 0 });
    h.app.mouse.handle({ type: "up", x, y, button: 0 });
  };
  test("a click clears a half-typed sequence; a tab click focuses the note", async () => {
    const h = await harness({ open: "index.md", width: 120, height: 30 });
    await h.keys("space");
    expect(h.app.pending.length).toBe(1);
    const pane = (h.frame(), h.app.geometry!.panes[0]!);
    // On the note beside the which-key window (a click on one of its entries picks it).
    click(h, pane.x + pane.w - 2, pane.y + 1);
    expect(h.app.pending.length).toBe(0);
    await h.keys("ctrl+t", "c");
    h.app.panels.showSidebar(true);
    h.app.region = "sidebar";
    h.frame();
    const tab = h.app.geometry!.tabs[0]!;
    click(h, tab.x + 1, tab.y);
    expect(h.app.region as string).toBe("content");
  });
});

describe("lists and commands no test had run (the TUI model)", () => {
  test("ctrl+w w: to the other window, round; from a panel, back to the note's window first", async () => {
    const h = await harness({ width: 160 });
    await h.keys("ctrl+w", "v");
    const t = h.app.tab!;
    const at = t.active;
    await h.keys("ctrl+w", "w");
    expect(t.active).toBe(1 - at);
    await h.keys("ctrl+w", "w");
    expect(t.active).toBe(at);
    await h.keys("space", "e");
    h.app.region = "sidebar";
    await h.keys("ctrl+w", "w");
    expect(h.app.region as string).toBe("content");
    expect(t.active).toBe(at); // only back, not on
  });
});
