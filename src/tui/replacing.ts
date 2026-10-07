// Replace (the find row's replace field; `:s` in vim.ts builds on the same pieces). Matches are in
// the note's text — its markdown — found by core/replace.ts with the window's find toggles. The
// window edits (source mode or the lens), so every match is a real place in the file.

import { compilePattern, expandReplacement, findAll, firstPerLine, nextLine, parseSubstitute, type TextMatch } from "../core/replace.ts";
import { type App, computeFind, editable, type PromptOverlay, type View } from "./app.ts";
import * as E from "./editing.ts";

export interface ReplaceState {
  text: string;
  /** Typing in the replace field (else in the find field above it). */
  focus: boolean;
  /** Only within these text offsets (opened on a visual selection); grows and shrinks with edits. */
  range?: [number, number];
  /** Where the cursor's match is among them, and how many: shown on the find row. */
  current: number;
  total: number;
  /** `:s…/c`: asking at each match (`replace? y n a q`) rather than a replace field. */
  confirm?: Confirm;
}

/** A confirming substitute, as it goes: the pattern, what's left to look at, what's been done. */
export interface Confirm {
  re: RegExp;
  replacement: string;
  /** g: every match on a line; else the first of each. */
  global: boolean;
  range: [number, number];
  /** Where to look for the next match from. */
  pos: number;
  match?: TextMatch;
  /** Where the last real (non-empty) match ended: an empty match right there isn't another one. */
  lastEnd?: number;
  asked: number;
  replaced: number;
}

/** A replacement's line breaks as the note's own (\r and \n in :s are one, and a CRLF note stays CRLF). */
function eol(view: View, text: string): string {
  return view.buf.eol === "\n" ? text : text.replace(/\r?\n/g, view.buf.eol);
}

/** The query's matches in the note's text, within the replace's range; with the find row's
 *  toggles, or with `opts` (gn: the search's own, which `*` made whole words). */
export function textMatches(view: View, query: string, range?: [number, number], opts = view.findOpts ?? { regex: false, whole: false }): TextMatch[] | string {
  if (!query) return [];
  const re = compilePattern(query, opts);
  if (typeof re === "string") return re;
  return findAll(view.buf.source, re, range?.[0] ?? 0, range?.[1] ?? view.buf.source.length);
}

/** Open the replace field on a window's find prompt (the window switched to editing first). */
export function openReplace(app: App, o: PromptOverlay, view: View, range?: [number, number]): void {
  if (!editable(view)) {
    app.setViewMode(view, app.editMode());
    app.message("info", "replacing in the markdown");
  }
  o.replace ??= { text: "", focus: true, range, current: 0, total: 0 };
  o.replace.focus = true;
  refresh(app, o, view);
}

/** Recount the matches and where the cursor is among them; the find highlights follow. */
export function refresh(app: App, o: PromptOverlay, view: View): void {
  const r = o.replace;
  if (!r) return;
  const ms = textMatches(view, o.text, r.range);
  const list = typeof ms === "string" ? [] : ms;
  const at = E.offsetOf(app, view);
  const i = list.findIndex((m) => m.to > at);
  r.total = list.length;
  r.current = list.length ? (i < 0 ? 0 : i) : 0;
  const f = view.findOpts ?? { regex: false, whole: false };
  view.find = o.text ? computeFind(app.currentLayout(view), o.text, view.find?.current ?? 0, f.whole, f.regex) : null;
}

/**
 * The cursor to offset `at`. In the lens, a match outside it is on a rendered row: placing the
 * cursor there moves the lens onto it, and a second placing lands on the character itself.
 */
function goTo(app: App, view: View, at: number): void {
  E.placeAt(app, view, at);
  if (view.live) E.placeAt(app, view, at);
}

/** Move to the next (or previous) match without replacing, wrapping around. */
export function stepMatch(app: App, o: PromptOverlay, view: View, dir: 1 | -1): void {
  const ms = textMatches(view, o.text, o.replace?.range);
  if (typeof ms === "string" || !ms.length) return app.message("info", "no matches");
  const at = E.offsetOf(app, view);
  let i = dir === 1 ? ms.findIndex((m) => m.from > at) : ms.findLastIndex((m) => m.from < at);
  if (i < 0) i = dir === 1 ? 0 : ms.length - 1;
  goTo(app, view, ms[i]!.from);
  refresh(app, o, view);
}

