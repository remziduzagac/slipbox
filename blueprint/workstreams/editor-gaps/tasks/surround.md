---
status: todo
assignee: ""
blocked_by: [EG-T5]
created: "2026-11-08"
---

# EG-T6: Surround, and wrapping on type

EG-D8.

## Description

- `y s`, `d s`, `c s` in SOURCE view and the lens, `shift+s` in visual mode, the marks EG-D8 names; one undo step,
  `.` repeating it.
- A mark typed over a typed selection wraps it.

## Acceptance criteria

- Unit tests for each mark added, deleted and changed, nested pairs included.
- A terminal check: `y s i w b`, `c s *` then a backtick, `d s (`, a quote typed over a selection.
- Every bug found gets a regression test; `bun run check` passes; the user docs and a CHANGELOG line come with it.

## Open

- Whether wrapping on type needs `editor.auto_pairs`, and which characters it takes.
