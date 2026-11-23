// Surround (EG-D8), pure: offsets in, edits out. A pair of marks put around a stretch of text — `*` italic, `b` bold,
// `` ` `` code (as many backticks as the text needs), `~` strikethrough, `l` a link (its target left empty), the
// brackets and the quotes — and the nearest pair of a mark around a place, to take out or change: emphasis, code and
// links by the note's Markdown tree, brackets across lines as `%` counts them, quotes on the line as vim's quote objects
// find them. The TUI's `tui/documents/editing/surround.ts` reads the keys and makes the edits.

import type { Nodes, Root } from "mdast";
import { visit } from "../markdown/parse/visit.ts";
import { lineStarts, linkText, type Span, trimmed } from "./structure.ts";

/** A surround mark, by the key it's typed with. */
export type Mark = "*" | "b" | "`" | "~" | "l" | "(" | "[" | "{" | "<" | '"' | "'";

/** The marks' keys, as a message lists them. */
export const MARK_KEYS = "* b ` ~ l ( [ { < \" '";

const MARKS = new Set<string>(MARK_KEYS.split(" "));

/** A closing bracket names the same pair as its opening one. */
const CLOSING: Record<string, Mark> = { ")": "(", "]": "[", "}": "{", ">": "<" };

const BRACKETS: Record<string, string> = { "(": ")", "[": "]", "{": "}", "<": ">" };

/** The mark a typed key names, or null. */
export function markOf(ch: string): Mark | null {
  return CLOSING[ch] ?? (MARKS.has(ch) ? (ch as Mark) : null);
}

/** What each mark is, as a message names it. */
export const MARK_NAMES: Record<Mark, string> = {
  "*": "italic",
  b: "bold",
  "`": "code span",
  "~": "strikethrough",
  l: "link",
  "(": "( )",
  "[": "[ ]",
  "{": "{ }",
  "<": "< >",
  '"': '" "',
  "'": "' '",
};

/** The marks found by a Markdown note's tree alone: a file that isn't one has nothing to find them by. */
export const NOTE_MARKS = new Set<Mark>(["*", "b", "~", "l"]);

/** A change to the text: `from` to `to` replaced by `text`. */
export interface Edit {
  from: number;
  to: number;
  text: string;
}

/** The edits, in the text's order, and where things are after them: the opening mark's start, the text inside, and a
 *  link's empty target (null for any other mark). */
export interface Surrounded {
  edits: Edit[];
  start: number;
  inside: Span;
  target: number | null;
}

/** A pair found: its whole, its marks included, and the text inside them. */
export interface Pair {
  outer: Span;
  inner: Span;
}

/** A code span's backticks: one more than the longest run in `text`, and a space inside them when it starts or ends
 *  with one (CommonMark takes that space away again). */
