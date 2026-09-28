// Replace (the find row's replace field; `:s` in vim.ts builds on the same pieces). Matches are in
// the note's text — its markdown — found by core/replace.ts with the window's find toggles. The
// window edits (source mode or the lens), so every match is a real place in the file.

import { compilePattern, expandReplacement, findAll, type TextMatch } from "../core/replace.ts";
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
}

/** The query's matches in the note's text, within the replace's range. */
export function textMatches(view: View, query: string, range?: [number, number]): TextMatch[] | string {
  if (!query) return [];
  const opts = view.findOpts ?? { regex: false, whole: false };
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
  const text = expandReplacement(r.text, m, opts.regex);
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

/** Replace every match (within the range): one undo step. */
export function replaceAll(app: App, o: PromptOverlay, view: View): void {
  const r = o.replace;
  if (!r) return;
  const n = replaceEvery(app, view, o.text, r.text, r.range);
  if (typeof n === "string") return app.message("warn", `not a regex: ${n}`);
  refresh(app, o, view);
  app.message("info", n ? `replaced ${n} match${n === 1 ? "" : "es"}` : "no matches");
}

/** Replace every match of `query` in `range` with `replacement`, as one undo step: how many. */
export function replaceEvery(app: App, view: View, query: string, replacement: string, range?: [number, number], filter?: (m: TextMatch) => boolean): number | string {
  const ms = textMatches(view, query, range);
  if (typeof ms === "string") return ms;
  const chosen = filter ? ms.filter(filter) : ms;
  if (!chosen.length) return 0;
  const opts = view.findOpts ?? { regex: false, whole: false };
  const at = E.offsetOf(app, view);
  view.buf.beginStep(at);
  for (const m of [...chosen].reverse()) view.buf.edit(m.from, m.to - m.from, expandReplacement(replacement, m, opts.regex));
  view.buf.endStep(chosen[0]!.from);
  goTo(app, view, Math.min(chosen[0]!.from, view.buf.source.length));
  return chosen.length;
}
