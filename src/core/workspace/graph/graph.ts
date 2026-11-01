// The vault graph: notes, their outgoing links, backlinks, and the persisted index (1.9).
//
// One pass over the vault extracts per-note facts (title, headings, links). Resolution happens at
// query time against the LinkIndex, so adding or removing a note never leaves stale answers.
// The CLI reads a fresh cache instead of reparsing every note on every agent call (9.4).
//
// Here, the graph: its walk, the index kept, a file's changes heard, backlinks, tags and problems. What it
// keeps of a note and its links is graph-types.ts's, a note's entry made from its text graph-extract.ts's,
// and how a link resolves graph-resolve.ts's (`LinkResolver`). All of it is imported from here.

import { grammarFor } from "../../documents/syntax/syntax.ts";
import { isAbsolute, join, relative, sep } from "node:path";
import { isMainThread } from "node:worker_threads";
import type { Config } from "../../application/config/config.ts";
import { countForms, type FormCounts } from "../links/convention.ts";
import { LinkIndex, type Resolution } from "../links/links.ts";
import type { ParseCache as ChunkCache } from "../../documents/markdown/parse.ts";
import { tildePath } from "../vaults/names.ts";
import { stateDir } from "../../foundation/platform/paths.ts";
import { Redirects } from "../links/redirects.ts";
import { classify, extensionOf } from "../../documents/model/filetypes.ts";
import type { AskedWhole, HomeWalk } from "../vaults/home.ts";
import { findVaultRoot, isListed, type VaultLocation } from "../vaults/vault.ts";
import { type NoteFile, type Skipped, type WalkCap, WalkFilter } from "../walk/walk.ts";
import type {
  LinkRef,
  NoteEntry,
  VaultChange,
  ResolvedLink,
  Retarget,
  Target,
  VaultReach,
  LinkProblem,
  Backlink,
} from "./graph-types.ts";
import { tagKey, tagName } from "../../documents/markdown/tags.ts";
import type { GraphStats } from "./graph-types.ts";
import { LinkResolver } from "./graph-resolve.ts";
import { GraphRefresh } from "./refresh.ts";
import { GraphFeed } from "./feed.ts";
import { GraphMoves } from "./moves/reconcile.ts";
import { applyOverlay, overlayText, type EditorOverlay } from "./overlays/editor.ts";
import { collectBacklinks, collectProblems, collectTags, findNote } from "./queries/indexes.ts";
import { fileLinksOf, commentPath } from "./queries/file-links.ts";

