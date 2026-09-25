// One test per bug found by the adversarial review of phases 1–2 (2026-09-25), so none returns.

import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../src/cli/cli.ts";
import { parseRef } from "../src/core/capture.ts";
import { DEFAULT_CONFIG, loadConfig, type Config } from "../src/core/config.ts";
import { glyphsFor } from "../src/core/glyphs.ts";
import { openGraph } from "../src/core/graph.ts";
import { renderMarkdown } from "../src/core/layout/render.ts";
import { LinkIndex } from "../src/core/links.ts";
import { loadSession, saveSession } from "../src/core/position.ts";
import { listThemes } from "../src/core/theme/index.ts";
import { locateVault } from "../src/core/vault.ts";
import { WalkFilter, walkVault } from "../src/core/walk.ts";
import { stringWidth } from "../src/core/width.ts";
import { App, computeFind, selectedText } from "../src/tui/app.ts";
import { TextCanvas } from "../src/tui/canvas.ts";

const sandbox = mkdtempSync(join(tmpdir(), "slipbox-reg-"));
process.env.XDG_STATE_HOME = join(sandbox, "state");
process.env.XDG_CACHE_HOME = join(sandbox, "cache");
process.env.XDG_CONFIG_HOME = join(sandbox, "config");
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

function vault(files: Record<string, string>): string {
  const dir = mkdtempSync(join(sandbox, "v-"));
  mkdirSync(join(dir, ".slipbox"));
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(join(dir, p, ".."), { recursive: true });
    writeFileSync(join(dir, p), c);
  }
  return dir;
}

async function cli(argv: string[], cwd: string, stdin = "") {
  let out = "";
  let err = "";
  const code = await runCli(argv, { out: (s) => (out += s), err: (s) => (err += s), stdin: async () => stdin, isTTY: false, columns: undefined, cwd, env: { ...process.env, NO_COLOR: "1" } });
  return { code, out, err };
}

const unicode = glyphsFor("unicode");

/** Wait until `pred` holds (watcher tests: events arrive asynchronously, slower under load). */
async function until(pred: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!pred() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
}
const rows = (md: string, width = 60) => renderMarkdown(md, { width, glyphs: unicode, showUrls: false }).lines.map((l) => l.spans.map((s) => s.text).join(""));

describe("high", () => {
  test("a global flag before the subcommand still routes to the CLI", async () => {
    const proc = Bun.spawnSync(["bun", join(import.meta.dir, "..", "src", "main.ts"), "--root", ".", "ls"], {
      cwd: join(import.meta.dir, "fixtures", "vault"),
      env: { ...process.env, NO_COLOR: "1" },
    });
    expect(proc.exitCode).toBe(0);
    expect(proc.stdout.toString()).toContain("notes/alpha.md");
  });
  test("an invalid enum in config is a warning, not a crash", async () => {
    const dir = vault({ "a.md": "# a\n", ".slipbox/config.toml": '[render]\nglyphs = "bogus"\nshow_urls = "sometimes"\ninset = 999\n' });
    const r = await cli(["render", "a.md"], dir);
    expect(r.code).toBe(0);
    expect(r.err).toContain('"render.glyphs" must be one of');
    expect(r.err).toContain('"render.inset" must be between');
    expect(loadConfig({ vaultRoot: dir }).config.render.glyphs).toBe("auto");
    expect((await cli(["render", "a.md", "--glyphs", "bogus"], dir)).code).toBe(2);
    expect(glyphsFor("toString" as never).mode).toBeDefined();
  });
});

