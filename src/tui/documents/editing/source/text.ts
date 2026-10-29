// Original text insertion and grapheme/CRLF boundaries.

import { graphemes } from "../../../../core/foundation/text/width.ts";
import type { App, View } from "../../../app/runtime/app.ts";
import { offsetOf, placeAt } from "./position.ts";

/** Type `text` at the cursor. */
export function insertText(app: App, view: View, text: string): void {
  const at = offsetOf(app, view);
  view.buf.edit(at, 0, text);
  placeAt(app, view, at + text.length, true);
}

/** The offset of the grapheme before `at` (a CRLF counts as one). */
export function prevBoundary(source: string, at: number): number {
  if (at <= 0) return 0;
  if (source[at - 1] === "\n" && source[at - 2] === "\r") return at - 2;
  const lineStart = source.lastIndexOf("\n", at - 1) + 1;
  const gs = graphemes(source.slice(lineStart, at));
  return at - (gs[gs.length - 1]?.length ?? 1);
}

/** The offset after the grapheme at `at`. */
export function nextBoundary(source: string, at: number): number {
  if (at >= source.length) return source.length;
  if (source[at] === "\r" && source[at + 1] === "\n") return at + 2;
  const end = source.indexOf("\n", at);
  const gs = graphemes(source.slice(at, end < 0 ? undefined : end));
  return at + (gs[0]?.length ?? 1);
}
