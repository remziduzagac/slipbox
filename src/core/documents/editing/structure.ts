// The structure around the cursor (EG-D6, EG-D7), pure: offsets in, offsets out. A note's text objects from its
// Markdown tree — `h` a section, `l` a list item, `o` a fenced block, `k` a link — and code's from the syntax worker's
// answer (`f` a function, `c` a class or type, `a` an argument, `o` a block); the starts the syntax jumps go to; the
// node next out from a selection, for growing it. The TUI's `Structure` (tui/documents/editing/structure.ts) reads
// them for a window: which text, and where the code's answer comes from.

import type { Nodes, Root } from "mdast";
import type { CodeObject } from "../syntax/contracts.ts";
import { visit } from "../markdown/parse/visit.ts";

/** A stretch of text: `from` to `to`, UTF-16 offsets, `to` exclusive. */
export interface Span {
  from: number;
  to: number;
}

/** What a text object takes: whole lines (with their line break) or characters. */
export interface Piece extends Span {
  linewise: boolean;
}

/** A text object found: what `a` takes and what `i` does (null: nothing inside, an empty section or fence). */
export interface Found {
  outer: Piece;
  inner: Piece | null;
}

/** A note's object, its kind by the letter it's typed with. */
export interface NoteObject extends Found {
  kind: "h" | "l" | "o" | "k";
}

/** A fenced (or indented) code block: its whole, its code's lines and its language as written. */
export interface Fence extends Span {
  code: Span;
  lang: string | null;
}

/** What a note's structure keys read: its objects, its fenced blocks, and its nodes for growing a selection. */
export interface NoteStructure {
  objects: NoteObject[];
  fences: Fence[];
  nodes: Span[];
}

/** Where each line starts (the first at 0), split at `\n`. */
export function lineStarts(source: string): number[] {
  const out = [0];
  for (let i = source.indexOf("\n"); i >= 0; i = source.indexOf("\n", i + 1)) out.push(i + 1);
  return out;
}

/** The line (0-based) holding offset `at`. */
function lineAt(starts: number[], at: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= at) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Where line `n` (0-based) starts, or the text's end past its last. */
const startOf = (source: string, starts: number[], n: number) => starts[n] ?? source.length;

/** Whole lines `first`..`last` (0-based): from the first's start to the next one's. */
function lines(source: string, starts: number[], first: number, last: number): Piece {
  return { from: startOf(source, starts, first), to: startOf(source, starts, last + 1), linewise: true };
}

/** A span without the white space at its ends; null when nothing else is left. */
export function trimmed(source: string, s: Span): Span | null {
  let { from, to } = s;
  while (from < to && /\s/.test(source[from]!)) from++;
  while (to > from && /\s/.test(source[to - 1]!)) to--;
  return to > from ? { from, to } : null;
}

/**
 * An inside as `i` takes it, vim's way for brackets: the lines between when it opens at its line's end and closes at
 * its line's start (`{⏎ … ⏎}`); its lines whole when it starts at its line's first character that isn't white space
 * and ends at its last's end (Python's block); else its characters. A quote's `>` before a line leaves it starting
 * there: a fenced block in a quote.
 */
export function insideAsLines(source: string, starts: number[], s: Span): Piece {
  const a = lineAt(starts, s.from);
  const b = lineAt(starts, s.to);
  const head = source.slice(s.from, startOf(source, starts, a + 1)).trim();
  const tail = source.slice(starts[b]!, s.to);
  if (b > a && !head && LEAD.test(tail))
    return b - a >= 2 ? lines(source, starts, a + 1, b - 1) : { ...s, linewise: false };
  const before = source.slice(starts[a]!, s.from);
  const after = source.slice(s.to, Math.max(s.to, startOf(source, starts, b + 1) - 1)).trim();
  if (s.to > s.from && LEAD.test(before) && !after) return lines(source, starts, a, b);
  return { ...s, linewise: false };
}

/** What may come before a line's text and leave it starting there: white space, a quote's `>`. */
const LEAD = /^[\s>]*$/;

/** A whole that starts at its line's first character that isn't white space or a quote's `>`, and ends at its line's
 *  end: its lines; else its characters. */
function wholeLines(source: string, starts: number[], s: Span): Piece {
  const a = lineAt(starts, s.from);
  const b = lineAt(starts, Math.max(s.from, s.to - 1));
  const before = source.slice(starts[a]!, s.from);
  const after = source.slice(s.to, Math.max(s.to, startOf(source, starts, b + 1) - 1));
  return LEAD.test(before) && !after.trim() ? lines(source, starts, a, b) : { ...s, linewise: false };
}

