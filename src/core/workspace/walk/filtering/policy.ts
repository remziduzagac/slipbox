// Busy names, hidden/system folders and platform-specific walk policy.

import { MARKER } from "../../vaults/vault.ts";
import type { BusyWhy, HomeSkip } from "../contracts.ts";

export const ALWAYS_SKIPPED = new Set([".git", MARKER]);

/** git's default `core.ignorecase`: true on macOS (case-insensitive filesystem), false on Linux. */
export const GIT_IGNORECASE = process.platform === "darwin" || process.platform === "win32";

/**
 * The busy folders' names (VV-D8): tools' output, their environments and their caches — many files, none of them a
 * person's notes. A folder of such a name is busy when it looks generated (D237, `isBusyFolder`): every walk leaves it
 * out, a vault's as home's (VV-D2); the explorer lists it, never indexed.
 */
export const BUSY_FOLDERS: ReadonlySet<string> = new Set([
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  "target",
  "build",
  "dist",
  ".next",
  "vendor",
  "Pods",
  "DerivedData",
  ".gradle",
  ".tox",
]);

/** A busy folder's name (VV-D8): one of `BUSY_FOLDERS`, or a cache's (`cache`, `.cache`, `Caches`, `pip-cache`). */
export function isBusyName(name: string): boolean {
  return BUSY_FOLDERS.has(name) || /(^|[._-])caches?$/i.test(name);
}

/**
 * The busy folders' rule (VV-D8, as D237 has it), the one place it's decided: a folder of a busy name (`name`) is busy
 * when it looks generated — ignored by its repository's `.gitignore` (`ignored`), or holding no note directly in it
 * (`notes`; its folders don't count). A notes folder called `build`, not ignored, is a folder like any. Each is asked
 * only when the name is busy, `notes` only when it isn't ignored: a listing of the folder.
 */
export function isBusyFolder(name: string, ignored: () => boolean, notes: () => boolean): boolean {
  return isBusyName(name) && (ignored() || !notes());
}

/**
 * Why a folder is busy, when `isBusyFolder` says it is: which of its two things hold — both asked here, so that both
 * are said where both hold (the explorer's `⊘`, VV-D9). Null when it isn't busy.
 */
export function busyWhy(name: string, ignored: () => boolean, notes: () => boolean): BusyWhy | null {
  if (!isBusyFolder(name, ignored, notes)) return null;
  return { ignored: ignored(), noNotes: !notes() };
}

/** The system's folders at home's top, by platform (VV-D2): an application's, never a person's notes. */
const SYSTEM_FOLDERS: Record<string, readonly string[]> = { darwin: ["Library"], win32: ["AppData"] };

/**
 * Why home's walk leaves the folder `rel` (home's path for it) out, or null — home's skip list (VV-D2): a hidden folder
 * (`.cache`, `.config`, `.local`, every dot folder), the system's (`Library` on macOS, `AppData` on Windows),
 * `Downloads` (`downloads`: where the desktop keeps it, as home's path for it); a busy folder anywhere is
 * `WalkFilter.exclusion`'s, which reads the disk (D237). Its files are left out by `exclusion` too: what the explorer
 * doesn't list as a note or a text file.
 */
export function homeSkip(rel: string, opts: { platform?: string; downloads?: string } = {}): HomeSkip | null {
  const name = rel.slice(rel.lastIndexOf("/") + 1);
  if (name.startsWith(".")) return "hidden";
  const top = !rel.includes("/");
  if (top && (SYSTEM_FOLDERS[opts.platform ?? process.platform] ?? []).includes(name)) return "system folder";
  if (rel === (opts.downloads ?? "Downloads")) return "Downloads";
  return null;
}

/**
 * Why home's walk leaves out a folder where another filesystem is mounted (VV-D2): a share, a USB disk, an sshfs or NFS
 * mount — one that stops answering would hang whatever looks into it. Known from the mount table, never by looking.
 */
export const ANOTHER_DISK = "another disk";
