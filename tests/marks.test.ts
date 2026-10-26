// The explorer's rows (VV-T5): a row's marks at its right, in their columns (VV-D9) — the index's state, git's mark, a
// vault's branch — in each glyph set; the busy folders and what the walk leaves out listed, browsed, never indexed
// (VV-D8); home's folders listed from the disk before its walk.

import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Config, DEFAULT_CONFIG } from "../src/core/application/config/config.ts";
import { glyphsFor } from "../src/core/glyphs.ts";
import { openGraph } from "../src/core/graph.ts";
import { cacheDir, vaultKey } from "../src/core/foundation/platform/paths.ts";
import { probe, setLinkAnswer } from "../src/core/symlinks.ts";
import { homeAt, locateVault, type VaultLocation } from "../src/core/vault.ts";
import { WalkFilter, walkVault } from "../src/core/walk.ts";
import { stringWidth } from "../src/core/foundation/text/width.ts";
import { App, type Host } from "../src/tui/app.ts";
import { TextCanvas } from "../src/tui/canvas.ts";
import { roleStyle } from "../src/tui/draw.ts";

const sandbox = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-marks-")));
process.env.XDG_STATE_HOME = join(sandbox, "state");
process.env.XDG_CACHE_HOME = join(sandbox, "cache");
process.env.XDG_CONFIG_HOME = join(sandbox, "config");
process.env.XDG_DATA_HOME = join(sandbox, "data");
delete process.env.SLIPBOX_CONFIG; // it would win over XDG_CONFIG_HOME: never the developer's own config
process.env.SLIPBOX_CLIPBOARD = "file";
delete process.env.NO_COLOR;
/** The folders a test made unreadable: readable again before the sandbox goes, which couldn't be removed otherwise. */
const locked: string[] = [];
afterAll(() => {
  for (const d of locked) chmodSync(d, 0o755);
  rmSync(sandbox, { recursive: true, force: true });
});

const MODES = ["unicode", "nerd", "ascii"] as const;

const git = (cwd: string, ...args: string[]) =>
  Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);

/** A folder you may not read: its mode 000, given back at the end. */
function lock(dir: string): void {
  chmodSync(dir, 0o000);
  locked.push(dir);
}

/**
 * A folder of vaults: kestrel, a repository on main and the vault open — docs/, a note changed since its commit, a note
 * you may not read, a note too big to read, node_modules/ and build/ (busy), out/ (git-ignored, a note in it reached by
 * a link), drafts/ (walk.exclude), private/ (you may not read it); beside it a worktree of it on agent/x, product (a
 * vault with its index on the disk), node_modules/, and a link whose target isn't there.
 */
function place(): { P: string; kestrel: string } | null {
  const P = mkdtempSync(join(sandbox, "work-"));
  const kestrel = join(P, "kestrel");
  const w = (rel: string, text: string) => {
    mkdirSync(join(kestrel, rel, ".."), { recursive: true });
    writeFileSync(join(kestrel, rel), text);
  };
  w("README.md", "# Kestrel\n\n[What's reached](out/reached.md)\n");
  w("docs/a.md", "# A\n");
  w("docs/changed.md", "# Changed\n");
  w(".gitignore", "out/\n");
  if (git(kestrel, "init", "-q", "-b", "main").exitCode !== 0) return null;
  git(kestrel, "add", "-A");
  git(kestrel, "commit", "-q", "-m", "start");
  w("docs/changed.md", "# Changed\n\nSince the commit.\n");
  w("docs/locked.md", "# Locked\n");
  chmodSync(join(kestrel, "docs", "locked.md"), 0o000);
  w("big.md", `# Big\n\n${"x".repeat(2000)}\n`);
  w("node_modules/dep/README.md", "# Dep\n");
  w("build/out.json", "{}\n");
  w("out/reached.md", "# Reached\n");
  w("out/other.md", "# Other\n");
  w("drafts/d.md", "# D\n");
  w("private/secret.md", "# Secret\n");
  w("inner/.slipbox/config.toml", ""); // a vault nested in it, no repository of its own
  lock(join(kestrel, "private"));
  if (git(kestrel, "worktree", "add", "-q", "-b", "agent/x", join(P, "kestrel-wt")).exitCode !== 0) return null;
  const product = join(P, "product");
  mkdirSync(join(product, ".slipbox"), { recursive: true });
  writeFileSync(join(product, "p.md"), "# P\n");
  mkdirSync(cacheDir({ key: vaultKey(product) }), { recursive: true });
  writeFileSync(join(cacheDir({ key: vaultKey(product) }), "index.json"), "{}\n");
  symlinkSync(join(P, "gone.md"), join(P, "broken.md"));
  mkdirSync(join(P, "node_modules", "dep"), { recursive: true }); // busy, outside every vault
  return { P, kestrel };
}

