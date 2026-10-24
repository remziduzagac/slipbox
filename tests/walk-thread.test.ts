// The TUI's walks on their own thread (T12, #9): a folder that answers slowly never holds up the keys or the screen,
// and the thread's walk takes what the walk on the thread that asks takes.

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../src/core/config.ts";
import { type HomeWalk, homeFilter, homeWalk, homeWalkFile, keepHomeWalk } from "../src/core/home.ts";
import { probe, setLinkAnswer } from "../src/core/symlinks.ts";
import { homeAt, setRootMarkers } from "../src/core/vault.ts";
import { SlicedWalk, setFolderReader } from "../src/core/walk.ts";
import { ListThreads, listThreads, setWalkWorker, WalkThread } from "../src/core/walk-thread.ts";
import { listFolder } from "../src/core/listing.ts";
import { tildePath } from "../src/core/names.ts";
import { HERE, type IndexAsk, type Pending, type SteppedWalk, type Walker } from "../src/core/walkers.ts";
import { SLOW_MS, STUCK_MS, slowFolders } from "./fixtures/walk/slow.ts";
import type { TreeRow } from "../src/tui/explorer.ts";
import { Listings, PENDING_MS, REREAD_MS } from "../src/tui/listings.ts";
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

/** A walk stepped to its end, its answers awaited: whether it's done, what stopped it, what it left, the vaults it
 *  found — the walk itself kept where it was made. */
