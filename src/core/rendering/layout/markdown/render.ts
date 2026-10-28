// mdast → layout IR (plan 2.1, 2.2). Pure: no terminal, no OpenTUI, no I/O.
//
// Containers (quotes, list items, callouts) lay their children out at a reduced width and then
// prefix every row, so nesting composes without any block knowing where it sits.
//
// Here, a note's blocks; inlines are render-inline.ts's, tables render-table.ts's, front matter and
// data files' rows render-data.ts's, and what they all share render-context.ts's.

export type { RenderOptions, PictureSource, PictureSize, FoundPicture, Embedded, RenderCache } from "./contracts.ts";
export { renderMarkdown, renderTree, newRenderCache } from "./page/render.ts";
export { heading } from "./blocks/headings.ts";
