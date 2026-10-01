// The vault graph: notes, their outgoing links, backlinks, and the persisted index (1.9).
//
// One pass over the vault extracts per-note facts (title, headings, links). Resolution happens at
// query time against the LinkIndex, so adding or removing a note never leaves stale answers.
// The CLI reads a fresh cache instead of reparsing every note on every agent call (9.4).

import { statSync } from "node:fs";
import { commentLinks, grammar, grammarFor, grammarNow, linkTokens, parseSyntax, type Grammar } from "./syntax.ts";
import { basename, isAbsolute, join, posix, relative } from "node:path";
import type { Definition, Nodes } from "mdast";
import type { Config } from "./config.ts";
import { ensureDir, readJson, readText, writeJson } from "./fsutil.ts";
import { LinkIndex, type MdLinkTarget, normKey, pathLink, pickCandidate, type Resolution, resolveAttachment, resolveMarkdownUrl } from "./links.ts";
import { type HeadingInfo, headingsOf, noteTitle, visit } from "./parse.ts";
import { parseNoteFile } from "./readers.ts";
import { cacheDir, stateDir } from "./paths.ts";
import { contentHash, Redirects } from "./redirects.ts";
import { dataLinks, parseData } from "./data.ts";
import { classify, extensionOf } from "./filetypes.ts";
import type { VaultLocation } from "./vault.ts";
import { listDirectory, type NoteFile, type Skipped, WalkFilter, walkVault } from "./walk.ts";
import { type Hashtag, tagKey, tagName } from "./tags.ts";
import type { WikiLink } from "./wikilink.ts";

export type LinkKind = "wiki" | "embed" | "markdown" | "image";

export interface LinkRef {
  kind: LinkKind;
  /** wiki: the target name; markdown/image: the URL. */
  target: string;
  heading: string | null;
  block: string | null;
  alias: string | null;
  /** Visible text, for listings. */
  text: string;
  line: number;
  column: number;
}

export interface NoteEntry {
  rel: string;
  title: string;
  headings: HeadingInfo[];
  links: LinkRef[];
  tags: string[];
  /** Frontmatter `aliases` (and `alias`): names `[[…]]` reaches the note by, like its own (17.7). */
  aliases: string[];
  /** Frontmatter `previous_names`: names it had; a fallback only (17.7). */
  previous: string[];
  /** Its content hash: a note that vanished and turns up elsewhere with it was moved (17.12). */
  hash: string;
  mtimeMs: number;
  size: number;
  flags: string[];
}

/**
 * A change to the vault's files as the graph hears of it (6.7): whatever made it — the watcher, a
 * save here, a CLI write, a rename — it passes through the graph, and whoever keeps something
 * derived from the files (the search index; later, an outside indexer) listens here.
 */
export type VaultChange = { kind: "changed"; path: string } | { kind: "removed"; path: string } | { kind: "moved"; from: string; to: string };

/** How a link was resolved when not by the note's own name or path. */
export type Via = "alias" | "previous-name" | "redirect";

export interface ResolvedLink extends LinkRef {
  /** note: a vault note; file: an attachment; external: a URL; anchor: within this note. */
  resolvedKind: "note" | "file" | "external" | "anchor" | "unresolved" | "ambiguous";
  /** Vault-relative; absolute when the target is in another root (17.8, 17.9). */
  path: string | null;
  candidates: string[];
  /** The other vault's name (or folder), when the target is in another root. */
  vault?: string | null;
  via?: Via;
  /** Why it didn't resolve, when there's more to say than "no such note" ("unknown vault"). */
  reason?: string;
}

/** What resolving a link found, without the link's own fields. */
export type Target = Omit<ResolvedLink, keyof LinkRef>;

/**
 * Other vaults, as this one reaches them (17.8–17.11; core/reach.ts): `[[vault:note]]`, the root
 * holding a path outside this one, and the links other vaults make into this one.
 */
