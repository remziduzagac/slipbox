import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { srcAt } from "../../../../src/core/rendering/layout/ir.ts";
import { makeSandbox, makeVault, harness, statusRow, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("the Problems panel (1.7)", () => {
  const setup = async (height = 40) => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-problems-tui-"));
    mkdirSync(join(root, ".slipbox"));
    mkdirSync(join(root, "a"));
    mkdirSync(join(root, "b"));
    writeFileSync(join(root, "a", "twin.md"), "# Twin A\n");
    writeFileSync(join(root, "b", "twin.md"), "# Twin B\n");
    writeFileSync(join(root, "index.md"), "# Index\n\nSee [missing](missing.md) here.\n");
    writeFileSync(join(root, "other.md"), "# Other\n\n![pic](nope.png)\n");
    return await harness({ root, open: "other.md", width: 140, height });
  };
  const rows = (h: Harness) =>
    h.app.problems
      .rows()
      .map((r) => (r.heading ? `# ${r.label}` : r.note ? `  ${r.label}` : `    ${r.label}  ${r.detail}`));
  const hot = (h: Harness, id: string) => h.app.geometry!.hot.find((x) => x.id === id);
  const click = (h: Harness, at: { x: number; y: number }, times = 1) => {
    for (let i = 0; i < times; i++)
      for (const type of ["down", "up"]) h.app.mouse.handle({ type, x: at.x, y: at.y, button: 0 });
  };

  test("space v p: All — the root's broken links, by note, across the bottom; enter goes there, onto the link", async () => {
    const h = await setup();
    await h.keys("space", "v", "p");
    expect(h.app.problems.panel).toMatchObject({ shown: true, tab: "all" });
    expect(h.app.region).toBe("problems");
    expect(h.app.leftView).toBe("explorer"); // not the left panel's view any more
    expect(rows(h)).toEqual([
      "# Broken links (2)",
      "  index.md",
      "    L3  missing.md",
      "  other.md",
      "    L3  nope.png",
      "# Ambiguous links (0)",
      "# Fragile links (0)",
      // Nothing links to them: orphans (9.5).
      "# Orphans (4)",
      "  a/twin.md",
      "  b/twin.md",
      "  index.md",
      "  other.md",
    ]);
    // Across the bottom, under a rule, over the frame's: its tabs, then the rows; the windows end above it.
    const lines = h.frame().split("\n");
    const tabsY = lines.findIndex((l) => l.includes(" This file (1) ") && l.includes(" All (2) "));
    expect(tabsY).toBeGreaterThan(0);
    expect(lines[tabsY - 1]).toMatch(/^━+┻━+$/); // the explorer's border ends on it
    expect(lines.at(-2)).toMatch(/^━+$/);
    expect(lines[tabsY + 1]!.trim()).toBe(""); // a blank row under the tabs
    expect(lines[tabsY + 2]).toContain("Broken links (2)");
    expect(h.app.geometry!.problems).toMatchObject({ x: 0, y: tabsY, w: 140 });
    const pane = h.app.geometry!.panes[0]!;
    expect(pane.y + pane.h).toBeLessThan(tabsY);
    // Enter on a problem: its note, the cursor on the link; the panel stays, the note has the keys.
    h.app.problems.panel.all.selected = 2;
    await h.keys("enter");
    const v = h.app.view!;
    expect(v.buf.rel).toBe("index.md");
    expect(h.app.region).toBe("content");
    expect(h.app.problems.panel.shown).toBe(true);
    expect(h.app.currentLayout(v).links[h.app.linking.linkUnderCursor(v)]).toMatchObject({ target: "missing.md" });
    // Fixed: gone at once.
    writeFileSync(join(h.root, "missing.md"), "# Missing\n");
    const st = statSync(join(h.root, "missing.md"));
    h.app.graph.updateFile("missing.md", {
      rel: "missing.md",
      abs: join(h.root, "missing.md"),
      size: st.size,
      mtimeMs: st.mtimeMs,
    });
    expect(rows(h)[0]).toBe("# Broken links (1)");
    // Focused and on All already, the same keys close it.
    await h.keys("space", "v", "p");
    expect(h.app.region).toBe("problems");
    await h.keys("space", "v", "p");
    expect(h.app.problems.panel.shown).toBe(false);
    expect(h.app.region).toBe("content");
    expect(h.frame()).not.toContain(" This file (");
  });

  test("a section's heading folds; a note's row goes to its first problem; / filters", async () => {
    const h = await setup();
    await h.keys("space", "v", "p");
    h.app.problems.panel.all.selected = 0;
    await h.keys("h");
    expect(rows(h)[0]).toBe("# Broken links (2)");
    expect(rows(h)[1]).toBe("# Ambiguous links (0)");
    await h.keys("l");
    h.app.problems.panel.all.selected = 3; // other.md's row
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("other.md");
    await h.keys("space", "v", "p", "/", "t", "w", "i", "n");
    expect(rows(h)).toEqual(["# Orphans (4)", "  a/twin.md", "  b/twin.md"]);
    // The filter after the tabs' titles.
    expect(
      h
        .frame()
        .split("\n")
        .find((l) => l.includes(" All (2) ")),
    ).toContain("› twin");
    // An orphan's row: the note.
    await h.keys("escape");
    h.app.problems.panel.all.selected = h.app.problems
      .rows()
      .findIndex((r) => r.section === "Orphans" && r.note === "b/twin.md");
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("b/twin.md");
  });

  test("All: a click opens the problem in a tab of its own at its line (the tab showing it, if one does); o here, s the split", async () => {
    const h = await setup();
    await h.app.run("note.open a/twin.md");
    await h.keys("space", "v", "p", "/", "n", "o", "p", "e");
    expect(rows(h)).toEqual(["# Broken links (2)", "  other.md", "    L3  nope.png"]);
    h.frame();
    // Each click a column further: two at one spot within 400 ms are a double-click.
    let dx = 8;
    const at = (i: number) => {
      h.frame();
      const r = hot(h, `prow:${i}`)!;
      return { x: r.x + dx++, y: r.y };
    };
    const tabs = () => h.app.tabs.map((t) => t.views.map((v) => v.buf.rel).join("|"));
    const line = () => srcAt(h.app.currentLayout(h.app.view!).lines[h.app.view!.cur.row]!, h.app.view!.cur.col);
    click(h, at(2));
    expect(tabs()).toEqual(["a/twin.md", "other.md"]);
    expect(h.app.activeTab).toBe(1);
    expect(line()).toBe(3);
    expect(h.app.region).toBe("content");
    expect(h.app.problems.panel.all.filter).toBe(""); // the filter cleared, the panel open
    expect(h.app.problems.panel.shown).toBe(true);
    // index.md's: a third tab; other.md's again, from elsewhere — its tab, no new one, back to its line.
    click(h, at(h.app.problems.rows().findIndex((r) => r.link?.from === "index.md")));
    expect(tabs()).toEqual(["a/twin.md", "other.md", "index.md"]);
    h.app.activeTab = 1;
    h.app.placeAtLine(h.app.view!, 1);
    h.app.activeTab = 0;
    click(h, at(h.app.problems.rows().findIndex((r) => r.link?.from === "other.md")));
    expect(tabs()).toEqual(["a/twin.md", "other.md", "index.md"]);
    expect(h.app.activeTab).toBe(1);
    expect(line()).toBe(3);
    await h.keys("ctrl+o"); // back: where it was in that tab
    expect(line()).toBe(1);
    // The keys as the explorer's: o in this window, s in the split's other.
    await h.app.run("tab.close_others");
    await h.keys("space", "v", "p");
    h.app.problems.panel.all.selected = h.app.problems.rows().findIndex((r) => r.link?.from === "index.md");
    await h.keys("o");
    expect(tabs()).toEqual(["index.md"]);
    await h.keys("space", "v", "p");
    h.app.problems.panel.all.selected = h.app.problems.rows().findIndex((r) => r.link?.from === "other.md");
    await h.keys("s");
    expect(tabs()).toEqual(["index.md|other.md"]);
  });

  test("This file: every problem of the note with its line, the chosen one marked in the text; moving shows it, enter goes there", async () => {
    const root = makeVault();
    writeFileSync(join(root, "two.md"), "# Two\n\nSee [a](gone-a.png) first.\n\nThen\t[b](gone-b.png) too.\n");
    const h = await harness({
      root,
      open: "two.md",
      width: 120,
      height: 40,
      config: (c) => (c.diagnostics.marks = "off"),
    });
    await h.keys("space", "n", "q");
    expect(h.app.problems.panel).toMatchObject({ shown: true, tab: "file" });
    expect(h.app.region).toBe("problems");
    expect(h.app.problems.ofFile().map((p) => `${p.start.line}:${p.start.column} ${p.target}`)).toEqual([
      "3:5 gone-a.png",
      "5:6 gone-b.png",
    ]);
    const lines = h.frame().split("\n");
    const tabsY = lines.findIndex((l) => l.includes(" This file (2) "));
    // A blank row under the tabs; then two rows each, a blank one between: the sign, line:col, the message, who found
    // it; under it the line, its part marked.
    expect(lines[tabsY + 1]!.trim()).toBe("");
    expect(lines[tabsY + 2]).toMatch(/^ ⚠ 3:5 {2}broken link: gone-a\.png +slipbox unresolved$/);
    expect(lines[tabsY + 3]).toMatch(/^ {4}See \[a\]\(gone-a\.png\) first\./);
    expect(lines[tabsY + 4]!.trim()).toBe("");
    expect(lines[tabsY + 5]).toMatch(/^ ⚠ 5:6 {2}broken link: gone-b\.png/);
    expect(lines[tabsY + 6]).toMatch(/^ {4}Then \[b\]\(gone-b\.png\) too\./); // the tab drawn as a space
    const c = h.canvas();
    const col = (y: number, text: string) => [...lines[y]!.slice(0, lines[y]!.indexOf(text))].length;
    const markAt = (y: number, text: string) => c.styles[y]![col(y, text)]!;
    const warn = h.app.theme.roles.problem_warn;
    expect(markAt(tabsY + 3, "[a]")).toMatchObject(warn.bg ? { bg: warn.bg } : { underline: true });
    expect(markAt(tabsY + 3, "See").underline ?? false).toBe(false);
    // The chosen problem marked in the note while the panel has the keys, the marks off or not.
    const focusBg = h.app.theme.roles.link_focus.bg!;
    const noteRow = (text: string) => lines.findIndex((l, y) => y < tabsY && l.includes(text));
    expect(c.styles[noteRow("See a")]![col(noteRow("See a"), "See a") + 4]!.bg).toBe(focusBg);
    expect(c.styles[noteRow("Then")]![col(noteRow("Then"), "b too")]?.bg ?? null).not.toBe(focusBg);
    // j: the next one — the cursor (and the view) on its line, the panel keeping the keys.
    await h.keys("j");
    expect(h.app.problems.panel.file.selected).toBe(1);
    expect(h.app.region).toBe("problems");
    const v = h.app.view!;
    expect(srcAt(h.app.currentLayout(v).lines[v.cur.row]!, v.cur.col)).toBe(5);
    // Focus elsewhere: no mark.
    await h.keys("escape");
    expect(h.app.region).toBe("content");
    expect(h.app.problems.chosen()).toBeUndefined();
    // Back, then enter: there, the note has the keys; back (alt+b) returns where it was.
    await h.keys("space", "n", "q");
    expect(h.app.region).toBe("problems");
    h.app.problems.panel.file.selected = 0;
    await h.keys("enter");
    expect(h.app.region).toBe("content");
    expect(srcAt(h.app.currentLayout(v).lines[v.cur.row]!, v.cur.col)).toBe(3);
    // tab: All, and back.
    await h.keys("space", "n", "q", "tab");
    expect(h.app.problems.panel.tab).toBe("all");
    await h.keys("shift+tab");
    expect(h.app.problems.panel.tab).toBe("file");
  });

  test("the status line's problems, clicked, open This file; a tab's title switches; its button closes", async () => {
    const h = await setup();
    h.frame();
    const at = hot(h, "status:problems")!;
    expect(at.y).toBe(39);
    click(h, at);
    expect(h.app.problems.panel).toMatchObject({ shown: true, tab: "file" });
    expect(h.app.region).toBe("problems");
    h.frame();
    click(h, hot(h, "ptab:all")!);
    expect(h.app.problems.panel.tab).toBe("all");
    h.frame();
    click(h, hot(h, "ptab:file")!);
    expect(h.app.problems.panel.tab).toBe("file");
    h.frame();
    click(h, hot(h, "ptab:close")!);
    expect(h.app.problems.panel.shown).toBe(false);
    expect(h.app.region).toBe("content");
    // No button on the left rail: a file with none has the panel's on the status line, dim — it opens All.
    await h.app.run("note.open a/twin.md");
    h.frame();
    expect(hot(h, "btn:problems")).toBeUndefined();
    expect(statusRow(h.frame())).toMatch(/‹ a\/twin\.md › +⚠ 0 /);
    const none = hot(h, "status:problems")!;
    expect(h.canvas().styles[none.y]![none.x]!.fg).toBe(h.app.theme.roles.status_dim.fg!);
    click(h, none);
    expect(h.app.problems.panel).toMatchObject({ shown: true, tab: "all" });
    h.frame();
    click(h, hot(h, "status:problems")!);
    expect(h.app.problems.panel.shown).toBe(false);
    // A short screen keeps the note: no panel drawn, its keys still work.
    const s = await setup(12);
    await s.keys("space", "n", "q");
    expect(s.frame()).not.toContain(" This file (");
    expect(s.app.region).toBe("problems");
  });
});

