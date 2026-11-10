// How the watcher's reads are answered (SD-D8, SD-T3). The watcher's logic asks what it reads as a look — a generator
// that yields each batch it needs (a `stat` of every path, a `list` of each folder) and goes on with the answer — so the
// same logic runs either way: on the disk threads (the TUI's), the screen's thread asking and going on when they answer;
// or here, at once, each batch answered as it's asked (a test's watcher, a test's App: SD-D10). Either way the answers
// come from the same code (judging.ts), and the watcher compares them with what it knows when they come.

import type { PathStat } from "../../walk/io/stamps.ts";
import { statOf } from "../../walk/io/stamps.ts";
import { type DiskThreads, diskThreads } from "../../walk/walk-thread.ts";
import type { ListAsk, StatAsk } from "../../walk/disk-jobs.ts";
import {
  type JudgeContext,
  type JudgedListing,
  judgeListing,
  judgePath,
  type ListJudge,
  type PathVerdict,
} from "./judging.ts";

/** A batch the watcher asks: one `stat` of every path, and a judged `list` of each folder (SD-T2's look). */
export interface WatchAsk {
  stat?: StatAsk;
  list?: { dir: string; judge: ListJudge }[];
}

/** A batch answered: the stats in the order asked, each judged when asked, and each folder's judged listing. */
export interface WatchAnswer {
  stats: PathStat[];
  judged?: PathVerdict[];
  listings: JudgedListing[];
}

/** A look's logic: what it asks, yielded batch by batch, and what it comes to. */
export type Look<R = void> = Generator<WatchAsk, R, WatchAnswer>;

/** Where the watcher's reads are made: here, at once (`here`), or on the disk threads. */
export interface WatchReads {
  readonly here: boolean;
  ask(batch: WatchAsk): WatchAnswer | Promise<WatchAnswer>;
}

const nothing = (batch: WatchAsk): boolean => !batch.stat?.paths.length && !batch.list?.length;

/** A batch answered here, at once, on the thread that asks: as a disk thread would answer it, with `ctx`'s filter. */
export function answerHere(batch: WatchAsk, ctx: JudgeContext): WatchAnswer {
  const { paths = [], own = false, judge } = batch.stat ?? {};
  const stats = paths.map((p) => statOf(p, own));
  const listings = (batch.list ?? []).map((l) => judgeListing(l.dir, l.judge.how, ctx));
  if (!judge) return { stats, listings };
  return { stats, judged: paths.map((p, i) => judgePath(p, stats[i]!, ctx)), listings };
}

/** Reads made here, at once, judged by the watcher's own filter (`ctx`, asked as each batch is). */
export function readsHere(ctx: () => JudgeContext): WatchReads {
  return { here: true, ask: (batch) => answerHere(batch, ctx()) };
}

/** Reads made on the disk threads (`diskThreads`, the TUI's): each batch a look's, with a look's deadline (SD-D6). */
export function readsOnThreads(threads: () => DiskThreads = diskThreads): WatchReads {
  return {
    here: false,
    ask: async (batch) => {
      const { list, ...rest } = batch;
      const asked: { stat?: StatAsk; list?: ListAsk[] } = { ...rest, ...(list ? { list } : {}) };
      return (await threads().look(asked)) as WatchAnswer;
    },
  };
}

/** A look run to its end here, each batch answered at once: what it comes to. */
export function runHere<R>(look: Look<R>, ctx: JudgeContext): R {
  let r = look.next();
  while (!r.done) r = look.next(nothing(r.value) ? { stats: [], listings: [] } : answerHere(r.value, ctx));
  return r.value;
}

/** How a look ended: done; dropped, the world it was asked in gone (closed, or synced since: SD-D5); failed, a batch
 *  given up on (SD-D6) — with why. */
export type LookEnd = { how: "done" } | { how: "dropped" } | { how: "failed"; error: Error };

/**
 * A look driven to its end: each batch asked of `reads` — answered at once here, or awaited from a thread — and the
 * look going on with each answer, while `current` says the world it was asked in still is (else it's dropped). A batch
 * that asks nothing is answered at once. `answered` is told of each answer a thread gives; `end` of how it ended, once.
 * Ended early, the look is returned from, so its `finally` blocks see it go (`ending` says why while they run). A look
 * that throws (a fault of its own, not the disk's) ends, dropped, and the fault is thrown on.
 */
export function drive(
  look: Look,
  reads: WatchReads,
  current: () => boolean,
  hooks: { answered: () => void; ending: (how: LookEnd["how"] | null) => void; end: (e: LookEnd) => void },
): void {
  let over = false;
  const end = (e: LookEnd) => {
    if (over) return;
    over = true;
    hooks.end(e);
  };
  const stop = (e: LookEnd) => {
    hooks.ending(e.how);
    try {
      look.return();
    } finally {
      hooks.ending(null);
      end(e);
    }
  };
  const go = (answer?: WatchAnswer): void => {
    try {
      let r = answer === undefined ? look.next() : look.next(answer);
      for (;;) {
        if (r.done) return end({ how: "done" });
        const batch = r.value;
        if (nothing(batch)) {
          r = look.next({ stats: [], listings: [] });
          continue;
        }
        const asked = reads.ask(batch);
        if (!(asked instanceof Promise)) {
          r = look.next(asked);
          continue;
        }
        asked.then(
          (a) => {
            hooks.answered();
            if (!current()) return stop({ how: "dropped" });
            go(a);
          },
          (error: Error) => stop(current() ? { how: "failed", error } : { how: "dropped" }),
        );
        return;
      }
    } catch (err) {
      end({ how: "dropped" });
      throw err;
    }
  };
  go();
}
