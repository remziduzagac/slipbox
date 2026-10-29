// Editing in source mode (plan 4.3, 4.4; phase 3 step 3). The text is the buffer's `source`; a
// cursor is a place in it, found through the source layout's `srcMap` (every cell drawn knows the
// offset it shows). Insert mode types into it; the normal-mode commands (`i`, `o`, `x`, `u`…) are
// named commands in actions-edit.ts that call in here.

export { offsetOf, offsetAtPos, placeAt, lineText, lineStart, lineEnd, lineOf } from "./source/position.ts";
export { cannotEdit, lensWhat, toEditing } from "./source/policy.ts";
export { startInsert, stopInsert } from "./source/lifecycle.ts";
export { insertText, prevBoundary, nextBoundary } from "./source/text.ts";
export { newline } from "./source/newline.ts";
export { backspace, deleteForward, deleteWordBack, deleteToLineStart } from "./source/deleting.ts";
export { indentLine, commentStyleAt, commentLine, outdentLength, moveLines } from "./source/lines.ts";
export { typedSelection, deleteTypedSelection } from "./source/selection.ts";
export { insertKey } from "./source/keyboard.ts";
