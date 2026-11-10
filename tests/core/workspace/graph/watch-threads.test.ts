// The watcher's looks asked of the disk threads (SD-T3, SD-D5, SD-D6, SD-D8): one out at a time; an answer compared with
// what's known when it comes — dropped once the watcher was synced to a build since, a path we wrote since settled
// again; a look the disk doesn't answer in time said once, the looks paused a minute, cleared by the next answer; and
// home's notes moved into a folder left to its walk found there by a listing on a thread. What waits is told by the
// hold (`Hold`, this thread's reads too), never by a clock (#75).

import { afterEach, describe, expect, setDefaultTimeout, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { setReadWait } from "../../../../src/core/foundation/platform/disk.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { VaultWatcher, type WatcherOptions } from "../../../../src/core/workspace/graph/watch.ts";
import { homeAt } from "../../../../src/core/workspace/vaults/vault.ts";
import { WalkFilter } from "../../../../src/core/workspace/walk/walk.ts";
import { diskThreads, setWalkWorker, WALK_DEADLINES } from "../../../../src/core/workspace/walk/walk-thread.ts";
import { HELD_MS, Hold, heldReads } from "../../../fixtures/walk/slow.ts";
import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";
import { watcherBusy, watcherState } from "../../../support/watcher-access.ts";

setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

/** A folder of `files` (path → text), by its real path. */
function tree(files: Record<string, string>): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-watch-threads-")));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

let hold: Hold | null = null;

/** A hold on the `held` folders, on the disk threads and this one (SD-D10's note), let go of at first. */
function holding(): Hold {
  const held = new Hold();
  hold = held;
  held.release();
  threadsFor(held);
  setReadWait(heldReads);
  return held;
}

/** The disk threads started afresh on `held`'s worker, a look's deadline `deadline` (ms), else the test threads' own:
 *  short only while a look is meant to give up, so a thread slow to start never fails one meant to answer. */
function threadsFor(held: Hold, deadline?: number): void {
  const worker = () => {
    const w = held.worker();
    w.postMessage({ holdReads: true });
    return w;
  };
  setWalkWorker(worker, deadline === undefined ? undefined : { ...WALK_DEADLINES, whole: deadline });
}

afterEach(() => {
  hold?.release();
  hold = null;
  setReadWait(null);
  setWalkWorker(null);
});

async function until(what: string, ok: () => boolean): Promise<void> {
  const end = performance.now() + HELD_MS;
  while (!ok()) {
    if (performance.now() > end) throw new Error(`never: ${what}`);
    await Bun.sleep(5);
  }
}

const untilHeld = (held: Hold) => until("a disk thread waits in `held`", () => held.waiting > 0);

/** Each note's stamp and size in `root`, as a build knows them. */
function knownIn(root: string, rels: string[]) {
  const st = (rel: string) => statSync(join(root, rel));
  return {
    known: new Map(rels.map((rel) => [rel, st(rel).mtimeMs] as [string, number])),
    sizes: new Map(rels.map((rel) => [rel, st(rel).size] as [string, number])),
  };
}

/**
 * A watcher over `root`'s folders `dirs`, its looks on the disk threads, as the TUI's: no tick nor flush but the test's;
 * what it said, by `kind rel`; once each folder is stamped.
 */
async function watching(root: string, dirs: string[], notes: string[], more: Partial<WatcherOptions> = {}) {
  const said: string[] = [];
  const { known, sizes } = knownIn(root, notes);
  const w = new VaultWatcher({
    root,
    filter: new WalkFilter(root, DEFAULT_CONFIG.walk),
    dirs,
    debounceMs: 3_600_000,
    pollMs: 3_600_000,
    known,
    sizes,
    offThread: true,
    onBatch: (b) => said.push(...b.changes.map((c) => `${c.kind} ${c.rel}`)),
    onDegraded: () => {},
    ...more,
  });
  const state = watcherState(w);
  await until("each folder stamped", () => [...state.watchers.keys()].every((d) => state.stamps.has(d)));
  return { w, state, said, known };
}

/** Awaited till nothing the watcher asked is out. */
const quiet = (w: VaultWatcher) => until("the watcher's looks answered", () => !watcherBusy(w));

describe("the watcher's looks on the disk threads (SD-T3)", () => {
  test("a save of ours while a look is out isn't taken for a change: the path is settled again, our write seen", async () => {
    const held = holding();
    const root = tree({ "n.md": "# N\n", "held/x.md": "# X\n" });
    const { w, state, said } = await watching(root, ["", "held"], ["n.md", "held/x.md"]);
    try {
      // The settle's stats: `n.md` read at once, then the look waits on `held`.
      state.pending.add("n.md");
      state.pending.add("held/x.md");
      held.again();
      w.flush();
      await untilHeld(held);
      // Saved meanwhile, after its stat was read: told as ours.
      const file = join(root, "n.md");
      writeFileSync(file, "# N, saved here\n");
      const later = new Date(Date.now() + 5000);
      utimesSync(file, later, later);
      const st = statSync(file);
      w.noteOwnWrite("n.md", { mtimeMs: st.mtimeMs, size: st.size });
      held.release();
      await quiet(w);
      expect(said).toEqual([]);
      expect(state.pending.has("n.md")).toBe(true);
      // Settled again, read since: our own write, seen once.
      w.flush();
      await quiet(w);
      expect(said).toEqual([]);
      expect(state.ownWrites.has("n.md")).toBe(false);
    } finally {
      w.close();
    }
  });

  test("an answer from before a sync (a build meanwhile) is dropped, what it settled settled again against the build", async () => {
    const held = holding();
    const root = tree({ "a.md": "# A\n", ".gitignore": "", "held/x.md": "# X\n" });
    const { w, state, said } = await watching(root, ["", "held"], ["a.md", "held/x.md"]);
    try {
      // `a.md` gone as the settle reads it; the stats after the `.gitignore` wait on `held`.
      rmSync(join(root, "a.md"));
      for (const rel of ["a.md", ".gitignore", "held/x.md"]) state.pending.add(rel);
      held.again();
      w.flush();
      await untilHeld(held);
      // Back meanwhile, and a build that found it: the watcher synced to it.
      writeFileSync(join(root, "a.md"), "# A\n");
      const build = knownIn(root, ["a.md", "held/x.md"]);
      w.sync(["", "held"], build.known, build.sizes);
      held.release();
      await until("the batch settled again", () => state.pending.has("a.md") && !watcherBusy(w));
      expect(said).toEqual([]);
      w.flush();
      await quiet(w);
      expect(said).toEqual([]);
    } finally {
      w.close();
    }
  });

  test("a second tick while one is out asks nothing; a flush meanwhile waits for it", async () => {
    const held = holding();
    const root = tree({ "a.md": "# A\n", "held/x.md": "# X\n" });
    const { w, state, said } = await watching(root, ["", "held"], ["a.md", "held/x.md"]);
    try {
      const asked = spyOn(diskThreads(), "look");
      held.again();
      w.pollTick();
      await untilHeld(held);
      w.pollTick();
      writeFileSync(join(root, "held", "new.md"), "# New\n");
      state.pending.add("held/new.md");
      w.flush();
      expect(asked).toHaveBeenCalledTimes(1);
      held.release();
      await until("the flush's batch said", () => said.includes("created held/new.md"));
      await quiet(w);
      // The tick, then the flush that waited for it (and the folder listed again, its time moved).
      expect(asked.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(state.ticks).toBe(1);
    } finally {
      w.close();
    }
  });

  test("past a look's deadline: not answering said once, the looks paused a minute; the next answer clears it", async () => {
    const held = holding();
    const root = tree({ "a.md": "# A\n", "held/x.md": "# X\n" });
    let clock = Date.now();
    const told: boolean[] = [];
    const { w } = await watching(root, ["", "held"], ["a.md", "held/x.md"], {
      now: () => clock,
      onNotAnswering: (b) => told.push(b),
    });
    try {
      threadsFor(held, 150);
      const asked = spyOn(diskThreads(), "look");
      held.again();
      w.pollTick();
      await until("given up on", () => w.notAnswering);
      expect(told).toEqual([true]);
      // Within the minute, a tick asks nothing.
      w.pollTick();
      expect(asked).toHaveBeenCalledTimes(1);
      // A minute later, given up on again: said no second time.
      clock += 60_001;
      w.pollTick();
      expect(asked).toHaveBeenCalledTimes(2);
      await until("asked and given up on again", () => !watcherBusy(w));
      expect(told).toEqual([true]);
      // Answered: cleared.
      held.release();
      threadsFor(held);
      const answered = spyOn(diskThreads(), "look");
      clock += 60_001;
      w.pollTick();
      expect(answered).toHaveBeenCalledTimes(1);
      await until("cleared", () => !w.notAnswering);
      expect(told).toEqual([true, false]);
    } finally {
      w.close();
    }
  });

  test("before home's first walk, a note moved into a folder made in it is found moved, the folder listed on a disk thread", async () => {
    const held = holding();
    const home = tree({ "a.md": "# A\n", "index.md": "# Home\n", "Documents/keep.md": "# Keep\n" });
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "Documents"]) utimesSync(join(home, d), hour, hour);
      const g = openGraph(homeAt(home), DEFAULT_CONFIG, true, "lazy");
      const notes = [...new Set([...g.notes.keys(), "Documents/keep.md"])];
      const { w, said } = await watching(home, g.dirs, notes, {
        filter: g.filter,
        attachments: g.filePaths(),
        walkedAt: () => g.walkedAt,
        leftToWalk: (rel) => g.waitsForHomeWalk(rel),
        walkPending: () => g.home?.walked === null,
      });
      try {
        // Held from the listing that looks for where the note went.
        const threads = diskThreads();
        const look = threads.look.bind(threads);
        spyOn(threads, "look").mockImplementation((batch) => {
          if (batch.list?.some((l) => "judge" in l && "moved" in l.judge.how)) held.again();
          return look(batch);
        });
        mkdirSync(join(home, "Documents", "held"));
        renameSync(join(home, "a.md"), join(home, "Documents", "held", "b.md"));
        await Bun.sleep(30);
        w.pollTick();
        await untilHeld(held);
        expect(said).toEqual([]);
        held.release();
        await until("the move said", () => said.length >= 2);
        await quiet(w);
        expect([...new Set(said)].sort()).toEqual(["created Documents/held/b.md", "deleted a.md"]);
        expect(held.gaveUp).toBe(0);
      } finally {
        w.close();
      }
    } finally {
      process.env.HOME = before;
    }
  });
});
