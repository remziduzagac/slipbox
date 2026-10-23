// Named folders (plan 21.6; blueprint/design/roots.md § Named folders): what a pointer (`slipbox://<name>/…`,
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
import {
  implicitName,
  MARKER,
  readIdentity,
  slugName,
  unavailable,
  vaultConfigFile,
  type VaultIdentity,
} from "./registry.ts";

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
  /** Other names it answers to (its config's `aliases`): a pointer by one finds it as by its name. */
  aliases: string[];
  /** Names it had (its config's `previous_names`): a pointer by one still finds it, said so. */
  old: string[];
  /** A `.slipbox/` kept out of git (`init --private`): its name holds on this machine only. */
  private: boolean;
  /** The folder the copy is, by its real path (a symlink to it is the same copy): a worktree's main
   *  checkout, else the folder itself. */
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
  const copy = realPath(c?.worktree && c.main ? (inMain(c, root) ?? root) : root);
  const aliases = ident?.aliases ?? [];
  const old = ident?.previous_names ?? [];
  const priv = ident !== null && c !== null && excluded(c.common, c.root, root);
  if (ident?.name) {
    const key = ident.id ? `slipbox:${ident.id}` : remote ? `remote:${remote}` : `path:${copy}`;
    return { key, name: ident.name, remote, id: ident.id, aliases, old, private: priv, copy };
  }
  if (!remote) return null;
  const name = remoteName(remote);
  if (!name) return null;
  return { key: `remote:${remote}`, name, remote, id: ident?.id ?? null, aliases, old, private: false, copy };
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
  return {
    id: own.id ?? main.id,
    name: own.name ?? main.name,
    aliases: own.aliases.length ? own.aliases : main.aliases,
    previous_names: own.previous_names.length ? own.previous_names : main.previous_names,
  };
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
    return readRegular(join(common, "info", "exclude"), SMALL_FILE)
      .toString("utf8")
      .split(/\r?\n/)
      .includes(line);
  } catch {
    return false;
  }
}

