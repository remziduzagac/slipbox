// The vault graph: notes, their outgoing links, backlinks, and the persisted index (1.9).
//
// One pass over the vault extracts per-note facts (title, headings, links). Resolution happens at
// query time against the LinkIndex, so adding or removing a note never leaves stale answers.
// The CLI reads a fresh cache instead of reparsing every note on every agent call (9.4).

import { existsSync, statSync } from "node:fs";
import { commentLinks, grammar, grammarFor, grammarNow, linkTokens, parseSyntax, type Grammar } from "./syntax.ts";
import { basename, isAbsolute, join, posix, relative, sep } from "node:path";
import type { Definition, Nodes } from "mdast";
import type { Config } from "./config.ts";
import { climbsOut, ensureDir, landsInside, readJson, readRegular, readText, SMALL_FILE, writeJson } from "./fsutil.ts";
import { parseWikiTarget, type WikiLink } from "./wikilink.ts";
import { countForms, type FormCounts } from "./convention.ts";
import { formatPointer, isPointer, parsePointer, resolvePointer } from "./pointer.ts";
import { parseHosted, readmeAt } from "./hosting.ts";
import { lookupFolder, pointerName } from "./folders.ts";
import { extensionless, type Landed, LinkIndex, type MdLinkTarget, normKey, pathLink, pickCandidate, type Resolution, resolveAttachment, resolveMarkdownUrl, wikiPathCandidates } from "./links.ts";
import { type AnchorInfo, anchorsOf, type HeadingInfo, headingsOf, noteTitle, type ParseCache as ChunkCache, visit } from "./parse.ts";
import { parseNoteFile } from "./readers.ts";
import { tildePath } from "./names.ts";
import { ParseCache, sharedParseCache } from "./parsecache.ts";
import { cacheDir, ensureCacheHome, stateDir } from "./paths.ts";
import { checkoutOf, headCommit, headOf } from "./git.ts";
import { branchesOf, changedBetween, inVault } from "./gitops.ts";
import { remotesIn } from "./remotes.ts";
import { contentHash, Redirects } from "./redirects.ts";
import { dataLinks, parseData } from "./data.ts";
import { classify, extensionOf, noteFormat } from "./filetypes.ts";
import { findVaultRoot, isListed, type VaultLocation } from "./vault.ts";
import { listDirectory, type NoteFile, type Skipped, WalkFilter, walkVault } from "./walk.ts";
import { type Hashtag, tagKey, tagName } from "./tags.ts";

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
  /** Where it ends: its last line, and the column after its last character (1-based, as remark counts). */
  end: Pos;
}

/** A place in a file's text: a line and a column, both from 1 (a column counts UTF-16 units). */
export interface Pos {
  line: number;
  column: number;
}

