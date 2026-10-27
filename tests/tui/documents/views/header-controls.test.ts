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
  test("without the window header, the outline button is in the top bar", async () => {
    const h = await harness({
      width: 100,
      height: 14,
      config: (c) => ((c.ui.window_header = false), (c.ui.right_rail = false)),
    });
    h.frame();
    const btn = h.app.geometry!.hot.find((r) => r.id === "btn:outline")!;
    expect(btn.y).toBe(0);
    click(h, btn.x + 1, btn.y);
    expect(h.app.panels.outlineShown).toBe(true);
  }); // 29 harnesses
});

describe("review round 3", () => {
  test("the outline button stays reachable when an overlaid outline hides the breadcrumb", async () => {
    const h = await harness({ width: 70, height: 30 });
    await h.keys("space", "o");
    h.frame();
    expect(h.app.geometry!.hot.some((r) => r.id === "btn:outline")).toBe(true);
  });
});

describe("lists and commands no test had run (the TUI model)", () => {
  test("a split with the window header off: each window titled by its note on its top row", async () => {
    const h = await harness({ width: 160, config: (c) => (c.ui.window_header = false) });
    await h.keys("ctrl+w", "v");
    await h.app.run("note.open notes/beta.md");
    const [a, b] = h.app.geometry!.panes;
    const c = h.canvas();
    const top = (p: typeof a) => c.rows[p!.y - 1]!.slice(p!.x, p!.x + p!.w).join("");
    expect([top(a), top(b)].map((t) => t.trim()).sort()).toEqual(["index.md", "notes/beta.md"]);
  });
});