/**
 * Whether two roots travel together (blueprint/design/links.md § Between folders): one clone, or one folder moved
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
  if (f?.version !== 1 || !Array.isArray(f.folders)) return [];
  // An entry from before aliases were kept apart has none: its next sighting brings them.
  return f.folders
    .filter((x) => x && typeof x.key === "string" && typeof x.name === "string" && Array.isArray(x.copies))
    .map((x) => ({ ...x, aliases: Array.isArray(x.aliases) ? x.aliases : [], old: Array.isArray(x.old) ? x.old : [] }));
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
export function recordFolder(
  root: string,
  opts: {
    found?: boolean;
    now?: Date;
    replaces?: string | null;
    /** Its identity and real path, read where it was opened (T12: another thread): not read again here. */
    known?: { ident: FolderIdentity | null; real: string };
  } = {},
): NamedFolder | null {
  const ident = opts.known ? opts.known.ident : folderIdentity(root);
  const list = readFolders();
  // By its real path: reached through a symlink, it's the same copy, not a second one.
  const at = ident?.copy ?? opts.known?.real ?? realPath(root);
  const here = (c: FolderCopy) => c.path === at || realPath(c.path) === at;
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
    const gone = f.copies.filter(here).map((c) => c.path);
    f.copies = f.copies.filter((c) => !here(c));
    if (f.copies.length !== before) {
      changed = true;
      if (f.default && gone.includes(f.default)) f.default = f.copies[0]?.path ?? null;
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
  // Recorded before by another path to it (a symlink's): one copy, by its real path now.
  const mine = entry.copies.find(here);
  if (mine) {
    if (entry.default === mine.path) entry.default = at;
    mine.path = at;
    entry.copies = entry.copies.filter((c) => c === mine || !here(c));
    if (entry.ask && entry.copies.filter((c) => copyAvailable(c.path)).length < 2) delete entry.ask;
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
  if (!ident || ident.copy !== realPath(root)) return null;
  const f = readFolders().find((x) => x.key === ident.key);
  // Known here already — opened, not only found by the background index: no move.
  if (!f || f.copies.some((c) => (c.path === ident.copy || realPath(c.path) === ident.copy) && !c.found)) return null;
  const gone = f.copies.filter((c) => !existsSync(c.path) && !unavailable(c.path));
  return gone.length === 1 ? gone[0]!.path : null;
}

/**
 * The named folders this machine knows by `name` (their name, an alias, or one they had), other than
 * the one at `except`: a name `slipbox init` and `slipbox name` refuse.
 */
export function folderNamed(name: string, except?: string, folders = readFolders()): NamedFolder[] {
  const n = name.toLowerCase();
  const own = except ? folderIdentity(except) : null;
  // A copy of the same repository is no different folder: a clone may be named as its repository is (DF-D30).
  return folders.filter(
    (f) =>
      f.key !== own?.key &&
      !(own && sameRepository(f, own)) &&
      [f.name, ...f.aliases, ...f.old].some((x) => x.toLowerCase() === n),
  );
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

/**
 * The copies a folder's links may open: its own, then, for a repository, those of its clones with a `.slipbox/` name
 * of their own, which are copies of it still (DF-D30).
 */
export function repositoryCopies(f: NamedFolder, folders = readFolders()): FolderCopy[] {
  return [...f.copies, ...folders.filter((x) => x.key !== f.key && sameRepository(x, f)).flatMap((x) => x.copies)];
}

/** The copy links to `key` open, from now on — any copy of its repository; the question asked, either way. */
export function setDefaultCopy(key: string, path: string | null): void {
  const list = readFolders();
  const f = list.find((x) => x.key === key);
  if (!f) return;
  const copy = path
    ? repositoryCopies(f, list).find((c) => c.path === path || realPath(c.path) === realPath(path))
    : undefined;
  if (copy) f.default = copy.path;
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

/** Whether two named folders are one repository: the same remote, whatever their `.slipbox/` calls them. */
function sameRepository(a: Pick<NamedFolder, "remote">, b: Pick<NamedFolder, "remote">): boolean {
  return !!a.remote && !!b.remote && a.remote.toLowerCase() === b.remote.toLowerCase();
}

/** The short name a remote gives its repository: its last part (`research`); "" when that's no name. */
function remoteName(remote: string): string {
  return slugName(remote.split("/").pop()!);
}

/**
 * Folders grouped as the table in roots.md § Named folders tells them apart: a repository's copies (one remote) are
 * one, though a clone's `.slipbox/` gives it a name of its own; any other folder is its own. In each, the copies
 * called by the remote's name come first (the repository as its remote names it, not a clone renamed to be told
 * from it), then as found.
 */
function byRepository(folders: NamedFolder[]): NamedFolder[][] {
  const groups: NamedFolder[][] = [];
  for (const f of folders) {
    const g = groups.find((x) => sameRepository(x[0]!, f));
    if (g) g.push(f);
    else groups.push([f]);
  }
  const renamed = (f: NamedFolder) =>
    f.remote && [f.name, ...f.aliases].some((n) => n.toLowerCase() === remoteName(f.remote!).toLowerCase()) ? 0 : 1;
  return groups.map((g) =>
    g
      .map((f, i) => ({ f, i }))
      .sort((a, b) => renamed(a.f) - renamed(b.f) || a.i - b.i)
      .map((x) => x.f),
  );
}

/**
 * Where a folder's name is on this machine: its default copy (another, when that one isn't here);
 * a qualified name (`github.com/me/research`) by its remote. A repository's copies are one folder, a
 * clone with a `.slipbox/` name of its own too: the repository's default copy (`byRepository`).
 * Different folders of one name are ambiguous, never guessed, each named by its path: repositories
 * each by their qualified name, `.slipbox/` folders until one is renamed. An alias finds it as its
 * name does; a name it had still finds it, said so.
 */
export function lookupFolder(name: string, folders = readFolders()): FolderLookup {
  const want = name.toLowerCase();
  const qualified = name.includes("/");
  let matches = folders.filter((f) =>
    qualified ? f.remote?.toLowerCase() === want : [f.name, ...f.aliases].some((n) => n.toLowerCase() === want),
  );
  let via: "old-name" | undefined;
  if (!matches.length && !qualified) {
    matches = folders.filter((f) => f.old.some((o) => o.toLowerCase() === want));
    via = "old-name";
  }
  if (!matches.length)
    return { status: "unknown", reason: `${name} isn't on this machine yet: open it, or let the index find it` };
  const groups = byRepository(matches);
  if (groups.length > 1) {
    const each = groups.map((g) => g[0]!);
    const repos = each.every((f) => f.remote);
    return {
      status: "ambiguous",
      candidates: each.flatMap((f) => f.default ?? f.copies[0]?.path ?? []).sort(),
      reason: repos
        ? `${each.length} repositories are called ${name}: name one by its remote (${each
            .map((f) => f.remote)
            .sort()
            .join(", ")})`
        : `${each.length} different folders are called ${name}: rename one (slipbox name <new>, in it)`,
      folders: each,
    };
  }
  const group = groups[0]!;
  const f = group[0]!;
  // Its default, a copy of the repository under any name (DF-D30); one that is no copy of it now, its first.
  const def =
    f.default && repositoryCopies(f, folders).some((c) => c.path === f.default) ? f.default : f.copies[0]!.path;
  if (copyAvailable(def)) return { status: "found", folder: f, path: def, ...(via ? { via } : {}) };
  // Another copy: of that folder, else of the repository under another name.
  for (const g of group) {
    const other = g.copies.find((c) => c.path !== def && copyAvailable(c.path));
    if (other) return { status: "found", folder: g, path: other.path, via: via ?? "another-copy" };
  }
  return { status: "unavailable", folder: f, path: def };
}

/** A folder's name as a pointer is written with it (D74, D75), and what that means: said, or asked first (D83). */
export interface PointerNaming {
  /** What's written: the short name, or on a clash the qualified one, when the folder has one. */
  name: string;
  /** Its short name. */
  short: string;
  /** Its qualified name (a repository's remote), when it has one. */
  qualified: string | null;
  /** Its `.slipbox/` is kept out of git (`init --private`): the short name holds on this machine only. */
  private: boolean;
  /** The different folders this machine knows by the short name (their name or an alias): by it, a pointer is
   *  ambiguous — followed, it asks which. */
  clash: NamedFolder[];
}

/**
 * The name to write for a folder (a pointer's): its short name, unless a different folder this machine knows answers
 * to it too, as the lookup reads one (its name or an alias) — then a repository's qualified name; a `.slipbox/`
 * folder keeps its short one (ambiguous until one is renamed). With what writing it means: a private name, a clash.
 */
export function pointerNaming(
  f: Pick<NamedFolder, "key" | "name" | "remote"> & { private?: boolean },
  folders = readFolders(),
): PointerNaming {
  const n = f.name.toLowerCase();
  // A copy of the same repository is no different folder: the lookup reads them as one.
  const clash = folders.filter(
    (x) => x.key !== f.key && !sameRepository(x, f) && [x.name, ...x.aliases].some((y) => y.toLowerCase() === n),
  );
  return {
    name: clash.length && f.remote ? f.remote : f.name,
    short: f.name,
    qualified: f.remote,
    private: !!f.private,
    clash,
  };
}

/** The name to write for a folder (a pointer's): `pointerNaming`'s. */
export function pointerName(f: Pick<NamedFolder, "key" | "name" | "remote">, folders = readFolders()): string {
  return pointerNaming(f, folders).name;
}

/**
 * What a pointer written by `n` says, for the CLI's warnings and the TUI's message line (D74, D83): a clash, written
 * by the qualified name or left ambiguous; a private name written, working on this machine only.
 */
export function pointerWarnings(n: PointerNaming): string[] {
  const out: string[] = [];
  const many = `${n.clash.length + 1} different folders are called ${n.short}`;
  if (n.clash.length)
    out.push(
      n.name !== n.short
        ? `${many}: written by its qualified name, ${n.name}`
        : `${many}: followed, the pointer asks which — rename one (slipbox name <new>, in it)`,
    );
  const priv = privateNameWarning(n);
  if (priv) out.push(priv);
  return out;
}

/** A private name written (D74): the pointer works on this machine only; null for any other. */
export function privateNameWarning(n: PointerNaming): string | null {
  return n.private && n.name === n.short
    ? `${n.short} is a private name (its .slipbox/ is kept out of git): the pointer works on this machine only`
    : null;
}
