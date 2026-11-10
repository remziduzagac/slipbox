// The watcher's looks on the disk threads (SD-T3, SD-D8): a tick's, the sweep's, an event's settle and a polled
// folder's listing each wait on a slow folder there, never here — a key is handled and drawn meanwhile — and what they
// find is taken in once they answer; a look the disk doesn't answer in time is said once, and cleared by the next. What
// waits is told by the hold (`Hold`, here too: a read left on this thread waits until it gives up), never by a clock
// (#75). A test ticks the watcher once it has settled what it heard as it started (`watched`), and sees the tick taken
// (`tick`): a tick asked while a look of its own is out is skipped, and the test would wait for what it never asks.

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { setReadWait } from "../../../../src/core/foundation/platform/disk.ts";
import type { VaultWatcher, WatchBatch } from "../../../../src/core/workspace/graph/watch.ts";
import { diskThreads, setWalkWorker, WALK_DEADLINES } from "../../../../src/core/workspace/walk/walk-thread.ts";
import { HELD_MS, Hold, heldReads } from "../../../fixtures/walk/slow.ts";
import { watcherBusy, watcherDirectories, watcherState } from "../../../support/watcher-access.ts";
import { harness, makeSandbox, statusRow } from "../../../tui-harness.ts";

const sandbox = makeSandbox();

