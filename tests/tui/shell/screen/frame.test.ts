import { describe, expect, test } from "bun:test";
import { basename } from "node:path";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { makeSandbox, harness, rowText, statusRow, topRow, rowStarting, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("top bar, tab strip, status line", () => {
  const hot = (h: Harness, id: string) => {
    h.frame();
    const r = h.app.geometry!.hot.find((x) => x.id === id);
    if (!r) throw new Error(`no region ${id}`);
    return r;
  };
  const click = (h: Harness, x: number, y: number, button = 0) => {
    h.app.mouse.handle({ type: "down", x, y, button });
    h.app.mouse.handle({ type: "up", x, y, button });
    h.frame();
  };
  test("top bar: explorer and outline buttons, the chip opens the palette, vault state on the right", async () => {
    // Without the left rail, the explorer's button is the top bar's.
    const h = await harness({ width: 160, config: (c) => (c.ui.left_rail = false) });
    const top = topRow(h.frame());
    expect(top).toContain("≡");
    expect(top).toContain("slipbox");
    expect(top).not.toContain("▤"); // the outline's button is on the breadcrumb
    expect(top).not.toContain("watching"); // the watcher is shown by the file's path
    expect(statusRow(h.frame())).toMatch(/‹ index\.md › +⚠ 0 +○ not watching/); // no problems: the panel's button; watch: false in the harness
    // The bar and its chip sit on the page, so the frame's rule right under it gives it the same
    // air as the rows below.
    const chipR = h.app.geometry!.hot.find((r) => r.id === "btn:palette")!;
    const page = h.app.theme.roles.text.bg ?? h.app.theme.bg;
    expect(h.app.theme.roles.topbar.bg).toBeUndefined();
    expect(h.canvas().styles[chipR.y]![chipR.x + 2]!.bg).toBe(page);
    expect(h.canvas().styles[0]![80]?.bg).toBe(h.app.theme.roles.topbar_group.bg!);
    expect(h.frame().split("\n")[1]!.startsWith("━━━━")).toBe(true);
    const ex = hot(h, "top:zoom");
    h.app.panels.showSidebar(false);
    click(h, ex.x, ex.y);
    expect(h.app.panels.sidebarShown).toBe(true);
    expect(h.app.region).toBe("sidebar");
    const ol = hot(h, "btn:outline");
    expect(ol.x + ol.w).toBe(160); // far right, the rail's second button: Info's is first (3.19), level with the breadcrumb
    expect(hot(h, "btn:info").y).toBe(h.app.geometry!.panes[0]!.y - 2);
    expect(ol.y).toBe(hot(h, "btn:info").y + 1);
    click(h, ol.x + 1, ol.y);
    expect(h.app.panels.outlineShown).toBe(true);
    const chip = hot(h, "btn:palette");
    click(h, chip.x + 2, chip.y);
    expect(h.app.overlay?.kind).toBe("list");
  });
  test("hover highlights what is under the mouse", async () => {
    const h = await harness({ width: 160 });
    const ex = hot(h, "btn:explorer");
    h.app.mouse.handle({ type: "move", x: ex.x, y: ex.y, button: 0 });
    expect(h.app.mouse.hover).toBe("btn:explorer");
    const c = h.canvas();
    expect(c.styles[ex.y]![ex.x + 1]!.bg).toBe(h.app.theme.roles.hover.bg!);
    h.app.mouse.handle({ type: "move", x: 80, y: 10, button: 0 });
    expect(h.app.mouse.hover).toBeNull();
  });
  test("zen retains the permanent top bar", async () => {
    const zen = await harness({ config: (c) => (c.ui.zen = true) });
    expect(topRow(zen.frame())).toContain("slipbox");
    expect(zen.app.geometry!.hot.some((r) => r.id === "top:zoom")).toBe(true);
  });
  test("tab strip under the top bar, even with one tab: click, ×, middle-click, wheel, drag", async () => {
    const h = await harness({ width: 160 });
    h.frame();
    expect(h.app.geometry!.tabStrip).not.toBeNull();
    expect(h.app.geometry!.tabs).toHaveLength(1);
    await h.keys("ctrl+t", "c");
    await h.app.run("note.open notes/beta.md");
    await h.keys("ctrl+t", "c");
    await h.app.run("note.open notes/alpha.md");
    h.frame();
    const strip = h.app.geometry!.tabStrip!;
    expect(strip.y).toBe(2); // under the top bar and the frame's top rule
    // Tabs hold the note and its outline, not the explorer: the strip starts after it, and the
    // explorer stays where it was before the strip appeared.
    const sb = h.app.geometry!.sidebar!;
    expect(strip.x).toBe(sb.x + sb.w + 1);
    expect(strip.x + strip.w).toBe(160);
    expect(sb.y).toBe(4); // the tree, under the "Explorer" title (beside the strip) and the breadcrumb
    expect(h.frame().split("\n")[2]!.slice(sb.x).startsWith(" Explorer")).toBe(true);
    // Under the title the breadcrumb, the view's folder last (VV-D5); the strip's rule starts at the explorer's border.
    const under = h
      .frame()
      .split("\n")[3]!
      .slice(sb.x - 1, sb.x + sb.w + 2);
    expect(under).toMatch(new RegExp(` ${basename(h.root)} › +┣━$`)); // the tinted rail, then the explorer
    const rows = h.frame().split("\n");
    // A rule over everything (the tinted rail too), the explorer's border starting under it (┳)…
    const bx = sb.x + sb.w;
    expect(rows[1]!.slice(0, sb.x + 10)).toBe("━".repeat(sb.x + 10));
    expect(rows[1]![bx]).toBe("┳");
    expect(rows[2]![bx]).toBe("┃");
    // …and one under the strip, over the note (and the outline), meeting the border in ┣.
    expect(rows[3]!.slice(strip.x, strip.x + 10)).toBe("━".repeat(10));
    expect(rows[3]![strip.x - 1]).toBe("┣"); // it starts at the explorer's border
    // The bottom rule closes the explorer and the note above the status line.
    expect(rows.at(-2)!.slice(sb.x, sb.x + 10)).toBe("━".repeat(10));
    expect(rows.at(-2)![bx]).toBe("┻");
    const tab = (i: number) => h.app.geometry!.tabs[i]!;
    click(h, tab(0).x + 2, strip.y);
    expect(h.app.activeTab).toBe(0);
    h.app.mouse.handle({
      type: "scroll",
      x: strip.x + 5,
      y: strip.y,
      button: 0,
      scroll: { direction: "down", delta: 1 },
    });
    expect(h.app.activeTab).toBe(1);
    // drag tab 0 onto tab 2
    const names = () => h.app.tabs.map((t) => t.views[0]!.buf.name);
    const first = names()[0];
    h.frame();
    h.app.mouse.handle({ type: "down", x: tab(0).x + 2, y: strip.y, button: 0 });
    h.app.mouse.handle({ type: "drag", x: tab(2).x + 2, y: strip.y, button: 0 });
    h.app.mouse.handle({ type: "up", x: tab(2).x + 2, y: strip.y, button: 0 });
    expect(names()[2]).toBe(first!);
    h.frame();
    const x0 = hot(h, "tabclose:0");
    click(h, x0.x, x0.y);
    expect(h.app.tabs).toHaveLength(2);
    h.frame();
    click(h, tab(0).x + 2, strip.y, 1);
    expect(h.app.tabs).toHaveLength(1);
    h.frame();
    expect(h.app.geometry!.tabStrip).not.toBeNull(); // the strip stays with the last tab
  });
  test("the outline starts right under the tab strip, beside the note's header; titled, then a blank row", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 160 });
    await h.app.run("cursor.heading_next");
    await h.app.run("outline.toggle");
    const rows = h.frame().split("\n");
    const g = h.app.geometry!;
    const pane = g.panes[0]!;
    const crumbY = pane.y - 2;
    const strip = g.tabStrip!;
    const border = g.outline!.x - 1;
    // The breadcrumb and its rule stop at the outline's border; the pane's border starts under the
    // strip's rule (┳) and meets the breadcrumb's rule (┫).
    expect(g.outline!.x).toBeGreaterThan(pane.x + pane.w);
    expect(rows[strip.y + 1]![border]).toBe("┳");
    expect(rows[crumbY + 1]![border]).toBe("┫");
    // The pane itself: "Outline" on the breadcrumb's row, a blank row, the headings.
    expect(rows[crumbY]!.slice(g.outline!.x)).toMatch(/^ Outline/);
    expect(rows[crumbY + 1]!.slice(g.outline!.x, g.outline!.x + g.outline!.w).trim()).toBe("");
    expect(g.outline!.y).toBe(crumbY + 2);
    expect(rows[g.outline!.y]!.slice(g.outline!.x).trim()).not.toBe("");
  });
  test("toggle buttons: dim while off, bright while on, no fill of their own", async () => {
    const h = await harness({ width: 160 });
    const btn = (id: string) => {
      const c = h.canvas();
      const r = h.app.geometry!.hot.find((x) => x.id === id)!;
      return c.styles[r.y]![r.x + 1]!;
    };
    const roles = h.app.theme.roles;
    h.app.mouse.handle({ type: "move", x: 80, y: 10, button: 0 }); // no hover
    expect(btn("btn:explorer").fg).toBe(roles.topbar_button_on.fg!); // the explorer is open
    expect(btn("btn:explorer").bg).toBe(roles.rail.bg!); // the rail's tint
    expect(btn("btn:outline").fg).toBe(roles.topbar_button.fg!); // the outline is closed
    expect(btn("btn:outline").bg).toBe(roles.rail.bg!); // the rail's tint
  });
  test("tree lines: ├─ to each child, └─ to the last, │ where an ancestor goes on", async () => {
    const h = await harness({
      open: "samples/handbook/operations-handbook.md",
      width: 160,
      height: 90,
      config: (c) => (c.ui.outline = true),
    });
    const c = h.canvas();
    const sb = h.app.geometry!.sidebar!;
    const rows = h.app.explorer.treeRows();
    const at = (i: number) => c.rows[sb.y + i - h.app.sidebar.scroll]!;
    // In each expanded folder, children branch with ├─ and the last one closes with └─.
    const kids = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.depth === 1);
    expect(kids.length).toBeGreaterThan(1);
    const lastKid = kids.filter(
      ({ i }) =>
        !rows.slice(i + 1).some((r, j) => r.depth === 1 && !rows.slice(i + 1, i + 1 + j).some((x) => x.depth < 1)),
    )[0]!;
    expect(
      at(kids[0]!.i)
        .slice(sb.x + 1, sb.x + 3)
        .join(""),
    ).toBe(kids[0] === lastKid ? "└─" : "├─");
    expect(
      at(lastKid.i)
        .slice(sb.x + 1, sb.x + 3)
        .join(""),
    ).toBe("└─");
    expect(c.styles[sb.y + kids[0]!.i - h.app.sidebar.scroll]![sb.x + 1]!.fg).toBe(h.app.theme.roles.tree_guide.fg!);
    // The outline: a sub-heading under a section with later siblings has │ then ├─ or └─.
    const o = h.app.geometry!.outline!;
    const orows = h.app.outlineView.rows();
    const sub = orows.findIndex((r, i) => r.level === 3 && orows.slice(i + 1).some((x) => x.level === 2));
    const line = c.rows[o.y + sub - h.app.outline.scroll]!.slice(o.x + 1, o.x + 5).join("");
    expect(line).toMatch(/^│ [├└]─$/);
    // Every heading with sub-headings shows a fold marker, so sibling titles line up.
    const d = orows.findIndex((r) => r.level === 2 && r.hasChildren);
    const dl = c.rows[o.y + d - h.app.outline.scroll]!.join("");
    const leaf = c.rows[o.y + orows.findIndex((r) => r.level === 2 && !r.hasChildren) - h.app.outline.scroll]!.join("");
    expect(dl.indexOf(orows[d]!.text.slice(0, 6)) - o.x).toBe(
      leaf.indexOf(orows.find((r) => r.level === 2 && !r.hasChildren)!.text.slice(0, 6)) - o.x,
    );
  });
  test("focus shows as brightness: titles and the active tab, never a coloured border", async () => {
    const h = await harness({
      open: "samples/handbook/operations-handbook.md",
      width: 160,
      config: (c) => (c.ui.outline = true),
    });
    const roles = h.app.theme.roles;
    const look = () => {
      const c = h.canvas();
      const g = h.app.geometry!;
      const find = (label: string) => {
        const y = c.rows.findIndex((r) => r.join("").includes(` ${label}`));
        return c.styles[y]![c.rows[y]!.join("").indexOf(label)]!;
      };
      const tab = g.tabs.find((t) => t.index === h.app.activeTab)!;
      return {
        explorer: find("Explorer").fg,
        outline: find("Outline").fg,
        tab: c.styles[tab.y]![tab.x + 3]!.fg,
        border: c.styles[g.sidebar!.y]![g.sidebar!.x + g.sidebar!.w]!.fg,
      };
    };
    const content = look();
    expect(content).toEqual({
      explorer: roles.pane_title.fg!,
      outline: roles.pane_title.fg!,
      tab: roles.tab_active.fg!,
      border: roles.border.fg!,
    });
    h.app.region = "sidebar";
    const files = look();
    expect(files).toEqual({
      explorer: roles.pane_title_active.fg!,
      outline: roles.pane_title.fg!,
      tab: roles.tab_active_idle.fg!,
      border: roles.border.fg!,
    });
    h.app.region = "outline";
    expect(look()).toEqual({
      explorer: roles.pane_title.fg!,
      outline: roles.pane_title_active.fg!,
      tab: roles.tab_active_idle.fg!,
      border: roles.border.fg!,
    });
    // Bold throughout, so nothing shifts.
    expect(
      roles.pane_title.bold && roles.pane_title_active.bold && roles.tab_active_idle.bold && roles.tab_active.bold,
    ).toBe(true);
  });
  test("a click anywhere in a side pane focuses it; a heading click is a choice: the note takes focus", async () => {
    const h = await harness({
      open: "samples/handbook/operations-handbook.md",
      width: 160,
      config: (c) => (c.ui.outline = true),
    });
    const click = (x: number, y: number) => {
      h.app.mouse.handle({ type: "down", x, y, button: 0 });
      h.app.mouse.handle({ type: "up", x, y, button: 0 });
      h.frame();
    };
    h.frame();
    const g = () => h.app.geometry!;
    click(g().sidebarPane!.x + 3, g().sidebarPane!.y); // the "Explorer" title
    expect(h.app.region).toBe("sidebar");
    click(g().outlinePane!.x + 3, g().outlinePane!.y); // the "Outline" title
    expect(h.app.region).toBe("outline");
    click(g().sidebarPane!.x + 3, g().sidebarPane!.y + g().sidebarPane!.h - 1); // below the tree
    expect(h.app.region).toBe("sidebar");
    const o = g().outline!;
    const row = h.app.outlineView.rows()[2]!;
    click(o.x + 12, o.y + 2 - h.app.outline.scroll);
    expect(h.app.view!.cur.row).toBe(row.line); // the note moved there
    expect(h.app.region).toBe("content"); // and took the focus
    // The ▤ button: open (and focus) when closed, close when open.
    await h.app.run("outline.toggle");
    expect(h.app.panels.outlineShown).toBe(false);
    const btn = g().hot.find((r) => r.id === "btn:outline")!;
    click(btn.x + 1, btn.y);
    expect(h.app.panels.outlineShown).toBe(true);
    expect(h.app.region).toBe("outline");
  });
  test("a ┃ after each tab, joined to the rules above and below the strip", async () => {
    const h = await harness({ width: 160 });
    await h.app.run("note.open notes/alpha.md");
    h.app.openInNewTab("notes/beta.md");
    const rows = h.frame().split("\n");
    const tabs = h.app.geometry!.tabs;
    const end = (i: number) => h.app.geometry!.hot.find((r) => r.id === `tabclose:${i}`)!;
    for (const i of [0, 1]) {
      const x = end(i).x + end(i).w;
      expect(rows[tabs[i]!.y]![x]).toBe("┃");
      expect(rows[tabs[i]!.y - 1]![x]).toBe("┳");
      expect(rows[tabs[i]!.y + 1]![x]).toBe("┻");
    }
  });
  test("tabs that don't fit: the active one stays visible, and +N opens the tab list", async () => {
    const h = await harness({ width: 90 });
    const notes = [
      "index.md",
      "notes/alpha.md",
      "notes/beta.md",
      "notes/gamma.md",
      "samples/handbook/operations-handbook.md",
    ];
    for (let i = 0; i < 3; i++) for (const n of notes) h.app.openInNewTab(n);
    const count = h.app.tabs.length;
    const f = h.frame();
    const shown = h.app.geometry!.tabs.map((t) => t.index);
    expect(shown.length).toBeLessThan(count);
    expect(shown).toContain(h.app.activeTab); // the last, opened last
    const more = h.app.geometry!.hot.find((r) => r.id === "tabmore:")!;
    expect(more.x + more.w).toBe(90); // at the far right
    expect(f.split("\n")[more.y]).toContain(`+${count - shown.length}`);
    // The first tab active: the strip starts at it.
    h.app.activeTab = 0;
    h.frame();
    expect(h.app.geometry!.tabs[0]!.index).toBe(0);
    const m = h.app.geometry!.hot.find((r) => r.id === "tabmore:")!;
    h.app.mouse.handle({ type: "down", x: m.x + 1, y: m.y, button: 0 });
    h.app.mouse.handle({ type: "up", x: m.x + 1, y: m.y, button: 0 });
    h.frame();
    expect(h.app.overlay?.kind).toBe("list");
    expect(h.frame()).toContain("Tabs");
  });
  test("each window has its breadcrumb and a rule on top; a click scrolls that window", async () => {
    const h = await harness({ open: "notes/alpha.md", width: 160 });
    h.app.moveCursor(h.app.view!, { row: rowStarting(h, "Back to"), col: 0 });
    const f = h.frame();
    expect(topRow(f)).not.toContain("Section One"); // the top bar's middle says where you are, not the heading
    const pane = h.app.geometry!.panes[0]!;
    const rows = f.split("\n");
    expect(rows[pane.y - 2]).toMatch(/§ Alpha › Section One/);
    // Right under it a rule, joined to the explorer's border.
    expect(rows[pane.y - 1]!.slice(pane.x, pane.x + 20)).toBe("━".repeat(20));
    expect(rows[pane.y - 1]![pane.x - 1]).toBe("┣");
    // Above it the rule under the tab strip, meeting the explorer's border.
    expect(rows[pane.y - 3]!.slice(pane.x - 1, pane.x + 5)).toBe(`┣${"━".repeat(5)}`);
    // Only the breadcrumb row has the band colour.
    const st = h.canvas().styles;
    expect(st[pane.y - 2]![pane.x + 60]!.bg).toBe(h.app.theme.roles.breadcrumb_band.bg!);
    expect(st[pane.y - 1]![pane.x + 60]!.bg).not.toBe(h.app.theme.roles.breadcrumb_band.bg!);
    const crumb = h.app.geometry!.hot.find((r) => r.id.startsWith("crumb:0:"))!;
    click(h, crumb.x, crumb.y);
    expect(rowText(h)).toContain("Alpha");
    expect(h.app.view!.top).toBe(0); // a short note never scrolls past its end; the split test covers scrolling
    // The icon opens the heading finder.
    h.app.moveCursor(h.app.view!, { row: rowStarting(h, "Back to"), col: 0 });
    const icon = hot(h, "crumbicon:0");
    click(h, icon.x, icon.y);
    expect(h.app.overlay?.kind).toBe("list");
    await h.keys("escape");
    // The path: its window's history, Copy path first.
    const path = hot(h, "status:path");
    click(h, path.x, path.y);
    const menu = h.app.overlay as ListOverlay;
    expect(menu.items[0]!.label.trim()).toBe("Copy path");
    menu.selected = 0;
    await h.keys("enter");
    expect(h.copied.at(-1)).toEndWith("/notes/alpha.md");
    h.app.message("info", "a message to click");
    const msg = hot(h, "toast:0");
    click(h, msg.x + 3, msg.y);
    expect(h.frame()).toContain("Messages");
    expect(h.app.toasts).toEqual([]); // the boxes go: every message is in the list
  });
  test("the status line's ‹ path ›: back and forward, bright when there's somewhere to go, hovered saying where; the path, the history", async () => {
    const h = await harness({ open: "notes/alpha.md", width: 140 });
    const st = () => statusRow(h.frame());
    const styleOf = (id: string) => {
      const at = hot(h, id);
      return h.canvas().styles[at.y]![at.x]!;
    };
    expect(st()).toMatch(/‹ notes\/alpha\.md ›/);
    const dim = h.app.theme.roles.status_dim.fg!;
    expect(styleOf("status:back").fg).toBe(dim); // nowhere to go yet
    expect(styleOf("status:forward").fg).toBe(dim);
    // Following a link: back lights up.
    await h.app.run("note.open notes/beta.md");
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
    expect(styleOf("status:back").fg).not.toBe(dim);
    expect(styleOf("status:back").bold).toBe(true);
    expect(styleOf("status:forward").fg).toBe(dim);
    // Hovered: where it goes, over the frame's rule.
    const back = hot(h, "status:back");
    h.app.mouse.handle({ type: "move", x: back.x, y: back.y, button: 0 });
    const rows = h.frame().split("\n");
    expect(rows.at(-2)).toContain(" back: notes/alpha.md ");
    // Clicked: back; forward lights up.
    for (const type of ["down", "up"]) h.app.mouse.handle({ type, x: back.x, y: back.y, button: 0 });
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    expect(styleOf("status:forward").fg).not.toBe(dim);
    const fwd = hot(h, "status:forward");
    for (const type of ["down", "up"]) h.app.mouse.handle({ type, x: fwd.x, y: fwd.y, button: 0 });
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
    // The path: the history above it — forward places on top, here marked, back below; enter jumps.
    await h.app.run("note.open index.md");
    await h.app.run("history.back");
    h.frame();
    const path = hot(h, "status:path");
    for (const type of ["down", "up"]) h.app.mouse.handle({ type, x: path.x, y: path.y, button: 0 });
    const menu = h.app.overlay as ListOverlay;
    expect(menu.title).toBe("History");
    expect(menu.items.map((i) => `${i.label}|${i.hint ?? ""}`)).toEqual([
      "  Copy path|y p",
      "  index.md|forward",
      "● notes/beta.md|here",
      "  notes/alpha.md|back",
    ]);
    expect(menu.items[menu.selected]!.hint).toBe("here");
    h.frame();
    expect(h.app.geometry!.overlay!.y + h.app.geometry!.overlay!.h).toBeLessThanOrEqual(path.y); // above the path
    menu.selected = 3;
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    // Two steps forward at once, from there.
    expect(h.app.view!.fwd.length).toBe(2);
  });
  test("the breadcrumb can be hidden (a UI setting): the header stays, find's row under it; without the header, at the window's top", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 120, height: 30 });
    await h.keys("]", "]"); // onto a heading, so the breadcrumb has something
    expect(h.frame()).toContain("§");
    await h.app.run("ui.breadcrumb");
    expect(h.app.ui.breadcrumb).toBe(false);
    let lines = h.frame().split("\n");
    expect(lines.join("\n")).not.toContain("§");
    // The header keeps its row and its buttons (HDR-D3).
    const header = h.app.geometry!.panes[0]!.y - 2;
    expect(lines[header]).toMatch(/R {2}L {2}S/);
    await h.keys("/", "D", "2");
    lines = h.frame().split("\n");
    // The find row under the header's rule, its own rule under it, then the text.
    expect(lines[header]).toMatch(/R {2}L {2}S/);
    expect(lines[header + 2]).toMatch(/› D2/);
    expect(lines[h.app.geometry!.panes[0]!.y - 2]).toMatch(/› D2/);
    await h.keys("escape", "escape");
    // Without the header, the find row is the window's first row.
    await h.app.run("ui.window_header");
    expect(h.app.ui.window_header).toBe(false);
    h.frame();
    const top = h.app.geometry!.panes[0]!.y;
    await h.keys("/", "D", "2");
    lines = h.frame().split("\n");
    expect(lines[top]).toMatch(/› D2/);
    expect(lines.join("\n")).not.toMatch(/Read {2}Lens/);
    await h.keys("escape", "escape");
    // Both are in the UI settings list, and remembered like the others.
    await h.app.run("ui.window_header");
    await h.app.run("ui.breadcrumb");
    expect([h.app.ui.window_header, h.app.ui.breadcrumb]).toEqual([true, true]);
  });
  test("messages float at the top right and prompts take the status line: the note never changes height", async () => {
    const h = await harness({ open: "notes/alpha.md", width: 100, height: 24 });
    h.frame();
    const height = h.app.view!.height;
    const lines = () => h.frame().split("\n");
    h.app.message("error", "something broke");
    let f = lines();
    expect(h.app.view!.height).toBe(height);
    expect(f[0]).not.toContain("something broke"); // not in the top bar
    const box = h.app.geometry!.hot.find((r) => r.id === "toast:0")!;
    expect(f[box.y + 1]).toContain("✗ something broke"); // in its box, under its top border
    expect(box.x + box.w).toBeGreaterThan(90); // at the right
    expect(box.y).toBe(h.app.geometry!.panes[0]!.y - 1); // on the rule under the window's chrome
    expect(f.at(-1)).toContain("READ"); // the status line stays
    // Several stack, newest on top; the same one again doesn't stack twice.
    h.app.message("warn", "and a warning");
    h.app.message("warn", "and a warning");
    h.frame();
    const boxes = h.app.geometry!.hot.filter((r) => r.id.startsWith("toast:"));
    expect(boxes).toHaveLength(2);
    expect(boxes[0]!.y).toBeLessThan(boxes[1]!.y);
    expect(lines()[boxes[0]!.y + 1]).toContain("and a warning");
    // A question (here the scratch's clear) floats in a window of its own, its buttons in it; the
    // status line stays, the note keeps its height.
    await h.keys("space", "s", "d");
    expect(h.app.overlay?.kind).toBe("prompt");
    f = lines();
    expect(h.app.view!.height).toBe(height);
    const d = h.app.geometry!.dialog!;
    expect(f[d.y + 2]).toContain("Clear the scratch?");
    expect(f.slice(d.y, d.y + d.h).join("\n")).toMatch(/Yes {2}y.*No {2}n/);
    expect(f.at(-1)).toContain("READ");
    await h.keys("escape");
    // Find is the window's own: its row under the header, with the count; the status line stays.
    await h.keys("/", "B");
    f = lines();
    expect(f.some((l) => /› B.*1\/1/.test(l))).toBe(true);
    expect(f.at(-1)).toContain("READ");
    await h.keys("escape", "escape");
    expect(h.app.view!.find).toBeNull();
    expect(h.app.view!.height).toBe(height); // the row gone with the search
    // The permanent bar keeps its row while messages float.
    expect(lines()[0]).toContain("slipbox");
    h.app.message("warn", "careful");
    expect(lines().join("\n")).toContain("! careful");
    // Too narrow for a box: a message takes over the status line for its while.
    const n = await harness({ open: "notes/alpha.md", width: 28, height: 24 });
    n.frame();
    const nh = n.app.view!.height;
    n.app.message("warn", "careful");
    f = n.frame().split("\n");
    expect(n.app.view!.height).toBe(nh);
    expect(f.at(-1)).toContain("! careful");
  });
  test("split windows: title then breadcrumb on one row; a click acts on its own window", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 160 });
    await h.keys("ctrl+w", "v");
    const [a, b] = h.app.tab!.views;
    // Move the right window's cursor a few headings down, then focus the left one.
    h.app.tab!.active = 1;
    for (let i = 0; i < 4; i++) await h.app.run("cursor.heading_next");
    h.app.tab!.active = 0;
    const f = h.frame();
    const crumb = h.app.geometry!.hot.find((r) => r.id.startsWith("crumb:1:"))!;
    expect(f.split("\n")[crumb.y]).toContain("samples/handbook/operations-h");
    // Both windows' rules meet the border between them in a cross.
    const sep = h.app.geometry!.separators.find((x) => x.kind === "split-side")!;
    expect(f.split("\n")[crumb.y + 1]![sep.x]).toBe("╋");
    expect(f.split("\n")[crumb.y - 1]![sep.x]).toBe("┳"); // the border between them starts here
    const before = a!.top;
    click(h, crumb.x, crumb.y);
    expect(h.app.tab!.active).toBe(1);
    expect(b!.top).toBe(b!.cur.row);
    expect(a!.top).toBe(before);
  });
});
