// The TUI model, driven headlessly: keys in (canonical names, as the keymap writes them),
// TextCanvas out. Plus one run through OpenTUI's test renderer for real key parsing.

import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COMMAND_SPECS } from "../src/core/command-specs.ts";
import { canonKey, canonSeq } from "../src/core/commands.ts";
import { type Config, DEFAULT_CONFIG } from "../src/core/config.ts";
import { openGraph } from "../src/core/graph.ts";
import { locateVault } from "../src/core/vault.ts";
import { type ListOverlay, App, type Host } from "../src/tui/app.ts";
import { TextCanvas } from "../src/tui/canvas.ts";
import { fuzzy, rank } from "../src/tui/fuzzy.ts";
import { crumbLayout } from "../src/tui/draw.ts";
import { DEFAULT_KEYS, keyName } from "../src/tui/keys.ts";

const sandbox = mkdtempSync(join(tmpdir(), "slipbox-tui-"));
process.env.XDG_STATE_HOME = join(sandbox, "state");
process.env.XDG_CACHE_HOME = join(sandbox, "cache");
process.env.XDG_CONFIG_HOME = join(sandbox, "config");
delete process.env.NO_COLOR;
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

function makeVault(): string {
  const dir = mkdtempSync(join(sandbox, "vault-"));
  cpSync(join(import.meta.dir, "fixtures", "vault"), dir, { recursive: true, verbatimSymlinks: true });
  cpSync(join(import.meta.dir, "..", "docs", "samples"), join(dir, "samples"), { recursive: true });
  return dir;
}

interface Harness {
  app: App;
  copied: string[];
  quit: { called: boolean };
  keys: (...ks: string[]) => Promise<string>;
  frame: () => string;
  canvas: () => TextCanvas;
  root: string;
}

interface Opts {
  width?: number;
  height?: number;
  open?: string | null;
  root?: string;
  config?: (c: Config) => void;
  watch?: boolean;
  configFile?: string;
  themeName?: string;
}

async function harness(opts: Opts = {}): Promise<Harness> {
  const root = opts.root ?? makeVault();
  const config: Config = structuredClone(DEFAULT_CONFIG);
  config.ui.restore_session = false;
  config.render.glyphs = "unicode";
  // The frame tests read heavy lines; the light set has its own test.
  config.ui.lines = "heavy";
  config.walk.exclude = ["drafts/"];
  opts.config?.(config);
  const loc = locateVault({ root });
  const graph = openGraph(loc, config, false);
  const copied: string[] = [];
  const quit = { called: false };
  const host: Host = { requestRender() {}, osc52: (t) => (copied.push(t), true), quit: () => (quit.called = true) };
  const app = new App({ loc, config, graph, host, open: opts.open === undefined ? "index.md" : opts.open, watch: opts.watch ?? false, configFile: opts.configFile, themeName: opts.themeName });
  const W = opts.width ?? 120;
  const H = opts.height ?? 30;
  const canvas = () => {
    const c = new TextCanvas(W, H);
    app.draw(c);
    // The app survives a drawing bug in use; tests must not.
    const failed = app.messages.find((m) => m.text.startsWith("drawing failed"));
    if (failed) throw new Error(failed.text);
    return c;
  };
  const frame = () => canvas().toString();
  frame();
  const keys = async (...ks: string[]) => {
    for (const k of ks) {
      await app.handleKey(canonKey(k));
      frame();
    }
    return frame();
  };
  return { app, copied, quit, keys, frame, canvas, root };
}

const rowText = (h: Harness, row = h.app.view!.cur.row) => h.app.currentLayout(h.app.view!).lines[row]!.spans.map((s) => s.text).join("");
const statusRow = (frame: string) => frame.split("\n").at(-1)!;
const topRow = (frame: string) => frame.split("\n")[0]!;
const rowStarting = (h: Harness, prefix: string) => h.app.currentLayout(h.app.view!).lines.findIndex((l) => l.spans.map((s) => s.text).join("").startsWith(prefix));

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
  test("tiny terminals do not crash", async () => {
    const h = await harness({ width: 9, height: 3 });
    expect(h.frame()).toContain("slipbox");
    const h2 = await harness({ width: 20, height: 6 });
    await h2.keys("j", "space", "u", "n");
    expect(() => h2.frame()).not.toThrow();
  });
});

describe("cursor movement", () => {
  test("h j k l and arrows; up and down keep the goal column", async () => {
    const h = await harness({ open: "samples/wrap-probe.md" });
    await h.keys("j", "j", "$");
    const long = h.app.view!.cur.col;
    expect(long).toBeGreaterThan(20);
    await h.keys("j");
    expect(h.app.view!.cur.col).toBe(0); // a blank row
    await h.keys("k");
    expect(h.app.view!.cur.col).toBe(long); // back to the goal column
    await h.keys("h", "left");
    expect(h.app.view!.cur.col).toBe(long - 2);
    await h.keys("l", "right");
    expect(h.app.view!.cur.col).toBe(long);
  });
  test("row start and end: 0 $ home end ctrl+left ctrl+right", async () => {
    const h = await harness({ open: "samples/wrap-probe.md" });
    await h.keys("j", "j", "$");
    const end = h.app.view!.cur.col;
    for (const k of ["0", "home", "ctrl+left"]) {
      await h.keys("$", k);
      expect(h.app.view!.cur.col).toBe(0);
    }
    for (const k of ["$", "end", "ctrl+right"]) {
      await h.keys("0", k);
      expect(h.app.view!.cur.col).toBe(end);
    }
  });
  test("w b e and alt+arrows move by word", async () => {
    const h = await harness({ open: "notes/beta.md" });
    const row = rowStarting(h, "Beta links");
    h.app.moveCursor(h.app.view!, { row, col: 0 });
    await h.keys("w");
    expect(h.app.view!.cur.col).toBe(5); // "links"
    await h.keys("e");
    expect(h.app.view!.cur.col).toBe(9); // end of "links"
    await h.keys("alt+right");
    expect(h.app.view!.cur.col).toBe(11); // "to"
    await h.keys("b", "alt+left");
    expect(h.app.view!.cur.col).toBe(0);
    await h.keys("b");
    expect(h.app.view!.cur.row).toBeLessThan(row);
  });
  test("g g, shift+g, ctrl+home, ctrl+end", async () => {
    const h = await harness({ open: "samples/large-document.md" });
    await h.keys("shift+g");
    const last = h.app.currentLayout(h.app.view!).lines.length - 1;
    expect(h.app.view!.cur.row).toBe(last);
    expect(h.app.view!.top).toBeGreaterThan(0);
    await h.keys("g", "g");
    expect(h.app.view!.cur.row).toBe(0);
    await h.keys("ctrl+end");
    expect(h.app.view!.cur.row).toBe(last);
    await h.keys("ctrl+home");
    expect(h.app.view!.cur.row).toBe(0);
  });
  test("headings with [ [ ] ] alt+up alt+down; paragraphs with { } ctrl+up ctrl+down", async () => {
    const h = await harness({ open: "samples/large-document.md" });
    const heads = () => h.app.currentLayout(h.app.view!).headings.map((x) => x.line);
    await h.keys("]", "]");
    expect(heads()).toContain(h.app.view!.cur.row);
    const first = h.app.view!.cur.row;
    await h.keys("alt+down");
    expect(h.app.view!.cur.row).toBeGreaterThan(first);
    await h.keys("alt+up");
    expect(h.app.view!.cur.row).toBe(first);
    await h.keys("}");
    expect(rowText(h).trim()).toBe("");
    const p = h.app.view!.cur.row;
    await h.keys("ctrl+down");
    expect(h.app.view!.cur.row).toBeGreaterThan(p);
    await h.keys("ctrl+up", "{");
    expect(h.app.view!.cur.row).toBeLessThan(p);
    await h.keys("[", "[");
    expect(heads().includes(h.app.view!.cur.row) || h.app.view!.cur.row === 0).toBe(true);
  });
  test("ctrl+d ctrl+u pagedown pageup move cursor and view together; scrolloff holds", async () => {
    const h = await harness({ open: "samples/large-document.md", height: 30 });
    await h.keys("ctrl+d");
    const v = h.app.view!;
    expect(v.top).toBeGreaterThan(0);
    expect(v.cur.row).toBeGreaterThanOrEqual(v.top + 3);
    await h.keys("pagedown", "pagedown", "pageup", "ctrl+u");
    expect(v.cur.row - v.top).toBeGreaterThanOrEqual(3);
  });
  test("wide characters are one stop", async () => {
    const h = await harness({ open: "cjk/日本語.md" });
    const row = rowStarting(h, "alpha");
    h.app.moveCursor(h.app.view!, { row, col: 0 });
    await h.keys("w");
    const col = h.app.view!.cur.col;
    expect(col).toBe(6);
    await h.keys("l");
    expect(h.app.view!.cur.col).toBe(col + 2);
  });
  test("mouse click moves the cursor; the wheel scrolls the view", async () => {
    const h = await harness({ open: "samples/large-document.md" });
    const pane = h.app.geometry!.panes[0]!;
    h.app.handleMouse({ type: "down", x: pane.textX + 3, y: pane.y + 5, button: 0 });
    h.app.handleMouse({ type: "up", x: pane.textX + 3, y: pane.y + 5, button: 0 });
    expect(h.app.view!.cur.row).toBe(5);
    h.app.handleMouse({ type: "scroll", x: pane.x + 5, y: pane.y + 2, button: 0, scroll: { direction: "down", delta: 1 } });
    expect(h.app.view!.top).toBe(3);
  });
});

describe("selection", () => {
  test("shift+arrows extend; ctrl+c copies only a selection; y y copies selection or row", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    h.app.moveCursor(h.app.view!, { row: rowStarting(h, "Back to"), col: 0 });
    await h.keys("ctrl+c");
    expect(h.copied).toHaveLength(0);
    for (let i = 0; i < 6; i++) await h.keys("shift+right");
    await h.keys("ctrl+c");
    expect(h.copied.at(-1)).toBe("Back to");
    await h.keys("right");
    expect(h.app.view!.sel).toBeNull();
    await h.keys("y", "y");
    expect(h.copied.at(-1)).toBe("Back to index and on to beta.");
  });
  test("shift+alt by word, shift+ctrl to the row end", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    h.app.moveCursor(h.app.view!, { row: rowStarting(h, "Back to"), col: 0 });
    await h.keys("shift+alt+right", "ctrl+c");
    expect(h.copied.at(-1)).toBe("Back t");
    await h.keys("escape", "0", "shift+ctrl+right", "ctrl+c");
    expect(h.copied.at(-1)).toBe("Back to index and on to beta.");
  });
  test("v, V, o, y and esc", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    h.app.moveCursor(h.app.view!, { row: rowStarting(h, "Back to"), col: 0 });
    await h.keys("v", "e");
    expect(statusRow(h.frame())).toContain("VISUAL");
    await h.keys("o");
    expect(h.app.view!.cur.col).toBe(0);
    await h.keys("y");
    expect(h.copied.at(-1)).toBe("Back");
    expect(h.app.view!.visual).toBeNull();
    await h.keys("shift+v", "k", "k", "y");
    expect(h.copied.at(-1)).toBe("▌ Section One\n\nBack to index and on to beta.");
    await h.keys("v", "escape");
    expect(h.app.view!.sel).toBeNull();
  });
  test("mouse drag selects and copies on release", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    const pane = h.app.geometry!.panes[0]!;
    const row = rowStarting(h, "Back to");
    h.app.handleMouse({ type: "down", x: pane.textX, y: pane.y + row, button: 0 });
    h.app.handleMouse({ type: "drag", x: pane.textX + 6, y: pane.y + row, button: 0 });
    h.app.handleMouse({ type: "up", x: pane.textX + 6, y: pane.y + row, button: 0 });
    expect(h.copied.at(-1)).toBe("Back to");
  });
  test("y p, y r (cursor row), y l (link under the cursor)", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    await h.keys("y", "p");
    expect(h.copied.at(-1)).toEndWith("/notes/alpha.md");
    h.app.moveCursor(h.app.view!, { row: rowStarting(h, "Back to"), col: 0 });
    await h.keys("y", "r");
    expect(h.copied.at(-1)).toBe("notes/alpha.md:9");
    await h.keys("ctrl+tab", "y", "l");
    expect(h.copied.at(-1)).toEndWith("/index.md");
  });
});

