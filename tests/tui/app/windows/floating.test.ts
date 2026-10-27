import { describe, expect, test } from "bun:test";
import { makeSandbox, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review (tui): the app's floating windows, new paths, roots and repeats", () => {
  const virtualInTabs = (h: Harness) =>
    h.app.tabs
      .flatMap((t) => t.views)
      .filter((v) => v.buf.virtual)
      .map((v) => v.buf.key);

  test("a split made with the properties editor open is of the window under it, never of the floating one", async () => {
    const h = await harness();
    h.app.properties.open();
    await h.app.run("window.split_side");
    expect(h.app.floating).toBeNull();
    expect(h.app.tab!.views.map((v) => v.buf.key)).toEqual(["index.md", "index.md"]);
    // "In the split" (otherWindow) from a hover: the same.
    const o = await harness();
    o.app.overlays.openHover("**x**", "Definition of foo");
    o.app.windows.other();
    expect(o.app.floating).toBeNull();
    expect(o.app.tab!.views.map((v) => v.buf.key)).toEqual(["index.md", "index.md"]);
    expect([...virtualInTabs(h), ...virtualInTabs(o)]).toEqual([]);
  });

  test("a floating window is never a reading position, and the history is the window's under it", async () => {
    const h = await harness();
    h.app.properties.open();
    h.app.session.save();
    h.app.overlays.closeFloating();
    h.app.overlays.openHover("**x**", "Definition of foo");
    h.app.session.save();
    expect(
      h.app.positions
        .entries()
        .map((e) => e.key)
        .filter((k) => k.includes("#properties") || k.startsWith("hover:")),
    ).toEqual([]);
    expect(h.app.history.rows().find((r) => r.here)).toMatchObject({ path: "index.md" });
  });
});
