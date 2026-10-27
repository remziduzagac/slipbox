import { UNIT_TIMEOUT_MS, TEST_BUDGETS } from "./support/timeouts.ts";
import { describe, expect, test } from "bun:test";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { UNSAFE } from "../src/core/foundation/text/sanitize.ts";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { COMMAND_SPECS, commandGroup } from "../src/core/application/commands/catalog.ts";
import { type Config, DEFAULT_CONFIG } from "../src/core/application/config/config.ts";
import { openGraph } from "../src/core/workspace/graph/graph.ts";
import { locateVault } from "../src/core/workspace/vaults/vault.ts";
import { tildePath } from "../src/core/foundation/platform/paths.ts";
import { type ListOverlay, App } from "../src/tui/app/runtime/app.ts";
import { TextCanvas } from "../src/tui/shell/terminal/canvas.ts";
import { graphemes, setWidthMethod, stringWidth, type WidthMethod } from "../src/core/foundation/text/width.ts";
import { glyphsFor } from "../src/core/rendering/theme/glyphs.ts";
import { crumbLayout } from "../src/tui/shell/screen/draw.ts";
import { A_BOLD, A_DIM, type Layout, srcAt } from "../src/core/rendering/layout/ir.ts";
import { codeKind } from "../src/core/documents/syntax/syntax.ts";
import { load } from "../src/core/foundation/platform/lazy.ts";
import { loadMermaid } from "../src/core/rendering/media/diagrams/diagrams.ts";

import { cells } from "../src/tui/documents/editing/cursor.ts";
import { lineOf, offsetOf } from "../src/tui/documents/editing/editing.ts";
import { DEFAULT_GROUPS, DEFAULT_KEYS, keyChar, keyName, parseGroup } from "../src/tui/shell/input/keys.ts";
import { MOUSE_HELP } from "../src/tui/shell/input/mouse-help.ts";
import { codeBlocks } from "../src/tui/documents/views/code.ts";
import {
  makeSandbox,
  makeVault,
  harness,
  rowText,
  lineText,
  statusRow,
  topRow,
  rowStarting,
  type Harness,
  type Opts,
} from "./tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("widths as OpenTUI draws them", () => {
  // OpenTUI lays a frame's cells out by the method it found asking the terminal; slipbox lays its rows
  // out by its own count. The two must agree, cluster by cluster, or a row drifts within the frame
  // (Devanagari's conjuncts did: 2 columns here, 3 there). Every grapheme the reference set and halden
  // hold, in each method, drawn into an OpenTUI buffer and measured where the next character lands.
  test("every grapheme of the reference set and halden, in each of OpenTUI's methods slipbox follows", async () => {
    const { OptimizedBuffer, RGBA } = await import("@opentui/core");
    const seen = new Set<string>();
    for (const dir of ["home", "vault"]) {
      const base = join(import.meta.dir, "..", "examples", dir);
      for (const f of readdirSync(base, { recursive: true }) as string[]) {
        if (!f.endsWith(".md")) continue;
        for (const g of graphemes(readFileSync(join(base, f), "utf8")))
          if (g.length > 1 || g.charCodeAt(0) > 0x7e) seen.add(g);
      }
    }
    expect(seen.size).toBeGreaterThan(500);
    // And what slipbox draws of its own: every glyph of every set (a callout's icon, a bullet, a border).
    const own = (v: unknown): void => {
      if (v && typeof v === "object") for (const x of Object.values(v)) own(x);
      else if (typeof v === "string")
        for (const g of graphemes(v)) if (g.length > 1 || g.charCodeAt(0) > 0x7e) seen.add(g);
    };
    for (const mode of ["unicode", "nerd", "ascii"]) own(glyphsFor(mode));
    // Clusters where the two counts part (a conjunct's parts, a flag's letters), whatever the corpus
    // holds. Not Bengali's reph (র্গা): OpenTUI's table has it 1, Bun's 2 — slipbox counts Bun's.
    for (const t of ["हिन्दी", "नमस्ते", "क्ष", "ஸ்ரீ", "ཀྱི", "각", "1️⃣", "🇩🇪", "✔️"]) for (const g of graphemes(t)) seen.add(g);
    const fg = RGBA.fromHex("#ffffff");
    const bg = RGBA.fromHex("#000000");
    try {
      for (const method of ["unicode", "wcwidth"] as WidthMethod[]) {
        setWidthMethod(method);
        const buf = OptimizedBuffer.create(16, 1, method);
        const off: string[] = [];
        for (const g of seen) {
          // Never drawn: sanitized first, or zero wide (the canvas skips those). A cluster of tens of
          // code points (a Zalgo, fifty joined emoji) runs past the probe: no terminal agrees on those.
          if (UNSAFE.test(g) || stringWidth(g) === 0 || [...g].length > 16) continue;
          buf.clear(bg);
          buf.drawText(`${g}|`, 0, 0, fg, bg, 0);
          const chars = (buf as unknown as { buffers: { char: Uint32Array } }).buffers.char;
          const drawn = chars.indexOf(124);
          if (drawn !== stringWidth(g))
            off.push(
              `${JSON.stringify(g)} U+${[...g].map((c) => c.codePointAt(0)!.toString(16)).join(" ")}: OpenTUI ${drawn}, slipbox ${stringWidth(g)}`,
            );
        }
        buf.destroy();
        expect(`${method}: ${off.length} off\n${off.slice(0, 20).join("\n")}`).toBe(`${method}: 0 off\n`);
      }
    } finally {
      setWidthMethod("unicode");
    }
  });
});

describe("widths counted the terminal's way", () => {
  test("the method changing (the terminal's answer after the first frame): every layout made again", async () => {
    const root = makeVault();
    writeFileSync(join(root, "flags.md"), `${"🇯🇵".repeat(30)}\n`);
    const h = await harness({ root, open: "flags.md", width: 60 });
    const rows = () =>
      h.app.currentLayout(h.app.view!).lines.filter((l) => l.spans.some((sp) => sp.text.includes("🇯🇵"))).length;
    try {
      expect(rows()).toBe(2); // 60 columns of flags: two rows
      setWidthMethod("wcwidth");
      h.app.widthsChanged();
      expect(rows()).toBe(1); // a flag as wide as its first letter: one
    } finally {
      setWidthMethod("unicode");
    }
  });
});

describe("drawing (3.1, 3.2)", () => {
  test("explorer, content and status line; cursor position in the status", async () => {
    const h = await harness();
    const f = h.frame();
    expect(f).toContain("▸ notes");
    expect(f).toContain("▌ Home");
    const status = statusRow(f);
    expect(status).toContain("READ");
    expect(status).toContain("index.md");
    expect(status).toContain("L1:1");
  });
  test("the cursor is drawn with the cursor role, on a banded row", async () => {
    const h = await harness();
    await h.keys("j", "j", "j", "j", "j");
    const c = h.canvas();
    const pane = h.app.geometry!.panes[0]!;
    const v = h.app.view!;
    const y = pane.y + (v.cur.row - v.top);
    expect(c.styles[y]![pane.textX + v.cur.col]!.bg).toBe(h.app.theme.roles.cursor.bg!);
    expect(c.styles[y]![pane.textX + v.cur.col + 2]!.bg).toBe(h.app.theme.roles.cursor_line.bg!);
  });
  test("the terminal's title follows the file on screen, told once a change; control characters never in it", async () => {
    const h = await harness();
    const titles: string[] = [];
    h.app.host.setTitle = (t) => titles.push(t);
    h.frame(); // index.md's, told at the first frame already: not again
    h.app.openInNewTab("notes/alpha.md");
    h.frame();
    h.frame(); // nothing new: not told again
    writeFileSync(join(h.root, "notes", "evil\x07\x1b]0;PWNED.md"), "# Evil\n");
    h.app.openInNewTab("notes/evil\x07\x1b]0;PWNED.md");
    h.frame();
    expect(titles).toHaveLength(2);
    expect(titles[0]).toBe("slipbox — notes/alpha.md");
    expect(titles[1]).toStartWith("slipbox — notes/evil");
    expect(titles[1]).not.toMatch(/[\x00-\x1f\x7f]/);
  });
  test("tiny terminals do not crash", async () => {
    const h = await harness({ width: 9, height: 3 });
    expect(h.frame()).toContain("slipbox");
    const h2 = await harness({ width: 20, height: 6 });
    await h2.keys("j", "space", "u", "n");
    expect(() => h2.frame()).not.toThrow();
  });
});

describe("which-key", () => {
  test("the leader shows the popup at once, with group names; backspace goes up; esc cancels", async () => {
    const h = await harness();
    const f = await h.keys("space");
    expect(h.app.input.whichKey).toBe(true);
    expect(f).toContain("+links");
    expect(f).toContain("+history");
    const f2 = await h.keys("l");
    expect(f2).toContain("links");
    expect(f2).toContain("Backlinks");
    await h.keys("backspace");
    expect(h.app.pending).toEqual(["space"]);
    await h.keys("escape");
    expect(h.app.pending).toEqual([]);
    expect(h.app.input.whichKey).toBe(false);
  });
  test("layout: framed like the other popups; at most three columns of key → name + explanation", async () => {
    const h = await harness({ width: 160, height: 40 });
    await h.keys("space");
    const rows = h.frame().split("\n");
    const head = rows.findIndex((r) => r.includes("┌─ ␣ › leader "));
    expect(head).toBeGreaterThan(0);
    const left = rows[head]!.indexOf("┌");
    expect(rows[head + 1]!.slice(left + 1, rows[head + 1]!.lastIndexOf("│")).trim()).toBe(""); // a blank row inside, above
    expect(rows[head + 2]!.slice(left)).toMatch(/^│ \S+ +→ \+\w+/);
    expect(rows[head + 3]).toContain("rename, actions, format"); // +code's explanation, under its name
    const arrows = rows[head + 2]!.split("→").length - 1;
    expect(arrows).toBeLessThanOrEqual(3);
    const foot = rows.findIndex((r, i) => i > head && r.includes("└"));
    expect(rows[foot]).toContain("backspace up · esc cancel"); // the hint in the bottom border
    expect(rows[foot - 1]!.slice(left + 1, rows[foot - 1]!.lastIndexOf("│")).trim()).toBe(""); // and a blank row above it
    // The same margin as the other popups: a row above and below, two columns aside.
    expect(rows[head - 1]!.slice(left - 2, left + 10).trim()).toBe("");
    expect(rows[head + 2]!.slice(left - 2, left)).toBe("  ");
    const status = rows.length - 1;
    expect(rows[status - 1]!.startsWith("━━━")).toBe(true); // the frame's bottom rule
    expect(
      rows[status - 2]!.slice(
        h.app.panels.leftRailWidth,
        rows[status - 2]!.length - h.app.panels.rightRailWidth,
      ).trim(),
    ).toBe(""); // the popup's margin row (between the rails)
    // Centred.
    const right = rows[head]!.lastIndexOf("┐");
    expect(Math.abs(left - (160 - 1 - right))).toBeLessThanOrEqual(1);
  });
  test("keys with the same action share an entry; short screens drop the explanations", async () => {
    const h = await harness({ width: 160, height: 40 });
    const f = await h.keys("space", "w", "r");
    expect(f).toContain("h left");
    expect(f).toContain("q enter escape");
    const short = await harness({ width: 60, height: 14 });
    const s2 = await short.keys("space");
    expect(s2).toContain("+find");
    expect(s2).not.toContain("notes, headings, tags, text, commands");
  });
  test("group names and explanations come from [groups]", async () => {
    const h = await harness({ config: (c) => (c.groups = { "leader l": "LINKS: everything about links" }) });
    const f = await h.keys("space");
    expect(f).toContain("+LINKS");
    expect(f).toContain("everything about links");
  });
  test("leader explanations survive the About and Background entries at normal terminal size", async () => {
    const h = await harness({ width: 120, height: 30 });
    const f = await h.keys("space");
    expect(f).toContain("About slipbox");
    expect(f).toContain("Background work");
    expect(f).toContain("rename, actions, format");
    expect(f).not.toContain("more ·");
    const popup = h.app.geometry!.popup!;
    expect(popup.x).toBeGreaterThanOrEqual(0);
    expect(popup.x + popup.w).toBeLessThanOrEqual(120);
  });
  test("the explanations of g, z, [ and ] name every key under them", () => {
    for (const prefix of ["g", "z", "[", "]"]) {
      const { desc } = parseGroup(DEFAULT_GROUPS[prefix]!);
      const named = [...desc.matchAll(/\(([^)]*)\)/g)].flatMap((m) => m[1]!.split(" "));
      const under = Object.keys(DEFAULT_KEYS)
        .filter((k) => k.startsWith(`${prefix} `))
        .map((k) => keyChar(k.slice(prefix.length + 1)) ?? k);
      for (const k of under) expect([prefix, k, named.includes(k)]).toEqual([prefix, k, true]);
    }
  });
  test("a top-level prefix's popup says its group's explanation in its title, which nothing else shows (DF-D31)", async () => {
    const h = await harness({
      width: 200,
      height: 40,
      config: (c) => (
        (c.input.which_key_delay_ms = 10),
        (c.keys = { "g q a": "note.save" }),
        (c.groups = { y: "yank: what's copied", "g q": "quick: a group under g" })
      ),
    });
    const title = async (...keys: string[]) => {
      await h.keys(...keys);
      await new Promise((r) => setTimeout(r, 40));
      const row = h
        .frame()
        .split("\n")
        .find((r) => r.includes("┌─ "));
      await h.keys("escape");
      return row?.slice(row.indexOf("┌─ ") + 3, row.lastIndexOf(" ─")).trim();
    };
    for (const prefix of ["z", "[", "]", "g"]) {
      const { name, desc } = parseGroup(DEFAULT_GROUPS[prefix]!);
      expect(await title(prefix)).toBe(`${prefix} › ${name}: ${desc}`); // the box as wide as it, room allowing
    }
    expect(await title("y")).toBe("y › yank: what's copied"); // [groups]' too
    // Under the leader or another prefix, a group's explanation is in the popup above it, beside its name: the title
    // its name alone.
    expect(await title("space", "l")).toBe("␣ l › links");
    expect(await title("g", "q")).toBe("g q › quick");
    // A narrower screen cuts it, in the popup's width.
    const narrow = await harness({ width: 90, height: 40, config: (c) => (c.input.which_key_delay_ms = 10) });
    await narrow.keys("z");
    await new Promise((r) => setTimeout(r, 40));
    const row = narrow
      .frame()
      .split("\n")
      .find((r) => r.includes("┌─ "))!;
    expect(row).toContain("z › scroll: the cursor's line");
    expect(row).toContain("…");
    expect(row.trimEnd().endsWith("┐")).toBe(true);
  });
  test("other prefixes show it only after the delay", async () => {
    const h = await harness({ config: (c) => (c.input.which_key_delay_ms = 50) });
    await h.keys("y");
    expect(h.app.input.whichKey).toBe(false);
    await new Promise((r) => setTimeout(r, 90));
    expect(h.app.input.whichKey).toBe(true);
    expect(h.frame()).toContain("Copy note path");
  });
});

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

describe("windows (ctrl+w, space w)", () => {
  test("split, focus, move, swap, close, only", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 160 });
    await h.keys("ctrl+w", "v");
    const t = h.app.tab!;
    expect(t.views).toHaveLength(2);
    expect(t.orientation).toBe("side");
    await h.keys("ctrl+d");
    expect(t.views[1]!.top).toBeGreaterThan(0);
    expect(t.views[0]!.top).toBe(0);
    await h.keys("ctrl+w", "h");
    expect(t.active).toBe(0);
    await h.keys("ctrl+w", "right");
    expect(t.active).toBe(1);
    await h.keys("ctrl+w", "shift+j");
    expect(t.orientation).toBe("stacked");
    expect(t.active).toBe(1);
    await h.keys("ctrl+w", "shift+k");
    expect(t.active).toBe(0);
    const first = t.views[0];
    await h.keys("ctrl+w", "x");
    expect(t.views[1]).toBe(first!);
    await h.keys("ctrl+w", "v");
    expect(t.orientation).toBe("side");
    await h.keys("ctrl+w", "o");
    expect(t.views).toHaveLength(1);
    await h.keys("space", "w", "s", "ctrl+w", "q");
    expect(t.views).toHaveLength(1);
  });
  test("focus moves out to the explorer and the outline, and back", async () => {
    const h = await harness({ width: 160, config: (c) => (c.ui.outline = true) });
    await h.keys("ctrl+w", "h");
    expect(h.app.region).toBe("sidebar");
    await h.keys("ctrl+w", "l");
    expect(h.app.region).toBe("content");
    await h.keys("ctrl+w", "l");
    expect(h.app.region).toBe("outline");
    await h.keys("ctrl+w", "left");
    expect(h.app.region).toBe("content");
  });
  test("narrow terminals stack a side-by-side split", async () => {
    const h = await harness({ width: 70 });
    await h.keys("ctrl+w", "v");
    const [p1, p2] = h.app.geometry!.panes;
    expect(p1!.x).toBe(p2!.x);
  });
});

describe("resize mode (ctrl+alt+w, space w r)", () => {
  test("enter, resize the split with h l and arrows, equalize, leave", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 160 });
    await h.keys("ctrl+w", "v", "ctrl+w", "h"); // left window active
    const t = h.app.tab!;
    const f = await h.keys("space", "w", "r");
    expect(h.app.panels.resizeMode).toBe(true);
    expect(statusRow(f)).toContain("RESIZE");
    expect(f).toContain("Wider");
    const w0 = h.app.geometry!.panes[0]!.w;
    await h.keys("l", "l", "right");
    expect(h.app.geometry!.panes[0]!.w).toBeGreaterThan(w0 + 4);
    await h.keys("h", "left");
    await h.keys("=");
    expect(t.ratio).toBe(0.5);
    await h.keys("escape");
    expect(h.app.panels.resizeMode).toBe(false);
  });
  test("ctrl+w > < + - resize one step, then stay in the mode so the key repeats", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 160, height: 40 });
    await h.keys("ctrl+w", "v", "ctrl+w", "h");
    const t = h.app.tab!;
    await h.keys("ctrl+w", ">");
    expect(h.app.panels.resizeMode).toBe(true);
    const once = t.ratio;
    expect(once).toBeGreaterThan(0.5);
    await h.keys(">", ">");
    expect(t.ratio).toBeGreaterThan(once);
    await h.keys("<", "<", "<");
    expect(t.ratio).toBeCloseTo(0.5, 5);
    await h.keys("escape", "ctrl+w", "o", "ctrl+w", "s");
    expect(t.views.length).toBe(2); // ctrl+w - no longer splits; ctrl+w s does
    await h.keys("ctrl+w", "k", "ctrl+w", "+", "+");
    const taller = t.ratio;
    expect(taller).toBeGreaterThan(0.5);
    await h.keys("-", "escape", "space", "w", "-");
    expect(t.ratio).toBeLessThan(taller);
    await h.keys("escape", "ctrl+w", "=");
    expect(t.ratio).toBe(0.5);
    expect(t.views.length).toBe(2);
  });
  test("any other key leaves the mode and does its normal job", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md" });
    await h.keys("space", "w", "r");
    expect(h.app.panels.resizeMode).toBe(true);
    await h.keys("ctrl+d");
    expect(h.app.panels.resizeMode).toBe(false);
    expect(h.app.view!.top).toBeGreaterThan(0);
  });
  test("stacked splits resize with j k; the right window grows by lowering the ratio", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 160, height: 40 });
    await h.keys("ctrl+w", "s", "space", "w", "r", "j", "j", "escape");
    expect(h.app.tab!.ratio).toBeLessThan(0.5); // the lower (second) window got taller
    await h.keys("ctrl+w", "v", "space", "w", "r", "k");
    expect(h.app.transient!.text).toContain("h / l");
  });
  test("the focused explorer or outline resizes its own width; sizes persist in the session", async () => {
    const root = makeVault();
    const h = await harness({ root, width: 160, config: (c) => (c.ui.outline = true) });
    await h.keys("ctrl+w", "h", "space", "w", "r", "l", "l", "escape");
    expect(h.app.panels.sideW).toBe(34);
    await h.keys("ctrl+w", "l", "ctrl+w", "l", "space", "w", "r", "h", "escape");
    expect(h.app.region).toBe("outline");
    expect(h.app.panels.outW).toBe(30);
    await h.keys("ctrl+w", "h", "ctrl+w", "v", "space", "w", "r", "l", "escape");
    const ratio = h.app.tab!.ratio;
    h.app.quit();
    const again = await harness({ root, open: null, width: 160, config: (c) => (c.ui.restore_session = true) });
    expect(again.app.panels.sideW).toBe(34);
    expect(again.app.panels.outW).toBe(30);
    expect(again.app.panels.outlineShown).toBe(true); // the outline pane itself is restored too
    expect(again.app.tab!.ratio).toBeCloseTo(ratio, 5);
  });
  test("resize keys and the default split ratio come from config", async () => {
    const h = await harness({
      open: "samples/handbook/operations-handbook.md",
      width: 160,
      config: (c) => ((c.ui.split_ratio = 0.3), (c.keys = { resize: { a: "wider" } } as unknown as Config["keys"])),
    });
    await h.keys("ctrl+w", "v", "ctrl+w", "h");
    expect(h.app.tab!.ratio).toBe(0.3);
    await h.keys("space", "w", "r", "a");
    expect(h.app.tab!.ratio).toBeGreaterThan(0.3);
  });
});

describe("the rails (ui.left_rail, ui.right_rail)", () => {
  test("a column at the right edge under the tab strip; its ▤ toggles the outline, which opens beside it", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 140, height: 30 });
    const f = h.frame();
    const rows = f.split("\n");
    const W = 140;
    const x = W - h.app.panels.rightRailWidth;
    expect(h.app.panels.rightRailWidth).toBe(3); // tinted: one button wide, no border
    const btn = h.app.geometry!.hot.find((r) => r.id === "btn:outline")!;
    expect(btn.x).toBe(x);
    expect([...rows[btn.y]!][x + 1]).toBe("▤");
    // The rail's column is tinted from under the strip's rule to the bottom rule, with no line.
    const c = h.canvas();
    expect(c.styles[btn.y + 5]![x]!.bg).toBe(h.app.theme.roles.rail.bg!);
    const col = rows.map((r) => [...r][x] ?? "").join("");
    expect(col).not.toMatch(/[┃┳┻┫]/u);
    // Only one ▤: not on the breadcrumb as well.
    expect(h.app.geometry!.hot.filter((r) => r.id === "btn:outline").length).toBe(1);
    h.app.mouse.handle({ type: "down", x: btn.x + 1, y: btn.y, button: 0 });
    h.app.mouse.handle({ type: "up", x: btn.x + 1, y: btn.y, button: 0 });
    h.frame();
    expect(h.app.panels.outlineShown).toBe(true);
    const o = h.app.geometry!.outline!;
    expect(o.x + o.w).toBe(x); // the outline ends at the rail
    // Without colour there's no tint: the rail is a bordered column, joined to the rules.
    const mono = await harness({
      open: "samples/handbook/operations-handbook.md",
      width: 140,
      height: 30,
      themeName: "mono",
    });
    const mrows = mono.frame().split("\n");
    expect(mono.app.panels.rightRailWidth).toBe(4);
    const mcol = mrows.map((r) => [...r][W - 4] ?? "").join("");
    expect(mcol).toContain("┳");
    expect(mcol).toContain("┻");
    // Zen has no rails; ui.right_rail = false removes it and the breadcrumb gets ▤ back.
    await h.app.run("ui.zen");
    h.frame();
    expect(h.app.panels.rightRailWidth).toBe(0);
    await h.app.run("ui.zen");
    const n = await harness({
      open: "samples/handbook/operations-handbook.md",
      width: 140,
      height: 30,
      config: (c) => (c.ui.right_rail = false),
    });
    n.frame();
    expect(n.app.panels.rightRailWidth).toBe(0);
    const b2 = n.app.geometry!.hot.find((r) => r.id === "btn:outline")!;
    expect(b2.x + b2.w).toBe(W);
  });
});

describe("ui.lines", () => {
  test("light (the default): the frame in ─ │ and light joints; heavy: ━ ┃", async () => {
    const h = await harness({
      open: "samples/handbook/operations-handbook.md",
      width: 140,
      height: 30,
      config: (c) => (c.ui.lines = "light"),
    });
    const f = h.frame();
    expect(DEFAULT_CONFIG.ui.lines).toBe("light");
    expect(f).not.toMatch(/[━┃╋┳┻┣┫]/u);
    expect(f).toContain("┬");
    expect(f).toContain("┴");
    expect(f.split("\n")[1]!).toMatch(/^─+┬/u);
    const heavy = await harness({ open: "samples/handbook/operations-handbook.md", width: 140, height: 30 });
    expect(heavy.frame().split("\n")[1]!).toMatch(/^━+┳/u);
  });
});

describe("the left rail", () => {
  test("a column at the left edge under the top bar; its ≡ toggles the explorer, which opens beside it", async () => {
    const h = await harness({
      open: "samples/handbook/operations-handbook.md",
      width: 140,
      height: 30,
      config: (c) => (c.ui.sidebar = false),
    });
    const rows = h.frame().split("\n");
    expect(h.app.panels.leftRailWidth).toBe(3);
    const btn = h.app.geometry!.hot.find((r) => r.id === "btn:explorer")!;
    expect(btn.x).toBe(0);
    expect(btn.y).toBe(2); // under the top bar's rule, level with the tab strip
    expect([...rows[btn.y]!][1]).toBe("≡");
    expect(h.app.geometry!.hot.filter((r) => r.id === "btn:explorer").length).toBe(1); // not in the top bar too
    expect(h.canvas().styles[btn.y + 5]![1]!.bg).toBe(h.app.theme.roles.rail.bg!); // tinted, no border
    expect(rows[1]!.slice(0, 5)).toBe("━".repeat(5)); // the top rule runs over it unbroken
    expect(h.app.geometry!.tabStrip!.x).toBe(3); // the strip starts after the rail
    h.app.mouse.handle({ type: "down", x: btn.x + 1, y: btn.y, button: 0 });
    h.app.mouse.handle({ type: "up", x: btn.x + 1, y: btn.y, button: 0 });
    h.frame();
    expect(h.app.panels.sidebarShown).toBe(true);
    expect(h.app.geometry!.sidebarPane!.x).toBe(3);
    // Without it, ≡ is back in the top bar.
    const n = await harness({ width: 140, height: 30, config: (c) => (c.ui.left_rail = false) });
    n.frame();
    expect(n.app.geometry!.hot.find((r) => r.id === "top:zoom")!.y).toBe(0);
  });
});

describe("block backgrounds", () => {
  test("a code block's text sits on the block's background, not the page's; the cursor band covers both", async () => {
    const root = makeVault();
    writeFileSync(join(root, "p.md"), "text\n\n```\ncode here\n```\n\nmore\n");
    const h = await harness({ root, open: "p.md", width: 80, height: 20 });
    const pane = h.app.geometry!.panes[0]!;
    const v = h.app.view!;
    const row = h.app.currentLayout(v).lines.findIndex((l) =>
      l.spans
        .map((x) => x.text)
        .join("")
        .includes("code here"),
    );
    const y = pane.y + row - v.top;
    expect(h.canvas().styles[y]![pane.textX + 3]!.bg).toBe(h.app.theme.roles.code_block.bg!);
    h.app.moveCursor(v, { row, col: 0 });
    expect(h.canvas().styles[y]![pane.textX + 3]!.bg).toBe(h.app.theme.roles.cursor_line.bg!);
  });
});