interface Harness {
  app: App;
  canvas: () => TextCanvas;
}

async function harness(
  opts: { root?: string; loc?: VaultLocation; glyphs?: string; sidebar?: number } = {},
): Promise<Harness> {
  const config: Config = structuredClone(DEFAULT_CONFIG);
  config.ui.restore_session = false;
  config.lint.enabled = "off";
  config.search.engine = "scan";
  config.index.background = false; // never the machine's home walked
  config.render.glyphs = (opts.glyphs ?? "unicode") as Config["render"]["glyphs"];
  config.walk.exclude = ["drafts/"];
  config.walk.max_file_size = 1000;
  config.ui.sidebar_width = opts.sidebar ?? 40; // a worktree's branch whole beside its name
  const loc = opts.loc ?? locateVault({ root: opts.root! });
  const host: Host = {
    requestRender() {},
    osc52: () => true,
    quit: () => {},
    fetch: async (url) => Promise.reject(new Error(`no network in a test (${url})`)),
  };
  const app = new App({ loc, config, graph: openGraph(loc, config, false), host, open: null, watch: false });
  app.handoff.nvimDiscovery = () => [];
  app.handoff.nvimProbe = () => null;
  app.panels.showSidebar(true);
  app.leftView = "explorer";
  const canvas = () => {
    const c = new TextCanvas(120, 50);
    app.draw(c);
    const failed = app.messages.find((m) => m.text.startsWith("drawing failed"));
    if (failed) throw new Error(failed.text);
    return c;
  };
  canvas();
  return { app, canvas };
}

/** The explorer's row named `name`, as drawn: its last column's mark (the index's), git's two before it, and what
 *  describes it — the text after its name, short of git's column. `depth`: the one at that depth. */
function drawn(
  h: Harness,
  name: string,
  depth?: number,
): { index: string; git: string; describe: string; y: number; x: number } {
  const rows = h.app.explorer.rows();
  const at = rows.findIndex((r) => r.name === name && (depth === undefined || r.depth === depth));
  if (at < 0) throw new Error(`no row ${name}: ${rows.map((r) => r.name).join(", ")}`);
  h.app.sidebar.selected = at; // on screen
  const c = h.canvas();
  const list = h.app.geometry!.sidebar!;
  const y = list.y + at - h.app.sidebar.scroll;
  const cells = c.rows[y]!.slice(list.x, list.x + list.w);
  const before = cells
    .slice(0, list.w - 4)
    .join("")
    .trimEnd();
  const rest = before.slice(before.indexOf(name) + name.length);
  const describe = / {2,}(\S.*)$/.exec(rest)?.[1] ?? "";
  return { index: cells[list.w - 2]!, git: cells[list.w - 4]!, describe, y, x: list.x + list.w - 2 };
}

/** kestrel open, the view zoomed out to the folder holding it, its tree under its row. */
async function zoomedOut(P: string, glyphs: string): Promise<Harness> {
  const h = await harness({ root: join(P, "kestrel"), glyphs });
  await h.app.git.refreshNow();
  h.app.explorer.zoomTo(P);
  h.app.region = "content"; // no row's buttons over its marks
  return h;
}