export interface NoteEntry {
  rel: string;
  title: string;
  headings: HeadingInfo[];
  /** HTML anchors (`<a id>`) a fragment may name (an entry from an older index has none). */
  anchors?: AnchorInfo[];
  links: LinkRef[];
  tags: string[];
  /** Frontmatter `aliases` (and `alias`): names `[[…]]` reaches the note by, like its own (17.7). */
  aliases: string[];
  /** Frontmatter `previous_names`, as renames wrote them before 21.12: the converter reads them (21.3), links never. */
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

/** How a link reached its target when not directly: an alias, a pointer's folder by an old name or another copy (21.7)… */
export type Via = "alias" | "previous-name" | "redirect" | "old-name" | "another-copy" | "hosting";

export interface ResolvedLink extends LinkRef {
  /** note: a vault note; file: an attachment; folder: a folder (21.2); external: a URL; anchor: within this note. */
  resolvedKind: "note" | "file" | "folder" | "external" | "anchor" | "unresolved" | "ambiguous";
  /** Vault-relative; absolute when the target is in another root (17.8, 17.9). */
  path: string | null;
  candidates: string[];
  /** The other vault's name (or folder), when the target is in another root. */
  vault?: string | null;
  via?: Via;
  /** Why it didn't resolve, when there's more to say than "no such note" ("unknown vault"). */
  reason?: string;
  /** A pointer to a branch not checked out here (21.7): the file as it is there, read from git. */
  gitRef?: { root: string; rel: string; branch: string };
  /** How it landed (`links.ts` `Landed`): a link's own path, a name, a tie broken. */
  how?: Landed;
  /** A hosting URL (via "hosting") naming another ref than the branch checked out: both. */
  hosted?: { ref: string; branch: string | null };
  /** A file named the old way (`research:x.md`, `[[research:x]]`, 21.11): the pointer that names it. */
  suggest?: string;
}

/** A link that reached one note and reaches another now, after a note came or went. */
export interface Retarget {
  from: string;
  line: number;
  target: string;
  was: string;
  now: string;
}

/**
 * How sure a link's target is (trailscout's terms): `exact` — by its path, a unique name, an alias,
 * a pointer; `inferred` — a tie broken, a path's end, a folder's old name or another copy; else
 * `ambiguous`, `broken`.
 */
export function certainty(t: Pick<Target, "resolvedKind" | "how" | "via" | "hosted">): "exact" | "inferred" | "ambiguous" | "broken" {
  if (t.resolvedKind === "unresolved") return "broken";
  if (t.resolvedKind === "ambiguous") return "ambiguous";
  if (t.via === "hosting") return t.hosted ? "inferred" : "exact";
  if (t.via === "previous-name" || t.via === "redirect" || t.via === "old-name" || t.via === "another-copy") return "inferred";
  return !t.how || t.how === "path" || t.how === "name" ? "exact" : "inferred";
}

/** A tie broken by where the link is — the deepest folder shared, the shortest path: a note of the name nearer would take it. */
export function fragile(t: Pick<Target, "how">): boolean {
  return t.how === "deepest-shared" || t.how === "shortest";
}

/** How a link landed, for people, when it wasn't by its own path: "the nearest of 2 named so". */
export function describeLanding(t: Pick<Target, "how" | "via" | "candidates" | "hosted">): string | null {
  const n = t.candidates.length;
  if (t.via === "hosting") return t.hosted ? `its URL names ${t.hosted.ref}; this copy is on ${t.hosted.branch ?? "no branch"}` : null;
  if (t.via === "alias") return "by an alias";
  if (t.via === "old-name") return "by its folder's old name";
  if (t.via === "another-copy") return "in another copy of its folder";
  switch (t.how) {
    case "suffix":
      return "by the end of its path";
    case "exact-case":
      return `spelled exactly so, of ${n}`;
    case "same-folder":
      return `in the same folder, of ${n}`;
    case "deepest-shared":
      return `the nearest of ${n} named so`;
    case "shortest":
      return `the shortest path of ${n} named so`;
    default:
      return null;
  }
}

/** What resolving a link found, without the link's own fields. */
export type Target = Omit<ResolvedLink, keyof LinkRef>;

/**
 * Other vaults, as this one reaches them (17.8–17.11; core/reach.ts): `[[vault:note]]`, the root
 * holding a path outside this one, and the links other vaults make into this one.
 */
export interface VaultReach {
  /** `[[vault:target]]` from `g`; null when `vault` names no folder (the link may be something else). */
  wiki(vault: string, target: string, g: Graph): Target | null;
  /** The name (or folder) of the root holding an absolute path outside this vault. */
  vaultOf(abs: string): string | null;
  /** Links from other vaults' indexes into `g`, by the vault-relative path they reach. */
  inbound(g: Graph): Map<string, Backlink[]>;
  /** The entry of a note in another root, by its absolute path. */
  entryAt(abs: string): NoteEntry | undefined;
  /** Another root's graph (an embed of its note resolves its links there, 1.11); null if unreadable. */
  graphAt(root: string, opts?: { known?: boolean }): Graph | null;
}

/** A link that reaches nothing, or more than one note (1.7): where it is, how it's written, why. */
export interface LinkProblem {
  from: string;
  line: number;
  column: number;
  end: Pos;
  kind: LinkKind;
  target: string;
  text: string;
  reason: string | null;
  candidates: string[];
  /** A broken link's file, seen to move: where it is now (vault path), the relink's fix. */
  moved?: string | null;
  /** A fragile link's: the target that names its note for sure — its path from the root, or a relative one for a top-level note. */
  fix?: string;
}

/**
 * The target that names a link's note (or file) for sure, written in the note at `fromRel`: its path
 * from the root — but a top-level note's path is its bare name, read as a name again (21.3), so
 * that one is a relative path (`../plan`, `./plan`). Without `.md` when the link had none.
 */
export function disambiguated(l: Pick<ResolvedLink, "target" | "path">, fromRel: string): string {
  let p = l.path!;
  if (!p.includes("/")) {
    p = posix.relative(posix.dirname(fromRel), p);
    if (!p.startsWith("../")) p = `./${p}`;
  }
  return NOTE_EXT_RE.test(l.target) || !NOTE_EXT_RE.test(p) ? p : p.replace(NOTE_EXT_RE, "");
}

export interface Backlink {
  /** Vault-relative; absolute for a link from another vault (17.11). */
  from: string;
  /** The linking vault's name, for a link from another vault. */
  vault?: string | null;
  line: number;
  column: number;
  end: Pos;
  text: string;
  /** How the link is written, so a caller can rewrite it (a rename): its kind and parts. */
  kind: LinkKind;
  target: string;
  heading: string | null;
  block: string | null;
  alias: string | null;
}

const NOTE_EXT_RE = /\.(md|markdown)$/i;

/** Bumped when what a note's entry holds changes: 5, content hashes (17.12). */
export const INDEX_VERSION = 12; // 6: inline #tags (1.6); 7: where links end (11.7); 8: no wikilinks (20.22); 9: wikilinks again (21.3); 10: heading ids, anchors; 11: front matter links; 12: worker-parsed heading ids (15.1)

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
  private problemCache: { generation: number; broken: LinkProblem[]; ambiguous: LinkProblem[]; fragile: LinkProblem[]; orphans: string[] } | null = null;
  private formCache: { generation: number; counts: FormCounts } | null = null;
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
    const walk = isListed(this.loc) ? listDirectory(this.root, this.filter) : walkVault(this.root, this.filter);
    this.dirs = walk.dirs;
    this.assets.clear();
    for (const a of walk.assets) this.addAsset(a);
    this.skipped = walk.skipped;
    this.errors = walk.errors;
    // `$HOME` or `/` opened as a plain folder is listed, never indexed: nothing to keep (20.22).
    this.useCache = useCache && !isListed(this.loc);
    const cached = this.useCache ? readJson<IndexFile | null>(this.cachePath, null) : null;
    const old = cached?.version === INDEX_VERSION ? cached.entries : {};
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
    if (this.useCache && (cached?.branch === undefined || cached.branch === this.branchNow())) {
      const vanished = Object.values(old).filter((e) => !this.notes.has(e.rel));
      if (vanished.length) this.detectMoves(vanished, walk.files.filter((f) => !old[f.rel]));
    }
    // And git's renames, when HEAD moved on the branch since this copy last looked (20.21).
    if (this.useCache) this.catchUpWithGit();
    // An editor's unsaved text stays over the new walk's entries (11.8); a note gone takes its own.
    const texts = [...this.overlays].map(([rel, o]) => [rel, o.text] as const);
    this.overlays.clear();
    for (const [rel, text] of texts) this.overlay(rel, text);
    this.backlinkCache = null;
    this.tagCache = null;
    this.generation++;
    this.nameCache = null;
    this.cacheDirty = Object.keys(old).length !== reused;
    const toParse = this.unparsed.size;
    if (parse === "all") this.ensureAll();
    else if (this.cacheDirty && !toParse) this.writeCache();
    const gone = Object.keys(old).filter((rel) => !this.notes.has(rel)).length;
    this.stats = { notes: this.notes.size, parsed: parse === "all" ? toParse : 0, cached: reused, gone, ms: performance.now() - t0 };
    return this;
  }

  private readonly unparsed = new Map<string, NoteFile>();
  private useCache = false;
  private cacheDirty = false;

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

  /** `rel` as a file to index when reached: there, a file inside the vault, and only left out softly. */
  private reachable(rel: string): NoteFile | null {
    if (isListed(this.loc) || !this.filter.reachable(rel)) return null;
    const abs = join(this.root, rel);
    try {
      const st = statSync(abs);
      if (!st.isFile() || st.size > this.filter.maxFileSize || !landsInside(this.root, abs)) return null;
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
    this.nameCache = null;
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
      let rel = !decoded.startsWith("/") ? posix.normalize(posix.join(posix.dirname(e.rel), decoded)) : this.loc.mode === "folder" ? relative(this.root, decoded) : posix.normalize(decoded.slice(1));
      if (decoded.startsWith("/") && this.loc.mode !== "folder" && !(rel && !climbsOut(rel) && (this.known(rel) || this.reachable(rel)))) rel = relative(this.root, decoded);
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
      this.cacheDirty = true;
      this.backlinkCache = null;
      this.tagCache = null;
      this.generation++;
      this.nameCache = null;
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

  private writeCache(): void {
    this.cacheDirty = false;
    if (!this.useCache) return;
    const entries: Record<string, NoteEntry> = {};
    // A read failure is not a fact about the note: never cache it (chmod does not touch mtime).
    for (const [rel, e] of this.notes) if (!this.unparsed.has(rel) && !isUnreadable(e)) entries[rel] = this.overlays.get(rel)?.disk ?? e;
    try {
      ensureCacheHome();
      ensureDir(cacheDir(this.loc));
      writeJson(this.cachePath, { version: INDEX_VERSION, entries, branch: this.branchNow(), reached: [...this.reached] } satisfies IndexFile);
    } catch (err) {
      this.errors.push(`cache: ${(err as Error).message}`);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Moves (17.12)

  private redirectStore: Redirects | null | undefined;

  /** The vault's redirects, from its state; none for `$HOME` or `/` opened as a plain folder (never indexed). */
  get redirects(): Redirects | null {
    if (this.redirectStore === undefined) this.redirectStore = isListed(this.loc) ? null : new Redirects(join(stateDir(this.loc), "redirects.json"));
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
    if (this.loc.mode !== "vault") return [];
    const c = checkoutOf(this.root);
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
      writeJson(file, { version: 1, branches: Object.fromEntries([...kept, [branch, commit]]) });
    } catch {}
    return moves;
  }

  /** Notes that went (removed) and came (added) lately, by hash: a watcher sees a move as both. */
  private readonly went = new Map<string, { rel: string; at: number }>();
  private readonly came = new Map<string, { rel: string; at: number }>();

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
    const c = this.loc.mode === "vault" ? checkoutOf(this.root) : null;
    return c ? headOf(c).branch : null;
  }

  private pairMove(hash: string, rel: string, side: "went" | "came"): void {
    if (!hash || isListed(this.loc) || this.movesPaused) return;
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
    this.nameCache = null;
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
    if (!named && !this.otherNames().aliases.has(key)) return null;
    // One process, one answer (the CLI's): a link in a note not parsed yet is watched too.
    if (this.thorough && this.unparsed.size) this.ensureAll();
    const out: { from: string; link: LinkRef; was: string }[] = [];
    for (const [from, e] of this.notes) {
      for (const l of e.links) {
        if ((l.kind !== "wiki" && l.kind !== "embed") || normKey(posix.basename(l.target).replace(NOTE_EXT_RE, "")) !== key) continue;
        const r = this.resolveLink(l, from);
        if ((r.resolvedKind === "note" || r.resolvedKind === "file") && r.path) out.push({ from, link: l, was: r.path });
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
      if ((r.resolvedKind === "note" || r.resolvedKind === "file") && r.path && r.path !== w.was) moved.push({ from: w.from, line: w.link.line, target: w.link.target, was: w.was, now: r.path });
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
    const watch = this.notes.has(rel) ? this.namesakeLinks(rel) : null;
    this.reached.delete(rel);
    this.unparsed.delete(rel);
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
    this.nameCache = null;
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
      this.notes.set(rel, extractFromSource({ rel, abs: join(this.root, rel), size: disk.size, mtimeMs: disk.mtimeMs }, text, disk.flags));
    }
    this.backlinkCache = null;
    this.tagCache = null;
    this.generation++;
    this.nameCache = null;
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
    if (link.kind === "wiki" || link.kind === "embed") return this.resolveWiki(link.target, fromRel);
    return this.resolvePath(link, fromRel);
  }

  /**
   * A wikilink, read within its root (21.3): a note's name or path, an alias from front matter, an
   * attachment by its name (as Obsidian finds one); a path into a root nested in this one is a path.
   * Two notes (or attachments) of one name: the nearest, then the shortest; a real tie is ambiguous. No
   * root, no names. Previous names, `[[vault:note]]` and remembered moves aren't read (20.22's kept).
   */
  private resolveWiki(target: string, fromRel: string): Target {
    if (!target) return { resolvedKind: "anchor", path: fromRel, candidates: [] };
    if (this.loc.mode === "folder") return { resolvedKind: "unresolved", path: null, candidates: [], reason: "names need a root, and this folder has none: .git, .slipbox/, .obsidian/ or .zk/ makes one" };
    const r = this.index.resolveWiki(target, fromRel);
    if (r.status === "resolved") return { resolvedKind: "note", path: r.path, candidates: r.candidates, ...(r.how ? { how: r.how } : {}) };
    if (r.status === "ambiguous") return { resolvedKind: "ambiguous", path: null, candidates: r.candidates };
    // A path: out of the root (`../`), or into a root nested in it.
    const byPath = (/^\.\.?\//.test(target) ? this.byFilesystemPath(target, fromRel, true) : null) ?? this.intoNested(target.replace(/^\/+/, ""), true);
    if (byPath) return byPath;
    if (classify(target, this.config.walk.extensions).group !== "note" && /\.[A-Za-z0-9]+$/.test(target)) {
      const att = resolveAttachment(target, fromRel, this.root);
      if (att) return { resolvedKind: "file", path: att, candidates: [], how: "path" };
      // Obsidian finds attachments anywhere in the vault by name.
      const named = this.assets.get(target.split("/").pop()!.normalize("NFC").toLowerCase()) ?? [];
      const suffix = target.normalize("NFC").toLowerCase();
      const hits = named.filter((p) => p.toLowerCase() === suffix || p.toLowerCase().endsWith(`/${suffix}`));
      // Two of a name, as two notes are: the nearest, then the shortest; a real tie ambiguous.
      const r = pickCandidate(hits, target.normalize("NFC"), fromRel);
      if (r.status === "resolved") return { resolvedKind: "file", path: r.path, candidates: r.candidates, ...(r.how ? { how: r.how } : {}) };
      if (r.status === "ambiguous") return { resolvedKind: "ambiguous", path: null, candidates: r.candidates };
    }
    const aliased = this.byAlias(target, fromRel);
    if (aliased) return aliased;
    return this.oldForm(target) ?? { resolvedKind: "unresolved", path: null, candidates: [] };
  }

  /**
   * A file named the old way (20.x's `vault:path`: `research:x.md`, `[[research:x]]`, 21.11) where a
   * folder this machine knows has that name: not a link — said, with the pointer that is one.
   * Null when the part before `:` names no folder (`Meeting: Q3` is a note's name).
   */
  oldForm(target: string): Target | null {
    const m = /^([^:/\s#]+):(?!\/\/)([^#]+)/.exec(target);
    if (!m) return null;
    const [, name, rest] = m as unknown as [string, string, string];
    const l = lookupFolder(name);
    if (l.status === "unknown") return null;
    let suggest: string | undefined;
    if (l.status === "found") {
      // Its file: a path in the folder (`x.md`, extensionless too), else a note's name there.
      const hit = pathLink(join(l.path, rest), join(l.path, "_"), false, undefined, false);
      let rel = hit ? relative(l.path, hit.abs) : null;
      if (!rel) {
        const r = this.reach?.graphAt(l.path)?.resolveLink({ kind: "wiki", target: rest }, "");
        rel = (r?.resolvedKind === "note" || r?.resolvedKind === "file") && r.path ? (isAbsolute(r.path) ? relative(l.path, r.path) : r.path) : null;
      }
      if (rel) suggest = formatPointer({ name: pointerName(l.folder), branch: null, path: rel.split(sep).join("/"), fragment: null });
    }
    const reason = `${name}:${rest} names a folder the old way — not a link${suggest ? `; ${suggest} is (space c a writes it)` : ""}`;
    return { resolvedKind: "unresolved", path: null, candidates: [], reason, ...(suggest ? { suggest } : {}) };
  }

  /** A note by an alias its front matter gives (21.3): never by a previous name. */
  private byAlias(target: string, fromRel: string): Target | null {
    if (target.includes("/")) return null;
    const stem = target.replace(/\.(md|markdown)$/i, "");
    const aliased = this.otherNames().aliases.get(normKey(stem));
    if (!aliased?.length) return null;
    const r = pickCandidate(aliased, stem, fromRel);
    if (r.status === "resolved") return { resolvedKind: "note", path: r.path, candidates: r.candidates, via: "alias", ...(r.how ? { how: r.how } : {}) };
    return { resolvedKind: "ambiguous", path: null, candidates: r.candidates, via: "alias" };
  }

  /**
   * How a wikilink resolved before links were paths (1.4, 17.7, 17.8, 17.12): the note's name or path
   * in this vault; `[[vault:name]]`; an attachment, by its name; a note's alias; its previous name; a
   * move remembered. The converter's legacy reader (20.1, 20.22): nothing else resolves a link by a name.
   */
  resolveLegacyWiki(link: Pick<LinkRef, "kind" | "target">, fromRel: string): Target {
    if (!link.target) return { resolvedKind: "anchor", path: fromRel, candidates: [] };
    const r = this.index.resolveWiki(link.target, fromRel);
    if (r.status === "resolved") return { resolvedKind: "note", path: r.path, candidates: r.candidates };
    if (r.status === "ambiguous") return { resolvedKind: "ambiguous", path: null, candidates: r.candidates };
    const byPath = this.byFilesystemPath(link.target, fromRel, true) ?? this.intoNested(link.target.replace(/^\/+/, ""), true);
    if (byPath) return byPath;
    const inter = VAULT_LINK.exec(link.target);
    if (inter) {
      // This vault by its own name reaches its own notes; another's is looked up.
      if (this.answersTo(inter[1]!)) return this.resolveLegacyWiki({ kind: link.kind, target: inter[2]! }, fromRel);
      const other = this.reach?.wiki(inter[1]!, inter[2]!, this);
      if (other) return other;
      // No folder of that name: a name with a colon (an alias, a previous name) comes first.
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
    if (inter && this.reach) return { resolvedKind: "unresolved", path: null, candidates: [], vault: inter[1]!, reason: `unknown folder "${inter[1]}"` };
    return { resolvedKind: "unresolved", path: null, candidates: [] };
  }

  /** A link's path, from the note at `fromRel` (20.2). */
  private resolvePath(link: Pick<LinkRef, "kind" | "target">, fromRel: string): Target {
    // A `file://` URL or a `~/` path names a file, not a web page (17.16).
    if (/^file:\/\//i.test(link.target) || link.target.startsWith("~/")) {
      const path = /^file:/i.test(link.target) ? link.target : link.target.split("#")[0]!;
      return this.byFilesystemPath(path, fromRel, false) ?? { resolvedKind: "unresolved", path: null, candidates: [] };
    }
    // A pointer into a named folder (21.7): wherever this machine has it.
    if (isPointer(link.target)) return this.byPointer(link.target, fromRel);
    // A folder named the old way (`research:x.md`): no link, but its pointer said (21.11).
    if (!/^(?:https?|mailto|file|ftp|data|tel):/i.test(link.target)) {
      const old = this.oldForm(link.target);
      if (old) return old;
    }
    // This repository's hosting (a README's `https://github.com/me/repo/blob/main/x.md`): the file here.
    if (/^https?:\/\//i.test(link.target)) {
      const hosted = this.byHosting(link.target, fromRel);
      if (hosted) return hosted;
    }
    // `/` from the nearest root, every file's (21.2): this graph's root — a plain folder opened has
    // none, and there it's the filesystem's path alone.
    const m: MdLinkTarget = resolveMarkdownUrl(link.target, fromRel, this.root, this.index, this.loc.mode !== "folder");
    if ((m.kind === "file" || m.kind === "folder" || m.kind === "missing") && !m.target.startsWith("../") && !m.target.startsWith("/")) {
      // Into a vault nested in this one: its note, there (17.17).
      const nested = this.intoNested(m.target, false);
      if (nested) return nested;
    }
    // A path that reaches nothing is broken, whatever moved (20.2): a move is evidence for a fix
    // (`movedTo`, the relink), never a way to resolve.
    if (m.kind === "missing") {
      // A path out of this root (17.9), or the filesystem's own `/…` (20.2): the file wherever it
      // is, in whichever root holds it.
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
      case "folder":
        return { resolvedKind: "folder", path: m.target, candidates: [] };
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
    // From the linking note; with none (a lookup), from the vault's root. In a linked worktree, a
    // relative path out of its checkout is taken from the main checkout (17.19): `../y/plan.md`
    // means the sibling repository beside the main one, wherever the worktree is kept.
    const wt = this.loc.worktree;
    const hit = pathLink(target, join(this.root, fromRel || "_"), wiki, wt?.main ? { from: wt.checkout, to: wt.main } : undefined, true);
    if (!hit) return null;
    const rel = relative(this.root, hit.abs);
    const inside = !rel.startsWith("..") && !isAbsolute(rel);
    if (hit.folder) return { resolvedKind: "folder", path: inside ? rel || "." : hit.abs, candidates: [], ...(inside ? {} : { vault: this.reach?.vaultOf(hit.abs) ?? null }) };
    if (inside) {
      if (this.notes.has(rel)) return { resolvedKind: "note", path: rel, candidates: [rel] };
      if (this.known(rel)) return { resolvedKind: "file", path: rel, candidates: [rel] };
    }
    return { resolvedKind: classify(hit.abs, this.config.walk.extensions).group === "note" ? "note" : "file", path: hit.abs, candidates: [], vault: this.reach?.vaultOf(hit.abs) ?? null };
  }

  /**
   * A `slipbox://` pointer (21.7): its folder's copy here (21.6), the file in it as a path link finds
   * one (no extension, a folder); in this root, its note or file like any link's (a backlink too).
   * A branch not checked out here: the file as git has it there, read-only. Else why not.
   */
  private byPointer(target: string, fromRel: string): Target {
    const p = parsePointer(target);
    if (!p) return { resolvedKind: "unresolved", path: null, candidates: [] };
    const t = resolvePointer(p);
    if (t.status === "ambiguous") return { resolvedKind: "ambiguous", path: null, candidates: t.candidates, reason: t.reason };
    if (t.status === "unresolved") return { resolvedKind: "unresolved", path: null, candidates: [], reason: t.reason };
    if (t.status === "branch") {
      const kind = classify(t.rel, this.config.walk.extensions).group === "note" ? "note" : "file";
      return { resolvedKind: kind, path: join(t.root, t.rel), candidates: [], vault: t.folder.name, gitRef: { root: t.root, rel: t.rel, branch: t.branch } };
    }
    const hit = pathLink(t.abs, join(this.root, fromRel || "_"), false, undefined, true);
    const via = t.via ? { via: t.via } : {};
    if (!hit) return { resolvedKind: "unresolved", path: null, candidates: [], reason: `no ${p.path || "folder"} in ${p.name}${p.branch ? `@${p.branch}` : ""}`, ...via };
    const rel = relative(this.root, hit.abs);
    const inside = !rel.startsWith("..") && !isAbsolute(rel);
    if (hit.folder) return { resolvedKind: "folder", path: inside ? rel || "." : hit.abs, candidates: [], ...(inside ? {} : { vault: t.folder.name }), ...via };
    if (inside && this.notes.has(rel)) return { resolvedKind: "note", path: rel, candidates: [rel], ...via };
    if (inside && this.known(rel)) return { resolvedKind: "file", path: rel, candidates: [rel], ...via };
    return { resolvedKind: classify(hit.abs, this.config.walk.extensions).group === "note" ? "note" : "file", path: hit.abs, candidates: [], vault: t.folder.name, ...via };
  }

  private remotesCache: string[] | null = null;

  /** This checkout's remotes (`host/path`, lower case): what a hosting URL to it names. */
  private ownRemotes(): string[] {
    if (this.remotesCache) return this.remotesCache;
    const c = checkoutOf(this.root);
    let config = "";
    try {
      if (c) config = readRegular(join(c.common, "config"), SMALL_FILE).toString("utf8");
    } catch {}
    this.remotesCache = c ? remotesIn(config, c.main ?? c.root).map((r) => r.toLowerCase()) : [];
    return this.remotesCache;
  }

  /**
   * A link to a repository's hosting (`hosting.ts`): this checkout's own remote, or a named folder's
   * (21.6) — the file in this copy, a note, file or folder like any link's (a backlink too). Another
   * ref than the branch checked out is kept, to be said. Null when it isn't one, or names none here.
   */
  private byHosting(url: string, fromRel: string): Target | null {
    const h = parseHosted(url);
    if (!h) return null;
    const own = checkoutOf(this.root);
    let top: string | null = own && this.ownRemotes().includes(h.remote.toLowerCase()) ? own.root : null;
    if (!top) {
      const l = lookupFolder(h.remote);
      if (l.status === "found") top = checkoutOf(l.path)?.root ?? l.path;
    }
    if (!top) return null;
    const c = checkoutOf(top);
    let ref = h.ref;
    let path = h.path;
    // A branch with a `/` (`feature/x`): the longest the repository has, the rest the path.
    if (ref && c && path && !existsSync(join(top, path))) {
      const branches = new Set(branchesOf(c) ?? []);
      const segs = path.split("/");
      for (let k = segs.length - 1; k >= 1; k--) {
        if (branches.has([ref, ...segs.slice(0, k)].join("/"))) {
          ref = [ref, ...segs.slice(0, k)].join("/");
          path = segs.slice(k).join("/");
          break;
        }
      }
    }
    if (!path && !h.folder) path = readmeAt(top) ?? "";
    const branch = c ? headOf(c).branch : null;
    const other = ref && ref !== "HEAD" && ref !== branch && !(branch === null && c && headOf(c).commit?.startsWith(ref)) ? { hosted: { ref, branch } } : {};
    const abs = join(top, path);
    const hit = pathLink(abs, join(this.root, fromRel || "_"), false, undefined, true);
    if (!hit) return { resolvedKind: "unresolved", path: null, candidates: [], reason: `no ${path || "folder"} in this copy of ${h.remote}`, via: "hosting", ...other };
    const rel = relative(this.root, hit.abs);
    const inside = !rel.startsWith("..") && !isAbsolute(rel);
    const at = (kind: "note" | "file" | "folder", p: string): Target => ({ resolvedKind: kind, path: p, candidates: [], via: "hosting", ...other });
    if (hit.folder) return at("folder", inside ? rel || "." : hit.abs);
    if (inside && this.notes.has(rel)) return at("note", rel);
    if (inside && this.known(rel)) return at("file", rel);
    return at(classify(hit.abs, this.config.walk.extensions).group === "note" ? "note" : "file", hit.abs);
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
    const candidates = wiki ? wikiPathCandidates(abs) : [abs];
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

  /**
   * Where a broken path link's file went, when a move of it was seen (17.12): evidence for a fix —
   * the relink, a problem saying so — never a way to resolve it (20.2). Null when it isn't broken,
   * isn't a vault path, or no move of it is known.
   */
  movedTarget(link: Pick<LinkRef, "kind" | "target">, fromRel: string): string | null {
    const wiki = link.kind === "wiki" || link.kind === "embed";
    const rel = wiki ? this.brokenWikiPath(link, fromRel) : this.brokenPath(link, fromRel);
    if (rel === null) return null;
    // Written without its extension (21.2): the note's move counts — a wikilink's whatever its name's dots.
    return this.movedTo(rel) ?? (extensionless(rel) || (wiki && !/\.(md|markdown)$/i.test(rel)) ? this.movedTo(`${rel}.md`) : null);
  }

  /**
   * A broken wikilink's path in this root, as `brokenPath` for a markdown link's: one written as a
   * path (`[[docs/plan]]` from the root, `[[../plan]]` from the note) — a name alone stays a name,
   * which no move resolves (20.2). Null in a plain folder, which reads no wikilink.
   */
  private brokenWikiPath(link: Pick<LinkRef, "kind" | "target">, fromRel: string): string | null {
    const t = link.target.trim();
    if (this.loc.mode === "folder" || !t.includes("/") || /^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith("~/")) return null;
    if (this.resolveLink(link, fromRel).resolvedKind !== "unresolved") return null;
    const rel = /^\.\.?\//.test(t) ? posix.normalize(posix.join(posix.dirname(fromRel), t)) : posix.normalize(t.replace(/^\/+/, ""));
    return rel === ".." || rel.startsWith("../") ? null : rel;
  }

  /**
   * The note a broken path link names, not written yet (vault-relative): what following it offers to
   * make, and a problem calls information rather than a warning (as a wikilink's was). Null when it
   * isn't broken, isn't a note's path in this vault, or its note was seen to move (`movedTarget`).
   */
  missingNote(link: Pick<LinkRef, "kind" | "target">, fromRel: string): string | null {
    const rel = this.brokenPath(link, fromRel);
    if (rel === null || rel.endsWith("/") || this.movedTo(rel)) return null;
    // Written without an extension (21.2): the note it reads as, `plan.md`.
    const note = extensionless(rel) ? `${rel}.md` : rel;
    return /\.(md|markdown)$/i.test(note) && !this.movedTo(note) ? note : null;
  }

  /** A broken link's path in this vault (vault-relative, decoded): null for one that resolves, or isn't a vault path. */
  private brokenPath(link: Pick<LinkRef, "kind" | "target">, fromRel: string): string | null {
    if (link.kind !== "markdown" && link.kind !== "image") return null;
    if (this.resolveLink(link, fromRel).resolvedKind !== "unresolved") return null;
    const path = link.target.split("#")[0]!;
    if (!path || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("~/")) return null;
    // `/…` from the root (21.2); with none (a plain folder), the filesystem's: not a path in it.
    if (path.startsWith("/") && this.loc.mode === "folder") return null;
    let decoded = path;
    try {
      decoded = decodeURIComponent(path);
    } catch {}
    // A `/…` naming no folder of the root is a filesystem path that isn't there (an unplugged
    // drive's), not a place in the root.
    if (decoded.startsWith("/") && decoded.slice(1).includes("/") && !existsSync(join(this.root, decoded.slice(1).split("/")[0]!))) return null;
    const rel = decoded.startsWith("/") ? posix.normalize(decoded.slice(1)) : posix.normalize(posix.join(posix.dirname(fromRel), decoded));
    return rel === ".." || rel.startsWith("../") ? null : rel;
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
          fragileLinks.push({ from: rel, line: l.line, column: l.column, end: l.end, kind: l.kind, target: l.target, text: l.text, reason: describeLanding(l), candidates: l.candidates, fix: disambiguated(l, rel) });
          continue;
        }
        if (l.resolvedKind !== "unresolved" && l.resolvedKind !== "ambiguous") continue;
        // A broken path whose file was seen to move (17.12, git's renames 20.21): where it went, for the fix.
        const moved = l.resolvedKind === "unresolved" ? this.movedTarget(l, rel) : null;
        const p: LinkProblem = { from: rel, line: l.line, column: l.column, end: l.end, kind: l.kind, target: l.target, text: l.text, reason: l.reason ?? (moved ? `moved to ${moved} — relink fixes it` : null), candidates: l.candidates, moved };
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
      const sources: [string, LinkRef[]][] = [...[...this.notes].map(([from, note]) => [from, note.links] as [string, LinkRef[]]), ...this.linkingFiles().map((f) => [f, this.fileLinksOf(f)] as [string, LinkRef[]])];
      for (const [from, links] of sources) {
        for (const l of links) {
          // An image's link counts too: the notes that show a picture are its backlinks (and a
          // rename or move of it fixes them, 18.3).
          // A folder's links too, by its path (21.2): a move of the folder rewrites them.
          const r = this.resolveLink(l, from);
          if ((r.resolvedKind !== "note" && r.resolvedKind !== "file" && r.resolvedKind !== "folder") || !r.path || r.path === from || isAbsolute(r.path)) continue;
          const list = map.get(r.path) ?? [];
          list.push({ from, line: l.line, column: l.column, end: l.end, text: l.text, kind: l.kind, target: l.target, heading: l.heading, block: l.block, alias: l.alias });
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
  known(rel: string): boolean {
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
        .map((l) => ({ kind: "markdown", target: l.target, heading: null, block: null, alias: null, text: l.key, line: l.line, column: 1, end: { line: l.line, column: 1 } }));
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
      out.push({ kind: "markdown", target, heading: null, block: null, alias: null, text: lines[l.line - 1]!.slice(l.from, l.to), line: l.line, column: l.from + 1, end: { line: l.line, column: l.to + 1 } });
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
export function extractNote(file: NoteFile, cache: ParseCache | null = sharedParseCache(), chunks?: ChunkCache): NoteEntry {
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
    return extractFromSource(file, text, flags);
  }
  return extractText(file, text, flags, cache, chunks);
}

/** A note's text parsed, from the parse cache when any copy parsed it before (20.11): a file's, or git's (20.21). */
export function extractText(file: NoteFile, text: string, flags: string[] = [], cache: ParseCache | null = sharedParseCache(), chunks?: ChunkCache): NoteEntry {
  // Parsed before, by any copy of it on this machine (20.11): its content as it was, its place its own.
  const hash = contentHash(text);
  const key = ParseCache.key(hash, noteFormat(file.rel), INDEX_VERSION);
  const hit = cache?.get(key);
  if (hit) {
    return {
      rel: file.rel,
      title: hit.title ?? fileTitle(file.rel),
      headings: hit.headings as HeadingInfo[],
      anchors: (hit.anchors ?? []) as AnchorInfo[],
      links: hit.links as LinkRef[],
      tags: hit.tags,
      aliases: hit.aliases,
      previous: hit.previous,
      hash,
      mtimeMs: file.mtimeMs,
      size: file.size,
      flags,
    };
  }
  const e = extractFromSource(file, text, flags, chunks);
  cache?.put(key, { title: ownTitle.get(e) ? e.title : null, headings: e.headings, anchors: e.anchors ?? [], links: e.links, tags: e.tags, aliases: e.aliases, previous: e.previous });
  return e;
}

/** The wikilinks in a front matter's text (its lines from the note's second), each at its line and column; a YAML comment's aren't. */
export function frontmatterLinks(raw: string): LinkRef[] {
  const out: LinkRef[] = [];
  raw.split("\n").forEach((line, i) => {
    const text = line.slice(0, yamlCommentAt(line));
    for (const m of text.matchAll(/(!?)\[\[([^[\]\n]+)\]\]/g)) {
      const w = parseWikiTarget(m[2]!);
      if (!w.target && !w.heading && !w.block) continue;
      const column = m.index! + 1;
      out.push({ kind: m[1] ? "embed" : "wiki", target: w.target, heading: w.heading, block: w.block, alias: w.alias, text: w.alias ?? w.target, line: i + 2, column, end: { line: i + 2, column: column + m[0].length } });
    }
  });
  return out;
}

/**
 * Where a YAML line's comment starts (its length when it has none): the first `#` outside a quoted
 * scalar, at the line's start or after whitespace — so `[[Plan#Goals]]`'s `#` is no comment.
 */
function yamlCommentAt(line: string): number {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quote === '"') {
      if (c === "\\") i++;
      else if (c === '"') quote = null;
    } else if (quote === "'") {
      if (c === "'" && line[i + 1] === "'") i++;
      else if (c === "'") quote = null;
    } else if ((c === '"' || c === "'") && (i === 0 || /[\s[{,]/.test(line[i - 1]!))) quote = c; // a quoted scalar's start, not `Bob's`
    else if (c === "#" && (i === 0 || /\s/.test(line[i - 1]!))) return i;
  }
  return line.length;
}

/** A note's title from its file's name: what stands in when it has none of its own. */
function fileTitle(rel: string): string {
  return basename(rel).replace(/\.(md|markdown)$/i, "");
}

/** Whether an entry's title is its own (frontmatter, a `#` heading), not its file's name. */
const ownTitle = new WeakMap<NoteEntry, boolean>();

export function extractFromSource(file: NoteFile, text: string, flags: string[] = [], chunks?: ChunkCache): NoteEntry {
  const parsed = parseNoteFile(file.rel, text, chunks);
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
    const end = n.position?.end ?? { line, column };
    switch (n.type) {
      case "link":
        links.push(mdLink("markdown", n.url, plain(n), line, column, end));
        return;
      case "linkReference": {
        const url = definitions.get(n.identifier.toLowerCase());
        if (url) links.push(mdLink("markdown", url, plain(n), line, column, end));
        return;
      }
      case "image":
        links.push(mdLink("image", n.url, n.alt ?? "", line, column, end));
        return;
    }
    // A wikilink or an embed (21.3): read within the note's root.
    if ((n.type as string) === "wikiLink") {
      const w = n as unknown as WikiLink;
      links.push({ kind: w.embed ? "embed" : "wiki", target: w.target, heading: w.heading, block: w.block, alias: w.alias, text: w.alias ?? w.value, line, column, end: { line: end.line, column: end.column } });
    }
  });
  // Wikilinks in the front matter's values (Obsidian's properties: `related: "[[Plan]]"`), each where
  // it's written — read, backlinked and renamed as the text's are; not in a comment. First: they come first.
  const fmRaw = parsed.frontmatter?.raw;
  if (fmRaw) links.unshift(...frontmatterLinks(fmRaw));
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
  const own = noteTitle(parsed, "");
  const entry: NoteEntry = {
    rel: file.rel,
    title: own || fileTitle(file.rel),
    headings: headingsOf(parsed.tree),
    anchors: anchorsOf(parsed.tree),
    links,
    tags,
    aliases: names(fm?.aliases ?? fm?.alias),
    previous: names(fm?.previous_names),
    hash: contentHash(text),
    mtimeMs: file.mtimeMs,
    size: file.size,
    flags,
  };
  ownTitle.set(entry, !!own);
  return entry;
}

function mdLink(kind: LinkKind, url: string, text: string, line: number, column: number, end: Pos): LinkRef {
  return { kind, target: url, heading: null, block: null, alias: null, text, line, column, end: { line: end.line, column: end.column } };
}

function plain(n: Nodes): string {
  const parts: string[] = [];
  visit(n, (c) => {
    if (c.type === "text" || c.type === "inlineCode") parts.push(c.value);
    else if (c.type === "inlineMath") parts.push(`$${c.value}$`); // as written (12.11)
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
