---
status: todo
assignee: claude-52
blocked_by: [PIC-T2]
tracker: [gh:#52]
created: "2026-10-24"
---

# PIC-T4: The click, the commands and the keys

A click on a picture, `z p`, `z h` and `z l`, and the wheel and the bar of a picture at its own size.

## Description

- `src/core/commands/motion.ts`: `picture.size`, `picture.scroll_left`, `picture.scroll_right` (CLI: none), done in
  `src/tui/actions-view.ts`, bound `z p`, `z h`, `z l`.
- `src/tui/mouse.ts`: a press on a picture's drawn cells is the picture's before the cursor is placed; released still,
  the cursor to its `▣` line and the picture toggled; moved, a selection; never part of a double-click.
- A picture whose two sizes are one says so and stays. The wheel sideways or with `shift`, and the bar, through the
  code blocks' scrolling. With wrapping off, `z h` / `z l` scroll the window.

## Acceptance criteria

- Unit tests: each command from a `▣` line and from elsewhere; the click, still and dragged, on the picture, beside
  it, on a quote's bar, on its bar; the wheel; wrapping off.

## References

- Delivers: design/tui.md § Pictures in a window (at its own size, scrolled sideways, how long).
- Rests on: PIC-D3, PIC-D4.

## Log
