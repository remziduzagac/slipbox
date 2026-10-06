// Root discovery (plan 1.1, 17.1, 20.3), the marker version stamp (0.12) and `init` (1.10, 17.4).
//
// A file's vault is its nearest boundary (docs/idea.md, "Plain paths, virtual vaults"): walking up
// from the file, the first folder that holds `.slipbox/` or is a git checkout's top. Both in one
// folder make one vault, its name and settings from `.slipbox/`; a repository or a `.slipbox/` folder
// inside a vault is a vault of its own. A git vault needs nothing, and nothing is written into it.
// A file under neither is loose (20.22): the plain folder opened is an unnamed instance, known by its
// path, walked and indexed as a vault is — but `$HOME` and `/`, never a root: that would index
// everything (the background index walks the home folder, slowly), so those are listed a folder at a
// time. `--root` names a vault outright.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { parse as parseToml } from "smol-toml";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { loadConfig, VAULT_CONFIG_TEMPLATE } from "./config.ts";
import { collectionOf, repositoryName, sameCollection } from "./collection.ts";
import { checkoutOf, inMain } from "./git.ts";
import { recordFolder } from "./folders.ts";
import { readRegular } from "./fsutil.ts";
import { cacheHome, stateHome, vaultKey } from "./paths.ts";
import {
  addIdentity,
  forgetVault,
  implicitName,
  type KnownVault,
  MARKER,
  confirmMove,
  newInstanceId,
  newVaultId,
  pruneWorktrees,
  readIdentity,
  readRegistry,
  recordVault,
  storageKey,
  suggestVaultName,
  VAULT_NAME,
  vaultConfigFile,
  vaultNamed,
  writeRegistry,
  type RootKind,
  type VaultIdentity,
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
}

/** Format version of the marker directory. Bump with a migration, never silently. */
export const VAULT_FORMAT_VERSION = 1;

/** `vault`: a `.slipbox/` folder or a git checkout's top (20.3). `folder`: a plain folder outside
 *  every vault, opened — an unnamed instance, by its path (20.22). */
export type VaultMode = RootKind;

export interface VaultLocation {
  /** The root: the vault's, or the plain folder opened (a loose file's own). */
  root: string;
  mode: VaultMode;
  /** The note that was named on the command line, if any (absolute). */
  file: string | null;
  /** The storage key: what the cache and state directories are named by (17.3). */
  key: string;
  /** The vault's id; null for a git vault without `.slipbox/`, a plain folder, or a config that can't be written. */
  id: string | null;
  /** The vault's own name (20.6: its `.slipbox/`'s, else its repository's or folder's); null for a plain folder. */
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
  /**
   * Copies of this vault gone from where they were, seen last before this one was first (20.5): what
   * may have moved here, for the person to confirm (`confirmMove`) — never taken on a guess.
   */
  movedHere?: KnownVault[];
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
 * Obsidian vault, a zk notebook. Several in one folder make one root. `$HOME` and `/` never are.
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

/** `$HOME` and `/`: never a root, whatever they hold. */
export function isNeverRoot(dir: string): boolean {
  return dir === homeFolder() || dirname(dir) === dir;
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
    if (!existsSync(root) || !statSync(root).isDirectory()) throw new VaultError(`--root is not a directory: ${opts.root}`);
    if (!isVaultRoot(root)) throw new VaultError(`--root ${opts.root} isn't a root (none of ${rootMarkers().join(", ")} in it): slipbox init ${opts.root} makes it one`);
    if (file && !isInside(root, file)) throw new VaultError(`${opts.path} is outside --root ${opts.root}`);
    // A file has one root, however it's opened (21.x): its nearest. `--root` says where to start; a
    // root nested in it stays a boundary — its files are its own.
    const own = file ? findVaultRoot(file) : null;
    return rootAt(own && isInside(root, own) ? own : root, file);
  }

  const found = findVaultRoot(target ?? cwd);
  if (found) return rootAt(found, file);
  return folderAt(file ? dirname(file) : (target ?? cwd), file);
}

