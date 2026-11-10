// Markdown's inline styles in SOURCE view (SIS, issue #103): what the render draws bold is bold here too, its `**`
// kept and dimmed — italic, strikethrough, `==highlight==`, code, a link's text apart from its address, wikilinks,
// footnote marks, tags, maths, inline HTML, escapes and a table's pipes. Nothing is hidden or moved: only the colours
// of the text as typed change, so the cursor, a selection, find and `srcMap` are as they were (SIS-D1).
//
// The styles come from the render's own parse (SIS-D4): the note cut at every place it can be cut (`chunkStarts` at a
// size of one line), each chunk parsed by the same processor, a reference to a definition in another chunk parsed with
// a stand-in for it, as `parseMarkdown` does — so emphasis across a paragraph's lines, `snake_case_words`, a `*` in a
// code span and an unclosed `**` read as they render. A chunk's paints are kept by its text: a keystroke parses the
// chunk it changed, and a chunk the buffer's parse already holds (the note read before) isn't parsed again.

import type { Nodes, PhrasingContent, RootContent, Table } from "mdast";
import type { Point } from "unist";
import {
  chunkStandIns,
  isStandIn,
  type ParseCache,
  parseChunk,
  standInText,
} from "../../../documents/markdown/parse.ts";
import { chunkStarts } from "../../../documents/markdown/parse/chunks.ts";
import { tame } from "../../../documents/markdown/parse/normalization.ts";
import type { WikiLink } from "../../../documents/markdown/wikilink.ts";
import type { Role } from "../../theme/theme.ts";
import { A_BOLD, A_ITALIC, A_STRIKE } from "../ir.ts";
import { IMAGE_FILE } from "../markdown/render-inline.ts";

/**
 * A stretch of a line `[from, to)` (UTF-16 offsets) and how it's drawn: `role`, or, null, the line's own — which
 * `promote` raises when that is plain text (strong text in a paragraph; in a heading, the heading's colour, bold) —
 * with `attrs` (A_* bits) and a background role.
 */
export interface Paint {
  from: number;
  to: number;
  role: Role | null;
  promote?: Role;
  attrs: number;
  bg?: Role;
}

export interface StyleOptions {
  /** The note's parse in chunks, where one is at hand (a buffer's): a chunk it holds isn't parsed again. */
  parsed?: ParseCache;
  /** More than this many characters to parse here, stand-ins included, and none are: the chunks no cache holds have no
   *  paints for now, and `StyleCache.pending` says so (a big note, its parse sent to other threads). Default: none. */
  limit?: number;
  /** Only the chunks holding one of these lines (1-based) are wanted (a diff's lines): the others aren't parsed. */
  lines?: ReadonlySet<number>;
}

/** A chunk's paints, a list a line of it, and the definitions it holds (their stand-ins for the other chunks). */
interface ChunkStyles {
  paints: Paint[][];
  /** Each line's paints as a string: what tells the source layout's row cache a line looks different now. */
  sigs: string[];
  defs: Def[];
  /** What it has between brackets, lower case (`^1`, `ref`): the labels it may use of another chunk's definitions. */
  refs: string[];
}

interface Def {
  label: string;
  id: string;
  footnote: boolean;
  /** Its line in its chunk. */
  line: number;
}

/** What a chunk has between brackets, as the render's parse looks for a label (`[^1]`, `[ref]`). */
function refsOf(body: string[]): string[] {
  const text = body.join("\n");
  return text.includes("[") ? [...text.matchAll(/\[([^[\]\n]*)\]/g)].map((m) => m[1]!.toLowerCase()) : [];
}

/** Kept by the caller between layouts of the same note, inside its source cache. */
export interface StyleCache {
  chunks: Map<string, ChunkStyles>;
  /** The last layout left chunks plain, past its `limit`. */
  pending: boolean;
}

export function newStyleCache(): StyleCache {
  return { chunks: new Map(), pending: false };
}

/** Each line's paints (0-based, as `source.split("\n")`), undefined for a line of a chunk not styled, and its
 *  signature for the row cache. */
export interface LineStyles {
  paints: (Paint[] | undefined)[];
  sigs: string[];
}

/** A definition's line, read without a parse: a chunk a diff doesn't show still lends its labels. */
const DEFINITION = /^ {0,3}\[(\^?)([^\]]+)\]:/;

