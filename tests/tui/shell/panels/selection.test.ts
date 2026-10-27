import { describe, expect, test } from "bun:test";
import { makeSandbox, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("explorer and outline panes", () => {
  test("ctrl+e cycles open, focus, close; enter and l open tabs (or switch); o here; s the split; q closes", async () => {
    const h = await harness({ config: (c) => (c.ui.sidebar = false) });
    expect(h.app.panels.sidebarShown).toBe(false);
    await h.keys("space", "e");
    expect(h.app.panels.sidebarShown).toBe(true);
    expect(h.app.region).toBe("sidebar");
    await h.keys("escape");
    expect(h.app.region).toBe("content");
    await h.keys("space", "e");
    expect(h.app.region).toBe("sidebar");
    await h.keys("space", "e");
    expect(h.app.panels.sidebarShown).toBe(false);
    await h.keys("space", "e");
    h.app.sidebar.selected = h.app.explorer.treeRows().findIndex((r) => r.path === "notes");
    await h.keys("l", "j", "enter");
    expect(h.app.tabs).toHaveLength(2);
    await h.keys("space", "e", "j", "l"); // l opens a tab too
    expect(h.app.tabs).toHaveLength(3);
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
    await h.keys("space", "e", "k", "enter"); // already open: switches to its tab
    expect(h.app.tabs).toHaveLength(3);
    expect(h.app.activeTab).toBe(1);
    await h.keys("space", "e", "j", "o"); // o replaces the current window's note
    expect(h.app.tabs).toHaveLength(3);
    expect(h.app.tabs[1]!.views[0]!.buf.rel).toBe("notes/beta.md");
    await h.keys("space", "e", "s");
    expect(h.app.tab!.views).toHaveLength(2);
    await h.keys("space", "e", "q");
    expect(h.app.panels.sidebarShown).toBe(false);
  });
  test("reveal: space shift+e", async () => {
    const h = await harness({ open: "notes/beta.md", config: (c) => (c.ui.sidebar = false) });
    await h.keys("space", "shift+e");
    expect(h.app.explorer.treeRows()[h.app.sidebar.selected]!.path).toBe("notes/beta.md");
  });
  test("outline: ctrl+o opens and focuses, focuses, closes; it follows the cursor while unfocused; enter jumps; h folds", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 160 });
    await h.keys("space", "o");
    expect(h.app.panels.outlineShown).toBe(true);
    expect(h.app.region).toBe("outline"); // opening focuses it
    expect(h.app.geometry!.outline).not.toBeNull();
    await h.keys("escape"); // back to the note; the outline stays open
    expect(h.app.region).toBe("content");
    expect(h.app.panels.outlineShown).toBe(true);
    await h.keys("space", "o"); // open, focus elsewhere: focus it
    expect(h.app.region).toBe("outline");
    await h.keys("space", "o"); // focused: close
    expect(h.app.panels.outlineShown).toBe(false);
    expect(h.app.region).toBe("content");
    await h.keys("space", "o", "escape");
    await h.keys("]", "]", "]", "]");
    expect(h.app.outline.selected).toBe(h.app.outlineView.currentSection());
    await h.keys("ctrl+w", "l");
    expect(h.app.region).toBe("outline");
    await h.keys("g", "g", "enter");
    expect(h.app.region).toBe("content");
    expect(h.app.view!.cur.row).toBe(h.app.outlineView.rows()[0]!.line);
    const before = h.app.outlineView.rows().length;
    await h.keys("ctrl+w", "l", "g", "g", "h");
    expect(h.app.outlineView.rows().length).toBeLessThan(before);
    await h.keys("l");
    expect(h.app.outlineView.rows().length).toBe(before);
    await h.keys("q");
    expect(h.app.panels.outlineShown).toBe(false);
  });
  test("narrow: panes overlay the content and close after a pick", async () => {
    const h = await harness({ width: 60, height: 20 });
    expect(h.frame()).not.toContain("▸ notes");
    await h.keys("space", "e");
    expect(h.frame()).toContain("▸ notes");
    await h.keys("escape");
    expect(h.frame()).not.toContain("▸ notes");
  });
});
