// Root discovery (plan 1.1, 17.1, 20.3, 21.1), the marker version stamp (0.12) and `init` (1.10, 17.4).
//
// A file's root is the nearest folder above it holding a root marker (blueprint/design/roots.md § Roots
// and markers): `.git`, `.slipbox/`, `.obsidian/`, `.zk/`. Several in one folder make one root, its
// name and settings from `.slipbox/`; a root inside another is a root of its own. Nothing is written
// into a root by opening it: `.slipbox/`'s id and name only by `slipbox init` and `slipbox name`
// (21.8). A file under none is home's when it's under `~` (VV-D2: home, a vault without a marker — its
// files those no other vault holds, its index walked with a skip list, a slice at a time: home.ts);
// else it's in no-vault, shown as Elsewhere (VV-D3): one place for the machine, its tabs its own, with
// nothing that needs an index — listed a folder at a time, never walked. `--root` names a root outright.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { loadConfig, VAULT_CONFIG_TEMPLATE } from "./config.ts";
import { checkoutOf, inMain, worktreeFingerprint } from "./git.ts";
import { gitArgs } from "./gitops.ts";
import { folderIdentity, folderNamed, identityAt, movedFrom, recordFolder, suggestFolderName } from "./folders.ts";
import { carryPaths, climbsOut, readRegular, SMALL_FILE } from "./fsutil.ts";
import { stateDir, vaultKey } from "./paths.ts";
import { carryPositions, sessionFile } from "./position.ts";
import {
  addIdentity,
  IdentityEditError,
  identityReadsBack,
  adoptStorage,
  forgetRoot,
  MARKER,
  newVaultId,
  pruneWorktrees,
  readIdentity,
  readRoots,
  recordRoot,
  VAULT_NAME,
  vaultConfigFile,
  withIdentity,
  writeRoots,
  type KnownRoot,
  type RootKind,
} from "./registry.ts";

export { MARKER };

/** A vault in a linked git worktree: separate from the main checkout's, of the same repository. */
export interface Worktree {
  /** Git's name for it (its folder under `.git/worktrees/`). */
  name: string;
  /** The worktree's top folder, and the main checkout's (null for a bare repository). */
  checkout: string;
  main: string | null;
  /** This vault's folder in the main checkout. */
  mainVault: string | null;
  /** Its admin folder's fingerprint (`worktreeFingerprint`): a later worktree of its name isn't it. */
  admin: string | null;
}

/** Format version of the marker directory. Bump with a migration, never silently. */
export const VAULT_FORMAT_VERSION = 1;

/** `vault`: a root — a folder holding a root marker (21.1). `home`: `~`, a vault without a marker (VV-D2) — its
 *  files those no other vault holds. `folder`: no-vault, Elsewhere (VV-D3) — everything outside home and every
 *  vault, one place for the machine. */
export type VaultMode = RootKind;

export interface VaultLocation {
  /** The root: the vault's, home; in Elsewhere, the folder opened (a file's own folder), where its paths start. */
  root: string;
  mode: VaultMode;
  /** The note that was named on the command line, if any (absolute). */
  file: string | null;
  /** The storage key: its path's (21.8), what the cache and state directories are named by; Elsewhere's one for
   *  the machine (`ELSEWHERE_KEY`). */
  key: string;
  /** Its `.slipbox/`'s id; null without one (a repository, Elsewhere, a `.slipbox/` never named). */
  id: string | null;
  /** Its name, as pointers name it (21.6): a `.slipbox/` name, else its repository's remote's; null for none. */
  name: string | null;
  aliases: string[];
  previous_names: string[];
  /**
   * A vault in a linked git worktree (17.19): the worktree's name, its checkout's top folder, the
   * main checkout's, and this vault's place there. Null for the main checkout, or outside git.
   */
  worktree?: Worktree | null;
  /** Said once when the root was found, when there is something to say. */
  note?: string;
}

export class VaultError extends Error {}

