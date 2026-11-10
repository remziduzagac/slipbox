// What the disk threads answer (SD-D2; `DiskThreads` in walk-thread.ts asks, list-worker.ts serves, and walk-jobs.ts's
// `answerWalk` too, for a test's worker serving both): a folder listed, a batch of paths statted, a file's text read, a
// folder's access, the vault open walked. Each is read as the thread that asks would read it — the same code, through
// the seam (SD-D10) — with what that thread knows and this one can't see for itself (`walkContext`) taken first. A
// path's own error is its answer, by its code; the request fails only when its thread does (a deadline, a crash). The
// watcher's stats and listings are judged with the walk's filter as they're read (`judge`: graph/watch/judging.ts), and
// so are the entries of the explorer's folders of the vault open's own tree (`own`, SD-T7), by the same filter. The
// TUI's look's own jobs (a way, git's state, the config, a tool's settings) are look-jobs.ts's, asked with its stats as
// one request (`look`); slipbox's own folders' reads (SD-T9), own-jobs.ts's (`own`).

import type { Config } from "../../application/config/config.ts";
import * as disk from "../../foundation/platform/disk.ts";
import {
  type DecodedFile,
  folderUnreadable,
  readText,
  readTextStamped,
  type Stamp,
} from "../../foundation/platform/fsutil.ts";
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
import { contentHash } from "../links/redirects.ts";
import { homeWalk } from "../vaults/home.ts";
import type { HomeWalk } from "../vaults/home/contracts.ts";
import type { FilterSettings, WalkLimits, WalkResult } from "./contracts.ts";
import { filterFrom } from "./filtering/filter.ts";
import { codeOf, type PathStat, statOf } from "./io/stamps.ts";
import { type FolderListing, listFolder } from "./listing.ts";
import { answerLookJob, type LookJob, type LookJobAnswer } from "./look-jobs.ts";
import { answerOwnJob, type OwnAnswer, type OwnJob } from "./own-jobs.ts";
import { listDirectory, walkVault } from "./traversal/walk.ts";
import { answerGit, answerOpen, type GitAnswer, type GitAsk, type OpenAnswer, type OpenAsk } from "./key-jobs.ts";

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

/**
 * The index read for a build, after its walk (SD-T8): its text (null: none read) and its stamp, as `GraphRefresh` words
 * it (`mtime:size`, "" for none), stamped before it's read; and, by their paths, the hashes of the texts of the notes
 * the walk found that the index hasn't, of a size one it has and the walk no longer finds has — what a move found as
 * it's built is told by (`detectMoves`), read with the walk rather than where it's built.
 */
export interface IndexRead {
  text: string | null;
  stamp: string;
  hashes?: Record<string, string>;
}

/** A walk answered: the walk; home's own besides it, for home; the index read after it, when asked. */
export interface WalkAnswer {
  walk: WalkResult;
  home?: Omit<HomeWalk, "walk">;
  index?: IndexRead;
}

/** A folder of the vault open's own tree listed for the explorer (SD-T7): by its walk's filter, and the names of the
 *  notes its walk gave in it (`walked`), whose size isn't looked at. */
export type OwnList = JudgeBy & { walked?: string[] };

/** A folder listed: for the explorer (`walk`, `hidden`; a folder of the vault open's own tree, `own`), or for the
 *  watcher, judged (`judge`: SD-T3). */
export type ListAsk =
  | { dir: string; walk: Config["walk"]; hidden: boolean; own?: OwnList }
  | { dir: string; judge: ListJudge };

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
  | { op: "open"; ask: OpenAsk }
  | { op: "gitRead"; ask: GitAsk }
  | { op: "own"; job: OwnJob }
);

export type DiskAnswer =
  | { listing: FolderListing | JudgedListing }
  | StatAnswer
  | { read: ReadAnswer }
  | { access: string | null }
  | { walked: WalkAnswer }
  | LookRequestAnswer
  | { opened: OpenAnswer }
  | { gitRead: GitAnswer }
  | { own: OwnAnswer };