/** The location of a vault root: a folder with `.slipbox/`, or a git checkout's top (20.3). */
export function rootAt(root: string, file: string | null = null): VaultLocation {
  const c = checkoutOf(root);
  const worktree: Worktree | null = c?.worktree ? { name: c.worktree, checkout: c.root, main: c.main, mainVault: inMain(c, root) } : null;
  // A git vault has no `.slipbox/` to hold an id or a name, and none is made for it: it's keyed by
  // its path and named by its folder (a worktree reads its main checkout's, never writing).
  const ident = hasMarker(root) ? ensureIdentity(root, worktree?.mainVault ?? null) : worktree?.mainVault ? readIdentity(vaultConfigFile(worktree.mainVault)) : readIdentity(vaultConfigFile(root));
  // Its own name (20.6): what `.slipbox/` declares, else its repository's, else its folder's.
  const name = ident.name ?? repositoryName(root) ?? implicitName(root);
  const loc: VaultLocation = { root, mode: "vault", file, key: "", id: ident.id, name, aliases: ident.aliases, previous_names: ident.previous_names, worktree };
  const { key, movedHere } = instanceFor(loc);
  return { ...loc, key, ...(movedHere.length ? { movedHere } : {}) };
}

/**
 * This copy's instance (20.5): its personal state and cache are found by its id. Found by its path in
 * the machine's list — its state moved over once from the key it had before instances (an id, a
 * copy's, a worktree's, a path's); a worktree `git worktree move` took elsewhere found again by git's
 * name for it (17.19). Else a new one, recorded at once so every open of it agrees. With what may have
 * moved here (`movedHere`).
 */
function instanceFor(loc: VaultLocation): { key: string; movedHere: KnownVault[] } {
  const known = readRegistry();
  const here = realPath(loc.root);
  let entry = known.find((v) => v.kind === "vault" && realPath(v.path) === here);
  const wt = loc.worktree;
  if (!entry && wt) {
    const was = known.find((v) => v.kind === "vault" && v.worktree?.name === wt.name && v.worktree.main === wt.mainVault && !isVaultRoot(v.path));
    if (was) entry = confirmMove(was, loc.root, null);
  }
  if (entry) {
    const key = entry.instance ?? newInstanceId();
    if (entry.key !== key) {
      // Today's state, moved once: under the key it had, to its instance's (20.5).
      adoptStorage(entry.key, key);
      writeRegistry(readRegistry().map((v) => (v.key === entry!.key ? { ...v, key, instance: key } : v)));
    }
    return { key, movedHere: movedHere(known, { ...entry, key }, loc.root) };
  }
  // New here. State kept before instances, under a key no instance has taken: this vault's, by the
  // keys it had (17.3: its id, or a copy's; a path's before ids).
  const key = newInstanceId();
  for (const before of [storageKey(loc.root, loc.id, known), vaultKey(loc.root)]) {
    if (known.some((v) => v.key === before) || !existsSync(join(stateHome(), before))) continue;
    adoptStorage(before, key);
    break;
  }
  const fresh = recordLocation({ ...loc, key });
  // A list that can't be written: the path's key, the same each time.
  if (fresh.key !== key || !readRegistry().some((v) => v.key === key)) return { key: vaultKey(loc.root), movedHere: [] };
  return { key, movedHere: movedHere(known, fresh, loc.root) };
}

/**
 * The copies that may have moved to `entry`'s folder (20.5): the same collection, gone from where they
 * were — no vault there now — and seen last before this one was first; not worktrees (git names
 * those), not ones said no to. An entry from before 20.5 has no first sight, and is asked nothing.
 */
function movedHere(known: KnownVault[], entry: KnownVault, root: string): KnownVault[] {
  if (!entry.since || entry.worktree) return [];
  const since = Date.parse(entry.since);
  const collection = entry.collection ?? collectionOf(root);
  return known.filter(
    (v) => v.kind === "vault" && v.key !== entry.key && !v.worktree && !entry.declined?.includes(v.instance ?? v.key) && Date.parse(v.seen) <= since && sameCollection(v.collection, collection) && !isVaultRoot(v.path),
  );
}

/** Cache and state from one key to another, when the other has none yet. */
function adoptStorage(from: string, to: string): void {
  for (const home of [stateHome(), cacheHome()]) {
    try {
      if (!existsSync(join(home, to)) && existsSync(join(home, from))) renameSync(join(home, from), join(home, to));
    } catch {}
  }
}