/** A `.slipbox/` folder: an explicit vault, its name and settings travelling with it (20.3). */
export function hasMarker(dir: string): boolean {
  try {
    return statSync(join(dir, MARKER)).isDirectory();
  } catch {
    return false;
  }
}

let markers: string[] | null = null;

/**
 * What makes a folder a root (21.1): your config's `walk.root_markers` — `.git`, `.slipbox`,
 * `.obsidian`, `.zk` unless it says otherwise — read once.
 */
export function rootMarkers(): string[] {
  return (markers ??= loadConfig().config.walk.root_markers);
}

/** The root markers of your config as the CLI or the TUI loaded it (`--config` too); null reads it again. */
export function setRootMarkers(list: string[] | null): void {
  markers = list;
}

/** The root markers in `dir`: a file or folder of each name. */
export function markersAt(dir: string): string[] {
  return rootMarkers().filter((m) => existsSync(join(dir, m)));
}

/**
 * A root (20.3, 21.1): a folder holding a root marker — a git checkout's top, `.slipbox/`, an
 * Obsidian vault, a zk notebook. Several in one folder make one root. `$HOME` and `/` never are:
 * home is a vault without a marker, whatever it holds (VV-D2; `homeAt`), `/` none.
 */
export function isVaultRoot(dir: string): boolean {
  return !isNeverRoot(dir) && markersAt(dir).length > 0;
}

/** A `.git` directory, or the `.git` file of a worktree or submodule. */
export function isRepoRoot(dir: string): boolean {
  return existsSync(join(dir, ".git"));
}

/** The home folder: `$HOME` as the environment says now, else the account's. */
export function homeFolder(): string {
  return process.env.HOME || homedir();
}

/** `$HOME` and `/`: never a root marked, whatever they hold — home is a vault of its own kind (VV-D2). */
export function isNeverRoot(dir: string): boolean {
  return isHome(dir) || dirname(dir) === dir;
}

let realHomeMemo: { home: string; real: string } | null = null;

/** The home folder's real path (VV-D2: home is known by it), read again when `$HOME` changes. */
function realHome(): string {
  const home = homeFolder();
  if (realHomeMemo?.home !== home) {
    let real = home;
    try {
      real = realpathSync(home);
    } catch {}
    realHomeMemo = { home, real };
  }
  return realHomeMemo.real;
}

/** Whether `dir` is home: `$HOME`, or its real path — never `/` (a service's `HOME=/` makes no home of everything). */
export function isHome(dir: string): boolean {
  return dirname(dir) !== dir && (dir === homeFolder() || dir === realHome());
}

/** Home (VV-D2) as it holds `path` — `$HOME`, or its real path when `path` is reached by that — or null outside it. */
export function homeOf(path: string): string | null {
  const home = homeFolder();
  if (dirname(home) === home) return null;
  if (isInside(home, path)) return home;
  const real = realHome();
  return real !== home && dirname(real) !== real && isInside(real, path) ? real : null;
}

/**
 * The vault a path belongs to (VV-D4): the nearest folder holding a marker, else home when it's under `~` (VV-D2);
 * null outside both — no-vault, Elsewhere (VV-D3).
 */
export function vaultOf(path: string): string | null {
  return findVaultRoot(path) ?? homeOf(resolve(path));
}

function startDir(start: string): string {
  const dir = resolve(start);
  try {
    return statSync(dir).isDirectory() ? dir : dirname(dir);
  } catch {
    return dirname(dir);
  }
}

/** Walk up from `start` (a file or directory); the first boundary wins (20.3). Stops below $HOME or /. */
export function findVaultRoot(start: string): string | null {
  for (let dir = startDir(start); !isNeverRoot(dir); dir = dirname(dir)) if (isVaultRoot(dir)) return dir;
  return null;
}

/** The git repository a path is in (its top folder), never `$HOME` or `/`. */
export function gitRootOf(start: string): string | null {
  for (let dir = startDir(start); !isNeverRoot(dir); dir = dirname(dir)) if (isRepoRoot(dir)) return dir;
  return null;
}

