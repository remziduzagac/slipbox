// Root discovery (plan 1.1, 17.1), the marker version stamp (0.12) and `init` (1.10, 17.4).
//
// A file's root is decided by the file (docs/idea.md, "Vaults — decided 2026-09-30"): the nearest
// `.slipbox/` above it; else the git repository it's in; else the home vault, which holds every
// loose file and lists a folder at a time. `$HOME` and `/` are never a root: that would index
// everything. `--root` names a root outright.

import { existsSync, mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { VAULT_CONFIG_TEMPLATE } from "./config.ts";
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

/** Format version of the marker directory. Bump with a migration, never silently. */
export const VAULT_FORMAT_VERSION = 1;

/** `vault`: a `.slipbox/` root. `repo`: a git repository without one (or `--root`), walked the
 *  same way. `home`: a loose file's folder, listed alone; its data is the home vault's. */
export type VaultMode = RootKind;

export interface VaultLocation {
  /** The root; for the home vault, the folder being looked at (a loose file's own). */
  root: string;
  mode: VaultMode;
  /** The note that was named on the command line, if any (absolute). */
  file: string | null;
  /** The storage key: what the cache and state directories are named by (17.3). */
  key: string;
  /** The vault's id; null for a repository, or a vault whose config declares none yet. */
  id: string | null;
  /** The name `[[name:note]]` reaches it by: declared, else the folder's; null for a repository. */
  name: string | null;
  aliases: string[];
  previous_names: string[];
  /** Said once when the root was found, when there is something to say. */
  note?: string;
}

export class VaultError extends Error {}

export function isVaultRoot(dir: string): boolean {
  try {
    return statSync(join(dir, MARKER)).isDirectory();
  } catch {
    return false;
  }
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

/** Walk up from `start` (a file or directory); the first `.slipbox/` wins. Stops below $HOME or /. */
export function findVaultRoot(start: string): string | null {
  for (let dir = startDir(start); !isNeverRoot(dir); dir = dirname(dir)) if (isVaultRoot(dir)) return dir;
  return null;
}

/** The root a path belongs to: the nearest `.slipbox/`, else the nearest git repository. */
export function findRoot(start: string): { root: string; mode: "vault" | "repo" } | null {
  const vault = findVaultRoot(start);
  if (vault) return { root: vault, mode: "vault" };
  for (let dir = startDir(start); !isNeverRoot(dir); dir = dirname(dir)) if (isRepoRoot(dir)) return { root: dir, mode: "repo" };
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
    if (file && !isInside(root, file)) throw new VaultError(`${opts.path} is outside --root ${opts.root}`);
    return rootAt(root, isVaultRoot(root) ? "vault" : "repo", file);
  }

  const found = findRoot(target ?? cwd);
  if (found) return rootAt(found.root, found.mode, file);
  return homeAt(file ? dirname(file) : (target ?? cwd), file);
}

/** The location of a known root. */
export function rootAt(root: string, mode: "vault" | "repo", file: string | null = null): VaultLocation {
  const ident: VaultIdentity = mode === "vault" ? readIdentity(vaultConfigFile(root)) : { id: null, name: null, aliases: [], previous_names: [] };
  const key = storageKey(root, ident.id);
  if (ident.id && key === ident.id) adoptPathState(root, key);
  const name = mode === "vault" ? (ident.name ?? implicitName(root)) : null;
  return { root, mode, file, key, id: ident.id, name, aliases: ident.aliases, previous_names: ident.previous_names };
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

/** The vault's config file: `.slipbox/config.toml`, the home vault's, or none (a repository). */
export function vaultConfigPath(loc: Pick<VaultLocation, "mode" | "root">): string | null {
  if (loc.mode === "vault") return vaultConfigFile(loc.root);
  if (loc.mode === "home") return join(homeVaultDir(), "config.toml");
  return null;
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
  });
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
}

/**
 * Make `dir` a vault (1.10, 17.4): `.slipbox/` with its version and a config holding the vault's
 * `id` and `name`. The name is `name`, else a distinct suggestion (17.5); a name another vault on
 * this machine answers to is refused. An existing vault without an id gets one.
 */
export function initVault(dir: string, name?: string): InitResult {
  const root = resolve(dir);
  if (isNeverRoot(root)) throw new VaultError(`${root} can't be a vault: slipbox never indexes all of ${root === homeFolder() ? "your home folder" : "/"}`);
  const marker = join(root, MARKER);
  const exists = isVaultRoot(root);
  const have = exists ? readIdentity(vaultConfigFile(root)) : null;
  const known = readRegistry();
  if (name !== undefined) {
    if (!VAULT_NAME.test(name)) throw new VaultError(`"${name}" can't be a vault name: letters, digits, ".", "_" and "-" only, no spaces or ":"`);
    if (name.toLowerCase() === HOME_NAME) throw new VaultError(`"${HOME_NAME}" is the home vault's name`);
    const other = vaultNamed(name, known, root);
    if (other.length) throw new VaultError(`a vault named "${name}" is already at ${other[0]!.path}; try "${suggestVaultName(root, parentVaultName(root), known)}"`);
  }
  if (exists && have?.id) return { root, created: false, identified: false, id: have.id, name: have.name ?? implicitName(root) };
  const chosen = have?.name ?? name ?? suggestVaultName(root, parentVaultName(root), known);
  const id = newVaultId();
  if (!exists) {
    mkdirSync(marker, { recursive: true });
    writeFileSync(join(marker, "version"), `${VAULT_FORMAT_VERSION}\n`);
    writeFileSync(join(marker, "config.toml"), VAULT_CONFIG_TEMPLATE);
  }
  addIdentity(vaultConfigFile(root), { id, name: chosen });
  recordLocation(rootAt(root, "vault"));
  return { root, created: !exists, identified: exists, id, name: chosen };
}

/** The name of the vault enclosing `dir`, if any. */
function parentVaultName(dir: string): string | null {
  const parent = findVaultRoot(dirname(resolve(dir)));
  if (!parent) return null;
  return readIdentity(vaultConfigFile(parent)).name ?? implicitName(parent);
}
