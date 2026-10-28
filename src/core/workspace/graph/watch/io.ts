// Existing filesystem observations and platform watch-entry rules.
import { lstatSync, statSync } from "node:fs";
import { parentOf } from "../../walk/io/stamps.ts";
import type { WalkFilter } from "../../walk/filtering/filter.ts";

export function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
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
    return statSync(path).ctimeMs;
  } catch {
    return null;
  }
}

/** A directory's mtime, or null when it isn't there. */
export function dirMtime(path: string): number | null {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

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
    const st = statSync(path);
    return st.isFile() ? { mtimeMs: st.mtimeMs, size: st.size } : null;
  } catch {
    return null;
  }
}