describe("breadcrumb collapse (…) and the path dropdown", () => {
  test("crumbLayout: all, then first … innermost, then cut, then … last, then …", () => {
    const shape = (ps: ReturnType<typeof crumbLayout>) =>
      ps.map((p) => (p === "more" ? "…" : `${p.i}:${p.w}`)).join(" ");
    const ws = [20, 15, 15, 20];
    expect(shape(crumbLayout(ws, 200, 3))).toBe("0:20 1:15 2:15 3:20");
    expect(shape(crumbLayout(ws, 70, 3))).toBe("0:20 … 2:15 3:20"); // 20+3+1+3+15+3+20 = 65
    expect(shape(crumbLayout(ws, 50, 3))).toBe("0:20 … 3:20");
    expect(shape(crumbLayout(ws, 30, 3))).toBe("0:8 … 3:15"); // cut, the last keeps the most
    expect(shape(crumbLayout(ws, 20, 3))).toBe("… 3:16");
    expect(shape(crumbLayout(ws, 10, 3))).toBe("…");
    expect(shape(crumbLayout([30, 30], 40, 3))).toBe("0:8 1:29"); // two: no … until the first goes
    expect(shape(crumbLayout([30], 12, 3))).toBe("0:12");
    expect(shape(crumbLayout([30], 5, 3))).toBe("…");
  });
  test("space f b with the which-key popup drawn over the breadcrumb after space f: the dropdown under it all the same (#40)", async () => {
    const h = await harness({
      open: "samples/handbook/operations-handbook.md",
      width: 100,
      height: 34,
      config: (c) => (c.ui.outline = false),
    });
    const v = h.app.view!;
    const target = h.app.currentLayout(v).headings.find((x) => x.text.startsWith("Swapping a filter"))!;
    h.app.moveCursor(v, { row: target.line + 1, col: 0 });
    h.frame();
    const hot = h.app.geometry!.hot;
    const crumb = hot.find((r) => r.id === "crumbmore:0") ?? hot.find((r) => r.id === "crumbicon:0")!; // its …, else its icon
    // A frame between the keys, as a slow machine draws one: the popup over the breadcrumb takes its clicks.
    await h.keys("space", "f");
    h.frame();
    const popup = h.app.geometry!.popup!;
    expect(crumb.y >= popup.y && crumb.y < popup.y + popup.h && crumb.x < popup.x + popup.w).toBe(true);
    expect(h.app.geometry!.hot.some((r) => r.id === crumb.id)).toBe(false);
    await h.keys("b");
    expect((h.app.overlay as ListOverlay).anchor).toEqual({ x: crumb.x, y: crumb.y });
    expect(h.frame()).toContain("└─");
  });
  test("… opens the whole path as a dropdown under it; enter jumps; space f b opens it too", async () => {
    const h = await harness({
      open: "samples/handbook/operations-handbook.md",
      width: 70,
      height: 30,
      config: (c) => ((c.ui.sidebar = false), (c.ui.outline = false)),
    });
    const v = h.app.view!;
    const target = h.app.currentLayout(v).headings.find((x) => x.text.startsWith("Swapping a filter"))!;
    h.app.moveCursor(v, { row: target.line + 1, col: 0 });
    h.frame();
    const chain = h.app.outlineView.breadcrumb(v);
    expect(chain.length).toBe(3);
    const more = h.app.geometry!.hot.find((r) => r.id === "crumbmore:0")!;
    expect(more).toBeDefined();
    h.app.mouse.handle({ type: "down", x: more.x, y: more.y, button: 0 });
    h.app.mouse.handle({ type: "up", x: more.x, y: more.y, button: 0 });
    const o = h.app.overlay as ListOverlay;
    expect(o.kind).toBe("list");
    expect(o.anchor).toEqual({ x: more.x, y: more.y });
    expect(o.items.map((i) => i.label)).toEqual(chain.map((c) => c.text));
    expect(o.selected).toBe(2); // the current heading
    const f = h.frame();
    const box = h.app.geometry!.overlay!;
    expect(box.y).toBe(more.y + 2); // hanging under the breadcrumb…
    expect(box.x).toBe(Math.floor((70 - box.w) / 2)); // …centred across the screen
    expect(box.w).toBeGreaterThanOrEqual(Math.min(60, 70 - 8));
    expect(box.listY).toBe(box.y + 3); // the filter's row, then a blank row
    expect(box.h).toBeGreaterThanOrEqual(8 + 5);
    expect(f).toContain("└─");
    await h.keys("up", "enter"); // up to the hidden middle one
    expect(h.app.overlay).toBeNull();
    expect(v.cur.row).toBe(chain[1]!.line);
    // From the keyboard: the arrows move, and a click on an entry picks it.
    h.app.moveCursor(v, { row: target.line + 1, col: 0 });
    h.frame();
    await h.keys("space", "f", "b");
    expect(h.app.overlay?.kind).toBe("list");
    expect((h.app.overlay as ListOverlay).selected).toBe(2); // on the current heading
    await h.keys("up", "up");
    expect((h.app.overlay as ListOverlay).selected).toBe(0);
    // Typing filters, as in every list; the filter's row sits above the entries.
    await h.keys("S", "w", "a");
    expect((h.app.overlay as ListOverlay).filtered.map((e) => e.item.label)).toEqual(["Swapping a filter"]);
    expect(h.frame()).toContain("› Swa");
    await h.keys("backspace", "backspace", "backspace");
    await h.keys("up", "up");
    h.frame();
    const g = h.app.geometry!.overlay!;
    h.app.mouse.handle({ type: "down", x: g.x + 4, y: g.listY, button: 0 });
    expect(h.app.overlay).toBeNull();
    expect(v.cur.row).toBe(chain[0]!.line);
  });
});

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

describe("review round 1", () => {
  const click = (h: Harness, x: number, y: number, button = 0) => {
    h.app.mouse.handle({ type: "down", x, y, button });
    h.app.mouse.handle({ type: "up", x, y, button });
    h.frame();
  };
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
  });
  test("wrapping off: the sideways offset is clamped when the window widens", async () => {
    const h = await harness({
      open: "samples/scratch/wrap-probe.md",
      width: 80,
      height: 30,
      config: (c) => ((c.ui.wrap = false), (c.ui.sidebar = false)),
    });
    h.frame();
    const v = h.app.view!;
    const layout = h.app.currentLayout(v);
    const row = layout.lines.reduce(
      (best, l, i, all) =>
        l.spans.reduce((a, x) => a + x.text.length, 0) > all[best]!.spans.reduce((a, x) => a + x.text.length, 0)
          ? i
          : best,
      0,
    );
    h.app.moveCursor(v, { row, col: 10_000 });
    await h.keys("$");
    h.frame();
    expect(v.left).toBeGreaterThan(0);
    const wide = h.app.draw.bind(h.app);
    const { TextCanvas } = await import("../src/tui/shell/terminal/canvas.ts");
    wide(new TextCanvas(200, 30));
    expect(v.left).toBeLessThanOrEqual(Math.max(0, h.app.currentLayout(v).width - h.app.views.textColumns(v)));
  });
  test("UI settings survive a start with a path; an explicit theme beats a remembered one", async () => {
    const root = mkdtempSync(join(sandbox, "vault-"));
    cpSync(join(import.meta.dir, "fixtures", "vault"), root, { recursive: true, verbatimSymlinks: true });
    const a = await harness({ root, open: "notes/alpha.md" });
    a.app.settings.setUi("line_numbers", true);
    a.app.session.save();
    const b = await harness({ root, open: "notes/beta.md" }); // with a path: tabs not restored
    expect(b.app.ui.line_numbers).toBe(true);
    b.app.settings.setUi("theme", "nord");
    b.app.session.save();
    const c = await harness({ root, open: "notes/beta.md", themeName: "dracula" });
    expect(c.app.ui.theme).toBe("dracula");
  });
  test("on a narrow strip, +N is clickable: tabs stop before it", async () => {
    const h = await harness({ open: "samples/about-this-vault.md", width: 30, height: 12 });
    for (const n of [
      "notes/alpha.md",
      "notes/beta.md",
      "index.md",
      "samples/equipment/telescope-comparison.md",
      "samples/software/pipeline-cookbook.md",
      "samples/logs/observing-log-2026.md",
      "samples/handbook/operations-handbook.md",
    ])
      h.app.openInNewTab(n);
    h.app.activeTab = 3;
    h.frame();
    const more = h.app.geometry!.hot.find((r) => r.id === "tabmore:")!;
    for (const r of h.app.geometry!.hot)
      if (r.id.startsWith("tab")) expect(r.id === "tabmore:" || r.x + r.w <= more.x).toBe(true);
    const count = h.app.tabs.length;
    click(h, more.x + 2, more.y);
    expect(h.app.tabs).toHaveLength(count);
    expect(h.app.overlay?.kind).toBe("list");
  });
  test("a stacked split too short for two windows shows the active one, inside its area", async () => {
    const h = await harness({ open: "samples/about-this-vault.md", width: 40, height: 9 });
    await h.keys("ctrl+w", "s");
    const rows = h.frame().split("\n");
    expect(rows.at(-2)!.startsWith("━")).toBe(true); // the bottom frame rule is intact
    expect(h.app.geometry!.panes.some((p) => p.view === h.app.view)).toBe(true);
  });
  test("which-key on a tiny screen stays inside its box and says what's hidden", async () => {
    const h = await harness({ width: 60, height: 14 });
    const rows = (await h.keys("space")).split("\n");
    const top = rows.findIndex((r) => r.includes("┌─"));
    const bottom = rows.findIndex((r, i) => i > top && r.includes("└"));
    const right = rows[top]!.lastIndexOf("┐");
    for (let y = top; y <= bottom; y++)
      expect(
        rows[y]!.slice(right + 1)
          .replace(/[▐┃━▤¹]/g, "")
          .trim(),
      ).toBe(""); // borders, the right rail
    expect(rows[bottom]).toMatch(/\+\d+ more/);
  });
  test("NO_COLOR: the scrollbar thumb stands out from its track; the current note is bold", async () => {
    const h = await harness({
      open: "samples/handbook/operations-handbook.md",
      width: 100,
      height: 20,
      themeName: "mono",
    });
    const c = h.canvas();
    const bar = h.app.geometry!.scrollbars[0]!;
    const col = Array.from({ length: bar.h }, (_, k) => c.rows[bar.y + k]![bar.x]);
    expect(new Set(col).size).toBeGreaterThan(1);
    expect(h.app.theme.roles.sidebar_active.bold).toBe(true);
  });
  test("without the window header, the outline button is in the top bar", async () => {
    const h = await harness({
      width: 100,
      height: 14,
      config: (c) => ((c.ui.window_header = false), (c.ui.right_rail = false)),
    });
    h.frame();
    const btn = h.app.geometry!.hot.find((r) => r.id === "btn:outline")!;
    expect(btn.y).toBe(0);
    click(h, btn.x + 1, btn.y);
    expect(h.app.panels.outlineShown).toBe(true);
  });
  test(
    "which-key on a short screen drops its blank rows before its explanations",
    async () => {
      // At every height: blank rows inside the box only ever appear together with the explanations.
      for (let height = 12; height <= 40; height++) {
        const h = await harness({ width: 160, height });
        const rows = (await h.keys("space")).split("\n");
        const head = rows.findIndex((r) => r.includes("┌─ ␣ › leader"));
        if (head < 0) continue;
        const left = rows[head]!.indexOf("┌");
        const padded = rows[head + 1]!.slice(left + 1, rows[head + 1]!.lastIndexOf("│")).trim() === "";
        const described = rows.join("\n").includes("notes, headings, tags, text, commands");
        if (padded) expect(described).toBe(true);
      }
    },
    UNIT_TIMEOUT_MS,
  ); // 29 harnesses
});

describe("review round 2", () => {
  test("a which-key entry takes its click, not what's under the popup", async () => {
    const h = await harness({ open: "samples/people/partners-and-names.md", width: 120, height: 30 });
    await h.keys("ctrl+w", "s", "ctrl+w", "j");
    await h.keys("space");
    h.frame();
    for (const r of h.app.geometry!.hot.filter((x) => x.id.startsWith("wk:"))) {
      const at = h.app.geometry!.hot.find(
        (x) => x.x <= r.x + 1 && r.x + 1 < x.x + x.w && x.y <= r.y && r.y < x.y + x.h,
      )!;
      expect(at.id).toBe(r.id);
    }
  });
});

describe("review round 3", () => {
  test("a change to one note re-lays out only the open notes that link to it", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    h.app.openInNewTab("samples/equipment/telescope-comparison.md");
    h.frame();
    const wide = h.app.view!;
    const before = h.app.currentLayout(wide);
    const alpha = h.app.tabs[0]!.views[0]!;
    const alphaBefore = h.app.currentLayout(alpha);
    h.app.watch.applyChanges({ changes: [{ rel: "notes/beta.md", kind: "changed", isNote: true }], rescan: false });
    expect(h.app.currentLayout(wide)).toBe(before); // no link to beta: the same layout object
    expect(h.app.currentLayout(alpha)).not.toBe(alphaBefore); // links to beta: re-laid out
  });
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  test("the scratch's own writes never read as external changes (polled directories included)", async () => {
    const root = makeVault();
    const h = await harness({
      root,
      watch: true,
      config: (c) => ((c.capture.location = "root"), (c.watch.debounce_ms = 30), (c.watch.poll_ms = 100)),
    });
    try {
      await h.keys("space", "s", "a");
      await sleep(400);
      await h.keys("space", "s", "s"); // the scratch open in a window
      await h.keys("space", "s", "a");
      await sleep(1200);
      expect(h.app.messages.some((m) => m.text.includes("scratch.md changed on disk"))).toBe(false);
    } finally {
      h.app.watcher?.close();
    }
  });
  test("tiny terminals: panes go over the note, and nothing fails to draw", async () => {
    for (const width of [12, 20, 26, 40]) {
      const h = await harness({ width, height: 12, config: (c) => ((c.ui.narrow_width = 0), (c.ui.outline = true)) });
      h.frame(); // throws on a drawing failure
      expect(h.app.panels.sidebarBeside && h.app.panels.outlineBeside && h.app.panels.contentWidth() < 24).toBe(false);
    }
  });
  test("the outline button stays reachable when an overlaid outline hides the breadcrumb", async () => {
    const h = await harness({ width: 70, height: 30 });
    await h.keys("space", "o");
    h.frame();
    expect(h.app.geometry!.hot.some((r) => r.id === "btn:outline")).toBe(true);
  });
  test("a config key with an unknown modifier is reported and binds nothing", async () => {
    const h = await harness({ config: (c) => (c.keys = { "hyper+x": "ui.zen" } as Config["keys"]) });
    expect(h.app.messages.some((m) => m.text.includes('unknown modifier "hyper"'))).toBe(true);
    await h.keys("x");
    expect(h.app.ui.zen).toBe(false);
  });
});

describe("wrap (space u s, ui.wrap)", () => {
  test("off: natural width, one row per paragraph, the view follows the cursor sideways", async () => {
    const h = await harness({
      open: "samples/equipment/telescope-comparison.md",
      width: 110,
      config: (c) => (c.ui.sidebar = false),
    });
    const wrapped = h.app.currentLayout(h.app.view!);
    await h.keys("space", "u", "w");
    expect(h.app.ui.wrap).toBe(false);
    const layout = h.app.currentLayout(h.app.view!);
    expect(layout.width).toBeGreaterThan(300); // the widest real row, not the pane
    expect(layout.width).toBeLessThan(2000); // not the probe width
    expect(layout.lines.length).toBeLessThan(wrapped.lines.length);
    const row = layout.lines.findIndex((l) =>
      l.spans
        .map((x) => x.text)
        .join("")
        .includes("The short version is that Aster"),
    );
    h.app.moveCursor(h.app.view!, { row, col: 0 });
    expect(h.app.view!.left).toBe(0);
    await h.keys("$");
    const v = h.app.view!;
    expect(v.left).toBeGreaterThan(0);
    expect(v.cur.col).toBeGreaterThanOrEqual(v.left);
    expect(v.cur.col).toBeLessThan(v.left + h.app.views.textColumns(v));
    // What's drawn is the row's end, and a click lands on the column under it.
    const f = h.frame();
    expect(f).toContain("before anyone signs a purchase order.");
    const pane = h.app.geometry!.panes[0]!;
    const y = pane.y + row - v.top;
    h.app.mouse.handle({ type: "down", x: pane.textX + 5, y, button: 0 });
    h.app.mouse.handle({ type: "up", x: pane.textX + 5, y, button: 0 });
    expect(h.app.view!.cur.col).toBe(v.left + 5);
    // A horizontal wheel scrolls sideways without moving the cursor.
    const before = v.left;
    h.app.mouse.handle({ type: "scroll", x: pane.textX + 5, y, button: 0, scroll: { direction: "left", delta: 1 } });
    expect(v.left).toBeLessThan(before);
    // Back on: wrapped again, no sideways scroll.
    await h.keys("space", "u", "w");
    expect(h.app.view!.left).toBe(0);
    expect(h.app.currentLayout(h.app.view!).width).toBe(wrapped.width);
  });
  test(":wrap toggles it, and rules don't count toward the natural width", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 120 });
    await h.keys(":", "w", "r", "a", "p", "enter");
    expect(h.app.ui.wrap).toBe(false);
    const layout = h.app.currentLayout(h.app.view!);
    // Every row that isn't a rule fits within the natural width.
    expect(layout.width).toBeLessThan(2000);
  });
});

