// Searching the vault (6.x): ranked by words — the index when it's there and current (SQLite FTS5,
// `search-index.ts`), else a scan of the files with the same query and a BM25-like score, so a
// search always answers. (`find` stays the other tool: every match of a literal or a regex.)
//
// A search's words are a note's: every word somewhere in it (else, said so, some of them). The
// hit opens at the section with most of them — its first line with one — and shows that line.
// A note is read for search by a quick pass over its lines, not the markdown parser: frontmatter,
// headings outside code, tags and its text as written — the tokenizer skips the markup, and a
// vault of thousands of notes indexes in seconds.

import { statSync } from "node:fs";
import { basename } from "node:path";
import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";
import { classify } from "./filetypes.ts";
import { readText } from "./fsutil.ts";
import type { Graph } from "./graph.ts";
import { SearchIndex, WEIGHTS } from "./search-index.ts";
import { tagName, tagsInLine } from "./tags.ts";

// -------------------------------------------------------------------------------------------
// What's read

/** Data and text files are cut into sections of this many lines (a match lands near its line). */
const FILE_SECTION = 80;
/** Frontmatter bigger than this isn't read for a title, aliases and tags. */
const MAX_FRONTMATTER = 64 * 1024;

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const SETEXT = /^ {0,3}(?:=+|-{2,})[ \t]*$/;
/** A line a setext underline can't make a heading of: blank, a list item, a quote, a heading, a fence. */
const NOT_PARAGRAPH = /^\s*$|^ {0,3}(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)|^ {0,3}>|^ {0,3}#|^ {0,3}(?:`{3,}|~{3,})|^ {4}/;

/** The strings a frontmatter value holds: a list, or one string (split on commas for tags). */
function strings(v: unknown, split = false): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string" || typeof x === "number").map(String);
  if (typeof v === "string") return split ? v.split(/[,\s]+/).filter(Boolean) : [v];
  return [];
}

/** A section of a file: from a heading to the next (a data file's: 80 lines). */
export interface DocSection {
  line: number;
  heading: string;
  text: string;
}

/** What search reads of a file: its title, aliases and tags, and its sections. */
export interface Doc {
  title: string;
  aliases: string[];
  tags: string[];
  sections: DocSection[];
}

/**
 * A file read for search: a note's title, aliases and tags, and its sections — cut at its headings
 * (ATX, and setext under a paragraph line), never inside fenced code; its frontmatter is its first
 * section's text (its values are searchable). Other text is cut every 80 lines.
 */
export function indexDoc(rel: string, text: string, group: "note" | "data" | "text"): Doc {
  const lines = text.split(/\r?\n/);
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  const name = basename(rel).replace(/\.[^.]+$/, "");
  if (group !== "note") {
    const sections: DocSection[] = [];
    for (let i = 0; i < lines.length; i += FILE_SECTION) sections.push({ line: i + 1, heading: "", text: lines.slice(i, i + FILE_SECTION).join("\n") });
    return { title: basename(rel), aliases: [], tags: [], sections };
  }
  let fm: Record<string, unknown> | null = null;
  let body = 0;
  if (lines[0] === "---" || lines[0] === "+++") {
    const close = lines[0] === "---" ? /^(?:---|\.\.\.)\s*$/ : /^\+\+\+\s*$/;
    const end = lines.findIndex((l, k) => k > 0 && close.test(l));
    if (end > 0) {
      body = end + 1;
      const raw = lines.slice(1, end).join("\n");
      if (raw.length <= MAX_FRONTMATTER) {
        try {
          const v = lines[0] === "---" ? parseYaml(raw, { logLevel: "error", uniqueKeys: false }) : parseToml(raw);
          if (v && typeof v === "object" && !Array.isArray(v)) fm = v as Record<string, unknown>;
        } catch {}
      }
    }
  }
  const tags = new Set<string>();
  for (const t of strings(fm?.tags, true)) {
    const n = tagName(t);
    if (n) tags.add(n);
  }
  let title = typeof fm?.title === "string" && fm.title.trim() ? fm.title.trim() : "";
  const sections: DocSection[] = [];
  let cur: { line: number; heading: string; lines: string[] } = { line: 1, heading: "", lines: lines.slice(0, body) };
  const flush = () => {
    if (cur.heading || cur.lines.some((l) => l.trim())) sections.push({ line: cur.line, heading: cur.heading, text: cur.lines.join("\n") });
  };
  let fence: string | null = null;
  for (let i = body; i < lines.length; i++) {
    const line = lines[i]!;
    const f = FENCE.exec(line);
    if (fence) {
      if (f && f[1]![0] === fence[0] && f[1]!.length >= fence.length && !line.slice(f[0].length).trim()) fence = null;
      cur.lines.push(line);
      continue;
    }
    if (f) {
      fence = f[1]!;
      cur.lines.push(line);
      continue;
    }
    const atx = ATX.exec(line);
    if (atx) {
      flush();
      const heading = (atx[2] ?? "").trim();
      if (!title && atx[1] === "#" && heading) title = heading;
      cur = { line: i + 1, heading, lines: [line] };
      continue;
    }
    // A setext underline: the paragraph line above it is the heading.
    if (SETEXT.test(line) && cur.lines.length && i - 1 >= body && !NOT_PARAGRAPH.test(lines[i - 1]!) && cur.line !== i) {
      const above = cur.lines.pop()!;
      flush();
      if (!title && line.trim().startsWith("=")) title = above.trim();
      cur = { line: i, heading: above.trim(), lines: [above, line] };
      continue;
    }
    for (const t of tagsInLine(line)) tags.add(t.name);
    cur.lines.push(line);
  }
  flush();
  return { title: title || name, aliases: [...strings(fm?.aliases), ...strings(fm?.alias)], tags: [...tags], sections };
}