export interface VaultReach {
  /** `[[vault:target]]` from `g`; null when `vault` names no vault and the link is something else. */
  wiki(vault: string, target: string, g: Graph): Target | null;
  /** The name (or folder) of the root holding an absolute path outside this vault. */
  vaultOf(abs: string): string | null;
  /** Links from other vaults' indexes into `g`, by the vault-relative path they reach. */
  inbound(g: Graph): Map<string, Backlink[]>;
  /** The entry of a note in another root, by its absolute path. */
  entryAt(abs: string): NoteEntry | undefined;
}

/** A link that reaches nothing, or more than one note (1.7): where it is, how it's written, why. */
export interface LinkProblem {
  from: string;
  line: number;
  column: number;
  kind: LinkKind;
  target: string;
  text: string;
  reason: string | null;
  candidates: string[];
}

export interface Backlink {
  /** Vault-relative; absolute for a link from another vault (17.11). */
  from: string;
  /** The linking vault's name, for a link from another vault. */
  vault?: string | null;
  line: number;
  column: number;
  text: string;
  /** How the link is written, so a caller can rewrite it (a rename): its kind and parts. */
  kind: LinkKind;
  target: string;
  heading: string | null;
  block: string | null;
  alias: string | null;
}

/** Bumped when what a note's entry holds changes: 5, content hashes (17.12). */
const INDEX_VERSION = 6; // 6: inline #tags (1.6)

interface IndexFile {
  version: number;
  entries: Record<string, NoteEntry>;
}

export interface GraphStats {
  notes: number;
  parsed: number;
  cached: number;
  ms: number;
}

/** Data files larger than this aren't read for links (a lock file, a dump). */
const DATA_LINK_MAX = 256 * 1024;

export class Graph {
  readonly filter: WalkFilter;
  notes = new Map<string, NoteEntry>();
  index = new LinkIndex([]);
  dirs: string[] = [];
  /** lower(basename) → vault-relative paths of non-note files. */
  assets = new Map<string, string[]>();
  skipped: Skipped[] = [];
  errors: string[] = [];
  stats: GraphStats = { notes: 0, parsed: 0, cached: 0, ms: 0 };
  private backlinkCache: Map<string, Backlink[]> | null = null;
  private tagCache: Map<string, { tag: string; notes: string[] }> | null = null;
  /** Bumped whenever what the notes say changes (a note read, changed, gone): views that show
   *  what's derived from them (the Info view's counts) know to look again. */
  generation = 0;
  private problemCache: { generation: number; broken: LinkProblem[]; ambiguous: LinkProblem[]; orphans: string[] } | null = null;
  private readonly dataLinkCache = new Map<string, { stamp: string; links: LinkRef[] }>();
  /** Aliases and previous names → notes, from the entries parsed so far (null: rebuild). */
  private nameCache: { aliases: Map<string, string[]>; previous: Map<string, string[]> } | null = null;
  /** Other vaults (17.8–17.11); the CLI and the TUI set it, a graph opened alone has none. */
  reach: VaultReach | null = null;
  /**
   * Parse every note before calling a link unresolved: its alias may be in a note not parsed yet.
   * The CLI wants the right answer now; the TUI indexes in the background and lays out again.
   */
  thorough = false;

