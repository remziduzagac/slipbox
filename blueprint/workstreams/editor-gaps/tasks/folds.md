---
status: todo
assignee: ""
blocked_by: []
created: "2026-11-08"
---

# EG-T9: Folding a note's sections

EG-D11.

## Description

- `fold.toggle` on `z a` (a cell in code, as `cell.fold`), `z c`, `z o`, `z shift+m`, `z shift+r`, in the rendered
  view and SOURCE view.
- A layout made with sections folded, a fold row in their place; a jump into a section opens it.
- Kept per tab, by heading anchor, in the workspace.

## Acceptance criteria

- A terminal check: `z a` on a heading, the fold row's count; `z shift+m` then `z shift+r`; a search hit inside
  opens it; after a restart, and after an agent's rewrite that keeps the heading, still folded.
- Every bug found gets a regression test; `bun run check` passes; the user docs and a CHANGELOG line come with it.

## Open

- In a peek, whose `z` is `peek.fill`.
- What an operator takes on a folded heading (`d d`).
- Per tab, so two windows on one note share their folds, or per window.
