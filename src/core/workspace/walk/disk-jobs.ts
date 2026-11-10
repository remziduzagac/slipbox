// What the disk threads answer (SD-D2; `DiskThreads` in walk-thread.ts asks, list-worker.ts serves, and walk-jobs.ts's
// `answerWalk` too, for a test's worker serving both): a folder listed, a batch of paths statted, a file's text read, a
// folder's access, the vault open walked. Each is read as the thread that asks would read it — the same code, through
// the seam (SD-D10) — with what that thread knows and this one can't see for itself (`walkContext`) taken first. A
// path's own error is its answer, by its code; the request fails only when its thread does (a deadline, a crash). The
// watcher's stats and listings are judged with the walk's filter as they're read (`judge`: graph/watch/judging.ts). The
// TUI's look's own jobs (a way, git's state, the config, a tool's settings) are look-jobs.ts's, asked with its stats as
// one request (`look`).

import type { Config } from "../../application/config/config.ts";
import * as disk from "../../foundation/platform/disk.ts";
import { type DecodedFile, folderUnreadable, readTextStamped, type Stamp } from "../../foundation/platform/fsutil.ts";
import { enterContext, type WalkContext } from "../../foundation/workers/worker-context.ts";
import {
  type JudgeBy,
  type JudgedListing,
  judgeContextFor,
  judgeListing,
  judgePath,
  type ListJudge,
  type PathVerdict,
} from "../graph/watch/judging.ts";
import { homeWalk } from "../vaults/home.ts";
import type { HomeWalk } from "../vaults/home/contracts.ts";
import type { FilterSettings, WalkLimits, WalkResult } from "./contracts.ts";
import { filterFrom } from "./filtering/filter.ts";
import { codeOf, type PathStat, statOf } from "./io/stamps.ts";
import { type FolderListing, listFolder } from "./listing.ts";
import { answerLookJob, type LookJob, type LookJobAnswer } from "./look-jobs.ts";
import { listDirectory, walkVault } from "./traversal/walk.ts";

export type { PathStat };

/** A file read: its text decoded as `readText` decodes it, and the stamp of the file that text was read from (one
 *  open); or its error's code — `ENOTREG` for a FIFO, a device or a folder, refused as `readRegular` refuses them. */
export type ReadAnswer = (DecodedFile & { stamp: Stamp | null }) | { error: string };

/** The vault open's walk for a build (SD-T8): walked whole (`walkVault`), its top listed (`listDirectory`, Elsewhere),
 *  or home's walk kept brought up to now with the folders asked for (`homeWalk`, what changed handed back unkept); with
 *  its index's text and stamp when `index` names it. */
export interface WalkAsk {
  how: "vault" | "listed" | "home";
  filter: FilterSettings;
  home?: { key: string; asked: string[]; limits?: WalkLimits };
  index?: string;
}

/** A walk answered: the walk; home's own besides it, for home; the index's text (null: none read) and its stamp, as
 *  `GraphRefresh` words it (`mtime:size`, "" for none), stamped before it's read. */
export interface WalkAnswer {
  walk: WalkResult;
  home?: Omit<HomeWalk, "walk">;
  index?: { text: string | null; stamp: string };
}

/** A folder listed: for the explorer (`walk`, `hidden`), or for the watcher, judged (`judge`: SD-T3). */
export type ListAsk = { dir: string; walk: Config["walk"]; hidden: boolean } | { dir: string; judge: ListJudge };

/** Paths statted: links followed, or their own (`own`); for the watcher's settle, each judged too (`judge`). */
export interface StatAsk {
  paths: string[];
  own?: boolean;
  judge?: JudgeBy;
}

/** Paths statted, in the order asked; each judged too, when asked (`judged`). */
export interface StatAnswer {
  stats: PathStat[];
  judged?: PathVerdict[];
}

/** The TUI's look's jobs and its stats, asked as one request: one thread held by a look, however much it asks (SD-T4). */
export interface LookRequest {
  stat?: StatAsk;
  jobs: LookJob[];
}

/** A look's request answered: each job's answer, then its stats. */
export type LookRequestAnswer = StatAnswer & { jobs: LookJobAnswer[] };

export type DiskRequest = { context: WalkContext } & (
  | ({ op: "list" } & ListAsk)
  | ({ op: "stat" } & StatAsk)
  | { op: "read"; path: string }
  | { op: "access"; dir: string }
  | { op: "walk"; ask: WalkAsk }
  | ({ op: "look" } & LookRequest)
);

export type DiskAnswer =
  | { listing: FolderListing | JudgedListing }
  | StatAnswer
  | { read: ReadAnswer }
  | { access: string | null }
  | { walked: WalkAnswer }
  | LookRequestAnswer;

const DISK_OPS: ReadonlySet<string> = new Set(["list", "stat", "read", "access", "walk", "look"]);

/** Whether `req` is one the disk threads answer. */
export const isDiskRequest = (req: { op: string }): req is DiskRequest => DISK_OPS.has(req.op);

/** A file's text and its stamp, both of the one file opened: a save renamed over it meanwhile is neither's. */
function readOf(path: string): ReadAnswer {
  try {
    return readTextStamped(path);
  } catch (err) {
    return { error: codeOf(err) };
  }
}

/** The index's stamp, then its text: written in between, it's newer than its stamp says, and read again. */
function indexOf(path: string): { text: string | null; stamp: string } {
  let at = "";
  try {
    const st = disk.stat(path);
    at = `${st.mtimeMs}:${st.size}`;
  } catch {}
  try {
    return { text: disk.readFile(path).toString("utf8"), stamp: at };
  } catch {
    return { text: null, stamp: at };
  }
}

/** Paths statted, each judged too when `judge` asks. */
function statsOf(ask: StatAsk): StatAnswer {
  const stats = ask.paths.map((p) => statOf(p, ask.own === true));
  if (!ask.judge) return { stats };
  const ctx = judgeContextFor(ask.judge);
  return { stats, judged: ask.paths.map((p, i) => judgePath(p, stats[i]!, ctx)) };
}

function walkOf(ask: WalkAsk): WalkAnswer {
  const filter = filterFrom(ask.filter);
  const index = ask.index === undefined ? {} : { index: indexOf(ask.index) };
  if (ask.how === "home") {
    const { key, asked, limits } = ask.home ?? { key: "", asked: [] };
    const { walk, ...home } = homeWalk({ root: ask.filter.root, key }, filter, asked, limits, false);
    return { walk, home, ...index };
  }
  const walk = ask.how === "listed" ? listDirectory(ask.filter.root, filter) : walkVault(ask.filter.root, filter);
  return { walk, ...index };
}

/** A request answered here: what it asked for, read as the thread that asked would. */
export function answerDisk(req: DiskRequest): DiskAnswer {
  enterContext(req.context);
  switch (req.op) {
    case "list":
      if ("judge" in req) return { listing: judgeListing(req.dir, req.judge.how, judgeContextFor(req.judge)) };
      return { listing: listFolder(req.dir, req.walk, req.hidden) };
    case "stat":
      return statsOf(req);
    case "read":
      return { read: readOf(req.path) };
    case "access":
      return { access: folderUnreadable(req.dir) };
    case "walk":
      return { walked: walkOf(req.ask) };
    case "look": {
      // Its jobs first: git's state is asked before the stats of what it found (D153).
      const jobs = req.jobs.map(answerLookJob);
      return { ...statsOf(req.stat ?? { paths: [] }), jobs };
    }
  }
}