describe("a row's marks (VV-D9)", () => {
  test("one column wide in every terminal, none an emoji, in every glyph set", () => {
    for (const mode of MODES) {
      const g = glyphsFor(mode);
      const marks = [g.markIndexed, g.markIndexing, g.markNotIndexed, g.markCantRead, g.markProblem, g.markGitFolder];
      for (const m of marks) {
        expect(stringWidth(m)).toBe(1);
        expect(/\p{Emoji_Presentation}|️/u.test(m)).toBe(false);
      }
      expect(new Set(marks).size).toBe(marks.length); // each its own
    }
    expect(glyphsFor("unicode")).toMatchObject({
      markIndexed: "●",
      markIndexing: "◐",
      markNotIndexed: "⊘",
      markCantRead: "⚿",
      markProblem: "⚠",
      markGitFolder: "•",
    });
    expect(glyphsFor("nerd").markCantRead).toBe("\u{f033e}"); // a lock
    expect(glyphsFor("ascii")).toMatchObject({
      markIndexed: "*",
      markIndexing: "~",
      markNotIndexed: "-",
      markCantRead: "#",
      markProblem: "!",
      markGitFolder: "o",
    });
  });

  for (const mode of MODES)
    test(`in their columns, ${mode}: the index's state last, git's mark two before it, a vault's branch dimmed`, async () => {
      const p = place();
      if (!p) return;
      const g = glyphsFor(mode);
      const h = await zoomedOut(p.P, mode);
      // The vault open: indexed, its branch; a worktree: its branch after ⎇, no index of its own yet; a vault with one.
      expect(drawn(h, "kestrel")).toMatchObject({ index: g.markIndexed, describe: "main" });
      expect(drawn(h, "kestrel-wt")).toMatchObject({ index: " ", describe: `${g.branch} agent/x` });
      expect(drawn(h, "product")).toMatchObject({ index: g.markIndexed, describe: "" });
      // A vault nested in a repository: not its top, so no branch of its own; no index yet.
      expect(drawn(h, "inner")).toMatchObject({ index: " ", describe: "" });
      // A busy folder outside every vault: never indexed.
      expect(drawn(h, "node_modules", 0).index).toBe(g.markNotIndexed);
      // A link whose target isn't there: a problem.
      expect(drawn(h, "broken.md").index).toBe(g.markProblem);
      // In kestrel: its folders indexed, git's mark on docs; what its walk leaves out not indexed; a folder you may not
      // read; a note too big to read.
      expect(drawn(h, "docs")).toMatchObject({ index: g.markIndexed, git: g.markGitFolder });
      for (const n of ["node_modules", "build", "out", "drafts"]) expect(drawn(h, n).index).toBe(g.markNotIndexed);
      expect(drawn(h, "private").index).toBe(g.markCantRead);
      expect(drawn(h, "big.md")).toMatchObject({ index: g.markNotIndexed, git: "+" }); // new to git too
      // A file's own only when it isn't its folder's: git's letter alone; a note you may not read.
      h.app.explorer.expanded.add("docs");
      h.app.explorer.invalidateTree();
      expect(drawn(h, "changed.md")).toMatchObject({ index: " ", git: "M" });
      expect(drawn(h, "a.md")).toMatchObject({ index: " ", git: " " });
      expect(drawn(h, "locked.md").index).toBe(g.markCantRead);
      // Indexed is dimmed, since most folders are.
      const docs = drawn(h, "docs");
      expect(h.canvas().styles[docs.y]![docs.x]!.fg).toEqual(roleStyle(h.app.theme, "sidebar_mark", null).fg);
      expect(roleStyle(h.app.theme, "sidebar_mark", null).fg).not.toEqual(roleStyle(h.app.theme, "sidebar", null).fg);
      // While the vault open's index is built: indexing.
      h.app.indexing = 3;
      expect(drawn(h, "kestrel").index).toBe(g.markIndexing);
      // …and a folder holding a note still to parse; the others stay indexed.
      h.app.graph.build(false, "lazy");
      h.app.explorer.invalidateTree();
      expect(drawn(h, "docs").index).toBe(g.markIndexing);
      h.app.indexing = 0;
      // Another vault while the background index builds it: indexing.
      (h.app.watch as { autoIndex: unknown }).autoIndex = { status: { current: join(p.P, "product") } };
      expect(drawn(h, "product").index).toBe(g.markIndexing);
      (h.app.watch as { autoIndex: unknown }).autoIndex = null;
      // In a folder the walk leaves out, a note a link reached is indexed (20.8); the others are their folder's.
      h.app.explorer.expanded.add(join(p.kestrel, "out"));
      h.app.explorer.invalidateTree();
      expect(drawn(h, "reached.md").index).toBe(g.markIndexed);
      expect(drawn(h, "other.md").index).toBe(" ");
    });

  test("a folder inside a busy folder is marked not indexed, zoomed into it too; a vault in it is its own", async () => {
    const p = place();
    if (!p) return;
    const build = join(p.kestrel, "build");
    mkdirSync(join(build, "sub", "deeper"), { recursive: true });
    writeFileSync(join(build, "sub", "x.md"), "# X\n");
    mkdirSync(join(build, "v", ".slipbox"), { recursive: true });
    mkdirSync(join(build, "v", "d"));
    mkdirSync(join(p.kestrel, "dist", ".slipbox"), { recursive: true }); // a busy folder that is a vault itself
    mkdirSync(join(p.kestrel, "dist", "d2"));
    const h = await harness({ root: p.kestrel });
    h.app.region = "content";
    for (const d of [build, join(build, "sub"), join(build, "v"), join(p.kestrel, "dist")])
      h.app.explorer.expanded.add(d);
    h.app.explorer.invalidateTree();
    const index = (name: string) => {
      const row = h.app.explorer.rows().find((r) => r.name === name);
      if (!row) throw new Error(`no row ${name}`);
      return h.app.explorer.marks.of(row).index;
    };
    const g = glyphsFor("unicode");
    for (const name of ["sub", "deeper"]) {
      expect(index(name)).toBe("not-indexed");
      expect(drawn(h, name).index).toBe(g.markNotIndexed);
    }
    expect(index("x.md")).toBeUndefined(); // a file's is its folder's
    expect(index("d")).toBeUndefined(); // the vault v's, not kestrel's to say
    expect(index("d2")).toBeUndefined();
    h.app.explorer.zoomTo(build);
    expect(index("sub")).toBe("not-indexed");
    expect(index("deeper")).toBe("not-indexed");
    expect(index("d")).toBeUndefined();
  });

  test("a busy name with a note at its top is a folder like any: walked, marked indexed; outside every vault, not ⊘", async () => {
    const p = place();
    if (!p) return;
    mkdirSync(join(p.kestrel, "vendor"));
    writeFileSync(join(p.kestrel, "vendor", "notes.md"), "# Notes\n");
    mkdirSync(join(p.P, "dist"));
    writeFileSync(join(p.P, "dist", "plan.md"), "# Plan\n");
    const h = await zoomedOut(p.P, "unicode");
    const g = glyphsFor("unicode");
    expect(h.app.graph.notes.has("vendor/notes.md")).toBe(true);
    expect(h.app.explorer.rows().find((r) => r.name === "vendor")).toMatchObject({ path: "vendor" }); // the vault's own
    expect(drawn(h, "vendor").index).toBe(g.markIndexed);
    expect(drawn(h, "dist", 0).index).toBe(" ");
    expect(drawn(h, "node_modules", 0).index).toBe(g.markNotIndexed); // no note at its top: busy
  });

  test("a draw reads the disk only for the rows drawn, however many the tree has", async () => {
    const root = mkdtempSync(join(sandbox, "many-"));
    mkdirSync(join(root, ".slipbox"));
    mkdirSync(join(root, "many"));
    for (let i = 0; i < 500; i++) writeFileSync(join(root, "many", `n${i}.md`), "# N\n");
    const h = await harness({ root });
    h.app.region = "content";
    h.app.explorer.expanded.add("many");
    const marks = h.app.explorer.marks;
    const of = marks.of.bind(marks);
    let calls = 0;
    marks.of = (row) => (calls++, of(row));
    for (let i = 0; i < 2; i++) {
      calls = 0;
      h.app.explorer.invalidateTree();
      h.canvas();
      expect(h.app.explorer.rows().length).toBe(501);
      expect(calls).toBeGreaterThan(0);
      expect(calls).toBeLessThanOrEqual(h.app.geometry!.sidebar!.h);
    }
  });
});

