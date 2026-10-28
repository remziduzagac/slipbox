import { expect, test } from "bun:test";
import { harness, makeSandbox } from "../../../tui-harness.ts";

makeSandbox();

test("document tool movement unpins before selection and resumes the existing filter", async () => {
  const { app } = await harness({ width: 140 });
  for (const owner of [app.footnotes, app.info, app.outlineView]) {
    const count = owner.rows().length;
    app.outline.pinned = true;
    owner.action("bottom");
    expect(app.outline.pinned).toBe(false);
    expect(app.outline.selected).toBe(count - 1);
    owner.action("top");
    expect(app.outline.selected).toBe(0);
    app.outline.filter = "existing";
    app.outline.filtering = false;
    app.outline.pinned = true;
    owner.action("filter");
    expect(app.outline).toMatchObject({ pinned: false, filtering: true, filter: "existing", selected: 0 });
    app.outline.filter = "";
  }
});

test("five pane owners keep close and leave distinct on wide, narrow and zen screens", async () => {
  for (const mode of ["wide", "narrow", "zen"]) {
    const { app } = await harness({ width: mode === "narrow" ? 50 : 160 });
    app.ui.zen = mode === "zen";
    for (const [owner, side] of [
      [app.explorer, "sidebar"],
      [app.history, "sidebar"],
      [app.footnotes, "outline"],
      [app.info, "outline"],
      [app.outlineView, "outline"],
    ] as const) {
      const state = app[side];
      state.visible = true;
      state.overlay = true;
      app.region = side;
      owner.action("leave");
      expect(app.region as string).toBe("content");
      expect(state.visible).toBe(true);
      expect(state.overlay).toBe(mode === "wide");
      state.overlay = true;
      app.region = side;
      owner.action("close");
      expect(app.region as string).toBe("content");
      expect(state.visible).toBe(mode !== "wide");
      expect(state.overlay).toBe(mode === "wide");
    }
  }
});
