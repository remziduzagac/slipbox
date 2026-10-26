// Where a walk is made (T12): here, on the thread that asks — the CLI's, whose command waits for its answer either way
// — or on the walk's own thread (walk-thread.ts), the TUI's, so a folder that answers slowly never holds up the keys
// or the screen. The same code walks either way (walk.ts, home.ts); only where it runs differs.

import type { Config } from "../../application/config/config.ts";
import { type HomeWalk, vaultsPastCap } from "../vaults/home.ts";
import { type IndexAnswer, IndexJob, type IndexOf, type Opened } from "../../index-job.ts";
import { type FilterSettings, filterFrom, SlicedWalk, type WalkCap, type WalkLimits, type WalkResult } from "./walk.ts";

/** A walk made a slice at a time (`SlicedWalk`), here or on another thread — kept where it was made: what the one who
 *  asks needs of it comes back (what stopped it, what it left, the vaults it found), the walk itself handed on. */
export interface SteppedWalk {
  /** Work for up to `budgetMs`; false once it's done — or failed. */
  step(budgetMs: number): boolean;
  /** It's done, with a walk (not failed). */
  readonly done: boolean;
  readonly capped: WalkCap | null;
  /** The folders a cap left unlisted. */
  rest(): string[];
  /** The vaults it found, by home's paths for them. */
  nested(): string[];
  /** The walk, for home's index (`IndexJob`) built where the walk is: made when it began (`walked`). */
  handOver(walked: number): HomeOf;
  /** Why it stopped with no walk (its thread gave up on it, or couldn't start); null when it didn't. */
  readonly failed?: string | null;
  /** Its answer awaited from another thread: stepping it again does nothing until it's there. */
  readonly waiting?: boolean;
}

/** An index the background auto-index builds (`IndexJob`), a slice at a time, here or on another thread. */
export interface SteppedIndex {
  /** Work for up to `budgetMs`; false once it's done — or not a vault, or failed. */
  step(budgetMs: number): boolean;
  /** The vault, once it's opened: what the machine's lists record of it. */
  readonly opened: Opened | null;
  /** Its last answer, once it's done or found no vault — what it opened in `opened` alone; null until then, and when it
   *  failed. */
  readonly result: Omit<Extract<IndexAnswer, { done: true }>, "opened"> | { vault: false } | null;
  /** Why it stopped with no answer (its thread gave up on it, or it couldn't be opened); null when it didn't. */
  readonly failed: string | null;
  /** Its answer awaited from another thread: stepping it again does nothing until it's there. */
  readonly waiting?: boolean;
}

/** An answer: there at once when it's made here; later from another thread, `error` when it failed. */
export interface Pending<T> {
  readonly settled: boolean;
  readonly value?: T;
  readonly error?: string;
}

/** The folders past home's cap that one holds (`vaultsPastCap`). */
export type PastCap = { vaults: string[]; folders: string[] };

/** Home's walk for its index: the walk itself, with its filter's signature (what it was walked under), or the one kept
 *  on the walk's thread, by its number there. */
export type HomeOf = (HomeWalk & { signature: string }) | { walkOn: number; walked: number; capped: WalkCap | null };

/** What an index is asked of: a vault found, or home from its walk (`HomeOf`). */
export type IndexAsk = { root: string } | { root: string; home: HomeOf; config: Config };

/** Where walks are made: each of them as walk.ts and home.ts make it. */
export interface Walker {
  /** Home's walk (VV-D2), a slice at a time, by the filter `settings` make. */
  sliced(settings: FilterSettings, limits?: WalkLimits): SteppedWalk;
  /** A vault's index, or home's from its walk (`IndexJob`), a slice at a time. */
  index(of: IndexAsk): SteppedIndex;
  /** A folder past home's cap, looked in for vaults (`vaultsPastCap`). */
  seek(dir: string, settings: FilterSettings): Pending<PastCap>;
}

function now<T>(make: () => T): Pending<T> {
  try {
    return { settled: true, value: make() };
  } catch (err) {
    return { settled: true, error: (err as Error).message ?? String(err) };
  }
}

/** Home's walk made here: `SlicedWalk`, what's asked of it read off its walk. */
class WalkHere implements SteppedWalk {
  private readonly walk: SlicedWalk;
  private readonly signature: string;

  constructor(settings: FilterSettings, limits?: WalkLimits) {
    const filter = filterFrom(settings);
    this.signature = filter.signature();
    this.walk = new SlicedWalk(settings.root, filter, limits);
  }

  step(budgetMs: number): boolean {
    return this.walk.step(budgetMs);
  }

  get done(): boolean {
    return this.walk.result !== null;
  }

  get capped(): WalkCap | null {
    return this.walk.capped;
  }

  rest(): string[] {
    return this.walk.rest();
  }

  nested(): string[] {
    return nestedIn(this.walk.result);
  }

  handOver(walked: number): HomeOf {
    return { walk: this.walk.result!, walked, capped: this.walk.capped, signature: this.signature };
  }
}

/** The vaults a walk found, by its paths for them. */
export function nestedIn(walk: WalkResult | null): string[] {
  return (walk?.skipped ?? []).filter((s) => s.reason === "nested vault").map((s) => s.rel);
}

/** An index built here: `IndexJob` stepped, its answers kept as a `SteppedIndex`'s. */
class IndexHere implements SteppedIndex {
  opened: Opened | null = null;
  result: SteppedIndex["result"] = null;
  failed: string | null = null;
  private readonly job: IndexJob;

  constructor(of: IndexAsk) {
    // Asked here, a walk made here: never one kept on another thread.
    this.job = new IndexJob(of as IndexOf);
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
  if (!a.vault) {
    into.result = a;
    return true;
  }
  if (a.opened) into.opened = a.opened;
  if (!a.done) return false;
  // What it opened comes with the slice that opened it, the last one too when one slice did it all: kept apart, never
  // in its end, which is then the same however its work fell across slices — here or on the walk's thread.
  const { opened: _, ...end } = a;
  into.result = end;
  return true;
}

/** Walks made here, on the thread that asks: the CLI's. */
export const HERE: Walker = {
  sliced: (settings, limits) => new WalkHere(settings, limits),
  index: (of) => new IndexHere(of),
  seek: (dir, settings) => now(() => vaultsPastCap(dir, filterFrom(settings))),
};
