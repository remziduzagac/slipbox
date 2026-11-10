// A folder listed for the explorer (T12, VV-D5): its entries, and what the explorer's rows and their marks say of each
// — a folder or a file, a link and where it leads, a vault with its name, its branch and whether its index is kept, one
// you may not read, a busy folder — read in one go: in the TUI on the disk threads (list-worker.ts), so a folder on a
// disk that answers slowly never holds up the screen. The reads the explorer made as it built its rows and drew their
// marks, made beforehand, each entry asked as little as it takes, and nothing inside another disk mounted there; what
// they mean is still the explorer's to decide. A folder of the vault open's own tree (SD-T7) is listed with its walk's
// filter: each entry with the walk's verdict on it (`exclusion`: a busy folder's note looked for, a `.gitignore` read,
// a nested vault's marker), and a note too big to read said. Every read goes through the seam (SD-D10).

import { constants, type Dirent } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import type { Config } from "../../application/config/config.ts";
import * as disk from "../../foundation/platform/disk.ts";
import { unreadableWords } from "../../foundation/platform/fsutil.ts";
import { checkoutOf, headOf } from "../git/git.ts";
import { mountsIn, recentMountTable } from "../vaults/mounts.ts";
import { cacheDir, vaultKey } from "../../foundation/platform/paths.ts";
import { readIdentity, vaultConfigFile } from "../vaults/registry.ts";
import { linkKey, linkScope, linkTarget } from "../vaults/symlinks.ts";
import { isNotesVault } from "../vaults/notes-vault.ts";
import { findVaultRoot, isVaultRoot, locationAt } from "../vaults/vault.ts";
import type { WalkFilter } from "./filtering/filter.ts";
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
  /** A folder holding a root marker: its key (`vaultKey`), its vault's name when it isn't the folder's, its branch (a
   *  worktree's said), and whether its index is in the cache folder. */
  vault?: { key: string; name?: string; head: VaultHead | null; indexed: boolean };
  /** Why a folder is busy (VV-D8, `busyFolderWhyAt`), when it is. */
  busy?: BusyWhy;
  /** Another disk mounted at it (VV-D2): never looked into, nor at, until it's unfolded. */
  mount?: true;
  /** Listed in a folder of the vault open's own tree (`own`): why its walk leaves it out (`exclusion`, asked of it as
   *  what it is, a link as what it leads to), null when it doesn't. */
  excluded?: string | null;
  /** There too: a note over `walk.max_file_size`, listed but never read. */
  big?: true;
}

/** A folder listed: its entries in the order read, and what they share. */
export interface FolderListing {
  dir: string;
  /** Why it couldn't be listed (`EACCES`, `ENOENT`…); null when it was. */
  error: string | null;
  entries: ListedEntry[];
  /** It's in a notes vault (`.slipbox/` at its top, no `.git` beside it: `isNotesVault`): which of its files `files.show
   *  = "auto"` lists. */
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
    disk.access(abs, mode);
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

/** Whether a vault's index is in the cache folder, by its key: its row marked indexed (VV-D9). */
export const indexKept = (key: string): boolean => disk.exists(join(cacheDir({ key }), "index.json"));

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

/** `abs` as `root`'s path for it, `/`-separated. */
const relIn = (root: string, abs: string): string => relative(root, abs).split(sep).join("/");

/**
 * The folder `dir` listed, every entry the explorer lists (`listsName`, `hidden`: `files.hidden`) with what's known of it
 * — nothing read of one it doesn't list, nor of another disk mounted at one (`walk`: what a busy folder is). `own`: the
 * vault open's walk's filter, `dir` a folder of its own tree (SD-T7) — each entry with its verdict, and a note too big.
 */
export function listFolder(dir: string, walk: Config["walk"], hidden: boolean, own?: WalkFilter): FolderListing {
  const ownRoot = findVaultRoot(dir);
  const out: FolderListing = {
    dir,
    error: null,
    entries: [],
    notes: !!ownRoot && isNotesVault(ownRoot),
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
    real = disk.realpath(dir);
  } catch {}
  const mounted = mountsIn(dir, real, recentMountTable(5000));
  for (const e of names) {
    if (!listsName(e.name, hidden)) continue;
    // Another disk mounted here: one that stops answering would hang whatever looks at it — a folder or a file as its
    // folder's entry says (a file bind-mounted: a container's `/etc/hosts`), nothing more. In the vault's own tree, its
    // walk's verdict all the same: its filter knows another disk without looking (home's), or walks into it (a vault's).
    if (mounted.has(e.name)) {
      const entry: ListedEntry = { name: e.name, dir: e.isDirectory(), file: !e.isDirectory(), denied: false };
      entry.mount = true;
      if (own) entry.excluded = own.exclusion(relIn(own.root, join(dir, e.name)), entry.dir);
      out.entries.push(entry);
      continue;
    }
    const abs = join(dir, e.name);
    let isDir = e.isDirectory();
    if (!isDir && e.isSymbolicLink())
      try {
        isDir = disk.stat(abs).isDirectory();
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
      if (isVaultRoot(abs)) {
        const key = vaultKey(abs);
        entry.vault = { key, ...nameOf(abs), head: vaultHead(abs), indexed: indexKept(key) };
      }
      const busy = busyFolderWhyAt(abs, walk);
      if (busy) entry.busy = busy;
    }
    if (own) judged(entry, abs, own);
    out.entries.push(entry);
  }
  out.digest = Bun.hash(JSON.stringify([out.entries, out.notes, out.scope])).toString(36);
  return out;
}

/** An entry of a folder of the vault open's own tree, given what its walk says of it (SD-T7): why it's left out, asked
 *  of it as what it is (a link, as what it leads to); and a note over `walk.max_file_size`, by its size. */
function judged(entry: ListedEntry, abs: string, own: WalkFilter): void {
  entry.excluded = own.exclusion(relIn(own.root, abs), entry.dir);
  if (!entry.file || !own.isNoteName(entry.name)) return;
  try {
    if (disk.stat(abs).size > own.maxFileSize) entry.big = true;
  } catch {}
}
