// What the walk's thread does (T12; walk-worker.ts starts it): each request walked as walk.ts and home.ts walk on the
// thread that asks — the same code, so the walk takes the same files in the same order — with what that thread knows
// and this one can't see for itself (`WalkContext`) taken first. Home's walk is kept here between its slices, as the
// TUI steps it, so it rests while you work, as it does on the thread that asks. The explorer's listings have threads
// of their own (list-worker.ts); a listing asked here (`list`) is answered the same, for a test's worker serving both.

import type { Config } from "./config.ts";
import { type HomeWalk, homeWalk, vaultsPastCap } from "./home.ts";
import { type IndexAnswer, IndexJob, type IndexOf } from "./index-job.ts";
import { type FolderListing, listFolder } from "./listing.ts";
import { SlicedWalk, WalkFilter, type WalkLimits, type WalkResult } from "./walk.ts";
import type { PastCap } from "./walkers.ts";
import { enterContext, type WalkContext } from "./worker-context.ts";

/** What makes a filter (`WalkFilter.settings`): it's made again here from it. */
export type FilterSettings = WalkFilter["settings"];

export type WalkRequest = { context: WalkContext } & (
  | { op: "step"; walk: number; budget: number; start?: { filter: FilterSettings; limits?: WalkLimits } }
  | { op: "drop"; walk: number }
  | { op: "index"; job: number; budget: number; start?: IndexOf }
  | { op: "home"; loc: { root: string; key: string }; filter: FilterSettings; asked: string[]; limits?: WalkLimits }
  | { op: "seek"; dir: string; filter: FilterSettings }
  | { op: "list"; dir: string; walk: Config["walk"]; hidden: boolean }
);

export type StepAnswer =
  | { done: false }
  | { done: true; result: WalkResult; capped: SlicedWalk["capped"]; rest: string[] };

/** Home's walks under way here, and the indexes, by their number: a few at most, the oldest let go (its asker gone, or
 *  started over). */
const walks = new Map<number, SlicedWalk>();
const indexes = new Map<number, IndexJob>();
const KEPT = 4;

/** `job` kept under `n`, the oldest let go of past the few kept. */
function keep<T>(jobs: Map<number, T>, n: number, job: T): T {
  jobs.set(n, job);
  for (const k of jobs.keys()) if (jobs.size > KEPT) jobs.delete(k);
  return job;
}

const filterOf = (s: FilterSettings) => new WalkFilter(s.root, s.walk, s.opts);

/** A request answered: what it asked for, walked here. */
export function answerWalk(
  req: WalkRequest,
): StepAnswer | IndexAnswer | { home: HomeWalk } | PastCap | { listing: FolderListing } | { dropped: true } {
  enterContext(req.context);
  switch (req.op) {
    case "step": {
      let walk = walks.get(req.walk);
      if (!walk && req.start)
        walk = keep(
          walks,
          req.walk,
          new SlicedWalk(req.start.filter.root, filterOf(req.start.filter), req.start.limits),
        );
      if (!walk) throw new Error("the walk was let go of on its thread");
      if (walk.step(req.budget)) return { done: false };
      walks.delete(req.walk);
      return { done: true, result: walk.result!, capped: walk.capped, rest: walk.rest() };
    }
    case "drop":
      walks.delete(req.walk);
      indexes.delete(req.walk);
      return { dropped: true };
    case "index": {
      let job = indexes.get(req.job);
      if (!job && req.start) job = keep(indexes, req.job, new IndexJob(req.start));
      if (!job) throw new Error("the index was let go of on its thread");
      const answer = job.step(req.budget);
      if (!answer.vault || answer.done) indexes.delete(req.job);
      return answer;
    }
    case "home":
      return { home: homeWalk(req.loc, filterOf(req.filter), req.asked, req.limits, false) };
    case "seek":
      return vaultsPastCap(req.dir, filterOf(req.filter));
    case "list":
      return { listing: listFolder(req.dir, req.walk, req.hidden) };
  }
}

/** The walk's thread at work: each request answered in turn, under its number; one that fails says why. */
export function serveWalks(scope: { onmessage: unknown; postMessage(message: unknown): void }): void {
  scope.onmessage = (e: MessageEvent<WalkRequest & { id: number }>) => {
    const { id } = e.data;
    try {
      scope.postMessage({ id, ...answerWalk(e.data) });
    } catch (err) {
      scope.postMessage({ id, error: (err as Error).message ?? String(err) });
    }
  };
}