export { certainty, fragile, describeLanding, disambiguated } from "./graph-types.ts";
export type {
  GraphStats,
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

export class Graph {
  private readonly refresh: GraphRefresh;
  private readonly feed: GraphFeed;
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
  private invalidate(): void {
    this.backlinkCache = null;
    this.tagCache = null;
    this.generation++;
    this.resolver.forgetNames();
  }

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
    this.feed = new GraphFeed(this, this.unparsed, this.overlays, {
      invalidate: () => this.invalidate(),
      dirty: () => {
        this.refresh.cacheDirty = true;
      },
      pairMove: (hash, rel, side) => this.moves.pairMove(hash, rel, side),
      forgetFileLinks: (rel) => {
        if (rel === undefined) this.dataLinkCache.clear();
        else this.dataLinkCache.delete(rel);
      },
      aliases: () => this.resolver.otherNames().aliases,
    });
    this.refresh = new GraphRefresh(
      this,
      this.unparsed,
      this.overlays,
      {
        invalidate: () => this.invalidate(),
        emit: (change) => this.feed.emit(change),
        built: () => this.feed.built(),
        detectMoves: (vanished, fresh) => this.moves.detectMoves(vanished, fresh),
      },
      asked,
    );
  }

  /** Home's walk (VV-D2): when it was made (null: not yet, its top alone looked at), what its cap left out, the folders
   *  asked for by name walked into it whole. Null in a vault or a plain folder, which are walked whole at each build. */
  home: { walked: number | null; capped: WalkCap | null; asked?: AskedWhole } | null = null;

  get askedFolders(): readonly string[] {
    return this.refresh.askedFolders;
  }

  askFolders(abs: readonly string[]): boolean {
    return this.refresh.askFolders(abs);
  }

  homePath(abs: string): string | null {
    return this.refresh.homePath(abs);
  }

  waitsForHomeWalk(rel: string): boolean {
    return this.refresh.waitsForHomeWalk(rel);
  }

  listForWalk(rel: string): boolean {
    return this.refresh.listForWalk(rel);
  }

  get root(): string {
    return this.loc.root;
  }

  build(useCache = true, parse: "all" | "lazy" = "all", given?: HomeWalk): this {
    this.refresh.build(useCache, parse, given);
    return this;
  }

  /** How many times it's been built: a walk made elsewhere since the last (T12) is older than what it holds. None: the
   *  TUI's is first built as the folders asked for are (`askFolders`). */
  builds = 0;

  onBuild(fn: () => void): () => void {
    return this.feed.onBuild(fn);
  }

  private readonly unparsed = new Map<string, NoteFile>();

  get usesCache(): boolean {
    return this.refresh.usesCache;
  }

  /** A file as it's shown (21.9). */
  shownPath(abs: string): string {
    // By path (21.9): from this root (or the folder opened), else from home (`~/…`), else absolute.
    const rel = relative(this.root, abs);
    if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return rel.split(sep).join("/");
    return tildePath(abs);
  }

  indexChanged(): boolean {
    return this.refresh.indexChanged();
  }

  indexedAt(): Date | null {
    return this.refresh.indexedAt();
  }

  get pendingCount(): number {
    return this.refresh.pendingCount;
  }

  pendingPaths(): IterableIterator<string> {
    return this.refresh.pendingPaths();
  }

  /**
   * Files the walk leaves out — under a hidden folder, or git-ignored — reached since (20.8): a link
   * points at one, or it was opened or named. Indexed as the walked ones are, and kept with the index.
   */
  readonly reached = new Set<string>();

  admits(rel: string, isDir = false): boolean {
    return this.refresh.admits(rel, isDir);
  }

  neverIndexed(rel: string, isDir = false, notes?: boolean): string | null {
    return this.refresh.neverIndexed(rel, isDir, notes);
  }

  notIndexed(rel: string, isDir = false): "walk.exclude" | null {
    return this.refresh.notIndexed(rel, isDir);
  }

  reachFile(rel: string, opts: { keep?: boolean } = {}): boolean {
    return this.refresh.reachFile(rel, opts);
  }

  adopt(rel: string): NoteEntry | undefined {
    return this.refresh.adopt(rel);
  }

  unparsedOver(min: number): NoteFile[] {
    return this.refresh.unparsedOver(min);
  }

  entry(rel: string, chunks?: ChunkCache): NoteEntry | undefined {
    return this.refresh.entry(rel, chunks);
  }

  parseSome(budgetMs: number, skip?: ReadonlySet<string>): number {
    return this.refresh.parseSome(budgetMs, skip);
  }

  ensureAll(): void {
    this.refresh.ensureAll();
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

  get indexBehind(): boolean {
    return this.refresh.indexBehind;
  }

  // -------------------------------------------------------------------------------------------
  // Moves (17.12)

  private redirectStore: Redirects | null | undefined;
  private readonly moves = new GraphMoves(this);

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
   * After a merge or a pull (20.21): a branch moved since this copy last saw it, so git's renames
   * between the two commits — paired by similarity — are evidence of moves, recorded as redirects by
   * that change: a broken link to a renamed file then says where it went, and the relink fixes it.
   * The last commit seen is kept per branch, per copy (its state): a branch switch compares a branch
   * with itself, never with another — a file only one branch has comes and goes, and nothing moved.
   * Returns the moves recorded, vault paths old → new.
   */
  catchUpWithGit(): [string, string][] {
    return this.moves.catchUpWithGit();
  }

  /** Run `fn` with move detection off: a branch switch's mass of files coming and going. */
  pauseMoves<T>(fn: () => T): T {
    return this.moves.pauseMoves(fn);
  }

  /** The branch the vault's checkout has (null: detached, or no git). */
  branchNow(): string | null {
    return this.moves.branchNow();
  }

  onChange(fn: (c: VaultChange) => void): () => void {
    return this.feed.onChange(fn);
  }

  moved(pairs: [string, string][]): void {
    this.feed.moved(pairs);
  }

  updateFile(rel: string, file: NoteFile): boolean {
    return this.feed.updateFile(rel, file);
  }

  onRetarget(fn: (r: Retarget[]) => void): () => void {
    return this.feed.onRetarget(fn);
  }

  /** Every non-note file the walk saw (data, text and binary alike), vault-relative. */
  filePaths(): string[] {
    return [...this.assets.values()].flat();
  }

  addAsset(rel: string): boolean {
    return this.feed.addAsset(rel);
  }

  removeAsset(rel: string): boolean {
    return this.feed.removeAsset(rel);
  }

  removeFile(rel: string): void {
    this.feed.removeFile(rel);
  }

  /** Notes an editor has open (11.8): the text it has, and the file's own entry behind it. */
  private readonly overlays = new Map<string, EditorOverlay>();

  /**
   * A note's text as an editor has it, saved or not (11.8): its links, headings, tags and names count
   * instead of the file's until `overlay(rel, null)` lets it go. The persisted index keeps the file's,
   * and no listener hears of it — the file didn't change. A note the graph doesn't know is left alone.
   */
  overlay(rel: string, text: string | null): void {
    if (!applyOverlay(this, this.overlays, rel, text)) return;
    this.invalidate();
  }

  /** Whether an editor's text stands for the note (11.8). */
  overlaid(rel: string): boolean {
    return this.overlays.has(rel);
  }

  /** A note's text: an editor's when it has the note open (11.8), else the file's; null when it can't be read. */
  textOf(path: string): string | null {
    return overlayText(this.root, this.overlays, path);
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
    return findNote(this, input, cwd);
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
    this.tagCache = collectTags(this.notes);
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
    const problems = collectProblems(this);
    this.problemCache = { generation: this.generation, ...problems };
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
    if (!this.backlinkCache) this.backlinkCache = collectBacklinks(this, () => this.reach?.inbound(this) ?? []);
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

  loadGrammars(): Promise<void> {
    return this.refresh.loadGrammars();
  }

  grammarsChanged(): void {
    this.refresh.grammarsChanged();
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
    return commentPath(this, target, fromRel);
  }

  /**
   * A data file's links (16.15): URLs, reference keys' values ($ref, include…) whether or not they
   * resolve, and path-like values that do. A code file's (16.10): URLs and paths that resolve, in
   * its comments; `path:42` links to that line (`#L42`). Read when asked and cached by the file's
   * stamp; files over 256 KB (lock files, dumps, generated code) aren't read for links. Code whose
   * grammar is still loading has none yet (and isn't cached).
   */
  fileLinksOf(rel: string): LinkRef[] {
    return fileLinksOf(this, this.dataLinkCache, rel);
  }

  fileChanged(rel: string): void {
    this.feed.fileChanged(rel);
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
