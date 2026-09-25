// Storage layout (decision 0.10, docs/design/decisions.md): config vs cache vs state.

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

export function cacheDir(root: string): string {
  return join(xdg("XDG_CACHE_HOME", ".cache"), "slipbox", vaultKey(root));
}

export function stateDir(root: string): string {
  return join(xdg("XDG_STATE_HOME", ".local/state"), "slipbox", vaultKey(root));
}
