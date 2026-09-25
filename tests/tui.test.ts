// The TUI model, driven headlessly: keys in, TextCanvas out. Plus one end-to-end run through
// OpenTUI's test renderer so real key parsing and the frame-buffer adapter are exercised too.

import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync, writeFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { App, type Host } from "../src/tui/app.ts";
import { TextCanvas } from "../src/tui/canvas.ts";
import { keyName } from "../src/tui/keys.ts";
import { DEFAULT_CONFIG, type Config } from "../src/core/config.ts";
import { openGraph } from "../src/core/graph.ts";
import { locateVault } from "../src/core/vault.ts";
import { COMMAND_SPECS } from "../src/core/command-specs.ts";
import { DEFAULT_KEYS } from "../src/tui/keys.ts";

const sandbox = mkdtempSync(join(tmpdir(), "slipbox-tui-"));
process.env.XDG_STATE_HOME = join(sandbox, "state");
process.env.XDG_CACHE_HOME = join(sandbox, "cache");
process.env.XDG_CONFIG_HOME = join(sandbox, "config");
delete process.env.NO_COLOR;
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

/** A fresh copy of the fixture vault plus the samples, so tests can write to it. */
function makeVault(): string {
  const dir = mkdtempSync(join(sandbox, "vault-"));
  cpSync(join(import.meta.dir, "fixtures", "vault"), dir, { recursive: true, verbatimSymlinks: true });
  cpSync(join(import.meta.dir, "..", "docs", "samples"), join(dir, "samples"), { recursive: true });
  return dir;
}

interface Harness {
  app: App;
  canvas: TextCanvas;
  copied: string[];
  quit: { called: boolean };
  keys: (...ks: string[]) => Promise<string>;
  frame: () => string;
  root: string;
}

async function harness(opts: { width?: number; height?: number; open?: string; config?: Partial<Config["ui"]>; root?: string } = {}): Promise<Harness> {
  const root = opts.root ?? makeVault();
  const config: Config = structuredClone(DEFAULT_CONFIG);
  config.ui = { ...config.ui, restore_session: false, ...opts.config };
  config.render.glyphs = "unicode";
  config.walk.exclude = ["drafts/"];
  const loc = locateVault({ root });
  const graph = openGraph(loc, config, false);
  const copied: string[] = [];
  const quit = { called: false };
  const host: Host = { requestRender() {}, osc52: (t) => (copied.push(t), true), quit: () => (quit.called = true) };
  const app = new App({ loc, config, graph, host, open: opts.open ?? "index.md", watch: false });
  const canvas = new TextCanvas(opts.width ?? 120, opts.height ?? 30);
  const frame = () => {
    const c = new TextCanvas(canvas.width, canvas.height);
    app.draw(c);
    return c.toString();
  };
  frame();
  const keys = async (...ks: string[]) => {
    for (const k of ks) {
      await app.handleKey(k);
      frame();
    }
    return frame();
  };
  return { app, canvas, copied, quit, keys, frame, root };
}

describe("layout and drawing (3.1, 3.2)", () => {
  test("sidebar, content and status line are all on screen", async () => {
    const h = await harness();
    const f = h.frame();
    expect(f).toContain("▸ notes");
    expect(f).toContain("▌ Home");
    expect(f.split("\n").at(-1)).toContain("READ");
    expect(f.split("\n").at(-1)).toContain("index.md");
  });
  test("only the viewport is drawn, and scrolling moves it", async () => {
    const h = await harness({ open: "samples/large-document.md", height: 20 });
    const before = h.frame();
    await h.keys("ctrl+d");
    const after = h.frame();
    expect(after).not.toEqual(before);
    expect(h.app.view!.top).toBeGreaterThan(0);
    await h.keys("G");
    const layout = h.app.currentLayout(h.app.view!);
    expect(h.app.view!.top).toBe(layout.lines.length - h.app.view!.height);
    await h.keys("g", "g");
    expect(h.app.view!.top).toBe(0);
  });
  test("heading jumps", async () => {
    const h = await harness({ open: "samples/large-document.md" });
    await h.keys("}");
    const layout = h.app.currentLayout(h.app.view!);
    expect(layout.headings.some((x) => x.line === h.app.view!.top)).toBe(true);
    const first = h.app.view!.top;
    await h.keys("}", "{");
    expect(h.app.view!.top).toBe(first);
  });
  test("tiny terminals do not crash", async () => {
    const h = await harness({ width: 9, height: 3 });
    expect(h.frame()).toContain("slipbox");
    h.canvas; // keep
    const h2 = await harness({ width: 20, height: 6 });
    expect(() => h2.frame()).not.toThrow();
  });
});

