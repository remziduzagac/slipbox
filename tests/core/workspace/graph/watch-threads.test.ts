// The watcher's looks asked of the disk threads (SD-T3, SD-D5, SD-D6, SD-D8): one out at a time; an answer compared with
// what's known when it comes — dropped once the watcher was synced to a build since, a path we wrote since settled
// again; a look the disk doesn't answer in time said once, the looks paused a minute — the sweep too — cleared by the
// next answer to a look asked after; home's notes moved into a folder left to its walk found there by a listing on a
// thread; a flush and a tree taken in asked in pieces, what answered kept; a key's read never behind the watcher on
// both threads; one filter a thread, made again when a `.gitignore` changes. What waits is told by the hold (`Hold`,
// this thread's reads too) or a thread's crash, never by a clock (#75); work is counted, not timed.

import { afterEach, describe, expect, setDefaultTimeout, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { setReadWait } from "../../../../src/core/foundation/platform/disk.ts";
import { walkContext } from "../../../../src/core/foundation/workers/worker-context.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { VaultWatcher, type WatcherOptions } from "../../../../src/core/workspace/graph/watch.ts";
import { SLICE } from "../../../../src/core/workspace/graph/watch/reads.ts";
import { homeAt } from "../../../../src/core/workspace/vaults/vault.ts";
import { answerDisk } from "../../../../src/core/workspace/walk/disk-jobs.ts";
import { WalkFilter } from "../../../../src/core/workspace/walk/walk.ts";
import { diskThreads, setWalkWorker, WALK_DEADLINES } from "../../../../src/core/workspace/walk/walk-thread.ts";
import { HELD_MS, Hold, heldReads } from "../../../fixtures/walk/slow.ts";
import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";
import { watcherBusy, watcherDirectories, watcherState } from "../../../support/watcher-access.ts";

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

/** What the disk threads were sent since they were last started (`threadsFor`): each request's paths or folder, and
 *  the worker it went to. */
const sent: { paths: string[]; dir?: string; to: Worker }[] = [];

/** The disk threads started afresh on `held`'s worker, a look's deadline `deadline` (ms), else the test threads' own:
 *  short only while a look is meant to give up, so a thread slow to start never fails one meant to answer. */
function threadsFor(held: Hold, deadline?: number): void {
  sent.length = 0;
  const worker = () => {
    const w = held.worker();
    w.postMessage({ holdReads: true });
    const post = w.postMessage.bind(w);
    w.postMessage = (m: { op?: string; paths?: string[]; dir?: string }) => {
      if (m?.op) sent.push({ paths: m.paths ?? [], ...(m.dir ? { dir: m.dir } : {}), to: w });
      post(m);
    };
    return w;
  };
  setWalkWorker(worker, deadline === undefined ? undefined : { ...WALK_DEADLINES, whole: deadline });
}

/** The thread last sent a request `which` names stopped (a crash): the request, and its look, given up on. */
function crash(which: (s: (typeof sent)[number]) => boolean): void {
  const s = [...sent].reverse().find(which);
  if (!s) throw new Error("no such request sent");
  s.to.dispatchEvent(new ErrorEvent("error", { message: "gone" }));
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

  test("a flush of many paths asks a slice at a time: what answered before one was given up on is said, only the rest pending again", async () => {
    const held = holding();
    const root = tree({ "a.md": "# A\n" });
    const { w, state, said } = await watching(root, [""], ["a.md"]);
    try {
      for (const fw of state.watchers.values()) fw.close(); // what's pending, the test's alone
      const first = Array.from({ length: SLICE }, (_, i) => `n${i}.md`);
      const rest = [...Array.from({ length: 20 }, (_, i) => `m${i}.md`), "held/y.md"];
      for (const rel of [...first, ...rest]) {
        mkdirSync(dirname(join(root, rel)), { recursive: true });
        writeFileSync(join(root, rel), "# N\n");
        state.pending.add(rel);
      }
      const asked = spyOn(diskThreads(), "look");
      held.again();
      w.flush();
      await untilHeld(held);
      // The first slice answered and settled; the second, with the note in `held`, waits there.
      expect(asked.mock.calls.map(([b]) => b.stat?.paths.length)).toEqual([SLICE, rest.length]);
      crash((s) => s.paths.includes(join(root, "held/y.md")));
      await until("given up on", () => w.notAnswering);
      await quiet(w);
      expect(said.sort()).toEqual(first.map((rel) => `created ${rel}`).sort());
      expect([...state.pending].sort()).toEqual([...rest].sort());
    } finally {
      w.close();
    }
  });

  test("a tree moved in is taken in a folder at a time: those listed before one held are watched meanwhile; given up on there, what's left pending again", async () => {
    const held = holding();
    const root = tree({ "a.md": "# A\n" });
    let clock = Date.now();
    const { w, state, said } = await watching(root, [""], ["a.md"], { now: () => clock });
    try {
      for (const fw of state.watchers.values()) fw.close();
      // Nearest first: `t`, then `t/a` and `t/b`, then `t/a/held`.
      const notes = ["t/n.md", "t/a/n.md", "t/b/n.md", "t/a/held/n.md"];
      for (const rel of notes) {
        mkdirSync(dirname(join(root, rel)), { recursive: true });
        writeFileSync(join(root, rel), "# N\n");
      }
      state.pending.add("t");
      held.again();
      w.flush();
      await untilHeld(held);
      expect(["t", "t/a", "t/b", "t/a/held"].map((d) => state.watchers.has(d))).toEqual([true, true, true, false]);
      crash((s) => s.dir === join(root, "t/a/held"));
      await until("given up on", () => w.notAnswering);
      await quiet(w);
      expect([...state.pending].sort()).toEqual(["t/a/held", "t/a/n.md", "t/b/n.md", "t/n.md"]);
      // A minute later, the rest taken in.
      held.release();
      clock += 60_001;
      w.flush();
      await quiet(w);
      expect(state.watchers.has("t/a/held")).toBe(true);
      expect(said.sort()).toEqual(notes.map((rel) => `created ${rel}`).sort());
    } finally {
      w.close();
    }
  });

  test("the looks paused: the sweep asks nothing more, its answer to what it asked before clears nothing; a look asked after the minute clears it", async () => {
    const held = holding();
    const notes = Array.from({ length: 2 * SLICE + 1 }, (_, i) => `n/${i}.md`);
    const root = tree({ "a.md": "# A\n", "held/y.md": "# Y\n", ...Object.fromEntries(notes.map((n) => [n, "# N\n"])) });
    let clock = Date.now();
    const told: boolean[] = [];
    const { w, state } = await watching(root, ["", "n"], notes, {
      now: () => clock,
      onNotAnswering: (b) => told.push(b),
    });
    try {
      const asked = spyOn(diskThreads(), "look");
      /** How many times the sweep asked its slice `k`. */
      const slice = (k: number) =>
        asked.mock.calls.filter(([b]) => !b.stat?.judge && b.stat?.paths[0] === join(root, notes[k * SLICE]!)).length;
      // The 15th tick: the sweep's first slice answers; the flush's stats wait in `held`, its second slice behind them.
      state.ticks = 14;
      state.pending.add("held/y.md");
      held.again();
      w.pollTick();
      await untilHeld(held);
      await until("the sweep's second slice asked", () => slice(1) === 1);
      crash((s) => s.paths.includes(join(root, "held/y.md")));
      await until("given up on", () => w.notAnswering);
      await quiet(w);
      expect([told, w.notAnswering, slice(2)]).toEqual([[true], true, 0]);
      // A tick within the minute asks nothing.
      const calls = asked.mock.calls.length;
      w.pollTick();
      expect(asked.mock.calls.length).toBe(calls);
      // A minute later, a look asked then answers: cleared.
      held.release();
      clock += 60_001;
      w.pollTick();
      await until("cleared", () => !w.notAnswering);
      expect(told).toEqual([true, false]);
    } finally {
      w.close();
    }
  });

  test("the watcher's look held on one disk thread: a key's read is answered by the other at once", async () => {
    const held = holding();
    const root = tree({ "a.md": "# A\n", "held/x.md": "# X\n", "held/p/q.md": "# Q\n" });
    const { w } = await watching(root, ["", "held"], ["a.md", "held/x.md", "held/p/q.md"]);
    try {
      // A tick's stats and a polled folder's listing, each on the way to `held`.
      watcherDirectories(w).pollDir("held/p", "a test's");
      held.again();
      w.pollTick();
      await untilHeld(held);
      let came = false;
      const read = diskThreads()
        .read(join(root, "a.md"), "key")
        .finally(() => {
          came = true;
        });
      await until("the read answered, or the look's listing held too", () => came || held.waiting > 1);
      expect(held.waiting).toBe(1);
      expect(await read).toMatchObject({ text: "# A\n" });
      held.release();
      await quiet(w);
    } finally {
      w.close();
    }
  });

  test("a disk thread judges a watcher's requests by one filter while its settings and epoch stay: a `.gitignore` read once, read again once the epoch moves", () => {
    const root = tree({ ".gitignore": "*.tmp\n", "a.md": "# A\n" });
    const filter = new WalkFilter(root, DEFAULT_CONFIG.walk);
    const reads: string[] = [];
    setReadWait((p) => {
      reads.push(p);
    });
    const ask = (epoch: number) =>
      answerDisk({
        op: "stat",
        paths: [join(root, "a.md")],
        judge: { filter: filter.settings, epoch },
        context: walkContext(),
      });
    const ignoreReads = () => reads.filter((p) => p === join(root, ".gitignore")).length;
    ask(0);
    ask(0);
    expect(ignoreReads()).toBe(1);
    filter.invalidate("");
    ask(filter.epoch);
    expect(ignoreReads()).toBe(2);
  });

  test("a `.gitignore` the watcher saw change: the disk threads judge by it, what it now ignores never said", async () => {
    const held = holding();
    const root = tree({ "a.md": "# A\n", ".gitignore": "" });
    const { w, state, said } = await watching(root, [""], ["a.md"]);
    try {
      for (const fw of state.watchers.values()) fw.close();
      // Judged on a disk thread with the `.gitignore` as it was.
      writeFileSync(join(root, "b.md"), "# B\n");
      state.pending.add("b.md");
      w.flush();
      await quiet(w);
      writeFileSync(join(root, ".gitignore"), "ignored.md\n");
      writeFileSync(join(root, "ignored.md"), "# I\n");
      state.pending.add(".gitignore");
      state.pending.add("ignored.md");
      w.flush();
      await quiet(w);
      expect(said).toEqual(["created b.md"]);
      expect(held.gaveUp).toBe(0);
    } finally {
      w.close();
    }
  });

  test("a flush of thousands of paths settles in one pass: what it goes through beside its reads grows with the paths", () => {
    const n = 3000;
    const notes = Array.from({ length: n }, (_, i) => `n${i}.md`);
    const root = tree(Object.fromEntries(notes.map((rel) => [rel, "# N\n"])));
    const { known, sizes } = knownIn(root, notes);
    const said: string[] = [];
    const w = new VaultWatcher({
      root,
      filter: new WalkFilter(root, DEFAULT_CONFIG.walk),
      dirs: [""],
      debounceMs: 3_600_000,
      pollMs: 3_600_000,
      known,
      sizes,
      onBatch: (b) => said.push(...b.changes.map((c) => c.rel)),
      onDegraded: () => {},
    });
    try {
      const state = watcherState(w);
      for (const rel of notes) state.pending.add(rel);
      const work = arrayWork(() => w.flush());
      expect(state.pending.size + said.length).toBe(0);
      expect(work).toBeLessThan(50 * n);
    } finally {
      w.close();
    }
  });
});

/** What `run` went through in arrays — searched (`includes`, `indexOf`) or copied (`slice`) — element by element: its
 *  work, counted rather than timed. */
function arrayWork(run: () => void): number {
  let work = 0;
  const { includes, indexOf, slice } = Array.prototype;
  const spies = [
    spyOn(Array.prototype, "includes").mockImplementation(function (this: unknown[], ...a: [unknown, number?]) {
      work += this.length;
      return includes.apply(this, a);
    }),
    spyOn(Array.prototype, "indexOf").mockImplementation(function (this: unknown[], ...a: [unknown, number?]) {
      work += this.length;
      return indexOf.apply(this, a);
    }),
    spyOn(Array.prototype, "slice").mockImplementation(function (this: unknown[], ...a: [number?, number?]) {
      const out = slice.apply(this, a);
      work += out.length;
      return out;
    }),
  ];
  try {
    run();
  } finally {
    for (const s of spies) s.mockRestore();
  }
  return work;
}