describe("what describes a row (VV-D9)", () => {
  test("gives way to the name: cut short with …, then left out", async () => {
    const p = place();
    if (!p) return;
    const described = async (sidebar: number) => {
      const h = await harness({ root: p.kestrel, sidebar });
      h.app.explorer.zoomTo(p.P);
      h.app.region = "content";
      return drawn(h, "kestrel-wt").describe;
    };
    expect(await described(40)).toBe("⎇ agent/x");
    expect(await described(28)).toBe("⎇ agent…");
    expect(await described(24)).toBe("");
  });
});

/**
 * What the status line says of the explorer's row `name` (the one at `depth`), the cursor on it: why it isn't indexed,
 * after `⊘ not indexed: `; null when it says nothing of it.
 */
function said(h: Harness, name: string, depth?: number): string | null {
  const at = h.app.explorer.rows().findIndex((r) => r.name === name && (depth === undefined || r.depth === depth));
  if (at < 0)
    throw new Error(
      `no row ${name}: ${h.app.explorer
        .rows()
        .map((r) => r.name)
        .join(", ")}`,
    );
  h.app.region = "sidebar";
  h.app.sidebar.selected = at;
  return statusWhy(h);
}

/** The status line's reason for the explorer's selected row, drawn: null when there's none. */
function statusWhy(h: Harness): string | null {
  const line = h.canvas().rows.at(-1)!.join("");
  return /⊘ not indexed: (.*?)(?: {2}|$)/.exec(line)?.[1]?.trimEnd() ?? null;
}

/** What Info says of the file `abs` opened: its `index` row's value; null when it has none. */
function infoWhy(h: Harness, abs: string): string | null {
  h.app.open(abs);
  expect(h.app.view?.buf.abs).toBe(abs);
  return h.app.info.rows().find((r) => r.key === "index")?.value ?? null;
}

