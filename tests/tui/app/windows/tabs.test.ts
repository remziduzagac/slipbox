import { describe, expect, test } from "bun:test";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review round 1", () => {
  test("closing another tab keeps you on yours", async () => {
    const h = await harness({ width: 120, height: 30 });
    h.app.openInNewTab("notes/alpha.md");
    h.app.openInNewTab("notes/beta.md");
    h.app.activeTab = 0;
    h.app.windows.closeTabAt(2);
    expect(h.app.activeTab).toBe(0);
    h.app.activeTab = 1;
    h.app.windows.closeTabAt(0);
    expect(h.app.tabs[h.app.activeTab]!.views[0]!.buf.rel).toBe("notes/alpha.md");
  }); // 29 harnesses
});

describe("tabs (ctrl+t, space t)", () => {
  test("new, next, previous, go to, move, list, close", async () => {
    const h = await harness();
    await h.keys("ctrl+t", "c");
    expect(h.app.tabs).toHaveLength(2);
    await h.app.run("note.open notes/beta.md");
    await h.keys("ctrl+t", "p");
    expect(h.app.activeTab).toBe(0);
    await h.keys("ctrl+pagedown");
    expect(h.app.activeTab).toBe(1);
    await h.keys("ctrl+t", "1");
    expect(h.app.activeTab).toBe(0);
    await h.keys("ctrl+t", "shift+l");
    expect(h.app.activeTab).toBe(1);
    expect(h.app.tabs[0]!.views[0]!.buf.rel).toBe("notes/beta.md");
    await h.keys("space", "t", "shift+left");
    expect(h.app.activeTab).toBe(0);
    await h.keys("ctrl+t", "t");
    expect(h.frame()).toContain("Tabs (2)");
    await h.keys("escape", "ctrl+t", "q");
    expect(h.app.tabs).toHaveLength(1);
  });
});

describe("closing tabs: others, all", () => {
  test("ctrl+t shift+o keeps this tab; ctrl+t shift+q closes every tab, the explorer focused", async () => {
    const h = await harness();
    await h.app.run("tab.new");
    await h.app.run("note.open notes/alpha.md");
    await h.app.run("tab.new");
    await h.app.run("note.open notes/beta.md");
    expect(h.app.tabs.length).toBe(3);
    await h.keys("ctrl+t", "o");
    expect(h.app.tabs.length).toBe(1);
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
    await h.app.run("tab.new");
    await h.keys("ctrl+t", "shift+q");
    expect(h.app.tabs.length).toBe(0);
    expect(h.app.region).toBe("sidebar");
    expect(h.frame()).toContain("No note open");
    await h.app.run("note.open index.md"); // and a note opens again from there
    expect(h.app.view!.buf.rel).toBe("index.md");
  });
});

describe("pinned tabs", () => {
  test("pinned tabs keep left, in the order pinned; moves stay in their group; the session keeps them", async () => {
    const root = makeVault();
    const h = await harness({ root });
    for (const n of ["notes/alpha.md", "notes/beta.md", "crlf.md"]) {
      await h.app.run("tab.new");
      await h.app.run(`note.open ${n}`);
    }
    const names = () => h.app.tabs.map((t) => `${t.pinned ? "^" : ""}${t.views[t.active]!.buf.rel}`).join(" ");
    expect(names()).toBe("index.md notes/alpha.md notes/beta.md crlf.md");
    await h.keys("ctrl+t", "m"); // crlf pinned: to the left
    h.app.activeTab = 3;
    await h.keys("ctrl+t", "m"); // beta pinned: after crlf
    expect(names()).toBe("^crlf.md ^notes/beta.md index.md notes/alpha.md");
    expect(h.frame()).toMatch(/1 ⚑ crlf\.md/);
    await h.keys("ctrl+t", "shift+l"); // beta can't leave the pinned group
    expect(names()).toBe("^crlf.md ^notes/beta.md index.md notes/alpha.md");
    await h.keys("ctrl+t", "shift+h");
    expect(names()).toBe("^notes/beta.md ^crlf.md index.md notes/alpha.md");
    h.app.quit();
    const again = await harness({ root, open: null, config: (c) => (c.ui.restore_session = true) });
    expect(again.app.tabs.filter((t) => t.pinned).map((t) => t.views[0]!.buf.rel)).toEqual([
      "notes/beta.md",
      "crlf.md",
    ]);
  });
  test("a link from a pinned tab opens in a new tab; close others and close all keep pinned tabs", async () => {
    const h = await harness();
    await h.keys("ctrl+t", "m");
    const v = h.app.view!;
    const l = h.app.currentLayout(v).links.find((x) => x.target === "notes/alpha.md")!;
    h.app.moveCursor(v, { row: l.line, col: l.col });
    await h.keys("enter");
    expect(h.app.tabs.length).toBe(2);
    expect(h.app.tabs[0]!.views[0]!.buf.rel).toBe("index.md"); // the pinned tab kept its note
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    await h.app.run("tab.new");
    await h.keys("ctrl+t", "o");
    expect(h.app.tabs.map((t) => t.views[0]!.buf.rel)).toEqual(["index.md", "notes/alpha.md"]);
    await h.keys("ctrl+t", "shift+q");
    expect(h.app.tabs.map((t) => t.views[0]!.buf.rel)).toEqual(["index.md"]);
    expect(h.app.messages.at(-1)!.text).toContain("aren't pinned");
    await h.keys("ctrl+t", "q"); // closing it directly works (the last tab stays, as ever)
    expect(h.app.tabs.length).toBe(1);
  });
});

