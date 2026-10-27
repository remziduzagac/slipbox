// The file walk (plan 1.2), implementing decision 0.11. The watcher uses the same `WalkFilter`,
// so what the walk excludes is exactly what the watcher does not subscribe to (5.2).
//
// Home (VV-D2) is walked by the same filter with its skip list (`homeSkip`) instead of `.gitignore`: a slice at a
// time (`SlicedWalk`), breadth first, as far as its cap (`HOME_LIMITS`).

import { type Dirent, lstatSync, readdirSync, realpathSync, type Stats, statSync } from "node:fs";
import { readRegular, SMALL_FILE } from "../../foundation/platform/fsutil.ts";
import { basename, dirname, join, relative, sep } from "node:path";
import ignore, { type Ignore } from "ignore";
import type { Config } from "../../application/config/config.ts";
import { classify } from "../../documents/model/filetypes.ts";
import { mountsIn } from "../vaults/mounts.ts";
import { userFolders } from "../../foundation/platform/paths.ts";
import { answered, linkAnswer } from "../vaults/symlinks.ts";
import { findVaultRoot, isInside, isVaultRoot, MARKER, rootMarkers } from "../vaults/vault.ts";

export interface NoteFile {
  /** Vault-relative, always `/`-separated. */
  rel: string;
  abs: string;
  size: number;
  mtimeMs: number;
}

export interface Skipped {
  rel: string;
  reason: string;
  /** A link the walk didn't go through (VV-D6): where it leads, by its real path, and whether that's a folder. */
  link?: { target: string; dir: boolean };
}

export interface WalkResult {
  files: NoteFile[];
  /** Non-note files (vault-relative), for resolving `![[diagram.png]]` by name. */
  assets: string[];
  /** Every directory walked, `""` for the root — the watcher subscribes to exactly these. */
  dirs: string[];
  skipped: Skipped[];
  errors: string[];
  /** Home's walk (`SlicedWalk`, VV-D2): each folder's stamp as it was listed (`dirStamp`), by its path. */
  times?: Map<string, Stamp>;
}

/**
 * How long after a directory changes its mtime can't tell a later change apart: a coarse clock (FAT's
 * 2 s, HFS+'s 1 s, Linux's tick) can give the next change the same mtime. A directory read that soon
 * after its change is listed again.
 */
export const SETTLE_MS = 2000;

/** A directory's mtime as its stamp, when what it holds was read at `readAt`; -1, to list it again, when that was too
 *  soon after it changed (`SETTLE_MS`) or it couldn't be stat'ed. The watcher's, and home's walk kept (#12). */
export function settled(mtime: number | null, readAt: number): number {
  return mtime === null || mtime >= readAt - SETTLE_MS ? -1 : mtime;
}

/**
 * A folder's stamp in home's walk kept (#12): its mtime and its ctime as it was listed, which moves whenever its time
 * is set — so one put back to exactly its stamp still tells; `RELIST` (-1), to list it again (`stampOf`).
 */
export type Stamp = readonly [mtime: number, ctime: number];

/** A stat that failed for something other than its target's being gone: it's there, not to be looked at (#12). */
export function lost(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code;
  return code !== undefined && code !== "ENOENT" && code !== "ENOTDIR";
}

/** The folder holding `rel` (`""`: the top). */
export function parentOf(rel: string): string {
  const slash = rel.lastIndexOf("/");
  return slash >= 0 ? rel.slice(0, slash) : "";
}

/** The stamp of a folder to list again. */
export const RELIST: Stamp = [-1, -1];

/**
 * A folder's stamp from its times, read at `readAt`: `RELIST` when its mtime is too recent to tell a later change
 * apart (`settled`), or its ctime is in whole seconds — a coarse clock's (HFS+, ext3, ext4's small inodes, many network
 * shares), where a later change within the second can leave it as it was — and as recent.
 */
export function stampOf(mtimeMs: number, ctimeMs: number, readAt: number): Stamp {
  const coarse = ctimeMs % 1000 === 0 && ctimeMs >= readAt - SETTLE_MS;
  return settled(mtimeMs, readAt) === -1 || coarse ? RELIST : [mtimeMs, ctimeMs];
}

/** A folder's stamp, read at `readAt` — before what it holds is read; `RELIST` when it can't be stat'ed. */
export function dirStamp(path: string, readAt: number): Stamp {
  try {
    const st = statSync(path);
    return stampOf(st.mtimeMs, st.ctimeMs, readAt);
  } catch {
    return RELIST;
  }
}

const ALWAYS_SKIPPED = new Set([".git", MARKER]);
/** git's default `core.ignorecase`: true on macOS (case-insensitive filesystem), false on Linux. */
const GIT_IGNORECASE = process.platform === "darwin" || process.platform === "win32";

