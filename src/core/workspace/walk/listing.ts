// A folder listed for the explorer (T12, VV-D5): its entries, and what the explorer's rows and their marks say of each
// — a folder or a file, a link and where it leads, a vault with its name and branch, one you may not read, a busy
// folder — read in one go: in the TUI on the listing's own threads (list-worker.ts), so a folder on a disk that answers
// slowly never holds up the screen. The reads the explorer made as it built its rows and drew their marks, made
// beforehand, each entry asked as little as it takes, and nothing inside another disk mounted there; what they mean is
// still the explorer's to decide. A vault's name and branch, and a file's permission, are told here for the explorer's
// own rows too.

import { accessSync, constants, type Dirent, realpathSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { Config } from "../../application/config/config.ts";
import { unreadableWords } from "../../foundation/platform/fsutil.ts";
import { checkoutOf, headOf } from "../../git.ts";
import { mountsIn, recentMountTable } from "../vaults/mounts.ts";
import { vaultKey } from "../../foundation/platform/paths.ts";
import { readIdentity, vaultConfigFile } from "../vaults/registry.ts";
import { linkKey, linkScope, linkTarget } from "../vaults/symlinks.ts";
import { findVaultRoot, hasMarker, isVaultRoot, locationAt } from "../vaults/vault.ts";
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
  /** A folder you can't go into, in a few words (`folderUnreadable`'s); null when you can. */
  unreadable?: string | null;
  /** A folder holding a root marker: its key (`vaultKey`), its vault's name when it isn't the folder's, and its branch
   *  (a worktree's said). */
  vault?: { key: string; name?: string; head: VaultHead | null };
  /** Why a folder is busy (VV-D8, `busyFolderWhyAt`), when it is. */
  busy?: BusyWhy;
  /** Another disk mounted at it (VV-D2): never looked into, nor at, until it's unfolded. */
  mount?: true;
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
  /** Its digest — its entries, whether it's a notes vault's, its links' scope: what its rows are built from — the same
   *  for two listings that say the same, compared without reading them through. */
  digest?: string;
}

/** A checkout's branch, or its commit when it has none; a worktree's said as such. */
export interface VaultHead {
  name: string;
  worktree: boolean;
}

/** Why `abs` can't be reached so (`accessSync`'s `mode`): its error's code, or null when it can. */
function accessCode(abs: string, mode: number): string | null {
  try {
    accessSync(abs, mode);
    return null;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code ?? "EIO";
  }
}

/** Whether `abs` is there and you may not reach it so: `EACCES` or `EPERM`. */
export function denied(abs: string, mode: number): boolean {
  const code = accessCode(abs, mode);
  return code === "EACCES" || code === "EPERM";
}

/** A vault's name beside its folder's, when it has another (17.13); none for a worktree's: its branch tells it apart. */
export function vaultName(abs: string): string | undefined {
  if (checkoutOf(abs)?.worktree) return undefined;
  const n = readIdentity(vaultConfigFile(abs)).name;
  return n && n !== basename(abs) ? n : undefined;
}

/** The branch of the repository whose top `abs` is, or its commit when it has none; null when it isn't one's top. */
export function vaultHead(abs: string): VaultHead | null {
  const c = checkoutOf(abs);
  if (!c || c.root !== abs) return null;
  const h = headOf(c);
  const name = h.branch ?? h.commit?.slice(0, 7) ?? null;
  return name ? { name, worktree: !!c.worktree } : null;
}

/** Whether the explorer lists an entry by its name: a hidden one (`.github`) only while `files.hidden` is on, and `.git`,
 *  git's own folder, never. */
export function listsName(name: string, showHidden: boolean): boolean {
  return name !== ".git" && (showHidden || !name.startsWith("."));
}

/** A vault's name, when it has one of its own, as a listed entry carries it. */
function nameOf(abs: string): { name?: string } {
  const name = vaultName(abs);
  return name ? { name } : {};
}

/**
 * The folder `dir` listed, every entry the explorer lists (`listsName`, `hidden`: `files.hidden`) with what's known of it
 * — nothing read of one it doesn't list, nor of another disk mounted at one (`walk`: what a busy folder is).
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
  let real = dir;
  try {
    real = realpathSync(dir);
  } catch {}
  const mounted = mountsIn(dir, real, recentMountTable(5000));
  for (const e of names) {
    if (!listsName(e.name, hidden)) continue;
    // Another disk mounted here: one that stops answering would hang whatever looks at it — a folder or a file as its
    // folder's entry says (a file bind-mounted: a container's `/etc/hosts`), nothing more.
    if (mounted.has(e.name)) {
      out.entries.push({ name: e.name, dir: e.isDirectory(), file: !e.isDirectory(), denied: false, mount: true });
      continue;
    }
    const abs = join(dir, e.name);
    let isDir = e.isDirectory();
    if (!isDir && e.isSymbolicLink())
      try {
        isDir = statSync(abs).isDirectory();
      } catch {}
    const code = accessCode(abs, isDir ? constants.R_OK | constants.X_OK : constants.R_OK);
    const entry: ListedEntry = {
      name: e.name,
      dir: isDir,
      file: !isDir && (e.isFile() || e.isSymbolicLink()),
      denied: code === "EACCES" || code === "EPERM",
    };
    if (e.isSymbolicLink()) entry.link = { target: linkTarget(abs), key: linkKey(abs) };
    if (isDir) {
      entry.unreadable = code === null ? null : unreadableWords(code);
      if (isVaultRoot(abs)) entry.vault = { key: vaultKey(abs), ...nameOf(abs), head: vaultHead(abs) };
      const busy = busyFolderWhyAt(abs, walk);
      if (busy) entry.busy = busy;
    }
    out.entries.push(entry);
  }
  out.digest = Bun.hash(JSON.stringify([out.entries, out.notes, out.scope])).toString(36);
  return out;
}
