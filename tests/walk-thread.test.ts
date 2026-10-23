// The TUI's walks on their own thread (T12, #9): a folder that answers slowly never holds up the keys or the screen,
// and the thread's walk takes what the walk on the thread that asks takes.

import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../src/core/config.ts";
import { type HomeWalk, homeFilter, keepHomeWalk } from "../src/core/home.ts";
import { probe, setLinkAnswer } from "../src/core/symlinks.ts";
import { homeAt, setRootMarkers } from "../src/core/vault.ts";
import { setFolderReader } from "../src/core/walk.ts";
import { listThreads, setWalkWorker, WalkThread } from "../src/core/walk-thread.ts";
import type { IndexOf } from "../src/core/index-job.ts";
import { listFolder } from "../src/core/listing.ts";
import { HERE, type Pending, type SteppedWalk, type Walker } from "../src/core/walkers.ts";
import { SLOW_MS, slowFolders } from "./fixtures/walk/slow.ts";
import type { TreeRow } from "../src/tui/explorer.ts";
import { Listings, PENDING_MS } from "../src/tui/listings.ts";
import { type Harness, harness, makeSandbox, stepToEnd } from "./tui-harness.ts";

const sandbox = makeSandbox();
const slowWorker = () => new Worker(new URL("./fixtures/walk/slow-worker.ts", import.meta.url).href);

