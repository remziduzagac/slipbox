---
status: todo
assignee: ""
blocked_by: []
created: "2026-11-08"
---

# EG-T5: The structure: text objects, syntax jumps, growing the selection

EG-D6, EG-D7.

## Description

- The nodes around the cursor: a note's from its Markdown tree; code's from a query per language run in the syntax
  worker beside its pass.
- Text objects `f` `c` `a` `o` in code and `h` `l` `o` `k` in notes, after the operators and in visual mode.
- `] f`, `] a`, `] o` and their `[` halves, as motions.
- `alt+o` and `alt+i`, the steps grown through kept on the view.

## Acceptance criteria

- Unit tests for every object in a note and in TypeScript, Python and Rust, and for each jump.
- A terminal check: `d a h`, `c i k`, `y a l`, `v i o` and `d a f`; `alt+o` from a word to the section and back.
- Every bug found gets a regression test; `bun run check` passes; the user docs and a CHANGELOG line come with it.

## Open

- In a note's fenced block, whether `o` and `] o` mean the code's block or the fence.
- The code view's reading, beside its lens.
