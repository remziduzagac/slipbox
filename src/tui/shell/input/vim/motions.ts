// Motion and text-object ranges; speculative movement restores the original view state.
import type { App, View } from "../../../app/runtime/app.ts";
import * as E from "../../../documents/editing/editing.ts";
import type { Op, Range } from "./state.ts";
/** Motions that take whole lines under an operator, and those that include the character they
 *  land on. */
const LINEWISE = new Set([
  "cursor.up",
  "cursor.down",
  "cursor.top",
  "cursor.bottom",
  "cursor.half_down",
  "cursor.half_up",
  "cursor.page_down",
  "cursor.page_up",
]);

const INCLUSIVE = new Set(["cursor.word_end", "cursor.line_end", "cursor.match_bracket"]);

/** Where a motion goes (run `count` times, then the cursor put back), as a text range. */
export async function motionRange(app: App, view: View, spec: string, count: number, op: Op): Promise<Range | null> {
  // (A shifted motion, `d shift+right`, selects as it goes: the selection, none, put back too.)
  const saved = {
    cur: view.cur,
    goal: view.goal,
    top: view.top,
    left: view.left,
    topAnchor: view.topAnchor,
    topSub: view.topSub,
    curAnchor: view.curAnchor,
    sel: view.sel,
    visual: view.visual,
  };
  const from = E.offsetOf(app, view);
  const motion = spec;
  // cw on a word changes to its end (as vim does), not to the next word's start — and on a word's
  // last character (or a one-letter word) just that character, never through the next word.
  const text = view.buf.source;
  const kind = (ch: string) => (/[\p{L}\p{N}_]/u.test(ch) ? 1 : /\s/.test(ch) ? 0 : 2);
  /** The end of the word run starting at `at` (letters, or punctuation). */
  const runEnd = (at: number) => {
    let end = at;
    const k = kind(text[at] ?? " ");
    while (end < text.length && k !== 0 && kind(text[end]!) === k) end++;
    return end;
  };
  if (op === "c" && spec === "cursor.word_next" && !/\s/.test(text[from] ?? " ")) {
    // cw: this word to its end — from its last letter, just that — then each further word counted,
    // across lines if need be; never through a word more than asked.
    let end = runEnd(from);
    for (let k = 1; k < count; k++) {
      while (end < text.length && kind(text[end]!) === 0) end++;
      if (end >= text.length) break;
      end = runEnd(end);
    }
    return { from, to: end, linewise: false };
  }
  // dw / yw on the note's last word: there's no next word for w to reach, so the rest of the line.
  if (spec === "cursor.word_next" && count === 1 && !/\S/.test(text.slice(runEnd(from)))) {
    const to = E.lineEnd(view, from);
    return to > from ? { from, to, linewise: false } : null;
  }
  // l under an operator counts characters, the last one included (d3l on "abc" takes all three).
  if (motion === "cursor.right") {
    const end = E.lineEnd(view, from);
    let b = from;
    for (let k = 0; k < count && b < end; k++) b = E.nextBoundary(text, b);
    return b > from ? { from, to: Math.min(b, end), linewise: false } : null;
  }
  // } in the note's last paragraph: to the end of its last line (vim's rule), nothing after.
  if (motion === "cursor.paragraph_next" && !/\n[ \t]*\n/.test(text.slice(from))) {
    const to = text.replace(/\s+$/, "").length;
    return to > from ? { from, to, linewise: false } : null;
  }
  for (let k = 0; k < count; k++) await app.run(motion);
  const to = E.offsetOf(app, view);
  Object.assign(view, saved);
  // dj on the last line, dk on the first: nowhere to go, so nothing (vim fails, it deletes nothing).
  if ((motion === "cursor.down" || motion === "cursor.up") && E.lineOf(view, to) === E.lineOf(view, from)) return null;
  if (LINEWISE.has(motion))
    return linesRange(view, E.lineOf(view, Math.min(from, to)), E.lineOf(view, Math.max(from, to)));
  const a = Math.min(from, to);
  let b = Math.max(from, to);
  if (INCLUSIVE.has(motion)) b = Math.min(E.nextBoundary(view.buf.source, b), Math.max(b, E.lineEnd(view, b)));
  // dw at a line's last word stops at the line's end, not the next line's first word: when the
  // motion ends at the very start of a later line (vim's rule; d3w reaching into a line's words
  // takes them).
  // } that ran into the note's last paragraph (c2} from the one before) ends at its last
  // character, taken (vim's rule), not at its last line's start.
  // (} otherwise lands on a blank line: landing on text means there was no blank line left.)
  if (motion === "cursor.paragraph_next" && b > a && E.lineText(view, E.lineOf(view, b)).trim())
    b = text.replace(/\s+$/, "").length;
  const bLine = E.lineOf(view, b);
  const aLine = E.lineOf(view, a);
  if (!INCLUSIVE.has(motion) && bLine > aLine && b === (view.buf.lineStarts()[bLine - 1] ?? -1)) {
    // vim's rule for an exclusive motion ending at a line's start (d}, db, dw): it ends at the end
    // of the line before instead — and, from at or before the first non-blank, takes whole lines
    // (so d} keeps the blank line, c} changes the paragraph's lines). Not for w, which only stops.
    b = Math.max(a, E.lineEnd(view, b - 1));
    if (motion !== "cursor.word_next" && a <= firstNonBlank(view, aLine)) return linesRange(view, aLine, bLine - 1);
  }
  if (a === b) return null;
  return { from: a, to: b, linewise: false };
}

