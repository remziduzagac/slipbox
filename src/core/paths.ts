// Storage layout (decision 0.10, docs/design/decisions.md; 17.3): config vs cache vs state vs data.
//
// A root's cache and state are found by its key (`VaultLocation.key`): `<basename>-<hash12>` of its
// real path (21.8); a named folder moved by hand has them carried (vault.ts `recordLocation`).

import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

function xdg(varName: string, fallback: string): string {
  const v = process.env[varName];
  return v && v.startsWith("/") ? v : join(homedir(), fallback);
}

export function userConfigDir(): string {
  return join(xdg("XDG_CONFIG_HOME", ".config"), "slipbox");
}

export function userConfigFile(): string {
  return join(userConfigDir(), "config.toml");
}

export function userThemesDir(): string {
  return join(userConfigDir(), "themes");
}

/** `<basename>-<hash12>` — the hash is over the real path; the basename is for humans. */
export function vaultKey(root: string): string {
  let real = root;
  try {
    real = realpathSync(root);
  } catch {}
  const hash = createHash("sha256").update(real).digest("hex").slice(0, 12);
  const name = basename(real).replace(/[^A-Za-z0-9._-]/g, "_") || "root";
  return `${name}-${hash}`;
}

/** Anything that names a vault's storage: a `VaultLocation`, or just its key. */
export interface Keyed {
  key: string;
}

/** The vault's derived data: the index. Rebuilt if deleted. */
export function cacheDir(v: Keyed): string {
  return join(cacheHome(), v.key);
}

/** The vault's personal data: the session, the scratch, the trash, the undo log, redirects. */
export function stateDir(v: Keyed): string {
  return join(stateHome(), v.key);
}

export function cacheHome(): string {
  return join(xdg("XDG_CACHE_HOME", ".cache"), "slipbox");
}

/** Personal state for the machine (`roots.json`, `folders.json`, `positions.json`), and a directory per root. */
export function stateHome(): string {
  return join(xdg("XDG_STATE_HOME", ".local/state"), "slipbox");
}

/** Kept data that is neither settings nor derived: tools installed for language servers (19.x). */
export function dataHome(): string {
  return join(xdg("XDG_DATA_HOME", ".local/share"), "slipbox");
}
