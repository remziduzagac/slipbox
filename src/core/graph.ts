// The vault graph: notes, their outgoing links, backlinks, and the persisted index (1.9).
//
// One pass over the vault extracts per-note facts (title, headings, links). Resolution happens at
// query time against the LinkIndex, so adding or removing a note never leaves stale answers.
// The CLI reads a fresh cache instead of reparsing every note on every agent call (9.4).
//
// Here, the graph: its walk, the index kept, a file's changes heard, backlinks, tags and problems. What it
// keeps of a note and its links is graph-types.ts's, a note's entry made from its text graph-extract.ts's,
// and how a link resolves graph-resolve.ts's (`LinkResolver`). All of it is imported from here.

import { statSync } from "node:fs";
import { commentLinks, grammar, grammarFor, grammarNow, linkTokens, parseSyntax, type Grammar } from "./syntax.ts";
import { basename, isAbsolute, join, posix, relative, sep } from "node:path";
import { isMainThread } from "node:worker_threads";
import type { Config } from "./config.ts";
import { climbsOut, ensureDir, readJson, readText, sweepTemps, writeJson } from "./fsutil.ts";
import { blockingLink } from "./symlinks.ts";
import { countForms, type FormCounts } from "./convention.ts";
import { LinkIndex, normKey, onDisk, type Resolution } from "./links.ts";
import type { ParseCache as ChunkCache } from "./parse.ts";
import { tildePath } from "./names.ts";
import { sharedParseCache } from "./parsecache.ts";
import { cacheDir, ensureCacheHome, stateDir } from "./paths.ts";
import { headCommit, headOf } from "./git.ts";
import { changedBetween, inVault } from "./gitops.ts";
import { contentHash, Redirects } from "./redirects.ts";
import { dataLinks, parseData } from "./data.ts";
import { classify, extensionOf } from "./filetypes.ts";
import { type AskedWhole, type HomeWalk, homeWalk, inFolders, walksInto } from "./home.ts";
import { checkoutAt, findVaultRoot, isListed, isVaultRoot, type VaultLocation } from "./vault.ts";
import {
  HOME_LIMITS,
  listDirectory,
  type NoteFile,
  type Skipped,
  type WalkCap,
  WalkFilter,
  walkVault,
} from "./walk.ts";
import { tagKey, tagName } from "./tags.ts";
import {
  type LinkRef,
  type NoteEntry,
  type VaultChange,
  type ResolvedLink,
  type Retarget,
  fragile,
  describeLanding,
  type Target,
  type VaultReach,
  type LinkProblem,
  disambiguated,
  type Backlink,
  NOTE_EXT_RE,
} from "./graph-types.ts";
import { INDEX_VERSION, extractNote, extractFromSource } from "./graph-extract.ts";
import { LinkResolver } from "./graph-resolve.ts";

export { certainty, fragile, describeLanding, disambiguated } from "./graph-types.ts";
export type {
  LinkKind,
  LinkRef,
  Pos,
  NoteEntry,
  VaultChange,
  Via,
  ResolvedLink,
  Retarget,
  Target,
  VaultReach,
  LinkProblem,
  Backlink,
} from "./graph-types.ts";
export { INDEX_VERSION, extractNote, extractText, frontmatterLinks, extractFromSource } from "./graph-extract.ts";
export { VAULT_LINK } from "./graph-resolve.ts";

interface IndexFile {
  version: number;
  entries: Record<string, NoteEntry>;
  /** The branch checked out when it was written (5.9): from another, its vanished notes weren't moved. */
  branch?: string | null;
  /** Files the walk leaves out that were reached (20.8): indexed all the same, and kept so. */
  reached?: string[];
}

export interface GraphStats {
  notes: number;
  parsed: number;
  cached: number;
  /** Notes the index had that the walk found gone (20.10). */
  gone: number;
  ms: number;
}

/** Data files larger than this aren't read for links (a lock file, a dump). */
const DATA_LINK_MAX = 256 * 1024;

export class Graph {
  readonly filter: WalkFilter;
  notes = new Map<string, NoteEntry>();
  index = new LinkIndex([]);
  dirs: string[] = [];
  /** When the last walk began (epoch ms): a folder changed since may hold what it didn't see. */
  walkedAt = 0;
  /** lower(basename) → vault-relative paths of non-note files. */
  assets = new Map<string, string[]>();
  skipped: Skipped[] = [];
  errors: string[] = [];
  stats: GraphStats = { notes: 0, parsed: 0, cached: 0, gone: 0, ms: 0 };
  private backlinkCache: Map<string, Backlink[]> | null = null;
  private tagCache: Map<string, { tag: string; notes: string[] }> | null = null;
  /** Bumped whenever what the notes say changes (a note read, changed, gone): views that show
   *  what's derived from them (the Info view's counts) know to look again. */
  generation = 0;
  private problemCache: {
    generation: number;
    broken: LinkProblem[];
    ambiguous: LinkProblem[];
    fragile: LinkProblem[];
    orphans: string[];
  } | null = null;
  private formCache: { generation: number; counts: FormCounts } | null = null;
  private readonly dataLinkCache = new Map<string, { stamp: string; links: LinkRef[] }>();
  /** How its links resolve (graph-resolve.ts): by path, by name or alias, by pointer or hosting URL; moves seen. */
  private readonly resolver = new LinkResolver(this);
  /** Other vaults (17.8–17.11); the CLI and the TUI set it, a graph opened alone has none. */
  reach: VaultReach | null = null;
  /**
   * Parse every note before calling a link unresolved: its alias may be in a note not parsed yet.
   * The CLI wants the right answer now; the TUI indexes in the background and lays out again.
   */
  thorough = false;

  /** `asked`: the folders of home asked for by name in the graph this one replaces (`askedFolders`), carried over. */
  constructor(
    readonly loc: VaultLocation,
    readonly config: Config,
    asked: readonly string[] = [],
  ) {
    this.filter = new WalkFilter(loc.root, config.walk, { home: loc.mode === "home" });
    this.asked = [...asked];
  }

  /** Home's walk (VV-D2): when it was made (null: not yet, its top alone looked at), what its cap left out, the folders
   *  asked for by name walked into it whole. Null in a vault or a plain folder, which are walked whole at each build. */
  home: { walked: number | null; capped: WalkCap | null; asked?: AskedWhole } | null = null;

  /** The folders of home asked for by name (VV-D2), home's paths for them: walked at each build its walk doesn't
   *  cover them. */
  private readonly asked: string[];

  /** The folders of home asked for by name (VV-D2): a graph built anew for home (a `[walk]` setting changed) carries
   *  them over, so what was asked for keeps its notes. */
  get askedFolders(): readonly string[] {
    return this.asked;
  }

  /**
   * Folders of home asked for by name (VV-D2: `slipbox ~/notes`, a file in it, the tabs a session brings back, each
   * one's), by their whole paths: their notes known now. Those home's walk doesn't cover yet — never made, or its cap
   * reached short of them — have the graph built again once for them all, as it is at each build after until the walk
   * covers them (`homeWalk`); a graph not built yet is built now, whatever is asked. True when it was built.
   */
  askFolders(abs: readonly string[]): boolean {
    let walk = this.builds === 0;
    for (const a of abs) {
      const rel = this.homePath(a);
      if (rel === null || this.asked.includes(rel)) continue;
      this.asked.push(rel);
      // Listed by the build, as home's walk had it: a walk that stopped at its cap covers no folder whole, since one it
      // listed may hold folders it didn't; a folder walked whole, asked for before, covers those in it.
      const covered =
        this.dirs.includes(rel) &&
        ((this.home?.walked != null && !this.home.capped) || inFolders(rel, this.home?.asked?.folders ?? []));
      if (!covered && walksInto(this.root, this.filter, rel)) walk = true;
    }
    // Never built: with the index kept, as `openGraph` builds.
    if (walk) this.build(this.builds > 0 ? this.useCache : true, "lazy");
    return walk;
  }

