// The vim-shaped normal mode of source mode (phase 3 step 3): counts, operators waiting for a
// motion or a text object, a register, and `.`. Each operator and edit is a named command (in
// actions.ts, bound in `[keys.source]`); this file is the grammar around them — what follows an
// operator is read here, the way which-key reads what follows a prefix.

import type { App, View } from "./app.ts";
import * as C from "./cursor.ts";
import * as E from "./editing.ts";

type Op = "d" | "c" | "y" | ">" | "<";
export type FindKind = "f" | "F" | "t" | "T";

export function reverseFind(k: FindKind): FindKind {
  return ({ f: "F", F: "f", t: "T", T: "t" } as const)[k];
}

export interface VimState {
  /** Digits typed before a command (`3dw`, `d3w`). */
  count: string;
  /** An operator waiting for its motion: which, its count, the motion keys so far. */
  op: { op: Op; count: number; keys: string[]; object: "i" | "a" | null; char: FindKind | null } | null;
  /** A command waiting for one character (`r`). */
  awaitChar: ((ch: string) => void) | null;
  /** The last f / F / t / T and its character, for ; and ,. */
  lastFind: { kind: FindKind; ch: string } | null;
  /** An operator waiting for a search to finish (d/foo): where it started. */
  searchOp: { op: Op; from: number } | null;
  /** The unnamed register: the last text deleted, changed or yanked. */
  register: { text: string; linewise: boolean } | null;
  /** The keys of the last change, for `.`, and the ones of the change being made. */
  lastChange: string[] | null;
  seq: string[];
  seqVersion: number;
  replaying: boolean;
  /** Set by undo/redo, which change the text but aren't changes to repeat. */
  undoing: boolean;
}

export function newVimState(): VimState {
  return { count: "", op: null, awaitChar: null, lastFind: null, searchOp: null, register: null, lastChange: null, seq: [], seqVersion: -1, replaying: false, undoing: false };
}

/** The count typed before a command (1 without one); reading it clears it. */
export function takeCount(app: App): number {
  const n = Number(app.vim.count) || 1;
  app.vim.count = "";
  return Math.min(n, 10000);
}

function idle(app: App, view: View): boolean {
  const s = app.vim;
  return !s.count && !s.op && !s.awaitChar && !view.insert;
}

/**
 * Before the keymaps, in a source window in normal mode: counts, an operator's motion, a character
 * for `r`. True when the key was used here. Also records each change's keys, for `.`.
 */
export async function vimKey(app: App, view: View, key: string, dispatch: () => Promise<void>): Promise<void> {
  const s = app.vim;
  // Keys replayed by `.` are handled, not recorded.
  if (s.replaying) return handle(app, view, key, dispatch);
  const start = idle(app, view) && !app.pending.length;
  if (start) {
    s.seq = [];
    s.seqVersion = view.buf.version;
    s.undoing = false;
  }
  s.seq.push(key);
  await handle(app, view, key, dispatch);
  // Back to rest: if the text changed (and it wasn't undo), this was a change to repeat.
  if (idle(app, view) && !app.pending.length && !s.undoing && view.buf.version !== s.seqVersion) s.lastChange = [...s.seq];
}

async function handle(app: App, view: View, key: string, dispatch: () => Promise<void>): Promise<void> {
  const s = app.vim;
  if (s.awaitChar) {
    const f = s.awaitChar;
    s.awaitChar = null;
    const ch = key === "space" ? " " : [...key].length === 1 ? key : /^shift\+.$/.test(key) ? key.slice(6).toUpperCase() : null;
    if (ch !== null) f(ch);
    return;
  }
  // A count: 1-9, then 0 too.
  if (!app.pending.length && (/^[1-9]$/.test(key) || (key === "0" && s.count))) {
    s.count += key;
    return;
  }
  if (s.op) return operatorKey(app, view, key);
  // A motion with a count moves that many times; anything else is the keymaps' (the count stays
  // for the command to read).
  if (s.count && !app.pending.length) {
    const spec = app.keymap.lookup(key);
    // (f and t read their count themselves.)
    if (spec?.startsWith("cursor.") && !spec.startsWith("cursor.find_") && !app.keymap.isPrefix(key) && !app.sourceKeys.lookup(key)) {
      const n = takeCount(app);
      for (let k = 0; k < n; k++) await app.run(spec);
      return;
    }
  }
  await dispatch();
  if (!s.op && !s.awaitChar && !app.pending.length) s.count = "";
}