export interface LocateOptions {
  root?: string;
  /** The path named by the user: a note, a directory, or nothing (cwd). */
  path?: string;
  cwd?: string;
}

export function locateVault(opts: LocateOptions): VaultLocation {
  const cwd = opts.cwd ?? process.cwd();
  const target = opts.path ? resolve(cwd, opts.path) : null;
  let file: string | null = null;
  if (target) {
    if (!existsSync(target)) throw new VaultError(`no such file or directory: ${opts.path}`);
    if (statSync(target).isFile()) file = target;
  }

  if (opts.root) {
    const root = resolve(cwd, opts.root);
    if (!existsSync(root) || !statSync(root).isDirectory())
      throw new VaultError(`--root is not a directory: ${opts.root}`);
    // Home (VV-D2): a vault without a marker; a file of a vault in it is that vault's.
    if (isHome(root)) {
      if (file && !isInside(root, file)) throw new VaultError(`${opts.path} is outside --root ${opts.root}`);
      const own = file ? findVaultRoot(file) : null;
      return own ? rootAt(own, file) : homeAt(root, file);
    }
    if (isNeverRoot(root)) throw new VaultError(`--root ${opts.root}: / is never a vault; open a folder in it`);
    if (!isVaultRoot(root))
      throw new VaultError(
        `--root ${opts.root} isn't a vault (none of ${rootMarkers().join(", ")} in it): slipbox init ${opts.root} makes it one`,
      );
    if (file && !isInside(root, file)) throw new VaultError(`${opts.path} is outside --root ${opts.root}`);
    // A file has one root, however it's opened (21.x): its nearest. `--root` says where to start; a
    // root nested in it stays a boundary — its files are its own.
    const own = file ? findVaultRoot(file) : null;
    return rootAt(own && isInside(root, own) ? own : root, file);
  }

  const found = findVaultRoot(target ?? cwd);
  if (found) return rootAt(found, file);
  // No marker: home's, when it's under `~` (VV-D2, VV-D4); else Elsewhere (VV-D3).
  const home = homeOf(target ?? cwd);
  if (home) return homeAt(home, file);
  return elsewhereAt(file ? dirname(file) : (target ?? cwd), file);
}

/**
 * Home's location (VV-D2): `~`, a vault without a marker — unnamed, keyed by its path as any vault is; its settings
 * yours alone; its git, `~`'s own repository if it is one (`checkoutAt`).
 */
export function homeAt(root: string = homeFolder(), file: string | null = null): VaultLocation {
  return {
    root,
    mode: "home",
    file,
    key: vaultKey(root),
    id: null,
    name: null,
    aliases: [],
    previous_names: [],
    worktree: null,
  };
}

/** The location of the vault holding the folder `dir` (VV-D4): its marker's, home's, else Elsewhere, from `dir`. */
export function locationAt(dir: string): VaultLocation {
  const root = findVaultRoot(dir);
  if (root) return rootAt(root);
  const home = homeOf(resolve(dir));
  return home ? homeAt(home) : elsewhereAt(dir);
}

/** The location of a vault by its folder: home's, or a marker's. */
export function vaultAt(root: string): VaultLocation {
  return isHome(root) ? homeAt(root) : rootAt(root);
}

/**
 * The git checkout a vault's files are in (5.9): a vault's; home's only when `~` is itself a repository (VV-D2);
 * Elsewhere's none (VV-D3).
 */
export function checkoutAt(loc: Pick<VaultLocation, "mode" | "root">): ReturnType<typeof checkoutOf> {
  if (loc.mode === "folder") return null;
  const c = checkoutOf(loc.root);
  return loc.mode === "home" && c?.root !== loc.root ? null : c;
}