describe("links and history", () => {
  test("ctrl+tab puts the cursor on a link; enter follows; shift+h / shift+l / ctrl+backspace", async () => {
    const h = await harness();
    await h.keys("ctrl+tab");
    expect(statusRow(h.frame())).toContain("[[alpha]]");
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    await h.keys("shift+h");
    expect(h.app.view!.buf.rel).toBe("index.md");
    await h.keys("shift+l");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    await h.keys("ctrl+backspace");
    expect(h.app.view!.buf.rel).toBe("index.md");
  });
  test("enter off a link follows the row's first link", async () => {
    const h = await harness();
    h.app.moveCursor(h.app.view!, { row: rowStarting(h, "Links:"), col: 0 });
    await h.keys("ctrl+enter");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
  });
  test("space l: n y s b l", async () => {
    const h = await harness();
    await h.keys("space", "l", "n");
    expect(h.app.linkUnderCursor()).toBeGreaterThanOrEqual(0);
    await h.keys("space", "l", "y");
    expect(h.copied.at(-1)).toEndWith("/notes/alpha.md");
    await h.keys("space", "l", "s");
    expect(h.app.tab!.views).toHaveLength(2);
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    await h.keys("space", "l", "b");
    expect(h.frame()).toContain("Linking to alpha.md");
    await h.keys("escape", "space", "l", "l");
    expect(h.frame()).toContain("Links from alpha.md");
  });
  test("history list jumps anywhere in the timeline", async () => {
    const h = await harness();
    await h.app.run("note.open notes/alpha.md");
    await h.app.run("note.open notes/beta.md");
    await h.keys("space", "h", "h");
    expect(h.frame()).toContain("History");
    // In the left panel, not a popup: focused, the current place selected and marked.
    expect(h.app.overlay).toBeNull();
    expect(h.app.leftView).toBe("history");
    expect(h.app.region).toBe("sidebar");
    const rows = h.app.historyRows();
    expect(rows[h.app.sidebar.selected]!.here).toBe(true);
    expect(h.frame()).toContain("here");
    await h.keys("down", "down", "enter");
    expect(h.app.view!.buf.rel).toBe("index.md");
    await h.keys("shift+l");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
  });
  test("ambiguous, unresolved, external and attachment links", async () => {
    const root = makeVault();
    writeFileSync(join(root, "notes", "dup.md"), "# a\n");
    writeFileSync(join(root, "projects", "dup.md"), "# b\n");
    writeFileSync(join(root, "amb.md"), "[[dup]] [[nothing-here]] [web](https://example.invalid) ![[diagram.png]]\n");
    const h = await harness({ root, open: "amb.md" });
    await h.keys("enter"); // the cursor starts on [[dup]]
    expect(h.app.overlay?.kind).toBe("list");
    await h.keys("escape", "ctrl+tab", "enter");
    expect(h.app.transient!.text).toContain("unresolved link [[nothing-here]]");
    await h.keys("ctrl+tab", "enter");
    expect(h.copied.at(-1)).toBe("https://example.invalid");
    await h.keys("ctrl+tab", "enter");
    expect(h.copied.at(-1)).toEndWith("attachments/diagram.png");
  });
  test("clicking a link follows it", async () => {
    const h = await harness();
    const v = h.app.view!;
    const pane = h.app.geometry!.panes[0]!;
    const link = h.app.currentLayout(v).links.find((l) => l.target === "Beta")!;
    const x = pane.textX + link.col + 1;
    const y = pane.y + link.line - v.top;
    h.app.handleMouse({ type: "down", x, y, button: 0 });
    h.app.handleMouse({ type: "up", x, y, button: 0 });
    await new Promise((r) => setTimeout(r, 10));
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
  });
});

describe("which-key", () => {
  test("the leader shows the popup at once, with group names; backspace goes up; esc cancels", async () => {
    const h = await harness();
    const f = await h.keys("space");
    expect(h.app.whichKey).toBe(true);
    expect(f).toContain("+links");
    expect(f).toContain("+history");
    const f2 = await h.keys("l");
    expect(f2).toContain("links");
    expect(f2).toContain("Backlinks");
    await h.keys("backspace");
    expect(h.app.pending).toEqual(["space"]);
    await h.keys("escape");
    expect(h.app.pending).toEqual([]);
    expect(h.app.whichKey).toBe(false);
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
    expect(rows[head + 3]).toContain("notes, headings, text, commands"); // +find's explanation
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
    expect(rows[status - 2]!.slice(h.app.leftRailWidth, rows[status - 2]!.length - h.app.rightRailWidth).trim()).toBe(""); // the popup's margin row (between the rails)
    // Centred.
    const right = rows[head]!.lastIndexOf("┐");
    expect(Math.abs(left - (160 - 1 - right))).toBeLessThanOrEqual(1);
  });
  test("keys with the same action share an entry; short screens drop the explanations", async () => {
    const h = await harness({ width: 160, height: 40 });
    const f = await h.keys("ctrl+alt+w");
    expect(f).toContain("h left");
    expect(f).toContain("q enter escape");
    const short = await harness({ width: 60, height: 14 });
    const s2 = await short.keys("space");
    expect(s2).toContain("+links");
    expect(s2).not.toContain("follow, list and copy links");
  });
  test("group names and explanations come from [groups]", async () => {
    const h = await harness({ config: (c) => (c.groups = { "leader l": "LINKS: everything about links" }) });
    const f = await h.keys("space");
    expect(f).toContain("+LINKS");
    expect(f).toContain("everything about links");
  });
  test("other prefixes show it only after the delay", async () => {
    const h = await harness({ config: (c) => (c.input.which_key_delay_ms = 50) });
    await h.keys("y");
    expect(h.app.whichKey).toBe(false);
    await new Promise((r) => setTimeout(r, 90));
    expect(h.app.whichKey).toBe(true);
    expect(h.frame()).toContain("Copy note path");
  });
});

describe("overlays and the : prompt", () => {
  test("ctrl+p quick switcher and space f f", async () => {
    const h = await harness();
    await h.keys("ctrl+p", "b", "e", "t", "enter");
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
    await h.keys("space", "f", "f");
    expect(h.frame()).toContain("Open note");
  });
  test("find: ctrl+f, cursor on the match, n / shift+n, esc clears", async () => {
    const h = await harness({ open: "samples/dense-tables.md" });
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
    const h = await harness({ open: "samples/large-document.md" });
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
    await h.keys(":", "q", "enter");
    expect(h.quit.called).toBe(true);
  });
  test(": also finds commands by name; ? and space ? list every key", async () => {
    const h = await harness();
    await h.keys(":", "z", "e", "n", "space", "m", "o", "d", "e", "enter");
    expect(h.app.ui.zen).toBe(true);
    await h.keys("space", "?");
    expect(h.frame()).toContain("Keys — type to filter");
    await h.keys("escape", "?"); // ? on its own too
    expect(h.frame()).toContain("Keys — type to filter");
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
    expect(endRow.keys).toEqual(["$", "end", "ctrl+right"]);
    expect(endRow.more).toEqual(["cmd+right", "shift+end", "ctrl+shift+right", "shift+cmd+right"]);
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
    expect(row).toMatch(/g g +ctrl\+home +ctrl\+shift\+home/);
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
    const h = await harness({ open: "samples/large-document.md", width: 140, height: 40 });
    const start = async (...keys: string[]) => {
      await h.keys(...keys, "?");
      const o = h.app.overlay as ListOverlay;
      h.frame();
      const heading = o.filtered[o.scroll]!.item;
      const selected = o.filtered[o.selected]!.item;
      await h.keys("escape");
      return { heading: heading.header ? heading.label : null, selectedIsEntry: !selected.header };
    };
    expect(await start("ctrl+e")).toEqual({ heading: "Inside the explorer", selectedIsEntry: true });
    await h.keys("escape"); // back to the note
    expect(await start("ctrl+o")).toEqual({ heading: "Inside the outline", selectedIsEntry: true });
    await h.keys("escape");
    expect(await start("v")).toEqual({ heading: "Selection & copy", selectedIsEntry: true });
    await h.keys("escape");
    expect(await start()).toEqual({ heading: "Cursor", selectedIsEntry: true }); // from the note: the top
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
    expect(colOf(g, "Reload note from disk", "space n r")).toBe(colOf(g, "Clear the scratch", "space s d"));
    expect(colOf(g, "Reload note from disk", ":reload")).toBe(colOf(g, "Quit", ":q"));
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
  });
});

describe("windows (ctrl+w, space w)", () => {
  test("split, focus, move, swap, close, only", async () => {
    const h = await harness({ open: "samples/large-document.md", width: 160 });
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
    await h.keys("ctrl+w", "|");
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
    const h = await harness({ open: "samples/large-document.md", width: 160 });
    await h.keys("ctrl+w", "v", "ctrl+w", "h"); // left window active
    const t = h.app.tab!;
    const f = await h.keys("ctrl+alt+w");
    expect(h.app.resizeMode).toBe(true);
    expect(statusRow(f)).toContain("RESIZE");
    expect(f).toContain("Wider");
    const w0 = h.app.geometry!.panes[0]!.w;
    await h.keys("l", "l", "right");
    expect(h.app.geometry!.panes[0]!.w).toBeGreaterThan(w0 + 4);
    await h.keys("h", "left");
    await h.keys("=");
    expect(t.ratio).toBe(0.5);
    await h.keys("escape");
    expect(h.app.resizeMode).toBe(false);
  });
  test("ctrl+w > < + - resize one step, then stay in the mode so the key repeats", async () => {
    const h = await harness({ open: "samples/large-document.md", width: 160, height: 40 });
    await h.keys("ctrl+w", "v", "ctrl+w", "h");
    const t = h.app.tab!;
    await h.keys("ctrl+w", ">");
    expect(h.app.resizeMode).toBe(true);
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
    const h = await harness({ open: "samples/large-document.md" });
    await h.keys("space", "w", "r");
    expect(h.app.resizeMode).toBe(true);
    await h.keys("ctrl+d");
    expect(h.app.resizeMode).toBe(false);
    expect(h.app.view!.top).toBeGreaterThan(0);
  });
  test("stacked splits resize with j k; the right window grows by lowering the ratio", async () => {
    const h = await harness({ open: "samples/large-document.md", width: 160, height: 40 });
    await h.keys("ctrl+w", "s", "ctrl+alt+w", "j", "j", "escape");
    expect(h.app.tab!.ratio).toBeLessThan(0.5); // the lower (second) window got taller
    await h.keys("ctrl+w", "v", "ctrl+alt+w", "k");
    expect(h.app.transient!.text).toContain("h / l");
  });
  test("the focused explorer or outline resizes its own width; sizes persist in the session", async () => {
    const root = makeVault();
    const h = await harness({ root, width: 160, config: (c) => (c.ui.outline = true) });
    await h.keys("ctrl+w", "h", "ctrl+alt+w", "l", "l", "escape");
    expect(h.app.sideW).toBe(34);
    await h.keys("ctrl+w", "l", "ctrl+w", "l", "space", "w", "r", "h", "escape");
    expect(h.app.region).toBe("outline");
    expect(h.app.outW).toBe(30);
    await h.keys("ctrl+w", "h", "ctrl+w", "v", "ctrl+alt+w", "l", "escape");
    const ratio = h.app.tab!.ratio;
    h.app.quit();
    const again = await harness({ root, open: null, width: 160, config: (c) => (c.ui.restore_session = true) });
    expect(again.app.sideW).toBe(34);
    expect(again.app.outW).toBe(30);
    expect(again.app.outlineShown).toBe(true); // the outline pane itself is restored too
    expect(again.app.tab!.ratio).toBeCloseTo(ratio, 5);
  });
  test("resize keys and the default split ratio come from config", async () => {
    const h = await harness({
      open: "samples/large-document.md",
      width: 160,
      config: (c) => ((c.ui.split_ratio = 0.3), (c.keys = { resize: { a: "wider" } } as unknown as Config["keys"])),
    });
    await h.keys("ctrl+w", "v", "ctrl+w", "h");
    expect(h.app.tab!.ratio).toBe(0.3);
    await h.keys("ctrl+alt+w", "a");
    expect(h.app.tab!.ratio).toBeGreaterThan(0.3);
  });
});

