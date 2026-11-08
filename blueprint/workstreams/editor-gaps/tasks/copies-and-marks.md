---
status: todo
assignee: ""
blocked_by: [EG-T1]
created: "2026-11-08"
---

# EG-T14: The copies kept, and marks

EG-D20.

## Description

- The last 20 copies and cuts for the session; `space p`, with the preview.
- `m`, `` ` ``, `'`, `space h m`; a mark a source anchor, found again after a reload; kept with the session.
- A note under D155 at consolidation: marks are wanted now; macros, named registers and block selection still
  aren't.

## Acceptance criteria

- A terminal check: three copies, the first pasted from `space p`; `m a`, an edit above,
  `` ` a ``; `m A` and back from another note; a mark found after an agent's rewrite and after a restart.
- Every bug found gets a regression test; `bun run check` passes; the user docs and a CHANGELOG line come with it.

## Open

- Whether an operator's delete counts as a copy kept.
- Marks per workspace, or shared by them.
