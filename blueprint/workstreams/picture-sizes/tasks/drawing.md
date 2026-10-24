---
status: todo
assignee: claude-52
blocked_by: [PIC-T2]
tracker: [gh:#52]
created: "2026-10-24"
---

# PIC-T3: Drawing a picture's part that shows

Draw from a picture's whole size the part in sight, rows and columns, with either protocol, and hold pictures back
while a window's size changes.

## Description

- `Canvas.image` is given the picture's whole size and the part that shows; `drawPictures` finds a picture by its
  rows' reference, however tall, not by looking back 60 rows.
- Kitty's placeholders: the id and what's sent are the whole picture's; each row drawn from the column that shows.
  OpenTUI's path: the source rectangle of the part that shows, both edges rounded from the cells'.
- Pictures drawn cropped while a window is scrolled sideways with wrapping off.
- `Pictures.now`: a window's size change after its first draw holds its pictures until it rests 120 ms, checked
  before the placeholders' shortcut (PIC-D5); sideways scrolling counts as a step for sixel's rest.

## Acceptance criteria

- Unit tests: placeholders' cells from a column; the source rectangle; a picture taller than 60 rows scrolled past
  its top; the rest after a resize, with placeholders and without; one send per size, nothing on a sideways scroll.

## References

- Delivers: design/rendering.md § Blocks and inlines (Kitty and sixel); design/tui.md § Pictures in a window (a window
  resized, the cost).
- Rests on: PIC-D5, PIC-D6; research.md § Drawing.

## Log
