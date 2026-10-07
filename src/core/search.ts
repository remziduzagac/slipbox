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
import { sanitize } from "./sanitize.ts";
import { tagName, tagsInLine } from "./tags.ts";

// -------------------------------------------------------------------------------------------
// What's read

/**
 * The size band sections are cut to (scout's Stage 4, so a scout result and a slipbox hit are the same
 * section): a section is kept on its own tokens — its text without its sub-sections' — from 400 to
 * 1500; above, split at paragraphs; below, merged into its parent. A starting point, tunable.
 */
export const BAND_MIN = 400;
export const BAND_MAX = 1500;
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

/** A line of a file, with its number (1-based): a section merged from others isn't contiguous. */
export interface DocLine {
  line: number;
  text: string;
}

/**
 * A section a hit can land in (scout's model, Stage 4): a node of the file's containment tree — a
 * heading owns everything to the next heading as high — kept when its own text is in the size band,
 * split when it's over, merged into its parent when it's under; the root (`§:file`) always kept.
 */
export interface DocSection {
  /** scout's name for it, after the path's `#`: the heading chain (`Auth/How auth works`), or `§:file`, `§:part~2`, `§:chunk~3`. */
  name: string;
  /** Its heading's text ("" for the root and the pieces cut from it). */
  heading: string;
  /** Its first and last line (1-based): a range for jumping to and for matching a scout result's. */
  line: number;
  end: number;
  /** Its own text and what merged into it, line by line, in document order. */
  lines: DocLine[];
  /** Its own text's tokens, as bytes / 4 (slipbox has no tokenizer, nor needs one). */
  tokens: number;
  /** Over the band and couldn't be split (one long paragraph): kept whole. */
  oversized: boolean;
}

/** What search reads of a file: its title, aliases, tags and headings, and its sections. */
export interface Doc {
  title: string;
  aliases: string[];
  tags: string[];
  /** Every heading, its line and text, in order: the index's headings column, and a hit's nearest. */
  headings: { line: number; text: string }[];
  /** The sections a hit is cited by, cut to the band (scout's). */
  sections: DocSection[];
  /**
   * Where a hit opens is found finer: each heading's own text, uncut and unmerged (a data file's, each
   * blank-line paragraph) — the band merges a short note into one section, and the hit would open at
   * any word rather than among most of them.
   */
  units: DocLine[][];
}

/** A text's tokens, approximated as its UTF-8 bytes / 4. */
function tokensOf(text: string): number {
  return Buffer.byteLength(text, "utf8") / 4;
}

/** A node of the containment tree, as it's built and then cut to the band. */
interface Node {
  heading: string;
  level: number;
  /** Its own lines; text merged into it is appended, a part at a time. */
  lines: DocLine[];
  /** Its text as scout hashes and measures it: its own, then each absorbed part, joined by a blank line. */
  text: string;
  children: Node[];
}

/** A name segment, encoded as scout's grammar has it: `%`, `~`, `/`, `#`, in that order. */
function segment(text: string): string {
  return text.replaceAll("%", "%25").replaceAll("~", "%7E").replaceAll("/", "%2F").replaceAll("#", "%23");
}

/** Sibling segments made distinct: a later one normKey-equal to an earlier gets `~2`, `~3`. */
function distinct(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const key = n.normalize("NFC").toLowerCase();
    const k = (seen.get(key) ?? 0) + 1;
    seen.set(key, k);
    return k === 1 ? n : `${n}~${k}`;
  });
}