describe("code blocks that scroll sideways ([render] code_wrap)", () => {
  /** A note with a tree too wide for a 70-column window — two long lines, a short one after — and a long command in a
   *  list item. */
  const LONG_ONE =
    "├── src/core/layout/render.ts     the layout: mdast to rows, every block and inline, the code anchovy";
  const LONG_TWO =
    "├── src/tui/draw.ts               the drawing: rows to cells, and each code block from its offset bergamot";
  const COMMAND =
    'echo "a long command line inside a list item that goes well past the right edge of the window" cardamom';
  const TREE = [
    "# Tree",
    "",
    "Before the block, a paragraph long enough to wrap in a narrow window, as paragraphs always do.",
    "",
    "```text",
    LONG_ONE,
    LONG_TWO,
    "└── README.md",
    "```",
    "",
    "After the block.",
    "",
    "- an item",
    "",
    "  ```sh",
    `  ${COMMAND}`,
    "  ```",
    "",
  ].join("\n");
  const tree = async (opts: Opts = {}) => {
    const root = opts.root ?? makeVault();
    writeFileSync(join(root, "tree.md"), TREE);
    return harness({
      width: 70,
      height: 30,
      ...opts,
      root,
      open: "tree.md",
      config: (c) => {
        c.ui.sidebar = false;
        opts.config?.(c);
      },
    });
  };
  const rowOf = (h: Harness, text: string) =>
    h.app.currentLayout(h.app.view!).lines.findIndex((l) =>
      l.spans
        .map((s) => s.text)
        .join("")
        .includes(text),
    );
  /** The block holding `row`: its scroll, and how far it's scrolled. */
  const block = (h: Harness, row: number) => {
    const layout = h.app.currentLayout(h.app.view!);
    return { s: layout.lines[row]!.scroll!, off: h.app.code.offset(h.app.view!, layout, row) };
  };
  /** A scrolling row's code: its text from where its code starts. */
  const codeOf = (h: Harness, row: number) => {
    const l = h.app.currentLayout(h.app.view!).lines[row]!;
    return [...l.spans.map((s) => s.text).join("")].slice(l.scroll!.x).join("");
  };

  test("each line of a block too wide is one row, whole, from its code's start; paragraphs still wrap; drawn, the block's width of it", async () => {
    const h = await tree();
    const layout = h.app.currentLayout(h.app.view!);
    const one = rowOf(h, "anchovy");
    expect(codeOf(h, one)).toBe(LONG_ONE);
    expect(codeOf(h, rowOf(h, "bergamot"))).toBe(LONG_TWO);
    expect(rowOf(h, "bergamot")).toBe(one + 1);
    expect(layout.lines.some((l) => l.spans.some((s) => s.text.includes("↪")))).toBe(false);
    const { s } = block(h, one);
    expect(s).toEqual({ x: 1, w: layout.width - 2, total: stringWidth(LONG_TWO) });
    // In the list item, its code starts past the item's indent.
    const three = rowOf(h, "cardamom");
    expect(block(h, three).s.x).toBe(3);
    expect(codeOf(h, three)).toBe(COMMAND);
    // The paragraph wraps as ever.
    expect(rowOf(h, "Before the block")).toBeLessThan(rowOf(h, "always do."));
    // Drawn: the block's width of each line, a › where more is to the right; nothing past the window.
    const f = h.frame();
    expect(f).not.toContain("anchovy");
    expect(f).toContain(`${[...LONG_ONE].slice(0, s.w).join("")}›`);
    expect(f).toMatch(/ {5}└── README\.md\n/);
    expect(
      f
        .split("\n")
        .filter((r) => r.includes("├──") || r.includes("└──"))
        .join(""),
    ).not.toContain("‹");
  });

  test("the cursor drives it: l to four columns from the edge, $ and 0, w and b, f; up and down keep the column on screen; off the block its offset stays", async () => {
    const h = await tree();
    const v = h.app.view!;
    const one = rowOf(h, "anchovy");
    h.app.moveCursor(v, { row: one, col: 0 });
    await h.keys("0");
    const { s } = block(h, one);
    expect(v.cur.col).toBe(s.x); // 0: the code's start, past the gutter
    // l scrolls once the cursor is within 4 columns of the right edge, a column at a time.
    for (let i = 0; i < s.w - 5; i++) await h.keys("l");
    expect(block(h, one).off).toBe(0);
    await h.keys("l");
    expect(block(h, one).off).toBe(1);
    await h.keys("l", "l");
    expect(block(h, one).off).toBe(3);
    // h scrolls back only within 4 columns of the left edge.
    for (let i = 0; i < s.w - 9; i++) await h.keys("h");
    expect(block(h, one).off).toBe(3);
    await h.keys("h");
    expect(block(h, one).off).toBe(2);
    // $ shows the line's end, drawn; 0 its start.
    await h.keys("$");
    expect(v.cur.col).toBe(s.x + stringWidth(LONG_ONE) - 1);
    expect(block(h, one).off).toBe(stringWidth(LONG_ONE) - s.w + 4);
    expect(h.frame()).toContain("the code anchovy");
    await h.keys("0");
    expect(block(h, one).off).toBe(0);
    // w along the words: the block follows, the cursor in sight; b back.
    for (let i = 0; i < 20; i++) await h.keys("w");
    expect(block(h, one).off).toBeGreaterThan(0);
    const inSight = () => v.cur.col - s.x - block(h, one).off;
    expect(inSight()).toBeGreaterThanOrEqual(4);
    expect(inSight()).toBeLessThan(s.w - 4);
    for (let i = 0; i < 20; i++) await h.keys("b");
    expect(block(h, one).off).toBe(0);
    // Down to the next long line: the same column on screen, the block where it was.
    await h.keys("$");
    const off = block(h, one).off;
    const screen = v.cur.col - off;
    await h.keys("j");
    expect(v.cur.row).toBe(one + 1);
    expect(block(h, one).off).toBe(off);
    expect(v.cur.col - off).toBe(screen);
    // Off the block (up past its first line and its label): its offset as it was.
    await h.keys("k", "k", "k");
    expect(v.cur.row).toBeLessThan(one - 1);
    expect(block(h, one).off).toBe(off);
    expect(h.frame()).toContain(`‹${[...LONG_ONE].slice(off, off + s.w).join("")}`);
    // Through it at the window's left edge (the gutter's column, which never moves): its offset stays too.
    await h.keys("0", "j", "j", "j", "j", "j", "j");
    expect(v.cur.row).toBeGreaterThan(one + 1);
    expect(block(h, one).off).toBe(off);
    // The list's block has an offset of its own; f to a character past its edge, and ; on: it follows.
    const three = rowOf(h, "cardamom");
    expect(block(h, three).off).toBe(0);
    h.app.moveCursor(v, { row: three, col: 0 });
    await h.keys("0", "f", "+");
    expect(v.cur.col).toBe(block(h, three).s.x); // no + on the line: nothing moved
    await h.keys("f", "w", ";", ";", ";", ";");
    expect(COMMAND[v.cur.col - block(h, three).s.x]).toBe("w");
    expect(block(h, three).off).toBeGreaterThan(0);
  });

  test("the mouse: a sideways wheel, or shift and the wheel, over a block scrolls it, the cursor staying; a click lands on the character drawn there", async () => {
    const h = await tree({ height: 18 });
    const v = h.app.view!;
    h.frame();
    const pane = h.app.geometry!.panes[0]!;
    const one = rowOf(h, "anchovy");
    const y = pane.y + one - v.top;
    const cur = { ...v.cur };
    const wheel = (direction: string, shift = false, at = y) =>
      h.app.mouse.handle({
        type: "scroll",
        x: pane.textX + 10,
        y: at,
        button: 0,
        scroll: { direction, delta: 1 },
        shift,
      });
    wheel("right");
    expect(block(h, one).off).toBe(6);
    wheel("down", true);
    expect(block(h, one).off).toBe(12);
    wheel("up", true);
    expect(block(h, one).off).toBe(6);
    expect(v.cur).toEqual(cur);
    expect(v.top).toBe(0);
    for (let i = 0; i < 40; i++) wheel("right");
    expect(block(h, one).off).toBe(block(h, one).s.total - block(h, one).s.w);
    for (let i = 0; i < 40; i++) wheel("left");
    expect(block(h, one).off).toBe(0);
    // Over the label row too: it's the block's.
    wheel("right", false, y - 1);
    expect(block(h, one).off).toBe(6);
    // The list's block didn't move; the window didn't scroll sideways.
    expect(block(h, rowOf(h, "cardamom")).off).toBe(0);
    expect(v.left).toBe(0);
    // A click on the block, scrolled: the cursor on the character drawn under the pointer.
    h.app.mouse.handle({ type: "down", x: pane.textX + 11, y, button: 0 });
    h.app.mouse.handle({ type: "up", x: pane.textX + 11, y, button: 0 });
    expect(v.cur).toEqual({ row: one, col: 11 + 6 });
    expect(block(h, one).off).toBe(6);
    expect(h.canvas().rows[pane.y + one - v.top]![pane.textX + 11]).toBe([...LONG_ONE][10 + 6]);
    // The cursor in the block, the wheel takes it out of sight: it stays there through a re-layout (an answer from a
    // linter, the watcher), until the cursor moves.
    for (let i = 0; i < 10; i++) wheel("right");
    const away = block(h, one).off;
    expect(away).toBeGreaterThan(17);
    h.app.relayoutAll();
    h.frame();
    expect(block(h, one).off).toBe(away);
    await h.keys("l");
    expect(v.cur.col).toBe(18);
    expect(block(h, one).off).toBe(18 - 1 - 4); // its code column, less the margin
    // shift and the wheel over a paragraph scrolls the note, as the wheel does.
    wheel("down", true, pane.y + rowOf(h, "Before the block"));
    expect(v.top).toBeGreaterThan(0);
  });

  test("its scrollbar: on the block's last row, under its code, only while it overflows; a click or a drag moves the block, never the window", async () => {
    const h = await tree();
    const v = h.app.view!;
    h.frame();
    const pane = h.app.geometry!.panes[0]!;
    const bars = h.app.geometry!.scrollbars.filter((b) => b.block !== undefined);
    expect(bars.length).toBe(2); // the tree's and the list's
    const one = rowOf(h, "anchovy");
    const { s } = block(h, one);
    const b = codeBlocks(h.app.currentLayout(v)).byRow.get(one)!;
    const bar = bars.find((x) => x.block === b.key)!;
    expect([bar.x, bar.y, bar.w, bar.total]).toEqual([pane.textX + s.x, pane.y + b.last - v.top, s.w, s.total]);
    const c = h.canvas();
    expect(c.rows[bar.y]!.slice(bar.x, bar.x + bar.w).join("")).toBe("▄".repeat(bar.w));
    expect(c.styles[bar.y]![bar.x]!.fg).toBe(h.app.theme.roles.scrollbar.fg!);
    expect(c.styles[bar.y]![bar.x + bar.w - 1]!.fg).toBe(h.app.theme.roles.scrollbar_track.fg!);
    // On the code's background.
    expect(c.styles[bar.y]![bar.x]!.bg).toBe(h.app.theme.roles.code_block.bg!);
    h.app.mouse.handle({ type: "down", x: bar.x + bar.w - 1, y: bar.y, button: 0 });
    h.app.mouse.handle({ type: "up", x: bar.x + bar.w - 1, y: bar.y, button: 0 });
    expect(block(h, one).off).toBe(s.total - s.w);
    expect(h.frame()).toContain("bergamot");
    h.app.mouse.handle({ type: "down", x: bar.x + bar.w - 1, y: bar.y, button: 0 });
    h.app.mouse.handle({ type: "drag", x: bar.x, y: bar.y, button: 0 });
    h.app.mouse.handle({ type: "up", x: bar.x, y: bar.y, button: 0 });
    expect(block(h, one).off).toBe(0);
    expect([v.left, v.top]).toEqual([0, 0]);
    // Wide enough for every line: no block scrolls, none has a bar.
    const wide = await tree({ width: 180 });
    wide.frame();
    expect(wide.app.geometry!.scrollbars.some((x) => x.block !== undefined)).toBe(false);
    expect(wide.app.currentLayout(wide.app.view!).lines.some((l) => l.scroll)).toBe(false);
  });

  test("find: a match past the block's edge scrolls the block to it, the whole match in sight", async () => {
    const h = await tree();
    const v = h.app.view!;
    /** The block's row as drawn. */
    const drawn = (row: number) => {
      const c = h.canvas();
      const pane = h.app.geometry!.panes[0]!;
      return c.rows[pane.y + row - v.top]!.join("");
    };
    const one = rowOf(h, "anchovy");
    await h.keys("/", "a", "n", "c", "h", "o", "v", "y", "enter");
    expect(v.cur.row).toBe(one);
    expect(block(h, one).off).toBeGreaterThan(0);
    expect(drawn(one)).toContain("the code anchovy");
    // The next match, in another block: the whole word, though it ends past where the cursor's margin would.
    await h.keys("/", "w", "e", "l", "l", "space", "p", "a", "s", "t", "enter");
    const three = rowOf(h, "cardamom");
    expect(v.cur.row).toBe(three);
    expect(drawn(three)).toContain("well past");
    await h.keys("/", "b", "e", "r", "g", "a", "m", "o", "t", "enter");
    expect(drawn(rowOf(h, "bergamot"))).toContain("its offset bergamot");
  });

  test("copy takes whole lines, never the slice drawn: a selection along a line, a line selection, y y", async () => {
    const h = await tree();
    const v = h.app.view!;
    const one = rowOf(h, "anchovy");
    h.app.moveCursor(v, { row: one, col: 0 });
    await h.keys("0", "v", "$", "y");
    expect(h.copied.at(-1)).toBe(LONG_ONE);
    h.app.moveCursor(v, { row: one, col: 0 });
    await h.keys("shift+v", "j", "y");
    expect(h.copied.at(-1)).toBe(` ${LONG_ONE}\n ${LONG_TWO}`);
    h.app.moveCursor(v, { row: one + 1, col: 0 });
    await h.keys("y", "y");
    expect(h.copied.at(-1)).toBe(LONG_TWO);
  });

  test("the scratch's code scrolls too: a long line captured is one row there", async () => {
    const h = await tree();
    const v = h.app.view!;
    h.app.moveCursor(v, { row: rowOf(h, "anchovy"), col: 0 });
    // Captured, the scratch shows it floating, typing a note in its Markdown (edit_in = "source" here): rendered again.
    await h.keys("shift+v", "space", "s", "a", "escape", "ctrl+k");
    expect(h.app.floating?.kind).toBe("scratch");
    const sv = h.app.floating!.view;
    expect(sv.source).toBeFalsy();
    const layout = h.app.currentLayout(sv);
    const row = layout.lines.findIndex((l) => l.spans.some((s) => s.text.includes("anchovy")));
    expect(layout.lines[row]!.scroll).toBeDefined();
    expect(layout.lines[row]!.spans.map((s) => s.text).join("")).toContain(LONG_ONE);
  });

  test("its offsets go with the note: another note shown in the window, and back, starts each block from the left", async () => {
    const h = await tree();
    h.frame();
    const pane = h.app.geometry!.panes[0]!;
    const three = rowOf(h, "cardamom");
    const scroll = { direction: "right", delta: 1 };
    h.app.mouse.handle({ type: "scroll", x: pane.textX + 10, y: pane.y + three, button: 0, scroll });
    expect(block(h, three).off).toBe(6);
    h.app.open("notes/alpha.md");
    await h.keys("ctrl+o");
    expect(h.app.view!.buf.key).toBe("tree.md");
    expect(block(h, three).off).toBe(0);
  });

  test('[render] code_wrap = "wrap": long lines wrap, marked ↪, as before; the UI settings switch it, kept for the next start', async () => {
    const root = makeVault();
    const config = (c: Config) => ((c.render.code_wrap = "wrap"), (c.ui.restore_session = true));
    const h = await tree({ root, config });
    const layout = () => h.app.currentLayout(h.app.view!);
    expect(layout().lines.some((l) => l.scroll)).toBe(false);
    const one = rowOf(h, "├── src/core");
    expect(layout().lines[one + 1]!.spans[0]!.text).toBe("↪");
    expect(h.frame()).toContain("anchovy");
    await h.keys("space", "u", "u");
    expect(h.frame()).toMatch(/Code blocks +wrap/);
    await h.keys("escape");
    await h.app.run("ui.code_wrap");
    expect(h.app.messages.at(-1)!.text).toBe("Code blocks: scroll sideways");
    expect(codeOf(h, rowOf(h, "anchovy"))).toBe(LONG_ONE);
    h.app.quit();
    const again = await tree({ root, config });
    expect(again.app.ui.code_wrap).toBe("scroll");
    // A value saved that isn't one: dropped, the config's taken.
    const { loadSession, saveSession } = await import("../src/core/workspace/session/position.ts");
    again.app.quit();
    const saved = loadSession(again.app.loc)!;
    saveSession(again.app.loc, { ...saved, ui: { ...saved.ui, code_wrap: { value: "fold", base: "wrap" } } });
    const bogus = await tree({ root, config });
    expect(bogus.app.ui.code_wrap).toBe("wrap");
  });

  test("wrapping off: the window scrolls sideways and a block follows it, never scrolling on its own", async () => {
    const h = await tree({ config: (c) => (c.ui.wrap = false) });
    const v = h.app.view!;
    expect(h.app.currentLayout(v).lines.some((l) => l.scroll)).toBe(false);
    const one = rowOf(h, "anchovy");
    h.app.moveCursor(v, { row: one, col: 0 });
    await h.keys("$");
    expect(v.left).toBeGreaterThan(0);
    expect(h.frame()).toContain("anchovy");
    expect(h.app.geometry!.scrollbars.some((b) => b.block !== undefined)).toBe(false);
  });

  test("a Mermaid diagram too wide is drawn all the same, and scrolls as a code block does", async () => {
    await loadMermaid();
    const root = makeVault();
    const nodes = Array.from({ length: 9 }, (_, i) => `N${i}[node number ${i}]`).join(" --> ");
    writeFileSync(join(root, "wide.md"), `# Wide\n\n${"```"}mermaid\nflowchart LR\n  ${nodes}\n${"```"}\n`);
    const h = await harness({ root, open: "wide.md", width: 70, config: (c) => (c.ui.sidebar = false) });
    h.canvas();
    await loadMermaid();
    const v = h.app.view!;
    const layout = h.app.currentLayout(v);
    const row = layout.lines.findIndex((l) => l.spans.some((s) => s.text.includes("node number 0")));
    expect(row).toBeGreaterThan(0);
    expect(layout.lines[row]!.scroll).toBeDefined();
    expect(h.frame()).not.toContain("too wide to draw");
    h.app.moveCursor(v, { row, col: 0 });
    await h.keys("$");
    expect(h.app.code.offset(v, layout, row)).toBeGreaterThan(0);
    expect(h.frame()).toContain("node number 8");
    // Wrapping instead (the setting): its code, saying why, as before.
    await h.app.run("ui.code_wrap");
    h.canvas();
    await loadMermaid();
    expect(h.frame()).toContain("too wide to draw");
  });
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

describe("UI settings (space u)", () => {
  test("cursorline, line numbers, readable width, zen, urls", async () => {
    const h = await harness({ open: "notes/alpha.md", width: 200 });
    // The band on the cursor row is drawn, and goes: a cell past the text on that row.
    const band = () => {
      const p = h.app.geometry!.panes[0]!;
      const c = h.canvas();
      return c.styles[p.y + h.app.view!.cur.row - h.app.view!.top]![p.x + p.w - 3]?.bg ?? null;
    };
    const withBand = band();
    await h.keys("space", "u", "l");
    expect(h.app.ui.cursorline).toBe(false);
    expect(band()).not.toEqual(withBand);
    await h.keys("space", "u", "n");
    expect(h.app.ui.line_numbers).toBe(true);
    const pane = h.app.geometry!.panes[0]!;
    expect(h.canvas().line(pane.y).slice(pane.x, pane.textX).trim()).toBe("1");
    // The gutter in a shade of its own down the window, past the text's end too; the text's columns the page's.
    const c = h.canvas();
    const gutter = h.app.theme.roles.gutter.bg!;
    for (const y of [pane.y + 1, pane.y + pane.h - 1]) {
      for (let x = pane.x; x < pane.textX - 1; x++) expect(c.styles[y]![x]!.bg).toBe(gutter);
      // A column of the page's between it and the text.
      expect([c.line(y)[pane.textX - 1], c.styles[y]![pane.textX - 1]!.bg]).toEqual([" ", h.app.theme.bg]);
      expect(c.styles[y]![pane.textX]!.bg).not.toBe(gutter);
    }
    const full = h.app.currentLayout(h.app.view!).width;
    expect(full).toBeGreaterThan(100); // 200 columns: the toggle below has something to cap
    await h.keys("space", "u", "shift+w");
    expect(h.app.currentLayout(h.app.view!).width).toBeLessThanOrEqual(100);
    await h.keys("space", "u", "z");
    const f = h.frame();
    expect(f).not.toContain("READ");
    expect(f).not.toContain("▸ notes");
    await h.keys("space", "u", "r");
    expect(h.app.ui.urls).toBe(true);
    expect(h.frame()).toContain("<https://example.invalid>");
  });
  test("ASCII glyphs: the whole screen is ASCII, the chrome's own marks too (a console without Unicode)", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-ascii-"));
    mkdirSync(join(root, ".slipbox"));
    writeFileSync(
      join(root, "index.md"),
      "# Index\n\n- [the long one](a-rather-long-note-name-for-cutting-in-the-tab-strip.md)\n- [ ] a task\n\n> [!warning] Careful\n> text\n",
    );
    writeFileSync(join(root, "a-rather-long-note-name-for-cutting-in-the-tab-strip.md"), "# A\n\nplain\n");
    const h = await harness({ root, width: 60, height: 20, config: (c) => (c.render.glyphs = "ascii") });
    const ascii = (f: string, what: string) => {
      const odd = [...f].filter((ch) => ch.codePointAt(0)! > 0x7e && ch !== "\n");
      if (odd.length) throw new Error(`${what}: ${[...new Set(odd)].join(" ")}\n${f}`);
    };
    ascii(h.frame(), "at the start (watching or not, the frame)");
    for (let i = 0; i < 4; i++) h.app.openInNewTab("a-rather-long-note-name-for-cutting-in-the-tab-strip.md");
    h.app.openInNewTab("index.md");
    ascii(h.frame(), "a tab's name cut");
    await h.keys("tab"); // onto the link: the status line names it
    ascii(h.frame(), "a link under the cursor");
    await h.keys("space");
    ascii(h.frame(), "the leader's popup");
    await h.keys("escape", "space", "n", "v", "G", "A", "x", "escape");
    ascii(h.frame(), "a change unsaved");
    await h.keys("/", "t", "a", "s", "k");
    ascii(h.frame(), "the find row");
  });
  test("theme and glyph pickers preview live and esc restores", async () => {
    const h = await harness();
    await h.keys("space", "u", "t", "down");
    expect(h.app.theme.name).not.toBe("tokyo-night");
    await h.keys("escape");
    expect(h.app.theme.name).toBe("tokyo-night");
    await h.keys("space", "u", "g", "down");
    expect(h.app.glyphs.mode).toBe("ascii");
    await h.keys("escape");
    expect(h.app.glyphs.mode).toBe("unicode");
    await h.keys("space", "u", "u");
    expect(h.frame()).toContain("UI settings");
  });
  test("a session override is kept only while its config default is unchanged", async () => {
    const root = makeVault();
    const h = await harness({ root, config: (c) => (c.ui.restore_session = true) });
    await h.keys("space", "u", "n", "space", "u", "t", "down", "enter");
    const theme = h.app.ui.theme;
    h.app.quit();
    const again = await harness({ root, open: null, config: (c) => (c.ui.restore_session = true) });
    expect(again.app.ui.line_numbers).toBe(true);
    expect(again.app.ui.theme).toBe(theme);
    const changed = await harness({
      root,
      open: null,
      config: (c) => ((c.ui.restore_session = true), (c.ui.line_numbers = true)),
    });
    expect(changed.app.settings.uiOverrides.line_numbers).toBeUndefined();
    const flipped = await harness({
      root,
      open: null,
      config: (c) => ((c.ui.restore_session = true), (c.theme = "nord")),
    });
    expect(flipped.app.ui.theme).toBe("nord");
  });
});

describe("configuration: everything from config, and live reload", () => {
  test("keys, leader, pane keys, aliases and groups come from config", async () => {
    const h = await harness({
      open: "samples/handbook/operations-handbook.md",
      config: (c) => {
        c.input.leader = ",";
        c.keys = {
          x: "cursor.bottom",
          j: "",
          "leader z": "ui.zen",
          explorer: { o: "open" },
        } as unknown as Config["keys"];
        c.aliases = { bye: "app.quit" };
        c.groups = { "leader l": "LINKS" };
      },
    });
    await h.keys("x");
    expect(h.app.view!.cur.row).toBeGreaterThan(100);
    await h.keys("j");
    expect(h.app.transient!.text).toContain("not bound");
    await h.keys(",", "z");
    expect(h.app.ui.zen).toBe(true);
    const f = await h.keys(",");
    expect(f).toContain("+LINKS");
    await h.keys("escape", ":", "b", "y", "e", "enter");
    expect(h.quit.called).toBe(true);
  });
  test("unknown commands in [keys] and [aliases] are reported", async () => {
    const h = await harness({
      config: (c) => ((c.keys = { Q: "no.such" } as Config["keys"]), (c.aliases = { zz: "nope.cmd" })),
    });
    expect(h.app.messages.some((m) => m.text.includes("no.such"))).toBe(true);
    expect(h.app.messages.some((m) => m.text.includes("nope.cmd"))).toBe(true);
  });
  test("space v c reloads: new keys, theme and UI defaults apply live", async () => {
    const dir = mkdtempSync(join(sandbox, "cfg-"));
    const file = join(dir, "config.toml");
    writeFileSync(file, 'theme = "tokyo-night"\n');
    const h = await harness({ configFile: file });
    writeFileSync(file, 'theme = "nord"\n[ui]\nline_numbers = true\n[keys]\n"x" = "ui.zen"\n');
    await h.keys("space", "v", "c");
    expect(h.app.theme.name).toBe("nord");
    expect(h.app.ui.line_numbers).toBe(true);
    await h.keys("x");
    expect(h.app.ui.zen).toBe(true);
    expect(h.app.messages.some((m) => m.text.includes("config reloaded"))).toBe(true);
  });
  test("a reload's root_markers decide where roots are from then on (21.1)", async () => {
    const { rootMarkers, setRootMarkers } = await import("../src/core/workspace/vaults/vault.ts");
    const dir = mkdtempSync(join(sandbox, "cfg-"));
    const file = join(dir, "config.toml");
    writeFileSync(file, 'theme = "nord"\n');
    const h = await harness({ configFile: file });
    try {
      writeFileSync(file, '[walk]\nroot_markers = [".git", ".foam"]\n');
      await h.keys("space", "v", "c");
      expect(rootMarkers()).toEqual([".git", ".foam"]);
    } finally {
      setRootMarkers(null);
    }
  });
  test("[colors] overrides apply to the theme, the picker's preview and a live reload", async () => {
    const dir = mkdtempSync(join(sandbox, "cfg-"));
    const file = join(dir, "config.toml");
    writeFileSync(file, '[colors]\ntree_guide = "#445566"\n');
    const h = await harness({ configFile: file, config: (c) => (c.colors = { tree_guide: "#445566" }) });
    expect(h.app.theme.roles.tree_guide.fg).toBe("#445566");
    expect(h.app.settings.themeNamed("nord").theme.roles.tree_guide.fg).toBe("#445566"); // what the picker previews
    writeFileSync(file, '[colors]\ntree_guide = "#778899"\n');
    await h.keys("space", "v", "c");
    expect(h.app.theme.roles.tree_guide.fg).toBe("#778899");
  });
  test("saving a config file reloads it automatically", async () => {
    const dir = mkdtempSync(join(sandbox, "cfg-"));
    const file = join(dir, "config.toml");
    writeFileSync(file, "");
    const h = await harness({
      configFile: file,
      watch: true,
      config: (c) => ((c.watch.enabled = false), (c.watch.poll_ms = 100)),
    });
    try {
      await new Promise((r) => setTimeout(r, 30));
      writeFileSync(file, 'theme = "gruvbox-dark"\n');
      const end = Date.now() + 3000;
      while (h.app.theme.name !== "gruvbox-dark" && Date.now() < end) await new Promise((r) => setTimeout(r, 30));
      expect(h.app.theme.name).toBe("gruvbox-dark");
    } finally {
      h.app.quit();
    }
  });
  test("a broken config on reload is reported, never fatal", async () => {
    const dir = mkdtempSync(join(sandbox, "cfg-"));
    const file = join(dir, "config.toml");
    writeFileSync(file, 'theme = "nord"\n');
    const h = await harness({ configFile: file });
    writeFileSync(file, "theme = [unclosed\n");
    await h.keys(":", "c", "o", "n", "f", "i", "g", "enter");
    expect(h.app.messages.some((m) => m.level === "warn" && m.text.includes("config.toml"))).toBe(true);
  });
});

describe("scratch (space s)", () => {
  /** The line the window's cursor is on, from 1. */
  const lineAt = (h: Harness, v = h.app.view!) => lineOf(v, offsetOf(h.app, v));

  test("add the cursor row reference, add a selection: each shown floating, typing its note; esc then q back, a note left empty dropped; open, copy (#43, D229)", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    const path = h.app.scratch.location().path;
    await h.keys("space", "s", "a");
    const at = () => [h.app.floating?.kind, h.app.displayName(h.app.view!.buf), lineAt(h), h.app.view!.insert];
    expect(at()).toEqual(["scratch", "scratch", 3, true]);
    await h.keys("f", "i", "x", "escape", "q");
    expect([h.app.floating, h.app.view!.buf.key]).toEqual([null, "notes/alpha.md"]);
    expect(readFileSync(path, "utf8")).toBe("**At:** `notes/alpha.md:1`\n\n**Note:** fix\n");
    h.app.moveCursor(h.app.view!, { row: rowStarting(h, "Back to"), col: 0 });
    await h.keys("v", "e", "space", "s", "a");
    expect(readFileSync(path, "utf8")).toEndWith(
      "\n\n---\n\n**At:** `notes/alpha.md:9`\n\n```\nBack\n```\n\n**Note:** \n",
    );
    expect(at()).toEqual(["scratch", "scratch", 13, true]);
    // Copied with nothing said yet: the empty note isn't in it.
    await h.keys("escape", "space", "s", "y");
    expect(h.copied.at(-1)).toEndWith("```\nBack\n```\n");
    // Nothing said: esc (out of typing, then the scratch), and the empty note goes.
    await h.keys("escape");
    expect([h.app.floating, h.app.view!.buf.key]).toEqual([null, "notes/alpha.md"]);
    const text = readFileSync(path, "utf8");
    expect(text).toBe(
      "**At:** `notes/alpha.md:1`\n\n**Note:** fix\n\n---\n\n**At:** `notes/alpha.md:9`\n\n```\nBack\n```\n",
    );
    await h.keys("space", "s", "s");
    expect([h.app.floating?.kind, h.app.displayName(h.app.view!.buf)]).toEqual(["scratch", "scratch"]);
    await h.keys("space", "s", "y");
    expect(h.copied.at(-1)).toBe(text);
  });

  test("the floating scratch: empty, it opens too, in the middle, three quarters of the screen; typed in, saved as it closes (#43)", async () => {
    const h = await harness({ open: "notes/alpha.md", width: 120, height: 40 });
    const path = h.app.scratch.location().path;
    expect(existsSync(path)).toBe(false);
    await h.keys("space", "s", "s");
    expect(h.app.floating?.kind).toBe("scratch");
    h.frame();
    const box = h.app.geometry!.floating!;
    const pane = h.app.geometry!.panes.find((p) => p.view === h.app.tabView)!;
    // Its margin taken off: the box itself.
    const [y, rows] = [box.y + 1, box.h - 2];
    expect(Math.abs(y - pane.y - (pane.y + pane.h - (y + rows)))).toBeLessThanOrEqual(3);
    expect([box.w - 4, rows >= Math.floor((pane.h * 2) / 3)]).toEqual([90, true]);
    expect(h.frame()).toContain("esc · q closes, saved");
    await h.keys("i", "i", "d", "e", "a", "escape");
    expect(h.app.view!.buf.dirty).toBe(true);
    await h.keys("q");
    expect([h.app.floating, readFileSync(path, "utf8")]).toEqual([null, "idea"]);
  });

  test("the floating scratch is a window like any: rendered, the lens, ctrl+k; esc leaves the lens and a find first, and closes it last (#43)", async () => {
    // The lens, as slipbox's own default has it (the harness edits in source mode).
    const h = await harness({
      open: "notes/alpha.md",
      width: 120,
      height: 40,
      config: (c) => (c.editor.edit_in = "live"),
    });
    const path = h.app.scratch.location().path;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "# Ideas\n\nfirst idea\n\n- a list item\n");
    await h.keys("space", "s", "s");
    const status = () => h.frame().split("\n").at(-1)!;
    expect([h.app.floating?.kind, status()]).toEqual(["scratch", expect.stringMatching(/^ READ /)]);
    expect(h.frame()).toContain("▌ Ideas");
    // The lens, typing in it: esc stops typing, esc again leaves the lens, the scratch still open.
    await h.keys("j", "j", "i");
    expect(status()).toMatch(/^ READ·LENS /);
    await h.keys("i");
    expect(status()).toMatch(/^ (?:SOURCE|READ·LENS) │ INSERT /);
    await h.keys("escape");
    expect([h.app.floating?.kind, status()]).toEqual(["scratch", expect.stringMatching(/^ READ·LENS /)]);
    await h.keys("escape");
    expect([h.app.floating?.kind, status()]).toEqual(["scratch", expect.stringMatching(/^ READ /)]);
    // A find: esc ends it first.
    await h.keys("/", "i", "d", "e", "a", "enter");
    expect(h.app.view!.find).not.toBeNull();
    await h.keys("escape");
    expect([h.app.floating?.kind, h.app.view!.find]).toEqual(["scratch", null]);
    // ctrl+k: its markdown, still floating; esc, with nothing else to leave, closes it.
    await h.keys("ctrl+k");
    expect([h.app.floating?.kind, status()]).toEqual(["scratch", expect.stringMatching(/^ SOURCE /)]);
    await h.keys("escape");
    expect([h.app.floating, h.app.view!.buf.key]).toEqual([null, "notes/alpha.md"]);
  });

  test("a capture in the lens: typing in it at once; esc leaves the typing, q closes the scratch, saved (D229)", async () => {
    const h = await harness({ open: "notes/alpha.md", width: 120, config: (c) => (c.editor.edit_in = "live") });
    const status = () => h.frame().split("\n").at(-1)!;
    await h.keys("space", "s", "a");
    expect([h.app.floating?.kind, status()]).toEqual([
      "scratch",
      expect.stringMatching(/^ (?:SOURCE|READ·LENS) │ INSERT /),
    ]);
    // One message, saying how to go on: not the lens's own.
    expect(h.app.toasts.map((m) => m.text)).toEqual(["added to the scratch; add a note, esc then q closes it"]);
    await h.keys("d", "o", "escape");
    expect([h.app.floating?.kind, status()]).toEqual(["scratch", expect.stringMatching(/^ READ·LENS /)]);
    await h.keys("q");
    expect([h.app.floating, readFileSync(h.app.scratch.location().path, "utf8")]).toEqual([
      null,
      "**At:** `notes/alpha.md:1`\n\n**Note:** do\n",
    ]);
  });

  test("[capture] open_in = right: the scratch on the right; a capture goes to it, typing its note; q closes it, saved, an empty note dropped; space s r; the UI settings switch it, kept (#43, D229)", async () => {
    const root = makeVault();
    const h = await harness({
      root,
      open: "notes/alpha.md",
      config: (c) => ((c.capture.open_in = "right"), (c.ui.restore_session = true)),
    });
    // A long scratch: what's added goes below the window's last row.
    const path = h.app.scratch.location().path;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "x\n\n".repeat(40));
    // A split stacked once and closed since: the scratch goes on the right all the same.
    const t = h.app.tab!;
    Object.assign(t, { orientation: "stacked" });
    await h.keys("space", "s", "s");
    expect([h.app.floating, t.views.length, t.orientation, t.active]).toEqual([null, 2, "side", 1]);
    expect(h.app.displayName(h.app.view!.buf)).toBe("scratch");
    // From the note beside it: the cursor goes to the entry on the right, typing its note, in sight.
    t.active = 0;
    await h.keys("space", "s", "a");
    expect([h.app.floating, t.active, lineAt(h), h.app.view!.insert]).toEqual([null, 1, 85, true]);
    expect(h.frame()).toContain("notes/alpha.md:1");
    await h.keys("w", "h", "y", "escape");
    // The next, from the note: what was typed saved first, the entry after it.
    t.active = 0;
    await h.keys("j", "space", "s", "a");
    expect([t.active, lineAt(h)]).toEqual([1, 91]);
    // Nothing said, and another: the note left empty goes as it's added.
    await h.keys("escape");
    t.active = 0;
    await h.keys("space", "s", "a");
    expect(readFileSync(path, "utf8").match(/\*\*Note:\*\*.*/g)).toEqual(["**Note:** why", "**Note:** "]);
    // Closed with q, nothing said this time either: that note goes too, the rest saved.
    await h.keys("escape", "q");
    expect([t.views.length, h.app.view!.buf.key]).toEqual([1, "notes/alpha.md"]);
    const entry = "\\*\\*At:\\*\\* `notes\\/alpha\\.md:\\d+`\\n";
    expect(readFileSync(path, "utf8")).toMatch(
      new RegExp(`\\n\\*\\*Note:\\*\\* why\\n\\n---\\n\\n${entry}\\n---\\n\\n${entry}$`),
    );
    // The UI settings: floating now, kept from one start to the next; space s r, on the right all the same.
    await h.keys("space", "u", "u");
    expect(h.frame()).toMatch(/Scratch opens +on the right/);
    await h.keys("escape");
    await h.app.run("ui.scratch_in");
    await h.keys("space", "s", "s");
    expect(h.app.floating?.kind).toBe("scratch");
    await h.keys("q", "space", "s", "r");
    expect([h.app.floating, t.views.length, h.app.displayName(h.app.view!.buf)]).toEqual([null, 2, "scratch"]);
    // In a split already: its other window takes the scratch.
    await h.keys("q");
    h.app.windows.split("side");
    t.active = 0;
    await h.keys("space", "s", "r");
    expect([t.views.length, t.active, t.views[0]!.buf.key, h.app.displayName(t.views[1]!.buf)]).toEqual([
      2,
      1,
      "notes/alpha.md",
      "scratch",
    ]);
    h.app.quit();
    const config = (c: Config) => ((c.capture.open_in = "right"), (c.ui.restore_session = true));
    const again = await harness({ root, open: "notes/alpha.md", config });
    expect(again.app.ui.scratch_in).toBe("float");
    // A value saved that isn't one: dropped, the config's taken.
    const { loadSession, saveSession } = await import("../src/core/workspace/session/position.ts");
    again.app.quit();
    const s = loadSession(again.app.loc)!;
    saveSession(again.app.loc, { ...s, ui: { ...s.ui, scratch_in: { value: "bottom", base: "right" } } });
    const bogus = await harness({ root, open: "notes/alpha.md", config });
    expect(bogus.app.ui.scratch_in).toBe("right");
  });
  test("the scratch open never moves the explorer's view (VV-D5): it lives in slipbox's own state folder", async () => {
    const h = await harness();
    h.app.scratch.capture("x");
    await h.app.run("scratch.open");
    expect(h.app.view!.buf.abs.startsWith(`${h.root}/`)).toBe(false); // the default place: outside the root
    expect(h.app.explorer.top).toBe(h.root);
    // Nothing outside the vault listed: its rows are its own, those its walk leaves out (VV-D8) among them.
    expect(h.app.explorer.rows().every((r) => h.app.explorer.rowAbs(r).startsWith(`${h.root}/`))).toBe(true);
  });
});

