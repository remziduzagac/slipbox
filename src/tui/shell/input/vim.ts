// The vim-shaped normal mode of source mode (phase 3 step 3): counts, operators waiting for a
// motion or a text object, a register, and `.`. Each operator and edit is a named command (in
// actions-edit.ts, bound in `[keys.source]`); this file is the grammar around them — what follows an
// operator is read here, the way which-key reads what follows a prefix.

export { type FindKind, type Range, reverseFind, type VimState, newVimState, takeCount } from "./vim/state.ts";
export { linesRange, firstNonBlank, textObject } from "./vim/motions.ts";
export { apply, indentLines, commentLines, put } from "./vim/edits.ts";
export { startOperator, finishSearchOp } from "./vim/operators.ts";
export { recordVisual, PASTE, insertRecord, repeat } from "./vim/replay.ts";
export { vimKey, visualKey } from "./vim/grammar.ts";
