---
status: todo
assignee: ""
blocked_by: [EG-T5]
created: "2026-11-08"
---

# EG-T17: Several selections at once

EG-D14.

## Description

- Before building: the keys, proposed and settled with the user (Helix's clash with vim's `shift+c`, `s`,
  `shift+k`, `,`).
- A view's selection a list of anchors and cursors; added below and above, matches selected, split on a regex or on
  lines, kept or dropped, the primary alone, aligned; an operator, typing or a paste at each, one undo step; `esc`
  back to one.

## Acceptance criteria

- Unit tests for each command and for the edits at each selection, in one undo step.
- A terminal check with the settled keys.
- Every bug found gets a regression test; `bun run check` passes; the user docs and a CHANGELOG line come with it.

## Open

- The keys.