/** Start an operator (the command bound to `d`, `c`…): it waits for a motion or a text object. */
export function startOperator(app: App, op: Op): void {
  app.vim.op = { op, count: takeCount(app), keys: [], object: null, char: null };
}

async function operatorKey(app: App, view: View, key: string): Promise<void> {
  const s = app.vim;
  const o = s.op!;
  const cancel = () => {
    s.op = null;
    s.count = "";
  };
  if (key === "escape" || key === "ctrl+c") return cancel();
  const count = o.count * (Number(s.count) || 1);
  s.count = "";
  // f / t after the operator: this key is the character.
  if (o.char) {
    s.op = null;
    const ch = key === "space" ? " " : [...key].length === 1 ? key : /^shift\+.$/.test(key) ? key.slice(6).toUpperCase() : null;
    if (ch === null) return;
    s.lastFind = { kind: o.char, ch };
    return findRange(app, view, o.op, o.char, ch, count, false);
  }
  // A text object: i or a, then its character.
  if (o.object) {
    const ch = key === "shift+9" ? "(" : key;
    const r = textObject(view, E.offsetOf(app, view), o.object, ch, count);
    s.op = null;
    if (!r) return app.message("info", `no ${o.object}${ch} here`);
    return apply(app, view, o.op, r);
  }
  if (!o.keys.length && (key === "i" || key === "a")) {
    o.object = key;
    return;
  }
  // The operator doubled (dd, cc, yy, >>, <<): whole lines, count of them.
  const opKey = { d: "d", c: "c", y: "y", ">": ">", "<": "<" }[o.op];
  if (!o.keys.length && key === opKey) {
    s.op = null;
    const at = E.offsetOf(app, view);
    const first = E.lineOf(view, at);
    return apply(app, view, o.op, linesRange(view, first, first + count - 1));
  }
  // A motion, possibly of several keys (g g).
  o.keys.push(key);
  const seq = o.keys.join(" ");
  const spec = app.keymap.lookup(seq);
  if (!spec && app.keymap.isPrefix(seq)) return;
  // f F t T wait for their character; ; and , use the last one.
  if (spec?.startsWith("cursor.find_char")) {
    const arg = spec.split(" ")[1];
    o.char = (arg === "F" || arg === "t" || arg === "T" ? arg : "f") as FindKind;
    o.count = count;
    return;
  }
  s.op = null;
  if (spec?.startsWith("cursor.find_repeat")) {
    const f = s.lastFind;
    if (!f) return app.message("info", "no f or t to repeat yet");
    return findRange(app, view, o.op, spec.endsWith("back") ? reverseFind(f.kind) : f.kind, f.ch, count, true);
  }
  // A search: the operator covers the text up to where it lands (finishSearchOp).
  if (spec === "find.open") {
    s.searchOp = { op: o.op, from: E.offsetOf(app, view) };
    return app.run(spec);
  }
  if (!spec?.startsWith("cursor.") && spec !== "find.next" && spec !== "find.prev") return app.message("info", `${o.op} doesn't take ${seq}`);
  const r = await motionRange(app, view, spec, count, o.op);
  if (r) return apply(app, view, o.op, r);
}

export interface Range {
  from: number;
  to: number;
  linewise: boolean;
}

/** Motions that take whole lines under an operator, and those that include the character they
 *  land on. */
const LINEWISE = new Set(["cursor.up", "cursor.down", "cursor.top", "cursor.bottom", "cursor.half_down", "cursor.half_up", "cursor.page_down", "cursor.page_up"]);
const INCLUSIVE = new Set(["cursor.word_end", "cursor.line_end"]);

