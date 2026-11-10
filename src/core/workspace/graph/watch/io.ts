// The watcher's observations of the disk, read through the seam (disk.ts, SD-D10), and platform watch-entry rules.
import * as disk from "../../../foundation/platform/disk.ts";
import { type PathStat, parentOf } from "../../walk/io/stamps.ts";
import type { WalkFilter } from "../../walk/filtering/filter.ts";

export function isSymlink(path: string): boolean {
  try {
    return disk.lstat(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/** A polling interval for a message: "2 s", or "500 ms" under a second (never "0 s"). */
export function every(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${Math.round(ms / 1000)} s`;
}

/** When a folder last changed (its ctime: what came or went in it, or it renamed), or null when it isn't there. */
export function changedAt(path: string): number | null {
  try {
    return disk.stat(path).ctimeMs;
  } catch {
    return null;
  }
}

/** A note's stamp from its stat as a look read it: its mtime and size when it's a file (its links followed), else null
 *  (`statOrNull`'s). */
export const noteStamp = (st: PathStat | undefined): { mtimeMs: number; size: number } | null =>
  st && !("error" in st) && st.kind === "file" ? { mtimeMs: st.mtimeMs, size: st.size } : null;

/**
 * Whether a watch of `watched` folders (and `polled` ones, whose notes alone are looked at) takes a change to the file
 * `rel`: its folder one of them, and its name one the filter takes — a hidden or ignored file in it isn't.
 */
export function watchTakes(
  filter: Pick<WalkFilter, "exclusion" | "isNoteName">,
  rel: string,
  watched: { has(dir: string): boolean },
  polled: { has(dir: string): boolean } = new Set(),
): boolean {
  const dir = parentOf(rel);
  const name = rel.slice(rel.lastIndexOf("/") + 1);
  return (watched.has(dir) || (polled.has(dir) && filter.isNoteName(name))) && filter.exclusion(rel, false) === null;
}

export function statOrNull(path: string): { mtimeMs: number; size: number } | null {
  try {
    const st = disk.stat(path);
    return st.isFile() ? { mtimeMs: st.mtimeMs, size: st.size } : null;
  } catch {
    return null;
  }
}
