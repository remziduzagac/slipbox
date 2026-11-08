// Reflow (EG-D12): a note's paragraphs hard-wrapped to a width at spaces, or joined back to one line each. It works
// over the note's tree, so only paragraphs change — a list item's, a quote's, a footnote's — and headings, tables,
// fenced and indented code, HTML, maths, comments and the front matter are left as they are. Each paragraph's first
// line keeps what is before its text (a list item's marker, a task's box, a quote's `>`, a footnote's label); the lines
// after it go on at the indent the paragraph's continuation has, else at its item's text, every `>` kept. A hard break
// (two spaces or `\` at a line's end) still ends its line. A link, a wikilink, a code span, maths, inline HTML, an
// Obsidian comment and a footnote reference are never broken: one longer than the width has a line of its own.
// A callout's first line is its title, kept as it is. Pure: the text and its tree in, the edits out; widths by
// `width.ts`.

import type { Root } from "mdast";
import { expandTabs } from "../../foundation/text/sanitize.ts";
import { stringWidth } from "../../foundation/text/width.ts";

/** `wrap` to the width (`g q`), or `join` each paragraph to one line (`g shift+q`). */
export type ReflowMode = "wrap" | "join";

/** A paragraph's lines replaced: `[from, to)` in the text (its last line's ending kept), and what goes there. */
export interface ReflowEdit {
  from: number;
  to: number;
  text: string;
}

export interface Reflowed {
  /** In the text's order, none overlapping: applied from the last, each keeps the offsets before it. */
  edits: ReflowEdit[];
  /** The paragraphs the lines touch: those changed, and those already as asked. */
  paragraphs: number;
  /** The last line (from 1) of the last of them, in the text once the edits are made; 0 when there are none. */
  lastLine: number;
}

interface Point {
  line: number;
  column: number;
}
interface Node {
  type: string;
  position?: { start: Point; end: Point };
  children?: Node[];
  data?: Record<string, unknown>;
}

/** Blocks that hold blocks: where paragraphs are looked for. */
const CONTAINERS = new Set(["root", "blockquote", "list", "listItem", "footnoteDefinition"]);
/** Inline nodes whose text stays on one line: the words inside them aren't broken apart. */
const WHOLE = new Set([
  "link",
  "linkReference",
  "image",
  "imageReference",
  "inlineCode",
  "inlineMath",
  "wikiLink",
  "html",
  "footnoteReference",
  "comment",
]);

/** A paragraph, how many quotes it's in, and whether it opens its quote (where a callout's title is). */
interface Found {
  node: Node;
  quotes: number;
  opensQuote: boolean;
}

function paragraphsOf(tree: Root): Found[] {
  const out: Found[] = [];
  const walk = (n: Node, quotes: number) =>
    (n.children ?? []).forEach((c, i) => {
      if (c.type === "paragraph") {
        // An Obsidian comment over blank lines opens or closes in it: its text is the comment's.
        if (!c.data?.commentOpens && !c.data?.commentCloses)
          out.push({ node: c, quotes, opensQuote: n.type === "blockquote" && i === 0 });
      } else if (CONTAINERS.has(c.type)) walk(c, quotes + (c.type === "blockquote" ? 1 : 0));
    });
  walk(tree as unknown as Node, 0);
  return out;
}

/**
 * Whether a word would start a block at the start of a line, ending the paragraph there: a list item's marker, a
 * heading's, a quote, a fence, maths, a rule or a setext heading's underline, a tag (HTML that may open a block).
 */
