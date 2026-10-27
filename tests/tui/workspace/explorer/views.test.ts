import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("the left panel's views and filter", () => {
  test("the rail's buttons pick the view; clicking the showing one hides the panel", async () => {
    const h = await harness({ open: "notes/alpha.md", width: 140, height: 30, config: (c) => (c.ui.sidebar = false) });
    await h.app.run("note.open notes/beta.md");
    h.frame();
    const hot = (id: string) => h.app.geometry!.hot.find((r) => r.id === id)!;
    const click = (id: string) => {
      const b = hot(id);
      h.app.mouse.handle({ type: "down", x: b.x + 1, y: b.y, button: 0 });
      h.app.mouse.handle({ type: "up", x: b.x + 1, y: b.y, button: 0 });
      return h.frame();
    };
    expect(hot("btn:history").y).toBe(hot("btn:explorer").y + 1); // one button per row
    let f = click("btn:history");
    expect(h.app.panels.sidebarShown).toBe(true);
    expect(h.app.leftView).toBe("history");
    expect(f).toContain("History");
    f = click("btn:explorer"); // the other view: the same panel switches
    expect(h.app.panels.sidebarShown).toBe(true);
    expect(h.app.leftView).toBe("explorer");
    expect(f).toContain("Explorer");
    click("btn:explorer"); // the showing view: hide
    expect(h.app.panels.sidebarShown).toBe(false);
    // ctrl+e always comes back to the tree.
    click("btn:history");
    await h.keys("space", "e");
    expect(h.app.leftView).toBe("explorer");
  });
  test("the rail's ± shows source control, focused, as its other buttons show their views; again hides it", async () => {
    const h = await harness({ open: "notes/alpha.md", width: 140, height: 30, config: (c) => (c.ui.sidebar = false) });
    h.frame();
    const click = (id: string) => {
      const b = h.app.geometry!.hot.find((r) => r.id === id)!;
      h.app.mouse.handle({ type: "down", x: b.x + 1, y: b.y, button: 0 });
      h.app.mouse.handle({ type: "up", x: b.x + 1, y: b.y, button: 0 });
      return h.frame();
    };
    expect([...h.frame().split("\n")[h.app.geometry!.hot.find((r) => r.id === "btn:git")!.y]!][1]).toBe("±");
    click("btn:git");
    expect([h.app.panels.sidebarShown, h.app.leftView, h.app.region]).toEqual([true, "git", "sidebar"]);
    click("btn:git");
    expect(h.app.panels.sidebarShown).toBe(false);
  });
  test("each view keeps its position (selection, scroll, filter) while the other shows", async () => {
    const h = await harness({ open: "index.md", width: 140, height: 30 });
    await h.app.run("note.open notes/alpha.md");
    await h.app.run("note.open notes/beta.md");
    const click = (id: string) => {
      h.frame();
      const b = h.app.geometry!.hot.find((r) => r.id === id)!;
      h.app.mouse.handle({ type: "down", x: b.x + 1, y: b.y, button: 0 });
      h.app.mouse.handle({ type: "up", x: b.x + 1, y: b.y, button: 0 });
    };
    await h.keys("space", "e", "g", "g", "j", "j");
    const explorerSel = h.app.sidebar.selected;
    click("btn:history"); // its first showing: on `here`, the newest
    expect(h.app.leftView).toBe("history");
    expect(h.app.sidebar.selected).toBe(0);
    await h.keys("j");
    click("btn:explorer");
    expect(h.app.leftView).toBe("explorer");
    expect(h.app.sidebar.selected).toBe(explorerSel); // not moved to the current note
    await h.keys("/", "b", "e", "t");
    const filtered = h.app.sidebar.selected;
    click("btn:history"); // mid-filter: the explorer keeps its filter
    expect(h.app.sidebar.selected).toBe(1);
    expect(h.app.sidebar.filter ?? "").toBe("");
    click("btn:explorer");
    expect(h.app.sidebar.filter).toBe("bet");
    expect(h.app.sidebar.filtering).toBe(false);
    expect(h.app.sidebar.selected).toBe(filtered);
    await h.keys("/"); // resumes the filter; esc clears it
    expect(h.app.sidebar.filtering).toBe(true);
    await h.keys("t");
    expect(h.app.sidebar.filter).toBe("bett");
    await h.keys("escape");
    expect(h.app.sidebar.filter).toBe("");
  });
  test("/ filters the explorer: matching notes under their folders; enter opens, esc clears", async () => {
    const h = await harness({ open: "index.md", width: 140, height: 30 });
    await h.keys("space", "e", "/", "b", "e", "t");
    expect(h.app.sidebar.filtering).toBe(true);
    const rows = h.app.explorer.rows();
    expect(rows.filter((r) => r.kind === "note").map((r) => r.path)).toContain("notes/beta.md");
    expect(rows.some((r) => r.kind === "dir" && r.path === "notes")).toBe(true); // its folder, unfolded
    expect(rows.some((r) => r.path === "notes/alpha.md")).toBe(false);
    const f = h.frame();
    expect(f).toContain("› bet");
    // Under it a rule across the pane, joined to its border, then the list.
    const lines = f.split("\n");
    const at = lines.findIndex((l) => l.includes("› bet"));
    const list = h.app.geometry!.sidebar!;
    const cols = (r: number) => [...lines[r]!].slice(list.x, list.x + list.w + 1).join("");
    expect(cols(at + 1)).toMatch(/^━+[┫╋]$/u); // ╋ where it meets the note's breadcrumb rule
    expect(list.y).toBe(at + 2);
    expect(h.app.sidebar.selected).toBe(rows.findIndex((r) => r.kind === "note"));
    await h.keys("escape");
    expect(h.app.sidebar.filter).toBe("");
    expect(h.app.explorer.rows()).toBe(h.app.explorer.treeRows());
    await h.keys("/", "b", "e", "t", "a");
    const pick = h.app.explorer.rows()[h.app.sidebar.selected]!;
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe(pick.path);
    expect(h.app.region).toBe("content");
    expect(h.app.sidebar.filter).toBe("");
  });
  test("a paste while a pane's filter is typed in goes into it (its first line), the selection on the first match", async () => {
    const h = await harness({
      open: "samples/handbook/operations-handbook.md",
      width: 160,
      height: 40,
      config: (c) => (c.ui.outline = true),
    });
    h.app.panels.showSidebar(true);
    h.app.leftView = "explorer";
    h.app.region = "sidebar";
    await h.keys("/");
    await h.app.input.paste("beta\nmore");
    expect(h.app.sidebar.filter).toBe("beta");
    expect(h.app.explorer.rows()[h.app.sidebar.selected]!.path).toBe("notes/beta.md");
    await h.keys("escape", "space", "o", "/");
    expect(h.app.region as string).toBe("outline");
    await h.app.input.paste("Swapping\r\nnot this");
    expect(h.app.outline.filter).toBe("Swapping");
    expect(h.app.outlineView.rows()[h.app.outline.selected]!.text).toStartWith("Swapping a filter");
  });
  test("/ filters the outline: matching headings under their parents; enter jumps, esc clears", async () => {
    const h = await harness({
      open: "samples/handbook/operations-handbook.md",
      width: 160,
      height: 40,
      config: (c) => (c.ui.outline = true),
    });
    await h.keys("space", "o"); // focus it
    expect(h.app.region).toBe("outline");
    await h.keys("/", ..."Swapping");
    expect(h.app.outline.filtering).toBe(true);
    const rows = h.app.outlineView.rows();
    expect(rows.some((r) => r.text.startsWith("Swapping a filter"))).toBe(true);
    expect(rows.some((r) => r.text.startsWith("O16:"))).toBe(true); // its parent, kept
    expect(rows.some((r) => r.text.startsWith("O1:"))).toBe(false);
    expect(h.frame()).toContain("› Swapping");
    expect(rows[h.app.outline.selected]!.text).toStartWith("Swapping a filter"); // on the match itself
    const line = rows[h.app.outline.selected]!.line;
    await h.keys("enter");
    expect(h.app.region).toBe("content");
    expect(h.app.view!.cur.row).toBe(line);
    expect(h.app.outline.filter).toBe("");
    await h.keys("space", "o", "/", "x", "escape");
    expect(h.app.outline.filter).toBe("");
    expect(h.app.outlineView.rows().length).toBeGreaterThan(10);
  });
  test("history: notes read in other tabs and earlier sessions are there too, under recent (found in use)", async () => {
    const root = makeVault();
    const h = await harness({ root });
    // Each opened in a tab of its own, as the explorer and ctrl+p do: this window's timeline is short.
    h.app.openInNewTab("notes/alpha.md");
    h.app.openInNewTab("notes/beta.md");
    await h.keys("space", "h", "h");
    const rows = h.app.history.rows();
    expect(rows.map((r) => (r.heading ? "--" : r.label))).toEqual(["beta.md", "--", "alpha.md", "index.md"]);
    expect(rows[2]!.hint).toBe("tab 2"); // open in another tab: which
    expect(h.frame()).toContain("recent here");
    // Moving steps over the heading; enter opens the note here, in this window's history.
    await h.keys("down");
    expect(h.app.sidebar.selected).toBe(2);
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    expect(h.app.view!.back.map((l) => l.key)).toEqual(["notes/beta.md"]);
    // A restart: the window's timeline comes back with the session.
    h.app.session.save();
    const again = await harness({ root, open: null, config: (c) => (c.ui.restore_session = true) });
    const v = again.app.view!;
    expect(v.buf.rel).toBe("notes/alpha.md");
    expect(v.back.map((l) => l.key)).toEqual(["notes/beta.md"]);
    await again.app.run("history.back");
    expect(again.app.view!.buf.rel).toBe("notes/beta.md");
  });
  test("history: a double-click in a filtered list jumps to the clicked entry, the filter cleared", async () => {
    const h = await harness();
    await h.app.run("note.open notes/alpha.md");
    await h.app.run("note.open notes/beta.md");
    await h.keys("space", "h", "h", "/", ...[..."index"]);
    const rows = h.app.history.rows();
    const i = rows.findIndex((r) => r.path === "index.md");
    expect(i).toBe(0); // unfiltered, row 0 is beta.md, here
    h.frame();
    const sb = h.app.geometry!.sidebar!;
    const y = sb.y + i - h.app.sidebar.scroll;
    for (const type of ["down", "up", "down", "up"]) h.app.mouse.handle({ type, x: sb.x + 4, y, button: 0 });
    expect(h.app.view!.buf.rel).toBe("index.md");
    expect(h.app.sidebar.filter).toBe("");
  });
  test("history filter: the selection skips the 'recent here' heading, and enter on a recent note opens it here", async () => {
    const h = await harness();
    h.app.openInNewTab("notes/alpha.md");
    h.app.openInNewTab("notes/beta.md"); // this window: beta.md alone; alpha.md and index.md are recent
    await h.keys("space", "h", "h", "/", ...[..."alpha"]);
    const rows = h.app.history.rows();
    expect(rows.map((r) => (r.heading ? "--" : r.label))).toEqual(["--", "alpha.md"]);
    expect(h.app.sidebar.selected).toBe(1); // on the note, not the heading
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    expect(h.app.view!.back.map((l) => l.key)).toEqual(["notes/beta.md"]);
    expect(h.app.region).toBe("content");
  });
  test("history: every note with a reading position is there, newest first, with when (found in use: only 4)", async () => {
    const root = makeVault();
    const h = await harness({ root });
    // Read in earlier sessions: their reading positions, with their times.
    const { PositionStore } = await import("../../../../src/core/workspace/session/position.ts");
    const ps = new PositionStore(h.app.loc);
    const top = { heading: null, headingIndex: 0, offset: 0, line: 1 };
    const files = ["notes/alpha.md", "notes/beta.md", "crlf.md", "bom.md", "escapes.md", "latin1.md", "no-newline.md"];
    for (const f of files) ps.set(f, top);
    ps.save();
    const later = await harness({ root });
    await later.keys("space", "h", "h");
    const recent = later.app.history.rows().filter((r) => r.recent);
    expect(recent.map((r) => r.path).sort()).toEqual([...files].sort());
    expect(recent.every((r) => /^\d\d:\d\d$/.test(r.hint))).toBe(true);
    // A name too long for the pane beside its hint is cut, the hint kept.
    writeFileSync(join(root, "a-rather-long-note-name-here.md"), "# long\n");
    ps.set("a-rather-long-note-name-here.md", top);
    ps.save();
    const narrow = await harness({ root, config: (c) => (c.ui.sidebar_width = 26) });
    await narrow.keys("space", "h", "h");
    const row = narrow
      .frame()
      .split("\n")
      .find((r) => r.includes("a-rather"))!;
    expect(row).toMatch(/a-rather-long-\S*…\s+\d\d:\d\d/);
    // As many as ui.history_limit says: 3, then none.
    const three = await harness({ root, config: (c) => (c.ui.history_limit = 3) });
    await three.keys("space", "h", "h");
    expect(three.app.history.rows().filter((r) => r.recent)).toHaveLength(3);
    const none = await harness({ root, config: (c) => (c.ui.history_limit = 0) });
    await none.app.run("note.open notes/alpha.md");
    await none.keys("space", "h", "h");
    expect(none.app.history.rows().some((r) => r.heading || r.recent)).toBe(false);
    // Out of range: said, and the default kept.
    const { loadConfig } = await import("../../../../src/core/application/config/config.ts");
    const file = join(root, "limit.toml");
    writeFileSync(file, "[ui]\nhistory_limit = 5000\n");
    const loaded = loadConfig({ configFile: file });
    expect(loaded.warnings.join()).toContain('"ui.history_limit" must be between 0 and 2000');
    expect(loaded.config.ui.history_limit).toBe(100);
  });
  test("the history filters too", async () => {
    const h = await harness();
    await h.app.run("note.open notes/alpha.md");
    await h.app.run("note.open notes/beta.md");
    await h.keys("space", "h", "h", "/", "a", "l", "p");
    const rows = h.app.history.rows();
    expect(rows.map((r) => r.label)).toEqual([expect.stringContaining("alpha")]);
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
  });
});