/** Where a motion goes (run `count` times, then the cursor put back), as a text range. */
async function motionRange(app: App, view: View, spec: string, count: number, op: Op): Promise<Range | null> {
  const saved = { cur: view.cur, goal: view.goal, top: view.top, left: view.left, topAnchor: view.topAnchor, curAnchor: view.curAnchor };
  const from = E.offsetOf(app, view);
  let motion = spec;
  // cw on a word changes to its end (as vim does), not to the next word's start.
  if (op === "c" && spec === "cursor.word_next" && !/\s/.test(view.buf.source[from] ?? " ")) motion = "cursor.word_end";
  for (let k = 0; k < count; k++) await app.run(motion);
  const to = E.offsetOf(app, view);
  Object.assign(view, saved);
  if (LINEWISE.has(motion)) return linesRange(view, E.lineOf(view, Math.min(from, to)), E.lineOf(view, Math.max(from, to)));
  let a = Math.min(from, to);
  let b = Math.max(from, to);
  if (INCLUSIVE.has(motion)) b = Math.min(E.nextBoundary(view.buf.source, b), Math.max(b, E.lineEnd(view, b)));
  // dw at a line's last word stops at the line's end, not the next line's first word.
  if (motion === "cursor.word_next" && E.lineOf(view, b) > E.lineOf(view, a)) b = Math.max(a, E.lineEnd(view, a));
  if (a === b) return null;
  return { from: a, to: b, linewise: false };
}

/** An operator with f / t: f and t take the character they land on, F and T don't. */
function findRange(app: App, view: View, op: Op, kind: FindKind, ch: string, count: number, repeat: boolean): void {
  const to = C.findChar(app.currentLayout(view), view.cur, kind, ch, count, repeat);
  if (!to) return app.message("info", `no ${ch} ${kind === "f" || kind === "t" ? "after" : "before"} the cursor on this line`);
  const a = E.offsetOf(app, view);
  const b = E.offsetAtPos(app, view, to);
  const r = kind === "f" || kind === "t" ? { from: a, to: E.nextBoundary(view.buf.source, b), linewise: false } : { from: b, to: a, linewise: false };
  if (r.from < r.to) apply(app, view, op, r);
}

/** The search an operator waited for ended: accepted with a match, the range to it; else nothing. */
export function finishSearchOp(app: App, view: View, found: boolean): void {
  const s = app.vim.searchOp;
  if (!s) return;
  app.vim.searchOp = null;
  if (!found || !view.source) return;
  const to = E.offsetOf(app, view);
  const r = { from: Math.min(s.from, to), to: Math.max(s.from, to), linewise: false };
  E.placeAt(app, view, s.from);
  if (r.from < r.to) apply(app, view, s.op, r);
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

/** Do `op` on a range: the register gets the text; d/c take it out (c then types); y copies. */
export function apply(app: App, view: View, op: Op, r: Range): void {
  const why = E.cannotEdit(view);
  if (why && op !== "y") return app.message("warn", `${why} — not editing`);
  const buf = view.buf;
  const text = buf.source.slice(r.from, r.to);
  if (op === "y") {
    app.vim.register = { text, linewise: r.linewise };
    app.copy(text, false);
    const lines = text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
    app.message("info", r.linewise ? `yanked ${lines} line${lines === 1 ? "" : "s"}` : `yanked ${[...text].length} characters`);
    return E.placeAt(app, view, r.from);
  }
  if (op === ">" || op === "<") return indentLines(app, view, E.lineOf(view, r.from), E.lineOf(view, Math.max(r.from, r.to - 1)), op === ">" ? 1 : -1);
  app.vim.register = { text, linewise: r.linewise };
  const cursor = E.offsetOf(app, view);
  if (op === "d") {
    // A linewise delete of the last line takes the line break before it instead.
    let { from, to } = r;
    if (r.linewise && to === buf.source.length && !text.endsWith("\n") && from > 0) from -= buf.source[from - 2] === "\r" ? 2 : 1;
    buf.edit(from, to - from, "", cursor);
    const at = Math.min(from, buf.source.length);
    if (r.linewise) return E.placeAt(app, view, firstNonBlank(view, E.lineOf(view, at)));
    return E.placeAt(app, view, Math.min(at, Math.max(E.lineStart(view, at), E.lineEnd(view, at) - (at >= E.lineEnd(view, at) ? 1 : 0))));
  }
  // c: take the text out and type in its place — one undo step with the typing.
  buf.beginStep(cursor);
  if (r.linewise) {
    const indent = /^[ \t]*/.exec(text)![0];
    const eol = text.endsWith("\n") ? (text.endsWith("\r\n") ? "\r\n" : "\n") : "";
    buf.edit(r.from, r.to - r.from, indent + eol);
    E.startInsert(app, view, () => r.from + indent.length);
  } else {
    buf.edit(r.from, r.to - r.from, "");
    E.startInsert(app, view, () => r.from);
  }
}

export function firstNonBlank(view: View, src: number): number {
  return (view.buf.lineStarts()[src - 1] ?? 0) + /^\s*/.exec(E.lineText(view, src))![0].length;
}

/** > and <: two spaces in or out on each line (not on blank ones, going in). */
export function indentLines(app: App, view: View, first: number, last: number, dir: 1 | -1): void {
  const buf = view.buf;
  buf.beginStep(E.offsetOf(app, view));
  for (let n = last; n >= first; n--) {
    const start = buf.lineStarts()[n - 1] ?? 0;
    const text = E.lineText(view, n);
    if (dir === 1 && text.trim()) buf.edit(start, 0, "  ");
    else if (dir === -1) {
      const k = /^ {0,2}/.exec(text)![0].length;
      if (k) buf.edit(start, k, "");
    }
  }
  const at = firstNonBlank(view, first);
  buf.endStep(at);
  E.placeAt(app, view, at);
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
  if (ch === "w" || ch === "W") {
    const cls = (c: string | undefined) => (c === undefined ? -1 : /\s/.test(c) ? 0 : ch === "W" || /[\p{L}\p{N}_]/u.test(c) ? 1 : 2);
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
      if (i <= b && (i >= a || k === 0 || i > qs[k - 1]!)) return kind === "i" ? { from: ls + a + 1, to: ls + b, linewise: false } : { from: ls + a, to: ls + b + 1, linewise: false };
    }
    return null;
  }
  const pairs: Record<string, [string, string]> = { "(": ["(", ")"], ")": ["(", ")"], b: ["(", ")"], "[": ["[", "]"], "]": ["[", "]"], "{": ["{", "}"], "}": ["{", "}"], B: ["{", "}"], "<": ["<", ">"], ">": ["<", ">"] };
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
        if (depth === 0) return kind === "i" ? { from: a + 1, to: k, linewise: false } : { from: a, to: k + 1, linewise: false };
        depth--;
      }
    }
    return null;
  }
  if (ch === "p") {
    const n = view.buf.lineStarts().length;
    const blank = (l: number) => !E.lineText(view, l).trim();
    const b0 = blank(line);
    let first = line;
    let last = line;
    while (first > 1 && blank(first - 1) === b0) first--;
    while (last < n && blank(last + 1) === b0) last++;
    if (kind === "a") while (last < n && blank(last + 1) !== b0) last++;
    return linesRange(view, first, last);
  }
  return null;
}

