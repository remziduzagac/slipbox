// What the disk threads answer (SD-D2; `DiskThreads` in walk-thread.ts asks, list-worker.ts serves, and walk-jobs.ts's
// `answerWalk` too, for a test's worker serving both): a folder listed, a batch of paths statted, a file's text read, a
// folder's access, the vault open walked. Each is read as the thread that asks would read it — the same code, through
// the seam (SD-D10) — with what that thread knows and this one can't see for itself (`walkContext`) taken first. A
// path's own error is its answer, by its code; the request fails only when its thread does (a deadline, a crash).

import type { Config } from "../../application/config/config.ts";
import * as disk from "../../foundation/platform/disk.ts";
import { type DecodedFile, folderUnreadable, readTextStamped, type Stamp } from "../../foundation/platform/fsutil.ts";
import { enterContext, type WalkContext } from "../../foundation/workers/worker-context.ts";
import { homeWalk } from "../vaults/home.ts";
import type { HomeWalk } from "../vaults/home/contracts.ts";
import type { FilterSettings, WalkLimits, WalkResult } from "./contracts.ts";
import { filterFrom } from "./filtering/filter.ts";
import { type FolderListing, listFolder } from "./listing.ts";
import { listDirectory, walkVault } from "./traversal/walk.ts";

/** A path statted: what it is, its mtime, ctime and size; or its error's code (`ENOENT`, `EACCES`, …). */
export type PathStat =
  | { kind: "file" | "dir" | "link" | "other"; mtimeMs: number; ctimeMs: number; size: number }
  | { error: string };

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

export type DiskRequest = { context: WalkContext } & (
  | { op: "list"; dir: string; walk: Config["walk"]; hidden: boolean }
  | { op: "stat"; paths: string[]; own?: boolean }
  | { op: "read"; path: string }
  | { op: "access"; dir: string }
  | { op: "walk"; ask: WalkAsk }
);

export type DiskAnswer =
  | { listing: FolderListing }
  | { stats: PathStat[] }
  | { read: ReadAnswer }
  | { access: string | null }
  | { walked: WalkAnswer };

const DISK_OPS: ReadonlySet<string> = new Set(["list", "stat", "read", "access", "walk"]);

/** Whether `req` is one the disk threads answer. */
export const isDiskRequest = (req: { op: string }): req is DiskRequest => DISK_OPS.has(req.op);

const codeOf = (err: unknown): string => (err as NodeJS.ErrnoException).code ?? (err as Error).message ?? String(err);

/** `path` statted through the seam: its links followed, or its own (`own`, `lstat`). */
function statOf(path: string, own: boolean): PathStat {
  try {
    const st = own ? disk.lstat(path) : disk.stat(path);
    const kind = st.isFile() ? "file" : st.isDirectory() ? "dir" : st.isSymbolicLink() ? "link" : "other";
    return { kind, mtimeMs: st.mtimeMs, ctimeMs: st.ctimeMs, size: st.size };
  } catch (err) {
    return { error: codeOf(err) };
  }
}

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
      return { listing: listFolder(req.dir, req.walk, req.hidden) };
    case "stat":
      return { stats: req.paths.map((p) => statOf(p, req.own === true)) };
    case "read":
      return { read: readOf(req.path) };
    case "access":
      return { access: folderUnreadable(req.dir) };
    case "walk":
      return { walked: walkOf(req.ask) };
  }
}