/** The objects of a note, its fenced blocks, and its nodes, from its Markdown tree (positions by line and column). */
export function noteStructure(source: string, tree: Root, starts = lineStarts(source)): NoteStructure {
  const off = (p: { line: number; column: number }) =>
    Math.min(source.length, (starts[p.line - 1] ?? source.length) + p.column - 1);
  const span = (n: Nodes): Span | null =>
    n.position ? { from: off(n.position.start), to: off(n.position.end) } : null;
  const objects: NoteObject[] = [];
  const fences: Fence[] = [];
  const nodes: Span[] = [];
  const headings: { depth: number; from: number; line: number; endLine: number }[] = [];
  visit(tree, (n) => {
    const s = span(n);
    if (!s) return;
    if (n.type !== "text") nodes.push(s);
    if (n.type === "heading") {
      const endLine = lineAt(starts, Math.max(s.from, s.to - 1));
      headings.push({ depth: n.depth, from: s.from, line: lineAt(starts, s.from), endLine });
    } else if (n.type === "listItem") objects.push(listItem(source, starts, n, s, span));
    else if (n.type === "code") {
      const fence = fenceOf(source, starts, s, n.lang ?? null);
      fences.push(fence);
      const a = lineAt(starts, s.from);
      const b = lineAt(starts, Math.max(s.from, s.to - 1));
      const inner = fence.code.to > fence.code.from ? { ...fence.code, linewise: true } : null;
      objects.push({ kind: "o", outer: lines(source, starts, a, b), inner });
      if (inner) nodes.push(inner);
    } else if (n.type === "link" || n.type === "linkReference" || n.type === "image" || n.type === "wikiLink")
      objects.push({
        kind: "k",
        outer: { ...s, linewise: false },
        inner: { ...linkText(source, starts, n, s), linewise: false },
      });
  });
  // A section: its heading to the next of its level or higher; inside, the lines after its heading.
  headings.forEach((h, k) => {
    const next = headings.slice(k + 1).find((x) => x.depth <= h.depth);
    const last = (next ? next.line : lineAt(starts, source.length) + (source.endsWith("\n") ? 0 : 1)) - 1;
    const outer = lines(source, starts, h.line, Math.max(h.line, last));
    const inner = last > h.endLine ? lines(source, starts, h.endLine + 1, last) : null;
    objects.push({ kind: "h", outer, inner });
    nodes.push(outer);
  });
  return { objects, fences, nodes: nodes.flatMap((s) => trimmed(source, s) ?? []) };
}

/** A list item: its lines whole (or its characters, sharing a line), and inside, its text without its marker (a task's
 *  box too) — its own, not the items nested in it. */
function listItem(
  source: string,
  starts: number[],
  n: Extract<Nodes, { type: "listItem" }>,
  s: Span,
  span: (n: Nodes) => Span | null,
): NoteObject {
  const own = n.children.filter((c) => c.type !== "list");
  const first = own[0] ? span(own[0]) : null;
  const last = own.length ? span(own[own.length - 1]!) : null;
  const marker = /^(?:[-*+]|\d{1,9}[.)])[ \t]?/.exec(source.slice(s.from, s.to))?.[0].length ?? 0;
  const from = first?.from ?? s.from + marker;
  return {
    kind: "l",
    outer: wholeLines(source, starts, s),
    inner: { from, to: Math.max(from, last?.to ?? from), linewise: false },
  };
}

