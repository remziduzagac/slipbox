import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, realpathSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { DEFAULT_CONFIG } from "../../../../../src/core/application/config/config.ts";
import { type Graph, openGraph } from "../../../../../src/core/workspace/graph/graph.ts";
import { homeAt } from "../../../../../src/core/workspace/vaults/vault.ts";

import { walkHomeNow } from "../../../../../src/core/workspace/vaults/home.ts";

import { makeVaultSandbox } from "../../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("home, a vault without a marker (VV-D2)", () => {
  /**
   * A watcher over home as the TUI starts one over its graph `g` (its folders, `leftToWalk`), and a look: a tick, its
   * batch and the events' settled — what they reported (by path, or `kind path` with `kinds`), the folders they named
   * for the walk, whether they asked for a rescan.
   */
  const watchHome = async (
    home: string,
    g: Graph,
    opts: { known?: Map<string, number>; sizes?: Map<string, number>; maxDirs?: number; kinds?: boolean } = {},
  ) => {
    const { VaultWatcher } = await import("../../../../../src/core/workspace/graph/watch.ts");
    const reported: string[] = [];
    const toWalk: string[] = [];
    let rescan = false;
    /** The watcher's clock, set ahead to make what was just done look long ago. */
    const clock = { ahead: 0 };
    const w = new VaultWatcher({
      root: home,
      filter: g.filter,
      dirs: g.dirs,
      debounceMs: 20,
      pollMs: 1_000_000,
      known: opts.known ?? new Map([...g.notes.values()].map((n) => [n.rel, n.mtimeMs] as [string, number])),
      ...(opts.sizes ? { sizes: opts.sizes } : {}),
      ...(opts.maxDirs === undefined ? {} : { maxDirs: opts.maxDirs }),
      attachments: g.filePaths(),
      walkedAt: () => g.walkedAt,
      leftToWalk: (rel) => g.waitsForHomeWalk(rel),
      walkPending: () => g.home?.walked === null,
      now: () => Date.now() + clock.ahead,
      onBatch: (b) => {
        reported.push(...b.changes.map((c) => (opts.kinds ? `${c.kind} ${c.rel}` : c.rel)));
        toWalk.push(...(b.toWalk ?? []));
        rescan ||= b.rescan;
      },
      onDegraded: () => {},
    });
    const look = async () => {
      await Bun.sleep(30);
      w.pollTick();
      w.flush();
      await Bun.sleep(30);
      w.flush();
      const out = { reported: [...new Set(reported.splice(0))].sort(), toWalk: [...new Set(toWalk.splice(0))], rescan };
      rescan = false;
      return out;
    };
    return { w, look, reported, clock };
  };
  const none = { reported: [], toWalk: [], rescan: false };
  /** A home folder of its own: `files` in it, `$HOME` while `f` runs. */
  const withHome = async <T>(files: Record<string, string>, f: (home: string) => T | Promise<T>): Promise<T> => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-vhome-")));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(home, rel)), { recursive: true });
      writeFileSync(join(home, rel), text);
    }
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      return await f(home);
    } finally {
      process.env.HOME = before;
    }
  };

  test("what comes while home is open holds its cap: past it, a folder isn't taken in, nor a note — left to home's walk", async () => {
    const { VaultWatcher } = await import("../../../../../src/core/workspace/graph/watch.ts");
    const { WalkFilter } = await import("../../../../../src/core/workspace/walk/walk.ts");
    const { applyToGraph } = await import("../../../../../src/core/workspace/vaults/vault-feed.ts");
    await withHome({ "a.md": "# A\n" }, (home) => {
      for (let i = 0; i < 6; i++) mkdirSync(join(home, "big", `d${i}`), { recursive: true });
      const w = new VaultWatcher({
        root: home,
        filter: new WalkFilter(home, DEFAULT_CONFIG.walk, { home: true }),
        dirs: [""],
        debounceMs: 20,
        known: new Map(),
        onBatch: () => {},
        onDegraded: () => {},
        maxDirs: 3,
      });
      try {
        (w as unknown as { adoptTree(d: string): string[] }).adoptTree("big");
        expect(w.watchedCount + w.polledDirs.length).toBe(3);
      } finally {
        w.close();
      }
      walkHomeNow(homeAt(home), DEFAULT_CONFIG);
      const g = openGraph(homeAt(home), DEFAULT_CONFIG, true, "lazy");
      for (const n of ["b.md", "c.md", "d.md"]) writeFileSync(join(home, n), "# N\n");
      const created = (rel: string) => ({ rel, kind: "created" as const, isNote: true });
      applyToGraph(g, { changes: ["b.md", "c.md", "d.md"].map(created), rescan: false }, 1e9, 2);
      expect([...g.notes.keys()].sort()).toEqual(["a.md", "b.md"]);
    });
  });

  test("before home's first walk, the watcher looks into no folder its graph hasn't: a folder in one is the walk's, one come into home's top is listed for it; in a folder asked for, or home walked, a folder is taken in (#16)", async () => {
    const { HOME_LIMITS } = await import("../../../../../src/core/workspace/walk/walk.ts");
    const { applyToGraph } = await import("../../../../../src/core/workspace/vaults/vault-feed.ts");
    const files: Record<string, string> = { "a.md": "# A\n", "Documents/top.md": "# Top\n", "touched/t.md": "# T\n" };
    for (const top of ["Documents", "touched", "notes"])
      for (const d of ["d0", "d1"]) files[`${top}/${d}/sub/n.md`] = "# N\n";
    await withHome(files, async (home) => {
      // A person's folders, dated back; touched/ changed in the two seconds before the watcher starts.
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "Documents", "notes", "notes/d0", "notes/d1"]) utimesSync(join(home, d), hour, hour);
      const g = openGraph(homeAt(home), DEFAULT_CONFIG, true, "lazy");
      g.askFolders([join(home, "notes")]); // `slipbox ~/notes`: walked whole
      expect(g.home?.walked).toBeNull();
      const known = new Map([...g.notes.values()].map((n) => [n.rel, n.mtimeMs] as [string, number]));
      // touched/ changed just now, however long the setup took: inside the two seconds the watcher looks again.
      const now = new Date();
      utimesSync(join(home, "touched"), now, now);
      const { w, look } = await watchHome(home, g, { known, maxDirs: HOME_LIMITS.folders });
      try {
        // touched/ listed again at once: its own note comes, its folders are the walk's.
        expect(await look()).toEqual({ ...none, reported: ["touched/t.md"] });
        // A shell's history rewritten in ~, by a file put in its place: nothing taken in, nothing named.
        writeFileSync(join(home, ".zsh_history.new"), "ls\n");
        renameSync(join(home, ".zsh_history.new"), join(home, ".zsh_history"));
        expect(await look()).toEqual(none);
        // A file saved in Documents: the same — nothing a folder down, nothing named (the walk takes them).
        writeFileSync(join(home, "Documents", "letter.txt"), "Dear…\n");
        expect(await look()).toEqual({ ...none, reported: ["Documents/letter.txt", "Documents/top.md"] });
        // A folder come into home's top: left to the walk, named once for the graph to list — no note came with it —
        // then watched, as the TUI does, never looked into.
        mkdirSync(join(home, "cloned", "x", "y"), { recursive: true });
        writeFileSync(join(home, "cloned", "x", "y", "deep.md"), "# Deep\n");
        expect(await look()).toEqual({ ...none, toWalk: ["cloned"] });
        expect(await look()).toEqual(none);
        const notes = [...g.notes.keys()];
        expect(applyToGraph(g, { changes: [], rescan: false, toWalk: ["cloned"] }, 1e9).structural).toBe(false);
        expect(g.dirs).toContain("cloned");
        expect([...g.notes.keys()]).toEqual(notes); // listed, nothing built again
        w.watchNamed(["cloned"], () => true);
        writeFileSync(join(home, "cloned", "own.md"), "# Own\n");
        expect(await look()).toEqual({ ...none, reported: ["cloned/own.md"] });
        // One gone before it's watched, and made again: new, named again.
        mkdirSync(join(home, "brief"));
        expect(await look()).toEqual({ ...none, toWalk: ["brief"] });
        rmSync(join(home, "brief"), { recursive: true });
        expect(await look()).toEqual(none);
        mkdirSync(join(home, "brief"));
        expect(await look()).toEqual({ ...none, toWalk: ["brief"] });
        // A known note gone as a folder comes into home's top: none went there, so it's named, not read.
        rmSync(join(home, "a.md"));
        mkdirSync(join(home, "bulk", "x"), { recursive: true });
        writeFileSync(join(home, "bulk", "x", "n.md"), "# N\n");
        expect(await look()).toEqual({ ...none, reported: ["a.md"], toWalk: ["bulk"] });
        // Listed as the walk would take it when the batch is applied (held while git wrote): one gone since, or become a
        // vault, isn't. A vault come into home's top is never named.
        mkdirSync(join(home, "vaulted", ".slipbox"), { recursive: true });
        expect(await look()).toEqual(none);
        applyToGraph(g, { changes: [], rescan: false, toWalk: ["gone", "vaulted"] }, 1e9);
        expect(g.dirs).not.toContain("gone");
        expect(g.dirs).not.toContain("vaulted");
        // One listed before, a vault since (gone and made again while git wrote): not listed, nor watched, again.
        mkdirSync(join(home, "cloned", ".slipbox"));
        expect(applyToGraph(g, { changes: [], rescan: false, toWalk: ["cloned"] }, 1e9).listed).toEqual([]);
        // A folder left to the walk, gone: nothing to say — it was never a file.
        rmSync(join(home, "Documents", "d1"), { recursive: true });
        expect(await look()).toEqual(none);
        // A folder made in one asked for, which is whole: taken in at once.
        mkdirSync(join(home, "notes", "d0", "fresh"));
        writeFileSync(join(home, "notes", "d0", "fresh", "f.md"), "# F\n");
        expect((await look()).reported).toEqual(["notes/d0/fresh/f.md"]);
        // The folder asked for renamed: its notes found where they went, by their time and size; the folder, come into
        // home's top, named.
        renameSync(join(home, "notes"), join(home, "zettel"));
        const renamed = await look();
        expect(renamed.reported.filter((r) => r.endsWith(".md"))).toEqual([
          "notes/d0/fresh/f.md",
          "notes/d0/sub/n.md",
          "notes/d1/sub/n.md",
          "zettel/d0/fresh/f.md",
          "zettel/d0/sub/n.md",
          "zettel/d1/sub/n.md",
        ]);
        expect(renamed.toWalk).toEqual(["zettel"]);
        // Home walked: a folder that comes is taken in, as in a vault.
        walkHomeNow(homeAt(home), DEFAULT_CONFIG);
        g.build(true, "lazy");
        expect(g.home?.walked).not.toBeNull();
        expect(g.waitsForHomeWalk("Documents")).toBe(false);
        w.sync(g.dirs, new Map([...g.notes.values()].map((n) => [n.rel, n.mtimeMs] as [string, number])));
        await look();
        mkdirSync(join(home, "Documents", "d9", "sub"), { recursive: true });
        writeFileSync(join(home, "Documents", "d9", "sub", "z.md"), "# Z\n");
        expect((await look()).reported).toEqual(["Documents/d9/sub/z.md"]);
      } finally {
        w.close();
      }
    });
  });

  test("before home's first walk, a folder of home polled (its watch failed) is listed at every tick: its folders the walk's, never named; one come into home's top named once, then watched (#16)", async () => {
    const files: Record<string, string> = { "a.md": "# A\n", "Documents/top.md": "# Top\n" };
    for (const d of ["d0", "d1"]) files[`Documents/${d}/sub/n.md`] = "# N\n";
    await withHome(files, async (home) => {
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "Documents"]) utimesSync(join(home, d), hour, hour);
      const g = openGraph(homeAt(home), DEFAULT_CONFIG, true, "lazy");
      const known = new Map([...g.notes.values()].map((n) => [n.rel, n.mtimeMs] as [string, number]));
      // Documents' own note known, as when it came by its event.
      known.set("Documents/top.md", statSync(join(home, "Documents", "top.md")).mtimeMs);
      // home's cap, as if three folders were all it may watch
      const { w, look } = await watchHome(home, g, { known, maxDirs: 3 });
      // Home's top and Documents polled alone: their watches closed, as when they fail.
      const inside = w as unknown as {
        watchers: Map<string, { close(): void }>;
        pollDir(d: string, r: string): void;
        degrade(r: string): void;
        pending: Set<string>;
      };
      for (const d of ["", "Documents"]) {
        inside.watchers.get(d)?.close();
        inside.watchers.delete(d);
        inside.pollDir(d, "EACCES: test");
      }
      try {
        expect(w.polledDirs.sort()).toEqual(["", "Documents"]);
        // Its folders found at every tick, the walk's each time: nothing taken in, nothing named, no rescan.
        expect(await look()).toEqual(none);
        // An event naming Documents, polled: never named for the walk, its place in home's top though it is.
        inside.pending.add("Documents");
        w.flush();
        expect(await look()).toEqual(none);
        mkdirSync(join(home, "Documents", "d2"));
        writeFileSync(join(home, "Documents", "d2", "m.md"), "# M\n");
        expect(await look()).toEqual(none);
        expect(await look()).toEqual(none);
        // Its note moved into a folder made in it, seen by the listing alone: where it went is taken in, the move seen.
        mkdirSync(join(home, "Documents", "new"));
        renameSync(join(home, "Documents", "top.md"), join(home, "Documents", "new", "top.md"));
        expect(await look()).toEqual({ ...none, reported: ["Documents/new/top.md", "Documents/top.md"] });
        // A folder come into home's top, found by its listing: named once, not again before it's watched; watched, a
        // note in it comes. Named, it holds its room under home's cap: one more come meanwhile isn't named.
        mkdirSync(join(home, "cloned", "z"), { recursive: true });
        writeFileSync(join(home, "cloned", "z", "deep.md"), "# Deep\n");
        expect(await look()).toEqual({ ...none, toWalk: ["cloned"] });
        expect(await look()).toEqual(none);
        mkdirSync(join(home, "spare"));
        expect(await look()).toEqual(none);
        w.watchNamed(["cloned"], () => true);
        writeFileSync(join(home, "cloned", "own.md"), "# Own\n");
        expect(await look()).toEqual({ ...none, reported: ["cloned/own.md"] });
        // Home's cap reached (three folders): another isn't named, nor watched if asked — the walk, which holds the cap,
        // has it.
        mkdirSync(join(home, "more"));
        expect(await look()).toEqual(none);
        w.watchNamed(["more"], () => true);
        expect(w.watchedCount).toBe(1);
        // Watching degraded (the system's limit): nothing watched, the folders still found at every tick — none named.
        inside.degrade("ENOSPC: test");
        expect(await look()).toEqual(none);
        expect(await look()).toEqual(none);
      } finally {
        w.close();
      }
    });
  });
});