/** A folder of `files` (path → text) in the sandbox, by its real path. */
function tree(files: Record<string, string>): string {
  const dir = realpathSync(mkdtempSync(join(sandbox, "slow-watch-")));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

/** The test's hold (`holding`): let go of when it ends, no thread left waiting. */
let hold: Hold | null = null;

/**
 * A hold on the `held` folders — the disk threads' listings, stats and reads of what's under them, and this thread's
 * reads through the seam (SD-D10's note) — let go of at first, so the watcher stamps its folders.
 */
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

/** Awaited till `ok`, or thrown — `what` said — by HELD_MS, well short of the test's timeout. */
async function until(what: string, ok: () => boolean): Promise<void> {
  const end = performance.now() + HELD_MS;
  while (!ok()) {
    if (performance.now() > end) throw new Error(`never: ${what}`);
    await Bun.sleep(5);
  }
}

/** Awaited till a disk thread waits in a `held` folder. */
const untilHeld = (held: Hold) => until("a disk thread waits in `held`", () => held.waiting > 0);

/** No read given up on, on any thread: none left on this one, where it would have held the test. */
function noneGaveUp(held: Hold): void {
  expect({ gaveUp: held.gaveUp, here: held.gaveUpHere }).toEqual({ gaveUp: 0, here: [] });
}

/** A vault of `files` watched as the TUI watches it, its looks on the disk threads (no tick but the test's), `a.md`
 *  open, once each folder watched is stamped and what the watcher heard meanwhile is settled: on macOS, FSEvents tells
 *  of the vault's own writes, made just before its watch, after it has started — a settle that, out when the test
 *  ticks, has the tick skipped. */
async function watched(files: Record<string, string>) {
  const root = tree({ ".slipbox/config.toml": "", "a.md": "# A\n", ...files });
  const h = await harness({ root, open: "a.md", listOffThread: true, config: (c) => (c.watch.poll_ms = 3_600_000) });
  h.app.watch.startWatcher();
  const w = h.app.watcher!;
  const state = watcherState(w);
  await until("each folder stamped", () => [...state.watchers.keys()].every((d) => state.stamps.has(d)));
  await until("what was heard settled", () => !watcherBusy(w) && !state.timer && !state.pending.size);
  return { root, h, w, state };
}

/** The watcher's tick, asked now, and taken: never skipped for a look out. */
function tick(w: VaultWatcher): void {
  const state = watcherState(w);
  const ticks = state.ticks;
  w.pollTick();
  expect(state.ticks).toBe(ticks + 1);
}

/** A key handled, and drawn, while a disk thread waits in `held`. */
async function keyMeanwhile(h: Awaited<ReturnType<typeof watched>>["h"], held: Hold): Promise<void> {
  await h.keys("ctrl+p");
  expect(h.frame()).toContain("Open note");
  await h.keys("escape");
  expect(held.waiting).toBeGreaterThanOrEqual(1);
}

describe("the watcher's looks on the disk threads (SD-T3)", () => {
  test("a tick's look waits on a slow folder there, a key handled meanwhile; let go, an agent's note is in the graph and the open note read again", async () => {
    const held = holding();
    const { root, h, w } = await watched({ "held/n.md": "# N\n" });
    try {
      held.again();
      tick(w);
      await untilHeld(held);
      // An agent writes a note in `held`, and rewrites the note open, while the look waits.
      writeFileSync(join(root, "held", "new.md"), "# New\n");
      writeFileSync(join(root, "a.md"), "# A, rewritten\n");
      await keyMeanwhile(h, held);
      expect(h.app.graph.notes.has("held/new.md")).toBe(false);
      held.release();
      await until("the agent's note in the graph, the open note read again", () => {
        return h.app.graph.notes.has("held/new.md") && h.app.view?.buf.source === "# A, rewritten\n";
      });
      // Only a disk thread waited on it: none here waited till it gave up.
      noneGaveUp(held);
    } finally {
      w.close();
    }
  });

  test("the sweep's look waits there, ticks going on; let go, a note rewritten in place (no folder's time moved) is seen", async () => {
    const held = holding();
    const { root, h, w, state } = await watched({ "held/n.md": "# N\n" });
    try {
      // No event comes (each folder's watch closed, still looked at by the ticks): the sweep alone sees it.
      for (const fw of state.watchers.values()) fw.close();
      const note = join(root, "held", "n.md");
      writeFileSync(note, "# N, rewritten in place\n");
      const after = statSync(note).mtimeMs;
      // Held from the sweep's first slice: the tick before it answered at once.
      const threads = diskThreads();
      const look = threads.look.bind(threads);
      let sweep = true;
      spyOn(threads, "look").mockImplementation((batch) => {
        if (sweep && batch.stat?.paths.includes(note)) {
          sweep = false;
          held.again();
        }
        return look(batch);
      });
      state.ticks = 14;
      tick(w);
      await untilHeld(held);
      await keyMeanwhile(h, held);
      expect(h.app.graph.notes.get("held/n.md")?.mtimeMs).not.toBe(after);
      held.release();
      await until("the note rewritten known", () => h.app.graph.notes.get("held/n.md")?.mtimeMs === after);
      noneGaveUp(held);
    } finally {
      w.close();
    }
  });

  test("an event's batch waits for its stats there, a key handled meanwhile; let go, it's taken in", async () => {
    const held = holding();
    const { root, h, w } = await watched({ "held/n.md": "# N\n" });
    try {
      held.again();
      writeFileSync(join(root, "held", "new.md"), "# New\n");
      await untilHeld(held);
      await keyMeanwhile(h, held);
      expect(h.app.graph.notes.has("held/new.md")).toBe(false);
      held.release();
      await until("the note in the graph", () => h.app.graph.notes.has("held/new.md"));
      noneGaveUp(held);
    } finally {
      w.close();
    }
  });

  test("a polled folder listed there, a key handled meanwhile; let go, what came is judged as the walk judges it", async () => {
    const outside = tree({ "far/f.md": "# F\n", "far.md": "# Far\n" });
    const held = holding();
    const { root, h, w, state } = await watched({ ".gitignore": "secret.md\n", "held/p/n.md": "# N\n" });
    try {
      // `held/p` polled, as a folder whose watch failed is.
      state.watchers.get("held/p")?.close();
      state.watchers.delete("held/p");
      watcherDirectories(w).pollDir("held/p", "a test's");
      const batches: WatchBatch[] = [];
      spyOn(h.app.watch, "receiveBatch").mockImplementation((b) => void batches.push(b));
      held.again();
      tick(w);
      await untilHeld(held);
      // Come meanwhile: a busy folder, an ignored note, a nested vault, links out — and a folder and a note the walk
      // takes.
      const p = join(root, "held", "p");
      mkdirSync(join(p, "node_modules", "pkg"), { recursive: true });
      writeFileSync(join(p, "node_modules", "pkg", "r.md"), "# R\n");
      writeFileSync(join(p, "secret.md"), "# Secret\n");
      mkdirSync(join(p, "nested", ".slipbox"), { recursive: true });
      writeFileSync(join(p, "nested", ".slipbox", "config.toml"), "");
      writeFileSync(join(p, "nested", "v.md"), "# V\n");
      symlinkSync(join(outside, "far"), join(p, "out"));
      symlinkSync(join(outside, "far.md"), join(p, "out.md"));
      mkdirSync(join(p, "sub"));
      writeFileSync(join(p, "sub", "s.md"), "# S\n");
      writeFileSync(join(p, "new.md"), "# New\n");
      await keyMeanwhile(h, held);
      held.release();
      await until("the new note said", () => batches.some((b) => b.changes.some((c) => c.rel === "held/p/new.md")));
      // The folder the walk takes, taken in; the busy one, the nested vault and the link out, not.
      expect(state.watchers.has("held/p/sub")).toBe(true);
      for (const d of ["held/p/node_modules", "held/p/nested", "held/p/out"]) {
        expect(state.watchers.has(d)).toBe(false);
        expect(state.polled.has(d)).toBe(false);
      }
      expect(batches.some((b) => b.rescan)).toBe(true);
      const said = batches.flatMap((b) => b.changes.map((c) => c.rel));
      expect(said).toEqual(["held/p/new.md"]);
      noneGaveUp(held);
    } finally {
      w.close();
    }
  });

  test("a look the disk doesn't answer in time: `⚠ disk not answering` on the status line, said once; the next look that answers clears it", async () => {
    const held = holding();
    const { h, w } = await watched({ "held/n.md": "# N\n" });
    const said = () => h.app.messages.filter((m) => m.text.includes("disk not answering")).length;
    try {
      expect(statusRow(h.frame())).toContain("● watching");
      threadsFor(held, 200);
      held.again();
      tick(w);
      await until("the look given up on", () => w.notAnswering);
      expect(statusRow(h.frame())).toContain("⚠ disk not answering");
      expect(said()).toBe(1);
      // Looked at again a minute later: a tick before then asks nothing, says nothing more.
      const asked = spyOn(diskThreads(), "look");
      w.pollTick();
      expect(asked).not.toHaveBeenCalled();
      held.release();
      threadsFor(held);
      const answered = spyOn(diskThreads(), "look");
      const now = Date.now;
      Date.now = () => now() + 61_000;
      try {
        tick(w);
      } finally {
        Date.now = now;
      }
      expect(answered).toHaveBeenCalledTimes(1);
      await until("cleared", () => !w.notAnswering);
      expect(statusRow(h.frame())).toContain("● watching");
      expect(said()).toBe(1);
    } finally {
      w.close();
    }
  });
});
