// Where a row of the links list leads, as a list of places previews it (EG-D2): the note or file the link reaches, at
// the line its fragment names — `#L12`, a heading — else its reading position. None for a web address, a tag, a
// footnote, a link that finds nothing or several.

import { isAbsolute, join } from "node:path";
import type { LayoutLink } from "../../../../core/rendering/layout/ir.ts";
import type { Graph } from "../../../../core/workspace/graph/graph.ts";
import { findHeading, lineFragment } from "../../../../core/workspace/links/landing.ts";
import type { App, View } from "../../../app/runtime/app.ts";
import type { ListPlace } from "../../../shell/overlays/list-types.ts";

/** The place `link` (of `v`'s note) leads to, read in the graph its note's links are read in; none, as above. */
export function linkPlace(a: App, v: View, link: LayoutLink): ListPlace | undefined {
  const there = v.buf.elsewhere;
  const graph = there ? there.graph : a.graph;
  const from = link.from ?? (there ? there.rel : v.buf.rel);
  if (!graph || from === null) return undefined;
  const wiki = link.kind === "wiki" || link.kind === "embed";
  if (!wiki && link.kind !== "markdown" && link.kind !== "image") return undefined;
  const kind = link.kind === "embed" ? "embed" : wiki ? "wiki" : link.kind === "image" ? "image" : "markdown";
  const r = graph.resolveLink({ kind, target: link.target }, from);
  const hash = link.target.indexOf("#");
  let fragment = wiki ? link.heading : hash >= 0 ? link.target.slice(hash + 1) : null;
  try {
    if (fragment && !wiki) fragment = decodeURIComponent(fragment);
  } catch {}
  // `#heading` alone: this note's own.
  const path =
    r.resolvedKind === "anchor" ? from : r.resolvedKind === "note" || r.resolvedKind === "file" ? r.path : null;
  if (!path) return undefined;
  const abs = isAbsolute(path) ? path : join(graph.root, path);
  return { abs, line: fragment ? fragmentLine(graph, path, fragment, wiki) : 0 };
}

/** The line a fragment names in a note, as a link lands there; 0, none found. */
function fragmentLine(graph: Graph, path: string, fragment: string, wiki: boolean): number {
  const lines = lineFragment(fragment);
  if (lines) return lines.line;
  const note = graph.entryAnywhere(path);
  return (note && findHeading(note.headings, note.anchors ?? [], fragment, wiki)?.line) || 0;
}
