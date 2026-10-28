// Owner-local pane drawing: commentLinksShown.

import type { View } from "../../../../app/runtime/app.ts";
import type { CommentLink } from "../../../../../core/documents/syntax/syntax.ts";

/** A source file's links in comments by line (16.10), for the text as it is now: in source mode, and on the code
 *  view's rows of code (a note beside code, a comment kept as written; its prose has them as links of its own). */
export function commentLinksShown(view: View, code: boolean): Map<number, CommentLink[]> | null {
  const syn = view.buf.syntax;
  if (!(view.source || code) || !syn?.links.length || syn.version !== view.buf.version) return null;
  const out = new Map<number, CommentLink[]>();
  for (const l of syn.links) out.set(l.line, [...(out.get(l.line) ?? []), l]);
  return out;
}
