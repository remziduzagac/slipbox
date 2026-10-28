// Drawing a window: the note's rows — each line's text, its marks (find, selection, spelling, problems, brackets),
// its code scrolled sideways — the gutter and its signs, the problems bar, pictures, the cursor, the scrollbars, and
// the completion and signature popups at the cursor.

export { drawPane } from "./drawing/pane.ts";
export { paneScrollbar, drawHScrollbar } from "./drawing/chrome/scrollbars.ts";
export { drawCompletion, drawSignature } from "./drawing/chrome/popups.ts";
export { severityGlyph, SEVERITY_ROLE, MARK_ROLE } from "./drawing/marks/problems.ts";