describe("external changes (5.3, 5.4) and anchoring (3.5)", () => {
  test("a clean buffer reloads silently and the cursor keeps its place", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", height: 20 });
    await h.keys("]", "]", "]", "]");
    const before = rowText(h);
    const file = join(h.root, "samples", "handbook", "operations-handbook.md");
    writeFileSync(file, `# Inserted by an agent\n\n${"A new paragraph.\n\n".repeat(20)}${readFileSync(file, "utf8")}`);
    h.app.watch.applyChanges({
      changes: [{ rel: "samples/handbook/operations-handbook.md", kind: "changed", isNote: true }],
      rescan: false,
    });
    h.frame();
    expect(rowText(h)).toBe(before);
    expect(h.frame()).toContain("↻");
  });
  test("a new note turns an unresolved link resolved; deletion is surfaced", async () => {
    const h = await harness();
    const role = () =>
      h.app
        .currentLayout(h.app.view!)
        .lines.flatMap((l) => l.spans)
        .find((s) => s.text.includes("missing-note"))!.role;
    expect(role()).toBe("link_unresolved");
    writeFileSync(join(h.root, "missing-note.md"), "# now exists\n");
    h.app.watch.applyChanges({ changes: [{ rel: "missing-note.md", kind: "created", isNote: true }], rescan: false });
    expect(role()).toBe("link");
    await h.app.run("note.open missing-note.md");
    rmSync(join(h.root, "missing-note.md"));
    h.app.watch.applyChanges({ changes: [{ rel: "missing-note.md", kind: "deleted", isNote: true }], rescan: false });
    expect(h.frame()).toContain("deleted on disk");
  });
  test("the real watcher: write, temp-and-rename, create, delete", async () => {
    const root = makeVault();
    const h = await harness({
      root,
      open: "notes/beta.md",
      watch: true,
      config: (c) => ((c.watch.debounce_ms = 30), (c.watch.poll_ms = 100)),
    });
    const until = async (pred: () => boolean) => {
      const end = Date.now() + 25_000;
      while (!pred() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
    };
    try {
      writeFileSync(join(root, "notes", "beta.md"), "# Beta v2\n");
      await until(() => h.app.view!.buf.source === "# Beta v2\n");
      expect(h.app.view!.buf.source).toBe("# Beta v2\n");
      writeFileSync(join(root, "notes", ".beta.tmp"), "# Beta v3\n");
      renameSync(join(root, "notes", ".beta.tmp"), join(root, "notes", "beta.md"));
      await until(() => h.app.view!.buf.source === "# Beta v3\n");
      expect(h.app.view!.buf.source).toBe("# Beta v3\n");
      mkdirSync(join(root, "fresh"));
      writeFileSync(join(root, "fresh", "new.md"), "# New\n");
      await until(() => h.app.graph.notes.has("fresh/new.md"));
      expect(h.app.graph.notes.has("fresh/new.md")).toBe(true);
      rmSync(join(root, "notes", "beta.md"));
      await until(() => h.app.view!.buf.deleted);
      expect(h.app.view!.buf.deleted).toBe(true);
    } finally {
      h.app.quit();
    }
  });
});

describe("state (3.4, 3.15)", () => {
  test("the cursor position per note survives leaving and returning", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", height: 20 });
    await h.keys("ctrl+d", "ctrl+d", "w");
    const cur = { ...h.app.view!.cur };
    await h.app.run("note.open index.md");
    await h.app.run("note.open samples/handbook/operations-handbook.md");
    h.frame();
    expect(h.app.view!.cur).toEqual(cur);
  });
  test("a re-wrap keeps the cursor's source line, even when no row starts on it", async () => {
    // A paragraph of short source lines renders as one row: lines 4–8 start no row of their own.
    const root = makeVault();
    writeFileSync(
      join(root, "p.md"),
      `# P\n\n${Array.from({ length: 8 }, (_, i) => `line ${i + 1}`).join("\n")}\n\nafter\n`,
    );
    const h = await harness({ root, open: "p.md", width: 120 });
    const v = h.app.view!;
    v.curAnchor = { anchor: { heading: null, headingIndex: 0, offset: 5, line: 6 }, sub: 0, col: 0 };
    v.layoutKey = ""; // as when the width changes
    h.frame();
    expect(v.curAnchor.anchor.line).toBe(6); // not the next row's line, which would stick
  });
  test("session restore: tabs, splits with orientation, cursors", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    await h.keys("ctrl+t", "c", "ctrl+w", "s", "j", "j");
    const cur = { ...h.app.view!.cur };
    h.app.quit();
    const again = await harness({ root, open: null, config: (c) => (c.ui.restore_session = true) });
    expect(again.app.tabs).toHaveLength(2);
    expect(again.app.tabs[1]!.views).toHaveLength(2);
    expect(again.app.tabs[1]!.orientation).toBe("stacked");
    expect(again.app.view!.cur).toEqual(cur);
  });
  test("ctrl+q quits and saves; q alone never quits", async () => {
    const h = await harness();
    await h.keys("q");
    expect(h.quit.called).toBe(false);
    await h.keys("ctrl+q");
    expect(h.quit.called).toBe(true);
  });
});

describe("OpenTUI end to end", () => {
  test("real key parsing and the frame-buffer adapter", async () => {
    const { createTestRenderer } = await import("@opentui/core/testing");
    const { AppRenderable } = await import("../src/tui/shell/terminal/opentui.ts");
    const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({ width: 100, height: 24 });
    const root = makeVault();
    const config: Config = structuredClone(DEFAULT_CONFIG);
    config.ui.restore_session = false;
    config.lint.enabled = "off";
    config.render.glyphs = "unicode";
    const loc = locateVault({ root });
    const app = new App({
      loc,
      config,
      graph: openGraph(loc, config, false),
      host: { requestRender: () => renderer.requestRender(), osc52: () => true, quit() {} },
      open: "index.md",
      watch: false,
    });
    renderer.root.add(new AppRenderable(renderer, (c) => app.draw(c)));
    renderer.keyInput.on("keypress", (k) => void app.input.handleKey(keyName(k)));
    await renderOnce();
    expect(captureCharFrame()).toContain("Home");
    const wait = () => new Promise((r) => setTimeout(r, 20));
    // The test renderer has no kitty protocol, so ctrl+tab would arrive as tab: use the leader.
    for (const k of [" ", "l", "n"]) {
      mockInput.pressKey(k);
      await wait();
    }
    mockInput.pressEnter();
    await wait();
    await renderOnce();
    expect(app.view!.buf.rel).toBe("notes/alpha.md");
    mockInput.pressKey(" ");
    await wait();
    await renderOnce();
    expect(captureCharFrame()).toContain("+links");
    renderer.destroy();
  });
});

describe("review cycle 1 (TUI)", () => {
  test("the status chip shows the key waiting for its character: f, t, 2f, r, dT — never r for all", async () => {
    const h = await harness({ open: "index.md", width: 120, height: 30 });
    for (const [keys, chip] of [
      [["f"], " f "],
      [["shift+t"], " T "],
    ] as const) {
      await h.keys(...keys);
      expect(statusRow(h.frame())).toContain(`NORMAL ${chip}`);
      await h.keys("escape");
    }
    await h.keys("space", "n", "v");
    for (const [keys, chip] of [
      [["r"], " r "],
      [["2", "f"], " 2f "],
      [["d", "shift+t"], " dT "],
    ] as const) {
      await h.keys(...keys);
      expect(statusRow(h.frame())).toContain(`NORMAL ${chip}`);
      await h.keys("escape");
    }
  });
  test("session restore keeps the scroll position, with the breadcrumb on", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "samples/handbook/operations-handbook.md", width: 160, height: 40 });
    for (let i = 0; i < 60; i++) await h.keys("j");
    h.frame();
    const top = h.app.view!.top;
    expect(top).toBeGreaterThan(0);
    h.app.quit();
    const again = await harness({
      root,
      open: null,
      width: 160,
      height: 40,
      config: (c) => (c.ui.restore_session = true),
    });
    again.frame();
    expect(again.app.view!.top).toBe(top);
  });
  test("resize mode: every step changes the drawn width", async () => {
    const h = await harness({ width: 100, height: 30, config: (c) => (c.ui.outline = true) });
    await h.app.run("explorer.cycle");
    await h.app.run("explorer.cycle"); // focus it
    for (let i = 0; i < 15; i++) await h.app.run("window.wider");
    await h.keys("escape");
    await h.app.run("outline.cycle");
    let last = h.app.panels.outlineWidth();
    for (let i = 0; i < 3; i++) {
      await h.app.run("window.narrower");
      h.frame();
      expect(h.app.panels.outlineWidth()).toBeLessThan(last);
      last = h.app.panels.outlineWidth();
    }
  });
  test("popups: the bottom-right corner is under the top-right one", async () => {
    const h = await harness({ width: 60, height: 20 });
    await h.keys("space", "?");
    const rows = h.frame().split("\n");
    const top = rows.findIndex((r) => r.includes("┐"));
    const bottom = rows.findIndex((r, i) => i > top && r.includes("┘"));
    expect(rows[bottom]!.lastIndexOf("┘")).toBe(rows[top]!.lastIndexOf("┐"));
  });
});

describe("review cycle 2 (TUI navigation)", () => {
  const click = (h: Harness, x: number, y: number) => {
    h.app.mouse.handle({ type: "down", x, y, button: 0 });
    h.app.mouse.handle({ type: "up", x, y, button: 0 });
  };
  test("a click clears a half-typed sequence; a tab click focuses the note", async () => {
    const h = await harness({ open: "index.md", width: 120, height: 30 });
    await h.keys("space");
    expect(h.app.pending.length).toBe(1);
    const pane = (h.frame(), h.app.geometry!.panes[0]!);
    // On the note beside the which-key window (a click on one of its entries picks it).
    click(h, pane.x + pane.w - 2, pane.y + 1);
    expect(h.app.pending.length).toBe(0);
    await h.keys("ctrl+t", "c");
    h.app.panels.showSidebar(true);
    h.app.region = "sidebar";
    h.frame();
    const tab = h.app.geometry!.tabs[0]!;
    click(h, tab.x + 1, tab.y);
    expect(h.app.region as string).toBe("content");
  });
});

describe("review cycle 3 (TUI)", () => {
  test(":vs <note> and :tabnew <note> open that note; an argument a command doesn't take is said", async () => {
    const h = await harness({ open: "index.md", width: 160, height: 40 });
    await h.keys(":", ...[..."vs"], "space", ...[..."notes/alpha"], "enter");
    expect(h.app.tab!.views.map((x) => x.buf.rel)).toContain("notes/alpha.md");
    await h.keys(":", ...[..."tabnew"], "space", ...[..."notes/beta"], "enter");
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
    await h.keys(":", "w", "space", ...[..."zzqqxx"], "enter");
    expect(h.app.messages.at(-1)!.text).toContain("takes no argument");
  });
  test(
    "joints: a tab separator over a border is a cross",
    async () => {
      // Somewhere across these widths a tab's separator lands on the outline's border column.
      let checked = 0;
      for (let width = 100; width <= 160; width++) {
        const h = await harness({ open: "index.md", width, height: 12, config: (c) => (c.ui.outline = true) });
        for (const n of ["notes/alpha.md", "notes/beta.md", "crlf.md", "bom.md"]) h.app.openInNewTab(n);
        const rows = h
          .frame()
          .split("\n")
          .map((r) => [...r]);
        rows.forEach((r, y) => {
          r.forEach((ch, x) => {
            // A tee pointing down with a line above it should have been a cross.
            if ((ch === "┬" || ch === "┳") && y > 1 && "│┃┼╋├┤┣┫┬┳".includes(rows[y - 1]![x] ?? " "))
              throw new Error(`${width}: ${ch} under a line at ${x},${y}`);
            if (ch === "┬" || ch === "┳") checked++;
          });
        });
      }
      expect(checked).toBeGreaterThan(0);
    },
    TEST_BUDGETS.layoutMatrix,
  );
});

describe("review cycle 3 (config in the TUI)", () => {
  test("a typo saved mid-edit keeps the theme, keys and picked settings; :toString isn't an alias", async () => {
    const root = makeVault();
    const cfg = join(root, "user.toml");
    writeFileSync(cfg, 'theme = "nord"\n[keys]\n"leader z" = "ui.zen"\n');
    const h = await harness({ root, configFile: cfg });
    h.app.settings.reload();
    await h.app.run("theme.set dracula");
    writeFileSync(cfg, 'theme = "nord"\n[keys\n');
    h.app.settings.reload();
    expect(h.app.ui.theme).toBe("dracula");
    await h.keys("space", "z");
    expect(h.app.ui.zen).toBe(true);
    await h.keys(":", ...[..."toString"], "enter");
    expect(h.app.messages.some((m) => m.text.includes("is not a function"))).toBe(false);
  });
  test("cancelling a picker after a reload keeps the reloaded setting", async () => {
    const root = makeVault();
    const cfg = join(root, "user.toml");
    writeFileSync(cfg, "");
    const h = await harness({ root, configFile: cfg });
    await h.keys("space", "u", "t", "j");
    writeFileSync(cfg, 'theme = "nord"\n');
    h.app.settings.reload();
    await h.keys("escape");
    expect(h.app.theme.name).toBe("nord");
  });
});

describe("review cycle 4 (TUI, a hostile vault's names)", () => {
  test("names with bidi overrides, C1 and escapes never put a control on screen", async () => {
    const root = makeVault();
    const bad = "n-bidi\u202edcba\u202c\u200f\u2028-\u009b31m-\x1b]0;PWNED\x07.md";
    writeFileSync(join(root, bad), "# Bad\u202e name\n\n[alpha](notes/alpha.md)\n");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    writeFileSync(join(root, ".slipbox", "config.toml"), '[groups]\n"leader z" = "\u202eevil"\n');
    const h = await harness({ root, open: bad, width: 140, height: 40 });
    const shots = [h.frame()];
    await h.keys("space"); // which-key, with the vault's group label
    shots.push(h.frame());
    await h.keys("escape", "space", "space"); // the switcher lists it by name
    shots.push(h.frame());
    await h.keys("escape");
    await h.app.run("note.open notes/alpha.md");
    await h.app.run("backlinks.open");
    shots.push(h.frame());
    for (const s of shots) {
      expect(UNSAFE.test(s.replace(/\n/g, ""))).toBe(false);
      expect(s).not.toContain("PWNED");
    }
    expect(shots.join("")).toContain("n-bidi");
  });
});

describe("review cycle 5 (TUI, behaviour no test had pinned)", () => {
  test("the replace row steps between matches (ctrl+n, ctrl+p); :glyphs; the scratch asks before it clears; reindex", async () => {
    const root = makeVault();
    writeFileSync(join(root, "r.md"), "aa\nb\naa\nb\naa\n");
    const h = await harness({ root, open: "r.md" });
    await h.keys("ctrl+h", "a", "a", "tab");
    const o = h.app.overlay as { replace?: { current: number; total: number } };
    expect(o.replace?.total).toBe(3);
    const first = o.replace!.current;
    await h.keys("ctrl+n");
    expect(o.replace!.current).toBe((first + 1) % 3);
    await h.keys("ctrl+p");
    expect(o.replace!.current).toBe(first);
    await h.keys("escape", "escape");
    await h.keys(":", ..."glyphs", "space", ..."ascii", "enter");
    expect(h.app.glyphs.mode).toBe("ascii");
    const scratch = h.app.scratch.location().path;
    mkdirSync(dirname(scratch), { recursive: true });
    writeFileSync(scratch, "keep me\n");
    await h.app.run("scratch.clear");
    await h.keys("n");
    expect(readFileSync(scratch, "utf8")).toBe("keep me\n");
    expect(h.app.overlay).toBeNull();
    await h.app.run("scratch.clear");
    await h.keys("enter"); // not an answer: the question stays
    expect(h.app.overlay?.kind).toBe("prompt");
    expect(readFileSync(scratch, "utf8")).toBe("keep me\n");
    await h.keys("escape");
    await h.app.run("scratch.clear");
    await h.keys("y");
    expect(existsSync(scratch) ? readFileSync(scratch, "utf8") : "").toBe("");
    writeFileSync(join(root, "late.md"), "# Late\n");
    await h.keys("space", "v", "r");
    expect(h.app.graph.notes.has("late.md")).toBe(true);
  });
});

describe("review cycle 5 (TUI journeys: narrow screens)", () => {
  test("which-key on a narrow screen: every entry's click area is inside the box; a hover keeps its border", async () => {
    const h = await harness({ width: 40, height: 12 });
    await h.keys("space");
    const wk = h.app.geometry!.hot.filter((r) => r.id.startsWith("wk:"));
    expect(wk.length).toBeGreaterThan(0);
    const right = (y: number) => h.canvas().rows[y]!.lastIndexOf("│"); // the box's right border
    for (const r of wk) expect(r.x + r.w).toBeLessThanOrEqual(right(r.y));
    const last = wk.reduce((a, b) => (a.x + a.w > b.x + b.w ? a : b));
    const border = right(last.y);
    h.app.mouse.handle({ type: "move", x: last.x, y: last.y, button: 0 });
    h.frame();
    expect(h.canvas().rows[last.y]![border]).toBe("│");
  });
});

describe("review cycle 5 (TUI journeys: the status line when narrow)", () => {
  test("a kept conflict at 40 columns: the marker shrinks, the position and the note's name stay", async () => {
    const root = makeVault();
    mkdirSync(join(root, "deep", "folder"), { recursive: true });
    const file = join(root, "deep", "folder", "logbook.md");
    writeFileSync(file, "one\n");
    const h = await harness({ root, open: "deep/folder/logbook.md", width: 40, height: 12 });
    const v = h.app.view!;
    await h.keys("space", "n", "v", "shift+a", "!", "escape");
    writeFileSync(file, "theirs\n");
    const t = Date.now() / 1000 + 5;
    (await import("node:fs")).utimesSync(file, t, t);
    h.app.watch.reloadBuffer(v.buf);
    await h.keys("k"); // keep mine
    expect(v.buf.conflictKept).toBe(true);
    const status = statusRow(h.frame());
    expect(status).toMatch(/L\d+:\d+/);
    expect(status).toContain("logbook");
    expect(status).toContain("⚠");
  });
});

describe("review cycle 5 (TUI journeys: a resize round trip)", () => {
  const drawAt = (h: Harness, w: number, ht: number) => h.app.draw(new TextCanvas(w, ht));
  test("the window's top comes back to the same row: a wrapped paragraph's, a table's", async () => {
    const h = await harness({ open: "samples/logs/observing-log-2026.md", width: 130, height: 36 });
    const v = h.app.view!;
    for (const start of [0, 7, 19, 33, 51]) {
      h.app.views.scrollBy(v, start - v.top, false);
      drawAt(h, 130, 36);
      const top = v.top;
      drawAt(h, 130, 20);
      drawAt(h, 130, 36);
      expect(v.top).toBe(top);
      drawAt(h, 100, 36);
      drawAt(h, 130, 36);
      expect(v.top).toBe(top);
    }
  });
  test("a cursor on a table's bottom border stays there through a resize", async () => {
    const h = await harness({ open: "samples/scratch/wrap-probe.md", width: 130, height: 40 });
    const v = h.app.view!;
    const rows = h.app.currentLayout(v).lines.map((l) => l.spans.map((s) => s.text).join(""));
    const bottom = rows.findLastIndex((r) => r.startsWith("└"));
    expect(bottom).toBeGreaterThan(0);
    h.app.moveCursor(v, { row: bottom, col: 0 });
    drawAt(h, 90, 40);
    drawAt(h, 130, 40);
    expect(v.cur.row).toBe(bottom);
  });
});

describe("files beyond notes (16.3–16.5)", () => {
  const setup = async () => {
    const root = makeVault();
    mkdirSync(join(root, "cfg"), { recursive: true });
    writeFileSync(join(root, "cfg", "app.toml"), '[editor]\nfont = "x" # a comment\n');
    writeFileSync(join(root, "run.py"), 'def main():\n    print("hi")  # [[alpha]] in a comment\n');
    writeFileSync(join(root, "blob.dat"), "\u0000\u0001binary");
    writeFileSync(join(root, "links-out.md"), "# L\n\nSee [the config](cfg/app.toml) and [run.py](run.py).\n");
    return root;
  };
  test("the explorer lists data files by default; `a` shows every text file; binary never", async () => {
    const h = await harness({ root: await setup(), width: 120 });
    await h.keys("space", "e"); // focus the explorer
    const paths = () => h.app.explorer.rows().map((r) => r.path);
    h.app.explorer.expanded.add("cfg");
    h.app.explorer.invalidateTree();
    expect(paths()).toContain("cfg/app.toml");
    expect(paths()).not.toContain("run.py");
    const row = h.app.explorer.rows().find((r) => r.path === "cfg/app.toml")!;
    expect(row.group).toBe("data");
    expect(h.frame()).toContain("app.toml"); // shown with its extension
    await h.keys("a");
    expect(paths()).toContain("run.py");
    expect(paths()).not.toContain("blob.dat");
    await h.keys("a");
    expect(paths()).not.toContain("run.py");
  });
  test("a code file opens in SOURCE by default, highlighted, with READ available; a note after it renders", async () => {
    // Code as [render] code = "source" opens it (Python has the code view by default, 24.x).
    const h = await harness({ root: await setup(), config: (c) => (c.render.code = false) });
    await h.app.run("note.open links-out.md");
    const v = h.app.view!;
    const links = h.app.currentLayout(v).links;
    const py = links.find((l) => l.target === "run.py")!;
    h.app.moveCursor(v, { row: py.line, col: py.col });
    await h.keys("enter");
    expect(v.buf.rel).toBe("run.py");
    expect(v.source).toBe(true);
    const layout = h.app.currentLayout(v);
    expect(layout.lines[0]!.spans.some((s) => s.role === "syn_keyword")).toBe(true); // `def`
    expect(layout.headings).toEqual([]); // `# …` in Python is no heading
    await h.keys("space", "n", "v"); // opening default does not disable READ
    expect(v.source).toBe(false);
    expect(h.app.isCodeDocument(v.buf)).toBe(true);
    await h.app.run("history.back");
    expect(v.buf.rel).toBe("links-out.md");
    expect(v.source).toBe(false); // the note renders again
  });
  test("the background index parses a big note on other threads: here, its parsed chunks are only put together (15.1)", async () => {
    const { BACKGROUND_PARSE } = await import("../src/tui/documents/buffers/buffer.ts");
    const { noteChunks } = await import("../src/core/documents/markdown/parse.ts");
    const root = makeVault();
    const h = await harness({ root });
    // Written after the harness's first build, with words of its own: no parse of it is cached anywhere. Twice the
    // size that goes to the threads, in chunks enough for each.
    const own = randomBytes(6).toString("hex");
    const line = (i: number) => `Line ${i} ${own} with [a link](alpha.md) and words enough.\n`;
    const count = Math.ceil((2 * BACKGROUND_PARSE) / line(0).length);
    const text = Array.from({ length: count }, (_, i) => line(i)).join("\n");
    writeFileSync(join(root, "notes", "big.md"), text);
    h.app.graph.build(true, "lazy"); // every note unparsed, as at a cold start
    expect(h.app.graph.pendingCount).toBeGreaterThan(1);
    // Each parse of the big note on this thread: how many of its chunks it had to parse itself, or "whole". What this
    // thread does is counted, not timed: a loaded machine stretches every slice (the timings are the benchmark's).
    const g = h.app.graph;
    const big = "notes/big.md";
    const here: (number | "whole")[] = [];
    const entry = g.entry.bind(g);
    g.entry = (rel, chunks) => {
      if (rel === big && g.unparsedOver(0).some((f) => f.rel === big))
        here.push(chunks ? noteChunks(text).filter((c) => !chunks.chunks.has(c.text)).length : "whole");
      return entry(rel, chunks);
    };
    h.app.watch.indexInBackground();
    await h.app.watch.whenIndexed(); // however long the threads take
    expect(g.backlinks("notes/alpha.md").filter((b) => b.from === big)).toHaveLength(count);
    expect(here).toEqual([0]); // once, every chunk of it parsed on another thread
  });
  test("a data file opens from a link, rendered; edits save; a binary file doesn't open", async () => {
    const root = await setup();
    const h = await harness({ root });
    await h.app.run("note.open links-out.md");
    const v = h.app.view!;
    const cfg = h.app.currentLayout(v).links.find((l) => l.target === "cfg/app.toml")!;
    h.app.moveCursor(v, { row: cfg.line, col: cfg.col });
    await h.keys("enter");
    expect(v.buf.rel).toBe("cfg/app.toml");
    expect(v.source).toBeFalsy(); // rendered (16.11)
    await h.keys(
      "space",
      "n",
      "v",
      "G",
      "o",
      "w",
      "r",
      "a",
      "p",
      "space",
      "=",
      "space",
      "t",
      "r",
      "u",
      "e",
      "escape",
      "ctrl+s",
    );
    expect(readFileSync(join(root, "cfg", "app.toml"), "utf8")).toBe('[editor]\nfont = "x" # a comment\nwrap = true\n');
    expect(h.app.buffer("blob.dat")).toBeNull();
    expect(h.app.messages.at(-1)!.text).toContain("binary");
    // Named like text, binary inside: a NUL in the first 8 KB (as git decides) isn't opened; one
    // past them is the file's own business.
    writeFileSync(join(root, "dump.txt"), `head\u0000${"x".repeat(100)}`);
    writeFileSync(join(root, "late.txt"), `${"x\n".repeat(5000)}\u0000`);
    expect(h.app.buffer("dump.txt")).toBeNull();
    expect(h.app.messages.at(-1)!.text).toBe("dump.txt holds binary bytes; slipbox opens text");
    expect(h.app.buffer("late.txt")).not.toBeNull();
    // A symlink in the vault leading out of it isn't a file of the vault until you follow it (VV-D6): nothing outside
    // is read through it (the CLI refuses it too). One leading to a note inside opens.
    const outside = join(realpathSync(mkdtempSync(join(tmpdir(), "slipbox-outside-"))), "secret.md");
    writeFileSync(outside, "# Secret\n");
    symlinkSync(outside, join(root, "out.md"));
    symlinkSync(join(root, "links-out.md"), join(root, "in.md"));
    expect(h.app.buffer("out.md")).toBeNull();
    expect(h.app.messages.at(-1)!.text).toBe(
      `${tildePath(join(root, "out.md"))} → ${tildePath(outside)} isn't followed — open it to choose`,
    );
    expect(h.app.buffer("in.md")?.source).toBe(readFileSync(join(root, "links-out.md"), "utf8"));
  });
  test("the switcher lists the files the explorer shows", async () => {
    const h = await harness({ root: await setup() });
    await h.keys("ctrl+p");
    const o = h.app.overlay as { items: { data: unknown }[] };
    const data = o.items.map((i) => i.data);
    expect(data).toContain("cfg/app.toml");
    expect(data).not.toContain("run.py");
  });
});