describe("the rails (ui.left_rail, ui.right_rail)", () => {
  test("a column at the right edge under the tab strip; its ▤ toggles the outline, which opens beside it", async () => {
    const h = await harness({ open: "samples/large-document.md", width: 140, height: 30 });
    const f = h.frame();
    const rows = f.split("\n");
    const W = 140;
    const x = W - h.app.rightRailWidth;
    expect(h.app.rightRailWidth).toBe(4);
    const btn = h.app.geometry!.hot.find((r) => r.id === "btn:outline")!;
    expect(btn.x).toBe(x + 1);
    expect([...rows[btn.y]!][x + 2]).toBe("▤");
    // Its border joins the strip's rule above and the frame's bottom rule.
    const col = rows.map((r) => [...r][x] ?? "").join("");
    expect(col).toContain("┳");
    expect(col).toContain("┻");
    // Only one ▤: not on the breadcrumb as well.
    expect(h.app.geometry!.hot.filter((r) => r.id === "btn:outline").length).toBe(1);
    h.app.handleMouse({ type: "down", x: btn.x + 1, y: btn.y, button: 0 });
    h.app.handleMouse({ type: "up", x: btn.x + 1, y: btn.y, button: 0 });
    h.frame();
    expect(h.app.outlineShown).toBe(true);
    const o = h.app.geometry!.outline!;
    expect(o.x + o.w).toBe(x); // the outline ends at the rail's border
    // Zen has no rails; ui.right_rail = false removes it and the breadcrumb gets ▤ back.
    await h.app.run("ui.zen");
    h.frame();
    expect(h.app.rightRailWidth).toBe(0);
    await h.app.run("ui.zen");
    const n = await harness({ open: "samples/large-document.md", width: 140, height: 30, config: (c) => (c.ui.right_rail = false) });
    n.frame();
    expect(n.app.rightRailWidth).toBe(0);
    const b2 = n.app.geometry!.hot.find((r) => r.id === "btn:outline")!;
    expect(b2.x + b2.w).toBe(W);
  });
});

describe("ui.lines", () => {
  test("light (the default): the frame in ─ │ and light joints; heavy: ━ ┃", async () => {
    const h = await harness({ open: "samples/large-document.md", width: 140, height: 30, config: (c) => (c.ui.lines = "light") });
    const f = h.frame();
    expect(DEFAULT_CONFIG.ui.lines).toBe("light");
    expect(f).not.toMatch(/[━┃╋┳┻┣┫]/u);
    expect(f).toContain("┬");
    expect(f).toContain("┴");
    expect(f.split("\n")[1]!).toMatch(/^─+┬/u);
    const heavy = await harness({ open: "samples/large-document.md", width: 140, height: 30 });
    expect(heavy.frame().split("\n")[1]!).toMatch(/^━+┳/u);
  });
});

describe("the left rail", () => {
  test("a column at the left edge under the top bar; its ≡ toggles the explorer, which opens beside it", async () => {
    const h = await harness({ open: "samples/large-document.md", width: 140, height: 30, config: (c) => (c.ui.sidebar = false) });
    const rows = h.frame().split("\n");
    expect(h.app.leftRailWidth).toBe(4);
    const btn = h.app.geometry!.hot.find((r) => r.id === "btn:explorer")!;
    expect(btn.x).toBe(0);
    expect(btn.y).toBe(2); // under the top bar's rule, level with the tab strip
    expect([...rows[btn.y]!][1]).toBe("≡");
    expect(h.app.geometry!.hot.filter((r) => r.id === "btn:explorer").length).toBe(1); // not in the top bar too
    const col = rows.map((r) => [...r][3] ?? "").join("");
    expect(col).toMatch(/^.┳┃/u); // the border starts under the top bar's rule
    expect(col).toContain("┻");
    expect(h.app.geometry!.tabStrip!.x).toBe(4); // the strip starts after the rail
    h.app.handleMouse({ type: "down", x: btn.x + 1, y: btn.y, button: 0 });
    h.app.handleMouse({ type: "up", x: btn.x + 1, y: btn.y, button: 0 });
    h.frame();
    expect(h.app.sidebarShown).toBe(true);
    expect(h.app.geometry!.sidebarPane!.x).toBe(4);
    // Without it, ≡ is back in the top bar.
    const n = await harness({ width: 140, height: 30, config: (c) => (c.ui.left_rail = false) });
    n.frame();
    expect(n.app.geometry!.hot.find((r) => r.id === "btn:explorer")!.y).toBe(0);
  });
});

describe("the left panel's views and filter", () => {
  test("the rail's buttons pick the view; clicking the showing one hides the panel", async () => {
    const h = await harness({ open: "notes/alpha.md", width: 140, height: 30, config: (c) => (c.ui.sidebar = false) });
    await h.app.run("note.open notes/beta.md");
    h.frame();
    const hot = (id: string) => h.app.geometry!.hot.find((r) => r.id === id)!;
    const click = (id: string) => {
      const b = hot(id);
      h.app.handleMouse({ type: "down", x: b.x + 1, y: b.y, button: 0 });
      h.app.handleMouse({ type: "up", x: b.x + 1, y: b.y, button: 0 });
      return h.frame();
    };
    expect(hot("btn:history").y).toBe(hot("btn:explorer").y + 1); // one button per row
    let f = click("btn:history");
    expect(h.app.sidebarShown).toBe(true);
    expect(h.app.leftView).toBe("history");
    expect(f).toContain("History");
    f = click("btn:explorer"); // the other view: the same panel switches
    expect(h.app.sidebarShown).toBe(true);
    expect(h.app.leftView).toBe("explorer");
    expect(f).toContain("Explorer");
    click("btn:explorer"); // the showing view: hide
    expect(h.app.sidebarShown).toBe(false);
    // ctrl+e always comes back to the tree.
    click("btn:history");
    await h.keys("ctrl+e");
    expect(h.app.leftView).toBe("explorer");
  });
  test("each view keeps its position (selection, scroll, filter) while the other shows", async () => {
    const h = await harness({ open: "index.md", width: 140, height: 30 });
    await h.app.run("note.open notes/alpha.md");
    await h.app.run("note.open notes/beta.md");
    const click = (id: string) => {
      h.frame();
      const b = h.app.geometry!.hot.find((r) => r.id === id)!;
      h.app.handleMouse({ type: "down", x: b.x + 1, y: b.y, button: 0 });
      h.app.handleMouse({ type: "up", x: b.x + 1, y: b.y, button: 0 });
    };
    await h.keys("ctrl+e", "g", "g", "j", "j");
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
    await h.keys("ctrl+e", "/", "b", "e", "t");
    expect(h.app.sidebar.filtering).toBe(true);
    const rows = h.app.explorerRows();
    expect(rows.filter((r) => r.kind === "note").map((r) => r.path)).toContain("notes/beta.md");
    expect(rows.some((r) => r.kind === "dir" && r.path === "notes")).toBe(true); // its folder, unfolded
    expect(rows.some((r) => r.path === "notes/alpha.md")).toBe(false);
    const f = h.frame();
    expect(f).toContain("› bet");
    expect(h.app.sidebar.selected).toBe(rows.findIndex((r) => r.kind === "note"));
    await h.keys("escape");
    expect(h.app.sidebar.filter).toBe("");
    expect(h.app.explorerRows()).toBe(h.app.treeRows());
    await h.keys("/", "b", "e", "t", "a");
    const pick = h.app.explorerRows()[h.app.sidebar.selected]!;
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe(pick.path);
    expect(h.app.region).toBe("content");
    expect(h.app.sidebar.filter).toBe("");
  });
  test("the history filters too", async () => {
    const h = await harness();
    await h.app.run("note.open notes/alpha.md");
    await h.app.run("note.open notes/beta.md");
    await h.keys("space", "h", "h", "/", "a", "l", "p");
    const rows = h.app.historyRows();
    expect(rows.map((r) => r.label)).toEqual([expect.stringContaining("alpha")]);
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
  });
});