describe("links and history (link-follow, 3.6)", () => {
  test("Tab focuses the first link in view; Enter follows; H goes back; L forward", async () => {
    const h = await harness();
    await h.keys("tab");
    expect(h.app.focusedLink()!.target).toBe("alpha");
    expect(h.frame().split("\n").at(-1)).toContain("[[alpha]]");
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    await h.keys("H");
    expect(h.app.view!.buf.rel).toBe("index.md");
    await h.keys("L");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
  });
  test("a heading link lands on the heading", async () => {
    const h = await harness({ height: 12 });
    const layout = h.app.currentLayout(h.app.view!);
    const idx = layout.links.findIndex((l) => l.heading === "Section One");
    h.app.view!.focusLink = idx;
    await h.keys("enter");
    const v = h.app.view!;
    const l2 = h.app.currentLayout(v);
    expect(v.buf.rel).toBe("notes/alpha.md");
    // A short note cannot scroll the heading to the top; it must at least be on screen.
    const row = l2.lines.findIndex((l) => l.spans.map((s) => s.text).join("").includes("Section One"));
    expect(row).toBeGreaterThanOrEqual(v.top);
    expect(row).toBeLessThan(v.top + v.height);
  });
  test("unresolved links say so; collisions resolve by directory", async () => {
    const h = await harness();
    const layout = h.app.currentLayout(h.app.view!);
    h.app.view!.focusLink = layout.links.findIndex((l) => l.target === "missing-note");
    await h.keys("enter");
    expect(h.app.transient!.text).toContain("unresolved link [[missing-note]]");
    expect(h.app.view!.buf.rel).toBe("index.md");
    await h.app.run("note.open projects/index.md");
    h.app.view!.focusLink = h.app.currentLayout(h.app.view!).links.findIndex((l) => l.target === "index");
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("projects/index.md");
  });
  test("ambiguous links open a picker", async () => {
    const root = makeVault();
    writeFileSync(join(root, "notes", "dup.md"), "# a\n");
    writeFileSync(join(root, "projects", "dup.md"), "# b\n");
    writeFileSync(join(root, "amb.md"), "[[dup]]\n");
    const h = await harness({ root, open: "amb.md" });
    await h.keys("tab", "enter");
    expect(h.app.overlay?.kind).toBe("list");
    expect(h.frame()).toContain("projects/dup.md");
    await h.keys("down", "enter");
    expect(h.app.view!.buf.rel).toBe("projects/dup.md");
  });
  test("external links are copied, not opened; attachments copy their path", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    const layout = h.app.currentLayout(h.app.view!);
    h.app.view!.focusLink = layout.links.findIndex((l) => l.target.startsWith("https://"));
    await h.keys("enter");
    expect(h.copied).toContain("https://example.invalid");
    await h.app.run("note.open index.md");
    h.app.view!.focusLink = h.app.currentLayout(h.app.view!).links.findIndex((l) => l.kind === "embed");
    await h.keys("enter");
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
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
  });
});

