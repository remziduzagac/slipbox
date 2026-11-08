---
status: todo
assignee: ""
blocked_by: []
created: "2026-11-08"
---

# EG-T16: Windows: a tab split freely, and zoomed

EG-D21.

## Description

- A tab a tree of windows: split again either way, focus and move by direction, close, swap, resize; the least room
  each keeps; saved and restored, an old workspace read as a tree.
- "The split" a pick or a link opens into, given more than two windows.
- `ctrl+w z` / `space w m`: the window fills the tab, the rest hidden but kept, all back on the second press.
- With or after the roadmap's Later item "Window/tab ownership and document tools", which owns the window model.
- A note under D141 at consolidation.

## Acceptance criteria

- A terminal check: three windows in a tab, both orientations, focus moved each way, one closed; restored after a
  restart; zoomed and back.
- Every bug found gets a regression test; `bun run check` passes; the user docs and a CHANGELOG line come with it.

## Open

- What else ends a zoom (a split, a focus move, a pane opened).
- Where `zoomed` is said with no window header.
