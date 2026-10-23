// Where a walk is made (T12): here, on the thread that asks — the CLI's, whose command waits for its answer either way
// — or on the walk's own thread (walk-thread.ts), the TUI's, so a folder that answers slowly never holds up the keys
// or the screen. The same code walks either way (walk.ts, home.ts); only where it runs differs.

import { type HomeWalk, homeWalk, vaultsPastCap } from "./home.ts";
import { type IndexAnswer, IndexJob, type IndexOf, type Opened } from "./index-job.ts";
import type { VaultLocation } from "./vault.ts";
import { SlicedWalk, type WalkCap, type WalkFilter, type WalkLimits, type WalkResult } from "./walk.ts";

/** A walk made a slice at a time (`SlicedWalk`'s face), here or on another thread. */
export interface SteppedWalk {
  /** Work for up to `budgetMs`; false once it's done — or failed. */
  step(budgetMs: number): boolean;
  /** The walk, once it's done; null until then, and when it failed. */
  readonly result: WalkResult | null;
  readonly capped: WalkCap | null;
  /** The folders a cap left unlisted. */
  rest(): string[];
  /** Why it stopped with no walk (its thread gave up on it, or couldn't start); null when it didn't. */
  readonly failed?: string | null;
  /** Its answer awaited from another thread: stepping it again does nothing until it's there. */
  readonly waiting?: boolean;
  /** Given up on: what it holds let go of. */
  drop?(): void;
}

/** An index the background auto-index builds (`IndexJob`), a slice at a time, here or on another thread. */
export interface SteppedIndex {
  /** Work for up to `budgetMs`; false once it's done — or not a vault, or failed. */
  step(budgetMs: number): boolean;
  /** The vault, once it's opened: what the machine's lists record of it. */
  readonly opened: Opened | null;
  /** Its last answer, once it's done or found no vault; null until then, and when it failed. */
  readonly result: Extract<IndexAnswer, { done: true }> | { vault: false } | null;
  /** Why it stopped with no answer (its thread gave up on it, or it couldn't be opened); null when it didn't. */
  readonly failed: string | null;
  /** Its answer awaited from another thread: stepping it again does nothing until it's there. */
  readonly waiting?: boolean;
  /** Given up on: what it holds let go of. */
  drop?(): void;
}

/** An answer: there at once when it's made here; later from another thread, `error` when it failed. */
export interface Pending<T> {
  readonly settled: boolean;
  readonly value?: T;
  readonly error?: string;
}

/** The folders past home's cap that one holds (`vaultsPastCap`). */
export type PastCap = { vaults: string[]; folders: string[] };

/** Where walks are made: each of them as walk.ts and home.ts make it. */
export interface Walker {
  /** Home's walk (VV-D2), a slice at a time. */
  sliced(root: string, filter: WalkFilter, limits?: WalkLimits): SteppedWalk;
  /** A vault's index, or home's from its walk (`IndexJob`), a slice at a time. */
  index(of: IndexOf): SteppedIndex;
  /** Home's walk kept, brought up to now, with the folders asked for (`homeWalk`): what changed handed back, not kept
   *  (`unkept`), for whoever takes the answer to keep. */
  home(
    loc: Pick<VaultLocation, "root" | "key">,
    filter: WalkFilter,
    asked: readonly string[],
    limits?: WalkLimits,
  ): Pending<HomeWalk>;
  /** A folder past home's cap, looked in for vaults (`vaultsPastCap`). */
  seek(dir: string, filter: WalkFilter): Pending<PastCap>;
}

function now<T>(make: () => T): Pending<T> {
  try {
    return { settled: true, value: make() };
  } catch (err) {
    return { settled: true, error: (err as Error).message ?? String(err) };
  }
}

/** An index built here: `IndexJob` stepped, its answers kept as a `SteppedIndex`'s. */
class IndexHere implements SteppedIndex {
  opened: Opened | null = null;
  result: SteppedIndex["result"] = null;
  failed: string | null = null;
  private readonly job: IndexJob;

  constructor(of: IndexOf) {
    this.job = new IndexJob(of);
  }

  step(budgetMs: number): boolean {
    if (this.result || this.failed) return false;
    let a: IndexAnswer;
    try {
      a = this.job.step(budgetMs);
    } catch (err) {
      this.failed = (err as Error).message ?? String(err);
      return false;
    }
    return !takeAnswer(this, a);
  }
}

/** An index's answer taken (`SteppedIndex`): what it opened, and its end — true once it's ended. */
export function takeAnswer(into: { opened: Opened | null; result: SteppedIndex["result"] }, a: IndexAnswer): boolean {
  if (a.vault && a.opened) into.opened = a.opened;
  if (a.vault && !a.done) return false;
  into.result = a;
  return true;
}

/** Walks made here, on the thread that asks: the CLI's. */
export const HERE: Walker = {
  sliced: (root, filter, limits) => new SlicedWalk(root, filter, limits),
  index: (of) => new IndexHere(of),
  home: (loc, filter, asked, limits) => now(() => homeWalk(loc, filter, asked, limits, false)),
  seek: (dir, filter) => now(() => vaultsPastCap(dir, filter)),
};
