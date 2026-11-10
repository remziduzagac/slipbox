// The walk's own thread (T12), the TUI's walker: home's walk, the background index's vaults and what it seeks past
// home's cap, and home's walk kept brought up to now — made on a worker (walk-worker.ts), so the main thread never
// waits on a folder that answers slowly (a share, a disk asleep, a folder of many thousands of files). One request
// at a time, in order; home's walk stepped a slice at a time, as on the main thread, so it rests while you work. A
// request the thread doesn't answer in time is given up on, the thread started afresh for the next: it never falls
// back to walking on the main thread, which would freeze the screen again.
//
// And the disk threads (SD-D2: `DiskThreads`, list-worker.ts), the explorer's listing threads grown into what every
// other read of the vault open asks: two, light, a request going to whichever is free.

import type { Config } from "../../application/config/config.ts";
import type { HomeWalk } from "../vaults/home.ts";
import type { IndexAnswer, Opened } from "../graph/index-job.ts";
import type { JudgedListing, PathVerdict } from "../graph/watch/judging.ts";
import type {
  DiskRequest,
  ListAsk,
  LookRequestAnswer,
  PathStat,
  ReadAnswer,
  StatAnswer,
  StatAsk,
  WalkAnswer,
  WalkAsk,
} from "./disk-jobs.ts";
import type { FolderListing } from "./listing.ts";
import type { LookJob, LookJobAnswer } from "./look-jobs.ts";
import { type FilterSettings, slowDisk, type WalkCap, type WalkLimits } from "./walk.ts";
import type { StepAnswer, WalkRequest } from "./walk-jobs.ts";
import { walkContext } from "../../foundation/workers/worker-context.ts";
import {
  type HomeOf,
  type IndexAsk,
  type PastCap,
  type Pending,
  type SteppedIndex,
  type SteppedWalk,
  takeAnswer,
  type Walker,
} from "./walkers.ts";
import { WorkerRequestError, WorkerRequests } from "../../foundation/workers/worker-requests.ts";
import { workerUrl } from "../../foundation/workers/url.ts";

/**
 * How long the thread has for a request, the wait for it not counted: a slice of home's walk, or a folder looked in
 * past its cap — a folder that doesn't answer in five minutes is given up on: long enough for one that always takes
 * long (a network share's thousands of files) to be read, a hung disk still found out — and a whole walk (a vault's,
 * home's kept brought up to now), far longer, for a big one on a slow disk.
 */
