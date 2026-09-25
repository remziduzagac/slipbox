// The vault graph: notes, their outgoing links, backlinks, and the persisted index (1.9).
//
// One pass over the vault extracts per-note facts (title, headings, links). Resolution happens at
// query time against the LinkIndex, so adding or removing a note never leaves stale answers.
// The CLI reads a fresh cache instead of reparsing every note on every agent call (9.4).

import { statSync } from "node:fs";
import { basename, join } from "node:path";
import type { Definition, Nodes } from "mdast";
import type { Config } from "./config.ts";
import { ensureDir, readJson, readText, writeJson } from "./fsutil.ts";
import { isNotePath, LinkIndex, type MdLinkTarget, type Resolution, resolveAttachment, resolveMarkdownUrl } from "./links.ts";
import { type HeadingInfo, headingsOf, noteTitle, parseMarkdown, visit } from "./parse.ts";
import { cacheDir } from "./paths.ts";
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
}

const INDEX_VERSION = 2;

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

  addAsset(rel: string): void {
    const key = rel.slice(rel.lastIndexOf("/") + 1).normalize("NFC").toLowerCase();
    const list = this.assets.get(key);
    if (!list) this.assets.set(key, [rel]);
    else if (!list.includes(rel)) list.push(rel);
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
    const asAbs = join(cwd, cleaned).startsWith(this.root) ? join(cwd, cleaned).slice(this.root.length + 1) : null;
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
      if (!isNotePath(link.target) && /\.[A-Za-z0-9]+$/.test(link.target)) {
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
    if (!note) return [];
    return note.links.map((l) => ({ ...l, ...this.resolveLink(l, rel) }));
  }

  backlinks(rel: string): Backlink[] {
    this.ensureAll();
    if (!this.backlinkCache) {
      const map = new Map<string, Backlink[]>();
      for (const [from, note] of this.notes) {
        for (const l of note.links) {
          if (l.kind === "image") continue;
          const r = this.resolveLink(l, from);
          if (r.resolvedKind !== "note" || !r.path || r.path === from) continue;
          const list = map.get(r.path) ?? [];
          list.push({ from, line: l.line, column: l.column, text: l.text });
          map.set(r.path, list);
        }
      }
      this.backlinkCache = map;
    }
    return this.backlinkCache.get(rel) ?? [];
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
  const parsed = parseMarkdown(text);
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
