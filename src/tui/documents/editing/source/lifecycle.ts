// Insert-session transitions over the original view and buffer.

import type { App, View } from "../../../app/runtime/app.ts";
import { endSnippet } from "../snippets.ts";
import { cannotEdit, toEditing } from "./policy.ts";
import { lineOf, offsetOf, placeAt } from "./position.ts";
import { prevBoundary } from "./text.ts";

/** Enter insert mode at offset `at` (switching the window to editing first: the lens's first press only opens it). */
export function startInsert(app: App, view: View, at: (v: View) => number, past = true): void {
  const why = cannotEdit(view);
  if (why) return app.message("warn", `${why} — not editing`);
  if (!toEditing(app, view)) return;
  view.sel = null;
  view.visual = null;
  const off = at(view);
  view.buf.beginStep(offsetOf(app, view));
  view.insert = true;
  placeAt(app, view, off, past);
  view.insertFrom = offsetOf(app, view);
}

/** Leave insert mode: the session is one undo step; the cursor steps back onto a character, and a selection made
 *  while typing goes. */
export function stopInsert(app: App, view: View): void {
  if (!view.insert) return;
  // Where typing stopped, read while still typing: a new layout pending (the index done, a grammar loaded) puts the
  // cursor back by typing's rule, past a line's last character. Read after, by normal mode's, it would be on that
  // character, and the cursor and gi one short.
  const at = offsetOf(app, view);
  view.insert = false;
  if (!view.visual) view.sel = null;
  // Completion's popup and the signature are typing's (19.16); so is a snippet's stops (25.8).
  app.completion = null;
  app.signature = null;
  endSnippet(app);
  view.buf.lastInsert = at; // gi comes back here
  view.buf.endStep(at);
  const start = view.buf.lineStarts()[lineOf(view, at) - 1] ?? 0;
  placeAt(app, view, at > start ? prevBoundary(view.buf.source, at) : at);
}
