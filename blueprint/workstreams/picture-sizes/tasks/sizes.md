---
status: review
assignee: claude-52
blocked_by: []
tracker: [gh:#52]
created: "2026-10-24"
---

# PIC-T1: A picture's two sizes

Work out a picture's fitted size and its own size, in cells, from its pixels, its room and its window's rows.

## Description

Replace `fitPicture`'s 12-row cap (`src/tui/images.ts`, `PICTURE_ROWS` in `src/tui/pictures.ts`) with the rule in
design.md § MODIFIED rendering.md: its own size within the decoding budget (one megapixel, 2,048 a side), then one
scale — at most 1, at most the room's columns, within that the window's rows less its `▣` rows, never under the floor
of 12 rows or 20 columns (or its own size where that's smaller). Both sizes returned, so the layout and a click know
whether they differ. Drawings (`DRAWING_ROWS`) keep their own sizing.

## Acceptance criteria

- Unit tests: a wide picture fitted to the room; a small one at its own size; a short window, the row floor; a tall
  narrow picture, the column floor; a picture over the budget, its own size within it; Obsidian's size enlarging a
  smaller file, within the budget; the two sizes equal when it fits.

## References

- Delivers: design/rendering.md § Blocks and inlines (PIC's change).
- Rests on: PIC-D1, PIC-D2; research.md § Sizing today.

## Log

- 2026-10-24: `pictureSizes` in `src/tui/images.ts`: its own size within the budget, then one scale bounded by the
  room's columns and rows, raised to the floor; `fitPicture` kept for drawings alone. The row floor's columns are
  rounded down, so the floor is 12 rows, not 13 (the docs' screenshot in 9 rows: 43 × 12). Tests:
  `tests/pictures.test.ts` § a picture's two sizes. Undone once each, the floor, the height bound, the caption's rows
  and the budget fail their tests (`tmp/issue/mutations.log`).
- 2026-10-24, review round 1: Obsidian's `|0` is the file's own size, not NaN.