/** The files search reads, as the walk last saw them: notes and data files. */
export function searchable(g: Graph): Map<string, { size: number; mtime: number; group: "note" | "data" }> {
  const out = new Map<string, { size: number; mtime: number; group: "note" | "data" }>();
  for (const [rel, e] of g.notes) out.set(rel, { size: e.size, mtime: e.mtimeMs, group: "note" });
  for (const rel of g.filePaths()) {
    if (classify(rel, g.config.walk.extensions).group !== "data") continue;
    try {
      const st = statSync(g.abs(rel));
      out.set(rel, { size: st.size, mtime: st.mtimeMs, group: "data" });
    } catch {}
  }
  return out;
}

// -------------------------------------------------------------------------------------------
// Keeping the index

/**
 * One file (re)indexed from disk — a change the vault's feed reported — or taken out when it's
 * gone, or no longer a note or data file of the vault. `group`: what it is, when the caller knows.
 */
export function indexFile(g: Graph, idx: SearchIndex, rel: string, group?: "note" | "data"): void {
  let kind = group;
  if (!kind) {
    const k = classify(rel, g.config.walk.extensions).group;
    kind = k === "note" && g.notes.has(rel) ? "note" : k === "data" && g.filePaths().includes(rel) ? "data" : undefined;
  }
  let st: { size: number; mtimeMs: number } | null = null;
  try {
    st = statSync(g.abs(rel));
  } catch {}
  if (!kind || !st) return idx.remove(rel);
  try {
    const text = readText(g.abs(rel)).text;
    const d = indexDoc(rel, text, kind);
    idx.put(rel, { group: kind, title: d.title, aliases: d.aliases, tags: d.tags, headings: d.sections.map((x) => x.heading).filter(Boolean), body: text }, { size: st.size, mtime: st.mtimeMs });
  } catch {
    idx.remove(rel);
  }
}

/**
 * Bringing the index up to the vault: what's gone taken out, what's new or changed (by size and
 * mtime) indexed — worked through in steps (the TUI's idle slices), or at once (`catchUp`). Done
 * the first time, the index is complete: searches use it from then on.
 */
export class IndexJob {
  readonly todo: [string, "note" | "data"][];
  readonly removed: number;
  indexed = 0;

  constructor(
    private readonly g: Graph,
    private readonly idx: SearchIndex,
  ) {
    const want = searchable(g);
    const have = idx.indexed();
    const gone = [...have.keys()].filter((p) => !want.has(p));
    idx.batch(() => {
      for (const p of gone) idx.remove(p);
    });
    this.removed = gone.length;
    this.todo = [...want]
      .filter(([p, s]) => {
        const h = have.get(p);
        return !h || h.size !== s.size || h.mtime !== s.mtime;
      })
      .map(([p, s]) => [p, s.group]);
  }

