// The vault graph: notes, their outgoing links, backlinks, and the persisted index (1.9).
//
// One pass over the vault extracts per-note facts (title, headings, links). Resolution happens at
// query time against the LinkIndex, so adding or removing a note never leaves stale answers.
// The CLI reads a fresh cache instead of reparsing every note on every agent call (9.4).

import { statSync } from "node:fs";
import { commentLinks, grammar, grammarFor, grammarNow, linkTokens, parseSyntax, type Grammar } from "./syntax.ts";
import { basename, join, posix } from "node:path";
import type { Definition, Nodes } from "mdast";
import type { Config } from "./config.ts";
import { ensureDir, readJson, readText, writeJson } from "./fsutil.ts";
import { LinkIndex, type MdLinkTarget, type Resolution, resolveAttachment, resolveMarkdownUrl } from "./links.ts";
import { type HeadingInfo, headingsOf, noteTitle, visit } from "./parse.ts";
import { parseNoteFile } from "./readers.ts";
import { cacheDir } from "./paths.ts";
import { dataLinks, parseData } from "./data.ts";
import { classify, extensionOf } from "./filetypes.ts";
import type { VaultLocation } from "./vault.ts";
import { listDirectory, type NoteFile, type Skipped, WalkFilter, walkVault } from "./walk.ts";
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
  mtimeMs: number;
  size: number;
  flags: string[];
}

export interface ResolvedLink extends LinkRef {
  /** note: a vault note; file: an attachment; external: a URL; anchor: within this note. */
  resolvedKind: "note" | "file" | "external" | "anchor" | "unresolved" | "ambiguous";
  path: string | null;
  candidates: string[];
}

export interface Backlink {
  from: string;
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

/** Bumped when what a note's entry holds changes: 3, readers per note format (16.2, 16.16, 16.17). */
const INDEX_VERSION = 3;

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
  private readonly dataLinkCache = new Map<string, { stamp: string; links: LinkRef[] }>();

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
    const walk = this.loc.mode === "vault" ? walkVault(this.root, this.filter) : listDirectory(this.root, this.filter);
    this.dirs = walk.dirs;
    this.assets.clear();
    for (const a of walk.assets) this.addAsset(a);
    this.skipped = walk.skipped;
    this.errors = walk.errors;
    this.useCache = useCache && this.loc.mode === "vault";
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
    this.backlinkCache = null;
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
    return join(cacheDir(this.root), "index.json");
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
      ensureDir(cacheDir(this.root));
      writeJson(this.cachePath, { version: INDEX_VERSION, entries } satisfies IndexFile);
    } catch (err) {
      this.errors.push(`cache: ${(err as Error).message}`);
    }
  }

  /** Incremental single-file update (1.8). Returns false when the file is not part of the vault. */
  updateFile(rel: string, file: NoteFile): boolean {
    const isNew = !this.notes.has(rel);
    this.unparsed.delete(rel);
    this.cacheDirty = true;
    this.notes.set(rel, extractNote(file));
    if (isNew) this.index.add(rel);
    this.backlinkCache = null;
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
    this.dataLinkCache.clear(); // a path in a data file or a comment may resolve now
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
    return true;
  }

  removeFile(rel: string): void {
    this.unparsed.delete(rel);
    if (!this.notes.delete(rel)) return;
    this.cacheDirty = true;
    this.index.remove(rel);
    this.backlinkCache = null;
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

  resolveLink(link: Pick<LinkRef, "kind" | "target">, fromRel: string): Omit<ResolvedLink, keyof LinkRef> {
    if (link.kind === "wiki" || link.kind === "embed") {
      if (!link.target) return { resolvedKind: "anchor", path: fromRel, candidates: [] };
      const r = this.index.resolveWiki(link.target, fromRel);
      if (r.status === "resolved") return { resolvedKind: "note", path: r.path, candidates: r.candidates };
      if (r.status === "ambiguous") return { resolvedKind: "ambiguous", path: null, candidates: r.candidates };
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
      return { resolvedKind: "unresolved", path: null, candidates: [] };
    }
    const m: MdLinkTarget = resolveMarkdownUrl(link.target, fromRel, this.root, this.index);
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

  linksOf(rel: string): ResolvedLink[] {
    const note = this.entry(rel);
    const links = note ? note.links : this.fileLinksOf(rel);
    return links.map((l) => ({ ...l, ...this.resolveLink(l, rel) }));
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
          if (l.kind === "image") continue;
          const r = this.resolveLink(l, from);
          if ((r.resolvedKind !== "note" && r.resolvedKind !== "file") || !r.path || r.path === from) continue;
          const list = map.get(r.path) ?? [];
          list.push({ from, line: l.line, column: l.column, text: l.text, kind: l.kind, target: l.target, heading: l.heading, block: l.block, alias: l.alias });
          map.set(r.path, list);
        }
      }
      this.backlinkCache = map;
    }
    return this.backlinkCache.get(rel) ?? [];
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
  }

  /** A grammar finished loading: code files' links can be read now (the TUI hears of it). */
  grammarsChanged(): void {
    this.backlinkCache = null;
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
  }
}

export function openGraph(loc: VaultLocation, config: Config, useCache = true, parse: "all" | "lazy" = "all"): Graph {
  return new Graph(loc, config).build(useCache, parse);
}

function isUnreadable(e: NoteEntry): boolean {
  return e.flags.some((f) => f.startsWith("unreadable"));
}

function stub(f: NoteFile): NoteEntry {
  return { rel: f.rel, title: basename(f.rel).replace(/\.(md|markdown)$/i, ""), headings: [], links: [], tags: [], mtimeMs: f.mtimeMs, size: f.size, flags: ["unparsed"] };
}

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
  const definitions = new Map<string, string>();
  visit(parsed.tree, (n) => {
    if (n.type === "definition") definitions.set((n as Definition).identifier.toLowerCase(), (n as Definition).url);
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
  const tags = normaliseTags(fm?.tags ?? fm?.tag);
  return {
    rel: file.rel,
    title: noteTitle(parsed, basename(file.rel)),
    headings: headingsOf(parsed.tree),
    links,
    tags,
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

function normaliseTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((t) => String(t).replace(/^#/, "")).filter(Boolean);
  if (typeof v === "string") return v.split(/[,\s]+/).map((t) => t.replace(/^#/, "")).filter(Boolean);
  return [];
}