export function opensBlock(word: string): boolean {
  return (
    /^(?:[-+*]|\d{1,9}[.)]|#{1,6})$/.test(word) ||
    /^(?:>|`{3}|~{3}|\$\$)/.test(word) ||
    /^(?:-+|=+|[*_]{3,})$/.test(word) ||
    /^<(?:[!?/]|[A-Za-z][\w-]*(?:[\s/>]|$))/.test(word)
  );
}

/** Whether a word ends in a backslash of its own (not an escaped one): at a line's end, that's a hard break. */
const endsInBackslash = (word: string) => /(?:^|[^\\])(?:\\\\)*\\$/.test(word);

/** How wide text is from a line's start, tabs to their stops. */
const columns = (text: string) => stringWidth(expandTabs(text, 4));

/** Where a continuation line's text starts: past its indent and up to `quotes` of `>`, each with the space after. */
function textStart(line: string, quotes: number): number {
  let i = /^[ \t]*/.exec(line)![0].length;
  for (let q = 0; q < quotes && line[i] === ">"; q++) {
    i++;
    while (line[i] === " " || line[i] === "\t") i++;
  }
  return i;
}

/**
 * The lines after a paragraph's first go on at its item's text: its first line's prefix with each list marker and a
 * footnote's label as spaces, a task's box left out (its text goes on under the item's, not the box's), each `>` kept.
 */
function continuation(prefix: string): string {
  let out = "";
  let i = 0;
  while (i < prefix.length) {
    const rest = prefix.slice(i);
    const m =
      /^[ \t>]+/.exec(rest) ??
      /^\[[ xX]\][ \t]*/.exec(rest) ??
      /^\[\^[^\]]*\]:[ \t]*/.exec(rest) ??
      /^(?:[-+*]|\d{1,9}[.)])/.exec(rest);
    const piece = m?.[0] ?? rest[0]!;
    if (/^[ \t>]/.test(piece)) out += piece;
    else if (piece.startsWith("[^")) out += "    ";
    else if (!piece.startsWith("[")) out += " ".repeat(columns(piece));
    i += piece.length;
  }
  return out;
}

/** Words, as they'll be laid out: separated by spaces, tabs and line breaks outside a whole span; inside one, a run of
 *  whitespace stays, but one holding a line break is one space. */
function wordsOf(text: string, whole: Uint8Array, from: number, to: number): string[] {
  const words: string[] = [];
  let word = "";
  const space = (i: number) => text[i] === " " || text[i] === "\t" || text[i] === "\n";
  for (let i = from; i < to; ) {
    if (!space(i)) {
      word += text[i++];
      continue;
    }
    if (!whole[i]) {
      if (word) words.push(word);
      word = "";
      i++;
      continue;
    }
    let j = i;
    while (j < to && space(j) && whole[j]) j++;
    const run = text.slice(i, j);
    word += run.includes("\n") ? " " : run;
    i = j;
  }
  if (word) words.push(word);
  return words;
}

const lineWidth = (words: string[]) => words.reduce((w, x, k) => w + (k ? 1 : 0) + stringWidth(x), 0);

/**
 * Words laid into lines of at most `firstRoom` columns, then `room`: as many as fit, greedily; a word wider than the
 * room alone on its line. A line never starts with a word that would open a block there, nor ends in a backslash that
 * would make a hard break: the words before go down with it, else it stays where it is, over the width.
 */
function fill(words: string[], firstRoom: number, room: number): string[][] {
  const lines: string[][] = [[]];
  for (const word of words) {
    const line = lines[lines.length - 1]!;
    const limit = lines.length === 1 ? firstRoom : room;
    if (!line.length || lineWidth(line) + 1 + stringWidth(word) <= limit) {
      line.push(word);
      continue;
    }
    // The next line starts at line[k] (at `word` itself for k = line.length).
    const fine = (k: number) => !opensBlock(k === line.length ? word : line[k]!) && !endsInBackslash(line[k - 1]!);
    let k = line.length;
    while (k > 0 && !fine(k)) k--;
    if (k === 0) line.push(word);
    else lines.push([...line.splice(k), word]);
  }
  return lines;
}

/** A paragraph's lines from its first to its last as `mode` makes them, or null to leave it (text after it). */
function reflowParagraph(lines: string[], p: Found, mode: ReflowMode, width: number): string[] | null {
  const { start, end } = p.node.position!;
  const raw = (line: number) => (lines[line - 1] ?? "").replace(/\r$/, "");
  if (
    raw(end.line)
      .slice(end.column - 1)
      .trim()
  )
    return null;
  // Its text, line by line, without what's before it on each; where each line's piece starts, in the line and in it.
  const firstPrefix = raw(start.line).slice(0, start.column - 1);
  const cut: number[] = [];
  const base: number[] = [];
  let text = "";
  for (let n = start.line; n <= end.line; n++) {
    const line = raw(n);
    const from = n === start.line ? start.column - 1 : textStart(line, p.quotes);
    const to = n === end.line ? end.column - 1 : line.length;
    if (n > start.line) text += "\n";
    cut.push(from);
    base.push(text.length);
    text += line.slice(from, Math.max(from, to));
  }
  const at = (pt: Point) => {
    const k = pt.line - start.line;
    if (k < 0) return 0;
    if (k >= base.length) return text.length;
    const len = (k + 1 < base.length ? base[k + 1]! - 1 : text.length) - base[k]!;
    return base[k]! + Math.max(0, Math.min(len, pt.column - 1 - cut[k]!));
  };
  // The spans kept whole, and the hard breaks (one in a link too).
  const whole = new Uint8Array(text.length);
  const breaks: { from: number; to: number; after?: string }[] = [];
  const visit = (n: Node) => {
    for (const c of n.children ?? []) {
      if (!c.position) continue;
      if (c.type === "break") breaks.push({ from: at(c.position.start), to: at(c.position.end) });
      else if (WHOLE.has(c.type)) whole.fill(1, at(c.position.start), at(c.position.end));
      if (c.type !== "break") visit(c);
    }
  };
  visit(p.node);
  // A callout's title: its first line, kept as it is — the whole paragraph, when it's one line.
  const callout = p.opensQuote && /^\[![^\]\s]+\][+-]?/.test(text);
  const nl = text.indexOf("\n");
  if (callout && nl >= 0 && !breaks.some((b) => b.from <= nl))
    breaks.push({ from: text.slice(0, nl).trimEnd().length, to: nl + 1, after: "" });
  breaks.sort((a, b) => a.from - b.from);
  // The paragraph between its breaks: each piece laid out, its break's own text (spaces, `\`) after its last line.
  const pieces: { from: number; to: number; after: string }[] = [];
  let from = 0;
  for (const b of breaks) {
    const eol = text.indexOf("\n", b.from);
    pieces.push({ from, to: b.from, after: b.after ?? text.slice(b.from, eol < 0 ? b.to : eol) });
    from = b.to;
  }
  pieces.push({ from, to: text.length, after: "" });
  let rest = continuation(firstPrefix);
  // In an item or a quote, the indent its continuation has already, where it has one: as many `>`, no narrower.
  if (rest && end.line > start.line) {
    const second = raw(start.line + 1);
    const had = second.slice(0, textStart(second, p.quotes));
    const quotes = (s: string) => s.split(">").length - 1;
    if (quotes(had) === quotes(rest) && columns(had) >= columns(rest)) rest = had;
  }
  const room = Math.max(1, width - columns(rest));
  const out: string[] = [];
  pieces.forEach((piece, k) => {
    const words = wordsOf(text, whole, piece.from, piece.to);
    const laid =
      k === 0 && callout
        ? [[text.slice(piece.from, piece.to)]]
        : mode === "join"
          ? [words]
          : fill(words, out.length ? room : Math.max(1, width - columns(firstPrefix)), room);
    for (const ws of laid) out.push((out.length ? rest : firstPrefix) + ws.join(" "));
    out[out.length - 1] += piece.after;
  });
  return out;
}

/**
 * The paragraphs lines `first` to `last` (from 1) touch, each whole, wrapped to `width` columns or joined: the edits
 * that make them so. `eol` joins the lines made; by default, the text's own.
 */
export function reflow(
  source: string,
  tree: Root,
  first: number,
  last: number,
  mode: ReflowMode,
  width: number,
  eol: string = source.includes("\r\n") ? "\r\n" : "\n",
): Reflowed {
  const lines = source.split("\n");
  const starts: number[] = [0];
  for (let i = 0; i < lines.length - 1; i++) starts.push(starts[i]! + lines[i]!.length + 1);
  const edits: ReflowEdit[] = [];
  let paragraphs = 0;
  let lastLine = 0;
  let shift = 0;
  for (const p of paragraphsOf(tree)) {
    const pos = p.node.position;
    if (!pos || pos.start.line > last || pos.end.line < first) continue;
    const made = reflowParagraph(lines, p, mode, Math.max(1, Math.floor(width)));
    if (!made) continue;
    paragraphs++;
    const from = starts[pos.start.line - 1]!;
    const to = starts[pos.end.line - 1]! + lines[pos.end.line - 1]!.replace(/\r$/, "").length;
    const text = made.join(eol);
    if (source.slice(from, to) !== text) edits.push({ from, to, text });
    shift += made.length - (pos.end.line - pos.start.line + 1);
    lastLine = pos.end.line + shift;
  }
  return { edits, paragraphs, lastLine };
}