  get done(): boolean {
    return this.indexed >= this.todo.length;
  }

  /** Index some more, for about `budgetMs` (a hundred files at a time); true when it's all done. */
  step(budgetMs = Number.POSITIVE_INFINITY): boolean {
    const start = performance.now();
    while (!this.done && performance.now() - start < budgetMs) {
      const batch = this.todo.slice(this.indexed, this.indexed + 100);
      this.idx.batch(() => {
        for (const [p, group] of batch) indexFile(this.g, this.idx, p, group);
      });
      this.indexed += batch.length;
    }
    if (this.done && !this.idx.complete) this.idx.markComplete();
    return this.done;
  }
}

/** The index brought up to the vault, at once. */
export function catchUp(g: Graph, idx: SearchIndex): { indexed: number; removed: number } {
  const job = new IndexJob(g, idx);
  job.step();
  return { indexed: job.indexed, removed: job.removed };
}

// -------------------------------------------------------------------------------------------
// The query

export interface QueryTerm {
  text: string;
  /** Written in quotes: its words together, in order. */
  phrase: boolean;
  /** `word*`: words starting so. */
  prefix: boolean;
  /** `-word`: notes with it are left out. */
  not: boolean;
  /** `title:word`: in the note's title (or an alias). */
  title: boolean;
}

export interface SearchQuery {
  terms: QueryTerm[];
  /** `#tag`, `tag:x`: notes carrying it (or a tag nested under it). */
  tags: string[];
  /** `path:folder/`: files whose path starts so. */
  paths: string[];
}

const WORDY = /[\p{L}\p{N}]/u;

/**
 * Words (all of them, by default), "phrases", prefix*, -not, title:word, and the filters #tag,
 * tag:x and path:folder/. Nothing in it is FTS5 syntax: every term is quoted when it's passed on.
 */
