// Read the active peek and capture its current navigation place.

import type { App, View } from "../../../app/runtime/app.ts";
import type { Peek, Place } from "./contracts.ts";

/** The peek open, when the floating window is one (and `view`, given, is its window). */
export function peekOf(app: App, view: View | null = null): Peek | null {
  const f = app.floating;
  if (f?.kind !== "peek") return null;
  return view && view !== f.view ? null : f.peek;
}

/** Where the peek is now, to come back to. */
export function here(app: App): Place | null {
  const f = app.floating;
  if (f?.kind !== "peek") return null;
  return {
    abs: f.peek.abs,
    loc: f.peek.loc,
    top: { ...f.view.topAnchor },
    cursor: { ...f.view.curAnchor },
    ...(f.peek.rows ? { rows: f.peek.rows } : {}),
  };
}
