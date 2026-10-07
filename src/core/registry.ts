// The roots this machine knows (17.6, 21.8; docs/idea.md, "Personal state and settings"): each folder
// opened — a root, or a plain folder — and each root the background index found, by its path. A
// root's cache and personal state are found by its path's key (`vaultKey`): opening `project/` or
// `project/docs/` brings back the same session; a worktree, another path, has its own. A named folder
// moved by hand takes its state along (vault.ts, `recordLocation`); any other move starts fresh.
//
// A root's identity is in its `.slipbox/config.toml` (`[vault]`): an id that tells its copies from a
// different folder of the same name, a name, the names it had — written only by `slipbox init` and
// `slipbox name`, never on their own. The names themselves are looked up in `folders.json`.

import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, realpathSync, renameSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { atomicWrite, ensureDir, readJson, readRegular, SMALL_FILE, writeJson } from "./fsutil.ts";
import { cacheHome, stateHome, vaultKey } from "./paths.ts";

export const MARKER = ".slipbox";

/** What's opened: a root (a folder holding a root marker), or a plain folder outside every root. */
export type RootKind = "vault" | "folder";

export interface VaultIdentity {
  id: string | null;
  /** The declared name; null when the config declares none. */
  name: string | null;
  aliases: string[];
  previous_names: string[];
}

/** One root (or plain folder opened) as this machine knows it, by its path. */
export interface KnownRoot {
  /** Its storage key: its path's (`vaultKey`), what its cache and state folders are named. */
  key: string;
  kind: RootKind;
  /** Where it is. */
  path: string;
  /** When it was last seen (ISO 8601). */
  seen: string;
  /** Found by the background auto-index, never opened (20.9): listed after those opened. */
  found?: boolean;
  /** When its index was last built (20.9, 20.10): how fresh it is. */
  indexed?: string;
  /** A root in a linked git worktree (17.19): git's name for it, and the main checkout's root. */
  worktree?: { name: string; main: string | null };
  /** Where it was before, its state carried along (21.8): what the relink reads a move from (20.17). */
  moved?: { from: string; to: string; at: string }[];
}

/** A folder's name: letters, digits, `.`, `_`, `-`; no spaces, no `/` or `:`. */
export const VAULT_NAME = /^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u;

const NO_IDENTITY: VaultIdentity = { id: null, name: null, aliases: [], previous_names: [] };

/** The `[vault]` table of a config file; missing or malformed fields are empty, never an error. */
export function readIdentity(configFile: string): VaultIdentity {
  let text: string;
  try {
    text = readRegular(configFile, SMALL_FILE).toString("utf8");
  } catch {
    return { ...NO_IDENTITY };
  }
  return identityOf(text);
}

/** The `[vault]` table of a config's text; an unparsable one has none. */
export function identityOf(text: string): VaultIdentity {
  let data: Record<string, unknown>;
  try {
    data = parseToml(text) as Record<string, unknown>;
  } catch {
    return { ...NO_IDENTITY };
  }
  const v = data.vault;
  if (!v || typeof v !== "object" || Array.isArray(v)) return { ...NO_IDENTITY };
  const t = v as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);
  const names = (x: unknown) => (Array.isArray(x) ? x.filter((n): n is string => typeof n === "string" && VAULT_NAME.test(n)) : []);
  const name = str(t.name);
  return { id: str(t.id), name: name && VAULT_NAME.test(name) ? name : null, aliases: names(t.aliases), previous_names: names(t.previous_names) };
}

export function vaultConfigFile(root: string): string {
  return join(root, MARKER, "config.toml");
}

export function newVaultId(): string {
  return randomBytes(8).toString("hex");
}

/** A folder name as a name a pointer can carry: spaces become `-`, anything else not allowed goes. */
export function slugName(s: string): string {
  const slug = s
    .normalize("NFC")
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}._-]/gu, "")
    .replace(/^[._-]+/, "");
  return VAULT_NAME.test(slug) ? slug : "";
}

/** The folder's own name as a name, for a suggestion. */
export function implicitName(root: string): string {
  return slugName(basename(root)) || "notes";
}

/**
 * Add `id` and `name` to a config file's `[vault]` table, as text: the file's comments and layout
 * stay. Fields already there are kept.
 */