/** The location of a root (21.1): read, never written — its name, id and settings as they are. */
export function rootAt(root: string, file: string | null = null): VaultLocation {
  const c = checkoutOf(root);
  const worktree: Worktree | null = c?.worktree
    ? {
        name: c.worktree,
        checkout: c.root,
        main: c.main,
        mainVault: inMain(c, root),
        admin: worktreeFingerprint(c.gitDir),
      }
    : null;
  // A worktree without an identity of its own reads its main checkout's (17.19), never writing.
  const ident = identityAt(root);
  return {
    root,
    mode: "vault",
    file,
    key: vaultKey(root),
    id: ident?.id ?? null,
    name: folderIdentity(root)?.name ?? null,
    aliases: ident?.aliases ?? [],
    previous_names: ident?.previous_names ?? [],
    worktree,
  };
}

/** Elsewhere's storage key (VV-D3): one for the machine — its tabs, its scratch, its trash, wherever it was opened. */
export const ELSEWHERE_KEY = "elsewhere";

/**
 * No-vault, shown as Elsewhere (VV-D3): a file outside home and every vault, opened from `dir` (its folder, or the
 * folder opened), where its paths start. One place for the machine — one key, one set of tabs — your settings, and
 * nothing that needs an index: listed a folder at a time, never walked (`isListed`), no backlinks, no search across
 * it, no git.
 */
export function elsewhereAt(dir: string, file: string | null = null): VaultLocation {
  return { root: dir, mode: "folder", file, key: ELSEWHERE_KEY, id: null, name: null, aliases: [], previous_names: [] };
}

/** Elsewhere (VV-D3): listed a level at a time, never walked or indexed. */
export function isListed(loc: Pick<VaultLocation, "mode">): boolean {
  return loc.mode === "folder";
}

/**
 * The config files that set a vault's settings besides your own (20.7): its own `.slipbox/config.toml`,
 * and those of the vaults enclosing it, broadest first — deeper over broader. Home and Elsewhere have only
 * yours (VV-D2, VV-D3).
 */
export function configFilesFor(loc: Pick<VaultLocation, "mode" | "root">): {
  vaultFile: string | null;
  outerFiles: string[];
} {
  const outerFiles: string[] = [];
  if (loc.mode === "vault") {
    for (let up = findVaultRoot(dirname(loc.root)); up; up = findVaultRoot(dirname(up)))
      if (hasMarker(up)) outerFiles.unshift(vaultConfigFile(up));
  }
  return { vaultFile: vaultConfigPath(loc), outerFiles };
}

/** The vault's config file, `.slipbox/config.toml`; home and Elsewhere have none. */
export function vaultConfigPath(loc: Pick<VaultLocation, "mode" | "root">): string | null {
  return loc.mode === "vault" ? vaultConfigFile(loc.root) : null;
}

/**
 * Record the root as seen (17.6, 21.8): in the machine's list by its path, and — a named one — in the
 * lookup pointers are found by (21.6). A named folder moved here by hand (`movedFrom`: sure, never a
 * guess) takes its state along — cache, session, scratch, trash, undo, positions; the session's paths
 * into the state folder (the scratch's) to the new one — and its move is kept, for the relink (20.17).
 * Where it came from, when it did.
 */
