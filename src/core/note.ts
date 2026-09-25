// Rendering a vault note: parse, resolve its links against the graph, lay it out.
// Shared by `slipbox render` and the TUI so both show exactly the same thing.

import type { Glyphs } from "./glyphs.ts";
import type { Graph } from "./graph.ts";
import type { Layout, LinkStatus } from "./layout/ir.ts";
import { renderTree } from "./layout/render.ts";
import { type ParsedNote, parseMarkdown } from "./parse.ts";

/** Effective inset: the configured value, but never more than ~5% of a narrow pane, and ≥ 1 (2.7). */
export function effectiveInset(paneWidth: number, inset: number): number {
  return Math.max(1, Math.min(inset, Math.floor(paneWidth * 0.05)));
}

export function layoutWidth(paneWidth: number, inset: number, maxWidth = 0): number {
  const w = paneWidth - effectiveInset(paneWidth, inset);
  return Math.max(10, maxWidth > 0 ? Math.min(w, maxWidth) : w);
}

export interface NoteRenderOptions {
  width: number;
  glyphs: Glyphs;
  showUrls: boolean;
}

export function linkResolver(graph: Graph | null, rel: string | null) {
  if (!graph || rel === null) return undefined;
  return (kind: "wiki" | "embed" | "markdown" | "image", target: string): LinkStatus => {
    const r = graph.resolveLink({ kind: kind === "image" ? "image" : kind, target }, rel);
    switch (r.resolvedKind) {
      case "note":
      case "file":
      case "anchor":
        return "resolved";
      case "external":
        return "external";
      case "ambiguous":
        return "ambiguous";
      default:
        return "unresolved";
    }
  };
}

export function layoutNote(parsed: ParsedNote, graph: Graph | null, rel: string | null, opts: NoteRenderOptions): Layout {
  return renderTree(parsed.tree, { ...opts, resolveLink: linkResolver(graph, rel) }, parsed.frontmatter);
}

export function parseNote(source: string): ParsedNote {
  return parseMarkdown(source);
}
