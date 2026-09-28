// Vault root discovery (plan 1.1), the marker version stamp (0.12) and `init` (1.10).
//
// Precedence: `--root`, then the nearest `.slipbox/` walking up from the opened path, then
// single-file mode. Deliberately no git-root fallback — it would turn every repo into a vault.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { VAULT_CONFIG_TEMPLATE } from "./config.ts";

export const MARKER = ".slipbox";
/** Format version of the marker directory. Bump with a migration, never silently. */
export const VAULT_FORMAT_VERSION = 1;

export type VaultMode = "vault" | "single";

export interface VaultLocation {
  /** Vault root, or the file's directory in single-file mode. */
  root: string;
  mode: VaultMode;
  /** The note that was named on the command line, if any (absolute). */
  file: string | null;
  /** Human-readable reason, surfaced when the mode is degraded. */
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

/** Walk up from `start` (a file or directory); the first `.slipbox/` wins. Stops at $HOME or /. */
export function findVaultRoot(start: string): string | null {
  const home = homedir();
  let dir = resolve(start);
  try {
    if (!statSync(dir).isDirectory()) dir = dirname(dir);
  } catch {
    dir = dirname(dir);
  }
  for (;;) {
    if (isVaultRoot(dir)) return dir;
    if (dir === home) return null;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
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
    return { root, mode: "vault", file };
  }

  const found = findVaultRoot(target ?? cwd);
  if (found) return { root: found, mode: "vault", file };

  if (file) {
    return {
      root: dirname(file),
      mode: "single",
      file,
      note: "no .slipbox/ found — single-file mode: links resolve in this directory only. Run `slipbox init` to make a vault.",
    };
  }
  const dir = target ?? cwd;
  return {
    root: dir,
    mode: "single",
    file: null,
    note: "no .slipbox/ found — single-file mode over this directory. Run `slipbox init` to make a vault.",
  };
}

export function isInside(root: string, path: string): boolean {
  const rel = relative(root, path);
  // Climbing out is a ".." segment; a name that merely starts with dots ("..notes") is inside.
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel) && !/^[A-Za-z]:/.test(rel));
}

export function readVaultVersion(root: string): number | null {
  try {
    const n = Number.parseInt(readFileSync(join(root, MARKER, "version"), "utf8").trim(), 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export interface InitResult {
  root: string;
  created: boolean;
}

export function initVault(dir: string): InitResult {
  const root = resolve(dir);
  const marker = join(root, MARKER);
  if (isVaultRoot(root)) return { root, created: false };
  mkdirSync(marker, { recursive: true });
  writeFileSync(join(marker, "version"), `${VAULT_FORMAT_VERSION}\n`);
  writeFileSync(join(marker, "config.toml"), VAULT_CONFIG_TEMPLATE);
  return { root, created: true };
}
