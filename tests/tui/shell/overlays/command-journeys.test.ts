import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { COMMAND_SPECS, commandGroup } from "../../../../src/core/application/commands/catalog.ts";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { MOUSE_HELP } from "../../../../src/tui/shell/input/mouse-help.ts";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("overlays and the : prompt", () => {
  test("ctrl+p quick switcher and space f f", async () => {
    const h = await harness();
    await h.keys("ctrl+p", "b", "e", "t", "enter");
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
    await h.keys("space", "f", "f");
    expect(h.frame()).toMatch(/Open (note|\()/); // "Open (n notes, m files)" once there are files
  });
  test("find: ctrl+f, cursor on the match, n / shift+n, esc clears", async () => {
    const h = await harness({ open: "samples/logs/observing-log-2026.md" });
    await h.keys("ctrl+f", "m", "o", "d", "e", "enter");
    const v = h.app.view!;
    expect(v.find!.matches.length).toBeGreaterThan(3);
    const m0 = v.find!.matches[v.find!.current]!;
    expect([v.cur.row, v.cur.col]).toEqual([m0.row, m0.col]);
    await h.keys("n");
    const m1 = v.find!.matches[v.find!.current]!;
    expect([v.cur.row, v.cur.col]).toEqual([m1.row, m1.col]);
    await h.keys("shift+n");
    expect(v.find!.matches[v.find!.current]).toEqual(m0);
    await h.keys("escape");
    expect(v.find).toBeNull();
  });
  test("space f o outline picker", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md" });
    await h.keys("space", "f", "o");
    expect(h.frame()).toContain("Headings");
    await h.keys("down", "down", "enter");
    expect(h.app.view!.cur.row).toBeGreaterThan(0);
  });
  test(": exact aliases win over fuzzy matches, with arguments and completion", async () => {
    const h = await harness();
    await h.keys(":", "v", "s", "enter");
    expect(h.app.tab!.views).toHaveLength(2);
    await h.keys(":", "t", "h", "e", "m", "e", "space", "d", "r", "a");
    expect(h.frame()).toContain("dracula");
    await h.keys("enter");
    expect(h.app.ui.theme).toBe("dracula");
    await h.keys(":", "e", "space", "b", "e", "t", "a", "enter");
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
    await h.keys(":", "q", "enter"); // vim's :q: the split's window first…
    expect(h.app.tab!.views).toHaveLength(1);
    expect(h.quit.called).toBe(false);
    await h.keys(":", "q", "enter"); // …then, the last one, quit
    expect(h.quit.called).toBe(true);
  });
  test(": also finds commands by name; ?, space ? and :help list every key", async () => {
    const h = await harness();
    await h.keys(":", "z", "e", "n", "space", "m", "o", "d", "e", "enter");
    expect(h.app.ui.zen).toBe(true);
    await h.keys("space", "?");
    expect(h.frame()).toContain("Keys — type to filter");
    await h.keys("escape", "?");
    expect(h.frame()).toContain("Keys — type to filter");
    await h.keys("escape", ":", "h", "e", "l", "p", "enter");
    expect(h.frame()).toContain("Keys — type to filter");
  });
  test("n always goes forward and N backward, from wherever the cursor is", async () => {
    const root = makeVault();
    writeFileSync(join(root, "f.md"), "cat one\n\ncat two\n\ncat three\n");
    const h = await harness({ root, open: "f.md" });
    const v = h.app.view!;
    const line = () => h.app.currentLayout(v).lines[v.cur.row]!.src;
    await h.keys("/", "c", "a", "t", "enter");
    expect(line()).toBe(1);
    await h.keys("n");
    expect(line()).toBe(3);
    await h.keys("shift+n");
    expect(line()).toBe(1);
    await h.keys("shift+g", "shift+n"); // from the bottom: backward is the one above
    expect(line()).toBe(3);
  });
  test("help: grouped, every binding its own keycap, the description in the footer, groups kept while filtering", async () => {
    const h = await harness({ width: 140, height: 40 });
    await h.keys("space", "?");
    const o = h.app.overlay as ListOverlay;
    const f = h.frame();
    expect(f).toContain("│ CURSOR");
    expect(o.filtered[0]!.item.header).toBe(true);
    expect(o.filtered[1]!.item.rule).toBe(true); // a full rule under each heading
    expect(o.selected).toBe(2); // headings and rules are never selected
    // Later sections have a blank row before the heading.
    const sel = o.filtered.findIndex((e) => e.item.label === "Selection & copy");
    expect(o.filtered[sel - 1]!.item).toMatchObject({ header: true, label: "" });
    expect(f).toContain(`│ ${"─".repeat(20)}`);
    // At most three bindings; the rest in the footer description.
    const endRow = o.items.find((i) => i.data === "cursor.line_end")!;
    expect(endRow.keys).toEqual(["$", "end", "cmd+right"]);
    expect(endRow.more).toEqual(["ctrl+e", "shift+end", "shift+cmd+right", "ctrl+shift+e"]);
    // Keys in a section line up in columns.
    const lines = f.split("\n");
    const colOf = (label: string, key: string) => {
      const l = lines.find((x) => x.includes(label))!;
      return l.indexOf(` ${key} `, l.indexOf(label) + label.length);
    };
    expect(colOf("Cursor left", "left")).toBe(colOf("Top of note", "ctrl+home"));
    expect(colOf("Cursor left", "h")).toBe(colOf("Top of note", "g g"));
    // Spelled-out keys, each binding a separate keycap (a sequence stays in one).
    const row = f.split("\n").find((l) => l.includes("Top of note"))!;
    expect(row).toMatch(/g g +ctrl\+home +cmd\+up/);
    const c = h.canvas();
    const y = c.rows.findIndex((r) => r.join("").includes("Top of note"));
    const line = c.rows[y]!.join("");
    const at = (s: string) => c.styles[y]![line.indexOf(s)]!.bg;
    expect(at("g g")).toBe(h.app.theme.roles.keycap.bg!);
    expect(c.styles[y]![line.indexOf("g g") + 1]!.bg).toBe(h.app.theme.roles.keycap.bg!); // the space inside the cap
    expect(c.styles[y]![line.indexOf("ctrl+home") - 2]!.bg).not.toBe(h.app.theme.roles.keycap.bg!); // between caps
    // The footer: the selected entry's name, its explanation, its other keys.
    const foot = f.split("\n");
    const rule = foot.findIndex((l, i) => i > 3 && l.includes("├"));
    expect(foot[rule + 1]).toContain("Cursor left");
    expect(foot[rule + 2]).toContain("Moves the cursor one character left");
    // Moving skips headings; filtering keeps them.
    await h.keys("down");
    expect(o.filtered[o.selected]!.item.header).toBeFalsy();
    for (const ch of "copy") await h.keys(ch);
    expect(o.filtered.some((e) => e.item.header && e.item.label === "Selection & copy")).toBe(true);
    expect(o.filtered[o.selected]!.item.header).toBeFalsy();
    // In-pane keys and the mouse are there too.
    await h.keys("ctrl+w");
    for (const ch of "fold") await h.keys(ch);
    expect(o.filtered.some((e) => e.item.header && e.item.label === "Inside the outline")).toBe(true);
  });
  test("help opens at the section for where you are: explorer, outline, visual mode", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 140, height: 40 });
    const start = async (...keys: string[]) => {
      await h.keys(...keys, "space", "?");
      const o = h.app.overlay as ListOverlay;
      h.frame();
      const heading = o.filtered[o.scroll]!.item;
      const selected = o.filtered[o.selected]!.item;
      await h.keys("escape");
      return { heading: heading.header ? heading.label : null, selectedIsEntry: !selected.header };
    };
    expect(await start("space", "e")).toEqual({ heading: "Inside the explorer", selectedIsEntry: true });
    await h.keys("escape"); // back to the note
    expect(await start("space", "o")).toEqual({ heading: "Inside the outline", selectedIsEntry: true });
    await h.keys("escape");
    expect(await start("v")).toEqual({ heading: "Selection & copy", selectedIsEntry: true });
    await h.keys("escape");
    expect(await start()).toEqual({ heading: "Cursor", selectedIsEntry: true }); // from the note: the top
    await h.app.run("note.open notes/alpha.md"); // some history
    expect(await start("space", "h", "h")).toEqual({ heading: "Inside the history", selectedIsEntry: true });
    // It lists the history's keys, the jump keys gathered on one entry, and the filter's.
    await h.keys("space", "?");
    const o = h.app.overlay as ListOverlay;
    const jump = o.items.find((i) => i.label === "Jump there")!;
    expect(jump.keys).toContain("enter");
    expect(o.items.some((i) => i.header && i.label === "Filtering a panel (/)")).toBe(true);
    await h.keys("escape");
    // Every panel view has its own section, opened from it: Problems, Info, the footnotes.
    for (const [cmd, region, heading] of [
      ["problems.open", "problems", "Inside Problems"],
      ["info.toggle", "outline", "Inside Info"],
      ["footnotes.toggle", "outline", "Inside the footnotes"],
    ] as const) {
      await h.app.run(cmd);
      h.app.region = region;
      expect(await start()).toEqual({ heading, selectedIsEntry: true });
    }
  });
  test("help's mouse list is MOUSE_HELP, every row of it (what the keys chapter has: docs.test.ts)", async () => {
    const h = await harness({ width: 140, height: 40 });
    await h.keys("space", "?");
    const items = (h.app.overlay as ListOverlay).items;
    const from = items.findIndex((i) => i.header && i.label === "Mouse");
    const next = items.findIndex((i, k) => k > from && i.header && i.label);
    const rows = items.slice(from + 1, next < 0 ? undefined : next).filter((i) => i.label); // not its spacer
    const row = (i: (typeof rows)[number]) => [i.label, [...(i.keys ?? []), ...(i.more ?? [])], i.detail];
    expect(rows.map(row)).toEqual(MOUSE_HELP);
  });
  test("help and the palette list every command under a keymap.md group, none left out", async () => {
    for (const s of COMMAND_SPECS) expect([s.id, commandGroup(s.id)]).not.toEqual([s.id, "Other"]);
    const h = await harness({ width: 140, height: 40 });
    await h.keys("space", "?");
    const help = new Set((h.app.overlay as ListOverlay).items.map((i) => i.data));
    for (const s of COMMAND_SPECS) expect([s.id, help.has(s.id)]).toEqual([s.id, true]);
    await h.keys("escape");
    await h.keys(":"); // an empty query: every shown command, by group
    const palette = new Set((h.app.overlay as ListOverlay).filtered.map((e) => e.item.data));
    for (const c of h.app.registry.list().filter((c) => !c.hidden))
      expect([c.id, palette.has(c.id)]).toEqual([c.id, true]);
    expect(palette.has("git.changes")).toBe(true);
    await h.keys("escape");
  });
  test("palette: Recent first, then groups; typing ranks without groups; the first key only", async () => {
    const h = await harness({ width: 140, height: 40 });
    await h.keys(":");
    let o = h.app.overlay as ListOverlay;
    expect(o.filtered[0]!.item.label).toBe("Cursor"); // no Recent yet
    for (const ch of "zen") await h.keys(ch);
    expect(o.filtered.some((e) => e.item.header)).toBe(false);
    expect(o.filtered[0]!.item.label).toBe("Zen mode");
    await h.keys("enter");
    expect(h.app.ui.zen).toBe(true);
    await h.keys(":");
    o = h.app.overlay as ListOverlay;
    expect(o.filtered[0]!.item.label).toBe("Recent");
    expect(o.filtered[2]!.item.data).toBe("ui.zen"); // after the heading's rule
    const top = o.filtered.find((e) => e.item.data === "cursor.top")!.item;
    expect(top.keys).toEqual(["g g", ""]); // one key and one alias column (empty here)
    // Both columns line up across the whole palette, sections included.
    await h.keys("escape", ":", "up"); // wraps to the last entry: the end of the list in view
    const g = h.frame().split("\n");
    const po = h.app.overlay as ListOverlay;
    expect(po.selected).toBe(po.filtered.length - 1); // up from the first entry wraps past the headings
    const colOf = (lines: string[], label: string, key: string) => {
      const l = lines.find((x) => x.includes(label))!;
      return l.indexOf(` ${key} `, l.indexOf(label) + label.length);
    };
    // Every entry in view, whichever they are: its key in one column, its alias in another. A row
    // is its label whole, at the row's start ("Undo" isn't "Undo the last rename").
    const row = (label: string) => `│ ${label}  `;
    const inView = po.filtered
      .map((e) => e.item)
      .filter((it) => !it.header && g.some((l) => l.includes(row(it.label))));
    const keyCols = inView.filter((it) => it.keys?.[0]).map((it) => colOf(g, row(it.label), it.keys![0]!));
    const aliasCols = inView.filter((it) => it.keys?.[1]).map((it) => colOf(g, row(it.label), it.keys![1]!));
    expect(keyCols.length).toBeGreaterThan(5);
    expect(aliasCols.length).toBeGreaterThan(2);
    expect(new Set(keyCols).size).toBe(1);
    expect(new Set(aliasCols).size).toBe(1);
    expect(h.app.recentCommands[0]).toBe("ui.zen");
  });
  test("messages, note info, vault info", async () => {
    const h = await harness();
    await h.keys("Z");
    await h.keys("space", "m");
    expect(h.frame()).toContain("Messages");
    await h.keys("escape", "space", "n", "i");
    expect(h.frame()).toContain("backlinks");
    await h.keys("escape", "space", "v", "i");
    expect(h.frame()).toContain("watcher");
    // How fresh its index is, and the background index of the home folder (20.10).
    const rows = (h.app.overlay as ListOverlay).items.map((i) => i.label);
    expect(rows.some((r) => /^index\b/.test(r))).toBe(true);
    expect(rows.some((r) => /^home\b.*background index/.test(r))).toBe(true);
  });
});
