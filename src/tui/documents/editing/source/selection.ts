// Typed-selection ranges and removal over the current view.

import type { App, View } from "../../../app/runtime/app.ts";
import { offsetAtPos, offsetOf, placeAt } from "./position.ts";

/**
 * The text a selection made while typing covers: from one end to the other, the cursor sitting between characters as
 * it does while typing (so the character after it isn't taken, as a visual selection's last one is). Null without one.
 */
export function typedSelection(app: App, view: View): [number, number] | null {
  if (!view.insert || !view.sel) return null;
  const at = offsetOf(app, view);
  const anchor = offsetAtPos(app, view, view.sel.anchor);
  return [Math.min(at, anchor), Math.max(at, anchor)];
}

/** The selection made while typing taken out of the text (not copied: a paste over it puts what was copied before),
 *  the cursor where it was. False when there's none. */
export function deleteTypedSelection(app: App, view: View): boolean {
  const r = typedSelection(app, view);
  view.sel = null;
  if (!r) return false;
  if (r[1] > r[0]) view.buf.edit(r[0], r[1] - r[0], "");
  placeAt(app, view, r[0], true);
  return true;
}