describe("why a row isn't indexed (VV-D9)", () => {
  /**
   * kestrel's place, and in kestrel: build/ generated and ignored, vendor/ ignored with a note at its top; links — far,
   * not followed; slow, followed, its target not answering; up, to the folder holding the vault; m1 and m2, followed
   * to one folder.
   */
  async function placeWhy(): Promise<{ P: string; kestrel: string } | null> {
    const p = place();
    if (!p) return null;
    const { P, kestrel } = p;
    writeFileSync(join(kestrel, ".gitignore"), "out/\nbuild/\nvendor/\n");
    mkdirSync(join(kestrel, "vendor"));
    writeFileSync(join(kestrel, "vendor", "v.md"), "# V\n");
    for (const d of ["far", "slow", "shared"]) mkdirSync(join(P, d));
    symlinkSync(join(P, "far"), join(kestrel, "far"));
    symlinkSync(join(P, "slow"), join(kestrel, "slow"));
    symlinkSync(P, join(kestrel, "up"));
    symlinkSync(join(P, "shared"), join(kestrel, "m1"));
    symlinkSync(join(P, "shared"), join(kestrel, "m2"));
    for (const l of ["slow", "up", "m1", "m2"]) setLinkAnswer(join(kestrel, l), "follow");
    await probe(P);
    await probe(join(P, "shared"));
    return p;
  }

  test("the status line says it while the cursor is on a ⊘ row of the vault's, each reason in words; moved off, not", async () => {
    const p = await placeWhy();
    if (!p) return;
    const h = await harness({ root: p.kestrel });
    // Busy (D237): no note at its top, generated by its name; ignored too, both; ignored with a note, ignored.
    expect(said(h, "node_modules")).toBe("generated (node_modules)");
    expect(said(h, "build")).toBe("generated (build), git-ignored");
    expect(said(h, "vendor")).toBe("git-ignored");
    // What .gitignore and walk.exclude leave out; a note too big to read.
    expect(said(h, "out")).toBe("git-ignored");
    expect(said(h, "drafts")).toBe("walk.exclude");
    expect(said(h, "big.md")).toBe("over walk.max_file_size");
    // The links the walk didn't go through (VV-D6).
    expect(said(h, "far")).toBe("a link not followed");
    expect(said(h, "slow")).toBe("a link followed, its disk not answering");
    expect(said(h, "up")).toBe("a link to a folder holding the vault");
    expect([said(h, "m1"), said(h, "m2")].sort()).toEqual([null, "a second link to a folder followed already"].sort());
    // A folder in a busy one: the busy one's reason, by its name.
    h.app.explorer.expanded.add(join(p.kestrel, "node_modules"));
    h.app.explorer.invalidateTree();
    expect(said(h, "dep")).toBe("generated (node_modules)");
    // Moved off to a row that is indexed: nothing said; the explorer without the keys, nothing either.
    expect(said(h, "build")).not.toBeNull();
    expect(said(h, "docs")).toBeNull();
    expect(said(h, "build")).not.toBeNull();
    h.app.region = "content";
    expect(statusWhy(h)).toBeNull();
  });

  test("a busy folder outside every vault, and one beside the vault in another that ignores it", async () => {
    const p = place();
    if (!p) return;
    const product = join(p.P, "product");
    writeFileSync(join(product, ".gitignore"), "dist/\n");
    if (git(product, "init", "-q", "-b", "main").exitCode !== 0) return;
    mkdirSync(join(product, "dist"));
    writeFileSync(join(product, "dist", "d.md"), "# D\n");
    const h = await zoomedOut(p.P, "unicode");
    expect(said(h, "node_modules", 0)).toBe("generated (node_modules)");
    h.app.explorer.expanded.add(product);
    h.app.explorer.invalidateTree();
    expect(said(h, "dist")).toBe("git-ignored");
  });

  test("Info says it of the file on screen: its own, or its folder's; nothing for one indexed", async () => {
    const p = await placeWhy();
    if (!p) return;
    const h = await harness({ root: p.kestrel });
    const k = (rel: string) => join(p.kestrel, rel);
    expect(infoWhy(h, k("node_modules/dep/README.md"))).toBe("not indexed: generated (node_modules)");
    expect(infoWhy(h, k("out/other.md"))).toBe("not indexed: git-ignored");
    expect(infoWhy(h, k("drafts/d.md"))).toBe("not indexed: walk.exclude");
    expect(infoWhy(h, k("big.md"))).toBe("not indexed: over walk.max_file_size");
    // A note a link reached in a folder left out is indexed (20.8); a note of the vault's, too.
    expect(infoWhy(h, k("out/reached.md"))).toBeNull();
    expect(infoWhy(h, k("docs/a.md"))).toBeNull();
  });

  test("home's: Downloads, another disk, a hidden folder, git's own, past its cap; each said, and in Info", async () => {
    const { setMountTable } = await import("../src/core/mounts.ts");
    const home = realpathSync(mkdtempSync(join(sandbox, "home-")));
    mkdirSync(join(home, "notes", "sub"), { recursive: true });
    writeFileSync(join(home, "notes", "sub", "b.md"), "# B\n");
    mkdirSync(join(home, "Downloads"));
    writeFileSync(join(home, "Downloads", "d.md"), "# D\n");
    mkdirSync(join(home, "mnt", "docs"), { recursive: true });
    mkdirSync(join(home, ".config", "tool"), { recursive: true });
    mkdirSync(join(home, ".git", "refs"), { recursive: true });
    setMountTable(() => [{ device: "server:/share", at: join(home, "mnt"), type: "nfs", options: "rw" }]);
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const h = await harness({ loc: homeAt(home) });
      expect(said(h, "Downloads")).toBe("home's Downloads");
      expect(infoWhy(h, join(home, "Downloads", "d.md"))).toBe("not indexed: home's Downloads");
      expect(said(h, "mnt")).toBe("on another disk");
      h.app.explorer.expanded.add(join(home, "mnt"));
      h.app.explorer.invalidateTree();
      expect(said(h, "docs")).toBe("on another disk");
      // Walked as far as its cap: a folder past it.
      h.app.graph.home = { walked: Date.now(), capped: "folders" };
      h.app.explorer.expanded.add("notes");
      h.app.explorer.invalidateTree();
      expect(said(h, "sub")).toBe("past home's limit of 5,000 folders");
      expect(infoWhy(h, join(home, "notes", "sub", "b.md"))).toBe("not indexed: past home's limit of 5,000 folders");
      // Zoomed into what home's skip list leaves out: what's there carries why.
      h.app.explorer.zoomTo(join(home, ".config"));
      expect(said(h, "tool")).toBe("hidden");
      h.app.explorer.zoomTo(join(home, ".git"));
      expect(said(h, "refs")).toBe("git's own folder");
    } finally {
      process.env.HOME = before;
      setMountTable(null);
    }
  });

  test("the reasons no folder here gives, in words: a system folder, slipbox's own, a file not a note", async () => {
    const p = place();
    if (!p) return;
    const h = await harness({ root: p.kestrel });
    const why = (leftOut: string, at: string) =>
      h.app.explorer.marks.why({ kind: "dir", path: at, name: "x", depth: 0, outside: true, leftOut, leftOutAt: at });
    expect(why("system folder", join(p.kestrel, "Library"))).toBe("a system folder (Library)");
    expect(why("always skipped", join(p.kestrel, ".slipbox"))).toBe("slipbox's own folder");
    expect(why("not a note or text file", join(p.kestrel, "a.zip"))).toBe("not a note or text file");
  });
});

