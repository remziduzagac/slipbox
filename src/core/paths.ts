// Storage layout (D39, blueprint/design/how-it-works.md § Storage; 17.3): config vs cache vs state vs data.
//
// A root's cache and state are found by its key (`VaultLocation.key`): `<basename>-<hash12>` of its
// real path (21.8); a named folder moved by hand has them carried (vault.ts `recordLocation`).
//
// Where each kind lives (14.9): XDG's folders on Linux and macOS — `~/.config`, `~/.cache`, `~/.local/state`,
// `~/.local/share`, or the `XDG_*` set — and Windows' own on Windows: the config in `%APPDATA%` (it may roam), the
// rest in `%LOCALAPPDATA%` (a database never roams). An `XDG_*` set is taken on every platform. The cache carries a
// `CACHEDIR.TAG`, so backup tools skip it.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, posix, resolve, win32 } from "node:path";

function xdg(varName: string, fallback: string): string {
  const v = process.env[varName];
  return v?.startsWith("/") ? v : join(homedir(), fallback);
}

/** The four kinds of thing slipbox keeps (decision 0.10). */
export type StoreKind = "config" | "cache" | "state" | "data";

const XDG: Record<StoreKind, [string, string]> = {
  config: ["XDG_CONFIG_HOME", ".config"],
  cache: ["XDG_CACHE_HOME", ".cache"],
  state: ["XDG_STATE_HOME", ".local/state"],
  data: ["XDG_DATA_HOME", ".local/share"],
};

/** slipbox's folder for a kind of thing, on a platform (14.9). */
export function storeDir(
  kind: StoreKind,
  platform: string = process.platform,
  env: Record<string, string | undefined> = process.env,
  home = homedir(),
): string {
  const path = platform === "win32" ? win32 : posix;
  const [name, fallback] = XDG[kind];
  const set = env[name];
  if (set && path.isAbsolute(set)) return path.join(set, "slipbox");
  if (platform !== "win32") return path.join(home, fallback, "slipbox");
  if (kind === "config") return path.join(env.APPDATA || path.join(home, "AppData", "Roaming"), "slipbox");
  return path.join(env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "slipbox", kind);
}

export function userConfigDir(): string {
  return storeDir("config");
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
  return storeDir("cache");
}

/** What marks a folder a cache (bford.info/cachedir): backup tools that know it skip the folder. */
export const CACHEDIR_TAG =
  "Signature: 8a477f597d28d172789f06886806bc55\n# This file is a cache directory tag created by slipbox.\n# Everything here is rebuilt when it's missing: see https://bford.info/cachedir/\n";

let tagged = "";

/** The cache folder, made when missing, with its `CACHEDIR.TAG` (14.9); once per process and folder. */
export function ensureCacheHome(dir = cacheHome()): string {
  if (tagged === dir) return dir;
  try {
    mkdirSync(dir, { recursive: true });
    const tag = join(dir, "CACHEDIR.TAG");
    if (!existsSync(tag)) writeFileSync(tag, CACHEDIR_TAG);
    tagged = dir;
  } catch {}
  return dir;
}

/** Personal state for the machine (`roots.json`, `folders.json`, `positions.json`), and a directory per root. */
export function stateHome(): string {
  return storeDir("state");
}

/** Kept data that is neither settings nor derived: tools installed for language servers (19.x), your own words. */
export function dataHome(): string {
  return storeDir("data");
}

/**
 * The folders a person keeps things in, those there are (10.14): Downloads, Desktop and Documents — where the desktop
 * says (`user-dirs.dirs`, which may name them in another language), else as they're called in English — then home.
 */
export function userFolders(
  home: string,
  configHome = xdg("XDG_CONFIG_HOME", ".config"),
): { name: string; path: string }[] {
  let said = "";
  try {
    said = readFileSync(join(configHome, "user-dirs.dirs"), "utf8");
  } catch {}
  const where = (key: string, fallback: string) => {
    const m = new RegExp(`^XDG_${key}_DIR="([^"]*)"`, "m").exec(said);
    // Normalised: a folder turned off is `"$HOME/"`, home itself.
    return m ? resolve(m[1]!.replace(/^\$HOME/, home)) : join(home, fallback);
  };
  const isDir = (p: string) => {
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  };
  const out = [
    { name: "Downloads", path: where("DOWNLOAD", "Downloads") },
    { name: "Desktop", path: where("DESKTOP", "Desktop") },
    { name: "Documents", path: where("DOCUMENTS", "Documents") },
  ].filter((f) => f.path !== home && isDir(f.path));
  return isDir(home) ? [...out, { name: "Home", path: home }] : out;
}