  /** Home's path for a folder of home, by its whole path; null in a vault, for home's top, or outside it. */
  homePath(abs: string): string | null {
    if (this.loc.mode !== "home") return null;
    const rel = relative(this.root, abs).split(sep).join("/");
    return !rel || climbsOut(rel) || isAbsolute(rel) ? null : rel;
  }

  /**
   * Whether the folder `rel` waits for home's first walk (VV-D2): home not walked yet, a folder its graph hasn't looked
   * into — any but its top and the folders asked for by name, which are whole. The watcher leaves it to the walk. False
   * once a walk is kept, one capped too, and in a vault.
   */
  waitsForHomeWalk(rel: string): boolean {
    return this.home?.walked === null && rel !== "" && !inFolders(rel, this.asked);
  }

  /**
   * A folder come into home's top before its walk (VV-D2: `WatchBatch.toWalk`), listed as its top's folders are, never
   * looked into — while home's walk would go into it, and is still to make: named in a batch held while git wrote, it
   * may have gone, or become a vault, or home been walked, since. Whether it's listed.
   */
  listForWalk(rel: string): boolean {
    if (this.home?.walked !== null || !walksInto(this.root, this.filter, rel)) return false;
    if (!this.dirs.includes(rel)) this.dirs.push(rel); // listed before: gone and come again, looked at all the same
    return true;
  }

  get root(): string {
    return this.loc.root;
  }

  /**
   * Walk and index. `useCache` reads and refreshes the persisted index (vault mode only).
   *
   * `parse: "lazy"` parses nothing that the cache cannot supply: link resolution needs only the
   * walk's note names, so `render` and `resolve` never pay for parsing the whole vault. Entries
   * not yet parsed are stubs until `entry()`, `ensureAll()` or `parseSome()` fills them.
   *
   * Home (VV-D2) is never walked here: its walk is the one kept (`homeWalk`), the folders asked for that it doesn't
   * cover walked with it (`askFolders`), or `given` — one just made, a slice at a time, by the background index or the
   * TUI.
   */
  build(useCache = true, parse: "all" | "lazy" = "all", given?: HomeWalk): this {
    const t0 = performance.now();
    this.builds++;
    this.walkedAt = Date.now();
    const home =
      this.loc.mode === "home"
        ? (given ?? homeWalk(this.loc, this.filter, this.asked, HOME_LIMITS, this.keepsWalk))
        : null;
    // What changed after home's walk began may be missing from it: the watcher looks at those folders again.
    if (home?.walked) this.walkedAt = home.walked;
    this.home = home
      ? { walked: home.walked, capped: home.capped, ...(home.asked ? { asked: home.asked } : {}) }
      : null;
    const walk = home
      ? home.walk
      : isListed(this.loc)
        ? listDirectory(this.root, this.filter)
        : walkVault(this.root, this.filter);
    this.dirs = walk.dirs;
    this.assets.clear();
    for (const a of walk.assets) this.addAsset(a);
    this.skipped = walk.skipped;
    this.errors = walk.errors;
    // `$HOME` or `/` opened as a plain folder is listed, never indexed: nothing to keep (20.22).
    this.useCache = useCache && !isListed(this.loc);
    // What it reads, by its stamp: written since by anyone (its thread, the background index, the CLI), it's newer.
    this.indexStamp = this.useCache ? stampOf(this.cachePath) : "";
    const cached = this.useCache ? readJson<IndexFile | null>(this.cachePath, null) : null;
    this.indexRead = cached?.version === INDEX_VERSION;
    const old = this.indexRead ? cached!.entries : {};
    let reused = 0;
    this.notes.clear();
    this.unparsed.clear();
    // Files reached before (20.8), still there and still left out by the walk: indexed again.
    this.reached.clear();
    const reachedFiles: NoteFile[] = [];
    for (const rel of this.useCache ? (cached?.reached ?? []) : []) {
      const f = this.reachable(rel);
      if (!f || walk.files.some((w) => w.rel === rel)) continue;
      this.reached.add(rel);
      if (this.filter.isNoteName(basename(rel))) reachedFiles.push(f);
      else this.addAsset(rel);
    }
    for (const f of [...walk.files, ...reachedFiles]) {
      const prev = old[f.rel];
      if (prev && prev.mtimeMs === f.mtimeMs && prev.size === f.size && !isUnreadable(prev)) {
        this.notes.set(f.rel, prev);
        reused++;
      } else {
        this.notes.set(f.rel, stub(f));
        this.unparsed.set(f.rel, f);
      }
    }
    this.index = new LinkIndex(this.notes.keys());
    // Notes the index had that the walk no longer finds: moved, if one new file has the same text —
    // unless the index was written on another branch (5.9): a note only one branch has is no move.
    if (this.useCache && this.writesState && (cached?.branch === undefined || cached.branch === this.branchNow())) {
      const vanished = Object.values(old).filter((e) => !this.notes.has(e.rel));
      if (vanished.length)
        this.detectMoves(
          vanished,
          walk.files.filter((f) => !old[f.rel]),
        );
    }
    // And git's renames, when HEAD moved on the branch since this copy last looked (20.21).
    if (this.useCache && this.writesState) this.catchUpWithGit();
    // An editor's unsaved text stays over the new walk's entries (11.8); a note gone takes its own.
    const texts = [...this.overlays].map(([rel, o]) => [rel, o.text] as const);
    this.overlays.clear();
    for (const [rel, text] of texts) this.overlay(rel, text);
    this.backlinkCache = null;
    this.tagCache = null;
    this.generation++;
    this.resolver.forgetNames();
    // An index of this version written once at least: one with none, every note of it unreadable, has an empty one.
    this.cacheDirty = Object.keys(old).length !== reused || (this.useCache && !this.indexRead);
    const toParse = this.unparsed.size;
    if (parse === "all") this.ensureAll();
    else if (this.cacheDirty && !toParse) this.writeCache();
    const gone = Object.keys(old).filter((rel) => !this.notes.has(rel)).length;
    this.stats = {
      notes: this.notes.size,
      parsed: parse === "all" ? toParse : 0,
      cached: reused,
      gone,
      ms: performance.now() - t0,
    };
    for (const fn of this.buildListeners) {
      try {
        fn();
      } catch {}
    }
    return this;
  }

  /** How many times it's been built: a walk made elsewhere since the last (T12) is older than what it holds. None: the
   *  TUI's is first built as the folders asked for are (`askFolders`). */
  builds = 0;

  private readonly buildListeners = new Set<() => void>();

  /** After each build: what the graph knows may be new (the TUI's buffers opened before it knew their files). */
  onBuild(fn: () => void): () => void {
    this.buildListeners.add(fn);
    return () => this.buildListeners.delete(fn);
  }

