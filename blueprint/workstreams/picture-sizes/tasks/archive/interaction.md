---
status: done
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

- 2026-10-24: `picture.size`, `picture.scroll_left`, `picture.scroll_right` in `motion.ts`, done in `actions-view.ts`,
  bound `z p`, `z h`, `z l`; the `z` group's which-key line names them. The mouse keeps a press on a picture's drawn
  cells (`Geometry.pictures`) until release: still, a toggle; moved, the press a text press and the drag a selection.
  Found live: `z p` where no pictures are drawn said to go to a `▣` line though the cursor was on one; it now says why
  (a unit test and a check).
- 2026-10-24, review round 1: a click ends a selection and visual mode; the release finds its picture by file; a
  click on a drawing places the cursor again. notes.md § Review, round 1.
- 2026-10-24, review round 2: `z p` ends visual mode; a release on a gone picture toggles nothing; the messages say
  what's so (undrawn, the lens, source mode, a drawing).