/**
 * A vault's identity, written into its config the first time a vault without one is opened (17.18):
 * made before vaults had ids, or a `.slipbox/` made by hand. Every vault then has an `id` and a
 * `name`. A config that doesn't parse is left alone (a typo mid-edit), as is a read-only one: that
 * vault is keyed by its path this time.
 *
 * A linked worktree (17.19) never writes it: each would write its own, and merging the branches
 * would then conflict over the vault's id. It takes the main checkout's — keyed by its path until
 * the main checkout has one (opened there, or `slipbox init`, then committed).
 */
function ensureIdentity(root: string, mainVault: string | null = null): VaultIdentity {
  const file = vaultConfigFile(root);
  const have = readIdentity(file);
  if (have.id && have.name) return have;
  if (mainVault) {
    const main = readIdentity(vaultConfigFile(mainVault));
    return { id: have.id ?? main.id, name: have.name ?? main.name, aliases: have.aliases.length ? have.aliases : main.aliases, previous_names: have.previous_names.length ? have.previous_names : main.previous_names };
  }
  if (existsSync(file) && !parsesAsToml(file)) return have;
  const fields = { id: have.id ?? newVaultId(), name: have.name ?? suggestVaultName(root, parentVaultName(root)) };
  try {
    if (!existsSync(file)) writeFileSync(file, VAULT_CONFIG_TEMPLATE);
    addIdentity(file, fields);
  } catch {
    return have;
  }
  return readIdentity(file);
}

/**
 * A plain folder opened, outside every vault (20.22): an unnamed instance, keyed by its path — moved,
 * it starts afresh. Walked and indexed as a vault is, unless it's `$HOME` or `/` (`isListed`).
 */
export function folderAt(dir: string, file: string | null = null): VaultLocation {
  return { root: dir, mode: "folder", file, key: vaultKey(dir), id: null, name: null, aliases: [], previous_names: [] };
}

/** A plain folder only listed, a level at a time: `$HOME` or `/`, whose walk is the background index's (20.9). */
export function isListed(loc: Pick<VaultLocation, "mode" | "root">): boolean {
  return loc.mode === "folder" && isNeverRoot(loc.root);
}

/**
 * The config files that set a vault's settings besides your own (20.7): its own `.slipbox/config.toml`,
 * and those of the vaults enclosing it, broadest first — deeper over broader. A plain folder has only
 * yours (20.22).
 */
export function configFilesFor(loc: Pick<VaultLocation, "mode" | "root">): { vaultFile: string | null; outerFiles: string[] } {
  const outerFiles: string[] = [];
  if (loc.mode === "vault") {
    for (let up = findVaultRoot(dirname(loc.root)); up; up = findVaultRoot(dirname(up))) if (hasMarker(up)) outerFiles.unshift(vaultConfigFile(up));
  }
  return { vaultFile: vaultConfigPath(loc), outerFiles };
}

/** The vault's config file, `.slipbox/config.toml`; a plain folder has none (20.22). */
export function vaultConfigPath(loc: Pick<VaultLocation, "mode" | "root">): string | null {
  return loc.mode === "vault" ? vaultConfigFile(loc.root) : null;
}

/**
 * Record the vault in the machine's list (17.6): an instance of it, with its collection's evidence
 * (20.4). A plain folder opened is an instance of its own, by its path (20.22). The instance as
 * recorded.
 */
export function recordLocation(loc: VaultLocation): KnownVault {
  const known = readRegistry();
  const was = (key: string) => known.find((v) => v.key === key);
  let entry: KnownVault;
  if (loc.mode === "folder") {
    entry = recordVault({ key: loc.key, id: null, kind: "folder", name: null, aliases: [], previous_names: [], path: loc.root, collection: collectionOf(loc.root, was(loc.key)?.collection) });
  } else {
    // A plain folder that has become a vault: the same place, one instance — the vault's now.
    forgetVault(loc.root, ["folder"]);
    // Its name, in the lookup pointers are found by (21.6).
    recordFolder(loc.root);
    entry = recordVault({
      key: loc.key,
      instance: loc.key,
      id: loc.id,
      kind: loc.mode,
      name: loc.name,
      aliases: loc.aliases,
      previous_names: loc.previous_names,
      path: loc.root,
      collection: collectionOf(loc.root, was(loc.key)?.collection),
      ...(loc.worktree ? { worktree: { name: loc.worktree.name, main: loc.worktree.mainVault } } : {}),
    });
  }
  pruneWorktrees();
  return entry;
}

