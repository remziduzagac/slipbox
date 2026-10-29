// A snippet's tab stops while typing (plan 25.8): a completion that's a server's snippet
// (`core/documents/editing/snippet.ts`) is put in
// and the cursor goes to its first stop — its placeholder marked: the first key typed replaces it — then `tab` to the
// next and `shift+tab` back, `$0` (else the snippet's end) last. What's typed at a stop is copied to its mirrors. The
// stops follow the text as it changes (the buffer tells), so an import added above, or a mirror, moves them along.
// It ends at `$0`, with `esc`, when the cursor leaves the stop, or when an edit cuts across one.

import type { Snippet } from "../../../core/documents/editing/snippet.ts";
import type { App, View } from "../../app/runtime/app.ts";
import { keyChar } from "../../shell/input/keys.ts";
import { offsetOf, placeAt } from "./source/position.ts";

export interface SnippetSession {
  view: View;
  /** Each stop's places, as offsets in the text now: the first where it's typed, the rest its mirrors. Empty: gone. */
  stops: { n: number; ranges: [number, number][] }[];
  /** The stop the cursor is at. */
  at: number;
  /** Its placeholder untouched: the first key typed replaces it. */
  fresh: boolean;
  /** The place an edit is typed into (the stop's, a mirror's), which grows with it. */
  owner: [number, number];
  listener: (at: number, length: number, text: string) => void;
}

/**
 * Every place moved by an edit: the one typed into grows, as does one holding it (a nested stop's parent); one after the
 * edit moves along, one before stays; one the edit cuts into is gone. The stop typed at gone: the session ends.
 */
function follow(app: App, s: SnippetSession, at: number, length: number, text: string): void {
  const d = text.length - length;
  const end = at + length;
  const [oa, ob] = s.owner;
  for (const stop of s.stops) {
    stop.ranges = stop.ranges.flatMap(([a, b]): [number, number][] => {
      if (a <= oa && ob <= b && a <= at && end <= b) return [[a, b + d]];
      if (end <= a) return [[a + d, b + d]];
      if (at >= b) return [[a, b]];
      return [];
    });
  }
  const active = s.stops[s.at]?.ranges[0];
  if (!active) return end_(app, s);
  s.owner = active;
}

/** The session over: the buffer no longer followed. */
function end_(app: App, s: SnippetSession): void {
  s.view.buf.editListeners.delete(s.listener);
  if (app.snippet === s) app.snippet = null;
}

/** Ends the view's session, if it has one (leaving insert mode, another snippet). */
export function endSnippet(app: App): void {
  if (app.snippet) end_(app, app.snippet);
}

/** A snippet just put in at `at`: its stops followed; the cursor at the first. Nothing to tab through: no session. */
export function startSnippet(app: App, view: View, at: number, snippet: Snippet): void {
  endSnippet(app);
  const stops = snippet.stops.map((x) => ({
    n: x.n,
    ranges: x.ranges.map(([a, b]): [number, number] => [a + at, b + at]),
  }));
  // Only `$0`: the cursor there, the session over as it starts.
  const s: SnippetSession = { view, stops, at: 0, fresh: false, owner: stops[0]!.ranges[0]!, listener: () => {} };
  s.listener = (a, l, t) => follow(app, s, a, l, t);
  view.buf.editListeners.add(s.listener);
  app.snippet = s;
  go(app, s, 0);
}

/** To stop `k` (skipping those gone): its placeholder marked, the cursor at its start; at `$0`, the session's end. */
function go(app: App, s: SnippetSession, k: number): void {
  const dir = k < s.at ? -1 : 1;
  while (k >= 0 && k < s.stops.length && !s.stops[k]!.ranges.length) k += dir;
  if (k < 0) k = s.at;
  const stop = s.stops[k];
  if (!stop) return end_(app, s);
  const [a, b] = stop.ranges[0]!;
  s.at = k;
  s.owner = [a, b];
  s.fresh = a < b;
  placeAt(app, s.view, a, true);
  if (stop.n === 0) end_(app, s);
}

/** Keys in insert mode while a snippet is open: `tab` and `shift+tab` move between stops; the first key typed at a fresh
 *  placeholder takes it away first. True when the key was the snippet's. */
export function snippetKey(app: App, view: View, key: string): boolean {
  const s = app.snippet;
  if (!s || s.view !== view) return false;
  // `esc` leaves insert, which ends it (stopInsert).
  if (key === "tab") return go(app, s, s.at + 1), true;
  if (key === "shift+tab") return go(app, s, Math.max(0, s.at - 1)), true;
  if (!s.fresh) return false;
  const [a, b] = s.stops[s.at]!.ranges[0]!;
  const typed = keyChar(key);
  if (typed === null && key !== "backspace" && key !== "delete") {
    // A move: the placeholder kept, as typed.
    s.fresh = false;
    return false;
  }
  s.fresh = false;
  view.buf.edit(a, b - a, "");
  placeAt(app, view, a, true);
  // A backspace or delete took the placeholder; a character goes in where it was.
  return typed === null;
}

/** After a key typed in insert mode: the stop's mirrors made what it is; a cursor gone from the stop ends the session. */
export function afterSnippetKey(app: App, view: View): void {
  const s = app.snippet;
  if (!s || s.view !== view) return;
  const stop = s.stops[s.at];
  const main = stop?.ranges[0];
  if (!stop || !main) return end_(app, s);
  const at = offsetOf(app, view);
  if (at < main[0] || at > main[1]) return end_(app, s);
  const text = view.buf.source.slice(main[0], main[1]);
  for (let k = 1; k < stop.ranges.length; k++) {
    const [a, b] = stop.ranges[k]!;
    if (view.buf.source.slice(a, b) === text) continue;
    s.owner = [a, b];
    view.buf.edit(a, b - a, text);
  }
  const now = stop.ranges[0];
  if (!now) return end_(app, s);
  s.owner = now;
  // A mirror before it moved it: the cursor kept where it was in it.
  placeAt(app, view, now[0] + (at - main[0]), true);
}

/** The stop the cursor is at, while its placeholder is untouched: marked as a selection is. */
export function snippetMark(app: App, view: View): [number, number] | null {
  const s = app.snippet;
  if (!s || s.view !== view || !s.fresh) return null;
  return s.stops[s.at]?.ranges[0] ?? null;
}