  private readonly unparsed = new Map<string, NoteFile>();
  private useCache = false;
  private cacheDirty = false;

  /** Whether it reads and refreshes the persisted index (`build`'s `useCache`): a graph made again from it does too. */
  get usesCache(): boolean {
    return this.useCache;
  }

  private get cachePath(): string {
    return join(cacheDir(this.loc), "index.json");
  }

  /** A file as it's shown (21.9). */
  shownPath(abs: string): string {
    // By path (21.9): from this root (or the folder opened), else from home (`~/…`), else absolute.
    const rel = relative(this.root, abs);
    if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return rel.split(sep).join("/");
    return tildePath(abs);
  }

  /** When the index on disk was last written (20.10): how fresh it is; null when there's none. */
  /** The stamp of the index it was built from (`build`): "" for none. */
  private indexStamp = "";

  /** Its index on disk isn't the one it was built from: written since, by anyone. */
  indexChanged(): boolean {
    return this.useCache && stampOf(this.cachePath) !== this.indexStamp;
  }

  indexedAt(): Date | null {
    try {
      return statSync(this.cachePath).mtime;
    } catch {
      return null;
    }
  }

  /** Notes still waiting to be parsed. */
  get pendingCount(): number {
    return this.unparsed.size;
  }

  /** The notes still waiting to be parsed, by their paths: the explorer marks their folders as being indexed (VV-D9). */
  pendingPaths(): IterableIterator<string> {
    return this.unparsed.keys();
  }

  /**
   * Files the walk leaves out — under a hidden folder, or git-ignored — reached since (20.8): a link
   * points at one, or it was opened or named. Indexed as the walked ones are, and kept with the index.
   */
  readonly reached = new Set<string>();

  /**
   * Whether a path of the vault can be one of its files or folders: not excluded by `walk.exclude`
   * nor inside a root of its own (a hidden or git-ignored one can, when reached: 20.8). `isDir`: a
   * folder, which is also refused when it is a root of its own.
   */
  admits(rel: string, isDir = false): boolean {
    if (!this.filter.reachable(rel)) return false;
    const why = isDir ? this.filter.exclusion(rel, true) : null;
    return why === null || why === "hidden" || why === ".gitignore";
  }

  /**
   * Why a new file at `rel` — a folder, with `isDir` — would never be indexed once written, said (VV-D8: a busy folder
   * is listed, never indexed), or null: a folder on its way the walk's filter leaves out whatever reaches it, a busy one
   * (D237) or one always skipped. Asked of the filter, so it follows it: a root of its own on the way answers for
   * itself, and Elsewhere indexes nothing to begin with. The folder the write puts it in holds a note after it when
   * `notes` says so — by default when a file is named as a note; a moved or copied folder's, when it has one directly
   * in it — so a busy name there, not ignored, is a folder like any. A new note, a move or a copy refused here would be
   * found by nothing.
   */
  neverIndexed(rel: string, isDir = false, notes?: boolean): string | null {
    if (isListed(this.loc)) return null;
    // By the names on disk, where the filesystem folds case: `Build/` typed is the `build/` the walk lists.
    const parts = onDisk(this.root, rel).split("/");
    const last = isDir ? parts.length : parts.length - 1;
    const holds = notes ?? (!isDir && this.filter.isNoteName(parts.at(-1)!));
    for (let i = 1; i <= last; i++) {
      const dir = parts.slice(0, i).join("/");
      const why = this.filter.exclusion(dir, true);
      // A root of its own, named as a busy folder too (`build/` holding a `.slipbox/`): its walk starts there.
      if (why === "nested vault" || (why === "busy folder" && isVaultRoot(join(this.root, dir)))) return null;
      if (why === "busy folder") {
        // Busy with a note in it too: ignored. Without, only for want of one, which this write gives it.
        const ignored = this.filter.busy(dir, true);
        if (i === last && holds && !ignored) continue;
        return `${dir}/ is a busy folder (${ignored ? "git ignores it" : "no note at its top"}), which the vault doesn't index`;
      }
      if (why === "always skipped") return `${dir}/ is a folder the vault never indexes`;
    }
    return null;
  }

  /**
   * Why a file written at `rel` — a folder, with `isDir` — is never indexed though the write is allowed (D246,
   * `WalkFilter.notIndexed`): `walk.exclude` names it, or a folder on its way. Not refused, as `neverIndexed`'s are,
   * but said after the write (`notIndexedSaid`). Null in Elsewhere, which indexes nothing.
   */
  notIndexed(rel: string, isDir = false): "walk.exclude" | null {
    return isListed(this.loc) ? null : this.filter.notIndexed(rel, isDir);
  }

  /** `rel` as a file to index when reached: there, a file inside the vault, and only left out softly. */
  private reachable(rel: string): NoteFile | null {
    if (isListed(this.loc) || !this.filter.reachable(rel)) return null;
    const abs = join(this.root, rel);
    // Through a link only when you follow it and its target answered (VV-D6): what a link not followed leads to is
    // never the vault's, and a disk that hasn't answered isn't read here.
    if (blockingLink(this.loc, abs, { answering: true })) return null;
    try {
      const st = statSync(abs);
      if (!st.isFile() || st.size > this.filter.maxFileSize) return null;
      return { rel, abs, size: st.size, mtimeMs: st.mtimeMs };
    } catch {
      return null;
    }
  }

  /**
   * Index `rel`, a file the walk leaves out, now that it's reached (20.8): a note joins the notes (its
   * links, its backlinks), any other file the files. True when it's the vault's now — or was already.
   * `keep`: reached by being opened or named, it's parsed and the index written at once, so it stays.
   */
  reachFile(rel: string, opts: { keep?: boolean } = {}): boolean {
    if (this.known(rel)) return true;
    // Where the filesystem folds case (macOS's), `Note.md` opens `note.md`: the file is reached by the name its folder
    // lists, never a second time by a link's spelling.
    const real = onDisk(this.root, rel);
    if (real !== rel) return this.reachFile(real, opts);
    const f = this.reachable(rel);
    if (!f) return false;
    this.reached.add(rel);
    this.cacheDirty = true;
    if (!this.filter.isNoteName(basename(rel))) {
      this.addAsset(rel);
      if (opts.keep) this.writeCache();
      return true;
    }
    this.notes.set(rel, stub(f));
    this.unparsed.set(rel, f);
    this.index.add(rel);
    this.backlinkCache = null;
    this.tagCache = null;
    this.generation++;
    this.resolver.forgetNames();
    this.emit({ kind: "changed", path: rel });
    if (opts.keep) {
      this.entry(rel);
      this.writeCache();
    }
    return true;
  }

  /** The files a note links to that the walk leaves out: reached by the link (20.8). */
  private reachLinked(e: NoteEntry): void {
    if (isListed(this.loc)) return;
    for (const l of e.links) {
      if (l.kind !== "markdown" && l.kind !== "image") continue;
      const path = l.target.split("#")[0]!;
      if (!path || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("~/")) continue;
      let decoded = path;
      try {
        decoded = decodeURIComponent(path);
      } catch {}
      // `/…` is the root's, then the filesystem's (21.2); in a plain folder, which has none, the
      // filesystem's alone.
      let rel = !decoded.startsWith("/")
        ? posix.normalize(posix.join(posix.dirname(e.rel), decoded))
        : this.loc.mode === "folder"
          ? relative(this.root, decoded)
          : posix.normalize(decoded.slice(1));
      if (
        decoded.startsWith("/") &&
        this.loc.mode !== "folder" &&
        !(rel && !climbsOut(rel) && (this.known(rel) || this.reachable(rel)))
      )
        rel = relative(this.root, decoded);
      if (rel === "" || rel === "." || climbsOut(rel) || isAbsolute(rel) || this.known(rel)) continue;
      this.reachFile(rel);
    }
  }