export function inlineStyles(source: string, opts: StyleOptions, cache: StyleCache): LineStyles {
  const tamed = tame(source);
  const lines = tamed.split("\n");
  // Every place the note can be cut with the same parse as whole: a chunk is a block, or the few that must go
  // together. A keystroke parses its paragraph again, and a line added above moves no cut below it.
  const starts = chunkStarts(lines, 1);
  const ranges = starts.map((from, c) => [from, starts[c + 1] ?? lines.length] as const);
  const used = new Map<string, ChunkStyles>();
  const wanted = (from: number, to: number) => {
    if (!opts.lines) return true;
    for (let l = from + 1; l <= to; l++) if (opts.lines.has(l)) return true;
    return false;
  };
  /** The render's chunk (`chunkStarts` at its size) holding chunk `k`, by its first line, among `starts`. */
  const holding = (starts: readonly number[], k: number) => {
    let [w, hi] = [0, starts.length - 1];
    while (w < hi) {
      const mid = (w + hi + 1) >> 1;
      if (starts[mid]! <= ranges[k]![0]) w = mid;
      else hi = mid - 1;
    }
    return w;
  };
  /** Chunk `j`'s styles out of those of the render's chunk it's in, which starts at line `from`. */
  const slice = (all: ChunkStyles, from: number, j: number): ChunkStyles => {
    const [f, t] = ranges[j]!;
    const [a, b] = [f - from, t - from];
    const defs = all.defs.filter((d) => d.line >= a && d.line < b).map((d) => ({ ...d, line: d.line - a }));
    return { paints: all.paints.slice(a, b), sigs: all.sigs.slice(a, b), defs, refs: refsOf(lines.slice(f, t)) };
  };
  /** The render's chunks, each a run of these: found when the buffer's parse is asked. */
  let wide: number[] | null = null;
  /** The render's chunks the buffer's parse hasn't got. */
  const unparsed = new Set<number>();
  /** The buffer's parse of the render's chunk holding chunk `k`, its paints shared out among the chunks in it. */
  const fromParse = (k: number): boolean => {
    if (!opts.parsed?.chunks.size) return false;
    wide ??= chunkStarts(lines);
    const w = holding(wide, k);
    if (unparsed.has(w)) return false;
    const [from, to] = [wide[w]!, wide[w + 1] ?? lines.length];
    const hit = opts.parsed.chunks.get(lines.slice(from, to).join("\n"));
    if (!hit) {
      unparsed.add(w);
      return false;
    }
    const all = paintsOf(hit.children, lines.slice(from, to), hit.shift);
    const share = (j: number) => used.set(lines.slice(...ranges[j]!).join("\n"), slice(all, from, j));
    for (let j = k; j >= 0 && ranges[j]![0] >= from; j--) share(j);
    for (let j = k + 1; j < ranges.length && ranges[j]![0] < to; j++) share(j);
    return true;
  };
  /** A chunk's styles by its text, kept or from the buffer's parse; or parsed now (`parse`). */
  const styles = (k: number, text: string, parse: boolean) => {
    let entry = used.get(text) ?? cache.chunks.get(text);
    if (!entry && fromParse(k)) entry = used.get(text);
    if (!entry) {
      if (!parse) return null;
      entry = paintsOf(parseChunk(text, ranges[k]![0] === 0), lines.slice(...ranges[k]!), 0);
    }
    used.set(text, entry);
    return entry;
  };
  /** The render's chunks and the stand-ins it parses each with, once asked: null when the buffer's parse hasn't got
   *  every chunk, or parses the note whole. */
  let render: ReturnType<typeof chunkStandIns> | undefined;
  /** Each render's chunk's styles, as parsed with its stand-ins, once asked. */
  const rendered = new Map<number, ChunkStyles | null>();
  /** The render's parse of the chunk holding chunk `a.k`, with the stand-ins it took (the workers parse them for a big
   *  note: SIS-D7), its paints for `a.k`: what a parse of `a.k` with its own stand-ins would give. */
  const fromRender = (a: Again): ChunkStyles | null => {
    if (!opts.parsed?.chunks.size) return null;
    render ??= chunkStandIns(lines, opts.parsed);
    if (!render) return null;
    const w = holding(
      render.ranges.map(([from]) => from),
      a.k,
    );
    const [from, to] = render.ranges[w]!;
    if (!rendered.has(w)) {
      const body = lines.slice(from, to);
      const hit = opts.parsed.chunks.get(standInText(body.join("\n"), from, render.stubs[w]!).text);
      rendered.set(w, hit && hit.stubbed !== false ? paintsOf(hit.children, body, hit.shift) : null);
    }
    const all = rendered.get(w);
    return all ? slice(all, from, a.k) : null;
  };
  /** A chunk with stand-ins for the definitions it uses from others: kept by its text with them, or the render's; or
   *  parsed now (`parse`). One whose stand-ins don't all come back keeps its own parse, kept under that text too. */
  const withStandIns = (a: Again, parse: boolean) => {
    let entry = used.get(a.text) ?? cache.chunks.get(a.text) ?? fromRender(a);
    if (!entry) {
      if (!parse) return null;
      const nodes = parseChunk(a.text, ranges[a.k]![0] === 0);
      const own = nodes.filter((n) => !isStandIn(n, a.pre, a.body.length));
      entry = nodes.length - own.length === a.count ? paintsOf(own, a.body, a.pre) : parts[a.k]!;
    }
    used.set(a.text, entry);
    return entry;
  };
  const texts = ranges.map(([from, to]) => (wanted(from, to) ? lines.slice(from, to).join("\n") : null));
  const parts = texts.map((t, k) => (t === null ? null : styles(k, t, false)));
  // What no cache holds is parsed here — all of it, or, past the budget, none: it's left for the other threads.
  const limit = opts.limit ?? Number.POSITIVE_INFINITY;
  const missing = texts.flatMap((t, k) => (t !== null && !parts[k] ? [k] : []));
  let spent = missing.reduce((n, k) => n + texts[k]!.length, 0);
  let pending = spent > limit;
  if (!pending) for (const k of missing) parts[k] = styles(k, texts[k]!, true);
  // Reference definitions and footnotes are the note's, not a chunk's: a chunk using a label another defines is parsed
  // again with a stand-in definition, as the render's parse does (`parseMarkdown`), once the chunks are all at hand —
  // the parse within the same budget, what the render's parse holds read from it (SIS-D7).
  if (!pending && ranges.length > 1 && tamed.includes("]:")) {
    const defs = new Map<string, Def & { part: number; at: number }>();
    let n = 0;
    ranges.forEach(([from, to], k) => {
      const p = parts[k];
      const found = p
        ? p.defs
        : wanted(from, to)
          ? []
          : lines.slice(from, to).flatMap((l, line) => {
              const m = DEFINITION.exec(l);
              return m ? [{ label: m[2]!, id: m[2]!.toLowerCase(), footnote: !!m[1], line }] : [];
            });
      for (const d of found) {
        const key = `${d.footnote ? "^" : ""}${d.id}`;
        if (!defs.has(key)) defs.set(key, { ...d, part: k, at: n++ });
      }
    });
    const again: Again[] = [];
    // A link definition whose label starts with ^ can't be stood in for: the render parses such a note whole.
    if (defs.size && ![...defs.values()].some((d) => !d.footnote && d.label.startsWith("^")))
      ranges.forEach(([from, to], k) => {
        const p = parts[k];
        if (!p?.refs.length) return;
        const own = new Set(p.defs.map((d) => `${d.footnote ? "^" : ""}${d.id}`));
        const stubs = [...new Set(p.refs)]
          .flatMap((r) => {
            const d = defs.get(r);
            return d && d.part !== k && !own.has(r) ? [d] : [];
          })
          .sort((a, b) => a.at - b.at);
        if (!stubs.length) return;
        const body = lines.slice(from, to);
        again.push({ k, body, count: stubs.length, ...standInText(body.join("\n"), from, stubs) });
      });
    const left = again.filter((a) => {
      const entry = withStandIns(a, false);
      if (entry) parts[a.k] = entry;
      return !entry;
    });
    spent += left.reduce((m, a) => m + a.text.length, 0);
    pending = spent > limit;
    if (!pending) for (const a of left) parts[a.k] = withStandIns(a, true);
  }
  cache.chunks = used;
  cache.pending = pending;
  // A line of a chunk not styled (past the budget, or not wanted) has no paints: the light highlighting's, by pattern.
  const paints: (Paint[] | undefined)[] = new Array(lines.length);
  const sigs: string[] = new Array(lines.length).fill("?");
  ranges.forEach(([from], k) => {
    const p = parts[k];
    if (!p) return;
    p.paints.forEach((ps, j) => {
      paints[from + j] = ps;
      sigs[from + j] = p.sigs[j]!;
    });
  });
  return { paints, sigs };
}