export function addIdentity(configFile: string, fields: { id?: string; name?: string }): void {
  let text = "";
  try {
    text = readRegular(configFile, SMALL_FILE).toString("utf8");
  } catch {}
  const next = withIdentity(text, readIdentity(configFile), fields);
  if (next !== text) atomicWrite(configFile, next);
}

/** A config's text with `id` and `name` added to its `[vault]` table, those it has (`have`) kept. */
export function withIdentity(text: string, have: VaultIdentity, fields: { id?: string; name?: string }): string {
  const lines: string[] = [];
  if (fields.id && !have.id) lines.push(`id = ${JSON.stringify(fields.id)}`);
  if (fields.name && !have.name) lines.push(`name = ${JSON.stringify(fields.name)}`);
  if (!lines.length) return text;
  const header = /^\[vault\][ \t]*(#.*)?$/m.exec(text);
  if (header) {
    const at = header.index + header[0].length;
    return `${text.slice(0, at)}\n${lines.join("\n")}${text.slice(at)}`;
  }
  let t = text;
  if (t && !t.endsWith("\n")) t += "\n";
  return `${t}${t ? "\n" : ""}[vault]\n${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------------------------
// The machine's roots (17.6, 21.8)

interface RootsFile {
  version: 1;
  roots: KnownRoot[];
}

export function rootsFile(): string {
  return join(stateHome(), "roots.json");
}

/** The list before 21.8: instances (20.4), each keyed by an id of its own. */
function oldListFile(): string {
  return join(stateHome(), "vaults.json");
}

export function readRoots(): KnownRoot[] {
  const f = readJson<RootsFile | null>(rootsFile(), null);
  if (!f) return existsSync(oldListFile()) ? migrate() : [];
  if (f.version !== 1 || !Array.isArray(f.roots)) return [];
  return f.roots.filter((v) => v && typeof v.key === "string" && typeof v.path === "string" && (v.kind === "vault" || v.kind === "folder"));
}

/**
 * Today's state moved once (21.8): the instances' list (`vaults.json`, 20.4) read into the roots',
 * each one's cache and state moved from its instance's key to its path's, and the old list gone.
 */
function migrate(): KnownRoot[] {
  const old = readJson<{ vaults?: unknown[] } | null>(oldListFile(), null);
  const out: KnownRoot[] = [];
  for (const raw of Array.isArray(old?.vaults) ? old!.vaults : []) {
    const v = raw as Partial<KnownRoot> & { key?: unknown; path?: unknown };
    if (!v || typeof v.key !== "string" || typeof v.path !== "string" || (v.kind !== "vault" && v.kind !== "folder")) continue;
    const key = vaultKey(v.path);
    if (v.key !== key) adoptStorage(v.key, key);
    if (out.some((x) => x.key === key)) continue;
    out.push({
      key,
      kind: v.kind,
      path: v.path,
      seen: typeof v.seen === "string" ? v.seen : new Date(0).toISOString(),
      ...(v.found ? { found: true } : {}),
      ...(typeof v.indexed === "string" ? { indexed: v.indexed } : {}),
      ...(v.worktree && typeof v.worktree.name === "string" ? { worktree: { name: v.worktree.name, main: v.worktree.main ?? null } } : {}),
      ...(Array.isArray(v.moved) ? { moved: v.moved } : {}),
    });
  }
  if (writeRoots(out)) rmSync(oldListFile(), { force: true });
  return out;
}

/**
 * A root's cache and state taken from one key to another (21.8). The other may hold some already —
 * the background index built its graph at the new path first: then what it lacks is moved in, its
 * derived files kept (the cache, `heads.json`), and the personal state (session, scratch, trash, undo
 * log…) is the old key's. The old key's directories go.
 */
export function adoptStorage(from: string, to: string): void {
  if (from === to) return;
  const homes: [string, (name: string) => boolean][] = [
    [stateHome(), (name) => name === "heads.json"],
    [cacheHome(), () => true],
  ];
  for (const [home, derived] of homes) {
    const src = join(home, from);
    const dst = join(home, to);
    try {
      if (!existsSync(src)) continue;
      if (!existsSync(dst)) {
        renameSync(src, dst);
        continue;
      }
      for (const name of readdirSync(src)) {
        const there = join(dst, name);
        if (existsSync(there)) {
          if (derived(name)) continue;
          rmSync(there, { recursive: true, force: true });
        }
        renameSync(join(src, name), there);
      }
      rmSync(src, { recursive: true, force: true });
    } catch {}
  }
}

/** A seen root is written again only when something about it changed, or after this long. */
const SEEN_REFRESH_MS = 10 * 60 * 1000;

/** The root at `path` recorded as seen now — once per change, else at most every ten minutes. */
export function recordRoot(v: Omit<KnownRoot, "key" | "seen">, now = new Date()): KnownRoot {
  const list = readRoots();
  const key = vaultKey(v.path);
  const i = list.findIndex((x) => x.key === key);
  const old = list[i];
  const fresh: KnownRoot = { ...old, ...v, key, seen: now.toISOString() };
  // Opened, it's no longer only found (20.9).
  if (!v.found) delete fresh.found;
  if (!v.worktree) delete fresh.worktree;
  const same = old && JSON.stringify({ ...old, seen: "" }) === JSON.stringify({ ...fresh, seen: "" });
  if (same && now.getTime() - Date.parse(old.seen) < SEEN_REFRESH_MS) return old;
  if (i >= 0) list[i] = fresh;
  else list.push(fresh);
  writeRoots(list);
  return fresh;
}

/** The list written whole; false when it can't be (a read-only state directory). */
export function writeRoots(roots: KnownRoot[]): boolean {
  try {
    ensureDir(stateHome());
    writeJson(rootsFile(), { version: 1, roots } satisfies RootsFile);
    return true;
  } catch {
    return false;
  }
}

/** The root `key` had its index built now (20.9, 20.10): how fresh it is, for the lists. */
export function noteIndexed(key: string, at = new Date()): void {
  const list = readRoots();
  const v = list.find((x) => x.key === key);
  if (!v) return;
  v.indexed = at.toISOString();
  writeRoots(list);
}

/** Where removable drives are mounted: a path under one that isn't there is on a drive unplugged. */
const MOUNTS = ["/Volumes", "/media", "/run/media", "/mnt"];

/**
 * A path on a drive that isn't there (20.10): unavailable, not deleted — its entry is kept, and
 * links into it are broken until it's back. A path gone elsewhere is just gone.
 */
export function unavailable(path: string): boolean {
  return MOUNTS.some((m) => path.startsWith(`${m}/`)) && !existsSync(path);
}

/**
 * Forget the root at `root` (18.11: made a plain folder): the machine no longer lists it. With
 * `kinds`, only entries of those kinds there (a plain folder's, when it has become a root).
 */
export function forgetRoot(root: string, kinds?: RootKind[]): void {
  const list = readRoots();
  const rest = list.filter((v) => real(v.path) !== real(root) || (kinds && !kinds.includes(v.kind)));
  if (rest.length !== list.length) writeRoots(rest);
}

function real(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/** A worktree's folder gone this long has its state removed too, not only its cache (17.19). */
const WORKTREE_STATE_DAYS = 30;

/**
 * Worktrees that are gone (17.19: merged, `git worktree remove`): their cache removed at once — it's
 * derived — and, a month after they were last seen, their state (the scratch, session, trash…)
 * and their entry in the list. Until then they're listed as gone. Plain folders gone a month, too.
 * A worktree's root is gone when its folder is no longer a root (`isRoot`: any of its markers, 21.1 —
 * `vault.ts` passes `isVaultRoot`; without it, `.git` or `.slipbox/`).
 */
export function pruneWorktrees(now = Date.now(), isRoot: (path: string) => boolean = (p) => existsSync(join(p, ".git")) || existsSync(join(p, MARKER))): void {
  const list = readRoots();
  // On a drive that isn't there (20.10), nothing is gone: kept as it was until the drive is back.
  const gone = list.filter((v) => v.worktree && !unavailable(v.path) && !isRoot(v.path));
  // A plain folder gone as long: forgotten too — it has nothing of its own to remove.
  const drop = list.filter((v) => v.kind === "folder" && !unavailable(v.path) && !existsSync(v.path) && now - Date.parse(v.seen) > WORKTREE_STATE_DAYS * 86_400_000).map((v) => v.key);
  if (!gone.length && !drop.length) return;
  for (const v of gone) {
    rmSync(join(cacheHome(), v.key), { recursive: true, force: true });
    if (now - Date.parse(v.seen) > WORKTREE_STATE_DAYS * 86_400_000) {
      rmSync(join(stateHome(), v.key), { recursive: true, force: true });
      drop.push(v.key);
    }
  }
  if (drop.length) writeRoots(list.filter((v) => !drop.includes(v.key)));
}