function codeMarks(text: string): [string, string] {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const ticks = "`".repeat(longest + 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return [ticks + pad, pad + ticks];
}

/** The opening and closing marks `mark` puts around `text`. */
export function marksOf(mark: Mark, text: string): [string, string] {
  if (mark === "*") return ["*", "*"];
  if (mark === "b") return ["**", "**"];
  if (mark === "~") return ["~~", "~~"];
  if (mark === "`") return codeMarks(text);
  if (mark === "l") return ["[", "]()"];
  return [mark, BRACKETS[mark] ?? mark];
}

/** `pair`'s marks replaced by `open` and `close`, the text inside kept; `link`: the target is the empty `()` closing
 *  it. */
function replaced(pair: Pair, open: string, close: string, link: boolean): Surrounded {
  const { outer, inner } = pair;
  const from = outer.from + open.length;
  const to = from + inner.to - inner.from;
  return {
    edits: [
      { from: outer.from, to: inner.from, text: open },
      { from: inner.to, to: outer.to, text: close },
    ],
    start: outer.from,
    inside: { from, to },
    target: link ? to + 2 : null,
  };
}

/** `span` wrapped in `mark`'s pair, the white space at its ends left outside (a word's space after it, a line's
 *  indent); null when it's only white space. */
export function addPair(source: string, span: Span, mark: Mark): Surrounded | null {
  const t = trimmed(source, span);
  if (!t) return null;
  return replaced({ outer: t, inner: t }, ...marksOf(mark, source.slice(t.from, t.to)), mark === "l");
}

/** `pair`'s marks taken out, the text inside kept. */
export function deletePair(pair: Pair): Surrounded {
  return replaced(pair, "", "", false);
}

/** `pair`'s marks changed to `mark`'s, the text inside kept. */
export function changePair(source: string, pair: Pair, mark: Mark): Surrounded {
  return replaced(pair, ...marksOf(mark, source.slice(pair.inner.from, pair.inner.to)), mark === "l");
}

/** The characters typing wraps a selection in (EG-D8, with `[editor] auto_pairs`): brackets and quotes anywhere, and
 *  `*` and `~` in a Markdown note's text, where they're marks (in code, operators: typed as they are). */
export const TYPED_WRAPS: Record<string, string> = { "(": ")", "[": "]", "{": "}", '"': '"', "'": "'", "`": "`" };
export const TYPED_NOTE_WRAPS: Record<string, string> = { "*": "*", "~": "~" };

/** A selection typed over with `ch`: wrapped in it and its closing half, as typed (`*` twice makes bold). */
export function wrapTyped(span: Span, ch: string): Surrounded {
  return replaced({ outer: span, inner: span }, ch, TYPED_WRAPS[ch] ?? TYPED_NOTE_WRAPS[ch] ?? ch, false);
}

/**
 * The nearest pair of `mark` around `at`: by the Markdown tree for emphasis, code and links (`tree`: the note's; null
 * for a file that isn't a Markdown note, where a backtick is found as a quote is and the others not at all); brackets
 * across lines, past those of their kind nested between; quotes on the line, the next pair when the cursor is before
 * it, as vim's `i"` finds one.
 */
export function pairAt(
  source: string,
  at: number,
  mark: Mark,
  tree: Root | null,
  starts = lineStarts(source),
): Pair | null {
  const close = BRACKETS[mark];
  if (close) return bracketPair(source, at, mark, close);
  if (mark === '"' || mark === "'" || (mark === "`" && !tree)) return quotePair(source, at, mark);
  return tree ? nodePair(source, at, mark, tree, starts) : null;
}

/** The brackets around `at` (one at `at` counts), past the pairs of their kind nested between. */
function bracketPair(source: string, at: number, open: string, close: string): Pair | null {
  let from = -1;
  for (let k = Math.min(at, source.length - 1), depth = 0; k >= 0; k--) {
    if (source[k] === close && k !== at) depth++;
    else if (source[k] === open) {
      if (depth === 0) {
        from = k;
        break;
      }
      depth--;
    }
  }
  if (from < 0) return null;
  for (let k = from + 1, depth = 0; k < source.length; k++) {
    if (source[k] === open) depth++;
    else if (source[k] === close) {
      if (depth === 0) return { outer: { from, to: k + 1 }, inner: { from: from + 1, to: k } };
      depth--;
    }
  }
  return null;
}

/** The quotes around `at` on its line — paired from the line's start, one escaped by `\` passed over — or, before
 *  a pair, the next one. */
function quotePair(source: string, at: number, q: string): Pair | null {
  const start = source.lastIndexOf("\n", at - 1) + 1;
  const nl = source.indexOf("\n", at);
  const text = source.slice(start, nl < 0 ? source.length : nl);
  const i = at - start;
  const qs: number[] = [];
  for (let k = 0; k < text.length; k++) if (text[k] === q && text[k - 1] !== "\\") qs.push(k);
  for (let k = 0; k + 1 < qs.length; k += 2) {
    const [a, b] = [qs[k]!, qs[k + 1]!];
    if (i <= b && (i >= a || k === 0 || i > qs[k - 1]!))
      return { outer: { from: start + a, to: start + b + 1 }, inner: { from: start + a + 1, to: start + b } };
  }
  return null;
}

/** The tree's node types each mark is. */
const NODES: Partial<Record<Mark, string[]>> = {
  "*": ["emphasis"],
  b: ["strong"],
  "~": ["delete"],
  "`": ["inlineCode"],
  l: ["link", "linkReference", "wikiLink"],
};

/** The smallest node of `mark`'s kinds holding `at`, as a pair: its whole, and the text between its marks. */
function nodePair(source: string, at: number, mark: Mark, tree: Root, starts: number[]): Pair | null {
  const kinds = NODES[mark] ?? [];
  const off = (p: { line: number; column: number }) =>
    Math.min(source.length, (starts[p.line - 1] ?? source.length) + p.column - 1);
  let best: Pair | null = null;
  visit(tree, (n) => {
    if (!kinds.includes(n.type) || !n.position) return;
    const outer = { from: off(n.position.start), to: off(n.position.end) };
    if (outer.from > at || at >= outer.to) return;
    if (best && best.outer.to - best.outer.from <= outer.to - outer.from) return;
    const inner = innerOf(source, starts, n, outer);
    // A bare address (an autolink without its `<` `>`) has no marks to take.
    if (inner && (inner.from > outer.from || inner.to < outer.to)) best = { outer, inner };
  });
  return best;
}

/** The text between a node's marks: a code span's between its backticks (and the space CommonMark takes away), a
 *  link's text, emphasis's children. */
function innerOf(source: string, starts: number[], n: Nodes, outer: Span): Span | null {
  if (n.type === "inlineCode") {
    const ticks = /^`+/.exec(source.slice(outer.from, outer.to))?.[0].length ?? 0;
    let from = outer.from + ticks;
    let to = outer.to - ticks;
    const text = source.slice(from, to);
    if (text.length > 1 && text.startsWith(" ") && text.endsWith(" ") && text.trim()) [from, to] = [from + 1, to - 1];
    return to >= from ? { from, to } : null;
  }
  if (n.type === "link" || n.type === "linkReference" || n.type === "wikiLink")
    return linkText(source, starts, n, outer);
  const kids = "children" in n ? n.children : [];
  const first = kids[0]?.position;
  const last = kids[kids.length - 1]?.position;
  if (!first || !last) return null;
  const off = (p: { line: number; column: number }) => (starts[p.line - 1] ?? 0) + p.column - 1;
  return { from: off(first.start), to: off(last.end) };
}
