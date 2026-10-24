---
status: todo
assignee: claude-52
blocked_by: []
related: [PIC-T1, PIC-T2, PIC-T3, PIC-T4]
tracker: [gh:#52]
created: "2026-10-24"
---

# PIC-T5: Terminal checks and live tries

Every case driven through slipbox in a headless terminal with Kitty's graphics, and tried live.

## Description

- `tests/terminal/checks/reading.ts`: checks with `graphics: true`, reading the placeholders' row and column marks off
  the screen: a picture fitted to its window; a short window's floor; a click to its own size and back; scrolled by
  `z l` and the wheel; a resize; a stacked split; wrapping off; an embedded note's picture.
- Live: this worktree's slipbox on a scratch copy of the reference set (`tmp/issue/home`), in the right pane: the
  README's screenshots, the cases above, and their neighbours; written here.

## Acceptance criteria

- The checks pass with `SLIPBOX_TERMINAL_JOBS=2`; each fails without the change it checks (undone once).

## References

- Delivers: requirements.md § Acceptance criteria.

## Log