/**
 * The busy folders' names (VV-D8): tools' output, their environments and their caches — many files, none of them a
 * person's notes. A folder of such a name is busy when it looks generated (D237, `isBusyFolder`): every walk leaves it
 * out, a vault's as home's (VV-D2); the explorer lists it, never indexed.
 */
export const BUSY_FOLDERS: ReadonlySet<string> = new Set([
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  "target",
  "build",
  "dist",
  ".next",
  "vendor",
  "Pods",
  "DerivedData",
  ".gradle",
  ".tox",
]);

/** A busy folder's name (VV-D8): one of `BUSY_FOLDERS`, or a cache's (`cache`, `.cache`, `Caches`, `pip-cache`). */
export function isBusyName(name: string): boolean {
  return BUSY_FOLDERS.has(name) || /(^|[._-])caches?$/i.test(name);
}

/**
 * The busy folders' rule (VV-D8, as D237 has it), the one place it's decided: a folder of a busy name (`name`) is busy
 * when it looks generated — ignored by its repository's `.gitignore` (`ignored`), or holding no note directly in it
 * (`notes`; its folders don't count). A notes folder called `build`, not ignored, is a folder like any. Each is asked
 * only when the name is busy, `notes` only when it isn't ignored: a listing of the folder.
 */
export function isBusyFolder(name: string, ignored: () => boolean, notes: () => boolean): boolean {
  return isBusyName(name) && (ignored() || !notes());
}

/** Which of the rule's two things make a busy folder busy (D237): `.gitignore` ignores it; no note at its top. */
export interface BusyWhy {
  ignored: boolean;
  noNotes: boolean;
}

/**
 * Why a folder is busy, when `isBusyFolder` says it is: which of its two things hold — both asked here, so that both
 * are said where both hold (the explorer's `⊘`, VV-D9). Null when it isn't busy.
 */
export function busyWhy(name: string, ignored: () => boolean, notes: () => boolean): BusyWhy | null {
  if (!isBusyFolder(name, ignored, notes)) return null;
  return { ignored: ignored(), noNotes: !notes() };
}

/** Whether the folder `abs` holds a note directly in it: a file named as a note, not hidden. One listing; none there, no. */
export function holdsNotes(abs: string, isNoteName: (name: string) => boolean): boolean {
  try {
    return readFolder(abs).some((e) => !e.isDirectory() && !e.name.startsWith(".") && isNoteName(e.name));
  } catch {
    return false;
  }
}

/**
 * The rule asked of a folder outside every walk at hand (the explorer's rows above or beside the vault open): ignored as
 * the walk of the vault holding it reads its `.gitignore`s; home and Elsewhere read none.
 */
export function busyFolderAt(abs: string, walk: Config["walk"]): boolean {
  if (!isBusyName(basename(abs))) return false;
  const { filter, rel } = filterHolding(abs, walk);
  return filter.busy(rel);
}

/** `busyFolderAt`, saying why (`busyWhy`): null when the folder `abs` isn't busy. */
export function busyFolderWhyAt(abs: string, walk: Config["walk"]): BusyWhy | null {
  if (!isBusyName(basename(abs))) return null;
  const { filter, rel } = filterHolding(abs, walk);
  return filter.busyWhy(rel);
}

/** The filter of the walk of the vault holding `abs`, and its path there; outside every vault, home's rules. */
function filterHolding(abs: string, walk: Config["walk"]): { filter: WalkFilter; rel: string } {
  const root = findVaultRoot(dirname(abs));
  const filter = new WalkFilter(root ?? dirname(abs), walk, { home: !root });
  return { filter, rel: root ? relative(root, abs).split(sep).join("/") : basename(abs) };
}

/** The system's folders at home's top, by platform (VV-D2): an application's, never a person's notes. */
const SYSTEM_FOLDERS: Record<string, readonly string[]> = { darwin: ["Library"], win32: ["AppData"] };

/** Why home's walk leaves a folder out (VV-D2). */
export type HomeSkip = "hidden" | "system folder" | "Downloads";

/**
 * Why home's walk leaves the folder `rel` (home's path for it) out, or null — home's skip list (VV-D2): a hidden folder
 * (`.cache`, `.config`, `.local`, every dot folder), the system's (`Library` on macOS, `AppData` on Windows),
 * `Downloads` (`downloads`: where the desktop keeps it, as home's path for it); a busy folder anywhere is
 * `WalkFilter.exclusion`'s, which reads the disk (D237). Its files are left out by `exclusion` too: what the explorer
 * doesn't list as a note or a text file.
 */
