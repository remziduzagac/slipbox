---
status: todo
assignee: ""
blocked_by: [EG-T1]
created: "2026-11-08"
---

# EG-T11: Undo by time, and its steps as a list

EG-D13.

## Description

- Each undo step's time and kind; a save marks the step it saved.
- `space h u` lists the steps, `enter` going to one, the preview showing its diff to now.

## Acceptance criteria

- Unit tests for the steps' times and kinds.
- A terminal check: three reloads from disk, then `space h u` back before them.
- Every bug found gets a regression test; `bun run check` passes; the user docs and a CHANGELOG line come with it.
