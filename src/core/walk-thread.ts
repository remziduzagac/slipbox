// The walk's own thread (T12), the TUI's walker: home's walk, the background index's vaults and what it seeks past
// home's cap, and home's walk kept brought up to now — made on a worker (walk-worker.ts), so the main thread never
// waits on a folder that answers slowly (a share, a disk asleep, a folder of many thousands of files). One request
// at a time, in order; home's walk stepped a slice at a time, as on the main thread, so it rests while you work. A
// request the thread doesn't answer in time is given up on, the thread started afresh for the next: it never falls
// back to walking on the main thread, which would freeze the screen again.

import type { Config } from "./config.ts";
import type { HomeWalk } from "./home.ts";
import type { IndexAnswer, IndexOf, Opened } from "./index-job.ts";
import type { FolderListing } from "./listing.ts";
import type { WalkCap, WalkFilter, WalkLimits, WalkResult } from "./walk.ts";
import type { StepAnswer, WalkRequest } from "./walk-jobs.ts";
import { walkContext } from "./worker-context.ts";
import { type PastCap, type Pending, type SteppedIndex, type SteppedWalk, takeAnswer, type Walker } from "./walkers.ts";
import { WorkerRequestError, WorkerRequests } from "./worker-requests.ts";
import { workerUrl } from "./workers.ts";

/**
 * How long the thread has for a request, the wait for it not counted: a slice of home's walk, or a folder looked in
 * past its cap — a folder that doesn't answer in a minute is given up on — and a whole walk (a vault's, home's kept
 * brought up to now), far longer, for a big one on a slow disk.
 */
export const WALK_DEADLINES = { step: 60_000, whole: 10 * 60_000 };

type Ask = WalkRequest extends infer R ? (R extends unknown ? Omit<R, "context"> : never) : never;

/** Why the walk's thread failed a walk, in words: it didn't answer in time, stopped, or couldn't start. */
export function walkFailure(err: Error): string {
  const kind = err instanceof WorkerRequestError ? err.kind : null;
  if (kind === "deadline") return "a folder didn't answer in time";
  if (kind === "unavailable") return "the walk's thread couldn't start";
  if (kind === "crashed") return "the walk's thread stopped";
  if (kind === "stopped" || kind === "cancelled") return "stopped";
  return err.message;
}

/** An answer to come, read when it's there (`Pending`). */
function pending<A, T>(answer: Promise<A>, take: (a: A) => T): Pending<T> {
  const out: { settled: boolean; value?: T; error?: string } = { settled: false };
  answer.then(
    (a) => {
      out.value = take(a);
      out.settled = true;
    },
    (err: Error) => {
      out.error = walkFailure(err);
      out.settled = true;
    },
  );
  return out;
}

export class WalkThread implements Walker {
  private readonly requests: WorkerRequests;
  private serial = 0;

  constructor(
    factory: () => Worker = () => new Worker(workerUrl("walk-worker.ts")),
    readonly deadlines = WALK_DEADLINES,
  ) {
    // No cap on an answer: a walk's grows with what it found, which home's cap bounds and a vault's own size does.
    this.requests = new WorkerRequests(factory, { result: Infinity });
  }

  /** A request to the thread, with what it can't see for itself. */
  ask<A>(request: Ask, deadline: number): Promise<A> {
    return this.requests.request<A>({ ...request, context: walkContext() }, { deadline, bytes: 0 });
  }

  sliced(_root: string, filter: WalkFilter, limits?: WalkLimits): SteppedWalk {
    return new ThreadedWalk(this, ++this.serial, filter, limits);
  }

  index(of: IndexOf): SteppedIndex {
    return new ThreadedIndex(this, ++this.serial, of);
  }

  home(
    loc: { root: string; key: string },
    filter: WalkFilter,
    asked: readonly string[],
    limits?: WalkLimits,
  ): Pending<HomeWalk> {
    return pending(this.homeWalk(loc, filter, asked, limits), (h) => h);
  }

  /** Home's walk kept, brought up to now, with the folders asked for (`homeWalk`): what changed handed back, unkept. */
  async homeWalk(
    loc: { root: string; key: string },
    filter: WalkFilter,
    asked: readonly string[],
    limits?: WalkLimits,
  ): Promise<HomeWalk> {
    const request = {
      op: "home" as const,
      loc: { root: loc.root, key: loc.key },
      filter: filter.settings,
      asked: [...asked],
      ...(limits ? { limits } : {}),
    };
    return (await this.ask<{ home: HomeWalk }>(request, this.deadlines.whole)).home;
  }

  seek(dir: string, filter: WalkFilter): Pending<PastCap> {
    return pending(this.ask<PastCap>({ op: "seek", dir, filter: filter.settings }, this.deadlines.step), (a) => ({
      vaults: a.vaults,
      folders: a.folders,
    }));
  }

  /** The thread stopped, every request on it failed; a later one starts it again. */
  stop(): void {
    this.requests.stop();
  }
}

/** Home's walk on the walk's thread: each `step` asks for a slice there, and says there's more until it's answered. */
class ThreadedWalk implements SteppedWalk {
  result: WalkResult | null = null;
  capped: WalkCap | null = null;
  failed: string | null = null;
  private left: string[] = [];
  private started = false;
  private asking = false;