describe("overlays (3.8–3.10, 3.13)", () => {
  test("quick switcher filters fuzzily and opens", async () => {
    const h = await harness();
    await h.keys("ctrl+p", "b", "e", "t");
    const o = h.app.overlay!;
    expect(o.kind === "list" && o.filtered[0]!.item.data).toBe("notes/beta.md");
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
    expect(h.app.overlay).toBeNull();
  });
  test("outline jumps to a heading", async () => {
    const h = await harness({ open: "samples/large-document.md", height: 20 });
    await h.keys("o");
    expect(h.frame()).toContain("Outline");
    await h.keys("down", "down", "down", "enter");
    expect(h.app.view!.top).toBeGreaterThan(0);
  });
  test("palette runs a command by name", async () => {
    const h = await harness();
    await h.keys(":", "s", "p", "l", "i", "t");
    await h.keys("enter");
    expect(h.app.tab!.views).toHaveLength(2);
  });
  test("Esc cancels; the escape key never leaks into the note", async () => {
    const h = await harness();
    await h.keys("ctrl+p", "x", "escape");
    expect(h.app.overlay).toBeNull();
  });
  test("links and backlinks lists", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    await h.keys("space", "r");
    expect(h.frame()).toContain("Linking to alpha.md");
    await h.keys("escape", "space", "l");
    expect(h.frame()).toContain("Links from alpha.md");
  });
  test("theme picker previews live and Esc restores", async () => {
    const h = await harness();
    await h.keys("space", "t");
    await h.keys("down");
    const previewed = h.app.theme.name;
    expect(previewed).not.toBe("tokyo-night");
    await h.keys("escape");
    expect(h.app.theme.name).toBe("tokyo-night");
  });
  test("every message lands in the sink and the messages list", async () => {
    const h = await harness();
    await h.keys("Z");
    expect(h.app.messages.at(-1)!.text).toContain("not bound");
    await h.keys("space", "m");
    expect(h.frame()).toContain("Messages");
  });
  test("help lists every bound command", async () => {
    const h = await harness({ height: 40 });
    await h.keys("?");
    expect(h.frame()).toContain("Keys");
  });
});

describe("find in note", () => {
  test("incremental, n/N cycle, Esc clears", async () => {
    const h = await harness({ open: "samples/dense-tables.md" });
    await h.keys("/", "m", "o", "d", "e", "enter");
    const v = h.app.view!;
    expect(v.find!.matches.length).toBeGreaterThan(3);
    const first = v.find!.current;
    await h.keys("n");
    expect(v.find!.current).toBe(first + 1);
    await h.keys("N");
    expect(v.find!.current).toBe(first);
    await h.keys("escape");
    expect(v.find).toBeNull();
  });
});

describe("tabs, split, buffers (3.3)", () => {
  test("split shares the buffer; ctrl+w w moves focus; each pane scrolls alone", async () => {
    const h = await harness({ open: "samples/large-document.md" });
    await h.keys("ctrl+w", "v");
    const [a, b] = h.app.tab!.views;
    expect(a!.buf).toBe(b!.buf);
    await h.keys("ctrl+d");
    expect(b!.top).toBeGreaterThan(0);
    expect(a!.top).toBe(0);
    await h.keys("ctrl+w", "w", "ctrl+w", "v");
    expect(h.app.tab!.views).toHaveLength(1);
  });
  test("narrow terminals stack the split", async () => {
    const h = await harness({ width: 70, height: 30 });
    await h.keys("ctrl+w", "v");
    const [p1, p2] = h.app.geometry!.panes;
    expect(p1!.x).toBe(p2!.x);
    expect(p2!.y).toBeGreaterThan(p1!.y);
  });
  test("tabs: new, next, close", async () => {
    const h = await harness();
    await h.keys("t");
    expect(h.app.tabs).toHaveLength(2);
    expect(h.frame().split("\n")[0]).toContain("1 index");
    await h.keys("g", "t");
    expect(h.app.activeTab).toBe(0);
    await h.keys("ctrl+w", "c");
    expect(h.app.tabs).toHaveLength(1);
    await h.keys("ctrl+w", "c");
    expect(h.app.tabs).toHaveLength(1);
  });
  test("buffers list", async () => {
    const h = await harness();
    await h.app.run("note.open notes/alpha.md");
    await h.keys("space", "b");
    expect(h.frame()).toContain("index.md");
  });
});

