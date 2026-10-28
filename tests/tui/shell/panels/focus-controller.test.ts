import { describe, expect, test } from "bun:test";
import { PanelFocus, type PanelFocusHost } from "../../../../src/tui/shell/panels/focus.ts";

const fixture = () => {
  const host = {
    narrow: false,
    ui: { zen: false },
    sidebar: { visible: true, overlay: false },
    outline: { visible: false, overlay: false },
    region: "content" as PanelFocusHost["region"],
    problems: { panel: { shown: false } },
  };
  return { host, focus: new PanelFocus(host, () => host.narrow) };
};

describe("panel focus controller without App", () => {
  test("wide visibility follows preferences; narrow and zen follow temporary overlays", () => {
    const { host, focus } = fixture();
    expect([focus.sidebarShown, focus.outlineShown]).toEqual([true, false]);
    host.narrow = true;
    expect([focus.sidebarShown, focus.outlineShown]).toEqual([false, false]);
    focus.showOutline(true);
    expect(host.outline).toEqual({ visible: false, overlay: true });
    host.narrow = false;
    expect(focus.outlineShown).toBe(false);
    host.ui.zen = true;
    expect(focus.outlineShown).toBe(true);
    focus.showSidebar(true);
    expect(host.sidebar).toEqual({ visible: true, overlay: true });
  });

  test("hiding a focused side returns focus to content without changing the other side", () => {
    const { host, focus } = fixture();
    host.region = "sidebar";
    focus.showSidebar(false);
    expect<PanelFocusHost["region"]>(host.region).toBe("content");
    expect(host.sidebar).toEqual({ visible: false, overlay: false });
    host.region = "outline";
    focus.showOutline(false);
    expect<PanelFocusHost["region"]>(host.region).toBe("content");
    host.region = "problems";
    focus.showOutline(true);
    expect<PanelFocusHost["region"]>(host.region).toBe("problems");
    expect(host.outline.visible).toBe(true);
  });

  test("focus fallback reads current state after resize, zen and problem visibility changes", () => {
    const { host, focus } = fixture();
    host.region = "sidebar";
    focus.fixRegion();
    expect<PanelFocusHost["region"]>(host.region).toBe("sidebar");
    host.narrow = true;
    focus.fixRegion();
    expect<PanelFocusHost["region"]>(host.region).toBe("content");
    host.outline = { visible: false, overlay: true };
    host.region = "outline";
    host.ui.zen = true;
    focus.fixRegion();
    expect<PanelFocusHost["region"]>(host.region).toBe("outline");
    host.outline.overlay = false;
    focus.fixRegion();
    expect<PanelFocusHost["region"]>(host.region).toBe("content");
    host.region = "problems";
    host.problems.panel.shown = true;
    focus.fixRegion();
    expect<PanelFocusHost["region"]>(host.region).toBe("problems");
    host.problems.panel.shown = false;
    focus.fixRegion();
    expect<PanelFocusHost["region"]>(host.region).toBe("content");
  });

  test("leaving either side preserves wide preferences and hides only its narrow or zen overlay", () => {
    for (const side of ["sidebar", "outline"] as const) {
      const { host, focus } = fixture();
      host[side] = { visible: true, overlay: true };
      host.region = side;
      focus.leave(side);
      expect<PanelFocusHost["region"]>(host.region).toBe("content");
      expect(host[side]).toEqual({ visible: true, overlay: true });
      host.narrow = true;
      host.region = side;
      focus.leave(side);
      expect(host[side]).toEqual({ visible: true, overlay: false });
      host.narrow = false;
      host.ui.zen = true;
      host[side] = { visible: false, overlay: true };
      focus.leave(side);
      expect(host[side]).toEqual({ visible: false, overlay: false });
    }
  });
});