/** A text's units for packing: its paragraphs (blank-line runs apart), a fenced block never cut. */
function units(lines: DocLine[]): DocLine[][] {
  const out: DocLine[][] = [];
  let cur: DocLine[] = [];
  let fence: string | null = null;
  for (const l of lines) {
    const f = FENCE.exec(l.text);
    if (fence) {
      if (f && f[1]![0] === fence[0] && f[1]!.length >= fence.length) fence = null;
    } else if (f) fence = f[1]!;
    else if (!l.text.trim()) {
      if (cur.length) out.push(cur);
      cur = [];
      continue;
    }
    cur.push(l);
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * Units packed into band-sized pieces, in order: a piece is flushed when the next unit would take it
 * over the band's top; a last piece under its bottom goes onto the one before.
 */
function pack(us: DocLine[][]): DocLine[][] {
  const pieces: DocLine[][] = [];
  let cur: DocLine[] = [];
  const text = (ls: DocLine[]) => ls.map((l) => l.text).join("\n");
  for (const u of us) {
    if (cur.length && tokensOf(`${text(cur)}\n\n${text(u)}`) > BAND_MAX) {
      pieces.push(cur);
      cur = [];
    }
    cur = [...cur, ...u];
  }
  if (cur.length) {
    if (pieces.length && tokensOf(text(cur)) < BAND_MIN) pieces[pieces.length - 1] = [...pieces[pieces.length - 1]!, ...cur];
    else pieces.push(cur);
  }
  return pieces;
}

function section(name: string, heading: string, lines: DocLine[], text: string): DocSection {
  const nums = lines.map((l) => l.line);
  const tokens = tokensOf(text);
  return { name, heading, line: nums.length ? Math.min(...nums) : 1, end: nums.length ? Math.max(...nums) : 1, lines, tokens, oversized: tokens > BAND_MAX };
}

/** Pieces cut from a node over the band: `§:part` (`§:chunk` with no structure), `~2`, `~3` — each kept. */
function pieces(prefix: string, kind: "part" | "chunk", heading: string, lines: DocLine[]): DocSection[] {
  const cut = pack(units(lines));
  return cut.map((p, i) => section(`${prefix}§:${kind}${i ? `~${i + 1}` : ""}`, heading, p, p.map((l) => l.text).join("\n")));
}

/**
 * The tree cut to the band, bottom-up: each node on its own tokens — in the band, kept; over, split at
 * paragraphs into pieces; under, merged into its parent (heading line and body, after the parent's own
 * text), which is then tested carrying it. The root is kept whatever its size, split only when over.
 */
function cut(root: Node): DocSection[] {
  const kept: DocSection[] = [];
  const visit = (node: Node, name: string | null): void => {
    const names = distinct(node.children.map((c) => segment(c.heading)));
    node.children.forEach((child, i) => {
      const childName = name === null ? names[i]! : `${name}/${names[i]}`;
      visit(child, childName);
      if (tokensOf(child.text) < BAND_MIN) {
        node.lines.push(...child.lines);
        node.text = node.text ? `${node.text}\n\n${child.text}` : child.text;
      } else if (tokensOf(child.text) > BAND_MAX) kept.push(...pieces(`${childName}/`, "part", child.heading, child.lines));
      else kept.push(section(childName, child.heading, child.lines, child.text));
    });
  };
  visit(root, null);
  if (tokensOf(root.text) > BAND_MAX) kept.push(...pieces("", "part", "", root.lines));
  else kept.push(section("§:file", "", root.lines, root.text));
  return kept.sort((a, b) => a.line - b.line);
}

/**
 * A file read for search: a note's title, aliases, tags and headings, and its sections — its
 * containment tree (headings: ATX, and setext under a paragraph line; never inside fenced code; its
 * frontmatter and any text before the first heading its root's) cut to the size band. A file with no
 * headings to cut at (a data file) is one section, or packed into band-sized chunks at blank lines.
 */
export function indexDoc(rel: string, text: string, group: "note" | "data" | "text"): Doc {
  const lines = text.split(/\r?\n/);
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  const all: DocLine[] = lines.map((t, i) => ({ line: i + 1, text: t }));
  const name = basename(rel).replace(/\.[^.]+$/, "");
  if (group !== "note") {
    const sections = tokensOf(text) > BAND_MAX ? pieces("", "chunk", "", all) : [section("§:file", "", all, all.map((l) => l.text).join("\n"))];
    return { title: basename(rel), aliases: [], tags: [], headings: [], sections, units: units(all) };
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
  const headings: { line: number; text: string }[] = [];
  // The tree: the root holds the frontmatter and the lead text; a heading owns what follows it, a
  // lower one nested under it, to the next as high.
  const root: Node = { heading: "", level: 0, lines: all.slice(0, body), text: "", children: [] };
  const stack: Node[] = [root];
  const open = (heading: string, level: number, own: DocLine[]) => {
    headings.push({ line: own[0]!.line, text: heading });
    while (stack.length > 1 && stack[stack.length - 1]!.level >= level) stack.pop();
    const node: Node = { heading, level, lines: own, text: "", children: [] };
    stack[stack.length - 1]!.children.push(node);
    stack.push(node);
  };
  let fence: string | null = null;
  for (let i = body; i < lines.length; i++) {
    const line = lines[i]!;
    const top = stack[stack.length - 1]!;
    const f = FENCE.exec(line);
    if (fence) {
      if (f && f[1]![0] === fence[0] && f[1]!.length >= fence.length && !line.slice(f[0].length).trim()) fence = null;
      top.lines.push(all[i]!);
      continue;
    }
    if (f) {
      fence = f[1]!;
      top.lines.push(all[i]!);
      continue;
    }
    const atx = ATX.exec(line);
    if (atx) {
      const heading = (atx[2] ?? "").trim();
      if (!title && atx[1] === "#" && heading) title = heading;
      open(heading, atx[1]!.length, [all[i]!]);
      continue;
    }
    // A setext underline: the paragraph line above it is the heading.
    const above = top.lines[top.lines.length - 1];
    if (SETEXT.test(line) && above && above.line === i && i - 1 >= body && !NOT_PARAGRAPH.test(lines[i - 1]!) && !(top !== root && top.lines.length === 1)) {
      top.lines.pop();
      if (!title && line.trim().startsWith("=")) title = above.text.trim();
      open(above.text.trim(), line.trim().startsWith("=") ? 1 : 2, [above, all[i]!]);
      continue;
    }
    for (const t of tagsInLine(line)) tags.add(t.name);
    top.lines.push(all[i]!);
  }
  // Each node's own text, before the band merges any: where a hit opens is found among these.
  const own: DocLine[][] = [];
  const textOf = (n: Node) => {
    n.text = n.lines.map((l) => l.text).join("\n");
    if (n.lines.length) own.push([...n.lines]);
    n.children.forEach(textOf);
  };
  textOf(root);
  return { title: title || name, aliases: [...strings(fm?.aliases), ...strings(fm?.alias)], tags: [...tags], headings, sections: cut(root), units: own };
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
    idx.put(rel, { group: kind, title: d.title, aliases: d.aliases, tags: d.tags, headings: d.headings.map((h) => h.text).filter(Boolean), body: text }, { size: st.size, mtime: st.mtimeMs });
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

/** A term for FTS5: quoted (never its syntax), `*` for a prefix, in the title's columns for `title:`. */
function ftsTerm(t: QueryTerm): string {
  const s = `"${t.text.replace(/"/g, '""')}"${t.prefix ? "*" : ""}`;
  return t.title ? `{title aliases} : ${s}` : s;
}

/** The query for FTS5: each term quoted; all the positive ones (or any, `relaxed`), none of the rest. */
export function ftsMatch(q: SearchQuery, relaxed = false): string | null {
  const one = ftsTerm;
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
  /** The nearest heading at or above that line ("" above the first). */
  heading: string;
  /**
   * The section it's in, as scout names and bounds it (Stage 4): a scout result for the same file
   * and range is the same hit — what a search that adds scout's results dedupes on.
   */
  section: { name: string; line: number; end: number };
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

/**
 * Where a term occurs in folded text as the tokenizer would see it, start and end: its words in order,
 * whatever is between them (a space, a line break, a comma), at a word's start and (unless a prefix)
 * its end — as FTS5 matches a phrase, so the scan finds what the index does.
 */
function occurrences(folded: string, term: QueryTerm): [number, number][] {
  const words = fold(term.text).folded.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!words.length) return [];
  // The bounds in the pattern, not checked after: a match turned down inside a word (`uno` for "no
  // no") would otherwise hide one starting within it.
  const body = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^\\p{L}\\p{N}]+");
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${body}${term.prefix ? "" : "(?![\\p{L}\\p{N}])"}`, "gu");
  return [...folded.matchAll(re)].map((m): [number, number] => [m.index, m.index + m[0].length]);
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
  const doc = indexDoc(path, text, group);
  let best: { found: number; line: number; column: number; raw: string } | null = null;
  let withWords = 0;
  // The unit with most of the words (a heading's own text), at its first line with one.
  for (const u of doc.units) {
    // Its lines joined, folded, as the index reads them: a phrase wrapped across a line break placed
    // too. Each folded offset kept with its line and its offset in that line.
    let folded = "";
    const where: [number, number][] = [];
    u.forEach((l, i) => {
      const f = fold(l.text);
      folded += `${f.folded}\n`;
      for (let k = 0; k <= f.folded.length; k++) where.push([i, f.at[k]!]);
    });
    const seen = new Set<QueryTerm>();
    let col = -1;
    for (const t of pos) {
      const o = occurrences(folded, t)[0]?.[0];
      if (o === undefined) continue;
      seen.add(t);
      if (col < 0 || o < col) col = o;
    }
    if (col < 0) continue;
    const [i, off] = where[col]!;
    const l = u[i]!;
    const first = { line: l.line, column: [...l.text.slice(0, off)].length + 1, raw: l.text };
    withWords++;
    if (!best || seen.size > best.found) best = { found: seen.size, ...first };
  }
  // Cited by the band's section holding that line (scout's, for a search adding its results to dedupe).
  const at = best?.line ?? 1;
  const s = doc.sections.find((x) => x.lines.some((l) => l.line === at)) ?? doc.sections[0]!;
  const section = { name: s.name, line: s.line, end: s.end };
  if (!best) return { path, line: 1, column: 1, heading: "", section, score, snippet: "", marks: [], more: 0 };
  const heading = doc.headings.filter((h) => h.line <= best!.line).at(-1)?.text ?? "";
  return { path, line: best.line, column: best.column, heading, section, score, ...snippetOf(best.raw, pos), more: withWords - 1 };
}

/** A line as a snippet: white space run together, cut to about 120 characters around its first match, the words marked. */
function snippetOf(raw: string, pos: QueryTerm[]): { snippet: string; marks: [number, number][] } {
  // Sanitized first, so the marks are where the words are in what's shown.
  let line = sanitize(raw).replace(/\s+/g, " ").trim();
  const find = () => {
    const { folded, at } = fold(line);
    const marks: [number, number][] = [];
    for (const t of pos) for (const [s, e] of occurrences(folded, t)) marks.push([at[s]!, at[e] ?? line.length]);
    // One mark where two meet or overlap (`new "new york"`): shown once.
    const merged: [number, number][] = [];
    for (const m of marks.sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
      const last = merged.at(-1);
      if (last && m[0] <= last[1]) last[1] = Math.max(last[1], m[1]);
      else merged.push([m[0], m[1]]);
    }
    return merged;
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
 * files. For a scan: `texts`, files' text to use instead of the disk's (the TUI's unsaved notes);
 * `only`, just these files; `relax` false, never some of the words for want of all of them.
 */
export function search(g: Graph, idx: SearchIndex | null, input: string, opts: { limit?: number; texts?: Map<string, string>; only?: string[]; relax?: boolean } = {}): SearchResult {
  const limit = opts.limit ?? 50;
  const q = parseQuery(input);
  const engine = idx ? "index" : "scan";
  if (!q.terms.some((t) => !t.not)) {
    // Filters alone: the files they keep, by path.
    if (!q.tags.length && !q.paths.length) return { engine, relaxed: false, hits: [] };
    // Less the files with a word they mustn't have (`#project -draft`).
    const not = q.terms.length ? q.terms.map(ftsTerm).join(" OR ") : undefined;
    const files = idx ? idx.filesWhere({ tags: q.tags, pathPrefix: q.paths, not, limit }) : scanFiles(g, q, opts.texts, opts.only).slice(0, limit);
    // Nothing read: the file's top stands for where it's hit.
    return { engine, relaxed: false, hits: files.map((path) => ({ path, line: 1, column: 1, heading: "", section: { name: "§:file", line: 1, end: 1 }, score: 0, snippet: "", marks: [], more: 0 })) };
  }
  if (!idx) return scanSearch(g, q, limit, opts.texts, opts.only, opts.relax ?? true);
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

function scanned(g: Graph, texts?: Map<string, string>, only?: string[]): Scanned[] {
  const out: Scanned[] = [];
  const keep = only ? new Set(only) : null;
  for (const [path, s] of searchable(g)) {
    if (keep && !keep.has(path)) continue;
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

/** ASCII letters lowered, as SQLite's LIKE compares them: the index's `path:` and the scan's agree. */
const asciiLower = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

function keeps(f: Scanned, q: SearchQuery): boolean {
  if (q.paths.length && !q.paths.some((p) => asciiLower(f.path).startsWith(asciiLower(p)))) return false;
  const tags = f.doc.tags.map((t) => t.toLowerCase());
  return q.tags.every((t) => tags.some((x) => x === t || x.startsWith(`${t}/`)));
}

/** A scanned file's fields, folded: title, aliases, tags, path, headings, text (the index's columns). */
function foldedFields(f: Scanned): string[] {
  const d = f.doc;
  return [d.title, d.aliases.join("\n"), d.tags.join("\n"), f.path, d.headings.map((h) => h.text).join("\n"), f.text].map((x) => fold(x).folded);
}

/** How often a term occurs in each field (`title:` in the title and aliases only). */
function countsIn(fields: string[], t: QueryTerm): number[] {
  return fields.map((x, k) => (t.title && k > 1 ? 0 : occurrences(x, t).length));
}

function scanFiles(g: Graph, q: SearchQuery, texts?: Map<string, string>, only?: string[]): string[] {
  const neg = q.terms.filter((t) => t.not);
  return scanned(g, texts, only)
    .filter((f) => keeps(f, q))
    .filter((f) => !neg.length || !neg.some((t) => countsIn(foldedFields(f), t).some((n) => n > 0)))
    .map((f) => f.path)
    .sort();
}

/** The scan: each file's fields folded; every positive term in it (or some, relaxed), none of the rest; scored as BM25 roughly is. */
function scanSearch(g: Graph, q: SearchQuery, limit: number, texts?: Map<string, string>, only?: string[], relax = true): SearchResult {
  const pos = q.terms.filter((t) => !t.not);
  const neg = q.terms.filter((t) => t.not);
  const files = scanned(g, texts, only).filter((f) => keeps(f, q));
  const cands: { f: Scanned; counts: number[][] }[] = [];
  for (const f of files) {
    const fields = foldedFields(f);
    const count = (t: QueryTerm) => countsIn(fields, t);
    if (neg.some((t) => count(t).some((n) => n > 0))) continue;
    cands.push({ f, counts: pos.map(count) });
  }
  const has = (c: (typeof cands)[number], i: number) => c.counts[i]!.some((n) => n > 0);
  for (const relaxed of [false, true]) {
    if (relaxed && (pos.length < 2 || !relax)) break;
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