describe("file explorer (3.7) and narrow collapse (3.14)", () => {
  test("navigate, expand, collapse, open", async () => {
    const h = await harness();
    await h.keys("ctrl+w", "h");
    expect(h.app.region).toBe("sidebar");
    const rows = h.app.treeRows();
    const notesDir = rows.findIndex((r) => r.path === "notes");
    h.app.sidebar.selected = notesDir;
    await h.keys("h");
    expect(h.app.treeRows().some((r) => r.path === "notes/alpha.md")).toBe(false);
    await h.keys("l");
    expect(h.app.treeRows().some((r) => r.path === "notes/alpha.md")).toBe(true);
    await h.keys("j", "enter");
    expect(h.app.view!.buf.rel!.startsWith("notes/")).toBe(true);
    await h.keys("escape");
    expect(h.app.region).toBe("content");
  });
  test("directories first, and walk exclusions never appear", async () => {
    const h = await harness();
    const rows = h.app.treeRows().filter((r) => r.depth === 0);
    const firstNote = rows.findIndex((r) => r.kind === "note");
    expect(rows.slice(firstNote).every((r) => r.kind === "note")).toBe(true);
    const all = [...h.app.graph.notes.keys()];
    expect(all.some((p) => p.includes("node_modules") || p.startsWith("drafts/"))).toBe(false);
  });
  test("narrow: sidebar hidden beside content, shown as an overlay when toggled", async () => {
    const h = await harness({ width: 60, height: 20 });
    // The sidebar setting is on, but below narrow_width it overlays instead of taking columns.
    expect(h.app.geometry!.panes[0]!.x).toBe(0);
    expect(h.frame()).not.toContain("▸ notes");
    await h.keys("space", "e");
    expect(h.app.region).toBe("sidebar");
    expect(h.frame()).toContain("▸ notes");
    await h.keys("escape");
    expect(h.frame()).not.toContain("▸ notes");
    // Widening the terminal brings back the beside-content explorer preference.
    const wide = new TextCanvas(140, 20);
    h.app.draw(wide);
    expect(wide.toString()).toContain("▸ notes");
  });
  test("mouse click in the sidebar opens a note", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    const rows = h.app.treeRows();
    const i = rows.findIndex((r) => r.path === "notes/beta.md");
    const sb = h.app.geometry!.sidebar!;
    h.app.handleMouse({ type: "down", x: sb.x + 3, y: sb.y + i - h.app.sidebar.scroll, button: 0 });
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
  });
});

describe("selection and copying", () => {
  test("drag selects and copies on release, across rows", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    const pane = h.app.geometry!.panes[0]!;
    const layout = h.app.currentLayout(h.app.view!);
    const row = layout.lines.findIndex((l) => l.spans.map((s) => s.text).join("").startsWith("Back to"));
    h.app.handleMouse({ type: "down", x: pane.textX, y: pane.y + row, button: 0 });
    h.app.handleMouse({ type: "drag", x: pane.textX + 6, y: pane.y + row, button: 0 });
    h.app.handleMouse({ type: "up", x: pane.textX + 6, y: pane.y + row, button: 0 });
    expect(h.copied.at(-1)).toBe("Back to");
    h.app.handleMouse({ type: "down", x: pane.textX, y: pane.y + row - 2, button: 0 });
    h.app.handleMouse({ type: "drag", x: pane.textX + 100, y: pane.y + row, button: 0 });
    h.app.handleMouse({ type: "up", x: pane.textX + 100, y: pane.y + row, button: 0 });
    expect(h.copied.at(-1)).toContain("Section One\n\nBack to [[index]]".replace("[[index]]", "index"));
  });
  test("y r copies a path:line reference; y p the path", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    await h.keys("y", "r");
    expect(h.copied.at(-1)).toBe("notes/alpha.md:1");
    await h.keys("y", "p");
    expect(h.copied.at(-1)).toEndWith("/notes/alpha.md");
  });
  test("mouse wheel scrolls the pane under the pointer", async () => {
    const h = await harness({ open: "samples/large-document.md" });
    const pane = h.app.geometry!.panes[0]!;
    h.app.handleMouse({ type: "scroll", x: pane.x + 5, y: pane.y + 2, button: 0, scroll: { direction: "down", delta: 1 } });
    expect(h.app.view!.top).toBe(3);
  });
});