describe("busy folders listed, not indexed (VV-D8)", () => {
  test("a file of one opened outside the view: the view zooms out to hold it, as it does for any folder listed", async () => {
    const p = place();
    if (!p) return;
    const h = await harness({ root: p.kestrel });
    h.app.explorer.zoomTo(join(p.kestrel, "docs"));
    const readme = join(p.kestrel, "node_modules", "dep", "README.md");
    h.app.open(readme);
    expect(h.app.view?.buf.abs).toBe(readme);
    expect(h.app.explorer.top).toBe(p.kestrel);
    expect(h.app.explorer.rows()[h.app.sidebar.selected]!.path).toBe(readme);
  });

  test("going into a vault in one: the view holds it, the folders down to it unfolded", async () => {
    const p = place();
    if (!p) return;
    const dep = join(p.P, "node_modules", "dep");
    mkdirSync(join(dep, ".slipbox"));
    const h = await harness({ root: p.kestrel });
    h.app.explorer.zoomTo(p.P);
    h.app.vaults.switchVault(locateVault({ root: dep }), null);
    expect(h.app.loc.root).toBe(dep);
    expect(h.app.explorer.top).toBe(p.P);
    expect(h.app.explorer.rows().find((r) => r.root?.here)?.path).toBe(dep);
  });

  test("a vault's walk leaves the busy folders out when they look generated: no note at their top, or ignored", () => {
    const root = mkdtempSync(join(sandbox, "busy-"));
    // Generated: only folders in it, or no note at its top; whatever .gitignore says.
    for (const d of ["dist", "vendor", "__pycache__", "pip-cache", "Caches", "notes/vendor"]) {
      mkdirSync(join(root, d, "pkg"), { recursive: true });
      writeFileSync(join(root, d, "pkg", "n.md"), "# N\n");
      writeFileSync(join(root, d, "data.json"), "{}\n");
    }
    mkdirSync(join(root, "target", "debug", "deps"), { recursive: true }); // only folders in it
    writeFileSync(join(root, "target", "debug", "deps", "x.md"), "# X\n");
    mkdirSync(join(root, "node_modules", "dep"), { recursive: true });
    writeFileSync(join(root, "node_modules", "dep", "README.md"), "# Dep\n");
    writeFileSync(join(root, "notes", "n.md"), "# N\n");
    // A notes folder called build, not ignored: a folder like any.
    mkdirSync(join(root, "build"));
    writeFileSync(join(root, "build", "plan.md"), "# Plan\n");
    const walked = () => {
      const filter = new WalkFilter(root, DEFAULT_CONFIG.walk);
      return { filter, files: walkVault(root, filter).files.map((f) => f.rel) };
    };
    let { filter, files } = walked();
    expect(files).toEqual(["build/plan.md", "notes/n.md"]);
    for (const d of ["dist", "target", "node_modules", "notes/vendor", "Caches"])
      expect(filter.exclusion(d, true)).toBe("busy folder");
    expect(filter.exclusion("build", true)).toBeNull();
    expect(filter.exclusion("dist", false)).toBeNull(); // a file of that name is a file
    expect(filter.reachable("target/debug/deps/x.md")).toBe(false); // named, it opens; never indexed
    expect(filter.reachable("build/plan.md")).toBe(true);
    // Ignored, build is busy, reached by nothing; node_modules is busy ignored or not.
    writeFileSync(join(root, ".gitignore"), "build/\nnode_modules/\n");
    ({ filter, files } = walked());
    expect(files).toEqual(["notes/n.md"]);
    expect([filter.exclusion("build", true), filter.exclusion("node_modules", true)]).toEqual([
      "busy folder",
      "busy folder",
    ]);
    expect(filter.reachable("build/plan.md")).toBe(false);
    // Its first note at its top makes a generated-looking folder one like any, asked again since it changed.
    rmSync(join(root, ".gitignore"));
    ({ filter } = walked());
    expect(filter.exclusion("dist", true)).toBe("busy folder");
    writeFileSync(join(root, "dist", "notes.md"), "# Notes\n");
    expect(filter.exclusion("dist", true)).toBeNull();
  });

  test("listed in the explorer by their paths, browsed and opened, nothing in them indexed", async () => {
    const p = place();
    if (!p) return;
    const h = await harness({ root: p.kestrel });
    const row = (name: string) => h.app.explorer.rows().find((r) => r.name === name);
    const at = (name: string) => h.app.explorer.rows().findIndex((r) => r.name === name);
    expect(row("node_modules")).toMatchObject({ kind: "dir", path: join(p.kestrel, "node_modules"), outside: true });
    expect(row("node_modules")!.leftOut).toBe("busy folder");
    expect(row("build")!.leftOut).toBe("busy folder");
    expect(row("out")!.leftOut).toBe(".gitignore");
    expect(row("drafts")!.leftOut).toBe("walk.exclude");
    // Listed once, by its path: a note in it a link reached (20.8) is in its rows, not under a folder of the vault's.
    expect(h.app.graph.notes.has("out/reached.md")).toBe(true);
    expect(h.app.explorer.rows().filter((r) => r.name === "out")).toHaveLength(1);
    expect(item(h, at("out"))).toBeNull(); // not this vault's to rename or delete
    expect(h.app.explorer.rows().some((r) => r.name.startsWith("."))).toBe(false); // hidden ones aren't listed
    // Nor to make a note in: refused, said why.
    h.app.region = "sidebar";
    h.app.sidebar.selected = at("node_modules");
    h.app.explorer.action("new_note");
    expect(h.app.messages.at(-1)?.text).toBe("a folder this vault doesn't index: select one it does");
    // Unfolded a level at a time; a file of it opened, never indexed, and shown where it is.
    h.app.region = "sidebar";
    for (const name of ["node_modules", "dep"]) {
      h.app.sidebar.selected = at(name);
      h.app.explorer.action("expand");
    }
    expect(row("dep")).toMatchObject({ kind: "dir", path: join(p.kestrel, "node_modules", "dep") });
    h.app.sidebar.selected = at("README.md");
    expect(row("README.md")!.path).toBe(join(p.kestrel, "node_modules", "dep", "README.md"));
    h.app.explorer.action("open");
    expect(h.app.view?.buf.abs).toBe(join(p.kestrel, "node_modules", "dep", "README.md"));
    expect(h.app.graph.notes.has("node_modules/dep/README.md")).toBe(false);
    h.app.explorer.reveal();
    expect(h.app.explorer.rows()[h.app.sidebar.selected]!.path).toBe(
      join(p.kestrel, "node_modules", "dep", "README.md"),
    );
  });

  test("a folder the walk couldn't read: listed, and says why when unfolded", async () => {
    const p = place();
    if (!p) return;
    const h = await harness({ root: p.kestrel });
    const at = h.app.explorer.rows().findIndex((r) => r.name === "private");
    expect(h.app.explorer.rows()[at]).toMatchObject({ kind: "dir", path: "private", unwalked: true });
    h.app.region = "sidebar";
    h.app.sidebar.selected = at;
    h.app.explorer.action("expand");
    expect(h.app.messages.at(-1)?.text).toMatch(/can't read .*private: you may not read it/);
    expect(h.app.explorer.expanded.has("private")).toBe(false);
  });
});

/** What the explorer's selected row names, the row at `at` selected. */
function item(h: Harness, at: number) {
  h.app.sidebar.selected = at;
  return h.app.explorer.item();
}

describe("home before its walk (VV-D2, VV-D8)", () => {
  test("a folder of home unfolded lists what's in it at once, from the disk, being indexed", async () => {
    const home = realpathSync(mkdtempSync(join(sandbox, "home-")));
    mkdirSync(join(home, "notes", "sub"), { recursive: true });
    writeFileSync(join(home, "notes", "a.md"), "# A\n");
    writeFileSync(join(home, "notes", "sub", "b.md"), "# B\n");
    mkdirSync(join(home, "Downloads"));
    writeFileSync(join(home, "Downloads", "d.md"), "# D\n");
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const h = await harness({ loc: homeAt(home) });
      expect(h.app.graph.home?.walked).toBeNull(); // never walked: its top alone
      const rows = () => h.app.explorer.rows().map((r) => `${"  ".repeat(r.depth)}${r.name}`);
      h.app.explorer.expanded.add("notes");
      h.app.explorer.invalidateTree();
      expect(rows()).toEqual(["Downloads", "notes", "  sub", "  a.md"]);
      h.app.explorer.expanded.add("notes/sub");
      h.app.explorer.invalidateTree();
      expect(rows()).toEqual(["Downloads", "notes", "  sub", "    b.md", "  a.md"]);
      expect(h.app.graph.notes.has("notes/a.md")).toBe(false); // listed, not indexed until the walk
      const g = glyphsFor("unicode");
      h.app.region = "content";
      expect(drawn(h, "notes").index).toBe(g.markIndexing);
      expect(drawn(h, "sub").index).toBe(g.markIndexing);
      expect(drawn(h, "Downloads").index).toBe(g.markNotIndexed);
      // Walked as far as its cap: a folder past it, not indexed.
      h.app.graph.home = { walked: Date.now(), capped: "folders" };
      expect(drawn(h, "sub").index).toBe(g.markNotIndexed);
    } finally {
      process.env.HOME = before;
    }
  });

  test("a folder of home where another disk is mounted: listed, not indexed, `another disk` beside it — never looked at; unfolded, what's in it not indexed either", async () => {
    const { setMountTable } = await import("../src/core/mounts.ts");
    const home = realpathSync(mkdtempSync(join(sandbox, "home-")));
    mkdirSync(join(home, "mnt", "docs"), { recursive: true });
    writeFileSync(join(home, "mnt", "m.md"), "# M\n");
    writeFileSync(join(home, "a.md"), "# A\n");
    // One you may not read stands in for the disk: looked at, its row would say it can't be read.
    lock(join(home, "mnt"));
    setMountTable(() => [{ device: "server:/share", at: join(home, "mnt"), type: "nfs", options: "rw" }]);
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const h = await harness({ loc: homeAt(home) });
      expect(h.app.graph.skipped).toContainEqual({ rel: "mnt", reason: "another disk" });
      h.app.region = "content";
      const g = glyphsFor("unicode");
      const row = drawn(h, "mnt");
      expect(row.index).toBe(g.markNotIndexed);
      expect(row.describe).toBe("another disk");
      // Unfolded, as you ask: read, what's in it carrying its reason — not indexed, said on the mount alone.
      chmodSync(join(home, "mnt"), 0o755);
      h.app.explorer.expanded.add(join(home, "mnt"));
      h.app.explorer.invalidateTree();
      expect(h.app.explorer.rows().find((r) => r.name === "docs")).toMatchObject({ leftOut: "another disk" });
      const docs = drawn(h, "docs");
      expect(docs.index).toBe(g.markNotIndexed);
      expect(docs.describe).toBe("");
      expect(drawn(h, "mnt").describe).toBe("another disk");
    } finally {
      process.env.HOME = before;
      setMountTable(null);
    }
  });
});
