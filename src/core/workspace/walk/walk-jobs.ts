// What the walk's thread does (T12; walk-worker.ts starts it): each request walked as walk.ts and home.ts walk on the
// thread that asks — the same code, so the walk takes the same files in the same order — with what that thread knows
// and this one can't see for itself (`WalkContext`) taken first. Home's walk is kept here between its slices, as the
// TUI steps it, so it rests while you work, as it does on the thread that asks. The explorer's listings have threads
// of their own (list-worker.ts); a listing asked here (`list`) is answered the same, for a test's worker serving both.

import type { Config } from "../../application/config/config.ts";
import { type HomeWalk, homeWalk, vaultsPastCap } from "../vaults/home.ts";
import { type IndexAnswer, IndexJob, type IndexOf } from "../../index-job.ts";
import { type FolderListing, listFolder } from "./listing.ts";
import { type FilterSettings, filterFrom, SlicedWalk, type WalkLimits, type WalkResult } from "./walk.ts";
import { type IndexAsk, nestedIn, type PastCap } from "./walkers.ts";
import { enterContext, type WalkContext } from "../../foundation/workers/worker-context.ts";

export type WalkRequest = { context: WalkContext } & (
  | { op: "step"; walk: number; budget: number; start?: { filter: FilterSettings; limits?: WalkLimits } }
  | { op: "index"; job: number; budget: number; start?: IndexAsk }
  | { op: "home"; loc: { root: string; key: string }; filter: FilterSettings; asked: string[]; limits?: WalkLimits }
  | { op: "seek"; dir: string; filter: FilterSettings }
  | { op: "list"; dir: string; walk: Config["walk"]; hidden: boolean }
);

export type StepAnswer =
  | { done: false }
  | { done: true; capped: SlicedWalk["capped"]; rest: string[]; nested: string[] };

/** Home's walks under way here, and the indexes, by their number: a few at most, the oldest let go (its asker gone, or
 *  started over). */
const walks = new Map<number, { walk: SlicedWalk; signature: string }>();
const indexes = new Map<number, IndexJob>();
/** Home's walks done, kept here for the index built from them (`walkOn`): never sent across and back. With each, its
 *  filter's signature: what it was walked under. */
const done = new Map<number, { walk: WalkResult; capped: SlicedWalk["capped"]; signature: string }>();
const KEPT = 4;

/** `job` kept under `n`, the oldest let go of past the few kept. */
function keep<T>(jobs: Map<number, T>, n: number, job: T): T {
  jobs.set(n, job);
  for (const k of jobs.keys()) if (jobs.size > KEPT) jobs.delete(k);
  return job;
}

/** An index asked of a walk kept here (`walkOn`): that walk, let go of once handed on. */
function homeWalkOf(of: IndexAsk): IndexOf {
  if (!("home" in of) || !("walkOn" in of.home)) return of as IndexOf;
  const kept = done.get(of.home.walkOn);
  if (!kept) throw new Error("the walk was let go of on its thread");
  done.delete(of.home.walkOn);
  const home = { walk: kept.walk, walked: of.home.walked, capped: kept.capped, signature: kept.signature };
  return { root: of.root, home, config: of.config };
}

/** A request answered: what it asked for, walked here. */
export function answerWalk(
  req: WalkRequest,
): StepAnswer | IndexAnswer | { home: HomeWalk } | PastCap | { listing: FolderListing } {
  enterContext(req.context);
  switch (req.op) {
    case "step": {
      let made = walks.get(req.walk);
      if (!made && req.start) {
        const filter = filterFrom(req.start.filter);
        const walk = new SlicedWalk(req.start.filter.root, filter, req.start.limits);
        made = keep(walks, req.walk, { walk, signature: filter.signature() });
      }
      if (!made) throw new Error("the walk was let go of on its thread");
      const { walk, signature } = made;
      if (walk.step(req.budget)) return { done: false };
      walks.delete(req.walk);
      keep(done, req.walk, { walk: walk.result!, capped: walk.capped, signature });
      return { done: true, capped: walk.capped, rest: walk.rest(), nested: nestedIn(walk.result) };
    }
    case "index": {
      let job = indexes.get(req.job);
      if (!job && req.start) job = keep(indexes, req.job, new IndexJob(homeWalkOf(req.start)));
      if (!job) throw new Error("the index was let go of on its thread");
      const answer = job.step(req.budget);
      if (!answer.vault || answer.done) indexes.delete(req.job);
      return answer;
    }
    case "home":
      return { home: homeWalk(req.loc, filterFrom(req.filter), req.asked, req.limits, false) };
    case "seek":
      return vaultsPastCap(req.dir, filterFrom(req.filter));
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