/** A folder of `files` (path → text) in the sandbox, by its real path. */
function tree(files: Record<string, string>): string {
  const dir = realpathSync(mkdtempSync(join(sandbox, "home-")));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

/** `run` with `HOME` at `home`. */
async function inHome<T>(home: string, run: () => Promise<T>): Promise<T> {
  const before = process.env.HOME;
  process.env.HOME = home;
  try {
    return await run();
  } finally {
    process.env.HOME = before;
  }
}

/** An answer awaited (`Pending`): its value, or its error thrown. */
async function settled<T>(p: Pending<T>): Promise<T> {
  while (!p.settled) await Bun.sleep(1);
  if (p.error !== undefined) throw new Error(p.error);
  return p.value as T;
}

/** A walk stepped to its end, its answers awaited: what it found, what stopped it, what it left. */
async function walked(w: SteppedWalk) {
  while (w.step(50)) await Bun.sleep(1);
  return { result: w.result, capped: w.capped, rest: w.rest(), failed: w.failed ?? null };
}

afterEach(() => {
  setWalkWorker(null);
  setFolderReader(null);
});

describe("the TUI's walks on their own thread (T12, #9)", () => {
  test("home's walk, stepped while nobody works, never holds the keys or the screen while a folder is read slowly", async () => {
    const home = tree({
      "a.md": "# A\n",
      "notes/n.md": "# N\n",
      "slow/s1.md": "# S1\n\n[a](../a.md)\n",
      "slow/deep/d.md": "# D\n",
    });
    // Slow on either thread: the main thread's walk, as the TUI made it before, waits on it too.
    setFolderReader(slowFolders);
    setWalkWorker(slowWorker);
    await inHome(home, async () => {
      const h = await harness({ loc: homeAt(home), open: "a.md" });
      const job = h.app.watch.indexJob()!;
      let longest = 0;
      let keyed = false;
      const started = performance.now();
      for (;;) {
        const at = performance.now();
        const more = job.step(15);
        longest = Math.max(longest, performance.now() - at);
        if (!more) break;
        // A key while the slow folder is read on the thread: handled, and drawn, at once.
        if (!keyed && performance.now() - started > SLOW_MS / 4) {
          keyed = true;
          const pressed = performance.now();
          await h.keys("ctrl+p");
          expect(performance.now() - pressed).toBeLessThan(SLOW_MS / 2);
          expect(h.frame()).toContain("Open note");
          await h.keys("escape");
        }
        await Bun.sleep(5);
      }
      await h.app.watch.homeRefreshed;
      expect(keyed).toBe(true);
      // The slow folder was read, slowly, on the thread; no slice here waited on it.
      expect(performance.now() - started).toBeGreaterThanOrEqual(SLOW_MS);
      expect(longest).toBeLessThan(SLOW_MS / 4);
      // And home's index is what the walk found.
      expect(h.app.graph.home?.walked).not.toBeNull();
      expect(h.app.graph.notes.has("slow/deep/d.md")).toBe(true);
      expect(h.app.graph.backlinks("a.md").map((b) => b.from)).toEqual(["slow/s1.md"]);
    });
  });

  test("the background index walks each vault it finds on the thread: a slow folder in one holds nothing up", async () => {
    const home = tree({
      "a.md": "# A\n",
      "proj/.slipbox/config.toml": "",
      "proj/index.md": "[home's](../a.md)\n",
      "proj/slow/x.md": "# X\n",
    });
    setFolderReader(slowFolders);
    setWalkWorker(slowWorker);
    await inHome(home, async () => {
      const h = await harness({ loc: homeAt(home), open: "a.md", config: (c) => (c.index.background = true) });
      const job = h.app.watch.indexJob()!;
      let longest = 0;
      for (;;) {
        const at = performance.now();
        const more = job.step(15);
        longest = Math.max(longest, performance.now() - at);
        if (!more) break;
        await Bun.sleep(5);
      }
      await h.app.watch.homeRefreshed;
      expect(longest).toBeLessThan(SLOW_MS / 4);
      expect(job.status.found).toBe(1);
      expect(job.status.indexed).toBe(1);
    });
  });

  test("home's graph built again from a walk on the thread is dropped when the graph was built since, or the vault left", async () => {
    const home = tree({ "a.md": "# A\n", "slow/s.md": "# S\n" });
    setWalkWorker(slowWorker);
    await inHome(home, async () => {
      const h = await harness({ loc: homeAt(home), open: "a.md" });
      await stepToEnd(h.app.watch.indexJob()!);
      await h.app.watch.homeRefreshed;
      const homeIndexed = () => (h.app.watch as unknown as { homeIndexed(capped: null): void }).homeIndexed(null);
      // Asked again: the thread lists `slow` slowly, and a note comes meanwhile that a reindex here takes in.
      homeIndexed();
      await Bun.sleep(SLOW_MS / 4);
      writeFileSync(join(home, "new.md"), "# New\n");
      await h.app.run("vault.reindex");
      expect(h.app.graph.notes.has("new.md")).toBe(true);
      const builds = h.app.graph.builds;
      await h.app.watch.homeRefreshed;
      // The thread's answer was older than the reindex: dropped, the graph as the reindex left it.
      expect(h.app.graph.builds).toBe(builds);
      expect(h.app.graph.notes.has("new.md")).toBe(true);
      // Gone into another vault while the thread walks: its answer is no graph's now.
      homeIndexed();
      const v = tree({ ".slipbox/config.toml": "", "index.md": "# V\n" });
      expect(h.app.vaults.intoOther(join(v, "index.md"))).toBe(true);
      expect(h.app.loc.root).toBe(v);
      const graph = h.app.graph;
      const vaultBuilds = graph.builds;
      await h.app.watch.homeRefreshed;
      expect(h.app.graph).toBe(graph);
      expect(graph.builds).toBe(vaultBuilds);
    });
  });

  test("home's graph built again from a walk on the thread is asked again when the watcher took a change in meanwhile", async () => {
    const home = tree({ "a.md": "# A\n", "slow/s.md": "# S\n" });
    setWalkWorker(slowWorker);
    await inHome(home, async () => {
      const h = await harness({ loc: homeAt(home), open: "a.md" });
      await stepToEnd(h.app.watch.indexJob()!);
      await h.app.watch.homeRefreshed;
      // Asked again: the thread reads home's top, then lists `slow` slowly; a note comes meanwhile, which the watcher
      // takes in — newer than what the thread read.
      (h.app.watch as unknown as { homeIndexed(capped: null): void }).homeIndexed(null);
      await Bun.sleep(SLOW_MS / 4);
      writeFileSync(join(home, "new.md"), "# New\n");
      h.app.watch.applyChanges({ changes: [{ rel: "new.md", kind: "created", isNote: true }], rescan: false });
      expect(h.app.graph.notes.has("new.md")).toBe(true);
      await h.app.watch.homeRefreshed;
      // Never the older walk over it: asked again, the note in what came back.
      expect(h.app.graph.notes.has("new.md")).toBe(true);
      expect(h.app.graph.home?.walked).not.toBeNull();
    });
  });

  test("a walk the thread doesn't answer in time is given up on, and said; the pass goes on", async () => {
    const home = tree({ "a.md": "# A\n", "stuck/s.md": "# S\n" });
    setWalkWorker(slowWorker, { step: 200, whole: 200 });
    await inHome(home, async () => {
      const h = await harness({ loc: homeAt(home), open: "a.md" });
      const job = h.app.watch.indexJob()!;
      const started = performance.now();
      await stepToEnd(job);
      // Given up on at its deadline, not when the folder answered.
      expect(performance.now() - started).toBeLessThan(2000);
      expect(job.status.home).toBe(true);
      expect(h.app.messages.at(-1)?.text).toBe(
        "home's walk gave up: a folder didn't answer in time; it's made again at the next pass",
      );
      // Never walked on the main thread instead: home is still its top alone.
      expect(h.app.graph.home?.walked).toBeNull();
    });
  });
});

describe("the walk's thread takes what the walk here takes (T12)", () => {
  /** A home with every case the walk decides: its skip list, a busy folder, a nested vault, a link followed and one not,
   *  a note too large, a marker of your config's own. */
  function everyCase() {
    const outside = tree({ "far.md": "# Far\n", "sub/deeper.md": "# Deeper\n" });
    const elsewhere = tree({ "no.md": "# No\n" });
    const home = tree({
      "a.md": "# A\n",
      "b.txt": "text\n",
      "pic.png": "png",
      "docs/c.md": "# C\n",
      "docs/data.json": "{}\n",
      "docs/big.md": `# Big\n\n${"x".repeat(400)}\n`,
      ".hidden/h.md": "# H\n",
      "Downloads/d.md": "# D\n",
      "work/node_modules/pkg/n.md": "# N\n",
      "work/build/plan.md": "# Plan: a busy name holding a note\n",
      "proj/.git/HEAD": "ref: refs/heads/main\n",
      "proj/p.md": "# P\n",
      "mine/.mymark": "",
      "mine/m.md": "# M\n",
      "z/y/x/w.md": "# W\n",
    });
    symlinkSync(outside, join(home, "followed"));
    symlinkSync(elsewhere, join(home, "unfollowed"));
    symlinkSync(join(home, "a.md"), join(home, "again.md"));
    return { home, outside };
  }

  test("home's walk, a vault's, home's walk kept brought up to now, a folder past the cap: the same on either", async () => {
    const { home, outside } = everyCase();
    const config = structuredClone(DEFAULT_CONFIG);
    config.walk.max_file_size = 200;
    setRootMarkers([...DEFAULT_CONFIG.walk.root_markers, ".mymark"]);
    try {
      await inHome(home, async () => {
        setLinkAnswer(join(home, "followed"), "follow");
        expect(await probe(outside)).toBe(true);
        const thread = new WalkThread();
        try {
          const loc = homeAt(home);
          const filter = () => homeFilter(loc, config);
          const each = async (make: (w: Walker) => Promise<unknown>) => {
            const here = await make(HERE);
            expect(await make(thread)).toEqual(here);
            return here;
          };
          // Home's walk, whole and capped: the same notes, files, folders and skips, the same left unlisted.
          const whole = (await each((w) => walked(w.sliced(home, filter())))) as Awaited<ReturnType<typeof walked>>;
          const notes = whole.result!.files.map((f) => f.rel);
          expect(notes).toContain("followed/sub/deeper.md");
          expect(notes).toContain("work/build/plan.md");
          expect(notes).not.toContain("mine/m.md");
          expect(whole.result!.skipped.map((s) => `${s.rel}: ${s.reason}`)).toEqual(
            expect.arrayContaining(["proj: nested vault", "mine: nested vault"]),
          );
          await each((w) => walked(w.sliced(home, filter(), { notes: 3, folders: 100 })));
          await each((w) => walked(w.sliced(home, filter(), { notes: 100, folders: 3 })));
          // A vault's index — opened, walked (its .gitignore read), parsed — and home's from its walk; a folder that
          // isn't a vault let go of.
          writeFileSync(join(home, "proj", ".gitignore"), "out/\n");
          mkdirSync(join(home, "proj", "out"));
          writeFileSync(join(home, "proj", "out", "o.md"), "# O\n");
          const indexed = async (w: Walker, of: IndexOf) => {
            const i = w.index(of);
            while (i.step(50)) await Bun.sleep(1);
            return { opened: i.opened, result: i.result, failed: i.failed };
          };
          const vault = await each((w) => indexed(w, { root: join(home, "proj") }));
          expect(vault).toMatchObject({ result: { vault: true, done: true, notes: 1, nested: [] }, failed: null });
          expect(await each((w) => indexed(w, { root: join(home, "docs") }))).toMatchObject({
            result: { vault: false },
          });
          const homes = await each((w) =>
            indexed(w, { root: home, home: { walk: whole.result!, walked: 1, capped: null }, config }),
          );
          expect(homes).toMatchObject({ result: { vault: true, done: true, notes: whole.result!.files.length } });
          // Home's walk kept, a note come since: brought up to now the same, what changed handed back unkept.
          keepHomeWalk(loc, whole.result!, whole.capped, Date.now() - 60_000, filter());
          writeFileSync(join(home, "docs", "later.md"), "# Later\n");
          // When it was walked aside: each takes the time it's made at.
          const untimed = (h: HomeWalk) => ({
            ...h,
            walked: 0,
            ...(h.unkept ? { unkept: { ...h.unkept, walked: 0 } } : {}),
          });
          const kept = (await each((w) => settled(w.home(loc, filter(), ["z/y"])).then(untimed))) as {
            walk: { files: { rel: string }[] };
            unkept?: unknown;
          };
          expect(kept.walk.files.map((f) => f.rel)).toContain("docs/later.md");
          expect(kept.unkept).toBeDefined();
          // A folder past the cap, looked in for vaults.
          const past = await each((w) => settled(w.seek(home, filter())));
          expect(past).toMatchObject({ vaults: [join(home, "mine"), join(home, "proj")] });
        } finally {
          thread.stop();
        }
      });
    } finally {
      setRootMarkers(null);
    }
  });
});

describe("the explorer's listings off the main thread (T12, #9)", () => {
  /** The explorer's listings answered — the folders in those unfolded too — and the tree built again from them. */
  async function listed(h: Harness): Promise<void> {
    for (;;) {
      h.app.explorer.invalidateTree();
      h.app.explorer.treeRows();
      if (!h.app.explorer.listings.reading) return;
      while (h.app.explorer.listings.reading) await Bun.sleep(5);
    }
  }

  /** The explorer's rows, each by its name, indented by its depth. */
  const names = (h: Harness) => h.app.explorer.treeRows().map((r) => `${"  ".repeat(r.depth)}${r.name}`);

  /** A vault, and beside it in their folder `slow` (listed slowly) and `quick`: the explorer's view on that folder, its
   *  listings read off the main thread, as the TUI reads them. */
  async function besideSlow(files: Record<string, string> = {}) {
    const top = tree({
      "vault/.slipbox/config.toml": "",
      "vault/index.md": "# Index\n",
      "slow/a.md": "# A\n",
      "slow/b.txt": "b\n",
      "slow/sub/c.md": "# C\n",
      "quick/q.md": "# Q\n",
      ...files,
    });
    const h = await harness({ root: join(top, "vault") });
    h.app.explorer.listings = new Listings(h.app, true);
    h.app.explorer.zoomTo(top);
    await listed(h);
    return { top, h };
  }

  test("a folder beside the vault listed slowly: keys and the screen go on, `listing…` after a moment, then its rows", async () => {
    setWalkWorker(slowWorker);
    // As slow here: a listing on the main thread, as the explorer made it before, would wait on it.
    setFolderReader(slowFolders);
    const { top, h } = await besideSlow({ "slow/slow/d.md": "# D\n" });
    const ex = h.app.explorer;
    expect(names(h)).toEqual(["quick", "slow", "vault", "  index.md"]);
    ex.expanded.add(join(top, "slow"));
    ex.invalidateTree();
    const at = performance.now();
    const rows = ex.treeRows();
    expect(performance.now() - at).toBeLessThan(SLOW_MS / 4);
    // Not said at once: a fast disk never shows it.
    expect(rows.some((r) => r.placeholder)).toBe(false);
    await Bun.sleep(PENDING_MS + 50);
    expect(names(h)).toEqual(["quick", "slow", "  listing…", "vault", "  index.md"]);
    expect(h.frame()).toContain("listing…");
    // A key meanwhile: handled, and drawn, at once.
    const pressed = performance.now();
    await h.keys("ctrl+p");
    expect(performance.now() - pressed).toBeLessThan(SLOW_MS / 4);
    expect(h.frame()).toContain("Open note");
    await h.keys("escape");
    await listed(h);
    expect(names(h)).toEqual(["quick", "slow", "  slow", "  sub", "  a.md", "  b.txt", "vault", "  index.md"]);
    expect(h.frame()).not.toContain("listing…");
    // The row only says something: never opened.
    ex.expanded.add(join(top, "slow", "slow"));
    ex.invalidateTree();
    ex.treeRows();
    await Bun.sleep(PENDING_MS + 50);
    h.app.region = "sidebar";
    h.app.sidebar.selected = ex.treeRows().findIndex((r) => r.placeholder);
    expect(h.app.sidebar.selected).toBeGreaterThan(0);
    const before = h.app.view?.buf.abs;
    await ex.action("open");
    expect(h.app.view?.buf.abs).toBe(before);
  });

  test("an answer no row asks for any more: kept for the folder unfolded again, dropped for one let go of, or read under settings since changed", async () => {
    setWalkWorker(slowWorker);
    const { top, h } = await besideSlow();
    const ex = h.app.explorer;
    const slow = join(top, "slow");
    // Folded again while it's read: kept, there at once when it's unfolded again.
    ex.expanded.add(slow);
    ex.invalidateTree();
    ex.treeRows();
    ex.expanded.delete(slow);
    ex.invalidateTree();
    while (ex.listings.reading) await Bun.sleep(5);
    ex.expanded.add(slow);
    ex.invalidateTree();
    expect(names(h)).toContain("  a.md");
    // Let go of while it's read (moved, deleted): its answer dropped, the folder read afresh when next shown.
    ex.listings.forget(slow);
    ex.listings.get(slow);
    ex.listings.forget(slow);
    while (ex.listings.reading) await Bun.sleep(5);
    expect(ex.listings.get(slow)).toBeNull();
    while (ex.listings.reading) await Bun.sleep(5);
    // The walk's settings changed while it's read (what a busy folder is): read again under the new ones.
    writeFileSync(join(slow, "late.md"), "# Late\n");
    await Bun.sleep(1100); // older than a listing is kept as it is
    const old = ex.listings.get(slow);
    expect(old?.entries.map((e) => e.name)).not.toContain("late.md");
    h.app.config.walk = { ...h.app.config.walk, exclude: ["*.txt"] };
    // Its answer, read under the old settings, dropped: read again at once under the new, with nothing else asking.
    while (ex.listings.reading) await Bun.sleep(5);
    const now = ex.listings.get(slow);
    expect(now).not.toBe(old);
    expect(now?.entries.map((e) => e.name)).toContain("late.md");
    expect(ex.listings.reading).toBe(false);
  });

  test("a folder's first listing answered under settings since changed (another vault gone into) is read again at once, its rows there with nothing else asking", async () => {
    setWalkWorker(slowWorker);
    const { top, h } = await besideSlow();
    const ex = h.app.explorer;
    const slow = join(top, "slow");
    ex.expanded.add(slow);
    ex.invalidateTree();
    ex.treeRows();
    expect(ex.listings.get(slow)).toBeNull();
    h.app.ui.hidden_files = true;
    // No tree built again meanwhile: the listing reads itself again, and is there.
    while (ex.listings.reading) await Bun.sleep(5);
    expect(
      ex.listings
        .get(slow)
        ?.entries.map((e) => e.name)
        .sort(),
    ).toEqual(["a.md", "b.txt", "sub"]);
    expect(ex.listings.reading).toBe(false);
  });

  test("rows that come keep the selection on the row it was on", async () => {
    setWalkWorker(slowWorker);
    const { top, h } = await besideSlow();
    const ex = h.app.explorer;
    h.app.region = "sidebar";
    h.app.sidebar.selected = ex.treeRows().findIndex((r) => r.name === "vault");
    // The folder above it unfolded, its rows still to come: they arrive above the selected row.
    ex.expanded.add(join(top, "slow"));
    ex.invalidateTree();
    ex.treeRows();
    while (ex.listings.reading) await Bun.sleep(5);
    expect(ex.rows()[h.app.sidebar.selected]?.name).toBe("vault");
    expect(names(h)).toContain("  a.md");
  });

  test("a folder moved, or files changed in the vault, are listed afresh: nothing kept from before is shown as it is now", async () => {
    const { top, h } = await besideSlow({ "vault/node_modules/pkg/index.js": "x\n" });
    const ex = h.app.explorer;
    const quick = join(top, "quick");
    ex.expanded.add(quick);
    await listed(h);
    expect(ex.listings.get(quick)?.entries.map((e) => e.name)).toEqual(["q.md"]);
    // Moved (as renaming tells the explorer): its listing let go of, its folder's read again.
    ex.followMove(quick, join(top, "quicker"));
    expect(ex.listings.get(quick)).toBeNull();
    expect(ex.listings.reading).toBe(true);
    await listed(h);
    // A file operation in the vault: what's listed in it a level at a time (its walk's left-outs) read again.
    const busy = join(top, "vault", "node_modules");
    ex.expanded.add(busy);
    await listed(h);
    expect(ex.listings.get(busy)).not.toBeNull();
    expect(ex.listings.reading).toBe(false);
    h.app.files.afterFileOp();
    ex.listings.get(busy);
    expect(ex.listings.reading).toBe(true);
    await listed(h);
  });

  test("more folders shown than are kept: each listed once, none let go of while it's shown", async () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 300; i++) many[`many/f${String(i).padStart(3, "0")}/n.md`] = "# N\n";
    const { top, h } = await besideSlow(many);
    const ex = h.app.explorer;
    ex.expanded.add(join(top, "many"));
    for (let i = 0; i < 300; i++) ex.expanded.add(join(top, "many", `f${String(i).padStart(3, "0")}`));
    await listed(h);
    expect(names(h).filter((n) => n.trim() === "n.md")).toHaveLength(300);
    // Built again: every one there as it was listed, none let go of to make room (read again when old, as any).
    ex.invalidateTree();
    expect(ex.treeRows().filter((r) => r.name === "n.md")).toHaveLength(300);
    for (let i = 0; i < 300; i++)
      expect(ex.listings.get(join(top, "many", `f${String(i).padStart(3, "0")}`))).not.toBeNull();
    await listed(h);
  });

  test("a hidden name is never read while hidden names aren't listed: nothing of it in the listing", () => {
    const dir = tree({ "a.md": "# A\n", ".hidden/h.md": "# H\n", ".env": "A=1\n", ".git/HEAD": "x\n" });
    const names = (hidden: boolean) =>
      listFolder(dir, DEFAULT_CONFIG.walk, hidden)
        .entries.map((e) => e.name)
        .sort();
    expect(names(false)).toEqual(["a.md"]);
    expect(names(true)).toEqual([".env", ".hidden", "a.md"]);
  });

  test("a folder whose listing doesn't answer in time says so in its row, never read on the main thread instead; one listed before stays as it was", async () => {
    // A deadline short of the stuck folder's answer, past a started thread's: both threads started first.
    setWalkWorker(slowWorker, { step: 1500, whole: 1500 });
    const { top, h } = await besideSlow({ "stuck/s.md": "# S\n" });
    await Promise.all([0, 1].map(() => listThreads().list(top, DEFAULT_CONFIG.walk, false)));
    const ex = h.app.explorer;
    ex.expanded.add(join(top, "stuck"));
    ex.invalidateTree();
    ex.treeRows();
    await listed(h);
    expect(names(h)).toEqual(["quick", "slow", "stuck", "  can't read: no answer in time", "vault", "  index.md"]);
    // The folder above it read again, its thread giving no answer either: shown as it was listed.
    setWalkWorker(slowWorker, { step: 1, whole: 1 });
    ex.listings.stale(top);
    ex.invalidateTree();
    ex.treeRows();
    while (ex.listings.reading) await Bun.sleep(5);
    ex.invalidateTree();
    expect(names(h).slice(0, 3)).toEqual(["quick", "slow", "stuck"]);
  });

  test("the rows and their marks are the ones the listing here gives: vaults and their names, links, busy and hidden folders, files by kind", async () => {
    const outside = tree({ "far.md": "# Far\n" });
    const { top, h } = await besideSlow({
      "other/.slipbox/config.toml": '[vault]\nname = "elsewhere-notes"\n',
      "other/o.md": "# O\n",
      "repo/.git/HEAD": "ref: refs/heads/main\n",
      "repo/r.md": "# R\n",
      "mixed/node_modules/pkg/index.js": "x\n",
      "mixed/build/plan.md": "# Plan\n",
      "mixed/.hidden/h.md": "# H\n",
      "mixed/.env": "A=1\n",
      "mixed/data.json": "{}\n",
      "mixed/pic.png": "png",
      "mixed/note.md": "# Note\n",
      "mixed/locked/l.md": "# L\n",
    });
    symlinkSync(outside, join(top, "mixed", "followed"));
    symlinkSync(join(top, "quick"), join(top, "mixed", "near"));
    symlinkSync(join(top, "gone"), join(top, "mixed", "broken.md"));
    const locked = process.getuid?.() !== 0;
    if (locked) chmodSync(join(top, "mixed", "locked"), 0o000);
    try {
      setLinkAnswer(join(top, "mixed", "followed"), "follow");
      const ex = h.app.explorer;
      for (const d of ["other", "repo", "mixed", "mixed/node_modules", "mixed/followed"]) ex.expanded.add(join(top, d));
      const seen = async (hidden: boolean) => {
        h.app.ui.hidden_files = hidden;
        ex.invalidateTree();
        await listed(h);
        const marks = (r: TreeRow) => {
          const m = ex.marks.of(r);
          return { describe: m.describe, index: m.index, fit: m.fit?.(60) };
        };
        return ex.treeRows().map((r) => {
          const { listed: _, ...row } = r;
          // Its marks from what its listing read, as the marks read the disk themselves for a row with none.
          expect([r.name, marks(r)]).toEqual([r.name, marks(row)]);
          return { row, ...marks(r) };
        });
      };
      for (const hidden of [false, true]) {
        const there = await seen(hidden);
        ex.listings = new Listings(h.app, false);
        const here = await seen(hidden);
        ex.listings = new Listings(h.app, true);
        expect(there).toEqual(here);
        expect(there.length).toBeGreaterThan(10);
      }
    } finally {
      if (locked) chmodSync(join(top, "mixed", "locked"), 0o755);
    }
  });
});