export function homeSkip(rel: string, opts: { platform?: string; downloads?: string } = {}): HomeSkip | null {
  const name = rel.slice(rel.lastIndexOf("/") + 1);
  if (name.startsWith(".")) return "hidden";
  const top = !rel.includes("/");
  if (top && (SYSTEM_FOLDERS[opts.platform ?? process.platform] ?? []).includes(name)) return "system folder";
  if (rel === (opts.downloads ?? "Downloads")) return "Downloads";
  return null;
}

/**
 * Why home's walk leaves out a folder where another filesystem is mounted (VV-D2): a share, a USB disk, an sshfs or NFS
 * mount — one that stops answering would hang whatever looks into it. Known from the mount table, never by looking.
 */
export const ANOTHER_DISK = "another disk";

/** Home's Downloads, as home's path for it: where the desktop says (`user-dirs.dirs`), else `Downloads`. */
function downloadsIn(home: string): string {
  const at = userFolders(home).find((f) => f.name === "Downloads")?.path;
  const rel = at ? relative(home, at).split(sep).join("/") : "";
  return rel && !rel.startsWith("..") ? rel : "Downloads";
}

/** What makes a filter (T12): its folder, its walk settings, its opts — for one made the same elsewhere (`filterFrom`). */
export interface FilterSettings {
  root: string;
  walk: Config["walk"];
  opts: { home?: boolean; platform?: string };
}

/** The filter `settings` make. */
export function filterFrom(settings: FilterSettings): WalkFilter {
  return new WalkFilter(settings.root, settings.walk, settings.opts);
}

export class WalkFilter {
  private readonly extensions: Set<string>;
  /** `walk.exclude`, as it was when the filter was made: what it applies. */
  private readonly exclude: string[];
  private readonly gitignores = new Map<string, Ignore | null>();
  private readonly configIgnore: Ignore;
  /** Home's Downloads (VV-D2), as home's path for it; null in a vault's filter. */
  private readonly downloads: string | null;
  /** Home's folders where another filesystem is mounted (VV-D2), as home's paths for them: read from the mount table
   *  at each walk (`readMounts`), the first time one's needed else. */
  private mounts: Set<string> | null = null;

  /** `home`: home's filter (VV-D2) — its skip list, never a `.gitignore`. */
  constructor(
    readonly root: string,
    private readonly walk: Config["walk"],
    readonly opts: { home?: boolean; platform?: string } = {},
  ) {
    this.extensions = new Set(walk.extensions.map((e) => e.replace(/^\./, "").toLowerCase()));
    this.exclude = [...walk.exclude];
    this.configIgnore = ignore({ ignorecase: GIT_IGNORECASE }).add(this.exclude);
    this.downloads = opts.home ? downloadsIn(root) : null;
  }

  /** Home's filter (VV-D2), not a vault's. */
  get home(): boolean {
    return !!this.opts.home;
  }

  /** What makes this filter, for one made the same on another thread (T12): its folder, its settings, its opts. */
  get settings(): FilterSettings {
    return { root: this.root, walk: this.walk, opts: this.opts };
  }

  isNoteName(name: string): boolean {
    const dot = name.lastIndexOf(".");
    return dot > 0 && this.extensions.has(name.slice(dot + 1).toLowerCase());
  }

  get maxFileSize(): number {
    return this.walk.max_file_size;
  }

  /** The mount table read again (VV-D2: home's), once per walk: a disk mounted or taken away since is seen. */
  readMounts(): void {
    if (!this.home) return;
    let real = this.root;
    try {
      real = realpathSync(this.root);
    } catch {}
    this.mounts = mountsIn(this.root, real);
  }

  /** Whether `rel` is, or is in, a folder of home where another filesystem is mounted (VV-D2); never in a vault. */
  onMount(rel: string): boolean {
    if (!this.home) return false;
    if (!this.mounts) this.readMounts();
    if (!this.mounts!.size) return false;
    for (let i = rel.indexOf("/"); i > 0; i = rel.indexOf("/", i + 1))
      if (this.mounts!.has(rel.slice(0, i))) return true;
    return this.mounts!.has(rel);
  }

  /** Whether another filesystem is mounted at `rel` itself, a folder of home (VV-D2): not one in it. */
  mountAt(rel: string): boolean {
    if (!this.home) return false;
    if (!this.mounts) this.readMounts();
    return this.mounts!.has(rel);
  }

  /**
   * What decides which files home's walk takes, the disk aside (VV-D2): the note extensions, `walk.exclude`, the root
   * markers, where Downloads is, the platform. A walk kept under other settings is no walk of home's now (`homeWalk`).
   */
  signature(): string {
    return JSON.stringify({
      extensions: [...this.extensions].sort(),
      exclude: this.exclude,
      markers: [...rootMarkers()].sort(),
      downloads: this.downloads,
      platform: this.opts.platform ?? process.platform,
    });
  }