  /** Files read on explicit request that the walk excludes, and can't reach (20.8). Not part of the vault's index. */
  private readonly adopted = new Map<string, NoteEntry>();

  /** Read a file the walk excluded because the user named it; it never joins the index. */
  adopt(rel: string): NoteEntry | undefined {
    if (this.notes.has(rel)) return this.entry(rel);
    let e = this.adopted.get(rel);
    if (!e) {
      try {
        const st = statSync(join(this.root, rel));
        e = extractNote({ rel, abs: join(this.root, rel), size: st.size, mtimeMs: st.mtimeMs });
        this.adopted.set(rel, e);
      } catch {
        return undefined;
      }
    }
    return e;
  }

  /** The notes not parsed yet of at least `min` bytes: a background pass parses them on other threads first. */
  unparsedOver(min: number): NoteFile[] {
    return [...this.unparsed.values()].filter((f) => f.size >= min);
  }

  /** The parsed entry for a note, parsing it now if needed (its chunks from `chunks` when parsed elsewhere). */
  entry(rel: string, chunks?: ChunkCache): NoteEntry | undefined {
    const adopted = this.adopted.get(rel);
    if (adopted) return adopted;
    const f = this.unparsed.get(rel);
    if (f) {
      const e = extractNote(f, sharedParseCache(), chunks);
      if (isUnreadable(e)) this.errors.push(`${rel}: ${e.flags.find((x) => x.startsWith("unreadable"))}`);
      this.notes.set(rel, e);
      this.unparsed.delete(rel);
      this.reachLinked(e);
      // One it can't read is never written to the index: its index the same, not written again for it at each open.
      if (!isUnreadable(e)) this.cacheDirty = true;
      this.backlinkCache = null;
      this.tagCache = null;
      this.generation++;
      this.resolver.forgetNames();
    }
    return this.notes.get(rel);
  }

  /** Parse for up to `budgetMs`; returns how many remain. The TUI calls this between frames. */
  parseSome(budgetMs: number, skip?: ReadonlySet<string>): number {
    const end = performance.now() + budgetMs;
    for (const rel of this.unparsed.keys()) {
      // Being parsed elsewhere (a big note, on other threads): not here, not now.
      if (skip?.has(rel)) continue;
      this.entry(rel);
      if (performance.now() >= end) break;
    }
    if (!this.unparsed.size && this.cacheDirty) this.writeCache();
    return this.unparsed.size;
  }

  ensureAll(): void {
    // Until none is left: a note parsed can reach more (20.8).
    while (this.unparsed.size) for (const rel of [...this.unparsed.keys()]) this.entry(rel);
    if (this.cacheDirty) this.writeCache();
  }

  /** When this graph last wrote its index (`writeCache`); null: it hasn't — nothing to write, or the write failed. */
  writtenAt: number | null = null;

  /**
   * It writes its index (`writeCache`): false for another vault's graph the TUI reaches (#10), whose index its
   * backlinks' thread writes — written here, a big one would hold the keys while it's turned to text.
   */
  writesIndex = true;

  /**
   * It writes its vault's state besides its index: the moves it finds (its redirects), the commit it caught up with
   * (`catchUpWithGit`). False for another vault's graph the TUI reaches, and for one a backlinks' thread reads for a
   * link alone (#10): that vault's own request writes its state, on the thread.
   */
  writesState = true;

  /**
   * Home's: the walk it makes kept for the next (`walk.json`, VV-D2) — by a graph on the main thread. One built on a
   * thread of a peek's backlinks or an export's keeps nothing: the main thread's may be newer. (The background index
   * keeps its own, on the walk's thread, and the TUI in home the one its walk's thread hands back, T12.)
   */
  keepsWalk = isMainThread;

  /** Its index was read, of this version: false when there was none, or one another version wrote (unread). */
  indexRead = false;

  /**
   * Its index is behind its walk: notes to parse, or entries gone or changed that it hasn't written — one that doesn't
   * write its own (`writesIndex`) has it caught up elsewhere (#10).
   */
  get indexBehind(): boolean {
    return this.useCache && (this.cacheDirty || this.unparsed.size > 0);
  }

