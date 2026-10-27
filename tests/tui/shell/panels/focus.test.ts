import { describe, expect, test } from "bun:test";
import { makeSandbox, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review round 1", () => {
  test("focus never stays on a hidden pane", async () => {
    const h = await harness({ width: 120, height: 30 });
    await h.keys("space", "e");
    expect(h.app.region).toBe("sidebar");
    h.app.settings.setUi("zen", true);
    h.frame();
    expect(h.app.region).toBe("content");
  }); // 29 harnesses
});

describe("review round 2", () => {
  test("focusing a pane brings its selection back after the wheel moved the view", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 160, height: 16 });
    h.frame();
    const p = h.app.geometry!.sidebarPane!;
    for (let i = 0; i < 3; i++)
      h.app.mouse.handle({
        type: "scroll",
        x: p.x + 3,
        y: p.y + 3,
        button: 0,
        scroll: { direction: "down", delta: 1 },
      });
    expect(h.app.sidebar.pinned).toBe(true);
    await h.keys("space", "e");
    h.frame();
    expect(h.app.sidebar.pinned).toBe(false);
    const list = h.app.geometry!.sidebar!;
    expect(h.app.sidebar.selected).toBeGreaterThanOrEqual(h.app.sidebar.scroll);
    expect(h.app.sidebar.selected).toBeLessThan(h.app.sidebar.scroll + list.h);
  });
});