describe("medium", () => {
  test("tabs never reach the IR: prose, cells, inline code", () => {
    const out = rows("Tab\tstart and `a\tb`\n\n| t\tab | x |\n|---|---|\n| a\tb | c |\n");
    expect(out.join("\n")).not.toContain("\t");
    expect(out[0]).toContain("Tab start");
    expect(out.some((r) => r.includes("t ab"))).toBe(true);
  });
  test("a note deleted on disk stays reachable through history and the buffer list", async () => {
    const dir = vault({ "a.md": "[[b]]\n", "b.md": "# B\n" });
    const config = structuredClone(DEFAULT_CONFIG);
    config.ui.restore_session = false;
    const loc = locateVault({ root: dir });
    const app = new App({ loc, config, graph: openGraph(loc, config, false), host: { requestRender() {}, osc52: () => true, quit() {} }, open: "b.md", watch: false });
    app.draw(new TextCanvas(80, 20));
    await app.run("note.open a.md");
    rmSync(join(dir, "b.md"));
    app.applyChanges({ changes: [{ rel: "b.md", kind: "deleted", isNote: true }], rescan: false });
    await app.handleKey("H");
    expect(app.view!.buf.key).toBe("b.md");
    expect(app.view!.buf.source).toBe("# B\n");
    await app.handleKey("L");
    expect(app.view!.buf.key).toBe("a.md");
    expect(app.view!.fwd).toHaveLength(0);
  });
  test("history drops a location that cannot be opened, without moving anything", async () => {
    const dir = vault({ "a.md": "# A\n", "b.md": "# B\n" });
    const config = structuredClone(DEFAULT_CONFIG);
    config.ui.restore_session = false;
    const loc = locateVault({ root: dir });
    const app = new App({ loc, config, graph: openGraph(loc, config, false), host: { requestRender() {}, osc52: () => true, quit() {} }, open: "a.md", watch: false });
    app.view!.back.push({ key: "gone.md", anchor: { heading: null, headingIndex: 0, offset: 0, line: 1 } });
    await app.handleKey("H");
    expect(app.view!.buf.key).toBe("a.md");
    expect(app.view!.fwd).toHaveLength(0);
  });
  test("watcher: directories moved out and in (nested), mkdir -p, and .gitignore edits", async () => {
    const dir = vault({ "a.md": "[[p]]\n", "proj/p.md": "# P\n" });
    const elsewhere = mkdtempSync(join(sandbox, "out-"));
    const config: Config = structuredClone(DEFAULT_CONFIG);
    config.ui.restore_session = false;
    config.watch.debounce_ms = 30;
    config.watch.poll_ms = 80;
    const loc = locateVault({ root: dir });
    const app = new App({ loc, config, graph: openGraph(loc, config, false), host: { requestRender() {}, osc52: () => true, quit() {} }, open: "a.md" });
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    try {
      app.draw(new TextCanvas(80, 20));
      renameSync(join(dir, "proj"), join(elsewhere, "proj"));
      await until(() => !app.graph.notes.has("proj/p.md"));
      expect(app.graph.notes.has("proj/p.md")).toBe(false);
      const role = () => app.currentLayout(app.view!).lines.flatMap((l) => l.spans).find((s) => s.text === "p")!.role;
      expect(role()).toBe("link_unresolved");
      mkdirSync(join(elsewhere, "incoming", "sub"), { recursive: true });
      writeFileSync(join(elsewhere, "incoming", "sub", "q.md"), "# Q\n");
      renameSync(join(elsewhere, "incoming"), join(dir, "incoming"));
      await until(() => app.graph.notes.has("incoming/sub/q.md"));
      expect(app.graph.notes.has("incoming/sub/q.md")).toBe(true);
      await wait(50);
      writeFileSync(join(dir, "incoming", "sub", "q.md"), "# Q\n\n[[a]]\n");
      await until(() => app.graph.linksOf("incoming/sub/q.md").length === 1);
      expect(app.graph.linksOf("incoming/sub/q.md")).toHaveLength(1);
      mkdirSync(join(dir, "x", "y", "z"), { recursive: true });
      await wait(150);
      writeFileSync(join(dir, "x", "y", "z", "deep.md"), "# deep\n");
      await until(() => app.graph.notes.has("x/y/z/deep.md"));
      expect(app.graph.notes.has("x/y/z/deep.md")).toBe(true);
      writeFileSync(join(dir, ".gitignore"), "x/\n");
      await until(() => !app.graph.notes.has("x/y/z/deep.md"));
      expect(app.graph.notes.has("x/y/z/deep.md")).toBe(false);
    } finally {
      app.watcher?.close();
    }
  });
  test("watcher: renames leave no ghost notes (Bun reports only the new name)", async () => {
    const dir = vault({ "g.md": "# g\n", "a/x.md": "# x\n", "b/keep.md": "# k\n" });
    const config: Config = structuredClone(DEFAULT_CONFIG);
    config.ui.restore_session = false;
    config.watch.debounce_ms = 30;
    config.watch.poll_ms = 80;
    const loc = locateVault({ root: dir });
    const app = new App({ loc, config, graph: openGraph(loc, config, false), host: { requestRender() {}, osc52: () => true, quit() {} }, open: "b/keep.md" });
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    try {
      renameSync(join(dir, "g.md"), join(dir, "h.md"));
      renameSync(join(dir, "a", "x.md"), join(dir, "b", "x.md"));
      await until(() => [...app.graph.notes.keys()].sort().join() === "b/keep.md,b/x.md,h.md");
      const notes = [...app.graph.notes.keys()].sort();
      expect(notes).toEqual(["b/keep.md", "b/x.md", "h.md"]);
    } finally {
      app.watcher?.close();
    }
  });
  test("a rescan reloads open buffers whose files changed", async () => {
    const dir = vault({ "a.md": "# one\n" });
    const config = structuredClone(DEFAULT_CONFIG);
    config.ui.restore_session = false;
    const loc = locateVault({ root: dir });
    const app = new App({ loc, config, graph: openGraph(loc, config, false), host: { requestRender() {}, osc52: () => true, quit() {} }, open: "a.md", watch: false });
    writeFileSync(join(dir, "a.md"), "# two, longer\n");
    app.applyChanges({ changes: [], rescan: true });
    expect(app.view!.buf.source).toBe("# two, longer\n");
  });
  test("an unreadable note is never cached as empty", async () => {
    if (process.getuid?.() === 0) return; // root reads everything
    const dir = vault({ "keep.md": "# keep\n", "unread.md": "[[keep]]\n" });
    chmodSync(join(dir, "unread.md"), 0o000);
    const first = await cli(["ls", "--json"], dir);
    expect(JSON.parse(first.out).warnings.join("\n")).toContain("unread.md");
    chmodSync(join(dir, "unread.md"), 0o644);
    const links = await cli(["links", "unread.md", "--json"], dir);
    expect(JSON.parse(links.out).data).toHaveLength(1);
  });
  test("the CLI reads an existing file the walk excludes, as the TUI does", async () => {
    const fx = join(import.meta.dir, "fixtures", "vault");
    const r = await cli(["render", "ignored/secret.md"], fx);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Secret");
    expect((await cli(["render", "no-such-thing"], fx)).code).toBe(3);
  });
  test("resolve agrees with links about attachments", async () => {
    const fx = join(import.meta.dir, "fixtures", "vault");
    for (const argv of [["resolve", "diagram.png", "--from", "index"], ["resolve", "![[diagram.png]]"]]) {
      const r = await cli([...argv, "--json"], fx);
      expect(r.code).toBe(0);
      expect(JSON.parse(r.out).data.path).toBe("attachments/diagram.png");
    }
  });
  test(".gitignore: deeper negation re-includes; case follows git on this platform", () => {
    const dir = vault({ ".gitignore": "*.md\n", "sub/.gitignore": "!inner-keep.md\n", "sub/inner-keep.md": "#\n", "sub/other.md": "#\n", "UPPER.MD": "#\n" });
    const files = walkVault(dir, new WalkFilter(dir, DEFAULT_CONFIG.walk)).files.map((f) => f.rel);
    expect(files).toContain("sub/inner-keep.md");
    expect(files).not.toContain("sub/other.md");
    if (process.platform === "linux") expect(files).toContain("UPPER.MD");
  });
});