  private writeCache(): void {
    if (!this.useCache || !this.writesIndex) return;
    this.cacheDirty = false;
    const entries: Record<string, NoteEntry> = {};
    // A read failure is not a fact about the note: never cache it (chmod does not touch mtime).
    for (const [rel, e] of this.notes)
      if (!this.unparsed.has(rel) && !isUnreadable(e)) entries[rel] = this.overlays.get(rel)?.disk ?? e;
    try {
      ensureCacheHome();
      ensureDir(cacheDir(this.loc));
      // A temporary file of it a write let go of left behind (a thread stopped mid-write): gone once it's old.
      sweepTemps(cacheDir(this.loc), "index.json");
      writeJson(this.cachePath, {
        version: INDEX_VERSION,
        entries,
        branch: this.branchNow(),
        reached: [...this.reached],
      } satisfies IndexFile);
      this.writtenAt = Date.now();
    } catch (err) {
      this.errors.push(`cache: ${(err as Error).message}`);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Moves (17.12)

  private redirectStore: Redirects | null | undefined;

  /**
   * Another root's index changed since this one's backlinks were worked out (its backlinks' thread wrote it, #10):
   * the links of other roots into this one read again when next asked, and what's worked out from them (`generation`:
   * a note's info, its count of links in).
   */
  othersChanged(): void {
    this.reach?.othersChanged?.();
    this.backlinkCache = null;
    this.generation++;
  }

  /** The redirects read from disk again when next asked: another thread may have written them since (#10). */
  forgetRedirects(): void {
    this.redirectStore = undefined;
  }

  /** The vault's redirects, from its state; none for `$HOME` or `/` opened as a plain folder (never indexed). */
  get redirects(): Redirects | null {
    if (this.redirectStore === undefined)
      this.redirectStore = isListed(this.loc) ? null : new Redirects(join(stateDir(this.loc), "redirects.json"));
    return this.redirectStore;
  }

  /**
   * A note is moved when its text is gone from one path and turns up at exactly one new path, and
   * no other vanished note had the same text (an empty template made twice is no move).
   */
  private detectMoves(vanished: NoteEntry[], fresh: NoteFile[]): void {
    const hashed = vanished.filter((e) => e.hash && e.size > 0);
    if (!hashed.length || !fresh.length) return;
    const sizes = new Set(hashed.map((e) => e.size));
    const freshHash = new Map<string, string[]>();
    for (const f of fresh) {
      if (!sizes.has(f.size)) continue;
      let h: string;
      try {
        h = contentHash(readText(f.abs).text);
      } catch {
        continue;
      }
      freshHash.set(h, [...(freshHash.get(h) ?? []), f.rel]);
    }
    const moves: [string, string][] = [];
    for (const e of hashed) {
      const to = freshHash.get(e.hash);
      if (to?.length === 1 && hashed.filter((x) => x.hash === e.hash).length === 1) moves.push([e.rel, to[0]!]);
    }
    if (moves.length) this.redirects?.add(moves);
  }

  /**
   * After a merge or a pull (20.21): a branch moved since this copy last saw it, so git's renames
   * between the two commits — paired by similarity — are evidence of moves, recorded as redirects by
   * that change: a broken link to a renamed file then says where it went, and the relink fixes it.
   * The last commit seen is kept per branch, per copy (its state): a branch switch compares a branch
   * with itself, never with another — a file only one branch has comes and goes, and nothing moved.
   * Returns the moves recorded, vault paths old → new.
   */
  catchUpWithGit(): [string, string][] {
    // A vault's git; home's only when `~` is itself a repository (VV-D2).
    if (this.loc.mode === "folder") return [];
    const c = checkoutAt(this.loc);
    const branch = c ? headOf(c).branch : null;
    const commit = c ? headCommit(c) : null;
    if (!c || !branch || !commit) return [];
    const file = join(stateDir(this.loc), "heads.json");
    const seen = readJson<{ version?: number; branches?: Record<string, string> } | null>(file, null)?.branches ?? {};
    const was = seen[branch];
    if (was === commit) return [];
    const moves: [string, string][] = [];
    if (was) {
      for (const f of changedBetween(c, was, commit) ?? []) {
        const from = f.from ? inVault(c, this.root, f.from) : null;
        const to = inVault(c, this.root, f.path);
        if (f.state === "renamed" && from && to) moves.push([from, to]);
      }
      if (moves.length) {
        this.redirects?.add(moves, new Date(), `${was.slice(0, 7)}..${commit.slice(0, 7)}`);
        this.problemCache = null;
      }
    }
    // The newest last: a long-lived copy's branches, as many as it has had lately.
    delete seen[branch];
    const kept = Object.entries(seen).slice(-199);
    try {
      ensureDir(stateDir(this.loc));
      sweepTemps(stateDir(this.loc), "heads.json");
      writeJson(file, { version: 1, branches: Object.fromEntries([...kept, [branch, commit]]) });
    } catch {}
    return moves;
  }

  /** Notes that went (removed) and came (added) lately, by hash: a watcher sees a move as both. */
  private readonly went = new Map<string, { rel: string; at: number }[]>();
  private readonly came = new Map<string, { rel: string; at: number }[]>();

  /** While a branch switch lands (5.9): files only one branch has come and go, but nothing moved. */
  private movesPaused = 0;

  /** Run `fn` with move detection off: a branch switch's mass of files coming and going. */
  pauseMoves<T>(fn: () => T): T {
    this.movesPaused++;
    try {
      return fn();
    } finally {
      this.movesPaused--;
    }
  }

  /** The branch the vault's checkout has (null: detached, or no git). */
  branchNow(): string | null {
    const c = checkoutAt(this.loc);
    return c ? headOf(c).branch : null;
  }

  /**
   * A removal and an arrival of the same text within a minute, in either order, are a move — as
   * when the index is built (`detectMoves`), only when it is the one such pair: two notes with that
   * text gone (or come) and one come (or gone) are no move, whichever went where. A note back where
   * it was is no move either: its going and coming cancel.
   */
  private pairMove(hash: string, rel: string, side: "went" | "came"): void {
    if (!hash || isListed(this.loc) || this.movesPaused) return;
    const now = Date.now();
    for (const m of [this.went, this.came])
      for (const [h, vs] of m) {
        const kept = vs.filter((v) => now - v.at <= 60_000);
        if (kept.length) m.set(h, kept);
        else m.delete(h);
      }
    const mine = side === "went" ? this.went : this.came;
    const other = side === "went" ? this.came : this.went;
    const theirs = other.get(hash) ?? [];
    const ours = mine.get(hash) ?? [];
    const others = theirs.filter((v) => v.rel !== rel);
    if (others.length < theirs.length) {
      if (others.length) other.set(hash, others);
      else other.delete(hash);
      return;
    }
    if (others.length === 1 && !ours.length) {
      other.delete(hash);
      const move: [string, string] = side === "went" ? [rel, others[0]!.rel] : [others[0]!.rel, rel];
      this.redirects?.add([move]);
      this.moved([move]);
      return;
    }
    mine.set(hash, [...ours.filter((v) => v.rel !== rel), { rel, at: now }]);
  }

  private readonly listeners = new Set<(c: VaultChange) => void>();

  /** Hear of every change to the vault's files (6.7); the returned function stops it. */
  onChange(fn: (c: VaultChange) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(c: VaultChange): void {
    for (const fn of this.listeners) {
      try {
        fn(c);
      } catch {}
    }
  }

  /** Files moved (by a rename here, or seen by their content): said to the listeners. */
  moved(pairs: [string, string][]): void {
    for (const [from, to] of pairs) this.emit({ kind: "moved", from, to });
  }

  /** Incremental single-file update (1.8). Returns false when the file is not part of the vault. */
  updateFile(rel: string, file: NoteFile): boolean {
    const isNew = !this.notes.has(rel);
    const watch = isNew ? this.namesakeLinks(rel) : null;
    this.unparsed.delete(rel);
    this.cacheDirty = true;
    const entry = extractNote(file);
    // An editor's unsaved text still stands for the note: the file's entry is kept behind it.
    const over = this.overlays.get(rel);
    if (over) over.disk = entry;
    else this.notes.set(rel, entry);
    if (isNew && entry.size > 0) this.pairMove(entry.hash, rel, "came");
    if (isNew) this.index.add(rel);
    this.backlinkCache = null;
    this.tagCache = null;
    this.generation++;
    this.resolver.forgetNames();
    this.emit({ kind: "changed", path: rel });
    if (watch) this.reportRetargets(watch);
    return true;
  }

  private readonly retargetListeners = new Set<(r: Retarget[]) => void>();

  /** Told when a note coming or going sends links by name elsewhere (not when they break or heal). */
  onRetarget(fn: (r: Retarget[]) => void): () => void {
    this.retargetListeners.add(fn);
    return () => this.retargetListeners.delete(fn);
  }

  /**
   * Before a note comes or goes: the links by name it could send elsewhere — only when another note or
   * an alias has its name, so a unique name costs nothing — each where it reaches now. Null when none can.
   */
  private namesakeLinks(rel: string): { from: string; link: LinkRef; was: string }[] | null {
    if (!this.retargetListeners.size || !NOTE_EXT_RE.test(rel)) return null;
    const name = posix.basename(rel).replace(NOTE_EXT_RE, "");
    const key = normKey(name);
    const named = this.index.resolveWiki(name, null).candidates.filter((c) => c !== rel).length;
    if (!named && !this.resolver.otherNames().aliases.has(key)) return null;
    // One process, one answer (the CLI's): a link in a note not parsed yet is watched too.
    if (this.thorough && this.unparsed.size) this.ensureAll();
    const out: { from: string; link: LinkRef; was: string }[] = [];
    for (const [from, e] of this.notes) {
      for (const l of e.links) {
        if (
          (l.kind !== "wiki" && l.kind !== "embed") ||
          normKey(posix.basename(l.target).replace(NOTE_EXT_RE, "")) !== key
        )
          continue;
        const r = this.resolveLink(l, from);
        if ((r.resolvedKind === "note" || r.resolvedKind === "file") && r.path)
          out.push({ from, link: l, was: r.path });
      }
    }
    return out.length ? out : null;
  }

  /** After: the watched links that reach somewhere else now, told to whoever listens. */
  private reportRetargets(watch: { from: string; link: LinkRef; was: string }[]): void {
    const moved: Retarget[] = [];
    for (const w of watch) {
      if (!this.notes.has(w.from)) continue;
      const r = this.resolveLink(w.link, w.from);
      if ((r.resolvedKind === "note" || r.resolvedKind === "file") && r.path && r.path !== w.was)
        moved.push({ from: w.from, line: w.link.line, target: w.link.target, was: w.was, now: r.path });
    }
    if (!moved.length) return;
    for (const fn of this.retargetListeners) {
      try {
        fn(moved);
      } catch {}
    }
  }

  /** Every non-note file the walk saw (data, text and binary alike), vault-relative. */
  filePaths(): string[] {
    return [...this.assets.values()].flat();
  }

  /** Index an attachment by file name; true if the index changed. */
  addAsset(rel: string): boolean {
    const key = rel
      .slice(rel.lastIndexOf("/") + 1)
      .normalize("NFC")
      .toLowerCase();
    const list = this.assets.get(key);
    if (!list) this.assets.set(key, [rel]);
    else if (!list.includes(rel)) list.push(rel);
    else return false;
    this.backlinkCache = null;
    this.tagCache = null;
    this.generation++;
    this.resolver.forgetNames();
    this.dataLinkCache.clear(); // a path in a data file or a comment may resolve now
    this.emit({ kind: "changed", path: rel });
    return true;
  }

  /** Forget an attachment; true if the index changed. */
  removeAsset(rel: string): boolean {
    const key = rel
      .slice(rel.lastIndexOf("/") + 1)
      .normalize("NFC")
      .toLowerCase();
    const before = this.assets.get(key);
    if (!before?.includes(rel)) return false;
    const list = before.filter((p) => p !== rel);
    if (list.length) this.assets.set(key, list);
    else this.assets.delete(key);
    this.dataLinkCache.clear(); // and paths to it no longer resolve
    this.backlinkCache = null;
    this.tagCache = null;
    this.generation++;
    this.resolver.forgetNames();
    this.emit({ kind: "removed", path: rel });
    return true;
  }

  removeFile(rel: string): void {
    // Its file is gone: never parsed now, when the namesakes' look reads every note (an undone move's
    // old path warned "unreadable: ENOENT").
    this.unparsed.delete(rel);
    const watch = this.notes.has(rel) ? this.namesakeLinks(rel) : null;
    this.reached.delete(rel);
    // A move is known by the file's text, not by what an editor had of it.
    const gone = this.overlays.get(rel)?.disk ?? this.notes.get(rel);
    this.overlays.delete(rel);
    if (!this.notes.delete(rel)) return;
    if (gone && gone.size > 0) this.pairMove(gone.hash, rel, "went");
    this.cacheDirty = true;
    this.index.remove(rel);
    this.backlinkCache = null;
    this.tagCache = null;
    this.generation++;
    this.resolver.forgetNames();
    this.emit({ kind: "removed", path: rel });
    if (watch) this.reportRetargets(watch);
  }

  /** Notes an editor has open (11.8): the text it has, and the file's own entry behind it. */
  private readonly overlays = new Map<string, { disk: NoteEntry; text: string }>();

  /**
   * A note's text as an editor has it, saved or not (11.8): its links, headings, tags and names count
   * instead of the file's until `overlay(rel, null)` lets it go. The persisted index keeps the file's,
   * and no listener hears of it — the file didn't change. A note the graph doesn't know is left alone.
   */
  overlay(rel: string, text: string | null): void {
    const had = this.overlays.get(rel);
    if (text === null) {
      if (!had) return;
      this.overlays.delete(rel);
      this.notes.set(rel, had.disk);
    } else {
      const disk = had?.disk ?? (this.notes.has(rel) ? this.entry(rel) : undefined);
      if (!disk) return;
      this.overlays.set(rel, { disk, text });
      this.notes.set(
        rel,
        extractFromSource({ rel, abs: join(this.root, rel), size: disk.size, mtimeMs: disk.mtimeMs }, text, disk.flags),
      );
    }
    this.backlinkCache = null;
    this.tagCache = null;
    this.generation++;
    this.resolver.forgetNames();
  }

  /** Whether an editor's text stands for the note (11.8). */
  overlaid(rel: string): boolean {
    return this.overlays.has(rel);
  }

  /** A note's text: an editor's when it has the note open (11.8), else the file's; null when it can't be read. */
  textOf(path: string): string | null {
    const rel = path.startsWith(`${this.root}/`) ? path.slice(this.root.length + 1) : path;
    const over = this.overlays.get(rel);
    if (over) return over.text;
    try {
      return readText(isAbsolute(rel) ? rel : join(this.root, rel)).text;
    } catch {
      return null;
    }
  }

  abs(rel: string): string {
    return join(this.root, rel);
  }

  /**
   * The note a command's argument names by its name, nearest `fromRel` when several share it — how a
   * command names a note (`slipbox read plan --from notes/a.md`); never how a link resolves (20.22).
   */
  nearestNamed(name: string, fromRel: string): Resolution {
    return this.index.resolveWiki(name, fromRel);
  }

  /** Find a note by user input: a vault-relative path, a path relative to cwd, or its name. */
  findNote(input: string, cwd = process.cwd()): Resolution {
    const cleaned = input.replace(/^\[\[|\]\]$/g, "");
    const full = join(cwd, cleaned);
    const asAbs = full.startsWith(`${this.root}/`) ? full.slice(this.root.length + 1) : null;
    for (const cand of [cleaned, asAbs]) {
      if (cand && this.notes.has(cand)) return { status: "resolved", path: cand, candidates: [cand] };
    }
    if (input.startsWith("/") && input.startsWith(this.root + "/")) {
      const rel = input.slice(this.root.length + 1);
      if (this.notes.has(rel)) return { status: "resolved", path: rel, candidates: [rel] };
    }
    return this.index.resolveWiki(cleaned, null);
  }

  /**
   * Resolve a link found in `fromRel`: its path (20.2, 21.2), into another root when it climbs out of
   * this one (17.9); a wikilink within its root (21.3).
   */
  resolveLink(link: Pick<LinkRef, "kind" | "target">, fromRel: string): Target {
    if (link.kind === "wiki" || link.kind === "embed") return this.resolver.resolveWiki(link.target, fromRel);
    return this.resolver.resolvePath(link, fromRel);
  }

  /** A file named the old way, where a folder this machine knows has that name (21.11): not a link, said. */
  oldForm(target: string): Target | null {
    return this.resolver.oldForm(target);
  }

  /** How a wikilink resolved before links were paths: the converter's legacy reader (20.1, 20.22). */
  resolveLegacyWiki(link: Pick<LinkRef, "kind" | "target">, fromRel: string): Target {
    return this.resolver.resolveLegacyWiki(link, fromRel);
  }

  /** The vaults nested in this one: folders the walk leaves to them. */
  nestedRoots(): string[] {
    return this.skipped.filter((s) => s.reason === "nested vault").map((s) => s.rel);
  }

  /** Whether `[[name:…]]` names this vault: its name, an alias, or a previous name. */
  answersTo(name: string): boolean {
    const n = name.toLowerCase();
    return [this.loc.name, ...this.loc.aliases, ...this.loc.previous_names].some((x) => x?.toLowerCase() === n);
  }

  /** Where a path went (17.12), when that's a note or file of the vault now. */
  movedTo(rel: string): string | null {
    return this.resolver.movedTo(rel);
  }

  /** Where a broken path link's file went, a move of it seen (17.12): evidence for a fix, never a resolution. */
  movedTarget(link: Pick<LinkRef, "kind" | "target">, fromRel: string): string | null {
    return this.resolver.movedTarget(link, fromRel);
  }

  /** The note a broken path link names, not written yet (vault-relative); null when it isn't one. */
  missingNote(link: Pick<LinkRef, "kind" | "target">, fromRel: string): string | null {
    return this.resolver.missingNote(link, fromRel);
  }

  linksOf(rel: string): ResolvedLink[] {
    const note = this.entry(rel);
    const links = note ? note.links : this.fileLinksOf(rel);
    return links.map((l) => ({ ...l, ...this.resolveLink(l, rel) }));
  }

  /**
   * Every tag and the notes carrying it (1.6), by its key (lower-cased: `#Project` is `#project`),
   * shown as first written. A nested tag's notes count for its parents too: `#a/b` is under `#a`.
   * Every note is read first, so the list is whole.
   */
  tagIndex(): Map<string, { tag: string; notes: string[] }> {
    if (this.unparsed.size) this.ensureAll();
    if (this.tagCache) return this.tagCache;
    const index = new Map<string, { tag: string; notes: string[] }>();
    for (const [rel, e] of [...this.notes].sort(([a], [b]) => a.localeCompare(b))) {
      const mine = new Set<string>();
      for (const tag of e.tags) {
        const parts = tag.split("/");
        for (let i = 1; i <= parts.length; i++) {
          const name = parts.slice(0, i).join("/");
          const key = tagKey(name);
          if (mine.has(key)) continue;
          mine.add(key);
          const t = index.get(key) ?? { tag: name, notes: [] };
          t.notes.push(rel);
          index.set(key, t);
        }
      }
    }
    this.tagCache = new Map([...index].sort(([a], [b]) => a.localeCompare(b)));
    return this.tagCache;
  }

  /**
   * What's wrong in the vault: the unresolved-link set (1.7) and the ambiguous links beside it —
   * every note's links that reach nothing, or more than one note, as each resolves now, in path and
   * line order — and the orphans (9.5), the notes no other note links to (another vault's links
   * count). Every note is read first. Made again when a note changes; `forgetProblems` makes it
   * again at once (another vault's notes changed: `[[vault:note]]` links may reach, or stop).
   */
  problems(): { broken: LinkProblem[]; ambiguous: LinkProblem[]; fragile: LinkProblem[]; orphans: string[] } {
    this.ensureAll();
    if (this.problemCache?.generation === this.generation) return this.problemCache;
    const broken: LinkProblem[] = [];
    const ambiguous: LinkProblem[] = [];
    const fragileLinks: LinkProblem[] = [];
    for (const rel of [...this.notes.keys()].sort()) {
      for (const l of this.linksOf(rel)) {
        // Won by where it's written (the nearest, the shortest): a note of the name nearer would take it.
        if ((l.resolvedKind === "note" || l.resolvedKind === "file") && fragile(l) && l.path && !isAbsolute(l.path)) {
          fragileLinks.push({
            from: rel,
            line: l.line,
            column: l.column,
            end: l.end,
            kind: l.kind,
            target: l.target,
            text: l.text,
            reason: describeLanding(l),
            candidates: l.candidates,
            fix: disambiguated(l, rel),
          });
          continue;
        }
        if (l.resolvedKind !== "unresolved" && l.resolvedKind !== "ambiguous") continue;
        // A broken path whose file was seen to move (17.12, git's renames 20.21): where it went, for the fix.
        const moved = l.resolvedKind === "unresolved" ? this.movedTarget(l, rel) : null;
        const p: LinkProblem = {
          from: rel,
          line: l.line,
          column: l.column,
          end: l.end,
          kind: l.kind,
          target: l.target,
          text: l.text,
          reason: l.reason ?? (moved ? `moved to ${moved} — relink fixes it` : null),
          candidates: l.candidates,
          moved,
        };
        (l.resolvedKind === "unresolved" ? broken : ambiguous).push(p);
      }
    }
    const orphans = [...this.notes.keys()].sort().filter((rel) => !this.backlinks(rel).some((b) => b.from !== rel));
    this.problemCache = { generation: this.generation, broken, ambiguous, fragile: fragileLinks, orphans };
    return this.problemCache;
  }

  /** How this root's notes write their links to its notes (21.4), for its convention: every note read. */
  linkForms(): FormCounts {
    this.ensureAll();
    if (this.formCache?.generation === this.generation) return this.formCache.counts;
    const links = [...this.notes.keys()].flatMap((rel) => this.linksOf(rel));
    this.formCache = { generation: this.generation, counts: countForms(links) };
    return this.formCache.counts;
  }

  forgetProblems(): void {
    this.problemCache = null;
  }

  /** The vault's tags, with how many notes carry each (a parent's count includes its children's). */
  tags(): { tag: string; count: number }[] {
    return [...this.tagIndex().values()].map((t) => ({ tag: t.tag, count: t.notes.length }));
  }

  /** The notes with a tag (`#` optional; its nested tags' too), or null when none has it. */
  tagged(name: string): { tag: string; notes: string[] } | null {
    const clean = tagName(name);
    return clean ? (this.tagIndex().get(tagKey(clean)) ?? null) : null;
  }

  backlinks(rel: string): Backlink[] {
    this.ensureAll();
    if (!this.backlinkCache) {
      const map = new Map<string, Backlink[]>();
      // Notes' links, data files' (16.15) and code comments' (16.10); to a note or to a file (a
      // config, a script, 16.3).
      const sources: [string, LinkRef[]][] = [
        ...[...this.notes].map(([from, note]) => [from, note.links] as [string, LinkRef[]]),
        ...this.linkingFiles().map((f) => [f, this.fileLinksOf(f)] as [string, LinkRef[]]),
      ];
      for (const [from, links] of sources) {
        for (const l of links) {
          // An image's link counts too: the notes that show a picture are its backlinks (and a
          // rename or move of it fixes them, 18.3).
          // A folder's links too, by its path (21.2): a move of the folder rewrites them.
          const r = this.resolveLink(l, from);
          if (
            (r.resolvedKind !== "note" && r.resolvedKind !== "file" && r.resolvedKind !== "folder") ||
            !r.path ||
            r.path === from ||
            isAbsolute(r.path)
          )
            continue;
          const list = map.get(r.path) ?? [];
          list.push({
            from,
            line: l.line,
            column: l.column,
            end: l.end,
            text: l.text,
            kind: l.kind,
            target: l.target,
            heading: l.heading,
            block: l.block,
            alias: l.alias,
          });
          map.set(r.path, list);
        }
      }
      // And other vaults' links into this one, as of their last indexing (17.11).
      for (const [rel, list] of this.reach?.inbound(this) ?? []) map.set(rel, [...(map.get(rel) ?? []), ...list]);
      this.backlinkCache = map;
    }
    return this.backlinkCache.get(rel) ?? [];
  }

  /** A note's entry by a path `resolveLink` gave: vault-relative, or absolute in another root. */
  entryAnywhere(path: string): NoteEntry | undefined {
    if (!isAbsolute(path)) return this.entry(path);
    if (path.startsWith(`${this.root}/`)) {
      const e = this.entry(path.slice(this.root.length + 1));
      if (e) return e;
      // A file of a root nested in this one is that root's (21.x): its own index has it.
      return findVaultRoot(path)?.startsWith(`${this.root}/`) ? this.reach?.entryAt(path) : undefined;
    }
    return this.reach?.entryAt(path);
  }

  /** The vault's files with links besides notes: data files (JSON, YAML, TOML, INI, CSV), and
   *  source code in a language with a grammar (links in its comments). */
  linkingFiles(): string[] {
    return this.filePaths().filter((p) => {
      const k = classify(p, this.config.walk.extensions);
      return k.group === "data" || (k.group === "text" && grammarFor(k.format, extensionOf(p)) !== null);
    });
  }

  /** The grammars the vault's code needs, loaded (the CLI, before it lists links or backlinks). */
  async loadGrammars(): Promise<void> {
    const gs = new Set<Grammar>();
    for (const p of this.filePaths()) {
      const k = classify(p, this.config.walk.extensions);
      const g = k.group === "text" ? grammarFor(k.format, extensionOf(p)) : null;
      if (g) gs.add(g);
    }
    await Promise.all([...gs].map((g) => grammar(g)));
    this.backlinkCache = null;
    this.tagCache = null;
    this.generation++;
    this.resolver.forgetNames();
  }

  /** A grammar finished loading: code files' links can be read now (the TUI hears of it). */
  grammarsChanged(): void {
    this.backlinkCache = null;
    this.tagCache = null;
    this.generation++;
    this.resolver.forgetNames();
  }

  /** Whether a vault-relative path is a note or a file of the vault (by the index: no disk). */
  known(rel: string): boolean {
    if (this.notes.has(rel)) return true;
    return (
      this.assets
        .get(
          rel
            .slice(rel.lastIndexOf("/") + 1)
            .normalize("NFC")
            .toLowerCase(),
        )
        ?.includes(rel) ?? false
    );
  }

  /**
   * A path in a code comment (16.10) as a vault-relative path: relative to the file, then to the
   * vault's root (where a repo's paths start); null if it names no file of the vault.
   */
  commentPath(target: string, fromRel: string): string | null {
    const cands = target.startsWith("/")
      ? [posix.normalize(target.slice(1))]
      : [posix.normalize(posix.join(posix.dirname(fromRel), target)), posix.normalize(target)];
    return cands.find((c) => !c.startsWith("..") && c !== fromRel && this.known(c)) ?? null;
  }

  /**
   * A data file's links (16.15): URLs, reference keys' values ($ref, include…) whether or not they
   * resolve, and path-like values that do. A code file's (16.10): URLs and paths that resolve, in
   * its comments; `path:42` links to that line (`#L42`). Read when asked and cached by the file's
   * stamp; files over 256 KB (lock files, dumps, generated code) aren't read for links. Code whose
   * grammar is still loading has none yet (and isn't cached).
   */
  fileLinksOf(rel: string): LinkRef[] {
    const kind = classify(rel, this.config.walk.extensions);
    const g = kind.group === "text" ? grammarFor(kind.format, extensionOf(rel)) : null;
    if (kind.group !== "data" && !g) return [];
    let st: { size: number; mtimeMs: number };
    try {
      st = statSync(join(this.root, rel));
    } catch {
      return [];
    }
    if (st.size > DATA_LINK_MAX) return [];
    const stamp = `${st.mtimeMs}:${st.size}`;
    const hit = this.dataLinkCache.get(rel);
    if (hit?.stamp === stamp) return hit.links;
    let links: LinkRef[] = [];
    if (g) {
      const code = this.codeLinks(rel, g, readText(join(this.root, rel)).text);
      if (!code) return [];
      this.dataLinkCache.set(rel, { stamp, links: code });
      return code;
    }
    try {
      const d = parseData(kind.format, readText(join(this.root, rel)).text);
      links = dataLinks(d.tree)
        .filter(
          (l) =>
            l.explicit ||
            ["note", "file"].includes(this.resolveLink({ kind: "markdown", target: l.target }, rel).resolvedKind),
        )
        .map((l) => ({
          kind: "markdown",
          target: l.target,
          heading: null,
          block: null,
          alias: null,
          text: l.key,
          line: l.line,
          column: 1,
          end: { line: l.line, column: 1 },
        }));
    } catch {}
    this.dataLinkCache.set(rel, { stamp, links });
    return links;
  }

  /** A code file's comment links; null while its grammar loads. Parsed only when the text has a
   *  URL or a path of the vault somewhere (most files have neither, and cost a scan). */
  private codeLinks(rel: string, g: Grammar, text: string): LinkRef[] | null {
    if (!linkTokens(text).some((t) => t.url || this.commentPath(t.target, rel))) return [];
    const loaded = grammarNow(g);
    if (!loaded) return null;
    const tree = parseSyntax(loaded, text);
    if (!tree) return [];
    const out: LinkRef[] = [];
    const lines = text.split("\n");
    for (const l of commentLinks(tree.comments())) {
      const path = l.url ? null : this.commentPath(l.target, rel);
      if (!l.url && !path) continue;
      const target = l.url ? l.target : `/${path}${l.at ? `#L${l.at}` : ""}`;
      out.push({
        kind: "markdown",
        target,
        heading: null,
        block: null,
        alias: null,
        text: lines[l.line - 1]!.slice(l.from, l.to),
        line: l.line,
        column: l.from + 1,
        end: { line: l.line, column: l.to + 1 },
      });
    }
    tree.delete();
    return out;
  }

  /** A data file changed or went: its links are read again, and backlinks recomputed. */
  fileChanged(rel: string): void {
    this.dataLinkCache.delete(rel);
    this.backlinkCache = null;
    this.tagCache = null;
    this.generation++;
    this.resolver.forgetNames();
    this.emit({ kind: "changed", path: rel });
  }
}

/**
 * What the message about a write adds for a file the vault never indexes (`Graph.notIndexed`, D246): ` (not indexed:
 * walk.exclude)`, after the path it names; else nothing. The TUI's status line and the command line's output alike.
 */
export function notIndexedSaid(why: string | null): string {
  return why ? ` (not indexed: ${why})` : "";
}

export function openGraph(loc: VaultLocation, config: Config, useCache = true, parse: "all" | "lazy" = "all"): Graph {
  return new Graph(loc, config).build(useCache, parse);
}

/** A file's stamp, its mtime and size in a word: "" for none. */
function stampOf(path: string): string {
  try {
    const st = statSync(path);
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return "";
  }
}

function isUnreadable(e: NoteEntry): boolean {
  return e.flags.some((f) => f.startsWith("unreadable"));
}

function stub(f: NoteFile): NoteEntry {
  return {
    rel: f.rel,
    title: basename(f.rel).replace(/\.(md|markdown)$/i, ""),
    headings: [],
    links: [],
    tags: [],
    aliases: [],
    previous: [],
    hash: "",
    mtimeMs: f.mtimeMs,
    size: f.size,
    flags: ["unparsed"],
  };
}
