// The TUI model, driven headlessly: keys in (canonical names, as the keymap writes them),
// TextCanvas out. Plus one run through OpenTUI's test renderer for real key parsing.

import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { UNSAFE } from "../src/core/sanitize.ts";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { basename, dirname, join, relative } from "node:path";
import { COMMAND_SPECS, commandGroup } from "../src/core/command-specs.ts";
import { canonKey, canonSeq } from "../src/core/commands.ts";
import { type Config, DEFAULT_CONFIG } from "../src/core/config.ts";
import { openGraph } from "../src/core/graph.ts";
import { locateVault } from "../src/core/vault.ts";
import { type ListOverlay, App, type Host } from "../src/tui/app.ts";
import type { NvimServer } from "../src/core/nvim.ts";
import { TextCanvas } from "../src/tui/canvas.ts";
import { match, rank } from "../src/tui/match.ts";
import { graphemes, setWidthMethod, stringWidth, type WidthMethod } from "../src/core/width.ts";
import { crumbLayout } from "../src/tui/draw.ts";
import { srcAt } from "../src/core/layout/ir.ts";
import { DEFAULT_KEYS, keyName } from "../src/tui/keys.ts";

const sandbox = mkdtempSync(join(tmpdir(), "slipbox-tui-"));
process.env.XDG_STATE_HOME = join(sandbox, "state");
process.env.XDG_CACHE_HOME = join(sandbox, "cache");
process.env.XDG_CONFIG_HOME = join(sandbox, "config");
process.env.XDG_DATA_HOME = join(sandbox, "data"); // the home vault (17.2)
// Harnesses copy and index a vault, CLI tests start processes: slow on a loaded machine, not stuck.
setDefaultTimeout(30_000);
delete process.env.SLIPBOX_CONFIG; // it would win over XDG_CONFIG_HOME: never the developer's own config
process.env.SLIPBOX_CLIPBOARD = "file"; // copies never reach the developer's clipboard
delete process.env.NO_COLOR;
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

const DEMO = join(import.meta.dir, "..", "examples", "vault");

function makeVault(): string {
  const dir = mkdtempSync(join(sandbox, "vault-"));
  cpSync(join(import.meta.dir, "fixtures", "vault"), dir, { recursive: true, verbatimSymlinks: true });
  // The demo vault's notes, as a folder of this one (without its marker, which would make it a
  // nested vault: a boundary, not walked).
  cpSync(DEMO, join(dir, "samples"), { recursive: true, filter: (src) => !src.endsWith(".slipbox") });
  // Each copy a vault of its own (20.4): a shared id would make every copy the same collection, and
  // one moved by an earlier test a question for every later one (20.5).
  for (const cfg of [join(dir, ".slipbox", "config.toml"), join(dir, "nested-vault", ".slipbox", "config.toml")]) {
    writeFileSync(cfg, readFileSync(cfg, "utf8").replace(/^id = "[0-9a-f]+"$/m, `id = "${randomBytes(8).toString("hex")}"`));
  }
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
  /** Start here instead of at `root` as a vault (a loose folder: the home vault). */
  loc?: import("../src/core/vault.ts").VaultLocation;
  launcher?: boolean;
  /** The folder slipbox was opened on, inside the root. */
  folder?: string;
}

async function harness(opts: Opts = {}): Promise<Harness> {
  const root = opts.loc?.root ?? opts.root ?? makeVault();
  const config: Config = structuredClone(DEFAULT_CONFIG);
  config.ui.restore_session = false;
  config.lint.enabled = "off"; // the machine's own linter never runs in a test (the lint tests bring theirs)
  config.search.engine = "scan"; // no index built behind every test (the search tests ask for one)
  // Never the background auto-index (20.9): a live test app, idle long enough, would walk your home folder.
  config.index.background = false;
  config.render.glyphs = "unicode";
  // The frame tests read heavy lines; the light set has its own test.
  config.ui.lines = "heavy";
  config.walk.exclude = ["drafts/"];
  opts.config?.(config);
  const loc = opts.loc ?? locateVault({ root });
  const graph = openGraph(loc, config, false);
  const copied: string[] = [];
  const quit = { called: false };
  const host: Host = { requestRender() {}, osc52: (t) => (copied.push(t), true), quit: () => (quit.called = true) };
  const app = new App({ loc, config, graph, host, open: opts.open === undefined ? "index.md" : opts.open, watch: opts.watch ?? false, configFile: opts.configFile, themeName: opts.themeName, launcher: opts.launcher, folder: opts.folder });
  // Never the machine's own nvims.
  app.nvimDiscovery = () => [];
  app.nvimProbe = () => null;
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

/**
 * The machine's list of roots narrowed to those under `base` while `run` runs, then the others put back:
 * a search of every root and a moved folder's relink read them all, and this file's tests leave hundreds,
 * so such a test would be as slow as the tests before it are many.
 */
async function onlyRootsUnder<T>(base: string, run: () => Promise<T>): Promise<T> {
  const { readRoots, writeRoots } = await import("../src/core/registry.ts");
  const was = readRoots();
  const ours = (v: { path: string }) => v.path.startsWith(`${base}/`);
  writeRoots(was.filter(ours));
  try {
    return await run();
  } finally {
    const now = readRoots();
    writeRoots([...was.filter((v) => !ours(v) && !now.some((x) => x.key === v.key)), ...now]);
  }
}

const rowText = (h: Harness, row = h.app.view!.cur.row) => h.app.currentLayout(h.app.view!).lines[row]!.spans.map((s) => s.text).join("");
const statusRow = (frame: string) => frame.split("\n").at(-1)!;
const topRow = (frame: string) => frame.split("\n")[0]!;
const rowStarting = (h: Harness, prefix: string) => h.app.currentLayout(h.app.view!).lines.findIndex((l) => l.spans.map((s) => s.text).join("").startsWith(prefix));

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
        for (const g of graphemes(readFileSync(join(base, f), "utf8"))) if (g.length > 1 || g.charCodeAt(0) > 0x7e) seen.add(g);
      }
    }
    expect(seen.size).toBeGreaterThan(500);
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
          if (drawn !== stringWidth(g)) off.push(`${JSON.stringify(g)} U+${[...g].map((c) => c.codePointAt(0)!.toString(16)).join(" ")}: OpenTUI ${drawn}, slipbox ${stringWidth(g)}`);
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
    const rows = () => h.app.currentLayout(h.app.view!).lines.filter((l) => l.spans.some((sp) => sp.text.includes("🇯🇵"))).length;
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

describe("cursor movement", () => {
  test("h j k l and arrows; up and down keep the goal column", async () => {
    const h = await harness({ open: "samples/scratch/wrap-probe.md" });
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
  test("row start and end: 0 $ home end", async () => {
    const h = await harness({ open: "samples/scratch/wrap-probe.md" });
    await h.keys("j", "j", "$");
    const end = h.app.view!.cur.col;
    for (const k of ["0", "home"]) {
      await h.keys("$", k);
      expect(h.app.view!.cur.col).toBe(0);
    }
    for (const k of ["$", "end"]) {
      await h.keys("0", k);
      expect(h.app.view!.cur.col).toBe(end);
    }
  });
  test("w b e and ctrl+arrows move by word (the desktop editors' keys)", async () => {
    const h = await harness({ open: "notes/beta.md" });
    const row = rowStarting(h, "Beta links");
    h.app.moveCursor(h.app.view!, { row, col: 0 });
    await h.keys("w");
    expect(h.app.view!.cur.col).toBe(5); // "links"
    await h.keys("e");
    expect(h.app.view!.cur.col).toBe(9); // end of "links"
    await h.keys("ctrl+right");
    expect(h.app.view!.cur.col).toBe(11); // "to"
    await h.keys("b", "ctrl+left");
    expect(h.app.view!.cur.col).toBe(0);
    await h.keys("b");
    expect(h.app.view!.cur.row).toBeLessThan(row);
  });
  test("g g, shift+g, ctrl+home, ctrl+end", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md" });
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
    const h = await harness({ open: "samples/handbook/operations-handbook.md" });
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
    const h = await harness({ open: "samples/handbook/operations-handbook.md", height: 30 });
    await h.keys("ctrl+d");
    const v = h.app.view!;
    expect(v.top).toBeGreaterThan(0);
    expect(v.cur.row).toBeGreaterThanOrEqual(v.top + 3);
    await h.keys("pagedown", "pagedown", "pageup", "ctrl+u");
    expect(v.cur.row - v.top).toBeGreaterThanOrEqual(3);
  });
  test("w b e at the note's ends: w on the last word to its end, e there stays, b in the first word to its start", async () => {
    const root = makeVault();
    writeFileSync(join(root, "w.md"), "one two\nthree four\n");
    const h = await harness({ root, open: "w.md" });
    await h.keys("space", "n", "v");
    const v = h.app.view!;
    const from = async (row: number, col: number, key: string) => {
      h.app.moveCursor(v, { row, col });
      await h.keys(key);
      return [v.cur.row, v.cur.col];
    };
    expect(await from(1, 6, "w")).toEqual([1, 9]); // no next word: the last one's end
    expect(await from(1, 6, "e")).toEqual([1, 9]);
    expect(await from(1, 9, "e")).toEqual([1, 9]); // nothing after: stays
    expect(await from(0, 2, "b")).toEqual([0, 0]);
    expect(await from(0, 0, "b")).toEqual([0, 0]);
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
    const h = await harness({ open: "samples/handbook/operations-handbook.md" });
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
  test("shift+ctrl by word, shift+end to the row end", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    h.app.moveCursor(h.app.view!, { row: rowStarting(h, "Back to"), col: 0 });
    await h.keys("shift+ctrl+right", "ctrl+c");
    expect(h.copied.at(-1)).toBe("Back t");
    await h.keys("escape", "0", "shift+end", "ctrl+c");
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
    await h.keys("tab", "y", "l");
    expect(h.copied.at(-1)).toEndWith("/index.md");
  });
});

describe("links and history", () => {
  test("tab puts the cursor on a link (] l too); enter, gf follow; ctrl+o / alt+left / alt+b back, alt+right / alt+f forward", async () => {
    const h = await harness();
    await h.keys("tab");
    expect(statusRow(h.frame())).toContain("→ notes/alpha.md (resolved)");
    await h.keys("tab", "shift+tab"); // on and back
    expect(statusRow(h.frame())).toContain("→ notes/alpha.md (resolved)");
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    await h.keys("ctrl+o");
    expect(h.app.view!.buf.rel).toBe("index.md");
    await h.keys("alt+right");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    await h.keys("alt+left");
    expect(h.app.view!.buf.rel).toBe("index.md");
    // What a macOS terminal sends for option+→ / option+←: meta-f / meta-b.
    await h.keys("alt+f");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    await h.keys("alt+b");
    expect(h.app.view!.buf.rel).toBe("index.md");
    await h.keys("g", "g", "]", "l", "g", "f");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
  });
  test("enter off a link follows the row's first link; ctrl+enter (space l t) into a new tab, as a browser's ctrl+click", async () => {
    const h = await harness();
    h.app.moveCursor(h.app.view!, { row: rowStarting(h, "Links:"), col: 0 });
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    await h.keys("ctrl+o");
    h.app.moveCursor(h.app.view!, { row: rowStarting(h, "Links:"), col: 0 });
    await h.keys("ctrl+enter");
    expect(h.app.tabs.map((t) => t.views.map((v) => v.buf.rel))).toEqual([["index.md"], ["notes/alpha.md"]]);
    expect(h.app.activeTab).toBe(1);
    h.app.activeTab = 0;
    h.app.moveCursor(h.app.view!, { row: rowStarting(h, "Links:"), col: 0 });
    await h.keys("space", "l", "t");
    expect(h.app.tabs).toHaveLength(3);
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
  });
  test("a new tab from a split (ctrl+t c): the window moves out into a tab of its own, its place and history with it; the split gone", async () => {
    const h = await harness();
    await h.keys("tab", "space", "l", "s"); // index.md's first link into the split
    expect(h.app.tab!.views).toHaveLength(2);
    await h.keys("tab", "enter"); // on from there, for a back to come with the window
    const first = h.app.view!.buf.rel;
    const moved = h.app.view!;
    const back = moved.back.length;
    await h.keys("ctrl+t", "c");
    expect(h.app.tabs.map((t) => t.views.map((v) => v.buf.rel))).toEqual([["index.md"], [first]]);
    expect(h.app.view).toBe(moved); // the window itself, not a copy
    expect(h.app.view!.back.length).toBe(back);
    // No split: a new tab with this note, as before.
    await h.keys("ctrl+t", "c");
    expect(h.app.tabs).toHaveLength(3);
    expect(h.app.tabs[2]!.views[0]!.buf.rel).toBe(first);
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
    await h.keys("alt+right");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
  });
  test("history: a click selects an entry, a double-click jumps there", async () => {
    const h = await harness();
    await h.app.run("note.open notes/alpha.md");
    await h.app.run("note.open notes/beta.md");
    await h.keys("space", "h", "h");
    h.frame();
    const sb = h.app.geometry!.sidebar!;
    const rows = h.app.historyRows();
    const i = rows.findIndex((r) => r.path === "index.md");
    expect(i).toBeGreaterThanOrEqual(0);
    const y = sb.y + i - h.app.sidebar.scroll;
    const at = (type: string) => h.app.handleMouse({ type, x: sb.x + 4, y, button: 0 });
    at("down");
    at("up");
    expect(h.app.sidebar.selected).toBe(i); // selected…
    expect(h.app.view!.buf.rel).toBe("notes/beta.md"); // …not jumped to
    at("down");
    at("up");
    expect(h.app.view!.buf.rel).toBe("index.md"); // the double-click jumps
  });
  test("unresolved, external and attachment links", async () => {
    const root = makeVault();
    writeFileSync(join(root, "amb.md"), "[nothing-here](nothing-here.md) [web](https://example.invalid) ![diagram](attachments/diagram.png)\n");
    const h = await harness({ root, open: "amb.md" });
    await h.keys("enter"); // the cursor starts on [nothing-here]
    // No such note: the new-note prompt, its name typed already.
    expect(h.app.overlay).toMatchObject({ kind: "prompt", text: "nothing-here" });
    await h.keys("escape");
    await h.keys("tab", "enter");
    expect(h.copied.at(-1)).toBe("https://example.invalid");
    await h.keys("tab", "enter");
    expect(h.copied.at(-1)).toEndWith("attachments/diagram.png");
  });
  test("a link to a note seen to move is broken: following it says where it went and the fix, and offers no new note (20.2)", async () => {
    const root = makeVault();
    writeFileSync(join(root, "plan.md"), "# The plan\n\nSteps only this note has.\n");
    writeFileSync(join(root, "cites.md"), "[p](plan.md)\n");
    const h = await harness({ root, open: "cites.md" });
    mkdirSync(join(root, "moved"));
    writeFileSync(join(root, "moved", "plan.md"), "# The plan\n\nSteps only this note has.\n");
    rmSync(join(root, "plan.md"));
    h.app.graph.removeFile("plan.md");
    const st = statSync(join(root, "moved", "plan.md"));
    h.app.graph.updateFile("moved/plan.md", { rel: "moved/plan.md", abs: join(root, "moved", "plan.md"), size: st.size, mtimeMs: st.mtimeMs });
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("cites.md");
    expect(h.app.overlay).toBeNull();
    expect(h.app.messages.at(-1)?.text).toBe("broken link: plan.md — moved to moved/plan.md: space l r relinks it");
  });
  test("clicking a link follows it", async () => {
    const h = await harness();
    const v = h.app.view!;
    const pane = h.app.geometry!.panes[0]!;
    const link = h.app.currentLayout(v).links.find((l) => l.target === "notes/beta.md")!;
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
    expect(rows[status - 2]!.slice(h.app.leftRailWidth, rows[status - 2]!.length - h.app.rightRailWidth).trim()).toBe(""); // the popup's margin row (between the rails)
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
    expect(endRow.more).toEqual(["shift+end", "shift+cmd+right"]);
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
    for (const [cmd, region, heading] of [["problems.open", "problems", "Inside Problems"], ["info.toggle", "outline", "Inside Info"], ["footnotes.toggle", "outline", "Inside the footnotes"]] as const) {
      await h.app.run(cmd);
      h.app.region = region;
      expect(await start()).toEqual({ heading, selectedIsEntry: true });
    }
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
    for (const c of h.app.registry.list().filter((c) => !c.hidden)) expect([c.id, palette.has(c.id)]).toEqual([c.id, true]);
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
    const inView = po.filtered.map((e) => e.item).filter((it) => !it.header && g.some((l) => l.includes(row(it.label))));
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
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 160, height: 40 });
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
    const h = await harness({ open: "samples/handbook/operations-handbook.md" });
    await h.keys("space", "w", "r");
    expect(h.app.resizeMode).toBe(true);
    await h.keys("ctrl+d");
    expect(h.app.resizeMode).toBe(false);
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
    expect(h.app.sideW).toBe(34);
    await h.keys("ctrl+w", "l", "ctrl+w", "l", "space", "w", "r", "h", "escape");
    expect(h.app.region).toBe("outline");
    expect(h.app.outW).toBe(30);
    await h.keys("ctrl+w", "h", "ctrl+w", "v", "space", "w", "r", "l", "escape");
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
    const x = W - h.app.rightRailWidth;
    expect(h.app.rightRailWidth).toBe(3); // tinted: one button wide, no border
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
    h.app.handleMouse({ type: "down", x: btn.x + 1, y: btn.y, button: 0 });
    h.app.handleMouse({ type: "up", x: btn.x + 1, y: btn.y, button: 0 });
    h.frame();
    expect(h.app.outlineShown).toBe(true);
    const o = h.app.geometry!.outline!;
    expect(o.x + o.w).toBe(x); // the outline ends at the rail
    // Without colour there's no tint: the rail is a bordered column, joined to the rules.
    const mono = await harness({ open: "samples/handbook/operations-handbook.md", width: 140, height: 30, themeName: "mono" });
    const mrows = mono.frame().split("\n");
    expect(mono.app.rightRailWidth).toBe(4);
    const mcol = mrows.map((r) => [...r][W - 4] ?? "").join("");
    expect(mcol).toContain("┳");
    expect(mcol).toContain("┻");
    // Zen has no rails; ui.right_rail = false removes it and the breadcrumb gets ▤ back.
    await h.app.run("ui.zen");
    h.frame();
    expect(h.app.rightRailWidth).toBe(0);
    await h.app.run("ui.zen");
    const n = await harness({ open: "samples/handbook/operations-handbook.md", width: 140, height: 30, config: (c) => (c.ui.right_rail = false) });
    n.frame();
    expect(n.app.rightRailWidth).toBe(0);
    const b2 = n.app.geometry!.hot.find((r) => r.id === "btn:outline")!;
    expect(b2.x + b2.w).toBe(W);
  });
});

describe("ui.lines", () => {
  test("light (the default): the frame in ─ │ and light joints; heavy: ━ ┃", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 140, height: 30, config: (c) => (c.ui.lines = "light") });
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
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 140, height: 30, config: (c) => (c.ui.sidebar = false) });
    const rows = h.frame().split("\n");
    expect(h.app.leftRailWidth).toBe(3);
    const btn = h.app.geometry!.hot.find((r) => r.id === "btn:explorer")!;
    expect(btn.x).toBe(0);
    expect(btn.y).toBe(2); // under the top bar's rule, level with the tab strip
    expect([...rows[btn.y]!][1]).toBe("≡");
    expect(h.app.geometry!.hot.filter((r) => r.id === "btn:explorer").length).toBe(1); // not in the top bar too
    expect(h.canvas().styles[btn.y + 5]![1]!.bg).toBe(h.app.theme.roles.rail.bg!); // tinted, no border
    expect(rows[1]!.slice(0, 5)).toBe("━".repeat(5)); // the top rule runs over it unbroken
    expect(h.app.geometry!.tabStrip!.x).toBe(3); // the strip starts after the rail
    h.app.handleMouse({ type: "down", x: btn.x + 1, y: btn.y, button: 0 });
    h.app.handleMouse({ type: "up", x: btn.x + 1, y: btn.y, button: 0 });
    h.frame();
    expect(h.app.sidebarShown).toBe(true);
    expect(h.app.geometry!.sidebarPane!.x).toBe(3);
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
    await h.keys("space", "e");
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
    const rows = h.app.explorerRows();
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
    expect(h.app.explorerRows()).toBe(h.app.treeRows());
    await h.keys("/", "b", "e", "t", "a");
    const pick = h.app.explorerRows()[h.app.sidebar.selected]!;
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe(pick.path);
    expect(h.app.region).toBe("content");
    expect(h.app.sidebar.filter).toBe("");
  });
  test("a paste while a pane's filter is typed in goes into it (its first line), the selection on the first match", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 160, height: 40, config: (c) => (c.ui.outline = true) });
    h.app.showSidebar(true);
    h.app.leftView = "explorer";
    h.app.region = "sidebar";
    await h.keys("/");
    await h.app.paste("beta\nmore");
    expect(h.app.sidebar.filter).toBe("beta");
    expect(h.app.explorerRows()[h.app.sidebar.selected]!.path).toBe("notes/beta.md");
    await h.keys("escape", "space", "o", "/");
    expect(h.app.region as string).toBe("outline");
    await h.app.paste("Swapping\r\nnot this");
    expect(h.app.outline.filter).toBe("Swapping");
    expect(h.app.outlineRows()[h.app.outline.selected]!.text).toStartWith("Swapping a filter");
  });
  test("/ filters the outline: matching headings under their parents; enter jumps, esc clears", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 160, height: 40, config: (c) => (c.ui.outline = true) });
    await h.keys("space", "o"); // focus it
    expect(h.app.region).toBe("outline");
    await h.keys("/", ..."Swapping");
    expect(h.app.outline.filtering).toBe(true);
    const rows = h.app.outlineRows();
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
    expect(h.app.outlineRows().length).toBeGreaterThan(10);
  });
  test("history: notes read in other tabs and earlier sessions are there too, under recent (found in use)", async () => {
    const root = makeVault();
    const h = await harness({ root });
    // Each opened in a tab of its own, as the explorer and ctrl+p do: this window's timeline is short.
    h.app.openInNewTab("notes/alpha.md");
    h.app.openInNewTab("notes/beta.md");
    await h.keys("space", "h", "h");
    const rows = h.app.historyRows();
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
    h.app.saveState();
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
    const rows = h.app.historyRows();
    const i = rows.findIndex((r) => r.path === "index.md");
    expect(i).toBe(0); // unfiltered, row 0 is beta.md, here
    h.frame();
    const sb = h.app.geometry!.sidebar!;
    const y = sb.y + i - h.app.sidebar.scroll;
    for (const type of ["down", "up", "down", "up"]) h.app.handleMouse({ type, x: sb.x + 4, y, button: 0 });
    expect(h.app.view!.buf.rel).toBe("index.md");
    expect(h.app.sidebar.filter).toBe("");
  });
  test("history filter: the selection skips the 'recent here' heading, and enter on a recent note opens it here", async () => {
    const h = await harness();
    h.app.openInNewTab("notes/alpha.md");
    h.app.openInNewTab("notes/beta.md"); // this window: beta.md alone; alpha.md and index.md are recent
    await h.keys("space", "h", "h", "/", ...[..."alpha"]);
    const rows = h.app.historyRows();
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
    const { PositionStore } = await import("../src/core/position.ts");
    const ps = new PositionStore(h.app.loc);
    const top = { heading: null, headingIndex: 0, offset: 0, line: 1 };
    const files = ["notes/alpha.md", "notes/beta.md", "crlf.md", "bom.md", "escapes.md", "latin1.md", "no-newline.md"];
    for (const f of files) ps.set(f, top);
    ps.save();
    const later = await harness({ root });
    await later.keys("space", "h", "h");
    const recent = later.app.historyRows().filter((r) => r.recent);
    expect(recent.map((r) => r.path).sort()).toEqual([...files].sort());
    expect(recent.every((r) => /^\d\d:\d\d$/.test(r.hint))).toBe(true);
    // A name too long for the pane beside its hint is cut, the hint kept.
    writeFileSync(join(root, "a-rather-long-note-name-here.md"), "# long\n");
    ps.set("a-rather-long-note-name-here.md", top);
    ps.save();
    const narrow = await harness({ root, config: (c) => (c.ui.sidebar_width = 26) });
    await narrow.keys("space", "h", "h");
    const row = narrow.frame().split("\n").find((r) => r.includes("a-rather"))!;
    expect(row).toMatch(/a-rather-long-\S*…\s+\d\d:\d\d/);
    // As many as ui.history_limit says: 3, then none.
    const three = await harness({ root, config: (c) => (c.ui.history_limit = 3) });
    await three.keys("space", "h", "h");
    expect(three.app.historyRows().filter((r) => r.recent)).toHaveLength(3);
    const none = await harness({ root, config: (c) => (c.ui.history_limit = 0) });
    await none.app.run("note.open notes/alpha.md");
    await none.keys("space", "h", "h");
    expect(none.app.historyRows().some((r) => r.heading || r.recent)).toBe(false);
    // Out of range: said, and the default kept.
    const { loadConfig } = await import("../src/core/config.ts");
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
    const rows = h.app.historyRows();
    expect(rows.map((r) => r.label)).toEqual([expect.stringContaining("alpha")]);
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
  });
});

describe("find: n / N from the cursor, * / # the word under it", () => {
  const note = "# T\n\nalpha beta\n\nalphabet gamma\n\nbeta alpha\n\nend alpha\n";
  const setup = async () => {
    const root = makeVault();
    writeFileSync(join(root, "find.md"), note);
    const h = await harness({ root, open: "find.md", width: 80, height: 24 });
    const rowOf = (text: string) => rowStarting(h, text);
    return { h, rowOf };
  };
  test("n and N go to the match after / before the cursor, wherever it has moved; they wrap", async () => {
    const { h, rowOf } = await setup();
    const v = h.app.view!;
    await h.keys("/", "a", "l", "p", "h", "a", "enter"); // alpha, alphabet, alpha, alpha
    expect(v.find!.matches.length).toBe(4);
    // Move the cursor down past two matches: n goes to the next one after it, not after the first.
    h.app.moveCursor(v, { row: rowOf("beta alpha"), col: 0 });
    await h.keys("n");
    expect(v.cur).toEqual({ row: rowOf("beta alpha"), col: 5 });
    await h.keys("n");
    expect(v.cur.row).toBe(rowOf("end alpha"));
    await h.keys("n"); // wraps to the top
    expect(v.cur).toEqual({ row: rowOf("alpha beta"), col: 0 });
    expect(h.app.transient!.text).toContain("from the top");
    await h.keys("shift+n"); // and back round to the bottom
    expect(v.cur.row).toBe(rowOf("end alpha"));
    expect(h.app.transient!.text).toContain("from the bottom");
  });
  test("* and # search for the whole word under the cursor, forward and backward", async () => {
    const { h, rowOf } = await setup();
    const v = h.app.view!;
    h.app.moveCursor(v, { row: rowOf("alpha beta"), col: 2 }); // inside "alpha"
    await h.keys("*");
    expect(v.find!.query).toBe("alpha");
    expect(v.find!.whole).toBe(true);
    expect(v.find!.matches.length).toBe(3); // not "alphabet"
    expect(v.cur).toEqual({ row: rowOf("beta alpha"), col: 5 });
    await h.keys("n");
    expect(v.cur.row).toBe(rowOf("end alpha"));
    await h.keys("#");
    expect(v.cur).toEqual({ row: rowOf("beta alpha"), col: 5 });
    // Off a word: the next word on the row.
    h.app.moveCursor(v, { row: rowOf("beta alpha"), col: 4 }); // the space
    await h.keys("*");
    expect(v.find!.query).toBe("alpha");
  });
});

describe("hand-off to an editor (space n e, space n s)", () => {
  test("space n e steps aside for the editor at the cursor's line, then reloads what it saved", async () => {
    const root = makeVault();
    const file = join(root, "notes", "alpha.md");
    const h = await harness({ root, open: "notes/alpha.md", config: (c) => (c.editor.command = "myed +{line} {file}") });
    const v = h.app.view!;
    h.app.moveCursor(v, { row: rowStarting(h, "Back to"), col: 0 });
    const line = h.app.cursorLine(v);
    const calls: string[][] = [];
    const host = (h.app as unknown as { host: Host }).host;
    host.runForeground = (argv) => {
      calls.push(argv);
      writeFileSync(file, readFileSync(file, "utf8").replace("Back to", "Edited, back to"));
      const future = Date.now() / 1000 + 5;
      require("node:fs").utimesSync(file, future, future);
      return 0;
    };
    await h.keys("space", "n", "e");
    expect(calls).toEqual([["myed", `+${line}`, file]]);
    expect(h.frame()).toContain("Edited, back to");
    host.runForeground = () => "no such file";
    await h.keys("space", "n", "e");
    expect(h.app.transient!.text).toContain("couldn't start myed");
  });
  test("space n s sends the note to the remote editor without waiting; unset, it says how", async () => {
    const h = await harness({ open: "notes/alpha.md", config: (c) => (c.editor.remote = []) });
    await h.keys("space", "n", "s");
    expect(h.app.transient!.text).toContain("[editor] remote");
    // nvim: open the file, then go to the line (its --remote has no +{line}); in order, each awaited.
    const n = await harness({
      open: "notes/alpha.md",
      config: (c) => (c.editor.remote = ["nvim --server /tmp/s --remote {file}", "nvim --server /tmp/s --remote-send <C-\\><C-N>:{line}<CR>"]),
    });
    const sent: string[][] = [];
    (n.app as unknown as { host: Host }).host.runDetached = async (argv) => (sent.push(argv), 0);
    await n.keys("space", "n", "s");
    await Bun.sleep(5);
    const line = n.app.cursorLine(n.app.view!);
    expect(sent.length).toBe(2);
    expect(sent[0]!.slice(0, 4)).toEqual(["nvim", "--server", "/tmp/s", "--remote"]);
    expect(sent[0]!.at(-1)).toEndWith("notes/alpha.md");
    expect(sent[1]).toEqual(["nvim", "--server", "/tmp/s", "--remote-send", `<C-\\><C-N>:${line}<CR>`]); // no file appended
    expect(n.app.transient!.text).toContain("sent to nvim");
    // A failing first command stops the rest.
    sent.length = 0;
    (n.app as unknown as { host: Host }).host.runDetached = async (argv) => (sent.push(argv), 1);
    await n.keys("space", "n", "s");
    await Bun.sleep(5);
    expect(sent.length).toBe(1);
    expect(n.app.transient!.text).toContain("exited with 1");
    // One string is one command.
    const one = await harness({ open: "notes/alpha.md", configFile: undefined, config: (c) => (c.editor.remote = ["code -g {file}:{line}"]) });
    const got: string[][] = [];
    (one.app as unknown as { host: Host }).host.runDetached = async (argv) => (got.push(argv), 0);
    await one.keys("space", "n", "s");
    await Bun.sleep(5);
    expect(got[0]![2]).toMatch(/notes\/alpha\.md:\d+$/);
  });
});

describe("editing: insert mode, undo, save (step 3b)", () => {
  const setup = async (text: string, name = "ed.md") => {
    const root = makeVault();
    const file = join(root, name);
    writeFileSync(file, text);
    const h = await harness({ root, open: name, width: 100, height: 30 });
    const type = async (s: string) => {
      for (const ch of s) await h.keys(ch === " " ? "space" : /[A-Z]/.test(ch) ? `shift+${ch.toLowerCase()}` : ch);
    };
    return { h, file, type, v: h.app.view! };
  };
  test("i from the render switches to source and types; esc ends; u undoes the session; U redoes", async () => {
    const { h, type, v, file } = await setup("# T\n\nhello world\n");
    h.app.moveCursor(v, { row: rowStarting(h, "hello"), col: 6 }); // on "w"
    await h.keys("i");
    expect(v.source).toBe(true);
    expect(v.insert).toBe(true);
    expect(statusRow(h.frame())).toContain("INSERT");
    await type("big ");
    expect(v.buf.source).toBe("# T\n\nhello big world\n");
    await h.keys("escape");
    expect(v.insert).toBe(false);
    expect(v.buf.dirty).toBe(true);
    const f = h.frame();
    expect(statusRow(f)).toContain("• unsaved");
    expect(f).toContain("ed.md •"); // the tab, its name with its extension
    expect(readFileSync(file, "utf8")).toBe("# T\n\nhello world\n"); // not saved yet
    await h.keys("u");
    expect(v.buf.source).toBe("# T\n\nhello world\n"); // the whole session at once
    expect(v.buf.dirty).toBe(false);
    await h.keys("shift+u");
    expect(v.buf.source).toBe("# T\n\nhello big world\n");
    // :w writes it; the marker goes.
    await h.keys(":", "w", "enter");
    expect(readFileSync(file, "utf8")).toBe("# T\n\nhello big world\n");
    expect(v.buf.dirty).toBe(false);
  });
  test("a, A, I, o and O; enter carries indentation and continues a list; an empty item ends it", async () => {
    const { h, type, v } = await setup("- one\n  - two\n");
    await h.keys("space", "n", "v");
    h.app.moveCursor(v, { row: 0, col: 0 });
    await h.keys("shift+a");
    await type("!");
    await h.keys("enter");
    await type("next");
    await h.keys("escape");
    expect(v.buf.source).toBe("- one!\n- next\n  - two\n");
    await h.keys("j", "o"); // under "  - two": a nested item
    await type("three");
    await h.keys("enter", "enter"); // an empty item: the list ends there
    await h.keys("escape");
    expect(v.buf.source).toBe("- one!\n- next\n  - two\n  - three\n  \n");
    h.app.moveCursor(v, { row: 0, col: 0 });
    await h.keys("shift+o");
    await type("top");
    await h.keys("escape", "shift+i");
    await type("> ");
    await h.keys("escape");
    expect(v.buf.source.split("\n")[0]).toBe("> top");
    await h.keys("a");
    expect(h.app.cursorLine(v)).toBe(1);
  });
  test("backspace joins lines, x deletes a character (in source), numbered lists count on", async () => {
    const { h, type, v } = await setup("ab\ncd\n1. first\n");
    await h.keys("space", "n", "v");
    h.app.moveCursor(v, { row: 1, col: 0 });
    await h.keys("i", "backspace", "escape");
    expect(v.buf.source).toBe("abcd\n1. first\n");
    await h.keys("x");
    expect(v.buf.source).toBe("acd\n1. first\n"); // the b, the cursor having stepped back onto it
    await h.keys("j", "shift+a", "enter");
    await type("second");
    await h.keys("escape");
    expect(v.buf.source).toBe("acd\n1. first\n2. second\n");
  });
  test("ctrl+l ticks a task in the render; with unsaved changes it edits the buffer, not the file", async () => {
    const { h, v, file } = await setup("- [ ] a task\n");
    await h.keys("ctrl+l");
    expect(readFileSync(file, "utf8")).toBe("- [x] a task\n"); // clean: straight to disk
    await h.keys("shift+a");
    await h.keys("!", "escape", "space", "n", "v"); // back to the render, unsaved
    await h.keys("ctrl+l");
    expect(v.buf.source).toBe("- [ ] a task!\n");
    expect(readFileSync(file, "utf8")).toBe("- [x] a task\n");
  });
  test("quitting with unsaved changes is refused; :q! quits; :wq saves and quits", async () => {
    const { h, v, file } = await setup("x\n");
    await h.keys("shift+a", "y", "escape", "ctrl+q");
    expect(h.quit.called).toBe(false);
    expect(h.app.transient!.text).toContain("unsaved changes");
    await h.keys(":", "w", "q", "enter");
    expect(readFileSync(file, "utf8")).toBe("xy\n");
    expect(h.quit.called).toBe(true);
    const b = await setup("z\n");
    await b.h.keys("shift+a", "z", "escape", ":", "q", "!", "enter");
    expect(b.h.quit.called).toBe(true);
    expect(readFileSync(b.file, "utf8")).toBe("z\n");
    void v;
  });
  test("a BOM and CRLF endings survive; new lines are CRLF too", async () => {
    const { h, type, file } = await setup("\uFEFFone\r\ntwo\r\n");
    await h.keys("shift+a", "enter");
    await type("mid");
    await h.keys("escape", "ctrl+s");
    expect(readFileSync(file)).toEqual(Buffer.from("\uFEFFone\r\nmid\r\ntwo\r\n", "utf8"));
  });
});

describe("saving and conflicts (step 4)", () => {
  const touch = async (file: string, text: string) => {
    writeFileSync(file, text);
    const future = Date.now() / 1000 + 5;
    (await import("node:fs")).utimesSync(file, future, future);
  };
  const setup = async (text: string, config?: (c: Config) => void) => {
    const root = makeVault();
    const file = join(root, "c.md");
    writeFileSync(file, text);
    const h = await harness({ root, open: "c.md", width: 100, height: 30, config });
    return { h, file, v: h.app.view!, root };
  };
  test("an outside change to a clean note reloads it as an undo step: u brings back what you had", async () => {
    const { h, file, v } = await setup("mine\n");
    await touch(file, "the agent's version\n");
    h.app.reloadBuffer(v.buf);
    expect(v.buf.source).toBe("the agent's version\n");
    expect(v.buf.dirty).toBe(false);
    await h.keys("u");
    expect(v.buf.source).toBe("mine\n");
    expect(v.buf.dirty).toBe(true); // it differs from the file now
  });
  test("the conflict prompt: (l) loads theirs, yours one u away; (k) keeps yours, saving then asks", async () => {
    const { h, file, v } = await setup("line\n");
    await h.keys("shift+a", "!", "escape");
    await touch(file, "theirs\n");
    h.app.reloadBuffer(v.buf);
    const o = h.app.overlay as ListOverlay;
    expect(o.title).toContain("changed on disk");
    await h.keys("l");
    expect(v.buf.source).toBe("theirs\n");
    await h.keys("u");
    expect(v.buf.source).toBe("line!\n");
    // Changed again: keep yours this time.
    await touch(file, "theirs again\n");
    h.app.reloadBuffer(v.buf);
    await h.keys("k");
    expect(v.buf.conflictKept).toBe(true);
    expect(statusRow(h.frame())).toContain("differs from disk");
    await h.keys("ctrl+s"); // asks
    expect((h.app.overlay as ListOverlay).title).toContain("write yours over it?");
    await h.keys("n");
    expect(readFileSync(file, "utf8")).toBe("theirs again\n");
    await h.keys("ctrl+s", "y");
    expect(readFileSync(file, "utf8")).toBe("line!\n");
    expect(v.buf.conflictKept).toBe(false);
  });
  test("(d) shows yours → theirs; (m) merges against the version you started from", async () => {
    const { h, file, v } = await setup("one\ntwo\nthree\n");
    await h.keys("space", "n", "v", "g", "g", "shift+a", "!", "escape"); // yours: one!
    await touch(file, "one\ntwo\nTHREE\n"); // theirs: THREE
    h.app.reloadBuffer(v.buf);
    await h.keys("d");
    const d = h.app.overlay as ListOverlay;
    expect(d.title).toContain("Diff");
    expect(d.items.map((i) => i.label)).toContain("- THREE".replace("- ", "+ "));
    await h.keys("escape"); // back to the prompt
    expect((h.app.overlay as ListOverlay).title).toContain("changed on disk");
    await h.keys("m");
    expect(v.buf.source).toBe("one!\ntwo\nTHREE\n"); // both changes, no conflict
    expect(v.buf.dirty).toBe(true);
    await h.keys(":", "w", "enter"); // the file is theirs now: a plain save
    expect(readFileSync(file, "utf8")).toBe("one!\ntwo\nTHREE\n");
    // Both changing the same line: marked.
    await h.keys("g", "g", "shift+a", "?", "escape");
    await touch(file, "one?!\ntwo\nTHREE\n".replace("?!", "#"));
    h.app.reloadBuffer(v.buf);
    await h.keys("m");
    expect(v.buf.source).toBe("<<<<<<< yours\none!?\n=======\none#\n>>>>>>> theirs\ntwo\nTHREE\n");
    expect(h.app.transient!.text).toContain("1 conflict");
  });
  test("autosave: after the idle delay; not mid-insert, not after keep, not during a git commit", async () => {
    const { h, file, v, root } = await setup("a\n", (c) => (c.editor.autosave_ms = 20));
    await h.keys("shift+a", "b");
    await Bun.sleep(60);
    expect(readFileSync(file, "utf8")).toBe("a\n"); // still typing
    await h.keys("escape");
    await Bun.sleep(60);
    expect(readFileSync(file, "utf8")).toBe("ab\n");
    expect(v.buf.dirty).toBe(false);
    // git holding its lock: later.
    mkdirSync(join(root, ".git"), { recursive: true });
    writeFileSync(join(root, ".git", "index.lock"), "");
    await h.keys("shift+a", "c", "escape");
    await Bun.sleep(60);
    expect(readFileSync(file, "utf8")).toBe("ab\n");
    rmSync(join(root, ".git", "index.lock"));
    await Bun.sleep(60);
    expect(readFileSync(file, "utf8")).toBe("abc\n");
    // After keep: never on its own.
    await h.keys("shift+a", "d", "escape");
    await touch(file, "other\n");
    h.app.reloadBuffer(v.buf);
    await h.keys("k");
    await Bun.sleep(60);
    expect(readFileSync(file, "utf8")).toBe("other\n");
    // …nor does the prompt come back at each idle delay.
    await Bun.sleep(60);
    expect(h.app.overlay).toBeNull();
  });
  test("unsaved notes are listed for the CLI (the staleness file, 9.9) until saved or quit", async () => {
    const { readStale } = await import("../src/core/stale.ts");
    const { h, root } = await setup("x\n");
    expect(readStale(h.app.loc)).toEqual([]);
    await h.keys("shift+a", "y", "escape");
    expect(readStale(h.app.loc).map((e) => e.path)).toEqual(["c.md"]);
    await h.keys("ctrl+s");
    expect(readStale(h.app.loc)).toEqual([]);
    await h.keys("shift+a", "z", "escape");
    expect(readStale(h.app.loc).map((e) => e.path)).toEqual(["c.md"]);
    await h.keys(":", "q", "!", "enter");
    expect(readStale(h.app.loc)).toEqual([]);
  });
  test("a hand-off saves first: the editor never gets a stale file", async () => {
    const { h, file } = await setup("x\n", (c) => (c.editor.command = "ed {file}"));
    const host = (h.app as unknown as { host: Host }).host;
    let seen = "";
    host.runForeground = () => ((seen = readFileSync(file, "utf8")), 0);
    await h.keys("shift+a", "y", "escape", "space", "n", "e");
    expect(seen).toBe("xy\n");
  });
});

describe("vim-shaped normal mode in source (step 3c)", () => {
  const setup = async (text: string) => {
    const root = makeVault();
    writeFileSync(join(root, "v.md"), text);
    const h = await harness({ root, open: "v.md", width: 100, height: 30 });
    await h.keys("space", "n", "v");
    const v = h.app.view!;
    const keys = async (...ks: string[]) => {
      for (const k of ks) {
        if (k.length > 1 && !k.includes("+") && !["escape", "enter", "backspace", "space"].includes(k)) {
          for (const ch of k) await h.keys(ch === " " ? "space" : /[A-Z]/.test(ch) ? `shift+${ch.toLowerCase()}` : ch);
        } else await h.keys(k);
      }
    };
    const at = (row: number, col: number) => h.app.moveCursor(v, { row, col });
    return { h, v, keys, at, text: () => v.buf.source };
  };
  test("d with motions, doubled, counts; u undoes each", async () => {
    const { keys, at, text } = await setup("one two three four\nline two\nline three\n");
    at(0, 0);
    await keys("dw");
    expect(text()).toBe("two three four\nline two\nline three\n");
    await keys("d2w");
    expect(text()).toBe("four\nline two\nline three\n");
    await keys("d$");
    expect(text()).toBe("\nline two\nline three\n");
    await keys("u", "u", "u");
    expect(text()).toBe("one two three four\nline two\nline three\n");
    await keys("dd");
    expect(text()).toBe("line two\nline three\n");
    await keys("u", "2dd");
    expect(text()).toBe("line three\n");
    await keys("u", "dj");
    expect(text()).toBe("line three\n");
    await keys("u", "j", "dG");
    expect(text()).toBe("one two three four\n");
  });
  test("text objects: ciw, di\", da(, dap; c types in place, one undo step with its typing", async () => {
    const { keys, at, text } = await setup('say "hello there" (a (b) c) now\n\npara one\npara two\n\nend\n');
    at(0, 7); // inside "hello"
    await keys("ciw", "HI", "escape");
    expect(text().split("\n")[0]).toBe('say "HI there" (a (b) c) now');
    await keys("u");
    expect(text().split("\n")[0]).toBe('say "hello there" (a (b) c) now');
    await keys('di"');
    expect(text().split("\n")[0]).toBe('say "" (a (b) c) now');
    await keys("u");
    at(0, 22); // on the b: the inner parentheses
    await keys("da(");
    expect(text().split("\n")[0]).toBe('say "hello there" (a  c) now');
    at(0, 19); // on the a: the outer ones
    await keys("da(");
    expect(text().split("\n")[0]).toBe('say "hello there"  now');
    at(2, 0);
    await keys("dap");
    expect(text()).toBe('say "hello there"  now\n\nend\n');
  });
  test("yank and put: yy p puts a line under; yw P puts before; x and p swap characters", async () => {
    const { keys, at, text } = await setup("alpha beta\ngamma\n");
    at(0, 0);
    await keys("yy", "j", "p");
    expect(text()).toBe("alpha beta\ngamma\nalpha beta\n");
    at(1, 0);
    await keys("yw", "P");
    expect(text()).toBe("alpha beta\ngammagamma\nalpha beta\n");
    at(0, 0);
    await keys("x", "p");
    expect(text().split("\n")[0]).toBe("lapha beta");
  });
  test("find's toggles: plain text by default, alt+r regex, alt+w whole words; clickable, shown", async () => {
    const root = makeVault();
    writeFileSync(join(root, "f.md"), "a.b axb a.b foo_a.b\n");
    const h = await harness({ root, open: "f.md", width: 100, height: 30 });
    const v = h.app.view!;
    await h.keys("/", "a", ".", "b");
    expect(v.find!.matches.length).toBe(3); // a literal dot: not axb
    await h.keys("alt+r");
    expect(v.findOpts!.regex).toBe(true);
    expect(v.find!.matches.length).toBe(4); // the dot is any character now
    await h.keys("alt+w");
    expect(v.find!.matches.length).toBe(3); // not inside foo_a.b
    h.frame();
    const hot = (id: string) => h.app.geometry!.hot.find((r) => r.id === id)!;
    const regexBtn = hot("findopt:regex:0");
    expect(h.canvas().styles[regexBtn.y]![regexBtn.x + 1]!.fg).toBe(h.app.theme.roles.topbar_button_on.fg!);
    h.app.handleMouse({ type: "down", x: regexBtn.x + 1, y: regexBtn.y, button: 0 });
    h.app.handleMouse({ type: "up", x: regexBtn.x + 1, y: regexBtn.y, button: 0 });
    expect(v.findOpts!.regex).toBe(false);
    expect(v.find!.matches.length).toBe(2); // plain, whole words: the two standalone a.b
    await h.keys("enter");
    // A broken regex says so, in the row.
    await h.keys("/", "alt+r", "(");
    expect(h.frame()).toContain("not a regex");
    await h.keys("escape");
  });
  test("replace: space f r, tab into the replace row; enter one, alt+a all as one undo step", async () => {
    const root = makeVault();
    writeFileSync(join(root, "r.md"), "# R\n\ncat dog cat\n\n**cat** here\n");
    const h = await harness({ root, open: "r.md", width: 100, height: 30 });
    const v = h.app.view!;
    const type = (t: string) => h.keys(...[...t]);
    await h.keys("space", "f", "r");
    const o = h.app.overlay as { replace?: { focus: boolean; total: number } };
    expect(o.replace!.focus).toBe(false); // nothing to find yet: the find field first
    expect(v.source).toBe(true); // replacing works on the markdown
    await type("cat");
    await h.keys("tab");
    await type("cow");
    expect(o.replace!.total).toBe(3);
    const frame = h.frame();
    expect(frame).toContain("⇄ cow");
    expect(frame).toContain("1/3");
    await h.keys("enter");
    expect(v.buf.source).toBe("# R\n\ncow dog cat\n\n**cat** here\n");
    expect(o.replace!.total).toBe(2);
    await h.keys("alt+a");
    expect(v.buf.source).toBe("# R\n\ncow dog cow\n\n**cow** here\n");
    expect(h.frame()).toContain("replaced 2 matches"); // a floating message; the rows still open
    await h.keys("escape"); // closes the rows, keeps the edits and the search
    expect(h.app.overlay).toBeNull();
    expect(v.find?.query).toBe("cat");
    await h.keys("escape", "u");
    expect(v.buf.source).toBe("# R\n\ncow dog cat\n\n**cat** here\n"); // all of them in one step
    // ctrl+h opens the same rows; the buttons do what the keys do; regex replacements take groups.
    await h.keys("ctrl+h");
    await h.keys("alt+r");
    await type("(c)at");
    await h.keys("ctrl+h");
    await type("$1ub");
    h.frame();
    const all = h.app.geometry!.hot.find((r) => r.id === "findrep:all:0")!;
    h.app.handleMouse({ type: "down", x: all.x + 1, y: all.y, button: 0 });
    h.app.handleMouse({ type: "up", x: all.x + 1, y: all.y, button: 0 });
    expect(v.buf.source).toBe("# R\n\ncow dog cub\n\n**cub** here\n");
    await h.keys("escape");
  });
  test(":s, :%s and :'<,'>s from the command line; g, and c asking y n a q; one undo step each", async () => {
    const root = makeVault();
    const note = "one cat cat\n\ntwo cat\n\nthree cat cat\n";
    writeFileSync(join(root, "s.md"), note);
    const h = await harness({ root, open: "s.md", width: 100, height: 30 });
    const v = h.app.view!;
    const ex = (cmd: string) => h.keys(":", ...[...cmd], "enter");
    await ex("s/cat/dog/"); // the cursor's line, its first match
    expect(v.buf.source).toBe("one dog cat\n\ntwo cat\n\nthree cat cat\n");
    expect(v.source).toBe(true); // on the markdown
    await h.keys("u");
    await ex("%s/(c)at/\\1ow/"); // the first on each line; \1 a group
    expect(v.buf.source).toBe("one cow cat\n\ntwo cow\n\nthree cow cat\n");
    expect(h.frame()).toContain("3 substitutions on 3 lines");
    await h.keys("u");
    expect(v.buf.source).toBe(note);
    await ex("%s/CAT/x/gi");
    expect(v.buf.source).toBe("one x x\n\ntwo x\n\nthree x x\n");
    await h.keys("u");
    // c: the find and replace rows ask at each match.
    await ex("%s/cat/X/gc");
    expect(h.frame()).toContain("replace? y n a q");
    await h.keys("y", "n", "y");
    expect(v.buf.source).toBe("one X cat\n\ntwo X\n\nthree cat cat\n");
    await h.keys("a");
    expect(h.app.overlay).toBeNull();
    expect(v.buf.source).toBe("one X cat\n\ntwo X\n\nthree X X\n");
    await h.keys("u");
    expect(v.buf.source).toBe(note); // the whole confirm, one step
    await ex("%s/cat/X/c");
    await h.keys("y", "q");
    expect(v.buf.source).toBe("one X cat\n\ntwo cat\n\nthree cat cat\n");
    await h.keys("u");
    // '<,'>: typed for you when : is pressed on a selection; only those lines.
    h.app.moveCursor(v, { row: rowStarting(h, "two"), col: 0 });
    await h.keys("shift+v", "j", "j", ":");
    expect(h.app.overlay?.kind === "list" && h.app.overlay.input).toBe("'<,'>");
    await h.keys(...[..."s/cat/Z/g"], "enter");
    expect(v.buf.source).toBe("one cat cat\n\ntwo Z\n\nthree Z Z\n");
    await ex("s/nothing/x/");
    expect(h.frame()).toContain("not found: nothing");
  });
  test("cgn changes the search's next match, and . the one after; dgn deletes one", async () => {
    const root = makeVault();
    writeFileSync(join(root, "g.md"), "foo bar foo baz foo end foo\n");
    const h = await harness({ root, open: "g.md", width: 100, height: 30 });
    const v = h.app.view!;
    await h.keys("space", "n", "v", "/", "f", "o", "o", "enter");
    await h.keys("c", "g", "n", "shift+x", "escape");
    expect(v.buf.source).toBe("X bar foo baz foo end foo\n");
    await h.keys(".");
    expect(v.buf.source).toBe("X bar X baz foo end foo\n");
    await h.keys("d", "g", "n");
    expect(v.buf.source).toBe("X bar X baz  end foo\n");
    await h.keys("u", "u", "u", "/", "z", "z", "z", "enter", "c", "g", "n");
    expect(h.frame()).toContain("not found: zzz");
  });
  test("keys are handled in order, one at a time: a fast j then . doesn't interleave", async () => {
    const root = makeVault();
    writeFileSync(join(root, "v.md"), "# Vim\n\nthe quick brown fox\njumps over the lazy dog\n");
    const h = await harness({ root, open: "v.md", width: 100, height: 30 });
    await h.keys("space", "n", "v", "j", "j", "w", "2", "d", "w");
    // Both at once, not awaiting the first: as a terminal delivers "j." typed fast.
    await Promise.all([h.app.handleKey("j"), h.app.handleKey(".")]);
    expect(h.app.view!.buf.source).toBe("# Vim\n\nthe fox\njumpthe lazy dog\n");
  });
  test("f F t T and ; , — as motions, with counts, and after an operator", async () => {
    const { keys, at, text, v, h } = await setup("call(a, b, c) done\n");
    at(0, 0);
    await keys("f", "(");
    expect(v.cur.col).toBe(4);
    await keys("2", "f", ",");
    expect(v.cur.col).toBe(9); // the second comma
    await keys(",");
    expect(v.cur.col).toBe(6); // back to the first
    await keys("t", ")");
    expect(v.cur.col).toBe(11);
    await keys(";"); // t again moves on past the one right next to it: nothing more, stays
    expect(v.cur.col).toBe(11);
    await keys("shift+f", "a");
    expect(v.cur.col).toBe(5);
    at(0, 5);
    await keys("d", "t", ")");
    expect(text()).toBe("call() done\n");
    await keys("u");
    at(0, 0);
    await keys("c", "f", "(", "fn(", "escape");
    expect(text()).toBe("fn(a, b, c) done\n");
    // In the render too.
    await keys("space", "n", "v", "0", "f", "d");
    expect(h.app.view!.source).toBe(false);
    expect(h.app.currentLayout(v).lines[h.app.view!.cur.row]!.spans.map((x) => x.text).join("")[h.app.view!.cur.col]).toBe("d");
  });
  test("an operator with a search: d/foo covers up to the match; dn to the next", async () => {
    const { keys, at, text } = await setup("keep this part and stop here, then more stop\n");
    at(0, 5);
    await keys("d", "/", "stop", "enter");
    expect(text()).toBe("keep stop here, then more stop\n");
    at(0, 0);
    await keys("d", "n"); // to the next match after the cursor: the first stop
    expect(text()).toBe("stop here, then more stop\n");
  });
  test(". repeats a change that typed: cw, i and o with their text", async () => {
    const { keys, at, text } = await setup("one two three\n");
    at(0, 0);
    await keys("c", "w", "1", "escape", "w", ".");
    expect(text()).toBe("1 1 three\n");
    await keys("i", "<", "escape", "w", ".");
    expect(text()).toBe("1 <<1 three\n"); // w went from < onto the 1
    await keys("o", "x", "escape", ".");
    expect(text()).toBe("1 <<1 three\nx\nx\n");
  });
  test(". repeats a counted change with its count", async () => {
    const { keys, at, text, h } = await setup("a b c d\ne f g h\n");
    at(0, 0);
    await keys("2", "d", "w");
    expect(text().split("\n")[0]).toBe("c d");
    expect(h.app.vim.lastChange).toEqual(["2", "d", "w"]);
    at(1, 0);
    await keys(".");
    expect(text().split("\n")[1]).toBe("g h");
  });
  test("., D, C, s, S, r, J, ~, >>, <<", async () => {
    const { keys, at, text } = await setup("a1 a2 a3\nb\n  c\nd\n");
    at(0, 0);
    await keys("dw", ".");
    expect(text().split("\n")[0]).toBe("a3");
    await keys("u", "u");
    at(0, 3);
    await keys("D");
    expect(text().split("\n")[0]).toBe("a1 ");
    await keys("u");
    at(0, 0);
    await keys("C", "new", "escape");
    expect(text().split("\n")[0]).toBe("new");
    await keys("s", "N", "escape", "r", "W"); // on the w: N, then W
    expect(text().split("\n")[0]).toBe("neW");
    at(1, 0);
    await keys("J"); // the cursor lands on the joining space, as in vim
    expect(text().split("\n")[1]).toBe("b c");
    at(1, 0);
    await keys("~");
    expect(text().split("\n")[1]).toBe("B c");
    await keys(">>");
    expect(text().split("\n")[1]).toBe("  B c");
    await keys("<<", "<<");
    expect(text().split("\n")[1]).toBe("B c");
    at(2, 0);
    await keys("S", "dd", "escape");
    expect(text().split("\n")[2]).toBe("dd");
  });
  test("visual d and >, and cw changing only to the word's end", async () => {
    const { keys, at, text } = await setup("one two three\nfour\nfive\n");
    at(0, 4);
    await keys("v", "e", "d");
    expect(text().split("\n")[0]).toBe("one  three");
    at(1, 0);
    await keys("shift+v", "j", ">");
    expect(text()).toBe("one  three\n  four\n  five\n");
    at(0, 0);
    await keys("cw", "ONE", "escape");
    expect(text().split("\n")[0]).toBe("ONE  three");
  });
});

describe("block backgrounds", () => {
  test("a code block's text sits on the block's background, not the page's; the cursor band covers both", async () => {
    const root = makeVault();
    writeFileSync(join(root, "p.md"), "text\n\n```\ncode here\n```\n\nmore\n");
    const h = await harness({ root, open: "p.md", width: 80, height: 20 });
    const pane = h.app.geometry!.panes[0]!;
    const v = h.app.view!;
    const row = h.app.currentLayout(v).lines.findIndex((l) => l.spans.map((x) => x.text).join("").includes("code here"));
    const y = pane.y + row - v.top;
    expect(h.canvas().styles[y]![pane.textX + 3]!.bg).toBe(h.app.theme.roles.code_block.bg!);
    h.app.moveCursor(v, { row, col: 0 });
    expect(h.canvas().styles[y]![pane.textX + 3]!.bg).toBe(h.app.theme.roles.cursor_line.bg!);
  });
});

describe("the lens (live preview: space n l, i/a/o with edit_in = live)", () => {
  // Twenty short paragraphs: blocks of two lines (the paragraph and the blank after it).
  const note = `# Title\n\n${Array.from({ length: 20 }, (_, i) => `Para ${i + 1} with **bold**.`).join("\n\n")}\n`;
  const setup = async (config?: (c: Config) => void) => {
    const root = makeVault();
    writeFileSync(join(root, "l.md"), note);
    const h = await harness({ root, open: "l.md", width: 100, height: 30, config });
    const v = h.app.view!;
    const L = () => h.app.currentLayout(v);
    const rows = () => L().lines.map((l) => l.spans.map((x) => x.text).join("").trimEnd());
    const goto = (text: string) => {
      h.app.moveCursor(v, { row: rows().findIndex((t) => t.includes(text)), col: 0 });
      h.frame();
    };
    const lens = () => {
      const lines = L().lines;
      const top = lines.findIndex((l) => l.lens === "top");
      const bottom = lines.findIndex((l) => l.lens === "bottom");
      return { top, bottom, source: lines.slice(top + 1, bottom).map((l) => l.spans.map((x) => x.text).join("")) };
    };
    return { h, v, rows, goto, lens, L };
  };
  test("the ⇄ button opens and closes the replace row, while typing or after the search", async () => {
    const root = makeVault();
    writeFileSync(join(root, "b.md"), "cat dog cat\n");
    const h = await harness({ root, open: "b.md", width: 100, height: 30 });
    const click = () => {
      h.frame();
      const b = h.app.geometry!.hot.find((r) => r.id === "findopt:replace:0")!;
      h.app.handleMouse({ type: "down", x: b.x + 1, y: b.y, button: 0 });
      h.app.handleMouse({ type: "up", x: b.x + 1, y: b.y, button: 0 });
    };
    const rep = () => (h.app.overlay as { replace?: { focus: boolean } } | null)?.replace;
    await h.keys("/", "c", "a", "t");
    click();
    expect(rep()?.focus).toBe(true);
    expect(h.frame()).toContain("⇄ ");
    click();
    expect(rep()).toBeUndefined();
    expect(h.app.overlay?.kind).toBe("prompt"); // still finding
    await h.keys("enter");
    click(); // the search done, its row still there
    await Bun.sleep(5); // the click runs find.replace, asynchronously
    expect(rep()?.focus).toBe(true);
    expect((h.app.overlay as { text: string }).text).toBe("cat");
    // alt+h does what ⇄ does: closes the row, opens it again.
    await h.keys("alt+h");
    expect(rep()).toBeUndefined();
    await h.keys("alt+h");
    expect(rep()?.focus).toBe(true);
    await h.keys("escape");
  });
  test("a paste goes into the field being typed in: the replace field when it has focus; none while confirming", async () => {
    const root = makeVault();
    writeFileSync(join(root, "b.md"), "cat dog cat\n");
    const h = await harness({ root, open: "b.md", width: 100, height: 30 });
    const o = () => h.app.overlay as import("../src/tui/app.ts").PromptOverlay;
    await h.app.run("find.replace");
    await h.keys(..."cat", "tab");
    expect(o().replace?.focus).toBe(true);
    await h.app.paste("NEW");
    expect(o().replace!.text).toBe("NEW");
    expect(o().text).toBe("cat");
    await h.keys("shift+tab");
    await h.app.paste("s");
    expect(o().text).toBe("cats");
    expect(o().replace!.text).toBe("NEW");
    await h.keys("escape");
    // Confirming each match (:s///c): a paste is no answer, and changes nothing.
    await h.keys(":", ..."%s/cat/X/gc", "enter");
    expect(o().replace?.confirm).toBeTruthy();
    await h.app.paste("y");
    expect(o().text).toBe("cat");
    expect(o().replace!.text).toBe("X");
    expect(h.app.view!.buf.source).toBe("cat dog cat\n");
  });
  test("an operator with a jump in the lens acts from the cursor: dG, yG, >G", async () => {
    const { h, v, goto } = await setup((c) => (c.editor.edit_in = "live"));
    goto("Para 5 with");
    await h.keys("space", "n", "l");
    await h.keys("d", "G");
    expect(v.buf.source).toContain("Para 4 with"); // above the cursor: kept
    expect(v.buf.source).not.toContain("Para 5 with"); // from the cursor down: gone
    expect(v.buf.source).not.toContain("Para 20 with");
    await h.keys("u");
    goto("Para 5 with");
    await h.keys(">", "G");
    expect(v.buf.source).toContain("\nPara 4 with"); // not indented
    expect(v.buf.source).toContain("  Para 5 with");
  });
  test("replace in the lens: enter replaces the match at the cursor and moves one on", async () => {
    const { h, v } = await setup((c) => (c.editor.edit_in = "live"));
    await h.keys("space", "f", "r", ...[..."para"], "tab", ...[..."P"]);
    const o = h.app.overlay as { replace?: { current: number; total: number } };
    expect(v.live).toBe(true);
    expect(o.replace!.total).toBe(20);
    for (let i = 1; i <= 3; i++) {
      await h.keys("enter");
      h.frame();
      expect(v.buf.source.split("P ").length - 1).toBe(i);
      expect(o.replace).toMatchObject({ current: 0, total: 20 - i }); // the next one is the first left
    }
    // A replacement that still matches: the count stays, the cursor moves on past it.
    await h.keys("ctrl+u", ...[..."PARA"]);
    for (let i = 1; i <= 3; i++) {
      await h.keys("enter");
      h.frame();
      expect(v.buf.source.split("PARA ").length - 1).toBe(i);
      expect(o.replace).toMatchObject({ current: i, total: 17 });
    }
    await h.keys("escape");
  });
  test("space n l opens it on the cursor's block, between two rules, grown to at least 6 rows", async () => {
    const { h, v, rows, goto, lens } = await setup((c) => (c.ui.lines = "light"));
    goto("Para 5 with");
    await h.keys("space", "n", "l");
    expect(v.live).toBe(true);
    expect(statusRow(h.frame())).toContain("LENS");
    const l = lens();
    expect(l.top).toBeGreaterThan(0);
    expect(rows()[l.top]).toContain("source · lines");
    expect(rows()[l.top]).toMatch(/^━━ source/); // heavy, even with light frame lines
    expect(rows()[l.bottom]).toMatch(/^━+$/);
    // One blank row of air outside each rule, never two: above, the render's own gap; below, one
    // added (a frame row the cursor never takes).
    const lines = h.app.currentLayout(v).lines;
    expect(rows()[l.top - 1]).toBe("");
    expect(rows()[l.top - 2]).not.toBe("");
    expect(rows()[l.bottom + 1]).toBe("");
    expect(lines[l.bottom + 1]!.lens).toBe("pad");
    expect(rows()[l.bottom + 2]).not.toBe("");
    // Drawn in the lens role: the accent, bold.
    const c = h.canvas();
    const pane = h.app.geometry!.panes[0]!;
    const cell = c.styles[pane.y + l.top - v.top]![pane.textX]!;
    expect(cell.fg).toBe(h.app.theme.roles.lens.fg!);
    expect(cell.bold).toBe(true);
    // Its rows of markdown are tinted (off the cursor's row, which has its own band).
    const tinted = [...Array(l.bottom - l.top - 1).keys()].map((k) => l.top + 1 + k).find((r) => r !== v.cur.row)!;
    expect(c.styles[pane.y + tinted - v.top]![pane.textX]!.bg).toBe(h.app.theme.roles.lens_band.bg!);
    expect(l.source).toContain("Para 5 with **bold**."); // the markdown
    expect(l.source.length).toBeGreaterThanOrEqual(6); // neighbours pulled in
    expect(rows().some((t) => t.includes("Para 15 with bold."))).toBe(true); // rendered further off
    // The cursor is in it, never on a rule.
    expect(v.cur.row).toBeGreaterThan(l.top);
    expect(v.cur.row).toBeLessThan(l.bottom);
    // Walking through, the cursor never lands on a rule or the air around it.
    for (let k = 0; k < 20; k++) {
      await h.keys("j");
      expect(h.app.currentLayout(v).lines[v.cur.row]!.decor).toBeFalsy();
    }
  });
  test("moving past its edge brings the next block in; the lens keeps its place on screen", async () => {
    const { h, v, goto, lens } = await setup();
    goto("Para 3 with");
    await h.keys("space", "n", "l");
    h.frame();
    const screen = lens().top - v.top;
    const before = lens().source.length;
    for (let k = 0; k < 12; k++) await h.keys("j");
    h.frame();
    const l = lens();
    expect(v.cur.row).toBeGreaterThan(l.top);
    expect(v.cur.row).toBeLessThan(l.bottom);
    expect(l.top - v.top).toBe(screen); // the page moved under it
    expect(l.source.length).toBeGreaterThanOrEqual(before);
    expect(l.source.length).toBeLessThanOrEqual(Math.floor(v.height * 0.5) + 2); // the maximum
    // A jump: the lens goes to where the cursor lands.
    await h.keys("shift+g");
    h.frame();
    expect(lens().source.join("\n")).toContain("Para 20 with **bold**.");
  });
  test("esc esc from typing closes it; i from the render (edit_in = live) opens it typing", async () => {
    const { h, v, goto, lens } = await setup((c) => (c.editor.edit_in = "live"));
    goto("Para 7 with");
    await h.keys("i");
    expect(v.live).toBe(true);
    expect(v.insert).toBe(true);
    await h.keys("escape");
    expect(v.live).toBe(true); // normal mode, still open
    expect(statusRow(h.frame())).toContain("LENS");
    await h.keys("escape");
    expect(v.live).toBe(false);
    expect(lens().top).toBe(-1);
  });
  test("typing in it doesn't re-parse; what's after shifts; closing renders the edit", async () => {
    const { h, v, goto, rows } = await setup();
    goto("Para 2 with");
    await h.keys("space", "n", "l", "shift+a", "enter");
    const rendered = v.liveBase!.renderedVersion;
    for (const ch of "New *line*.") await h.keys(ch === " " ? "space" : ch);
    expect(v.liveBase!.renderedVersion).toBe(rendered); // the render around it reused
    expect(rows()).toContain("New *line*.");
    const last = h.app.currentLayout(v).lines.find((l) => l.spans.map((x) => x.text).join("").includes("Para 20 with"))!;
    expect(last.src).toBe(42); // renumbered: one line further down
    await h.keys("escape", "escape");
    expect(rows().some((t) => t.includes("New line."))).toBe(true);
    expect(v.buf.source).toContain("Para 2 with **bold**.\nNew *line*.\n");
  });
  test("a block taller than half the window scrolls inside the lens; the prose around stays in sight", async () => {
    const code = Array.from({ length: 60 }, (_, i) => `line ${i + 1} of code`).join("\n");
    const root = makeVault();
    writeFileSync(join(root, "big.md"), `# Big\n\nIntro paragraph before.\n\n\`\`\`\n${code}\n\`\`\`\n\nOutro paragraph after.\n`);
    const h = await harness({ root, open: "big.md", width: 100, height: 40 });
    const v = h.app.view!;
    const text = (r: number) => h.app.currentLayout(v).lines[r]!.spans.map((x) => x.text).join("");
    h.app.moveCursor(v, { row: h.app.currentLayout(v).lines.findIndex((l) => l.spans.map((x) => x.text).join("").includes("line 1 of code")), col: 0 });
    await h.keys("space", "n", "l");
    const f = () => h.frame().split("\n");
    let frame = f();
    const max = h.app.lensRows(v);
    const L = h.app.currentLayout(v);
    const shown = h.app.screenRows(v, L).filter((r) => L.lines[r]!.lens === "source");
    expect(shown.length).toBe(max); // the lens is capped
    expect(frame.join("\n")).toContain("Intro paragraph before."); // the prose above is still there
    expect(frame.join("\n")).toMatch(/↓ \d+ lines/); // what's below the window, counted on the rule
    // Moving down inside: the lens scrolls; the cursor stays in sight; the rule counts both ways.
    for (let k = 0; k < 30; k++) await h.keys("j");
    frame = f();
    expect(text(v.cur.row)).toContain("of code");
    expect(h.app.screenRows(v, h.app.currentLayout(v))).toContain(v.cur.row);
    expect(frame.join("\n")).toMatch(/↑ \d+ lines/);
    expect(frame.join("\n")).toMatch(/↓ \d+ lines/);
    expect(frame.join("\n")).toContain("Intro paragraph before.");
    // A click on a row inside lands on that row.
    const pane = h.app.geometry!.panes[0]!;
    const rows = h.app.screenRows(v, h.app.currentLayout(v));
    const i = rows.findIndex((r) => h.app.currentLayout(v).lines[r]!.lens === "source") + 3;
    h.app.handleMouse({ type: "down", x: pane.textX + 2, y: pane.y + i, button: 0 });
    h.app.handleMouse({ type: "up", x: pane.textX + 2, y: pane.y + i, button: 0 });
    expect(v.cur.row).toBe(rows[i]!);
    // The wheel over it scrolls inside first.
    const before = v.lensInner;
    h.app.handleMouse({ type: "scroll", x: pane.textX + 2, y: pane.y + i, button: 0, scroll: { direction: "down", delta: 1 } });
    expect(v.lensInner ?? 0).toBeGreaterThan(before ?? 0);
    // …and the cursor comes along: never on a row the lens now hides, so dd deletes what's seen.
    for (let k = 0; k < 6; k++) h.app.handleMouse({ type: "scroll", x: pane.textX + 2, y: pane.y + i, button: 0, scroll: { direction: "down", delta: 1 } });
    expect(h.app.screenRows(v, h.app.currentLayout(v))).toContain(v.cur.row);
    const seen = text(v.cur.row);
    await h.keys("d", "d");
    expect(v.buf.source).not.toContain(`${seen.trim()}\n`);
  });
  test("growing to its minimum never swallows a neighbour too big for it", async () => {
    const code = Array.from({ length: 80 }, (_, i) => `const line${i + 1} = ${i + 1};`).join("\n");
    const root = makeVault();
    writeFileSync(join(root, "big.md"), `# Long snippet\n\nSome prose before.\n\n\`\`\`ts\n${code}\n\`\`\`\n\nProse after.\n`);
    const h = await harness({ root, open: "big.md", width: 150, height: 60 });
    const v = h.app.view!;
    await h.keys("g", "g", "space", "n", "l");
    expect(v.liveBase!.active).toEqual([1, 4]); // the heading and the prose, not the 83-line block
    for (let k = 0; k < 30; k++) await h.keys("j");
    h.frame();
    expect(v.liveBase!.active).toEqual([5, 87]); // into the block: the lens is that block, scrolled
    expect(h.app.lensHidden(v, h.app.currentLayout(v)).length).toBeGreaterThan(0);
  });
  test("clicking around: each clicked line stays under the pointer as the lens moves to it", async () => {
    const root = makeVault();
    writeFileSync(join(root, "l.md"), note);
    const h = await harness({ root, open: "l.md", width: 100, height: 40 });
    const v = h.app.view!;
    await h.keys("space", "n", "l");
    const rows = () => h.app.currentLayout(v).lines.map((l) => l.spans.map((x) => x.text).join("").trimEnd());
    for (const want of [8, 3, 12, 11, 5, 9]) {
      h.frame();
      const pane = h.app.geometry!.panes[0]!;
      const target = rows().findIndex((t, i) => i >= v.top && i < v.top + v.height && (t === `Para ${want} with bold.` || t === `Para ${want} with **bold**.`));
      expect(target).toBeGreaterThanOrEqual(0); // still on screen: the page didn't jump away
      const screen = target - v.top;
      h.app.handleMouse({ type: "down", x: pane.textX + 3, y: pane.y + screen, button: 0 });
      h.app.handleMouse({ type: "up", x: pane.textX + 3, y: pane.y + screen, button: 0 });
      h.frame();
      expect(rows()[v.cur.row]).toBe(`Para ${want} with **bold**.`);
      // Exactly where it was clicked — except inside the scrolloff margin at an edge, where the
      // view scrolls just enough to keep the margin, as a click there does in reading too.
      // (At the note's top or end the page can't scroll further: there it moves only as far as it must.)
      const so = Math.min(3, Math.floor((v.height - 1) / 2));
      const want0 = Math.max(so, Math.min(v.height - 1 - so, screen));
      const maxTop = Math.max(0, h.app.currentLayout(v).lines.length - v.height);
      const top = Math.max(0, Math.min(maxTop, v.cur.row - want0));
      expect(v.top).toBe(top);
    }
  });
  test("a click in the render outside it moves the lens there", async () => {
    const { h, v, goto, lens, rows } = await setup();
    goto("Para 2 with");
    await h.keys("space", "n", "l");
    h.frame();
    const pane = h.app.geometry!.panes[0]!;
    // The lowest rendered paragraph on screen.
    let target = -1;
    rows().forEach((t, i) => {
      if (i >= v.top && i < v.top + v.height && i > lens().bottom && /Para \d+ with bold\./.test(t)) target = i;
    });
    const which = /Para (\d+)/.exec(rows()[target]!)![1];
    const y = pane.y + target - v.top;
    h.app.handleMouse({ type: "down", x: pane.textX + 2, y, button: 0 });
    h.app.handleMouse({ type: "up", x: pane.textX + 2, y, button: 0 });
    h.frame();
    expect(v.live).toBe(true);
    expect(lens().source.join("\n")).toContain(`Para ${which} with **bold**.`);
    expect(h.app.cursorLine(v)).toBe(1 + 2 * Number(which));
  });
  test("a link followed from the lens opens the lens on the new note, and typing lands where it's drawn", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.md"), "# Alpha\n\nSee [b](b.md) here.\n\nAAAA text of alpha.\n");
    writeFileSync(join(root, "b.md"), "# Beta\n\nBBBB beta.\n\nMore beta.\n");
    const h = await harness({ root, open: "a.md", width: 100, height: 30 });
    const v = h.app.view!;
    const rows = () => h.app.currentLayout(v).lines.map((l) => l.spans.map((x) => x.text).join("").trimEnd());
    await h.keys("space", "n", "l");
    h.app.moveCursor(v, { row: rows().findIndex((t) => t.includes("See [b]")), col: 6 });
    h.frame();
    await h.keys("enter");
    expect(v.buf.rel).toBe("b.md");
    expect(v.live).toBe(true);
    expect(rows().join("\n")).not.toContain("AAAA");
    expect(rows().join("\n")).toContain("More beta.");
    // Typing on the row drawn as "More beta." changes that line of b.md.
    h.app.moveCursor(v, { row: rows().findIndex((t) => t.includes("More beta.")), col: 0 });
    h.frame();
    await h.keys("i", "Z", "escape");
    expect(v.buf.source).toBe("# Beta\n\nBBBB beta.\n\nZMore beta.\n");
    // Back to a.md (ctrl+o): its own text, not b's.
    await h.keys("ctrl+o");
    expect(v.buf.rel).toBe("a.md");
    expect(rows().join("\n")).not.toContain("beta");
    expect(rows().join("\n")).toContain("AAAA text of alpha.");
  });
});

describe("source mode (space n v)", () => {
  test("the window shows the raw markdown, the cursor on the same source line; back again", async () => {
    const h = await harness({ open: "notes/alpha.md", width: 100, height: 30 });
    const v = h.app.view!;
    h.app.moveCursor(v, { row: rowStarting(h, "Back to"), col: 0 });
    const line = h.app.cursorLine(v);
    await h.keys("space", "n", "v");
    expect(v.source).toBe(true);
    const f = h.frame();
    expect(f).toContain("# Alpha"); // the markdown itself
    expect(f).toContain("[beta](beta.md)");
    expect(statusRow(f)).toContain("SOURCE");
    expect(h.app.cursorLine(v)).toBe(line);
    // Everything on the layout works: find lands in the source; the outline has the headings.
    await h.keys("/", "b", "e", "t", "a", "enter");
    expect(v.find!.matches.length).toBeGreaterThan(0);
    expect(h.app.currentLayout(v).headings.map((x) => x.text)).toContain("Section One");
    await h.keys("escape", "g", "g");
    await h.keys(":", "s", "o", "u", "r", "c", "e", "enter"); // the alias
    expect(v.source).toBe(false);
    expect(statusRow(h.frame())).toContain("READ");
  });
});

describe("the nvim preset ([editor] remote = \"nvim\", the default)", () => {
  const server = (cwd: string, file = ""): NvimServer => ({ socket: `/run/nvim.${cwd.split("/").pop()}.sock`, cwd, file });
  const setup = async (found: NvimServer[]) => {
    const h = await harness({ open: "notes/alpha.md" });
    const sent: string[][] = [];
    (h.app as unknown as { host: Host }).host.runDetached = async (argv) => (sent.push(argv), 0);
    h.app.nvimDiscovery = () => found;
    h.app.nvimProbe = (s) => found.find((f) => f.socket === s) ?? null;
    return { h, sent, root: h.root };
  };
  test("none running: says so; one: sends there straight away, opening the file then the line", async () => {
    const none = await setup([]);
    await none.h.keys("space", "n", "s");
    expect(none.h.app.transient!.text).toContain("no nvim is running");
    const { h, sent, root } = await setup([server("/elsewhere")]);
    await h.keys("space", "n", "s");
    await Bun.sleep(5);
    const line = h.app.cursorLine(h.app.view!);
    expect(sent).toEqual([
      ["nvim", "--server", "/run/nvim.elsewhere.sock", "--remote", join(root, "notes", "alpha.md")],
      ["nvim", "--server", "/run/nvim.elsewhere.sock", "--remote-send", `<C-\\><C-N>:${line}<CR>`],
    ]);
    expect(h.app.remoteServer).toBe("/run/nvim.elsewhere.sock");
  });
  test("several: a picker, the nvim working where the note lives first; the pick is remembered", async () => {
    const root = makeVault();
    const found = [server("/tmp/other", "/tmp/other/x.md"), server(root, join(root, "index.md")), server("/")];
    const h = await harness({ root, open: "notes/alpha.md" });
    const sent: string[][] = [];
    (h.app as unknown as { host: Host }).host.runDetached = async (argv) => (sent.push(argv), 0);
    h.app.nvimDiscovery = () => found;
    h.app.nvimProbe = (s) => found.find((f) => f.socket === s) ?? null;
    await h.keys("space", "n", "s");
    const o = h.app.overlay as ListOverlay;
    expect(o.title).toContain("which nvim");
    expect((o.filtered[0]!.item.data as NvimServer).cwd).toBe(root); // holds the note, the closest folder
    expect(o.filtered[0]!.item.detail).toBe("index.md");
    expect(o.filtered[0]!.item.hint).toBe("holds this note");
    await h.keys("down", "enter"); // pick another one: the deeper folder comes before "/"
    await Bun.sleep(5);
    expect(sent[0]![2]).toBe(found[0]!.socket);
    // Next time: straight to the remembered one, no picker, while it answers…
    sent.length = 0;
    await h.keys("space", "n", "s");
    await Bun.sleep(5);
    expect(h.app.overlay).toBeNull();
    expect(sent[0]![2]).toBe(found[0]!.socket);
    // …and kept in the session.
    h.app.quit();
    const again = await harness({ root, open: "notes/alpha.md" });
    expect(again.app.remoteServer).toBe(found[0]!.socket);
    // space n p always asks.
    await h.keys("space", "n", "p");
    expect(h.app.overlay?.kind).toBe("list");
    await h.keys("escape");
    // Gone: the picker comes back.
    h.app.nvimProbe = () => null;
    await h.keys("space", "n", "s");
    expect(h.app.overlay?.kind).toBe("list");
  });
});

describe("task toggle (ctrl+l, a click on [ ])", () => {
  const note = "# Tasks\n\n- [ ] parent task\n  - [x] child task\n    with a second line\n- plain item\n";
  const setup = async () => {
    const root = makeVault();
    writeFileSync(join(root, "tasks.md"), note);
    const h = await harness({ root, open: "tasks.md", width: 80, height: 24 });
    return { h, root, file: join(root, "tasks.md") };
  };
  test("ctrl+l ticks the innermost task item holding the cursor, on disk; the view keeps its place", async () => {
    const { h, file } = await setup();
    const v = h.app.view!;
    // The child's continuation row belongs to the child.
    const row = h.app.currentLayout(v).lines.findIndex((l) => l.spans.map((s) => s.text).join("").includes("with a second line"));
    h.app.moveCursor(v, { row, col: 0 });
    await h.keys("ctrl+l");
    expect(readFileSync(file, "utf8")).toBe(note.replace("[x] child", "[ ] child"));
    expect(v.cur.row).toBe(row); // anchored across the reload
    const parent = h.app.currentLayout(v).lines.findIndex((l) => l.spans.map((s) => s.text).join("").includes("parent task"));
    h.app.moveCursor(v, { row: parent, col: 4 });
    await h.keys("ctrl+l");
    expect(readFileSync(file, "utf8")).toContain("- [x] parent task");
    expect(h.app.transient!.text).toBe("done ✓");
    // Not on a task: a message, no write.
    const plain = h.app.currentLayout(v).lines.findIndex((l) => l.spans.map((s) => s.text).join("").includes("plain item"));
    h.app.moveCursor(v, { row: plain, col: 0 });
    const before = readFileSync(file, "utf8");
    await h.keys("ctrl+l");
    expect(readFileSync(file, "utf8")).toBe(before);
    expect(h.app.transient!.text).toContain("no task here");
  });
  test("a click on the checkbox toggles it; a changed file is reloaded first, not toggled", async () => {
    const { h, file } = await setup();
    const v = h.app.view!;
    h.frame();
    const pane = h.app.geometry!.panes[0]!;
    const layout = h.app.currentLayout(v);
    const row = layout.lines.findIndex((l) => l.spans.some((s) => s.task?.line === 3));
    let col = 0;
    for (const s of layout.lines[row]!.spans) {
      if (s.task) break;
      col += s.text.length;
    }
    const y = pane.y + row - v.top;
    h.app.handleMouse({ type: "down", x: pane.textX + col, y, button: 0 });
    h.app.handleMouse({ type: "up", x: pane.textX + col, y, button: 0 });
    expect(readFileSync(file, "utf8")).toContain("- [x] parent task");
    // Someone else rewrites the file: the next toggle reloads instead of writing blind.
    writeFileSync(file, "# Moved\n\n\n" + readFileSync(file, "utf8"));
    const future = Date.now() / 1000 + 5;
    (await import("node:fs")).utimesSync(file, future, future);
    h.app.moveCursor(v, { row, col: 0 });
    await h.keys("ctrl+l");
    expect(h.app.transient!.text).toContain("changed on disk");
    expect(readFileSync(file, "utf8")).toContain("- [x] parent task");
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
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 70, height: 30, config: (c) => ((c.ui.sidebar = false), (c.ui.outline = false)) });
    const v = h.app.view!;
    const target = h.app.currentLayout(v).headings.find((x) => x.text.startsWith("Swapping a filter"))!;
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
    expect(statusRow(h.frame())).toMatch(/‹ index\.md › +○ not watching/); // watch: false in the harness
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
    expect(ol.x + ol.w).toBe(160); // far right, the rail's second button: Info's is first (3.19), level with the breadcrumb
    expect(hot(h, "btn:info").y).toBe(h.app.geometry!.panes[0]!.y - 2);
    expect(ol.y).toBe(hot(h, "btn:info").y + 1);
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
    expect(sb.y).toBe(4); // the tree, under the "Explorer" title (beside the strip) and a blank row
    expect(h.frame().split("\n")[2]!.slice(sb.x).startsWith(" Explorer")).toBe(true);
    // Under the title a blank row; the strip's rule starts at the explorer's border.
    expect(h.frame().split("\n")[3]!.slice(sb.x - 1, sb.x + sb.w + 2)).toBe(`${" ".repeat(sb.w + 1)}┣━`); // the tinted rail, then the explorer
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
    h.app.handleMouse({ type: "move", x: 80, y: 10, button: 0 }); // no hover
    expect(btn("btn:explorer").fg).toBe(roles.topbar_button_on.fg!); // the explorer is open
    expect(btn("btn:explorer").bg).toBe(roles.rail.bg!); // the rail's tint
    expect(btn("btn:outline").fg).toBe(roles.topbar_button.fg!); // the outline is closed
    expect(btn("btn:outline").bg).toBe(roles.rail.bg!); // the rail's tint
  });
  test("tree lines: ├─ to each child, └─ to the last, │ where an ancestor goes on", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 160, height: 90, config: (c) => (c.ui.outline = true) });
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
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 160, config: (c) => (c.ui.outline = true) });
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
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 160, config: (c) => (c.ui.outline = true) });
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
    const notes = ["index.md", "notes/alpha.md", "notes/beta.md", "notes/gamma.md", "samples/handbook/operations-handbook.md"];
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
    h.app.handleMouse({ type: "move", x: back.x, y: back.y, button: 0 });
    const rows = h.frame().split("\n");
    expect(rows.at(-2)).toContain(" back: notes/alpha.md ");
    // Clicked: back; forward lights up.
    for (const type of ["down", "up"]) h.app.handleMouse({ type, x: back.x, y: back.y, button: 0 });
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    expect(styleOf("status:forward").fg).not.toBe(dim);
    const fwd = hot(h, "status:forward");
    for (const type of ["down", "up"]) h.app.handleMouse({ type, x: fwd.x, y: fwd.y, button: 0 });
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
    // The path: the history above it — forward places on top, here marked, back below; enter jumps.
    await h.app.run("note.open index.md");
    await h.app.run("history.back");
    h.frame();
    const path = hot(h, "status:path");
    for (const type of ["down", "up"]) h.app.handleMouse({ type, x: path.x, y: path.y, button: 0 });
    const menu = h.app.overlay as ListOverlay;
    expect(menu.title).toBe("History");
    expect(menu.items.map((i) => `${i.label}|${i.hint ?? ""}`)).toEqual(["  Copy path|y p", "  index.md|forward", "● notes/beta.md|here", "  notes/alpha.md|back"]);
    expect(menu.items[menu.selected]!.hint).toBe("here");
    h.frame();
    expect(h.app.geometry!.overlay!.y + h.app.geometry!.overlay!.h).toBeLessThanOrEqual(path.y); // above the path
    menu.selected = 3;
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    // Two steps forward at once, from there.
    expect(h.app.view!.fwd.length).toBe(2);
  });
  test("the breadcrumb can be hidden (a UI setting); find's row then sits at the window's top", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 120, height: 30 });
    const v = h.app.view!;
    await h.keys("]", "]"); // onto a heading, so the breadcrumb has something
    expect(h.frame()).toContain("§");
    await h.app.run("ui.breadcrumb");
    expect(h.app.ui.breadcrumb).toBe(false);
    let f = h.frame();
    expect(f).not.toContain("§");
    const pane = h.app.geometry!.panes[0]!;
    await h.keys("/", "D", "2");
    f = h.frame();
    const lines = f.split("\n");
    // The find row is the window's first row, its rule under it, then the text.
    expect(lines[h.app.geometry!.panes[0]!.y - 2]).toMatch(/› D2/);
    expect(pane.y).toBeLessThan(h.app.geometry!.panes[0]!.y);
    await h.keys("escape", "escape");
    // It's in the UI settings list, and it's remembered like the others.
    await h.app.run("ui.breadcrumb");
    expect(h.app.ui.breadcrumb).toBe(true);
    void v;
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
    // The top bar can go (space u b, a UI setting): the note gains its row, messages still float.
    await h.keys("space", "u", "b");
    expect(h.app.ui.top_bar).toBe(false);
    f = lines();
    expect(h.app.view!.height).toBe(height + 1);
    expect(f[0]).not.toContain("slipbox");
    h.app.message("warn", "careful");
    f = lines();
    expect(f.join("\n")).toContain("! careful");
    expect(f.at(-1)).toContain("READ");
    await h.app.run("ui.top_bar");
    expect(lines()[0]).toContain("slipbox");
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
    h.app.handleMouse({ type: "down", x, y, button });
    h.app.handleMouse({ type: "up", x, y, button });
    h.frame();
  };
  test("a drag selection survives the re-layout its copy message causes", async () => {
    const h = await harness({ open: "samples/about-this-vault.md", width: 120, height: 30 });
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
    await h.keys("space", "?");
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
    expect(o.filtered[0]!.item.data).toBe("window.close_or_quit"); // the alias row first
    await h.keys("down");
    // Past the other quit commands (save and quit, quit without saving) to one that doesn't quit.
    while (/^(app\.|window\.close_or_quit)/.test(String(o.filtered[o.selected]!.item.data))) await h.keys("down");
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
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 120, height: 20, config: (c) => (c.ui.outline = true) });
    h.frame();
    const sb = h.app.geometry!.sidebarPane!;
    h.app.handleMouse({ type: "scroll", x: sb.x + 3, y: sb.y + 4, button: 0, scroll: { direction: "down", delta: 1 } });
    h.frame();
    expect(h.app.sidebar.scroll).toBeGreaterThan(0);
    const op = h.app.geometry!.outlinePane!;
    h.app.handleMouse({ type: "scroll", x: op.x + 3, y: op.y + 4, button: 0, scroll: { direction: "down", delta: 1 } });
    h.frame();
    expect(h.app.outline.scroll).toBeGreaterThan(0);
    const n = await harness({ open: "samples/handbook/operations-handbook.md", width: 70, height: 20 });
    await n.keys("space", "e");
    n.frame();
    const p = n.app.geometry!.sidebarPane!;
    const top = n.app.view!.top;
    n.app.handleMouse({ type: "scroll", x: p.x + 3, y: p.y + 4, button: 0, scroll: { direction: "down", delta: 1 } });
    expect(n.app.view!.top).toBe(top);
  });
  test("wrapping off: the sideways offset is clamped when the window widens", async () => {
    const h = await harness({ open: "samples/scratch/wrap-probe.md", width: 80, height: 30, config: (c) => ((c.ui.wrap = false), (c.ui.sidebar = false)) });
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
    await h.keys("space", "e");
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
    const h = await harness({ open: "samples/about-this-vault.md", width: 30, height: 12 });
    for (const n of ["notes/alpha.md", "notes/beta.md", "index.md", "samples/equipment/telescope-comparison.md", "samples/software/pipeline-cookbook.md", "samples/logs/observing-log-2026.md", "samples/handbook/operations-handbook.md"]) h.app.openInNewTab(n);
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
      await h.keys("space", "?");
      h.frame();
      const o = h.app.overlay as ListOverlay;
      const r = h.app.geometry!.overlay!;
      expect(o.selected).toBeGreaterThanOrEqual(o.scroll);
      expect(o.selected).toBeLessThan(o.scroll + r.rows);
    }
  });
  test("a stacked split too short for two windows shows the active one, inside its area", async () => {
    const h = await harness({ open: "samples/about-this-vault.md", width: 40, height: 9 });
    await h.keys("ctrl+w", "s");
    const rows = h.frame().split("\n");
    expect(rows.at(-2)!.startsWith("━")).toBe(true); // the bottom frame rule is intact
    expect(h.app.geometry!.panes.some((p) => p.view === h.app.view)).toBe(true);
  });
  test("clicks on an overlaid explorer or outline don't reach what's under it", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 80, height: 24 });
    await h.keys("]", "]");
    await h.keys("space", "e");
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
    for (let y = top; y <= bottom; y++) expect(rows[y]!.slice(right + 1).replace(/[▐┃━▤¹]/g, "").trim()).toBe(""); // borders, the right rail
    expect(rows[bottom]).toMatch(/\+\d+ more/);
  });
  test("NO_COLOR: the scrollbar thumb stands out from its track; the current note is bold", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 100, height: 20, themeName: "mono" });
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
      const described = rows.join("\n").includes("notes, headings, tags, text, commands");
      if (padded) expect(described).toBe(true);
    }
  }, 30_000); // 29 harnesses
});

describe("review round 2", () => {
  const click = (h: Harness, x: number, y: number) => {
    h.app.handleMouse({ type: "down", x, y, button: 0 });
    h.app.handleMouse({ type: "up", x, y, button: 0 });
    h.frame();
  };
  test("side panes can't squeeze the note to nothing: no crash with a split and wide panes", async () => {
    const h = await harness({ open: "samples/about-this-vault.md", width: 100, height: 30, config: (c) => ((c.ui.outline = true), (c.ui.sidebar_width = 60), (c.ui.outline_width = 60)) });
    await h.keys("ctrl+w", "v");
    h.frame(); // throws on a drawing failure
    expect(h.app.contentWidth()).toBeGreaterThanOrEqual(24);
  });
  test("an overlaid explorer keeps clicks on its border and margin", async () => {
    const h = await harness({ open: "samples/about-this-vault.md", width: 70, height: 30 });
    await h.keys("space", "e");
    h.frame();
    const p = h.app.geometry!.sidebarPane!;
    const cur = { ...h.app.view!.cur };
    click(h, p.x + p.w - 1, p.y + 6); // the margin, over the note
    expect(h.app.view!.cur).toEqual(cur);
    expect(h.app.region).toBe("sidebar");
  });
  test("focusing a pane brings its selection back after the wheel moved the view", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 160, height: 16 });
    h.frame();
    const p = h.app.geometry!.sidebarPane!;
    for (let i = 0; i < 3; i++) h.app.handleMouse({ type: "scroll", x: p.x + 3, y: p.y + 3, button: 0, scroll: { direction: "down", delta: 1 } });
    expect(h.app.sidebar.pinned).toBe(true);
    await h.keys("space", "e");
    h.frame();
    expect(h.app.sidebar.pinned).toBe(false);
    const list = h.app.geometry!.sidebar!;
    expect(h.app.sidebar.selected).toBeGreaterThanOrEqual(h.app.sidebar.scroll);
    expect(h.app.sidebar.selected).toBeLessThan(h.app.sidebar.scroll + list.h);
  });
  test("a selection stays on the same source lines when the width changes", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 140, height: 30, config: (c) => (c.ui.sidebar = false) });
    for (let i = 0; i < 12; i++) await h.keys("j");
    await h.keys("shift+v", "j", "j");
    const lines = () => {
      const v = h.app.view!;
      const l = h.app.currentLayout(v);
      return [l.lines[v.sel!.anchor.row]!.src, l.lines[v.cur.row]!.src];
    };
    const before = lines();
    await h.keys("space", "e", "escape"); // the explorer takes width: the note re-wraps
    h.frame();
    // The same place (a blank line between paragraphs has no row, so the next one stands in),
    // never another paragraph as before.
    const after = lines();
    expect(Math.abs(after[0]! - before[0]!)).toBeLessThanOrEqual(1);
    expect(after[1]).toBe(before[1]);
  });
  test("a which-key entry takes its click, not what's under the popup", async () => {
    const h = await harness({ open: "samples/people/partners-and-names.md", width: 120, height: 30 });
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
    h.app.openInNewTab("samples/equipment/telescope-comparison.md");
    h.frame();
    const wide = h.app.view!;
    const before = h.app.currentLayout(wide);
    const alpha = h.app.tabs[0]!.views[0]!;
    const alphaBefore = h.app.currentLayout(alpha);
    h.app.applyChanges({ changes: [{ rel: "notes/beta.md", kind: "changed", isNote: true }], rescan: false });
    expect(h.app.currentLayout(wide)).toBe(before); // no link to beta: the same layout object
    expect(h.app.currentLayout(alpha)).not.toBe(alphaBefore); // links to beta: re-laid out
  });
  test("matching: each word as typed, its letters together, the words in any order; smart case; highlights (3.16)", () => {
    expect(match("ab", "cab.md")).not.toBeNull();
    expect(match("ab", "a-b.md")).toBeNull(); // not letter by letter
    expect(rank("readme", ["r/e/a/d/m/e.md", "notes/rename-adme.md", "areas/readme.md"], (x) => x).map((r) => r.item)).toEqual(["areas/readme.md"]);
    const path = "handbook/operations-handbook.md";
    expect(match("oper hand", path)).not.toBeNull();
    expect(match("hand oper", path)).not.toBeNull(); // any order
    expect(match("oper xyz", path)).toBeNull(); // every word
    expect(match("oper hand", path)!.positions).toEqual([9, 10, 11, 12, 20, 21, 22, 23]); // in the file name, each word's best place
    // Smart case, word by word.
    expect(match("Tel", "telescope.md")).toBeNull();
    expect(match("tel Scope", "tel-Scope.md")).not.toBeNull();
    // Highlights follow the text even where lowercasing changes its length.
    expect(match("read", "areas/readme.md")!.positions).toEqual([6, 7, 8, 9]);
    expect(match("stan", "İİstanbul.md")!.positions).toEqual([2, 3, 4, 5]);
    // As drawn: a name's control characters never are, so the name shown is found, positions its own.
    expect(match("bellring", "bell\x07ring.md")!.positions).toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
    expect(match("ring", "a\u202e/ring.md", 2)!.positions).toEqual([3, 4, 5, 6]);
    expect(match("c", "ab\u202ec", 3)!.score).toBe(match("c", "abc", 2)!.score); // the label ends where it did: c is after it
    // Ranked: the file name over a folder, a word start, the shorter.
    expect(rank("readme", ["readme-old/notes.md", "areas/the-readme-of-it.md", "areas/readme.md"], (x) => x).map((r) => r.item)).toEqual([
      "areas/readme.md",
      "areas/the-readme-of-it.md",
      "readme-old/notes.md",
    ]);
    // A label over its description — even mid-word over a word start — which still counts.
    const items = [
      { label: "Delete the note", detail: "moves it to the trash" },
      { label: "Remove the tag", detail: "from every note" },
    ];
    expect(rank("move", items, (i) => [i.label, i.detail]).map((r) => r.item.label)).toEqual(["Remove the tag", "Delete the note"]);
    expect(rank("move trash", items, (i) => [i.label, i.detail]).map((r) => r.item.label)).toEqual(["Delete the note"]);
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
    const h = await harness({ open: "samples/equipment/telescope-comparison.md", width: 110, config: (c) => (c.ui.sidebar = false) });
    const wrapped = h.app.currentLayout(h.app.view!);
    await h.keys("space", "u", "w");
    expect(h.app.ui.wrap).toBe(false);
    const layout = h.app.currentLayout(h.app.view!);
    expect(layout.width).toBeGreaterThan(300); // the widest real row, not the pane
    expect(layout.width).toBeLessThan(2000); // not the probe width
    expect(layout.lines.length).toBeLessThan(wrapped.lines.length);
    const row = layout.lines.findIndex((l) => l.spans.map((x) => x.text).join("").includes("The short version is that Aster"));
    h.app.moveCursor(h.app.view!, { row, col: 0 });
    expect(h.app.view!.left).toBe(0);
    await h.keys("$");
    const v = h.app.view!;
    expect(v.left).toBeGreaterThan(0);
    expect(v.cur.col).toBeGreaterThanOrEqual(v.left);
    expect(v.cur.col).toBeLessThan(v.left + h.app.textColumns(v));
    // What's drawn is the row's end, and a click lands on the column under it.
    const f = h.frame();
    expect(f).toContain("before anyone signs a purchase order.");
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
    const h = await harness({ open: "samples/handbook/operations-handbook.md" });
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
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 160, height: 20, config: (c) => (c.ui.outline = true) });
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
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 160, height: 30, config: (c) => (c.ui.outline = true) });
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
    const h = await harness({ open: "samples/equipment/telescope-comparison.md", width: 100, height: 30, config: (c) => ((c.ui.wrap = false), (c.ui.sidebar = false)) });
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
    await h.keys("space", "u", "w", "space", "u", "w");
    const n = await harness({ open: "notes/alpha.md", width: 100, height: 30, config: (c) => ((c.ui.wrap = false), (c.ui.sidebar = false)) });
    n.frame();
    expect(n.app.geometry!.scrollbars.some((b) => b.horizontal)).toBe(false);
    expect(n.app.view!.height).toBe(n.app.geometry!.panes[0]!.h);
  });
  test("an overlaid pane joins the borders it crosses", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 60, height: 24, config: (c) => (c.ui.sidebar = false) });
    await h.keys("space", "e");
    const f = h.frame();
    const lines = f.split("\n");
    // The explorer's border meets the rules above and below it with tee joints, never a crossing.
    const pane = h.app.geometry!.sidebarPane!;
    const x = pane.x + pane.w - 3;
    const col = lines.map((l) => [...l][x] ?? "").join("");
    expect(col).not.toContain("╋");
    for (const joint of ["┳", "┻"]) expect(col).toContain(joint);
  });
  test("dragging borders resizes the explorer, the outline and the split", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 170, config: (c) => (c.ui.outline = true) });
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
  test("explorer: click a folder to fold it; a click selects a note, a double-click or enter opens it", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    h.frame();
    const sb = h.app.geometry!.sidebar!;
    const rowOf = (path: string) => h.app.treeRows().findIndex((r) => r.path === path) - h.app.sidebar.scroll + sb.y;
    click(h, sb.x + 3, rowOf("notes"));
    expect(h.app.treeRows().some((r) => r.path === "notes/beta.md")).toBe(false);
    click(h, sb.x + 3, rowOf("notes"));
    expect(h.app.treeRows().some((r) => r.path === "notes/beta.md")).toBe(true);
    const y = rowOf("notes/beta.md");
    const selected = () => h.app.treeRows()[h.app.sidebar.selected]?.path;
    click(h, sb.x + 6, y); // one click: selected, not opened
    expect(h.app.tabs).toHaveLength(1);
    expect(selected()).toBe("notes/beta.md");
    click(h, sb.x + 6, y); // the second of a double-click: opened as a tab
    expect(h.app.tabs).toHaveLength(2);
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
    expect(h.app.tabs[0]!.views[0]!.buf.rel).toBe("notes/alpha.md"); // the first tab is untouched
    // Enter on a selected note opens it too (a second time: the tab it has).
    await Bun.sleep(450); // past the double-click window
    click(h, sb.x + 6, rowOf("notes/alpha.md"));
    expect(h.app.tabs).toHaveLength(2);
    expect(selected()).toBe("notes/alpha.md");
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    expect(h.app.tabs).toHaveLength(2);
  });
  test("outline: click the fold marker folds; click the text jumps", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 160, config: (c) => (c.ui.outline = true) });
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
    await Bun.sleep(1); // keys are handled one at a time: let the first one's turn end
    const z = h.app.geometry!.hot.find((r) => r.id === "wk:z")!;
    click(h, z.x + 2, z.y);
    await Bun.sleep(1);
    expect(h.app.ui.zen).toBe(true);
  });
  test("floating windows have a margin in their own colour: a row above and below, two columns aside", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 140, height: 40 });
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
    await n.keys("space", "e");
    n.frame();
    const p = n.app.geometry!.sidebarPane!; // over the note, the pane's area includes its border and margin
    const nc = n.canvas();
    for (let y = p.y; y < p.y + p.h; y++) expect(nc.rows[y]!.slice(p.x + p.w - 2, p.x + p.w).join("")).toBe("  ");
  });
  test("the wheel scrolls a list; the selection moves only to stay in view", async () => {
    const h = await harness({ width: 140, height: 40 });
    await h.keys("space", "?");
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

describe("explorer and outline panes", () => {
  test("ctrl+e cycles open, focus, close; enter and l open tabs (or switch); o here; s the split; q closes", async () => {
    const h = await harness({ config: (c) => (c.ui.sidebar = false) });
    expect(h.app.sidebarShown).toBe(false);
    await h.keys("space", "e");
    expect(h.app.sidebarShown).toBe(true);
    expect(h.app.region).toBe("sidebar");
    await h.keys("escape");
    expect(h.app.region).toBe("content");
    await h.keys("space", "e");
    expect(h.app.region).toBe("sidebar");
    await h.keys("space", "e");
    expect(h.app.sidebarShown).toBe(false);
    await h.keys("space", "e");
    h.app.sidebar.selected = h.app.treeRows().findIndex((r) => r.path === "notes");
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
    expect(h.app.sidebarShown).toBe(false);
  });
  test("reveal: space shift+e", async () => {
    const h = await harness({ open: "notes/beta.md", config: (c) => (c.ui.sidebar = false) });
    await h.keys("space", "shift+e");
    expect(h.app.treeRows()[h.app.sidebar.selected]!.path).toBe("notes/beta.md");
  });
  test("outline: ctrl+o opens and focuses, focuses, closes; it follows the cursor while unfocused; enter jumps; h folds", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", width: 160 });
    await h.keys("space", "o");
    expect(h.app.outlineShown).toBe(true);
    expect(h.app.region).toBe("outline"); // opening focuses it
    expect(h.app.geometry!.outline).not.toBeNull();
    await h.keys("escape"); // back to the note; the outline stays open
    expect(h.app.region).toBe("content");
    expect(h.app.outlineShown).toBe(true);
    await h.keys("space", "o"); // open, focus elsewhere: focus it
    expect(h.app.region).toBe("outline");
    await h.keys("space", "o"); // focused: close
    expect(h.app.outlineShown).toBe(false);
    expect(h.app.region).toBe("content");
    await h.keys("space", "o", "escape");
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
    await h.keys("space", "e");
    expect(h.frame()).toContain("▸ notes");
    await h.keys("escape");
    expect(h.frame()).not.toContain("▸ notes");
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
    writeFileSync(join(root, "index.md"), "# Index\n\n- [the long one](a-rather-long-note-name-for-cutting-in-the-tab-strip.md)\n- [ ] a task\n\n> [!warning] Careful\n> text\n");
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
    const changed = await harness({ root, open: null, config: (c) => ((c.ui.restore_session = true), (c.ui.line_numbers = true)) });
    expect(changed.app.uiOverrides.line_numbers).toBeUndefined();
    const flipped = await harness({ root, open: null, config: (c) => ((c.ui.restore_session = true), (c.theme = "nord")) });
    expect(flipped.app.ui.theme).toBe("nord");
  });
});

describe("configuration: everything from config, and live reload", () => {
  test("keys, leader, pane keys, aliases and groups come from config", async () => {
    const h = await harness({
      open: "samples/handbook/operations-handbook.md",
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
  test("a reload's root_markers decide where roots are from then on (21.1)", async () => {
    const { rootMarkers, setRootMarkers } = await import("../src/core/vault.ts");
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
  test("the scratch open is never another root in the explorer (21.9): it lives in slipbox's own state folder", async () => {
    const h = await harness();
    h.app.capture("x");
    await h.app.run("scratch.open");
    expect(h.app.view!.buf.abs.startsWith(`${h.root}/`)).toBe(false); // the default place: outside the root
    expect(h.app.otherRoots()).toEqual([]);
    expect(h.app.explorerRows().some((r) => r.root?.other)).toBe(false);
  });
});

describe("external changes (5.3, 5.4) and anchoring (3.5)", () => {
  test("a clean buffer reloads silently and the cursor keeps its place", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", height: 20 });
    await h.keys("]", "]", "]", "]");
    const before = rowText(h);
    const file = join(h.root, "samples", "handbook", "operations-handbook.md");
    writeFileSync(file, `# Inserted by an agent\n\n${"A new paragraph.\n\n".repeat(20)}${readFileSync(file, "utf8")}`);
    h.app.applyChanges({ changes: [{ rel: "samples/handbook/operations-handbook.md", kind: "changed", isNote: true }], rescan: false });
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
    expect(role()).toBe("link");
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
    writeFileSync(join(root, "p.md"), `# P\n\n${Array.from({ length: 8 }, (_, i) => `line ${i + 1}`).join("\n")}\n\nafter\n`);
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
    // …the byte many terminals send for ctrl+h: it must still open replace there.
    expect(DEFAULT_KEYS["ctrl+backspace"]).toBe("find.replace");
    expect(DEFAULT_KEYS["ctrl+h"]).toBe("find.replace");
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
    config.lint.enabled = "off";
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

describe("review cycle 1 (TUI)", () => {
  const touch = async (file: string, text: string) => {
    writeFileSync(file, text);
    const future = Date.now() / 1000 + 5;
    (await import("node:fs")).utimesSync(file, future, future);
  };
  const source = async (text: string, config?: (c: Config) => void, width = 100, height = 30) => {
    const root = makeVault();
    const file = join(root, "r.md");
    writeFileSync(file, text);
    const h = await harness({ root, open: "r.md", width, height, config });
    await h.keys("space", "n", "v");
    const v = h.app.view!;
    const at = (row: number, col: number) => h.app.moveCursor(v, { row, col });
    const ex = (cmd: string) => h.keys(":", ...[...cmd].map((ch) => (ch === " " ? "space" : ch)), "enter");
    return { h, v, at, ex, file, root };
  };
  test(":s with line anchors and empty matches: ^ and $ on every line, the cursor's line only", async () => {
    const { v, at, ex } = await source("# a\n# b\nc\n");
    await ex("%s/^/> /");
    expect(v.buf.source).toBe("> # a\n> # b\n> c\n");
    await ex("%s/$/!/");
    expect(v.buf.source).toBe("> # a!\n> # b!\n> c!\n");
    at(1, 0);
    await ex("s/^> #/##/");
    expect(v.buf.source).toBe("> # a!\n## b!\n> c!\n");
  });
  test("autosave never writes a merge's conflict markers; :w does", async () => {
    const { h, v, file } = await source("one\n", (c) => (c.editor.autosave_ms = 20));
    await h.keys("shift+a", "!", "escape");
    await touch(file, "one?\n");
    h.app.reloadBuffer(v.buf);
    await h.keys("m");
    expect(v.buf.source).toContain("<<<<<<< yours");
    await Bun.sleep(80);
    expect(readFileSync(file, "utf8")).toBe("one?\n");
    await h.keys(":", "w", "enter");
    expect(readFileSync(file, "utf8")).toContain("<<<<<<< yours");
  });
  test("a change on disk while typing waits for esc: typed letters never pick l, k, d or m", async () => {
    const { h, v, file } = await source("mine\n");
    await h.keys("shift+a", "space", "h", "e");
    await touch(file, "theirs\n");
    h.app.reloadBuffer(v.buf);
    expect(h.app.overlay).toBeNull();
    await h.keys("l", "l", "o");
    expect(v.buf.source).toBe("mine hello\n");
    await h.keys("escape");
    expect(h.app.overlay).toBeNull(); // not on the esc: a second one (closing the lens) would dismiss it
    await h.keys("0");
    expect((h.app.overlay as ListOverlay).title).toContain("changed on disk");
  });
  test("replace all keeps to the selection as it shrinks or grows", async () => {
    const { h, v } = await source("cat cat\ncat cat\ncat\n");
    await h.keys("shift+v", "j", "space", "f", "r", ...[..."cat"], "tab", "c", "alt+a");
    expect(v.buf.source).toBe("c c\nc c\ncat\n");
    await h.keys("enter"); // nothing left inside: the cat on line 3 stays
    expect(v.buf.source).toBe("c c\nc c\ncat\n");
  });
  test("cw on a word's last letter, or a one-letter word, changes only that", async () => {
    const { h, v, at } = await source("a b\nab cd\n");
    at(0, 0);
    await h.keys("c", "w", "X", "escape");
    expect(v.buf.source.split("\n")[0]).toBe("X b");
    at(1, 1);
    await h.keys("c", "w", "Y", "escape");
    expect(v.buf.source.split("\n")[1]).toBe("aY cd");
  });
  test(". repeats a visual change and a paste", async () => {
    const { h, v, at } = await source("abcdef\nabcdef\nx\ny\n");
    at(0, 0);
    await h.keys("v", "l", "d");
    expect(v.buf.source.split("\n")[0]).toBe("cdef");
    at(1, 0);
    await h.keys(".");
    expect(v.buf.source.split("\n")[1]).toBe("cdef"); // two characters again, not an older change
    at(2, 0);
    await h.keys("shift+a");
    await h.app.paste("XY");
    await h.keys("escape", "j", ".");
    expect(v.buf.source.split("\n").slice(2, 4)).toEqual(["xXY", "yXY"]);
  });
  test("a count between the operator and the text object: d2i( and d2aw", async () => {
    const { h, v, at } = await source("x (a (b) c) y\none two three four\n");
    at(0, 6); // on b
    await h.keys("d", "2", "i", "(");
    expect(v.buf.source.split("\n")[0]).toBe("x () y");
    at(1, 0);
    await h.keys("d", "2", "a", "w");
    expect(v.buf.source.split("\n")[1]).toBe("three four");
  });
  test("a charwise put of lines into a CRLF note keeps it CRLF", async () => {
    const { h, v, at } = await source("ab\r\ncd\r\nxy\r\n");
    at(0, 1);
    await h.keys("v", "j", "y");
    at(2, 0);
    await h.keys("p");
    expect(v.buf.source.replace(/\r\n/g, "")).not.toContain("\n");
  });
  test("'<,'> is the last selection's lines after it ends", async () => {
    const { h, v, at, ex } = await source("a\nb\nc\nd\n");
    at(1, 0);
    await h.keys("shift+v", "j", "escape");
    await ex("'<,'>s/$/!/");
    expect(v.buf.source).toBe("a\nb!\nc!\nd\n");
  });
  test("'<,'> whose lines were deleted since is the line after them, as vim's marks: never the note's first", async () => {
    const { h, v, ex } = await source("x1\nx2\nx3\nx4\nx5\nx6\n");
    await h.keys("3", "j", "shift+v", "j", ":", "escape", "escape");
    expect(v.buf.visualMarks).toEqual([9, 12]);
    await h.keys("g", "g", "j", "d", "3", "j");
    expect(v.buf.source).toBe("x1\nx6\n");
    await ex("'<,'>s/x/y/");
    expect(v.buf.source).toBe("x1\ny6\n");
  });
  test("'<,'> moves with the text: lines added above the last selection, it still works on its lines", async () => {
    const { h, v, ex } = await source("one\ntwo\nfoo a\nfoo b\nfoo c\n");
    await h.keys("j", "j", "shift+v", "j", "escape");
    await h.keys("g", "g", "shift+o", "n", "e", "w", "escape");
    await ex("'<,'>s/foo/BAR/");
    expect(v.buf.source).toBe("new\none\ntwo\nBAR a\nBAR b\nfoo c\n");
    await h.keys("g", "g", "d", "d", "u");
    await ex("'<,'>s/BAR/X/");
    expect(v.buf.source).toBe("new\none\ntwo\nX a\nX b\nfoo c\n");
    await h.keys("g", "g", "3", "j", "shift+o", "X", "escape"); // a line opened above the first marked
    await ex("'<,'>s/X/Y/");
    expect(v.buf.source).toBe("new\none\ntwo\nX\nY a\nY b\nfoo c\n");
  });
  test(":s from a rendered paragraph works on the source lines its row shows, not only its first", async () => {
    const root = makeVault();
    writeFileSync(join(root, "j.md"), "# J\n\nalpha one\nbeta two\n\ngamma beta\n");
    const h = await harness({ root, open: "j.md", width: 100, height: 30 });
    const v = h.app.view!;
    const row = h.app.currentLayout(v).lines.findIndex((l) => l.spans.map((x) => x.text).join("").includes("alpha one beta two"));
    h.app.moveCursor(v, { row, col: 10 });
    await h.keys(":", ..."s/beta/BETA/", "enter");
    expect(v.buf.source).toBe("# J\n\nalpha one\nBETA two\n\ngamma beta\n");
  });
  test("`.` after an insert whose completion popup ctrl+e closed never takes a completion", async () => {
    const { h, v } = await source("hello\n");
    await h.keys("o", "[", "a", "]", "(");
    expect(h.app.completion?.shown.length).toBeGreaterThan(0);
    await h.keys("ctrl+e", "enter", "x", "escape");
    expect(v.buf.source).toBe("hello\n[a](\nx\n");
    await h.keys(".");
    expect(v.buf.source).toBe("hello\n[a](\nx\n[a](\nx\n");
  });
  test("the status chip shows the key waiting for its character: f, t, 2f, r, dT — never r for all", async () => {
    const h = await harness({ open: "index.md", width: 120, height: 30 });
    for (const [keys, chip] of [[["f"], " f "], [["shift+t"], " T "]] as const) {
      await h.keys(...keys);
      expect(statusRow(h.frame()).slice(0, chip.length)).toBe(chip);
      await h.keys("escape");
    }
    await h.keys("space", "n", "v");
    for (const [keys, chip] of [[["r"], " r "], [["2", "f"], " 2f "], [["d", "shift+t"], " dT "]] as const) {
      await h.keys(...keys);
      expect(statusRow(h.frame()).slice(0, chip.length)).toBe(chip);
      await h.keys("escape");
    }
  });
  test("5G and 5gg land on the line's first non-blank, as G and gg do; past the end, the last line's", async () => {
    const { h, v } = await source("aa\n    bb\ncc\n");
    for (const keys of [["2", "shift+g"], ["2", "g", "g"]]) {
      await h.keys("g", "g", ...keys);
      expect(v.cur).toEqual({ row: 1, col: 4 });
    }
    await h.keys("9", "shift+g");
    expect(v.cur).toEqual({ row: 2, col: 0 });
  });
  test("a counted r counts characters, not code points: an emoji with a modifier is one", async () => {
    const { h, v } = await source("a👍🏽\n");
    await h.keys("0", "l", "2", "r", "x");
    expect(v.buf.source).toBe("a👍🏽\n"); // not enough characters, as in vim
    await h.keys("0", "l", "r", "x");
    expect(v.buf.source).toBe("ax\n");
  });
  test("session restore keeps the scroll position, with the breadcrumb on", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "samples/handbook/operations-handbook.md", width: 160, height: 40 });
    for (let i = 0; i < 60; i++) await h.keys("j");
    h.frame();
    const top = h.app.view!.top;
    expect(top).toBeGreaterThan(0);
    h.app.quit();
    const again = await harness({ root, open: null, width: 160, height: 40, config: (c) => (c.ui.restore_session = true) });
    again.frame();
    expect(again.app.view!.top).toBe(top);
  });
  test("explorer s opens in the other window when a split is there already", async () => {
    const h = await harness({ open: "index.md", width: 160, height: 40 });
    await h.keys("ctrl+w", "v", "ctrl+w", "h");
    const reading = h.app.tab!.views[0]!.buf.rel;
    h.app.showSidebar(true);
    h.app.region = "sidebar";
    h.app.sidebar.selected = h.app.explorerRows().findIndex((r) => r.path === "crlf.md");
    await h.keys("s");
    expect(h.app.tab!.views[0]!.buf.rel).toBe(reading);
    expect(h.app.tab!.views[1]!.buf.rel).toBe("crlf.md");
  });
  test("help and the palette list source mode's keys", async () => {
    const h = await harness();
    await h.keys("space", "?");
    const del = (h.app.overlay as ListOverlay).items.find((i) => i.data === "edit.op_delete")!;
    expect(del.keys).toContain("d");
  });
  test("resize mode: every step changes the drawn width", async () => {
    const h = await harness({ width: 100, height: 30, config: (c) => (c.ui.outline = true) });
    await h.app.run("explorer.cycle");
    await h.app.run("explorer.cycle"); // focus it
    for (let i = 0; i < 15; i++) await h.app.run("window.wider");
    await h.keys("escape");
    await h.app.run("outline.cycle");
    let last = h.app.outlineWidth();
    for (let i = 0; i < 3; i++) {
      await h.app.run("window.narrower");
      h.frame();
      expect(h.app.outlineWidth()).toBeLessThan(last);
      last = h.app.outlineWidth();
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

describe("review cycle 2 (TUI)", () => {
  const note = `# Title\n\n${Array.from({ length: 12 }, (_, i) => `Para ${i + 1} text here.`).join("\n\n")}\n\nA paragraph of\nfour lines with\nthe zebra here\nand an end.\n\n\`\`\`\ncode 1\ncode 2\n\`\`\`\n`;
  const open = async (mode: "source" | "live", config?: (c: Config) => void) => {
    const root = makeVault();
    writeFileSync(join(root, "l.md"), note);
    const h = await harness({ root, open: "l.md", width: 100, height: 30, config });
    const v = h.app.view!;
    await h.keys("space", "n", mode === "live" ? "l" : "v");
    const goto = (text: string) => {
      const rows = h.app.currentLayout(v).lines.map((l) => l.spans.map((x) => x.text).join(""));
      h.app.moveCursor(v, { row: rows.findIndex((t) => t.includes(text)), col: 0 });
      h.frame();
    };
    return { h, v, goto, root };
  };
  test("the lens: the same typing keys give the same text as source mode (a differential)", async () => {
    let seed = 11;
    const rand = (n: number) => {
      // Math.imul: a plain * exceeds 2^53 and loses the low bits, which then take few values.
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
      return (seed >>> 8) % n; // the high bits: an LCG's low ones repeat quickly
    };
    const pool = ["x", "y", "space", "enter", "backspace", "delete", "left", "right", "home", "end", "ctrl+w", "ctrl+u"];
    for (let run = 0; run < 25; run++) {
      const keys = Array.from({ length: 25 }, () => pool[rand(pool.length)]!);
      // Block starts: a row the rendered view and the source both begin with (a paragraph's later
      // lines are inside one rendered row, which would start the two modes in different places).
      const start = ["Para 8", "A paragraph", "Para 12"][run % 3]!;
      const texts: string[] = [];
      for (const mode of ["source", "live"] as const) {
        const { h, v, goto } = await open(mode);
        goto(start);
        await h.keys("i", ...keys, "escape");
        texts.push(v.buf.source);
      }
      if (texts[0] !== texts[1]) throw new Error(`from ${start}, keys ${keys.join(" ")}:\nsource ${JSON.stringify(texts[0])}\nlens   ${JSON.stringify(texts[1])}`);
    }
  }, 60000);
  test("the lens: delete across its bottom edge, then typing lands at the cursor", async () => {
    const { h, v, goto } = await open("live");
    goto("Para 8");
    await h.keys("shift+a", "delete", "delete", "delete", "Q", "escape");
    expect(v.buf.source).toContain("Para 8 text here.Qara 9 text here.");
  });
  test("the lens: cgn to a match inside a multi-line block outside it types there", async () => {
    const { h, v, goto } = await open("live");
    goto("Para 2");
    await h.keys("/", ...[..."zebra"], "enter", "g", "g", "c", "g", "n", "Z", "escape");
    expect(v.buf.source).toContain("the Z here");
  });
  test("the lens: an agent's edit elsewhere doesn't stretch it", async () => {
    const { h, v, goto, root } = await open("live");
    goto("Para 5");
    h.frame();
    const span = () => {
      const lines = h.app.currentLayout(v).lines;
      return lines.findIndex((l) => l.lens === "bottom") - lines.findIndex((l) => l.lens === "top");
    };
    const before = span();
    writeFileSync(join(root, "l.md"), `${note}${"more\n\n".repeat(200)}`);
    h.app.reloadBuffer(v.buf);
    h.frame();
    expect(span()).toBeLessThanOrEqual(before + 2);
  });
});

describe("review cycle 2 (TUI editing)", () => {
  const src = async (text: string, config?: (c: Config) => void) => {
    const root = makeVault();
    writeFileSync(join(root, "e.md"), text);
    const h = await harness({ root, open: "e.md", width: 100, height: 30, config });
    await h.keys("space", "n", "v");
    const v = h.app.view!;
    return { h, v, root, at: (row: number, col: number) => h.app.moveCursor(v, { row, col }) };
  };
  test("a count before . replaces the recorded one: 2dd then 3. deletes three", async () => {
    const { h, v, at } = await src(Array.from({ length: 10 }, (_, i) => `l${i}`).join("\n") + "\n");
    at(0, 0);
    await h.keys("2", "d", "d", "3", ".");
    expect(v.buf.source.split("\n")[0]).toBe("l5");
  });
  test("insert ctrl+w keeps the space before the word; enter doesn't continue lists in code or on rules", async () => {
    const { h, v, at } = await src("a foo\n```\n- code\n```\n* * *\n");
    at(0, 5);
    await h.keys("a", "ctrl+w", "escape");
    expect(v.buf.source.split("\n")[0]).toBe("a ");
    at(2, 5);
    await h.keys("shift+a", "enter", "x", "escape");
    expect(v.buf.source.split("\n")[3]).toBe("x");
    const rule = v.buf.source.split("\n").indexOf("* * *");
    at(rule, 0);
    await h.keys("shift+a", "enter", "y", "escape");
    expect(v.buf.source.split("\n")[rule + 1]).toBe("y");
  });
  test("d2ap deletes two paragraphs", async () => {
    const { h, v, at } = await src("one\n\ntwo\n\nthree\n");
    at(0, 0);
    await h.keys("d", "2", "a", "p");
    expect(v.buf.source).toBe("three\n");
  });
  test("a reload during typing keeps the rest of the session one undo step", async () => {
    const { h, v, root } = await src("start\n");
    await h.keys("shift+a"); // typing, nothing typed yet: the note is still clean
    writeFileSync(join(root, "e.md"), "agent\n");
    const future = Date.now() / 1000 + 5;
    (await import("node:fs")).utimesSync(join(root, "e.md"), future, future);
    h.app.reloadBuffer(v.buf);
    expect(v.buf.source).toBe("agent\n");
    await h.keys("x", "y", "z", "escape");
    expect(v.buf.source).toContain("xyz");
    await h.keys("u");
    expect(v.buf.source).toBe("agent\n"); // one u: the whole session, not just the z
  });
});

describe("review cycle 2 (TUI navigation)", () => {
  const click = (h: Harness, x: number, y: number) => {
    h.app.handleMouse({ type: "down", x, y, button: 0 });
    h.app.handleMouse({ type: "up", x, y, button: 0 });
  };
  test("wikilinks followed within their root: a name, an alias, a block, a tie picked; in source mode too (21.3)", async () => {
    const root = makeVault();
    mkdirSync(join(root, "a"));
    mkdirSync(join(root, "b"));
    writeFileSync(join(root, "a", "dup.md"), "# Dup A\n");
    writeFileSync(join(root, "b", "dup.md"), "# Dup B\n");
    writeFileSync(join(root, "target.md"), "---\naliases: [goal]\n---\n# Target\n\nfirst\n\nthe marked paragraph ^mark\n");
    writeFileSync(join(root, "a", "pic.png"), "png");
    writeFileSync(join(root, "b", "pic.png"), "png");
    writeFileSync(join(root, "wiki.md"), "# Wiki\n\n[[target]] [[goal]] [[target#^mark]] [[dup]] ![[pic.png]]\n");
    const h = await harness({ root, open: "wiki.md" });
    const links = h.app.currentLayout(h.app.view!).links;
    expect(links.map((l) => [l.text, l.status])).toEqual([["target", "resolved"], ["goal", "resolved"], ["target ^mark", "resolved"], ["dup", "ambiguous"], ["pic.png", "ambiguous"]]);
    await h.keys("tab", "enter");
    expect(h.app.view!.buf.rel).toBe("target.md");
    // Back, the cursor on the link followed: tab goes on to the next.
    await h.keys("ctrl+o", "tab", "enter");
    expect(h.app.view!.buf.rel).toBe("target.md");
    expect(h.app.messages.at(-1)!.text).toBe("[[goal]] reached target.md by an alias");
    await h.keys("ctrl+o", "tab", "enter");
    expect(h.app.view!.buf.rel).toBe("target.md");
    expect(h.app.currentLayout(h.app.view!).lines[h.app.view!.cur.row]!.src).toBe(8); // the paragraph its ^mark closes
    await h.keys("ctrl+o", "tab", "enter");
    expect((h.app.overlay as ListOverlay).title).toBe("[[dup]] matches 2 notes");
    await h.keys("escape");
    // Two attachments of a name: files, and the one picked is opened as a file link is (a picture's path copied).
    await h.keys("tab", "enter");
    expect((h.app.overlay as ListOverlay).title).toBe("[[pic.png]] matches 2 files");
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("wiki.md");
    expect(h.app.messages.at(-1)!.text).toMatch(/^attachment [ab]\/pic\.png — path copied/);
    // Source mode reads the wikilink around the cursor from the text.
    await h.keys("space", "n", "v", "g", "g", "j", "j", "l", "l", "l", "enter");
    expect(h.app.view!.buf.rel).toBe("target.md");
  });
  test("a link to a folder is resolved, and followed reveals the folder in the explorer, unfolded and focused (21.2)", async () => {
    const root = makeVault();
    writeFileSync(join(root, "folders.md"), "# Folders\n\n[the notes](notes/) and [the projects](/projects) and [nowhere](nowhere/)\n");
    const h = await harness({ root, open: "folders.md" });
    const links = h.app.currentLayout(h.app.view!).links;
    expect(links.map((l) => [l.target, l.status])).toEqual([["notes/", "resolved"], ["/projects", "resolved"], ["nowhere/", "unresolved"]]);
    await h.keys("tab", "enter");
    expect(h.app.leftView).toBe("explorer");
    expect(h.app.region).toBe("sidebar");
    expect(h.app.expanded.has("notes")).toBe(true);
    expect(h.app.explorerRows()[h.app.sidebar.selected]?.path).toBe("notes");
    expect(h.app.view?.buf.rel).toBe("folders.md"); // nothing opened in its place
  });
  test("enter follows a link in source mode and in the lens", async () => {
    for (const mode of ["v", "l"]) {
      const root = makeVault();
      writeFileSync(join(root, "s.md"), "# S\n\nSee [alpha](notes/alpha.md) and [beta](notes/beta.md).\n");
      const h = await harness({ root, open: "s.md", width: 100, height: 30 });
      const v = h.app.view!;
      await h.keys("space", "n", mode);
      h.app.moveCursor(v, { row: h.app.currentLayout(v).lines.findIndex((l) => l.srcMap && l.spans.map((x) => x.text).join("").includes("See [")), col: 0 });
      await h.keys("f", "[", "enter");
      expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    }
  });
  test("a #fragment followed in source mode finds a heading's {#id} while the note is saved", async () => {
    const root = makeVault();
    writeFileSync(join(root, "s.md"), `# S\n\nSee [go](#custom).\n\n${"filler\n\n".repeat(20)}## Setup {#custom}\n\nbody\n`);
    const h = await harness({ root, open: "s.md", width: 100, height: 20 });
    const v = h.app.view!;
    await h.keys("space", "n", "v");
    expect(v.buf.dirty).toBe(false);
    h.app.moveCursor(v, { row: h.app.currentLayout(v).lines.findIndex((l) => l.spans.map((x) => x.text).join("").includes("See [")), col: 0 });
    await h.keys("f", "[", "enter");
    expect(statusRow(h.frame())).not.toContain("no heading");
    expect(h.app.currentLayout(v).lines[v.cur.row]!.spans.map((x) => x.text).join("")).toContain("## Setup");
  });
  test("a click on blank space never follows a link: past a row's end, below the note", async () => {
    const root = makeVault();
    writeFileSync(join(root, "c.md"), "See also [alpha](notes/alpha.md)\n");
    const h = await harness({ root, open: "c.md", width: 100, height: 30, config: (c) => ((c.ui.sidebar = false), (c.ui.outline = false)) });
    h.frame();
    const pane = h.app.geometry!.panes[0]!;
    click(h, pane.x + pane.w - 5, pane.y + 20); // below the text
    expect(h.app.view!.buf.rel).toBe("c.md");
    const row = h.frame().split("\n").findIndex((r) => r.includes("See also"));
    click(h, pane.x + pane.w - 5, row); // past the row's end
    expect(h.app.view!.buf.rel).toBe("c.md");
  });
  test("the explorer and outline keep their selection when an agent adds a note or a heading", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "index.md", width: 160, height: 40 });
    h.app.showSidebar(true);
    h.app.region = "sidebar";
    h.app.expanded.add("notes");
    h.app.invalidateTree();
    h.app.sidebar.selected = h.app.explorerRows().findIndex((r) => r.path === "notes/beta.md");
    writeFileSync(join(root, "notes", "aaa.md"), "# new\n");
    h.app.applyChanges({ changes: [{ rel: "notes/aaa.md", kind: "created", isNote: true }], rescan: false });
    expect(h.app.explorerRows()[h.app.sidebar.selected]!.path).toBe("notes/beta.md");
  });
  test("repeated headings: an entry prepended above doesn't move the reader to another entry", async () => {
    const root = makeVault();
    const entry = (n: string) => `## Weather\n\n${Array.from({ length: 30 }, (_, i) => `${n} line ${i}`).join("\n\n")}\n`;
    writeFileSync(join(root, "log.md"), `# Log\n\n${entry("newer")}\n${entry("older")}`);
    const h = await harness({ root, open: "log.md", width: 100, height: 20 });
    const v = h.app.view!;
    h.app.moveCursor(v, { row: h.app.currentLayout(v).lines.findIndex((l) => l.spans.map((x) => x.text).join("").includes("newer line 20")), col: 0 });
    h.frame();
    writeFileSync(join(root, "log.md"), `# Log\n\n${entry("newest")}\n${entry("newer")}\n${entry("older")}`);
    const future = Date.now() / 1000 + 5;
    (await import("node:fs")).utimesSync(join(root, "log.md"), future, future);
    h.app.reloadBuffer(v.buf);
    h.frame();
    expect(rowText(h)).toContain("newer line 20");
  });
  test("a click clears a half-typed sequence; a tab click focuses the note", async () => {
    const h = await harness({ open: "index.md", width: 120, height: 30 });
    await h.keys("space");
    expect(h.app.pending.length).toBe(1);
    const pane = (h.frame(), h.app.geometry!.panes[0]!);
    // On the note beside the which-key window (a click on one of its entries picks it).
    click(h, pane.x + pane.w - 2, pane.y + 1);
    expect(h.app.pending.length).toBe(0);
    await h.keys("ctrl+t", "c");
    h.app.showSidebar(true);
    h.app.region = "sidebar";
    h.frame();
    const tab = h.app.geometry!.tabs[0]!;
    click(h, tab.x + 1, tab.y);
    expect(h.app.region as string).toBe("content");
  });
});


describe("review cycle 3 (TUI)", () => {
  const src = async (text: string, config?: (c: Config) => void, width = 100, height = 30) => {
    const root = makeVault();
    writeFileSync(join(root, "e.md"), text);
    const h = await harness({ root, open: "e.md", width, height, config });
    await h.keys("space", "n", "v");
    const v = h.app.view!;
    return { h, v, root, at: (row: number, col: number) => h.app.moveCursor(v, { row, col }), ex: (cmd: string) => h.keys(":", ...[...cmd].map((c) => (c === " " ? "space" : c)), "enter") };
  };
  test("operators at the edges: c2w from a word's end, dw on the last word, d3w across lines, x on an empty line", async () => {
    const a = await src("a quick fox\n");
    a.at(0, 0);
    await a.h.keys("c", "2", "w", "X", "escape");
    expect(a.v.buf.source).toBe("X fox\n");
    const b = await src("foo bar\n");
    b.at(0, 4);
    await b.h.keys("d", "w");
    expect(b.v.buf.source).toBe("foo \n");
    const c = await src("a b\nc d\n");
    c.at(0, 0);
    await c.h.keys("d", "3", "w");
    expect(c.v.buf.source).toBe("d\n");
    const d = await src("one\n\ntwo\n");
    d.at(0, 0);
    await d.h.keys("y", "y", "j", "x", "p");
    expect(d.v.buf.source).toBe("one\n\none\ntwo\n"); // x did nothing; the register still had the line
  });
  test("counts: 3gg and 5G go to that line; d} takes a last paragraph whole; J into an empty line", async () => {
    const { h, v, at } = await src("l1\nl2\nl3\nl4\nl5\nl6\n");
    at(0, 0);
    await h.keys("5", "G");
    expect(rowText(h).trim().endsWith("l5")).toBe(true);
    await h.keys("3", "g", "g");
    expect(rowText(h).trim().endsWith("l3")).toBe(true);
    const p = await src("last para\nline two\n");
    p.at(0, 0);
    await p.h.keys("d", "}");
    expect(p.v.buf.source.trim()).toBe("");
    const j = await src("\nfoo\n");
    j.at(0, 0);
    await j.h.keys("J");
    expect(j.v.buf.source).toBe("foo\n");
  });
  test(":s takes an escaped backslash, \\r as a line break; a* isn't matched twice", async () => {
    const { v, ex } = await src("a, b\naaa\n");
    await ex("s/, /\\r/");
    expect(v.buf.source).toBe("a\nb\naaa\n");
    await ex("%s/a*/-/g");
    expect(v.buf.source.split("\n")[2]).toBe("-");
    await ex("%s/$/\\\\/");
    expect(v.buf.source.split("\n")[0]).toBe("-\\");
  });
  test("incremental search goes back where it began when nothing matches; the replace count follows typing", async () => {
    const { h, v } = await src("alpha\nbeta\ngamma alpha\n");
    await h.keys("/", "g", "a", "m");
    expect(v.cur.row).toBe(2);
    await h.keys("x");
    expect(v.cur.row).toBe(0);
    await h.keys("escape", "ctrl+h", "a", "l", "p");
    expect((h.app.overlay as { replace?: { total: number } }).replace!.total).toBe(2);
  });
  test("the find row keeps room for the query in a narrow window, and shows its end", async () => {
    const h = await harness({ open: "index.md", width: 40, height: 16, config: (c) => ((c.ui.sidebar = false), (c.ui.outline = false)) });
    await h.keys("/", ...[..."abcdefghijklmnopqrstuvwxyz"]);
    const row = h.frame().split("\n").find((r) => r.includes("› "))!;
    expect(row).toContain("xyz");
    const pane = h.app.geometry!.panes[0]!;
    for (const hot of h.app.geometry!.hot.filter((x) => x.id.startsWith("findopt:"))) expect(hot.x).toBeGreaterThanOrEqual(pane.x);
  });
  test(":vs <note> and :tabnew <note> open that note; an argument a command doesn't take is said", async () => {
    const h = await harness({ open: "index.md", width: 160, height: 40 });
    await h.keys(":", ...[..."vs"], "space", ...[..."notes/alpha"], "enter");
    expect(h.app.tab!.views.map((x) => x.buf.rel)).toContain("notes/alpha.md");
    await h.keys(":", ...[..."tabnew"], "space", ...[..."notes/beta"], "enter");
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
    await h.keys(":", "w", "space", ...[..."zzqqxx"], "enter");
    expect(h.app.messages.at(-1)!.text).toContain("takes no argument");
  });
  test(":convert-links <note> from the palette previews that note's links only (20.1)", async () => {
    const root = makeVault();
    writeFileSync(join(root, "c1.md"), "[[beta]]\n");
    writeFileSync(join(root, "c2.md"), "[[beta]] too\n");
    const h = await harness({ root, open: "c1.md", width: 160, height: 40 });
    h.app.graph.build(true);
    await h.keys(":", ...[..."convert-links"], "space", ...[..."c1"], "enter");
    expect(h.app.messages.some((m) => m.text.includes("takes no argument"))).toBe(false);
    expect((h.app.overlay as ListOverlay).items.map((i) => i.label)).toEqual(["c1.md:1"]);
  });
  test("joints: a tab separator over a border is a cross", async () => {
    // Somewhere across these widths a tab's separator lands on the outline's border column.
    let checked = 0;
    for (let width = 100; width <= 160; width++) {
      const h = await harness({ open: "index.md", width, height: 12, config: (c) => (c.ui.outline = true) });
      for (const n of ["notes/alpha.md", "notes/beta.md", "crlf.md", "bom.md"]) h.app.openInNewTab(n);
      const rows = h.frame().split("\n").map((r) => [...r]);
      rows.forEach((r, y) => {
        r.forEach((ch, x) => {
          // A tee pointing down with a line above it should have been a cross.
          if ((ch === "┬" || ch === "┳") && y > 0 && "│┃┼╋├┤┣┫┬┳".includes(rows[y - 1]![x] ?? " ")) throw new Error(`${width}: ${ch} under a line at ${x},${y}`);
          if (ch === "┬" || ch === "┳") checked++;
        });
      });
    }
    expect(checked).toBeGreaterThan(0);
  }, 60000);
});

describe("review cycle 3 (config in the TUI)", () => {
  test("a typo saved mid-edit keeps the theme, keys and picked settings; :toString isn't an alias", async () => {
    const root = makeVault();
    const cfg = join(root, "user.toml");
    writeFileSync(cfg, 'theme = "nord"\n[keys]\n"leader z" = "ui.zen"\n');
    const h = await harness({ root, configFile: cfg });
    h.app.reloadConfig();
    await h.app.run("theme.set dracula");
    writeFileSync(cfg, 'theme = "nord"\n[keys\n');
    h.app.reloadConfig();
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
    h.app.reloadConfig();
    await h.keys("escape");
    expect(h.app.theme.name).toBe("nord");
  });
});

describe("review cycle 4 (TUI)", () => {
  const until = async (pred: () => boolean, ms = 4000) => {
    const end = Date.now() + ms;
    while (!pred() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
  };
  const touch = async (file: string, text: string) => {
    writeFileSync(file, text);
    const future = Date.now() / 1000 + 5;
    (await import("node:fs")).utimesSync(file, future, future);
  };
  test("a footnote with capitals is followed; [Title](#title) finds a heading with a footnote mark", async () => {
    const root = makeVault();
    writeFileSync(join(root, "f.md"), "# Title[^1]\n\nSee[^Note] here and [Title](#title).\n\n[^Note]: The note text.\n[^1]: one\n");
    const h = await harness({ root, open: "f.md", width: 100, height: 30 });
    const v = h.app.view!;
    const layout = () => h.app.currentLayout(v);
    const note = layout().links.findIndex((l) => l.kind === "footnote" && l.target.toLowerCase() === "note");
    h.app.moveCursor(v, { row: layout().links[note]!.line, col: layout().links[note]!.col });
    await h.keys("enter");
    expect(rowText(h)).toContain("The note text.");
    const title = layout().links.findIndex((l) => l.kind === "markdown" && l.target === "#title");
    h.app.moveCursor(v, { row: layout().links[title]!.line, col: layout().links[title]!.col });
    await h.keys("enter");
    expect(h.app.messages.some((m) => m.text.includes("no heading"))).toBe(false);
    expect(v.cur.row).toBe(0);
  });
  test("deleted, then recreated by an agent: :w asks instead of writing over it", async () => {
    const root = makeVault();
    const file = join(root, "d.md");
    writeFileSync(file, "mine\n");
    const h = await harness({ root, open: "d.md" });
    const v = h.app.view!;
    await h.keys("space", "n", "v", "shift+a", "!", "escape");
    rmSync(file);
    h.app.reloadBuffer(v.buf, true);
    expect(v.buf.deleted).toBe(true);
    await touch(file, "# agent's\n");
    h.app.reloadBuffer(v.buf);
    await h.keys("k"); // keep mine
    await h.keys(":", "w", "enter");
    expect(readFileSync(file, "utf8")).toBe("# agent's\n");
  });
  test("a burst of writes in one folder reloads every open note (the watcher re-reads the folder)", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md", watch: true, config: (c) => ((c.watch.debounce_ms = 30), (c.watch.poll_ms = 100)) });
    try {
      await h.keys("ctrl+w", "v");
      await h.app.run("note.open notes/beta.md");
      for (let i = 0; i < 30; i++) {
        writeFileSync(join(root, "notes", "alpha.md"), `# Alpha ${i}\n`);
        writeFileSync(join(root, "notes", "beta.md"), `# Beta ${i}\n`);
      }
      const texts = () => h.app.tab!.views.map((x) => x.buf.source).sort();
      await until(() => JSON.stringify(texts()) === JSON.stringify(["# Alpha 29\n", "# Beta 29\n"]));
      expect(texts()).toEqual(["# Alpha 29\n", "# Beta 29\n"]);
    } finally {
      h.app.quit();
    }
  });
  test("an agent's write landing right after a save is a change, not ours", async () => {
    const root = makeVault();
    const file = join(root, "r.md");
    writeFileSync(file, "start\n");
    const h = await harness({ root, open: "r.md", watch: true, config: (c) => ((c.watch.debounce_ms = 30), (c.watch.poll_ms = 100)) });
    try {
      const v = h.app.view!;
      const w = h.app.watcher!;
      const orig = w.noteOwnWrite.bind(w);
      w.noteOwnWrite = (rel, st) => {
        writeFileSync(file, "# AGENT\n"); // lands between the rename and the stamp
        orig(rel, st);
      };
      await h.keys("space", "n", "v", "shift+a", "x", "escape", "ctrl+s");
      w.noteOwnWrite = orig;
      expect(v.buf.changedOnDisk()).toBe(true);
    } finally {
      h.app.quit();
    }
  });
  test("a click resolving a conflict updates the stale list; two instances keep each other's positions", async () => {
    const root = makeVault();
    const file = join(root, "c.md");
    writeFileSync(file, "one\n");
    const h = await harness({ root, open: "c.md", width: 100, height: 30 });
    const v = h.app.view!;
    await h.keys("space", "n", "v", "shift+a", "!", "escape");
    await touch(file, "theirs\n");
    h.app.reloadBuffer(v.buf);
    h.frame();
    const load = h.app.geometry!.overlay!;
    // The first entry of the prompt, (l) load theirs.
    h.app.handleMouse({ type: "down", x: load.x + 3, y: load.listY, button: 0 });
    h.app.handleMouse({ type: "up", x: load.x + 3, y: load.listY, button: 0 });
    expect(v.buf.dirty).toBe(false);
    const { readStale } = await import("../src/core/stale.ts");
    expect(readStale(h.app.loc).map((x) => x.path)).not.toContain("c.md");
  });
  test(":s with \\r in a CRLF note keeps it CRLF; /gc and /g agree on a*", async () => {
    const root = makeVault();
    writeFileSync(join(root, "s.md"), "a, b\r\naaa\r\n");
    const h = await harness({ root, open: "s.md" });
    const v = h.app.view!;
    await h.keys("space", "n", "v", ":", ...[..."s/, /\\r/"].map((c) => (c === " " ? "space" : c)), "enter");
    expect(v.buf.source.replace(/\r\n/g, "")).not.toContain("\n");
    await h.keys("G", ":", ...[..."s/a*/X/gc"], "enter", "y");
    expect(h.app.overlay).toBeNull(); // one match asked about, as /g replaces one
    expect(v.buf.source).toBe("a\r\nb\r\nX\r\n");
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

describe("review cycle 5 (TUI, the session while running)", () => {
  test("history sees the note on screen while slipbox runs, not only after quit", async () => {
    const { loadSession } = await import("../src/core/position.ts");
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    await h.app.run("note.open notes/beta.md");
    await h.keys("j");
    const end = Date.now() + 4000;
    const current = () => {
      const s = loadSession(h.app.loc);
      return s ? s.tabs[s.activeTab]?.panes[s.tabs[s.activeTab]!.active]?.path : undefined;
    };
    while (current() !== "notes/beta.md" && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
    expect(current()).toBe("notes/beta.md");
  });
});

describe("review cycle 5 (editing against nvim)", () => {
  // Each case's expected text is what `nvim --clean` makes of the same keys (with the final newline
  // slipbox adds to a note that had none). Run in source mode and in the lens: both must agree.
  const CASES: [string, string, string[], string][] = [
    ["noeol-o", "a", ["o", "b", "<Esc>"], "a\nb\n"],
    ["noeol-Aenter", "ab", ["A", "<CR>", "x", "<Esc>"], "ab\nx\n"],
    ["noeol-jo", "x\na", ["j", "o", "b", "<Esc>"], "x\na\nb\n"],
    ["noeol-crlf", "a\r\nb", ["j", "o", "c", "<Esc>"], "a\r\nb\r\nc\r\n"],
    ["empty-o", "", ["o", "a", "<Esc>"], "\na\n"],
    ["trail-x", "line one  \n", ["$", "x"], "line one \n"],
    ["wDp", "one two\n", ["w", "D", "p"], "one two\n"],
    ["tab-lx", "\ta\n", ["l", "x"], "\t\n"],
    ["tab-llx", "a\tbc\n", ["l", "l", "x"], "a\tc\n"],
    ["diW", "a.b c\n", ["d", "i", "W"], " c\n"],
    ["daW", "a.b c\n", ["d", "a", "W"], "c\n"],
    ["diB", "f {a b} x\n", ["f", "a", "d", "i", "B"], "f {} x\n"],
    ["viwd", "a.b c\n", ["v", "i", "w", "d"], ".b c\n"],
    ["vi(d", "f(ab) x\n", ["f", "a", "v", "i", "(", "d"], "f() x\n"],
    ["d3G", "a\nb\nc\nd\n", ["d", "3", "G"], "d\n"],
    ["3dG", "a\nb\nc\nd\n", ["3", "d", "G"], "d\n"],
    ["Gd2gg", "a\nb\nc\nd\n", ["G", "d", "2", "g", "g"], "a\n"],
    ["v2jd", "a\nb\nc\nd\n", ["v", "2", "j", "d"], "\nd\n"],
    ["V2>", "a\nb\nc\n", ["V", "2", ">"], "    a\nb\nc\n"],
    ["wd}", "a b\nc\n\nd\n", ["w", "d", "}"], "a \n\nd\n"],
    ["c}", "a\nb\n\nc\n", ["c", "}", "X", "<Esc>"], "X\n\nc\n"],
    ["y}P", "a\nb\n\nc\n", ["y", "}", "G", "P"], "a\nb\n\na\nb\nc\n"],
    ["jdb", "a b\nc\n", ["j", "d", "b"], "a \nc\n"],
    ["d}last", "a\n\nb\n", ["j", "j", "d", "}"], "a\n\n\n"],
    ["da\"", "x \"a b\" y\n", ["f", "a", "d", "a", "\""], "x y\n"],
    ["dap-last", "a\n\nb\nc\n", ["G", "d", "a", "p"], "a\n"],
    ["ci(ml", "f(\n  a\n)\n", ["j", "c", "i", "b", "X", "<Esc>"], "f(\n  X\n)\n"],
    ["vjyP", "ab\ncd\n", ["v", "j", "y", "P"], "ab\ncab\ncd\n"],
    ["Vjyp", "ab\ncd\nef\n", ["V", "j", "y", "p"], "ab\nab\ncd\ncd\nef\n"],
    ["3dl", "abc\n", ["3", "d", "l"], "\n"],
    ["d3l", "abc\n", ["d", "3", "l"], "\n"],
    ["cu-typed", "ab cd\n", ["A", "X", "Y", "<C-u>", "<Esc>"], "ab cd\n"],
    ["lensG", "# T\n\n- a\n- b\n- c\n\nx\nlast\n", ["G", "d", "d"], "# T\n\n- a\n- b\n- c\n\nx\n"],
    ["lensdG", "# T\n\n- a\n- b\n- c\n\nx\nlast\n", ["j", "j", "d", "G"], "# T\n\n"],
    ["lensGi", "# T\n\n- a\n- b\n- c\n\nx\nlast\n", ["G", "i", "Z", "<Esc>"], "# T\n\n- a\n- b\n- c\n\nx\nZlast\n"],
    // An operator's f / t takes a digit as its character, not as a count.
    ["df1", "abc 123 x\n", ["d", "f", "1"], "23 x\n"],
    ["dt1", "abc 123 x\n", ["d", "t", "1"], "123 x\n"],
    ["ct3", "abc 123 x\n", ["c", "t", "3", "Z", "<Esc>"], "Z3 x\n"],
    // D with a count past the last line: to the last line's end, its line break kept; from the
    // last line, nothing.
    ["5D-mid", "a\nxb\nc\n", ["j", "l", "5", "D"], "a\nx\n"],
    ["5D-last", "a\nb\n", ["j", "5", "D"], "a\nb\n"],
  ];
  const SPECIAL: Record<string, string> = { "<Esc>": "escape", "<C-u>": "ctrl+u", "<C-w>": "ctrl+w", "<CR>": "enter", "<BS>": "backspace" };
  const key = (t: string) => SPECIAL[t] ?? (t === " " ? "space" : /^[A-Z]$/.test(t) ? `shift+${t.toLowerCase()}` : t);
  for (const mode of ["v", "l"] as const) {
    test(`${mode === "v" ? "source mode" : "the lens"}: ${CASES.length} cases agree with nvim`, async () => {
      const wrong: string[] = [];
      for (const [id, input, keys, want] of CASES) {
        const root = makeVault();
        writeFileSync(join(root, "v.md"), input);
        const h = await harness({ root, open: "v.md", width: 200, height: 40 });
        await h.keys("space", "n", mode);
        for (const k of keys) await h.keys(key(k));
        const got = h.app.view!.buf.source;
        if (got !== want) wrong.push(`${id}: ${JSON.stringify(got)} (nvim ${JSON.stringify(want)})`);
      }
      expect(wrong).toEqual([]);
    }, 60_000);
  }
});

describe("review cycle 5 (vim edges)", () => {
  test(":2,3s says which ranges :s takes; ctrl+u stops at the insert's start; the lens's G is the last line", async () => {
    const root = makeVault();
    writeFileSync(join(root, "r.md"), "a\nb\nc\n");
    const h = await harness({ root, open: "r.md" });
    const v = h.app.view!;
    await h.keys("space", "n", "v", ":", ..."2,3s/b/X/", "enter");
    expect(v.buf.source).toBe("a\nb\nc\n");
    expect(h.app.messages.some((m) => m.text.includes("'<,'>"))).toBe(true);
    await h.keys("shift+a", "Y", "Z", "ctrl+u", "escape");
    expect(v.buf.source).toBe("a\nb\nc\n");
    writeFileSync(join(root, "l.md"), "# T\n\n- a\n- b\n\nx\nlast\n");
    const l = await harness({ root, open: "l.md" });
    await l.keys("space", "n", "l", "shift+g", "d", "d");
    expect(l.app.view!.buf.source).toBe("# T\n\n- a\n- b\n\nx\n");
  });
});

describe("review cycle 5 (TUI, behaviour no test had pinned)", () => {
  const LINKS = "# M\n\n[to alpha](notes/alpha.md) [two](notes/alpha.md#section-two) [far](#far) [broken](nope.pdf)\n\nfiller\n\n## Far\n\nend\n";
  const follow = async (h: Harness, k: number) => {
    const v = h.app.view!;
    const l = h.app.currentLayout(v).links[k]!;
    h.app.moveCursor(v, { row: l.line, col: l.col });
    await h.keys("enter");
  };
  const at = (h: Harness) => ({ rel: h.app.view!.buf.rel, row: rowText(h).trim() });
  test("markdown links and heading anchors are followed to the place", async () => {
    const root = makeVault();
    writeFileSync(join(root, "m.md"), LINKS);
    const h = await harness({ root, open: "m.md", width: 160, height: 40 });
    const back = async () => {
      await h.app.run("history.back");
      expect(h.app.view!.buf.rel).toBe("m.md");
    };
    await follow(h, 0);
    expect(at(h).rel).toBe("notes/alpha.md");
    await back();
    await follow(h, 1);
    expect(at(h)).toMatchObject({ rel: "notes/alpha.md", row: expect.stringContaining("Section Two") });
    await back();
    await follow(h, 2);
    expect(at(h)).toMatchObject({ rel: "m.md", row: expect.stringContaining("Far") });
    await h.app.run("history.back");
    await follow(h, 3);
    expect(h.app.view!.buf.rel).toBe("m.md"); // a broken link opens nothing…
    expect(h.app.messages.some((m) => m.text.includes("nope.pdf"))).toBe(true); // …and says so
  });
  test("in source mode the markdown link under the cursor is followed too", async () => {
    const root = makeVault();
    writeFileSync(join(root, "m.md"), LINKS);
    const h = await harness({ root, open: "m.md", width: 160, height: 40 });
    await h.keys("space", "n", "v", "j", "j", "l", "l", "enter");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
  });
  test("counts move by that many (5j, 3w); insert's tab, shift+tab, up and down", async () => {
    const root = makeVault();
    writeFileSync(join(root, "c.md"), "a b c d e\n1\n2\n3\n4\n5\n6\n");
    const h = await harness({ root, open: "c.md" });
    const v = h.app.view!;
    await h.keys("space", "n", "v", "3", "w");
    expect(v.cur.col).toBe(6);
    await h.keys("5", "j");
    expect(rowText(h)).toBe("5");
    await h.keys("i", "tab");
    expect(v.buf.source.split("\n")[5]).toBe("  5");
    await h.keys("shift+tab", "up", "x", "down", "down", "y", "escape");
    expect(v.buf.source).toBe("a b c d e\n1\n2\n3\nx4\n5\n6y\n"); // down keeps the goal column
  });
  test(":e! reverts, :w! writes over a change on disk, :noh clears the highlights", async () => {
    const root = makeVault();
    const file = join(root, "e.md");
    writeFileSync(file, "one\n");
    const h = await harness({ root, open: "e.md" });
    const v = h.app.view!;
    const ex = (s: string) => h.keys(":", ...[...s].map((c) => (c === " " ? "space" : c === "!" ? "!" : c)), "enter");
    await h.keys("space", "n", "v", "shift+a", "X", "escape");
    await ex("e!");
    expect(v.buf.source).toBe("one\n");
    expect(v.buf.dirty).toBe(false);
    await h.keys("shift+a", "Y", "escape");
    writeFileSync(file, "theirs\n");
    const t = Date.now() / 1000 + 5;
    (await import("node:fs")).utimesSync(file, t, t);
    await ex("w!");
    expect(readFileSync(file, "utf8")).toBe("oneY\n");
    await h.keys("/", "o", "n", "e", "enter");
    expect(v.find?.matches.length).toBeGreaterThan(0);
    await ex("noh");
    expect(v.find?.matches.length ?? 0).toBe(0);
  });
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
    const scratch = h.app.scratch().path;
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
  test("with no note named and no session, the vault's home note opens", async () => {
    const h = await harness({});
    expect(h.app.view?.buf.rel).toBe("index.md");
  });
});

describe("review cycle 5 (TUI journeys: the mouse)", () => {
  test("a double-click on a link follows it once: nothing in the note it opens is clicked or copied", async () => {
    const h = await harness({ open: "index.md", width: 130, height: 34 });
    const v = h.app.view!;
    const l = h.app.currentLayout(v).links.find((x) => x.kind === "markdown" && x.target === "notes/alpha.md")!;
    const pane = h.app.geometry!.panes[0]!;
    const x = pane.textX + l.col + 1;
    const y = pane.y + l.line - v.top;
    for (let k = 0; k < 2; k++) {
      h.app.handleMouse({ type: "down", x, y, button: 0 });
      h.app.handleMouse({ type: "up", x, y, button: 0 });
      await Bun.sleep(5);
    }
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    expect(h.copied).toEqual([]);
    expect(h.app.view!.sel).toBeNull();
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
    h.app.handleMouse({ type: "move", x: last.x, y: last.y, button: 0 });
    h.frame();
    expect(h.canvas().rows[last.y]![border]).toBe("│");
  });
});

describe("review cycle 5 (TUI journeys: a drag in source)", () => {
  test("a drag in source mode is a visual selection: x deletes it, esc leaves it", async () => {
    const root = makeVault();
    writeFileSync(join(root, "d.md"), "alpha beta gamma\n");
    const h = await harness({ root, open: "d.md" });
    await h.keys("space", "n", "v");
    const pane = h.app.geometry!.panes[0]!;
    const y = pane.y + h.app.view!.cur.row - h.app.view!.top;
    h.app.handleMouse({ type: "down", x: pane.textX + 6, y, button: 0 });
    h.app.handleMouse({ type: "drag", x: pane.textX + 9, y, button: 0 }); // "beta", its last letter included
    h.app.handleMouse({ type: "up", x: pane.textX + 9, y, button: 0 });
    expect(h.app.view!.visual).toBe("char");
    await h.keys("x");
    expect(h.app.view!.buf.source).toBe("alpha  gamma\n");
    expect(h.app.view!.sel).toBeNull();
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
    h.app.reloadBuffer(v.buf);
    await h.keys("k"); // keep mine
    expect(v.buf.conflictKept).toBe(true);
    const status = statusRow(h.frame());
    expect(status).toMatch(/L\d+:\d+/);
    expect(status).toContain("logbook");
    expect(status).toContain("⚠");
  });
});

describe("review cycle 5 (TUI journeys: the lens after a reload)", () => {
  test("loading theirs under a tall lens at the note's end: the top stays in range, never past 100%", async () => {
    const rel = "samples/scratch/broken-frontmatter.md";
    const bad: string[] = [];
    for (const paras of [1, 2, 4]) {
      for (const at of [0, 1, 2]) {
        for (const keep of ["l", "m"]) {
          const root = makeVault();
          const h = await harness({ root, open: rel, width: 40, height: 12, config: (c) => ((c.ui.sidebar = false), (c.ui.outline = false)) });
          const v = h.app.view!;
          await h.keys("space", "n", "l", "shift+g", "k", "x");
          const file = join(root, rel);
          const text = readFileSync(file, "utf8");
          // After the at-th blank line: paragraphs long enough to wrap at this width.
          let i = -2;
          for (let k = 0; k <= at; k++) i = text.indexOf("\n\n", i + 2);
          i = i < 0 ? text.length : i + 2;
          const add = Array.from({ length: paras }, (_, k) => `An agent's paragraph ${k}, long enough to wrap twice at forty columns.\n\n`).join("");
          writeFileSync(file, text.slice(0, i) + add + text.slice(i));
          const t = Date.now() / 1000 + 5;
          (await import("node:fs")).utimesSync(file, t, t);
          h.app.reloadBuffer(v.buf);
          await h.keys(keep); // load theirs, or merge
          const status = statusRow(h.frame());
          const pct = Number(/(\d+)%/.exec(status)?.[1] ?? 0);
          const shown = h.app.screenRows(v, h.app.currentLayout(v)).length;
          if (pct > 100 || shown < v.height) bad.push(`${paras}/${at}/${keep}: ${status.trim()} (${shown} rows of ${v.height})`);
        }
      }
    }
    expect(bad).toEqual([]);
  }, 60_000);
});

describe("review cycle 5 (TUI journeys: a resize round trip)", () => {
  const drawAt = (h: Harness, w: number, ht: number) => h.app.draw(new TextCanvas(w, ht));
  test("the window's top comes back to the same row: a wrapped paragraph's, a table's", async () => {
    const h = await harness({ open: "samples/logs/observing-log-2026.md", width: 130, height: 36 });
    const v = h.app.view!;
    for (const start of [0, 7, 19, 33, 51]) {
      h.app.scrollBy(v, start - v.top, false);
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
    const paths = () => h.app.explorerRows().map((r) => r.path);
    h.app.expanded.add("cfg");
    h.app.invalidateTree();
    expect(paths()).toContain("cfg/app.toml");
    expect(paths()).not.toContain("run.py");
    const row = h.app.explorerRows().find((r) => r.path === "cfg/app.toml")!;
    expect(row.group).toBe("data");
    expect(h.frame()).toContain("app.toml"); // shown with its extension
    await h.keys("a");
    expect(paths()).toContain("run.py");
    expect(paths()).not.toContain("blob.dat");
    await h.keys("a");
    expect(paths()).not.toContain("run.py");
  });
  test("a code file opens in source mode, highlighted, and has no render; a note after it renders", async () => {
    const h = await harness({ root: await setup() });
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
    await h.keys("space", "n", "v"); // toggling off source: refused
    expect(v.source).toBe(true);
    expect(h.app.messages.at(-1)!.text).toContain("no rendered view");
    await h.app.run("history.back");
    expect(v.buf.rel).toBe("links-out.md");
    expect(v.source).toBe(false); // the note renders again
  });
  test("the background index parses a big note on other threads: no slice of it holds the keys for long (15.1)", async () => {
    const root = makeVault();
    const h = await harness({ root });
    // Written after the harness's first build, with words of its own: no parse of it is cached anywhere.
    const own = randomBytes(6).toString("hex");
    writeFileSync(join(root, "notes", "big.md"), Array.from({ length: 40_000 }, (_, i) => `Line ${i} ${own} with [a link](alpha.md) and words enough.\n`).join("\n"));
    h.app.graph.build(true, "lazy"); // every note unparsed, as at a cold start
    expect(h.app.graph.pendingCount).toBeGreaterThan(1);
    // Each piece of the pass the main thread does, timed: the slices, and a big note's chunks put together.
    const g = h.app.graph;
    const slices: number[] = [];
    const parseSome = g.parseSome.bind(g);
    g.parseSome = (ms, skip) => {
      const t = performance.now();
      const left = parseSome(ms, skip);
      slices.push(performance.now() - t);
      return left;
    };
    const entry = g.entry.bind(g);
    g.entry = (rel, chunks) => {
      const t = performance.now();
      const e = entry(rel, chunks);
      if (chunks) slices.push(performance.now() - t);
      return e;
    };
    h.app.indexInBackground();
    for (let i = 0; i < 400 && h.app.indexing; i++) await Bun.sleep(50);
    expect(h.app.indexing).toBe(0);
    expect(g.backlinks("notes/alpha.md").filter((b) => b.from === "notes/big.md")).toHaveLength(40_000);
    expect(Math.max(...slices)).toBeLessThan(250); // parsed here whole, the big note alone takes seconds
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
    await h.keys("space", "n", "v", "G", "o", "w", "r", "a", "p", "space", "=", "space", "t", "r", "u", "e", "escape", "ctrl+s");
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
    // A symlink in the vault leading out of it isn't a file of the vault: nothing outside is read
    // through it (the CLI refuses it too). One leading to a note inside opens.
    const outside = join(mkdtempSync(join(tmpdir(), "slipbox-outside-")), "secret.md");
    writeFileSync(outside, "# Secret\n");
    symlinkSync(outside, join(root, "out.md"));
    symlinkSync(join(root, "links-out.md"), join(root, "in.md"));
    expect(h.app.buffer("out.md")).toBeNull();
    expect(h.app.messages.at(-1)!.text).toBe("out.md points outside the root; not opening it");
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
  const TOML = '# app settings\ntheme = "nord"   # the default\n\n[editor]\ncommand = "nvim"\nautosave_ms = 30000\n\n[ui]\nwrap = true\n';
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
    await h.keys("shift+a", "0", "escape");
    expect(v.live).toBe(true);
    expect(v.buf.source).toContain("autosave_ms = 300000\n");
    // Break it: an unclosed string. Mid-typing the lens stays; leaving insert, source mode.
    await h.keys("shift+a", "space", "x", "=", "space", "\"");
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

describe("source files through tree-sitter (16.6–16.9)", () => {
  const TS = 'export class Box {\n  open(): void {}\n}\n\nfunction wrap(x: number) {\n  const s = `one\ntwo ${x}\nthree`;\n  return s;\n}\n';
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
    const h = await harness({ root, open: "box.ts", width: 100 });
    const v = h.app.view!;
    expect(v.source).toBe(true);
    await settle(h);
    const layout = h.app.currentLayout(v);
    expect(layout.headings.map((x) => [x.level, x.text])).toEqual([[1, "Box"], [2, "open"], [1, "wrap"]]);
    const two = layout.lines.find((l) => l.src === 7)!; // `two ${x}`: highlight.js alone can't tell
    expect(two.spans.find((s) => s.text.includes("two"))!.role).toBe("syn_string");
    h.app.moveCursor(v, { row: layout.lines.findIndex((l) => l.src === 3), col: 0 });
    h.app.moveCursor(v, { row: 1, col: 2 });
    expect(h.frame()).toMatch(/Box\s*›\s*open/);
  });
  test("a syntax error is marked out of insert, with the status line saying what", async () => {
    const root = makeVault();
    writeFileSync(join(root, "bad.py"), "def f(:\n    pass\n\nx = 1\n");
    const h = await harness({ root, open: "bad.py", width: 100 });
    await settle(h);
    const errs = h.app.view!.buf.syntax!.errors;
    expect(errs.length).toBeGreaterThan(0);
    const marked = (c: TextCanvas) => c.styles.some((r) => r.some((st) => st?.underline && st.fg !== "default"));
    expect(marked(h.canvas())).toBe(true);
    expect(statusRow(h.frame())).toMatch(/✖ (1 syntax error|syntax error|missing)/);
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

describe("the explorer: no fence at the root (17.14)", () => {
  /** A folder of roots: a notes root, a repository, a plain folder, a loose note and a picture. */
  const place = () => {
    const P = mkdtempSync(join(sandbox, "place-"));
    mkdirSync(join(P, "notes", ".slipbox"), { recursive: true });
    mkdirSync(join(P, "notes", "sub"));
    writeFileSync(join(P, "notes", "a.md"), "# A\n");
    writeFileSync(join(P, "notes", "data.json"), "{}\n");
    writeFileSync(join(P, "notes", "script.py"), "print(1)\n");
    writeFileSync(join(P, "notes", "sub", "b.md"), "# B\n");
    mkdirSync(join(P, "code", ".git"), { recursive: true });
    writeFileSync(join(P, "code", "main.ts"), "export {};\n");
    mkdirSync(join(P, "loose"));
    writeFileSync(join(P, "loose", "x.md"), "# X\n");
    writeFileSync(join(P, "readme.md"), "# Readme\n");
    writeFileSync(join(P, "pic.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]));
    return P;
  };
  const shown = (h: Harness) => h.app.explorerRows().map((r) => `${"  ".repeat(r.depth)}${r.name}${r.root?.here ? " (here)" : r.kind === "root" && r.path !== ".." ? " (root)" : ""}`);
  const select = async (h: Harness, name: string) => {
    h.app.sidebar.selected = h.app.explorerRows().findIndex((r) => r.name === name);
    h.app.region = "sidebar";
  };

  test("files.show auto: notes and data files in a notes root, every text file in a repository", async () => {
    const P = place();
    const h = await harness({ root: join(P, "notes"), open: "a.md", config: (c) => (c.files.show = DEFAULT_CONFIG.files.show) });
    expect(DEFAULT_CONFIG.files.show).toBe("auto");
    expect(h.app.filesShown()).toBe("renderable");
    expect(shown(h)).toEqual(["..", "sub", "a.md", "data.json"]);
    const code = await harness({ root: join(P, "code"), open: null, config: (c) => (c.files.show = DEFAULT_CONFIG.files.show) });
    expect(code.app.filesShown()).toBe("all");
    expect(shown(code)).toEqual(["..", "main.ts"]);
  });

  test("..: up a folder, past the root — its tree kept under it, marked; another root's file opened switches into it", async () => {
    const P = place();
    const h = await harness({ root: join(P, "notes"), open: "a.md", config: (c) => (c.files.show = "auto") });
    await select(h, "..");
    await h.keys("enter");
    expect(h.app.explorerTop).toBe(P);
    expect(h.app.loc.root).toBe(join(P, "notes")); // the root open is still this one
    // A level at a time: the folders (roots by their icon), then the files; the root open unfolded, marked.
    expect(shown(h)).toEqual(["..", "code (root)", "loose", "notes (here)", "  sub", "  a.md", "  data.json", "readme.md"]);
    expect(h.app.explorerRows()[h.app.sidebar.selected]!.name).toBe("notes");
    h.app.region = "content"; // not drawn selected
    const c = h.canvas();
    const list = h.app.geometry!.sidebar!;
    const y = list.y + h.app.explorerRows().findIndex((r) => r.root?.here) - h.app.sidebar.scroll;
    const x = [...c.toString().split("\n")[y]!].join("").indexOf("notes");
    expect(c.styles[y]![x]!.fg).toBe(h.app.theme.roles.sidebar_active.fg!);
    // A plain folder unfolds a level; its note opens beside this root's (it has none of its own).
    await select(h, "loose");
    await h.keys("l");
    expect(shown(h)).toContain("  x.md");
    expect(h.app.explorerItem()).toBeNull(); // nothing of this root's to rename or delete
    // Another root unfolds like a folder; its file, opened, switches into it — the explorer staying put.
    await select(h, "code");
    await h.keys("enter");
    expect(shown(h)).toContain("  main.ts");
    await select(h, "main.ts");
    await h.keys("enter");
    expect(h.app.loc.root).toBe(join(P, "code"));
    expect(h.app.view!.buf.abs).toBe(join(P, "code", "main.ts"));
    expect(h.app.explorerTop).toBe(P);
    expect(shown(h)).toEqual(["..", "code (here)", "  main.ts", "loose", "notes (root)", "readme.md"]);
    // h and l fold and unfold the root open; enter takes the explorer back down to it.
    await select(h, "code");
    await h.keys("h");
    expect(shown(h)).toEqual(["..", "code (here)", "loose", "notes (root)", "readme.md"]);
    await h.keys("l");
    expect(shown(h)).toContain("  main.ts");
    await h.keys("enter");
    expect(h.app.explorerTop).toBe(join(P, "code"));
    // The root opened on stays one of the explorer's roots, under the tree (20.15).
    expect(shown(h).slice(0, 2)).toEqual(["..", "main.ts"]);
    expect(h.app.explorerRows().slice(2).map((r) => [r.root?.abs, r.root?.other])).toEqual([[join(P, "notes"), true]]);
  });

  test("it starts at the folder slipbox was opened on; .. climbs to the root, the folder unfolded; / has no ..", async () => {
    const P = place();
    const h = await harness({ root: join(P, "notes"), open: null, folder: join(P, "notes", "sub") });
    expect(h.app.explorerTop).toBe(join(P, "notes", "sub"));
    expect(shown(h)).toEqual(["..", "b.md"]);
    await select(h, "..");
    await h.keys("enter");
    expect(h.app.explorerTop).toBe(join(P, "notes"));
    expect(shown(h)).toEqual(["..", "sub", "  b.md", "a.md", "data.json"]);
    expect(h.app.explorerRows()[h.app.sidebar.selected]!.name).toBe("sub");
    // `/` (and `~`): listed a level at a time, never walked; nothing above it.
    h.app.setExplorerTop("/");
    const rows = h.app.explorerRows();
    expect(rows[0]!.name).not.toBe("..");
    expect(rows.every((r) => r.depth === 0 || r.root?.other)).toBe(true);
  });
});

describe("the explorer shows extensions", () => {
  test("notes' names keep .md, as other files keep theirs", async () => {
    const root = makeVault();
    writeFileSync(join(root, "app.toml"), "a = 1\n");
    const h = await harness({ root });
    for (let i = 0; i < 3 && h.app.region !== "sidebar"; i++) await h.keys("space", "e");
    const f = h.frame();
    expect(f).toContain(" index.md");
    expect(f).toContain(" app.toml");
    expect(f).not.toMatch(/ index\s*┃/); // never the bare name
  });
});

describe("YAML and JSON as a tree (16.12)", () => {
  test("guides at every depth; branches in the outline and breadcrumb; a $ref's JSON pointer followed", async () => {
    const root = makeVault();
    writeFileSync(join(root, "deploy.yaml"), "service: nightjar\ncontainers:\n  - name: api\n    health:\n      path: /v2/health\n      probe: {interval_s: 10}\n  - name: backup\nports: [8080]\n");
    writeFileSync(join(root, "api.json"), '{\n  "paths": {\n    "/f": { "$ref": "#/components/schemas/Frame" }\n  },\n  "components": {\n    "schemas": {\n      "Other": { "type": "string" },\n      "Frame": { "type": "object" }\n    }\n  }\n}\n');
    const h = await harness({ root, open: "deploy.yaml", width: 100 });
    const v = h.app.view!;
    const f = h.frame();
    expect(f).toMatch(/ containers\n.*├─ 1\n.*│  ├─ name  api/);
    expect(f).toMatch(/│  └─ health\n.*│     ├─ path   \/v2\/health/);
    expect(f).toMatch(/ ports\s+\[8080\]/); // a top-level key after the nested ones: at the top again
    expect(h.app.currentLayout(v).headings.map((x) => [x.level, x.text])).toEqual([[1, "containers"], [2, "1"], [3, "health"], [2, "2"]]);
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
    writeFileSync(join(root, "Card.vue"), '<template>\n  <h2 id="card">const</h2>\n</template>\n<script setup lang="ts">\nconst n = 1;\nfunction go(): void {}\n</script>\n<style>\n.a { color: red; }\n</style>\n');
    const h = await harness({ root, open: "Card.vue", width: 100 });
    const v = h.app.view!;
    // Its grammar and its parts' (TypeScript, CSS) load first: until then, markup throughout.
    for (let i = 0; i < 200 && v.buf.syntax?.version !== v.buf.version; i++) {
      h.frame();
      await Bun.sleep(10);
    }
    expect(h.app.outlineRows().map((r) => `${r.level}:${r.text}`)).toEqual(["1:template", "2:const", "1:script setup lang=\"ts\"", "2:go", "1:style", "2:.a"]);
    expect([...v.buf.syntax!.languages]).toEqual([[5, "typescript"], [6, "typescript"], [9, "css"]]);
    const role = (line: number, word: string) => h.app.currentLayout(v).lines.find((l) => l.src === line)!.spans.find((sp) => sp.text.includes(word))?.role;
    expect(role(5, "const")).toBe("syn_keyword"); // the script's line, as TypeScript
    expect(role(2, "const")).not.toBe("syn_keyword"); // the template's text, as markup
  });
});

describe("links in code comments in the TUI (16.10)", () => {
  test("a comment's path is drawn as a link; enter opens it, `path:line` at that line", async () => {
    const root = makeVault();
    writeFileSync(join(root, "lib.py"), "a = 1\nb = 2\nc = 3\n");
    writeFileSync(join(root, "run.py"), "# see lib.py:3 and notes/alpha.md\nx = 1\n");
    const h = await harness({ root, open: "run.py", width: 100 });
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
describe("the lens on a CSV (16.14)", () => {
  test("a few rows around the cursor, never the whole table; sliding a row at a time", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "samples/logs/photometry-2026.csv", width: 140, height: 40 });
    const v = h.app.view!;
    const lens = () => /source · lines? (\d+(?:–\d+)?)/.exec(h.frame())?.[1] ?? "none";
    h.app.moveCursor(v, { row: h.app.currentLayout(v).lines.findIndex((l) => l.src === 10), col: 2 });
    await h.keys("space", "n", "l");
    expect(lens()).toBe("8–13"); // lens_min_rows of records, not 2,601 lines
    await h.keys("j", "j", "j", "j");
    expect(lens()).toBe("9–14"); // the cursor past its end: one row in, one out
    await h.keys("j");
    expect(lens()).toBe("10–15");
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

describe("the lens's modes and size", () => {
  const NOTE = Array.from({ length: 12 }, (_, i) => `Paragraph ${i + 1}.`).join("\n\n") + "\n";
  const lensLabel = (h: Harness) => /(source|editing) · lines? (\d+(?:–\d+)?)/.exec(h.frame())?.slice(1).join(" ") ?? "none";
  test("the rule says view or editing, in its own colour", async () => {
    const root = makeVault();
    writeFileSync(join(root, "p.md"), NOTE);
    const h = await harness({ root, open: "p.md", width: 80 });
    await h.keys("space", "n", "l");
    expect(lensLabel(h)).toMatch(/^source /);
    const ruleColour = () => {
      const c = h.canvas();
      const y = c.rows.findIndex((r) => r.join("").includes(" · line"));
      return c.styles[y]![c.line(y).indexOf("━")]!.fg;
    };
    const viewing = ruleColour();
    await h.keys("i");
    expect(lensLabel(h)).toMatch(/^editing /);
    expect(ruleColour()).not.toBe(viewing);
    await h.keys("escape");
    expect(lensLabel(h)).toMatch(/^source /);
  });
  test("+ and - size it by a block, the size kept as it moves; = lets it size itself", async () => {
    const root = makeVault();
    writeFileSync(join(root, "p.md"), NOTE);
    const h = await harness({ root, open: "p.md", width: 80, height: 40 });
    await h.keys("space", "n", "l");
    const first = lensLabel(h);
    await h.keys("+");
    expect(lensLabel(h)).not.toBe(first);
    const grown = lensLabel(h).split(" ")[1]!;
    const size = (r: string) => { const [a, b] = r.split("–").map(Number); return (b ?? a!) - a! + 1; };
    await h.keys("-", "-");
    const shrunk = lensLabel(h).split(" ")[1]!;
    expect(size(shrunk)).toBeLessThan(size(grown));
    // Moving past its end: the same size, further down.
    for (let i = 0; i < 12; i++) await h.keys("j");
    const moved = lensLabel(h).split(" ")[1]!;
    expect(size(moved)).toBe(size(shrunk));
    expect(moved).not.toBe(shrunk);
    await h.keys("=");
    expect(h.app.view!.lensSize).toBeUndefined();
    await h.keys("escape");
    await h.keys("+");
    expect(h.app.messages.at(-1)!.text).toContain("isn't open");
  });
  test("on a CSV, + takes a record more and the lens slides at that size", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "samples/logs/photometry-2026.csv", width: 140, height: 40 });
    const v = h.app.view!;
    h.app.moveCursor(v, { row: h.app.currentLayout(v).lines.findIndex((l) => l.src === 10), col: 2 });
    await h.keys("space", "n", "l", "+");
    expect(lensLabel(h)).toBe("source 8–14");
    await h.keys("j", "j", "j", "j", "j");
    expect(lensLabel(h)).toBe("source 9–15");
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
    expect(again.app.tabs.filter((t) => t.pinned).map((t) => t.views[0]!.buf.rel)).toEqual(["notes/beta.md", "crlf.md"]);
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
    const { countWords } = await import("../src/core/words.ts");
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
  test(":wa saves every changed note; g; g, walk the changes; gi types where the last insert ended", async () => {
    const root = makeVault();
    writeFileSync(join(root, "c.md"), "line one\nline two\nline three\nline four\n");
    const h = await harness({ root, open: "c.md" });
    await h.keys("space", "n", "v", "g", "g", "A", "!", "escape", "G", "A", "?", "escape");
    await h.app.run("note.open notes/alpha.md");
    await h.keys("space", "n", "v", "A", "#", "escape");
    await h.app.run("note.save_all");
    expect(readFileSync(join(root, "c.md"), "utf8")).toBe("line one!\nline two\nline three\nline four?\n");
    expect(readFileSync(join(root, "notes", "alpha.md"), "utf8")).toContain("#");
    await h.app.run("history.back");
    const v = h.app.view!;
    const line = () => h.app.currentLayout(v).lines[v.cur.row]!.src;
    await h.keys("g", "g");
    await h.keys("g", ";");
    expect(line()).toBe(4); // the newest change
    await h.keys("g", ";");
    expect(line()).toBe(1);
    await h.keys("g", ",");
    expect(line()).toBe(4);
    await h.keys("g", "g", "g", "i", "x", "escape");
    expect(v.buf.source).toContain("line four?x");
  });
  test("alt+shift+up/down move the line, or V's lines, as one undo step; from the render too", async () => {
    const root = makeVault();
    writeFileSync(join(root, "m.md"), "a\nb\nc\nd\n");
    const h = await harness({ root, open: "m.md" });
    const v = h.app.view!;
    await h.keys("j"); // rendered: a one-paragraph note, its first row
    await h.app.run("view.source");
    await h.keys("j", "alt+shift+down");
    expect(v.buf.source).toBe("a\nc\nb\nd\n");
    await h.keys("alt+shift+up", "alt+shift+up");
    expect(v.buf.source).toBe("b\na\nc\nd\n");
    await h.keys("alt+shift+up"); // at the top: nothing
    expect(v.buf.source).toBe("b\na\nc\nd\n");
    await h.keys("shift+v", "j", "alt+shift+down", "alt+shift+down");
    expect(v.buf.source).toBe("c\nd\nb\na\n");
    expect(v.visual).toBe("line"); // still selected, lines b and a
    await h.keys("escape", "u");
    expect(v.buf.source).toBe("c\nb\na\nd\n"); // one step undone
    await h.app.run("view.source"); // back to the render: the key switches to editing first
    expect(v.source).toBe(false);
    await h.keys("alt+shift+down");
    expect(v.source || v.live).toBe(true);
  });
});

describe("the key map as agreed (vim first, desktop editors' ctrl keys, space for the rest)", () => {
  const long = () => {
    const root = makeVault();
    writeFileSync(join(root, "long.md"), Array.from({ length: 80 }, (_, i) => `Line ${i + 1}.`).join("\n\n") + "\n");
    return root;
  };
  test("H M L: the screen's top, middle and bottom rows; zz zt zb scroll the cursor's line there", async () => {
    const h = await harness({ root: long(), open: "long.md", height: 30 });
    const v = h.app.view!;
    await h.keys("ctrl+d", "ctrl+d", "ctrl+d"); // far enough down for zb to have room above
    const rows = h.app.screenRows(v, h.app.currentLayout(v));
    await h.keys("shift+h");
    expect(v.cur.row).toBeGreaterThanOrEqual(rows[0]!);
    expect(v.cur.row).toBeLessThan(rows[0]! + 5); // scrolloff rows in
    await h.keys("shift+l");
    expect(v.cur.row).toBeLessThanOrEqual(rows.at(-1)!);
    expect(v.cur.row).toBeGreaterThan(rows.at(-1)! - 5);
    await h.keys("shift+m");
    expect(Math.abs(v.cur.row - rows[Math.floor((rows.length - 1) / 2)]!)).toBeLessThanOrEqual(1);
    const row = v.cur.row;
    // zt and zb keep the scrolloff rows (3) to the edge, so H and L stay on the cursor's row.
    const at = () => h.app.screenRows(v, h.app.currentLayout(v)).indexOf(row);
    await h.keys("z", "t");
    expect(at()).toBe(3);
    await h.keys("shift+h");
    expect(v.cur.row).toBe(row);
    await h.keys("z", "b");
    expect(at()).toBe(h.app.screenRows(v, h.app.currentLayout(v)).length - 1 - 3);
    await h.keys("shift+l");
    expect(v.cur.row).toBe(row);
    await h.keys("z", "z");
    const shown = h.app.screenRows(v, h.app.currentLayout(v));
    expect(Math.abs(shown.indexOf(row) - Math.floor((shown.length - 1) / 2))).toBeLessThanOrEqual(1);
  });
  test("go to line: ctrl+g asks, :42 goes; ctrl+z undoes, ctrl+y redoes; ctrl+e toggles source", async () => {
    const h = await harness({ root: long(), open: "long.md" });
    const v = h.app.view!;
    const line = () => h.app.currentLayout(v).lines[v.cur.row]!.src;
    await h.keys("ctrl+g", "2", "1", "enter");
    expect(line()).toBe(21);
    await h.keys(":", "4", "1", "enter");
    expect(line()).toBe(41);
    await h.keys("ctrl+e");
    expect(v.source).toBe(true);
    await h.keys("A", "!", "escape", "ctrl+z");
    expect(v.buf.source).not.toContain("!");
    await h.keys("ctrl+y");
    expect(v.buf.source).toContain("Line 21.!");
    await h.keys("ctrl+e");
    expect(v.source).toBe(false);
  });
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
  test("search the vault: every note, the open one as it is now; enter opens it at the match", async () => {
    const root = makeVault();
    writeFileSync(join(root, "s1.md"), "# One\n\nthe zebra line\n");
    writeFileSync(join(root, "s2.md"), "# Two\n\nno\n\nzebra again\n");
    const h = await harness({ root, open: "s2.md" });
    await h.keys("space", "n", "v", "g", "g", "A");
    for (const c of " zebra") await h.keys(c === " " ? "space" : c);
    await h.keys("escape"); // unsaved: the search sees it
    await h.keys("space", "f", "g");
    for (const c of "zebra") await h.keys(c);
    await h.keys("enter");
    const o = h.app.overlay as ListOverlay;
    expect(o.items.map((i) => i.label).sort()).toEqual(["s1.md:3", "s2.md:1", "s2.md:5"]);
    expect(h.frame()).toMatch(/3 matches in 2 files/);
    const pick = o.filtered.findIndex((e) => e.item.label === "s1.md:3");
    for (let i = 0; i < pick; i++) await h.keys("down");
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("s1.md");
  });
  test("ctrl+p lists recent notes first, the previous one on top", async () => {
    const h = await harness();
    await h.app.run("note.open notes/beta.md");
    await h.app.run("note.open crlf.md");
    await h.keys("ctrl+p");
    const o = h.app.overlay as ListOverlay;
    expect(o.filtered.slice(0, 2).map((e) => e.item.data)).toEqual(["notes/beta.md", "index.md"]);
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
  });
  test("the clipboard: cuts reach it, p puts what it holds (the register when it holds nothing)", async () => {
    const { copyText } = await import("../src/core/clipboard.ts");
    const root = makeVault();
    writeFileSync(join(root, "c.md"), "alpha beta\n");
    const h = await harness({ root, open: "c.md" });
    const v = h.app.view!;
    await h.keys("space", "n", "v", "x");
    expect(h.copied.at(-1)).toBe("a"); // x is a cut: on the clipboard too
    await h.keys("p");
    expect(v.buf.source).toBe("lapha beta\n"); // nothing readable on the clipboard: the register
    // Something copied elsewhere (the clipboard file stands for the system clipboard here).
    const { stateDir } = await import("../src/core/paths.ts");
    copyText("ZED", { osc52: () => false, fallbackDir: stateDir(h.app.loc) });
    await h.keys("0", "shift+p");
    expect(v.buf.source).toBe("ZEDlapha beta\n");
    // A terminal paste in normal mode puts, as p does.
    h.app.paste("++");
    await h.keys("escape");
    expect(v.buf.source).toContain("++");
  });
});

describe("creating notes and folders", () => {
  test("ctrl+n: a name, the note beside this one with its title, opened and typed into", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    await h.keys("ctrl+n");
    expect(h.frame()).toContain("new note in notes/");
    for (const c of "idea") await h.keys(c);
    await h.keys("enter");
    expect(readFileSync(join(root, "notes", "idea.md"), "utf8")).toBe("# idea\n\n");
    const v = h.app.view!;
    expect(v.buf.rel).toBe("notes/idea.md");
    expect(v.insert).toBe(true);
    await h.keys("h", "i", "escape", "ctrl+s");
    expect(readFileSync(join(root, "notes", "idea.md"), "utf8")).toBe("# idea\n\nhi\n");
    expect(h.app.graph.notes.has("notes/idea.md")).toBe(true);
  });
  test(":new takes folders (made) and other note formats; an existing file opens; outside the vault is refused", async () => {
    const root = makeVault();
    const h = await harness({ root });
    await h.app.run("note.create projects/deep/plan");
    expect(readFileSync(join(root, "projects", "deep", "plan.md"), "utf8")).toBe("# plan\n\n");
    await h.app.run("note.create /cfg.toml");
    expect(existsSync(join(root, "cfg.toml"))).toBe(true);
    expect(h.app.view!.buf.rel).toBe("cfg.toml");
    await h.app.run("note.create notes/alpha");
    expect(h.app.messages.at(-1)!.text).toContain("exists");
    await h.app.run("note.create ../../escape"); // from notes/: past the root
    expect(h.app.messages.at(-1)!.text).toContain("not inside the root");
    expect(existsSync(join(root, "..", "escape.md"))).toBe(false);
  });
  test("the explorer: n a note in the selected folder (space n n too), N a folder — shown though empty, and selected", async () => {
    const root = makeVault();
    const h = await harness({ root });
    await h.keys("space", "e");
    const at = h.app.explorerRows().findIndex((r) => r.kind === "dir" && r.path === "notes");
    h.app.sidebar.selected = at;
    h.app.region = "sidebar";
    await h.keys("shift+n");
    // Not drafts: the harness's walk.exclude leaves out every drafts/ folder.
    for (const c of "ideas") await h.keys(c);
    await h.keys("enter");
    expect(existsSync(join(root, "notes", "ideas"))).toBe(true);
    const sel = h.app.explorerRows()[h.app.sidebar.selected]!;
    expect([sel.kind, sel.path]).toEqual(["dir", "notes/ideas"]);
    expect(h.frame()).toContain("ideas"); // empty, still listed
    await h.keys("n");
    for (const c of "first") await h.keys(c);
    await h.keys("enter");
    expect(existsSync(join(root, "notes", "ideas", "first.md"))).toBe(true);
    expect(h.app.view!.buf.rel).toBe("notes/ideas/first.md");
    // space n n, from the explorer: the same, in its selected folder.
    await h.keys("escape", "space", "e");
    h.app.region = "sidebar";
    h.app.selectInExplorer("notes/ideas");
    await h.keys("space", "n", "n");
    expect(h.app.overlay).toMatchObject({ kind: "prompt", label: "new note in notes/ideas/" });
  });
  test("a pane's own key sequence waits for its second key: a global key it starts with isn't run after a pause", async () => {
    // w is the note's word motion; in the explorer, w w is bound here: w waits, however long.
    const h = await harness({ config: (c) => (c.keys.explorer = { "w w": "bottom" }) });
    await h.keys("space", "e");
    h.app.region = "sidebar";
    h.app.sidebar.selected = 0;
    await h.keys("w");
    await Bun.sleep(DEFAULT_CONFIG.input.which_key_delay_ms + 150);
    expect(h.app.pending).toEqual(["w"]);
    expect(h.app.region).toBe("sidebar");
    h.app.whichKey = true;
    expect(h.frame()).toContain("Bottom"); // which-key names the pane's action as help does
    await h.keys("w");
    expect(h.app.sidebar.selected).toBe(h.app.explorerRows().length - 1);
  });
  test("following a link to a note that doesn't exist asks to create it, the name filled in", async () => {
    const root = makeVault();
    writeFileSync(join(root, "notes", "hub.md"), "# Hub\n\nSee [future note](future%20note.md).\n");
    const h = await harness({ root, open: "notes/hub.md" });
    const v = h.app.view!;
    const l = h.app.currentLayout(v).links[0]!;
    h.app.moveCursor(v, { row: l.line, col: l.col });
    await h.keys("enter");
    expect(h.app.overlay).toMatchObject({ kind: "prompt", text: "future note" });
    await h.keys("enter");
    expect(existsSync(join(root, "notes", "future note.md"))).toBe(true);
    await h.keys("escape", "ctrl+o");
    expect(h.app.view!.buf.rel).toBe("notes/hub.md");
    expect(h.app.graph.linksOf("notes/hub.md")[0]!.resolvedKind).toBe("note"); // the link resolves now
  });
});

describe("saving keeps the index true (found by the creation scenario)", () => {
  test("a note saved in slipbox is re-indexed: the link added shows in the target's backlinks", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    expect(h.app.graph.backlinks("crlf.md").some((b) => b.from === "notes/alpha.md")).toBe(false);
    await h.keys("space", "n", "v", "shift+g", "o");
    for (const c of "[crlf](../crlf.md)") await h.keys(c);
    await h.keys("escape", "ctrl+s");
    expect(h.app.graph.backlinks("crlf.md").some((b) => b.from === "notes/alpha.md")).toBe(true);
    expect(h.app.graph.entry("notes/alpha.md")!.mtimeMs).toBe(statSync(join(root, "notes", "alpha.md")).mtimeMs);
  });
  test("a watcher resync after our own save (a new folder) doesn't take the save for a change on disk", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md", watch: true });
    await h.keys("space", "n", "v", "shift+a", "!", "escape", "ctrl+s");
    await Bun.sleep(300); // the save's own events, seen and passed over
    // A folder made beside it: the watcher resyncs from the index, then hears of the folder and
    // checks the notes around it — the saved one among them.
    await h.app.run("folder.create /notes/fresh");
    await Bun.sleep(600);
    h.frame();
    expect(h.app.messages.some((m) => m.text.includes("changed on disk"))).toBe(false);
  });
  test(":new and :mkdir take a name (free text, nothing to complete)", async () => {
    const root = makeVault();
    const h = await harness({ root });
    await h.keys(":");
    for (const c of "mkdir box") await h.keys(c === " " ? "space" : c);
    await h.keys("enter");
    expect(existsSync(join(root, "box"))).toBe(true);
    await h.keys("escape", ":");
    for (const c of "new box/one") await h.keys(c === " " ? "space" : c);
    await h.keys("enter");
    expect(existsSync(join(root, "box", "one.md"))).toBe(true);
  });
});

describe("vaults in the TUI (17.x)", () => {
  let made = 0;
  /** Two vaults the machine knows: `tnotesN` (opened) and `tappN`, whose index links into it.
   *  Names are unique on a machine, so each call numbers its own. */
  async function twoVaults() {
    const n = ++made;
    const { initVault, locateVault: locate } = await import("../src/core/vault.ts");
    const base = mkdtempSync(join(sandbox, "two-"));
    const notes = join(base, "notes");
    const app = join(base, "app");
    const files: Record<string, string> = {
      "notes/index.md": "# Index\n\n[goals](../app/design.md#goals)\n\n[out](../app/design.md)\n",
      "notes/todo.md": "# Todo\n",
      "app/design.md": "# Design\n\nIntro.\n\n## Goals\n\nShip.\n",
      "app/links.md": "See [todo](../notes/todo.md).\n",
    };
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(base, rel)), { recursive: true });
      writeFileSync(join(base, rel), text);
    }
    initVault(notes, `tnotes${n}`);
    initVault(app, `tapp${n}`);
    openGraph(locate({ root: app }), DEFAULT_CONFIG, true); // tapp's index, as of now
    return { base, notes, app, n };
  }

  test("backlinks from another vault are listed by their path (21.9), never a name:path label", async () => {
    const { notes, app, n } = await twoVaults();
    const h = await harness({ root: notes, open: "todo.md" });
    await h.app.run("backlinks.open");
    expect(h.frame()).toContain(join(app, "links.md"));
    expect(h.frame()).not.toContain(`tapp${n}:`);
  });

  test("a link without text shows its target as written (21.9): no form made up for the screen; its hover titled by the file's path", async () => {
    const { notes, app, n } = await twoVaults();
    mkdirSync(join(notes, "sub"), { recursive: true });
    writeFileSync(join(notes, "sub", "forms.md"), "[](../todo.md) [../todo.md](../todo.md) [](../../APP/design.md#goals) [](nowhere.md) [named](../todo.md)\n".replace("APP", basename(app)));
    const h = await harness({ root: notes, open: "sub/forms.md" });
    const row = () => h.frame().split("\n").find((r) => r.includes("nowhere.md"))!;
    expect(row()).toContain(`../todo.md ../todo.md ../../${basename(app)}/design.md#goals nowhere.md named`);
    expect(row()).not.toContain(`tapp${n}:`);
    await h.app.run("ui.urls");
    expect(row()).toContain(`../todo.md ../todo.md ../../${basename(app)}/design.md#goals nowhere.md`); // the toast covers the rest
    // Its hover is titled so too.
    await h.app.run("ui.urls");
    const link = h.app.currentLayout(h.app.view!).links.find((l) => l.target.endsWith("design.md#goals"))!;
    h.app.moveCursor(h.app.view!, { row: link.line, col: link.col });
    await h.keys("shift+k");
    expect(h.app.floating?.title).toBe(`${join(app, "design.md")} › Goals`);
  });

  test("a link's target completed (20.13): after ]( the files it could reach — this vault's by path, another's by its full path (21.9) — narrowed as typed; the path from the note written, another named folder's pointer (21.7)", async () => {
    const { base, notes, app, n } = await twoVaults();
    mkdirSync(join(notes, "sub"), { recursive: true });
    writeFileSync(join(notes, "sub", "here.md"), "# Here\n");
    writeFileSync(join(notes, "zq b.md"), "# Spaced\n");
    const h = await harness({ root: notes, open: "sub/here.md" });
    await h.app.run("view.source");
    await h.keys("shift+g", "o");
    for (const k of "[x](") await h.keys(k);
    const shown = (h: Harness) => h.app.completion?.shown.map((i) => i.label) ?? [];
    expect(h.app.completion?.links).toBe(true);
    expect(shown(h)).toContain("todo.md");
    expect(shown(h)).toContain(join(app, "design.md"));
    expect(shown(h)).not.toContain("sub/here.md"); // not the note itself
    // This vault's first.
    expect(shown(h).indexOf("todo.md")).toBeLessThan(shown(h).indexOf(join(app, "design.md")));
    // Typed as it's shown (other test vaults have a design.md too: this one's folder narrows).
    for (const k of `${basename(base)}/app/desi`) await h.keys(k);
    expect(shown(h)[0]).toBe(join(app, "design.md"));
    await h.keys("tab");
    expect(h.app.view!.buf.source).toBe(`# Here\n[x](slipbox://tapp${n}/design.md\n`); // a named folder of its own (21.7)
    expect(h.app.completion).toBeNull();
    // Closed by the link's end; a space is a path's too, written encoded.
    await h.keys(")", "space");
    expect(h.app.completion).toBeNull();
    for (const k of "[y](zq") await h.keys(k);
    expect(shown(h)[0]).toBe("zq b.md");
    await h.keys("tab");
    expect(h.app.view!.buf.source).toEndWith("[y](../zq%20b.md\n");
    // Narrowed by the full path too: its folder's name, which no vault form has.
    await h.keys(")", "space");
    for (const k of `[z](${basename(dirname(notes))}`) await h.keys(k);
    expect(shown(h)).toContain("todo.md");
    // Typing past the target closes it; a ( that isn't a link's opens nothing.
    await h.keys(")");
    expect(h.app.completion).toBeNull();
    for (const k of " f(") await h.keys(k);
    expect(h.app.completion).toBeNull();
    await h.keys("escape");
  });

  test("links completed in the root's convention (21.5): after [[ a name where it reaches the note, else its path; after ]( the convention's path and extension", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-complete-conv-"));
    mkdirSync(join(root, ".obsidian"));
    for (const d of ["sub", "other"]) mkdirSync(join(root, d));
    for (const f of ["sub/b.md", "other/b.md", "sub/dal.md"]) writeFileSync(join(root, f), `# ${f}\n`);
    writeFileSync(join(root, "sub", "here.md"), "# Here\n");
    const h = await harness({ root, open: "sub/here.md" });
    await h.app.run("view.source");
    await h.keys("shift+g", "o");
    const shown = () => h.app.completion?.shown.map((i) => [i.label, i.detail]) ?? [];
    for (const k of "[[") await h.keys(k);
    expect(h.app.completion?.links).toBe(true);
    // Each as it would be written: beside this note a name; the other b by its path.
    expect(shown()).toContainEqual(["b", "sub/b.md"]);
    expect(shown()).toContainEqual(["other/b", "other/b.md"]);
    for (const k of "da") await h.keys(k);
    expect(shown()[0]).toEqual(["dal", "sub/dal.md"]);
    await h.keys("tab");
    expect(h.app.view!.buf.source).toEndWith("[[dal\n");
    await h.keys("]", "]", "space");
    expect(h.app.completion).toBeNull();
    // A markdown link typed in a wikilink root: Obsidian keeps .md in one; relative (ours).
    for (const k of "[x](oth") await h.keys(k);
    await h.keys("tab");
    expect(h.app.view!.buf.source).toEndWith("[[dal]] [x](../other/b.md\n");
    await h.keys("escape");
  });

  test("the link picker (21.5): space l i, a note picked, its link written as the convention writes it — reading, after the word; typing, at the cursor; saved", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-picker-"));
    mkdirSync(join(root, ".slipbox"));
    mkdirSync(join(root, "sub"));
    writeFileSync(join(root, "sub", "b.md"), "---\ntitle: The B note\n---\n# B\n");
    writeFileSync(join(root, "a.md"), "# A\n\nSee here for more.\n");
    const h = await harness({ root, open: "a.md" });
    // Reading: on "here", the link goes after the word — markdown, relative, the note's title its text.
    await h.keys("j", "j", "w");
    await h.keys("space", "l", "i");
    expect((h.app.overlay as ListOverlay).title).toBe("Link to…");
    expect((h.app.overlay as ListOverlay).items.map((i) => i.label)).toEqual(["sub/b.md"]); // never the note itself
    await h.keys("enter");
    expect(readFileSync(join(root, "a.md"), "utf8")).toBe("# A\n\nSee here [The B note](sub/b.md) for more.\n");
    expect(h.app.messages.at(-1)!.text).toBe("linked sub/b.md: [The B note](sub/b.md)");
    // Typing, in a wikilink root: at the cursor, by name.
    mkdirSync(join(root, "wiki", ".obsidian"), { recursive: true });
    writeFileSync(join(root, "wiki", "c.md"), "# C\n");
    writeFileSync(join(root, "wiki", "d.md"), "# D\n\n");
    const w = await harness({ root: join(root, "wiki"), open: "d.md" });
    await w.app.run("view.source");
    await w.keys("shift+g", "i");
    for (const k of ["A", "l", "s", "o", "space"]) await w.keys(k);
    await w.app.run("link.insert");
    await w.keys("enter");
    expect(w.app.view!.buf.source).toContain("Also [[c]]");
    expect(w.app.view!.insert).toBe(true); // still typing, after it
    await w.keys("escape");
    // Not a note of a root's: said so.
    writeFileSync(join(root, "data.json"), "{}\n");
    await h.app.run("tab.close");
    h.app.open("data.json");
    await h.app.run("link.insert");
    expect(h.app.messages.at(-1)!.text).toBe("links are written in this folder's notes");
  });

  test("search by root (20.16, 21.10): this root's hits; ctrl+a adds the linked folders' under a divider, then every one's; one opens there", async () => {
    const { base, notes, app } = await twoVaults();
    await onlyRootsUnder(base, async () => {
      writeFileSync(join(notes, "w.md"), "# W\n\nA walrus here.\n");
      writeFileSync(join(app, "w2.md"), "# W2\n\nA walrus there.\n");
      const h = await harness({ root: notes, open: "index.md" });
      h.app.graph.reach!.graphAt(app)?.ensureAll(); // the app vault's index, as when opened
      await h.keys("space", "f", "s");
      for (const k of "walrus") await h.keys(k);
      const labels = () => (h.app.overlay as ListOverlay).filtered.map((e) => e.item.label);
      expect(labels()).toEqual(["w.md:3"]);
      await h.keys("ctrl+a");
      expect(labels()).toEqual(["w.md:3", "linked folders", `${join(app, "w2.md")}:3`]); // by its path (21.9)
      expect((h.app.overlay as ListOverlay).title).toContain("and the folders linked to it");
      await h.keys("ctrl+a");
      expect((h.app.overlay as ListOverlay).title).toContain("and every folder known");
      await h.keys("ctrl+a"); // and back to this one
      expect(labels()).toEqual(["w.md:3"]);
      await h.keys("ctrl+a");
      (h.app.overlay as ListOverlay).selected = 2;
      await h.keys("enter");
      expect(h.app.loc.root).toBe(app);
      expect(h.app.view!.buf.rel).toBe("w2.md");
      expect(h.app.view!.curAnchor.anchor.line).toBe(3);
    });
  });

  test("the explorer's roots (20.15): the vault opened stays beside one followed into; its files open there; pinned, a root stays", async () => {
    const { notes, app, n } = await twoVaults();
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter"); // into the app vault, by the link
    expect(h.app.loc.root).toBe(app);
    const others = () => h.app.explorerRows().filter((r) => r.root?.other).map((r) => r.root!.abs);
    expect(others()).toEqual([notes]);
    expect(h.app.explorerRows().find((r) => r.root?.other)!.name).toBe(`tnotes${n}`);
    // Unfolded: its files, as its index has them; none of this vault's file operations on them.
    h.app.leftView = "explorer";
    h.app.region = "sidebar";
    h.app.sidebar.selected = h.app.explorerRows().findIndex((r) => r.root?.other);
    h.app.explorerAction("open");
    const rows = h.app.explorerRows();
    const todo = rows.findIndex((r) => r.under === notes && r.name === "todo.md");
    expect(todo).toBeGreaterThan(0);
    h.app.sidebar.selected = todo;
    expect(h.app.explorerItem()).toBeNull();
    // Opened: into that vault, the file there; the one left isn't kept (not pinned).
    h.app.explorerAction("open");
    expect(h.app.loc.root).toBe(notes);
    expect(h.app.view!.buf.rel).toBe("todo.md");
    expect(others()).toEqual([]);
    // Pinned: kept beside, and from then on (with the opened vault's state).
    await h.app.run("note.open index.md");
    await h.keys("tab", "enter"); // into app again, by the link
    expect(h.app.loc.root).toBe(app);
    await h.app.run("vault.pin_root");
    h.app.switchVault((await import("../src/core/vault.ts")).rootAt(notes), join(notes, "todo.md"));
    expect(h.app.loc.root).toBe(notes);
    expect(others()).toEqual([app]);
    const again = await harness({ root: notes, open: "index.md" });
    expect(again.app.otherRoots()).toEqual([app]);
    await again.app.switchVault((await import("../src/core/vault.ts")).rootAt(app), null);
    await again.app.run("vault.pin_root");
    expect((await harness({ root: notes, open: "index.md" })).app.otherRoots()).toEqual([]);
  });

  test("another root's row (20.15): its name once, no menu button for the menu that refuses it", async () => {
    const { notes, n } = await twoVaults();
    const h = await harness({ root: notes, open: "index.md", width: 120, height: 30 });
    await h.keys("tab", "enter"); // into the app vault, by the link
    h.app.leftView = "explorer";
    h.app.region = "sidebar";
    h.app.sidebar.selected = h.app.explorerRows().findIndex((r) => r.root?.other);
    const row = h.frame().split("\n").find((r) => r.includes(`tnotes${n}`))!;
    expect(row.split(`tnotes${n}`).length - 1).toBe(1);
    expect(row).not.toContain(h.app.glyphs.itemMenu);
    expect(h.app.geometry!.hot.some((x) => x.id === "xrow:menu")).toBe(false);
    // Unfolded, its files' rows neither.
    h.app.explorerAction("open");
    h.app.sidebar.selected = h.app.explorerRows().findIndex((r) => r.under === notes && r.name === "todo.md");
    h.frame();
    expect(h.app.geometry!.hot.some((x) => x.id === "xrow:menu")).toBe(false);
  });

  test("the explorer's roots never overlap (20.15): a vault inside the one open, or around it, isn't one apart", async () => {
    const { locateVault } = await import("../src/core/vault.ts");
    const outer = makeVault(); // its nested-vault/ is a vault of its own
    const inner = join(outer, "nested-vault");
    const h = await harness({ loc: locateVault({ path: inner }), open: null });
    expect(h.app.otherRoots()).toEqual([]); // opened on the inner: nothing apart
    h.app.switchVault(locateVault({ path: outer }), null);
    expect(h.app.otherRoots()).toEqual([]); // around it: the tree is in it
  });

  test("h on another root's row folds it, the selection staying there (20.15)", async () => {
    const { notes, app } = await twoVaults();
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter"); // into app; notes is the other root
    expect(h.app.loc.root).toBe(app);
    h.app.leftView = "explorer";
    h.app.region = "sidebar";
    const at = h.app.explorerRows().findIndex((r) => !!r.root?.other);
    h.app.sidebar.selected = at;
    h.app.explorerAction("open"); // unfolded
    expect(h.app.expanded.has(notes)).toBe(true);
    expect(h.app.explorerRows().some((r) => r.under === notes)).toBe(true);
    h.app.explorerAction("collapse");
    expect(h.app.expanded.has(notes)).toBe(false);
    expect(h.app.explorerRows().some((r) => r.under === notes)).toBe(false);
    expect(h.app.sidebar.selected).toBe(at);
    h.app.explorerAction("collapse"); // folded already: stays put
    expect(h.app.sidebar.selected).toBe(at);
  });

  test("paste, new note and new folder on another root's row are refused (20.15), never a folder named by its path", async () => {
    const { notes, app } = await twoVaults();
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter"); // into app; notes is the other root
    expect(h.app.loc.root).toBe(app);
    h.app.leftView = "explorer";
    h.app.region = "sidebar";
    const sel = (f: (r: ReturnType<App["explorerRows"]>[number]) => boolean) => (h.app.sidebar.selected = h.app.explorerRows().findIndex(f));
    sel((r) => r.path === "design.md");
    h.app.explorerAction("copy");
    const before = readdirSync(app, { recursive: true }).sort();
    const refused = () => expect(h.app.messages.at(-1)!.text).toBe("another root's folder: select a folder of this root");
    sel((r) => !!r.root?.other);
    h.app.explorerAction("paste");
    refused();
    h.app.explorerAction("new_note");
    refused();
    expect(h.app.overlay).toBeNull();
    h.app.explorerAction("new_folder");
    refused();
    expect(h.app.overlay).toBeNull();
    // A row under it, once unfolded: the same.
    h.app.explorerAction("open");
    sel((r) => r.under === notes && r.name === "todo.md");
    expect(h.app.sidebar.selected).toBeGreaterThan(0);
    h.app.explorerAction("paste");
    refused();
    expect(h.app.createNote("x", h.app.newItemBase())).toBeNull();
    expect(readdirSync(app, { recursive: true }).sort()).toEqual(before);
    expect(readdirSync(notes)).not.toContain("design.md");
  });

  test("the explorer's roots (21.9): a loose file open beside the root brings its folder, gone when none of its files is shown", async () => {
    const root = makeVault();
    const loose = mkdtempSync(join(sandbox, "beside-"));
    writeFileSync(join(loose, "l.md"), "# Loose\n");
    writeFileSync(join(loose, "m.md"), "# More\n");
    writeFileSync(join(root, "beside.md"), `# Beside\n\n[l](${join(loose, "l.md")})\n`);
    const h = await harness({ root, open: "beside.md" });
    expect(h.app.otherRoots()).toEqual([]);
    // Followed to: a loose file opens beside, as it is.
    await h.keys("tab", "enter");
    expect(h.app.loc.root).toBe(root);
    expect(h.app.view?.buf.abs).toBe(join(loose, "l.md"));
    expect(h.app.otherRoots()).toEqual([loose]);
    const row = h.app.explorerRows().find((r) => r.kind === "root" && r.path === loose);
    expect(row).toMatchObject({ root: { kind: "folder", abs: loose, other: true } });
    // Another of its files open too: one folder; the first closed, still there; the last closed, gone.
    h.app.openInNewTab(join(loose, "m.md"));
    expect(h.app.otherRoots()).toEqual([loose]);
    await h.app.run("tab.close");
    expect(h.app.otherRoots()).toEqual([loose]);
    await h.app.run("history.back"); // the window back at beside.md: none of its files shown any more
    expect(h.app.view?.buf.rel).toBe("beside.md");
    expect(h.app.otherRoots()).toEqual([]);
    expect(h.app.explorerRows().some((r) => r.path === loose)).toBe(false);
  });

  test("following a path link into another vault, at a heading, switches the TUI into it; back returns (17.10)", async () => {
    const { notes, app, n } = await twoVaults();
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    expect(h.app.loc.root).toBe(app);
    expect(h.app.loc.name).toBe(`tapp${n}`);
    expect(h.app.view!.buf.rel).toBe("design.md");
    expect(h.app.view!.curAnchor.anchor.line).toBe(5); // at ## Goals
    expect(h.app.messages.some((m) => m.text === `tapp${n} — ${app}`)).toBe(true);
    expect(h.app.graph.root).toBe(app);
    expect(h.frame()).toContain("Design");
    // The first place in this vault: back goes to the vault before, at the link.
    await h.app.run("history.back");
    expect(h.app.loc.root).toBe(notes);
    expect(h.app.view!.buf.rel).toBe("index.md");
    // A path out of the root, without a heading, goes there too.
    await h.keys("tab", "tab", "enter");
    expect(h.app.loc.root).toBe(app);
    expect(h.app.view!.buf.rel).toBe("design.md");
  });

  test("a switch is refused while a note is unsaved; each vault keeps its own tabs (17.10)", async () => {
    const { notes, app } = await twoVaults();
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("space", "n", "v", "shift+a", "!", "escape");
    expect(h.app.view!.buf.dirty).toBe(true);
    await h.app.run("history.back"); // nothing: no earlier place, no vault before
    h.app.switchVault(locateVault({ root: app }), join(app, "design.md"));
    expect(h.app.loc.root).toBe(notes);
    expect(h.app.messages.at(-1)!.text).toContain("unsaved: index.md");
    await h.keys("ctrl+s");
    expect(h.app.switchVault(locateVault({ root: app }), join(app, "design.md"))).toBe(true);
    await h.app.run("tab.new");
    await h.app.run("note.open links.md");
    h.app.switchVault(locateVault({ root: notes }), null);
    expect(h.app.loc.root).toBe(notes);
    // Into app again: its session comes back, its two tabs.
    h.app.switchVault(locateVault({ root: app }), null);
    expect(h.app.tabs.map((t) => t.views[0]!.buf.rel).sort()).toEqual(["design.md", "links.md"]);
  });

  test("a switch closes the properties editor first: its edits written to the note, or the switch refused while it asks (17.10)", async () => {
    const { notes, app } = await twoVaults();
    const h = await harness({ root: notes, open: "index.md" });
    const type = async (text: string) => {
      for (const c of text) await h.keys(c === " " ? "space" : c);
    };
    await h.app.run("note.properties");
    await h.keys("i");
    await type("a: [");
    await h.keys("escape");
    expect(h.app.floating!.view.buf.dirty).toBe(true);
    // Doesn't parse: it asks, and nothing switches.
    expect(h.app.switchVault(locateVault({ root: app }), null)).toBe(false);
    expect(h.app.loc.root).toBe(notes);
    expect(h.app.floating).not.toBeNull();
    expect((h.app.overlay as { confirm?: boolean } | null)?.confirm).toBe(true);
    await h.keys("n");
    await h.keys("d", "d", "i");
    await type("a: 1");
    await h.keys("escape");
    // Parses: written into index.md, the editor closed, then the switch.
    expect(h.app.switchVault(locateVault({ root: app }), null)).toBe(true);
    expect(h.app.floating).toBeNull();
    expect(h.app.loc.root).toBe(app);
    expect(h.app.view?.buf.key).not.toContain("#properties");
    expect(readFileSync(join(notes, "index.md"), "utf8")).toStartWith("---\na: 1\n---\n# Index");
  });

  test("the explorer shows a nested vault with its own icon; enter goes into it (17.13)", async () => {
    const root = makeVault();
    writeFileSync(join(root, "nested-vault", ".slipbox", "config.toml"), '[vault]\nid = "nestedid1"\nname = "inner-notes"\n');
    const h = await harness({ root, open: "index.md", config: (c) => (c.colors = { sidebar_vault: "#ff00aa" }) });
    h.app.region = "sidebar";
    const rows = h.app.explorerRows();
    const i = rows.findIndex((r) => r.path === "nested-vault");
    expect(rows[i]).toMatchObject({ kind: "root", root: { kind: "vault", name: "inner-notes" } });
    const f = h.frame();
    expect(f).toContain("◈ nested-vault inner-notes");
    // A folder's colour by default (its icon tells it apart), from a role of its own: set here.
    expect(h.app.theme.roles.sidebar_vault.fg).not.toEqual(h.app.theme.roles.sidebar_dir.fg);
    const c = h.canvas();
    const y = c.toString().split("\n").findIndex((r) => r.includes("◈ nested-vault"));
    const x = c.toString().split("\n")[y]!.indexOf("◈");
    expect(c.styles[y]![x]).toMatchObject({ fg: h.app.theme.roles.sidebar_vault.fg });
    h.app.sidebar.selected = i;
    await h.keys("enter");
    expect(h.app.loc.root).toBe(join(root, "nested-vault"));
    expect(h.app.view!.buf.rel).toBe("inner.md");
  });

  test("a plain folder is walked: its folders, the vaults in it, and .. to go up (17.13, 17.14, 20.22)", async () => {
    const { folderAt } = await import("../src/core/vault.ts");
    const dir = mkdtempSync(join(sandbox, "loose-"));
    writeFileSync(join(dir, "note.md"), "# loose\n");
    mkdirSync(join(dir, "plain"));
    writeFileSync(join(dir, "plain", "p.md"), "# p\n");
    mkdirSync(join(dir, "code", ".git"), { recursive: true }); // a repository: a vault by itself (20.3)
    mkdirSync(join(dir, "box", ".slipbox"), { recursive: true });
    const h = await harness({ loc: folderAt(dir), open: "note.md" });
    // Walked as a vault is (20.22): its folders in the tree, the vaults in it roots of their own.
    expect(h.app.explorerRows().map((r) => [r.name, r.kind, r.root?.kind])).toEqual([
      ["..", "root", "folder"],
      ["box", "root", "vault"],
      ["code", "root", "vault"],
      ["plain", "dir", undefined],
      ["note.md", "note", undefined],
    ]);
    expect(h.frame()).toContain("◈ box");
    expect(h.frame()).toContain("◈ code");
    expect(h.app.vaultStatus()).toBe(dir); // unnamed: its path (20.22)
    expect(statusRow(h.frame())).toContain(dir.slice(-12));
    h.app.enterRoot(h.app.explorerRows()[1]!);
    expect(h.app.loc).toMatchObject({ mode: "vault", root: join(dir, "box") });
  });

  test("a note in a git repository opens the repository as its root: nothing offered, nothing written (20.3)", async () => {
    const { folderAt, locateVault } = await import("../src/core/vault.ts");
    const repo = join(mkdtempSync(join(sandbox, "repo-")), "alpha");
    mkdirSync(join(repo, "docs"), { recursive: true });
    mkdirSync(join(repo, ".git"));
    writeFileSync(join(repo, "docs", "readme.md"), "# Readme\n\n[top](../top.md)\n");
    writeFileSync(join(repo, "top.md"), "# Top\n");
    const h = await harness({ loc: locateVault({ path: join(repo, "docs", "readme.md") }), open: "docs/readme.md" });
    expect(h.app.loc).toMatchObject({ mode: "vault", root: repo, name: null }); // no remote: unnamed (21.6)
    expect(h.app.overlay).toBeNull();
    expect(h.app.graph.notes.has("top.md")).toBe(true); // the whole repository, from its top
    expect(existsSync(join(repo, ".slipbox"))).toBe(false);
    // A loose folder: :init offers .slipbox/, and goes into the vault it makes.
    const loose = mkdtempSync(join(sandbox, "loose-"));
    writeFileSync(join(loose, "n.md"), "# N\n");
    const l = await harness({ loc: folderAt(loose), open: "n.md" });
    expect(l.app.overlay).toBeNull();
    await l.app.run("vault.init");
    expect((l.app.overlay as ListOverlay).title).toBe(`${loose} is a folder without .slipbox/ — give it one?`);
    expect((l.app.overlay as ListOverlay).items.map((it) => it.label)).toEqual(["Give it .slipbox/", "Cancel"]);
    await l.keys("enter");
    expect(l.app.loc).toMatchObject({ mode: "vault", root: loose });
    expect(existsSync(join(loose, ".slipbox", "config.toml"))).toBe(true);
  });

  test("opened on a loose folder, the named folders come first, seen last first; space v v lists them anywhere (17.14, 21.10)", async () => {
    const { notes, app, n } = await twoVaults();
    const { folderAt } = await import("../src/core/vault.ts");
    const dir = mkdtempSync(join(sandbox, "launch-"));
    const h = await harness({ loc: folderAt(dir), open: null, launcher: true });
    expect(h.app.overlay?.kind).toBe("list");
    const f = h.frame();
    expect(f).toContain(`tnotes${n}`);
    expect(f).toContain(`tapp${n}`);
    // Pick tnotes.
    const items = (h.app.overlay as ListOverlay).items.map((it) => it.label);
    for (let i = 0; i < items.indexOf(`tnotes${n}`); i++) await h.keys("down");
    await h.keys("enter");
    expect(h.app.loc.root).toBe(notes);
    await h.keys("space", "v", "v");
    expect(h.frame()).toContain(`tapp${n}`);
    expect((h.app.overlay as ListOverlay).items.some((it) => it.detail === app)).toBe(true);
  });

  test("space n m renames a note: a preview of every change, then enter; open notes follow (17.15)", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    await h.keys("space", "n", "m");
    const p = h.app.overlay as import("../src/tui/app.ts").PromptOverlay;
    expect(p.kind).toBe("prompt");
    expect(p.text).toBe("notes/alpha");
    p.text = "notes/first";
    await h.keys("enter");
    const list = h.app.overlay as ListOverlay;
    expect(list.title).toStartWith("notes/alpha.md → notes/first.md: ");
    expect(list.items.some((it) => it.label.startsWith("index.md:") && it.detail!.includes("[alpha](notes/first.md)"))).toBe(true);
    expect(list.items.some((it) => it.label.startsWith("crlf.md:"))).toBe(true);
    expect(existsSync(join(root, "notes", "alpha.md"))).toBe(true); // a preview writes nothing
    await h.keys("enter");
    expect(existsSync(join(root, "notes", "alpha.md"))).toBe(false);
    expect(readFileSync(join(root, "notes", "first.md"), "utf8")).not.toContain("previous_names"); // nothing written into it (21.12)
    const index = readFileSync(join(root, "index.md"), "utf8");
    expect(index).toContain("[alpha](notes/first.md), [Beta](notes/beta.md)");
    expect(index).toContain("[alpha › Section One](notes/first.md#section-one)");
    expect(index).toContain("a markdown link to [alpha](notes/first.md)");
    expect(index).toContain("| [aliased](notes/first.md) |");
    expect(readFileSync(join(root, "crlf.md"), "utf8")).toContain("line two with [alpha](notes/first.md)\r\n");
    expect(h.app.view!.buf.rel).toBe("notes/first.md");
    expect(h.app.graph.notes.has("notes/first.md")).toBe(true);
    expect(h.app.graph.backlinks("notes/first.md").length).toBeGreaterThan(3);
    expect(h.app.messages.at(-1)!.text).toMatch(/^renamed notes\/alpha.md → notes\/first.md: \d+ changes in \d+ files$/);
  });

  test("space n h renames the cursor's heading, r the outline's: a preview, then its links (11.9)", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    await h.app.run("cursor.goto_line 9"); // in Section One
    await h.keys("space", "n", "h");
    const p = h.app.overlay as import("../src/tui/app.ts").PromptOverlay;
    expect(p.text).toBe("Section One");
    p.text = "Part One";
    await h.keys("enter");
    const list = h.app.overlay as ListOverlay;
    expect(list.title).toStartWith("notes/alpha.md#Section One → notes/alpha.md#Part One: 2 changes in 2 files");
    await h.keys("enter");
    expect(readFileSync(join(root, "index.md"), "utf8")).toContain("[alpha › Section One](notes/alpha.md#part-one)");
    expect(h.app.view!.buf.source).toContain("## Part One\n");
    // The outline's r: its selected heading.
    await h.app.run("outline.toggle");
    const rows = h.app.outlineRows();
    h.app.outline.selected = rows.findIndex((r) => r.text === "Section Two");
    await h.keys("r");
    expect((h.app.overlay as import("../src/tui/app.ts").PromptOverlay).text).toBe("Section Two");
    await h.keys("escape");
    // Above the first heading: nothing to rename.
    await h.app.run("cursor.goto_line 1");
    await h.keys("space", "n", "h");
    expect(h.app.messages.at(-1)!.text).toBe("no heading here: the cursor is above the first");
  });

  test("space v shift+u undoes the last rename: its preview, then every file as it was; open notes follow it back (7.4)", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    const index = readFileSync(join(root, "index.md"), "utf8");
    const alpha = readFileSync(join(root, "notes", "alpha.md"), "utf8");
    await h.app.run("note.rename notes/first");
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("notes/first.md");
    await h.keys("space", "v", "shift+u");
    const list = h.app.overlay as ListOverlay;
    expect(list.title).toStartWith("undo: notes/first.md → notes/alpha.md: ");
    expect(list.items.some((it) => it.label.startsWith("index.md:") && /\(notes\/first\.md\).*→.*\(notes\/alpha\.md\)/.test(it.detail!))).toBe(true);
    expect(existsSync(join(root, "notes", "first.md"))).toBe(true); // a preview writes nothing
    await h.keys("enter");
    expect(readFileSync(join(root, "index.md"), "utf8")).toBe(index);
    expect(readFileSync(join(root, "notes", "alpha.md"), "utf8")).toBe(alpha); // its previous name gone too
    expect(existsSync(join(root, "notes", "first.md"))).toBe(false);
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    expect(h.app.graph.notes.has("notes/alpha.md")).toBe(true);
    expect(h.app.graph.notes.has("notes/first.md")).toBe(false);
    expect(h.app.messages.at(-1)!.text).toMatch(/^renamed notes\/first.md back to notes\/alpha.md: \d+ changes in \d+ files$/);
    // Nothing more: said so. The explorer's shift+u is the same command.
    h.app.showSidebar(true);
    h.app.region = "sidebar";
    await h.keys("shift+u");
    expect(h.app.overlay).toBeNull();
    expect(h.app.messages.at(-1)!.text).toContain("nothing to undo");
  });

  test("space s c copies the note's context for an agent: it, what it links to, what links to it — unsaved notes saved first (9.7)", async () => {
    const root = makeVault();
    writeFileSync(join(root, "ctx.md"), "# Ctx\n\nSee [beta](notes/beta.md).\n");
    writeFileSync(join(root, "back.md"), "Back to [ctx](ctx.md).\n");
    const h = await harness({ root, open: "ctx.md" });
    // An edit not saved yet: a handoff saves it (4.10), so the bundle has what's on screen.
    await h.keys("shift+g", "shift+a", ...[..." and [alpha](notes/alpha.md)"].map((c) => (c === " " ? "space" : c)), "escape");
    expect(h.app.view!.buf.dirty).toBe(true);
    await h.keys("space", "s", "c");
    expect(h.app.view!.buf.dirty).toBe(false);
    expect(readFileSync(join(root, "ctx.md"), "utf8")).toBe("# Ctx\n\nSee [beta](notes/beta.md). and [alpha](notes/alpha.md)\n");
    const text = h.copied.at(-1)!;
    expect(text).toStartWith("# Context: ctx.md\n");
    /** The files in a bundle, by their reference lines (a note's own headings are inside its fence). */
    const files = (t: string) => [...t.matchAll(/^`([^`:]+)(?::[\d-]+)?` — /gm)].map((m) => m[1]);
    expect(files(text)).toEqual(["ctx.md", "notes/beta.md", "notes/alpha.md", "back.md"]);
    expect(text).toContain("`ctx.md:1-3` — asked for\n\n```markdown\n# Ctx\n\nSee [beta](notes/beta.md). and [alpha](notes/alpha.md)\n```");
    expect(h.app.messages.at(-1)!.text).toBe(`copied the context of ctx.md: 4 files (2 linked, 1 linking to it), ${text.length} characters`);
    // [context] says how far: no backlinks, nothing linked.
    h.app.config.context = { depth: 0, backlinks: false, limit: 25 };
    await h.keys("space", "s", "c");
    expect(files(h.copied.at(-1)!)).toEqual(["ctx.md"]);
  });

  test("space s c with an unsaved note changed on disk copies nothing and says which note, and how to resolve it", async () => {
    const root = makeVault();
    writeFileSync(join(root, "ctx.md"), "# Ctx\n");
    const h = await harness({ root, open: "ctx.md" });
    await h.keys("shift+g", "shift+a", "!", "escape");
    expect(h.app.view!.buf.dirty).toBe(true);
    writeFileSync(join(root, "ctx.md"), "# Ctx, rewritten by an agent\n");
    expect(h.app.view!.buf.changedOnDisk()).toBe(true);
    const copies = h.copied.length;
    await h.keys("space", "s", "c");
    expect(h.copied.length).toBe(copies);
    expect(h.app.messages.at(-1)).toMatchObject({ level: "warn", text: "context: ctx.md changed on disk while unsaved — ␣ n c resolves it first" });
    expect(readFileSync(join(root, "ctx.md"), "utf8")).toBe("# Ctx, rewritten by an agent\n");
  });

  test("space s c with an unsaved note that can't be written copies nothing and blames the write, not a conflict", async () => {
    const root = makeVault();
    mkdirSync(join(root, "ro"));
    writeFileSync(join(root, "ro", "a.md"), "# A\n");
    const h = await harness({ root, open: "ro/a.md" });
    await h.keys("shift+g", "shift+a", "!", "escape");
    expect(h.app.view!.buf.dirty).toBe(true);
    chmodSync(join(root, "ro", "a.md"), 0o444);
    chmodSync(join(root, "ro"), 0o555);
    try {
      const copies = h.copied.length;
      await h.keys("space", "s", "c");
      expect(h.copied.length).toBe(copies);
      expect(h.app.messages.at(-1)).toMatchObject({ level: "warn", text: "context: ro/a.md couldn't be saved — not copying" });
      expect(h.app.messages.some((m) => m.level === "error" && m.text.startsWith("can't write ro/a.md"))).toBe(true);
    } finally {
      chmodSync(join(root, "ro"), 0o755);
      chmodSync(join(root, "ro", "a.md"), 0o644);
    }
  });

  test("a dirty note changed on disk while another list is open is said once, not per write", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "index.md" });
    await h.keys("shift+a", "!", "escape");
    const buf = h.app.view!.buf;
    expect(buf.dirty).toBe(true);
    h.app.openList({ title: "Something else", items: [{ label: "x", data: null }], accept: () => {} });
    const before = h.app.messages.length;
    for (let k = 0; k < 3; k++) h.app.conflictPrompt(buf);
    expect(h.app.messages.slice(before).filter((m) => m.text.includes("changed on disk while you have unsaved changes"))).toHaveLength(1);
  });

  test("a rename is refused while a file it rewrites is unsaved; :rename takes the path; the explorer's r asks", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "index.md" });
    await h.keys("space", "n", "v", "shift+a", "!", "escape");
    await h.app.run("tab.new");
    await h.app.run("note.open notes/alpha.md");
    await h.app.run("note.rename notes/first");
    expect(h.app.overlay).toBeNull();
    expect(h.app.messages.at(-1)!.text).toContain("unsaved: index.md");
    await h.app.run("tab.prev");
    await h.keys("ctrl+s");
    await h.app.run("tab.next");
    await h.app.run("note.rename notes/first");
    expect((h.app.overlay as ListOverlay).title).toStartWith("notes/alpha.md → notes/first.md");
    await h.keys("escape"); // cancelled: nothing changed
    expect(existsSync(join(root, "notes", "alpha.md"))).toBe(true);
    // The explorer: r on the selected note asks for its new name, in its folder.
    h.app.showSidebar(true);
    h.app.region = "sidebar";
    h.app.sidebar.selected = h.app.explorerRows().findIndex((r) => r.path === "notes/beta.md");
    await h.keys("r");
    expect(h.app.overlay).toMatchObject({ kind: "prompt", label: "rename notes/beta.md to: ", text: "beta" });
  });

  test("a folder's move is refused while a note in it is unsaved, its links rewritten or not", async () => {
    const { planFolderMove } = await import("../src/core/rename.ts");
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    h.app.view!.buf.edit(0, 0, "UNSAVED ");
    h.app.previewRename(() => planFolderMove(h.app.graph, "notes", "notes2"));
    expect(h.app.overlay).toBeNull();
    expect(h.app.messages.at(-1)!.text).toStartWith("unsaved: notes/alpha.md");
    expect(existsSync(join(root, "notes", "alpha.md"))).toBe(true);
    expect(existsSync(join(root, "notes2"))).toBe(false);
    expect(h.app.view!.buf.dirty).toBe(true);
    expect(h.app.view!.buf.source).toStartWith("UNSAVED ");
  });

  test("naming the folder anew, and relinking a moved note's links, from the TUI", async () => {
    const { notes, n } = await twoVaults();
    const h = await harness({ root: notes, open: "index.md" });
    await h.app.run(`folder.name tnotes${n}b`);
    await h.keys("enter");
    expect(h.app.loc.name).toBe(`tnotes${n}b`);
    expect(readFileSync(join(notes, ".slipbox", "config.toml"), "utf8")).toContain(`previous_names = ["tnotes${n}"]`);
    // A note moved outside slipbox: its links are broken, the move known; relink rewrites them.
    const { renameSync } = await import("node:fs");
    writeFileSync(join(notes, "todo-link.md"), "[t](todo.md)\n");
    h.app.graph.build(true);
    renameSync(join(notes, "todo.md"), join(notes, "tasks.md"));
    h.app.graph.build(true);
    await h.app.run("note.open todo-link.md");
    await h.app.run("link.relink");
    expect((h.app.overlay as ListOverlay).title).toStartWith("relink: 1 change in 1 file");
    await h.keys("enter");
    expect(readFileSync(join(notes, "todo-link.md"), "utf8")).toBe("[t](tasks.md)\n");
    // Nothing left to relink: the preview says what it looked for (no names: links are paths, 20.22).
    await h.app.run("link.relink");
    expect((h.app.overlay as ListOverlay).items.map((i) => i.label)).toEqual(["no broken link points where a file moved from"]);
  });

  test("a new note named like another is offered a distinct name from its folder; typed again, it's kept (17.5)", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "projects/index.md" });
    await h.keys("ctrl+n");
    for (const c of "alpha") await h.keys(c);
    await h.keys("enter");
    expect(h.app.messages.at(-1)!.text).toContain("a note named alpha is at notes/alpha.md");
    const p = h.app.overlay as import("../src/tui/app.ts").PromptOverlay;
    expect(p.text).toBe("projects-alpha");
    await h.keys("enter");
    expect(existsSync(join(root, "projects", "projects-alpha.md"))).toBe(true);
    // Insisting: the same name typed again is made.
    await h.keys("escape"); // the new note opened to be typed into
    await h.app.run("note.open projects/index.md");
    await h.keys("ctrl+n");
    for (const c of "alpha") await h.keys(c);
    await h.keys("enter", "ctrl+u");
    for (const c of "alpha") await h.keys(c);
    await h.keys("enter");
    expect(existsSync(join(root, "projects", "alpha.md"))).toBe(true);
  });

  test("a file:// link and a ~/ link are followed into the other vault, at the heading (17.16)", async () => {
    const { base, notes, app } = await twoVaults();
    writeFileSync(join(notes, "paths.md"), `# Paths\n\n[url](file://${app}/design.md#goals)\n\n[home](~/app/design.md#goals)\n`);
    const before = process.env.HOME;
    process.env.HOME = base;
    try {
      const h = await harness({ root: notes, open: "paths.md" });
      await h.keys("tab", "enter");
      expect(h.app.loc.root).toBe(app);
      expect(h.app.view!.buf.rel).toBe("design.md");
      expect(h.app.view!.curAnchor.anchor.line).toBe(5);
      expect(h.copied).toEqual([]); // followed, not copied as a URL
      await h.app.run("history.back");
      expect(h.app.view!.buf.rel).toBe("paths.md");
      await h.keys("tab", "tab", "enter");
      expect(h.app.loc.root).toBe(app);
      expect(h.app.view!.curAnchor.anchor.line).toBe(5);
    } finally {
      process.env.HOME = before;
    }
  });
});

describe("questions float in a window of their own", () => {
  const ask = (h: Harness) => h.app.overlay as import("../src/tui/app.ts").PromptOverlay;
  const click = (h: Harness, x: number, y: number) => {
    h.app.handleMouse({ type: "down", x, y, button: 0 });
    h.app.handleMouse({ type: "up", x, y, button: 0 });
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
    let f = h.frame().split("\n");
    expect(f[d.y + 2]).toContain("new note in notes/");
    expect(f[d.y + 3]).toContain("› fresh");
    expect(f.slice(d.y, d.y + d.h).join("\n")).toMatch(/OK {2}enter.*Cancel {2}esc/);
    expect(f.at(-1)).toContain("READ"); // the status line stays
    // A long answer keeps its end in view.
    for (const ch of "-and-a-rather-long-name-to-type-in-here-far-past-the-width-of-the-window-and-its-end") await h.keys(ch);
    expect(h.frame().split("\n")[d.y + 3]).toContain("its-end");
    clickHot(h, "dlg:cancel");
    expect(h.app.overlay).toBeNull();
    expect(existsSync(join(root, "notes", "fresh-and-a-rather-long-name-to-type-in-here-far-past-the-width-of-the-window-and-its-end.md"))).toBe(false);
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
      h.app.confirm("Really?", () => (said.v = true), () => (said.v = false));
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
    small.app.confirm("Really?", () => {});
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

describe("the explorer's file operations and buttons (18.x)", () => {
  /** The explorer focused, `rel` selected. */
  async function at(root: string, rel: string, open = "index.md") {
    const h = await harness({ root, open });
    h.app.showSidebar(true);
    h.app.leftView = "explorer";
    h.app.region = "sidebar";
    h.app.selectInExplorer(rel);
    expect(h.app.explorerRows()[h.app.sidebar.selected]!.path).toBe(rel);
    return h;
  }
  const prompt = (h: Harness) => h.app.overlay as import("../src/tui/app.ts").PromptOverlay;
  const type = async (h: Harness, text: string) => {
    for (const c of text) await h.keys(c === " " ? "space" : c);
  };

  test("r renames in place, m moves to a picked folder: links fixed after the preview", async () => {
    const root = makeVault();
    const h = await at(root, "notes/alpha.md");
    await h.keys("r", "ctrl+u");
    await type(h, "first");
    await h.keys("enter");
    expect((h.app.overlay as ListOverlay).title).toStartWith("notes/alpha.md → notes/first.md");
    await h.keys("enter");
    expect(existsSync(join(root, "notes", "first.md"))).toBe(true);
    expect(readFileSync(join(root, "index.md"), "utf8")).toContain("[alpha](notes/first.md)");
    expect(h.app.explorerRows()[h.app.sidebar.selected]!.path).toBe("notes/first.md"); // still selected
    // m: the folders as a tree, the root first, this one marked (18.8).
    await h.keys("m");
    const list = h.app.overlay as ListOverlay;
    expect(list.title).toBe("Move notes/first.md to… — type to filter, ← → fold");
    expect(list.filtered[0]!.item.label.trim()).toBe("▾ / (the root)");
    expect(list.filtered.find((e) => e.item.data === "notes")!.item.hint).toBe("here");
    await type(h, "projects");
    await h.keys("enter", "enter");
    expect(existsSync(join(root, "projects", "first.md"))).toBe(true);
    expect(readFileSync(join(root, "index.md"), "utf8")).toContain("[alpha](projects/first.md)");
  });

  test("d deletes to the trash after asking, saying what breaks; u puts it back", async () => {
    const root = makeVault();
    const h = await at(root, "notes/alpha.md");
    await h.keys("d");
    expect(prompt(h)).toMatchObject({ confirm: true, label: expect.stringMatching(/^Delete notes\/alpha\.md\? \d+ links to it will break\. It goes to the trash/) });
    await h.keys("escape");
    expect(existsSync(join(root, "notes", "alpha.md"))).toBe(true); // esc: nothing
    await h.keys("d", "n");
    expect(existsSync(join(root, "notes", "alpha.md"))).toBe(true); // n: nothing
    await h.keys("d", "y");
    expect(existsSync(join(root, "notes", "alpha.md"))).toBe(false);
    expect(h.app.graph.notes.has("notes/alpha.md")).toBe(false);
    expect(h.app.messages.at(-1)!.text).toContain("deleted notes/alpha.md to the trash");
    await h.keys("u");
    expect(readFileSync(join(root, "notes", "alpha.md"), "utf8")).toContain("Alpha");
    expect(h.app.graph.notes.has("notes/alpha.md")).toBe(true);
    // A folder, with everything in it; the trash lists it, enter restores.
    h.app.selectInExplorer("projects");
    await h.keys("d", "y");
    expect(existsSync(join(root, "projects"))).toBe(false);
    await h.app.run("trash.open");
    expect((h.app.overlay as ListOverlay).items.map((it) => it.label)).toEqual(["projects/"]);
    await h.keys("enter");
    expect(existsSync(join(root, "projects", "index.md"))).toBe(true);
  });

  test("y and p copy beside it (name-copy) or into the selected folder; x and p move it there", async () => {
    const root = makeVault();
    const h = await at(root, "notes/beta.md");
    await h.keys("y");
    await h.keys("p"); // the selection is beside it: a copy there
    expect(existsSync(join(root, "notes", "beta-copy.md"))).toBe(true);
    h.app.selectInExplorer("projects");
    await h.keys("p");
    expect(existsSync(join(root, "projects", "beta.md"))).toBe(true);
    // Cut, then paste into a folder: a move, links fixed after the preview.
    h.app.selectInExplorer("notes/alpha.md");
    await h.keys("x");
    h.app.selectInExplorer("projects");
    await h.keys("p");
    expect((h.app.overlay as ListOverlay).title).toStartWith("notes/alpha.md → projects/alpha.md");
    await h.keys("enter");
    expect(existsSync(join(root, "projects", "alpha.md"))).toBe(true);
    expect(existsSync(join(root, "notes", "alpha.md"))).toBe(false);
    expect(h.app.fileClip).toBeNull(); // pasted: done
  });

  test("a root switch forgets what was copied or cut and the last delete: p and u never reach the other root's files", async () => {
    const a = makeVault();
    const b = makeVault();
    writeFileSync(join(a, "notes", "x.md"), "# from A\n");
    writeFileSync(join(b, "notes", "x.md"), "# from B\n");
    const h = await at(a, "notes/x.md");
    await h.keys("y");
    h.app.selectInExplorer("notes/alpha.md");
    await h.keys("d", "y");
    expect(existsSync(join(a, "notes", "alpha.md"))).toBe(false);
    h.app.switchVault((await import("../src/core/vault.ts")).rootAt(b), null);
    expect(h.app.loc.root).toBe(b);
    h.app.pasteItem();
    expect(h.app.messages.at(-1)!.text).toBe("nothing copied or cut: y copies, x cuts");
    expect(readdirSync(join(b, "notes")).filter((n) => n.startsWith("x"))).toEqual(["x.md"]);
    expect(readdirSync(b).filter((n) => n.startsWith("x"))).toEqual([]);
    // u: B's trash (empty), not A's last delete looked for in it.
    h.app.restoreLast();
    expect(h.app.messages.at(-1)!.text).toBe("the trash is empty");
  });

  test("a folder renamed or moved takes its notes, their open windows and every link along", async () => {
    const root = makeVault();
    const h = await at(root, "notes", "notes/beta.md");
    await h.keys("r", "ctrl+u");
    await type(h, "papers");
    await h.keys("enter");
    expect((h.app.overlay as ListOverlay).title).toStartWith("notes/ → papers/");
    await h.keys("enter");
    expect(existsSync(join(root, "papers", "beta.md"))).toBe(true);
    expect(existsSync(join(root, "notes"))).toBe(false);
    expect(h.app.view!.buf.rel).toBe("papers/beta.md"); // the open note went with it
    expect(readFileSync(join(root, "index.md"), "utf8")).toContain("[alpha](papers/alpha.md)");
    expect(h.app.graph.notes.has("papers/alpha.md")).toBe(true);
  });

  test("buttons: a new note and a new folder on the title; on the selected row, … opens its menu", async () => {
    const root = makeVault();
    const h = await at(root, "notes/alpha.md");
    const f = h.frame();
    const title = f.split("\n").find((r) => r.includes("Explorer"))!;
    expect(title).toMatch(/Explorer\s+\+\s+\+▸/);
    const row = f.split("\n").find((r) => r.includes("alpha.md"))!;
    expect(row).toMatch(/alpha\.md\s+… /);
    // Its right edge under the title's last button's (by column).
    expect([...row].lastIndexOf("…")).toBe([...title].lastIndexOf("▸"));
    const hot = (id: string) => h.app.geometry!.hot.find((x) => x.id === id)!;
    const click = (x: number, y: number) => {
      h.app.handleMouse({ type: "down", x, y, button: 0 });
      h.app.handleMouse({ type: "up", x, y, button: 0 });
    };
    const clickHot = (id: string) => click(hot(id).x + 1, hot(id).y);
    click(hot("xnew:folder").x + 1, hot("xnew:folder").y);
    expect(prompt(h).label).toBe("new folder in notes/");
    await h.keys("escape");
    h.frame();
    clickHot("xnew:note");
    expect(prompt(h).label).toBe("new note in notes/");
    await h.keys("escape");
    // The row's … : a menu under it, from its column; each entry with its key.
    h.frame();
    const button = { ...hot("xrow:menu") };
    clickHot("xrow:menu");
    const menu = () => h.app.overlay as ListOverlay;
    expect(menu()).toMatchObject({ menu: true, title: "alpha.md" });
    expect(menu().items.map((it) => [it.label, it.hint])).toEqual([["Rename", "r"], ["Move to…", "m"], ["Copy", "y"], ["Cut", "x"], ["Delete", "d"]]);
    h.frame();
    const m = h.app.geometry!.overlay!;
    expect({ x: m.x, y: m.y }).toEqual({ x: button.x, y: button.y + 1 });
    expect(h.frame().split("\n")[m.y]).toContain("alpha.md");
    // A click on an entry does it.
    click(m.x + 2, m.listY + 4);
    expect(prompt(h)).toMatchObject({ confirm: true, label: expect.stringMatching(/^Delete notes\/alpha\.md\?/) });
    await h.keys("escape");
    // `.` opens it by key; an entry's key picks it there.
    await h.keys(".");
    expect(menu().menu).toBe(true);
    await h.keys("r");
    expect(prompt(h).text).toBe("alpha");
    await h.keys("escape", ".", "m");
    expect(menu().title).toStartWith("Move notes/alpha.md to…");
    await h.keys("escape");
    // A folder's: new note and folder in it, and, with something copied, paste.
    await h.keys("y");
    h.app.selectInExplorer("projects");
    await h.keys(".");
    expect(menu().items.map((it) => it.label)).toEqual(["New note here", "New folder here", "Rename", "Move to…", "Copy", "Cut", "Give it .slipbox/", "Paste a copy of alpha.md here", "Delete"]);
    await h.keys("p");
    expect(existsSync(join(root, "projects", "alpha.md"))).toBe(true);
    // Not focused: no row button.
    h.app.region = "content";
    expect(h.frame().split("\n").find((r) => r.split(/[┃┣]/)[0]!.includes("alpha.md"))).not.toMatch(/…/); // the explorer's row, not a message
    // A long name beside it: the pane scrolls sideways — a scrollbar, and its end reachable.
    writeFileSync(join(root, "notes", "a-longish-note-xyz12.md"), "# long\n"); // fits the pane, not beside it
    const long = await at(root, "notes/a-longish-note-xyz12.md");
    const longRow = () => long.frame().split("\n").find((r) => r.includes("longish") || r.includes("note-xyz12"))!;
    expect(longRow()).toMatch(/a-longish\S*[^…\s] +… /);
    expect(longRow()).not.toContain("note-xyz12.md");
    expect(long.app.geometry!.scrollbars.some((b) => b.pane === "sidebar" && b.horizontal)).toBe(true);
    long.app.sidebar.left = 999;
    expect(longRow()).toMatch(/note-xyz12\.md +… /);
    // Not focused, no button: the names fit, no scrollbar.
    long.app.region = "content";
    long.frame();
    expect(long.app.geometry!.scrollbars.some((b) => b.pane === "sidebar" && b.horizontal)).toBe(false);
  });

  test("space n d deletes the note; space v t lists the trash", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/beta.md" });
    await h.keys("space", "n", "d", "y");
    expect(existsSync(join(root, "notes", "beta.md"))).toBe(false);
    expect(h.app.view!.buf.deleted).toBe(true);
    await h.keys("space", "v", "t");
    expect((h.app.overlay as ListOverlay).title).toBe("Trash (1) — enter restores");
  });

  test("a vault's row: rename (its folder), move, delete, and rename the vault — its menu (18.7)", async () => {
    const root = makeVault();
    writeFileSync(join(root, "vault-links.md"), "[in](nested-vault/inner.md)\n");
    const h = await at(root, "nested-vault");
    const row = h.frame().split("\n").find((r) => r.includes("nested-vault"))!;
    expect(row).toMatch(/nested-vault.*… /);
    await h.keys(".");
    const menu = h.app.overlay as ListOverlay;
    expect(menu.items.map((it) => [it.label, it.hint])).toEqual([
      ["Rename the folder", "r"],
      ["Name it", "R"], // beside its folder's
      ["Move to…", "m"],
      ["Copy", "y"],
      ["Cut", "x"],
      ["Make it a plain folder", "V"],
      ["Delete the root", "d"],
    ]);
    await h.keys("R"); // its own case: not the folder's r
    expect(prompt(h).label).toBe("name fixture-nested, as pointers name it: ");
    await h.keys("escape");
    // d: the whole vault, said so.
    await h.keys("d");
    expect(prompt(h).label).toMatch(/^Delete the root fixture-nested \(nested-vault\/, 1 note\)\? 1 link to it will break\./); // by its path
    await h.keys("escape");
    // R: the vault's name; its folder stays.
    await h.keys("shift+r");
    expect(prompt(h)).toMatchObject({ label: "name fixture-nested, as pointers name it: ", text: "fixture-nested" });
    await h.keys("ctrl+u");
    await type(h, "inner-box");
    await h.keys("enter", "enter");
    expect(readFileSync(join(root, "nested-vault", ".slipbox", "config.toml"), "utf8")).toContain('name = "inner-box"');
    expect(existsSync(join(root, "nested-vault"))).toBe(true);
    // r: its folder; links into it by path fixed.
    h.app.selectInExplorer("nested-vault");
    await h.keys("r", "ctrl+u");
    await type(h, "box");
    await h.keys("enter");
    expect((h.app.overlay as ListOverlay).title).toStartWith("nested-vault/ → box/");
    await h.keys("enter");
    expect(existsSync(join(root, "box", "inner.md"))).toBe(true);
    expect(readFileSync(join(root, "vault-links.md"), "utf8")).toBe("[in](box/inner.md)\n");
    expect(h.app.explorerRows().some((r) => r.path === "box" && r.root?.kind === "vault")).toBe(true);
  });

  test("v gives a folder .slipbox/ (its name asked, the links previewed); V makes it a plain folder again (18.11, 21.10)", async () => {
    const root = makeVault();
    const h = await at(root, "notes");
    const index = () => readFileSync(join(root, "index.md"), "utf8");
    const before = index();
    await h.keys("v");
    expect(prompt(h)).toMatchObject({ label: "give notes/ its .slipbox/, called (empty: no name): ", text: "fixture-notes" });
    await h.keys("enter");
    const preview = h.app.overlay as ListOverlay;
    expect(preview.title).toMatch(/^notes\/ → a root of its own, called fixture-notes: \d+ changes? in \d+ files?/);
    expect(existsSync(join(root, "notes", ".slipbox"))).toBe(false); // nothing yet
    await h.keys("enter");
    expect(existsSync(join(root, "notes", ".slipbox", "config.toml"))).toBe(true);
    expect(index()).toBe(before); // a path still reaches its notes: nothing to rewrite
    expect(readFileSync(join(root, "notes", "alpha.md"), "utf8")).toContain("Back to [index](../index.md) and on to [beta](beta.md).");
    // The explorer: its row a vault's now, selected; its notes the new vault's.
    const row = h.app.explorerRows()[h.app.sidebar.selected]!;
    expect(row).toMatchObject({ path: "notes", kind: "root" });
    expect(h.app.graph.notes.has("notes/alpha.md")).toBe(false);
    expect(h.app.messages.at(-1)!.text).toMatch(/^made notes\/ a root of its own, called fixture-notes/);
    // V: back.
    await h.keys("shift+v");
    expect((h.app.overlay as ListOverlay).title).toMatch(/^notes\/ → a plain folder of fixture/);
    await h.keys("enter");
    expect(existsSync(join(root, "notes", ".slipbox"))).toBe(false);
    expect(index()).toBe(before);
    expect(h.app.graph.notes.has("notes/alpha.md")).toBe(true);
    expect(h.app.explorerRows()[h.app.sidebar.selected]).toMatchObject({ path: "notes", kind: "dir" });
    // The name cleared: a root of its own, unnamed (21.10).
    await h.keys("v");
    (h.app.overlay as { text: string }).text = "";
    await h.keys("enter");
    expect((h.app.overlay as ListOverlay).title).toMatch(/^notes\/ → a root of its own: /);
    await h.keys("escape");
    // On a note, and on a vault for v: said so.
    h.app.selectInExplorer("notes/alpha.md");
    await h.keys("v");
    expect(h.app.messages.at(-1)!.text).toContain("select a folder first");
  });

  test("space n notes, space d folders, space v vaults: which-key lists them; the explorer's selection, or this note (18.13)", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    const group = async (...keys: string[]) => {
      await h.keys("space", ...keys);
      const out = Object.fromEntries(h.app.whichKeyEntries().map((e) => [e.key, e.label]));
      await h.keys("escape");
      return out;
    };
    expect(await group("n")).toMatchObject({ n: "New note", m: "Rename or move the note", "shift+m": "Move the note to a folder…", d: "Delete the note", y: "Copy the note, to paste", x: "Cut the note, to paste", "shift+y": "Duplicate the note" });
    expect(await group("d")).toMatchObject({ n: "New folder", r: "Rename the folder", m: "Move the folder…", d: "Delete the folder", y: "Copy the folder, to paste", x: "Cut the folder, to paste", p: "Paste into the folder" });
    expect(await group("v")).toMatchObject({ m: "Give a folder .slipbox/", "shift+m": "Take .slipbox/ away", n: "Name this folder, as pointers name it", t: "The trash", u: "Restore the last deleted", v: "Folders: go into a named one", "shift+v": "Which copy a folder's links open" });
    expect(await group("v")).not.toHaveProperty("d"); // a new folder is space d n now
    // From the note: it, its folder, this vault.
    await h.keys("space", "n", "shift+m");
    expect((h.app.overlay as ListOverlay).title).toStartWith("Move notes/alpha.md to…");
    await h.keys("escape", "space", "d", "r");
    expect(prompt(h)).toMatchObject({ label: "rename notes/ to: ", text: "notes" });
    await h.keys("escape", "space", "d", "m");
    expect((h.app.overlay as ListOverlay).title).toStartWith("Move notes/ to…");
    await h.keys("escape", "space", "d", "d");
    expect(prompt(h)).toMatchObject({ confirm: true, label: expect.stringMatching(/^Delete notes\/ and everything in it\?/) });
    await h.keys("escape", "space", "n", "y", "space", "d", "p");
    expect(existsSync(join(root, "notes", "alpha-copy.md"))).toBe(true);
    await h.keys("space", "v", "m");
    expect(prompt(h)).toMatchObject({ label: "give notes/ its .slipbox/, called (empty: no name): " });
    await h.keys("escape", "space", "n", "d", "y");
    expect(existsSync(join(root, "notes", "alpha.md"))).toBe(false);
    await h.keys("space", "v", "u");
    expect(existsSync(join(root, "notes", "alpha.md"))).toBe(true);
    await h.keys("space", "v", "shift+m"); // this vault isn't nested in another
    expect(h.app.messages.at(-1)!.text).toContain("isn't inside another root");
    await h.keys("space", "n", "shift+y");
    expect(h.app.view!.buf.rel).toBe("notes/alpha-copy-2.md");
    // A note at the root has no folder for space d.
    await h.app.run("note.open index.md");
    await h.keys("space", "d", "r");
    expect(h.app.messages.at(-1)!.text).toContain("index.md is at the root");
    // With the explorer focused: its selected row — a folder for space d, a note for space n, a vault for space v.
    const e = await at(root, "projects");
    await e.keys("space", "d", "r");
    expect(prompt(e).label).toBe("rename projects/ to: ");
    await e.keys("escape", "space", "n", "d");
    expect(e.app.messages.at(-1)!.text).toContain("space n acts on a note");
    await e.keys("space", "v", "m");
    expect(prompt(e).label).toBe("give projects/ its .slipbox/, called (empty: no name): ");
    const v = await at(root, "nested-vault");
    await v.keys("space", "v", "n");
    expect(prompt(v).label).toBe("name fixture-nested, as pointers name it: ");
    await v.keys("escape", "space", "v", "shift+m");
    expect((v.app.overlay as ListOverlay).title).toMatch(/^nested-vault\/ → a plain folder of fixture/);
  });

  test("space v shift+m inside a vault nested in another: made a plain folder of it, and into it, the note still open (18.13)", async () => {
    const root = makeVault();
    writeFileSync(join(root, "to-nested.md"), "[inner](nested-vault/inner.md)\n");
    const h = await harness({ root: join(root, "nested-vault"), open: "inner.md" });
    expect(h.app.loc.name).toBe("fixture-nested");
    await h.keys("space", "v", "shift+m");
    expect((h.app.overlay as ListOverlay).title).toMatch(/^nested-vault\/ → a plain folder of fixture/);
    await h.keys("enter");
    expect(existsSync(join(root, "nested-vault", ".slipbox"))).toBe(false);
    expect(h.app.loc.root).toBe(root);
    expect(h.app.view!.buf.rel).toBe("nested-vault/inner.md");
    expect(readFileSync(join(root, "to-nested.md"), "utf8")).toBe("[inner](nested-vault/inner.md)\n"); // a path: nothing to rewrite
  });

  test("filters: each word as typed, in any order — the explorer's (its name lit where it matched) and the palette's (3.16)", async () => {
    const root = makeVault();
    const h = await at(root, "index.md");
    await h.keys("/");
    await type(h, "alpha notes");
    expect(h.app.explorerRows().filter((r) => r.kind === "note").map((r) => r.path)).toEqual(["notes/alpha.md"]);
    await h.keys("ctrl+u");
    await type(h, "al");
    const al = h.app.explorerRows().filter((r) => r.kind === "note").map((r) => r.path);
    expect(al).toContain("notes/alpha.md");
    expect(al.filter((p) => !p.toLowerCase().includes("al"))).toEqual([]); // never a…l scattered
    const c = h.canvas();
    const rowsNow = c.toString().split("\n");
    const y = rowsNow.findIndex((r) => r.includes("alpha.md"));
    const x = [...rowsNow[y]!.slice(0, rowsNow[y]!.indexOf("alpha.md"))].length; // its column
    const lit = h.app.theme.roles.overlay_match.fg;
    expect(c.styles[y]![x]!.fg).toBe(lit!); // "al" lit
    expect(c.styles[y]![x + 1]!.fg).toBe(lit!);
    expect(c.styles[y]![x + 2]!.fg).not.toBe(lit!); // "p" not
    // A word matching the folder: the name's own match still lit.
    await h.keys("ctrl+u");
    await type(h, "notes al");
    const c2 = h.canvas();
    expect(c2.styles[y]![x]!.fg).toBe(lit!);
    expect(c2.styles[y]![x + 1]!.fg).toBe(lit!);
    // The palette: both words, in the label first.
    await h.keys("escape", "escape", ":");
    await type(h, "folder move");
    const labels = (h.app.overlay as ListOverlay).filtered.map((e) => e.item.label);
    expect(labels.slice(0, 2)).toEqual(["Move the folder…", "Move the note to a folder…"]);
    expect(labels).not.toContain("Delete the note");
  });

  test("the move picker is a tree: the explorer's folds, ← → fold, typing filters under the parents (18.8)", async () => {
    const root = makeVault();
    mkdirSync(join(root, "projects", "deep", "deeper"), { recursive: true });
    writeFileSync(join(root, "projects", "deep", "deeper", "d.md"), "# d\n");
    const h = await at(root, "notes/alpha.md");
    h.app.graph.build(false);
    h.app.expanded.delete("projects");
    await h.keys("m");
    const o = () => h.app.overlay as ListOverlay;
    const labels = () => o().filtered.map((e) => e.item.label.trim());
    expect(labels()[0]).toBe("▾ / (the root)");
    expect(labels()).toContain("▾ notes"); // where it is: unfolded, as in the explorer (no folders in it), marked, selected
    expect(o().filtered[o().selected]!.item).toMatchObject({ data: "notes", hint: "here" });
    expect(labels()).toContain("▸ projects"); // folded, as in the explorer
    expect(labels()).not.toContain("▸ deep");
    // → unfolds projects.
    const at_ = o().filtered.findIndex((e) => e.item.data === "projects");
    o().selected = at_;
    await h.keys("right");
    expect(labels()).toContain("▸ deep");
    await h.keys("left");
    expect(labels()).not.toContain("▸ deep");
    // Typing: the matches, under their parents, unfolded; the first match selected, not a parent.
    await type(h, "deeper");
    expect(o().filtered.map((e) => e.item.data)).toEqual(["", "projects", "projects/deep", "projects/deep/deeper"]);
    expect(o().selected).toBe(3);
    await h.keys("enter");
    expect((h.app.overlay as ListOverlay).title).toStartWith("notes/alpha.md → projects/deep/deeper/alpha.md");
    // A folder the explorer has unfolded is unfolded here, its folders shown.
    await h.keys("escape");
    h.app.expanded.add("projects");
    await h.keys("m");
    expect(labels()).toContain("▾ projects");
    expect(labels()).toContain("▸ deep");
  });
});

describe("tags (1.6)", () => {
  const setup = async () => {
    const root = makeVault();
    writeFileSync(join(root, "tagged.md"), "# Tagged\n\nAbout #cupola/hatch and #notion.\n");
    writeFileSync(join(root, "other-tagged.md"), "---\ntags: [cupola]\n---\n# Other\n\n#Notion too\n");
    return { root, h: await harness({ root, open: "tagged.md" }) };
  };
  const onTag = (h: Harness, name: string) => {
    const v = h.app.view!;
    const l = h.app.currentLayout(v).links.find((x) => x.kind === "tag" && x.target === name)!;
    h.app.moveCursor(v, { row: l.line, col: l.col });
  };

  test("space f t lists the tags with their counts; a tag lists its notes; one opens", async () => {
    const { h } = await setup();
    await h.keys("space", "f", "t");
    const list = h.app.overlay as ListOverlay;
    expect(list.title).toMatch(/^Tags \(\d+\)/);
    const dome = list.items.find((i) => i.label === "#cupola")!;
    expect(dome.hint).toBe("2 notes"); // tagged.md's #cupola/hatch counts for #cupola
    expect(list.items.find((i) => i.label === "#cupola/hatch")).toMatchObject({ indent: 1, hint: "1 note" });
    expect(list.items.find((i) => i.label === "#Notion")!.hint).toBe("2 notes"); // #notion is #Notion, as first written (by path)
    list.selected = list.filtered.findIndex((e) => e.item === dome);
    await h.keys("enter");
    const notes = h.app.overlay as ListOverlay;
    expect(notes.title).toBe("#cupola — 2 notes");
    expect(notes.items.map((i) => i.data)).toEqual(["other-tagged.md", "tagged.md"]);
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("other-tagged.md");
    // A save shows at once: a tag written in is listed.
    h.app.writeBuffer(h.app.view!.buf, "---\ntags: [cupola]\n---\n# Other\n\n#Notion and #freshly-added\n");
    await h.keys("space", "f", "t");
    expect((h.app.overlay as ListOverlay).items.some((i) => i.label === "#freshly-added")).toBe(true);
  });

  test("a #tag in the text: its own colour; followed, its notes — rendered and in source mode; :tag name too", async () => {
    const { h } = await setup();
    onTag(h, "notion");
    expect(statusRow(h.frame())).toContain("→ #notion");
    await h.app.run("link.follow");
    expect((h.app.overlay as ListOverlay).title).toBe("#Notion — 2 notes");
    await h.keys("escape");
    // Source mode: the tag in the text.
    await h.app.run("view.source");
    const v = h.app.view!;
    const row = h.app.currentLayout(v).lines.findIndex((l) => l.spans.map((s) => s.text).join("").includes("#cupola/hatch"));
    const text = h.app.currentLayout(v).lines[row]!.spans.map((s) => s.text).join("");
    h.app.moveCursor(v, { row, col: [...text.slice(0, text.indexOf("#cupola/hatch") + 2)].length });
    await h.app.run("link.follow");
    expect((h.app.overlay as ListOverlay).title).toBe("#cupola/hatch — 1 note");
    await h.keys("escape", ":");
    for (const c of "tag cupola") await h.keys(c === " " ? "space" : c);
    await h.keys("enter");
    expect((h.app.overlay as ListOverlay).title).toBe("#cupola — 2 notes");
  });
});

describe("footnotes in the right panel (3.17)", () => {
  const NOTE = "# Notes\n\nFirst claim[^one] and a second[^Two].\n\nAgain the first[^one].\n\n[^one]: The first source.\n[^two]: The second, on\n    two lines.\n[^spare]: Nothing refers to this.\n";
  const setup = async () => {
    const root = makeVault();
    writeFileSync(join(root, "fn.md"), NOTE);
    return await harness({ root, open: "fn.md", width: 140 });
  };
  const rows = (h: Harness) => h.app.footnoteRows().map((r) => r.text);

  test("space n f shows them beside the note: each footnote, its references unfolded under it; the rail's button under the outline's", async () => {
    const h = await setup();
    await h.keys("space", "n", "f");
    expect(h.app.rightView).toBe("footnotes");
    expect(h.app.region).toBe("outline");
    expect(rows(h)).toEqual(["[one] The first source.", "[two] The second, on two lines.", "[spare] Nothing refers to this."]);
    const f = h.frame();
    expect(f).toContain("Footnotes");
    expect(f).toMatch(/\[one\] The first source\.\s+2×/);
    expect(f).toMatch(/\[spare\] Nothing refe\S*…\s+unused/); // cut to keep its count in sight
    expect(h.app.geometry!.scrollbars.some((b) => b.pane === "outline" && b.horizontal)).toBe(false);
    expect(statusRow(f)).toContain("FOOTNOTES");
    // The right rail: the outline's button, then this one under it, lit.
    const hot = (id: string) => h.app.geometry!.hot.find((x) => x.id === id)!;
    expect(hot("btn:footnotes").y).toBe(hot("btn:outline").y + 1);
    // l unfolds a footnote's references, each with its line; h folds them back.
    await h.keys("l");
    expect(rows(h).slice(0, 3)).toEqual(["[one] The first source.", "L3  First claim[^one] and a second[^Two].", "L5  Again the first[^one]."]);
    await h.keys("h");
    expect(rows(h)).toHaveLength(3);
  });

  test("enter jumps to the definition, or a reference; unfocused, the selection follows the cursor", async () => {
    const h = await setup();
    await h.keys("space", "n", "f", "l", "j", "j", "enter"); // [one]'s second reference
    expect(h.app.region).toBe("content");
    const v = h.app.view!;
    const link = h.app.currentLayout(v).links[h.app.linkUnderCursor(v)]!;
    expect(link).toMatchObject({ kind: "footnote", src: 5 });
    // Following the cursor, unfocused: onto [two]'s definition, its row.
    h.app.moveCursor(v, { row: h.app.currentLayout(v).lines.findIndex((l) => l.footnoteDef === "two"), col: 0 });
    h.frame();
    expect(h.app.footnoteRows()[h.app.outline.selected]!.text).toBe("[two] The second, on two lines.");
    // A footnote's own row: its definition.
    await h.keys("space", "n", "f", "g", "g", "h", "j", "enter"); // [one] folded again, then [two] (its definition's label)
    expect(h.app.currentLayout(v).lines[v.cur.row]!.footnoteDef).toBe("two");
    // In source mode: the source's place.
    await h.app.run("view.source");
    await h.keys("space", "n", "f", "g", "g", "enter");
    expect(h.app.cursorLine(h.app.view!)).toBe(7);
  });

  test("the buttons switch the panel's view, each keeping its place; / filters; :footnotes", async () => {
    const h = await setup();
    const click = (id: string) => {
      const r = h.app.geometry!.hot.find((x) => x.id === id)!;
      h.app.handleMouse({ type: "down", x: r.x + 1, y: r.y, button: 0 });
      h.app.handleMouse({ type: "up", x: r.x + 1, y: r.y, button: 0 });
      h.frame();
    };
    h.frame();
    click("btn:footnotes");
    expect(h.app.rightView).toBe("footnotes");
    await h.keys("j", "j");
    click("btn:outline");
    expect(h.app.rightView).toBe("outline");
    expect(h.frame()).toContain("Outline");
    click("btn:footnotes");
    expect(h.app.outline.selected).toBe(2); // where it was
    click("btn:footnotes"); // its own button again: hidden
    expect(h.app.outlineShown).toBe(false);
    await h.keys(":");
    for (const ch of "footnotes") await h.keys(ch);
    await h.keys("enter");
    expect(h.app.outlineShown).toBe(true);
    await h.keys("/", "s", "e", "c");
    expect(rows(h)).toEqual(["[two] The second, on two lines."]);
  });
});

describe("adding and changing footnotes (3.18)", () => {
  const NOTE = "# Notes\n\nThe dome logged nights and more nights, see [alpha](notes/alpha.md) here.\n\n[^old]: An old one.\n";
  const setup = async (source = NOTE) => {
    const root = makeVault();
    writeFileSync(join(root, "fn.md"), source);
    const h = await harness({ root, open: "fn.md", width: 140 });
    return { root, h, read: () => readFileSync(join(root, "fn.md"), "utf8") };
  };
  const prompt = (h: Harness) => h.app.overlay as import("../src/tui/app.ts").PromptOverlay;
  const type = async (h: Harness, text: string) => {
    for (const c of text) await h.keys(c === " " ? "space" : c);
  };
  /** Put the cursor on the `nth` occurrence of `word` as drawn (rendered, or source). */
  const onWord = (h: Harness, word: string, nth = 0, offset = 0) => {
    const v = h.app.view!;
    const lines = h.app.currentLayout(v).lines;
    let seen = 0;
    for (let row = 0; row < lines.length; row++) {
      const t = lines[row]!.spans.map((s) => s.text).join("");
      for (let i = t.indexOf(word); i >= 0; i = t.indexOf(word, i + 1)) {
        if (seen++ === nth) return h.app.moveCursor(v, { row, col: stringWidth(t.slice(0, i)) + offset });
      }
    }
    throw new Error(`no ${word}`);
  };

  test("space n shift+f in the render: its text asked; [^N] after the word the cursor is on, [^N]: text at the end; one undo step", async () => {
    const { h, read } = await setup();
    onWord(h, "nights", 1, 2); // the second "nights", inside it
    await h.keys("space", "n", "shift+f");
    expect(prompt(h).label).toBe("Add a footnote — its text:");
    await type(h, "Counted by hand");
    await h.keys("enter");
    expect(read()).toBe("# Notes\n\nThe dome logged nights and more nights[^1], see [alpha](notes/alpha.md) here.\n\n[^old]: An old one.\n[^1]: Counted by hand\n");
    expect(h.app.messages.at(-1)!.text).toBe("added footnote [^1]");
    expect(h.app.view!.buf.dirty).toBe(false); // saved
    await h.keys("ctrl+z");
    expect(h.app.view!.buf.source).toBe(NOTE); // both edits, one step
    // On a link's word: after the link, never inside its brackets.
    onWord(h, "alpha");
    await h.keys("space", "n", "shift+f");
    await type(h, "Linked");
    await h.keys("enter");
    expect(read()).toContain("see [alpha](notes/alpha.md)[^1] here.");
  });

  test("in source mode: after the word under the cursor; a note without footnotes gets them after a blank line", async () => {
    const { h, read } = await setup("# Plain\n\nJust a claim here.\n");
    await h.app.run("view.source");
    onWord(h, "claim", 0, 1);
    await h.app.run("footnote.add");
    await type(h, "Source");
    await h.keys("enter");
    expect(read()).toBe("# Plain\n\nJust a claim[^1] here.\n\n[^1]: Source\n");
  });

  test("the footnotes view: a adds, e edits its text, r renames it everywhere, d deletes it; its + button adds", async () => {
    const { h, read } = await setup("# N\n\nOne[^a] and two[^a].\n\n[^a]: Alpha,\n    continued.\n");
    await h.keys("space", "n", "f");
    await h.keys("e");
    expect(prompt(h)).toMatchObject({ label: "Footnote [^a] — its text:", text: "Alpha, continued." });
    await h.keys("ctrl+u");
    await type(h, "Rewritten");
    await h.keys("enter");
    expect(read()).toBe("# N\n\nOne[^a] and two[^a].\n\n[^a]: Rewritten\n");
    await h.keys("r", "ctrl+u");
    await type(h, "src");
    await h.keys("enter");
    expect(read()).toBe("# N\n\nOne[^src] and two[^src].\n\n[^src]: Rewritten\n");
    // The + on its title: a new one, at the note's cursor.
    const plus = h.app.geometry!.hot.find((x) => x.id === "fn:add")!;
    h.app.handleMouse({ type: "down", x: plus.x + 1, y: plus.y, button: 0 });
    h.app.handleMouse({ type: "up", x: plus.x + 1, y: plus.y, button: 0 });
    expect(prompt(h).label).toBe("Add a footnote — its text:");
    await type(h, "Second");
    await h.keys("enter");
    expect(read()).toMatch(/\[\^src\]: Rewritten\n\[\^1\]: Second\n$/);
    // d: after asking.
    h.app.region = "outline";
    h.app.outline.selected = h.app.footnoteRows().findIndex((r) => r.fn.label === "src");
    await h.keys("d");
    expect(prompt(h)).toMatchObject({ confirm: true, label: "Delete footnote [^src]: its definition and 2 references?" });
    await h.keys("y");
    expect(read()).not.toContain("[^src]");
    expect(h.app.footnoteRows().map((r) => r.fn.label)).toEqual(["1"]);
  });
});

describe("the Info view (3.19)", () => {
  const NOTE = "---\ntitle: Planning\nowner:\n  name: Rosa\n  desk: 2\ntags: [Plan]\n---\n# Planning\n\nSee [alpha](notes/alpha.md) and [missing](missing.md). #idea\n\n- [x] one\n- [ ] two\n";
  const setup = async () => {
    const root = makeVault();
    writeFileSync(join(root, "info.md"), NOTE);
    writeFileSync(join(root, "linker.md"), "[info](info.md)\n");
    return await harness({ root, open: "info.md", width: 140 });
  };
  const rows = (h: Harness) => h.app.infoRows().map((r) => (r.heading ? `# ${r.key}` : `${"  ".repeat(r.depth)}${r.key}: ${r.value}`));

  test("space n i: the file on screen — where, which root, its counts and state; its properties, tags and links; the rail's button above ▤", async () => {
    const h = await setup();
    await h.keys("space", "n", "i");
    expect(h.app.rightView).toBe("info");
    expect(h.app.region).toBe("outline");
    const r = rows(h);
    expect(r).toContain("path: info.md");
    // Qualified by its folder when other copies are known (20.6).
    expect(r.find((row) => row.startsWith("root: "))).toBe("root: fixture"); // its name, as pointers give it (21.9)
    expect(r).toContain("kind: note (markdown)");
    expect(r).toContain("state: saved");
    expect(r.slice(r.indexOf("# Properties"), r.indexOf("# Tags"))).toEqual(["# Properties", "title: Planning", "owner: ", "  name: Rosa", "  desk: 2", "tags: Plan"]);
    expect(r.slice(r.indexOf("# Tags"), r.indexOf("# Links"))).toEqual(["# Tags", "#Plan: ", "#idea: "]);
    expect(r).toContain("links: 2 (1 unresolved)");
    expect(r).toContain("backlinks: 1");
    expect(r).toContain("tasks: 1 of 2 done");
    expect(statusRow(h.frame())).toContain("INFO");
    const hot = (id: string) => h.app.geometry!.hot.find((x) => x.id === id)!;
    expect(hot("btn:outline").y).toBe(hot("btn:info").y + 1);
    // A change shows: unsaved.
    await h.keys("escape");
    h.app.view!.buf.edit(0, 0, "x");
    expect(rows(h)).toContain("state: unsaved changes");
    h.app.saveBuffer(h.app.view!.buf);
    expect(rows(h)).toContain("state: saved"); // a save doesn't change the text: still shown
    // Another note's link to it counts at once.
    writeFileSync(join(h.root, "linker2.md"), "[info](info.md)\n");
    const st = statSync(join(h.root, "linker2.md"));
    h.app.graph.updateFile("linker2.md", { rel: "linker2.md", abs: join(h.root, "linker2.md"), size: st.size, mtimeMs: st.mtimeMs });
    expect(rows(h)).toContain("backlinks: 2");
  });

  test("the filter's enter on a section heading folds that section, not the row at its index unfiltered", async () => {
    const h = await setup();
    await h.keys("space", "n", "i");
    expect(h.app.region).toBe("outline");
    await h.keys("/", ..."links");
    expect(h.app.infoRows()[h.app.outline.selected]).toMatchObject({ heading: true, section: "Links" });
    await h.keys("enter");
    expect([...h.app.infoFolded]).toEqual(["Links"]);
    expect(h.app.infoRows()[h.app.outline.selected]).toMatchObject({ heading: true, section: "Links" });
  });

  test("a note's links' convention in its Links, and what said each part: the root's tool, its notes, one written since (21.4)", async () => {
    // An Obsidian vault: its settings say all three.
    const vault = mkdtempSync(join(tmpdir(), "slipbox-conv-tui-"));
    mkdirSync(join(vault, ".obsidian"));
    writeFileSync(join(vault, ".obsidian", "app.json"), '{"newLinkFormat": "relative"}\n');
    writeFileSync(join(vault, "a.md"), "# A\n\n[[b]]\n");
    writeFileSync(join(vault, "b.md"), "# B\n");
    const h = await harness({ root: vault, open: "a.md" });
    await h.keys("space", "n", "i");
    const r = rows(h);
    const at = r.indexOf("writes: wikilinks");
    expect(r.slice(at, at + 4)).toEqual(["writes: wikilinks", "  path: relative", "  .md: dropped", "  from: Obsidian"]);
    // y copies it whole.
    h.app.outline.selected = h.app.infoRows().findIndex((x) => x.key === "writes");
    h.app.region = "outline";
    await h.keys("y");
    expect(h.copied.at(-1)).toBe("wikilinks, relative, without .md — Obsidian's .obsidian/app.json");
    // A folder of notes: theirs, every note counted; a note written since counts at once.
    const notes = mkdtempSync(join(tmpdir(), "slipbox-conv-tui-notes-"));
    mkdirSync(join(notes, ".slipbox"));
    for (let i = 0; i < 6; i++) writeFileSync(join(notes, `n${i}.md`), `# N${i}\n\n[next](/n${(i + 1) % 6})\n`);
    const n = await harness({ root: notes, open: "n0.md" });
    await n.keys("space", "n", "i");
    expect(rows(n).slice(rows(n).indexOf("writes: markdown"), rows(n).indexOf("writes: markdown") + 4)).toEqual(["writes: markdown", "  path: from the root", "  .md: dropped", "  from: notes 100%"]);
    for (const [f, text] of [["m1.md", "[a](n1.md) [b](n2.md)\n"], ["m2.md", "[c](./n3.md)\n"]]) {
      writeFileSync(join(notes, f!), text!);
      const st = statSync(join(notes, f!));
      n.app.graph.updateFile(f!, { rel: f!, abs: join(notes, f!), size: st.size, mtimeMs: st.mtimeMs });
    }
    // 6 of 9 from the root: two-thirds still; 6 of 9 without .md too — each part's own source now.
    const mixed = rows(n);
    const m = mixed.indexOf("writes: markdown (notes 100%)");
    expect(mixed.slice(m, m + 3)).toEqual(["writes: markdown (notes 100%)", "  path: from the root (notes 67%)", "  .md: dropped (notes 67%)"]);
    expect(mixed[m + 3] ?? "").not.toMatch(/^ {2}from:/); // each part says its own
  });

  test("enter opens what a row names: a property's line, a tag's notes, the backlinks; y copies; h folds a section; / filters", async () => {
    const h = await setup();
    await h.keys("space", "n", "i");
    const select = (label: string) => {
      h.app.outline.selected = h.app.infoRows().findIndex((r) => (r.heading ? `# ${r.key}` : r.key) === label);
      h.app.region = "outline";
    };
    select("title");
    await h.keys("enter");
    expect(h.app.region).toBe("content");
    expect(h.app.cursorLine(h.app.view!)).toBe(2); // its line in the frontmatter
    // A nested key: its own line in source mode (rendered, its map's row shows it).
    await h.app.run("view.source");
    select("desk");
    await h.keys("enter");
    expect(h.app.cursorLine(h.app.view!)).toBe(5);
    await h.app.run("view.source");
    select("#idea");
    await h.keys("enter");
    expect((h.app.overlay as ListOverlay).title).toBe("#idea — 1 note");
    await h.keys("escape");
    select("backlinks");
    await h.keys("enter");
    expect((h.app.overlay as ListOverlay).title).toBe("Linking to info.md (1)"); // the backlinks list
    await h.keys("escape");
    select("path");
    await h.keys("y");
    expect(h.copied.at(-1)).toBe(join(h.root, "info.md"));
    select("# Properties");
    await h.keys("h");
    expect(rows(h)).not.toContain("title: Planning");
    await h.keys("l");
    expect(rows(h)).toContain("title: Planning");
    await h.keys("/", "r", "o", "s", "a");
    expect(rows(h)).toEqual(["# Properties", "  name: Rosa"]);
  });
});

describe("the properties editor: a note's frontmatter in a floating window (3.20)", () => {
  const setup = async (source: string) => {
    const root = makeVault();
    writeFileSync(join(root, "p.md"), source);
    const h = await harness({ root, open: "p.md", width: 140, height: 36 });
    return { h, read: () => readFileSync(join(root, "p.md"), "utf8") };
  };
  const type = async (h: Harness, text: string) => {
    for (const c of text) await h.keys(c === " " ? "space" : c);
  };
  const ask = (h: Harness) => h.app.overlay as import("../src/tui/app.ts").PromptOverlay;

  test("space n shift+p: the YAML in a floating editor with every editing key; esc closes it, writing back — one undo step in the note", async () => {
    const { h, read } = await setup("---\ntitle: T\ntags: [a]\n---\n# T\n\nBody.\n");
    await h.keys("space", "n", "shift+p");
    const f = h.app.floating!;
    expect(f.view.buf.source).toBe("title: T\ntags: [a]\n");
    expect(f.view.buf.kind).toEqual({ group: "data", format: "yaml" });
    expect(h.app.view).toBe(f.view); // the keys act on it
    const frame = h.frame();
    expect(frame).toContain("Properties — p.md (YAML)");
    expect(frame).toContain("esc · q closes, writing back");
    await h.keys("shift+g", "o");
    await type(h, "status: new");
    await h.keys("escape", "escape");
    expect(h.app.floating).toBeNull();
    expect(read()).toBe("---\ntitle: T\ntags: [a]\nstatus: new\n---\n# T\n\nBody.\n");
    expect(h.app.messages.at(-1)!.text).toBe("properties written to p.md");
    await h.keys("ctrl+z");
    expect(h.app.view!.buf.source).toBe("---\ntitle: T\ntags: [a]\n---\n# T\n\nBody.\n");
  });

  test("a CRLF note's frontmatter opens with its properties and is rewritten in place, CRLF kept", async () => {
    const { h, read } = await setup("---\r\ntitle: T\r\n---\r\n# T\r\n\r\nBody.\r\n");
    await h.app.run("note.properties");
    expect(h.app.floating!.view.buf.source).toBe("title: T\n");
    await h.keys("shift+g", "o");
    await type(h, "status: new");
    await h.keys("escape", "escape");
    expect(h.app.floating).toBeNull();
    expect(read()).toBe("---\r\ntitle: T\r\nstatus: new\r\n---\r\n# T\r\n\r\nBody.\r\n");
  });

  test("an empty frontmatter opens empty, never as the body up to a later rule; a property goes between its fences", async () => {
    const { h, read } = await setup("---\n---\n# T\n\ntext\n\n---\n\nmore\n");
    await h.app.run("note.properties");
    expect(h.app.floating!.view.buf.source).toBe("");
    await h.keys("i");
    await type(h, "title: X");
    await h.keys("escape", "escape");
    expect(h.app.floating).toBeNull();
    expect(read()).toBe("---\ntitle: X\n---\n# T\n\ntext\n\n---\n\nmore\n");
  });

  test("ctrl+s writes and stays; :q closes; a note without properties gets them first; emptied, they go", async () => {
    const { h, read } = await setup("# Plain\n\nBody.\n");
    await h.app.run("note.properties");
    expect(h.app.floating!.view.buf.source).toBe("");
    await h.keys("i");
    await type(h, "title: Fresh");
    await h.keys("escape", "ctrl+s");
    expect(read()).toBe("---\ntitle: Fresh\n---\n# Plain\n\nBody.\n");
    expect(h.app.floating).not.toBeNull(); // still open
    await h.keys("g", "g", "d", "d");
    await h.keys(":", "q", "enter");
    expect(h.app.floating).toBeNull();
    expect(read()).toBe("# Plain\n\nBody.\n");
  });

  test("text that doesn't parse, or properties changed meanwhile, ask first; TOML keeps its fences; the Info's e; a click outside closes", async () => {
    const { h, read } = await setup("+++\ntitle = \"T\"\n+++\n# T\n");
    await h.app.run("note.properties");
    expect(h.frame()).toContain("(TOML)");
    await h.keys("shift+g", "o");
    await type(h, "broken = ");
    await h.keys("escape", "escape");
    expect(ask(h)).toMatchObject({ confirm: true, label: expect.stringMatching(/^The properties don't parse/) });
    await h.keys("n");
    expect(h.app.floating).not.toBeNull(); // still editing
    await h.keys("d", "d", "o");
    await type(h, 'draft = true');
    await h.keys("escape", "escape");
    expect(read()).toBe('+++\ntitle = "T"\ndraft = true\n+++\n# T\n');
    // Changed under it: asks before writing over.
    await h.keys("space", "n", "i", "e"); // the Info view's e
    expect(h.app.floating).not.toBeNull();
    const note = h.app.tab!.views[0]!.buf;
    note.edit(4, 0, "x");
    await h.keys("o");
    await type(h, "more = 1");
    await h.keys("escape", "escape");
    expect(ask(h).label).toMatch(/properties changed while you edited them/);
    await h.keys("y");
    expect(h.app.floating).toBeNull();
    expect(read()).toBe('+++\ntitle = "T"\nmore = 1\ndraft = true\n+++\n# T\n'); // yours over theirs (the x)
    // A click outside its box closes it.
    await h.app.run("note.properties");
    h.frame();
    h.app.handleMouse({ type: "down", x: 1, y: 30, button: 0 });
    h.app.handleMouse({ type: "up", x: 1, y: 30, button: 0 });
    expect(h.app.floating).toBeNull();
  });

  test("quitting writes the properties back first (ctrl+q, :x); text that doesn't parse asks, the app kept; :wa writes them", async () => {
    const { h, read } = await setup("---\ntitle: A\n---\n# A\n");
    await h.app.run("note.properties");
    await h.keys("o");
    await type(h, "x: 1");
    await h.keys("escape", "ctrl+q");
    expect(read()).toBe("---\ntitle: A\nx: 1\n---\n# A\n");
    expect(h.quit.called).toBe(true);
    // Not parsing: asked, still open, not quit.
    const b = await setup("---\ntitle: A\n---\n# A\n");
    await b.h.app.run("note.properties");
    await b.h.keys("o");
    await type(b.h, "broken: [");
    await b.h.keys("escape", ":", "x", "enter");
    expect(ask(b.h)).toMatchObject({ confirm: true, label: expect.stringMatching(/^The properties don't parse/) });
    expect(b.h.quit.called).toBe(false);
    expect(b.read()).toBe("---\ntitle: A\n---\n# A\n");
    // :wa: written, and said so; the editor stays.
    const c = await setup("---\ntitle: A\n---\n# A\n");
    await c.h.app.run("note.properties");
    await c.h.keys("o");
    await type(c.h, "y: 2");
    await c.h.keys("escape", ":", "w", "a", "enter");
    expect(c.read()).toBe("---\ntitle: A\ny: 2\n---\n# A\n");
    expect(c.h.app.messages.at(-1)!.text).toBe("saved 1 note");
    expect(c.h.app.floating).not.toBeNull();
  });

  test("a click on another tab (or a side pane) closes it, writing back, and does nothing else", async () => {
    const { h, read } = await setup("---\ntitle: A\n---\n# A\n");
    await h.app.run("tab.new");
    await h.app.run("note.open index.md");
    await h.app.run("tab.prev");
    expect(h.app.activeTab).toBe(0);
    await h.app.run("note.properties");
    await h.keys("o");
    await type(h, "x: 1");
    await h.keys("escape");
    h.frame();
    const tab = h.app.geometry!.tabs.find((t) => t.index === 1)!;
    h.app.handleMouse({ type: "down", x: tab.x + 1, y: tab.y, button: 0 });
    h.app.handleMouse({ type: "up", x: tab.x + 1, y: tab.y, button: 0 });
    expect(h.app.floating).toBeNull();
    expect(h.app.activeTab).toBe(0); // the click was the editor's closing
    expect(read()).toBe("---\ntitle: A\nx: 1\n---\n# A\n");
    // The explorer: likewise.
    h.app.showSidebar(true);
    await h.app.run("note.properties");
    await h.keys("shift+g", "o");
    await type(h, "z: 3");
    await h.keys("escape");
    h.frame();
    const sb = h.app.geometry!.sidebarPane!;
    h.app.region = "content";
    h.app.handleMouse({ type: "down", x: sb.x + 1, y: sb.y + 1, button: 0 });
    h.app.handleMouse({ type: "up", x: sb.x + 1, y: sb.y + 1, button: 0 });
    expect(h.app.floating).toBeNull();
    expect(h.app.region).toBe("content");
    expect(read()).toBe("---\ntitle: A\nx: 1\nz: 3\n---\n# A\n");
  });
});

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
  const rows = (h: Harness) => h.app.problemRows().map((r) => (r.heading ? `# ${r.label}` : r.note ? `  ${r.label}` : `    ${r.label}  ${r.detail}`));
  const hot = (h: Harness, id: string) => h.app.geometry!.hot.find((x) => x.id === id);
  const click = (h: Harness, at: { x: number; y: number }, times = 1) => {
    for (let i = 0; i < times; i++) for (const type of ["down", "up"]) h.app.handleMouse({ type, x: at.x, y: at.y, button: 0 });
  };

  test("space v p: All — the root's broken links, by note, across the bottom; enter goes there, onto the link", async () => {
    const h = await setup();
    await h.keys("space", "v", "p");
    expect(h.app.problemsPanel).toMatchObject({ shown: true, tab: "all" });
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
    expect(lines[tabsY + 1]).toContain("Broken links (2)");
    expect(h.app.geometry!.problems).toMatchObject({ x: 0, y: tabsY, w: 140 });
    const pane = h.app.geometry!.panes[0]!;
    expect(pane.y + pane.h).toBeLessThan(tabsY);
    // Enter on a problem: its note, the cursor on the link; the panel stays, the note has the keys.
    h.app.problemsPanel.all.selected = 2;
    await h.keys("enter");
    const v = h.app.view!;
    expect(v.buf.rel).toBe("index.md");
    expect(h.app.region).toBe("content");
    expect(h.app.problemsPanel.shown).toBe(true);
    expect(h.app.currentLayout(v).links[h.app.linkUnderCursor(v)]).toMatchObject({ target: "missing.md" });
    // Fixed: gone at once.
    writeFileSync(join(h.root, "missing.md"), "# Missing\n");
    const st = statSync(join(h.root, "missing.md"));
    h.app.graph.updateFile("missing.md", { rel: "missing.md", abs: join(h.root, "missing.md"), size: st.size, mtimeMs: st.mtimeMs });
    expect(rows(h)[0]).toBe("# Broken links (1)");
    // Focused and on All already, the same keys close it.
    await h.keys("space", "v", "p");
    expect(h.app.region).toBe("problems");
    await h.keys("space", "v", "p");
    expect(h.app.problemsPanel.shown).toBe(false);
    expect(h.app.region).toBe("content");
    expect(h.frame()).not.toContain(" This file (");
  });

  test("a section's heading folds; a note's row goes to its first problem; / filters", async () => {
    const h = await setup();
    await h.keys("space", "v", "p");
    h.app.problemsPanel.all.selected = 0;
    await h.keys("h");
    expect(rows(h)[0]).toBe("# Broken links (2)");
    expect(rows(h)[1]).toBe("# Ambiguous links (0)");
    await h.keys("l");
    h.app.problemsPanel.all.selected = 3; // other.md's row
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("other.md");
    await h.keys("space", "v", "p", "/", "t", "w", "i", "n");
    expect(rows(h)).toEqual(["# Orphans (4)", "  a/twin.md", "  b/twin.md"]);
    // The filter after the tabs' titles.
    expect(h.frame().split("\n").find((l) => l.includes(" All (2) "))).toContain("› twin");
    // An orphan's row: the note.
    await h.keys("escape");
    h.app.problemsPanel.all.selected = h.app.problemRows().findIndex((r) => r.section === "Orphans" && r.note === "b/twin.md");
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("b/twin.md");
  });

  test("a double-click in a filtered list goes to the clicked problem, the filter cleared", async () => {
    const h = await setup();
    await h.app.run("note.open a/twin.md");
    await h.keys("space", "v", "p", "/", "n", "o", "p", "e");
    expect(rows(h)).toEqual(["# Broken links (2)", "  other.md", "    L3  nope.png"]);
    h.frame();
    const row = hot(h, "prow:2")!;
    click(h, { x: row.x + 8, y: row.y });
    expect(h.app.view!.buf.rel).toBe("a/twin.md"); // one click selects it
    expect(h.app.problemsPanel.all.selected).toBe(2);
    click(h, { x: row.x + 8, y: row.y }); // the second: a double-click
    expect(h.app.view!.buf.rel).toBe("other.md");
    expect(h.app.problemsPanel.all.filter).toBe("");
  });

  test("This file: every problem of the note with its line, the chosen one marked in the text; moving shows it, enter goes there", async () => {
    const root = makeVault();
    writeFileSync(join(root, "two.md"), "# Two\n\nSee [a](gone-a.png) first.\n\nThen\t[b](gone-b.png) too.\n");
    const h = await harness({ root, open: "two.md", width: 120, height: 40, config: (c) => (c.diagnostics.marks = "off") });
    await h.keys("space", "n", "q");
    expect(h.app.problemsPanel).toMatchObject({ shown: true, tab: "file" });
    expect(h.app.region).toBe("problems");
    expect(h.app.fileProblems().map((p) => `${p.start.line}:${p.start.column} ${p.target}`)).toEqual(["3:5 gone-a.png", "5:6 gone-b.png"]);
    const lines = h.frame().split("\n");
    const tabsY = lines.findIndex((l) => l.includes(" This file (2) "));
    // Two rows each: the sign, line:col, the message, who found it; under it the line, its part marked.
    expect(lines[tabsY + 1]).toMatch(/^ ⚠ 3:5 {2}broken link: gone-a\.png +slipbox unresolved$/);
    expect(lines[tabsY + 2]).toMatch(/^ {4}See \[a\]\(gone-a\.png\) first\./);
    expect(lines[tabsY + 3]).toMatch(/^ ⚠ 5:6 {2}broken link: gone-b\.png/);
    expect(lines[tabsY + 4]).toMatch(/^ {4}Then \[b\]\(gone-b\.png\) too\./); // the tab drawn as a space
    const c = h.canvas();
    const col = (y: number, text: string) => [...lines[y]!.slice(0, lines[y]!.indexOf(text))].length;
    const markAt = (y: number, text: string) => c.styles[y]![col(y, text)]!;
    const warn = h.app.theme.roles.problem_warn;
    expect(markAt(tabsY + 2, "[a]")).toMatchObject(warn.bg ? { bg: warn.bg } : { underline: true });
    expect(markAt(tabsY + 2, "See").underline ?? false).toBe(false);
    // The chosen problem marked in the note while the panel has the keys, the marks off or not.
    const focusBg = h.app.theme.roles.link_focus.bg!;
    const noteRow = (text: string) => lines.findIndex((l, y) => y < tabsY && l.includes(text));
    expect(c.styles[noteRow("See a")]![col(noteRow("See a"), "See a") + 4]!.bg).toBe(focusBg);
    expect(c.styles[noteRow("Then")]![col(noteRow("Then"), "b too")]?.bg ?? null).not.toBe(focusBg);
    // j: the next one — the cursor (and the view) on its line, the panel keeping the keys.
    await h.keys("j");
    expect(h.app.problemsPanel.file.selected).toBe(1);
    expect(h.app.region).toBe("problems");
    const v = h.app.view!;
    expect(srcAt(h.app.currentLayout(v).lines[v.cur.row]!, v.cur.col)).toBe(5);
    // Focus elsewhere: no mark.
    await h.keys("escape");
    expect(h.app.region).toBe("content");
    expect(h.app.chosenProblem()).toBeUndefined();
    // Back, then enter: there, the note has the keys; back (alt+b) returns where it was.
    await h.keys("space", "n", "q");
    expect(h.app.region).toBe("problems");
    h.app.problemsPanel.file.selected = 0;
    await h.keys("enter");
    expect(h.app.region).toBe("content");
    expect(srcAt(h.app.currentLayout(v).lines[v.cur.row]!, v.cur.col)).toBe(3);
    // tab: All, and back.
    await h.keys("space", "n", "q", "tab");
    expect(h.app.problemsPanel.tab).toBe("all");
    await h.keys("shift+tab");
    expect(h.app.problemsPanel.tab).toBe("file");
  });

  test("the status line's problems, clicked, open This file; a tab's title switches; its button closes", async () => {
    const h = await setup();
    h.frame();
    const at = hot(h, "status:problems")!;
    expect(at.y).toBe(39);
    click(h, at);
    expect(h.app.problemsPanel).toMatchObject({ shown: true, tab: "file" });
    expect(h.app.region).toBe("problems");
    h.frame();
    click(h, hot(h, "ptab:all")!);
    expect(h.app.problemsPanel.tab).toBe("all");
    h.frame();
    click(h, hot(h, "ptab:file")!);
    expect(h.app.problemsPanel.tab).toBe("file");
    h.frame();
    click(h, hot(h, "ptab:close")!);
    expect(h.app.problemsPanel.shown).toBe(false);
    expect(h.app.region).toBe("content");
    // The left rail's button, under the history's: opens it on All, closes it.
    h.frame();
    expect(hot(h, "btn:problems")!.y).toBe(hot(h, "btn:history")!.y + 1);
    click(h, hot(h, "btn:problems")!);
    expect(h.app.problemsPanel).toMatchObject({ shown: true, tab: "all" });
    h.app.region = "content"; // open, not focused: closed all the same
    h.frame();
    click(h, hot(h, "btn:problems")!);
    expect(h.app.problemsPanel.shown).toBe(false);
    // A short screen keeps the note: no panel drawn, its keys still work.
    const s = await setup(12);
    await s.keys("space", "n", "q");
    expect(s.frame()).not.toContain(" This file (");
    expect(s.app.region).toBe("problems");
  });
});

describe("the lint surface: your linter's findings in notes (3.21)", () => {
  /** A stand-in for markdownlint-cli2: one finding on line 3 of each file it's given. */
  const FAKE = ["sh", "-c", 'for f; do printf "%s:3:5 error MD013/line-length Line length [Expected: 80]\\n" "$f"; done; exit 1', "lint"];
  const setup = async (command = FAKE) => {
    const root = makeVault();
    writeFileSync(join(root, "l.md"), "# L\n\nA long line here,\nits paragraph going on.\n");
    const h = await harness({ root, open: "l.md", config: (c) => ((c.lint.enabled = "on"), (c.lint.command = command), (c.ui.line_numbers = true)) });
    return { root, h };
  };
  const until = async (ok: () => boolean) => {
    for (let i = 0; i < 100 && !ok(); i++) await new Promise((r) => setTimeout(r, 20));
    expect(ok()).toBe(true);
  };

  test("once a note is saved it's linted: the finding on the cursor's line on the status line, its line number marked; editing hides them until saved", async () => {
    const { h } = await setup();
    h.frame();
    await until(() => h.app.view!.buf.lint !== null);
    expect(statusRow(h.frame())).toContain("⚠ 1"); // how many of each severity (19.8)
    await h.keys("j", "j"); // line 3
    expect(statusRow(h.frame())).toContain("⚠ MD013 line-length: Line length [Expected: 80]");
    const c = h.canvas();
    const rows = c.toString().split("\n");
    const at = (n: string, text: string) => {
      const y = rows.findIndex((r) => new RegExp(`┃.{0,4}${n}\\s.*${text}`).test(r));
      return c.styles[y]![[...rows[y]!].indexOf(n, [...rows[y]!].indexOf("┃"))]!.fg;
    };
    expect(at("3", "A long")).toBe(h.app.theme.roles.warn.fg!);
    expect(at("1", "L")).not.toBe(h.app.theme.roles.warn.fg!);
    // The problems bar (19.9): beside the number, how many start on the line, in the worst one's colour.
    const y3 = rows.findIndex((r) => /A long/.test(r));
    const bar = [...rows[y3]!].indexOf("┃") + 2; // the border, a margin, then the bar
    expect([...rows[y3]!].slice(bar, bar + 4).join("")).toBe("⚠  3"); // the bar: the worst one's sign, no count for one; then the line's number
    expect(c.styles[y3]![bar]!.fg).toBe(h.app.theme.roles.warn.fg!);
    // Typing: its text isn't the file's any more — nothing shown until it's saved (and linted again).
    h.app.view!.buf.edit(0, 0, "x");
    h.frame();
    await new Promise((r) => setTimeout(r, 450)); // past a re-lint's 300 ms: none while it's unsaved
    h.frame();
    expect(h.app.problemsShown(h.app.view!)).toEqual([]);
    expect(statusRow(h.frame())).not.toContain("⚠");
    h.app.saveBuffer(h.app.view!.buf);
    h.frame();
    await until(() => h.app.problemsShown(h.app.view!).length > 0);
  });

  test("the Problems panel lints the root: a Lint section by note; enter opens a finding; a linter that can't run says so once", async () => {
    const { h } = await setup();
    await h.keys("space", "v", "p");
    await until(() => h.app.vaultLint.issues !== null && !h.app.vaultLint.running);
    const rows = h.app.problemRows();
    const lint = rows.filter((r) => r.section === "Lint");
    expect(lint[0]!.label).toMatch(/^Lint \(\d+\)$/);
    const row = lint.findIndex((r) => r.lint && r.lint.file.endsWith("/l.md"));
    expect(lint[row - 1]!.note).toBe("l.md");
    h.app.problemsPanel.all.selected = rows.indexOf(lint[row]!);
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("l.md");
    expect(statusRow(h.frame())).toContain("L3:1"); // rendered: its line's start, not the row's end (a regression)
    // Filtered, the note's row first: enter takes it to its finding, not its top (a regression).
    await h.keys("g", "g");
    await h.keys("space", "v", "p");
    await until(() => !h.app.vaultLint.running);
    await h.keys("/");
    await h.keys(...[..."MD013 l.md"].map((c) => (c === " " ? "space" : c)));
    expect(h.app.problemRows()[h.app.problemsPanel.all.selected]!.note).toBe("l.md");
    await h.keys("enter");
    expect(h.app.cursorLine(h.app.view!)).toBe(3);
    // In source mode, on its column.
    await h.app.run("view.source");
    await h.keys("g", "g", "space", "v", "p");
    h.app.problemsPanel.all.selected = h.app.problemRows().findIndex((r) => r.lint?.file.endsWith("/l.md"));
    await h.keys("enter");
    expect(statusRow(h.frame())).toContain("L3:5");
    // Not there: said once, lint off.
    const bad = await setup(["no-such-linter-slipbox-test"]);
    bad.h.frame();
    await until(() => bad.h.app.lintCmd === null);
    expect(bad.h.app.messages.filter((m) => m.text.includes("couldn't run"))).toHaveLength(1);
  });
});

describe("big notes (15.1)", () => {
  test("a big note parses on other threads: its first frame says so, a key waits for it, a click is dropped; its place kept", async () => {
    const root = makeVault();
    // 16,000 lines, 700 KB: a heading every 80 lines.
    const text = Array.from({ length: 8000 }, (_, i) => (i % 40 === 0 ? `## Part ${i}\n` : `Line ${i} of the big note, with [[alpha]] and enough words to fill a row or so of it.\n`)).join("\n");
    writeFileSync(join(root, "big.md"), text);
    const h = await harness({ root, open: null });
    h.app.open("big.md", { heading: null, headingIndex: 0, offset: 0, line: 6001 });
    expect(h.frame()).toContain("reading big.md — 16,000 lines…");
    const buf = h.app.view!.buf;
    expect(buf.parsing).not.toBeNull();
    // Nothing parses it here meanwhile: the footnotes view waits; a click on the placeholder is dropped.
    expect(h.app.footnotes()).toEqual([]);
    expect((buf as unknown as { parsedVersion: number }).parsedVersion).not.toBe(buf.version);
    const y = h.frame().split("\n").findIndex((r) => r.includes("reading big.md"));
    h.app.handleMouse({ type: "down", x: 40, y, button: 0 });
    h.app.handleMouse({ type: "up", x: 40, y, button: 0 });
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

describe("search in the TUI (6.5, 6.9)", () => {
  const typeIn = async (h: Harness, text: string) => {
    for (const c of text) await h.keys(c === " " ? "space" : c);
  };
  const withNotes = async (notes: Record<string, string>, opts: Partial<Opts> = {}) => {
    const root = makeVault();
    for (const [rel, text] of Object.entries(notes)) writeFileSync(join(root, rel), text);
    return harness({ root, open: "index.md", config: (c) => (c.search.engine = "auto"), ...opts });
  };

  test("space f s: ranked as you type, from the index built as the vault opened; the words marked; enter opens at the match", async () => {
    const h = await withNotes({ "dome.md": "# Dome\n\nThe quetzal plinth was replaced,\nits bolts too.\n\n## Later\n\nAnd the dome rollers.\n" });
    await h.app.whenSearchIndexed();
    expect(h.app.searchIndex?.complete).toBe(true);
    await h.keys("space", "f", "s");
    expect((h.app.overlay as ListOverlay).title).toStartWith("search here — words");
    await typeIn(h, "quetzal plinth");
    const list = h.app.overlay as ListOverlay;
    expect(list.title).toBe('"quetzal plinth" — 1 file');
    expect(list.filtered[0]!.item).toMatchObject({ label: "dome.md:3", detail: "Dome — The quetzal plinth was replaced," });
    // The words drawn as matches, the rest of the line dim.
    const c = h.canvas();
    const rows = c.toString().split("\n");
    const y = rows.findIndex((r) => r.includes("dome.md:3"));
    const at = (w: string) => c.styles[y]![rows[y]!.indexOf(w)]!.fg;
    expect(at("quetzal")).toBe(h.app.theme.roles.overlay_match.fg!);
    expect(at("replaced")).not.toBe(h.app.theme.roles.overlay_match.fg!);
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("dome.md");
    expect(statusRow(h.frame())).toContain("L3:1"); // rendered: the line's start, not its row's end
    // :search takes the words.
    await h.app.run("search.open dome rollers");
    expect((h.app.overlay as ListOverlay).filtered[0]!.item.label).toBe("dome.md:8");
  });

  test("kept current: a save here, a change the watcher reports, a rename; unsaved text searched as it's shown", async () => {
    const h = await withNotes({ "a.md": "# A\n\nplain words\n" });
    await h.app.whenSearchIndexed();
    const found = (q: string) => h.app.searchVault(q).hits.map((x) => `${x.path}:${x.line}`);
    await h.app.run("note.open a.md");
    // Typed, not saved: found as it's shown — and not as the file still has it.
    await h.keys("shift+g", "o", ...[..."a zebra"].map((ch) => (ch === " " ? "space" : ch)), "escape");
    expect(h.app.view!.buf.dirty).toBe(true);
    expect(found("zebra")).toEqual(["a.md:4"]);
    expect(h.app.searchIndex!.query('"zebra"', { limit: 5 })).toEqual([]); // the index is the disk's
    await h.keys("ctrl+s");
    expect(h.app.searchIndex!.query('"zebra"', { limit: 5 })!.map((r) => r.path)).toEqual(["a.md"]); // the save, through the feed
    // Unsaved again, the word gone: not found, though the index has it.
    await h.keys("u");
    expect(h.app.view!.buf.dirty).toBe(true);
    expect(found("zebra")).toEqual([]);
    await h.keys("ctrl+r");
    // Changed on disk, as the watcher tells the graph.
    writeFileSync(join(h.root, "b.md"), "# B\n\na quokka\n");
    const st = statSync(join(h.root, "b.md"));
    h.app.graph.updateFile("b.md", { rel: "b.md", abs: join(h.root, "b.md"), size: st.size, mtimeMs: st.mtimeMs });
    expect(found("quokka")).toEqual(["b.md:3"]);
    // Renamed here: the old path gone, the new one found.
    const { planNoteRename } = await import("../src/core/rename.ts");
    h.app.previewRename(() => planNoteRename(h.app.graph, "b.md", "c"));
    await h.keys("enter");
    expect(found("quokka")).toEqual(["c.md:3"]); // as it was: nothing written into it (21.12)
    expect(h.app.searchIndex!.indexed().has("b.md")).toBe(false);
  });

  test("while the index is first built the list says so, and fills when it's done; without one (a scan engine), it scans", async () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 400; i++) many[`n${i}.md`] = `# Note ${i}\n\n${"filler words here. ".repeat(40)}${i === 7 ? "a narwhal" : ""}\n`;
    const h = await withNotes(many);
    expect(h.app.searchJob).not.toBeNull();
    await h.keys("space", "f", "s");
    await typeIn(h, "narwhal");
    const list = h.app.overlay as ListOverlay;
    expect(h.app.searchJob).not.toBeNull(); // keys don't wait for it: its slices run between frames
    // Asked directly meanwhile, the files are scanned: the index isn't whole yet.
    expect(h.app.searchVault("narwhal")).toMatchObject({ engine: "scan", hits: [{ path: "n7.md", line: 3 }] });
    expect(list.title).toMatch(/^search — the folder is being indexed: [\d,]+ of [\d,]+ files…$/);
    expect(list.filtered).toEqual([]);
    await h.app.whenSearchIndexed();
    expect(list.title).toBe('"narwhal" — 1 file');
    expect(list.filtered.map((f) => f.item.label)).toEqual(["n7.md:3"]);
    // [search] engine = "scan": no index, the files scanned.
    const s = await withNotes({ "w.md": "# W\n\na walrus\n" }, { config: (c) => (c.search.engine = "scan") });
    expect(s.app.searchIndex).toBeNull();
    await s.keys("space", "f", "s");
    await typeIn(s, "walrus");
    expect((s.app.overlay as ListOverlay).title).toBe('"walrus" — 1 file (scanned: no index here)');
  });
});

describe("code files' links in the TUI (20.19)", () => {
  test("live, the vault's code grammars load by themselves: a comment's path is a backlink, and a rename's to rewrite", async () => {
    const root = makeVault();
    writeFileSync(join(root, "tool.py"), "# see notes/alpha.md\nprint(1)\n");
    const h = await harness({ root, open: "index.md", watch: true });
    let found = false;
    for (const t = Date.now(); !found && Date.now() - t < 8000; ) {
      found = h.app.graph.backlinks("notes/alpha.md").some((b) => b.from === "tool.py");
      if (!found) await Bun.sleep(25);
    }
    expect(found).toBe(true);
  });
});

describe("the index on demand in the TUI (20.8)", () => {
  test(":e of a git-ignored or hidden file opens it and indexes it; node_modules stays out", async () => {
    const root = makeVault();
    writeFileSync(join(root, ".gitignore"), "tmp/\n");
    mkdirSync(join(root, "tmp"));
    mkdirSync(join(root, ".private"));
    mkdirSync(join(root, "node_modules"), { recursive: true });
    writeFileSync(join(root, "tmp", "scratchpad.md"), "# Scratchpad\n\n[back](../index.md)\n");
    writeFileSync(join(root, ".private", "p.md"), "# P\n");
    writeFileSync(join(root, "node_modules", "dep.md"), "# Dep\n");
    const h = await harness({ root, open: "index.md" });
    expect(h.app.graph.notes.has("tmp/scratchpad.md")).toBe(false);
    await h.app.run("note.open tmp/scratchpad.md");
    expect(h.app.view!.buf.rel).toBe("tmp/scratchpad.md");
    expect(h.app.graph.notes.has("tmp/scratchpad.md")).toBe(true);
    expect(h.app.graph.backlinks("index.md").map((b) => b.from)).toContain("tmp/scratchpad.md");
    await h.app.run("note.open .private/p.md");
    expect(h.app.view!.buf.rel).toBe(".private/p.md");
    await h.app.run("note.open node_modules/dep.md");
    expect(h.app.view!.buf.rel).toBe(".private/p.md");
    expect(h.app.messages.at(-1)?.text).toBe('no note or file "node_modules/dep.md"');
  });
});

describe("the background auto-index in the TUI (20.9)", () => {
  test("it works only while nobody is: no key or click here, no agent's command, this vault indexed; and it can be off", async () => {
    const { activityFile } = await import("../src/core/autoindex.ts");
    const h = await harness({ config: (c) => (c.index.background = true) }); // off in tests unless asked
    const quiet = h.app.config.index.idle_seconds * 1000;
    const now = Date.now();
    writeFileSync(activityFile(), "0\n");
    utimesSync(activityFile(), new Date(now - 2 * quiet), new Date(now - 2 * quiet));
    h.app.lastInputAt = now - 2 * quiet;
    expect(h.app.autoIndexDue(now)).toBe(true);
    await h.keys("j"); // a key now
    expect(h.app.autoIndexDue(Date.now())).toBe(false);
    h.app.lastInputAt = now - 2 * quiet;
    utimesSync(activityFile(), new Date(now), new Date(now)); // an agent just ran a command
    expect(h.app.autoIndexDue(now)).toBe(false);
    utimesSync(activityFile(), new Date(now - 2 * quiet), new Date(now - 2 * quiet));
    h.app.indexing = 3; // this vault's own index first
    expect(h.app.autoIndexDue(now)).toBe(false);
    h.app.indexing = 0;
    h.app.config.index.background = false;
    expect(h.app.autoIndexDue(now)).toBe(false);
  });
});

describe("settings from the vaults around this one (20.7)", () => {
  test("a change to an enclosing vault's config is noticed and applied, as the vault's own is", async () => {
    const outer = mkdtempSync(join(sandbox, "outer-"));
    mkdirSync(join(outer, ".slipbox"));
    const cfg = join(outer, ".slipbox", "config.toml");
    writeFileSync(cfg, "[ui]\nsidebar_width = 30\n");
    const inner = join(outer, "inner");
    mkdirSync(join(inner, ".slipbox"), { recursive: true });
    writeFileSync(join(inner, "n.md"), "# N\n");
    const h = await harness({ root: inner, open: "n.md" });
    expect(h.app.configChangedOnDisk()).toBe(false);
    writeFileSync(cfg, "[ui]\nsidebar_width = 41\n");
    expect(h.app.configChangedOnDisk()).toBe(true);
    h.app.reloadConfig("file changed");
    expect(h.app.config.ui.sidebar_width).toBe(41);
  });
});

describe("git worktrees in the TUI (17.19)", () => {
  const git = (cwd: string, ...args: string[]) => Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);
  /** project/x, a vault and its repository, and two worktrees of it in project/worktrees/x/. */
  const layout = () => {
    const base = mkdtempSync(join(sandbox, "wt-"));
    const x = join(base, "project", "x");
    mkdirSync(join(x, ".slipbox"), { recursive: true });
    writeFileSync(join(x, ".slipbox", "config.toml"), `[vault]\nid = "wt${base.slice(-6).replace(/[^a-z0-9]/gi, "")}"\nname = "wtx${base.slice(-6).replace(/[^a-z0-9]/gi, "")}"\n`);
    writeFileSync(join(x, "index.md"), "# X\n");
    if (git(x, "init", "-q", "-b", "main").exitCode !== 0) return null;
    git(x, "add", "-A");
    git(x, "commit", "-q", "-m", "x");
    const wts = join(base, "project", "worktrees", "x");
    for (const b of ["feat", "fix"]) if (git(x, "worktree", "add", "-q", "-b", b, join(wts, b)).exitCode !== 0) return null;
    return { base, x, wts };
  };

  test("the status line: the root's name and its branch, a worktree as name@branch (20.14, 21.9); :folders lists the repository once", async () => {
    const l = layout();
    if (!l) return;
    const main = await harness({ root: l.x, open: "index.md" });
    const name = main.app.loc.name!;
    expect(statusRow(main.frame())).toContain(`${name} · main`);
    expect(topRow(main.frame())).not.toContain("⎇"); // the top bar's no longer
    const feat = await harness({ root: join(l.wts, "feat"), open: "index.md" });
    expect(statusRow(feat.frame())).toContain(`${name}@feat`);
    expect(statusRow(feat.frame())).not.toContain(" · ");
    await harness({ root: join(l.wts, "fix"), open: "index.md" }); // seen too
    // From elsewhere: :folders lists it once, by its name — its worktrees are its branches, not copies (21.6).
    const { tildePath } = await import("../src/core/names.ts");
    const other = await harness({ open: "index.md" });
    await other.app.run("folders.open");
    const items = (other.app.overlay as ListOverlay).items.filter((i) => i.label === name);
    expect(items.map((i) => i.detail)).toEqual([tildePath(l.x)]);
    // A checkout switched to another branch: the status line follows it.
    git(join(l.wts, "feat"), "checkout", "-q", "-b", "feat-2");
    expect(statusRow(feat.frame())).toContain(`${name}@feat-2`);
  });

  test("a second copy of a folder opened: which one links to its name open — asked once, remembered; dismissed, the first stays (21.6)", async () => {
    const { readFolders, recordFolder } = await import("../src/core/folders.ts");
    const copies = (tag: string) => {
      const id = basename(mkdtempSync(join(sandbox, "cp-"))).replace(/[^a-z0-9]/gi, "").toLowerCase();
      const name = `${tag}${id.slice(-6)}`;
      const mk = () => {
        const dir = mkdtempSync(join(sandbox, `${tag}-`));
        mkdirSync(join(dir, ".slipbox"));
        writeFileSync(join(dir, ".slipbox", "config.toml"), `[vault]\nid = "${id}"\nname = "${name}"\n`);
        writeFileSync(join(dir, "n.md"), "# N\n");
        return dir;
      };
      return { name, a: mk(), b: mk() };
    };
    const { name, a, b } = copies("pick");
    recordFolder(a);
    const h = await harness({ root: b, open: "n.md" });
    const o = h.app.overlay as ListOverlay;
    expect(o.title).toBe(`${name}: 2 copies on this machine — which do links to it open?`);
    expect(o.items.map((i) => [i.label, i.hint])).toEqual([[a, "links open it now"], [b, undefined]]);
    await h.keys("down", "enter");
    expect(readFolders().find((f) => f.name === name)).toMatchObject({ default: b, asked: true });
    expect(h.app.messages.at(-1)!.text).toBe(`links to ${name} open ${b}`);
    // Opened again, either copy: not asked.
    expect((await harness({ root: a, open: "n.md" })).app.overlay).toBeNull();
    // Dismissed: the first found stays the one, and it isn't asked again.
    const d = copies("esc");
    recordFolder(d.a);
    const e = await harness({ root: d.b, open: "n.md" });
    expect((e.app.overlay as ListOverlay).title).toContain("which do links to it open?");
    await e.keys("escape");
    expect(readFolders().find((f) => f.name === d.name)).toMatchObject({ default: d.a, asked: true });
    expect((await harness({ root: d.b, open: "n.md" })).app.overlay).toBeNull();
    // To be asked, but one copy gone since: nothing to choose between — not asked.
    const g = copies("gone");
    recordFolder(g.a);
    expect(recordFolder(g.b)?.ask).toBe(true);
    rmSync(g.a, { recursive: true });
    expect((await harness({ root: g.b, open: "n.md" })).app.overlay).toBeNull();
  });

  test("named folders' words (21.10): :folders goes into one; :folders-default sets the copy links open; :name names a repository; :open takes a pointer", async () => {
    const { readFolders, recordFolder } = await import("../src/core/folders.ts");
    const { tildePath } = await import("../src/core/names.ts");
    const tag = basename(mkdtempSync(join(sandbox, "wd-"))).replace(/[^a-z0-9]/gi, "").toLowerCase();
    const mk = () => {
      const d = join(mkdtempSync(join(sandbox, "wd-f-")), `f${tag}`);
      mkdirSync(join(d, ".slipbox"), { recursive: true });
      writeFileSync(join(d, ".slipbox", "config.toml"), `[vault]\nid = "f${tag}"\nname = "f${tag}"\n`);
      writeFileSync(join(d, "n.md"), "# N there\n");
      recordFolder(d);
      return d;
    };
    const one = mk();
    const two = mk();
    const repo = mkdtempSync(join(sandbox, "wd-r-"));
    mkdirSync(join(repo, ".git"));
    writeFileSync(join(repo, "r.md"), "# R\n");
    const h = await harness({ root: repo, open: "r.md" });
    expect(h.app.overlay).toBeNull();
    await h.app.run("folders.open");
    const list = h.app.overlay as ListOverlay;
    const at = list.items.findIndex((i) => i.label === `f${tag}`);
    expect(list.items[at]).toMatchObject({ detail: tildePath(one), hint: "2 copies" });
    list.selected = at;
    await h.keys("enter");
    // Into the copy its links open; a second copy here, never chosen: asked which, once (21.6).
    expect(h.app.loc.root).toBe(one);
    expect((h.app.overlay as ListOverlay).title).toBe(`f${tag}: 2 copies on this machine — which do links to it open?`);
    await h.keys("escape");
    // Chosen later: :folders-default.
    await h.app.run("folders.default");
    expect((h.app.overlay as ListOverlay).title).toBe(`f${tag}: which copy do links open?`);
    expect((h.app.overlay as ListOverlay).items.map((i) => [i.label, i.hint])).toEqual([[tildePath(one), "links open it"], [tildePath(two), undefined]]);
    await h.keys("down", "enter");
    expect(readFolders().find((f) => f.name === `f${tag}`)?.default).toBe(two);
    // Back to the repository: named, a .slipbox/ to hold it.
    await h.app.run("history.back");
    expect(h.app.loc.root).toBe(repo);
    await h.app.run(`folder.name r${tag}`);
    expect(readFileSync(join(repo, ".slipbox", "config.toml"), "utf8")).toContain(`name = "r${tag}"`);
    expect(h.app.messages.at(-1)!.text).toContain(`is named r${tag}`);
    expect(h.app.loc.name).toBe(`r${tag}`); // shown by it from now on
    expect(statusRow(h.frame())).toContain(`r${tag}`);
    // :open with a pointer: the note in the copy links open.
    await h.app.run(`note.open slipbox://f${tag}/n.md`);
    expect(h.app.view!.buf.abs).toBe(join(two, "n.md"));
  });

  test("repairs (21.11): a batch of moves made elsewhere offers the relink once; a folder named the old way says so, its pointer written by a code action", async () => {
    const { recordFolder } = await import("../src/core/folders.ts");
    const tag = basename(mkdtempSync(join(sandbox, "rp-"))).replace(/[^a-z0-9]/gi, "").toLowerCase();
    const research = join(mkdtempSync(join(sandbox, "rp-r-")), `research${tag}`);
    mkdirSync(join(research, ".slipbox"), { recursive: true });
    writeFileSync(join(research, ".slipbox", "config.toml"), `[vault]\nid = "r${tag}"\nname = "research${tag}"\n`);
    mkdirSync(join(research, "algorithms"));
    writeFileSync(join(research, "algorithms", "dijkstra.md"), "# Dijkstra\n\n## Proof\n");
    recordFolder(research);
    const root = mkdtempSync(join(sandbox, "rp-a-"));
    mkdirSync(join(root, ".slipbox"));
    mkdirSync(join(root, "old"));
    writeFileSync(join(root, "old", "plan.md"), "# Plan\n\nThe plan, long enough to be told by its text.\n");
    writeFileSync(join(root, "Meeting: Q3.md"), "# Q3\n");
    writeFileSync(join(root, "a.md"), `# A\n\n[plan](old/plan.md) [d](research${tag}:algorithms/dijkstra.md) [[research${tag}:dijkstra#Proof|D]] [[Meeting: Q3]] [[zz${tag}:thing]]\n\n[far](${relative(root, join(research, "algorithms", "dijkstra.md"))})\n`);
    const h = await harness({ root, open: "a.md" });
    // Moved elsewhere (a file manager): one batch, gone and come with the same text.
    mkdirSync(join(root, "new"));
    renameSync(join(root, "old", "plan.md"), join(root, "new", "plan.md"));
    h.app.applyChanges({ changes: [{ rel: "old/plan.md", kind: "deleted", isNote: true }, { rel: "new/plan.md", kind: "created", isNote: true }], rescan: false });
    expect(h.app.messages.some((m) => m.text === "old/plan.md moved to new/plan.md: 1 line of links broke — the relink, to look over")).toBe(true);
    const preview = (h.app.overlay as ListOverlay).items.map((i) => `${i.label} ${i.detail ?? ""}`).join("\n");
    expect(preview).toContain("a.md:3");
    expect(preview).toContain("new/plan.md");
    expect(preview).not.toContain("slipbox://"); // the moves' fixes only: no pointer offered unasked
    await h.keys("escape");
    // The old forms: not links, said — `Meeting: Q3` is a note's name, a link.
    const links = h.app.graph.linksOf("a.md").map((l) => [l.target, l.resolvedKind, l.suggest ?? null]);
    expect(links.slice(1)).toEqual([
      [`research${tag}:algorithms/dijkstra.md`, "unresolved", `slipbox://research${tag}/algorithms/dijkstra.md`],
      [`research${tag}:dijkstra`, "unresolved", `slipbox://research${tag}/algorithms/dijkstra.md`],
      ["Meeting: Q3", "note", null],
      [`zz${tag}:thing`, "unresolved", null], // no folder of that name: nothing to say of it
      [relative(root, join(research, "algorithms", "dijkstra.md")), "note", null],
    ]);
    expect(h.app.graph.linksOf("a.md")[4]!.reason).toBeUndefined();
    await h.keys("g", "g", "tab", "tab", "enter");
    expect(h.app.messages.at(-1)!.text).toBe(`research${tag}:algorithms/dijkstra.md names a folder the old way — not a link; slipbox://research${tag}/algorithms/dijkstra.md is (space c a writes it)`);
    // Written by the code actions: each a pointer, a markdown link.
    await h.app.run("lsp.code_action");
    expect((h.app.overlay as ListOverlay).items.map((i) => i.label)).toEqual([`Write its pointer: slipbox://research${tag}/algorithms/dijkstra.md`, `Write its pointer: slipbox://research${tag}/algorithms/dijkstra.md`]);
    await h.keys("enter");
    await h.app.run("lsp.code_action");
    await h.keys("enter");
    expect(readFileSync(join(root, "a.md"), "utf8")).toStartWith(`# A\n\n[plan](old/plan.md) [d](slipbox://research${tag}/algorithms/dijkstra.md) [D](slipbox://research${tag}/algorithms/dijkstra.md#proof) [[Meeting: Q3]]`);
  });

  test("a fragile link: the status line says how it landed; a code action names it for sure; a nearer namesake is said", async () => {
    const root = mkdtempSync(join(sandbox, "fragile-"));
    mkdirSync(join(root, ".obsidian"));
    for (const [rel, text] of Object.entries({ "Home.md": "# Home\n\nSee [[Pie]] now.\n", "Recipes/Baking/Pie.md": "# P\n", "Archive/Old/Older/Pie.md": "# P2\n" })) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), text);
    }
    const h = await harness({ root, open: "Home.md", width: 160 });
    await h.keys("g", "g", "tab");
    expect(statusRow(h.frame())).toContain("→ [[Pie]] (resolved, the shortest path of 2 named so)");
    // A nearer Pie, from outside (an agent's): said.
    writeFileSync(join(root, "Pie.md"), "# P3\n");
    h.app.graph.updateFile("Pie.md", { rel: "Pie.md", abs: join(root, "Pie.md"), size: 5, mtimeMs: Date.now() });
    expect(h.app.messages.at(-1)!.text).toBe("[[Pie]] in Home.md reaches Pie.md now, not Recipes/Baking/Pie.md");
    h.app.graph.removeFile("Pie.md");
    // Named for sure, from the code actions (no server for a note: slipbox's own).
    await h.app.run("lsp.code_action");
    const o = h.app.overlay as ListOverlay;
    expect(o.items.map((i) => [i.label, i.hint])).toEqual([["Name it for sure: [[Recipes/Baking/Pie]]", "slipbox"]]);
    await h.keys("enter");
    expect(readFileSync(join(root, "Home.md"), "utf8")).toBe("# Home\n\nSee [[Recipes/Baking/Pie]] now.\n");
  });

  test("fragments followed as a link finds them: GitHub's #setup-1, a heading path, an <a id> in the same note", async () => {
    const root = mkdtempSync(join(sandbox, "frag-"));
    mkdirSync(join(root, ".slipbox"));
    writeFileSync(join(root, "n.md"), "# N\n\n## Setup\n\none\n\n## Setup\n\ntwo\n\n## Install\n\n### Linux\n\nlx\n");
    writeFileSync(join(root, "a.md"), "# A\n\n[second](n.md#setup-1) [[n#Install#Linux]] [faq](#faq)\n\nfiller\n\n<a id=\"faq\"></a>\n\nQ and A.\n");
    const h = await harness({ root, open: "a.md" });
    const src = () => h.app.currentLayout(h.app.view!).lines[h.app.view!.cur.row]!.src;
    await h.keys("g", "g", "tab", "enter");
    expect(h.app.view!.buf.rel).toBe("n.md");
    expect(src()).toBe(7);
    await h.keys("ctrl+o", "g", "g", "tab", "tab", "enter");
    expect(h.app.view!.buf.rel).toBe("n.md");
    expect(src()).toBe(13);
    await h.keys("ctrl+o", "g", "g", "tab", "tab", "tab", "enter");
    expect(h.app.view!.buf.rel).toBe("a.md");
    expect(src()).toBe(7); // the anchor's own line
  });

  test("a pointer followed (21.7): into another named folder, at its heading; by an old name, said; two folders of the name, picked — or one renamed", async () => {
    const { recordFolder } = await import("../src/core/folders.ts");
    const tag = basename(mkdtempSync(join(sandbox, "pt-"))).replace(/[^a-z0-9]/gi, "").toLowerCase();
    const named = (name: string, files: Record<string, string>, extra = "") => {
      const dir = join(mkdtempSync(join(sandbox, "ptr-")), name);
      mkdirSync(join(dir, ".slipbox"), { recursive: true });
      writeFileSync(join(dir, ".slipbox", "config.toml"), `[vault]\nid = "${basename(dirname(dir)).replace(/[^a-z0-9]/gi, "")}"\nname = "${name}"\n${extra}`);
      for (const [rel, text] of Object.entries(files)) writeFileSync(join(dir, rel), text);
      recordFolder(dir);
      return dir;
    };
    const b = named(`b${tag}`, { "x.md": "# X\n\nfirst\n\n## Top\n\nunder top\n" }, `previous_names = ["old${tag}"]\n`);
    const twin1 = named(`twin${tag}`, { "t.md": "# T1\n" });
    named(`twin${tag}`, { "t.md": "# T2\n" });
    const a = named(`a${tag}`, { "a.md": `# A\n\n[to](slipbox://b${tag}/x.md#Top) [old](slipbox://old${tag}/x.md) [twin](slipbox://twin${tag}/t.md) [gone](slipbox://none${tag}/x.md)\n` });
    const h = await harness({ root: a, open: "a.md" });
    await h.keys("tab", "enter");
    expect(h.app.loc.root).toBe(b);
    expect(h.app.view!.buf.rel).toBe("x.md");
    expect(h.app.currentLayout(h.app.view!).lines[h.app.view!.cur.row]!.src).toBe(5); // at ## Top
    // An old name: there, and said so.
    const h2 = await harness({ root: a, open: "a.md" });
    await h2.keys("g", "g", "tab", "tab", "enter"); // from the top: its reading position is kept
    expect(h2.app.view!.buf.abs).toBe(join(b, "x.md"));
    expect(h2.app.messages.some((m) => m.text === `slipbox://old${tag}/x.md reached b${tag} by a name it had`)).toBe(true);
    // Two different folders of one name: each, and renaming one — the parent folder's name its prefix.
    const h3 = await harness({ root: a, open: "a.md" });
    await h3.keys("g", "g", "tab", "tab", "tab", "enter");
    const o = h3.app.overlay as ListOverlay;
    expect(o.title).toBe(`twin${tag}: 2 different folders have this name — which is meant?`);
    expect(o.items.map((i) => i.label).filter((l) => l.startsWith("Rename"))).toHaveLength(2);
    await h3.keys("enter");
    expect(h3.app.view!.buf.abs).toBe(join(twin1, "t.md"));
    const h4 = await harness({ root: a, open: "a.md" });
    await h4.keys("g", "g", "tab", "tab", "tab", "enter");
    const at = (h4.app.overlay as ListOverlay).items.findIndex((i) => i.label === `Rename ${twin1}'s name…`);
    h4.app.overlay && ((h4.app.overlay as ListOverlay).selected = at);
    await h4.keys("enter");
    expect(h4.app.overlay?.kind).toBe("prompt");
    // Not on this machine: why — no new note by a pointer's name.
    const h5 = await harness({ root: a, open: "a.md" });
    await h5.keys("g", "g", "tab", "tab", "tab", "tab", "enter");
    expect(h5.app.messages.at(-1)!.text).toBe(`slipbox://none${tag}/x.md: none${tag} isn't on this machine yet: open it, or let the index find it`);
    expect(h5.app.overlay).toBeNull();
    expect((h4.app.overlay as import("../src/tui/app.ts").PromptOverlay).text).toBe(`${basename(dirname(twin1)).replace(/[^\p{L}\p{N}._-]/gu, "")}-twin${tag}`);
  });

  test("a pointer to a branch not checked out here (21.7): the file as git has it there, read-only, in the floating window", async () => {
    const repo = join(mkdtempSync(join(sandbox, "ptr-git-")), "repo");
    mkdirSync(repo);
    const git = (...args: string[]) => Bun.spawnSync(["git", "-c", "user.email=t@t", "-c", "user.name=t", "-c", "init.defaultBranch=main", ...args], { cwd: repo }).exitCode;
    if (git("init", "-q") !== 0) return;
    const tag = basename(dirname(repo)).replace(/[^a-z0-9]/gi, "").toLowerCase();
    git("remote", "add", "origin", `git@github.com:me/r${tag}.git`);
    writeFileSync(join(repo, "x.md"), "# On main\n");
    writeFileSync(join(repo, "a.md"), `[draft](slipbox://r${tag}@draft/x.md)\n`);
    git("add", ".");
    git("commit", "-qm", "main");
    git("checkout", "-qb", "draft");
    writeFileSync(join(repo, "x.md"), "# Drafted, on its branch\n");
    git("commit", "-qam", "draft");
    git("checkout", "-q", "main");
    const h = await harness({ root: repo, open: "a.md" });
    await h.keys("tab", "enter");
    expect(h.app.floating?.kind).toBe("hover");
    expect(h.app.floating?.title).toBe("x.md on draft, read-only from git");
    expect(h.app.floating?.view.buf.source).toBe("# Drafted, on its branch\n");
    expect(h.app.tabs.flatMap((t) => t.views.map((v) => v.buf.rel))).toEqual(["a.md"]); // nothing opened
  });

  test("a named folder opened where it was moved by hand: its state along, said once, nothing asked (21.8)", async () => {
    const { PositionStore } = await import("../src/core/position.ts");
    const { locateVault, recordLocation } = await import("../src/core/vault.ts");
    const { tildePath } = await import("../src/core/names.ts");
    const dir = join(mkdtempSync(join(sandbox, "mv-")), "mva");
    const tag = `mva${basename(dirname(dir)).slice(-6).replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
    mkdirSync(join(dir, ".slipbox"), { recursive: true });
    writeFileSync(join(dir, ".slipbox", "config.toml"), `[vault]\nid = "${tag}"\nname = "${tag}"\n`);
    writeFileSync(join(dir, "n.md"), "# N\n\none\n\ntwo\n");
    await onlyRootsUnder(dirname(dir), async () => {
      const first = locateVault({ path: dir });
      recordLocation(first); // opened there once
      const ps = new PositionStore(first);
      ps.set("n.md", { heading: null, headingIndex: 0, offset: 0, line: 5 });
      ps.save();
      const moved = join(dirname(dir), "elsewhere");
      renameSync(dir, moved);
      const h = await harness({ loc: locateVault({ path: moved }), open: "n.md" });
      expect(h.app.overlay).toBeNull(); // sure, so nothing asked
      expect(h.app.messages.some((m) => m.text.startsWith(`${tag} moved here from ${tildePath(dir)}: its sessions, scratch, trash and reading positions came along`))).toBe(true);
      expect(new PositionStore(h.app.loc).get("n.md")?.line).toBe(5);
      const again = await harness({ loc: locateVault({ path: moved }), open: "n.md" });
      expect(again.app.messages.some((m) => m.text.includes("moved here"))).toBe(false);
    });
  });

  test("trust (23.x): asked once, when it first matters — never over another window, never mid-typing; y trusts, remembered; :untrust and :trust after", async () => {
    const { setTrust, trustOf } = await import("../src/core/trust.ts");
    const h = await harness({ open: "index.md" });
    const root = h.app.loc.root;
    try {
      // Another window open: the question waits for it to close, then for a key.
      await h.keys(":");
      h.app.askTrust(join(root, "src"), ["fake without the project's code"]);
      expect((h.app.overlay as { label?: string } | null)?.label ?? "").not.toContain("Trust");
      await h.keys("escape");
      // Typing: a typed n is text, never an answer.
      await h.keys("i");
      expect(h.app.view!.insert).toBe(true);
      await h.keys("n");
      expect(h.app.overlay).toBeNull();
      await h.keys("escape", "escape", "j");
      // About the root opened, not the project in it the server was for (src/): one answer for all of it.
      expect((h.app.overlay as { label: string }).label).toBe(`Trust ${root}? Its own tools would run code it holds — fake without the project's code. Only a folder you know (y trusts it; n keeps it safe)`);
      // Its servers started again, trusted: a stand-in manager says which root.
      const restarted: string[] = [];
      const app = h.app as unknown as { servers: unknown };
      const said = { restartUnder: (r: string) => restarted.push(r) } as Record<string | symbol, unknown>;
      app.servers = new Proxy(said, { get: (t, k) => (k in t ? t[k] : () => undefined) }); // the rest: nothing
      await h.keys("y");
      app.servers = null;
      expect(restarted).toEqual([root]);
      expect(trustOf(root)).toBe("trusted");
      expect(h.app.messages.at(-1)!.text).toContain(`: its own tools run as they would anywhere — :untrust takes it back`);
      // Answered: never asked again.
      h.app.askTrust(root, ["x"]);
      expect(h.app.overlay).toBeNull();
      await h.app.run("root.untrust");
      expect(trustOf(root)).toBe("restricted");
      await h.app.run("root.trust");
      expect(trustOf(root)).toBe("trusted");
    } finally {
      setTrust(root, null);
    }
  });

  test("started from the command line where a named folder was moved by hand: the start records it once, the App says so (21.8)", async () => {
    const { locateVault, recordLocation } = await import("../src/core/vault.ts");
    const { prepare } = await import("../src/tui/run.ts");
    const dir = join(mkdtempSync(join(sandbox, "mvs-")), "mvs");
    const tag = `mvs${basename(dirname(dir)).slice(-6).replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
    mkdirSync(join(dir, ".slipbox"), { recursive: true });
    writeFileSync(join(dir, ".slipbox", "config.toml"), `[vault]\nid = "${tag}"\nname = "${tag}"\n`);
    writeFileSync(join(dir, "n.md"), "# N\n");
    await onlyRootsUnder(dirname(dir), async () => {
      recordLocation(locateVault({ path: dir }));
      const moved = join(dirname(dir), "elsewhere");
      renameSync(dir, moved);
      // What `slipbox <path>` does before the screen is taken: the move found there, and passed on.
      const start = prepare([join(moved, "n.md")]);
      if (typeof start === "number") throw new Error(`exit ${start}`);
      expect(start.recorded?.carriedFrom).toBe(dir);
      const app = new App({ ...start, watch: false, host: { requestRender() {}, osc52: () => true, quit: () => {} } });
      expect(app.messages.some((m) => m.text.startsWith(`${tag} moved here from `))).toBe(true);
    });
  });

  test("the start (prepare): a path that isn't there said in a line, exit 3; a note opens in its vault, the flags passed on; a loose folder starts on the launcher", async () => {
    const { prepare } = await import("../src/tui/run.ts");
    const said: string[] = [];
    const write = process.stderr.write;
    process.stderr.write = ((s: string) => (said.push(s), true)) as typeof process.stderr.write;
    let missing: ReturnType<typeof prepare>;
    try {
      missing = prepare([join(sandbox, "no-such-place", "x.md")]);
    } finally {
      process.stderr.write = write;
    }
    expect(missing).toBe(3);
    expect(said).toEqual([`slipbox: no such file or directory: ${join(sandbox, "no-such-place", "x.md")}\n`]);
    const root = makeVault();
    const start = prepare([join(root, "notes", "alpha.md"), "--theme", "nord"]);
    if (typeof start === "number") throw new Error(`exit ${start}`);
    expect(start.loc.root).toBe(root);
    expect(start.open).toBe(join(root, "notes", "alpha.md"));
    expect(start.themeName).toBe("nord");
    expect(start.launcher).toBe(false);
    expect(start.graph.notes.has("notes/alpha.md")).toBe(true);
    const loose = mkdtempSync(join(sandbox, "loose-"));
    writeFileSync(join(loose, "a.md"), "# A\n");
    const folder = prepare([loose]);
    if (typeof folder === "number") throw new Error(`exit ${folder}`);
    expect(folder.loc.mode).toBe("folder");
    expect(folder.open).toBeNull();
    expect(folder.launcher).toBe(true);
  });

  test("a named folder moved by hand: the links its move broke, their fix previewed at once (20.17, 21.8)", async () => {
    const { locateVault, recordLocation } = await import("../src/core/vault.ts");
    const base = mkdtempSync(join(sandbox, "mvfix-"));
    const a = join(base, "v");
    mkdirSync(join(a, ".slipbox"), { recursive: true });
    writeFileSync(join(a, ".slipbox", "config.toml"), `[vault]\nid = "${basename(base).replace(/[^a-z0-9]/gi, "")}"\nname = "mvfix${basename(base).slice(-6).replace(/[^a-z0-9]/gi, "")}"\n`);
    writeFileSync(join(a, "n.md"), "# N\n\n[s](../shared.md)\n");
    writeFileSync(join(base, "shared.md"), "# Shared\n");
    await onlyRootsUnder(base, async () => {
      recordLocation(locateVault({ path: a }));
      const moved = join(base, "deep", "v");
      mkdirSync(dirname(moved), { recursive: true });
      renameSync(a, moved);
      const h = await harness({ loc: locateVault({ path: moved }), open: "n.md" });
      expect(h.app.overlay?.kind).toBe("list");
      expect(JSON.stringify((h.app.overlay as ListOverlay).items)).toContain("../../shared.md");
      await h.keys("enter"); // applied
      expect(readFileSync(join(moved, "n.md"), "utf8")).toBe("# N\n\n[s](../../shared.md)\n");
    });
  });

  test("the folder holding the worktrees: each its own vault, its branch beside it", async () => {
    const l = layout();
    if (!l) return;
    const { folderAt } = await import("../src/core/vault.ts");
    const h = await harness({ loc: folderAt(l.wts), open: null });
    h.app.showSidebar(true);
    const f = h.frame();
    expect(f).toMatch(/feat +⎇ feat/);
    expect(f).toMatch(/fix +⎇ fix/);
  });
});

describe("a branch switch as one event (5.9)", () => {
  const git = (cwd: string, ...args: string[]) => Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);
  /** A vault and its repository on main: a.md and b.md committed. */
  const repo = () => {
    const root = mkdtempSync(join(sandbox, "branch-"));
    mkdirSync(join(root, ".slipbox"));
    writeFileSync(join(root, ".slipbox", "config.toml"), `[vault]\nid = "br${root.slice(-6).replace(/[^a-z0-9]/gi, "")}"\nname = "br${root.slice(-6).replace(/[^a-z0-9]/gi, "")}"\n`);
    writeFileSync(join(root, "a.md"), "# A\n\nThe first note, long enough to know again by its text.\n");
    writeFileSync(join(root, "b.md"), "# B\n");
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return null;
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "start");
    return root;
  };
  const shown = (h: Harness) => h.app.tabs.map((t) => t.views.map((v) => v.buf.rel).join("|"));

  test("each branch keeps its tabs: switching back brings them back; not over an unsaved note", async () => {
    const root = repo();
    if (!root) return;
    const h = await harness({ root, open: "a.md", config: (c) => (c.ui.restore_session = true) });
    expect(h.app.checkHead()).toBe(false);
    git(root, "checkout", "-q", "-b", "feat");
    expect(h.app.checkHead()).toBe(true);
    expect(h.app.messages.at(-1)!.text).toBe("switched to branch feat"); // none kept for feat yet: these stay
    await h.app.run("note.open b.md");
    expect(shown(h)).toEqual(["b.md"]);
    git(root, "checkout", "-q", "main");
    h.app.checkHead();
    expect(h.app.messages.at(-1)!.text).toBe("switched to branch main: its tabs are back");
    expect(shown(h)).toEqual(["a.md"]);
    git(root, "checkout", "-q", "feat");
    h.app.checkHead();
    expect(shown(h)).toEqual(["b.md"]);
    // Unsaved: what's open stays open.
    await h.keys("space", "n", "v", "shift+a", "!", "escape");
    expect(h.app.view!.buf.dirty).toBe(true);
    git(root, "checkout", "-q", "main");
    h.app.checkHead();
    expect(h.app.messages.at(-1)!.text).toBe("switched to branch main — unsaved notes stay open, so its tabs aren't brought back");
    expect(shown(h)).toEqual(["b.md"]);
  });

  test("a merge or a pull on the branch is no switch: git's renames are evidence, said when there are some (20.21)", async () => {
    const root = repo();
    if (!root) return;
    writeFileSync(join(root, "b.md"), "# B\n\n[a](a.md)\n");
    git(root, "commit", "-q", "-am", "b links a");
    const h = await harness({ root, open: "b.md", config: (c) => (c.ui.restore_session = true) });
    h.app.checkHead();
    const said = h.app.messages.length;
    // A commit moving nothing: HEAD moved, nothing to say, the tabs as they are.
    writeFileSync(join(root, "a.md"), "# A\n\nThe first note, long enough to know again by its text.\nMore.\n");
    git(root, "commit", "-q", "-am", "more");
    expect(h.app.checkHead()).toBe(true);
    expect(h.app.messages.length).toBe(said);
    // As a pull brings it: a.md moved, and changed as it went; b.md's link left as it was.
    git(root, "checkout", "-q", "-b", "upstream");
    mkdirSync(join(root, "docs"));
    git(root, "mv", "a.md", "docs/a.md");
    writeFileSync(join(root, "docs", "a.md"), "# A\n\nThe first note, long enough to know again by its text.\nMore.\nAnd moved.\n");
    git(root, "commit", "-q", "-am", "moved");
    git(root, "checkout", "-q", "main");
    h.app.checkHead(); // a switch, and back: nothing moved
    git(root, "merge", "-q", "--ff-only", "upstream");
    h.app.checkHead();
    expect(h.app.messages.at(-1)!.text).toBe("branch main moved on: git moved 1 file — links to it say where (space v p); space l r relinks a note's");
    expect(shown(h)).toEqual(["b.md"]);
    h.app.graph.build(true, "lazy"); // the watcher's news, as it would come
    expect(h.app.graph.problems().broken).toContainEqual(expect.objectContaining({ from: "b.md", target: "a.md", moved: "docs/a.md" }));
  });

  test("a repository made while it runs: the branch shows up (a regression: nothing redrew)", async () => {
    const root = mkdtempSync(join(sandbox, "late-git-"));
    mkdirSync(join(root, ".slipbox"));
    writeFileSync(join(root, "a.md"), "# A\n");
    const h = await harness({ root, open: "a.md" });
    expect(statusRow(h.frame())).not.toContain(" · ");
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return;
    const later = Date.now() + 5_000; // the next look for a repository
    (h.app as unknown as { now: () => number }).now = () => later;
    expect(h.app.checkHead()).toBe(true); // news for the status line (20.14)
    expect(statusRow(h.frame())).toContain(" · main");
    expect(h.app.messages.some((m) => m.text.startsWith("switched"))).toBe(false); // not a switch
  });

  test("the status line says where the file is (21.9): an unnamed root by its path, cut from the front to fit, the branch kept; a plain folder by its path", async () => {
    const { folderAt } = await import("../src/core/vault.ts");
    const root = join(mkdtempSync(join(sandbox, "a-folder-with-a-rather-long-name-")), "experiment");
    mkdirSync(root);
    writeFileSync(join(root, "a.md"), "# A\n");
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return;
    const h = await harness({ root, open: "a.md" });
    expect(h.app.loc.name).toBeNull(); // no remote, no .slipbox/ name
    const row = statusRow(h.frame());
    expect(row).toMatch(/ …[^ ]*\/experiment · main /); // its last folders, and the branch
    expect(row).not.toContain(root); // too long for its 40 columns
    expect(h.app.vaultStatus(200)).toBe(`${root} · main`);
    // However wide the screen, at most 40 columns: the note's own path comes first.
    const wide = await harness({ root, open: "a.md", width: 300 });
    expect(statusRow(wide.frame())).not.toContain(root);
    // A plain folder: its path, no branch.
    const plain = mkdtempSync(join(sandbox, "plain-status-"));
    writeFileSync(join(plain, "p.md"), "# P\n");
    const p = await harness({ loc: folderAt(plain), open: "p.md" });
    expect(p.app.vaultStatus(200)).toBe(plain);
  });

  test("started again, each branch opens on its own tabs", async () => {
    const root = repo();
    if (!root) return;
    const restore = (c: Config) => (c.ui.restore_session = true);
    const h = await harness({ root, open: "a.md", config: restore });
    git(root, "checkout", "-q", "-b", "feat");
    h.app.checkHead(); // main's tabs kept: a.md
    await h.app.run("note.open b.md");
    h.app.saveState(); // feat's: b.md
    expect(shown(await harness({ root, open: null, config: restore }))).toEqual(["b.md"]);
    git(root, "checkout", "-q", "main");
    expect(shown(await harness({ root, open: null, config: restore }))).toEqual(["a.md"]);
  });

  test("while git writes (its index lock) the watcher's news waits, then lands as one; a switch's files aren't moves", async () => {
    const root = repo();
    if (!root) return;
    // feat renames a.md to c.md: on main it's a.md, on feat c.md — the same text.
    git(root, "checkout", "-q", "-b", "feat");
    git(root, "mv", "a.md", "c.md");
    git(root, "commit", "-q", "-m", "rename");
    git(root, "checkout", "-q", "main");
    const h = await harness({ root, open: "b.md" });
    // git busy: held.
    writeFileSync(join(root, ".git", "index.lock"), "");
    writeFileSync(join(root, "b.md"), "# B, changed\n");
    h.app.receiveBatch({ changes: [{ rel: "b.md", kind: "changed", isNote: true }], rescan: false });
    expect(h.app.view!.buf.source).toBe("# B\n");
    rmSync(join(root, ".git", "index.lock"));
    for (let i = 0; i < 50 && h.app.view!.buf.source !== "# B, changed\n"; i++) await Bun.sleep(20);
    expect(h.app.view!.buf.source).toBe("# B, changed\n");
    git(root, "checkout", "-q", "--", "b.md");
    // The switch: a.md goes, c.md comes with its text — not a move, so no redirect.
    git(root, "checkout", "-q", "feat");
    h.app.receiveBatch({
      changes: [
        { rel: "a.md", kind: "deleted", isNote: true },
        { rel: "c.md", kind: "created", isNote: true },
      ],
      rescan: false,
    });
    expect(h.app.graph.notes.has("c.md")).toBe(true);
    expect(h.app.graph.redirects!.follow("a.md")).toBeNull();
    // On one branch, the same thing is a move (17.12): a redirect.
    renameSync(join(root, "c.md"), join(root, "d.md"));
    const later = Date.now() + 10_000; // past the switch's settling
    (h.app as unknown as { now: () => number }).now = () => later;
    h.app.receiveBatch({
      changes: [
        { rel: "c.md", kind: "deleted", isNote: true },
        { rel: "d.md", kind: "created", isNote: true },
      ],
      rescan: false,
    });
    expect(h.app.graph.redirects!.follow("c.md")).toBe("d.md");
  });
});

describe("git in the TUI: marks, what changed, a note's diff, worktrees, conflicts (5.11–5.14)", () => {
  const git = (cwd: string, ...args: string[]) => Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);
  /** A vault and its repository: on main a.md and notes/b.md; on feat (checked out) a.md changed, c.md new. */
  const repo = () => {
    const root = mkdtempSync(join(sandbox, "gitui-"));
    mkdirSync(join(root, ".slipbox"));
    mkdirSync(join(root, "notes"));
    writeFileSync(join(root, ".slipbox", "config.toml"), `[vault]\nid = "g${root.slice(-6).replace(/[^a-z0-9]/gi, "")}"\nname = "g${root.slice(-6).replace(/[^a-z0-9]/gi, "")}"\n`);
    writeFileSync(join(root, "a.md"), "# A\n\none\ntwo\nthree\n");
    writeFileSync(join(root, "notes", "b.md"), "# B\n");
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return null;
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "start");
    git(root, "checkout", "-q", "-b", "feat");
    writeFileSync(join(root, "a.md"), "# A\n\none\nTWO\nthree\n");
    writeFileSync(join(root, "c.md"), "# C\n");
    writeFileSync(join(root, "notes", "b.md"), "# B, changed\n");
    return root;
  };

  test("the explorer marks each changed file at its row's end, and a folder with one in it", async () => {
    const root = repo();
    if (!root) return;
    const h = await harness({ root, open: "a.md" });
    await h.app.refreshGitNow();
    h.app.showSidebar(true);
    h.app.expanded.add("notes");
    h.app.invalidateTree();
    const rows = h.frame().split("\n");
    const row = (name: string) => rows.find((r) => new RegExp(`\\b${name.replace(".", "\\.")}\\b`).test(r.split(/[┃┣]/)[0]!))!.split(/[┃┣]/)[0]!;
    expect(row("a.md").trimEnd()).toMatch(/a\.md +M$/);
    expect(row("c.md").trimEnd()).toMatch(/c\.md +\+$/);
    expect(row("notes").trimEnd()).toMatch(/notes +•$/);
    expect(row("b.md").trimEnd()).toMatch(/b\.md +M$/);
    // A name as long as the row: cut short of its mark, never under it.
    writeFileSync(join(root, "a-rather-long-note-name-that-fills-the-whole-row.md"), "# Long\n");
    h.app.graph.build(true, "lazy");
    await h.app.refreshGitNow();
    const long = h.frame().split("\n").find((r) => r.includes("a-rather-long"))!.split(/[┃┣]/)[0]!;
    expect(long.trimEnd()).toMatch(/[^ ] \+$/);
  });

  test("a marked explorer row: its name scrolls to its end before the mark; a root's own name stops short of its •", async () => {
    const root = makeVault();
    const name = "aaaaaaaaaaaaaaaaaaaaaaaaz.md"; // as long as the pane's text: it scrolls sideways
    writeFileSync(join(root, name), "# x\n");
    const h = await harness({ root, open: "index.md", width: 120, height: 40, config: (c) => (c.ui.sidebar_width = 30) });
    h.app.showSidebar(true);
    h.app.gitStates = new Map([[name, "modified"]]);
    h.app.gitFolders.set("nested-vault", "modified");
    h.app.invalidateTree();
    const row = (has: string) => h.frame().split("\n").find((r) => r.includes(has))!.split(/[┃┣]/)[0]!;
    // Named otherwise than its folder (17.13): the name, cut with a `…`, then the folder's dot.
    expect(row("nested-vault").trimEnd()).toMatch(/nested-vault fixture-.*… •$/);
    h.app.sidebar.left = 1000;
    expect(row("aaaaaaaa").trimEnd()).toMatch(/z\.md +M$/);
    // A pane too short to scroll sideways: the name cut with a `…` before the mark.
    const short = await harness({ root, open: "index.md", width: 120, height: 6, config: (c) => (c.ui.sidebar_width = 30) });
    short.app.showSidebar(true);
    short.app.gitStates = new Map([[name, "modified"]]);
    short.app.invalidateTree();
    short.app.selectInExplorer(name);
    short.app.region = "content";
    expect(short.frame().split("\n").find((r) => r.includes("aaaaaaaa"))).toMatch(/a… M/);
  });
  test("space g c lists what this branch changed; enter shows a file's diff; esc goes back; enter on a line goes there", async () => {
    const root = repo();
    if (!root) return;
    const h = await harness({ root, open: "c.md" });
    await h.keys("space", "g", "c");
    let list = h.app.overlay as ListOverlay;
    expect(list.title).toBe("Changed against main (3) — enter: the diff");
    expect(list.items.map((i) => [i.label, i.role])).toEqual([
      ["M a.md", "git_modified"],
      ["+ c.md", "git_new"],
      ["M notes/b.md", "git_modified"],
    ]);
    await h.keys("enter"); // a.md's diff
    list = h.app.overlay as ListOverlay;
    expect(list.title).toBe("a.md against main — esc: the changes");
    expect(list.items.filter((i) => i.role).map((i) => [i.label, i.role])).toEqual([
      ["@@ line 4", "diff_head"],
      ["- two", "diff_del"],
      ["+ TWO", "diff_add"],
    ]);
    await h.keys("escape");
    expect((h.app.overlay as ListOverlay).title).toStartWith("Changed against main");
    await h.keys("enter");
    list = h.app.overlay as ListOverlay;
    list.selected = list.items.findIndex((i) => i.label === "+ TWO");
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("a.md");
    expect(statusRow(h.frame())).toMatch(/ L4:\d+ /); // on that line, inside its paragraph
  });

  test("space g m: a branch picked, the links its merge would break; enter goes to one; esc back to the branches (20.21)", async () => {
    const root = repo();
    if (!root) return;
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "feat");
    // main moves a.md; feat (checked out) links to it from c.md.
    git(root, "checkout", "-q", "main");
    mkdirSync(join(root, "docs"));
    git(root, "mv", "a.md", "docs/a.md");
    git(root, "commit", "-q", "-m", "a moved");
    git(root, "checkout", "-q", "feat");
    writeFileSync(join(root, "c.md"), "# C\n\nSee [a](a.md).\n");
    git(root, "commit", "-q", "-am", "c links a");
    const h = await harness({ root, open: "c.md" });
    await h.keys("space", "g", "m");
    let list = h.app.overlay as ListOverlay;
    expect(list.title).toBe("Review a merge — enter: the links it would break");
    expect(list.items.map((i) => [i.label.replace(/^\S+ /, ""), i.detail])).toEqual([
      ["feat → main", "this branch into the base"],
      ["main → feat", "into this branch"],
    ]);
    await h.keys("enter");
    list = h.app.overlay as ListOverlay;
    expect(list.title).toBe("Merging feat into main: 1 link would break — esc: the branches");
    expect(list.items.map((i) => [i.label, i.detail, i.role])).toEqual([["c.md:3  a.md", "main moves a.md to docs/a.md — the fix: docs/a.md", "git_modified"]]);
    await h.keys("escape");
    expect((h.app.overlay as ListOverlay).title).toStartWith("Review a merge");
    await h.keys("enter", "enter");
    expect(h.app.view!.buf.rel).toBe("c.md");
    expect(statusRow(h.frame())).toMatch(/ L3:\d+ /);
    // Nothing would break: said so, no list.
    git(root, "checkout", "-q", "-b", "quiet", "main");
    h.app.checkHead();
    await h.keys("space", "g", "m");
    list = h.app.overlay as ListOverlay;
    list.selected = list.items.findIndex((i) => i.label.endsWith("main → quiet"));
    await h.keys("enter");
    expect(h.app.messages.at(-1)!.text).toBe("merging main into quiet breaks no link");
  });

  test("space g d: this note's diff, as it is now (unsaved too); nothing different, said so", async () => {
    const root = repo();
    if (!root) return;
    const h = await harness({ root, open: "a.md" });
    await h.keys("space", "n", "v", "shift+g", "o", ...[..."four"], "escape");
    await h.keys("space", "g", "d");
    const labels = (h.app.overlay as ListOverlay).items.map((i) => i.label);
    expect(labels).toContain("+ four");
    expect(labels).toContain("+ TWO");
    await h.keys("escape", "u");
    git(root, "checkout", "-q", "--", "a.md");
    await h.app.run("note.open notes/../c.md");
    git(root, "add", "c.md");
    git(root, "commit", "-q", "-m", "c");
    git(root, "checkout", "-q", "main");
    git(root, "merge", "-q", "feat");
    await h.keys("space", "g", "d");
    expect((h.app.overlay as ListOverlay).items.map((i) => i.label)).toEqual(["no differences from main"]);
  });

  test("space g w: the worktrees by branch; enter opens this note in the one picked", async () => {
    const root = repo();
    if (!root) return;
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "feat's");
    const wt = `${root}-other`;
    git(root, "worktree", "add", "-q", "-b", "other", wt, "main");
    const h = await harness({ root, open: "notes/b.md" });
    await h.keys("space", "g", "w");
    const list = h.app.overlay as ListOverlay;
    expect(list.items.map((i) => [i.label, i.detail])).toEqual([
      ["● ⎇ feat", `${root}  (main)`],
      ["  ⎇ other", wt],
    ]);
    await h.keys("down", "enter");
    expect(h.app.loc.root).toBe(wt);
    expect(h.app.view!.buf.rel).toBe("notes/b.md"); // the same note, there
    expect(h.app.view!.buf.source).toBe("# B\n"); // as the other branch has it
    expect(statusRow(h.frame())).toContain("@other"); // the worktree, by its branch (20.14)
  });

  test("a merge's conflicts in Problems: each file at its first marker; enter goes there", async () => {
    const root = repo();
    if (!root) return;
    git(root, "commit", "-q", "-am", "feat's two");
    git(root, "checkout", "-q", "main");
    writeFileSync(join(root, "a.md"), "# A\n\none\nmain's two\nthree\n");
    git(root, "commit", "-q", "-am", "main's two");
    git(root, "merge", "-q", "feat");
    const h = await harness({ root, open: "notes/b.md" });
    await h.app.refreshGitNow();
    const rows = h.app.problemRows().filter((r) => r.section === "Conflicts");
    expect(rows.map((r) => [r.label, r.detail])).toEqual([
      ["Conflicts (1)", ""],
      ["a.md", "L4"],
    ]);
    await h.keys("space", "v", "p");
    h.app.problemsPanel.all.selected = h.app.problemRows().findIndex((r) => r.label === "a.md" && r.section === "Conflicts");
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("a.md");
    expect(h.app.cursorLine(h.app.view!)).toBe(4);
    // Filtered to it, the selection on its heading (git's answer came after the typing): enter goes to its first.
    await h.app.run("note.open notes/b.md");
    await h.keys("space", "v", "p", "/", "a", ".", "m", "d");
    expect(h.app.problemRows()[0]!.label).toBe("Conflicts (1)");
    h.app.problemsPanel.all.selected = 0;
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("a.md");
    expect(h.app.cursorLine(h.app.view!)).toBe(4);
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
    writeFileSync(join(root, "sub", "inner.md"), "# Inner\n\nSee [the sibling](sibling.md), and [Deep](#deep).\n\n## Deep\n\nbottom\n");
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
    h.app.graph.updateFile("sub/inner.md", { rel: "sub/inner.md", abs: join(root, "sub", "inner.md"), size: st.size, mtimeMs: st.mtimeMs });
    expect(h.frame()).toContain("▎ rewritten by an agent");
    // Saved here, in another tab.
    await h.app.run("tab.new");
    await h.app.run("note.open sub/inner.md");
    await h.keys("space", "n", "v", "shift+g", "o", ...[..."and a line"].map((c) => (c === " " ? "space" : c)), "escape", "ctrl+s");
    await h.app.run("tab.prev");
    expect(h.frame()).toContain("▎ rewritten by an agent and a line"); // one paragraph
  });
});

describe("problems where they are: the bar, the marks, the status line (19.8–19.11)", () => {
  const vault = (text = "# P\n\nSee [twin](twin.png) here.\n\nAnd [nope](nope.md) there.\n") => {
    const root = makeVault();
    mkdirSync(join(root, "x"));
    mkdirSync(join(root, "y"));
    writeFileSync(join(root, "x", "twin.md"), "# X\n");
    writeFileSync(join(root, "y", "twin.md"), "# Y\n");
    writeFileSync(join(root, "p.md"), text);
    return root;
  };
  /** The row showing `text`, its cells, and their styles. */
  const rowOf = (h: Harness, text: string) => {
    const c = h.canvas();
    const rows = c.toString().split("\n");
    const y = rows.findIndex((r) => r.includes(text));
    const cellsOf = [...rows[y]!];
    const left = cellsOf.indexOf("┃");
    return { cells: cellsOf, styles: c.styles[y]!, bar: cellsOf[left + 2]!, count: cellsOf[left + 3]!, barFg: c.styles[y]![left + 2]!.fg, at: (s: string) => cellsOf.join("").indexOf(s) };
  };

  test("the bar: a line's worst problem's sign in its colour, the count past one; the status line says what", async () => {
    const h = await harness({ root: vault("# P\n\nSee [twin](twin.png) here.\n\nAnd [nope](nope.md) there.\n\nTwo [a](a.png) [b](b.png).\n"), open: "p.md" });
    h.frame();
    const see = rowOf(h, "See");
    expect([see.bar, see.count]).toEqual(["⚠", " "]); // one: no count
    expect(see.barFg).toBe(h.app.theme.roles.warn.fg!);
    expect([rowOf(h, "Two").bar, rowOf(h, "Two").count]).toEqual(["⚠", "2"]);
    // A warning, below the marks' default level (errors): not marked in the text.
    expect(see.styles[see.at("twin")]!.fg).not.toBe(h.app.theme.roles.problem_warn.fg!);
    // nope.md is a note not written yet: information, under the default threshold.
    expect(rowOf(h, "And").bar).toBe(" ");
    expect(statusRow(h.frame())).toContain("⚠ 3");
    await h.app.run("cursor.goto_line 3");
    expect(statusRow(h.frame())).toContain("⚠ unresolved broken link: twin.png");
    // Each glyph set its own signs: ASCII's letters, the Nerd Font's icons.
    for (const [glyphs, sign] of [["ascii", "W"], ["nerd", "\u{ea6c}"]] as const) {
      const g = await harness({ root: vault(), open: "p.md", config: (c) => (c.render.glyphs = glyphs) });
      const rows = g.frame().split("\n");
      expect(rows.find((r) => r.includes("See"))).toContain(`${sign}  See`);
    }
  });

  test("[diagnostics] severity = \"info\": the notes not written yet too, in their colour", async () => {
    const h = await harness({ root: vault(), open: "p.md", config: (c) => (c.diagnostics.severity = "info") });
    h.frame();
    const and = rowOf(h, "And");
    expect(and.bar).toBe("ℹ");
    expect(and.barFg).toBe(h.app.theme.roles.info.fg!);
    expect(statusRow(h.frame())).toMatch(/⚠ 1 {2}ℹ 1/);
  });

  test("space u d hides the bar (the text takes its room); bar = \"off\" never shows it", async () => {
    const h = await harness({ root: vault(), open: "p.md" });
    h.frame();
    const before = rowOf(h, "See").at("See");
    await h.keys("space", "u", "d");
    expect(rowOf(h, "See").at("See")).toBe(before - 3);
    expect(h.app.messages.at(-1)!.text).toBe("Problems bar: off");
    const off = await harness({ root: vault(), open: "p.md", config: (c) => (c.diagnostics.bar = "off") });
    off.frame();
    expect(rowOf(off, "See").at("See")).toBe(before - 3);
  });

  test("the marks: a level — errors by default; space u shift+d cycles errors → warnings → all → off", async () => {
    // A merge's conflict left in it: an error; a broken link, a warning; a note not written yet, information.
    const text = "# P\n\nSee [twin](twin.png) here.\n\nAnd [nope](nope.md) there.\n\n<<<<<<< ours\nmine\n=======\ntheirs\n>>>>>>> other\n";
    const h = await harness({ root: vault(text), open: "p.md", config: (c) => (c.diagnostics.severity = "info") });
    await h.app.run("view.source");
    const roles = h.app.theme.roles;
    const marked = () => ({
      error: rowOf(h, "mine").styles[rowOf(h, "mine").at("mine")]!.fg === roles.problem_error.fg,
      warning: rowOf(h, "See").styles[rowOf(h, "See").at("[twin")]!.fg === roles.problem_warn.fg,
      info: rowOf(h, "And").styles[rowOf(h, "And").at("[nope")]!.fg === roles.problem_info.fg,
    });
    expect(h.app.problemsShown(h.app.view!).map((p) => p.severity).sort()).toEqual(["error", "info", "warning"]);
    expect(h.app.ui.problem_marks).toBe("error");
    expect(marked()).toEqual({ error: true, warning: false, info: false });
    await h.keys("space", "u", "shift+d");
    expect(h.app.messages.at(-1)!.text).toBe("Problems marked in the text: warnings and up");
    expect(marked()).toEqual({ error: true, warning: true, info: false });
    await h.keys("space", "u", "shift+d");
    expect(h.app.messages.at(-1)!.text).toBe("Problems marked in the text: all");
    expect(marked()).toEqual({ error: true, warning: true, info: true });
    await h.keys("space", "u", "shift+d");
    expect(h.app.messages.at(-1)!.text).toBe("Problems marked in the text: off");
    expect(marked()).toEqual({ error: false, warning: false, info: false });
    await h.keys("space", "u", "shift+d");
    expect(h.app.ui.problem_marks).toBe("error");
    // An older config's true and false: every severity shown, and none.
    for (const [old, level] of [[true, "info"], [false, "off"]] as const) {
      const dir = mkdtempSync(join(sandbox, "marks-"));
      writeFileSync(join(dir, "config.toml"), `[diagnostics]\nmarks = ${old}\n`);
      const { loadConfig } = await import("../src/core/config.ts");
      expect(loadConfig({ configFile: join(dir, "config.toml"), vaultFile: null }).config.diagnostics.marks).toBe(level);
    }
  });

  test("auto: no bar while a note has had no problems; once it has, it stays as they go", async () => {
    const root = vault("# P\n\nSee [twin](x/twin.md) here.\n");
    const h = await harness({ root, open: "p.md" });
    h.frame();
    const clean = rowOf(h, "See").at("See");
    writeFileSync(join(root, "p.md"), "# P\n\nSee [twin](twin.png) here.\n");
    h.app.applyChanges({ changes: [{ rel: "p.md", kind: "changed", isNote: true }], rescan: false });
    h.frame();
    expect(rowOf(h, "See").at("See")).toBe(clean + 3);
    writeFileSync(join(root, "p.md"), "# P\n\nSee [twin](x/twin.md) here.\n");
    h.app.applyChanges({ changes: [{ rel: "p.md", kind: "changed", isNote: true }], rescan: false });
    h.frame();
    expect(rowOf(h, "See").bar).toBe(" ");
    expect(rowOf(h, "See").at("See")).toBe(clean + 3); // kept: the text doesn't move back
  });

  test("in source mode the mark is the link's own characters", async () => {
    const h = await harness({ root: vault(), open: "p.md", config: (c) => (c.diagnostics.marks = "warning") });
    await h.app.run("view.source");
    h.frame();
    const see = rowOf(h, "See [twin](twin.png)");
    const warn = h.app.theme.roles.problem_warn.fg!;
    expect(see.styles[see.at("[twin](twin.png)")]!.fg).toBe(warn);
    expect(see.styles[see.at("[twin](twin.png)") + 15]!.fg).toBe(warn);
    expect(see.styles[see.at(" here")]!.fg).not.toBe(warn);
  });
});

describe("language servers in the TUI (19.1, 19.8)", () => {
  /** A made-up language served by the fake server, as the user's config would name one. */
  const served = (c: Config) => {
    const launcher = join(sandbox, "fake-ls-launcher");
    writeFileSync(launcher, `#!/usr/bin/env node\nawait import(${JSON.stringify(join(import.meta.dir, "fixtures", "fake-lsp.ts"))});\n`);
    c["language-server"] = { fake: { command: launcher, args: ["--stdio"] } };
    c.language = [{ name: "fake", "file-types": ["fk"], "language-servers": ["fake"] }];
  };
  const until = async (ok: () => boolean, ms = 8000) => {
    for (const t = Date.now(); !ok() && Date.now() - t < ms; ) await Bun.sleep(20);
    return ok();
  };

  test("a file's server is told when it's shown, again after typing pauses; its problems join the file's", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "fine\nBAD here\n");
    const h = await harness({ root, open: "a.fk", config: served });
    h.app.startServers();
    h.frame(); // shown: opened in its server
    const buf = h.app.view!.buf;
    expect(await until(() => h.app.problemsShown(h.app.view!).length === 1)).toBe(true);
    expect(h.app.problemsShown(h.app.view!)[0]).toMatchObject({ start: { line: 2, column: 1 }, severity: "warning", source: "fake" });
    expect(statusRow(h.frame())).toContain("⚠ 1");
    // Typing: the old problems hidden (their text is gone), then the server's answer for the new text.
    buf.edit(0, 0, "BAD ");
    h.frame();
    expect(h.app.problemsShown(h.app.view!)).toEqual([]);
    expect(await until(() => (h.frame(), h.app.problemsShown(h.app.view!).length === 2))).toBe(true);
    expect(h.app.servers!.list()).toMatchObject([{ name: "fake", state: "running", files: 1 }]);
    await h.app.servers!.stopAll();
  });

  test("a file whose server isn't installed: said once, on the screen", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "text\n");
    writeFileSync(join(root, "b.fk"), "more\n");
    const h = await harness({
      root,
      open: "a.fk",
      config: (c) => {
        c["language-server"] = { nope: { command: "slipbox-test-no-such-server" } };
        c.language = [{ name: "fake", "file-types": ["fk"], "language-servers": ["nope"] }];
      },
    });
    h.app.startServers();
    h.frame();
    const said = (h2: Harness) => h2.app.messages.filter((m) => m.text.startsWith("fake: nope isn't installed"));
    expect(await until(() => said(h).length === 1)).toBe(true);
    expect(said(h)[0]!.level).toBe("warn");
    expect(h.frame()).toContain("nope isn't installed");
    await h.app.run("note.open b.fk");
    h.frame();
    await Bun.sleep(100);
    expect(said(h)).toHaveLength(1);
    await h.app.servers!.stopAll();
  });

  test("shift+k: the server's hover, floating; g d its definition; g r its references, to pick from (19.12, 19.13)", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "  DEF here\nuse it\nREF one\nREF two\n");
    const h = await harness({ root, open: "a.fk", config: served });
    h.app.startServers();
    h.frame();
    expect(await until(() => (h.frame(), h.app.servers!.list()[0]?.state === "running"))).toBe(true);
    await h.app.run("cursor.goto_line 2");
    await h.keys("shift+k");
    expect(await until(() => h.app.floating?.kind === "hover")).toBe(true);
    expect(h.app.floating!.view.buf.source).toBe("line 1: use it\n");
    expect(h.frame()).toContain("line 1: use it");
    h.app.floating!.view.buf.edit(0, 0, "typed "); // typed into: still nothing to write back, it closes
    await h.keys("escape");
    expect(h.app.floating).toBeNull();
    await h.keys("g", "d");
    expect(await until(() => h.app.cursorLine(h.app.view!) === 1)).toBe(true);
    expect(h.app.view!.cur.col).toBe(2); // at DEF, past the indent
    await h.keys("g", "r");
    expect(await until(() => h.app.overlay?.kind === "list")).toBe(true);
    expect((h.app.overlay as ListOverlay).items.map((i) => i.label)).toEqual(["a.fk:3", "a.fk:4"]);
    await h.keys("down", "enter");
    expect(h.app.cursorLine(h.app.view!)).toBe(4);
    await h.app.servers!.stopAll();
  });

  test("g y: the type's definition; g I: the implementations, to pick from; none: said (19.13)", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "use it\n  TYPE Shape\nIMPL circle\nIMPL square\n");
    writeFileSync(join(root, "b.fk"), "nothing here\n");
    const h = await harness({ root, open: "a.fk", config: served });
    h.app.startServers();
    h.frame();
    expect(await until(() => (h.frame(), h.app.servers!.list()[0]?.state === "running"))).toBe(true);
    await h.keys("g", "y");
    expect(await until(() => h.app.cursorLine(h.app.view!) === 2)).toBe(true);
    expect(h.app.view!.cur.col).toBe(2); // at TYPE, past the indent
    await h.keys("g", "shift+i");
    expect(await until(() => h.app.overlay?.kind === "list")).toBe(true);
    expect((h.app.overlay as ListOverlay).title).toBe("2 implementations");
    expect((h.app.overlay as ListOverlay).items.map((i) => i.label)).toEqual(["a.fk:3", "a.fk:4"]);
    await h.keys("down", "enter");
    expect(h.app.cursorLine(h.app.view!)).toBe(4);
    await h.app.run("note.open b.fk");
    expect(await until(() => (h.frame(), h.app.servers!.isOpen(join(root, "b.fk"))))).toBe(true);
    await h.keys("g", "shift+i");
    expect(await until(() => h.app.messages.at(-1)?.text === "no implementation found here")).toBe(true);
    await h.app.servers!.stopAll();
  });

  test("a file tree-sitter has no outline of takes its server's symbols as its outline, nested; again as it changes (19.14)", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "function first\n  method inner\nfunction second\n");
    const h = await harness({ root, open: "a.fk", config: served });
    h.app.startServers();
    h.frame();
    const outline = () => h.app.outlineRows().map((r) => `${r.level}:${r.text}`);
    expect(await until(() => (h.frame(), outline().length === 3))).toBe(true);
    expect(outline()).toEqual(["1:first", "2:inner", "1:second"]);
    h.app.view!.buf.edit(h.app.view!.buf.source.length, 0, "function third\n");
    expect(await until(() => (h.frame(), outline().length === 4))).toBe(true);
    await h.app.servers!.stopAll();
  });

  test("in a note slipbox answers itself: shift+k where a link lands, g d follows it, g r its backlinks", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "index.md" });
    const view = h.app.view!;
    const row = h.app.currentLayout(view).links.findIndex((l) => l.target === "notes/alpha.md#section-one");
    const link = h.app.currentLayout(view).links[row]!;
    h.app.moveCursor(view, { row: link.line, col: link.col });
    await h.keys("shift+k");
    expect(h.app.floating?.kind).toBe("hover");
    expect(h.app.floating!.title).toBe("notes/alpha.md › Section One");
    expect(h.app.floating!.view.buf.source).toStartWith("## Section One\n\nBack to [index](../index.md)");
    await h.keys("escape");
    await h.keys("g", "d");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    await h.keys("g", "r");
    expect((h.app.overlay as ListOverlay).title).toMatch(/^Linking to alpha\.md \(\d+\)$/);
  });

  test("shift+k on a path link reads its #fragment: a block's ^id, a heading written percent-encoded (20.2)", async () => {
    const root = makeVault();
    writeFileSync(join(root, "claims.md"), "# Claims\n\nThe first claim holds. ^claim-one\n\n## The Plan\n\nShip it.\n");
    writeFileSync(join(root, "cites.md"), "[c](claims.md#^claim-one)\n\n[p](claims.md#The%20Plan)\n");
    const h = await harness({ root, open: "cites.md" });
    const view = h.app.view!;
    const hoverOn = async (target: string) => {
      const link = h.app.currentLayout(view).links.find((l) => l.target === target)!;
      h.app.moveCursor(view, { row: link.line, col: link.col });
      await h.keys("shift+k");
      expect(h.app.floating?.kind).toBe("hover");
      const got = { title: h.app.floating!.title, source: h.app.floating!.view.buf.source };
      await h.keys("escape");
      return got;
    };
    expect(await hoverOn("claims.md#^claim-one")).toEqual({ title: "claims.md ^claim-one", source: "The first claim holds.\n" });
    const plan = await hoverOn("claims.md#The%20Plan");
    expect(plan.title).toBe("claims.md › The Plan");
    expect(plan.source).toStartWith("## The Plan\n\nShip it.");
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
    // Nor one the walk leaves out: it isn't the vault's.
    mkdirSync(join(root, "node_modules"), { recursive: true });
    writeFileSync(join(root, "node_modules", "dep.ts"), "");
    await h.app.run("note.open node_modules/dep.ts");
    expect(h.app.view!.buf.rel).toBe("fresh-note.md");
    writeFileSync(join(dirname(root), "outside.ts"), "");
    await h.app.run("note.open ../outside.ts");
    expect(h.app.view!.buf.rel).toBe("fresh-note.md");
    expect(h.app.messages.at(-1)!.text).toBe('no note or file "../outside.ts"');
  });
});

describe("what a code file's server changes (19.15)", () => {
  const served = (c: Config) => {
    const launcher = join(sandbox, "fake-ls-launcher-2");
    writeFileSync(launcher, `#!/usr/bin/env node\nawait import(${JSON.stringify(join(import.meta.dir, "fixtures", "fake-lsp.ts"))});\n`);
    c["language-server"] = { fake: { command: launcher, args: ["--stdio"] } };
    c.language = [{ name: "fake", "file-types": ["fk"], "language-servers": ["fake"] }];
  };
  const until = async (ok: () => boolean, ms = 8000) => {
    for (const t = Date.now(); !ok() && Date.now() - t < ms; ) await Bun.sleep(20);
    return ok();
  };
  const ready = async (h: Harness) => {
    h.app.startServers();
    h.frame();
    expect(await until(() => (h.frame(), h.app.servers!.list()[0]?.state === "running"))).toBe(true);
  };

  test("inserts at one place are made in the edit's order, as the preview shows them", async () => {
    const { TextDocument } = await import("vscode-languageserver-textdocument");
    const root = makeVault();
    writeFileSync(join(root, "x.py"), "print(1)\n");
    const h = await harness({ root, open: "index.md" });
    const at = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
    const edits = [{ range: at, newText: "import a\n" }, { range: at, newText: "import b\n" }];
    const preview = TextDocument.applyEdits(TextDocument.create("", "", 0, "print(1)\n"), edits);
    expect(h.app.applyWorkspaceEdit({ changes: { [`file://${join(root, "x.py")}`]: edits } })).toEqual({ files: 1, edits: 2 });
    expect(preview).toBe("import a\nimport b\nprint(1)\n");
    expect(h.app.buffer("x.py")!.source).toBe(preview);
    expect(readFileSync(join(root, "x.py"), "utf8")).toBe(preview); // no window shows it: saved
  });

  test("a character past its line's end is the line's end, as the preview has it — the lines after kept", async () => {
    const root = makeVault();
    writeFileSync(join(root, "code.txt"), "short\nkeep this line\nand this\n");
    const h = await harness({ root, open: "index.md" });
    const edits = [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 100 } }, newText: "SHORT" }];
    expect(h.app.applyWorkspaceEdit({ changes: { [`file://${join(root, "code.txt")}`]: edits } })).toEqual({ files: 1, edits: 1 });
    expect(readFileSync(join(root, "code.txt"), "utf8")).toBe("SHORT\nkeep this line\nand this\n");
  });

  test("space c r: the symbol renamed everywhere the server says, after a preview; a file no window shows is saved", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "REF one REF\n");
    writeFileSync(join(root, "other.fk"), "REF there\n");
    const h = await harness({ root, open: "a.fk", config: served });
    await ready(h);
    await h.keys("space", "c", "r");
    expect(await until(() => h.app.overlay?.kind === "prompt")).toBe(true);
    const p = h.app.overlay as import("../src/tui/app.ts").PromptOverlay;
    expect(p.text).toBe("REF");
    p.text = "NAME";
    await h.keys("enter");
    expect(await until(() => h.app.overlay?.kind === "list")).toBe(true);
    const list = h.app.overlay as ListOverlay;
    expect(list.title).toStartWith("rename REF → NAME: 2 changes in 2 files");
    expect(list.items.map((i) => i.label)).toEqual(["a.fk:1", "other.fk:1"]);
    await h.keys("enter");
    expect(h.app.view!.buf.source).toBe("NAME one NAME\n");
    expect(h.app.view!.buf.dirty).toBe(true); // shown: left for its saving
    expect(readFileSync(join(root, "other.fk"), "utf8")).toBe("NAME there\n"); // not shown: saved
    expect(readFileSync(join(root, "a.fk"), "utf8")).toBe("REF one REF\n");
    await h.app.servers!.stopAll();
  });

  test("space c a: the server's fixes for the line's problems — its edit made, its command run (asking for an edit), resolved late", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "BAD here BAD\n");
    const h = await harness({ root, open: "a.fk", config: served });
    await ready(h);
    expect(await until(() => (h.frame(), h.app.problemsShown(h.app.view!).length === 1))).toBe(true); // a problem a line
    const pick = async (title: string) => {
      await h.keys("space", "c", "a");
      expect(await until(() => h.app.overlay?.kind === "list")).toBe(true);
      const list = h.app.overlay as ListOverlay;
      const i = list.items.findIndex((x) => x.label === title);
      expect(i).toBeGreaterThanOrEqual(0);
      for (let k = 0; k < i; k++) await h.keys("down");
      await h.keys("enter");
    };
    await h.keys("space", "c", "a");
    expect(await until(() => h.app.overlay?.kind === "list")).toBe(true);
    expect((h.app.overlay as ListOverlay).items[0]!.label).toBe("Replace BAD with GOOD"); // the preferred first
    await h.keys("escape");
    await pick("Replace BAD with GOOD");
    expect(h.app.view!.buf.source).toBe("GOOD here BAD\n");
    await pick("Fix all (a command)");
    expect(await until(() => h.app.view!.buf.source === "GOOD here FIXED\n")).toBe(true);
    await pick("Lazy fix");
    expect(await until(() => h.app.view!.buf.source === "LAZY GOOD here FIXED\n")).toBe(true);
    await h.app.servers!.stopAll();
  });

  test("space c f: formatted as the server formats it, one undo step", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "a  b   c\nd    e\n");
    const h = await harness({ root, open: "a.fk", config: served });
    await ready(h);
    await h.keys("space", "c", "f");
    expect(await until(() => h.app.view!.buf.source === "a b c\nd e\n")).toBe(true);
    await h.keys("u");
    expect(h.app.view!.buf.source).toBe("a  b   c\nd    e\n");
    await h.app.servers!.stopAll();
  });
});

describe("completion while typing (19.16)", () => {
  const served = (c: Config) => {
    const launcher = join(sandbox, "fake-ls-launcher-3");
    writeFileSync(launcher, `#!/usr/bin/env node\nawait import(${JSON.stringify(join(import.meta.dir, "fixtures", "fake-lsp.ts"))});\n`);
    c["language-server"] = { fake: { command: launcher, args: ["--stdio"] } };
    c.language = [{ name: "fake", "file-types": ["fk"], "language-servers": ["fake"] }];
  };
  const until = async (ok: () => boolean, ms = 8000) => {
    for (const t = Date.now(); !ok() && Date.now() - t < ms; ) await Bun.sleep(20);
    return ok();
  };
  const ready = async (h: Harness) => {
    h.app.startServers();
    h.frame();
    expect(await until(() => (h.frame(), h.app.servers!.list()[0]?.state === "running"))).toBe(true);
    h.app.serverTriggers(h.app.view!.buf.abs); // asked once its servers run
    await until(() => h.app.serverTriggers(h.app.view!.buf.abs).completion.length > 0);
  };
  const shown = (h: Harness) => h.app.completion?.shown.map((i) => i.label) ?? [];

  test("a word begun: the server's items after a pause, narrowed as it's typed, under the cursor; tab puts one in", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "alpha beta alpine\n");
    const h = await harness({ root, open: "a.fk", config: served });
    await ready(h);
    await h.keys("o", "a", "l");
    expect(await until(() => shown(h).length > 0)).toBe(true);
    expect(shown(h)).toEqual(["alpha", "alpine"]); // narrowed by "al"
    expect(h.frame()).toMatch(/alpha\s*\n.*alpine/); // drawn, one under the other
    await h.keys("p", "i");
    expect(shown(h)).toEqual(["alpine"]); // narrowed again, not asked again
    await h.keys("tab");
    expect(h.app.view!.buf.source).toBe("alpha beta alpine\nalpine\n");
    expect(h.app.completion).toBeNull();
    expect(h.app.view!.insert).toBe(true);
    await h.keys("space", "z", "q");
    await Bun.sleep(300);
    expect(h.app.completion).toBeNull(); // nothing for zq
    await h.app.servers!.stopAll();
  });

  test("after a trigger character at once: ctrl+n moves, enter puts it in with its import; escape closes and leaves insert", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "start\n");
    const h = await harness({ root, open: "a.fk", config: served });
    await ready(h);
    await h.keys("o", "x", ".");
    expect(await until(() => shown(h).length === 2)).toBe(true);
    expect(shown(h)).toEqual(["member", "method"]);
    await h.keys("ctrl+n", "enter");
    expect(h.app.view!.buf.source).toBe("import x\nstart\nx.method\n");
    expect(h.app.view!.insert).toBe(true);
    await h.keys("space", "y", ".");
    expect(h.app.view!.buf.source).toBe("import x\nstart\nx.method y.\n"); // the cursor moved down with its line
    expect(await until(() => shown(h).length === 2)).toBe(true);
    await h.keys("ctrl+e"); // closed, still typing
    expect(h.app.completion).toBeNull();
    expect(h.app.view!.insert).toBe(true);
    await h.keys(".");
    expect(await until(() => shown(h).length === 2)).toBe(true);
    await h.keys("escape");
    expect(h.app.completion).toBeNull();
    expect(h.app.view!.insert).toBe(false);
    await h.app.servers!.stopAll();
  });

  test("the last ask's answer stands: a pause's ask gives way to a trigger's, an older answer arriving late is dropped", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "SLOW start\n");
    const h = await harness({ root, open: "a.fk", config: served });
    await ready(h);
    const members = ["member", "method"];
    // A word's pause asks (answered late); then `.` asks again before that answer comes.
    await h.keys("o", "s", "t");
    await Bun.sleep(150);
    await h.keys(".");
    expect(await until(() => shown(h).length === 2)).toBe(true);
    await Bun.sleep(400);
    expect(shown(h)).toEqual(members);
    // `.` right after a word begun: its pause never asks.
    await h.keys("escape", "o", "x", ".");
    expect(await until(() => shown(h).length === 2)).toBe(true);
    await Bun.sleep(500);
    expect(shown(h)).toEqual(members);
    await h.app.servers!.stopAll();
  });

  test("signature help: after ( the signature, its parameter marked; after , the next; ) closes it", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "start\n");
    const h = await harness({ root, open: "a.fk", config: served });
    await ready(h);
    await h.keys("o", "f", "n", "(");
    expect(await until(() => h.app.signature !== null)).toBe(true);
    const marked = () => h.app.signature!.label.slice(...h.app.signature!.active!);
    expect(marked()).toBe("a: number");
    expect(h.frame()).toContain("fn(a: number, b: string)");
    await h.keys("1", ",");
    expect(await until(() => marked() === "b: string")).toBe(true);
    await h.keys(")");
    expect(h.app.signature).toBeNull();
    await h.app.servers!.stopAll();
  });

  test("up (ctrl+p) from the first item wraps to the last; backspace to the word's start closes the popup", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "alpha beta alpine\n");
    const h = await harness({ root, open: "a.fk", config: served });
    await ready(h);
    await h.keys("o", "x", ".");
    expect(await until(() => shown(h).length === 2)).toBe(true);
    await h.keys("up");
    expect(h.app.completion!.selected).toBe(1);
    await h.keys("ctrl+p");
    expect(h.app.completion!.selected).toBe(0);
    await h.keys("up", "enter");
    expect(h.app.view!.buf.source).toBe("import x\nalpha beta alpine\nx.method\n");
    await h.keys("escape", "o", "a", "l");
    expect(await until(() => shown(h).length > 0)).toBe(true);
    await h.keys("backspace");
    expect(shown(h).slice(0, 2)).toEqual(["alpha", "alpine"]); // "a": open still
    await h.keys("backspace");
    expect(h.app.completion).toBeNull(); // nothing typed of a word
    await Bun.sleep(300);
    expect(h.app.completion).toBeNull(); // and not asked again
    await h.app.servers!.stopAll();
  });

  test("signature help closes when the server has none for where the cursor is", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "start\n");
    const h = await harness({ root, open: "a.fk", config: served });
    await ready(h);
    await h.keys("o", "f", "n", "(");
    expect(await until(() => h.app.signature !== null)).toBe(true);
    await h.keys("enter", ","); // a new line: no call being typed there
    expect(await until(() => h.app.signature === null)).toBe(true);
    await h.app.servers!.stopAll();
  });
});

test("a relayout while typing at a line's end — a resize, the problems bar appearing — keeps the cursor after it", async () => {
  const root = makeVault();
  writeFileSync(join(root, "a.ts"), "const a = 1;\n");
  const h = await harness({ root, open: "a.ts" });
  await h.keys("A", "x");
  h.app.draw(new TextCanvas(100, 30)); // the terminal narrowed: laid out again
  await h.keys("y");
  expect(h.app.view!.buf.source).toBe("const a = 1;xy\n"); // not "1;yx"
});

describe("linters without a server (19.19)", () => {
  const until = async (ok: () => boolean, ms = 5000) => {
    for (const t = Date.now(); !ok() && Date.now() - t < ms; ) await Bun.sleep(20);
    return ok();
  };
  const linters = (c: Config) => {
    c.linter = {
      fake: { "lint-command": "grep -n BAD | sed 's/^\\([0-9]*\\):.*/stdin:\\1:1: [error] found BAD/'; exit 1", "lint-formats": ["%f:%l:%c: [%trror] %m"] },
      saved: { "lint-command": "grep -n BAD ${INPUT} | sed 's/^\\([0-9]*\\):.*/\\1: saved BAD/'; exit 1", "lint-stdin": false, "lint-formats": ["%l: %m"], "lint-severity": 2 },
      gone: { "lint-command": "slipbox-no-such-linter --stdin" },
    };
    c.language = [{ name: "dockerfile", linters: ["fake", "saved", "gone"] }];
    c.lint.enabled = "auto"; // the harness's is off
  };

  test("a file's linters: findings beside their lines as it opens; one reading its input again once typing pauses, one reading the file once saved", async () => {
    const root = makeVault();
    writeFileSync(join(root, "Dockerfile"), "FROM x\nRUN BAD\n");
    const h = await harness({ root, open: "Dockerfile", config: linters });
    const shown = () => h.app.problemsShown(h.app.view!).map((p) => `${p.start.line} ${p.severity} ${p.source}: ${p.message}`);
    expect(await until(() => (h.frame(), shown().length === 2))).toBe(true);
    expect(shown().sort()).toEqual(["2 error fake: found BAD", "2 warning saved: saved BAD"]);
    expect(h.frame()).toMatch(/[┃│] ✖2 RUN BAD/); // the bar: the worse one's sign and its two, beside its line
    // Not installed: said once.
    expect(h.app.messages.filter((m) => m.text.includes("linter gone: slipbox-no-such-linter not found")).length).toBe(1);
    // Typed: the input's linter again after the pause; the file's waits for the save. A line Dockerfile's grammar
    // reads (16.21): no syntax error of its own among the findings.
    await h.keys("shift+g", "o", "R", "U", "N", "space", "B", "A", "D", "escape");
    expect(await until(() => (h.frame(), shown().length === 2))).toBe(true);
    expect(shown().sort()).toEqual(["2 error fake: found BAD", "3 error fake: found BAD"]);
    await h.keys("ctrl+s");
    expect(await until(() => (h.frame(), shown().length === 4))).toBe(true);
    expect(shown().filter((p) => p.includes("saved")).sort()).toEqual(["2 warning saved: saved BAD", "3 warning saved: saved BAD"]);
    expect(h.app.messages.filter((m) => m.text.includes("linter gone")).length).toBe(1); // still once
  });

  test("one not installed, failing for two files at once, is said once", async () => {
    const root = makeVault();
    writeFileSync(join(root, "Dockerfile"), "RUN x\n");
    mkdirSync(join(root, "web"));
    writeFileSync(join(root, "web", "Dockerfile"), "RUN y\n");
    const h = await harness({ root, open: "Dockerfile", config: (c) => (linters(c), (c.language = [{ name: "dockerfile", linters: ["gone"] }])) });
    const other = h.app.buffer("web/Dockerfile")!;
    h.app.ensureLinters(other); // both run together
    h.frame();
    expect(await until(() => other.linted.typed >= 0 && h.app.view!.buf.linted.typed >= 0)).toBe(true);
    await Bun.sleep(300);
    expect(h.app.messages.filter((m) => m.text.includes("linter gone")).length).toBe(1);
  });

  test("off with the lint surface: [lint] enabled = off runs none", async () => {
    const root = makeVault();
    writeFileSync(join(root, "Dockerfile"), "RUN BAD\n");
    const h = await harness({ root, open: "Dockerfile", config: (c) => (linters(c), (c.lint.enabled = "off")) });
    h.frame();
    await Bun.sleep(400);
    h.frame();
    expect(h.app.problemsShown(h.app.view!)).toEqual([]);
  });
});

describe("the switcher's workspace symbols (19.14)", () => {
  const until = async (ok: () => boolean, ms = 8000) => {
    for (const t = Date.now(); !ok() && Date.now() - t < ms; ) await Bun.sleep(20);
    return ok();
  };

  test("# in a note: the vault's headings, by name; enter opens the note there", async () => {
    const root = makeVault();
    writeFileSync(join(root, "deep.md"), "# Deep\n\nintro\n\n## Zebra crossing\n\ntext\n");
    const h = await harness({ root });
    await h.keys("ctrl+p", "#", "z", "e", "b");
    const o = h.app.overlay as ListOverlay;
    expect(o.filtered.map((e) => [e.item.label, e.item.detail])).toEqual([["Zebra crossing", "deep.md:5"]]);
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("deep.md");
    expect(statusRow(h.frame())).toMatch(/L5:/);
    // Without #: notes and files by name, as ever.
    await h.keys("ctrl+p", "d", "e", "e", "p");
    expect((h.app.overlay as ListOverlay).filtered[0]!.item.label).toBe("deep.md");
  });

  test("# in a code file: its servers' workspace symbols, asked as typed; enter opens the file at the symbol", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "start\nfunction alpha\nfunction beta\n  method alpine\n");
    const launcher = join(sandbox, "fake-ls-launcher-ws");
    writeFileSync(launcher, `#!/usr/bin/env node\nawait import(${JSON.stringify(join(import.meta.dir, "fixtures", "fake-lsp.ts"))});\n`);
    chmodSync(launcher, 0o755);
    const h = await harness({
      root,
      open: "a.fk",
      config: (c) => {
        c["language-server"] = { fake: { command: launcher, args: ["--stdio"] } };
        c.language = [{ name: "fake", "file-types": ["fk"], "language-servers": ["fake"] }];
      },
    });
    h.app.startServers();
    h.frame();
    expect(await until(() => (h.frame(), h.app.servers!.list()[0]?.state === "running"))).toBe(true);
    await h.keys("ctrl+p", "#", "a", "l");
    const shown = () => ((h.app.overlay as ListOverlay | null)?.filtered ?? []).map((e) => [e.item.label, e.item.hint, e.item.detail]);
    expect(await until(() => shown().length === 2)).toBe(true);
    expect(shown()).toEqual([
      ["alpha", "function", "a.fk:2"],
      ["alpine", "method", "a.fk:4"],
    ]);
    await h.keys("p", "h"); // asked again as it's typed
    expect(await until(() => shown().length === 1)).toBe(true);
    expect(shown()[0]![0]).toBe("alpha");
    await h.keys("backspace", "backspace");
    expect(await until(() => shown().length === 2)).toBe(true);
    // An older query's answer, arriving after a later one's, is dropped.
    await h.keys("backspace", "backspace", "z");
    await Bun.sleep(250); // asked, answered late
    await h.keys("backspace", "a", "l");
    expect(await until(() => shown().length === 2)).toBe(true);
    await Bun.sleep(400);
    expect(shown().length).toBe(2);
    await h.keys("down", "enter");
    expect(statusRow(h.frame())).toMatch(/L4:10\b/);
    await h.app.servers!.stopAll();
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
  expect((h.app.overlay as ListOverlay).items[0]!.detail).toBe("See [[beta]] and [[dup]].  →  See [beta](notes/beta.md) and [dup](y/dup.md).");
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
    const row = lines.findIndex((l) => l.spans.map((s) => s.text).join("").includes(text));
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

describe("review (tui): vim and editing edges", () => {
  const setup = async (text: string, name = "v.md", files: Record<string, string> = {}) => {
    const root = makeVault();
    writeFileSync(join(root, name), text);
    for (const [f, t] of Object.entries(files)) writeFileSync(join(root, f), t);
    const h = await harness({ root, open: name, width: 100, height: 30 });
    await h.keys("space", "n", "v");
    const v = h.app.view!;
    const keys = async (...ks: string[]) => {
      for (const k of ks) {
        if (k.length > 1 && !k.includes("+") && !["escape", "enter", "backspace", "space", "tab"].includes(k)) {
          for (const ch of k) await h.keys(ch === " " ? "space" : /[A-Z]/.test(ch) ? `shift+${ch.toLowerCase()}` : ch);
        } else await h.keys(k);
      }
    };
    return { h, v, keys, text: () => v.buf.source };
  };
  test("f and t in visual mode take their character; esc cancels it, and a later key isn't taken", async () => {
    const a = await setup("abc.def x\n");
    await a.keys("v", "f", ".", "d");
    expect(a.text()).toBe("def x\n");
    const b = await setup("abc.def x\n");
    await b.keys("v", "f", "escape", "x");
    expect(b.text()).toBe("bc.def x\n"); // one character, never a find of x
  });
  test(". after d/foo and c/foo repeats that change, not an older one", async () => {
    const d = await setup("Zab foo cd foo ef\n");
    await d.keys("x", "d", "/", "foo", "enter");
    expect(d.text()).toBe("foo cd foo ef\n");
    await d.keys("w", ".");
    expect(d.text()).toBe("foo foo ef\n");
    const c = await setup("a1 foo b2 foo end\n");
    await c.keys("c", "/", "foo", "enter", "X", "escape");
    expect(c.text()).toBe("Xfoo b2 foo end\n");
    expect(c.h.app.vim.lastChange).toEqual(["c", "/", "f", "o", "o", "enter", "shift+x", "escape"]);
    await c.keys("f", "b", ".");
    expect(c.text()).toBe("Xfoo Xfoo end\n");
  });
  test(". repeats the text an accepted link completion put in", async () => {
    const { keys, text, h } = await setup("# T\n", "v.md", { "zqother.md": "# Other\n" });
    await keys("o", "[", "a", "]", "(", "z", "q", "o");
    expect(h.app.completion?.shown[0]?.label).toBe("zqother.md");
    await keys("tab", ")", "escape");
    expect(text()).toBe("# T\n[a](zqother.md)\n");
    await keys(".");
    expect(text()).toBe("# T\n[a](zqother.md)\n[a](zqother.md)\n");
  });
  test("cgn after * keeps to whole words, as n does", async () => {
    const { keys, text } = await setup("cat x\ncategory\ncat\n");
    await keys("*", "g", "g", "$", "c", "g", "n", "dog", "escape");
    expect(text()).toBe("cat x\ncategory\ndog\n");
  });
  test("shift+space (the kitty protocol's shifted space) types a space: in insert, a prompt, a list's filter, as f's character", async () => {
    const { keys, text, h, v } = await setup("x y\n");
    await keys("f", "shift+space");
    expect(v.cur.col).toBe(1);
    await keys("0", "i", "shift+h", "shift+space", "shift+w", "escape");
    expect(text()).toBe("H Wx y\n");
    await keys("/", "a", "shift+space", "b");
    expect(h.app.overlay?.kind === "prompt" && h.app.overlay.text).toBe("a b");
    await keys("escape", ":", "a", "shift+space", "b");
    expect(h.app.overlay?.kind === "list" && h.app.overlay.input).toBe("a b");
    await keys("escape");
  });
  test("enter where there's no link names the next-link keys as bound (tab), never ctrl+tab's tab switch", async () => {
    const root = makeVault();
    writeFileSync(join(root, "p.md"), "# P\n\nplain text\n");
    const h = await harness({ root, open: "p.md" });
    await h.app.run("link.follow");
    const said = h.app.messages.at(-1)!.text;
    expect(said).toBe("no link here · tab or ␣ l n goes to the next one");
  });
  test("moving a CRLF note's lines keeps CRLF, with no stray \\r at the end", async () => {
    for (const [input, keys, want] of [
      ["a\r\nb", ["j", "alt+shift+up"], "b\r\na"],
      ["a\r\nb", ["alt+shift+down"], "b\r\na"],
      ["a\r\nb\r\n", ["j", "alt+shift+up"], "b\r\na\r\n"],
      ["a\r\nb\r\nc\r\n", ["alt+shift+down"], "b\r\na\r\nc\r\n"],
    ] as const) {
      const s = await setup(input);
      await s.keys(...keys);
      expect(JSON.stringify(s.text())).toBe(JSON.stringify(want));
    }
  });
  test(". after a visual change counts characters, not code points: a skin tone, a combining accent", async () => {
    for (const first of ["👍🏽", "é"]) {
      const { keys, text } = await setup(`${first}a bcd\n`);
      await keys("v", "l", "d");
      expect(text()).toBe(" bcd\n");
      await keys(".");
      expect(text()).toBe("cd\n");
    }
  });
  test("~ over a letter whose other case is longer (ß, İ) toggles the rest and keeps it", async () => {
    const a = await setup("aßb\n");
    await a.keys("3", "~");
    expect(a.text()).toBe("AßB\n");
    const b = await setup("İstanbul\n");
    await b.keys("8", "~");
    expect(b.text()).toBe("İSTANBUL\n");
  });
});

describe("review (tui): what a filter or a search marks, drawn where it is", () => {
  /** The columns of row `y` drawn in the match colour. */
  const lit = (h: Harness, y: number) => {
    const c = h.canvas();
    const fg = h.app.theme.roles.overlay_match.fg;
    return c.rows[y]!.map((g, x) => (c.styles[y]![x]?.fg === fg && g !== "" ? g : "")).join("");
  };
  test("a name with a control character: the switcher marks the letters typed, not the ones after", async () => {
    const root = makeVault();
    writeFileSync(join(root, "bell\x07ring.md"), "# Bell\n");
    const h = await harness({ root, open: "index.md", width: 120, height: 30 });
    await h.keys("ctrl+p", "r", "i", "n", "g");
    const rows = h.canvas().toString().split("\n");
    const y = rows.findIndex((r) => r.includes("bellring.md"));
    expect(y).toBeGreaterThan(-1);
    expect(lit(h, y)).toBe("ring");
  });
  test("a search hit led by a heading with an escape marks the word itself", async () => {
    const root = makeVault();
    writeFileSync(join(root, "esc.md"), "# E\x07s\x1b[31mc\n\nsome \x1b[31mred\x1b[0m quetzal words\n");
    const h = await harness({ root, open: "index.md", width: 140, height: 30, config: (c) => (c.search.engine = "auto") });
    await h.app.whenSearchIndexed();
    await h.keys("space", "f", "s");
    for (const k of "quetzal") await h.keys(k);
    const list = h.app.overlay as ListOverlay;
    const hit = list.filtered.find((e) => e.item.label.startsWith("esc.md"));
    expect(hit?.item.detail).toContain("\x1b[31m"); // its heading, as written, leads the line: drawn sanitized
    const rows = h.canvas().toString().split("\n");
    const y = rows.findIndex((r) => r.includes("esc.md:3"));
    expect(lit(h, y)).toBe("quetzal");
  });
  test("the explorer's filter marks whole characters: a decomposed accent kept, a wide one whole", async () => {
    const root = makeVault();
    writeFileSync(join(root, "café.md"), "# Café\n");
    writeFileSync(join(root, "日本.md"), "# Japan\n");
    const h = await harness({ root, open: "index.md", width: 140, height: 30 });
    await h.keys("space", "e", "/", "c", "a", "f", "e");
    expect(h.frame()).toContain("café.md");
    expect(h.frame()).not.toContain("cafe.md");
    await h.keys("escape", "/", "日");
    expect(h.frame()).toContain("日本.md");
  });
  test("the explorer's filter marks only what the row shows: never over its menu button", async () => {
    const root = makeVault();
    writeFileSync(join(root, "abcdefghijklmnopqrstuv-qq.md"), "# Q\n");
    const h = await harness({ root, open: "index.md", width: 120, height: 30 });
    await h.keys("space", "e", "/", "q", "q");
    const row = h.frame().split("\n").find((r) => r.includes("abcdefghij"))!;
    expect(row).toContain(h.app.glyphs.itemMenu);
    expect(h.app.geometry!.hot.some((x) => x.id === "xrow:menu")).toBe(true);
  });
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
  const type = async (h: Harness, text: string) => {
    for (const c of text) await h.keys(c === " " ? "space" : c);
  };
  const last = (h: Harness) => h.app.messages.at(-1)!;
  const virtualInTabs = (h: Harness) => h.app.tabs.flatMap((t) => t.views).filter((v) => v.buf.virtual).map((v) => v.buf.key);

  test("a split made with the properties editor open is of the window under it, never of the floating one", async () => {
    const h = await harness();
    h.app.openPropertiesEditor();
    await h.app.run("window.split_side");
    expect(h.app.floating).toBeNull();
    expect(h.app.tab!.views.map((v) => v.buf.key)).toEqual(["index.md", "index.md"]);
    // "In the split" (otherWindow) from a hover: the same.
    const o = await harness();
    o.app.openHover("**x**", "Definition of foo");
    o.app.otherWindow();
    expect(o.app.floating).toBeNull();
    expect(o.app.tab!.views.map((v) => v.buf.key)).toEqual(["index.md", "index.md"]);
    expect([...virtualInTabs(h), ...virtualInTabs(o)]).toEqual([]);
  });

  test("a new note in a nested root or a walk-excluded folder isn't this root's; the nested one opens in its root", async () => {
    const root = makeVault();
    const h = await harness({ root });
    h.app.promptNewNote("");
    await type(h, "nested-vault/idea");
    await h.keys("enter");
    expect(existsSync(join(root, "nested-vault", "idea.md"))).toBe(true);
    expect(h.app.loc.root).toBe(join(root, "nested-vault"));
    expect(h.app.view!.buf.rel).toBe("idea.md");
    expect(h.app.view!.insert).toBe(true); // typed into, as any new note
    const d = await harness({ root: makeVault() }); // walk.exclude = ["drafts/"]
    const r = d.app.createNote("drafts/new-one", "")!;
    expect(d.app.graph.notes.has("drafts/new-one.md")).toBe(false);
    expect(d.app.graph.dirs.filter((x) => x === "drafts" || x.startsWith("drafts/"))).toEqual([]);
    d.app.open(r.open);
    expect(d.app.view!.buf.key).toBe("drafts/new-one.md");
    const n = d.app.createNote("nested-vault/idea", "")!;
    expect(d.app.graph.notes.has("nested-vault/idea.md")).toBe(false);
    expect(n.open).toBe(join(d.root, "nested-vault", "idea.md"));
    d.app.createFolder("drafts/sub", "");
    expect(d.app.graph.dirs.filter((x) => x.startsWith("drafts"))).toEqual([]);
  });

  test("space v shift+m with another note unsaved: refused before anything changes, the .slipbox/ kept", async () => {
    const root = makeVault();
    writeFileSync(join(root, "nested-vault", "other.md"), "# Other\n");
    const h = await harness({ root: join(root, "nested-vault"), open: "inner.md" });
    h.app.buffer("other.md")!.edit(0, 0, "x");
    h.app.unmakeThisVault();
    expect(h.app.overlay).toBeNull(); // no preview
    expect(last(h)).toMatchObject({ level: "warn", text: expect.stringContaining("unsaved: other.md") });
    // Made unsaved while the preview showed: refused at its enter.
    const p = await harness({ root: join(root, "nested-vault"), open: "inner.md" });
    p.app.unmakeThisVault();
    expect(p.app.overlay).not.toBeNull();
    p.app.buffer("other.md")!.edit(0, 0, "x");
    await p.keys("enter");
    expect(existsSync(join(root, "nested-vault", ".slipbox"))).toBe(true);
    expect(p.app.loc.root).toBe(join(root, "nested-vault"));
    expect(last(p)).toMatchObject({ level: "warn", text: expect.stringContaining("unsaved: other.md") });
  });

  test("space n e and space n s from the properties editor hand off its note; from a hover, nothing", async () => {
    const h = await harness({ config: (c) => ((c.editor.command = "myed +{line} {file}"), (c.editor.remote = ["rem {file}"])) });
    const host = (h.app as unknown as { host: Host }).host;
    const calls: string[][] = [];
    host.runForeground = (argv) => (calls.push(argv), 0);
    host.runDetached = async (argv) => (calls.push(argv), 0);
    const note = join(h.root, "index.md");
    h.app.openPropertiesEditor();
    await h.app.run("note.edit");
    expect(h.app.floating).toBeNull();
    h.app.openPropertiesEditor();
    await h.app.run("note.send");
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(["myed", "+1", note]);
    expect(calls[1]).toContain(note);
    h.app.openHover("**x**", "Definition of foo");
    await h.app.run("note.edit");
    await h.app.run("note.send");
    expect(calls).toHaveLength(2);
    expect(last(h).text).toBe("nothing to hand off: this window isn't a file");
    expect(calls.flat().some((a) => a.includes("#properties") || a.includes("hover:"))).toBe(false);
  });

  test("a new note or folder named ..draft is inside the root; a root file named ..notes.md is keyed by its path", async () => {
    const root = makeVault();
    const h = await harness({ root });
    expect(h.app.createNote("..draft", "")).toMatchObject({ rel: "..draft.md", created: true });
    expect(existsSync(join(root, "..draft.md"))).toBe(true);
    expect(h.app.createFolder("..dir", "")).toBe("..dir");
    writeFileSync(join(root, "..notes.md"), "# N\n");
    expect(h.app.buffer("..notes.md")!.key).toBe("..notes.md");
  });

  const fnSetup = async (source: string | Buffer) => {
    const root = makeVault();
    writeFileSync(join(root, "fn.md"), source);
    const h = await harness({ root, open: "fn.md", width: 140 });
    return { root, h, read: () => readFileSync(join(root, "fn.md"), "utf8") };
  };
  const onlyCrlf = (text: string) => expect(text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);

  test("footnotes and the link picker on a CRLF note: never between a CR and its LF, and new lines CRLF", async () => {
    const NOTE = "# Index\r\n\r\nSome words here.\r\n\r\nMore.\r\n";
    // Source mode, on the blank line after the heading.
    const a = await fnSetup(NOTE);
    await a.h.app.run("view.source");
    a.h.app.moveCursor(a.h.app.view!, { row: 1, col: 0 });
    await a.h.app.run("footnote.add");
    await type(a.h, "hi");
    await a.h.keys("enter");
    expect(a.read()).toBe("# Index\r\n[^1]\r\nSome words here.\r\n\r\nMore.\r\n\r\n[^1]: hi\r\n");
    // Rendered, on a word.
    const b = await fnSetup(NOTE);
    const row = rowStarting(b.h, "Some words");
    b.h.app.moveCursor(b.h.app.view!, { row, col: 6 });
    await b.h.app.run("footnote.add");
    await type(b.h, "hi");
    await b.h.keys("enter");
    expect(b.read()).toBe("# Index\r\n\r\nSome words[^1] here.\r\n\r\nMore.\r\n\r\n[^1]: hi\r\n");
    // Rendered, on a paragraph without a word: at its end, which is its blank line's CRLF.
    const e = await fnSetup("# Index\r\n\r\n(!)\r\n\r\nMore.\r\n");
    e.h.app.moveCursor(e.h.app.view!, { row: rowStarting(e.h, "(!)"), col: 1 });
    await e.h.app.run("footnote.add");
    await type(e.h, "hi");
    await e.h.keys("enter");
    expect(e.read()).toBe("# Index\r\n\r\n(!)[^1]\r\n\r\nMore.\r\n\r\n[^1]: hi\r\n");
    // The link picker, in normal mode on a blank line.
    const c = await fnSetup(NOTE);
    await c.h.app.run("view.source");
    c.h.app.moveCursor(c.h.app.view!, { row: 1, col: 0 });
    c.h.app.insertLink(c.h.app.view!);
    await type(c.h, "alpha");
    await c.h.keys("enter");
    expect(c.read()).not.toBe(NOTE);
    onlyCrlf(c.read());
  });

  test("footnotes and the properties editor never bring back a note deleted on disk, nor edit one that isn't UTF-8", async () => {
    const a = await fnSetup("# N\n\nSome words.\n");
    const file = join(a.root, "fn.md");
    const buf = a.h.app.view!.buf;
    // Gone while the question is open.
    await a.h.app.run("footnote.add");
    await type(a.h, "hi");
    rmSync(file);
    a.h.app.reloadBuffer(buf, true);
    expect(buf.deleted).toBe(true);
    await a.h.keys("enter");
    expect(existsSync(file)).toBe(false);
    expect(last(a.h)).toMatchObject({ level: "warn", text: "fn.md was deleted on disk — not editing" });
    // Gone before: not asked.
    await a.h.app.run("footnote.add");
    expect(a.h.app.overlay).toBeNull();
    await a.h.app.run("note.properties");
    expect(a.h.app.floating).toBeNull();
    expect(existsSync(file)).toBe(false);
    // Gone while the properties are edited: not written, and the editor closes.
    const p = await fnSetup("# N\n\nSome words.\n");
    await p.h.app.run("note.properties");
    await p.h.keys("i");
    await type(p.h, "title: T");
    rmSync(join(p.root, "fn.md"));
    p.h.app.reloadBuffer(p.h.app.tab!.views[0]!.buf, true);
    await p.h.keys("escape", "escape");
    expect(p.h.app.floating).toBeNull();
    expect(existsSync(join(p.root, "fn.md"))).toBe(false);
    // Not valid UTF-8: unchanged, never dirty.
    const u = await fnSetup(Buffer.concat([Buffer.from("# N\n\nSome words é"), Buffer.from([0xff]), Buffer.from(".\n")]));
    const ub = u.h.app.view!.buf;
    await u.h.app.run("footnote.add");
    expect(u.h.app.overlay).toBeNull();
    await u.h.app.run("note.properties");
    expect(u.h.app.floating).toBeNull();
    expect(ub.dirty).toBe(false);
  });

  test("a root switch forgets the old root's git states: no marks, no conflicts from it", async () => {
    const h = await harness();
    h.app.gitStates = new Map([["notes/alpha.md", "conflict"]]);
    h.app.gitFolders.set("notes", "conflict");
    expect(h.app.problemRows().some((r) => r.section === "Conflicts")).toBe(true);
    expect(h.app.switchVault(locateVault({ root: makeVault() }), null)).toBe(true);
    expect(h.app.gitStates).toBeNull();
    expect(h.app.gitFolders.size).toBe(0);
    expect(h.app.problemRows().some((r) => r.section === "Conflicts")).toBe(false);
  });

  test("a floating window is never a reading position, and the history is the window's under it", async () => {
    const h = await harness();
    h.app.openPropertiesEditor();
    h.app.saveState();
    h.app.closeFloating();
    h.app.openHover("**x**", "Definition of foo");
    h.app.saveState();
    expect(h.app.positions.entries().map((e) => e.key).filter((k) => k.includes("#properties") || k.startsWith("hover:"))).toEqual([]);
    expect(h.app.historyRows().find((r) => r.here)).toMatchObject({ path: "index.md" });
  });

  test("properties: a yes from ctrl+s (text that doesn't parse, or changed meanwhile) writes them and keeps the editor open", async () => {
    const { h, read } = await fnSetup('+++\ntitle = "T"\n+++\n# T\n');
    await h.app.run("note.properties");
    await h.keys("shift+g", "o");
    await type(h, "broken = ");
    await h.keys("escape", "ctrl+s");
    expect((h.app.overlay as import("../src/tui/app.ts").PromptOverlay).label).toMatch(/^The properties don't parse/);
    await h.keys("y");
    expect(read()).toBe('+++\ntitle = "T"\nbroken =\n+++\n# T\n');
    expect(h.app.floating).not.toBeNull();
    expect(h.app.floating!.view.buf.dirty).toBe(false);
    h.app.tab!.views[0]!.buf.edit(4, 0, "x");
    await h.keys("o");
    await type(h, "more = 1");
    await h.keys("escape", "ctrl+s");
    expect((h.app.overlay as import("../src/tui/app.ts").PromptOverlay).label).toMatch(/properties changed while you edited them/);
    await h.keys("y");
    expect(read()).toContain("more = 1");
    expect(h.app.floating).not.toBeNull();
    expect(h.app.floating!.view.buf.dirty).toBe(false);
  });

  test(". repeats an edit started from the render (o): the same lines again, in source", async () => {
    const root = makeVault();
    writeFileSync(join(root, "r.md"), "# J\n\nalpha one\n\nbeta two\n");
    const h = await harness({ root, open: "r.md" });
    const v = h.app.view!;
    h.app.moveCursor(v, { row: rowStarting(h, "alpha one"), col: 0 });
    await h.keys("o", "x", "y", "escape");
    expect(v.buf.source).toBe("# J\n\nalpha one\nxy\n\nbeta two\n");
    await h.keys("j", "j", ".");
    expect(v.buf.source).toBe("# J\n\nalpha one\nxy\n\nbeta two\nxy\n");
  });

  test(". repeats a terminal paste in normal mode (a put, like p), not the change before it", async () => {
    const root = makeVault();
    writeFileSync(join(root, "p.md"), "abcdef\n");
    const h = await harness({ root, open: "p.md" });
    await h.keys("space", "n", "v", "x");
    const v = h.app.view!;
    await h.app.paste("ZZ");
    expect(v.buf.source).toBe("bZZcdef\n");
    await h.keys(".");
    expect(v.buf.source).toBe("bZZZZcdef\n");
  });
});

describe("lists and commands no test had run (the TUI model)", () => {
  const last = (h: Harness) => h.app.messages.at(-1)!.text;

  test("help: enter on a command runs it", async () => {
    const h = await harness();
    expect(h.app.ui.zen).toBe(false);
    await h.keys("?");
    for (const ch of "zen mode") await h.keys(ch === " " ? "space" : ch);
    const o = h.app.overlay as ListOverlay;
    expect(o.filtered[o.selected]!.item.label).toBe("Zen mode");
    await h.keys("enter");
    await Bun.sleep(10);
    expect(h.app.overlay).toBeNull();
    expect(h.app.ui.zen).toBe(true);
  });

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

  test("backlinks: enter opens the linking note at the link's line", async () => {
    const h = await harness({ open: "notes/beta.md" });
    await h.keys("space", "l", "b");
    const o = h.app.overlay as ListOverlay;
    const pick = o.filtered[o.selected]!.item.data as { from: string; line: number };
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe(pick.from);
    expect(h.app.cursorLine(h.app.view!)).toBe(pick.line);
  });

  test("the links list: enter puts the cursor on the link and follows it", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    await h.keys("space", "l", "l");
    const o = h.app.overlay as ListOverlay;
    expect(o.items.map((i) => i.label)).toContain("beta");
    o.selected = o.filtered.findIndex((e) => e.item.label === "beta");
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
    await h.keys("ctrl+o"); // back: the cursor was put on the link before it was followed
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    expect(rowText(h)).toContain("on to beta");
  });

  test("y y with a mouse selection copies the selection, not the row, and ends it", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    const pane = h.app.geometry!.panes[0]!;
    const row = rowStarting(h, "Back to");
    h.app.handleMouse({ type: "down", x: pane.textX, y: pane.y + row, button: 0 });
    h.app.handleMouse({ type: "drag", x: pane.textX + 6, y: pane.y + row, button: 0 });
    h.app.handleMouse({ type: "up", x: pane.textX + 6, y: pane.y + row, button: 0 });
    h.copied.length = 0;
    await h.keys("y", "y");
    expect(h.copied).toEqual(["Back to"]);
    expect(h.app.view!.sel).toBeNull();
    await h.keys("y", "y"); // no selection now: the row
    expect(h.copied.at(-1)).toBe("Back to index and on to beta.");
  });

  test("a conflict prompt dismissed keeps yours and says how to come back; space n c brings it back, and says when there is none", async () => {
    const root = makeVault();
    const file = join(root, "c.md");
    writeFileSync(file, "line\n");
    const h = await harness({ root, open: "c.md" });
    const v = h.app.view!;
    await h.keys("space", "n", "c");
    expect(last(h)).toBe("c.md has no conflict with the file on disk");
    expect(h.app.overlay).toBeNull();
    await h.keys("shift+a", "!", "escape");
    writeFileSync(file, "theirs\n");
    const future = Date.now() / 1000 + 5;
    utimesSync(file, future, future);
    h.app.reloadBuffer(v.buf);
    expect((h.app.overlay as ListOverlay).title).toContain("changed on disk");
    await h.keys("escape");
    expect(v.buf.conflictKept).toBe(true);
    expect(v.buf.source).toBe("line!\n");
    expect(last(h)).toBe("c.md: keeping yours for now — space n c to resolve");
    await h.keys("space", "n", "c");
    expect((h.app.overlay as ListOverlay).title).toContain("changed on disk");
    await h.keys("l");
    expect(v.buf.source).toBe("theirs\n");
  });

  test(":open of a pointer to a folder this machine doesn't know: said, nothing opened", async () => {
    const h = await harness();
    await h.app.run("note.open slipbox://no-such-folder-here/x.md");
    expect(h.app.messages.at(-1)!.level).toBe("warn");
    expect(last(h)).toStartWith("slipbox://no-such-folder-here/x.md: ");
    expect(h.app.view!.buf.rel).toBe("index.md");
  });

  test("space n x cuts this note, space d x and space d y its folder; space d p in another note's folder moves or copies them there", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    await h.keys("space", "n", "x");
    expect(last(h)).toContain("cut notes/alpha.md");
    await h.app.run("note.open projects/index.md");
    await h.keys("space", "d", "p");
    expect((h.app.overlay as ListOverlay).title).toStartWith("notes/alpha.md → projects/alpha.md");
    await h.keys("enter");
    expect(existsSync(join(root, "projects", "alpha.md"))).toBe(true);
    expect(existsSync(join(root, "notes", "alpha.md"))).toBe(false);
    expect(readFileSync(join(root, "index.md"), "utf8")).toContain("[alpha](projects/alpha.md)");
    // This note's folder copied, pasted beside notes/beta.md.
    await h.keys("space", "d", "y");
    expect(last(h)).toContain("copied projects/");
    await h.app.run("note.open notes/beta.md");
    await h.keys("space", "d", "p");
    expect(existsSync(join(root, "notes", "projects", "index.md"))).toBe(true);
    expect(existsSync(join(root, "projects", "index.md"))).toBe(true);
    // And cut: notes/ moved into projects/.
    await h.keys("space", "d", "x");
    expect(last(h)).toContain("cut notes/");
    await h.app.run("note.open projects/index.md");
    await h.keys("space", "d", "p");
    expect((h.app.overlay as ListOverlay).title).toStartWith("notes/ → projects/notes/");
    await h.keys("enter");
    expect(existsSync(join(root, "projects", "notes", "beta.md"))).toBe(true);
    expect(existsSync(join(root, "notes"))).toBe(false);
  });

  test("a key that is both a command and a prefix: run on its own once the pause passes, not when its sequence follows", async () => {
    const h = await harness({ config: (c) => ((c.input.which_key_delay_ms = 40), (c.keys = { q: "ui.zen", "q q": "cursor.bottom" } as unknown as Config["keys"])) });
    await h.keys("q");
    expect(h.app.ui.zen).toBe(false); // waiting for a second key
    await Bun.sleep(120);
    expect(h.app.pending).toEqual([]);
    expect(h.app.ui.zen).toBe(true);
    await h.keys("q", "q");
    await Bun.sleep(120);
    expect(h.app.ui.zen).toBe(true); // q q ran, q didn't
    expect(h.app.view!.cur.row).toBeGreaterThan(0);
  });

  test("a split with the breadcrumb off: each window titled by its note on its top row", async () => {
    const h = await harness({ width: 160, config: (c) => (c.ui.breadcrumb = false) });
    await h.keys("ctrl+w", "v");
    await h.app.run("note.open notes/beta.md");
    const [a, b] = h.app.geometry!.panes;
    const c = h.canvas();
    const top = (p: typeof a) => c.rows[p!.y - 1]!.slice(p!.x, p!.x + p!.w).join("");
    expect([top(a), top(b)].map((t) => t.trim()).sort()).toEqual(["index.md", "notes/beta.md"]);
  });

  test("the outline of a note without headings says so; Info's filter matching nothing says so", async () => {
    const root = makeVault();
    writeFileSync(join(root, "plain.md"), "just text\n");
    const h = await harness({ root, open: "plain.md" });
    await h.keys("space", "o");
    expect(h.app.rightView).toBe("outline");
    expect(h.frame()).toContain("no headings");
    await h.app.run("info.toggle");
    expect(h.app.rightView).toBe("info");
    expect(h.frame()).not.toContain("no matches");
    h.app.region = "outline";
    await h.keys("/", "z", "q", "x", "j");
    expect(h.frame()).toContain("no matches");
  });

  test("vim: an operator with ; before any f or t says so; di\" and di( with nothing to take leave the line alone", async () => {
    const root = makeVault();
    writeFileSync(join(root, "v.md"), 'no quotes "here\ncall(a, b\n');
    const h = await harness({ root, open: "v.md" });
    await h.keys("space", "n", "v");
    const v = h.app.view!;
    const before = v.buf.source;
    await h.keys("d", ";");
    expect(last(h)).toBe("no f or t to repeat yet");
    expect(v.buf.source).toBe(before);
    await h.keys("d", "i", "shift+'"); // a lone quote: no pair
    expect(v.buf.source).toBe(before);
    await h.keys("j", "$", "d", "i", "shift+9"); // an open bracket never closed
    expect(v.buf.source).toBe(before);
    expect(v.buf.dirty).toBe(false);
  });

  test("vim: a line put after the last line of a note without a final line break, one undo step", async () => {
    const root = makeVault();
    writeFileSync(join(root, "v.md"), "first\nlast");
    const h = await harness({ root, open: "v.md" });
    await h.keys("space", "n", "v");
    const v = h.app.view!;
    await h.keys("y", "y", "j", "p");
    expect(v.buf.source).toBe("first\nlast\nfirst");
    expect(h.app.cursorLine(v)).toBe(3);
    await h.keys("u");
    expect(v.buf.source).toBe("first\nlast");
  });

  test("space n shift+y on a note gone from disk: said, no copy, still on it", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    rmSync(join(root, "notes", "alpha.md"));
    await h.keys("space", "n", "shift+y");
    expect(h.app.messages.at(-1)!.level).toBe("warn");
    expect(last(h)).toContain("no note, file or folder notes/alpha.md");
    expect(existsSync(join(root, "notes", "alpha-copy.md"))).toBe(false);
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
  });

  test(":s///c: l replaces the match asked about and stops", async () => {
    const root = makeVault();
    writeFileSync(join(root, "s.md"), "cat cat\ncat\n");
    const h = await harness({ root, open: "s.md" });
    await h.keys(":", ..."%s/cat/X/gc", "enter");
    expect(h.frame()).toContain("replace? y n a q");
    await h.keys("n", "l");
    expect(h.app.overlay).toBeNull();
    expect(h.app.view!.buf.source).toBe("cat X\ncat\n");
    expect(last(h)).toBe("1 substitution");
  });
});

describe("what keymap.md and tui.md promise (review: docs against the tests)", () => {
  test("lists: down wraps to the top, ctrl+j / ctrl+k move, the page keys and ctrl+d / ctrl+u go by 10; n/m counts; ctrl+g cancels", async () => {
    const h = await harness({ width: 120, height: 40 });
    await h.keys("ctrl+p");
    const o = h.app.overlay as ListOverlay;
    const n = o.filtered.length;
    expect(n).toBeGreaterThan(25);
    const counter = () => h.frame().match(/ (\d+)\/(\d+) /)?.slice(1).map(Number);
    expect(counter()).toEqual([1, n]); // in the bottom border
    await h.keys("pagedown");
    expect(o.selected).toBe(10);
    await h.keys("ctrl+d");
    expect(o.selected).toBe(20);
    expect(counter()).toEqual([21, n]);
    await h.keys("pageup");
    expect(o.selected).toBe(10);
    await h.keys("ctrl+u");
    expect(o.selected).toBe(0);
    await h.keys("ctrl+j", "ctrl+j", "ctrl+k");
    expect(o.selected).toBe(1);
    await h.keys("ctrl+k", "ctrl+k"); // up from the first: the last
    expect(o.selected).toBe(n - 1);
    await h.keys("down"); // down from the last: the first
    expect(o.selected).toBe(0);
    for (const c of "zqxjzqxj") await h.keys(c);
    expect(h.frame()).toContain("no matches");
    expect(counter()).toEqual([0, 0]);
    await h.keys("ctrl+g");
    expect(h.app.overlay).toBeNull();
    // A list without a filter (the folder's info): j and k move, a letter types nothing.
    await h.keys("space", "v", "i");
    const info = h.app.overlay as ListOverlay;
    expect(info.filterable).toBe(false);
    await h.keys("j", "j", "k");
    expect(info.selected).toBe(1);
    expect(info.input).toBe("");
    await h.keys("ctrl+c");
    expect(h.app.overlay).toBeNull();
  });

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
    h.app.applyChanges({ changes: [{ rel: name, kind: "changed", isNote: true }], rescan: false });
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
      return h.frame().split("\n")[b.y + 1]!.slice(b.x, b.x + b.w);
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
    // Times: an info message goes after 4 s, an error stays 8 s.
    h.app.dismissToasts();
    h.app.message("error", "broke");
    h.app.message("info", "fyi");
    now += 4_001;
    h.app.message("info", "later");
    expect(h.app.toasts.map((t) => t.text)).toEqual(["later", "broke"]); // the info gone after 4 s
    now += 3_000;
    h.app.message("info", "at 7 s");
    expect(h.app.toasts.map((t) => t.text)).toEqual(["at 7 s", "later", "broke"]); // the error still
    now += 999;
    h.app.message("info", "at 8 s");
    expect(h.app.toasts.map((t) => t.text)).toEqual(["at 8 s", "at 7 s", "later"]); // gone after 8 s
  });

  test("selection keys: shift+ctrl+end / home to the note's ends, shift+ctrl+down by paragraph, shift+pagedown by page", async () => {
    const root = makeVault();
    writeFileSync(join(root, "long.md"), Array.from({ length: 60 }, (_, i) => `Line ${i + 1}.`).join("\n\n") + "\n");
    const h = await harness({ root, open: "long.md", height: 30 });
    const v = h.app.view!;
    const last = h.app.currentLayout(v).lines.length - 1;
    await h.keys("j", "j", "shift+ctrl+end");
    expect(v.sel?.anchor.row).toBe(2);
    expect(v.cur.row).toBe(last);
    await h.keys("escape", "shift+ctrl+home");
    expect(v.sel?.anchor.row).toBe(last);
    expect(v.cur.row).toBe(0);
    await h.keys("escape", "shift+ctrl+down");
    expect(v.sel?.anchor.row).toBe(0);
    expect(v.cur.row).toBe(1); // the blank row after the first paragraph
    await h.keys("escape", "g", "g", "shift+pagedown");
    expect(v.sel?.anchor.row).toBe(0);
    expect(v.cur.row).toBeGreaterThan(15);
    await h.keys("ctrl+c");
    expect(h.copied.at(-1)).toMatch(/^Line 1\.\n\nLine 2\.\n\nLine 3\./); // the rows between, copied
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
