import { describe, expect, test } from "bun:test";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { crumbLayout } from "../../../../src/tui/documents/views/header-layout.ts";
import { makeSandbox, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("breadcrumb collapse (…) and the path dropdown", () => {
  test("crumbLayout: all, then first … innermost, then cut, then … last, then …", () => {
    const shape = (ps: ReturnType<typeof crumbLayout>) =>
      ps.map((p) => (p === "more" ? "…" : `${p.i}:${p.w}`)).join(" ");
    const ws = [20, 15, 15, 20];
    expect(shape(crumbLayout(ws, 200, 3))).toBe("0:20 1:15 2:15 3:20");
    expect(shape(crumbLayout(ws, 70, 3))).toBe("0:20 … 2:15 3:20"); // 20+3+1+3+15+3+20 = 65
    expect(shape(crumbLayout(ws, 50, 3))).toBe("0:20 … 3:20");
    expect(shape(crumbLayout(ws, 30, 3))).toBe("0:8 … 3:15"); // cut, the last keeps the most
    expect(shape(crumbLayout(ws, 20, 3))).toBe("… 3:16");
    expect(shape(crumbLayout(ws, 10, 3))).toBe("…");
    expect(shape(crumbLayout([30, 30], 40, 3))).toBe("0:8 1:29"); // two: no … until the first goes
    expect(shape(crumbLayout([30], 12, 3))).toBe("0:12");
    expect(shape(crumbLayout([30], 5, 3))).toBe("…");
  });
  test("space f b with the which-key popup drawn over the breadcrumb after space f: the dropdown under it all the same (#40)", async () => {
    const h = await harness({
      open: "samples/handbook/operations-handbook.md",
      width: 100,
      height: 34,
      config: (c) => (c.ui.outline = false),
    });
    const v = h.app.view!;
    const target = h.app.currentLayout(v).headings.find((x) => x.text.startsWith("Swapping a filter"))!;
    h.app.moveCursor(v, { row: target.line + 1, col: 0 });
    h.frame();
    const hot = h.app.geometry!.hot;
    const crumb = hot.find((r) => r.id === "crumbmore:0") ?? hot.find((r) => r.id === "crumbicon:0")!; // its …, else its icon
    // A frame between the keys, as a slow machine draws one: the popup over the breadcrumb takes its clicks.
    await h.keys("space", "f");
    h.frame();
    const popup = h.app.geometry!.popup!;
    expect(crumb.y >= popup.y && crumb.y < popup.y + popup.h && crumb.x < popup.x + popup.w).toBe(true);
    expect(h.app.geometry!.hot.some((r) => r.id === crumb.id)).toBe(false);
    await h.keys("b");
    expect((h.app.overlay as ListOverlay).anchor).toEqual({ x: crumb.x, y: crumb.y });
    expect(h.frame()).toContain("└─");
  });
  test("… opens the whole path as a dropdown under it; enter jumps; space f b opens it too", async () => {
    const h = await harness({
      open: "samples/handbook/operations-handbook.md",
      width: 70,
      height: 30,
      config: (c) => ((c.ui.sidebar = false), (c.ui.outline = false)),
    });
    const v = h.app.view!;
    const target = h.app.currentLayout(v).headings.find((x) => x.text.startsWith("Swapping a filter"))!;
    h.app.moveCursor(v, { row: target.line + 1, col: 0 });
    h.frame();
    const chain = h.app.outlineView.breadcrumb(v);
    expect(chain.length).toBe(3);
    const more = h.app.geometry!.hot.find((r) => r.id === "crumbmore:0")!;
    expect(more).toBeDefined();
    h.app.mouse.handle({ type: "down", x: more.x, y: more.y, button: 0 });
    h.app.mouse.handle({ type: "up", x: more.x, y: more.y, button: 0 });
    const o = h.app.overlay as ListOverlay;
    expect(o.kind).toBe("list");
    expect(o.anchor).toEqual({ x: more.x, y: more.y });
    expect(o.items.map((i) => i.label)).toEqual(chain.map((c) => c.text));
    expect(o.selected).toBe(2); // the current heading
    const f = h.frame();
    const box = h.app.geometry!.overlay!;
    expect(box.y).toBe(more.y + 2); // hanging under the breadcrumb…
    expect(box.x).toBe(Math.floor((70 - box.w) / 2)); // …centred across the screen
    expect(box.w).toBeGreaterThanOrEqual(Math.min(60, 70 - 8));
    expect(box.listY).toBe(box.y + 3); // the filter's row, then a blank row
    expect(box.h).toBeGreaterThanOrEqual(8 + 5);
    expect(f).toContain("└─");
    await h.keys("up", "enter"); // up to the hidden middle one
    expect(h.app.overlay).toBeNull();
    expect(v.cur.row).toBe(chain[1]!.line);
    // From the keyboard: the arrows move, and a click on an entry picks it.
    h.app.moveCursor(v, { row: target.line + 1, col: 0 });
    h.frame();
    await h.keys("space", "f", "b");
    expect(h.app.overlay?.kind).toBe("list");
    expect((h.app.overlay as ListOverlay).selected).toBe(2); // on the current heading
    await h.keys("up", "up");
    expect((h.app.overlay as ListOverlay).selected).toBe(0);
    // Typing filters, as in every list; the filter's row sits above the entries.
    await h.keys("S", "w", "a");
    expect((h.app.overlay as ListOverlay).filtered.map((e) => e.item.label)).toEqual(["Swapping a filter"]);
    expect(h.frame()).toContain("› Swa");
    await h.keys("backspace", "backspace", "backspace");
    await h.keys("up", "up");
    h.frame();
    const g = h.app.geometry!.overlay!;
    h.app.mouse.handle({ type: "down", x: g.x + 4, y: g.listY, button: 0 });
    expect(h.app.overlay).toBeNull();
    expect(v.cur.row).toBe(chain[0]!.line);
  });
});