/** A code block's code: the lines between its fences (an unclosed one's to its end), an indented one's all. */
function fenceOf(source: string, starts: number[], s: Span, lang: string | null): Fence {
  const a = lineAt(starts, s.from);
  const b = lineAt(starts, Math.max(s.from, s.to - 1));
  const text = (n: number) => source.slice(starts[n]!, Math.max(starts[n]!, startOf(source, starts, n + 1) - 1));
  const fence = /^[\s>]*(`{3,}|~{3,})/.exec(text(a))?.[1];
  if (!fence) return { ...s, code: lines(source, starts, a, b), lang };
  const closed = b > a && new RegExp(`^[\\s>]*${fence[0]}{${fence.length},}\\s*$`).test(text(b));
  const last = closed ? b - 1 : b;
  return { ...s, code: last > a ? lines(source, starts, a + 1, last) : { from: s.to, to: s.to }, lang };
}

/** A link's text: `[text]`'s, an image's alt, a wikilink's alias or else its target, an autolink's address. */
function linkText(source: string, starts: number[], n: Nodes, s: Span): Span {
  const raw = source.slice(s.from, s.to);
  if (n.type === "wikiLink") {
    const open = raw.startsWith("!") ? 3 : 2;
    const pipe = raw.indexOf("|", open);
    const close = Math.max(open, raw.length - 2);
    return pipe >= 0 && pipe < close
      ? { from: s.from + pipe + 1, to: s.from + close }
      : { from: s.from + open, to: s.from + close };
  }
  if (n.type === "image") {
    const alt = /^!\[((?:\\.|[^\]\\])*)\]/.exec(raw);
    return { from: s.from + 2, to: s.from + 2 + (alt?.[1]?.length ?? 0) };
  }
  const kids = "children" in n ? n.children : [];
  const first = kids[0]?.position;
  const last = kids[kids.length - 1]?.position;
  if (first && last) {
    const off = (p: { line: number; column: number }) => (starts[p.line - 1] ?? 0) + p.column - 1;
    return { from: off(first.start), to: off(last.end) };
  }
  // `[](url)`: nothing inside, just after its `[`.
  return { from: s.from + 1, to: s.from + 1 };
}

/**
 * The object around `at`, the innermost first — the `count`th outward. `ahead`: one the cursor isn't on, the next on its
 * line, as vim's quotes are found (a link). `byInside`: those whose inside holds the cursor first, then by their whole
 * (an argument, whose whole takes the comma and space beside the next).
 */
export function objectAt<T extends Found>(
  source: string,
  objects: T[],
  at: number,
  count = 1,
  opts: { ahead?: boolean; byInside?: boolean } = {},
): T | null {
  const inside = (s: Span) => s.from <= at && (at < s.to || (s.from === s.to && at === s.from));
  const first = (o: T) => (opts.byInside && !(o.inner && inside(o.inner)) ? 1 : 0);
  const around = objects
    .filter((o) => inside(o.outer) || (o.inner !== null && inside(o.inner)))
    .sort((a, b) => first(a) - first(b) || a.outer.to - a.outer.from - (b.outer.to - b.outer.from));
  const found = around[Math.max(0, count - 1)] ?? null;
  if (found || !opts.ahead || around.length) return found;
  const end = source.indexOf("\n", at);
  return objects.find((o) => o.outer.from > at && (end < 0 || o.outer.from < end)) ?? null;
}

/** A code object as `objectAt` takes one: its whole, its inside as `i` takes it — an argument's by characters. */
export function codeFound(source: string, starts: number[], o: CodeObject): Found {
  const inner = { from: o.inner[0], to: o.inner[1] };
  if (o.kind === "argument")
    return { outer: { from: o.from, to: o.to, linewise: false }, inner: { ...inner, linewise: false } };
  // A definition's or a block's whole: its lines when it has them to itself, else its characters.
  return { outer: wholeLines(source, starts, o), inner: insideAsLines(source, starts, inner) };
}

/** The `count`th start after `at` (`dir` 1) or before it (-1), or null: no jump past the file's ends. */
export function nextStart(starts: number[], at: number, dir: 1 | -1, count = 1): number | null {
  const sorted = [...new Set(starts)].sort((a, b) => a - b);
  const list = dir === 1 ? sorted.filter((s) => s > at) : sorted.filter((s) => s < at).reverse();
  return list.length ? list[Math.min(count, list.length) - 1]! : null;
}

/** The smallest node that holds `sel` and is larger than it; null at the top. */
export function enclosing(nodes: Span[], sel: Span): Span | null {
  let best: Span | null = null;
  for (const n of nodes)
    if (n.from <= sel.from && n.to >= sel.to && n.to - n.from > sel.to - sel.from)
      if (!best || n.to - n.from < best.to - best.from) best = n;
  return best;
}

/** The word at `at` — letters, digits, `_` and marks, as `w` reads one — or null off one. */
export function wordAt(source: string, at: number): Span | null {
  const word = /[\p{L}\p{N}\p{M}_]/u;
  if (!word.test(source[at] ?? "")) return null;
  let from = at;
  let to = at;
  while (from > 0 && word.test(source[from - 1]!)) from--;
  while (to < source.length && word.test(source[to]!)) to++;
  return { from, to };
}

/** Pairs of offsets (`from, to, …`) as spans, plus `shift`. */
export function spansOf(pairs: ArrayLike<number>, shift = 0): Span[] {
  const out: Span[] = [];
  for (let i = 0; i + 1 < pairs.length; i += 2) out.push({ from: pairs[i]! + shift, to: pairs[i + 1]! + shift });
  return out;
}