describe("capture from the TUI (8.x)", () => {
  test("c c captures a path:line reference; selection capture keeps the text", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    await h.keys("c", "c");
    const pane = h.app.geometry!.panes[0]!;
    h.app.handleMouse({ type: "down", x: pane.textX, y: pane.y + 7, button: 0 });
    h.app.handleMouse({ type: "drag", x: pane.textX + 6, y: pane.y + 7, button: 0 });
    h.app.handleMouse({ type: "up", x: pane.textX + 6, y: pane.y + 7, button: 0 });
    await h.keys("c", "s");
    const text = require("node:fs").readFileSync(h.app.scratch().path, "utf8");
    expect(text).toStartWith("`notes/alpha.md:1`\n\n`notes/alpha.md:");
    expect(text).toContain("```\n");
    await h.keys("space", "s");
    expect(h.app.view!.buf.abs).toBe(h.app.scratch().path);
    await h.keys("c", "y");
    expect(h.copied.at(-1)).toBe(text);
  });
});

describe("external changes (5.3, 5.4) and reload anchoring (3.5)", () => {
  test("a clean buffer reloads silently, keeps its heading anchor, and says so", async () => {
    const h = await harness({ open: "samples/large-document.md", height: 20 });
    const v = h.app.view!;
    await h.keys("}", "}", "}");
    const before = h.app.currentLayout(v).lines[v.top]!.spans.map((s) => s.text).join("");
    const file = join(h.root, "samples", "large-document.md");
    const src = require("node:fs").readFileSync(file, "utf8");
    writeFileSync(file, `# Inserted by an agent\n\n${"A new paragraph.\n\n".repeat(20)}${src}`);
    h.app.applyChanges({ changes: [{ rel: "samples/large-document.md", kind: "changed", isNote: true }], rescan: false });
    const after = h.app.currentLayout(v).lines[v.top]!.spans.map((s) => s.text).join("");
    expect(after).toBe(before);
    expect(h.frame()).toContain("↻");
    expect(h.app.transient!.text).toContain("changed on disk");
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
    expect(h.app.view!.buf.source).toContain("now exists");
  });
  test("the real watcher: write, temp-and-rename, create, delete", async () => {
    const root = makeVault();
    const config: Config = structuredClone(DEFAULT_CONFIG);
    config.ui.restore_session = false;
    config.watch.debounce_ms = 30;
    config.watch.poll_ms = 100;
    const loc = locateVault({ root });
    const graph = openGraph(loc, config, false);
    let renders = 0;
    const app = new App({ loc, config, graph, host: { requestRender: () => void renders++, osc52: () => true, quit() {} }, open: "notes/beta.md" });
    try {
      app.draw(new TextCanvas(100, 30));
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const until = async (pred: () => boolean) => {
        const end = Date.now() + 3000;
        while (!pred() && Date.now() < end) await wait(20);
      };
      writeFileSync(join(root, "notes", "beta.md"), "# Beta v2\n");
      await until(() => app.view!.buf.source === "# Beta v2\n");
      expect(app.view!.buf.source).toBe("# Beta v2\n");
      writeFileSync(join(root, "notes", ".beta.tmp"), "# Beta v3\n");
      renameSync(join(root, "notes", ".beta.tmp"), join(root, "notes", "beta.md"));
      await until(() => app.view!.buf.source === "# Beta v3\n");
      expect(app.view!.buf.source).toBe("# Beta v3\n");
      require("node:fs").mkdirSync(join(root, "fresh"));
      await wait(150);
      writeFileSync(join(root, "fresh", "new.md"), "# New\n");
      await until(() => app.graph.notes.has("fresh/new.md"));
      expect(app.graph.notes.has("fresh/new.md")).toBe(true);
      writeFileSync(join(root, "node_modules", "pkg", "x.md"), "# never\n");
      await wait(300);
      expect(app.graph.notes.has("node_modules/pkg/x.md")).toBe(false);
      rmSync(join(root, "notes", "beta.md"));
      await until(() => app.view!.buf.deleted);
      expect(app.view!.buf.deleted).toBe(true);
      expect(renders).toBeGreaterThan(0);
      // The copied vault holds a dangling symlink at its root (outside-link.md), which makes
      // Bun's fs.watch fail for that directory: it must be polled and reported, not dropped.
      expect(app.watcher!.polledDirs).toContain("");
      expect(app.messages.some((m) => m.text.includes("polling it"))).toBe(true);
    } finally {
      app.watcher?.close();
    }
  });
});