  constructor(
    readonly loc: VaultLocation,
    readonly config: Config,
  ) {
    this.filter = new WalkFilter(loc.root, config.walk);
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
   */
  build(useCache = true, parse: "all" | "lazy" = "all"): this {
    const t0 = performance.now();
    const walk = this.loc.mode === "home" ? listDirectory(this.root, this.filter) : walkVault(this.root, this.filter);
    this.dirs = walk.dirs;
    this.assets.clear();
    for (const a of walk.assets) this.addAsset(a);
    this.skipped = walk.skipped;
    this.errors = walk.errors;
    // A loose folder is listed, never indexed: nothing to keep.
    this.useCache = useCache && this.loc.mode !== "home";
    const cached = this.useCache ? readJson<IndexFile | null>(this.cachePath, null) : null;
    const old = cached?.version === INDEX_VERSION ? cached.entries : {};
    let reused = 0;
    this.notes.clear();
    this.unparsed.clear();
    for (const f of walk.files) {
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
    // Notes the index had that the walk no longer finds: moved, if one new file has the same text.
    if (this.useCache) {
      const vanished = Object.values(old).filter((e) => !this.notes.has(e.rel));
      if (vanished.length) this.detectMoves(vanished, walk.files.filter((f) => !old[f.rel]));
    }
    this.backlinkCache = null;
    this.tagCache = null;
    this.generation++;
    this.nameCache = null;
    this.cacheDirty = Object.keys(old).length !== reused;
    const toParse = this.unparsed.size;
    if (parse === "all") this.ensureAll();
    else if (this.cacheDirty && !toParse) this.writeCache();
    this.stats = { notes: this.notes.size, parsed: parse === "all" ? toParse : 0, cached: reused, ms: performance.now() - t0 };
    return this;
  }

  private readonly unparsed = new Map<string, NoteFile>();
  private useCache = false;
  private cacheDirty = false;

  private get cachePath(): string {
    return join(cacheDir(this.loc), "index.json");
  }

  /** Notes still waiting to be parsed. */
  get pendingCount(): number {
    return this.unparsed.size;
  }

  /** Files read on explicit request that the walk excludes. Not part of the vault's index. */
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

  /** The parsed entry for a note, parsing it now if needed. */
  entry(rel: string): NoteEntry | undefined {
    const adopted = this.adopted.get(rel);
    if (adopted) return adopted;
    const f = this.unparsed.get(rel);
    if (f) {
      const e = extractNote(f);
      if (isUnreadable(e)) this.errors.push(`${rel}: ${e.flags.find((x) => x.startsWith("unreadable"))}`);
      this.notes.set(rel, e);
      this.unparsed.delete(rel);
      this.cacheDirty = true;
      this.backlinkCache = null;
      this.tagCache = null;
      this.generation++;
      this.nameCache = null;
    }
    return this.notes.get(rel);
  }

  /** Parse for up to `budgetMs`; returns how many remain. The TUI calls this between frames. */
  parseSome(budgetMs: number): number {
    const end = performance.now() + budgetMs;
    for (const rel of this.unparsed.keys()) {
      this.entry(rel);
      if (performance.now() >= end) break;
    }
    if (!this.unparsed.size && this.cacheDirty) this.writeCache();
    return this.unparsed.size;
  }

  ensureAll(): void {
    for (const rel of [...this.unparsed.keys()]) this.entry(rel);
    if (this.cacheDirty) this.writeCache();
  }

  private writeCache(): void {
    this.cacheDirty = false;
    if (!this.useCache) return;
    const entries: Record<string, NoteEntry> = {};
    // A read failure is not a fact about the note: never cache it (chmod does not touch mtime).
    for (const [rel, e] of this.notes) if (!this.unparsed.has(rel) && !isUnreadable(e)) entries[rel] = e;
    try {
      ensureDir(cacheDir(this.loc));
      writeJson(this.cachePath, { version: INDEX_VERSION, entries } satisfies IndexFile);
    } catch (err) {
      this.errors.push(`cache: ${(err as Error).message}`);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Moves (17.12)

  private redirectStore: Redirects | null | undefined;

  /** The vault's redirects, from its state; none for a loose folder (never indexed). */
  get redirects(): Redirects | null {
    if (this.redirectStore === undefined) this.redirectStore = this.loc.mode === "home" ? null : new Redirects(join(stateDir(this.loc), "redirects.json"));
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

  /** Notes that went (removed) and came (added) lately, by hash: a watcher sees a move as both. */
  private readonly went = new Map<string, { rel: string; at: number }>();
  private readonly came = new Map<string, { rel: string; at: number }>();

  private pairMove(hash: string, rel: string, side: "went" | "came"): void {
    if (!hash || this.loc.mode === "home") return;
    const now = Date.now();
    for (const m of [this.went, this.came]) for (const [h, v] of m) if (now - v.at > 60_000) m.delete(h);
    const other = side === "went" ? this.came : this.went;
    const match = other.get(hash);
    if (match && match.rel !== rel) {
      other.delete(hash);
      const move: [string, string] = side === "went" ? [rel, match.rel] : [match.rel, rel];
      this.redirects?.add([move]);
      this.moved([move]);
      return;
    }
    (side === "went" ? this.went : this.came).set(hash, { rel, at: now });
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
    this.unparsed.delete(rel);
    this.cacheDirty = true;
    const entry = extractNote(file);
    this.notes.set(rel, entry);
    if (isNew && entry.size > 0) this.pairMove(entry.hash, rel, "came");
    if (isNew) this.index.add(rel);
    this.backlinkCache = null;
    this.tagCache = null;
    this.generation++;
    this.nameCache = null;
    this.emit({ kind: "changed", path: rel });
    return true;
  }

  /** Every non-note file the walk saw (data, text and binary alike), vault-relative. */
  filePaths(): string[] {
    return [...this.assets.values()].flat();
  }

  /** Index an attachment by file name; true if the index changed. */
  addAsset(rel: string): boolean {
    const key = rel.slice(rel.lastIndexOf("/") + 1).normalize("NFC").toLowerCase();
    const list = this.assets.get(key);
    if (!list) this.assets.set(key, [rel]);
    else if (!list.includes(rel)) list.push(rel);
    else return false;
    this.backlinkCache = null;
    this.tagCache = null;
    this.generation++;
    this.nameCache = null;
    this.dataLinkCache.clear(); // a path in a data file or a comment may resolve now
    this.emit({ kind: "changed", path: rel });
    return true;
  }

  /** Forget an attachment; true if the index changed. */
  removeAsset(rel: string): boolean {
    const key = rel.slice(rel.lastIndexOf("/") + 1).normalize("NFC").toLowerCase();
    const before = this.assets.get(key);
    if (!before?.includes(rel)) return false;
    const list = before.filter((p) => p !== rel);
    if (list.length) this.assets.set(key, list);
    else this.assets.delete(key);
    this.dataLinkCache.clear(); // and paths to it no longer resolve
    this.backlinkCache = null;
    this.tagCache = null;
    this.generation++;
    this.nameCache = null;
    this.emit({ kind: "removed", path: rel });
    return true;
  }

  removeFile(rel: string): void {
    this.unparsed.delete(rel);
    const gone = this.notes.get(rel);
    if (!this.notes.delete(rel)) return;
    if (gone && gone.size > 0) this.pairMove(gone.hash, rel, "went");
    this.cacheDirty = true;
    this.index.remove(rel);
    this.backlinkCache = null;
    this.tagCache = null;
    this.generation++;
    this.nameCache = null;
    this.emit({ kind: "removed", path: rel });
  }

  abs(rel: string): string {
    return join(this.root, rel);
  }

  /** Find a note by user input: a vault-relative path, a path relative to cwd, or a link name. */
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
   * Resolve a link found in `fromRel`. A wikilink: the note's name or path in this vault; then
   * `[[vault:name]]` (17.8); an attachment; a note's alias; its previous name (17.7). A markdown
   * link: its path, into another root when it climbs out of this one (17.9).
   */
  resolveLink(link: Pick<LinkRef, "kind" | "target">, fromRel: string): Target {
    if (link.kind === "wiki" || link.kind === "embed") {
      if (!link.target) return { resolvedKind: "anchor", path: fromRel, candidates: [] };
      const r = this.index.resolveWiki(link.target, fromRel);
      if (r.status === "resolved") return { resolvedKind: "note", path: r.path, candidates: r.candidates };
      if (r.status === "ambiguous") return { resolvedKind: "ambiguous", path: null, candidates: r.candidates };
      const byPath = this.byFilesystemPath(link.target, fromRel, true) ?? this.intoNested(link.target.replace(/^\/+/, ""), true);
      if (byPath) return byPath;
      const inter = VAULT_LINK.exec(link.target);
      if (inter) {
        // This vault by its own name reaches its own notes; another's is looked up.
        if (this.answersTo(inter[1]!)) return this.resolveLink({ kind: link.kind, target: inter[2]! }, fromRel);
        const other = this.reach?.wiki(inter[1]!, inter[2]!, this);
        if (other) return other;
      }
      if (classify(link.target, this.config.walk.extensions).group !== "note" && /\.[A-Za-z0-9]+$/.test(link.target)) {
        const att = resolveAttachment(link.target, fromRel, this.root);
        if (att) return { resolvedKind: "file", path: att, candidates: [] };
        // Obsidian finds attachments anywhere in the vault by name.
        const named = this.assets.get(link.target.split("/").pop()!.normalize("NFC").toLowerCase()) ?? [];
        const suffix = link.target.normalize("NFC").toLowerCase();
        const hits = named.filter((p) => p.toLowerCase() === suffix || p.toLowerCase().endsWith(`/${suffix}`));
        if (hits.length === 1) return { resolvedKind: "file", path: hits[0]!, candidates: hits };
        if (hits.length > 1) return { resolvedKind: "ambiguous", path: null, candidates: hits.sort() };
      }
      const named = this.byOtherName(link.target, fromRel);
      if (named) return named;
      const moved = this.movedWiki(link.target);
      if (moved) return moved;
      return { resolvedKind: "unresolved", path: null, candidates: [] };
    }
    // A `file://` URL or a `~/` path names a file, not a web page (17.16).
    if (/^file:\/\//i.test(link.target) || link.target.startsWith("~/")) {
      const path = /^file:/i.test(link.target) ? link.target : link.target.split("#")[0]!;
      return this.byFilesystemPath(path, fromRel, false) ?? { resolvedKind: "unresolved", path: null, candidates: [] };
    }
    const m: MdLinkTarget = resolveMarkdownUrl(link.target, fromRel, this.root, this.index);
    if ((m.kind === "file" || m.kind === "missing") && !m.target.startsWith("../")) {
      // Into a vault nested in this one: its note, there (17.17).
      const nested = this.intoNested(m.target, false);
      if (nested) return nested;
    }
    if (m.kind === "missing" && !m.target.startsWith("../")) {
      const to = this.movedTo(m.target);
      if (to) return { resolvedKind: this.notes.has(to) ? "note" : "file", path: to, candidates: [], via: "redirect" };
    }
    if (m.kind === "missing") {
      // A path out of this root (17.9), or `/…` that isn't the vault's but the filesystem's (17.16):
      // the file wherever it is, in whichever root holds it.
      const byPath = this.byFilesystemPath(link.target.split("#")[0]!, fromRel, false);
      if (byPath) return byPath;
    }
    switch (m.kind) {
      case "external":
        return { resolvedKind: "external", path: m.target, candidates: [] };
      case "anchor":
        return { resolvedKind: "anchor", path: fromRel, candidates: [] };
      case "note":
        return { resolvedKind: "note", path: m.target, candidates: [] };
      case "file":
        return { resolvedKind: "file", path: m.target, candidates: [] };
      default:
        return { resolvedKind: "unresolved", path: null, candidates: [] };
    }
  }

  /**
   * A target written as a filesystem path (17.16): relative out of the root, `~/`, absolute, a
   * `file://` URL. Inside this vault, its note or file like any other link's (a backlink too);
   * elsewhere, the file by its absolute path, in whichever root holds it.
   */
  private byFilesystemPath(target: string, fromRel: string, wiki: boolean): Target | null {
    // From the linking note; with none (a lookup), from the vault's root.
    const hit = pathLink(target, join(this.root, fromRel || "_"), wiki);
    if (!hit) return null;
    const rel = relative(this.root, hit.abs);
    if (!rel.startsWith("..") && !isAbsolute(rel)) {
      if (this.notes.has(rel)) return { resolvedKind: "note", path: rel, candidates: [rel] };
      if (this.known(rel)) return { resolvedKind: "file", path: rel, candidates: [rel] };
    }
    return { resolvedKind: classify(hit.abs, this.config.walk.extensions).group === "note" ? "note" : "file", path: hit.abs, candidates: [], vault: this.reach?.vaultOf(hit.abs) ?? null };
  }

  /** The vaults nested in this one: folders the walk leaves to them. */
  nestedRoots(): string[] {
    return this.skipped.filter((s) => s.reason === "nested vault").map((s) => s.rel);
  }

  /**
   * A vault path that leads into a vault nested in this one (17.17): `[t](outreach/index.md)`,
   * `[[outreach/index]]` — the note there, by its absolute path, as a path out of the root is.
   */
  private intoNested(rel: string, wiki: boolean): Target | null {
    const p = posix.normalize(rel);
    if (!this.nestedRoots().some((r) => p.startsWith(`${r}/`))) return null;
    const abs = join(this.root, p);
    const candidates = wiki && !/\.[A-Za-z0-9]+$/.test(p) ? [`${abs}.md`, `${abs}.markdown`] : [abs];
    const hit = candidates.find((c) => {
      try {
        return statSync(c).isFile();
      } catch {
        return false;
      }
    });
    if (!hit) return null;
    return { resolvedKind: classify(hit, this.config.walk.extensions).group === "note" ? "note" : "file", path: hit, candidates: [], vault: this.reach?.vaultOf(hit) ?? null };
  }

  /** Whether `[[name:…]]` names this vault: its name, an alias, or a previous name. */
  answersTo(name: string): boolean {
    const n = name.toLowerCase();
    return [this.loc.name, ...this.loc.aliases, ...this.loc.previous_names].some((x) => x?.toLowerCase() === n);
  }

  /** The names notes declare in their frontmatter, from the entries parsed so far. */
  private otherNames(): NonNullable<Graph["nameCache"]> {
    if (this.thorough && this.unparsed.size) this.ensureAll();
    if (!this.nameCache) {
      const aliases = new Map<string, string[]>();
      const previous = new Map<string, string[]>();
      const add = (map: Map<string, string[]>, name: string, rel: string) => {
        const k = normKey(name.trim());
        if (!k) return;
        const list = map.get(k) ?? [];
        if (!list.includes(rel)) list.push(rel);
        map.set(k, list);
      };
      for (const [rel, e] of this.notes) {
        for (const a of e.aliases ?? []) add(aliases, a, rel);
        for (const p of e.previous ?? []) add(previous, p, rel);
      }
      this.nameCache = { aliases, previous };
    }
    return this.nameCache;
  }

  /**
   * A name no note has as its file name (17.7): a note's alias, resolved like a name (several go
   * through the same disambiguation); else a previous name, when exactly one note claims it.
   */
  private byOtherName(target: string, fromRel: string): Target | null {
    if (target.includes("/")) return null;
    const stem = target.replace(/\.(md|markdown)$/i, "");
    const names = this.otherNames();
    const aliased = names.aliases.get(normKey(stem));
    if (aliased?.length) {
      const r = pickCandidate(aliased, stem, fromRel);
      if (r.status === "resolved") return { resolvedKind: "note", path: r.path, candidates: r.candidates, via: "alias" };
      return { resolvedKind: "ambiguous", path: null, candidates: r.candidates, via: "alias" };
    }
    const prev = names.previous.get(normKey(stem));
    if (prev?.length === 1) return { resolvedKind: "note", path: prev[0]!, candidates: prev, via: "previous-name" };
    if (prev && prev.length > 1) return { resolvedKind: "ambiguous", path: null, candidates: [...prev].sort(), via: "previous-name" };
    return null;
  }

  /** Where a path went (17.12), when that's a note or file of the vault now. */
  movedTo(rel: string): string | null {
    const to = this.redirects?.follow(rel);
    return to && (this.notes.has(to) || this.known(to)) ? to : null;
  }

  /** `[[dir/old]]` or `[[old]]` whose note moved: by its old path, else its old name when unique. */
  private movedWiki(target: string): Target | null {
    if (!this.redirects) return null;
    const t = target.trim().replace(/^\/+/, "");
    const withExt = /\.(md|markdown)$/i.test(t) ? [t] : [`${t}.md`, `${t}.markdown`];
    const byPath = t.includes("/") ? withExt.map((p) => this.movedTo(p)).find((p) => p) : null;
    if (byPath) return { resolvedKind: "note", path: byPath, candidates: [byPath], via: "redirect" };
    if (t.includes("/")) return null;
    const to = [...new Set(this.redirects.named(t).map((p) => this.movedTo(p)).filter((p): p is string => !!p))];
    if (to.length === 1) return { resolvedKind: "note", path: to[0]!, candidates: to, via: "redirect" };
    if (to.length > 1) return { resolvedKind: "ambiguous", path: null, candidates: to.sort(), via: "redirect" };
    return null;
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
  problems(): { broken: LinkProblem[]; ambiguous: LinkProblem[]; orphans: string[] } {
    this.ensureAll();
    if (this.problemCache?.generation === this.generation) return this.problemCache;
    const broken: LinkProblem[] = [];
    const ambiguous: LinkProblem[] = [];
    for (const rel of [...this.notes.keys()].sort()) {
      for (const l of this.linksOf(rel)) {
        if (l.resolvedKind !== "unresolved" && l.resolvedKind !== "ambiguous") continue;
        const p: LinkProblem = { from: rel, line: l.line, column: l.column, kind: l.kind, target: l.target, text: l.text, reason: l.reason ?? null, candidates: l.candidates };
        (l.resolvedKind === "unresolved" ? broken : ambiguous).push(p);
      }
    }
    const orphans = [...this.notes.keys()].sort().filter((rel) => !this.backlinks(rel).some((b) => b.from !== rel));
    this.problemCache = { generation: this.generation, broken, ambiguous, orphans };
    return this.problemCache;
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
      const sources: [string, LinkRef[]][] = [...[...this.notes].map(([from, note]) => [from, note.links] as [string, LinkRef[]]), ...this.linkingFiles().map((f) => [f, this.fileLinksOf(f)] as [string, LinkRef[]])];
      for (const [from, links] of sources) {
        for (const l of links) {
          // An image's link counts too: the notes that show a picture are its backlinks (and a
          // rename or move of it fixes them, 18.3).
          const r = this.resolveLink(l, from);
          if ((r.resolvedKind !== "note" && r.resolvedKind !== "file") || !r.path || r.path === from || isAbsolute(r.path)) continue;
          const list = map.get(r.path) ?? [];
          list.push({ from, line: l.line, column: l.column, text: l.text, kind: l.kind, target: l.target, heading: l.heading, block: l.block, alias: l.alias });
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
    if (path.startsWith(`${this.root}/`)) return this.entry(path.slice(this.root.length + 1));
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
    this.nameCache = null;
  }

  /** A grammar finished loading: code files' links can be read now (the TUI hears of it). */
  grammarsChanged(): void {
    this.backlinkCache = null;
    this.tagCache = null;
    this.generation++;
    this.nameCache = null;
  }

  /** Whether a vault-relative path is a note or a file of the vault (by the index: no disk). */
  private known(rel: string): boolean {
    if (this.notes.has(rel)) return true;
    return this.assets.get(rel.slice(rel.lastIndexOf("/") + 1).normalize("NFC").toLowerCase())?.includes(rel) ?? false;
  }

  /**
   * A path in a code comment (16.10) as a vault-relative path: relative to the file, then to the
   * vault's root (where a repo's paths start); null if it names no file of the vault.
   */
  commentPath(target: string, fromRel: string): string | null {
    const cands = target.startsWith("/") ? [posix.normalize(target.slice(1))] : [posix.normalize(posix.join(posix.dirname(fromRel), target)), posix.normalize(target)];
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
        .filter((l) => l.explicit || ["note", "file"].includes(this.resolveLink({ kind: "markdown", target: l.target }, rel).resolvedKind))
        .map((l) => ({ kind: "markdown", target: l.target, heading: null, block: null, alias: null, text: l.key, line: l.line, column: 1 }));
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
      out.push({ kind: "markdown", target, heading: null, block: null, alias: null, text: lines[l.line - 1]!.slice(l.from, l.to), line: l.line, column: l.from + 1 });
    }
    tree.tree.delete();
    return out;
  }

  /** A data file changed or went: its links are read again, and backlinks recomputed. */
  fileChanged(rel: string): void {
    this.dataLinkCache.delete(rel);
    this.backlinkCache = null;
    this.tagCache = null;
    this.generation++;
    this.nameCache = null;
    this.emit({ kind: "changed", path: rel });
  }
}

export function openGraph(loc: VaultLocation, config: Config, useCache = true, parse: "all" | "lazy" = "all"): Graph {
  return new Graph(loc, config).build(useCache, parse);
}

function isUnreadable(e: NoteEntry): boolean {
  return e.flags.some((f) => f.startsWith("unreadable"));
}

function stub(f: NoteFile): NoteEntry {
  return { rel: f.rel, title: basename(f.rel).replace(/\.(md|markdown)$/i, ""), headings: [], links: [], tags: [], aliases: [], previous: [], hash: "", mtimeMs: f.mtimeMs, size: f.size, flags: ["unparsed"] };
}

/** `[[vault:name]]`: a vault's name, a colon, the rest (17.8). */
export const VAULT_LINK = /^([\p{L}\p{N}][\p{L}\p{N}._-]*):(.+)$/u;


/** Parse one note and extract what the graph needs. */
export function extractNote(file: NoteFile): NoteEntry {
  const flags: string[] = [];
  let text = "";
  try {
    const decoded = readText(file.abs);
    text = decoded.text;
    if (decoded.invalidUtf8) flags.push("invalid-utf8");
    if (decoded.bom) flags.push("bom");
    if (decoded.crlf) flags.push("crlf");
  } catch (err) {
    flags.push(`unreadable: ${(err as NodeJS.ErrnoException).code ?? "error"}`);
  }
  return extractFromSource(file, text, flags);
}

export function extractFromSource(file: NoteFile, text: string, flags: string[] = []): NoteEntry {
  const parsed = parseNoteFile(file.rel, text);
  const links: LinkRef[] = [];
  const inline: string[] = [];
  const definitions = new Map<string, string>();
  visit(parsed.tree, (n) => {
    if (n.type === "definition") definitions.set((n as Definition).identifier.toLowerCase(), (n as Definition).url);
    else if ((n.type as string) === "hashtag") inline.push((n as unknown as Hashtag).value);
  });
  visit(parsed.tree, (n: Nodes) => {
    const pos = n.position?.start;
    const line = pos?.line ?? 1;
    const column = pos?.column ?? 1;
    switch (n.type) {
      case "wikiLink": {
        const w = n as WikiLink;
        links.push({
          kind: w.embed ? "embed" : "wiki",
          target: w.target,
          heading: w.heading,
          block: w.block,
          alias: w.alias,
          text: w.alias ?? w.value,
          line,
          column,
        });
        return false;
      }
      case "link":
        links.push(mdLink("markdown", n.url, plain(n), line, column));
        return;
      case "linkReference": {
        const url = definitions.get(n.identifier.toLowerCase());
        if (url) links.push(mdLink("markdown", url, plain(n), line, column));
        return;
      }
      case "image":
        links.push(mdLink("image", n.url, n.alt ?? "", line, column));
        return;
    }
  });
  const fm = parsed.frontmatter?.data;
  // The frontmatter's first, then the text's, each once (as first written).
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const t of [...normaliseTags(fm?.tags ?? fm?.tag), ...inline]) {
    const name = tagName(t);
    if (name && !seen.has(tagKey(name))) {
      seen.add(tagKey(name));
      tags.push(name);
    }
  }
  return {
    rel: file.rel,
    title: noteTitle(parsed, basename(file.rel)),
    headings: headingsOf(parsed.tree),
    links,
    tags,
    aliases: names(fm?.aliases ?? fm?.alias),
    previous: names(fm?.previous_names),
    hash: contentHash(text),
    mtimeMs: file.mtimeMs,
    size: file.size,
    flags,
  };
}

function mdLink(kind: LinkKind, url: string, text: string, line: number, column: number): LinkRef {
  return { kind, target: url, heading: null, block: null, alias: null, text, line, column };
}

function plain(n: Nodes): string {
  const parts: string[] = [];
  visit(n, (c) => {
    if (c.type === "text" || c.type === "inlineCode") parts.push(c.value);
  });
  return parts.join("");
}

/** A frontmatter list of names (or one name); anything else is none. */
function names(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
  return list.filter((n): n is string | number => typeof n === "string" || typeof n === "number").map((n) => String(n).trim()).filter(Boolean);
}

function normaliseTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((t) => String(t).replace(/^#/, "")).filter(Boolean);
  if (typeof v === "string") return v.split(/[,\s]+/).map((t) => t.replace(/^#/, "")).filter(Boolean);
  return [];
}