export function parseQuery(input: string): SearchQuery {
  const q: SearchQuery = { terms: [], tags: [], paths: [] };
  for (const m of input.matchAll(/(-?)(?:(tag|path|title):)?(?:"([^"]*)"?|(\S+))/g)) {
    const not = m[1] === "-";
    const field = m[2];
    const quoted = m[3] !== undefined;
    let text = (quoted ? m[3] : m[4]) ?? "";
    if (field === "tag" || (!field && !quoted && !not && text.startsWith("#"))) {
      const t = tagName(text);
      if (t) q.tags.push(t.toLowerCase());
      continue;
    }
    if (field === "path") {
      const p = text.replace(/^\.?\//, "");
      if (p) q.paths.push(p);
      continue;
    }
    const prefix = !quoted && text.length > 1 && text.endsWith("*");
    if (prefix) text = text.slice(0, -1);
    if (!WORDY.test(text)) continue;
    q.terms.push({ text, phrase: quoted, prefix, not, title: field === "title" });
  }
  return q;
}

/** The query for FTS5: each term quoted; all the positive ones (or any, `relaxed`), none of the rest. */
export function ftsMatch(q: SearchQuery, relaxed = false): string | null {
  const one = (t: QueryTerm) => {
    const s = `"${t.text.replace(/"/g, '""')}"${t.prefix ? "*" : ""}`;
    return t.title ? `{title aliases} : ${s}` : s;
  };
  const pos = q.terms.filter((t) => !t.not).map(one);
  if (!pos.length) return null;
  const neg = q.terms.filter((t) => t.not).map(one);
  const base = pos.length === 1 ? pos[0]! : `(${pos.join(relaxed ? " OR " : " AND ")})`;
  return neg.length ? `${base} NOT ${neg.join(" NOT ")}` : base;
}

// -------------------------------------------------------------------------------------------
// Searching

export interface SearchHit {
  path: string;
  /** Where to open it: the first line with one of the words, in the section with most of them (1-based), and its column. */
  line: number;
  column: number;
  /** That section's heading. */
  heading: string;
  /** Higher is better. */
  score: number;
  /** That line, cut around the match; `marks` say where the words are in it. */
  snippet: string;
  marks: [number, number][];
  /** Other sections of the file with some of the words. */
  more: number;
}

export interface SearchResult {
  engine: "index" | "scan";
  /** No file had every word: these have some of them. */
  relaxed: boolean;
  hits: SearchHit[];
}

/** Lower case, accents off — as the index's tokenizer folds them — with each character's place in the original. */
function fold(text: string): { folded: string; at: number[] } {
  let folded = "";
  const at: number[] = [];
  let i = 0;
  for (const ch of text) {
    const f = ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    for (let k = 0; k < f.length; k++) at.push(i);
    folded += f;
    i += ch.length;
  }
  at.push(i);
  return { folded, at };
}

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

/** Where a term occurs in folded text as the tokenizer would see it: at a word's start, and (unless a prefix) its end. */
function occurrences(folded: string, term: QueryTerm): number[] {
  const t = fold(term.text).folded;
  const out: number[] = [];
  for (let i = folded.indexOf(t); i >= 0; i = folded.indexOf(t, i + 1)) {
    if (isWordChar(folded[i - 1])) continue;
    if (!term.prefix && isWordChar(folded[i + t.length])) continue;
    out.push(i);
  }
  return out;
}

/** How much of a line the snippet shows around the first match. */
const SNIPPET = 120;

/**
 * Where a matched file opens: the section with most of the query's words (the first such), at its
 * first line with one; that line as the snippet, the words marked. Matched by its title, aliases,
 * tags or path alone, its top.
 */
function locate(path: string, group: "note" | "data", text: string, score: number, q: SearchQuery): SearchHit {
  const pos = q.terms.filter((t) => !t.not && !t.title);
  let best: { found: number; line: number; column: number; heading: string; raw: string } | null = null;
  let withWords = 0;
  for (const s of indexDoc(path, text, group).sections) {
    const lines = s.text.split("\n");
    const seen = new Set<QueryTerm>();
    let first: { line: number; column: number; raw: string } | null = null;
    for (let k = 0; k < lines.length && seen.size < pos.length; k++) {
      const { folded, at } = fold(lines[k]!);
      let col = -1;
      for (const t of pos) {
        const o = occurrences(folded, t)[0];
        if (o === undefined) continue;
        seen.add(t);
        if (col < 0 || o < col) col = o;
      }
      if (col >= 0 && !first) first = { line: s.line + k, column: [...lines[k]!.slice(0, at[col])].length + 1, raw: lines[k]! };
    }
    if (!first) continue;
    withWords++;
    if (!best || seen.size > best.found) best = { found: seen.size, ...first, heading: s.heading };
  }
  if (!best) return { path, line: 1, column: 1, heading: "", score, snippet: "", marks: [], more: 0 };
  return { path, line: best.line, column: best.column, heading: best.heading, score, ...snippetOf(best.raw, pos), more: withWords - 1 };
}

/** A line as a snippet: white space run together, cut to about 120 characters around its first match, the words marked. */
function snippetOf(raw: string, pos: QueryTerm[]): { snippet: string; marks: [number, number][] } {
  let line = raw.replace(/\s+/g, " ").trim();
  const find = () => {
    const { folded, at } = fold(line);
    const marks: [number, number][] = [];
    for (const t of pos) {
      const len = fold(t.text).folded.length;
      for (const o of occurrences(folded, t)) marks.push([at[o]!, at[o + len] ?? line.length]);
    }
    return marks.sort((a, b) => a[0] - b[0]);
  };
  let marks = find();
  if (line.length > SNIPPET && marks.length) {
    const from = Math.max(0, Math.min(marks[0]![0] - 30, line.length - SNIPPET));
    line = `${from > 0 ? "…" : ""}${line.slice(from, from + SNIPPET)}${from + SNIPPET < line.length ? "…" : ""}`;
    marks = find();
  }
  return { snippet: line, marks };
}

/**
 * Search the vault: with the index when it's given (complete and caught up), else by scanning the
 * files. `texts`: files' text to use instead of the disk's (a scan of the TUI's unsaved notes).
 */
export function search(g: Graph, idx: SearchIndex | null, input: string, opts: { limit?: number; texts?: Map<string, string> } = {}): SearchResult {
  const limit = opts.limit ?? 50;
  const q = parseQuery(input);
  const engine = idx ? "index" : "scan";
  if (!q.terms.some((t) => !t.not)) {
    // Filters alone: the files they keep, by path.
    if (!q.tags.length && !q.paths.length) return { engine, relaxed: false, hits: [] };
    const files = idx ? idx.filesWhere({ tags: q.tags, pathPrefix: q.paths, limit }) : scanFiles(g, q, opts.texts).slice(0, limit);
    return { engine, relaxed: false, hits: files.map((path) => ({ path, line: 1, column: 1, heading: "", score: 0, snippet: "", marks: [], more: 0 })) };
  }
  if (!idx) return scanSearch(g, q, limit, opts.texts);
  for (const relaxed of [false, true]) {
    if (relaxed && q.terms.filter((t) => !t.not).length < 2) break;
    const rows = idx.query(ftsMatch(q, relaxed)!, { tags: q.tags, pathPrefix: q.paths, limit }) ?? [];
    if (rows.length) return { engine, relaxed, hits: rows.map((r) => locate(r.path, r.group, r.body, -r.score, q)) };
  }
  return { engine, relaxed: false, hits: [] };
}

// -------------------------------------------------------------------------------------------
// The scan: the same query over the files themselves, until the index is there

interface Scanned {
  path: string;
  group: "note" | "data";
  text: string;
  doc: Doc;
}

function scanned(g: Graph, texts?: Map<string, string>): Scanned[] {
  const out: Scanned[] = [];
  for (const [path, s] of searchable(g)) {
    let text = texts?.get(path);
    if (text === undefined) {
      try {
        text = readText(g.abs(path)).text;
      } catch {
        continue;
      }
    }
    out.push({ path, group: s.group, text, doc: indexDoc(path, text, s.group) });
  }
  return out;
}

function keeps(f: Scanned, q: SearchQuery): boolean {
  if (q.paths.length && !q.paths.some((p) => f.path.startsWith(p))) return false;
  const tags = f.doc.tags.map((t) => t.toLowerCase());
  return q.tags.every((t) => tags.some((x) => x === t || x.startsWith(`${t}/`)));
}

function scanFiles(g: Graph, q: SearchQuery, texts?: Map<string, string>): string[] {
  return scanned(g, texts)
    .filter((f) => keeps(f, q))
    .map((f) => f.path)
    .sort();
}

/** The scan: each file's fields folded; every positive term in it (or some, relaxed), none of the rest; scored as BM25 roughly is. */
function scanSearch(g: Graph, q: SearchQuery, limit: number, texts?: Map<string, string>): SearchResult {
  const pos = q.terms.filter((t) => !t.not);
  const neg = q.terms.filter((t) => t.not);
  const files = scanned(g, texts).filter((f) => keeps(f, q));
  const cands: { f: Scanned; counts: number[][] }[] = [];
  for (const f of files) {
    const d = f.doc;
    const fields = [d.title, d.aliases.join("\n"), d.tags.join("\n"), f.path, d.sections.map((x) => x.heading).join("\n"), f.text].map((x) => fold(x).folded);
    const count = (t: QueryTerm) => fields.map((x, k) => (t.title && k > 1 ? 0 : occurrences(x, t).length));
    if (neg.some((t) => count(t).some((n) => n > 0))) continue;
    cands.push({ f, counts: pos.map(count) });
  }
  const has = (c: (typeof cands)[number], i: number) => c.counts[i]!.some((n) => n > 0);
  for (const relaxed of [false, true]) {
    if (relaxed && pos.length < 2) break;
    const kept = cands.filter((c) => (relaxed ? pos.some((_, i) => has(c, i)) : pos.every((_, i) => has(c, i))));
    if (!kept.length) continue;
    const idf = pos.map((_, i) => {
      const df = cands.filter((c) => has(c, i)).length;
      return Math.log(1 + (files.length - df + 0.5) / (df + 0.5));
    });
    const hits = kept
      .map((c) => ({ c, score: pos.reduce((s, _, i) => s + idf[i]! * c.counts[i]!.reduce((a, n, k) => a + (WEIGHTS[k]! * n) / (n + 1.2), 0), 0) }))
      .sort((a, b) => b.score - a.score || (a.c.f.path < b.c.f.path ? -1 : 1))
      .slice(0, limit)
      .map(({ c, score }) => locate(c.f.path, c.f.group, c.f.text, score, q));
    return { engine: "scan", relaxed, hits };
  }
  return { engine: "scan", relaxed: false, hits: [] };
}

export { SearchIndex };
