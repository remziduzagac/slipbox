// Walk, lazy parsing and persisted-index coordination over Graph's single live index.
import type { Config } from "../../application/config/config.ts";
import { grammar, grammarFor, type Grammar } from "../../documents/syntax/syntax.ts";
import { classify, extensionOf } from "../../documents/model/filetypes.ts";
import { basename, isAbsolute, join, relative, sep } from "node:path";
import * as disk from "../../foundation/platform/disk.ts";
import { climbsOut, readJson } from "../../foundation/platform/fsutil.ts";
import { cacheDir, type Keyed } from "../../foundation/platform/paths.ts";
import type { ParseCache as ChunkCache } from "../../documents/markdown/parse.ts";
import { sharedParseCache } from "../../documents/markdown/parsecache.ts";
import { LinkIndex, onDisk } from "../links/links.ts";
import {
  HOME_LIMITS,
  listDirectory,
  walkVault,
  type NoteFile,
  type Skipped,
  type Stamp,
  type WalkFilter,
  type WalkResult,
} from "../walk/walk.ts";
import type { IndexRead, WalkAnswer } from "../walk/disk-jobs.ts";
import { homeWalk, inFolders, walksInto, type HomeWalk } from "../vaults/home.ts";
import { isListed, type VaultLocation } from "../vaults/vault.ts";
import { extractNote, extractRead, INDEX_VERSION } from "./graph-extract.ts";
import type { GraphStats, NoteEntry, VaultChange } from "./graph-types.ts";
import type { IndexFile } from "./index/schema.ts";
import { cacheEntries, isUnreadable, persistIndex, reuseEntries, stub } from "./index/storage.ts";
import type { EditorOverlay } from "./overlays/editor.ts";
import type { NoteTexts } from "./texts.ts";
import { neverIndexed, reachable, reachLinked } from "./reach/files.ts";

interface RefreshGraph {
  readonly loc: VaultLocation;
  readonly root: string;
  readonly config: Config;
  filePaths(): string[];
  readonly filter: WalkFilter;
  notes: Map<string, NoteEntry>;
  index: LinkIndex;
  dirs: string[];
  assets: Map<string, string[]>;
  skipped: Skipped[];
  errors: string[];
  stats: GraphStats;
  home: HomeWalkState;
  builds: number;
  walkedAt: number;
  dirStamps: ReadonlyMap<string, Stamp>;
  indexRead: boolean;
  writesState: boolean;
  writesIndex: boolean;
  keepsWalk: boolean;
  writtenAt: number | null;
  reached: Set<string>;
  addAsset(rel: string): boolean;
  build(useCache?: boolean, parse?: "all" | "lazy", given?: BuildGiven): unknown;
  branchNow(): string | null;
  catchUpWithGit(): [string, string][];
  overlay(rel: string, text: string | null): void;
  entry(rel: string): NoteEntry | undefined;
  ensureAll(): void;
  homePath(abs: string): string | null;
  known(rel: string): boolean;
  reachFile(rel: string, opts?: { keep?: boolean }): boolean;
}
type HomeWalkState = { walked: number | null; capped: HomeWalk["capped"]; asked?: HomeWalk["asked"] } | null;

/**
 * What a build is given, read already elsewhere (SD-T8): the TUI's walk and index, read on a disk thread or the walk's
 * (`WalkAnswer`; home's walk with its index, `HomeWalk` and `index`); or home's walk alone, made a slice at a time by
 * the background index. What isn't given is read here.
 */
export type BuildGiven = WalkAnswer | (HomeWalk & { index?: IndexRead });

/** Where a vault's index is kept (its cache folder's `index.json`): what a build reads, here or on a disk thread. */
export function indexFile(loc: Keyed): string {
  return join(cacheDir(loc), "index.json");
}

interface RefreshHooks {
  invalidate(): void;
  emit(change: VaultChange): void;
  built(): void;
  /**
   * A note is moved when its text is gone from one path and turns up at exactly one new path, and
   * no other vanished note had the same text (an empty template made twice is no move). `hashes`: the new notes'
   * hashes, read with the walk elsewhere (SD-T8); else their texts are read here.
   */
  detectMoves(vanished: NoteEntry[], fresh: NoteFile[], hashes?: Readonly<Record<string, string>>): void;
}