  /**
   * Whether `rel` may be indexed when it's reached though the walk leaves it out (20.8): nothing on
   * its way is always skipped, a busy folder (VV-D8), excluded by `walk.exclude` or a vault of its own —
   * only a hidden folder or `.gitignore` keeps it from the walk. In home, nothing its skip list leaves
   * out is read (VV-D2): named, such a file is opened, and nothing more.
   */
  reachable(rel: string): boolean {
    const parts = rel.split("/");
    if (parts.some((p) => !p || p === "." || p === "..")) return false;
    for (let i = 0; i < parts.length; i++) {
      const prefix = parts.slice(0, i + 1).join("/");
      const why = this.exclusion(prefix, i < parts.length - 1);
      if (why !== null && (this.home || (why !== "hidden" && why !== ".gitignore"))) return false;
      // A root of its own, hidden or git-ignored too (a vendored clone): `exclusion` says why the
      // walk skips it before it looks for markers.
      if (why !== null && i < parts.length - 1 && isVaultRoot(join(this.root, prefix))) return false;
    }
    return true;
  }

  /** Whether `walk.exclude` names `rel` itself — a folder, with `isDir` — whatever leaves it out before. */
  excludes(rel: string, isDir: boolean): boolean {
    return this.configIgnore.ignores(isDir ? `${rel}/` : rel);
  }

  /**
   * Why a file written at `rel` — a folder, with `isDir` — is never indexed though the write is allowed (D246): its name,
   * or a folder's on its way, is one `walk.exclude` names. Not refused, as a busy folder's new note is — the setting is
   * yours — but said after the write. Null where it's indexed, and under a root nested on its way (indexed there, by
   * its own settings). Elsewhere, which indexes nothing, is `Graph.notIndexed`'s to leave out.
   */
  notIndexed(rel: string, isDir = false): "walk.exclude" | null {
    const parts = rel.split("/");
    if (!parts.some((_, i) => this.excludes(parts.slice(0, i + 1).join("/"), isDir || i < parts.length - 1)))
      return null;
    for (let i = 1; i < parts.length + (isDir ? 1 : 0); i++)
      if (isVaultRoot(join(this.root, parts.slice(0, i).join("/")))) return null;
    return "walk.exclude";
  }

  /** Why `rel` is excluded, or null when it is part of the vault. Ancestors are assumed walked. */
  exclusion(rel: string, isDir: boolean): string | null {
    const name = rel.slice(rel.lastIndexOf("/") + 1);
    if (ALWAYS_SKIPPED.has(name)) return "always skipped";
    if (name.startsWith(".")) return "hidden";
    if (this.excludes(rel, isDir)) return "walk.exclude";
    // Home (VV-D2): its skip list, never a `.gitignore` — a dotfiles repository's `*` would leave home empty.
    if (this.home) {
      if (isDir) {
        const why = homeSkip(rel, { platform: this.opts.platform, downloads: this.downloads ?? undefined });
        if (why) return why;
        // Another disk: never looked into, nor for a marker — known from the mount table alone.
        if (this.onMount(rel)) return ANOTHER_DISK;
        // A busy folder (D237): looked into for a note at its top, so after another disk, which never is.
        if (this.busy(rel)) return "busy folder";
        return isVaultRoot(join(this.root, rel)) ? "nested vault" : null;
      }
      // What the explorer doesn't list as a note or a text file: a picture, an archive, a program.
      return this.isNoteName(name) || classify(name, this.walk.extensions).group !== "binary"
        ? null
        : "not a note or text file";
    }
    // A busy folder (VV-D8, D237): listed in the explorer, never indexed — ignored, it's busy rather than reached.
    if (isDir && this.busy(rel)) return "busy folder";
    if (this.ignoredByGit(rel, isDir)) return ".gitignore";
    // A folder holding a root marker (`walk.root_markers`, 21.1: `.git`, `.slipbox/`, `.obsidian/`, `.zk/`…)
    // inside: a root of its own (20.3).
    if (isDir && isVaultRoot(join(this.root, rel))) return "nested vault";
    return null;
  }

  /**
   * Whether the folder `rel` is busy (VV-D8, D237): `isBusyFolder`, asked with what this walk knows — ignored by the
   * `.gitignore`s it reads (a vault's; home reads none), and its notes, listed once a walk. `notes`: it holds one,
   * whatever the disk says now (a write about to put one there).
   */
  busy(rel: string, notes?: boolean): boolean {
    return isBusyFolder(...this.busyAsked(rel, notes));
  }