describe("state (3.4, 3.15)", () => {
  test("reading position per note survives leaving and returning", async () => {
    const h = await harness({ open: "samples/large-document.md", height: 20 });
    await h.keys("ctrl+d", "ctrl+d");
    const top = h.app.view!.top;
    await h.app.run("note.open index.md");
    await h.app.run("note.open samples/large-document.md");
    h.frame();
    expect(h.app.view!.top).toBe(top);
  });
  test("session restore reopens tabs and splits", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    await h.keys("ctrl+w", "v", "t");
    h.app.quit();
    expect(h.quit.called).toBe(true);
    const config: Config = structuredClone(DEFAULT_CONFIG);
    const loc = locateVault({ root: h.root });
    const app2 = new App({ loc, config, graph: openGraph(loc, config, false), host: { requestRender() {}, osc52: () => true, quit() {} }, watch: false });
    expect(app2.tabs).toHaveLength(2);
    expect(app2.tabs[0]!.views).toHaveLength(2);
    expect(app2.activeTab).toBe(1);
  });
  test("q quits and saves", async () => {
    const h = await harness();
    await h.keys("q");
    expect(h.quit.called).toBe(true);
  });
});

describe("keymap and registry (0.8, 3.11, 3.12)", () => {
  test("every default binding names a registered command", async () => {
    const h = await harness();
    for (const cmd of Object.values(DEFAULT_KEYS)) expect(h.app.registry.get(cmd)).toBeDefined();
  });
  test("every command spec is implemented by the TUI", async () => {
    const h = await harness();
    for (const s of COMMAND_SPECS) expect(h.app.registry.get(s.id)).toBeDefined();
  });
  test("config remaps by command id; unknown ids are reported", async () => {
    const root = makeVault();
    const config: Config = structuredClone(DEFAULT_CONFIG);
    config.ui.restore_session = false;
    config.keys = { x: "scroll.bottom", j: "", Q: "no.such.command" };
    const loc = locateVault({ root });
    const app = new App({ loc, config, graph: openGraph(loc, config, false), host: { requestRender() {}, osc52: () => true, quit() {} }, open: "samples/large-document.md", watch: false });
    app.draw(new TextCanvas(100, 20));
    await app.handleKey("x");
    expect(app.view!.top).toBeGreaterThan(0);
    await app.handleKey("j");
    expect(app.transient!.text).toContain("not bound");
    expect(app.messages.some((m) => m.text.includes("no.such.command"))).toBe(true);
  });
  test("space is a page-down and a leader: alone it pages after a pause", async () => {
    const h = await harness({ open: "samples/large-document.md" });
    await h.keys("space");
    expect(h.app.pending).toEqual(["space"]);
    await new Promise((r) => setTimeout(r, 500));
    expect(h.app.view!.top).toBeGreaterThan(0);
  });
  test("key naming", () => {
    const k = (name: string, sequence: string, mods: Partial<{ ctrl: boolean; meta: boolean; shift: boolean }> = {}) =>
      keyName({ name, sequence, ctrl: false, meta: false, shift: false, ...mods });
    expect(k("g", "G", { shift: true })).toBe("G");
    expect(k("p", "\x10", { ctrl: true })).toBe("ctrl+p");
    expect(k("return", "\r")).toBe("enter");
    expect(k("tab", "\x1b[Z", { shift: true })).toBe("shift+tab");
    expect(k("space", " ")).toBe("space");
    expect(k("?", "?")).toBe("?");
    expect(k("left", "\x1b[1;3D", { meta: true })).toBe("alt+left");
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
    mockInput.pressTab();
    await new Promise((r) => setTimeout(r, 20));
    mockInput.pressEnter();
    await new Promise((r) => setTimeout(r, 20));
    await renderOnce();
    expect(app.view!.buf.rel).toBe("notes/alpha.md");
    expect(captureCharFrame()).toContain("Section One");
    mockInput.pressKey("p", { ctrl: true });
    await new Promise((r) => setTimeout(r, 20));
    await renderOnce();
    expect(captureCharFrame()).toContain("Open note");
    renderer.destroy();
  });
});