describe("low", () => {
  test("Enter on an empty theme list reverts the live preview", async () => {
    const dir = vault({ "a.md": "# a\n" });
    const config = structuredClone(DEFAULT_CONFIG);
    config.ui.restore_session = false;
    const loc = locateVault({ root: dir });
    const app = new App({ loc, config, graph: openGraph(loc, config, false), host: { requestRender() {}, osc52: () => true, quit() {} }, open: "a.md", watch: false });
    for (const k of ["space", "t", "s", "o", "l", "z", "z", "z", "enter"]) await app.handleKey(k);
    expect(app.theme.name).toBe("tokyo-night");
    expect(app.overlay).toBeNull();
  });
  test("find columns are exact when case folding changes length", () => {
    const layout = renderMarkdown("İİİ foo\n", { width: 40, glyphs: unicode, showUrls: false });
    expect(computeFind(layout, "foo").matches[0]).toMatchObject({ row: 0, col: 4, len: 3 });
    expect(computeFind(layout, "a.b(").matches).toHaveLength(0);
  });
  test("--width is bounded and whole; unknown long flags are usage errors", async () => {
    const fx = join(import.meta.dir, "fixtures", "vault");
    expect((await cli(["render", "index", "--width", "1e7"], fx)).code).toBe(2);
    expect((await cli(["render", "index", "--width", "20.5"], fx)).code).toBe(2);
    expect((await cli(["render", "index", "--plian"], fx)).code).toBe(2);
  });
  test("no row exceeds the width even at 10 columns, frontmatter and deep nesting included", () => {
    const md = "---\ntitle: T\n---\n\n999999999. item\n\n- > - > - > nested quote in list\n\n> [!warning] a long callout title here\n";
    for (let w = 8; w <= 20; w++) for (const r of rows(md, w)) expect(stringWidth(r)).toBeLessThanOrEqual(w);
  });
  test("case-variant file names are distinct notes; explicit extensions pick the file", () => {
    const idx = new LinkIndex(["d/Note.md", "d/note.md", "x.md", "x.markdown"]);
    expect(idx.resolveWiki("d/Note", null).path).toBe("d/Note.md");
    expect(idx.resolveWiki("d/note", null).path).toBe("d/note.md");
    idx.remove("d/Note.md");
    expect(idx.resolveWiki("d/note", null).path).toBe("d/note.md");
    expect(idx.resolveWiki("x.markdown", null).path).toBe("x.markdown");
  });
  test("a corrupt session or positions file never stops the TUI", () => {
    const dir = vault({ "a.md": "# a\n" });
    saveSession(dir, { version: 1, tabs: [{ panes: [{ path: null as never, anchor: null as never }, { path: "a.md", anchor: "x" as never }], active: 9 }], activeTab: 5, sidebar: true });
    const s = loadSession(dir)!;
    expect(s.tabs[0]!.panes).toHaveLength(1);
    const config = structuredClone(DEFAULT_CONFIG);
    const loc = locateVault({ root: dir });
    const app = new App({ loc, config, graph: openGraph(loc, config, false), host: { requestRender() {}, osc52: () => true, quit() {} }, watch: false });
    expect(app.view!.buf.key).toBe("a.md");
    app.draw(new TextCanvas(80, 20));
  });
  test("capture rejects nonsense references and lines past the end", async () => {
    for (const bad of ["f:0", "f:5-2", "f:3:9-3:2"]) expect(parseRef(bad)).toBeNull();
    const dir = vault({ "f.md": "one\ntwo\n" });
    expect((await cli(["capture", "--ref", "f.md:0"], dir)).code).toBe(2);
    expect((await cli(["capture", "--ref", "f.md:999", "--snippet"], dir)).code).toBe(3);
    const r = await cli(["capture", "--stdin", "--lang", "ts", "--json"], dir, "const x = 1");
    expect(JSON.parse(r.out).data.entry).toBe("```ts\nconst x = 1\n```");
  });
  test("selection starting on the right half of a wide character includes it", () => {
    const layout = renderMarkdown("日本語\n", { width: 40, glyphs: unicode, showUrls: false });
    expect(selectedText(layout, { a: { row: 0, col: 1 }, b: { row: 0, col: 3 }, active: false })).toBe("日本");
  });
  test("single-file mode applies the size cap and .gitignore", () => {
    const dir = mkdtempSync(join(sandbox, "single-"));
    writeFileSync(join(dir, ".gitignore"), "hidden.md\n");
    writeFileSync(join(dir, "hidden.md"), "#\n");
    writeFileSync(join(dir, "big.md"), "x".repeat(2000));
    writeFileSync(join(dir, "ok.md"), "#\n");
    const cfg = structuredClone(DEFAULT_CONFIG);
    cfg.walk.max_file_size = 1000;
    const g = openGraph({ root: dir, mode: "single", file: join(dir, "ok.md") }, cfg, false);
    expect([...g.notes.keys()]).toEqual(["ok.md"]);
  });
  test("[[#heading]] renders without a leading separator", () => {
    expect(rows("see [[#Top]]\n")[0]).toBe("see #Top");
  });
  test("a user theme shadowing a built-in is listed once", () => {
    const dir = mkdtempSync(join(sandbox, "themes-"));
    const slots = Array.from({ length: 16 }, (_, i) => `base0${i.toString(16).toUpperCase()}: "${"123456"}"`).join("\n");
    writeFileSync(join(dir, "nord.yaml"), `scheme: mine\n${slots}\n`);
    const nord = listThemes(dir).filter((t) => t.name === "nord");
    expect(nord).toEqual([{ name: "nord", source: "user", path: join(dir, "nord.yaml") }]);
  });
  test("init honours --root", async () => {
    const target = mkdtempSync(join(sandbox, "init-"));
    const r = await cli(["init", "--root", target, "--json"], sandbox);
    expect(JSON.parse(r.out).data.root).toBe(target);
  });
});