  /** `busy`, saying why (`busyWhy`): which of the rule's two things hold. Null when `rel` isn't busy. */
  busyWhy(rel: string): BusyWhy | null {
    return busyWhy(...this.busyAsked(rel));
  }

  /** What the busy folders' rule is asked of `rel`: its name, whether it's ignored, whether it holds a note. */
  private busyAsked(rel: string, notes?: boolean): [string, () => boolean, () => boolean] {
    return [
      rel.slice(rel.lastIndexOf("/") + 1),
      () => !this.home && this.ignoredByGit(rel, true),
      () => notes ?? this.notesIn(rel),
    ];
  }

  /**
   * Whether `rel` holds a note at its top: listed once a walk (`newWalk`), and again when its folder changed since (its
   * mtime) — a note written there, by slipbox or not, is seen the next time it's asked.
   */
  private notesIn(rel: string): boolean {
    const abs = join(this.root, rel);
    let mtimeMs: number;
    try {
      mtimeMs = statSync(abs).mtimeMs;
    } catch {
      return false; // not there: no note in it
    }
    const known = this.notesAt.get(rel);
    if (known?.mtimeMs === mtimeMs) return known.has;
    const has = holdsNotes(abs, (n) => this.isNoteName(n));
    this.notesAt.set(rel, { mtimeMs, has });
    return has;
  }

  /** What the busy-named folders hold, by their path, and when they were listed: listed again in each walk. */
  private readonly notesAt = new Map<string, { mtimeMs: number; has: boolean }>();

  /** A walk begins: the busy-named folders are looked into again (D237). */
  newWalk(): void {
    this.notesAt.clear();
  }

  /**
   * git semantics: every .gitignore from the root down applies to the path relative to its own directory, and the last
   * one with an opinion wins — so a deeper `!keep.md` re-includes. (A directory already excluded is never descended
   * into, as with git.)
   */
  private ignoredByGit(rel: string, isDir: boolean): boolean {
    let ignored = false;
    let dir = "";
    const parts = rel.split("/");
    for (let i = 0; i < parts.length; i++) {
      const ig = this.gitignoreFor(dir);
      if (ig) {
        const sub = parts.slice(i).join("/");
        const t = ig.test(isDir ? `${sub}/` : sub);
        if (t.ignored) ignored = true;
        else if (t.unignored) ignored = false;
      }
      dir = dir ? `${dir}/${parts[i]}` : parts[i]!;
    }
    return ignored;
  }

  /** Drop a cached .gitignore, e.g. when the watcher sees it change. */
  invalidate(dirRel: string): void {
    this.gitignores.delete(dirRel);
  }

  private gitignoreFor(dirRel: string): Ignore | null {
    if (this.gitignores.has(dirRel)) return this.gitignores.get(dirRel)!;
    let ig: Ignore | null = null;
    try {
      const text = readRegular(join(this.root, dirRel, ".gitignore"), SMALL_FILE).toString("utf8");
      ig = ignore({ ignorecase: GIT_IGNORECASE }).add(text);
    } catch {}
    this.gitignores.set(dirRel, ig);
    return ig;
  }
}

/** One walk's place: what it has found so far, and its symlinked notes' targets (a note twice is dropped at its end). */
interface WalkState {
  root: string;
  realRoot: string;
  filter: WalkFilter;
  out: WalkResult;
  /** Symlinked notes found → their target, vault-relative. */
  links: Map<NoteFile, string>;
  /** Each folder's entries by name: which come first decides what a cap leaves out, the same each time. */
  sorted: boolean;
  /** The folders outside the vault its followed links lead to (VV-D6), by their real paths: each walked once. */
  followed: Set<string>;
  /** How many of its other files it lists at most (home's cap, VV-D2): those found first, nearest the top. */
  maxAssets: number;
}

/** `mounts`: the mount table read again for this walk — not for one that goes on from another (home's folders listed
 *  again, or asked for: the build's own walk read it). `stamped`: each folder's time kept as it's listed (`times`). */
function startWalk(
  root: string,
  filter: WalkFilter,
  { sorted = false, maxAssets = Infinity, mounts = true, stamped = false } = {},
): WalkState {
  let realRoot = root;
  try {
    realRoot = realpathSync(root);
  } catch {}
  // Where other disks are mounted, read once for the walk (home's: never gone into, VV-D2).
  if (mounts) filter.readMounts();
  filter.newWalk(); // the busy-named folders looked into again (D237)
  const out: WalkResult = { files: [], assets: [], dirs: [], skipped: [], errors: [] };
  if (stamped) out.times = new Map();
  return { root, realRoot, filter, out, links: new Map(), sorted, followed: new Set(), maxAssets };
}