/** Whole source lines `first`..`last` (1-based), with their line break. */
export function linesRange(view: View, first: number, last: number): Range {
  const starts = view.buf.lineStarts();
  const len = view.buf.source.length;
  const n = starts.length - (view.buf.source.endsWith("\n") ? 1 : 0);
  last = Math.min(Math.max(first, last), Math.max(1, n));
  const from = starts[first - 1] ?? len;
  const to = starts[last] ?? len;
  return { from, to, linewise: true };
}

export function firstNonBlank(view: View, src: number): number {
  return (view.buf.lineStarts()[src - 1] ?? 0) + /^\s*/.exec(E.lineText(view, src))![0].length;
}

/**
 * A text object around `at`: `w`/`W` a word (and `a` its space), quotes `"` `'` `` ` `` on the
 * line, brackets `(` `b` `[` `{` `B` `<` across lines, `p` a paragraph (whole lines).
 */
export function textObject(view: View, at: number, kind: "i" | "a", ch: string, count = 1): Range | null {
  const src = view.buf.source;
  const line = E.lineOf(view, at);
  const ls = view.buf.lineStarts()[line - 1] ?? 0;
  const text = E.lineText(view, line);
  const i = at - ls;
  if ((ch === "w" || ch === "W" || ch === "p") && count > 1) {
    // 2aw, 2ap: this one, then the next, each taken from where the last ended.
    let r = textObject(view, at, kind, ch, 1);
    const end = ch === "p" ? src.length : ls + text.length; // words stay on the line; paragraphs don't
    for (let k = 1; r && k < count && r.to < end; k++) {
      const next = textObject(view, r.to, kind, ch, 1);
      if (!next || next.to <= r.to) break;
      r = { ...r, to: next.to };
    }
    return r;
  }
  if (ch === "w" || ch === "W") {
    const cls = (c: string | undefined) =>
      c === undefined ? -1 : /\s/.test(c) ? 0 : ch === "W" || /[\p{L}\p{N}_]/u.test(c) ? 1 : 2;
    const k = cls(text[i]);
    if (k < 0) return null;
    let a = i;
    let b = i;
    while (a > 0 && cls(text[a - 1]) === k) a--;
    while (b < text.length && cls(text[b]) === k) b++;
    if (kind === "a") {
      if (k !== 0 && /\s/.test(text[b] ?? "x")) while (b < text.length && /\s/.test(text[b]!)) b++;
      else if (k !== 0) while (a > 0 && /\s/.test(text[a - 1]!)) a--;
    }
    return { from: ls + a, to: ls + b, linewise: false };
  }
  if (ch === '"' || ch === "'" || ch === "`") {
    const qs: number[] = [];
    for (let k = 0; k < text.length; k++) if (text[k] === ch && text[k - 1] !== "\\") qs.push(k);
    for (let k = 0; k + 1 < qs.length; k += 2) {
      const [a, b] = [qs[k]!, qs[k + 1]!];
      if (i <= b && (i >= a || k === 0 || i > qs[k - 1]!)) {
        if (kind === "i") return { from: ls + a + 1, to: ls + b, linewise: false };
        // a": the quotes, and the white space after them (else before them), as vim takes it.
        let [x, y] = [a, b + 1];
        if (/[ \t]/.test(text[y] ?? "")) while (/[ \t]/.test(text[y] ?? "")) y++;
        else while (x > 0 && /[ \t]/.test(text[x - 1]!)) x--;
        return { from: ls + x, to: ls + y, linewise: false };
      }
    }
    return null;
  }
  const pairs: Record<string, [string, string]> = {
    "(": ["(", ")"],
    ")": ["(", ")"],
    b: ["(", ")"],
    "[": ["[", "]"],
    "]": ["[", "]"],
    "{": ["{", "}"],
    "}": ["{", "}"],
    B: ["{", "}"],
    "<": ["<", ">"],
    ">": ["<", ">"],
  };
  const pair = pairs[ch];
  if (pair) {
    const [open, close] = pair;
    let a = -1;
    let depth = 0;
    let found = 0;
    for (let k = at; k >= 0; k--) {
      if (src[k] === close && k !== at) depth++;
      else if (src[k] === open) {
        if (depth === 0) {
          if (++found === count) {
            a = k;
            break;
          }
        } else depth--;
      }
    }
    if (a < 0) return null;
    depth = 0;
    for (let k = a + 1; k < src.length; k++) {
      if (src[k] === open) depth++;
      else if (src[k] === close) {
        if (depth === 0) {
          if (kind === "a") return { from: a, to: k + 1, linewise: false };
          // The brackets on lines of their own around the inside (f(⏎ … ⏎)): the lines between,
          // whole (vim's rule), so ci( keeps the brackets' lines.
          const openLine = E.lineOf(view, a);
          const closeLine = E.lineOf(view, k);
          const afterOpen = src.slice(a + 1, E.lineEnd(view, a));
          const beforeClose = src.slice(view.buf.lineStarts()[closeLine - 1] ?? 0, k);
          if (closeLine - openLine >= 2 && !afterOpen.trim() && !beforeClose.trim())
            return linesRange(view, openLine + 1, closeLine - 1);
          return { from: a + 1, to: k, linewise: false };
        }
        depth--;
      }
    }
    return null;
  }
  if (ch === "p") {
    const n = view.buf.lineStarts().length - (src.endsWith("\n") ? 1 : 0);
    const blank = (l: number) => !E.lineText(view, l).trim();
    const b0 = blank(line);
    let first = line;
    let last = line;
    while (first > 1 && blank(first - 1) === b0) first--;
    while (last < n && blank(last + 1) === b0) last++;
    if (kind === "a") {
      const before = last;
      while (last < n && blank(last + 1) !== b0) last++;
      // Nothing blank after the paragraph (the note's last): the blank lines before it instead.
      if (last === before && !b0) while (first > 1 && blank(first - 1)) first--;
    }
    return linesRange(view, first, last);
  }
  return null;
}
