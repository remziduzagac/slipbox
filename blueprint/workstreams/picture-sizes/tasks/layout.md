---
status: review
assignee: claude-52
blocked_by: [PIC-T1]
tracker: [gh:#52]
created: "2026-10-24"
---

# PIC-T2: The window's pictures in the layout

Lay a note's pictures out for the window that shows it: its room, its rows, the pictures it shows at their own size.

## Description

- `Pictures.forBuffer` takes the window: its room for pictures (wrapping off: the window's text columns), its rows,
  and the files it shows at their own size (PIC-D4); their key joins the buffer's layout key for a note that asks for
  a picture, its own or an embedded note's.
- `core/layout/render.ts`: every row of a picture — its `▣` rows, its frame rows, its bar — names the picture and its
  row in it; a picture at its own size wider than its room has its frame rows scroll (`CodeScroll`) and a bar row;
  the `▣` rows stay out of the scroll block.
- The block cache keeps a block that asks for a picture with what it was sized for, and lays it out again where that
  differs; other blocks as before.
- The window's own key (`views.ts`) and the lens's kept render (`lens.ts`) take the pictures' key.
- Wrapping off: a picture at its own size widens the window's sideways extent, not the prose.

## Acceptance criteria

- Unit tests: the rows of a fitted picture, of one at its own size wider and narrower than its room; wrapped
  captions; a picture in a list, a quote, an embedded note; two windows of different heights on one note; a toggle
  that keeps the row count re-placing the cursor; the lens open across a toggle and a height change; wrapping off's
  extent; the block cache not laying out a note without pictures on a height change.

## References

- Delivers: design/tui.md § Buffers, views, tabs, windows; § Pictures in a window (the layout's key, wrapping off).
- Rests on: PIC-D1, PIC-D4, PIC-D6; research.md § Layout and caches.

## Log

- 2026-10-24: `Pictures.forView(view, width)` replaces `forBuffer`: the room (wrapping off, the window's text columns,
  not the layout's), the rows, the files at their own size; the key holds them only for a note whose last layout asked
  for a picture (`NoteBuffer.asksPictures`). `render.ts`: captions measured before the picture is asked for (a
  throwaway context, so no link is counted twice); every row of a picture carries `pic`; one at its own size and wider
  than its room has scroll rows and a bar row; the block cache keeps a picture's block with the `pictureKey` it was
  sized for; `Layout.pictures` and `Layout.extent` (wrapping off). The window's key (`views.ts`) and the lens's kept
  render (`lens.ts`) take the pictures' key.
- 2026-10-24: found while testing: with the lens open, moving the cursor to the picture's line opens the lens on its
  markdown; the click leaves the cursor there instead (design.md, the click's bullet).