/** A walk done: a symlinked note whose target it includes dropped, the notes sorted. */
function finishWalk(st: WalkState): WalkResult {
  const result = st.out;
  // A symlinked note whose target the walk already includes is the same note twice: it would
  // double every backlink. Keep it only when its target is not otherwise in the vault.
  const walked = new Set(result.files.filter((f) => !st.links.has(f)).map((f) => f.rel));
  result.files = result.files.filter((f) => {
    const target = st.links.get(f);
    if (target === undefined || !walked.has(target)) return true;
    result.skipped.push({ rel: f.rel, reason: `symlink to ${target}, already in the vault` });
    return false;
  });
  result.files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return result;
}

export function walkVault(root: string, filter: WalkFilter): WalkResult {
  const st = startWalk(root, filter);
  const visit = (rel: string) => listDir(st, rel, visit);
  visit("");
  return finishWalk(st);
}

/**
 * Home's cap (VV-D2): its index holds this many notes at most, and its walk lists this many folders — and this many of
 * its other files, for a link to name one (those past it are left unlisted: the walk goes on for notes).
 */
export const HOME_LIMITS = { notes: 10_000, folders: 5_000, assets: 10_000 } as const;

/** A walk's cap: so many notes, so many folders, and so many other files (none: no cap on them). */
export interface WalkLimits {
  notes: number;
  folders: number;
  assets?: number;
}

/** What stopped a walk short: its cap of notes, or of folders. */
export type WalkCap = "notes" | "folders";

/**
 * A walk made a slice at a time (VV-D2: home's, while nobody is working), breadth first — the folders nearest the top
 * before deeper ones, so a cap leaves out the deepest — as far as `limits` allows. `step` works for a while; `result`
 * is the walk once it's done, `capped` what stopped it short. Each folder listed is stamped (`times`), for home's
 * walk kept to tell one changed since.
 */
export class SlicedWalk {
  private readonly st: WalkState;
  private readonly queue: string[];
  private next = 0;
  private done: WalkResult | null = null;
  capped: WalkCap | null = null;

  /** `from`: the folders to list, the top by default — a walk going on from another, whose mount table it takes;
   *  `known`: folders walked already, never gone into again; `stamped: false`, for a walk never kept: no stamps. */
  constructor(
    root: string,
    filter: WalkFilter,
    readonly limits: WalkLimits = HOME_LIMITS,
    private readonly opts: { from?: string[]; known?: ReadonlySet<string>; stamped?: boolean } = {},
  ) {
    const { stamped = true } = opts;
    this.st = startWalk(root, filter, { sorted: true, maxAssets: limits.assets, mounts: !opts.from, stamped });
    this.queue = [...(opts.from ?? [""])];
  }

  /** Folders listed so far. */
  get folders(): number {
    return this.st.out.dirs.length;
  }

  /** The walk, once it's done; null until then. */
  get result(): WalkResult | null {
    return this.done;
  }

  /** Work for up to `budgetMs`, a folder at least; false once the walk is done. */
  step(budgetMs: number): boolean {
    if (this.done) return false;
    const end = performance.now() + budgetMs;
    const out = this.st.out;
    do {
      if (this.next >= this.queue.length) return this.finish(null);
      if (out.dirs.length >= this.limits.folders) return this.finish("folders");
      const dir = this.queue[this.next++]!;
      const listed = out.dirs.length;
      listDir(this.st, dir, (rel) => {
        if (!this.opts.known?.has(rel)) this.queue.push(rel);
      });
      // One that couldn't be read isn't in the walk: the folder holding it stamped to list again, so it's tried again
      // at each build till it can be read — a chmod moves no time the walk keeps (#12). Not one the walk had: that one
      // is to list again itself.
      if (out.times && dir && out.dirs.length === listed && !this.opts.known?.has(dir) && out.times.has(parentOf(dir)))
        out.times.set(parentOf(dir), RELIST);
      // Past the cap, not at it: a walk of exactly so many notes left nothing out.
      if (out.files.length > this.limits.notes) {
        out.files.length = this.limits.notes;
        return this.finish("notes");
      }
    } while (performance.now() < end);
    return true;
  }

  /** The folders a cap left unlisted: found, not looked into. */
  rest(): string[] {
    return this.queue.slice(this.next);
  }

  private finish(cap: WalkCap | null): false {
    this.capped = cap;
    this.done = finishWalk(this.st);
    return false;
  }
}

/**
 * A folder's top alone (VV-D2: home, not walked yet): its notes and files, the vaults in it; its folders listed, not
 * looked into.
 */
export function walkTop(root: string, filter: WalkFilter): WalkResult {
  const st = startWalk(root, filter, { sorted: true });
  listDir(st, "", (rel) => st.out.dirs.push(rel));
  return finishWalk(st);
}