/** The instance at `loc` as the machine's list has it, and the others of its collection (20.4). */
export function instanceOf(loc: VaultLocation, known = readRegistry()): { entry: KnownVault | null; copies: KnownVault[] } {
  const here = realPath(loc.root);
  const entry = known.find((v) => (loc.mode === "folder" ? v.kind === "folder" : v.key === loc.key) && realPath(v.path) === here) ?? null;
  if (!entry) return { entry, copies: [] };
  const copies = known.filter((v) => v !== entry && sameCollection(v.collection, entry.collection));
  return { entry, copies };
}

function realPath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

export function isInside(root: string, path: string): boolean {
  const rel = relative(root, path);
  // Climbing out is a ".." segment; a name that merely starts with dots ("..notes") is inside.
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel) && !/^[A-Za-z]:/.test(rel));
}

export function readVaultVersion(root: string): number | null {
  try {
    const n = Number.parseInt(readRegular(join(root, MARKER, "version"), 4096).toString("utf8").trim(), 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export interface InitResult {
  root: string;
  /** A `.slipbox/` was made. */
  created: boolean;
  /** An existing vault got its id (and name, when it had none). */
  identified: boolean;
  id: string;
  name: string;
  /** Where `.slipbox/` was kept out of git (`private`), if it was. */
  excluded: string | null;
}

/**
 * Make `dir` a vault (1.10, 17.4): `.slipbox/` with its version and a config holding the vault's
 * `id` and `name`. The name is `name`, else a distinct suggestion (17.5); a name another vault on
 * this machine answers to is refused. An existing vault without an id gets one. `private`: a
 * vault in a repository you don't own — `.slipbox/` listed in its `.git/info/exclude`, never in
 * `git status` (17.18).
 */
export function initVault(dir: string, name?: string, opts: { private?: boolean } = {}): InitResult {
  const root = resolve(dir);
  if (isNeverRoot(root)) throw new VaultError(`${root} can't be a vault: slipbox never indexes all of ${root === homeFolder() ? "your home folder" : "/"}`);
  const marker = join(root, MARKER);
  // `.slipbox/` itself: a git checkout is a vault already, and gets one all the same (20.3).
  const exists = hasMarker(root);
  const have = exists ? readIdentity(vaultConfigFile(root)) : null;
  const known = readRegistry();
  if (name !== undefined) {
    if (!VAULT_NAME.test(name)) throw new VaultError(`"${name}" can't be a vault name: letters, digits, ".", "_" and "-" only, no spaces or ":"`);
    const other = vaultNamed(name, known, root);
    if (other.length) throw new VaultError(`a vault named "${name}" is already at ${other[0]!.path}; try "${suggestVaultName(root, parentVaultName(root), known)}"`);
  }
  const excluded = opts.private ? excludeFromGit(root) : null;
  if (exists && have?.id && have.name) {
    if (name !== undefined && name !== have.name) throw new VaultError(`${root} is already the vault "${have.name}": slipbox rename-vault ${name} renames it`);
    return { root, created: false, identified: false, id: have.id, name: have.name, excluded };
  }
  const chosen = have?.name ?? name ?? suggestVaultName(root, parentVaultName(root), known);
  const id = have?.id ?? newVaultId();
  if (!exists) {
    mkdirSync(marker, { recursive: true });
    writeFileSync(join(marker, "version"), `${VAULT_FORMAT_VERSION}\n`);
    writeFileSync(join(marker, "config.toml"), VAULT_CONFIG_TEMPLATE);
  }
  addIdentity(vaultConfigFile(root), { id, name: chosen });
  recordLocation(rootAt(root));
  return { root, created: !exists, identified: exists, id, name: chosen, excluded };
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
    file = resolve(repo, execFileSync("git", ["-C", repo, "rev-parse", "--git-path", "info/exclude"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim());
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

function parsesAsToml(file: string): boolean {
  try {
    parseToml(readRegular(file, 1 << 20).toString("utf8"));
    return true;
  } catch {
    return false;
  }
}

/** The name of the vault enclosing `dir`, if any. */
function parentVaultName(dir: string): string | null {
  const parent = findVaultRoot(dirname(resolve(dir)));
  if (!parent) return null;
  return readIdentity(vaultConfigFile(parent)).name ?? implicitName(parent);
}
