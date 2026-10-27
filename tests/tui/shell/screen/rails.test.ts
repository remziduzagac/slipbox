import { describe, expect, test } from "bun:test";
import { makeSandbox, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("the rails (ui.left_rail, ui.right_rail)", () => {
  test("a column at the right edge under the tab strip; its ▤ toggles the outline, which opens beside it", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 140, height: 30 });
    const f = h.frame();
    const rows = f.split("\n");
    const W = 140;
    const x = W - h.app.panels.rightRailWidth;
    expect(h.app.panels.rightRailWidth).toBe(3); // tinted: one button wide, no border
    const btn = h.app.geometry!.hot.find((r) => r.id === "btn:outline")!;
    expect(btn.x).toBe(x);
    expect([...rows[btn.y]!][x + 1]).toBe("▤");
    // The rail's column is tinted from under the strip's rule to the bottom rule, with no line.
    const c = h.canvas();
    expect(c.styles[btn.y + 5]![x]!.bg).toBe(h.app.theme.roles.rail.bg!);
    const col = rows.map((r) => [...r][x] ?? "").join("");
    expect(col).not.toMatch(/[┃┳┻┫]/u);
    // Only one ▤: not on the breadcrumb as well.
    expect(h.app.geometry!.hot.filter((r) => r.id === "btn:outline").length).toBe(1);
    h.app.mouse.handle({ type: "down", x: btn.x + 1, y: btn.y, button: 0 });
    h.app.mouse.handle({ type: "up", x: btn.x + 1, y: btn.y, button: 0 });
    h.frame();
    expect(h.app.panels.outlineShown).toBe(true);
    const o = h.app.geometry!.outline!;
    expect(o.x + o.w).toBe(x); // the outline ends at the rail
    // Without colour there's no tint: the rail is a bordered column, joined to the rules.
    const mono = await harness({
      open: "samples/handbook/operations-handbook.md",
      width: 140,
      height: 30,
      themeName: "mono",
    });
    const mrows = mono.frame().split("\n");
    expect(mono.app.panels.rightRailWidth).toBe(4);
    const mcol = mrows.map((r) => [...r][W - 4] ?? "").join("");
    expect(mcol).toContain("┳");
    expect(mcol).toContain("┻");
    // Zen has no rails; ui.right_rail = false removes it and the breadcrumb gets ▤ back.
    await h.app.run("ui.zen");
    h.frame();
    expect(h.app.panels.rightRailWidth).toBe(0);
    await h.app.run("ui.zen");
    const n = await harness({
      open: "samples/handbook/operations-handbook.md",
      width: 140,
      height: 30,
      config: (c) => (c.ui.right_rail = false),
    });
    n.frame();
    expect(n.app.panels.rightRailWidth).toBe(0);
    const b2 = n.app.geometry!.hot.find((r) => r.id === "btn:outline")!;
    expect(b2.x + b2.w).toBe(W);
  });
});

describe("the left rail", () => {
  test("a column at the left edge under the top bar; its ≡ toggles the explorer, which opens beside it", async () => {
    const h = await harness({
      open: "samples/handbook/operations-handbook.md",
      width: 140,
      height: 30,
      config: (c) => (c.ui.sidebar = false),
    });
    const rows = h.frame().split("\n");
    expect(h.app.panels.leftRailWidth).toBe(3);
    const btn = h.app.geometry!.hot.find((r) => r.id === "btn:explorer")!;
    expect(btn.x).toBe(0);
    expect(btn.y).toBe(2); // under the top bar's rule, level with the tab strip
    expect([...rows[btn.y]!][1]).toBe("≡");
    expect(h.app.geometry!.hot.filter((r) => r.id === "btn:explorer").length).toBe(1); // not in the top bar too
    expect(h.canvas().styles[btn.y + 5]![1]!.bg).toBe(h.app.theme.roles.rail.bg!); // tinted, no border
    expect(rows[1]!.slice(0, 5)).toBe("━".repeat(5)); // the top rule runs over it unbroken
    expect(h.app.geometry!.tabStrip!.x).toBe(3); // the strip starts after the rail
    h.app.mouse.handle({ type: "down", x: btn.x + 1, y: btn.y, button: 0 });
    h.app.mouse.handle({ type: "up", x: btn.x + 1, y: btn.y, button: 0 });
    h.frame();
    expect(h.app.panels.sidebarShown).toBe(true);
    expect(h.app.geometry!.sidebarPane!.x).toBe(3);
    // Without it, ≡ is back in the top bar.
    const n = await harness({ width: 140, height: 30, config: (c) => (c.ui.left_rail = false) });
    n.frame();
    expect(n.app.geometry!.hot.find((r) => r.id === "top:zoom")!.y).toBe(0);
  });
});