export class GraphRefresh {
  /** The folders of home asked for by name (VV-D2), home's paths for them: walked at each build its walk doesn't
   *  cover them. */
  private readonly asked: string[];
  private useCache = false;
  cacheDirty = false;

  constructor(
    private readonly graph: RefreshGraph,
    private readonly unparsed: Map<string, NoteFile>,
    private readonly overlays: Map<string, EditorOverlay>,
    private readonly hooks: RefreshHooks,
    asked: readonly string[],
    /** The notes' texts read elsewhere (SD-T6): the TUI's background parse's, given as they come. */
    private readonly texts: NoteTexts,
  ) {
    this.asked = [...asked];
  }

  /** The folders of home asked for by name (VV-D2): a graph built anew for home (a `[walk]` setting changed) carries
   *  them over, so what was asked for keeps its notes. */
  get askedFolders(): readonly string[] {
    return this.asked;
  }

  /**
   * Folders of home asked for by name (VV-D2: `slipbox ~/notes`, a file in it, the tabs a session brings back, each
   * one's), by their whole paths: their notes known now. Those home's walk doesn't cover yet — never made, or its cap
   * reached short of them — have the graph built again once for them all, as it is at each build after until the walk
   * covers them (`homeWalk`); a graph not built yet is built now, whatever is asked. True when it was built here: the
   * TUI's build, asked of a disk thread (SD-T8), follows itself when it's made.
   */
  askFolders(abs: readonly string[]): boolean {
    const g = this.graph;
    let walk = g.builds === 0;
    for (const a of abs) {
      const rel = g.homePath(a);
      if (rel === null || this.asked.includes(rel)) continue;
      this.asked.push(rel);
      // Listed by the build, as home's walk had it: a walk that stopped at its cap covers no folder whole, since one it
      // listed may hold folders it didn't; a folder walked whole, asked for before, covers those in it.
      const covered =
        g.dirs.includes(rel) &&
        ((g.home?.walked != null && !g.home.capped) || inFolders(rel, g.home?.asked?.folders ?? []));
      if (!covered && walksInto(g.root, g.filter, rel)) walk = true;
    }
    // Never built: with the index kept, as `openGraph` builds. Built here, or asked of a disk thread (the TUI's, SD-T8),
    // which follows the build itself once it's made: true only for one made here.
    const builds = g.builds;
    if (walk) g.build(g.builds > 0 ? this.useCache : true, "lazy");
    return g.builds !== builds;
  }

  /** Home's path for a folder of home, by its whole path; null in a vault, for home's top, or outside it. */
  homePath(abs: string): string | null {
    const g = this.graph;
    if (g.loc.mode !== "home") return null;
    const rel = relative(g.root, abs).split(sep).join("/");
    return !rel || climbsOut(rel) || isAbsolute(rel) ? null : rel;
  }

  /**
   * Whether the folder `rel` waits for home's first walk (VV-D2): home not walked yet, a folder its graph hasn't looked
   * into — any but its top and the folders asked for by name, which are whole. The watcher leaves it to the walk. False
   * once a walk is kept, one capped too, and in a vault.
   */
  waitsForHomeWalk(rel: string): boolean {
    const g = this.graph;
    return g.home?.walked === null && rel !== "" && !inFolders(rel, this.asked);
  }