describe("the Problems panel: filtered, resized, opened from the bar (1.7)", () => {
  const two = async (height = 40) => {
    const root = makeVault();
    writeFileSync(join(root, "two.md"), "# Two\n\nSee [a](gone-a.png) first.\n\nThen [b](gone-b.png) too.\n");
    return await harness({ root, open: "two.md", width: 120, height });
  };
  const line = (h: Harness) => srcAt(h.app.currentLayout(h.app.view!).lines[h.app.view!.cur.row]!, h.app.view!.cur.col);

  test("This file's filter: / narrows by message, place or line; enter goes there, the filter cleared", async () => {
    const h = await two();
    await h.keys("space", "n", "q", "/", "T", "h", "e", "n");
    expect(h.app.problems.fileRows().map((p) => p.start.line)).toEqual([5]); // the line's text matched
    expect(h.frame()).toMatch(/This file \(2\) .*› Then/); // its count all of them; the filter after the titles
    expect(h.frame()).not.toContain("3:5");
    await h.keys("enter");
    expect(h.app.region).toBe("content");
    expect(line(h)).toBe(5);
    expect(h.app.problems.panel.file.filter).toBe("");
    // Nothing matches: said.
    await h.keys("space", "n", "q", "/", "z", "z", "z");
    expect(h.frame()).toContain("no matches");
    await h.keys("escape");
    expect(h.app.problems.fileRows()).toHaveLength(2);
  });

  test("resized as a window is: ctrl+w + and -, resize mode's j / k, a drag of its rule; = a third again; kept", async () => {
    const h = await two();
    await h.keys("space", "n", "q");
    const drawn = () => (h.frame(), h.app.geometry!.problems!.h);
    const first = drawn();
    await h.keys("ctrl+w", "+");
    expect(drawn()).toBe(first + 1);
    expect(h.app.panels.resizeMode).toBe(true);
    await h.keys("j", "j", "k");
    expect(drawn()).toBe(first + 2);
    await h.keys("h");
    expect(h.app.messages.at(-1)!.text).toContain("j / k resize it");
    await h.keys("escape");
    expect(h.app.panels.resizeMode).toBe(false);
    await h.keys("ctrl+w", "-", "escape");
    expect(drawn()).toBe(first + 1);
    // Its rule dragged up three rows: three taller; the windows above shorter.
    const rule = h.app.geometry!.separators.find((s) => s.kind === "problems")!;
    expect(rule.y).toBe(h.app.geometry!.problems!.y - 1);
    const paneH = h.app.geometry!.panes[0]!.h;
    h.app.mouse.handle({ type: "down", x: 60, y: rule.y, button: 0 });
    h.app.mouse.handle({ type: "drag", x: 60, y: rule.y - 3, button: 0 });
    h.app.mouse.handle({ type: "up", x: 60, y: rule.y - 3, button: 0 });
    expect(drawn()).toBe(first + 4);
    expect(h.app.geometry!.panes[0]!.h).toBe(paneH - 3);
    // Never leaving the note under four rows.
    h.app.problems.resize(200);
    h.frame();
    expect(h.app.geometry!.problems!.y - 1 - h.app.geometry!.panes[0]!.y).toBeGreaterThanOrEqual(4);
    // = : back to a third of the screen.
    await h.keys("ctrl+w", "=");
    expect(drawn()).toBe(first);
    // Kept in the session.
    h.app.problems.resize(15);
    h.app.quit();
    const again = await harness({ root: h.root, open: null, config: (c) => (c.ui.restore_session = true) });
    expect(again.app.problems.panel.height).toBe(15);
    await again.keys("space", "n", "q");
    expect(again.app.geometry!.problems!.h).toBe(15);
  });

  test("a sign of the problems bar, clicked: This file on that problem, the note on it, the panel with the keys", async () => {
    const h = await two();
    h.frame();
    const sign = h.app.geometry!.hot.find((x) => x.id === "pbar:5:6")!;
    expect(h.frame().split("\n")[sign.y]).toContain("Then b too");
    expect(h.canvas().styles[sign.y]![sign.x]!.bg).toBe(h.app.theme.roles.gutter.bg!); // on the gutter's shade
    for (const type of ["down", "up"]) h.app.mouse.handle({ type, x: sign.x, y: sign.y, button: 0 });
    expect(h.app.problems.panel).toMatchObject({ shown: true, tab: "file" });
    expect(h.app.problems.panel.file.selected).toBe(1);
    expect(h.app.region).toBe("problems");
    expect(line(h)).toBe(5);
    // Again, on the other: its own, the filter there cleared, the panel still open.
    h.app.problems.panel.file.filter = "Then";
    h.frame();
    const other = h.app.geometry!.hot.find((x) => x.id === "pbar:3:5")!;
    for (const type of ["down", "up"]) h.app.mouse.handle({ type, x: other.x, y: other.y, button: 0 });
    expect(h.app.problems.panel.file).toMatchObject({ selected: 0, filter: "" });
    expect(h.app.problems.panel.shown).toBe(true);
    expect(line(h)).toBe(3);
  });
});