describe("data files render as documents (16.11–16.14)", () => {
  const TOML =
    '# app settings\ntheme = "nord"   # the default\n\n[editor]\ncommand = "nvim"\nautosave_ms = 30000\n\n[ui]\nwrap = true\n';
  const setup = async () => {
    const root = makeVault();
    mkdirSync(join(root, "cfg"), { recursive: true });
    writeFileSync(join(root, "cfg", "app.toml"), TOML);
    writeFileSync(join(root, "people.yaml"), "team:\n  - name: Ada\n    role: lead\n  - name: Rosa\n    role: ops\n");
    writeFileSync(join(root, "to-config.md"), "# T\n\nThe [ui](cfg/app.toml#ui) section.\n");
    return root;
  };
  test("TOML opens rendered: sections as headings (outline, breadcrumb), keys lined up, comments dimmed", async () => {
    const root = await setup();
    const h = await harness({ root, open: "cfg/app.toml", width: 100 });
    const v = h.app.view!;
    expect(v.source).toBeFalsy();
    const layout = h.app.currentLayout(v);
    expect(layout.headings.map((x) => x.text)).toEqual(["editor", "ui"]);
    const f = h.frame();
    expect(f).toMatch(/theme\s+nord\s+# the default/);
    expect(f).toMatch(/command\s+nvim/);
    expect(f).toMatch(/autosave_ms\s+30000/);
    const row = layout.lines.find((l) => l.spans.some((s) => s.text.includes("the default")))!;
    expect(row.spans.find((s) => s.text.includes("the default"))!.role).toBe("syn_comment");
    await h.keys("space", "n", "v");
    expect(v.source).toBe(true); // source mode is a key away
    expect(h.frame()).toContain('theme = "nord"');
  });
  test("YAML: a list of records is a table; a link to a section of a data file lands there", async () => {
    const root = await setup();
    const h = await harness({ root, open: "people.yaml", width: 100 });
    const f = h.frame();
    expect(f).toMatch(/│ name\s+│ role\s+│/);
    expect(f).toMatch(/│ Rosa\s+│ ops\s+│/);
    await h.app.run("note.open to-config.md");
    const v = h.app.view!;
    const l = h.app.currentLayout(v).links[0]!;
    h.app.moveCursor(v, { row: l.line, col: l.col });
    await h.keys("enter");
    expect(v.buf.rel).toBe("cfg/app.toml");
    expect(rowText(h)).toContain("ui");
  });
  test("the lens edits one key; a parse error when insert ends goes to source mode, and back when fixed", async () => {
    const root = await setup();
    const h = await harness({ root, open: "cfg/app.toml", width: 100, config: (c) => (c.editor.edit_in = "live") });
    const v = h.app.view!;
    const row = h.app.currentLayout(v).lines.findIndex((x) => x.spans.some((s) => s.text.includes("autosave_ms")));
    h.app.moveCursor(v, { row, col: 2 });
    await h.keys("shift+a", "shift+a", "0", "escape"); // the lens, then typing in it
    expect(v.live).toBe(true);
    expect(v.buf.source).toContain("autosave_ms = 300000\n");
    // Break it: an unclosed string. Mid-typing the lens stays; leaving insert, source mode.
    await h.keys("shift+a", "space", "x", "=", "space", '"');
    expect(v.source).toBeFalsy();
    await h.keys("escape");
    h.frame();
    expect(v.source).toBe(true);
    expect(h.app.messages.some((m) => m.text.includes("doesn't parse"))).toBe(true);
    await h.keys("space", "n", "v"); // still broken: refused, with the error
    expect(v.source).toBe(true);
    await h.keys("u", "space", "n", "v"); // undone: it renders again
    expect(v.source).toBeFalsy();
  });
});

/** The cursor's column in its source line (the code view's rows map each cell to it). */
function placedColumn(h: Harness): number {
  const v = h.app.view!;
  const l = h.app.currentLayout(v).lines[v.cur.row]!;
  const cs = cells(l);
  return cs.find((c) => v.cur.col >= c.x && v.cur.col < c.x + c.w)?.at ?? 0;
}

describe("code as a notebook (24.x, 24.13)", () => {
  const SAMPLE = [
    'import { readFileSync } from "node:fs";',
    'import { join } from "node:path";',
    'import type { Link } from "./links.ts";',
    "/**",
    " * Resolves a link written in a note: the note it reaches, or `null` when **nothing** matches.",
    " * @param from - the note it's written in",
    " * @param {string} target the link as written",
    " * @returns the link, or null",
    " * @deprecated use `reach` instead",
    " */",
    "export function resolve(from: string, target: string): Link | null {",
    "  if (!target) return null;",
    "  const hit = byName.get(normKey(target)) ?? byPath.get(join(from, target)) ?? byAlias.get(target.toLowerCase()) ?? null;",
    "  return hit;",
    "}",
    "export class Graph {",
    "  private notes = new Map<string, string>();",
    "  /** A note's text, as read. */",
    "  textOf(rel: string): string | undefined {",
    "    return this.notes.get(rel);",
    "  }",
    "",
    "  // Then writing.",
    "",
    '  add(rel: string): void { this.notes.set(rel, readFileSync(rel, "utf8")); }',
    "}",
    "const html = `",
    "<p>one</p>",
    "",
    "",
    "<p>two</p>",
    "`;",
    "const min = 1;",
    "",
  ].join("\n");
  const open = async (opts: Partial<Opts> = {}, file = "sample.ts", text = SAMPLE) => {
    const root = makeVault();
    writeFileSync(join(root, file), text);
    // The whole width the note's: no explorer beside it.
    const config = (c: Config) => ((c.ui.sidebar = false), opts.config?.(c));
    const h = await harness({ root, open: file, width: 100, height: 50, ...opts, config });
    for (let i = 0; i < 200 && h.app.view!.buf.syntax?.version !== h.app.view!.buf.version; i++) {
      h.frame();
      await Bun.sleep(10);
    }
    h.frame();
    return h;
  };
  /** The window's rows as drawn, from its text column. */
  const rows = (h: Harness) => {
    const frame = h.frame();
    const pane = h.app.geometry!.panes[0]!;
    return frame
      .split("\n")
      .slice(pane.y, pane.y + pane.h)
      .map((r) =>
        [...r]
          .slice(pane.textX, pane.x + pane.w - 1)
          .join("")
          .trimEnd(),
      );
  };
  const rowIndex = (h: Harness, text: string) => rows(h).findIndex((r) => r.includes(text));
  const hot = (h: Harness, id: string) => {
    h.frame();
    return h.app.geometry!.hot.find((x) => x.id === id);
  };
  const click = (h: Harness, at: { x: number; y: number }) => {
    for (const type of ["down", "up"]) h.app.mouse.handle({ type, x: at.x, y: at.y, button: 0 });
  };
  const line = (h: Harness) => srcAt(h.app.currentLayout(h.app.view!).lines[h.app.view!.cur.row]!, h.app.view!.cur.col);

  test("a TypeScript file as a notebook: prose at full width; a cell per definition in a box, its header its kind, name, lines and buttons; a class's head, then its methods", async () => {
    const h = await open({ height: 80 });
    const v = h.app.view!;
    expect(v.source).toBeFalsy();
    const r = rows(h);
    expect(r[0]).toBe("▸ imports  node:fs · node:path · ./links.ts (3)");
    // The cell, a blank row before it: its header (its lines its documentation's with its code's), a blank row under
    // it; its documentation — prose, then its terms; a blank row (the two belong together); its code, every token as
    // written. A box has its top and its left line only: no right one, no bottom.
    const head = rowIndex(h, "function: resolve");
    expect(head).toBe(2);
    expect(r[1]).toBe("");
    expect(r[head]).toMatch(/^┌─ function: resolve ─+ 4–15 ⇢ ⧉ ✎ ◎ ▾ ──$/);
    expect(r[head + 1]).toBe("│");
    expect(r[head + 2]).toBe("│ Resolves a link written in a note: the note it reaches, or null when nothing matches.");
    expect(r[head + 3]).toBe("│");
    expect(r.slice(head + 4, head + 8).join("\n")).toMatch(
      /^│ {3}from +the note it's written in\n│ {3}target +the link as written {2}string\n│ {3}returns +the link, or null\n│ {3}deprecated +use reach instead$/,
    );
    expect(r[head + 8]).toBe("│"); // no divider: a blank row
    expect(r[head + 9]).toBe("│ export function resolve(from: string, target: string): Link | null {");
    expect(r[head + 10]).toBe("│   if (!target) return null;");
    expect(r[head + 14]).toBe("│ }");
    expect(r[head + 15]).toBe(""); // the next box's blank row
    expect(r.filter((x) => /[┐┘└]/.test(x))).toEqual([]); // no right corner, no bottom, anywhere
    // Its lines in a colour of their own, brighter than the frame's: its top, its left line (drawn over its rows).
    const canvas = h.canvas();
    const pane = h.app.geometry!.panes[0]!;
    const cellLine = h.app.theme.roles.cell_line.fg!;
    expect(cellLine).not.toBe(h.app.theme.roles.border.fg);
    for (const y of [head, head + 2]) expect(canvas.styles[pane.y + y]![pane.textX]!.fg).toBe(cellLine);
    const layout = h.app.currentLayout(v);
    const top = layout.lines.findIndex((l) => l.decor && l.spans.some((sp) => sp.text === "resolve"));
    expect(layout.lines[top + 1]!.decor).toBe(true); // the blank row: decoration, no cursor stop
    // The class: a cell of its head; its methods each a cell, at their indentation, a method's doc above it; its brace.
    // The tree's lines, as the explorer's, join them: the class's left line on down, to each member's box a row under its
    // top, by its name — the same row for every one, its corner kept.
    const graph = rowIndex(h, "class: Graph");
    expect(graph).toBe(head + 16);
    expect(r[graph]).toMatch(/^┌─ class: Graph ─+ 16–17 ⇢ ⧉ ✎ ◎ ▾ ──$/);
    expect(r[graph + 3]).toBe("│   private notes = new Map<string, string>();");
    expect(r[graph + 4]).toBe("│"); // a member's blank row, on the class's line
    const textOf = rowIndex(h, "method: textOf");
    expect(textOf).toBe(graph + 5);
    expect(r[textOf]).toMatch(/^│ ┌─ method: textOf ─+ 18–21 ⇢ ⧉ ✎ ◎ ▾ ──$/);
    expect(r[textOf + 1]).toBe("├─┤"); // a row under its top, its left line drawn into the row
    for (const [y, x] of [
      [graph + 4, 0],
      [textOf + 1, 0],
      [textOf + 1, 2],
    ] as const)
      expect(canvas.styles[pane.y + y]![pane.textX + x]!.fg).toBe(cellLine); // the tree's lines, its joints
    expect(r[textOf + 2]).toBe("│ │ A note's text, as read.");
    expect(r[textOf + 3]).toBe("│ │"); // the blank row between its documentation and its code
    expect(r[textOf + 4]).toBe("│ │ textOf(rel: string): string | undefined {"); // its rows from its own edge
    // A comment that documents nothing: prose in a box of its own, at its indentation, its header its mark alone and
    // its buttons (no references: it defines nothing).
    const loose = rowIndex(h, "Then writing");
    expect(r.slice(loose - 2, loose + 2)).toEqual([
      "│",
      expect.stringMatching(/^│ ┌─ ¶ ─+ 23 ⧉ ✎ ◎ ▾ ──$/),
      "├─┤ Then writing.",
      "│",
    ]);
    expect(r[loose - 1]!.length).toBe(r[head]!.length); // its top to the edge
    expect(r[rowIndex(h, "method: add")]).toMatch(/^│ ┌─ method: add ─+ 25 ⇢ ⧉ ✎ ◎ ▾ ──$/);
    expect(r[rowIndex(h, "method: add") + 1]).toBe("├─┤"); // the last: the line on to the class's brace
    expect(r[rowIndex(h, "method: add") + 2]).toMatch(/^│ │ add\(rel: string\)/);
    // The class's closing brace: a row of the class's, on its left line — no box of its own — a blank row before it,
    // as after any box that no box follows.
    expect(r.slice(rowIndex(h, "method: add") + 3, rowIndex(h, "method: add") + 6)).toEqual(["│", "│ }", ""]);
    const brace = h.app.currentLayout(v).lines.find((l) => l.src === 26 && l.srcMap)!;
    expect(brace.spans.filter((sp) => sp.text.trim()).every((sp) => sp.attrs & 16)).toBe(true); // the class's closing brace, dimmed
    // Statements together: the values' names, no references (they're no definition); a string's blank lines its own.
    const vals = rowIndex(h, "html · min");
    expect(r[vals]).toMatch(/^┌─ • html · min ─+ 27–33 ⧉ ✎ ◎ ▾ ──$/);
    expect(r.slice(vals + 3, vals + 7).map((x) => x.replace(/^│ ?/, ""))).toEqual(["<p>one</p>", "", "", "<p>two</p>"]);
    // The name bold, what's before it dim, a brace dim; the rows of code the file's, cell by cell.
    const sig = h.app.currentLayout(v).lines.find((l) => l.src === 11 && l.srcMap)!;
    expect(sig.spans.find((sp) => sp.text.includes("resolve"))!.attrs & 1).toBe(1);
    expect(sig.spans.find((sp) => sp.text.includes("export"))!.attrs & 16).toBe(16);
    expect(sig.frame).toBeDefined();
    // The cursor on a cell's row is on its text, never on its border or padding.
    const sigRow = h.app.currentLayout(v).lines.indexOf(sig);
    h.app.moveCursor(v, { row: sigRow, col: 0 });
    expect(v.cur.col).toBe(2);
    // The outline's: the definitions, a class's methods under it — each at its cell's first row of code.
    expect(h.app.currentLayout(v).headings.map((x) => `${x.level} ${x.text}`)).toEqual([
      "1 resolve",
      "1 Graph",
      "2 textOf",
      "2 add",
    ]);
    for (const x of h.app.currentLayout(v).headings) expect(h.app.currentLayout(v).lines[x.line]!.srcMap).toBeDefined();
    // Its cells, for their buttons and keys.
    expect(h.app.currentLayout(v).cells!.map((c) => `${c.title} ${c.from}-${c.to}`)).toEqual([
      "resolve 4-15",
      "Graph 16-17",
      "textOf 18-21",
      "comment 23-23",
      "add 25-25",
      "html · min 27-33",
    ]);
    // The cursor on a cell's prose is on its text too, never its border.
    const prose = h.app
      .currentLayout(v)
      .lines.findIndex((l) => l.text && !l.srcMap && l.spans.some((sp) => sp.text.includes("Resolves")));
    h.app.moveCursor(v, { row: prose, col: 0 });
    expect(v.cur.col).toBe(2);
  });

  test("the tree's lines, as the explorer's: a class's members two columns in, however far the file indents them; a class in a class its own tree", async () => {
    const NEST = [
      "class Outer:",
      "    x = 1",
      "",
      "    def one(self):",
      "        pass",
      "",
      "    class Inner:",
      "        y = 2",
      "",
      "        def two(self):",
      "            pass",
      "",
    ].join("\n");
    const h = await open({ height: 60 }, "nest.py", NEST);
    const r = rows(h);
    const outer = rowIndex(h, "class: Outer");
    expect(r.slice(outer, outer + 19).map((x) => x.replace(/─{3,}.*$/, "─"))).toEqual([
      "┌─ class: Outer ─",
      "│",
      "│ class Outer:",
      "│     x = 1",
      "│", // a member's blank row, on the class's left line going on down
      "│ ┌─ method: one ─",
      "├─┤", // a row under its top, by its name
      "│ │ def one(self):",
      "│ │     pass",
      "│",
      "│ ┌─ class: Inner ─",
      "└─┤", // the last of its members: its line ends here; Inner's own tree from Inner's left line
      "  │ class Inner:",
      "  │     y = 2",
      "  │",
      "  │ ┌─ method: two ─",
      "  └─┤",
      "    │ def two(self):",
      "    │     pass",
    ]);
    // Too narrow for a member to sit further in: no tree, the boxes as they are.
    const narrow = h.app
      .view!.buf.codeLayout(28, true, h.app.glyphs)
      .lines.map((l) => l.spans.map((sp) => sp.text).join(""));
    // (Its word the first to go: its name fits.)
    expect(narrow.find((x) => x.includes(" one "))).toStartWith("┌─ one ");
    expect(narrow.find((x) => x.includes("Outer"))).toStartWith("┌─ Outer ");
  });

  test("a class's closing brace a row on its line, from its own edge; what's after its last method else its members' cells", async () => {
    // A class indented in the file (in a namespace): its closing brace from its own edge, as its cells are.
    const NS = ["export namespace N {", "  export class A {", "    m(): void {}", "  }", "}", ""].join("\n");
    let r = rows(await open({}, "ns.ts", NS));
    const m = r.findIndex((x) => x.includes("method: m"));
    expect(r.slice(m + 3, m + 6)).toEqual(["│", "│ }", ""]);
    // A field after the last method, braces in it: a member's cell; only the brace on its own line is the closing.
    r = rows(
      await open({}, "b.ts", ["export class B {", "  m(): void {}", "  static empty = {};", "}", ""].join("\n")),
    );
    expect(r.find((y) => y.includes("static empty"))).toMatch(/^│ │ static empty = \{\};$/);
    expect(r.filter((y) => /^│ \}$/.test(y))).toHaveLength(1);
    // Python's class has no closing: a value after its last method is a member's cell, on the tree.
    const PY = ["class A:", "    def m(self):", "        pass", "", "    x = 1", ""].join("\n");
    r = rows(await open({}, "a.py", PY));
    const x = r.findIndex((y) => y.includes("─ code ─"));
    expect(r[x]).toMatch(/^│ ┌─ code ─+ 5 ⧉ ✎ ◎ ▾ ──$/);
    expect(r[x + 1]).toBe("└─┤");
    expect(r[x + 2]).toBe("  │ x = 1");
  });

  test("a cell folds to its header — z a, space k f, its ▾ — and opens again; the imports fold on enter", async () => {
    const h = await open();
    const v = h.app.view!;
    h.app.placeAtLine(v, 13);
    await h.keys("z", "a");
    let r = rows(h);
    expect(r[rowIndex(h, "function: resolve")]).toMatch(/ 4–15 ⇢ ⧉ ✎ ◎ ▸ ──$/);
    expect(r.slice(rowIndex(h, "function: resolve") + 1, rowIndex(h, "function: resolve") + 3)).toEqual([
      "",
      expect.stringMatching(/^┌─ class: Graph /),
    ]); // its header alone
    expect(rowIndex(h, "if (!target)")).toBe(-1);
    // Its button: open again.
    const fold = hot(h, "cell:fold:4")!;
    click(h, fold);
    expect(rowIndex(h, "if (!target)")).toBeGreaterThan(0);
    // A member folded: the tree's line meets its box at its top.
    h.app.placeAtLine(v, 19);
    await h.keys("z", "a");
    expect(rows(h)[rowIndex(h, "method: textOf")]).toMatch(/^├─┬─ method: textOf ─+ 18–21 ⇢ ⧉ ✎ ◎ ▸ ──$/);
    // A class folded: its methods with it.
    h.app.placeAtLine(v, 16);
    await h.keys("space", "k", "f");
    expect(rowIndex(h, "method: textOf")).toBe(-1);
    // The imports: enter on their row.
    h.app.moveCursor(v, { row: 0, col: 0 });
    await h.keys("enter");
    r = rows(h);
    expect(r.slice(0, 2)).toEqual(["▾ imports (3)", 'import { readFileSync } from "node:fs";']);
  });

  test("z a folds the cell at the cursor and z a again opens it: a folded cell's header is the cursor's stop", async () => {
    const h = await open();
    const v = h.app.view!;
    const onRow = () =>
      h.app
        .currentLayout(v)
        .lines[v.cur.row]!.spans.map((s) => s.text)
        .join("");
    h.app.placeAtLine(v, 13);
    await h.keys("z", "a");
    expect(rowIndex(h, "if (!target)")).toBe(-1);
    expect(onRow()).toContain("function: resolve"); // on its header, the cell's one row
    await h.keys("z", "a");
    expect(rowIndex(h, "if (!target)")).toBeGreaterThan(0);
    expect(rowIndex(h, "class: Graph")).toBeGreaterThan(0); // the next cell as it was
    // Folded again: j leaves its header, k comes back to it, as to a line.
    await h.keys("z", "a");
    await h.keys("j");
    expect(onRow()).not.toContain("function: resolve");
    await h.keys("k");
    expect(onRow()).toContain("function: resolve");
  });

  test("a cell's buttons: copy its lines, edit it in the lens, add it to the scratch, its problems, where it's used", async () => {
    // The lens's least size one line: ✎'s lens is the cell's own lines, not its neighbours'.
    const h = await open({ config: (c) => ((c.editor.edit_in = "live"), (c.editor.lens_min_rows = 1)) });
    const v = h.app.view!;
    const lines = v.buf.lines();
    // ⧉: its lines, as the file has them.
    click(h, hot(h, "cell:copy:4")!);
    expect(h.copied.at(-1)).toBe(lines.slice(3, 15).join("\n")); // its documentation with its code
    expect(h.app.messages.at(-1)!.text).toBe("copied resolve — lines 4–15");
    // ✎: the lens on it, its lines whole.
    click(h, hot(h, "cell:edit:18")!);
    expect(v.live).toBe(true);
    const lens = h.app
      .currentLayout(v)
      .lines.filter((l) => l.lens === "source")
      .map((l) => l.src);
    expect([lens[0], lens.at(-1)]).toEqual([18, 22]); // its lines, and the blank line its last block takes
    await h.keys("escape", "escape");
    // ◎: the scratch, with its path and lines.
    click(h, hot(h, "cell:scratch:4")!);
    expect(h.app.messages.at(-1)!.text).toBe(
      "resolve — lines 4–15 added to the scratch; add a note, esc then q closes it",
    );
    expect(readFileSync(h.app.scratch.location().path, "utf8")).toContain("sample.ts:4-15");
    // Shown in the scratch, floating, typing its note (#43, D229); esc then q, back at the cell.
    expect([
      h.app.floating?.kind,
      h.app.view!.insert,
      h.app.view!.buf.source.split("\n")[lineOf(h.app.view!, offsetOf(h.app, h.app.view!)) - 1],
    ]).toEqual(["scratch", true, "**Note:** "]);
    await h.keys("escape", "q");
    expect(h.app.floating).toBeNull();
    // ⚠: a problem in it — counted on its header, the panel on it.
    const warning = (line: number, message: string) => ({
      start: { line, column: 3 },
      end: { line, column: 6 },
      severity: "warning" as const,
      source: "fake",
      code: null,
      message,
    });
    v.buf.serverProblems.set("fake", {
      version: v.buf.version,
      raw: [],
      list: [warning(2, "before it"), warning(13, "a warning"), warning(25, "after it")],
    });
    v.layoutKey = "";
    h.app.dismissToasts(); // the messages' boxes off the header
    expect(rows(h)[rowIndex(h, "function: resolve")]).toMatch(/ 4–15 ⚠ ⇢ ⧉ ✎ ◎ ▾ ──$/);
    click(h, hot(h, "cell:problems:4")!);
    expect(h.app.problems.panel).toMatchObject({ shown: true, tab: "file" });
    expect(h.app.problems.fileRows()[h.app.problems.panel.file.selected]!.message).toBe("a warning");
    // ⇢: from its name.
    h.app.problems.close();
    click(h, hot(h, "cell:references:4")!);
    expect(line(h)).toBe(11);
    expect(v.buf.lines()[10]!.slice(placedColumn(h))).toStartWith("resolve(");
    // A comment's box has them too, but where it's used: it defines nothing.
    expect(hot(h, "cell:references:23")).toBeUndefined();
    click(h, hot(h, "cell:copy:23")!);
    expect(h.copied.at(-1)).toBe("  // Then writing.");
    click(h, hot(h, "cell:fold:23")!);
    h.app.dismissToasts();
    expect(rowIndex(h, "Then writing")).toBe(-1);
    expect(rows(h)[rowIndex(h, "─ ¶ ─")]).toMatch(/ 23 ⧉ ✎ ◎ ▸ ──$/);
  });

  test("a problem across a cell's lines marks its text only — never its header, its borders or its padding", async () => {
    const h = await open();
    const v = h.app.view!;
    // An error over the whole function, its first line to its last.
    v.buf.serverProblems.set("fake", {
      version: v.buf.version,
      raw: [],
      list: [
        {
          start: { line: 11, column: 1 },
          end: { line: 15, column: 2 },
          severity: "error",
          source: "fake",
          code: null,
          message: "wrong",
        },
      ],
    });
    v.layoutKey = "";
    const c = h.canvas();
    const lines = c.toString().split("\n");
    const red = h.app.theme.roles.problem_error;
    const marked = (y: number, x: number) => {
      const st = c.styles[y]![x]!;
      return (red.fg !== undefined && st.fg === red.fg) || (red.underline === true && st.underline === true);
    };
    const pane = h.app.geometry!.panes[0]!;
    const y = (text: string) => lines.findIndex((l, i) => i >= pane.y && l.includes(text));
    const header = y("function: resolve");
    const sig = y("export function resolve");
    const between = sig - 1; // the blank row between its documentation and its code
    const next = y("class: Graph");
    const x = (row: number, text: string) => [...lines[row]!.slice(0, lines[row]!.indexOf(text))].length;
    expect(marked(sig, x(sig, "export"))).toBe(true); // the text
    // The header's border and title, the divider, the next box's top under the last line (its ⚠ button is red on purpose).
    for (let k = pane.textX; k < pane.textX + 20; k++) expect(marked(header, k)).toBe(false);
    for (const row of [between, next])
      for (let k = pane.textX; k < pane.x + pane.w - 1; k++) expect(marked(row, k)).toBe(false);
    expect(marked(sig, x(sig, "{") + 2)).toBe(false); // the padding after the row's text
    expect(marked(sig, pane.textX)).toBe(false); // the border
  });

  test("a path in a comment's prose is a link, as in source mode: drawn as one, enter follows it (to its line); a note beside code too", async () => {
    const TOOL =
      "// See notes/alpha.md:7 for the plan.\nexport function plan() {\n  return 1; // and notes/beta.md\n}\n\n// Standing alone, `notes/beta.md` and notes/missing.md; [the docs](https://example.com).\n\nconst x = 1;\n";
    const h = await open({}, "tool.ts", TOOL);
    const layout = () => h.app.currentLayout(h.app.view!);
    /** The cursor on `needle`, in the first row of the code view holding `rowHas`: that row. */
    const onText = (rowHas: string, needle: string) => {
      const lines = layout().lines;
      const row = lines.findIndex((l) =>
        l.spans
          .map((s) => s.text)
          .join("")
          .includes(rowHas),
      );
      expect(row).toBeGreaterThanOrEqual(0);
      const text = lines[row]!.spans.map((s) => s.text).join("");
      h.app.moveCursor(h.app.view!, { row, col: stringWidth(text.slice(0, text.indexOf(needle))) + 1 });
      return lines[row]!;
    };
    // Drawn as links: the documentation's path, the box of its own's (in backticks too); a path to nothing isn't one.
    expect(
      layout()
        .links.filter((l) => l.target.startsWith("/notes/"))
        .map((l) => [l.target, l.text]),
    ).toEqual([
      ["/notes/alpha.md#L7", "notes/alpha.md:7"],
      ["/notes/beta.md", "notes/beta.md"],
    ]);
    // In the order they're drawn, a Markdown link's among them: the next link from the top is the first path.
    expect(layout().links.map((l) => l.target)).toEqual([
      "/notes/alpha.md#L7",
      "/notes/beta.md",
      "https://example.com",
    ]);
    h.app.moveCursor(h.app.view!, { row: 0, col: 0 });
    await h.app.run("link.next");
    expect(line(h)).toBe(1);
    const doc = onText("See notes/alpha.md", "notes/alpha.md");
    expect(doc.srcMap).toBeUndefined(); // a row of prose, not of code
    expect(doc.spans.find((s) => s.text === "notes/alpha.md:7")!.role).toBe("link");
    // The note beside the code: its row is code's, drawn as source mode draws a comment's link.
    expect(onText("and notes/beta.md", "notes/beta.md").srcMap).toBeDefined();
    const c = h.canvas();
    const frame = c.toString().split("\n");
    const y = frame.findIndex((r) => r.includes("and notes/beta.md"));
    const x = [...frame[y]!.slice(0, frame[y]!.indexOf("notes/beta.md"))].length;
    expect(c.styles[y]![x]!.fg).toBe(h.app.theme.roles.link.fg!);
    // enter on the documentation's path: the note, at its line.
    onText("See notes/alpha.md", "notes/alpha.md");
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    expect(line(h)).toBe(7);
    // The box of its own's, in backticks.
    await h.app.run("note.open tool.ts");
    expect(onText("Standing alone", "notes/beta.md").srcMap).toBeUndefined();
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
  });

  test("slipbox's own syntax errors, no server having spoken: marked on the text, the line's number red, counted in the cell's header and the status line", async () => {
    const h = await open(
      { config: (c) => (c.ui.line_numbers = true) },
      "broken.ts",
      "export function total(a: number) {\n  return a +;\n}\n\nexport const fine = 1;\n",
    );
    const v = h.app.view!;
    expect(v.source).toBeFalsy(); // the code view
    expect(v.buf.syntax!.errors.length).toBeGreaterThan(0);
    expect(h.app.problems.ofView(v).map((p) => p.source)).toContain("syntax");
    h.app.dismissToasts();
    // The cell's header counts them, its ⚠ button the panel's; the other cell has none.
    expect(hot(h, "cell:problems:1")).toBeDefined();
    expect(hot(h, "cell:problems:5")).toBeUndefined();
    // The mark on the line's text, in the syntax error's own role; its number red.
    const c = h.canvas();
    const lines = c.toString().split("\n");
    const at = lines.findIndex((l) => l.includes("return a +;"));
    const mark = h.app.theme.roles.syntax_error;
    const cols = [...lines[at]!].map((_, k) => c.styles[at]![k]!);
    expect(cols.some((st) => st.underline && (mark.fg === undefined || st.fg === mark.fg))).toBe(true);
    const num = [...lines[at]!].indexOf("2");
    expect(c.styles[at]![num]!.fg).toBe(h.app.theme.roles.error.fg!);
    expect(statusRow(h.frame())).toMatch(/✖ \d+/);
    // Once a server has said what it finds, its errors stand in for slipbox's.
    v.buf.serverProblems.set("fake", { version: v.buf.version, raw: [], list: [] });
    v.layoutKey = "";
    expect(h.app.problems.ofView(v)).toEqual([]);
    expect(hot(h, "cell:problems:1")).toBeUndefined();
  });

  test("boxes or bands: space u c; a band's header and code on a tint, no borders", async () => {
    const h = await open();
    await h.keys("space", "u", "c");
    expect(h.app.messages.at(-1)!.text).toBe("Code cells: bands");
    h.app.dismissToasts(); // the messages' boxes off the header
    const r = rows(h);
    const head = rowIndex(h, "function: resolve");
    expect(r[head]).toMatch(/^ function: resolve +4–15 ⇢ ⧉ ✎ ◎ ▾$/);
    expect(r[rowIndex(h, "method: textOf")]).toMatch(/^├─ method: textOf +18–21 /); // the tree's lines, bands or boxes: to its header
    expect(r[rowIndex(h, "class: Graph") - 1]).toBe(" }"); // bands touch: a band's header is a tint of its own
    expect(r[rowIndex(h, "method: textOf") + 3]).toMatch(/^│ {2}textOf\(rel/); // the line on past its rows
    expect(r[rowIndex(h, "private notes")]).toMatch(/^ {3}private notes/); // from the class's band, no corner to turn
    expect(r[head + 1]).toStartWith(" Resolves a link");
    expect(r[r.findIndex((x) => x.includes("export function resolve"))]).toStartWith(" export function resolve(");
    const layout = h.app.currentLayout(h.app.view!);
    expect(layout.lines.find((l) => l.src === 12 && l.srcMap)!.fill).toBe("code_block");
    expect(layout.lines.find((l) => l.src === 12 && l.srcMap)!.frame).toBeUndefined();
    // The class's closing brace on a band of its own, no line to it (no corner to turn).
    const brace = layout.lines.find((l) => l.src === 26 && l.srcMap)!;
    expect([
      brace.fill,
      brace.spans
        .map((sp) => sp.text)
        .join("")
        .trimEnd(),
    ]).toEqual(["code_block", " }"]);
    expect(layout.lines[layout.lines.indexOf(brace) - 1]!.srcMap).toBeDefined(); // right under the last member's band
    expect(r.some((x) => x.includes("┌"))).toBe(false);
    await h.keys("space", "u", "c");
    expect(h.app.messages.at(-1)!.text).toBe("Code cells: boxes");
  });

  test("a long line breaks at its structure inside its cell, its rest under its own indent; each row's cells still the file's", async () => {
    const h = await open({ width: 90 });
    const v = h.app.view!;
    const r = rows(h);
    const i = rowIndex(h, "const hit");
    expect(r[i]).toMatch(/^│ {3}const hit = byName\.get\(normKey\(target\)\)$/);
    expect(r[i + 1]).toMatch(/^│ {7}\?\? byPath\.get\(join\(from, target\)\)$/);
    const layout = h.app.currentLayout(v);
    // The status line's column is the file's: on `const`, its column in its line, the cell's border and padding not counted.
    h.app.moveCursor(v, { row: i, col: r[i]!.indexOf("const") });
    expect(statusRow(h.frame())).toContain(` L13:${v.buf.lines()[12]!.indexOf("const") + 1} `);
    const row = layout.lines.findIndex((l) => l.src === 13) + 1;
    const line13 = v.buf.lines()[12]!;
    const col = [...layout.lines[row]!.spans.map((sp) => sp.text).join("")].join("").indexOf("??");
    expect(layout.lines[row]!.srcMap!.cells[col]).toBe(line13.indexOf("?? byPath"));
    h.app.moveCursor(v, { row, col });
    expect(v.cur).toEqual({ row, col });
    // Copied, it's the file's text, never its rows, borders or guides.
    h.app.views.select(v, { row: row - 1, col: 0 }, true);
    h.app.moveCursor(v, { row, col: 0 }, { extend: true });
    expect(h.app.views.selectionText(v)).toBe(line13);
    // ]]: from one definition to the next.
    v.sel = null;
    h.app.moveCursor(v, { row: 0, col: 0 });
    await h.keys("]", "]");
    expect(h.app.currentLayout(v).lines[v.cur.row]!.src).toBe(11);
    // Wrapping off: the line runs on, one row.
    await h.keys("space", "u", "w");
    expect(h.app.currentLayout(v).lines.filter((l) => l.src === 13 && l.srcMap)).toHaveLength(1);
  });

  test("the lens opens on the cursor's cell whole when it fits: a function with its documentation, a class's head; it moves to the next whole; a cell too tall, its lines", async () => {
    const h = await open();
    const v = h.app.view!;
    const lens = () => {
      const src = h.app
        .currentLayout(v)
        .lines.filter((l) => l.lens === "source")
        .map((l) => l.src);
      return [src[0], src.at(-1)];
    };
    // In a function: its JSDoc, its lines (no neighbours to make up the lens's least rows).
    h.app.placeAtLine(v, 12);
    await h.keys("space", "n", "l");
    expect(lens()).toEqual([4, 15]);
    await h.keys("escape");
    // On a class's line: its head — its line and its fields, up to its first member.
    h.app.placeAtLine(v, 16);
    await h.keys("space", "n", "l");
    expect(lens()).toEqual([16, 17]);
    // Past its edge: the next cell, whole — the lens moves to it rather than gathering it.
    await h.keys("j", "j");
    expect(lens()).toEqual([18, 22]); // a method with its doc comment, and the blank line after it
    await h.keys("escape");
    // Too tall for the lens's most (lens_max of the window): its lines, as before — the cursor's and its neighbours.
    const small = await open({ config: (c) => (c.editor.lens_max = 0.1) });
    small.app.placeAtLine(small.app.view!, 12);
    await small.keys("space", "n", "l");
    const rows = small.app
      .currentLayout(small.app.view!)
      .lines.filter((l) => l.lens === "source")
      .map((l) => l.src);
    expect(rows).toContain(12);
    expect(rows[0]).toBeGreaterThan(4);
  });

  test("the lens: the cursor's line as written, highlighted as code; esc esc back to the notebook", async () => {
    const h = await open({ config: (c) => (c.editor.edit_in = "live") });
    const v = h.app.view!;
    h.app.placeAtLine(v, 19, 3);
    await h.keys("i");
    expect(v.live).toBe(true);
    expect(h.app.messages.some((m) => m.text.startsWith("the lens:"))).toBe(false);
    const lens = h.app.currentLayout(v).lines.filter((l) => l.lens === "source");
    expect(lens.map(lineText)).toContain("    return this.notes.get(rel);");
    expect(lens.find((l) => l.src === 20)!.spans.find((sp) => sp.text.includes("return"))!.role).toBe("syn_keyword");
    expect(rows(h).some((x) => /^┌─ class: Graph ─/.test(x))).toBe(true); // around it, the notebook
    await h.keys("i", "x", "escape", "escape");
    expect(v.live).toBeFalsy();
    for (let k = 0; k < 200 && v.buf.syntax?.version !== v.buf.version; k++) {
      h.frame();
      await Bun.sleep(10);
    }
    expect(rows(h)[rowIndex(h, "method: xtextOf")]).toMatch(/^│ ┌─ method: xtextOf ─/);
  });

  test("space n v: source and back; edit_in = source: editing goes to source; [render] code = source; Go in source", async () => {
    const h = await open();
    const v = h.app.view!;
    await h.keys("space", "n", "v");
    expect(v.source).toBe(true);
    expect(h.app.messages.some((m) => m.text.startsWith("source —"))).toBe(false);
    expect(h.app.currentLayout(v).cells).toBeUndefined();
    await h.keys("space", "n", "v");
    expect(v.source).toBeFalsy();
    expect(h.app.messages.some((m) => m.text === "the code as a document")).toBe(false);
    await h.keys("i");
    expect(v.source).toBe(true);
    expect(v.insert).toBe(true); // to source mode, typing at once: no lens to show first
    expect(h.app.messages.some((m) => m.text.startsWith("source —"))).toBe(false);
    const plain = await open({ config: (c) => (c.render.code = false) });
    expect(plain.app.view!.source).toBe(true);
    // Go is drawn as a document (24.9); CSS, which has no definitions to be cells, in source mode.
    const go = await open({}, "tool.go", "package main\n\nfunc f() int { return 1 }\n");
    expect(go.app.view!.source).toBeFalsy();
    const css = await open({}, "site.css", "a {\n  color: red;\n}\n");
    expect(css.app.view!.source).toBe(true);
    // A cell's key outside a cell, or in source mode: said.
    await css.keys("z", "a");
    expect(css.app.messages.at(-1)!.text).toStartWith("a cell is the code view's");
  });

  test("a header says what it is in its language's word, in every glyph set: `function: resolve`, `class: Graph`", async () => {
    for (const glyphs of ["ascii", "nerd", "unicode"] as const) {
      const h = await open({ config: (c) => (c.render.glyphs = glyphs) });
      expect(rows(h)[rowIndex(h, "resolve ")]).toContain(" function: resolve ");
      expect(rows(h)[rowIndex(h, "Graph ")]).toContain(" class: Graph ");
      expect(rows(h)[rowIndex(h, "textOf ")]).toContain(" method: textOf ");
    }
  });
  describe("every grammar with definitions, by its own queries (24.9)", () => {
    const view = async (file: string, text: string, width = 100) => {
      const h = await open({ width }, file, text);
      return { h, layout: h.app.currentLayout(h.app.view!), text: rows(h).join("\n") };
    };
    const cellsOf = (l: Layout) => (l.cells ?? []).map((c) => `${c.title} ${c.from}–${c.to}`);
    test("each cell's header in its language's words: a struct, an impl, a trait, an interface, a function, a method", async () => {
      const heads = async (file: string, text: string) => {
        const h = await open({ width: 120 }, file, text);
        return rows(h)
          .filter((r) => r.includes("┌─"))
          .map((r) => /┌─ ([^─]+?) ─/.exec(r)![1]!);
      };
      expect(
        await heads(
          "w.rs",
          "pub struct F {}\npub enum E { A }\npub trait T {\n    fn t(&self);\n}\nimpl F {\n    pub fn new() -> Self { F {} }\n}\nfn free() {}\n",
        ),
      ).toEqual(["struct: F", "enum: E", "trait: T", "impl: F", "method: new", "function: free"]);
      expect(
        await heads(
          "w.go",
          "package w\n\ntype S struct{}\n\ntype I interface{}\n\ntype N int\n\nfunc (s S) M() {}\n\nfunc F() {}\n",
        ),
      ).toEqual(["code", "struct: S", "interface: I", "type: N", "method: M", "function: F"]);
      expect(
        await heads(
          "w.ts",
          "interface I {}\ntype T = number;\nenum E { A }\nconst f = () => 1;\nclass C {\n  m(): void {}\n}\nfunction* gen() {}\nabstract class A {}\n",
        ),
      ).toEqual([
        "interface: I",
        "type: T",
        "enum: E",
        "function: f",
        "class: C",
        "method: m",
        "function: gen",
        "class: A",
      ]);
      expect(
        await heads(
          "w.py",
          "def f():\n    pass\n\nclass C:\n    def m(self):\n        pass\n\nclass D:\n    x = 1\n\ndef g():\n    pass\n",
        ),
      ).toEqual(["function: f", "class: C", "method: m", "class: D", "function: g"]);
      expect(
        await heads(
          "w.swift",
          "struct P {\n    func area() -> Int { 1 }\n}\n\ntypealias Size = Int\n\nprotocol Q {\n    func q()\n}\n",
        ),
      ).toEqual(["struct: P", "method: area", "type: Size", "protocol: Q", "method: q"]);
      expect(await heads("m.rs", "mod inner {\n    fn f() {}\n}\n")).toEqual(["module: inner", "function: f"]); // a module's are functions
      expect(await heads("n.cpp", "namespace n {\nint g() { return 1; }\n}\n")).toEqual([
        "namespace: n",
        "function: g",
      ]);
      expect(await heads("w.cpp", "namespace n {\nclass K {\n public:\n  void k();\n};\n}\n")).toEqual([
        "namespace: n",
        "class: K",
        "method: k",
      ]);
      expect(await heads("w.c", "typedef int age;\nint add(int a);\n")).toEqual(["type: age", "function: add"]);
      expect(await heads("w.rb", "class R\n  def self.make\n  end\nend\nmodule M\nend\n")).toEqual([
        "class: R",
        "method: make",
        "module: M",
      ]);
      // The word dimmed, the name bold.
      const h = await open({}, "w2.ts", "function f(): void {}\n");
      const head = h.app.currentLayout(h.app.view!).lines.find((l) => l.spans.some((sp) => sp.text === "function: "))!;
      const word = head.spans.find((sp) => sp.text === "function: ")!;
      expect([word.role, word.attrs & A_BOLD]).toEqual(["dim", 0]);
      const name = head.spans.find((sp) => sp.text === "f")!;
      expect([name.role, name.attrs & A_BOLD]).toEqual(["strong", A_BOLD]); // the text's colour, bold: not the code's
    });
    test("a definition's kind by its node's type, in any grammar", () => {
      const kinds = [
        "function_item",
        "method_declaration",
        "init_declaration",
        "impl_item",
        "trait_item",
        "mod_item",
        "module",
        "namespace_definition",
        "struct_item",
        "type_spec",
        "enum_item",
        "interface_declaration",
        "method",
        "declaration",
        "comment",
      ].map(codeKind);
      expect(kinds).toEqual([
        "function",
        "function",
        "function",
        "class",
        "class",
        "class",
        "class",
        "class",
        "type",
        "type",
        "type",
        "type",
        "function",
        "function",
        undefined,
      ]);
    });
    test("Go: a declaration's comment lines its documentation, its imports folded, a method a cell; tabs as wide as drawn", async () => {
      const go =
        'package main\n\nimport (\n\t"fmt"\n\t"os"\n)\n\n// Run copies the files.\nfunc (u *Upload) Run(dry bool) {\n\tif dry {\n\t\tfmt.Println(os.Args)\n\t}\n}\n';
      const { layout, text } = await view("up.go", go);
      expect(text).toContain("▸ imports  fmt · os (2)");
      expect(cellsOf(layout)).toContain("Run 8–13");
      expect(text).toContain("Run copies the files.");
      expect(text).not.toContain("// Run");
      // Two tabs in: one guide (the first level is the box's border), not three.
      expect(
        text
          .split("\n")
          .find((r) => r.includes("fmt.Println"))!
          .match(/│/g)?.length,
      ).toBe(1 + 1);
    });
    test("Rust: `//!` a module's prose, `///` an item's, its attributes in its cell; `use` folded; an impl's methods its members", async () => {
      const rs =
        "//! The stacker.\n\nuse std::collections::HashMap;\n\n/// One frame.\n#[derive(Debug)]\npub struct Frame {\n    pub n: u32,\n}\n\nimpl Frame {\n    /// Its size.\n    pub fn size(&self) -> u32 {\n        self.n\n    }\n}\n";
      const { layout, text } = await view("lib.rs", rs);
      expect(text).toContain("The stacker.");
      expect(text).not.toMatch(/\/\/[!/]|! The/);
      expect(text).toContain("▸ imports  std::collections::HashMap (1)");
      expect(cellsOf(layout)).toEqual(expect.arrayContaining(["Frame 5–9", "size 12–15"]));
      expect(text).toContain("#[derive(Debug)]");
      // The blank line after `//!` — its comment takes its line's end with it — isn't a cell of its own.
      expect(cellsOf(layout).some((c) => c.startsWith("code 2"))).toBe(false);
    });
    test("Ruby: a class's `end` closes it, as a brace does; C: `#include`s folded", async () => {
      const rb = "# A route.\nclass Route\n  # Reads it.\n  def initialize(path)\n    @path = path\n  end\nend\n";
      const ruby = await view("route.rb", rb);
      expect(cellsOf(ruby.layout).some((c) => c.startsWith("code"))).toBe(false);
      const c = await view("h.c", '#include <stdio.h>\n#include "util.h"\n\nint main(void) { return 0; }\n');
      expect(c.text).toContain("▸ imports  stdio.h · util.h (2)");
      // C++'s class closes with `};`.
      const cpp = await view("w.cpp", "class W {\n public:\n  int n() { return 1; }\n};\n");
      expect(cellsOf(cpp.layout).some((x) => x.startsWith("code"))).toBe(false);
    });
    test("tags in line comments are terms (LuaDoc, Doxygen's `\\param`); PHPDoc's type before its name", async () => {
      const lua = await view(
        "g.lua",
        "--- Greets someone.\n-- @param name who\nlocal function greet(name)\n  return name\nend\n",
      );
      expect(lua.text).toMatch(/name\s+who/);
      expect(lua.text).not.toContain("@param");
      const c = await view("d.c", "/// Adds.\n/// \\param a the first\nint add(int a) { return a; }\n");
      expect(c.text).toMatch(/a\s+the first/);
      const php = await view(
        "g.php",
        "<?php\n/**\n * Greets.\n * @param string $name who\n */\nfunction greet(string $name) { return $name; }\n",
      );
      expect(php.text).toMatch(/\$name\s+who\s+string/);
    });
  });
  describe("a definition's long signature, a parameter a row (24.19)", () => {
    const sig =
      'export function resolveLink(link: LinkRef, fromRel: string, options: ResolveOptions = {}, pick: (a: number, b: number) => number): Target {\n  return go(link, fromRel, options, strict, { depth: 1, seen: new Set<string>(), mode: "strict" }, more, andMore);\n}\n';
    test("each parameter on its own row, four columns in; `)` and the rest at the line's indentation", async () => {
      const h = await open({ width: 80 }, "s.ts", sig);
      const r = rows(h);
      const at = r.findIndex((x) => x.includes("export function resolveLink("));
      // (Past the box's left line.)
      const bare = (x: string) => x.replace(/^[│\s]+/, "").trimEnd();
      expect(r.slice(at, at + 6).map(bare)).toEqual([
        "export function resolveLink(",
        "link: LinkRef,",
        "fromRel: string,",
        "options: ResolveOptions = {},",
        "pick: (a: number, b: number) => number",
        "): Target {",
      ]);
      expect(r[at + 1]!.indexOf("link") - r[at]!.indexOf("export")).toBe(4);
      expect(r[at + 5]!.indexOf(")")).toBe(r[at]!.indexOf("export"));
    });
    test("a Go method: its parameters, not its receiver's; one without parameters, any row", async () => {
      const go =
        "package m\n\nfunc (u *Upload) Run(target string, dryRun bool, verbose bool, retries int, timeout int) error {\n\treturn nil\n}\n\nfunc Long() map[string]map[string]map[string]map[string]map[string]map[string]int {\n\treturn nil\n}\n";
      const h = await open({ width: 80 }, "m.go", go);
      const r = rows(h).map((x) => x.replace(/^[│\s]+/, ""));
      expect(r).toContain("func (u *Upload) Run(");
      expect(r).toContain("target string,");
      expect(r.some((x) => x.endsWith("Long("))).toBe(false);
    });
    test("not a call's arguments; not a signature that fits", async () => {
      const h = await open({ width: 80 }, "s.ts", sig);
      const r = rows(h);
      const call = r.findIndex((x) => x.includes("return go("));
      expect(r[call]!.replace(/^[│\s]+/, "")).not.toBe("return go("); // broken as any row is, filled
      const fits = await open(
        { width: 100 },
        "f.ts",
        "function f(a: number, b: number): number {\n  return a + b;\n}\n",
      );
      expect(rows(fits).some((x) => x.replace(/^[│\s]+/, "") === "function f(a: number, b: number): number {")).toBe(
        true,
      );
    });
  });
  test("a receiver dimmed with its access — `this.`, `self.`, `$this->` — not a bare one, nor one in a string (24.21)", async () => {
    const h = await open(
      {},
      "r.ts",
      'class A {\n  n = 1;\n  get(): A {\n    const s = "this.x";\n    return this.n > 0 ? this : myself.n;\n  }\n}\n',
    );
    const line = h.app.currentLayout(h.app.view!).lines.find((l) => l.spans.some((s) => s.text.includes("return")))!;
    const cells = line.spans.flatMap((s) => [...s.text].map((ch) => ({ ch, dim: !!(s.attrs & A_DIM) })));
    const text = cells.map((c) => c.ch).join("");
    const dimAt = (k: number, n: number) => cells.slice(k, k + n).every((c) => c.dim);
    const first = text.indexOf("this.n");
    expect(dimAt(first, 5)).toBe(true); // `this.`
    expect(cells[first + 5]!.dim).toBe(false); // `n`
    const bare = text.indexOf("? this");
    expect(dimAt(bare + 2, 4)).toBe(false);
    expect(cells[text.indexOf("myself.") + 2]!.dim).toBe(false); // a word ending in `self` isn't one
    const str = h.app.currentLayout(h.app.view!).lines.find((l) => l.spans.some((s) => s.text.includes('"this.x"')))!;
    expect(str.spans.find((s) => s.text.includes("this.x"))!.attrs & A_DIM).toBe(0);
    const php = await open({}, "p.php", "<?php\nclass G {\n  function g() { return $this->prefix; }\n}\n");
    const pl = php.app.currentLayout(php.app.view!).lines.find((l) => l.spans.some((s) => s.text.includes("prefix")))!;
    const pc = pl.spans.flatMap((s) => [...s.text].map((ch) => ({ ch, dim: !!(s.attrs & A_DIM) })));
    const pt = pc.map((c) => c.ch).join("");
    expect(pc.slice(pt.indexOf("$this->"), pt.indexOf("$this->") + 7).every((c) => c.dim)).toBe(true);
    expect(pc[pt.indexOf("prefix")]!.dim).toBe(false);
  });
  describe("a licence header or a generated banner folded, as the imports are (24.22)", () => {
    const mit =
      "// Copyright 2026 Example Co.\n// Permission is hereby granted, free of charge, to any person obtaining a copy\n// of this software.\n\nexport const x = 1;\n";
    test("named where it says one — SPDX's, the MIT text's, what generated it; `enter` opens it, and again folds it", async () => {
      const h = await open({}, "m.ts", mit);
      expect(rows(h)).toContain("▸ license · MIT");
      expect(rows(h).join("\n")).not.toContain("Permission is hereby granted");
      h.app.moveCursor(h.app.view!, {
        row: h.app.currentLayout(h.app.view!).lines.findIndex((l) => l.fold !== undefined),
        col: 0,
      });
      await h.keys("enter");
      expect(rows(h).join("\n")).toContain("Permission is hereby granted");
      expect(rows(h)).toContain("▾ license");
      const spdx = await open(
        {},
        "s.ts",
        "/*\n * SPDX-License-Identifier: Apache-2.0\n * Copyright 2026 X\n */\nexport const y = 2;\n",
      );
      expect(rows(spdx)).toContain("▸ license · Apache-2.0");
      const gen = await open(
        {},
        "g.py",
        "#!/usr/bin/env python3\n# Code generated by protoc-gen-py. DO NOT EDIT.\n# source: a.proto\n\nX = 1\n",
      );
      expect(rows(gen)).toContain("▸ generated · protoc-gen-py");
      const unnamed = await open(
        {},
        "u.ts",
        "// Copyright 2026 X. All rights reserved.\n// Do with it as the licence says.\n\nexport const z = 3;\n",
      );
      expect(rows(unnamed)).toContain("▸ license · 2 lines");
      // Each licence by its words; Rust's line comments, each taking its line's end; PHP's past its opening tag; one
      // right above the imports, folded apart from them.
      const named: [string, string, string][] = [
        [
          "a.ts",
          '// Copyright 2026 X\n// Licensed under the Apache License, Version 2.0 (the "License");',
          "Apache-2.0",
        ],
        ["g.ts", "// Copyright (C) 2026 X\n// under the terms of the GNU General Public License, version 3", "GPL-3.0"],
        ["b.ts", "// Copyright 2026 X\n// Redistribution and use in source and binary forms, with or without", "BSD"],
        [
          "mp.ts",
          "// Copyright 2026 X. This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.\n// If a copy of the MPL was not distributed with this file, you can obtain one.",
          "MPL-2.0",
        ],
        ["r.rs", "// Copyright 2026 X\n// Permission is hereby granted, free of charge, to any person", "MIT"],
      ];
      for (const [file, header, name] of named)
        expect(rows(await open({}, file, `${header}\n\nconst q = 1;\n`))).toContain(`▸ license · ${name}`);
      const php = await open(
        {},
        "g.php",
        "<?php\n// Code generated by protoc-gen-php. DO NOT EDIT.\n// source: g.proto\n\n$x = 1;\n",
      );
      expect(rows(php)).toContain("▸ generated · protoc-gen-php");
      const above = await open(
        {},
        "i.ts",
        `${mit.split("\n\n")[0]}\nimport { a } from "./a.ts";\n\nexport const b = a;\n`,
      );
      expect(rows(above)).toEqual(expect.arrayContaining(["▸ license · MIT", "▸ imports  ./a.ts (1)"]));
    });
    test("not one line, not a comment after code, not one that isn't a licence, not one sharing a line with code", async () => {
      for (const [file, text] of [
        ["one.ts", "// Copyright 2026 X. MIT licensed.\nexport const a = 1;\n"],
        ["late.ts", "export const a = 1;\n// Copyright 2026 X\n// Licensed under MIT.\n"],
        ["prose.ts", "// A note about this file:\n// it is small.\n\nexport const a = 1;\n"],
        ["words.ts", "// Checks each package's license:\n// reads its LICENSE file.\n\nexport const a = 1;\n"],
        ["same.ts", "// Copyright 2026 X\n/* Licensed under the MIT License. */ export const a = 1;\n"],
      ] as const) {
        const h = await open({}, file, text);
        expect(rows(h).some((r) => /license|generated/.test(r) && r.includes("▸"))).toBe(false);
      }
    });
  });
});

describe("code as a document: comments, Python beside TypeScript (24.4, 24.9)", () => {
  const TS = [
    'import { join } from "node:path";',
    "",
    "// ---- Resolving links ----",
    "",
    "/**",
    " * Resolves a link written in a note: the note it reaches, or `null` when nothing matches.",
    " * @param from - the note it's written in",
    " * @param target the link as written",
    " * @returns the link, or null",
    " */",
    "export function resolve(from: string, target: string): Link | null {",
    "  if (!target) return null; // nothing written: nothing to find",
    "  // By name first, then by path: a path is never ambiguous.",
    "  return byName.get(normKey(target)) ?? byPath.get(join(from, target)) ?? byAlias.get(target.toLowerCase()) ?? null;",
    "}",
    "",
    "// ---- The graph ----",
    "",
    "/** The notes of a folder, read once. */",
    "export class Graph {",
    "  /**",
    "   * A note's text, as read.",
    "   *",
    "   * From the cache when it has it.",
    "   */",
    "  textOf(rel: string): string | undefined {",
    "    return this.notes.get(rel);",
    "  }",
    "}",
    "",
  ].join("\n");
  const PY = [
    "from os.path import join",
    "",
    "# ---- Resolving links ----",
    "",
    "",
    "def resolve(from_: str, target: str) -> Link | None:",
    '    """Resolves a link written in a note: the note it reaches,',
    "    or ``None`` when nothing matches.",
    "",
    "    Args:",
    "        from_: the note it's written in",
    "        target: the link as written",
    "",
    "    Returns:",
    "        the link, or None",
    '    """',
    "    if not target:",
    "        return None  # nothing written: nothing to find",
    "    # By name first, then by path: a path is never ambiguous.",
    "    return by_name.get(norm_key(target)) or by_path.get(join(from_, target)) or by_alias.get(target.lower())",
    "",
    "",
    "# ---- The graph ----",
    "",
    "",
    "class Graph:",
    '    """The notes of a folder, read once."""',
    "",
    "    def text_of(self, rel: str) -> str | None:",
    '        """A note\'s text, as read.',
    "",
    "        From the cache when it has it.",
    '        """',
    "        return self.notes.get(rel)",
    "",
  ].join("\n");
  const open = async (file: string, text: string, config?: (c: Config) => void) => {
    const root = makeVault();
    writeFileSync(join(root, file), text);
    const h = await harness({
      root,
      open: file,
      width: 100,
      height: 60,
      config: (c) => ((c.ui.sidebar = false), config?.(c)),
    });
    for (let i = 0; i < 200 && h.app.view!.buf.syntax?.version !== h.app.view!.buf.version; i++) {
      h.frame();
      await Bun.sleep(10);
    }
    return h;
  };
  const rows = (h: Harness) => {
    const frame = h.frame();
    const pane = h.app.geometry!.panes[0]!;
    return frame
      .split("\n")
      .slice(pane.y, pane.y + pane.h)
      .map((r) =>
        [...r]
          .slice(pane.textX, pane.x + pane.w - 1)
          .join("")
          .trimEnd(),
      );
  };

  test("the same function and class in TypeScript and Python read alike: sections, docs above their cells, notes, prose comments", async () => {
    const ts = rows(await open("links.ts", TS));
    const py = rows(await open("links.py", PY));
    const at = (r: string[], text: string) => r.findIndex((x) => x.includes(text));
    // A separator comment: a section's rule with its title, in both.
    for (const r of [ts, py])
      expect(r.slice(at(r, "Resolving links") - 1, at(r, "Resolving links") + 3)).toEqual([
        "",
        expect.stringMatching(/^── Resolving links ─+$/),
        "",
        expect.stringMatching(/^┌─ function: resolve /),
      ]); // a blank row each side
    // In the cell, its documentation — Python's docstring too, above the code — as prose, then the same terms; a
    // divider; its code.
    const inBox = (x: string) =>
      x
        .replace(/^[ │├└┤─]*/, "")
        .replace(/ *│$/, "")
        .trim()
        .replace(/\s+/g, " ");
    const doc = (r: string[]) => {
      const head = at(r, "function: resolve");
      const code = r.findIndex((x, i) => i > head && /^│ (export function|def) resolve/.test(x));
      return {
        prose: r
          .slice(head + 1, code)
          .map(inBox)
          .filter((x) => x),
        head,
        code,
      };
    };
    expect(doc(ts).prose).toEqual([
      "Resolves a link written in a note: the note it reaches, or null when nothing matches.",
      "from the note it's written in",
      "target the link as written",
      "returns the link, or null",
    ]);
    // Its lines as its author wrapped them: the docstring's first paragraph on two.
    expect(doc(py).prose).toEqual([
      "Resolves a link written in a note: the note it reaches,",
      "or None when nothing matches.",
      "from_ the note it's written in",
      "target the link as written",
      "returns the link, or None",
    ]);
    expect(ts[doc(ts).head]).toMatch(/^┌─ function: resolve ─+ 5–15 ⇢ ⧉ ✎ ◎ ▾ ──$/);
    expect(py[doc(py).head]).toMatch(/^┌─ function: resolve ─+ 6–20 ⇢ ⧉ ✎ ◎ ▾ ──$/);
    for (const r of [ts, py]) expect(r[doc(r).code - 1]).toBe("│"); // a blank row between its documentation and its code
    expect(ts[doc(ts).code]).toMatch(/^│ export function resolve\(from: string, target: string\): Link \| null \{$/);
    expect(py[doc(py).code]).toMatch(/^│ def resolve\(from_: str, target: str\) -> Link \| None:$/);
    // In the cell: a comment after code a note, its marker gone; a comment line prose, its marker gone.
    expect(ts[at(ts, "nothing written")]).toMatch(
      /^│ {3}if \(!target\) return null; +nothing written: nothing to find$/,
    );
    expect(py[at(py, "nothing written")]).toMatch(/^│ {5}│ {3}return None +nothing written: nothing to find$/);
    expect(ts[at(ts, "By name first")]).toMatch(/^│ {3}By name first, then by path: a path is never ambiguous\.$/);
    expect(py[at(py, "By name first")]).toMatch(/^│ {5}By name first, then by path: a path is never ambiguous\.$/);
    for (const r of [ts, py]) expect(r.some((x) => /\/\/|#|"""|\/\*\*/.test(x))).toBe(false); // no marker anywhere
    // A long line breaks before its operator, in both: `??`, `or`.
    expect(ts[at(ts, "byAlias")]).toMatch(/^│ {7}\?\? byAlias\.get/);
    expect(py[at(py, "by_alias")]).toMatch(/^│ {9}or by_alias\.get/);
    // The class: its doc in its cell; its method's in the method's, both paragraphs prose (a docstring's indentation
    // isn't markdown's code).
    for (const r of [ts, py]) {
      expect(inBox(r[at(r, "class: Graph") + 2]!)).toBe("The notes of a folder, read once."); // under the blank row
      const m = at(r, "method: text");
      // The class's one member, the line to its top — on past it to the class's closing brace in TypeScript; Python's
      // class has none.
      expect(r[m]).toMatch(/^│ ┌─ method: text_?[oO]f ─/);
      expect(r[m + 1]).toBe(r === ts ? "├─┤" : "└─┤");
      expect(r.slice(m + 2, m + 5).map(inBox)).toEqual([
        "A note's text, as read.",
        "",
        "From the cache when it has it.",
      ]);
      expect(r[m + 5]).toBe(r === ts ? "│ │" : "  │"); // a blank row before its code, no divider
    }
  });

  test("the sections head the outline's definitions; a docstring's rows keep their lines", async () => {
    const h = await open("links.py", PY);
    const layout = h.app.currentLayout(h.app.view!);
    expect(layout.headings.map((x) => `${x.level} ${x.text}`)).toEqual([
      "1 Resolving links",
      "2 resolve",
      "1 The graph",
      "2 Graph",
      "3 text_of",
    ]);
    // The docstring drawn above `def`, each row on its own line: its first, its terms'.
    const doc = layout.lines.filter((l) => l.src >= 7 && l.src <= 16);
    expect(doc[0]!.src).toBe(7);
    expect(layout.lines.findIndex((l) => l.src === 7)).toBeLessThan(
      layout.lines.findIndex((l) => l.src === 6 && l.srcMap),
    );
    expect(layout.lines.find((l) => l.spans.some((s) => s.text.startsWith("from_")))!.src).toBe(11);
  });

  test("the headings are the outline's, as source mode's: a function inside a function, an impl by its name — the breadcrumb the same in both", async () => {
    const RS = [
      "pub struct Point {",
      "    pub lat: f64,",
      "}",
      "",
      "impl Point {",
      "    pub fn new(lat: f64) -> Point {",
      "        fn clamp(x: f64) -> f64 {",
      "            x.max(-90.0).min(90.0)",
      "        }",
      "        Point { lat: clamp(lat) }",
      "    }",
      "}",
      "",
    ].join("\n");
    const h = await open("point.rs", RS);
    const v = h.app.view!;
    expect(v.source).toBeFalsy(); // the code view
    const crumbAt = (line: number) => {
      const layout = h.app.currentLayout(v);
      h.app.moveCursor(v, { row: layout.lines.findIndex((l) => l.src === line && l.srcMap), col: 0 });
      return h.app.outlineView.breadcrumb(v).map((c) => c.text);
    };
    const inView = crumbAt(8);
    expect(h.app.currentLayout(v).headings.map((x) => `${x.level} ${x.text}`)).toEqual([
      "1 Point",
      "1 impl Point",
      "2 new",
      "3 clamp",
    ]);
    expect(inView).toEqual(["impl Point", "new", "clamp"]);
    await h.app.run("view.source");
    expect(v.source).toBe(true);
    expect(crumbAt(8)).toEqual(inView);
  });

  test("a comment for tools, and code put aside, stay as written; a note's run lines up; a block of comment lines keeps its lines", async () => {
    const ts = rows(
      await open(
        "c.ts",
        [
          "// eslint-disable-next-line no-console",
          'console.log("x");',
          "// const old = compute(1);",
          "// A plain note",
          "// over two lines.",
          "const a = 1; // first",
          "const bb = 22; // second",
          "// ==== Tail ====",
          "const y = 1;",
          "",
          "// Adds one, as Go documents a function.",
          "function inc(x: number) { return x + 1; }",
          "",
        ].join("\n"),
      ),
    );
    expect(ts).toContain("// eslint-disable-next-line no-console");
    expect(ts).toContain("// const old = compute(1);");
    expect(ts[ts.indexOf("// const old = compute(1);") - 1]).toBe(""); // after a box, a blank row: no box follows it
    // Once, however many rows follow that aren't boxes; imports too.
    const kept = rows(
      await open(
        "k.ts",
        [
          "const a = 1;",
          "// eslint-disable-next-line no-console",
          "// @ts-expect-error",
          'import { x } from "y";',
          "",
        ].join("\n"),
      ),
    );
    const at = kept.indexOf("// eslint-disable-next-line no-console");
    expect(kept.slice(at - 2, at + 4)).toEqual([
      "│ const a = 1;",
      "",
      "// eslint-disable-next-line no-console",
      "// @ts-expect-error",
      "▸ imports  y (1)",
      "",
    ]);
    const imp = rows(await open("i.ts", ["const a = 1;", 'import { x } from "y";', ""].join("\n")));
    expect(imp.slice(imp.indexOf("│ const a = 1;"), imp.indexOf("│ const a = 1;") + 3)).toEqual([
      "│ const a = 1;",
      "",
      "▸ imports  y (1)",
    ]);
    const plain = ts.indexOf("│ A plain note");
    expect(ts.slice(plain, plain + 2)).toEqual(["│ A plain note", "│ over two lines."]); // its own box, its lines as written
    const a = ts.find((x) => x.includes("first"))!;
    const b = ts.find((x) => x.includes("second"))!;
    expect(a.indexOf("first")).toBe(b.indexOf("second")); // one column for the run's notes
    expect(a).toMatch(/^│ const a = 1; +first$/);
    expect(ts[ts.indexOf(a) - 2]).toMatch(/^┌─ • a · bb ─/); // the values together, one cell
    // Comment lines right above a definition document it: in its cell, a blank row between them and its code.
    const inc = ts.findIndex((x) => x.includes("function: inc"));
    expect(ts.slice(inc, inc + 5)).toEqual([
      expect.stringMatching(/^┌─ function: inc ─+ 11–12 /),
      "│",
      "│ Adds one, as Go documents a function.",
      "│",
      expect.stringMatching(/^│ function inc/),
    ]);
    // A section right after code: a blank row before its rule all the same.
    expect(ts[ts.findIndex((x) => x.includes("── Tail"))! - 1]).toBe("");
    const py = rows(
      await open(
        "t.py",
        ["#!/usr/bin/env python3", "# -*- coding: utf-8 -*-", "x = os.environ  # type: ignore", ""].join("\n"),
      ),
    );
    expect(py.slice(0, 2)).toEqual(["#!/usr/bin/env python3", "# -*- coding: utf-8 -*-"]);
    expect(py.some((x) => /^│ x = os\.environ {2}# type: ignore$/.test(x))).toBe(true); // a directive after code: as written, no note
  });
});

describe("source files through tree-sitter (16.6–16.9)", () => {
  const TS =
    "export class Box {\n  open(): void {}\n}\n\nfunction wrap(x: number) {\n  const s = `one\ntwo ${x}\nthree`;\n  return s;\n}\n";
  // The grammar loads lazily, then the pass runs from a timer: wait for both.
  const settle = async (h: Harness) => {
    for (let i = 0; i < 100 && h.app.view!.buf.syntax?.version !== h.app.view!.buf.version; i++) {
      h.frame();
      await Bun.sleep(10);
    }
    h.frame();
  };
  test("the outline and breadcrumb come from the grammar; a template string's middle lines are string", async () => {
    const root = makeVault();
    writeFileSync(join(root, "box.ts"), TS);
    // Source mode, as [render] code = "source" opens code (the code view, 24.x, has tests of its own).
    const h = await harness({ root, open: "box.ts", width: 100, config: (c) => (c.render.code = false) });
    const v = h.app.view!;
    expect(v.source).toBe(true);
    await settle(h);
    const layout = h.app.currentLayout(v);
    expect(layout.headings.map((x) => [x.level, x.text])).toEqual([
      [1, "Box"],
      [2, "open"],
      [1, "wrap"],
    ]);
    const two = layout.lines.find((l) => l.src === 7)!; // `two ${x}`: highlight.js alone can't tell
    expect(two.spans.find((s) => s.text.includes("two"))!.role).toBe("syn_string");
    h.app.moveCursor(v, { row: layout.lines.findIndex((l) => l.src === 3), col: 0 });
    h.app.moveCursor(v, { row: 1, col: 2 });
    expect(h.frame()).toMatch(/Box\s*›\s*open/);
  });
  test("a syntax error is marked out of insert, the status line counting it", async () => {
    const root = makeVault();
    writeFileSync(join(root, "bad.py"), "def f(:\n    pass\n\nx = 1\n");
    const h = await harness({ root, open: "bad.py", width: 100, config: (c) => (c.render.code = false) });
    await settle(h);
    const errs = h.app.view!.buf.syntax!.errors;
    expect(errs.length).toBeGreaterThan(0);
    const marked = (c: TextCanvas) => c.styles.some((r) => r.some((st) => st?.underline && st.fg !== "default"));
    expect(marked(h.canvas())).toBe(true);
    expect(statusRow(h.frame())).toMatch(/✖ \d+ /); // how many: what it says is the Problems panel's
    // Typing: no marks (a half-typed line is broken anyway); the fix clears them once it settles.
    await h.keys("A");
    expect(marked(h.canvas())).toBe(false);
    await h.keys("escape", "g", "g", "0", "f", "(", "a", "x", ")", "escape");
    await settle(h);
    expect(h.app.view!.buf.source.startsWith("def f(x):")).toBe(true);
    expect(h.app.view!.buf.syntax!.errors).toEqual([]);
    expect(statusRow(h.frame())).not.toContain("✖");
  });
});

describe("YAML and JSON as a tree (16.12)", () => {
  test("guides at every depth; branches in the outline and breadcrumb; a $ref's JSON pointer followed", async () => {
    const root = makeVault();
    writeFileSync(
      join(root, "deploy.yaml"),
      "service: nightjar\ncontainers:\n  - name: api\n    health:\n      path: /v2/health\n      probe: {interval_s: 10}\n  - name: backup\nports: [8080]\n",
    );
    writeFileSync(
      join(root, "api.json"),
      '{\n  "paths": {\n    "/f": { "$ref": "#/components/schemas/Frame" }\n  },\n  "components": {\n    "schemas": {\n      "Other": { "type": "string" },\n      "Frame": { "type": "object" }\n    }\n  }\n}\n',
    );
    const h = await harness({ root, open: "deploy.yaml", width: 100 });
    const v = h.app.view!;
    const f = h.frame();
    expect(f).toMatch(/ containers\n.*├─ 1\n.*│  ├─ name  api/);
    expect(f).toMatch(/│  └─ health\n.*│     ├─ path   \/v2\/health/);
    expect(f).toMatch(/ ports\s+\[8080\]/); // a top-level key after the nested ones: at the top again
    expect(h.app.currentLayout(v).headings.map((x) => [x.level, x.text])).toEqual([
      [1, "containers"],
      [2, "1"],
      [3, "health"],
      [2, "2"],
    ]);
    h.app.moveCursor(v, { row: h.app.currentLayout(v).lines.findIndex((l) => l.src === 5), col: 0 });
    expect(h.frame()).toMatch(/containers\s*›\s*1\s*›\s*health/);
    // The lens holds a card — a key and the plain values under it — and moves card to card.
    const lens = () => /source · lines? (\d+(?:–\d+)?)/.exec(h.frame())?.[1] ?? "none";
    h.app.moveCursor(v, { row: h.app.currentLayout(v).lines.findIndex((x) => x.src === 4), col: 0 });
    await h.keys("space", "n", "l");
    expect(lens()).toBe("4–6"); // health, with path and probe
    await h.keys("j", "j", "j");
    expect(lens()).toBe("7"); // the second container
    await h.keys("escape", "escape");
    await h.app.run("note.open api.json");
    const l = h.app.currentLayout(v).links.find((x) => x.target.startsWith("#/"))!;
    h.app.moveCursor(v, { row: l.line, col: l.col });
    await h.keys("enter");
    expect(rowText(h)).toContain("Frame"); // the pointer's row, not "Other"
  });
});

describe("a component in the TUI (16.22)", () => {
  test("a Vue file: its template, script and style in the outline, each part's definitions under it; each line coloured in its part's language", async () => {
    const root = makeVault();
    writeFileSync(
      join(root, "Card.vue"),
      '<template>\n  <h2 id="card">const</h2>\n</template>\n<script setup lang="ts">\nconst n = 1;\nfunction go(): void {}\n</script>\n<style>\n.a { color: red; }\n</style>\n',
    );
    const h = await harness({ root, open: "Card.vue", width: 100 });
    const v = h.app.view!;
    // Its grammar and its parts' (TypeScript, CSS) load first: until then, markup throughout.
    for (let i = 0; i < 200 && v.buf.syntax?.version !== v.buf.version; i++) {
      h.frame();
      await Bun.sleep(10);
    }
    expect(h.app.outlineView.rows().map((r) => `${r.level}:${r.text}`)).toEqual([
      "1:template",
      "2:const",
      '1:script setup lang="ts"',
      "2:go",
      "1:style",
      "2:.a",
    ]);
    expect([...v.buf.syntax!.languages]).toEqual([
      [5, "typescript"],
      [6, "typescript"],
      [9, "css"],
    ]);
    const role = (line: number, word: string) =>
      h.app
        .currentLayout(v)
        .lines.find((l) => l.src === line)!
        .spans.find((sp) => sp.text.includes(word))?.role;
    expect(role(5, "const")).toBe("syn_keyword"); // the script's line, as TypeScript
    expect(role(2, "const")).not.toBe("syn_keyword"); // the template's text, as markup
  });
});

describe("links in code comments in the TUI (16.10)", () => {
  test("a comment's path is drawn as a link; enter opens it, `path:line` at that line", async () => {
    const root = makeVault();
    writeFileSync(join(root, "lib.py"), "a = 1\nb = 2\nc = 3\n");
    writeFileSync(join(root, "run.py"), "# see lib.py:3 and notes/alpha.md\nx = 1\n");
    const h = await harness({ root, open: "run.py", width: 100, config: (c) => (c.render.code = false) });
    const v = h.app.view!;
    for (let i = 0; i < 100 && v.buf.syntax?.version !== v.buf.version; i++) {
      h.frame();
      await Bun.sleep(10);
    }
    expect(v.buf.syntax!.links.map((l) => l.target)).toEqual(["lib.py", "notes/alpha.md"]);
    const c = h.canvas();
    const y = c.rows.findIndex((r) => r.join("").includes("# see lib.py"));
    const x = c.line(y).indexOf("lib.py");
    expect(c.styles[y]![x]!.underline).toBe(true); // the link role
    h.app.moveCursor(v, { row: 0, col: 7 });
    await h.keys("enter");
    expect(v.buf.rel).toBe("lib.py");
    expect(h.app.currentLayout(v).lines[v.cur.row]!.src).toBe(3);
    await h.app.run("history.back");
    h.app.moveCursor(v, { row: 0, col: 20 });
    await h.keys("enter");
    expect(v.buf.rel).toBe("notes/alpha.md");
  });
});

describe("a data file that doesn't parse, opened (16.14)", () => {
  test("opens in source mode with its error said, once each time: at the start, by :e, from a link", async () => {
    const root = makeVault();
    writeFileSync(join(root, "bad.json"), '{"a": }\n');
    writeFileSync(join(root, "to-bad.md"), "# T\n\n[bad](bad.json)\n");
    const said = (h: Harness) => h.app.messages.filter((m) => m.text.includes("bad.json doesn't parse")).length;
    const h = await harness({ root, open: "bad.json" });
    const v = h.app.view!;
    expect(v.source).toBe(true);
    expect(said(h)).toBe(1);
    await h.app.run("note.open to-bad.md");
    expect(v.source).toBe(false); // a note renders again
    await h.app.run("note.open bad.json"); // :e takes a file's path too
    expect([v.buf.rel, v.source, said(h)]).toEqual(["bad.json", true, 2]);
    await h.app.run("history.back");
    const l = h.app.currentLayout(v).links[0]!;
    h.app.moveCursor(v, { row: l.line, col: l.col });
    await h.keys("enter");
    expect([v.buf.rel, v.source, said(h)]).toEqual(["bad.json", true, 3]);
  });
});

describe("links out of data files in the TUI (16.15)", () => {
  test("a value that is a path is a link: coloured, followed with enter", async () => {
    const root = makeVault();
    writeFileSync(join(root, "app.toml"), '[api]\ndocs = "notes/alpha.md"\nname = "plain"\n');
    const h = await harness({ root, open: "app.toml", width: 100 });
    const v = h.app.view!;
    const layout = h.app.currentLayout(v);
    expect(layout.links.map((l) => [l.target, l.status])).toEqual([["notes/alpha.md", "resolved"]]);
    const l = layout.links[0]!;
    h.app.moveCursor(v, { row: l.line, col: l.col });
    await h.keys("enter");
    expect(v.buf.rel).toBe("notes/alpha.md");
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

describe("word count, save all, the change list, moving lines", () => {
  test("words in the status line, the selection's in visual mode; note info; frontmatter not counted", async () => {
    const { countWords } = await import("../src/core/foundation/text/words.ts");
    expect(countWords("# Title\n\n- one two, three's\n| a | b |\n")).toBe(6);
    expect(countWords("---\ntitle: x y\n---\nhello world\n", true)).toBe(2);
    expect(countWords("日本語のノート")).toBe(7);
    expect(countWords("日本語、ノート。")).toBe(6); // punctuation is no word
    const root = makeVault();
    writeFileSync(join(root, "w.md"), "one two three\nfour five\n");
    const h = await harness({ root, open: "w.md", width: 120 });
    expect(statusRow(h.frame())).toContain("5 words");
    await h.keys("space", "n", "v", "v", "e", "e");
    expect(statusRow(h.frame())).toContain("2 words selected");
    await h.keys("escape");
    await h.app.run("note.info");
    expect(h.frame()).toMatch(/words\s+5/);
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

describe("lazy loading (16.6)", () => {
  test("a module arriving lays out again the notes laid out while it loaded (a Mermaid diagram as its code, 12.10) — no other", async () => {
    const root = makeVault();
    writeFileSync(join(root, "lazy.md"), "# L\n\nText.\n");
    const h = await harness({ root, open: "lazy.md" });
    const before = h.app.currentLayout(h.app.view!);
    expect(h.app.currentLayout(h.app.view!)).toBe(before); // kept while nothing changes
    // Something else arriving (a grammar): the note didn't wait for it, its layout kept — a big one isn't laid out whole.
    await load(`a-module-${Math.random()}`, async () => 1);
    expect(h.app.currentLayout(h.app.view!)).toBe(before);
    // What it waited for: laid out again.
    const name = `a-module-${Math.random()}`;
    before.pending = [name];
    await load(name, async () => 1);
    expect(h.app.currentLayout(h.app.view!)).not.toBe(before);
  });
});

describe("questions float in a window of their own", () => {
  const ask = (h: Harness) => h.app.overlay as import("../src/tui/app/runtime/app.ts").PromptOverlay;
  const click = (h: Harness, x: number, y: number) => {
    h.app.mouse.handle({ type: "down", x, y, button: 0 });
    h.app.mouse.handle({ type: "up", x, y, button: 0 });
  };
  const clickHot = (h: Harness, id: string) => {
    const r = h.app.geometry!.hot.find((x) => x.id === id)!;
    click(h, r.x + 1, r.y);
  };

  test("a prompt: the question, the answer typed under it, OK and Cancel clicked; outside it cancels; too small: the status line", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    await h.keys("ctrl+n");
    const d = h.app.geometry!.dialog!;
    for (const ch of "fresh") await h.keys(ch);
    const f = h.frame().split("\n");
    expect(f[d.y + 2]).toContain("new note in notes/");
    expect(f[d.y + 3]).toContain("› fresh");
    expect(f.slice(d.y, d.y + d.h).join("\n")).toMatch(/OK {2}enter.*Cancel {2}esc/);
    expect(f.at(-1)).toContain("READ"); // the status line stays
    // A long answer keeps its end in view.
    for (const ch of "-and-a-rather-long-name-to-type-in-here-far-past-the-width-of-the-window-and-its-end")
      await h.keys(ch);
    expect(h.frame().split("\n")[d.y + 3]).toContain("its-end");
    clickHot(h, "dlg:cancel");
    expect(h.app.overlay).toBeNull();
    expect(
      existsSync(
        join(
          root,
          "notes",
          "fresh-and-a-rather-long-name-to-type-in-here-far-past-the-width-of-the-window-and-its-end.md",
        ),
      ),
    ).toBe(false);
    // OK, clicked: done.
    await h.keys("ctrl+n");
    for (const ch of "fresh") await h.keys(ch);
    clickHot(h, "dlg:ok");
    expect(existsSync(join(root, "notes", "fresh.md"))).toBe(true);
    // A click outside the window cancels.
    await h.keys("escape", "ctrl+n");
    for (const ch of "other") await h.keys(ch);
    click(h, 1, h.app.geometry!.dialog!.y + h.app.geometry!.dialog!.h + 2);
    expect(h.app.overlay).toBeNull();
    expect(existsSync(join(root, "notes", "other.md"))).toBe(false);
    // A screen too small for the window: over the status line, as before.
    const small = await harness({ root, open: "notes/alpha.md", height: 8 });
    await small.keys("ctrl+n");
    expect(small.app.geometry!.dialog ?? null).toBeNull();
    expect(statusRow(small.frame())).toContain("new note in notes/");
  });

  test("a yes-or-no: y and n answer, the buttons too; enter isn't an answer", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    let asked = 0;
    const said: { v: boolean | null } = { v: null };
    const question = () => {
      asked++;
      h.app.overlays.confirm(
        "Really?",
        () => (said.v = true),
        () => (said.v = false),
      );
    };
    question();
    let f = h.frame().split("\n");
    const d = h.app.geometry!.dialog!;
    expect(f[d.y + 2]).toContain("Really?");
    expect(f.slice(d.y, d.y + d.h).join("\n")).not.toContain("›"); // nothing to type
    await h.keys("enter", "x");
    expect(ask(h).confirm).toBe(true);
    await h.keys("n");
    expect(said.v).toBe(false);
    question();
    await h.keys("y");
    expect(said.v).toBe(true);
    question();
    h.frame();
    clickHot(h, "dlg:cancel");
    expect(said.v).toBe(false);
    question();
    h.frame();
    clickHot(h, "dlg:ok");
    expect(said.v).toBe(true);
    expect(asked).toBe(4);
    // Too small to float: the status line says how to answer.
    const small = await harness({ root, open: "notes/alpha.md", height: 8 });
    small.app.overlays.confirm("Really?", () => {});
    f = small.frame().split("\n");
    expect(f.at(-1)).toContain("Really? y / n");
  });

  test("ctrl+shift+n makes a folder, as space d n does", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    await h.keys("ctrl+shift+n");
    expect(ask(h).label).toBe("new folder in notes/");
    for (const ch of "ideas") await h.keys(ch);
    await h.keys("enter");
    expect(existsSync(join(root, "notes", "ideas"))).toBe(true);
  });
});

describe("big notes (15.1)", () => {
  test("a big note parses on other threads: its first frame says so, a key waits for it, a click is dropped; its place kept", async () => {
    const root = makeVault();
    // 16,000 lines, 700 KB: a heading every 80 lines.
    const text = Array.from({ length: 8000 }, (_, i) =>
      i % 40 === 0
        ? `## Part ${i}\n`
        : `Line ${i} of the big note, with [[alpha]] and enough words to fill a row or so of it.\n`,
    ).join("\n");
    writeFileSync(join(root, "big.md"), text);
    const h = await harness({ root, open: null });
    h.app.open("big.md", { heading: null, headingIndex: 0, offset: 0, line: 6001 });
    expect(h.frame()).toContain("reading big.md — 16,000 lines…");
    const buf = h.app.view!.buf;
    expect(buf.parsing).not.toBeNull();
    // Nothing parses it here meanwhile: the footnotes view waits; a click on the placeholder is dropped.
    expect(h.app.footnotes.list()).toEqual([]);
    expect((buf as unknown as { parsedVersion: number }).parsedVersion).not.toBe(buf.version);
    const y = h
      .frame()
      .split("\n")
      .findIndex((r) => r.includes("reading big.md"));
    h.app.mouse.handle({ type: "down", x: 40, y, button: 0 });
    h.app.mouse.handle({ type: "up", x: 40, y, button: 0 });
    // A key waits for the parse, then acts on the note, where it was opened.
    const pressed = h.keys("j");
    expect(buf.parsing).not.toBeNull();
    const f = await pressed;
    expect(buf.parsing).toBeNull();
    expect(f).toContain("Part 3000");
    expect(f).not.toContain("reading big.md");
    const v = h.app.view!;
    // Where it was opened: line 6001 in view (a few rows above it kept, as scrolloff says).
    expect(h.app.currentLayout(v).lines[v.top]!.src).toBeGreaterThan(5990);
    expect(h.app.currentLayout(v).lines[v.top]!.src).toBeLessThanOrEqual(6001);
    // The key moved the cursor from there: one row down from line 6001's.
    expect(v.cur.row).toBe(h.app.currentLayout(v).lines.findIndex((l) => l.src === 6001) + 1);
    // An edit's parse is small: done here, at once — no placeholder.
    await h.keys("space", "n", "v", "shift+a", "!", "escape");
    await h.keys("space", "n", "v");
    expect(buf.parsing).toBeNull();
    expect(h.frame()).not.toContain("reading big.md");
  });
});

describe("lines inside a rendered paragraph (a regression)", () => {
  test("goto a line whose paragraph joins it with others on one row: the cursor on that line's text, the status saying it", async () => {
    const root = makeVault();
    writeFileSync(join(root, "p.md"), "# P\n\nfirst line\nsecond line\nthird line\n");
    const h = await harness({ root, open: "p.md" });
    await h.app.run("cursor.goto_line 4");
    expect(h.app.cursorLine(h.app.view!)).toBe(4);
    expect(statusRow(h.frame())).toMatch(/ L4:\d+ /);
    await h.app.run("cursor.goto_line 5");
    expect(h.app.cursorLine(h.app.view!)).toBe(5);
  });
});

describe("embeds in the TUI (1.11)", () => {
  const setup = async () => {
    const root = makeVault();
    mkdirSync(join(root, "sub"), { recursive: true });
    writeFileSync(join(root, "host.md"), "# Host\n\n![inner](sub/inner.md)\n\nAfter.\n");
    writeFileSync(
      join(root, "sub", "inner.md"),
      "# Inner\n\nSee [the sibling](sibling.md), and [Deep](#deep).\n\n## Deep\n\nbottom\n",
    );
    writeFileSync(join(root, "sub", "sibling.md"), "# Sibling\n");
    return { root, h: await harness({ root, open: "host.md" }) };
  };
  const linkAt = (h: Harness, text: string) => h.app.currentLayout(h.app.view!).links.findIndex((l) => l.text === text);
  const follow = async (h: Harness, i: number) => {
    const l = h.app.currentLayout(h.app.view!).links[i]!;
    h.app.moveCursor(h.app.view!, { row: l.line, col: l.col });
    await h.keys("enter");
  };

  test("drawn in place; its links followed from where it is; its header opens it", async () => {
    const { h } = await setup();
    expect(h.frame()).toContain("▎ See the sibling, and Deep.");
    await follow(h, linkAt(h, "the sibling"));
    expect(h.app.view!.buf.rel).toBe("sub/sibling.md"); // beside the embedded note, not the host
    await h.keys("ctrl+o");
    await follow(h, linkAt(h, "Deep"));
    expect(h.app.view!.buf.rel).toBe("sub/inner.md"); // #deep is the embedded note's heading
    expect(statusRow(h.frame())).toMatch(/ L5:/);
    await h.keys("ctrl+o");
    await follow(h, linkAt(h, "inner"));
    expect(h.app.view!.buf.rel).toBe("sub/inner.md");
  });

  test("a [[#Heading]] wikilink inside an embed opens the embedded note at its heading, not the host's", async () => {
    const root = makeVault();
    writeFileSync(join(root, "host.md"), "# Host\n\n![[inner]]\n\n## Deep\n\nthe host's own\n");
    writeFileSync(join(root, "inner.md"), "# Inner\n\nOn to [[#Deep]].\n\n## Deep\n\nbottom\n");
    const h = await harness({ root, open: "host.md" });
    const l = h.app.currentLayout(h.app.view!).links.find((x) => x.kind === "wiki" && x.heading === "Deep")!;
    h.app.moveCursor(h.app.view!, { row: l.line, col: l.col });
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("inner.md");
    expect(statusRow(h.frame())).toMatch(/ L5:/);
  });

  test("the embedded note changed — on disk, or saved here — and the note showing it shows it now", async () => {
    const { root, h } = await setup();
    // On disk, as the watcher tells the graph.
    writeFileSync(join(root, "sub", "inner.md"), "# Inner\n\nrewritten by an agent\n");
    const st = statSync(join(root, "sub", "inner.md"));
    h.app.graph.updateFile("sub/inner.md", {
      rel: "sub/inner.md",
      abs: join(root, "sub", "inner.md"),
      size: st.size,
      mtimeMs: st.mtimeMs,
    });
    expect(h.frame()).toContain("▎ rewritten by an agent");
    // Saved here, in another tab.
    await h.app.run("tab.new");
    await h.app.run("note.open sub/inner.md");
    await h.keys(
      "space",
      "n",
      "v",
      "shift+g",
      "o",
      ...[..."and a line"].map((c) => (c === " " ? "space" : c)),
      "escape",
      "ctrl+s",
    );
    await h.app.run("tab.prev");
    expect(h.frame()).toContain("▎ rewritten by an agent and a line"); // one paragraph
  });
});

describe("regression: :e of a file written a moment ago", () => {
  test("opens it though the vault hasn't heard of it yet (the watcher not yet told); nothing outside the vault", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    writeFileSync(join(root, "fresh.ts"), "export const x = 1;\n");
    writeFileSync(join(root, "fresh-note.md"), "# Fresh\n");
    expect(h.app.graph.filePaths()).not.toContain("fresh.ts"); // no watcher here: unknown, as in the race
    await h.app.run("note.open fresh.ts");
    expect(h.app.view!.buf.rel).toBe("fresh.ts");
    await h.app.run("note.open fresh-note.md");
    expect(h.app.view!.buf.rel).toBe("fresh-note.md");
    // Nor one the walk leaves out: it opens (D249), but it isn't the vault's.
    mkdirSync(join(root, "node_modules"), { recursive: true });
    writeFileSync(join(root, "node_modules", "dep.ts"), "");
    await h.app.run("note.open node_modules/dep.ts");
    expect(h.app.view!.buf.abs).toBe(join(root, "node_modules", "dep.ts"));
    expect(h.app.view!.buf.rel).toBeNull();
    expect(h.app.graph.filePaths()).not.toContain("node_modules/dep.ts");
    writeFileSync(join(dirname(root), "outside.ts"), "");
    await h.app.run("note.open ../outside.ts");
    expect(h.app.view!.buf.abs).toBe(join(root, "node_modules", "dep.ts"));
    expect(h.app.messages.at(-1)!.text).toBe('no note or file "../outside.ts"');
  });
});

test("the converter from the TUI (20.1): previewed; an ambiguous link's row picks its note, then it's planned again; enter writes it", async () => {
  const root = makeVault();
  writeFileSync(join(root, "conv.md"), "See [[beta]] and [[dup]].\n");
  mkdirSync(join(root, "x"));
  mkdirSync(join(root, "y"));
  writeFileSync(join(root, "x", "dup.md"), "# X\n");
  writeFileSync(join(root, "y", "dup.md"), "# Y\n");
  const h = await harness({ root, open: "conv.md" });
  h.app.graph.build(true);
  await h.app.run("link.convert conv");
  let o = h.app.overlay as ListOverlay;
  expect(o.title).toStartWith("links → plain paths: 1 change in 1 file");
  const rows = () => (h.app.overlay as ListOverlay).items.map((i) => i.label);
  expect(rows()).toEqual(["pick conv.md:1", "conv.md:1"]);
  // The ambiguous one: enter lists its notes; one picked, the preview comes back with it.
  await h.keys("enter");
  o = h.app.overlay as ListOverlay;
  expect(o.title).toBe("[[dup]] in conv.md:1 — which note?");
  expect(o.items.map((i) => i.label)).toEqual(["x/dup.md", "y/dup.md"]);
  await h.keys("down", "enter");
  expect((h.app.overlay as ListOverlay).title).toStartWith("links → plain paths: 1 change in 1 file"); // a line changed
  expect(rows()).toEqual(["conv.md:1"]);
  expect((h.app.overlay as ListOverlay).items[0]!.detail).toBe(
    "See [[beta]] and [[dup]].  →  See [beta](notes/beta.md) and [dup](y/dup.md).",
  );
  await h.keys("enter");
  expect(readFileSync(join(root, "conv.md"), "utf8")).toBe("See [beta](notes/beta.md) and [dup](y/dup.md).\n");
  expect(h.app.messages.at(-1)?.text).toBe("converted links to plain paths: 1 change in 1 file");
});

test("the converter's other TUI paths (20.1): every note, a note that isn't, nothing left, unsaved refused, undone", async () => {
  const root = makeVault();
  writeFileSync(join(root, "c1.md"), "[[beta]]\n");
  writeFileSync(join(root, "c2.md"), "[[beta]] too\n");
  const h = await harness({ root, open: "c1.md" });
  h.app.graph.build(true);
  await h.app.run("link.convert nope");
  expect(h.app.messages.at(-1)?.text).toBe('no note "nope"');
  // Unsaved: refused, as a rename is.
  h.app.view!.buf.edit(0, 0, "x");
  await h.app.run("link.convert c1");
  expect(h.app.messages.at(-1)?.text).toStartWith("unsaved: c1.md");
  h.app.view!.buf.edit(0, 1, "");
  await h.app.run("note.save");
  // No note named: every note's.
  await h.app.run("link.convert");
  const rows = (h.app.overlay as ListOverlay).items.map((i) => i.label);
  expect(rows).toContain("c1.md:1");
  expect(rows).toContain("c2.md:1");
  await h.keys("escape");
  await h.app.run("link.convert c1");
  await h.keys("enter");
  expect(readFileSync(join(root, "c1.md"), "utf8")).toBe("[beta](notes/beta.md)\n");
  await h.app.run("link.convert c1");
  expect((h.app.overlay as ListOverlay).items.map((i) => i.label)).toEqual(["nothing left to convert"]);
  await h.keys("escape");
  await h.app.run("rename.undo");
  await h.keys("enter");
  expect(h.app.messages.at(-1)?.text).toBe("undid the conversion to plain paths: 1 change in 1 file");
  expect(readFileSync(join(root, "c1.md"), "utf8")).toBe("[[beta]]\n");
});

test("following a path link's fragment: a block's ^id lands on its block (an embed's header too); a % that doesn't decode doesn't throw", async () => {
  const root = makeVault();
  mkdirSync(join(root, "sub"));
  writeFileSync(join(root, "sub", "b.md"), "# B\n\nOne.\n\nThe block. ^abc\n");
  writeFileSync(join(root, "host.md"), "# Host\n\n![c](sub/b.md#^abc)\n\nOdd [x](sub/b.md#a%zz) here.\n");
  const h = await harness({ root, open: "host.md" });
  h.app.graph.build(true);
  const v = () => h.app.view!;
  const onRow = (text: string) => {
    const lines = h.app.currentLayout(v()).lines;
    const row = lines.findIndex((l) =>
      l.spans
        .map((s) => s.text)
        .join("")
        .includes(text),
    );
    h.app.moveCursor(v(), { row, col: [...lines[row]!.spans.map((s) => s.text).join("")].indexOf(text[0]!) + 1 });
  };
  h.frame();
  onRow("⧉ b ^abc");
  await h.app.run("link.follow");
  expect(v().buf.rel).toBe("sub/b.md");
  expect(statusRow(h.frame())).toMatch(/L5:/);
  expect(h.app.messages.some((m) => m.text.includes("no heading"))).toBe(false);
  await h.app.run("history.back");
  h.frame();
  onRow("Odd x here");
  await h.app.run("link.follow");
  expect(v().buf.rel).toBe("sub/b.md");
});

describe("review (tui): what a filter or a search marks, drawn where it is", () => {
  test("ASCII glyphs reach every cell: a find match's row, the cursor on a dash", async () => {
    const root = makeVault();
    writeFileSync(join(root, "d.md"), "# D\n\nfoo — bar “q”\n");
    const h = await harness({ root, open: "d.md", width: 80, height: 20, config: (c) => (c.render.glyphs = "ascii") });
    const noUnicode = () => expect([...h.frame()].filter((ch) => ch.codePointAt(0)! > 0x7e && ch !== "\n")).toEqual([]);
    await h.keys("/", "b", "a", "r", "enter"); // the row has a match: drawn a cell at a time
    expect(h.frame()).toContain('foo - bar "q"');
    noUnicode();
    await h.keys("escape", "space", "n", "v");
    const v = h.app.view!;
    h.app.moveCursor(v, { row: 2, col: 4 }); // on the dash
    noUnicode();
  });
});

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

describe("lists and commands no test had run (the TUI model)", () => {
  const last = (h: Harness) => h.app.messages.at(-1)!.text;

  test("the glyphs picker: a move previews the set, enter keeps it and says so", async () => {
    const h = await harness();
    await h.keys("space", "u", "g");
    expect((h.app.overlay as ListOverlay).title).toBe("Glyphs (live preview)");
    await h.keys("down"); // unicode → ascii
    expect(h.app.glyphs.mode).toBe("ascii");
    await h.keys("enter");
    expect(h.app.ui.glyphs).toBe("ascii");
    expect(h.app.glyphs.mode).toBe("ascii");
    expect(last(h)).toBe("glyphs: ascii");
  });

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

  test("ctrl+w w: to the other window, round; from a panel, back to the note's window first", async () => {
    const h = await harness({ width: 160 });
    await h.keys("ctrl+w", "v");
    const t = h.app.tab!;
    const at = t.active;
    await h.keys("ctrl+w", "w");
    expect(t.active).toBe(1 - at);
    await h.keys("ctrl+w", "w");
    expect(t.active).toBe(at);
    await h.keys("space", "e");
    h.app.region = "sidebar";
    await h.keys("ctrl+w", "w");
    expect(h.app.region as string).toBe("content");
    expect(t.active).toBe(at); // only back, not on
  });

  test("a split with the window header off: each window titled by its note on its top row", async () => {
    const h = await harness({ width: 160, config: (c) => (c.ui.window_header = false) });
    await h.keys("ctrl+w", "v");
    await h.app.run("note.open notes/beta.md");
    const [a, b] = h.app.geometry!.panes;
    const c = h.canvas();
    const top = (p: typeof a) => c.rows[p!.y - 1]!.slice(p!.x, p!.x + p!.w).join("");
    expect([top(a), top(b)].map((t) => t.trim()).sort()).toEqual(["index.md", "notes/beta.md"]);
  });
});

describe("what keymap.md and tui.md promise (review: docs against the tests)", () => {
  test("the status line counts the tabs (tab N/M) once there are two", async () => {
    const h = await harness();
    expect(statusRow(h.frame())).not.toMatch(/tab \d+\/\d+/);
    await h.keys("ctrl+t", "c", "ctrl+t", "c");
    expect(statusRow(h.frame())).toContain("tab 3/3");
    await h.keys("ctrl+t", "1");
    expect(statusRow(h.frame())).toContain("tab 1/3");
    await h.keys("ctrl+t", "o");
    expect(statusRow(h.frame())).not.toMatch(/tab \d+\/\d+/);
  });

  test("a tab reads ` N name `, the name cut to 24 columns, and ↻ for 3 s after a reload", async () => {
    const root = makeVault();
    const name = "a-note-whose-name-runs-past-the-tab.md";
    writeFileSync(join(root, name), "# Long\n\ntext\n");
    let now = 1_000_000;
    const h = await harness({ root, open: name });
    (h.app as unknown as { now: () => number }).now = () => now;
    const strip = () => {
      const g = h.app.geometry!.tabStrip!;
      return h.frame().split("\n")[g.y]!.slice(g.x);
    };
    expect(strip()).toContain(" 1 a-note-whose-name-runs-… ");
    expect(strip()).not.toContain("past");
    writeFileSync(join(root, name), "# Long\n\ntext, changed\n");
    h.app.watch.applyChanges({ changes: [{ rel: name, kind: "changed", isNote: true }], rescan: false });
    expect(strip()).toContain("runs-… ↻");
    now += 3_001;
    expect(strip()).not.toContain("↻");
  });

  test("messages: four boxes at most; info marked ·, unless it brings its own symbol; 4 s, an error 8 s", async () => {
    const h = await harness({ width: 120, height: 40 });
    let now = 1_000_000;
    (h.app as unknown as { now: () => number }).now = () => now;
    const boxes = () => (h.frame(), h.app.geometry!.hot.filter((r) => r.id.startsWith("toast:")));
    const boxText = (i: number) => {
      const b = boxes()[i]!;
      return h
        .frame()
        .split("\n")
        [b.y + 1]!.slice(b.x, b.x + b.w);
    };
    h.app.message("error", "first, an error");
    h.app.message("info", "plain info");
    expect(boxText(0)).toContain("· plain info");
    h.app.message("info", "↻ notes/alpha.md reloaded");
    expect(boxText(0)).toContain("│ ↻ notes/alpha.md reloaded");
    expect(boxText(0)).not.toContain("·");
    h.app.message("warn", "a fourth");
    h.app.message("warn", "a fifth");
    expect(boxes()).toHaveLength(4);
    expect(h.app.toasts.map((t) => t.text)).toEqual(["a fifth", "a fourth", "↻ notes/alpha.md reloaded", "plain info"]);
    expect(h.app.messages.some((m) => m.text === "first, an error")).toBe(true); // in the list still
    // Times: an info message goes after 4 s, an error stays 8 s — from when they're drawn.
    h.app.dismissToasts();
    h.app.message("error", "broke");
    h.app.message("info", "fyi");
    h.frame();
    now += 4_001;
    h.app.message("info", "later");
    expect(h.app.toasts.map((t) => t.text)).toEqual(["later", "broke"]); // the info gone after 4 s
    now += 3_000;
    h.app.message("info", "at 7 s");
    expect(h.app.toasts.map((t) => t.text)).toEqual(["at 7 s", "later", "broke"]); // the error still
    now += 999;
    h.app.message("info", "at 8 s");
    expect(h.app.toasts.map((t) => t.text)).toEqual(["at 8 s", "at 7 s", "later"]); // gone after 8 s
    // Said while slipbox was busy, no frame drawn for longer than it shows (#40): still there to be seen, then its 4 s.
    h.app.dismissToasts();
    h.app.message("warn", "said while busy");
    now += 10_000;
    h.app.message("info", "next");
    expect(h.app.toasts.map((t) => t.text)).toEqual(["next", "said while busy"]);
    expect(h.frame()).toContain("said while busy");
    now += 3_999;
    h.frame(); // drawn again: its time still counts from the first
    expect(h.app.toasts.map((t) => t.text)).toContain("said while busy");
    now += 1;
    h.app.message("info", "then gone");
    expect(h.app.toasts.map((t) => t.text)).toEqual(["then gone"]);
  });

  test("a message asks for its frame as it's said, wherever from; one said while a frame is drawn asks for none, the next one does", async () => {
    const h = await harness({ width: 80, height: 24 });
    // The frames asked for by a message itself, not by whatever else is going on.
    let saying = false;
    let frames = 0;
    h.app.host.requestRender = () => void (saying && frames++);
    const say = h.app.message.bind(h.app);
    h.app.message = (...m: Parameters<typeof h.app.message>) => {
      saying = true;
      try {
        say(...m);
      } finally {
        saying = false;
      }
    };
    h.app.message("info", "said in the background");
    expect(frames).toBe(1);
    // A frame that fails says so while it's drawn: it asks for no other frame from inside one.
    const canvas = new TextCanvas(80, 24);
    let broken = true;
    for (const k of ["cell", "ascii"] as const) {
      const real = canvas[k].bind(canvas) as (...a: unknown[]) => void;
      (canvas as unknown as Record<string, (...a: unknown[]) => void>)[k] = (...a) => {
        if (broken) {
          broken = false;
          throw new Error("a broken cell");
        }
        real(...a);
      };
    }
    frames = 0;
    h.app.draw(canvas);
    expect(h.app.messages.at(-1)?.text).toBe("drawing failed: a broken cell");
    expect(frames).toBe(0);
    // The frame over, a message asks for one again.
    h.app.message("info", "said after it");
    expect(frames).toBe(1);
    // Said anywhere a frame is painted (the host paints around App.draw too): none.
    frames = 0;
    h.app.whileDrawing(() => h.app.message("info", "said while painting"));
    expect(frames).toBe(0);
    // A paint that fails outside App.draw (the host's own part of it): over all the same, the next message asks.
    expect(() =>
      h.app.whileDrawing(() => {
        throw new Error("the host's paint failed");
      }),
    ).toThrow("the host's paint failed");
    h.app.message("info", "said after a failed paint");
    expect(frames).toBe(1);
  });

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

  test("window and link keys: ctrl+\\ splits side by side; g x follows; space h p / space h n go back and forward", async () => {
    const h = await harness({ open: "index.md", width: 160 });
    await h.keys("ctrl+\\");
    const t = h.app.tab!;
    expect([t.views.length, t.orientation]).toEqual([2, "side"]);
    await h.keys("ctrl+w", "o");
    const from = h.app.view!.buf.rel;
    await h.keys("tab", "g", "x"); // the first link, followed
    const to = h.app.view!.buf.rel;
    expect(to).not.toBe(from);
    await h.keys("space", "h", "p");
    expect(h.app.view!.buf.rel).toBe(from);
    await h.keys("space", "h", "n");
    expect(h.app.view!.buf.rel).toBe(to);
  });

  test("UI keys: alt+z wraps, space u m gives the mouse back, space n r reloads from disk", async () => {
    const root = makeVault();
    writeFileSync(join(root, "r.md"), "# R\n\nbefore\n");
    const h = await harness({ root, open: "r.md" });
    await h.keys("alt+z");
    expect(h.app.ui.wrap).toBe(false);
    await h.keys("alt+z");
    expect(h.app.ui.wrap).toBe(true);
    const mouse = h.app.ui.mouse;
    await h.keys("space", "u", "m");
    expect(h.app.ui.mouse).toBe(!mouse);
    writeFileSync(join(root, "r.md"), "# R\n\nafter\n");
    await h.keys("space", "n", "r");
    expect(h.app.view!.buf.source).toBe("# R\n\nafter\n");
  });
});
