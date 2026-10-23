// A folder listed for the explorer (T12, VV-D5): its entries, and what the explorer's rows and their marks say of each
// — a folder or a file, a link and where it leads, a vault with its name and branch, one you may not read, a busy
// folder — read in one go: in the TUI on the listing's own threads (walk-thread.ts), so a folder on a disk that answers
// slowly never holds up the screen. The reads the explorer made as it built its rows and drew their marks, made
// beforehand; what they mean is still the explorer's to decide.

import { accessSync, constants, type Dirent, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { Config } from "./config.ts";
import { folderUnreadable } from "./fsutil.ts";
import { checkoutOf, headOf } from "./git.ts";
import { vaultKey } from "./paths.ts";
import { readIdentity, vaultConfigFile } from "./registry.ts";
import { linkKey, linkScope, linkTarget } from "./symlinks.ts";
import { findVaultRoot, hasMarker, isVaultRoot, locationAt } from "./vault.ts";
import { type BusyWhy, busyFolderWhyAt, readFolder } from "./walk.ts";

/** One entry of a folder listed, and what's known of it. */
export interface ListedEntry {
  name: string;
  /** A folder, or a link to one. */
  dir: boolean;
  /** Listed among the files: a file, or a link to anything but a folder. */
  file: boolean;
  /** A symlink: where it leads, by its real path (null: broken), and itself by its own (`linkKey`), for its answer. */
  link?: { target: string | null; key: string };
  /** You may not read it (a folder: list and go into it): no permission. */
  denied: boolean;
  /** A folder you can't go into, in a few words (`folderUnreadable`); null when you can. */
  unreadable?: string | null;
  /** A folder holding a root marker: its key (`vaultKey`), its vault's name when it isn't the folder's, and its branch
   *  (a worktree's said). */
  vault?: { key: string; name?: string; head: { name: string; worktree: boolean } | null };
  /** Why a folder is busy (VV-D8, `busyFolderWhyAt`), when it is. */
  busy?: BusyWhy;
}

/** A folder listed: its entries in the order read, and what they share. */
export interface FolderListing {
  dir: string;
  /** Why it couldn't be listed (`EACCES`, `ENOENT`…); null when it was. */
  error: string | null;
  entries: ListedEntry[];
  /** It's in a notes vault (one with `.slipbox/`): which of its files are listed (`files.show`). */
  notes: boolean;
  /** Where its links are taken from (`linkScope`): its vault's real path, home's, none in Elsewhere. */
  scope: string | null;
}

function denied(abs: string, mode: number): boolean {
  try {
    accessSync(abs, mode);
    return false;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === "EACCES" || code === "EPERM";
  }
}

/** A vault's name beside its folder's, when it has another (17.13); none for a worktree's: its branch tells it apart. */
function vaultOf(abs: string): NonNullable<ListedEntry["vault"]> {
  const c = checkoutOf(abs);
  const own = c?.worktree ? undefined : readIdentity(vaultConfigFile(abs)).name;
  const name = own && own !== basename(abs) ? own : undefined;
  let head: { name: string; worktree: boolean } | null = null;
  if (c && c.root === abs) {
    const h = headOf(c);
    const at = h.branch ?? h.commit?.slice(0, 7) ?? null;
    if (at) head = { name: at, worktree: !!c.worktree };
  }
  return { key: vaultKey(abs), ...(name ? { name } : {}), head };
}

/** Whether the explorer lists an entry by its name: a hidden one (`.github`) only while `files.hidden` is on, and `.git`,
 *  git's own folder, never. */
export function listsName(name: string, showHidden: boolean): boolean {
  return name !== ".git" && (showHidden || !name.startsWith("."));
}

/**
 * The folder `dir` listed, every entry the explorer lists (`listsName`, `hidden`: `files.hidden`) with what's known of it
 * — nothing read of one it doesn't list (`walk`: the settings a busy folder is decided by).
 */
export function listFolder(dir: string, walk: Config["walk"], hidden: boolean): FolderListing {
  const own = findVaultRoot(dir);
  const out: FolderListing = {
    dir,
    error: null,
    entries: [],
    notes: !!own && hasMarker(own),
    scope: linkScope(locationAt(dir)),
  };
  let names: Dirent[];
  try {
    names = readFolder(dir);
  } catch (err) {
    out.error = (err as NodeJS.ErrnoException).code ?? (err as Error).message;
    return out;
  }
  for (const e of names) {
    if (!listsName(e.name, hidden)) continue;
    const abs = join(dir, e.name);
    let isDir = e.isDirectory();
    if (!isDir && e.isSymbolicLink())
      try {
        isDir = statSync(abs).isDirectory();
      } catch {}
    const entry: ListedEntry = {
      name: e.name,
      dir: isDir,
      file: !isDir && (e.isFile() || e.isSymbolicLink()),
      denied: denied(abs, isDir ? constants.R_OK | constants.X_OK : constants.R_OK),
    };
    if (e.isSymbolicLink()) entry.link = { target: linkTarget(abs), key: linkKey(abs) };
    if (isDir) {
      entry.unreadable = folderUnreadable(abs);
      if (isVaultRoot(abs)) entry.vault = vaultOf(abs);
      const busy = busyFolderWhyAt(abs, walk);
      if (busy) entry.busy = busy;
    }
    out.entries.push(entry);
  }
  return out;
}