/** Replace the match at or after the cursor, then go to the next one. */
export function replaceOne(app: App, o: PromptOverlay, view: View): void {
  const r = o.replace;
  if (!r) return;
  const ms = textMatches(view, o.text, r.range);
  if (typeof ms === "string") return app.message("warn", `not a regex: ${ms}`);
  if (!ms.length) return app.message("info", "no matches left");
  const at = E.offsetOf(app, view);
  // The match under the cursor or the next one (wrapping round).
  const m = ms.find((x) => x.to > at) ?? ms[0]!;
  const opts = view.findOpts ?? { regex: false, whole: false };
  const text = eol(view, expandReplacement(r.text, m, opts.regex));
  view.buf.edit(m.from, m.to - m.from, text, at);
  if (r.range) r.range = [r.range[0], r.range[1] + text.length - (m.to - m.from)];
  // On to the next match after this one (wrapping), if there is one.
  const after = m.from + text.length;
  const rest = textMatches(view, o.text, r.range);
  const next = typeof rest === "string" ? undefined : (rest.find((x) => x.from >= after) ?? rest[0]);
  goTo(app, view, next ? next.from : after);
  refresh(app, o, view);
  if (!next) app.message("info", "replaced the last one");
}

/** Replace `ms` (in order, not overlapping) as one undo step; the cursor to the first. */
function applyMatches(app: App, view: View, ms: TextMatch[], replacement: string, regex: boolean): void {
  if (!ms.length) return;
  const at = E.offsetOf(app, view);
  view.buf.beginStep(at);
  for (const m of [...ms].reverse()) view.buf.edit(m.from, m.to - m.from, eol(view, expandReplacement(replacement, m, regex)));
  view.buf.endStep(ms[0]!.from);
  goTo(app, view, Math.min(ms[0]!.from, view.buf.source.length));
}

/** Replace every match (within the range): one undo step. */
export function replaceAll(app: App, o: PromptOverlay, view: View): void {
  const r = o.replace;
  if (!r) return;
  const before = view.buf.source.length;
  const n = replaceEvery(app, view, o.text, r.text, r.range);
  if (typeof n === "string") return app.message("warn", `not a regex: ${n}`);
  // The selection's end moves with what was replaced inside it, as replaceOne keeps it.
  if (r.range) r.range = [r.range[0], r.range[1] + view.buf.source.length - before];
  refresh(app, o, view);
  app.message("info", n ? `replaced ${n} match${n === 1 ? "" : "es"}` : "no matches");
}

/** Replace every match of `query` in `range` with `replacement`, as one undo step: how many. */
export function replaceEvery(app: App, view: View, query: string, replacement: string, range?: [number, number]): number | string {
  const ms = textMatches(view, query, range);
  if (typeof ms === "string") return ms;
  applyMatches(app, view, ms, replacement, view.findOpts?.regex ?? false);
  return ms.length;
}

/**
 * Vim's substitute from the command line: `s/old/new/` on the cursor's line, `%s` on the note,
 * `'<,'>s` on the last selection's lines; `g` every match on a line, `i` ignoring case, `c` asking
 * at each. The pattern is a regex; the edits are one undo step.
 */
export function substitute(app: App, view: View, input: string): void {
  const sub = parseSubstitute(input);
  if (!sub) return app.message("warn", "a substitute is s/old/new/ with g, i, c flags after it");
  if (sub.range === "selection" && !view.visualLines) return app.message("warn", "no selection yet for '<,'>");
  // The cursor's line before the window changes mode (a rendered row knows its source line).
  const line = app.currentLayout(view).lines[view.cur.row]?.src ?? 1;
  if (!editable(view)) app.setViewMode(view, app.editMode());
  const text = view.buf.source;
  const starts = view.buf.lineStarts();
  const [a, b] = sub.range === "all" ? [1, starts.length] : sub.range === "selection" ? view.visualLines! : [line, line];
  const range: [number, number] = [starts[a - 1] ?? 0, starts[b] ?? text.length];
  const re = compilePattern(sub.pattern, { regex: true, whole: false, ignoreCase: sub.ignoreCase });
  if (typeof re === "string") return app.message("warn", `not a regex: ${re}`);
  const all = findAll(text, re, range[0], range[1], true); // :s/^/> / inserts at an empty match
  const ms = sub.global ? all : firstPerLine(text, all);
  if (!ms.length) return app.message("warn", `not found: ${sub.pattern}`);
  if (sub.confirm) return startConfirm(app, view, sub.pattern, { re, replacement: sub.replacement, global: sub.global, range, pos: range[0], asked: 0, replaced: 0 });
  applyMatches(app, view, ms, sub.replacement, true);
  const lines = new Set(ms.map((m) => text.slice(0, m.from).split("\n").length)).size;
  app.message("info", `${ms.length} substitution${ms.length === 1 ? "" : "s"}${lines > 1 ? ` on ${lines} lines` : ""}`);
}