/** p / P: the register after or before the cursor (a line register: under or over its line). */
export function put(app: App, view: View, after: boolean): void {
  const reg = app.vim.register;
  if (!reg) return app.message("info", "nothing to put — d, c or y fills the register");
  const why = E.cannotEdit(view);
  if (why) return app.message("warn", `${why} — not editing`);
  const n = takeCount(app);
  const buf = view.buf;
  const at = E.offsetOf(app, view);
  if (reg.linewise) {
    let text = reg.text.replaceAll("\r\n", "\n").replaceAll("\n", buf.eol);
    if (!text.endsWith(buf.eol)) text += buf.eol;
    text = text.repeat(n);
    const line = E.lineOf(view, at);
    let where = after ? (buf.lineStarts()[line] ?? buf.source.length) : (buf.lineStarts()[line - 1] ?? 0);
    // After the last line when it has no line break: add one first.
    if (after && where === buf.source.length && !buf.source.endsWith("\n")) {
      buf.beginStep(at);
      buf.edit(where, 0, buf.eol);
      where += buf.eol.length;
      buf.edit(where, 0, text.slice(0, -buf.eol.length));
      buf.endStep(where);
    } else buf.edit(where, 0, text, at);
    return E.placeAt(app, view, firstNonBlank(view, E.lineOf(view, where)));
  }
  const text = reg.text.repeat(n);
  const where = after && at < E.lineEnd(view, at) ? E.nextBoundary(buf.source, at) : at;
  buf.edit(where, 0, text, at);
  E.placeAt(app, view, Math.max(where, where + text.length - 1));
}

/** `.`: the last change's keys again. */
export async function repeat(app: App): Promise<void> {
  const s = app.vim;
  const keys = s.lastChange;
  if (!keys) return app.message("info", "no change to repeat yet");
  s.replaying = true;
  try {
    for (const k of keys) await app.processKey(k);
  } finally {
    s.replaying = false;
    s.undoing = true; // `.` itself isn't the change to repeat next time
  }
}