export const WALK_DEADLINES = {
  step: slowDisk()?.deadline ?? 5 * 60_000,
  whole: slowDisk()?.deadline ?? 10 * 60_000,
};

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
    factory: () => Worker = () => new Worker(workerUrl("workspace/walk/walk-worker.ts")),
    readonly deadlines = WALK_DEADLINES,
  ) {
    // No cap on an answer: a walk's grows with what it found, which home's cap bounds and a vault's own size does.
    this.requests = new WorkerRequests(factory, { result: Infinity });
  }

  /** A request to the thread, with what it can't see for itself. */
  ask<A>(request: Ask, deadline: number): Promise<A> {
    return this.requests.request<A>({ ...request, context: walkContext() }, { deadline, bytes: 0 });
  }

  sliced(settings: FilterSettings, limits?: WalkLimits): SteppedWalk {
    return new ThreadedWalk(this, ++this.serial, settings, limits);
  }

  index(of: IndexAsk): SteppedIndex {
    return new ThreadedIndex(this, ++this.serial, of);
  }

  /** Home's walk kept, brought up to now, with the folders asked for (`homeWalk`): what changed handed back, unkept. */
  async homeWalk(
    loc: { root: string; key: string },
    settings: FilterSettings,
    asked: readonly string[],
    limits?: WalkLimits,
  ): Promise<HomeWalk> {
    const request = {
      op: "home" as const,
      loc: { root: loc.root, key: loc.key },
      filter: settings,
      asked: [...asked],
      ...(limits ? { limits } : {}),
    };
    return (await this.ask<{ home: HomeWalk }>(request, this.deadlines.whole)).home;
  }

  seek(dir: string, settings: FilterSettings): Pending<PastCap> {
    return pending(this.ask<PastCap>({ op: "seek", dir, filter: settings }, this.deadlines.step), (a) => ({
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
  done = false;
  capped: WalkCap | null = null;
  failed: string | null = null;
  private left: string[] = [];
  private found: string[] = [];
  private started = false;
  private asking = false;

  get waiting(): boolean {
    return this.asking;
  }

  constructor(
    private readonly thread: WalkThread,
    private readonly id: number,
    private readonly settings: FilterSettings,
    private readonly limits?: WalkLimits,
  ) {}

  step(budgetMs: number): boolean {
    if (this.done || this.failed) return false;
    if (this.asking) return true;
    this.asking = true;
    const start = { filter: this.settings, ...(this.limits ? { limits: this.limits } : {}) };
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
        this.done = true;
        this.capped = a.capped;
        this.left = a.rest;
        this.found = a.nested;
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

  nested(): string[] {
    return this.found;
  }

  /** The walk kept on the thread, by its number there: home's index is built from it there. */
  handOver(walked: number): HomeOf {
    return { walkOn: this.id, walked, capped: this.capped };
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
    private readonly of: IndexAsk,
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
}

/**
 * Who asked a disk thread, which sets how long it has (SD-D6, its note of 2026-11-10): what asked, never the request's
 * kind. A look — the watcher's, the TUI's — whatever it asks (a `stat` or a `list`), and a key's read or a folder's
 * check, a minute; the explorer's listings and a walk ten (T12's).
 */
export type Asker = "look" | "key" | "explorer" | "walk";

/** Each asker's deadline (ms), from when a thread is handed its request; each shortened to the stand-in's third part
 *  (`SLIPBOX_SLOW_DISK`), for the terminal checks. */
export const DISK_DEADLINES: Readonly<Record<Asker, number>> = {
  look: slowDisk()?.deadline ?? 60_000,
  key: slowDisk()?.deadline ?? 60_000,
  explorer: WALK_DEADLINES.whole,
  walk: WALK_DEADLINES.whole,
};

/** How long a disk thread is kept with nothing asked of it (#56, SD-D12): let go of then, and started again by the next
 *  request, in 60–70 ms — under the 150 ms before `listing…` shows. While a vault is watched the first is asked every
 *  two seconds, and a request takes the first that's free, so only the second is let go of. */
export const IDLE_MS = 60_000;

/** A look's batch (SD-D8, its note of 2026-11-10): every path it stats (links followed, or their own: `own`), and each
 *  folder it lists; the watcher's judged with the walk's filter as they're read (`judge`, SD-T3); and the TUI's look's
 *  own jobs (SD-T4, look-jobs.ts): a way checked, git's state, the config — asked with its stats as one request, so a
 *  look holds one thread. Asked in the background (`background`: the watcher's look, the TUI's), its requests go one at
 *  a time, with any other background request's, so they never hold both threads: what a key asks finds the other
 *  (SD-D2's note of 2026-11-10). */
export interface LookAsk {
  stat?: StatAsk;
  list?: ListAsk[];
  jobs?: LookJob[];
  background?: boolean;
}

/** A look's batch answered: its stats in the order asked (each judged, when asked: `judged`), a listing for each
 *  folder, and an answer for each job. */
export interface LookAnswer {
  stats: PathStat[];
  judged?: PathVerdict[];
  listings: (FolderListing | JudgedListing)[];
  jobs: LookJobAnswer[];
}

type Timers = Pick<typeof globalThis, "setTimeout" | "clearTimeout">;
type Timer = ReturnType<typeof setTimeout>;
type DiskThread = {
  requests: WorkerRequests;
  busy: boolean;
  walking: boolean;
  background: boolean;
  idle: Timer | null;
};
/** A request waiting for a thread; a walk's, once it has waited a look's deadline, `urgent`; a background look's
 *  (`background`); and its timers. */
type Waiting = {
  walk: boolean;
  urgent: boolean;
  background: boolean;
  timers: Timer[];
  resolve: (t: DiskThread) => void;
  reject: (err: Error) => void;
};
type DiskAsk = DiskRequest extends infer R ? (R extends unknown ? Omit<R, "context"> : never) : never;

const stopped = () => new WorkerRequestError("worker request cancelled", "stopped");
const pastDeadline = () => new WorkerRequestError("worker request deadline exceeded", "deadline");

/**
 * The disk threads (SD-D2): the explorer's listing threads (T12) grown into what every read of the vault open asks of
 * the disk off the main thread — a folder listed, paths statted, a file's text read, a folder's access, the vault
 * walked (list-worker.ts, disk-jobs.ts). Two, apart from the walk's, each started on its first request. One request at a
 * time on each: the others wait in one line, each going, in the order asked, to the first thread free — never behind
 * one that doesn't answer while the other is free. A walk takes a thread only while the other is left free for the
 * rest; until then it waits, and those asked after it go past it, a second walk waiting behind it. Once it has waited a
 * look's deadline it's passed no more: it takes the next thread free, unless the other is walking. Its deadline counts
 * from when it was asked, waiting included, so it's answered or fails `deadline`, never left waiting. A background
 * look's requests (the watcher's) take a thread only while no other background request holds one: one at a time, the
 * rest going past them meanwhile, so what a key asks never waits behind the watcher's on both threads.
 */
export class DiskThreads {
  private readonly pool: DiskThread[];
  /** Requests waiting for a thread, in the order asked. */
  private readonly line: Waiting[] = [];
  private closed = false;
  readonly deadlines: Readonly<Record<Asker, number>>;
  private readonly timers: Timers;
  private readonly now: () => number;
  private readonly idleMs: number;

  /** `timers` and `now`: the clock a thread's idle minute and a walk's wait are counted on, a test's own. */
  constructor(
    factory: () => Worker = () => new Worker(workerUrl("workspace/walk/list-worker.ts")),
    opts: {
      deadlines?: Readonly<Record<Asker, number>>;
      size?: number;
      timers?: Timers;
      now?: () => number;
      idleMs?: number;
    } = {},
  ) {
    this.deadlines = opts.deadlines ?? DISK_DEADLINES;
    this.timers = opts.timers ?? globalThis;
    this.now = opts.now ?? (() => performance.now());
    this.idleMs = opts.idleMs ?? IDLE_MS;
    this.pool = Array.from({ length: opts.size ?? 2 }, () => ({
      requests: new WorkerRequests(factory, { result: Infinity }),
      busy: false,
      walking: false,
      background: false,
      idle: null,
    }));
  }

  /** Requests waiting for a thread now (tests). */
  get waiting(): number {
    return this.line.length;
  }

  /** The folder `dir` listed (`listFolder`), `walk` the settings a busy folder is decided by, `hidden` `files.hidden`;
   *  the explorer's, unless a look asks. */
  async list(dir: string, walk: Config["walk"], hidden: boolean, by: Asker = "explorer"): Promise<FolderListing> {
    return (await this.ask<{ listing: FolderListing }>({ op: "list", dir, walk, hidden }, by)).listing;
  }

  /** Each of `paths` statted, its links followed (or its own, `own`), in the order asked; each its error's code if it
   *  has one. */
  async stat(paths: string[], by: Asker, own = false): Promise<PathStat[]> {
    return (await this.ask<{ stats: PathStat[] }>({ op: "stat", paths, ...(own ? { own } : {}) }, by)).stats;
  }

  /** A file's text, decoded as `readText` decodes it, and its stamp; or its error's code (`ENOTREG`: not a file). */
  async read(path: string, by: Asker): Promise<ReadAnswer> {
    return (await this.ask<{ read: ReadAnswer }>({ op: "read", path }, by)).read;
  }

  /** Why the folder `dir` can't be listed and gone into, in `folderUnreadable`'s words; null when it can. */
  async access(dir: string, by: Asker): Promise<string | null> {
    return (await this.ask<{ access: string | null }>({ op: "access", dir }, by)).access;
  }

  /** The vault open walked for a build (`WalkAsk`), with a walk's deadline. */
  async walk(ask: WalkAsk): Promise<WalkAnswer> {
    return (await this.ask<{ walked: WalkAnswer }>({ op: "walk", ask }, "walk")).walked;
  }

  /**
   * A look's batch (SD-D8): one `stat` of every path — with the TUI's look's jobs, one request of both (SD-T4) — and a
   * `list` of each folder, asked together, each with a look's deadline — in the background, one at a time
   * (`background`). Answered once all have; failed once one gives up, those still waiting for a thread withdrawn.
   */
  async look(batch: LookAsk): Promise<LookAnswer> {
    const giveUp = new AbortController();
    const background = batch.background === true;
    const { paths = [], own = false, judge } = batch.stat ?? {};
    const stat: StatAsk = { paths, ...(own ? { own } : {}), ...(judge ? { judge } : {}) };
    const jobs = batch.jobs ?? [];
    const stats: Promise<StatAnswer & { jobs?: LookJobAnswer[] }> = jobs.length
      ? this.ask<LookRequestAnswer>({ op: "look", stat, jobs }, "look", giveUp, background)
      : paths.length
        ? this.ask<StatAnswer>({ op: "stat", ...stat }, "look", giveUp, background)
        : Promise.resolve({ stats: [] });
    const lists = (batch.list ?? []).map((l) =>
      this.ask<{ listing: FolderListing | JudgedListing }>({ op: "list", ...l }, "look", giveUp, background),
    );
    const [answered, ...listed] = await Promise.all([stats, ...lists] as const);
    const judged = answered.judged ? { judged: answered.judged } : {};
    return { stats: answered.stats, ...judged, listings: listed.map((l) => l.listing), jobs: answered.jobs ?? [] };
  }

  /** A request on a thread that's free, once one is, with what this thread knows (`walkContext`) as it's sent; its
   *  deadline its asker's, counted from then — a walk's from when it was asked. One of a batch that fails gives the
   *  batch up (`batch`) before its thread is free for the next: the rest of it still waiting for one withdrawn, never
   *  sent, and what of it was sent given up, its thread started afresh, as past a deadline. A background request
   *  (`background`) waits while another holds a thread. */
  private async ask<A>(request: DiskAsk, by: Asker, batch?: AbortController, background = false): Promise<A> {
    const walk = request.op === "walk";
    const asked = this.now();
    const on = await this.take(walk, batch?.signal, background);
    try {
      const deadline = this.deadlines[by] - (walk ? this.now() - asked : 0);
      if (deadline <= 0) throw pastDeadline();
      return await on.requests.request<A>(
        { ...request, context: walkContext() },
        { deadline, bytes: 0, ...(batch ? { signal: batch.signal } : {}) },
      );
    } catch (err) {
      batch?.abort();
      throw err;
    } finally {
      this.free(on);
    }
  }

  /** A thread that's free, taken; or a place in the line, until one is — withdrawn when `signal` gives up first. A
   *  walk's place: passed no more once it has waited a look's deadline, and given up at its own. */
  private take(walk: boolean, signal?: AbortSignal, background = false): Promise<DiskThread> {
    if (this.closed) return Promise.reject(stopped());
    return new Promise((resolve, reject) => {
      const waiting: Waiting = { walk, urgent: false, background, timers: [], resolve, reject };
      this.line.push(waiting);
      signal?.addEventListener(
        "abort",
        () => this.leave(waiting) && reject(new WorkerRequestError("worker request cancelled", "cancelled")),
        { once: true },
      );
      if (walk) {
        const urgent = () => {
          waiting.urgent = true;
          this.dispatch();
        };
        const giveUp = () => this.leave(waiting) && reject(pastDeadline());
        waiting.timers = [this.after(this.deadlines.look, urgent), this.after(this.deadlines.walk, giveUp)];
      }
      this.dispatch();
    });
  }

  /** `run` after `ms` on this pool's clock, keeping no process alive. */
  private after(ms: number, run: () => void): Timer {
    const timer = this.timers.setTimeout(run, ms);
    (timer as { unref?: () => void }).unref?.();
    return timer;
  }

  /** `waiting` out of the line, its timers cleared; whether it was in it. */
  private leave(waiting: Waiting): boolean {
    for (const t of waiting.timers.splice(0)) this.timers.clearTimeout(t);
    const at = this.line.indexOf(waiting);
    if (at >= 0) this.line.splice(at, 1);
    return at >= 0;
  }

  /** Each request in the line, in order, to the first thread free: a walk only while another is left free, the rest
   *  going past it meanwhile — or, once it has waited a look's deadline, while the other isn't walking; a background
   *  request only while no other holds a thread. */
  private dispatch(): void {
    const keep = Math.min(2, this.pool.length);
    for (let i = 0; i < this.line.length; ) {
      const free = this.pool.filter((t) => !t.busy);
      if (!free.length) return;
      const next = this.line[i]!;
      const walkWaits = next.walk && free.length < keep && !(next.urgent && !this.pool.some((t) => t.walking));
      if (walkWaits || (next.background && this.pool.some((t) => t.background))) {
        i++;
        continue;
      }
      this.leave(next);
      const t = free[0]!;
      t.busy = true;
      t.walking = next.walk;
      t.background = next.background;
      if (t.idle) this.timers.clearTimeout(t.idle);
      t.idle = null;
      next.resolve(t);
    }
  }

  /** A thread's request settled: the thread to the next in line, or free — let go of after `idleMs` if none asks. */
  private free(t: DiskThread): void {
    t.busy = false;
    t.walking = false;
    t.background = false;
    if (this.closed) return;
    this.dispatch();
    if (t.busy) return;
    const idle = this.after(this.idleMs, () => {
      if (t.idle !== idle) return;
      t.idle = null;
      if (!t.busy) t.requests.stop();
    });
    t.idle = idle;
  }

  /** Stopped for good (the TUI quitting; the next `diskThreads` makes others): a request asked before, or waiting, is
   *  refused, never a thread started again for it. */
  stop(): void {
    this.closed = true;
    for (const t of this.pool) {
      if (t.idle) this.timers.clearTimeout(t.idle);
      t.idle = null;
      t.requests.dispose();
    }
    for (const w of [...this.line]) if (this.leave(w)) w.reject(stopped());
  }
}

let shared: { walk: WalkThread | null; disk: DiskThreads | null } = { walk: null, disk: null };
let made: { factory: () => Worker; deadlines?: typeof WALK_DEADLINES } | null = null;

/** The TUI's walk thread, started when it's first asked. */
export function walkThread(): WalkThread {
  shared.walk ??= made ? new WalkThread(made.factory, made.deadlines) : new WalkThread();
  return shared.walk;
}

/** The TUI's disk threads, each started when it's first asked. A test's deadlines (`setWalkWorker`) are each asker's
 *  the whole walk's, as the stand-in's are. */
export function diskThreads(): DiskThreads {
  const whole = made?.deadlines?.whole;
  const deadlines = whole === undefined ? undefined : { look: whole, key: whole, explorer: whole, walk: whole };
  shared.disk ??= new DiskThreads(made?.factory, deadlines ? { deadlines } : {});
  return shared.disk;
}

/** The walk's thread and the disk threads stopped (the TUI quitting); the next ask starts them again. */
export function stopWalkThreads(): void {
  shared.walk?.stop();
  shared.disk?.stop();
  shared = { walk: null, disk: null };
}

/** A test's worker for the walk's thread and the disk threads (one held up on purpose), and its deadlines; null, the
 *  walk worker again. */
export function setWalkWorker(factory: (() => Worker) | null, deadlines?: typeof WALK_DEADLINES): void {
  stopWalkThreads();
  made = factory ? { factory, ...(deadlines ? { deadlines } : {}) } : null;
}