const DISK_OPS: ReadonlySet<string> = new Set([
  "list",
  "stat",
  "read",
  "access",
  "walk",
  "look",
  "open",
  "gitRead",
  "own",
]);

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

/** The index at `path` read for a build after `walk`: its stamp, then its text — written in between, it's newer than its
 *  stamp says, and read again — and the hashes a move found as it's built is told by (`IndexRead`). */
export function indexRead(path: string, walk: WalkResult): IndexRead {
  let stamp = "";
  try {
    const st = disk.stat(path);
    stamp = `${st.mtimeMs}:${st.size}`;
  } catch {}
  let text: string;
  try {
    text = disk.readFile(path).toString("utf8");
  } catch {
    return { text: null, stamp };
  }
  const hashes = movedHashes(text, walk);
  return { text, stamp, ...(hashes ? { hashes } : {}) };
}

/** The hashes of the texts of the notes `walk` found that the index `text` hasn't, of a size one it has that the walk
 *  no longer finds has (`detectMoves`'s candidates, a few at most); one that can't be read has none. None: no such
 *  note. */
function movedHashes(text: string, walk: WalkResult): Record<string, string> | undefined {
  let entries: Record<string, { size?: number; hash?: string }> = {};
  try {
    entries = (JSON.parse(text) as { entries?: typeof entries } | null)?.entries ?? {};
  } catch {}
  const found = new Set(walk.files.map((f) => f.rel));
  const sizes = new Set<number>();
  for (const [rel, e] of Object.entries(entries)) if (!found.has(rel) && e?.hash && e.size) sizes.add(e.size);
  if (!sizes.size) return undefined;
  const hashes: Record<string, string> = {};
  for (const f of walk.files) {
    if (Object.hasOwn(entries, f.rel) || !sizes.has(f.size)) continue;
    try {
      hashes[f.rel] = contentHash(readText(f.abs).text);
    } catch {}
  }
  return Object.keys(hashes).length ? hashes : undefined;
}

/** Paths statted, each judged too when `judge` asks. */
function statsOf(ask: StatAsk): StatAnswer {
  const stats = ask.paths.map((p) => statOf(p, ask.own === true));
  if (!ask.judge) return { stats };
  const ctx = judgeContextFor(ask.judge);
  return { stats, judged: ask.paths.map((p, i) => judgePath(p, stats[i]!, ctx)) };
}

/** The vault walked, then its index read, in the order a build on the thread that asks reads them. */
function walkOf(ask: WalkAsk): WalkAnswer {
  const filter = filterFrom(ask.filter);
  const read = (walk: WalkResult) => (ask.index === undefined ? {} : { index: indexRead(ask.index, walk) });
  if (ask.how === "home") {
    const { key, asked, limits } = ask.home ?? { key: "", asked: [] };
    const { walk, ...home } = homeWalk({ root: ask.filter.root, key }, filter, asked, limits, false);
    return { walk, home, ...read(walk) };
  }
  const walk = ask.how === "listed" ? listDirectory(ask.filter.root, filter) : walkVault(ask.filter.root, filter);
  return { walk, ...read(walk) };
}

/** A request answered here: what it asked for, read as the thread that asked would. */
export function answerDisk(req: DiskRequest): DiskAnswer {
  enterContext(req.context);
  switch (req.op) {
    case "list":
      if ("judge" in req) return { listing: judgeListing(req.dir, req.judge.how, judgeContextFor(req.judge)) };
      // The vault's own folder: judged by the filter the watcher's reads are, made once on this thread and kept.
      if (!req.own) return { listing: listFolder(req.dir, req.walk, req.hidden) };
      return {
        listing: listFolder(req.dir, req.walk, req.hidden, judgeContextFor(req.own).filter, new Set(req.own.walked)),
      };
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
    case "open":
      return { opened: answerOpen(req.ask) };
    case "gitRead":
      return { gitRead: answerGit(req.ask) };
    case "own":
      return { own: answerOwnJob(req.job) };
  }
}
