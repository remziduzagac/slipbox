// Directory stamps, settling and vanished-path admission.

import { statSync } from "node:fs";
import type { Stamp } from "../contracts.ts";

/**
 * How long after a directory changes its mtime can't tell a later change apart: a coarse clock (FAT's
 * 2 s, HFS+'s 1 s, Linux's tick) can give the next change the same mtime. A directory read that soon
 * after its change is listed again.
 */
export const SETTLE_MS = 2000;

/** A directory's mtime as its stamp, when what it holds was read at `readAt`; -1, to list it again, when that was too
 *  soon after it changed (`SETTLE_MS`) or it couldn't be stat'ed. The watcher's, and home's walk kept (#12). */
export function settled(mtime: number | null, readAt: number): number {
  return mtime === null || mtime >= readAt - SETTLE_MS ? -1 : mtime;
}

/** A stat that failed for something other than its target's being gone: it's there, not to be looked at (#12). */
export function lost(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code;
  return code !== undefined && code !== "ENOENT" && code !== "ENOTDIR";
}

/** The folder holding `rel` (`""`: the top). */
export function parentOf(rel: string): string {
  const slash = rel.lastIndexOf("/");
  return slash >= 0 ? rel.slice(0, slash) : "";
}

/** The stamp of a folder to list again. */
export const RELIST: Stamp = [-1, -1];

/**
 * A folder's stamp from its times, read at `readAt`: `RELIST` when its mtime is too recent to tell a later change
 * apart (`settled`), or its ctime is in whole seconds — a coarse clock's (HFS+, ext3, ext4's small inodes, many network
 * shares), where a later change within the second can leave it as it was — and as recent.
 */
export function stampOf(mtimeMs: number, ctimeMs: number, readAt: number): Stamp {
  const coarse = ctimeMs % 1000 === 0 && ctimeMs >= readAt - SETTLE_MS;
  return settled(mtimeMs, readAt) === -1 || coarse ? RELIST : [mtimeMs, ctimeMs];
}

/** A folder's stamp, read at `readAt` — before what it holds is read; `RELIST` when it can't be stat'ed. */
export function dirStamp(path: string, readAt: number): Stamp {
  try {
    const st = statSync(path);
    return stampOf(st.mtimeMs, st.ctimeMs, readAt);
  } catch {
    return RELIST;
  }
}