  /**
   * A folder come into home's top before its walk (VV-D2: `WatchBatch.toWalk`), listed as its top's folders are, never
   * looked into — while home's walk would go into it, and is still to make: named in a batch held while git wrote, it
   * may have gone, or become a vault, or home been walked, since. Whether it's listed.
   */
  listForWalk(rel: string): boolean {
    const g = this.graph;
    if (g.home?.walked !== null || !walksInto(g.root, g.filter, rel)) return false;
    if (!g.dirs.includes(rel)) g.dirs.push(rel); // listed before: gone and come again, looked at all the same
    return true;
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
   * TUI. The TUI's walk and index are `given` too, read on a disk thread (SD-T8): nothing of them is read here.
   */
  build(useCache = true, parse: "all" | "lazy" = "all", given?: BuildGiven): void {
    const g = this.graph;
    const t0 = performance.now();
    g.builds++;
    // Its notes' stubs made anew: a text read elsewhere for one before is for none of them.
    this.texts.clear();
    // A walk read on a disk thread: when it began, not when it's taken — seconds later on a slow disk, a note written in
    // a folder it had listed would be older than that, and the watcher would never list the folder again (SD-T10).
    g.walkedAt = (given && "began" in given && given.began) || Date.now();
    const read = given && "walked" in given ? { walk: given.walk, home: given, index: given.index } : given;
    const home =
      g.loc.mode !== "home"
        ? null
        : read
          ? { walked: null, capped: null, ...read.home, walk: read.walk }
          : homeWalk(g.loc, g.filter, this.asked, HOME_LIMITS, g.keepsWalk);
    // What changed after home's walk began may be missing from it: the watcher looks at those folders again.
    if (home?.walked) g.walkedAt = home.walked;
    g.home = home ? { walked: home.walked, capped: home.capped, ...(home.asked ? { asked: home.asked } : {}) } : null;
    const walk: WalkResult =
      home?.walk ?? read?.walk ?? (isListed(g.loc) ? listDirectory(g.root, g.filter) : walkVault(g.root, g.filter));
    g.dirs = walk.dirs;
    g.dirStamps = walk.times ?? new Map();
    g.assets.clear();
    for (const a of walk.assets) g.addAsset(a);
    g.skipped = walk.skipped;
    g.errors = walk.errors;
    // `$HOME` or `/` opened as a plain folder is listed, never indexed: nothing to keep (20.22).
    this.useCache = useCache && !isListed(g.loc);
    // What it reads, by its stamp: written since by anyone (its thread, the background index, the CLI), it's newer.
    // Read with the walk when that's given, as text: parsed here as the file would be read (SD-D12).
    const index = this.useCache ? read?.index : undefined;
    this.indexStamp = this.useCache ? (index?.stamp ?? stampOf(this.cachePath)) : "";
    const cached = !this.useCache
      ? null
      : index
        ? parsedIndex(index.text)
        : readJson<IndexFile | null>(this.cachePath, null);
    g.indexRead = cached?.version === INDEX_VERSION;
    const old = g.indexRead ? cached!.entries : {};
    const reused = reuseEntries(
      g,
      this.unparsed,
      walk.files,
      this.useCache ? (cached?.reached ?? []) : [],
      old,
      (rel) => this.reachable(rel),
    );
    g.index = new LinkIndex(g.notes.keys());
    // Notes the index had that the walk no longer finds: moved, if one new file has the same text —
    // unless the index was written on another branch (5.9): a note only one branch has is no move.
    if (this.useCache && g.writesState && (cached?.branch === undefined || cached.branch === g.branchNow())) {
      const vanished = Object.values(old).filter((e) => !g.notes.has(e.rel));
      if (vanished.length)
        this.hooks.detectMoves(
          vanished,
          walk.files.filter((f) => !old[f.rel]),
          // Read with the walk, when its index was (none: no note to tell by), never here.
          index ? (index.hashes ?? {}) : undefined,
        );
    }
    // And git's renames, when HEAD moved on the branch since this copy last looked (20.21).
    if (this.useCache && g.writesState) g.catchUpWithGit();
    // An editor's unsaved text stays over the new walk's entries (11.8); a note gone takes its own.
    const texts = [...this.overlays].map(([rel, o]) => [rel, o.text] as const);
    this.overlays.clear();
    for (const [rel, text] of texts) g.overlay(rel, text);
    this.hooks.invalidate();
    // An index of this version written once at least: one with none, every note of it unreadable, has an empty one.
    this.cacheDirty = Object.keys(old).length !== reused || (this.useCache && !g.indexRead);
    const toParse = this.unparsed.size;
    if (parse === "all") g.ensureAll();
    else if (this.cacheDirty && !toParse) this.writeCache();
    const gone = Object.keys(old).filter((rel) => !g.notes.has(rel)).length;
    g.stats = {
      notes: g.notes.size,
      parsed: parse === "all" ? toParse : 0,
      cached: reused,
      gone,
      ms: performance.now() - t0,
    };
    this.hooks.built();
  }

  /** Whether it reads and refreshes the persisted index (`build`'s `useCache`): a graph made again from it does too. */
  get usesCache(): boolean {
    return this.useCache;
  }

  private get cachePath(): string {
    return indexFile(this.graph.loc);
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
      return disk.stat(this.cachePath).mtime;
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

  /** `rel` as a file to index when reached: there, a file inside the vault, and only left out softly. */
  private reachable(rel: string): NoteFile | null {
    return reachable(this.graph, rel);
  }

  /**
   * Index `rel`, a file the walk leaves out, now that it's reached (20.8): a note joins the notes (its
   * links, its backlinks), any other file the files. True when it's the vault's now — or was already.
   * `keep`: reached by being opened or named, it's parsed and the index written at once, so it stays.
   */
  reachFile(rel: string, opts: { keep?: boolean } = {}): boolean {
    const g = this.graph;
    if (g.known(rel)) return true;
    // Where the filesystem folds case (macOS's), `Note.md` opens `note.md`: the file is reached by the name its folder
    // lists, never a second time by a link's spelling.
    const real = onDisk(g.root, rel);
    if (real !== rel) return g.reachFile(real, opts);
    const f = this.reachable(rel);
    if (!f) return false;
    g.reached.add(rel);
    this.cacheDirty = true;
    if (!g.filter.isNoteName(basename(rel))) {
      g.addAsset(rel);
      if (opts.keep) this.writeCache();
      return true;
    }
    g.notes.set(rel, stub(f));
    this.unparsed.set(rel, f);
    g.index.add(rel);
    this.hooks.invalidate();
    this.hooks.emit({ kind: "changed", path: rel });
    if (opts.keep) {
      g.entry(rel);
      this.writeCache();
    }
    return true;
  }

  /** The files a note links to that the walk leaves out: reached by the link (20.8). */
  private reachLinked(e: NoteEntry): void {
    return reachLinked(this.graph, e, (rel) => this.reachable(rel));
  }

  /** Files read on explicit request that the walk excludes, and can't reach (20.8). Not part of the vault's index. */
  private readonly adopted = new Map<string, NoteEntry>();

  /** Read a file the walk excluded because the user named it; it never joins the index. */
  adopt(rel: string): NoteEntry | undefined {
    const g = this.graph;
    if (g.notes.has(rel)) return g.entry(rel);
    let e = this.adopted.get(rel);
    if (!e) {
      try {
        const st = disk.stat(join(g.root, rel));
        e = extractNote({ rel, abs: join(g.root, rel), size: st.size, mtimeMs: st.mtimeMs });
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

  /**
   * The parsed entry for a note, parsing it now if needed (its chunks from `chunks` when parsed elsewhere): from its text
   * given, read elsewhere (SD-T6), else read here — but, asked `partially` while texts are read elsewhere, its stub.
   */
  entry(rel: string, chunks?: ChunkCache): NoteEntry | undefined {
    const g = this.graph;
    const adopted = this.adopted.get(rel);
    if (adopted) return adopted;
    const f = this.unparsed.get(rel);
    if (f) {
      const given = this.texts.take(f);
      if (given === undefined && this.texts.partial) return g.notes.get(rel);
      const cache = sharedParseCache();
      const e = given === undefined ? extractNote(f, cache, chunks) : extractRead(f, given, cache, chunks);
      if (isUnreadable(e)) g.errors.push(`${rel}: ${e.flags.find((x) => x.startsWith("unreadable"))}`);
      g.notes.set(rel, e);
      this.unparsed.delete(rel);
      this.reachLinked(e);
      // One it can't read is never written to the index: its index the same, not written again for it at each open.
      if (!isUnreadable(e)) this.cacheDirty = true;
      this.hooks.invalidate();
    }
    return g.notes.get(rel);
  }

  /** Parse for up to `budgetMs`; returns how many remain. The TUI calls this between frames: the notes whose texts are
   *  given alone, when they're read elsewhere (SD-T6). */
  parseSome(budgetMs: number, skip?: ReadonlySet<string>): number {
    const g = this.graph;
    const end = performance.now() + budgetMs;
    for (const rel of this.texts.readElsewhere ? this.texts.ready() : this.unparsed.keys()) {
      // Being parsed elsewhere (a big note, on other threads): not here, not now.
      if (skip?.has(rel)) continue;
      g.entry(rel);
      if (performance.now() >= end) break;
    }
    if (!this.unparsed.size && this.cacheDirty) this.writeCache();
    return this.unparsed.size;
  }

  ensureAll(): void {
    const g = this.graph;
    // Asked `partially`, the texts read elsewhere: what's parsed so far, the rest left to the background parse (SD-T6).
    if (this.texts.partial) return;
    // Until none is left: a note parsed can reach more (20.8).
    while (this.unparsed.size) for (const rel of [...this.unparsed.keys()]) g.entry(rel);
    if (this.cacheDirty) this.writeCache();
  }

  /**
   * Its index is behind its walk: notes to parse, or entries gone or changed that it hasn't written — one that doesn't
   * write its own (`writesIndex`) has it caught up elsewhere (#10).
   */
  get indexBehind(): boolean {
    return this.useCache && (this.cacheDirty || this.unparsed.size > 0);
  }

  private writeCache(): void {
    const g = this.graph;
    if (!this.useCache || !g.writesIndex) return;
    this.cacheDirty = false;
    const entries = cacheEntries(g.notes, this.unparsed, this.overlays);
    try {
      g.writtenAt = persistIndex(g, entries);
    } catch (err) {
      g.errors.push(`cache: ${(err as Error).message}`);
    }
  }

  /** The grammars the vault's code needs, loaded (the CLI, before it lists links or backlinks). */
  async loadGrammars(): Promise<void> {
    const gs = new Set<Grammar>();
    for (const p of this.graph.filePaths()) {
      const k = classify(p, this.graph.config.walk.extensions);
      const g = k.group === "text" ? grammarFor(k.format, extensionOf(p)) : null;
      if (g) gs.add(g);
    }
    await Promise.all([...gs].map((g) => grammar(g)));
    this.hooks.invalidate();
  }

  /** A grammar finished loading: code files' links can be read now (the TUI hears of it). */
  grammarsChanged(): void {
    this.hooks.invalidate();
  }

  /**
   * Whether a path of the vault can be one of its files or folders: not excluded by `walk.exclude`
   * nor inside a root of its own (a hidden or git-ignored one can, when reached: 20.8). `isDir`: a
   * folder, which is also refused when it is a root of its own.
   */
  admits(rel: string, isDir = false): boolean {
    if (!this.graph.filter.reachable(rel)) return false;
    const why = isDir ? this.graph.filter.exclusion(rel, true) : null;
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
    return neverIndexed(this.graph, rel, isDir, notes);
  }

  /**
   * Why a file written at `rel` — a folder, with `isDir` — is never indexed though the write is allowed (D246,
   * `WalkFilter.notIndexed`): `walk.exclude` names it, or a folder on its way. Not refused, as `neverIndexed`'s are,
   * but said after the write (`notIndexedSaid`). Null in Elsewhere, which indexes nothing.
   */
  notIndexed(rel: string, isDir = false): "walk.exclude" | null {
    return isListed(this.graph.loc) ? null : this.graph.filter.notIndexed(rel, isDir);
  }
}

/** A file's stamp, its mtime and size in a word: "" for none. */
function stampOf(path: string): string {
  try {
    const st = disk.stat(path);
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return "";
  }
}

/** An index read as text elsewhere (SD-T8), parsed as `readJson` parses the file: null when there's none, or it isn't
 *  JSON. */
function parsedIndex(text: string | null): IndexFile | null {
  try {
    return text === null ? null : (JSON.parse(text) as IndexFile);
  } catch {
    return null;
  }
}