describe("found in hands-on review", () => {
  test("anchor fallback line tracks insertions before the heading is removed", async () => {
    const body = Array.from({ length: 40 }, (_, i) => `## H${i}\n\ntext ${i}\n`).join("\n");
    const dir = vault({ "n.md": `# N\n\n${body}` });
    const config = structuredClone(DEFAULT_CONFIG);
    config.ui.restore_session = false;
    const loc = locateVault({ root: dir });
    const app = new App({ loc, config, graph: openGraph(loc, config, false), host: { requestRender() {}, osc52: () => true, quit() {} }, open: "n.md", watch: false });
    const canvas = () => app.draw(new TextCanvas(100, 20));
    canvas();
    for (let i = 0; i < 20; i++) await app.handleKey("}");
    canvas();
    const topText = () => app.currentLayout(app.view!).lines[app.view!.top]!.spans.map((s) => s.text).join("");
    expect(topText()).toContain("H19");
    const change = (src: string) => {
      writeFileSync(join(dir, "n.md"), src);
      app.applyChanges({ changes: [{ rel: "n.md", kind: "changed", isNote: true }], rescan: false });
      canvas();
    };
    const orig = `# N\n\n${body}`;
    const inserted = orig.replace("## H0", `${"inserted paragraph\n\n".repeat(30)}## H0`);
    change(inserted);
    expect(topText()).toContain("H19");
    change(inserted.replace("## H19", "was a heading"));
    expect(topText()).toMatch(/was a heading|text 18|H18/);
  });
});

test("prettyKey names keys whole: backspace is not back␣", async () => {
  const { prettyKey } = await import("../src/tui/keys.ts");
  expect(prettyKey("backspace")).toBe("backspace");
  expect(prettyKey("space f")).toBe("␣ f");
  expect(prettyKey("shift+space")).toBe("S-␣");
  expect(prettyKey("ctrl+w v")).toBe("C-w v");
});

test("the scratch, open in the TUI, follows appends from the CLI", async () => {
  const dir = vault({ "a.md": "# a\n" });
  const config = structuredClone(DEFAULT_CONFIG);
  config.ui.restore_session = false;
  config.watch.poll_ms = 100;
  const loc = locateVault({ root: dir });
  const app = new App({ loc, config, graph: openGraph(loc, config, false), host: { requestRender() {}, osc52: () => true, quit() {} }, open: "a.md" });
  try {
    await cli(["capture", "first"], dir);
    await app.run("scratch.open");
    expect(app.displayName(app.view!.buf)).toBe("scratch");
    await cli(["capture", "second, from an agent"], dir);
    await until(() => app.view!.buf.source.includes("second, from an agent"));
    expect(app.view!.buf.source).toContain("second, from an agent");
  } finally {
    app.quit();
  }
});
