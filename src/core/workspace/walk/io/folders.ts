// One live folder-reader hook and the existing slow-disk test adapter.

import { type Dirent, readdirSync } from "node:fs";
import { basename } from "node:path";

/**
 * A slow disk, for the terminal tests (T12; `SLIPBOX_SLOW_DISK=<folder name>:<ms>[:<deadline ms>]`): a folder of that
 * name takes so long to list, on whichever thread lists it — the disk a check can't mount. Its deadline is
 * walk-thread.ts's.
 */
export function slowDisk(env = process.env): { name: string; ms: number; deadline?: number } | null {
  const [name, ms, deadline] = (env.SLIPBOX_SLOW_DISK ?? "").split(":");
  if (!name || !(Number(ms) > 0)) return null;
  return { name, ms: Number(ms), ...(Number(deadline) > 0 ? { deadline: Number(deadline) } : {}) };
}

export const readdirTyped = (abs: string): Dirent[] => {
  const slow = slowDisk();
  if (slow && basename(abs) === slow.name) Bun.sleepSync(slow.ms);
  return readdirSync(abs, { withFileTypes: true });
};

/** How the walk reads a folder: `readdirSync` (a terminal test's slow disk held up: `slowDisk`), unless a test holds it
 *  up itself (`setFolderReader`). */
export let folderReader = readdirTyped;

/** A folder's entries, read as the walk reads them (the explorer's listings too, listing.ts). */
export function readFolder(abs: string): Dirent[] {
  return folderReader(abs);
}

/** A test's folder reader for the walk (T12: one held up on purpose, as a slow disk is); null, `readdirSync` again. */
export function setFolderReader(read: ((abs: string) => Dirent[]) | null): void {
  folderReader = read ?? readdirTyped;
}