/**
 * A slow disk, for the terminal tests (T12; `SLIPBOX_SLOW_DISK=<folder name>:<ms>[:<deadline ms>]`): a folder of that name
 * takes so long to list, on whichever thread lists it — the disk a check can't mount. Its deadline is walk-thread.ts's.
 */
export function slowDisk(env = process.env): { name: string; ms: number; deadline?: number } | null {
  const [name, ms, deadline] = (env.SLIPBOX_SLOW_DISK ?? "").split(":");
  if (!name || !(Number(ms) > 0)) return null;
  return { name, ms: Number(ms), ...(Number(deadline) > 0 ? { deadline: Number(deadline) } : {}) };
}

const readdirTyped = (abs: string): Dirent[] => {
  const slow = slowDisk();
  if (slow && basename(abs) === slow.name) Bun.sleepSync(slow.ms);
  return readdirSync(abs, { withFileTypes: true });
};
/** How the walk reads a folder: `readdirSync` (a terminal test's slow disk held up: `slowDisk`), unless a test holds it
 *  up itself (`setFolderReader`). */
let folderReader = readdirTyped;

/** A folder's entries, read as the walk reads them (the explorer's listings too, listing.ts). */
export function readFolder(abs: string): Dirent[] {
  return folderReader(abs);
}

/** A test's folder reader for the walk (T12: one held up on purpose, as a slow disk is); null, `readdirSync` again. */
export function setFolderReader(read: ((abs: string) => Dirent[]) | null): void {
  folderReader = read ?? readdirTyped;
}

/** One folder listed: its notes and files kept, each folder of it given to `descend`, a vault in it skipped. */
function listDir(st: WalkState, dirRel: string, descend: (rel: string) => void): void {
  const { root, filter, out } = st;
  // Stamped before it's read: a change while it's read moves its time past the stamp.
  const stamp = out.times && dirStamp(join(root, dirRel), Date.now());
  let entries: Dirent[];
  try {
    entries = folderReader(join(root, dirRel));
  } catch (err) {
    out.errors.push(`${dirRel || "."}: ${(err as NodeJS.ErrnoException).code ?? (err as Error).message}`);
    return;
  }
  if (st.sorted) entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  out.dirs.push(dirRel);
  if (stamp) out.times?.set(dirRel, stamp);
  for (const entry of entries) {
    const rel = dirRel ? `${dirRel}/${entry.name}` : entry.name;
    const abs = join(root, rel);
    if (entry.isDirectory()) {
      const why = filter.exclusion(rel, true);
      if (why === null) descend(rel);
      // A vault of its own, another disk (home's, VV-D2): said, so what's kept knows it.
      else if (why === "nested vault" || why === ANOTHER_DISK) out.skipped.push({ rel, reason: why });
      continue;
    }
    if (entry.isSymbolicLink()) {
      handleSymlink(abs, rel, st, descend);
      continue;
    }
    if (!entry.isFile()) continue;
    if (filter.exclusion(rel, false) !== null) continue;
    if (filter.isNoteName(entry.name)) addFile(abs, rel, filter, out);
    else if (out.assets.length < st.maxAssets) out.assets.push(rel);
  }
}

/** Why the walk didn't go through a link (VV-D6), as `Skipped` says it. */
export const LINK_REASON = {
  /** Within the vault, to a folder: a second name for what's walked under its own. */
  within: "link within the vault: a second name for its folder",
  /** Out of the vault, not followed: you haven't said to, or said no, or it leads elsewhere since. */
  out: "link not followed: it leads out of the vault",
  /** Followed, its target not answering yet: asked in the background, walked once it answers. */
  waiting: "link followed, its target not answering yet",
  /** Followed, to a folder that holds the vault: walking it would walk the vault again. */
  loop: "link to a folder holding the vault",
  /** Followed, to a folder another followed link leads into: walked once, under that one's name. */
  twice: "link to a folder followed already, through another link",
} as const;

/** What the walk makes of a symlink: kept (a file read, a folder walked), or skipped with why. */
export type LinkVerdict =
  | { kept: true; target: string; dir: boolean }
  | { kept: false; reason: string | null; special?: boolean; link?: { target: string; dir: boolean } };

/**
 * What the walk makes of the symlink at `abs` (0.11, VV-D6) — the watcher too, so both take the same. Within the vault
 * (`realRoot`, its real path), a file is kept, and a folder is a second name for what's walked already, never walked
 * twice; a link leading out is followed only when you said so for that link and that target (`links.json`), once its
 * target answered (`answered`: a disk that doesn't is never waited for), and a folder never into one holding the
 * vault. Anything else is skipped, with why (`special`: a FIFO, socket or device).
 */