describe("the key map as agreed (vim first, desktop editors' ctrl keys, space for the rest)", () => {
  test("q and :q close the window, then the tab; on the last, q only says so and :q quits", async () => {
    const h = await harness();
    await h.keys("ctrl+w", "v");
    await h.app.run("tab.new");
    expect([h.app.tabs.length, h.app.tab!.views.length]).toEqual([2, 1]);
    await h.keys("q"); // the tab's only window: the tab
    expect(h.app.tabs.length).toBe(1);
    await h.keys("q"); // a split: its window
    expect(h.app.tab!.views.length).toBe(1);
    await h.keys("q"); // the last: never quits on one key
    expect(h.quit.called).toBe(false);
    expect(h.app.messages.at(-1)!.text).toContain("ctrl+q");
    await h.keys(":", "q", "enter");
    expect(h.quit.called).toBe(true);
  });
  test("tabs: ctrl+t c new, gt / gT and alt+N move, ctrl+t o closes the others, ctrl+t m pins", async () => {
    const h = await harness();
    await h.keys("ctrl+t", "c", "ctrl+t", "c");
    expect(h.app.tabs.length).toBe(3);
    await h.keys("g", "t");
    expect(h.app.activeTab).toBe(0);
    await h.keys("g", "shift+t");
    expect(h.app.activeTab).toBe(2);
    await h.keys("alt+2");
    expect(h.app.activeTab).toBe(1);
    await h.keys("ctrl+t", "m");
    expect(h.app.tabs[0]!.pinned).toBe(true);
    await h.keys("ctrl+t", "o");
    expect(h.app.tabs.length).toBe(1);
  });
});

describe("lists and commands no test had run (the TUI model)", () => {
  test("the tab list: enter goes to the tab picked", async () => {
    const h = await harness();
    await h.keys("ctrl+t", "c");
    await h.app.run("note.open notes/beta.md");
    expect(h.app.activeTab).toBe(1);
    await h.keys("ctrl+t", "t", "up", "enter");
    expect(h.app.overlay).toBeNull();
    expect(h.app.activeTab).toBe(0);
    expect(h.app.view!.buf.rel).toBe("index.md");
  });
});

describe("what keymap.md and tui.md promise (review: docs against the tests)", () => {
  test("tab keys: ctrl+pageup the previous, alt+1 and space t 1 the first, ctrl+shift+pageup moves the tab left", async () => {
    const h = await harness();
    await h.app.run("note.open notes/alpha.md");
    await h.keys("ctrl+t", "c");
    await h.app.run("note.open notes/beta.md");
    expect(h.app.tabs.map((t) => t.views[0]!.buf.rel)).toEqual(["notes/alpha.md", "notes/beta.md"]);
    await h.keys("ctrl+pageup");
    expect(h.app.activeTab).toBe(0);
    await h.keys("ctrl+pagedown", "alt+1");
    expect(h.app.activeTab).toBe(0);
    await h.keys("ctrl+pagedown", "space", "t", "1");
    expect(h.app.activeTab).toBe(0);
    await h.keys("ctrl+pagedown", "ctrl+shift+pageup");
    expect(h.app.tabs.map((t) => t.views[0]!.buf.rel)).toEqual(["notes/beta.md", "notes/alpha.md"]);
    expect(h.app.activeTab).toBe(0); // the tab moved goes on being the one shown
    await h.keys("ctrl+shift+pagedown");
    expect(h.app.tabs.map((t) => t.views[0]!.buf.rel)).toEqual(["notes/alpha.md", "notes/beta.md"]);
  });
});
