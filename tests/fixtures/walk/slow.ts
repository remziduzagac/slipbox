// Folders that answer slowly (T12, #9): one named `slow` takes SLOW_MS to list, one named `stuck` STUCK_MS — far past a
// test's deadline — as a share or a disk asleep would; every other folder at once. One named `held` answers when its
// test lets it go (`Hold`), however busy the machine: what waits on it is told by what's held, not by a clock. So does
// a stat or a read of a path with a `held` folder on its way, made through the seam on a thread whose test asks
// (`heldReads`, `setReadWait`; SD-D10).
import { type Dirent, readdirSync, type Stats } from "node:fs";
import { basename } from "node:path";
import { onTheWay, stat } from "../../../src/core/foundation/platform/disk.ts";
import { type DecodedFile, readText } from "../../../src/core/foundation/platform/fsutil.ts";

export const SLOW_MS = 400;
export const STUCK_MS = 3000;
/** How long a `held` folder waits for its test before it answers all the same: far past what a test does meanwhile. */
export const HELD_MS = 10_000;

/** This thread's hold on the `held` folders (`Hold.cells`); none, they answer at once. */
let cells: Int32Array | null = null;

/** A read of a `held` folder: waited until the hold is let go, or HELD_MS, and then counted as given up. */
function waitHeld(): void {
  if (!cells) return;
  Atomics.add(cells, 1, 1);
  if (Atomics.wait(cells, 0, 0, HELD_MS) === "timed-out") Atomics.add(cells, 2, 1);
  Atomics.sub(cells, 1, 1);
}

export function slowFolders(abs: string): Dirent[] {
  const name = basename(abs);
  if (name === "slow") Bun.sleepSync(SLOW_MS);
  if (name === "stuck") Bun.sleepSync(STUCK_MS);
  if (name === "held") waitHeld();
  return readdirSync(abs, { withFileTypes: true });
}

/** Before a stat or a read through the seam (`setReadWait`): one of a path with a `held` folder on its way waits as
 *  that folder's listing does. */
export function heldReads(path: string): void {
  if (onTheWay(path, "held")) waitHeld();
}

/** The hold `shared` taken as this thread's (a worker's, sent it by `Hold.worker`). */
export function takeHold(shared: Int32Array): void {
  cells = shared;
}

/** What a stat answers that a test compares, as it crosses between threads. */
export type StatSeen = { mtimeMs: number; ctimeMs: number; size: number; ino: number; mode: number };

export const statSeen = (s: Stats): StatSeen => ({
  mtimeMs: s.mtimeMs,
  ctimeMs: s.ctimeMs,
  size: s.size,
  ino: s.ino,
  mode: s.mode,
});

/** A stat or a file's text read through the seam on this thread (a test's worker asked: `slow-worker.ts`), with the
 *  error's code when it fails. */
export function seamRead(req: { op: "stat" | "read"; path: string }): {
  stat?: StatSeen;
  text?: DecodedFile;
  error?: string;
} {
  try {
    return req.op === "stat" ? { stat: statSeen(stat(req.path)) } : { text: readText(req.path) };
  } catch (err) {
    return { error: (err as NodeJS.ErrnoException).code ?? String(err) };
  }
}

/** On this thread, once a reader on another waits on a `held` folder: the hold let go — a test's own thread held,
 *  let go of from a worker. Given up after HELD_MS, nothing let go. */
export function letGoOnceWaiting(): void {
  const end = performance.now() + HELD_MS;
  while (cells && Atomics.load(cells, 1) === 0) {
    if (performance.now() > end) return;
    Bun.sleepSync(1);
  }
  if (!cells) return;
  Atomics.store(cells, 0, 1);
  Atomics.notify(cells, 0);
}

/**
 * A hold on the folders named `held`, on every thread that reads them through `slowFolders` and `heldReads` — this one
 * too, so a walk made here waits as the walk's thread does: each read waits until `release`, or HELD_MS, and then
 * counts as given up. Only a thread nothing could let go meanwhile waits that long: this one, held where it should have
 * gone on.
 */
export class Hold {
  /** Let go (1) or not (0); readers waiting now; readers that gave up waiting. */
  readonly cells = new Int32Array(new SharedArrayBuffer(12));

  constructor() {
    cells = this.cells;
  }

  /** A walk's thread for a test (`setWalkWorker`), its `held` folders this hold's. */
  readonly worker = (): Worker => {
    const w = new Worker(new URL("./slow-worker.ts", import.meta.url).href);
    w.postMessage({ hold: this.cells });
    return w;
  };

  /** Readers waiting on a `held` folder now, on any thread. */
  get waiting(): number {
    return Atomics.load(this.cells, 1);
  }

  /** Readers that waited HELD_MS, never let go. */
  get gaveUp(): number {
    return Atomics.load(this.cells, 2);
  }

  /** Whether it's let go of now. */
  get letGo(): boolean {
    return Atomics.load(this.cells, 0) === 1;
  }

  /** Every `held` folder answers, those waiting and those read from now on. */
  release(): void {
    Atomics.store(this.cells, 0, 1);
    Atomics.notify(this.cells, 0);
  }

  /** Held again: the next to read one waits. */
  again(): void {
    Atomics.store(this.cells, 0, 0);
  }
}