export function recordLocation(loc: VaultLocation): { carriedFrom: string | null } {
  if (loc.mode === "folder" || loc.mode === "home") {
    // Home (VV-D2) where `~` opened was a plain folder: the same place, one entry — home's now, its state kept.
    // Elsewhere (VV-D3) has no index to find again: nothing of it is kept in the machine's list.
    if (loc.mode === "home") {
      forgetRoot(loc.root, ["folder"]);
      recordRoot({ kind: loc.mode, path: loc.root });
    }
    pruneWorktrees(Date.now(), isVaultRoot);
    return { carriedFrom: null };
  }
  // A plain folder that has become a root: the same place, one entry — the root's now.
  forgetRoot(loc.root, ["folder"]);
  const known = readRoots();
  // Opened before (not only found by the background index): no move to carry. A worktree moved by git
  // (`git worktree move`) is found by git's name for it and its admin folder's fingerprint (17.19) — a
  // worktree removed and another added under its name is a new one; a named folder, by its name (21.8).
  const wt = loc.worktree;
  const movedWorktree = () =>
    known.find(
      (v) =>
        v.worktree &&
        wt &&
        v.worktree.name === wt.name &&
        v.worktree.main === wt.mainVault &&
        !!wt.admin &&
        v.worktree.admin === wt.admin &&
        v.path !== loc.root &&
        !isVaultRoot(v.path),
    )?.path ?? null;
  const from = known.some((v) => v.key === loc.key && !v.found) ? null : wt ? movedWorktree() : movedFrom(loc.root);
  let moved = known.find((v) => v.key === loc.key)?.moved;
  if (from) {
    const was = known.find((v) => v.path === from);
    const oldKey = was?.key ?? vaultKey(from);
    adoptStorage(oldKey, loc.key);
    carryPositions(from, loc.root);
    // The trash and the undo log say where things were by absolute path: there, now (files.ts, rename-log.ts).
    // The session names a file in the state folder (the scratch) by its absolute path: in the new one.
    try {
      carryPaths(join(stateDir(loc), "trash", "trash.json"), from, loc.root);
      carryPaths(join(stateDir(loc), "renames.json"), from, loc.root);
      carryPaths(sessionFile(loc), stateDir({ key: oldKey }), stateDir(loc));
    } catch {}
    moved = [...(was?.moved ?? []), { from, to: loc.root, at: new Date().toISOString() }];
    if (was) writeRoots(known.filter((v) => v !== was));
  }
  recordFolder(loc.root, { replaces: wt ? null : from });
  recordRoot({
    kind: "vault",
    path: loc.root,
    ...(loc.worktree ? { worktree: knownWorktree(loc.worktree) } : {}),
    ...(moved ? { moved } : {}),
  });
  pruneWorktrees(Date.now(), isVaultRoot);
  return { carriedFrom: from };
}

/** A worktree as the machine's list keeps it: git's name, the main checkout's root, its fingerprint. */
export function knownWorktree(w: Worktree): NonNullable<KnownRoot["worktree"]> {
  return { name: w.name, main: w.mainVault, ...(w.admin ? { admin: w.admin } : {}) };
}

export function isInside(root: string, path: string): boolean {
  // Climbing out is a ".." segment; a name that merely starts with dots ("..notes") is inside.
  return !climbsOut(relative(root, path));
}

