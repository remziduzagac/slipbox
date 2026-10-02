// Root discovery (plan 1.1, 17.1, 20.3), the marker version stamp (0.12) and `init` (1.10, 17.4).
//
// A file's vault is its nearest boundary (docs/idea.md, "Plain paths, virtual vaults"): walking up
// from the file, the first folder that holds `.slipbox/` or is a git checkout's top. Both in one
// folder make one vault, its name and settings from `.slipbox/`; a repository or a `.slipbox/` folder
// inside a vault is a vault of its own. A git vault needs nothing, and nothing is written into it.
// A file under neither is loose: the home vault, which lists a folder at a time (until `20.22`).
// `$HOME` and `/` are never a root: that would index everything. `--root` names a vault outright.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { parse as parseToml } from "smol-toml";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { VAULT_CONFIG_TEMPLATE } from "./config.ts";
import { checkoutOf, inMain } from "./git.ts";
import { readRegular } from "./fsutil.ts";
import { stateHome, vaultKey } from "./paths.ts";
import {
  addIdentity,
  HOME_NAME,
  homeIdentity,
  homeVaultDir,
  implicitName,
  MARKER,
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

/** `vault`: a `.slipbox/` folder or a git checkout's top (20.3). `home`: a loose file's folder,
 *  listed alone; its data is the home vault's. */
export type VaultMode = RootKind;

export interface VaultLocation {
  /** The root; for the home vault, the folder being looked at (a loose file's own). */
  root: string;
  mode: VaultMode;
  /** The note that was named on the command line, if any (absolute). */
  file: string | null;
  /** The storage key: what the cache and state directories are named by (17.3). */
  key: string;
  /** The vault's id; null only for a vault whose config can't be written (read-only). */
  id: string | null;
  /** The name `[[name:note]]` reaches it by. */
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

/** A vault's boundary (20.3): `.slipbox/`, or a git checkout's top — both in one folder, one vault. */
export function isVaultRoot(dir: string): boolean {
  return !isNeverRoot(dir) && (hasMarker(dir) || isRepoRoot(dir));
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
    if (!isVaultRoot(root)) throw new VaultError(`--root ${opts.root} isn't a vault (no .slipbox/, not a git checkout): slipbox init ${opts.root} makes it one`);
    if (file && !isInside(root, file)) throw new VaultError(`${opts.path} is outside --root ${opts.root}`);
    return rootAt(root, file);
  }

  const found = findVaultRoot(target ?? cwd);
  if (found) return rootAt(found, file);
  return homeAt(file ? dirname(file) : (target ?? cwd), file);
}

/** The location of a vault root: a folder with `.slipbox/`, or a git checkout's top (20.3). */
export function rootAt(root: string, file: string | null = null): VaultLocation {
  const c = checkoutOf(root);
  const worktree: Worktree | null = c?.worktree ? { name: c.worktree, checkout: c.root, main: c.main, mainVault: inMain(c, root) } : null;
  // A git vault has no `.slipbox/` to hold an id or a name, and none is made for it: it's keyed by
  // its path and named by its folder (a worktree reads its main checkout's, never writing).
  const ident = hasMarker(root) ? ensureIdentity(root, worktree?.mainVault ?? null) : worktree?.mainVault ? readIdentity(vaultConfigFile(worktree.mainVault)) : readIdentity(vaultConfigFile(root));
  // A worktree keeps its own state, by git's name for it: it survives moving the folder (17.19).
  const key = worktree && ident.id ? `${ident.id}-wt-${worktree.name.replace(/[^A-Za-z0-9._-]/g, "_")}` : storageKey(root, ident.id);
  if (ident.id && key === ident.id) adoptPathState(root, key);
  return { root, mode: "vault", file, key, id: ident.id, name: ident.name ?? implicitName(root), aliases: ident.aliases, previous_names: ident.previous_names, worktree };
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

/** A loose folder, in the home vault. */
export function homeAt(dir: string, file: string | null = null): VaultLocation {
  const ident = homeIdentity();
  return { root: dir, mode: "home", file, key: ident.id, id: ident.id, name: HOME_NAME, aliases: ident.aliases, previous_names: ident.previous_names };
}

/**
 * A vault that has just got its id kept its state under its path's key: move it over, once, so
 * reading positions and the session aren't lost (17.3).
 */
function adoptPathState(root: string, key: string): void {
  const now = join(stateHome(), key);
  const before = join(stateHome(), vaultKey(root));
  try {
    if (!existsSync(now) && existsSync(before)) renameSync(before, now);
  } catch {}
}

/** The vault's config file: `.slipbox/config.toml`, or the home vault's. */
export function vaultConfigPath(loc: Pick<VaultLocation, "mode" | "root">): string {
  return loc.mode === "vault" ? vaultConfigFile(loc.root) : join(homeVaultDir(), "config.toml");
}

/** Record the vault in the machine's list (17.6). The home vault is listed by its own folder. */
export function recordLocation(loc: VaultLocation): void {
  recordVault({
    key: loc.key,
    id: loc.id,
    kind: loc.mode,
    name: loc.name,
    aliases: loc.aliases,
    previous_names: loc.previous_names,
    path: loc.mode === "home" ? homeVaultDir() : loc.root,
    ...(loc.worktree ? { worktree: { name: loc.worktree.name, main: loc.worktree.mainVault } } : {}),
  });
  pruneWorktrees();
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
    if (name.toLowerCase() === HOME_NAME) throw new VaultError(`"${HOME_NAME}" is the home vault's name`);
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
