---
status: current
created: "2026-10-24"
---

# Research: what the code and the protocols allow

What PIC's design rests on: how pictures are sized, laid out, kept and drawn today, and what Kitty's placeholders and
OpenTUI's picture path can do. Read in this branch's code (`origin/dev` at d24699f) and Kitty's protocol page on
2026-10-24.

## Summary

- **The 12-row cap is one constant** (`PICTURE_ROWS`, `src/tui/pictures.ts:235`), passed to `fitPicture`
  (`src/tui/images.ts:30`), which fits the width first and then shrinks to the rows (*read*). The window's height is
  never asked: `Pictures.forBuffer` takes the buffer, not the window (*read*).
- **The layout is the buffer's, per width,** and pictures' rows are in it: a window's height or its own choices can't
  change a picture's rows without entering the layout's key, and the block cache's (*read*).
- **Sideways scrolling of a block exists** for code blocks: an offset per window by the block's key, the wheel, a bar
  on its last row, its drag (*read*). A picture can ride on it.
- **Both drawing paths can crop a picture sideways:** Kitty's placeholder cells each name their row and column
  (*summary*), and OpenTUI's `drawImage` takes a source rectangle (*read*). Today only rows are cropped (*read*).
- **The screen's decoding budget bounds what a bigger picture can show:** one megapixel, 2,048 a side (*read*); drawn
  larger, the terminal would only enlarge those pixels.
- **Kitty is sent a picture once per size** (*read*): a picture that follows its window is sent again at each size a
  resize passes through.

## Sizing today

- `fitPicture(w, h, width, cell, maxRows)`: columns `min(width, ceil(w / cell.width))`, rows from them, proportions
  kept; past `maxRows`, rows `maxRows` and columns narrower (`src/tui/images.ts:30-44`, *read*).
- An image's size is its file's, or Obsidian's `|300` (its width) or `|240x180` (the box it fits in), proportions kept
  (`src/tui/pictures.ts:149-154`, *read*). An SVG is rasterised at the columns it's drawn in, kept in the cache by its
  text and width (`pictures.ts:156`, `:216-231`, *read*).
- Drawings slipbox makes (Mermaid, maths as pictures) are sized to the words beside them, at most `DRAWING_ROWS` = 60
  rows (`pictures.ts:188-213`, `:237`, *read*).
- `width` is the layout's room for the block: the text column, less a list's or a quote's indent
  (`src/core/layout/render.ts:540-573`, *read*). With wrapping off, the layout is the note's natural width, never
  narrower than the pane (`src/tui/views.ts:37`), so a picture can be laid out wider than the window (*read*).

## Layout and caches

- A picture alone in its paragraph is its `▣ alt` row(s), then `rows` blank frame rows (`decor`), the first carrying
  the picture (`render.ts:566-573`, *read*). Frame rows never hold the cursor: a click on one lands on the next row of
  text after it (`src/tui/cursor.ts:75-85`, *read*).
- `NoteBuffer.layout` keeps six layouts by key — width, glyphs, URLs, code scrolling and the pictures' key (the cell's
  size and the drawings' options) (`src/tui/buffer.ts:618-655`, *read*).
- The block cache (`RenderCache`) is keyed by width, glyphs, URLs, code scrolling and the note's definitions — not the
  pictures' key (`render.ts:160`, *read*). It's safe today because every change of the pictures' key also drops every
  layout (`Pictures.changed` → `App.widthsChanged` → `invalidateLayouts`, `pictures.ts:26`, `app.ts:757`, *read*).
  Blocks with an embed, or waiting for something to load, are never kept (`render.ts:176-180`, *read*).
- A window's own layout key carries its height already, for the cursor and the top to be placed again, not for the
  buffer's layout (`views.ts:110`, *read*).

## Scrolling sideways, as code blocks do

- A row of a block that scrolls carries `scroll: { x, w, total, part? }`; the block's last row (`part: "bar"`) holds its
  bar (`src/core/layout/ir.ts:64-85`, *read*).
- `codeBlocks(layout)` finds the blocks from those rows alone, keyed by their first row's line and how many start
  there (`src/tui/code.ts:259-300`, *read*). The offset is the window's, `view.codeLeft`, kept while it shows the note,
  clamped to the block (`code.ts:23-41`, `app.ts:190-192`, *read*).
- The mouse: a sideways wheel over a block, or the wheel with `shift`, moves it 6 columns a notch and marks it
  `codeWheeled`; its bar is clicked or dragged (`src/tui/mouse.ts:166-176`, `:597-602`, *read*).
- With wrapping off, the window scrolls sideways (`view.left`) and pictures aren't drawn while it's scrolled
  (`src/tui/draw-pane.ts:464`, *read*).

## Drawing

- `drawPictures` draws each picture from its first row on screen, finding one whose top is scrolled away by looking
  back at most `DRAWING_ROWS` rows, and crops rows only (`skip`, `total`) (`draw-pane.ts:733-758`, *read*). A picture
  taller than 60 rows, scrolled past its top, would not be found.
- **Kitty, as Unicode placeholders** (`src/tui/opentui.ts:115-120`, `:131-158`, *read*): a picture is sent once per
  file and size — its id hashes the file and `cols × rows` (`src/tui/placeholders.ts:43-47`) — scaled to its cells'
  pixels, never up, with a virtual placement; the last 48 kept. Each row is drawn as text, every cell with its row's
  and its column's mark (`placeholders.ts:55-59`). At most 297 rows or columns can be named
  (`MAX_PLACEHOLDER_CELLS`); past that, OpenTUI's path.
- Kitty's page: "The row and column values are specified with diacritics"; "in case of a mismatch only part of the
  image will be displayed"; the shortcut of leaving the marks out "will not work for horizontal scrolling"; the image is
  "fit to the specified rectangle, its aspect ratio preserved" (*summary*, sw.kovidgoyal.net/kitty/graphics-protocol,
  2026-10-24). slipbox writes both marks on every cell, so a row can start at any column.
- **OpenTUI's path** (sixel; Kitty past the placeholders' limit): `buf.drawImage(image, x, y, cols, rows, pixelWidth,
  pixelHeight, sourceX, sourceY, sourceWidth, sourceHeight, protocol)` (`node_modules/@opentui/core/buffer.d.ts:63`,
  0.5.14, *read*); slipbox passes the visible rows as the source rectangle (`opentui.ts:122-124`, *read*), so only what
  shows is encoded. It numbers pictures by the order they're drawn and sends them again as that changes, so a view's
  pictures wait while it scrolls quickly (`pictures.ts:37-60`, *read*).
- **Decoding**: at most one million pixels and 2,048 a side for the screen, the 24 drawn last kept
  (`opentui.ts:284-297`, `:192-197`, *read*; design/rendering.md § Blocks and inlines).

## Measured

- The README's and the docs' screenshots are 1,734 × 950 pixels (1.65 megapixels) (`docs/images/*.png`, *ran*: read
  from their headers). Decoded for the screen: 1,351 × 740. In 8 × 16-pixel cells: 217 × 60 cells at their own size,
  169 × 47 within the budget, 44 × 12 today (*ours*, from the formulas above).

## Gaps

- Not measured: how long a 1-megapixel picture takes to scale and send as placeholders on a resize (`image.resize`,
  `deflateSync` on the screen's thread, `opentui.ts:140-152`). To time during the work, on the reference set.
- Not checked in a real terminal yet: a placeholder row starting at a column other than 0. To try live (Ghostty).
