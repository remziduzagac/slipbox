// The code view (plan 24.x, blueprint/design/code-view.md): a source file read as a notebook. Its prose — the file's
// comments, each definition's documentation (JSDoc, a docstring: Google, NumPy, reST) — at full width; its code in
// cells, one per definition (a class: its head, then a cell per method), each in a box or on a band with a header —
// the definition's kind and name, its lines, its problems, and buttons — and the separator comments as section rules.
//
// Inside a cell every token of code is drawn as written; the whitespace and the decoration are the view's own: where a
// long line breaks and how its rest is indented, indent guides, dimming, bold. A comment there is a note: its marker
// gone, in the comments' colour. The rows of code start from source mode's (one per line, unwrapped: highlighted, and
// kept between edits by the buffer's source cache), so each carries a `srcMap` — every cell mapped to its place in the
// line — and the cursor, find, a selection and problem marks land where they are in the file. Prose rows are placed
// by line, as a rendered note's are.

export { layoutCode } from "./page/compose.ts";
export { codeBlocks, cellBlocks } from "./cells/blocks.ts";
export type { CodeLayoutOptions, CommentPath } from "./contracts.ts";