export function symlinkVerdict(abs: string, realRoot: string): LinkVerdict {
  let target: string;
  try {
    target = realpathSync(abs);
  } catch {
    return { kept: false, reason: "broken symlink" };
  }
  let st: Stats;
  try {
    st = statSync(target);
  } catch {
    return { kept: false, reason: null };
  }
  const dir = st.isDirectory();
  // A FIFO, socket or device: reading one would hang.
  if (!dir && !st.isFile()) return { kept: false, reason: "symlink to something that isn't a file", special: true };
  const link = { target, dir };
  if (isInside(realRoot, target))
    return dir ? { kept: false, reason: LINK_REASON.within, link } : { kept: true, target, dir: false };
  if (linkAnswer(abs, target) !== "follow") return { kept: false, reason: LINK_REASON.out, link };
  if (answered(target) !== true) return { kept: false, reason: LINK_REASON.waiting, link };
  if (dir && isInside(target, realRoot)) return { kept: false, reason: LINK_REASON.loop, link };
  return { kept: true, target, dir };
}

function handleSymlink(abs: string, rel: string, st: WalkState, descend: (rel: string) => void): void {
  const { filter, out, realRoot } = st;
  const v = symlinkVerdict(abs, realRoot);
  if (!v.kept) {
    // Home's walk: a link whose target can't be looked at now (gone, a disk taken away, not searched) — its folder to
    // list again, so it's looked at again at each build, and walked once its target is back (#12).
    if (out.times && (v.reason === "broken symlink" || v.reason === null)) out.times.set(parentOf(rel), RELIST);
    if (v.reason && (!v.special || filter.isNoteName(rel.slice(rel.lastIndexOf("/") + 1))))
      out.skipped.push({ rel, reason: v.reason, ...(v.link ? { link: v.link } : {}) });
    return;
  }
  const target = v.target;
  if (v.dir) {
    // A folder you follow (VV-D6): walked as the vault's, under the link's name — once, whatever leads to it.
    const why = filter.exclusion(rel, true);
    if (why === "nested vault") out.skipped.push({ rel, reason: why });
    if (why !== null) return;
    if ([...st.followed].some((f) => isInside(f, target) || isInside(target, f)))
      return void out.skipped.push({ rel, reason: LINK_REASON.twice, link: { target, dir: true } });
    st.followed.add(target);
    descend(rel);
    return;
  }
  if (filter.exclusion(rel, false) !== null) return;
  if (!filter.isNoteName(rel.slice(rel.lastIndexOf("/") + 1))) {
    if (out.assets.length < st.maxAssets) out.assets.push(rel);
    return;
  }
  addFile(abs, rel, filter, out);
  const added = out.files[out.files.length - 1];
  if (added?.rel === rel) st.links.set(added, relative(realRoot, target).split(sep).join("/"));
}

function addFile(abs: string, rel: string, filter: WalkFilter, out: WalkResult): void {
  try {
    const st = statSync(abs);
    if (st.size > filter.maxFileSize) {
      out.skipped.push({ rel, reason: `larger than walk.max_file_size (${st.size} bytes)` });
      return;
    }
    out.files.push({ rel, abs, size: st.size, mtimeMs: st.mtimeMs });
  } catch (err) {
    out.errors.push(`${rel}: ${(err as NodeJS.ErrnoException).code ?? (err as Error).message}`);
    // Home's walk: a note there but not to be looked at — its folder to list again, so it's tried again (#12).
    if (lost(err) && out.times) out.times.set(parentOf(rel), RELIST);
  }
}

/** Single-file mode: only the notes directly in one directory. */
export function listDirectory(dir: string, filter: WalkFilter): WalkResult {
  const result: WalkResult = { files: [], assets: [], dirs: [""], skipped: [], errors: [] };
  let entries: Dirent[] = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    result.errors.push(`${dir}: ${(err as Error).message}`);
  }
  for (const e of entries) {
    if (!filter.isNoteName(e.name) || filter.exclusion(e.name, false) !== null) continue;
    const abs = join(dir, e.name);
    try {
      const st = lstatSync(abs).isSymbolicLink() ? statSync(abs) : lstatSync(abs);
      if (!st.isFile()) continue;
      if (st.size > filter.maxFileSize) {
        result.skipped.push({ rel: e.name, reason: `larger than walk.max_file_size (${st.size} bytes)` });
        continue;
      }
      result.files.push({ rel: e.name, abs, size: st.size, mtimeMs: st.mtimeMs });
    } catch {}
  }
  result.files.sort((a, b) => (a.rel < b.rel ? -1 : 1));
  return result;
}
