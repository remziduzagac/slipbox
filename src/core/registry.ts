// The vaults of this machine (17.2–17.6; docs/idea.md, "Vaults — decided 2026-09-30"): a vault's
// identity in its `.slipbox/config.toml`, the home vault for loose files, the list of vaults this
// machine has seen (`vaults.json`), and the storage key each vault's cache and state are found by.
//
// A vault's `id` is random, made once and never changed: its personal data is keyed by it, so it
// survives moving the folder. A copy of a vault (`cp -r`, a second clone) carries the same id; the
// copy that isn't where the list last saw the vault is keyed by id and path, so two live copies
// never share a session.
//
// Each entry is an instance (20.4): one copy on this machine, with a local id slipbox gives it once,
// and its collection's evidence (collection.ts) — what tells two copies of one thing. A plain folder
// opened is an instance too, by its path.

import { randomBytes } from "node:crypto";
import { existsSync, realpathSync, rmSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { atomicWrite, ensureDir, readJson, readRegular, SMALL_FILE, writeJson } from "./fsutil.ts";
import type { Collection } from "./collection.ts";
import { checkoutOf } from "./git.ts";
import { cacheHome, dataHome, stateHome, vaultKey } from "./paths.ts";

export const MARKER = ".slipbox";

export type RootKind = "vault" | "home";

/** What the machine's list holds: vaults, the home vault, and plain folders opened (20.4). */
export type KnownKind = RootKind | "folder";

export interface VaultIdentity {
  id: string | null;
  /** The declared name; null when the config declares none (then the folder's name stands in). */
  name: string | null;
  aliases: string[];
  previous_names: string[];
}

/** One vault — an instance of it (20.4) — as this machine knows it. */
export interface KnownVault {
  /** Its storage key: the id, `<id>-<hash>` for a second copy, `<folder>-<hash>` without an id. */
  key: string;
  /** The instance's local id: given once, the first time it's seen, and kept (20.4). */
  instance?: string;
  id: string | null;
  kind: KnownKind;
  /** The evidence for what it holds: copies of one collection share some of it (20.4). */
  collection?: Collection;
  /** The name `[[name:note]]` reaches it by; null for a repository without `.slipbox/`. */
  name: string | null;
  aliases: string[];
  previous_names: string[];
  /** Where it was last seen. */
  path: string;
  /** When (ISO 8601). */
  seen: string;
  /** A vault in a linked git worktree (17.19): git's name for it, and the main checkout's vault. */
  worktree?: { name: string; main: string | null };
}

/** A vault name: letters, digits, `.`, `_`, `-`; no spaces and no colon (`[[name:note]]`). */
export const VAULT_NAME = /^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u;

/** The home vault's name; no other vault may take it (17.2). */
export const HOME_NAME = "home";

const NO_IDENTITY: VaultIdentity = { id: null, name: null, aliases: [], previous_names: [] };

/** The `[vault]` table of a config file; missing or malformed fields are empty, never an error. */
export function readIdentity(configFile: string): VaultIdentity {
  let data: Record<string, unknown>;
  try {
    data = parseToml(readRegular(configFile, SMALL_FILE).toString("utf8")) as Record<string, unknown>;
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

/** A folder name as a vault name: spaces become `-`, anything else not allowed goes. */
export function slugName(s: string): string {
  const slug = s
    .normalize("NFC")
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}._-]/gu, "")
    .replace(/^[._-]+/, "");
  return VAULT_NAME.test(slug) ? slug : "";
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
  const have = readIdentity(configFile);
  const lines: string[] = [];
  if (fields.id && !have.id) lines.push(`id = ${JSON.stringify(fields.id)}`);
  if (fields.name && !have.name) lines.push(`name = ${JSON.stringify(fields.name)}`);
  if (!lines.length) return;
  const header = /^\[vault\][ \t]*(#.*)?$/m.exec(text);
  if (header) {
    const at = header.index + header[0].length;
    text = `${text.slice(0, at)}\n${lines.join("\n")}${text.slice(at)}`;
  } else {
    if (text && !text.endsWith("\n")) text += "\n";
    text += `${text ? "\n" : ""}[vault]\n${lines.join("\n")}\n`;
  }
  atomicWrite(configFile, text);
}

// ---------------------------------------------------------------------------------------------
// The home vault (17.2)

/** The home vault's `.slipbox/`: its config, and later its comments and kept agent answers. */
export function homeVaultDir(): string {
  return join(dataHome(), HOME_NAME);
}

/** The home vault's identity, made on first use. */
export function homeIdentity(): VaultIdentity & { id: string } {
  const file = join(homeVaultDir(), "config.toml");
  const have = existsSync(file) ? readIdentity(file) : { ...NO_IDENTITY };
  if (have.id) return { ...have, id: have.id, name: HOME_NAME };
  const id = newVaultId();
  try {
    ensureDir(homeVaultDir());
    if (!existsSync(file)) atomicWrite(file, HOME_CONFIG_TEMPLATE);
    addIdentity(file, { id, name: HOME_NAME });
  } catch {
    // A read-only data directory: the id still keys this run's state.
  }
  return { ...have, id, name: HOME_NAME };
}

const HOME_CONFIG_TEMPLATE = `# The home vault: files outside every vault and repository (docs/idea.md, "The home vault").
# Settings here apply to those files, over ~/.config/slipbox/config.toml.
`;

// ---------------------------------------------------------------------------------------------
// The machine's vaults (17.6)

interface RegistryFile {
  version: 1;
  vaults: KnownVault[];
}

export function registryFile(): string {
  return join(stateHome(), "vaults.json");
}

export function readRegistry(): KnownVault[] {
  const f = readJson<RegistryFile | null>(registryFile(), null);
  if (!f || f.version !== 1 || !Array.isArray(f.vaults)) return [];
  // A kind no longer made ("repo", before 17.18) is dropped.
  return f.vaults.filter((v) => v && typeof v.key === "string" && typeof v.path === "string" && (v.kind === "vault" || v.kind === "home" || v.kind === "folder"));
}

/** A seen vault is written again only when something about it changed, or after this long. */
const SEEN_REFRESH_MS = 10 * 60 * 1000;

/** An instance's local id (20.4): random, this machine's only, never written into a folder. */
export function newInstanceId(): string {
  return randomBytes(6).toString("hex");
}

/**
 * Record a vault as seen now: once per change, and at most every ten minutes otherwise. Its instance
 * id is the one it was given when first seen, else a new one. The entry as recorded.
 */
export function recordVault(v: Omit<KnownVault, "seen" | "instance">, now = new Date()): KnownVault {
  const list = readRegistry();
  const i = list.findIndex((x) => x.key === v.key);
  const old = list[i];
  const fresh: KnownVault = { ...v, instance: old?.instance ?? newInstanceId(), seen: now.toISOString() };
  const same = old && JSON.stringify({ ...old, seen: "" }) === JSON.stringify({ ...fresh, seen: "" });
  if (same && now.getTime() - Date.parse(old.seen) < SEEN_REFRESH_MS) return old;
  if (i >= 0) list[i] = fresh;
  else list.push(fresh);
  try {
    ensureDir(stateHome());
    writeJson(registryFile(), { version: 1, vaults: list } satisfies RegistryFile);
  } catch {}
  return fresh;
}

/**
 * Forget the vault at `root` (18.11: made a plain folder): the machine no longer lists it. With
 * `kinds`, only entries of those kinds there (a plain folder's, when it has become a vault: 20.4).
 */
export function forgetVault(root: string, kinds?: KnownKind[]): void {
  const list = readRegistry();
  const rest = list.filter((v) => real(v.path) !== real(root) || (kinds && !kinds.includes(v.kind)));
  if (rest.length === list.length) return;
  try {
    writeJson(registryFile(), { version: 1, vaults: rest } satisfies RegistryFile);
  } catch {}
}

/** Every name a vault answers to, lower-cased: its name and aliases. */
export function namesOf(v: Pick<KnownVault, "name" | "aliases">): string[] {
  return [v.name, ...v.aliases].filter((n): n is string => !!n).map((n) => n.toLowerCase());
}

function real(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/** The id at a vault root, if it's still a vault there. */
function idAt(root: string): string | null {
  try {
    if (!statSync(join(root, MARKER)).isDirectory()) return null;
  } catch {
    return null;
  }
  return readIdentity(vaultConfigFile(root)).id;
}

/**
 * The storage key of a vault root (17.3). With an id: the id, unless the list saw this vault at
 * another path that still holds it (this is a copy): then the id and a hash of this path.
 */
export function storageKey(root: string, id: string | null, known = readRegistry()): string {
  if (!id) return vaultKey(root);
  // A worktree's own key is never the id (17.19): one recorded under it before is no primary.
  const primary = known.find((v) => v.key === id && !v.worktree && !checkoutOf(v.path)?.worktree);
  if (!primary || real(primary.path) === real(root) || idAt(primary.path) !== id) return id;
  return `${id}-${vaultKey(root).slice(-8)}`;
}

/** A worktree's folder gone this long has its state removed too, not only its cache (17.19). */
const WORKTREE_STATE_DAYS = 30;

/**
 * Worktrees that are gone (17.19: merged, `git worktree remove`): their cache removed at once — it's
 * derived — and, a month after they were last seen, their state (the scratch, positions, session)
 * and their entry in the list. Until then they're listed as gone. Plain folders gone a month, too.
 */
export function pruneWorktrees(now = Date.now()): void {
  const list = readRegistry();
  const gone = list.filter((v) => v.worktree && !existsSync(join(v.path, ".git")) && !existsSync(join(v.path, MARKER)));
  // A plain folder (20.4) gone as long: forgotten too — it has nothing of its own to remove.
  const drop = list.filter((v) => v.kind === "folder" && !existsSync(v.path) && now - Date.parse(v.seen) > WORKTREE_STATE_DAYS * 86_400_000).map((v) => v.key);
  if (!gone.length && !drop.length) return;
  for (const v of gone) {
    rmSync(join(cacheHome(), v.key), { recursive: true, force: true });
    if (now - Date.parse(v.seen) > WORKTREE_STATE_DAYS * 86_400_000) {
      rmSync(join(stateHome(), v.key), { recursive: true, force: true });
      drop.push(v.key);
    }
  }
  if (!drop.length) return;
  try {
    writeJson(registryFile(), { version: 1, vaults: list.filter((v) => !drop.includes(v.key)) } satisfies RegistryFile);
  } catch {}
}

/**
 * A distinct name for a new vault in `dir` (17.5): the folder's name, prefixed with the enclosing
 * vault's (`x-plan` inside `x`); a name this machine knows gets `-2`, `-3`….
 */
export function suggestVaultName(dir: string, parentName: string | null, known = readRegistry()): string {
  const base = slugName(basename(dir)) || "vault";
  const stem = parentName ? `${parentName}-${base}` : base;
  const here = real(dir);
  const taken = (n: string) => n.toLowerCase() === HOME_NAME || known.some((v) => real(v.path) !== here && namesOf(v).includes(n.toLowerCase()));
  let name = stem;
  for (let i = 2; taken(name); i++) name = `${stem}-${i}`;
  return name;
}

/** The vault this machine knows by `name` (or an alias), other than the one at `except`. */
export function vaultNamed(name: string, known = readRegistry(), except?: string): KnownVault[] {
  const n = name.toLowerCase();
  const skip = except ? real(except) : null;
  return known.filter((v) => (v.kind === "vault" || v.kind === "home") && namesOf(v).includes(n) && real(v.path) !== skip);
}

/** The folder's name as a vault name, for a vault that declares none. */
export function implicitName(root: string): string {
  return slugName(basename(root)) || "vault";
}
