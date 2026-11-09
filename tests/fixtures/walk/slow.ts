// Folders that answer slowly (T12, #9): one named `slow` takes SLOW_MS to list, one named `stuck` STUCK_MS — far past a
// test's deadline — as a share or a disk asleep would; every other folder at once. One named `held` answers when its
// test lets it go (`Hold`), however busy the machine: what waits on it is told by what's held, not by a clock.
import { type Dirent, readdirSync } from "node:fs";
import { basename } from "node:path";

export const SLOW_MS = 400;
export const STUCK_MS = 3000;
/** How long a `held` folder waits for its test before it answers all the same: far past what a test does meanwhile. */
export const HELD_MS = 10_000;

/** This thread's hold on the `held` folders (`Hold.cells`); none, they answer at once. */
let cells: Int32Array | null = null;

export function slowFolders(abs: string): Dirent[] {
  const name = basename(abs);
  if (name === "slow") Bun.sleepSync(SLOW_MS);
  if (name === "stuck") Bun.sleepSync(STUCK_MS);
  if (name === "held" && cells) {
    Atomics.add(cells, 1, 1);
    if (Atomics.wait(cells, 0, 0, HELD_MS) === "timed-out") Atomics.add(cells, 2, 1);
    Atomics.sub(cells, 1, 1);
  }
  return readdirSync(abs, { withFileTypes: true });
}

/** The hold `shared` taken as this thread's (a worker's, sent it by `Hold.worker`). */
export function takeHold(shared: Int32Array): void {
  cells = shared;
}

/**
 * A hold on the folders named `held`, on every thread that reads them through `slowFolders` — this one too, so a walk
 * made here waits as the walk's thread does: each read waits until `release`, or HELD_MS, and then counts as given up.
 * Only a thread nothing could let go meanwhile waits that long: this one, held where it should have gone on.
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
