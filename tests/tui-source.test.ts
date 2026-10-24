import { expect, test } from "bun:test";
import { harness, makeSandbox } from "./tui-harness.ts";

makeSandbox();

test("source editor: relative gutter options and an INSERT bar, NORMAL block", async () => {
  for (const relative of ["lens", "source", "both", "off"] as const) {
    const h = await harness({
      config: (c) => {
        c.ui.line_numbers = true;
        c.ui.relative_numbers = relative;
      },
    });
    await h.keys("ctrl+k", "j", "j");
    const v = h.app.view!;
    let c = h.canvas();
    const pane = h.app.geometry!.panes[0]!;
    const layout = h.app.currentLayout(v);
    const row = v.cur.row - 1;
    const absolute = layout.lines[row]!.src;
    const expected = relative === "source" || relative === "both" ? 1 : absolute;
    expect(
      c
        .line(pane.y + row - v.top)
        .slice(pane.x, pane.textX)
        .trim(),
    ).toBe(String(expected));
    expect(c.nativeCursor).toBeNull();
    await h.keys("i");
    c = h.canvas();
    expect(c.nativeCursor).toEqual(h.app.geometry!.cursor!);
    await h.keys("escape");
    expect(h.app.view!.insert).toBe(false);
    expect(h.canvas().nativeCursor).toBeNull();
    await h.keys("v");
    expect(h.app.view!.visual).toBe("char");
    await h.keys("escape");
    expect(h.app.view!.visual).toBeNull();
  }
});