async function walked(w: SteppedWalk) {
  while (w.step(50)) await Bun.sleep(1);
  return { done: w.done, capped: w.capped, rest: w.rest(), nested: w.nested(), failed: w.failed ?? null };
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

  test("home's graph built again from a walk on the thread keeps a change the watcher took in meanwhile, newer than the walk", async () => {
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
      // Never the older walk over it: the change taken in again over the walk.
      expect(h.app.graph.notes.has("new.md")).toBe(true);
      expect(h.app.graph.home?.walked).not.toBeNull();
    });
  });

  test("home's graph built again from a walk on the thread keeps a note slipbox wrote meanwhile, which told no watcher", async () => {
    const home = tree({ "a.md": "# A\n", "slow/s.md": "# S\n" });
    setWalkWorker(slowWorker);
    await inHome(home, async () => {
      const h = await harness({ loc: homeAt(home), open: "a.md" });
      await stepToEnd(h.app.watch.indexJob()!);
      await h.app.watch.homeRefreshed;
      (h.app.watch as unknown as { homeIndexed(capped: null): void }).homeIndexed(null);
      await Bun.sleep(SLOW_MS / 4);
      // A note made here while the thread reads home: in the graph at once, its own write told no watcher.
      expect(h.app.files.createNote("made", "")?.created).toBe(true);
      expect(h.app.graph.notes.has("made.md")).toBe(true);
      await h.app.watch.homeRefreshed;
      expect(h.app.graph.notes.has("made.md")).toBe(true);
    });
  });

  test("home's graph built again from a walk on the thread keeps a file reached meanwhile as reached, never one of home's own", async () => {
    // Home past its cap of folders: a note in a folder below its top's is one its walk leaves out.
    const home = tree({ "a.md": "# A\n", "slow/s.md": "# S\n", "z0000/deep/r.md": "# R\n" });
    for (let i = 1; i < 5_000; i++) mkdirSync(join(home, `z${String(i).padStart(4, "0")}`));
    const far = "z0000/deep/r.md";
    setWalkWorker(slowWorker);
    await inHome(home, async () => {
      const h = await harness({ loc: homeAt(home), open: "a.md" });
      await stepToEnd(h.app.watch.indexJob()!);
      await h.app.watch.homeRefreshed;
      expect(h.app.graph.home?.capped).toBe("folders");
      expect(h.app.graph.notes.has(far)).toBe(false);
      (h.app.watch as unknown as { homeIndexed(capped: null): void }).homeIndexed(null);
      await Bun.sleep(SLOW_MS / 4);
      // Reached while the thread reads home (20.8), as a link to it reaches it.
      expect(h.app.graph.reachFile(far)).toBe(true);
      expect(h.app.graph.reached.has(far)).toBe(true);
      const builds = h.app.graph.builds;
      await h.app.watch.homeRefreshed;
      expect(h.app.graph.builds).toBe(builds + 1);
      expect(h.app.graph.notes.has(far)).toBe(true);
      expect(h.app.graph.reached.has(far)).toBe(true);
    });
  });

  test("the background index writes the machine's lists on the thread that asks alone; home is never read there", async () => {
    const vaultMod = await import("../src/core/vault.ts");
    const homeMod = await import("../src/core/home.ts");
    const registry = await import("../src/core/registry.ts");
    const folders = await import("../src/core/folders.ts");
    const { AutoIndex } = await import("../src/core/autoindex.ts");
    const { walkThread } = await import("../src/core/walk-thread.ts");
    const home = tree({
      "a.md": "# A\n",
      "proj/.slipbox/config.toml": '[vault]\nname = "found-here"\n',
      "proj/p.md": "# P\n",
    });
    await inHome(home, async () => {
      const spies = {
        homeAt: spyOn(vaultMod, "homeAt"),
        keepHomeWalk: spyOn(homeMod, "keepHomeWalk"),
        homeFilter: spyOn(homeMod, "homeFilter"),
        recordRoot: spyOn(registry, "recordRoot"),
        recordFolder: spyOn(folders, "recordFolder"),
      };
      try {
        const job = new AutoIndex(home, null, () => Date.now(), {
          walker: walkThread(),
          config: () => structuredClone(DEFAULT_CONFIG),
        });
        await stepToEnd(job, 15);
        expect(job.status).toMatchObject({ home: true, found: 1, indexed: 1, homeNotes: 1 });
        // Home's location, filter and walk kept: all made on the thread, none here.
        expect(spies.homeAt).not.toHaveBeenCalled();
        expect(spies.keepHomeWalk).not.toHaveBeenCalled();
        expect(spies.homeFilter).not.toHaveBeenCalled();
        // The lists written here, from what the thread read: home and the vault found, the vault's name.
        expect(spies.recordRoot.mock.calls.map((c) => [c[0].kind, c[0].path, c[0].found])).toEqual([
          ["home", home, true],
          ["vault", join(home, "proj"), true],
        ]);
        expect(spies.recordFolder).toHaveBeenCalledTimes(1);
        expect(registry.readRoots().find((v) => v.path === join(home, "proj"))).toMatchObject({ found: true });
        expect(folders.readFolders().find((f) => f.name === "found-here")?.copies[0]?.path).toBe(join(home, "proj"));
        expect(homeMod.homeWalkKept(homeAt(home), { walk: DEFAULT_CONFIG.walk })).toBe(true);
      } finally {
        for (const s of Object.values(spies)) s.mockRestore();
      }
    });
  });

  test("a found vault recorded with nothing read of the named folders' copies on the thread that asks: read where it was opened", async () => {
    const fs = await import("node:fs");
    const folders = await import("../src/core/folders.ts");
    const { AutoIndex } = await import("../src/core/autoindex.ts");
    const { walkThread } = await import("../src/core/walk-thread.ts");
    // One folder by its id, in two copies.
    const TWICE = '[vault]\nname = "twice"\nid = "0b6f1c2e-twice"\n';
    const home = tree({ "a.md": "# A\n", "proj/.slipbox/config.toml": TWICE, "proj/p.md": "# P\n" });
    // Copies recorded before, elsewhere — on a disk that might answer slowly: another folder's, and this one's.
    const elsewhere = tree({
      "c1/.slipbox/config.toml": '[vault]\nname = "other"\n',
      "c2/.slipbox/config.toml": TWICE,
    });
    folders.recordFolder(join(elsewhere, "c1"));
    folders.recordFolder(join(elsewhere, "c2"));
    await inHome(home, async () => {
      const spies = [spyOn(fs, "realpathSync"), spyOn(fs, "existsSync"), spyOn(fs, "statSync")];
      try {
        const job = new AutoIndex(home, null, () => Date.now(), {
          walker: walkThread(),
          config: () => structuredClone(DEFAULT_CONFIG),
        });
        await stepToEnd(job, 15);
        expect(job.status).toMatchObject({ found: 1, indexed: 1 });
        const here = spies.flatMap((s) => s.mock.calls.map((c) => String(c[0])));
        expect(here.filter((p) => p.startsWith(elsewhere))).toEqual([]);
      } finally {
        for (const s of spies) s.mockRestore();
      }
      // Recorded as before: the second copy of `twice` a choice to make, both there; the other folder left as it was.
      const list = folders.readFolders();
      expect(list.find((f) => f.name === "twice")).toMatchObject({ ask: true });
      expect(list.find((f) => f.name === "twice")?.copies.map((c) => c.path)).toEqual([
        join(elsewhere, "c2"),
        join(home, "proj"),
      ]);
      expect(list.find((f) => f.name === "other")?.copies.map((c) => c.path)).toEqual([join(elsewhere, "c1")]);
    });
  });

  test("a found vault recorded from what was read where it was opened: a copy recorded since read of nothing here", async () => {
    const fs = await import("node:fs");
    const folders = await import("../src/core/folders.ts");
    const TWICE = '[vault]\nname = "since"\nid = "5d0c-recorded-since"\n';
    const home = tree({ "proj/.slipbox/config.toml": TWICE });
    const elsewhere = tree({ "c2/.slipbox/config.toml": TWICE });
    const proj = join(home, "proj");
    const ident = folders.folderIdentity(proj);
    // What the thread read, before `c2` was recorded (by another slipbox, meanwhile).
    const copies = folders.copyFacts();
    folders.recordFolder(join(elsewhere, "c2"));
    const spies = [spyOn(fs, "realpathSync"), spyOn(fs, "existsSync"), spyOn(fs, "statSync")];
    try {
      folders.recordFolder(proj, { found: true, known: { ident, real: proj, copies } });
      const here = spies.flatMap((s) => s.mock.calls.map((c) => String(c[0])));
      expect(here.filter((p) => p.startsWith(elsewhere))).toEqual([]);
    } finally {
      for (const s of spies) s.mockRestore();
    }
    // `c2` taken as it was recorded, by its real path, there: two copies, a choice to make.
    const twice = folders.readFolders().find((f) => f.name === "since");
    expect(twice?.copies.map((c) => c.path)).toEqual([join(elsewhere, "c2"), proj]);
    expect(twice).toMatchObject({ ask: true });
  });

  test("a found vault counted once, the TUI quitting while it's indexed; a small one opened and parsed in one step", async () => {
    const { AutoIndex } = await import("../src/core/autoindex.ts");
    const { IndexJob } = await import("../src/core/index-job.ts");
    const notes: Record<string, string> = { "a.md": "# A\n", "proj/.slipbox/config.toml": "" };
    for (let i = 0; i < 400; i++) notes[`proj/n${i}.md`] = `# N${i}\n\n[a](../a.md) ${"word ".repeat(50)}\n`;
    const home = tree(notes);
    const file = join(tree({}), "autoindex.json");
    await inHome(home, async () => {
      const opts = { config: () => structuredClone(DEFAULT_CONFIG) };
      const first = new AutoIndex(home, file, () => Date.now(), opts);
      while (!(first.status.current && first.status.found === 1)) expect(first.step(1)).toBe(true);
      // Quit mid-index, started again: the vault indexed from the place kept, counted once.
      const again = new AutoIndex(home, file, () => Date.now(), opts);
      await stepToEnd(again, 1);
      expect(again.status).toMatchObject({ found: 1, indexed: 1 });
      // A small vault: opened, walked and parsed in one step of its budget.
      const small = tree({ ".slipbox/config.toml": "", "s.md": "# S\n" });
      expect(new IndexJob({ root: small }).step(5000)).toMatchObject({ vault: true, done: true, notes: 1 });
    });
  });

  test("two threads of one process writing the same file at once: each write whole, none lost to the other's", async () => {
    const dir = tree({});
    const path = join(dir, "kept.json");
    const workers = [0, 1, 2].map(() => new Worker(new URL("./fixtures/walk/write-worker.ts", import.meta.url).href));
    try {
      const results = await Promise.all(
        workers.map(
          (w, i) =>
            new Promise<{ failed: number }>((done) => {
              w.onmessage = (e) => done(e.data);
              w.postMessage({ path, text: `${i}`.repeat(4096), n: 300 });
            }),
        ),
      );
      expect(results.map((r) => r.failed)).toEqual([0, 0, 0]);
      expect(["0", "1", "2"].map((t) => t.repeat(4096))).toContain(readFileSync(path, "utf8"));
    } finally {
      for (const w of workers) w.terminate();
    }
  });

  test("a walk the thread doesn't answer in time is given up on, and said; never made on the main thread instead", async () => {
    const home = tree({ "a.md": "# A\n", "stuck/s.md": "# S\n" });
    setWalkWorker(slowWorker, { step: 1000, whole: 1000 });
    await inHome(home, async () => {
      const h = await harness({ loc: homeAt(home), open: "a.md" });
      const job = h.app.watch.indexJob()!;
      const started = performance.now();
      await stepToEnd(job);
      // Given up on at its deadline, not when the folder answered.
      expect(performance.now() - started).toBeLessThan(SLOW_MS * 7);
      expect(h.app.messages.at(-1)?.text).toBe(
        "home's walk gave up: a folder didn't answer in time; it's tried again in ten minutes",
      );
      // Never walked on the main thread instead: home is still its top alone, and the pass waits for its walk.
      expect(h.app.graph.home?.walked).toBeNull();
      expect(job.status).toMatchObject({ home: false, passFinished: null });
    });
  });

  test("home's graph built again from a walk the thread doesn't answer in time: said as the walk's, home walked again ten minutes later", async () => {
    const home = tree({ "a.md": "# A\n" });
    setWalkWorker(slowWorker, { step: 1000, whole: 1000 });
    await inHome(home, async () => {
      const h = await harness({ loc: homeAt(home), open: "a.md" });
      const job = h.app.watch.indexJob()!;
      await stepToEnd(job);
      await h.app.watch.homeRefreshed;
      expect(job.status.home).toBe(true);
      // A folder that hangs comes in home: bringing the walk kept up to now reads it, and isn't answered in time.
      mkdirSync(join(home, "stuck"));
      writeFileSync(join(home, "stuck", "s.md"), "# S\n");
      (h.app.watch as unknown as { homeIndexed(capped: null): void }).homeIndexed(null);
      await h.app.watch.homeRefreshed;
      expect(h.app.messages.at(-1)?.text).toBe(
        "home's walk gave up: a folder didn't answer in time; it's tried again in ten minutes",
      );
      // Home's walk to be made again — not before it's due.
      expect(job.status.home).toBe(false);
      expect(job.step(15)).toBe(false);
    });
  });

  test("home walked again later: nothing of home until it's due, the vaults of the pass indexed meanwhile", async () => {
    const { AutoIndex, WALK_RETRY_MS } = await import("../src/core/autoindex.ts");
    const home = tree({ "a.md": "# A\n", "proj/.slipbox/config.toml": "", "proj/p.md": "# P\n" });
    let clock = Date.now();
    let homes = 0;
    await inHome(home, async () => {
      const job: InstanceType<typeof AutoIndex> = new AutoIndex(home, null, () => clock, {
        config: () => structuredClone(DEFAULT_CONFIG),
        // As the TUI asks when home's graph couldn't be built from the walk: walked again ten minutes later.
        onHome: () => {
          if (++homes === 1) job.homeAgain(true);
        },
      });
      await stepToEnd(job, 15);
      expect(homes).toBe(1);
      expect(job.status).toMatchObject({ home: false, found: 1, indexed: 1 });
      expect(job.status.passFinished).not.toBeNull();
      expect(job.step(15)).toBe(false);
      clock += WALK_RETRY_MS + 1;
      await stepToEnd(job, 15);
      expect(homes).toBe(2);
      expect(job.status).toMatchObject({ home: true, found: 1, indexed: 1 });
      expect(job.idle).toBe(true);
    });
  });

  test("home's walk made while Downloads moved is walked again where it is now, never kept under where it was", async () => {
    const { AutoIndex } = await import("../src/core/autoindex.ts");
    const before = process.env.XDG_CONFIG_HOME;
    for (const on of ["here", "thread"] as const) {
      const home = tree({
        "a.md": "# A\n",
        "f1/x.md": "# X\n",
        "Downloads/d.md": "# D\n",
        "Téléchargements/t.md": "# T\n",
      });
      const config = `${home}-config`;
      mkdirSync(config);
      process.env.XDG_CONFIG_HOME = config;
      const thread = on === "thread" ? new WalkThread() : null;
      // The walk, to know when the thread has answered its first slice: its filter made there by then.
      let walk: SteppedWalk | null = null;
      const walker: Walker = thread
        ? {
            sliced: (settings, limits) => (walk = thread.sliced(settings, limits)),
            index: (of) => thread.index(of),
            seek: (dir, settings) => thread.seek(dir, settings),
          }
        : HERE;
      try {
        await inHome(home, async () => {
          const job = new AutoIndex(home, null, () => Date.now(), {
            walker,
            vaults: false,
            config: () => structuredClone(DEFAULT_CONFIG),
          });
          // Its first folder walked, Downloads where it always is: then the desktop says it's elsewhere.
          expect(job.step(0)).toBe(true);
          while ((walk as SteppedWalk | null)?.waiting) await Bun.sleep(5);
          expect(job.step(0)).toBe(true);
          writeFileSync(join(config, "user-dirs.dirs"), 'XDG_DOWNLOAD_DIR="$HOME/Téléchargements"\n');
          await stepToEnd(job, 0);
          expect(job.status.home).toBe(true);
          const kept = JSON.parse(readFileSync(homeWalkFile(homeAt(home)), "utf8"));
          expect(kept.notes.sort()).toEqual(["Downloads/d.md", "a.md", "f1/x.md"]);
        });
      } finally {
        thread?.stop();
        process.env.XDG_CONFIG_HOME = before;
      }
    }
  });

  test("a slice has five minutes on the thread: a folder that always takes longer than a minute is read, never given up on", async () => {
    const { WALK_DEADLINES } = await import("../src/core/walk-thread.ts");
    // A share's folder of thousands of files may take minutes every time: given up on at a minute, home was never walked.
    expect(WALK_DEADLINES.step).toBe(5 * 60_000);
    expect(WALK_DEADLINES.whole).toBe(10 * 60_000);
  });

  test("a new pass counts the vaults it finds afresh: none left uncounted for the last pass's", async () => {
    const { AutoIndex, REPASS_MS } = await import("../src/core/autoindex.ts");
    const home = tree({ "a.md": "# A\n", "proj/.slipbox/config.toml": "", "proj/p.md": "# P\n" });
    let clock = Date.now();
    await inHome(home, async () => {
      const job = new AutoIndex(home, null, () => clock, { config: () => structuredClone(DEFAULT_CONFIG) });
      await stepToEnd(job, 15);
      expect(job.status).toMatchObject({ found: 1, indexed: 1 });
      clock += REPASS_MS + 1;
      await stepToEnd(job, 15);
      expect(job.status).toMatchObject({ found: 1, indexed: 1 });
      expect(Date.parse(job.status.passStarted!)).toBeGreaterThan(clock - 1000);
    });
  });

  test("home walked again while a vault is indexed: home recorded as found, the vault after it, each once", async () => {
    const registry = await import("../src/core/registry.ts");
    const { AutoIndex } = await import("../src/core/autoindex.ts");
    const notes: Record<string, string> = { "a.md": "# A\n", "proj/.slipbox/config.toml": "" };
    for (let i = 0; i < 400; i++) notes[`proj/n${i}.md`] = `# N${i}\n\n${"word ".repeat(50)}\n`;
    const home = tree(notes);
    await inHome(home, async () => {
      const job = new AutoIndex(home, null, () => Date.now(), { config: () => structuredClone(DEFAULT_CONFIG) });
      // The vault opened and recorded, its notes being parsed.
      while (!(job.status.current && job.status.found === 1)) expect(job.step(1)).toBe(true);
      // Home let go of from the lists meanwhile, then walked again: recorded again once it's indexed.
      registry.writeRoots(registry.readRoots().filter((v) => v.kind !== "home"));
      const spy = spyOn(registry, "recordRoot");
      try {
        job.homeAgain();
        await stepToEnd(job, 1);
        expect(spy.mock.calls.map((c) => [c[0].kind, c[0].path])).toEqual([["home", home]]);
        expect(job.status).toMatchObject({ found: 1, indexed: 1 });
      } finally {
        spy.mockRestore();
      }
    });
  });

  test("a tick waiting on the walk's thread writes nothing: the place kept only when it changed", async () => {
    const fsutil = await import("../src/core/fsutil.ts");
    const { AutoIndex } = await import("../src/core/autoindex.ts");
    const home = tree({ "a.md": "# A\n", "slow/s.md": "# S\n" });
    const file = join(tree({}), "autoindex.json");
    const thread = new WalkThread(slowWorker);
    await inHome(home, async () => {
      const spy = spyOn(fsutil, "writeJson");
      try {
        const job = new AutoIndex(home, file, () => Date.now(), {
          walker: thread,
          config: () => structuredClone(DEFAULT_CONFIG),
        });
        const writes = () => spy.mock.calls.filter((c) => c[0] === file).length;
        // Started, then waiting on the thread while it lists `slow`: a tick at a time, nothing new to keep.
        while (job.step(15) && writes() === 0) await Bun.sleep(1);
        await Bun.sleep(50);
        const before = writes();
        for (let i = 0; i < 10; i++) {
          expect(job.step(15)).toBe(true);
          await Bun.sleep(10);
        }
        expect(writes()).toBe(before);
        await stepToEnd(job, 15);
        expect(job.status.home).toBe(true);
        expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({ home: true });
      } finally {
        spy.mockRestore();
        thread.stop();
      }
    });
  });

  test("home's walk given up on is tried again ten minutes later, the pass waiting for it — never finished with nothing found", async () => {
    const { AutoIndex, WALK_RETRY_MS } = await import("../src/core/autoindex.ts");
    const home = tree({
      "a.md": "# A\n",
      "stuck/s.md": "# S\n",
      "proj/.slipbox/config.toml": "",
      "proj/p.md": "# P\n",
    });
    const thread = new WalkThread(slowWorker, { step: 1000, whole: 1000 });
    let clock = Date.now();
    try {
      await inHome(home, async () => {
        const job = new AutoIndex(home, null, () => clock, {
          walker: thread,
          config: () => structuredClone(DEFAULT_CONFIG),
        });
        await stepToEnd(job, 15);
        expect(job.status).toMatchObject({ home: false, found: 0, passFinished: null });
        // Nothing done until it's due again, the folder that hung answering by then.
        expect(job.step(15)).toBe(false);
        renameSync(join(home, "stuck"), join(home, "unstuck"));
        clock += WALK_RETRY_MS + 1;
        await stepToEnd(job, 15);
        expect(job.status).toMatchObject({ home: true, found: 1, indexed: 1 });
        expect(job.status.passFinished).not.toBeNull();
      });
    } finally {
      thread.stop();
    }
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
          // Home's walk, whole and capped: the same vaults found, the same left unlisted, the same cap — and, home's
          // index built from it where it was made, the same walk kept (its notes, files, folders and skips).
          const whole = (await each((w) => walked(w.sliced(filter().settings)))) as Awaited<ReturnType<typeof walked>>;
          expect(whole.nested.sort()).toEqual(["mine", "proj"]);
          await each((w) => walked(w.sliced(filter().settings, { notes: 3, folders: 100 })));
          await each((w) => walked(w.sliced(filter().settings, { notes: 100, folders: 3 })));
          const keptBy = async (w: Walker) => {
            const sliced = w.sliced(filter().settings);
            await walked(sliced);
            const i = w.index({ root: home, home: sliced.handOver(1), config });
            while (i.step(50)) await Bun.sleep(1);
            const { walked: _, ...kept } = JSON.parse(readFileSync(homeWalkFile(loc), "utf8"));
            return { kept, result: i.result };
          };
          const homeKept = (await each(keptBy)) as {
            kept: { notes: string[]; skipped: { rel: string; reason: string }[] };
          };
          expect(homeKept.kept.notes).toContain("followed/sub/deeper.md");
          expect(homeKept.kept.notes).toContain("work/build/plan.md");
          expect(homeKept.kept.notes).not.toContain("mine/m.md");
          expect(homeKept.kept.skipped.map((s) => `${s.rel}: ${s.reason}`)).toEqual(
            expect.arrayContaining(["proj: nested vault", "mine: nested vault"]),
          );
          // The walk itself, as made here, for what follows.
          const here = new SlicedWalk(home, filter());
          while (here.step(50)) {}
          const homeResult = here.result!;
          // A vault's index — opened, walked (its .gitignore read), parsed — and home's from its walk; a folder that
          // isn't a vault let go of.
          writeFileSync(join(home, "proj", ".gitignore"), "out/\n");
          mkdirSync(join(home, "proj", "out"));
          writeFileSync(join(home, "proj", "out", "o.md"), "# O\n");
          const indexed = async (w: Walker, of: IndexAsk) => {
            const i = w.index(of);
            while (i.step(50)) await Bun.sleep(1);
            return { opened: i.opened, result: i.result, failed: i.failed };
          };
          const vault = await each((w) => indexed(w, { root: join(home, "proj") }));
          expect(vault).toMatchObject({ result: { vault: true, done: true, notes: 1, nested: [] }, failed: null });
          expect(await each((w) => indexed(w, { root: join(home, "docs") }))).toMatchObject({
            result: { vault: false },
          });
          // Home's walk kept, a note come since: brought up to now the same, what changed handed back unkept.
          keepHomeWalk(loc, homeResult, here.capped, Date.now() - 60_000, filter());
          writeFileSync(join(home, "docs", "later.md"), "# Later\n");
          // When it was walked aside: each takes the time it's made at.
          const untimed = (h: HomeWalk) => ({
            ...h,
            walked: 0,
            ...(h.unkept ? { unkept: { ...h.unkept, walked: 0 } } : {}),
          });
          const kept = untimed(homeWalk(loc, filter(), ["z/y"], undefined, false));
          expect(untimed(await thread.homeWalk(loc, filter().settings, ["z/y"]))).toEqual(kept);
          expect(kept.walk.files.map((f) => f.rel)).toContain("docs/later.md");
          expect(kept.unkept).toBeDefined();
          // A folder past the cap, looked in for vaults.
          const past = await each((w) => settled(w.seek(home, filter().settings)));
          expect(past).toMatchObject({ vaults: [join(home, "mine"), join(home, "proj")] });
        } finally {
          thread.stop();
        }
      });
    } finally {
      setRootMarkers(null);
    }
  });

  test("an index's end is the same however its work fell across slices: what it opened told apart, never in its end", async () => {
    const root = tree({ ".slipbox/config.toml": "", "a.md": "# A\n", "b.md": "# B\n\n[a](a.md)\n" });
    /** The vault indexed in slices of `budget`: what it opened, its end, and how many slices it took here. */
    const indexed = async (w: Walker, budget: number) => {
      const i = w.index({ root });
      let slices = 1;
      while (i.step(budget)) {
        if (!i.waiting) slices++;
        await Bun.sleep(1);
      }
      return { slices, end: { opened: i.opened, result: i.result, failed: i.failed } };
    };
    // Opened and ended in one slice; opened in one, ended in a later one (no time left once it's opened): which of
    // the two a walk makes is the time it took, as a loaded machine or a thread just started can tell.
    const whole = await indexed(HERE, 60_000);
    const sliced = await indexed(HERE, 0);
    expect(whole.slices).toBe(1);
    expect(sliced.slices).toBeGreaterThan(1);
    expect(whole.end.opened?.key).toBeString();
    expect(sliced.end).toEqual(whole.end);
    expect(whole.end.result).toEqual({ vault: true, done: true, notes: 2, nested: [] });
    // On the walk's thread, in one slice: the same.
    const thread = new WalkThread();
    try {
      expect((await indexed(thread, 60_000)).end).toEqual(whole.end);
    } finally {
      thread.stop();
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

  test("a folder new among more folders shown than are kept: none of the others let go of while the tree is built", async () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 300; i++) many[`many/f${String(i).padStart(3, "0")}/n.md`] = "# N\n";
    const { top, h } = await besideSlow(many);
    const ex = h.app.explorer;
    ex.expanded.add(join(top, "many"));
    for (let i = 0; i < 300; i++) ex.expanded.add(join(top, "many", `f${String(i).padStart(3, "0")}`));
    await listed(h);
    // One more, first of them: asked for before the 300, it lets none of them go as the tree is built.
    mkdirSync(join(top, "many", "a-new"));
    writeFileSync(join(top, "many", "a-new", "x.md"), "# X\n");
    ex.listings.stale(join(top, "many"));
    await listed(h);
    ex.expanded.add(join(top, "many", "a-new"));
    ex.invalidateTree();
    expect(ex.treeRows().filter((r) => r.name === "n.md")).toHaveLength(300);
    await listed(h);
    expect(names(h)).toContain("    x.md");
  });

  test("a row meant to be selected in a folder not listed yet — the folder zoomed out from — is selected once it's listed", async () => {
    const top = tree({ "a/a.md": "# A\n", "vault/.slipbox/config.toml": "", "vault/index.md": "# Index\n" });
    const h = await harness({ root: join(top, "vault") });
    h.app.explorer.listings = new Listings(h.app, true);
    const ex = h.app.explorer;
    h.app.region = "sidebar";
    ex.zoomOut();
    // Not listed yet: the selection at the top meanwhile, the vault's row meant.
    expect(h.app.sidebar.selected).toBe(0);
    await listed(h);
    expect(ex.rows()[h.app.sidebar.selected]?.path).toBe(join(top, "vault"));
    // Moved by you before it came: left where you put it.
    ex.zoomOut();
    await ex.action("down");
    const moved = h.app.sidebar.selected;
    await listed(h);
    expect(h.app.sidebar.selected).toBe(moved);
  });

  test("another disk mounted in a folder listed is never looked at — a folder, or a file mounted alone; a folder you may not read says why", async () => {
    const { setMountTable } = await import("../src/core/mounts.ts");
    const top = tree({
      "disk/.slipbox/config.toml": "",
      "disk/d.md": "# D\n",
      "plain/p.md": "# P\n",
      "locked/l.md": "# L\n",
      hosts: "127.0.0.1 localhost\n",
    });
    const locked = process.getuid?.() !== 0;
    if (locked) chmodSync(join(top, "locked"), 0o000);
    // A container's `/etc/hosts`: a file bind-mounted from another disk.
    setMountTable(() => [
      { device: "share:/x", at: join(top, "disk"), type: "nfs", options: "rw" },
      { device: "/dev/vda1", at: join(top, "hosts"), type: "ext4", options: "rw" },
    ]);
    try {
      const listing = listFolder(top, DEFAULT_CONFIG.walk, false);
      const of = (name: string) => listing.entries.find((e) => e.name === name);
      expect(of("disk")).toEqual({ name: "disk", dir: true, file: false, denied: false, mount: true });
      expect(of("hosts")).toEqual({ name: "hosts", dir: false, file: true, denied: false, mount: true });
      expect(of("plain")).toMatchObject({ dir: true, denied: false, unreadable: null });
      if (locked)
        expect(of("locked")).toMatchObject({ denied: true, unreadable: "you may not read it (no permission)" });
    } finally {
      setMountTable(null);
      if (locked) chmodSync(join(top, "locked"), 0o755);
    }
  });

  test("a listing's digest covers what its rows are built from: a folder become a notes vault's lists anew", () => {
    const repo = tree({ ".git/HEAD": "ref: refs/heads/main\n", "a.md": "# A\n", "b.png": "png\n" });
    const before = listFolder(repo, DEFAULT_CONFIG.walk, false);
    expect(before.notes).toBe(false);
    // `.slipbox/` given it: hidden, nothing of its entries changes — but which of its files the explorer lists does.
    mkdirSync(join(repo, ".slipbox"));
    writeFileSync(join(repo, ".slipbox", "config.toml"), "");
    const after = listFolder(repo, DEFAULT_CONFIG.walk, false);
    expect(after.entries).toEqual(before.entries);
    expect(after.notes).toBe(true);
    expect(after.digest).not.toBe(before.digest);
  });

  test("a folder whose listing fails says why in its row, in the words `l` says it in", async () => {
    if (process.getuid?.() === 0) return; // root reads every folder
    setWalkWorker(slowWorker);
    const { top, h } = await besideSlow();
    const ex = h.app.explorer;
    const quick = join(top, "quick");
    ex.expanded.add(quick);
    await listed(h);
    expect(names(h)).toContain("  q.md");
    chmodSync(quick, 0o000);
    try {
      ex.listings.stale(quick);
      await listed(h);
      expect(names(h)).toContain("  can't read: you may not read it (no permission)");
    } finally {
      chmodSync(quick, 0o755);
    }
  });

  test("a folder refused for no permission is read again, nothing else in its folder: once you may, it unfolds", async () => {
    if (process.getuid?.() === 0) return; // root reads every folder
    setWalkWorker(slowWorker);
    const { top, h } = await besideSlow();
    const ex = h.app.explorer;
    const quick = join(top, "quick");
    const slow = join(top, "slow");
    ex.expanded.add(slow);
    await listed(h);
    const asked = spyOn(listThreads(), "list");
    chmodSync(quick, 0o000);
    try {
      ex.listings.again(top);
      await listed(h);
      h.app.region = "sidebar";
      h.app.sidebar.selected = ex.rows().findIndex((r) => r.name === "quick");
      await ex.action("expand");
      expect(h.app.messages.at(-1)?.text).toBe(`can't read ${tildePath(quick)}: you may not read it (no permission)`);
      expect(ex.expanded.has(quick)).toBe(false);
    } finally {
      chmodSync(quick, 0o755);
    }
    // Let in: its folder's listing read again since the refusal, `l` unfolds it — `slow`, beside it, never read again.
    await listed(h);
    expect(asked.mock.calls.map((c) => c[0])).toEqual([top, top]);
    asked.mockRestore();
    h.app.sidebar.selected = ex.rows().findIndex((r) => r.name === "quick");
    await ex.action("expand");
    expect(ex.expanded.has(quick)).toBe(true);
    await listed(h);
    expect(names(h)).toContain("  q.md");
  });

  test("a folder that couldn't be listed is read again a minute later, not at every rebuild", async () => {
    const top = tree({ "vault/.slipbox/config.toml": "", "vault/index.md": "# Index\n" });
    const h = await harness({ root: join(top, "vault") });
    h.app.explorer.listings = new Listings(h.app, true);
    const ex = h.app.explorer;
    const gone = join(top, "gone");
    ex.listings.get(gone);
    while (ex.listings.reading) await Bun.sleep(5);
    expect(ex.listings.get(gone)?.error).toBe("ENOENT");
    mkdirSync(gone);
    await Bun.sleep(REREAD_MS + 100);
    // Older than a listing is kept as it is, but it failed: not asked again yet.
    expect(ex.listings.get(gone)?.error).toBe("ENOENT");
    expect(ex.listings.reading).toBe(false);
    // Asked for on purpose (a file operation, a folder moved): read again.
    ex.listings.stale(gone);
    ex.listings.get(gone);
    while (ex.listings.reading) await Bun.sleep(5);
    expect(ex.listings.get(gone)?.error).toBeNull();
  });

  test("a listing thread held up on a folder that doesn't answer: the folders listed next go to the other, never behind it", async () => {
    setWalkWorker(slowWorker);
    const top = tree({ "stuck/s.md": "# S\n", "one/a.md": "# A\n", "two/b.md": "# B\n" });
    const threads = listThreads();
    await Promise.all([0, 1].map(() => threads.list(top, DEFAULT_CONFIG.walk, false)));
    // Asked at once after it: none of them sent behind it, whichever thread it's on.
    const at = performance.now();
    const stuck = threads.list(join(top, "stuck"), DEFAULT_CONFIG.walk, false);
    await Promise.all(["one", "two"].map((d) => threads.list(join(top, d), DEFAULT_CONFIG.walk, false)));
    expect(performance.now() - at).toBeLessThan(STUCK_MS / 3);
    await stuck;
  });

  test("the listing threads stopped: a listing asked just before is refused, no thread started again for it", async () => {
    let started = 0;
    const threads = new ListThreads(() => {
      started++;
      return slowWorker();
    });
    const asked = threads.list(tree({ "a.md": "# A\n" }), DEFAULT_CONFIG.walk, false);
    threads.stop();
    await expect(asked).rejects.toThrow("cancelled");
    expect(started).toBe(0);
  });

  test("a `listing…` row answers moving and folding alone: nothing copied, opened or zoomed into", async () => {
    setWalkWorker(slowWorker);
    const { top, h } = await besideSlow();
    const ex = h.app.explorer;
    const slow = join(top, "slow");
    ex.expanded.add(slow);
    ex.invalidateTree();
    ex.treeRows();
    await Bun.sleep(PENDING_MS + 50);
    h.app.region = "sidebar";
    h.app.sidebar.selected = ex.rows().findIndex((r) => r.placeholder);
    expect(ex.rows()[h.app.sidebar.selected]?.name).toBe("listing…");
    for (const a of ["copy_path", "zoom_in", "open", "open_tab", "expand", "rename", "delete", "menu"])
      await ex.action(a);
    expect(h.copied).toEqual([]);
    expect(ex.top).toBe(top);
    expect(h.app.overlay).toBeNull();
    // What doesn't act on the row does as on any row of its folder: said, never dropped.
    for (const a of ["new_note", "new_folder", "restore", "undo_rename", "paste"]) {
      const said = h.app.messages.length;
      await ex.action(a);
      expect([a, h.app.messages.length > said || h.app.overlay !== null]).toEqual([a, true]);
      h.app.overlay = null;
    }
    // Folded: the folder it's listed in.
    await ex.action("collapse");
    expect(ex.expanded.has(slow)).toBe(false);
    while (ex.listings.reading) await Bun.sleep(5);
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
