---
status: todo
assignee: ""
blocked_by: [EG-T1]
created: "2026-11-08"
---

# EG-T7: TODOs

EG-D9.

## Description

- What's a mark: the words in a comment, or at a note's line or list item with `:`.
- Coloured in every view; `] x` / `[ x`; `space / x` lists the vault's, with the preview, kept current as files
  change.

## Acceptance criteria

- Unit tests: marks found in comments, notes and tasks, none in prose, strings or code spans.
- A terminal check: the reference set's TODOs coloured, `] x` and `space / x`.
- Every bug found gets a regression test; `bun run check` passes; the user docs and a CHANGELOG line come with it.

## Open

- A CLI equivalent for the list, or an interaction.