describe("breadcrumb collapse (…) and the path dropdown", () => {
  test("crumbLayout: all, then first … innermost, then cut, then … last, then …", () => {
    const shape = (ps: ReturnType<typeof crumbLayout>) => ps.map((p) => (p === "more" ? "…" : `${p.i}:${p.w}`)).join(" ");
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
  test("… opens the whole path as a dropdown under it; enter jumps; space f b opens it too", async () => {
    const h = await harness({ open: "samples/large-document.md", width: 70, height: 30, config: (c) => ((c.ui.sidebar = false), (c.ui.outline = false)) });
    const v = h.app.view!;
    const target = h.app.currentLayout(v).headings.find((x) => x.text.startsWith("Layered capture order"))!;
    h.app.moveCursor(v, { row: target.line + 1, col: 0 });
    h.frame();
    const chain = h.app.breadcrumb(v);
    expect(chain.length).toBe(3);
    const more = h.app.geometry!.hot.find((r) => r.id === "crumbmore:0")!;
    expect(more).toBeDefined();
    h.app.handleMouse({ type: "down", x: more.x, y: more.y, button: 0 });
    h.app.handleMouse({ type: "up", x: more.x, y: more.y, button: 0 });
    const o = h.app.overlay as ListOverlay;
    expect(o.kind).toBe("list");
    expect(o.anchor).toEqual({ x: more.x, y: more.y });
    expect(o.items.map((i) => i.label)).toEqual(chain.map((c) => c.text));
    expect(o.selected).toBe(1); // the hidden middle heading
    const f = h.frame();
    const box = h.app.geometry!.overlay!;
    expect(box.y).toBe(more.y + 2); // hanging under the breadcrumb, not centred
    expect(f).toContain("└─");
    await h.keys("enter");
    expect(h.app.overlay).toBeNull();
    expect(v.cur.row).toBe(chain[1]!.line);
    // From the keyboard: the arrows move, and a click on an entry picks it.
    h.app.moveCursor(v, { row: target.line + 1, col: 0 });
    h.frame();
    await h.keys("space", "f", "b");
    expect(h.app.overlay?.kind).toBe("list");
    await h.keys("up");
    expect((h.app.overlay as ListOverlay).selected).toBe(0);
    // Typing filters, as in every list; the filter's row sits above the entries.
    await h.keys("L", "a", "y");
    expect((h.app.overlay as ListOverlay).filtered.map((e) => e.item.label)).toEqual(["Layered capture order"]);
    expect(h.frame()).toContain("› Lay");
    await h.keys("backspace", "backspace", "backspace");
    await h.keys("up", "up");
    h.frame();
    const g = h.app.geometry!.overlay!;
    h.app.handleMouse({ type: "down", x: g.x + 4, y: g.listY, button: 0 });
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
    h.app.handleMouse({ type: "down", x, y, button });
    h.app.handleMouse({ type: "up", x, y, button });
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
    expect(statusRow(h.frame())).toMatch(/index\.md +○ not watching/); // watch: false in the harness
    // The bar and its chip sit on the page, so the frame's rule right under it gives it the same
    // air as the rows below.
    const chipR = h.app.geometry!.hot.find((r) => r.id === "btn:palette")!;
    const page = h.app.theme.roles.text.bg ?? h.app.theme.bg;
    expect(h.app.theme.roles.topbar.bg).toBeUndefined();
    expect(h.canvas().styles[chipR.y]![chipR.x + 2]!.bg).toBe(page);
    expect(h.canvas().styles[0]![80]?.bg ?? page).toBe(page);
    expect(h.frame().split("\n")[1]!.startsWith("━━━━")).toBe(true);
    const ex = hot(h, "btn:explorer");
    click(h, ex.x, ex.y);
    expect(h.app.sidebarShown).toBe(false);
    click(h, ex.x, ex.y);
    expect(h.app.sidebarShown).toBe(true);
    const ol = hot(h, "btn:outline");
    expect(ol.x + ol.w).toBe(160); // far right of the breadcrumb row
    expect(ol.y).toBe(h.app.geometry!.panes[0]!.y - 2);
    click(h, ol.x + 1, ol.y);
    expect(h.app.outlineShown).toBe(true);
    const chip = hot(h, "btn:palette");
    click(h, chip.x + 2, chip.y);
    expect(h.app.overlay?.kind).toBe("list");
  });
  test("hover highlights what is under the mouse", async () => {
    const h = await harness({ width: 160 });
    const ex = hot(h, "btn:explorer");
    h.app.handleMouse({ type: "move", x: ex.x, y: ex.y, button: 0 });
    expect(h.app.hover).toBe("btn:explorer");
    const c = h.canvas();
    expect(c.styles[ex.y]![ex.x + 1]!.bg).toBe(h.app.theme.roles.hover.bg!);
    h.app.handleMouse({ type: "move", x: 80, y: 10, button: 0 });
    expect(h.app.hover).toBeNull();
  });
  test("top_bar = false removes it; zen hides it", async () => {
    const off = await harness({ config: (c) => (c.ui.top_bar = false) });
    expect(off.frame().split("\n").slice(0, 3).join("\n")).not.toContain("slipbox");
    const zen = await harness({ config: (c) => (c.ui.zen = true) });
    zen.frame();
    expect(zen.app.geometry!.hot.some((r) => r.id === "btn:explorer")).toBe(false);
  });
  test("tab strip under the top bar, even with one tab: click, ×, middle-click, wheel, drag", async () => {
    const h = await harness({ width: 160 });
    h.frame();
    expect(h.app.geometry!.tabStrip).not.toBeNull();
    expect(h.app.geometry!.tabs).toHaveLength(1);
    await h.keys("ctrl+t", "o");
    await h.app.run("note.open notes/beta.md");
    await h.keys("ctrl+t", "o");
    await h.app.run("note.open notes/alpha.md");
    h.frame();
    const strip = h.app.geometry!.tabStrip!;
    expect(strip.y).toBe(2); // under the top bar and the frame's top rule
    // Tabs hold the note and its outline, not the explorer: the strip starts after it, and the
    // explorer stays where it was before the strip appeared.
    const sb = h.app.geometry!.sidebar!;
    expect(strip.x).toBe(sb.x + sb.w + 1);
    expect(strip.x + strip.w).toBe(160);
    expect(sb.y).toBe(4); // the tree, under the "Explorer" title (beside the strip) and a blank row
    expect(h.frame().split("\n")[2]!.slice(sb.x).startsWith(" Explorer")).toBe(true);
    // Under the title a rule, meeting the one under the strip at the explorer's border.
    expect(h.frame().split("\n")[3]!.slice(sb.x - 1, sb.x + sb.w + 2)).toBe(`┣${"━".repeat(sb.w)}╋━`); // from the left rail's border
    const rows = h.frame().split("\n");
    // A rule over everything, the left rail's border and the explorer's starting under it (┳)…
    const bx = sb.x + sb.w;
    expect(rows[1]!.slice(sb.x, sb.x + 10)).toBe("━".repeat(10));
    expect(rows[1]![sb.x - 1]).toBe("┳");
    expect(rows[1]![bx]).toBe("┳");
    expect(rows[2]![bx]).toBe("┃");
    // …and one under the strip, over the note (and the outline), meeting the border in ┣.
    expect(rows[3]!.slice(strip.x, strip.x + 10)).toBe("━".repeat(10));
    expect(rows[3]![strip.x - 1]).toBe("╋"); // the explorer's title rule meets it
    // The bottom rule closes the explorer and the note above the status line.
    expect(rows.at(-2)!.slice(sb.x, sb.x + 10)).toBe("━".repeat(10));
    expect(rows.at(-2)![bx]).toBe("┻");
    const tab = (i: number) => h.app.geometry!.tabs[i]!;
    click(h, tab(0).x + 2, strip.y);
    expect(h.app.activeTab).toBe(0);
    h.app.handleMouse({ type: "scroll", x: strip.x + 5, y: strip.y, button: 0, scroll: { direction: "down", delta: 1 } });
    expect(h.app.activeTab).toBe(1);
    // drag tab 0 onto tab 2
    const names = () => h.app.tabs.map((t) => t.views[0]!.buf.name);
    const first = names()[0];
    h.frame();
    h.app.handleMouse({ type: "down", x: tab(0).x + 2, y: strip.y, button: 0 });
    h.app.handleMouse({ type: "drag", x: tab(2).x + 2, y: strip.y, button: 0 });
    h.app.handleMouse({ type: "up", x: tab(2).x + 2, y: strip.y, button: 0 });
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
  test("the outline opens under the breadcrumb, which spans its column; titled, then a blank row", async () => {
    const h = await harness({ open: "samples/large-document.md", width: 160 });
    await h.app.run("cursor.heading_next");
    await h.app.run("outline.toggle");
    const rows = h.frame().split("\n");
    const g = h.app.geometry!;
    const pane = g.panes[0]!;
    const crumbY = pane.y - 2;
    // The breadcrumb row and its rule run across the outline's column; the button ends the row.
    expect(g.outline!.x).toBeGreaterThan(pane.x + pane.w);
    expect(rows[crumbY]!.trimEnd().endsWith("▤")).toBe(true);
    const border = g.outline!.x - 1;
    expect(rows[crumbY + 1]![border]).toBe("┳");
    // Then the pane: "Outline", a blank row, the headings.
    expect(rows[crumbY + 2]!.slice(g.outline!.x)).toMatch(/^ Outline/);
    expect(rows[crumbY + 3]!.slice(g.outline!.x, g.outline!.x + g.outline!.w).trim()).toBe("");
    expect(g.outline!.y).toBe(crumbY + 4);
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
    h.app.handleMouse({ type: "move", x: 80, y: 10, button: 0 }); // no hover
    expect(btn("btn:explorer").fg).toBe(roles.topbar_button_on.fg!); // the explorer is open
    expect(btn("btn:explorer").bg).toBe(h.app.theme.roles.text.bg ?? h.app.theme.bg); // the page
    expect(btn("btn:outline").fg).toBe(roles.topbar_button.fg!); // the outline is closed
    expect(btn("btn:outline").bg).toBe(h.app.theme.roles.text.bg ?? h.app.theme.bg); // on the rail, on the page
  });
  test("tree lines: ├─ to each child, └─ to the last, │ where an ancestor goes on", async () => {
    const h = await harness({ open: "samples/large-document.md", width: 160, height: 90, config: (c) => (c.ui.outline = true) });
    const c = h.canvas();
    const sb = h.app.geometry!.sidebar!;
    const rows = h.app.treeRows();
    const at = (i: number) => c.rows[sb.y + i - h.app.sidebar.scroll]!;
    // In each expanded folder, children branch with ├─ and the last one closes with └─.
    const kids = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.depth === 1);
    expect(kids.length).toBeGreaterThan(1);
    const lastKid = kids.filter(({ i }) => !rows.slice(i + 1).some((r, j) => r.depth === 1 && !rows.slice(i + 1, i + 1 + j).some((x) => x.depth < 1)))[0]!;
    expect(at(kids[0]!.i).slice(sb.x + 1, sb.x + 3).join("")).toBe(kids[0] === lastKid ? "└─" : "├─");
    expect(at(lastKid.i).slice(sb.x + 1, sb.x + 3).join("")).toBe("└─");
    expect(c.styles[sb.y + kids[0]!.i - h.app.sidebar.scroll]![sb.x + 1]!.fg).toBe(h.app.theme.roles.tree_guide.fg!);
    // The outline: a sub-heading under a section with later siblings has │ then ├─ or └─.
    const o = h.app.geometry!.outline!;
    const orows = h.app.outlineRows();
    const sub = orows.findIndex((r, i) => r.level === 3 && orows.slice(i + 1).some((x) => x.level === 2));
    const line = c.rows[o.y + sub - h.app.outline.scroll]!.slice(o.x + 1, o.x + 5).join("");
    expect(line).toMatch(/^│ [├└]─$/);
    // Every heading with sub-headings shows a fold marker, so sibling titles line up.
    const d = orows.findIndex((r) => r.level === 2 && r.hasChildren);
    const dl = c.rows[o.y + d - h.app.outline.scroll]!.join("");
    const leaf = c.rows[o.y + orows.findIndex((r) => r.level === 2 && !r.hasChildren) - h.app.outline.scroll]!.join("");
    expect(dl.indexOf(orows[d]!.text.slice(0, 6)) - o.x).toBe(leaf.indexOf(orows.find((r) => r.level === 2 && !r.hasChildren)!.text.slice(0, 6)) - o.x);
  });
  test("focus shows as brightness: titles and the active tab, never a coloured border", async () => {
    const h = await harness({ open: "samples/large-document.md", width: 160, config: (c) => (c.ui.outline = true) });
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
    expect(content).toEqual({ explorer: roles.pane_title.fg!, outline: roles.pane_title.fg!, tab: roles.tab_active.fg!, border: roles.border.fg! });
    h.app.region = "sidebar";
    const files = look();
    expect(files).toEqual({ explorer: roles.pane_title_active.fg!, outline: roles.pane_title.fg!, tab: roles.tab_active_idle.fg!, border: roles.border.fg! });
    h.app.region = "outline";
    expect(look()).toEqual({ explorer: roles.pane_title.fg!, outline: roles.pane_title_active.fg!, tab: roles.tab_active_idle.fg!, border: roles.border.fg! });
    // Bold throughout, so nothing shifts.
    expect(roles.pane_title.bold && roles.pane_title_active.bold && roles.tab_active_idle.bold && roles.tab_active.bold).toBe(true);
  });
  test("a click anywhere in a side pane focuses it; a heading click is a choice: the note takes focus", async () => {
    const h = await harness({ open: "samples/large-document.md", width: 160, config: (c) => (c.ui.outline = true) });
    const click = (x: number, y: number) => {
      h.app.handleMouse({ type: "down", x, y, button: 0 });
      h.app.handleMouse({ type: "up", x, y, button: 0 });
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
    const row = h.app.outlineRows()[2]!;
    click(o.x + 12, o.y + 2 - h.app.outline.scroll);
    expect(h.app.view!.cur.row).toBe(row.line); // the note moved there
    expect(h.app.region).toBe("content"); // and took the focus
    // The ▤ button: open (and focus) when closed, close when open.
    await h.app.run("outline.toggle");
    expect(h.app.outlineShown).toBe(false);
    const btn = g().hot.find((r) => r.id === "btn:outline")!;
    click(btn.x + 1, btn.y);
    expect(h.app.outlineShown).toBe(true);
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
    const notes = ["index.md", "notes/alpha.md", "notes/beta.md", "notes/gamma.md", "samples/large-document.md"];
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
    h.app.handleMouse({ type: "down", x: m.x + 1, y: m.y, button: 0 });
    h.app.handleMouse({ type: "up", x: m.x + 1, y: m.y, button: 0 });
    h.frame();
    expect(h.app.overlay?.kind).toBe("list");
    expect(h.frame()).toContain("Tabs");
  });
  test("each window has its breadcrumb and a rule on top; a click scrolls that window", async () => {
    const h = await harness({ open: "notes/alpha.md", width: 160 });
    h.app.moveCursor(h.app.view!, { row: rowStarting(h, "Back to"), col: 0 });
    const f = h.frame();
    expect(topRow(f)).not.toContain("Section One"); // the top bar's middle stays empty
    const pane = h.app.geometry!.panes[0]!;
    const rows = f.split("\n");
    expect(rows[pane.y - 2]).toMatch(/§ Alpha › Section One/);
    // Right under it a rule, joined to the explorer's border.
    expect(rows[pane.y - 1]!.slice(pane.x, pane.x + 20)).toBe("━".repeat(20));
    expect(rows[pane.y - 1]![pane.x - 1]).toBe("┣");
    // Above it the rule under the tab strip, meeting the explorer's border.
    expect(rows[pane.y - 3]!.slice(pane.x - 1, pane.x + 5)).toBe(`╋${"━".repeat(5)}`); // and the explorer's title rule
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
    const path = hot(h, "status:path");
    click(h, path.x, path.y);
    expect(h.copied.at(-1)).toEndWith("/notes/alpha.md");
    const msg = hot(h, "status:message");
    click(h, msg.x + 3, msg.y);
    expect(h.frame()).toContain("Messages");
  });
  test("messages sit in the top bar and prompts on the status line: the note never changes height", async () => {
    const h = await harness({ open: "notes/alpha.md", width: 100, height: 24 });
    h.frame();
    const height = h.app.view!.height;
    const lines = () => h.frame().split("\n");
    h.app.message("error", "something broke");
    let f = lines();
    expect(h.app.view!.height).toBe(height);
    expect(f[0]).toContain("✗ something broke");
    expect(f.at(-1)).toContain("READ"); // the status line stays
    const msg = h.app.geometry!.hot.find((r) => r.id === "status:message")!;
    expect(msg.y).toBe(0);
    await h.keys("/", "B");
    expect(h.app.overlay?.kind).toBe("prompt");
    f = lines();
    expect(h.app.view!.height).toBe(height);
    expect(f.at(-1)).toMatch(/^ \/B/);
    expect(f.at(-1)).not.toContain("READ");
    await h.keys("escape");
    // Without a top bar, a message takes over the status line for its while.
    const n = await harness({ open: "notes/alpha.md", width: 100, height: 24, config: (c) => (c.ui.top_bar = false) });
    n.frame();
    const nh = n.app.view!.height;
    n.app.message("warn", "careful");
    f = n.frame().split("\n");
    expect(n.app.view!.height).toBe(nh);
    expect(f.at(-1)).toContain("! careful");
  });
  test("split windows: title then breadcrumb on one row; a click acts on its own window", async () => {
    const h = await harness({ open: "samples/large-document.md", width: 160 });
    await h.keys("ctrl+w", "v");
    const [a, b] = h.app.tab!.views;
    // Move the right window's cursor a few headings down, then focus the left one.
    h.app.tab!.active = 1;
    for (let i = 0; i < 4; i++) await h.app.run("cursor.heading_next");
    h.app.tab!.active = 0;
    const f = h.frame();
    const crumb = h.app.geometry!.hot.find((r) => r.id.startsWith("crumb:1:"))!;
    expect(f.split("\n")[crumb.y]).toContain("large-document.md");
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
    h.app.handleMouse({ type: "down", x, y, button });
    h.app.handleMouse({ type: "up", x, y, button });
    h.frame();
  };
  test("a drag selection survives the re-layout its copy message causes", async () => {
    const h = await harness({ open: "samples/README.md", width: 120, height: 30 });
    h.frame();
    const p = h.app.geometry!.panes[0]!;
    h.app.handleMouse({ type: "down", x: p.textX + 2, y: p.y + 2, button: 0 });
    h.app.handleMouse({ type: "drag", x: p.textX + 10, y: p.y + 8, button: 0 });
    h.app.handleMouse({ type: "up", x: p.textX + 10, y: p.y + 8, button: 0 });
    const cur = { ...h.app.view!.cur };
    h.frame(); // the message line changes the pane's height
    expect(h.app.view!.cur).toEqual(cur);
    expect(h.copied.at(-1)!.length).toBeGreaterThan(10);
  });
  test("clicking a list's bottom border or footer runs nothing", async () => {
    const h = await harness({ width: 120, height: 30 });
    await h.keys("?");
    h.frame();
    const r = h.app.geometry!.overlay!;
    const before = h.app.view!.cur;
    click(h, r.x + 10, r.y + r.h - 1); // the bottom border
    click(h, r.x + 10, r.listY + r.rows + 2); // the footer
    expect(h.app.overlay?.kind).toBe("list");
    expect(h.app.view!.cur).toEqual(before);
  });
  test("an exact alias yields to the entry you moved to", async () => {
    const h = await harness({ width: 120, height: 30 });
    await h.keys(":", "q");
    const o = h.app.overlay as ListOverlay;
    expect(o.filtered[0]!.item.data).toBe("app.quit"); // the alias row first
    await h.keys("down");
    const chosen = o.filtered[o.selected]!.item.data;
    await h.keys("enter");
    expect(h.quit.called).toBe(false);
    expect(chosen).not.toBe("app.quit");
  });
  test("closing another tab keeps you on yours", async () => {
    const h = await harness({ width: 120, height: 30 });
    h.app.openInNewTab("notes/alpha.md");
    h.app.openInNewTab("notes/beta.md");
    h.app.activeTab = 0;
    h.app.closeTabAt(2);
    expect(h.app.activeTab).toBe(0);
    h.app.activeTab = 1;
    h.app.closeTabAt(0);
    expect(h.app.tabs[h.app.activeTab]!.views[0]!.buf.rel).toBe("notes/alpha.md");
  });
  test("the wheel scrolls the explorer and outline, and on narrow screens not the note under them", async () => {
    const h = await harness({ open: "samples/large-document.md", width: 120, height: 20, config: (c) => (c.ui.outline = true) });
    h.frame();
    const sb = h.app.geometry!.sidebarPane!;
    h.app.handleMouse({ type: "scroll", x: sb.x + 3, y: sb.y + 4, button: 0, scroll: { direction: "down", delta: 1 } });
    h.frame();
    expect(h.app.sidebar.scroll).toBeGreaterThan(0);
    const op = h.app.geometry!.outlinePane!;
    h.app.handleMouse({ type: "scroll", x: op.x + 3, y: op.y + 4, button: 0, scroll: { direction: "down", delta: 1 } });
    h.frame();
    expect(h.app.outline.scroll).toBeGreaterThan(0);
    const n = await harness({ open: "samples/large-document.md", width: 70, height: 20 });
    await n.keys("ctrl+e");
    n.frame();
    const p = n.app.geometry!.sidebarPane!;
    const top = n.app.view!.top;
    n.app.handleMouse({ type: "scroll", x: p.x + 3, y: p.y + 4, button: 0, scroll: { direction: "down", delta: 1 } });
    expect(n.app.view!.top).toBe(top);
  });
  test("wrapping off: the sideways offset is clamped when the window widens", async () => {
    const h = await harness({ open: "samples/wrap-probe.md", width: 80, height: 30, config: (c) => ((c.ui.wrap = false), (c.ui.sidebar = false)) });
    h.frame();
    const v = h.app.view!;
    const layout = h.app.currentLayout(v);
    const row = layout.lines.reduce((best, l, i, all) => (l.spans.reduce((a, x) => a + x.text.length, 0) > all[best]!.spans.reduce((a, x) => a + x.text.length, 0) ? i : best), 0);
    h.app.moveCursor(v, { row, col: 10_000 });
    await h.keys("$");
    h.frame();
    expect(v.left).toBeGreaterThan(0);
    const wide = h.app.draw.bind(h.app);
    const { TextCanvas } = await import("../src/tui/canvas.ts");
    wide(new TextCanvas(200, 30));
    expect(v.left).toBeLessThanOrEqual(Math.max(0, h.app.currentLayout(v).width - h.app.textColumns(v)));
  });
  test("focus never stays on a hidden pane", async () => {
    const h = await harness({ width: 120, height: 30 });
    await h.keys("ctrl+e");
    expect(h.app.region).toBe("sidebar");
    h.app.setUi("zen", true);
    h.frame();
    expect(h.app.region).toBe("content");
  });
  test("UI settings survive a start with a path; an explicit theme beats a remembered one", async () => {
    const root = mkdtempSync(join(sandbox, "vault-"));
    cpSync(join(import.meta.dir, "fixtures", "vault"), root, { recursive: true, verbatimSymlinks: true });
    const a = await harness({ root, open: "notes/alpha.md" });
    a.app.setUi("line_numbers", true);
    a.app.saveState();
    const b = await harness({ root, open: "notes/beta.md" }); // with a path: tabs not restored
    expect(b.app.ui.line_numbers).toBe(true);
    b.app.setUi("theme", "nord");
    b.app.saveState();
    const c = await harness({ root, open: "notes/beta.md", themeName: "dracula" });
    expect(c.app.ui.theme).toBe("dracula");
  });
  test("on a narrow strip, +N is clickable: tabs stop before it", async () => {
    const h = await harness({ open: "samples/README.md", width: 30, height: 12 });
    for (const n of ["notes/alpha.md", "notes/beta.md", "index.md", "samples/wide-tables.md", "samples/code-heavy.md", "samples/dense-tables.md", "samples/large-document.md"]) h.app.openInNewTab(n);
    h.app.activeTab = 3;
    h.frame();
    const more = h.app.geometry!.hot.find((r) => r.id === "tabmore:")!;
    for (const r of h.app.geometry!.hot) if (r.id.startsWith("tab")) expect(r.id === "tabmore:" || r.x + r.w <= more.x).toBe(true);
    const count = h.app.tabs.length;
    click(h, more.x + 2, more.y);
    expect(h.app.tabs).toHaveLength(count);
    expect(h.app.overlay?.kind).toBe("list");
  });
  test("a short list keeps its selection in view (the footer goes first)", async () => {
    for (const [width, height] of [[60, 16], [40, 12], [60, 20]] as const) {
      const h = await harness({ width, height });
      await h.keys("?");
      h.frame();
      const o = h.app.overlay as ListOverlay;
      const r = h.app.geometry!.overlay!;
      expect(o.selected).toBeGreaterThanOrEqual(o.scroll);
      expect(o.selected).toBeLessThan(o.scroll + r.rows);
    }
  });
  test("a stacked split too short for two windows shows the active one, inside its area", async () => {
    const h = await harness({ open: "samples/README.md", width: 40, height: 9 });
    await h.keys("ctrl+w", "s");
    const rows = h.frame().split("\n");
    expect(rows.at(-2)!.startsWith("━")).toBe(true); // the bottom frame rule is intact
    expect(h.app.geometry!.panes.some((p) => p.view === h.app.view)).toBe(true);
  });
  test("clicks on an overlaid explorer or outline don't reach what's under it", async () => {
    const h = await harness({ open: "samples/large-document.md", width: 80, height: 24 });
    await h.keys("]", "]");
    await h.keys("ctrl+e");
    h.frame();
    const p = h.app.geometry!.sidebarPane!;
    const row = h.app.view!.cur.row;
    click(h, p.x + 3, p.y);
    expect(h.app.view!.cur.row).toBe(row);
    expect(h.app.region).toBe("sidebar");
  });
  test("which-key on a tiny screen stays inside its box and says what's hidden", async () => {
    const h = await harness({ width: 60, height: 14 });
    const rows = (await h.keys("space")).split("\n");
    const top = rows.findIndex((r) => r.includes("┌─"));
    const bottom = rows.findIndex((r, i) => i > top && r.includes("└"));
    const right = rows[top]!.lastIndexOf("┐");
    for (let y = top; y <= bottom; y++) expect(rows[y]!.slice(right + 1).replace(/[▐┃━]/g, "").trim()).toBe("");
    expect(rows[bottom]).toMatch(/\+\d+ more/);
  });
  test("NO_COLOR: the scrollbar thumb stands out from its track; the current note is bold", async () => {
    const h = await harness({ open: "samples/large-document.md", width: 100, height: 20, themeName: "mono" });
    const c = h.canvas();
    const bar = h.app.geometry!.scrollbars[0]!;
    const col = Array.from({ length: bar.h }, (_, k) => c.rows[bar.y + k]![bar.x]);
    expect(new Set(col).size).toBeGreaterThan(1);
    expect(h.app.theme.roles.sidebar_active.bold).toBe(true);
  });
  test("without the breadcrumb, the outline button is in the top bar", async () => {
    const h = await harness({ width: 100, height: 14, config: (c) => ((c.ui.breadcrumb = false), (c.ui.right_rail = false)) });
    h.frame();
    const btn = h.app.geometry!.hot.find((r) => r.id === "btn:outline")!;
    expect(btn.y).toBe(0);
    click(h, btn.x + 1, btn.y);
    expect(h.app.outlineShown).toBe(true);
  });
  test("which-key on a short screen drops its blank rows before its explanations", async () => {
    // At every height: blank rows inside the box only ever appear together with the explanations.
    for (let height = 12; height <= 40; height++) {
      const h = await harness({ width: 160, height });
      const rows = (await h.keys("space")).split("\n");
      const head = rows.findIndex((r) => r.includes("┌─ ␣ › leader"));
      if (head < 0) continue;
      const left = rows[head]!.indexOf("┌");
      const padded = rows[head + 1]!.slice(left + 1, rows[head + 1]!.lastIndexOf("│")).trim() === "";
      const described = rows.join("\n").includes("notes, headings, text, commands");
      if (padded) expect(described).toBe(true);
    }
  });
});

describe("review round 2", () => {
  const click = (h: Harness, x: number, y: number) => {
    h.app.handleMouse({ type: "down", x, y, button: 0 });
    h.app.handleMouse({ type: "up", x, y, button: 0 });
    h.frame();
  };
  test("side panes can't squeeze the note to nothing: no crash with a split and wide panes", async () => {
    const h = await harness({ open: "samples/README.md", width: 100, height: 30, config: (c) => ((c.ui.outline = true), (c.ui.sidebar_width = 60), (c.ui.outline_width = 60)) });
    await h.keys("ctrl+w", "v");
    h.frame(); // throws on a drawing failure
    expect(h.app.contentWidth()).toBeGreaterThanOrEqual(24);
  });
  test("an overlaid explorer keeps clicks on its border and margin", async () => {
    const h = await harness({ open: "samples/README.md", width: 70, height: 30 });
    await h.keys("ctrl+e");
    h.frame();
    const p = h.app.geometry!.sidebarPane!;
    const cur = { ...h.app.view!.cur };
    click(h, p.x + p.w - 1, p.y + 6); // the margin, over the note
    expect(h.app.view!.cur).toEqual(cur);
    expect(h.app.region).toBe("sidebar");
  });
  test("focusing a pane brings its selection back after the wheel moved the view", async () => {
    const h = await harness({ open: "samples/large-document.md", width: 160, height: 16 });
    h.frame();
    const p = h.app.geometry!.sidebarPane!;
    for (let i = 0; i < 3; i++) h.app.handleMouse({ type: "scroll", x: p.x + 3, y: p.y + 3, button: 0, scroll: { direction: "down", delta: 1 } });
    expect(h.app.sidebar.pinned).toBe(true);
    await h.keys("ctrl+e");
    h.frame();
    expect(h.app.sidebar.pinned).toBe(false);
    const list = h.app.geometry!.sidebar!;
    expect(h.app.sidebar.selected).toBeGreaterThanOrEqual(h.app.sidebar.scroll);
    expect(h.app.sidebar.selected).toBeLessThan(h.app.sidebar.scroll + list.h);
  });
  test("a selection stays on the same source lines when the width changes", async () => {
    const h = await harness({ open: "samples/large-document.md", width: 140, height: 30, config: (c) => (c.ui.sidebar = false) });
    for (let i = 0; i < 12; i++) await h.keys("j");
    await h.keys("shift+v", "j", "j");
    const lines = () => {
      const v = h.app.view!;
      const l = h.app.currentLayout(v);
      return [l.lines[v.sel!.anchor.row]!.src, l.lines[v.cur.row]!.src];
    };
    const before = lines();
    await h.keys("ctrl+e", "escape"); // the explorer takes width: the note re-wraps
    h.frame();
    // The same place (a blank line between paragraphs has no row, so the next one stands in),
    // never another paragraph as before.
    const after = lines();
    expect(Math.abs(after[0]! - before[0]!)).toBeLessThanOrEqual(1);
    expect(after[1]).toBe(before[1]);
  });
  test("a which-key entry takes its click, not what's under the popup", async () => {
    const h = await harness({ open: "samples/links-and-unicode.md", width: 120, height: 30 });
    await h.keys("ctrl+w", "s", "ctrl+w", "j");
    await h.keys("space");
    h.frame();
    for (const r of h.app.geometry!.hot.filter((x) => x.id.startsWith("wk:"))) {
      const at = h.app.geometry!.hot.find((x) => x.x <= r.x + 1 && r.x + 1 < x.x + x.w && x.y <= r.y && r.y < x.y + x.h)!;
      expect(at.id).toBe(r.id);
    }
  });
  test("an empty search clears the find; alias candidates: move to one to apply it, else the picker", async () => {
    const h = await harness({ width: 120, height: 30 });
    await h.keys("/", "enter");
    expect(h.app.view!.find).toBeNull();
    await h.keys(":", "t", "h", "e", "m", "e", "space", "down");
    const o = h.app.overlay as ListOverlay;
    const pick = o.filtered[o.selected]!.item.data as string;
    await h.keys("enter");
    expect(`theme.set ${h.app.ui.theme}`).toBe(pick);
    await h.keys(":", "e", "space", "enter"); // not moved: the note picker, not some note
    expect(h.app.overlay?.kind).toBe("list");
    expect(h.app.view!.buf.rel).toBe("index.md");
  });
});

describe("review round 3", () => {
  test("pasted text goes into the list filter or prompt (first line, sanitized)", async () => {
    const h = await harness();
    await h.keys("ctrl+p");
    h.app.paste("alp\u001b[31m\nsecond line");
    const o = h.app.overlay as ListOverlay;
    expect(o.input).toBe("alp");
    expect(o.filtered[0]!.item.label).toContain("alpha");
    await h.keys("ctrl+backspace"); // deletes a word in inputs
    expect(o.input).toBe("");
  });
  test("keypad keys and legacy ctrl+j arrive under the names the keymaps use", () => {
    expect(keyName({ name: "kpenter", sequence: "\u001b[57414u" } as never)).toBe("enter");
    expect(keyName({ name: "kpleft", sequence: "\u001b[57417u" } as never)).toBe("left");
    expect(keyName({ name: "linefeed", sequence: "\n" } as never)).toBe("ctrl+j");
  });
  test("a change to one note re-lays out only the open notes that link to it", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    h.app.openInNewTab("samples/wide-tables.md");
    h.frame();
    const wide = h.app.view!;
    const before = h.app.currentLayout(wide);
    const alpha = h.app.tabs[0]!.views[0]!;
    const alphaBefore = h.app.currentLayout(alpha);
    h.app.applyChanges({ changes: [{ rel: "notes/beta.md", kind: "changed", isNote: true }], rescan: false });
    expect(h.app.currentLayout(wide)).toBe(before); // no link to beta: the same layout object
    expect(h.app.currentLayout(alpha)).not.toBe(alphaBefore); // links to beta: re-laid out
  });
  test("fuzzy: a contiguous match ranks first and highlights where it matched", () => {
    const r = rank("readme", ["r/e/a/d/m/e.md", "notes/rename-adme.md", "areas/readme.md"], (x) => x);
    expect(r[0]!.item).toBe("areas/readme.md");
    expect(fuzzy("read", "areas/readme.md")!.positions).toEqual([6, 7, 8, 9]);
    expect(fuzzy("stan", "İİstanbul.md")!.positions).toEqual([2, 3, 4, 5]);
  });
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  test("the scratch's own writes never read as external changes (polled directories included)", async () => {
    const root = makeVault();
    const h = await harness({ root, watch: true, config: (c) => ((c.capture.location = "vault"), (c.watch.debounce_ms = 30), (c.watch.poll_ms = 100)) });
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
  test("a note that shrinks back under the size cap rejoins the explorer", async () => {
    const root = makeVault();
    const h = await harness({ root, config: (c) => (c.walk.max_file_size = 100) });
    const file = join(root, "notes", "beta.md");
    writeFileSync(file, "x".repeat(200));
    h.app.applyChanges({ changes: [{ rel: "notes/beta.md", kind: "changed", isNote: true }], rescan: false });
    expect(h.app.graph.notes.has("notes/beta.md")).toBe(false);
    h.app.expanded.add("notes"); // its folder open, so its notes are rows
    h.app.invalidateTree();
    expect(h.app.treeRows().some((r) => r.path === "notes/beta.md")).toBe(false); // the tree, cached
    writeFileSync(file, "# Beta small\n");
    h.app.applyChanges({ changes: [{ rel: "notes/beta.md", kind: "changed", isNote: true }], rescan: false });
    expect(h.app.graph.notes.has("notes/beta.md")).toBe(true);
    expect(h.app.treeRows().some((r) => r.path === "notes/beta.md")).toBe(true); // refreshed by the change
  });
  test("tiny terminals: panes go over the note, and nothing fails to draw", async () => {
    for (const width of [12, 20, 26, 40]) {
      const h = await harness({ width, height: 12, config: (c) => ((c.ui.narrow_width = 0), (c.ui.outline = true)) });
      h.frame(); // throws on a drawing failure
      expect(h.app.sidebarBeside && h.app.outlineBeside && h.app.contentWidth() < 24).toBe(false);
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
    const h = await harness({ open: "samples/wide-tables.md", width: 110, config: (c) => (c.ui.sidebar = false) });
    const wrapped = h.app.currentLayout(h.app.view!);
    await h.keys("space", "u", "s");
    expect(h.app.ui.wrap).toBe(false);
    const layout = h.app.currentLayout(h.app.view!);
    expect(layout.width).toBeGreaterThan(300); // the widest real row, not the pane
    expect(layout.width).toBeLessThan(2000); // not the probe width
    expect(layout.lines.length).toBeLessThan(wrapped.lines.length);
    const row = layout.lines.findIndex((l) => l.spans.map((x) => x.text).join("").includes("This paragraph is one very long"));
    h.app.moveCursor(h.app.view!, { row, col: 0 });
    expect(h.app.view!.left).toBe(0);
    await h.keys("$");
    const v = h.app.view!;
    expect(v.left).toBeGreaterThan(0);
    expect(v.cur.col).toBeGreaterThanOrEqual(v.left);
    expect(v.cur.col).toBeLessThan(v.left + h.app.textColumns(v));
    // What's drawn is the row's end, and a click lands on the column under it.
    const f = h.frame();
    expect(f).toContain("avoid breaking mid-word.");
    const pane = h.app.geometry!.panes[0]!;
    const y = pane.y + row - v.top;
    h.app.handleMouse({ type: "down", x: pane.textX + 5, y, button: 0 });
    h.app.handleMouse({ type: "up", x: pane.textX + 5, y, button: 0 });
    expect(h.app.view!.cur.col).toBe(v.left + 5);
    // A horizontal wheel scrolls sideways without moving the cursor.
    const before = v.left;
    h.app.handleMouse({ type: "scroll", x: pane.textX + 5, y, button: 0, scroll: { direction: "left", delta: 1 } });
    expect(v.left).toBeLessThan(before);
    // Back on: wrapped again, no sideways scroll.
    await h.keys("space", "u", "s");
    expect(h.app.view!.left).toBe(0);
    expect(h.app.currentLayout(h.app.view!).width).toBe(wrapped.width);
  });
  test(":wrap toggles it, and rules don't count toward the natural width", async () => {
    const h = await harness({ open: "samples/large-document.md", width: 120 });
    await h.keys(":", "w", "r", "a", "p", "enter");
    expect(h.app.ui.wrap).toBe(false);
    const layout = h.app.currentLayout(h.app.view!);
    // Every row that isn't a rule fits within the natural width.
    expect(layout.width).toBeLessThan(2000);
  });
});

describe("mouse", () => {
  const click = (h: Harness, x: number, y: number) => {
    h.app.handleMouse({ type: "down", x, y, button: 0 });
    h.app.handleMouse({ type: "up", x, y, button: 0 });
    h.frame();
  };
  test("double-click selects a word, triple-click the row; both copy", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    const pane = h.app.geometry!.panes[0]!;
    const row = rowStarting(h, "Back to");
    const y = pane.y + row - h.app.view!.top;
    click(h, pane.textX + 1, y);
    click(h, pane.textX + 1, y);
    expect(h.copied.at(-1)).toBe("Back");
    click(h, pane.textX + 1, y);
    expect(h.copied.at(-1)).toBe("Back to index and on to beta.");
  });
  test("scrollbar click and drag jump through the note", async () => {
    const h = await harness({ open: "samples/large-document.md" });
    h.frame();
    const bar = h.app.geometry!.scrollbars[0]!;
    // The whole bar is a ▐ column: the track faint, the thumb (at the top here) stronger.
    const c = h.canvas();
    for (let y = bar.y; y < bar.y + bar.h; y++) expect(c.rows[y]![bar.x]).toBe("▐");
    expect(c.styles[bar.y]![bar.x]!.fg).toBe(h.app.theme.roles.scrollbar.fg!);
    expect(c.styles[bar.y + bar.h - 1]![bar.x]!.fg).toBe(h.app.theme.roles.scrollbar_track.fg!);
    click(h, bar.x, bar.y + bar.h - 1);
    expect(h.app.view!.top).toBeGreaterThan(100);
    h.app.handleMouse({ type: "down", x: bar.x, y: bar.y + bar.h - 1, button: 0 });
    h.app.handleMouse({ type: "drag", x: bar.x, y: bar.y, button: 0 });
    h.app.handleMouse({ type: "up", x: bar.x, y: bar.y, button: 0 });
    expect(h.app.view!.top).toBe(0);
  });
  test("side panes get a scrollbar when their rows overflow; clicking it pins the scroll", async () => {
    const h = await harness({ open: "samples/large-document.md", width: 160, height: 20, config: (c) => (c.ui.outline = true) });
    h.frame();
    const outline = h.app.geometry!.scrollbars.find((b) => b.pane === "outline")!;
    expect(outline).toBeDefined();
    const c = h.canvas();
    for (let y = outline.y; y < outline.y + outline.h; y++) expect(c.rows[y]![outline.x]).toBe("▐");
    click(h, outline.x, outline.y + outline.h - 1);
    expect(h.app.outline.scroll).toBe(outline.total - outline.h);
    expect(h.app.outline.pinned).toBe(true);
    // The note didn't move.
    expect(h.app.view!.top).toBe(0);
  });
  test("side panes scroll sideways when rows are wider than the pane", async () => {
    const h = await harness({ open: "samples/large-document.md", width: 160, height: 30, config: (c) => (c.ui.outline = true) });
    h.frame();
    expect(h.app.region).toBe("content");
    const bar = h.app.geometry!.scrollbars.find((b) => b.pane === "outline" && b.horizontal)!;
    expect(bar).toBeDefined();
    expect(bar.total).toBeGreaterThan(bar.w);
    const c = h.canvas();
    expect(c.rows[bar.y]!.slice(bar.x, bar.x + bar.w).join("")).toBe("▄".repeat(bar.w));
    // Rows are clipped, not cut with an ellipsis, and the list stops above the bar.
    const list = h.app.geometry!.outline!;
    expect(list.y + list.h).toBe(bar.y);
    const rows = c.rows.slice(list.y, list.y + list.h).map((r) => r.slice(list.x, list.x + list.w).join(""));
    expect(rows.some((r) => r.includes("…"))).toBe(false);
    // Dragging to the end shows the ends of the longest rows; the wheel comes back.
    h.app.handleMouse({ type: "down", x: bar.x + bar.w - 1, y: bar.y, button: 0 });
    h.app.handleMouse({ type: "up", x: bar.x + bar.w - 1, y: bar.y, button: 0 });
    h.frame();
    expect(h.app.outline.left).toBe(bar.total - bar.w);
    for (let k = 0; k < 100; k++) h.app.handleMouse({ type: "scroll", x: list.x + 2, y: list.y + 1, button: 0, scroll: { direction: "left", delta: 1 } });
    h.frame();
    expect(h.app.outline.left).toBe(0);
    h.app.handleMouse({ type: "scroll", x: list.x + 2, y: list.y + 1, button: 0, scroll: { direction: "right", delta: 1 } });
    h.frame();
    expect(h.app.outline.left).toBeGreaterThan(0);
    // Clicking a pane's bar focuses the pane, like any click in it.
    expect(h.app.region).toBe("outline");
  });
  test("wrapping off: a horizontal scrollbar under the text scrolls sideways", async () => {
    const h = await harness({ open: "samples/wide-tables.md", width: 100, height: 30, config: (c) => ((c.ui.wrap = false), (c.ui.sidebar = false)) });
    h.frame();
    const v = h.app.view!;
    const bar = h.app.geometry!.scrollbars.find((b) => b.horizontal)!;
    expect(bar).toBeDefined();
    const pane = h.app.geometry!.panes[0]!;
    // Its own row, under the text: the text rows end above it.
    expect(bar.y).toBe(pane.y + pane.h);
    expect(v.height).toBe(pane.h);
    const c = h.canvas();
    expect(c.rows[bar.y]!.slice(bar.x, bar.x + bar.w).join("")).toBe("▄".repeat(bar.w));
    expect(c.styles[bar.y]![bar.x]!.fg).toBe(h.app.theme.roles.scrollbar.fg!);
    expect(c.styles[bar.y]![bar.x + bar.w - 1]!.fg).toBe(h.app.theme.roles.scrollbar_track.fg!);
    click(h, bar.x + bar.w - 1, bar.y);
    expect(v.left).toBe(bar.total - bar.w);
    h.app.handleMouse({ type: "down", x: bar.x + bar.w - 1, y: bar.y, button: 0 });
    h.app.handleMouse({ type: "drag", x: bar.x, y: bar.y, button: 0 });
    h.app.handleMouse({ type: "up", x: bar.x, y: bar.y, button: 0 });
    expect(v.left).toBe(0);
    // A note that fits keeps the row (the text doesn't jump) but draws no bar.
    await h.keys("space", "u", "s", "space", "u", "s");
    const n = await harness({ open: "notes/alpha.md", width: 100, height: 30, config: (c) => ((c.ui.wrap = false), (c.ui.sidebar = false)) });
    n.frame();
    expect(n.app.geometry!.scrollbars.some((b) => b.horizontal)).toBe(false);
    expect(n.app.view!.height).toBe(n.app.geometry!.panes[0]!.h);
  });
  test("an overlaid pane joins the borders it crosses", async () => {
    const h = await harness({ open: "samples/large-document.md", width: 60, height: 24, config: (c) => (c.ui.sidebar = false) });
    await h.keys("ctrl+e");
    const f = h.frame();
    const lines = f.split("\n");
    // The explorer's border meets the rules above and below it with tee joints, never a crossing.
    const pane = h.app.geometry!.sidebarPane!;
    const x = pane.x + pane.w - 3;
    const col = lines.map((l) => [...l][x] ?? "").join("");
    expect(col).not.toContain("╋");
    for (const joint of ["┳", "┫", "┻"]) expect(col).toContain(joint);
  });
  test("dragging borders resizes the explorer, the outline and the split", async () => {
    const h = await harness({ open: "samples/large-document.md", width: 170, config: (c) => (c.ui.outline = true) });
    await h.keys("ctrl+w", "v");
    h.frame();
    const seps = h.app.geometry!.separators;
    const side = seps.find((s) => s.kind === "sidebar")!;
    h.app.handleMouse({ type: "down", x: side.x, y: side.y + 3, button: 0 });
    h.app.handleMouse({ type: "drag", x: side.x + 8, y: side.y + 3, button: 0 });
    h.app.handleMouse({ type: "up", x: side.x + 8, y: side.y + 3, button: 0 });
    expect(h.app.sideW).toBe(side.x + 8 - h.app.leftRailWidth);
    const out = seps.find((s) => s.kind === "outline")!;
    h.app.handleMouse({ type: "down", x: out.x, y: out.y + 3, button: 0 });
    h.app.handleMouse({ type: "drag", x: out.x - 6, y: out.y + 3, button: 0 });
    h.app.handleMouse({ type: "up", x: out.x - 6, y: out.y + 3, button: 0 });
    expect(h.app.outW).toBe(170 - h.app.rightRailWidth - (out.x - 6) - 1);
    h.frame();
    const split = h.app.geometry!.separators.find((s) => s.kind === "split-side")!;
    h.app.handleMouse({ type: "down", x: split.x, y: split.y + 3, button: 0 });
    h.app.handleMouse({ type: "drag", x: split.area!.x + Math.round(split.area!.w * 0.3), y: split.y + 3, button: 0 });
    h.app.handleMouse({ type: "up", x: split.x, y: split.y + 3, button: 0 });
    expect(h.app.tab!.ratio).toBeCloseTo(0.3, 1);
  });
  test("explorer: click a folder to fold it; a click opens a note as a tab, once", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    h.frame();
    const sb = h.app.geometry!.sidebar!;
    const rowOf = (path: string) => h.app.treeRows().findIndex((r) => r.path === path) - h.app.sidebar.scroll + sb.y;
    click(h, sb.x + 3, rowOf("notes"));
    expect(h.app.treeRows().some((r) => r.path === "notes/beta.md")).toBe(false);
    click(h, sb.x + 3, rowOf("notes"));
    expect(h.app.treeRows().some((r) => r.path === "notes/beta.md")).toBe(true);
    const y = rowOf("notes/beta.md");
    click(h, sb.x + 6, y);
    expect(h.app.tabs).toHaveLength(2);
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
    click(h, sb.x + 6, y); // a double-click finds the tab the first click opened
    expect(h.app.tabs).toHaveLength(2);
    expect(h.app.tabs[0]!.views[0]!.buf.rel).toBe("notes/alpha.md"); // the first tab is untouched
  });
  test("outline: click the fold marker folds; click the text jumps", async () => {
    const h = await harness({ open: "samples/large-document.md", width: 160, config: (c) => (c.ui.outline = true) });
    h.frame();
    const o = h.app.geometry!.outline!;
    const before = h.app.outlineRows().length;
    const first = h.app.outlineRows()[0]!;
    click(h, o.x + 1 + (first.level - 1) * 2, o.y);
    expect(h.app.outlineRows().length).toBeLessThan(before);
    click(h, o.x + 1 + (first.level - 1) * 2, o.y);
    click(h, o.x + 10, o.y + 2);
    expect(h.app.view!.cur.row).toBe(h.app.outlineRows()[2]!.line);
  });
  test("which-key entries are clickable", async () => {
    const h = await harness({ width: 160 });
    await h.keys("space");
    h.frame();
    const u = h.app.geometry!.hot.find((r) => r.id === "wk:u")!;
    click(h, u.x + 2, u.y);
    expect(h.app.pending).toEqual(["space", "u"]);
    const z = h.app.geometry!.hot.find((r) => r.id === "wk:z")!;
    click(h, z.x + 2, z.y);
    expect(h.app.ui.zen).toBe(true);
  });
  test("floating windows have a margin in their own colour: a row above and below, two columns aside", async () => {
    const h = await harness({ open: "samples/large-document.md", width: 140, height: 40 });
    await h.keys(":");
    h.frame();
    const r = h.app.geometry!.overlay!;
    const c = h.canvas();
    const bg = h.app.theme.roles.overlay.bg!;
    for (const [x, y] of [[r.x - 1, r.y + 3], [r.x - 2, r.y + 3], [r.x + r.w, r.y + 3], [r.x + r.w + 1, r.y + 3], [r.x + 5, r.y - 1], [r.x + 5, r.y + r.h]] as const) {
      expect(c.rows[y]![x]).toBe(" ");
      expect(c.styles[y]![x]!.bg).toBe(bg);
    }
    // The explorer over the content (narrow): a blank column past its border.
    const n = await harness({ width: 70, height: 30 });
    await n.keys("ctrl+e");
    n.frame();
    const p = n.app.geometry!.sidebarPane!; // over the note, the pane's area includes its border and margin
    const nc = n.canvas();
    for (let y = p.y; y < p.y + p.h; y++) expect(nc.rows[y]!.slice(p.x + p.w - 2, p.x + p.w).join("")).toBe("  ");
  });
  test("the wheel scrolls a list; the selection moves only to stay in view", async () => {
    const h = await harness({ width: 140, height: 40 });
    await h.keys("?");
    h.frame();
    const o = h.app.overlay as ListOverlay;
    const r = h.app.geometry!.overlay!;
    const wheel = (direction: string) => {
      h.app.handleMouse({ type: "scroll", x: r.x + 5, y: r.listY + 3, button: 0, scroll: { direction, delta: 1 } });
      h.frame();
    };
    expect(o.selected).toBe(2);
    wheel("down");
    expect(o.scroll).toBe(3); // the view moved three rows
    expect(o.selected).toBe(3); // row 2 left the view, so the selection moved to its top
    for (let i = 0; i < 5; i++) wheel("down");
    expect(o.scroll).toBe(18);
    expect(o.selected).toBeGreaterThanOrEqual(18); // kept in view, at its top
    expect(o.filtered[o.selected]!.item.header).toBeFalsy();
    const kept = o.selected;
    wheel("up");
    expect(o.scroll).toBe(15);
    expect(o.selected).toBe(kept); // still in view: untouched
    await h.keys("down"); // keys move the selection again, and the view follows it
    expect(o.selected).toBeGreaterThan(kept);
  });
});

describe("tabs (ctrl+t, space t)", () => {
  test("new, next, previous, go to, move, list, close", async () => {
    const h = await harness();
    await h.keys("ctrl+t", "o");
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

describe("explorer and outline panes", () => {
  test("ctrl+e cycles open, focus, close; enter and l open tabs (or switch); o here; s the split; q closes", async () => {
    const h = await harness({ config: (c) => (c.ui.sidebar = false) });
    expect(h.app.sidebarShown).toBe(false);
    await h.keys("ctrl+e");
    expect(h.app.sidebarShown).toBe(true);
    expect(h.app.region).toBe("sidebar");
    await h.keys("escape");
    expect(h.app.region).toBe("content");
    await h.keys("ctrl+e");
    expect(h.app.region).toBe("sidebar");
    await h.keys("ctrl+e");
    expect(h.app.sidebarShown).toBe(false);
    await h.keys("space", "e");
    h.app.sidebar.selected = h.app.treeRows().findIndex((r) => r.path === "notes");
    await h.keys("l", "j", "enter");
    expect(h.app.tabs).toHaveLength(2);
    await h.keys("ctrl+e", "j", "l"); // l opens a tab too
    expect(h.app.tabs).toHaveLength(3);
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
    await h.keys("ctrl+e", "k", "enter"); // already open: switches to its tab
    expect(h.app.tabs).toHaveLength(3);
    expect(h.app.activeTab).toBe(1);
    await h.keys("ctrl+e", "j", "o"); // o replaces the current window's note
    expect(h.app.tabs).toHaveLength(3);
    expect(h.app.tabs[1]!.views[0]!.buf.rel).toBe("notes/beta.md");
    await h.keys("ctrl+e", "s");
    expect(h.app.tab!.views).toHaveLength(2);
    await h.keys("ctrl+e", "q");
    expect(h.app.sidebarShown).toBe(false);
  });
  test("reveal: space shift+e", async () => {
    const h = await harness({ open: "notes/beta.md", config: (c) => (c.ui.sidebar = false) });
    await h.keys("space", "shift+e");
    expect(h.app.treeRows()[h.app.sidebar.selected]!.path).toBe("notes/beta.md");
  });
  test("outline: ctrl+o opens and focuses, focuses, closes; it follows the cursor while unfocused; enter jumps; h folds", async () => {
    const h = await harness({ open: "samples/large-document.md", width: 160 });
    await h.keys("ctrl+o");
    expect(h.app.outlineShown).toBe(true);
    expect(h.app.region).toBe("outline"); // opening focuses it
    expect(h.app.geometry!.outline).not.toBeNull();
    await h.keys("escape"); // back to the note; the outline stays open
    expect(h.app.region).toBe("content");
    expect(h.app.outlineShown).toBe(true);
    await h.keys("ctrl+o"); // open, focus elsewhere: focus it
    expect(h.app.region).toBe("outline");
    await h.keys("ctrl+o"); // focused: close
    expect(h.app.outlineShown).toBe(false);
    expect(h.app.region).toBe("content");
    await h.keys("ctrl+o", "escape");
    await h.keys("]", "]", "]", "]");
    expect(h.app.outline.selected).toBe(h.app.currentSection());
    await h.keys("ctrl+w", "l");
    expect(h.app.region).toBe("outline");
    await h.keys("g", "g", "enter");
    expect(h.app.region).toBe("content");
    expect(h.app.view!.cur.row).toBe(h.app.outlineRows()[0]!.line);
    const before = h.app.outlineRows().length;
    await h.keys("ctrl+w", "l", "g", "g", "h");
    expect(h.app.outlineRows().length).toBeLessThan(before);
    await h.keys("l");
    expect(h.app.outlineRows().length).toBe(before);
    await h.keys("q");
    expect(h.app.outlineShown).toBe(false);
  });
  test("narrow: panes overlay the content and close after a pick", async () => {
    const h = await harness({ width: 60, height: 20 });
    expect(h.frame()).not.toContain("▸ notes");
    await h.keys("ctrl+e");
    expect(h.frame()).toContain("▸ notes");
    await h.keys("escape");
    expect(h.frame()).not.toContain("▸ notes");
  });
});

describe("UI settings (space u)", () => {
  test("cursorline, line numbers, readable width, zen, urls", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    await h.keys("space", "u", "l");
    expect(h.app.ui.cursorline).toBe(false);
    await h.keys("space", "u", "n");
    expect(h.app.ui.line_numbers).toBe(true);
    const pane = h.app.geometry!.panes[0]!;
    expect(h.canvas().line(pane.y).slice(pane.x, pane.textX).trim()).toBe("1");
    await h.keys("space", "u", "w");
    expect(h.app.currentLayout(h.app.view!).width).toBeLessThanOrEqual(100);
    await h.keys("space", "u", "z");
    const f = h.frame();
    expect(f).not.toContain("READ");
    expect(f).not.toContain("▸ notes");
    await h.keys("space", "u", "r");
    expect(h.app.ui.urls).toBe(true);
    expect(h.frame()).toContain("<https://example.invalid>");
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
    const changed = await harness({ root, open: null, config: (c) => ((c.ui.restore_session = true), (c.ui.line_numbers = true)) });
    expect(changed.app.uiOverrides.line_numbers).toBeUndefined();
    const flipped = await harness({ root, open: null, config: (c) => ((c.ui.restore_session = true), (c.theme = "nord")) });
    expect(flipped.app.ui.theme).toBe("nord");
  });
});

describe("configuration: everything from config, and live reload", () => {
  test("keys, leader, pane keys, aliases and groups come from config", async () => {
    const h = await harness({
      open: "samples/large-document.md",
      config: (c) => {
        c.input.leader = ",";
        c.keys = { x: "cursor.bottom", j: "", "leader z": "ui.zen", explorer: { o: "open" } } as unknown as Config["keys"];
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
    const h = await harness({ config: (c) => ((c.keys = { Q: "no.such" } as Config["keys"]), (c.aliases = { zz: "nope.cmd" })) });
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
  test("[colors] overrides apply to the theme, the picker's preview and a live reload", async () => {
    const dir = mkdtempSync(join(sandbox, "cfg-"));
    const file = join(dir, "config.toml");
    writeFileSync(file, '[colors]\ntree_guide = "#445566"\n');
    const h = await harness({ configFile: file, config: (c) => (c.colors = { tree_guide: "#445566" }) });
    expect(h.app.theme.roles.tree_guide.fg).toBe("#445566");
    expect(h.app.themeNamed("nord").theme.roles.tree_guide.fg).toBe("#445566"); // what the picker previews
    writeFileSync(file, '[colors]\ntree_guide = "#778899"\n');
    await h.keys("space", "v", "c");
    expect(h.app.theme.roles.tree_guide.fg).toBe("#778899");
  });
  test("saving a config file reloads it automatically", async () => {
    const dir = mkdtempSync(join(sandbox, "cfg-"));
    const file = join(dir, "config.toml");
    writeFileSync(file, "");
    const h = await harness({ configFile: file, watch: true, config: (c) => ((c.watch.enabled = false), (c.watch.poll_ms = 100)) });
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
  test("add the cursor row reference, add a selection, open, copy", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    await h.keys("space", "s", "a");
    h.app.moveCursor(h.app.view!, { row: rowStarting(h, "Back to"), col: 0 });
    await h.keys("v", "e", "space", "s", "a");
    const text = readFileSync(h.app.scratch().path, "utf8");
    expect(text).toBe("`notes/alpha.md:1`\n\n`notes/alpha.md:9`\n\n```\nBack\n```\n");
    await h.keys("space", "s", "s");
    expect(h.app.displayName(h.app.view!.buf)).toBe("scratch");
    await h.keys("space", "s", "y");
    expect(h.copied.at(-1)).toBe(text);
  });
});

describe("external changes (5.3, 5.4) and anchoring (3.5)", () => {
  test("a clean buffer reloads silently and the cursor keeps its place", async () => {
    const h = await harness({ open: "samples/large-document.md", height: 20 });
    await h.keys("]", "]", "]", "]");
    const before = rowText(h);
    const file = join(h.root, "samples", "large-document.md");
    writeFileSync(file, `# Inserted by an agent\n\n${"A new paragraph.\n\n".repeat(20)}${readFileSync(file, "utf8")}`);
    h.app.applyChanges({ changes: [{ rel: "samples/large-document.md", kind: "changed", isNote: true }], rescan: false });
    h.frame();
    expect(rowText(h)).toBe(before);
    expect(h.frame()).toContain("↻");
  });
  test("a new note turns an unresolved link resolved; deletion is surfaced", async () => {
    const h = await harness();
    const role = () => h.app.currentLayout(h.app.view!).lines.flatMap((l) => l.spans).find((s) => s.text.includes("missing-note"))!.role;
    expect(role()).toBe("link_unresolved");
    writeFileSync(join(h.root, "missing-note.md"), "# now exists\n");
    h.app.applyChanges({ changes: [{ rel: "missing-note.md", kind: "created", isNote: true }], rescan: false });
    expect(role()).toBe("wikilink");
    await h.app.run("note.open missing-note.md");
    rmSync(join(h.root, "missing-note.md"));
    h.app.applyChanges({ changes: [{ rel: "missing-note.md", kind: "deleted", isNote: true }], rescan: false });
    expect(h.frame()).toContain("deleted on disk");
  });
  test("the real watcher: write, temp-and-rename, create, delete", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/beta.md", watch: true, config: (c) => ((c.watch.debounce_ms = 30), (c.watch.poll_ms = 100)) });
    const until = async (pred: () => boolean) => {
      const end = Date.now() + 3000;
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
    const h = await harness({ open: "samples/large-document.md", height: 20 });
    await h.keys("ctrl+d", "ctrl+d", "w");
    const cur = { ...h.app.view!.cur };
    await h.app.run("note.open index.md");
    await h.app.run("note.open samples/large-document.md");
    h.frame();
    expect(h.app.view!.cur).toEqual(cur);
  });
  test("session restore: tabs, splits with orientation, cursors", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    await h.keys("ctrl+w", "s", "j", "j", "ctrl+t", "o");
    const cur = { ...h.app.view!.cur };
    h.app.quit();
    const again = await harness({ root, open: null, config: (c) => (c.ui.restore_session = true) });
    expect(again.app.tabs).toHaveLength(2);
    expect(again.app.tabs[0]!.views).toHaveLength(2);
    expect(again.app.tabs[0]!.orientation).toBe("stacked");
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

describe("keymap and registry (0.8, 3.12)", () => {
  test("every default binding names a registered command", async () => {
    const h = await harness();
    for (const spec of Object.values(DEFAULT_KEYS)) expect(h.app.registry.get(spec.split(" ")[0]!)).toBeDefined();
  });
  test("every command spec is implemented", async () => {
    const h = await harness();
    for (const s of COMMAND_SPECS) expect(h.app.registry.get(s.id)).toBeDefined();
  });
  test("every ctrl chord outside cursor movement has a non-ctrl route (keymap.md convention)", () => {
    // Movement has its own alternatives (pagedown, home, arrows); ctrl+c's is y y.
    const exempt = (v: string) => v.startsWith("cursor.") || v === "copy.selection";
    for (const [k, v] of Object.entries(DEFAULT_KEYS)) {
      if (!canonSeq(k).startsWith("ctrl+") || exempt(v)) continue;
      const others = Object.entries(DEFAULT_KEYS).filter(([k2, v2]) => v2.split(" ")[0] === v.split(" ")[0] && !canonSeq(k2).startsWith("ctrl+"));
      if (!others.length) throw new Error(`${k} → ${v} has no non-ctrl route`);
    }
  });
  test("key naming is canonical and comparable to config notation", () => {
    const k = (name: string, sequence: string, mods: Partial<{ ctrl: boolean; meta: boolean; shift: boolean; super: boolean }> = {}) =>
      keyName({ name, sequence, ctrl: false, meta: false, shift: false, ...mods });
    expect(k("g", "G", { shift: true })).toBe("shift+g");
    expect(k("p", "\x10", { ctrl: true })).toBe("ctrl+p");
    expect(k("return", "\r")).toBe("enter");
    expect(k("tab", "\x1b[9;5u", { ctrl: true })).toBe("ctrl+tab");
    expect(k("left", "\x1b[1;4D", { meta: true, shift: true })).toBe("alt+shift+left");
    expect(canonKey("shift+alt+left")).toBe("alt+shift+left");
    expect(k("e", "\x1b[101;6u", { ctrl: true, shift: true })).toBe("ctrl+shift+e");
    expect(k("backspace", "\x08")).toBe("ctrl+backspace");
    expect(k("left", "\x1b[1;9D", { super: true })).toBe("cmd+left");
    expect(k("w", "\x1b\x17", { ctrl: true, meta: true })).toBe("ctrl+alt+w");
    expect(k("space", " ")).toBe("space");
    expect(k("$", "$")).toBe("$");
    expect(canonKey("G")).toBe("shift+g");
    expect(canonKey("Esc")).toBe("escape");
    expect(canonSeq("leader l n", ",")).toBe(", l n");
  });
});

describe("OpenTUI end to end", () => {
  test("real key parsing and the frame-buffer adapter", async () => {
    const { createTestRenderer } = await import("@opentui/core/testing");
    const { AppRenderable } = await import("../src/tui/opentui.ts");
    const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({ width: 100, height: 24 });
    const root = makeVault();
    const config: Config = structuredClone(DEFAULT_CONFIG);
    config.ui.restore_session = false;
    config.render.glyphs = "unicode";
    const loc = locateVault({ root });
    const app = new App({ loc, config, graph: openGraph(loc, config, false), host: { requestRender: () => renderer.requestRender(), osc52: () => true, quit() {} }, open: "index.md", watch: false });
    renderer.root.add(new AppRenderable(renderer, (c) => app.draw(c)));
    renderer.keyInput.on("keypress", (k) => void app.handleKey(keyName(k)));
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