  get waiting(): boolean {
    return this.asking;
  }

  constructor(
    private readonly thread: WalkThread,
    private readonly id: number,
    private readonly filter: WalkFilter,
    private readonly limits?: WalkLimits,
  ) {}

  step(budgetMs: number): boolean {
    if (this.result || this.failed) return false;
    if (this.asking) return true;
    this.asking = true;
    const start = { filter: this.filter.settings, ...(this.limits ? { limits: this.limits } : {}) };
    const request = {
      op: "step" as const,
      walk: this.id,
      budget: Math.max(1, budgetMs),
      ...(this.started ? {} : { start }),
    };
    this.started = true;
    this.thread.ask<StepAnswer>(request, this.thread.deadlines.step).then(
      (a) => {
        this.asking = false;
        if (!a.done || this.failed) return;
        this.result = a.result;
        this.capped = a.capped;
        this.left = a.rest;
      },
      (err: Error) => {
        this.asking = false;
        this.failed ??= walkFailure(err);
      },
    );
    return true;
  }

  rest(): string[] {
    return this.left;
  }

  drop(): void {
    if (this.result || this.failed) return;
    this.failed = "let go of";
    if (this.started) this.thread.ask({ op: "drop", walk: this.id }, this.thread.deadlines.step).catch(() => {});
  }
}

/**
 * The explorer's listings' threads (T12): two, apart from the walk's, so a folder is never listed behind home's walk,
 * nor every folder behind one that answers slowly; one listing at a time on each, the next on the one with less to do.
 */
export class ListThreads {
  private readonly pool: WorkerRequests[];

  constructor(
    factory: () => Worker = () => new Worker(workerUrl("list-worker.ts")),
    readonly deadline = WALK_DEADLINES.step,
    size = 2,
  ) {
    this.pool = Array.from({ length: size }, () => new WorkerRequests(factory, { result: Infinity }));
  }

  /** The folder `dir` listed (`listFolder`), `walk` the settings a busy folder is decided by, `hidden` `files.hidden`. */
  async list(dir: string, walk: Config["walk"], hidden: boolean): Promise<FolderListing> {
    const load = (r: WorkerRequests) => r.pending.requests + r.pending.waiting;
    const on = this.pool.reduce((a, b) => (load(b) < load(a) ? b : a));
    const request = { op: "list", dir, walk, hidden, context: walkContext() };
    return (await on.request<{ listing: FolderListing }>(request, { deadline: this.deadline, bytes: 0 })).listing;
  }

  stop(): void {
    for (const r of this.pool) r.stop();
  }
}

/** An index on the walk's thread (`IndexJob`): each `step` asks for a slice there — the first opens and walks the
 *  vault, a whole walk's time — and says there's more until it's answered. */
class ThreadedIndex implements SteppedIndex {
  opened: Opened | null = null;
  result: SteppedIndex["result"] = null;
  failed: string | null = null;
  private started = false;
  private asking = false;

  get waiting(): boolean {
    return this.asking;
  }

  constructor(
    private readonly thread: WalkThread,
    private readonly id: number,
    private readonly of: IndexOf,
  ) {}

  step(budgetMs: number): boolean {
    if (this.result || this.failed) return false;
    if (this.asking) return true;
    this.asking = true;
    const first = !this.started;
    this.started = true;
    const request = {
      op: "index" as const,
      job: this.id,
      budget: Math.max(1, budgetMs),
      ...(first ? { start: this.of } : {}),
    };
    this.thread
      .ask<IndexAnswer & { id?: number }>(request, first ? this.thread.deadlines.whole : this.thread.deadlines.step)
      .then(
        ({ id: _, ...a }) => {
          this.asking = false;
          if (!this.failed) takeAnswer(this, a as IndexAnswer);
        },
        (err: Error) => {
          this.asking = false;
          this.failed ??= walkFailure(err);
        },
      );
    return true;
  }

  drop(): void {
    if (this.result || this.failed) return;
    this.failed = "let go of";
    if (this.started) this.thread.ask({ op: "drop", walk: this.id }, this.thread.deadlines.step).catch(() => {});
  }
}

let shared: { walk: WalkThread | null; list: ListThreads | null } = { walk: null, list: null };
let made: { factory: () => Worker; deadlines?: typeof WALK_DEADLINES } | null = null;

/** The TUI's walk thread, started when it's first asked. */
export function walkThread(): WalkThread {
  shared.walk ??= made ? new WalkThread(made.factory, made.deadlines) : new WalkThread();
  return shared.walk;
}

/** The TUI's listing threads, started when they're first asked. */
export function listThreads(): ListThreads {
  shared.list ??= made ? new ListThreads(made.factory, made.deadlines?.step) : new ListThreads();
  return shared.list;
}

/** The walk's thread and the listings' stopped (the TUI quitting); the next ask starts them again. */
export function stopWalkThreads(): void {
  shared.walk?.stop();
  shared.list?.stop();
  shared = { walk: null, list: null };
}

/** A test's worker for the walk's and the listings' threads (one held up on purpose), and its deadlines; null, the walk
 *  worker again. */
export function setWalkWorker(factory: (() => Worker) | null, deadlines?: typeof WALK_DEADLINES): void {
  stopWalkThreads();
  made = factory ? { factory, ...(deadlines ? { deadlines } : {}) } : null;
}
