// Named folders (plan 21.6; docs/idea.md, "Between folders"): what a pointer (`slipbox://<name>/…`,
// 21.7) names, and where on this machine it is. A name travels with what it names:
//
// - a `.slipbox/` folder by the name in its config (`slipbox init --name notes`), its copies told apart
//   from a different folder of that name by the `.slipbox/` id they share;
// - else a repository by its remote — short (`research`), or qualified (`github.com/me/research`) when
//   two different repositories share the short one — its copies by the remote they share;
// - never a folder's own name, nor a copy's path: neither travels. A root with neither (`.obsidian/` or
//   `.zk/` alone, a repository with no remote) is unnamed, and linked by relative path.
//
// The lookup is durable, in the state folder (`folders.json`): each named folder, its copies on this
// machine and the default one — the first found; when a second appears, the TUI asks once which links
// open. Filled from the folders opened and by the background index; a copy that's gone stays listed,
// unavailable, so an unplugged drive comes back. A worktree's name means its main checkout.

import { existsSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { normalizeRemote, remoteUrls } from "./remotes.ts";
import { climbsOut, ensureDir, readJson, readRegular, SMALL_FILE, writeJson } from "./fsutil.ts";
import { checkoutOf, inMain } from "./git.ts";
import { stateHome } from "./paths.ts";
import { implicitName, MARKER, readIdentity, slugName, unavailable, vaultConfigFile, type VaultIdentity } from "./registry.ts";

/** What a folder is, as its name and what tells its copies apart. */
export interface FolderIdentity {
  /** What its copies share: `slipbox:<id>`, else `remote:<host/path>`. */
  key: string;
  /** Its short name: `.slipbox/`'s, else the remote's last part. */
  name: string;
  /** A repository's remote (`host/path`): its qualified name. */
  remote: string | null;
  /** A `.slipbox/` folder's id. */
  id: string | null;
  /** Names it had (its config's `aliases` and `previous_names`): a pointer by one still finds it. */
  old: string[];
  /** A `.slipbox/` kept out of git (`init --private`): its name holds on this machine only. */
  private: boolean;
  /** The folder the copy is: a worktree's main checkout, else the folder itself. */
  copy: string;
}

/**
 * The named folder at `root` (a root: its own `.slipbox/` or `.git` is there), or null when it's
 * unnamed. A `.slipbox/` name wins over the remote's: someone chose it.
 */
export function folderIdentity(root: string): FolderIdentity | null {
  const c = checkoutOf(root);
  const ident = identityAt(root);
  const inRepo = c !== null && c.root === root;
  const remote = inRepo ? originRemote(c.common, c.main ?? c.root) : null;
  // A worktree's copy is its main checkout, a folder inside it the same folder there.
  const copy = c?.worktree && c.main ? (inMain(c, root) ?? root) : root;
  const old = ident ? [...ident.aliases, ...ident.previous_names] : [];
  const priv = ident !== null && c !== null && excluded(c.common, c.root, root);
  if (ident?.name) {
    const key = ident.id ? `slipbox:${ident.id}` : remote ? `remote:${remote}` : `path:${copy}`;
    return { key, name: ident.name, remote, id: ident.id, old, private: priv, copy };
  }
  if (!remote) return null;
  const name = slugName(remote.split("/").pop()!);
  if (!name) return null;
  return { key: `remote:${remote}`, name, remote, id: ident?.id ?? null, old, private: false, copy };
}

/**
 * The `[vault]` identity a root has — its `.slipbox/`'s; null without one. A worktree reads its main
 * checkout's where its own has none (17.19): the main's kept private, or a branch made before the folder
 * was named. Never written: a worktree writing its own would conflict when the branches merge.
 */
export function identityAt(root: string): VaultIdentity | null {
  const own = existsSync(join(root, MARKER)) ? readIdentity(vaultConfigFile(root)) : null;
  const c = own?.id && own.name ? null : checkoutOf(root);
  const mainAt = c?.worktree ? inMain(c, root) : null;
  const main = mainAt && existsSync(join(mainAt, MARKER)) ? readIdentity(vaultConfigFile(mainAt)) : null;
  if (!own || !main) return own ?? main;
  return { id: own.id ?? main.id, name: own.name ?? main.name, aliases: own.aliases.length ? own.aliases : main.aliases, previous_names: own.previous_names.length ? own.previous_names : main.previous_names };
}

/** The remote a repository is named by: `origin`'s, else the first one's, as `host/path`. */
function originRemote(common: string, top: string): string | null {
  let config = "";
  try {
    config = readRegular(join(common, "config"), SMALL_FILE).toString("utf8");
  } catch {}
  const urls = remoteUrls(config);
  const pick = urls.find((u) => u.remote === "origin") ?? urls[0];
  return pick ? normalizeRemote(pick.url, top) : null;
}

/** Whether git's exclude file keeps this `.slipbox/` out of git (`slipbox init --private`). */
function excluded(common: string, top: string, root: string): boolean {
  const line = `/${relative(top, join(root, MARKER)).split(sep).join("/")}/`;
  try {
    return readRegular(join(common, "info", "exclude"), SMALL_FILE).toString("utf8").split(/\r?\n/).includes(line);
  } catch {
    return false;
  }
}

/**
 * Whether two roots travel together (docs/idea.md, "Between folders"): one clone, or one folder moved
 * as a whole, carries both — the same repository, or a repository and a submodule of it; outside
 * git, one folder inside the other. Between them, a relative path; else a pointer (21.7).
 */
export function travelTogether(a: string, b: string): boolean {
  const ca = checkoutOf(a);
  const cb = checkoutOf(b);
  if (ca && cb) {
    const common = (c: { common: string }) => realPath(c.common);
    const sub = (outer: string, inner: string) => inner.startsWith(`${outer}${sep}modules${sep}`);
    return common(ca) === common(cb) || sub(common(ca), common(cb)) || sub(common(cb), common(ca));
  }
  if (ca || cb) return false;
  // A name that merely starts with dots (`..archive`) is inside.
  const inside = (outer: string, inner: string) => !climbsOut(relative(outer, inner));
  return inside(a, b) || inside(b, a);
}

function realPath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

// ---------------------------------------------------------------------------------------------
// The lookup

export interface FolderCopy {
  path: string;
  /** When it was last seen (ISO 8601). */
  seen: string;
  /** Found by the background index, never opened. */
  found?: boolean;
}

/** A named folder as this machine knows it: its copies, and the one links open. */
export interface NamedFolder extends Omit<FolderIdentity, "copy"> {
  copies: FolderCopy[];
  /** The copy links open: the first found, or the one picked. */
  default: string | null;
  /** A second copy came and nobody has said which links open: the TUI asks once. */
  ask?: boolean;
  /** Asked, answered or not: never again. */
  asked?: boolean;
}

interface FoldersFile {
  version: 1;
  folders: NamedFolder[];
}

export function foldersFile(): string {
  return join(stateHome(), "folders.json");
}

export function readFolders(): NamedFolder[] {
  const f = readJson<FoldersFile | null>(foldersFile(), null);
  if (!f || f.version !== 1 || !Array.isArray(f.folders)) return [];
  return f.folders.filter((x) => x && typeof x.key === "string" && typeof x.name === "string" && Array.isArray(x.copies));
}

function writeFolders(folders: NamedFolder[]): void {
  try {
    ensureDir(stateHome());
    writeJson(foldersFile(), { version: 1, folders } satisfies FoldersFile);
  } catch {}
}

/**
 * The folder at `root` recorded as seen (opened, or `found` by the background index): its name and
 * copy brought up to date, the copy moved out of any folder it no longer is. A second copy of one
 * folder asks, once, which one links open. The entry as recorded; null for an unnamed folder.
 */
export function recordFolder(root: string, opts: { found?: boolean; now?: Date; replaces?: string | null } = {}): NamedFolder | null {
  const ident = folderIdentity(root);
  const list = readFolders();
  const at = ident?.copy ?? root;
  // A copy moved here by hand (21.8, `movedFrom`): the one it was, gone.
  if (opts.replaces) {
    const f = list.find((x) => x.key === ident?.key);
    if (f) {
      f.copies = f.copies.filter((c) => c.path !== opts.replaces);
      if (f.default === opts.replaces) f.default = at;
    }
  }
  // Not that folder any more (renamed, its remote changed, its `.slipbox/` gone): out of the old one.
  let changed = false;
  for (const f of list) {
    if (f.key === ident?.key) continue;
    const before = f.copies.length;
    f.copies = f.copies.filter((c) => c.path !== at);
    if (f.copies.length !== before) {
      changed = true;
      if (f.default === at) f.default = f.copies[0]?.path ?? null;
    }
  }
  if (!ident) {
    if (changed) writeFolders(list.filter((f) => f.copies.length));
    return null;
  }
  const now = (opts.now ?? new Date()).toISOString();
  const { copy: _, ...named } = ident;
  let entry = list.find((f) => f.key === ident.key);
  if (!entry) {
    entry = { ...named, copies: [], default: null };
    list.push(entry);
  } else Object.assign(entry, named);
  const mine = entry.copies.find((c) => c.path === at);
  if (mine) {
    mine.seen = now;
    if (!opts.found) delete mine.found;
  } else {
    entry.copies.push({ path: at, seen: now, ...(opts.found ? { found: true } : {}) });
    // A second copy here: a choice to make. One gone (moved here, a drive unplugged) isn't one.
    if (entry.copies.filter((c) => copyAvailable(c.path)).length > 1 && !entry.asked) entry.ask = true;
  }
  entry.default ??= at;
  writeFolders(list.filter((f) => f.copies.length));
  return entry;
}

/**
 * Where the named folder at `root` was moved from by hand (21.8), when that's sure: the same remote or
 * `.slipbox/` id at a new path, nothing left at the old one, and exactly one such copy — then its state
 * goes along, and nothing is asked. A worktree (git keeps those), a copy on a drive unplugged, a folder
 * already known here, or two gone copies: null — it starts fresh.
 */
export function movedFrom(root: string): string | null {
  const ident = folderIdentity(root);
  if (!ident || ident.copy !== root) return null;
  const f = readFolders().find((x) => x.key === ident.key);
  // Known here already — opened, not only found by the background index: no move.
  if (!f || f.copies.some((c) => c.path === root && !c.found)) return null;
  const gone = f.copies.filter((c) => !existsSync(c.path) && !unavailable(c.path));
  return gone.length === 1 ? gone[0]!.path : null;
}

/**
 * The named folders this machine knows by `name` (their name, or one they had), other than the one at
 * `except`: a name `slipbox init` and `slipbox name` refuse.
 */
export function folderNamed(name: string, except?: string, folders = readFolders()): NamedFolder[] {
  const n = name.toLowerCase();
  const own = except ? folderIdentity(except)?.key : undefined;
  return folders.filter((f) => f.key !== own && [f.name, ...f.old].some((x) => x.toLowerCase() === n));
}

/**
 * A name for a new `.slipbox/` in `dir` (17.5): the folder's name, prefixed with the enclosing root's
 * (`x-plan` inside `x`); a name this machine knows gets `-2`, `-3`….
 */
export function suggestFolderName(dir: string, parentName: string | null, folders = readFolders()): string {
  const base = implicitName(dir);
  const stem = parentName ? `${parentName}-${base}` : base;
  let name = stem;
  for (let i = 2; folderNamed(name, dir, folders).length; i++) name = `${stem}-${i}`;
  return name;
}

/** The copy links to `key` open, from now on; the question asked, either way. */
export function setDefaultCopy(key: string, path: string | null): void {
  const list = readFolders();
  const f = list.find((x) => x.key === key);
  if (!f) return;
  if (path && f.copies.some((c) => c.path === path)) f.default = path;
  delete f.ask;
  f.asked = true;
  writeFolders(list);
}

/** Whether a copy is here now: its folder there (a drive unplugged, a folder deleted: not). */
export function copyAvailable(path: string): boolean {
  return existsSync(path);
}

export type FolderLookup =
  | { status: "found"; folder: NamedFolder; path: string; via?: "old-name" | "another-copy" }
  | { status: "ambiguous"; candidates: string[]; reason: string; folders: NamedFolder[] }
  | { status: "unavailable"; folder: NamedFolder; path: string }
  | { status: "unknown"; reason: string };

/**
 * Where a folder's name is on this machine: its default copy (another, when that one isn't here);
 * a qualified name (`github.com/me/research`) by its remote. Different folders of one name are
 * ambiguous, never guessed: repositories each by their qualified name, `.slipbox/` folders until one
 * is renamed. A name it had still finds it, said so.
 */
export function lookupFolder(name: string, folders = readFolders()): FolderLookup {
  const want = name.toLowerCase();
  const qualified = name.includes("/");
  let matches = folders.filter((f) => (qualified ? f.remote?.toLowerCase() === want : f.name.toLowerCase() === want));
  let via: "old-name" | undefined;
  if (!matches.length && !qualified) {
    matches = folders.filter((f) => f.old.some((o) => o.toLowerCase() === want));
    via = "old-name";
  }
  if (!matches.length) return { status: "unknown", reason: `${name} isn't on this machine yet: open it, or let the index find it` };
  if (matches.length > 1) {
    const repos = matches.every((f) => f.remote);
    return {
      status: "ambiguous",
      candidates: matches.map((f) => (repos ? f.remote! : `${f.name} (${f.default ?? f.copies[0]?.path})`)).sort(),
      reason: repos ? `${matches.length} repositories are called ${name}: name one by its remote` : `${matches.length} different folders are called ${name}: rename one (slipbox name <new>, in it)`,
      folders: matches,
    };
  }
  const f = matches[0]!;
  const def = f.default ?? f.copies[0]!.path;
  if (copyAvailable(def)) return { status: "found", folder: f, path: def, ...(via ? { via } : {}) };
  const other = f.copies.find((c) => c.path !== def && copyAvailable(c.path));
  if (other) return { status: "found", folder: f, path: other.path, via: via ?? "another-copy" };
  return { status: "unavailable", folder: f, path: def };
}

/**
 * The name to write for a folder (a pointer's): its short name, unless a different folder this
 * machine knows has it too — then a repository's qualified name; a `.slipbox/` folder keeps its
 * short one (ambiguous until one is renamed).
 */
export function pointerName(f: Pick<NamedFolder, "key" | "name" | "remote">, folders = readFolders()): string {
  const clash = folders.some((x) => x.key !== f.key && x.name.toLowerCase() === f.name.toLowerCase());
  return clash && f.remote ? f.remote : f.name;
}