/** The confirm prompt: the find and replace rows, asking `replace? y n a q` at each match. */
function startConfirm(app: App, view: View, pattern: string, c: Confirm): void {
  view.buf.beginStep(E.offsetOf(app, view));
  app.prompt(
    "/",
    () => finishConfirm(app, view, c),
    undefined,
    () => finishConfirm(app, view, c),
    view,
  );
  const o = app.overlay as PromptOverlay;
  o.text = pattern;
  o.replace = { text: c.replacement, focus: true, current: 0, total: 0, confirm: c };
  if (!nextConfirm(app, o, view)) {
    app.overlay = null;
    finishConfirm(app, view, c);
  }
}

/** The remaining matches from `c.pos` on (the first per line without `g`). */
function remaining(view: View, c: Confirm): TextMatch[] {
  const text = view.buf.source;
  const all = findAll(text, c.re, c.pos, c.range[1], true).filter((m) => !(m.from === m.to && m.from === c.lastEnd));
  return c.global ? all : firstPerLine(text, all);
}

/** Onto the next match to ask about: false when there are none left. */
function nextConfirm(app: App, o: PromptOverlay, view: View): boolean {
  const c = o.replace!.confirm!;
  const left = remaining(view, c);
  c.match = left[0];
  if (!c.match) return false;
  goTo(app, view, c.match.from);
  o.replace!.current = c.asked;
  o.replace!.total = c.asked + left.length;
  // The highlights: this pattern, the match being asked about current.
  // Case as the pattern has it (:s…/i ignores it), so the highlights are the matches it asks about.
  const f = computeFind(app.currentLayout(view), o.text, 0, false, true, c.re.flags.includes("i"));
  const i = f.matches.findIndex((m) => m.row > view.cur.row || (m.row === view.cur.row && m.col >= view.cur.col));
  f.current = i < 0 ? 0 : i;
  view.find = f;
  return true;
}

/** Replace the match being asked about; the search goes on after it (or on the next line). */
function confirmReplace(view: View, c: Confirm): void {
  const m = c.match!;
  const text = eol(view, expandReplacement(c.replacement, m, true));
  view.buf.edit(m.from, m.to - m.from, text);
  c.range[1] += text.length - (m.to - m.from);
  c.replaced++;
  if (m.to > m.from) c.lastEnd = m.from + text.length;
  // On past it (an empty match one further, or it would match again right there).
  c.pos = c.global ? m.from + text.length + (m.from === m.to ? 1 : 0) : nextLine(view.buf.source, Math.max(m.from, m.from + text.length - 1));
}

/** y replace, n skip, a this and the rest, l this and stop, q (esc) stop. */
export function confirmKey(app: App, o: PromptOverlay, view: View, key: string): void {
  const c = o.replace!.confirm!;
  const stop = () => {
    app.overlay = null;
    o.accept(o.text);
  };
  if (!c.match) return stop();
  switch (key) {
    case "y":
      confirmReplace(view, c);
      break;
    case "n":
      if (c.match.to > c.match.from) c.lastEnd = c.match.to;
      c.pos = c.global ? c.match.to + (c.match.from === c.match.to ? 1 : 0) : nextLine(view.buf.source, c.match.from);
      break;
    case "l":
      confirmReplace(view, c);
      return stop();
    case "a":
      for (let m: TextMatch | undefined = c.match; m; m = remaining(view, c)[0]) {
        c.match = m;
        confirmReplace(view, c);
      }
      return stop();
    case "q":
    case "escape":
    case "ctrl+c":
    case "ctrl+g":
      return stop();
    default:
      return;
  }
  c.asked++;
  if (!nextConfirm(app, o, view)) stop();
}

/** The confirm's end: its edits one undo step, and how many. */
function finishConfirm(app: App, view: View, c: Confirm): void {
  view.buf.endStep(E.offsetOf(app, view));
  app.message("info", `${c.replaced} substitution${c.replaced === 1 ? "" : "s"}`);
}
