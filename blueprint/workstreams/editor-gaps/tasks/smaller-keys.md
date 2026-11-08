---
status: todo
assignee: ""
blocked_by: []
created: "2026-11-08"
---

# EG-T15: The smaller keys and defaults

EG-D22.

## Description

- `g u`, `g shift+u`, `g ~`; visual `u`, `shift+u`, `~`, `shift+j`, `r`, `p`; case by the note's language.
- `editor.auto_pairs = true` by default; a note under D155 at consolidation.
- ``space ` `` and `ctrl+^`; indent guides for nested list items (`space u i`).

## Acceptance criteria

- Unit tests for the case operators, Turkish's i included.
- A terminal check of each key; closing pairs on with no config.
- Every bug found gets a regression test; `bun run check` passes; the user docs and a CHANGELOG line come with it.