/** A chunk to parse again with stand-ins: its text with them, the lines they add before it, how many. */
interface Again {
  k: number;
  body: string[];
  text: string;
  pre: number;
  count: number;
}

/** How the text under a node is drawn: as the render composes it (render-inline.ts). */
interface Style {
  role: Role | null;
  promote?: Role;
  attrs: number;
  bg?: Role;
}

const PLAIN: Style = { role: null, attrs: 0 };

/** A line's container marks and indentation, which a stretch carried over from the line above starts after. */
const LEAD = /^[ \t]*(?:>[ \t]?)*[ \t]*/;

/** A backslash escape: the backslash is markup, what it escapes the text's. */
const ESCAPE = /\\[!-/:-@[-`{-~]/g;

/** A chunk's top-level nodes, their positions `base` lines down from its first line, as paints. */
function paintsOf(nodes: RootContent[], body: string[], base: number): ChunkStyles {
  const paints: Paint[][] = body.map(() => []);
  const defs: Def[] = [];
  const text = (l: number) => (body[l] ?? "").replace(/\r$/, "");
  /** A point as [line in the chunk, offset in it]. */
  const at = (p: Point): [number, number] => [p.line - 1 - base, p.column - 1];
  const put = (l: number, from: number, to: number, st: Style) => {
    if (l < 0 || l >= body.length || to <= from) return;
    paints[l]!.push({
      from,
      to,
      role: st.role,
      ...(st.promote ? { promote: st.promote } : {}),
      attrs: st.attrs,
      ...(st.bg ? { bg: st.bg } : {}),
    });
  };
  /** From one point to another, over lines if it must: a line after the first from its text, past its marks. */
  const stretch = (s: Point, e: Point, st: Style) => {
    const [l0, c0] = at(s);
    const [l1, c1] = at(e);
    for (let l = l0; l <= l1; l++) {
      const t = text(l);
      put(l, l === l0 ? c0 : (LEAD.exec(t)?.[0].length ?? 0), l === l1 ? c1 : t.length, st);
    }
  };
  const col = (p: Point, d: number): Point => ({ line: p.line, column: p.column + d });
  const charAt = (p: Point) => text(p.line - 1 - base)[p.column - 1] ?? "";
  const mark = (st: Style): Style => ({ role: "markup", attrs: st.attrs, ...(st.bg ? { bg: st.bg } : {}) });
  /** Its own text, as `st` says, and each escape's backslash as markup. */
  const leaf = (s: Point, e: Point, st: Style) => {
    if (st.role || st.promote || st.attrs || st.bg) stretch(s, e, st);
    const [l0, c0] = at(s);
    const [l1, c1] = at(e);
    for (let l = l0; l <= l1; l++) {
      const t = text(l);
      const from = l === l0 ? c0 : 0;
      const to = l === l1 ? c1 : t.length;
      if (!t.includes("\\", from)) continue;
      for (const m of t.slice(from, to).matchAll(ESCAPE)) put(l, from + m.index, from + m.index + 1, mark(st));
    }
  };
  /** Markers either side of what a node holds — `**`, `_`, `~~`, `==` — and what it holds as `inner` says. */
  const wrapped = (
    n: { position?: { start: Point; end: Point }; children: PhrasingContent[] },
    st: Style,
    inner: Style,
  ) => {
    const p = n.position!;
    const first = n.children[0]?.position;
    const last = n.children[n.children.length - 1]?.position;
    if (!first || !last) {
      stretch(p.start, p.end, mark(st));
      return;
    }
    stretch(p.start, first.start, mark(st));
    inline(n.children, inner);
    stretch(last.end, p.end, mark(st));
  };
  /** A link's or a picture's address after its text's `]`: `(…)` or `[label]`, its brackets markup. */
  const address = (close: Point, end: Point, st: Style) => {
    stretch(close, col(close, 1), mark(st)); // ]
    const open = col(close, 1);
    if (open.line === end.line && open.column >= end.column) return; // [shortcut]
    stretch(open, col(open, 1), mark(st)); // ( or [
    stretch(col(open, 1), col(end, -1), { role: "url", attrs: 0, ...(st.bg ? { bg: st.bg } : {}) });
    stretch(col(end, -1), end, mark(st)); // ) or ]
  };
  const inline = (ns: PhrasingContent[], st: Style) => {
    for (const n of ns) {
      const p = n.position;
      if (!p) {
        if ("children" in n) inline(n.children as PhrasingContent[], st);
        continue;
      }
      const type = n.type as string;
      switch (type) {
        case "text":
          leaf(p.start, p.end, st);
          break;
        case "strong":
        case "emphasis":
        case "delete": {
          const [promote, attr] =
            type === "strong"
              ? (["strong", A_BOLD] as const)
              : type === "emphasis"
                ? (["emphasis", A_ITALIC] as const)
                : (["strike", A_STRIKE] as const);
          wrapped(n as never, st, {
            ...st,
            ...(st.role === null ? { promote: st.promote ?? promote } : {}),
            attrs: st.attrs | attr,
          });
          break;
        }
        case "highlight":
          wrapped(n as never, st, { role: "highlight", attrs: st.attrs, bg: "highlight" });
          break;
        case "comment":
          // Obsidian's `%%comment%%`: what reading never shows, as its markers are.
          stretch(p.start, p.end, mark(st));
          break;
        case "inlineCode":
          stretch(p.start, p.end, { role: "code_inline", attrs: 0, ...(st.bg ? { bg: st.bg } : {}) });
          break;
        case "inlineMath": {
          const [l, c] = at(p.start);
          const dollars = /^\$+/.exec(text(l).slice(c))?.[0].length ?? 1;
          stretch(p.start, col(p.start, dollars), mark(st));
          stretch(col(p.start, dollars), col(p.end, -dollars), { ...st, role: "math" });
          stretch(col(p.end, -dollars), p.end, mark(st));
          break;
        }
        case "break":
          if (charAt(p.start) === "\\") stretch(p.start, col(p.start, 1), mark(st));
          break;
        case "html":
          stretch(p.start, p.end, { role: "html", attrs: 0, ...(st.bg ? { bg: st.bg } : {}) });
          break;
        case "link":
        case "linkReference": {
          const link: Style = { role: "link", attrs: st.attrs, ...(st.bg ? { bg: st.bg } : {}) };
          const kids = (n as { children: PhrasingContent[] }).children;
          const opener = charAt(p.start);
          if (opener === "<") {
            // An autolink: `<…>`.
            stretch(p.start, col(p.start, 1), mark(st));
            stretch(col(p.start, 1), col(p.end, -1), link);
            stretch(col(p.end, -1), p.end, mark(st));
          } else if (opener !== "[")
            stretch(p.start, p.end, link); // a bare URL (GFM)
          else {
            stretch(p.start, col(p.start, 1), mark(st));
            inline(kids, link);
            const close = kids.length ? kids[kids.length - 1]!.position!.end : col(p.start, 1);
            address(close, p.end, st);
          }
          break;
        }
        case "image":
        case "imageReference": {
          // `![alt](address)`: the alt as the render's picture, its brackets markup.
          const [l, c] = at(p.start);
          const t = text(l);
          let depth = 0;
          let close = -1;
          for (let k = c + 1; k < t.length && close < 0; k++) {
            if (t[k] === "\\") k++;
            else if (t[k] === "[") depth++;
            else if (t[k] === "]" && --depth === 0) close = k;
          }
          const url = (n as { url?: string }).url ?? "";
          const picture: Style = { role: /\.(md|markdown)$/i.test(url.split("#")[0]!) ? "embed" : "image", attrs: 0 };
          if (close < 0 || p.end.line !== p.start.line) {
            stretch(p.start, p.end, picture);
            break;
          }
          stretch(p.start, col(p.start, 2), mark(st));
          stretch(col(p.start, 2), { line: p.start.line, column: close + 1 }, picture);
          address({ line: p.start.line, column: close + 1 }, p.end, st);
          break;
        }
        case "footnoteReference":
          stretch(p.start, col(p.start, 2), mark(st));
          stretch(col(p.start, 2), col(p.end, -1), { role: "footnote", attrs: 0, ...(st.bg ? { bg: st.bg } : {}) });
          stretch(col(p.end, -1), p.end, mark(st));
          break;
        case "wikiLink": {
          const w = n as unknown as WikiLink;
          const open = w.embed ? 3 : 2;
          const role: Role = w.embed && IMAGE_FILE.test(w.target) ? "image" : w.embed ? "embed" : "wikilink";
          const shown: Style = { role, attrs: st.attrs, ...(st.bg ? { bg: st.bg } : {}) };
          if (p.end.line !== p.start.line) {
            stretch(p.start, p.end, shown);
            break;
          }
          stretch(p.start, col(p.start, open), mark(st));
          const pipe = w.value.search(/\\?\|/);
          const inner = col(p.start, open);
          if (pipe >= 0 && w.alias !== null) {
            // `[[target|alias]]`: the alias is what reads, the target its address.
            const bar = /^\\?\|/.exec(w.value.slice(pipe))![0].length;
            stretch(inner, col(inner, pipe), { role: "url", attrs: 0, ...(st.bg ? { bg: st.bg } : {}) });
            stretch(col(inner, pipe), col(inner, pipe + bar), mark(st));
            stretch(col(inner, pipe + bar), col(p.end, -2), shown);
          } else stretch(inner, col(p.end, -2), shown);
          stretch(col(p.end, -2), p.end, mark(st));
          break;
        }
        case "hashtag":
          stretch(p.start, p.end, { role: "tag", attrs: st.attrs, ...(st.bg ? { bg: st.bg } : {}) });
          break;
        default:
          if ("children" in n) inline(n.children as PhrasingContent[], st);
      }
    }
  };
  /** A table's pipes and its delimiter row, as the render's borders; its cells' text as any. */
  const table = (t: Table) => {
    const border: Style = { role: "table_border", attrs: 0 };
    const head = t.children[0]?.position;
    if (head) {
      const l = head.start.line - base; // the delimiter row, after the header's
      const d = text(l);
      put(l, LEAD.exec(d)?.[0].length ?? 0, d.trimEnd().length, border);
    }
    for (const row of t.children) {
      const rp = row.position;
      if (!rp) continue;
      const content: [number, number][] = [];
      for (const cell of row.children) {
        inline(cell.children, PLAIN);
        const first = cell.children[0]?.position;
        const last = cell.children[cell.children.length - 1]?.position;
        if (first && last) content.push([first.start.column - 1, last.end.column - 1]);
      }
      const [l, c0] = at(rp.start);
      const c1 = at(rp.end)[1];
      const r = text(l);
      for (let k = c0; k < c1; k++)
        if (r[k] === "|" && r[k - 1] !== "\\" && !content.some(([a, b]) => k >= a && k < b)) put(l, k, k + 1, border);
    }
  };
  /** Blocks: their inline content painted; definitions noted where the render's parse looks for them. */
  const block = (n: Nodes) => {
    switch (n.type) {
      case "paragraph":
      case "heading":
        inline(n.children, PLAIN);
        return;
      case "table":
        table(n);
        return;
      case "definition":
      case "footnoteDefinition":
        defs.push({
          label: n.label ?? n.identifier,
          id: n.identifier.toLowerCase(),
          footnote: n.type === "footnoteDefinition",
          line: n.position ? at(n.position.start)[0] : 0,
        });
        if (n.type === "definition") return;
        break;
      case "code":
      case "html":
        return;
    }
    const kids = (n as { children?: Nodes[] }).children;
    if (kids) for (const k of kids) block(k);
  };
  for (const n of nodes) block(n);
  for (const ps of paints) ps.sort((a, b) => a.from - b.from);
  const sigs = paints.map((ps) =>
    ps.map((x) => `${x.from}-${x.to}${x.role ?? ""}${x.promote ?? ""}${x.attrs}${x.bg ?? ""}`).join(","),
  );
  return { paints, sigs, defs, refs: refsOf(body) };
}

/** Whether a role is a heading's, whose band stays behind what's painted over it. */
const HEADING = /^h[1-6]$/;

/**
 * A line's paints over the roles the line's own highlighting gave it, as the render composes them: a style raises
 * plain text to its role (`strong`), and only adds its attributes to a heading's; what sits in a heading keeps the
 * heading's band behind it, code aside, which has its own. Returns each offset's attributes and background.
 */
export function applyPaints(roles: Role[], paints: readonly Paint[]): { attrs: number[]; bgs: (Role | undefined)[] } {
  const attrs: number[] = new Array(roles.length).fill(0);
  const bgs: (Role | undefined)[] = new Array(roles.length);
  for (const p of paints)
    for (let k = p.from; k < Math.min(p.to, roles.length); k++) {
      const base = roles[k]!;
      roles[k] = p.role ?? (p.promote && base === "text" ? p.promote : base);
      attrs[k] = p.attrs;
      bgs[k] = p.bg ?? (HEADING.test(base) && p.role !== "code_inline" ? base : undefined);
    }
  return { attrs, bgs };
}
