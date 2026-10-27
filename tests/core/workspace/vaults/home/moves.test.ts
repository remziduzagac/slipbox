import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { DEFAULT_CONFIG } from "../../../../../src/core/application/config/config.ts";
import { type Graph, openGraph } from "../../../../../src/core/workspace/graph/graph.ts";

import { homeAt } from "../../../../../src/core/workspace/vaults/vault.ts";

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

  test("before home's first walk, a folder a known note was moved into is taken in, found by its time and size; never for a note of the same name, nor through a link it doesn't follow (#16)", async () => {
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-outside-")));
    mkdirSync(join(outside, "deep"));
    writeFileSync(join(outside, "a.md"), "# A\n");
    writeFileSync(join(outside, "deep", "far.md"), "# Far\n");
    const files = {
      "a.md": "# A\n",
      "index.md": "# Home\n",
      "Documents/keep.md": "# Keep\n",
      "Documents/README.md": "# Read me\n",
      "Documents/proj/old.md": "# Old\n",
      "Projects/p.md": "# P\n",
      "Projects/deep/sub/x.md": "# X\n",
      "Documents/orig.md": "# Orig\n",
      "Documents/backup/orig.md": "# Orig\n",
      "Archive/a1.md": "# Archived\n",
      "Documents/archive-bak/a1.md": "# Archived\n",
      "Documents/spare.md": "# Spare\n",
    };
    await withHome(files, async (home) => {
      const hour = new Date(Date.now() - 3_600_000);
      // A copy made with its times kept (`cp -p`), in a folder left as it was since.
      for (const f of ["Documents/orig.md", "Documents/backup/orig.md", "Archive/a1.md", "Documents/archive-bak/a1.md"])
        utimesSync(join(home, f), hour, hour);
      for (const d of ["", "Documents", "Documents/proj", "Documents/backup", "Documents/archive-bak", "Projects"])
        utimesSync(join(home, d), hour, hour);
      const g = openGraph(homeAt(home), DEFAULT_CONFIG, true, "lazy");
      const known = new Map([...g.notes.values()].map((n) => [n.rel, n.mtimeMs] as [string, number]));
      // The top folders' own notes known, as when they came by their events.
      for (const rel of [
        "Documents/keep.md",
        "Documents/README.md",
        "Projects/p.md",
        "Documents/orig.md",
        "Archive/a1.md",
        "Documents/spare.md",
      ])
        known.set(rel, statSync(join(home, rel)).mtimeMs);
      const sizes = new Map([...known.keys()].map((rel) => [rel, statSync(join(home, rel)).size] as [string, number]));
      const { w, look, reported, clock } = await watchHome(home, g, { known, sizes, kinds: true });
      const inside = w as unknown as {
        lookAgain(moved: [string, number][], at: number): void;
        pending: Set<string>;
        leftSeen: Map<string, number>;
      };
      try {
        await look();
        // A note moved under another name into a folder made in Documents: found at its top, by its time and size.
        mkdirSync(join(home, "Documents", "new"));
        renameSync(join(home, "a.md"), join(home, "Documents", "new", "b.md"));
        expect(await look()).toEqual({ ...none, reported: ["created Documents/new/b.md", "deleted a.md"], toWalk: [] });
        // Moved on from there, into another folder made in Documents: Documents/new unwatched, the note followed into it
        // is looked at every tick, so it's seen to go, and followed again.
        mkdirSync(join(home, "Documents", "again"));
        renameSync(join(home, "Documents", "new", "b.md"), join(home, "Documents", "again", "c.md"));
        expect(await look()).toEqual({
          ...none,
          reported: ["created Documents/again/c.md", "deleted Documents/new/b.md"],
        });
        // A known note gone as a folder comes into home's top holding one of the same name, another file: named, not
        // read.
        rmSync(join(home, "index.md"));
        mkdirSync(join(home, "bulk", "x"), { recursive: true });
        writeFileSync(join(home, "bulk", "index.md"), "# Another index, nothing to do with home's\n");
        writeFileSync(join(home, "bulk", "x", "n.md"), "# N\n");
        expect(await look()).toEqual({ ...none, reported: ["deleted index.md"], toWalk: ["bulk"] });
        // A known note moved into a folder that was there: its event says it went, and the second look a tick later
        // finds the folder — it's found there, the rest of the folder left to the walk.
        // (Documents dated back, so it settles, and what second looks found in it is forgotten.)
        utimesSync(join(home, "Documents"), hour, hour);
        for (let n = 0; n < 3; n++) await look();
        renameSync(join(home, "Documents", "README.md"), join(home, "Documents", "proj", "moved.md"));
        await Bun.sleep(30);
        w.flush(); // its event's batch first: README.md went
        expect(await look()).toEqual({
          ...none,
          reported: ["created Documents/proj/moved.md", "deleted Documents/README.md"],
          toWalk: [],
        });
        // A known note deleted, its copy kept in a folder unchanged since: no move. (The watcher's clock a minute ahead:
        // the copy, made a moment ago, as if made long before.)
        clock.ahead = 60_000;
        rmSync(join(home, "Documents", "orig.md"));
        expect(await look()).toEqual({ ...none, reported: ["deleted Documents/orig.md"] });
        // A folder moved out of home, a copy of it kept with its times (`cp -a`) in a folder a second look finds: no move —
        // though another note went a moment before, as the copy's folder was made (the clock as it is for that one).
        clock.ahead = 0;
        rmSync(join(home, "Documents", "spare.md"));
        await Bun.sleep(30);
        w.flush();
        clock.ahead = 60_000;
        mkdirSync(join(home, "Documents", "tick")); // Documents listed again: archive-bak found
        renameSync(join(home, "Archive"), join(outside, "Archive"));
        const deleted = await look();
        expect(deleted.reported.filter((r) => r.endsWith(".md"))).toEqual([
          "deleted Archive/a1.md",
          "deleted Documents/spare.md",
        ]);
        clock.ahead = 0;
        // A top folder renamed: its known notes found under the new name, nothing deeper read; the folder named.
        renameSync(join(home, "Projects"), join(home, "Work"));
        const renamed = await look();
        // (Bun says the watched folder itself went, as a file of it: `Projects/Projects`, on dev too.)
        expect(renamed.reported.filter((r) => r.endsWith(".md"))).toEqual([
          "created Work/p.md",
          "deleted Projects/p.md",
        ]);
        expect(renamed.toWalk).toEqual(["Work"]);
        // A folder a second look left, become a link out of home that isn't followed, and a known note moved where it
        // leads: never read through.
        mkdirSync(join(home, "Documents", "later"));
        await look();
        inside.lookAgain([["Documents", 1]], Date.now());
        inside.pending.clear();
        expect([...inside.leftSeen.keys()]).toContain("Documents/later");
        rmSync(join(home, "Documents", "later"), { recursive: true });
        symlinkSync(outside, join(home, "Documents", "later"));
        renameSync(join(home, "Documents", "keep.md"), join(outside, "keep.md"));
        inside.pending.add("Documents/keep.md");
        w.flush();
        expect([...new Set(reported.splice(0))]).toEqual(["deleted Documents/keep.md"]);
      } finally {
        w.close();
      }
    });
  });

  test("before home's first walk, a move is followed whatever its batches: a folder's ends in two, a note's gone found only by the batch's last look; never into a vault made in it (#16)", async () => {
    const files = {
      "a.md": "# A\n",
      "kept/inbox.md": "# Inbox\n",
      "kept/sub/deep.md": "# Deep\n",
      "kept/sub/table.csv": "a,b\n",
      "fifth/inbox.md": "# Fifth\n",
      "fifth/sub/deep.md": "# Fifth deep\n",
      "held/inbox.md": "# Held\n",
      "held/sub/deep.md": "# Held deep\n",
      "third/old.md": "# Old\n",
      "third/inbox.md": "# Third\n",
      "third/sub/deep.md": "# Third deep\n",
    };
    await withHome(files, async (home) => {
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "kept", "kept/sub", "held", "held/sub", "third", "third/sub", "fifth", "fifth/sub"])
        utimesSync(join(home, d), hour, hour);
      const g = openGraph(homeAt(home), DEFAULT_CONFIG, true, "lazy");
      // Both asked for by name: walked whole, their notes known.
      g.askFolders([join(home, "kept")]);
      g.askFolders([join(home, "held")]);
      g.askFolders([join(home, "third")]);
      g.askFolders([join(home, "fifth")]);
      const known = new Map([...g.notes.values()].map((n) => [n.rel, n.mtimeMs] as [string, number]));
      const sizes = new Map([...known.keys()].map((rel) => [rel, statSync(join(home, rel)).size] as [string, number]));
      const { w, look, reported } = await watchHome(home, g, { known, sizes, kinds: true });
      const inside = w as unknown as { pending: Set<string> };
      /** A batch of these paths alone, before any event of theirs comes: what it reported. */
      const batch = (...paths: string[]) => {
        for (const p of paths) inside.pending.add(p);
        w.flush();
        return [...new Set(reported.splice(0))].sort();
      };
      try {
        await look();
        // A folder renamed, the batch saying it went before the one finding where: its notes followed, a folder down too,
        // and the other files known in it (a table a note links).
        renameSync(join(home, "kept"), join(home, "zettel"));
        expect(batch("kept")).toEqual([
          "deleted kept/inbox.md",
          "deleted kept/sub/deep.md",
          "deleted kept/sub/table.csv",
        ]);
        expect(batch("zettel")).toEqual([
          "created zettel/inbox.md",
          "created zettel/sub/deep.md",
          "created zettel/sub/table.csv",
        ]);
        await look();
        reported.length = 0;
        // A note moved under another name into a folder made, the batch naming the folder alone: the batch's last look
        // finds it went, and it's followed.
        mkdirSync(join(home, "dest"));
        renameSync(join(home, "a.md"), join(home, "dest", "b.md"));
        expect(batch("dest")).toEqual(["created dest/b.md", "deleted a.md"]);
        await look();
        reported.length = 0;
        // A folder renamed, a vault made in it before the batch: what's in the vault is never home's.
        renameSync(join(home, "held"), join(home, "kept2"));
        mkdirSync(join(home, "kept2", "sub", ".slipbox"));
        expect(batch("held", "kept2")).toEqual([
          "created kept2/inbox.md",
          "deleted held/inbox.md",
          "deleted held/sub/deep.md",
        ]);
        await look();
        reported.length = 0;
        // A note of a folder deleted alone, and the folder renamed a moment later: the rest of its notes followed.
        rmSync(join(home, "third", "old.md"));
        expect(batch("third/old.md")).toEqual(["deleted third/old.md"]);
        renameSync(join(home, "third"), join(home, "fourth"));
        expect(batch("third", "fourth")).toEqual([
          "created fourth/inbox.md",
          "created fourth/sub/deep.md",
          "deleted third/inbox.md",
          "deleted third/sub/deep.md",
        ]);
        // A folder renamed, the batch finding the new name first — named, and watched, as the TUI does — and the one
        // saying the old went after: its notes followed all the same.
        renameSync(join(home, "fifth"), join(home, "sixth"));
        expect(batch("sixth")).toEqual([]);
        w.watchNamed(["sixth"], () => true);
        expect(batch("fifth")).toEqual([
          "created sixth/inbox.md",
          "created sixth/sub/deep.md",
          "deleted fifth/inbox.md",
          "deleted fifth/sub/deep.md",
        ]);
      } finally {
        w.close();
      }
    });
  });

  test("before home's first walk, the folder opened by name renamed while home's top is polled: its notes followed (#16)", async () => {
    const files = { "a.md": "# A\n", "kept/inbox.md": "# Inbox\n", "kept/sub/deep.md": "# Deep\n" };
    await withHome(files, async (home) => {
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "kept", "kept/sub"]) utimesSync(join(home, d), hour, hour);
      const g = openGraph(homeAt(home), DEFAULT_CONFIG, true, "lazy");
      g.askFolders([join(home, "kept")]);
      const known = new Map([...g.notes.values()].map((n) => [n.rel, n.mtimeMs] as [string, number]));
      const sizes = new Map([...known.keys()].map((rel) => [rel, statSync(join(home, rel)).size] as [string, number]));
      const { w, look } = await watchHome(home, g, { known, sizes, kinds: true });
      // Home's top polled alone, its watch closed as when it fails: its listing finds the new name.
      const inside = w as unknown as { watchers: Map<string, { close(): void }>; pollDir(d: string, r: string): void };
      inside.watchers.get("")?.close();
      inside.watchers.delete("");
      inside.pollDir("", "EACCES: test");
      try {
        expect(await look()).toEqual(none);
        renameSync(join(home, "kept"), join(home, "zettel"));
        const renamed = await look();
        expect(renamed.reported.filter((r) => r.endsWith(".md"))).toEqual([
          "created zettel/inbox.md",
          "created zettel/sub/deep.md",
          "deleted kept/inbox.md",
          "deleted kept/sub/deep.md",
        ]);
        expect(renamed.toWalk).toEqual(["zettel"]);
        // Found again at every tick, not watched yet: named once.
        expect(await look()).toEqual(none);
      } finally {
        w.close();
      }
    });
  });
});