export function readVaultVersion(root: string): number | null {
  try {
    const n = Number.parseInt(
      readRegular(join(root, MARKER, "version"), 4096)
        .toString("utf8")
        .trim(),
      10,
    );
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export interface InitResult {
  root: string;
  /** A `.slipbox/` was made. */
  created: boolean;
  /** An existing `.slipbox/` got its name (and an id) now. */
  identified: boolean;
  /** Its id and name: written with a name, never without one. */
  id: string | null;
  name: string | null;
  /** Where `.slipbox/` was kept out of git (`private`), if it was. */
  excluded: string | null;
}

/**
 * What `initVault` refuses, as a VaultError, before anything is written; `init --dry-run` asks it too, so a preview
 * refuses as the run would: a home folder or `/`, a name that can't be one or that a different folder has, a folder
 * called something else already, a `[vault]` table the edit can't follow.
 */
export function checkInit(dir: string, name?: string): void {
  const root = resolve(dir);
  if (isHome(root))
    throw new VaultError(
      `${root} can't have a .slipbox/: home is a vault already, its settings your own config's — give a folder in it one`,
    );
  if (isNeverRoot(root)) throw new VaultError(`${root} can't have a .slipbox/: slipbox never indexes all of /`);
  if (name === undefined) return;
  if (!VAULT_NAME.test(name))
    throw new VaultError(
      `"${name}" can't be a folder's name: letters, digits, ".", "_" and "-" only, no spaces, "/" or ":"`,
    );
  const other = folderNamed(name, root);
  if (other.length)
    throw new VaultError(
      `a different folder is called "${name}", at ${other[0]!.default ?? other[0]!.copies[0]?.path}; try "${suggestFolderName(root, parentName(root))}"`,
    );
  if (!hasMarker(root)) return;
  const cfg = vaultConfigFile(root);
  const have = readIdentity(cfg);
  if (have.name) {
    if (name !== have.name)
      throw new VaultError(`${root} is already called "${have.name}": slipbox name ${name} renames it`);
    return;
  }
  // The name goes in by a textual edit (addIdentity): a table whose form defeats it writes nothing.
  let text = "";
  try {
    text = readRegular(cfg, SMALL_FILE).toString("utf8");
  } catch {}
  const id = have.id ?? newVaultId();
  if (!identityReadsBack(have, withIdentity(text, have, { id, name }), { id, name }))
    throw new VaultError(new IdentityEditError().message);
}

/**
 * Give `dir` a `.slipbox/` (1.10, 17.4, 21.10): settings, and — when `name` is given — a name pointers
 * name it by and an id that tells its copies from a different folder of that name. A name a different
 * folder has on this machine is refused, with one that isn't. `private`: in a repository you don't own,
 * `.slipbox/` listed in its `.git/info/exclude`, never in `git status` (17.18); its name holds on this
 * machine only.
 */
export function initVault(dir: string, name?: string, opts: { private?: boolean } = {}): InitResult {
  const root = resolve(dir);
  checkInit(root, name);
  const marker = join(root, MARKER);
  const exists = hasMarker(root);
  const have = exists ? readIdentity(vaultConfigFile(root)) : null;
  if (have?.name)
    return {
      root,
      created: false,
      identified: false,
      id: have.id,
      name: have.name,
      excluded: opts.private ? excludeFromGit(root) : null,
    };
  if (!exists) {
    mkdirSync(marker, { recursive: true });
    writeFileSync(join(marker, "version"), `${VAULT_FORMAT_VERSION}\n`);
    writeFileSync(join(marker, "config.toml"), VAULT_CONFIG_TEMPLATE);
  }
  let id = have?.id ?? null;
  if (name !== undefined) {
    id ??= newVaultId();
    try {
      addIdentity(vaultConfigFile(root), { id, name });
    } catch (err) {
      // Its [vault] table one the edit can't follow: nothing written, the user edits it.
      if (err instanceof IdentityEditError) throw new VaultError(err.message);
      throw err;
    }
  }
  // Excluded from git only once nothing else can fail.
  const excluded = opts.private ? excludeFromGit(root) : null;
  recordLocation(rootAt(root));
  return { root, created: !exists, identified: exists && name !== undefined, id, name: name ?? null, excluded };
}

/**
 * List a vault's `.slipbox/` in its repository's `.git/info/exclude` (a worktree's too: git says
 * where): kept out of `git status` on this machine, and out of commits. The exclude file, or null
 * when `root` isn't in a git repository.
 */
function excludeFromGit(root: string): string | null {
  const repo = gitRootOf(root);
  if (!repo) return null;
  let file: string;
  try {
    file = resolve(
      repo,
      execFileSync("git", gitArgs(repo, ["rev-parse", "--git-path", "info/exclude"]), {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim(),
    );
  } catch {
    file = join(repo, ".git", "info", "exclude");
  }
  const line = `/${relative(repo, join(root, MARKER)).split(sep).join("/")}/`;
  let text = "";
  try {
    text = readRegular(file, 1 << 20).toString("utf8");
  } catch {}
  if (!text.split(/\r?\n/).includes(line)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${text}${text && !text.endsWith("\n") ? "\n" : ""}${line}\n`);
  }
  return file;
}

/** The name of the root enclosing `dir`, if it has one: a suggestion's prefix. */
export function parentName(dir: string): string | null {
  const parent = findVaultRoot(dirname(resolve(dir)));
  return parent ? (folderIdentity(parent)?.name ?? null) : null;
}
