# Design changes

PIC's changes to the root's design, each named by the section it lands in at consolidation. The root's files change
only when PIC is consolidated.

## MODIFIED design/rendering.md § Blocks and inlines

In the paragraph on images (from "Images render as `▣ alt`"), the clause on a picture's size, whole:

> … never blocks of colour (D126) — fitted to its window (tui.md § Pictures in a window), from where its `▣ alt` text
> starts (past a list's bullet, a quote's bar, an embedded note's frame). Its own size is its pixels, or the size the
> note gives it (Obsidian's `|300`, `|240x180`, which may enlarge a smaller file, as before), proportions kept, then
> brought within the screen's decoding budget (below: one megapixel, 2,048 a side), which no picture on the screen
> exceeds, fitted or not. Fitted, it's drawn at one scale of that own size: at most 1, and at most what its room's
> columns allow; within that, what its window's height less its `▣` rows allows, but never less than the floor, the
> larger of what makes it 12 rows tall and what makes it 20 columns wide (PIC-D1, PIC-D2). So it's never larger than its
> own size or its room; in a window too short, or for a picture too tall and narrow, the floor wins and the picture is
> taller than the window, scrolled by as text is. Shown at its own size (a click, a key), it's at scale 1 whatever its
> room, as tall as it is; wider than its room, its frame rows scroll sideways on their own as a code block's do, and
> one more frame row under it holds its bar. Each of its rows — its `▣` rows, its frame rows, its bar — names the
> picture and which of its rows it is, so it's found whole from any of them; scrolled half out of sight, rows or
> columns, the part that shows.

Previously: "… never blocks of colour (D126) — sized to the text width, its proportions kept, at most 12 rows, from
where its `▣ alt` text starts (past a list's bullet, a quote's bar); scrolled half out of sight, the part that shows."

In the same paragraph, the sentences on Kitty and sixel, whole:

> Where the terminal speaks Kitty graphics, a picture is sent to it once per size (12.7, D102) — compressed, at the
> pixels it's drawn in, with a virtual placement of its cells — and drawn as Kitty's Unicode placeholders: each cell
> U+10EEEE in the picture's id's colour, its row and column as combining marks. They're text, so scrolling moves them
> and the terminal the picture with them: nothing is sent again, nothing waits. The placement and the id are the
> picture's whole size; the part that shows is drawn as the cells of those rows and columns, so scrolled sideways a
> row's cells start at the column that shows, and nothing is sent either. Past 297 rows or columns, which the marks
> can't name, it takes OpenTUI's path. A window resized sizes its pictures again, each sent at its new size once the
> size has rested (tui.md § Pictures in a window). The last 48 are kept in the terminal; quitting lets them go. With
> sixel (OpenTUI's own picture path, which numbers pictures by the order they're drawn in and sends them again as that
> changes), a step of scrolling — down, up or sideways — draws a view's pictures, but quick steps after it (a key held:
> within 120 ms of the last) don't, nor a wheel's from its first tick — their rows stay — and they're drawn once it
> rests. OpenTUI's path is given the picture's whole size and the source rectangle of the part that shows, both its
> edges rounded from the cells', so a frame encodes no more of a picture than its window holds.

Previously: "Where the terminal speaks Kitty graphics, a picture is sent to it once (12.7, D102) — compressed, at the
pixels it's drawn in, with a virtual placement of its cells — and drawn as Kitty's Unicode placeholders: each cell
U+10EEEE in the picture's id's colour, its row and column as combining marks. They're text, so scrolling moves them and
the terminal the picture with them: nothing is sent again, nothing waits. The last 48 are kept in the terminal;
quitting lets them go. With sixel (OpenTUI's own picture path, which numbers pictures by the order they're drawn in and
sends them again as that changes), a step of scrolling draws a view's pictures, but quick steps after it (a key held:
within 120 ms of the last) don't, nor a wheel's from its first tick — their rows stay — and they're drawn once it
rests."

In the paragraph on the budgets (from "Math input is at most 32 KiB"), after "…sides no larger than 2,048":

> — the most of a picture the screen shows, fitted or at its own size (above), so a size never needs a picture decoded
> again; an SVG is rasterised again for each width it's drawn at, as before, its own size one more

## MODIFIED design/tui.md § Buffers, views, tabs, windows

The Buffer bullet, whole:

- **Buffer:** one open file, with its source, parse, and layouts by width — and, for a note that asks for a picture
  (its own, or an embedded note's), by its window's room for pictures, its height, and the pictures it shows at their
  own size (§ Pictures in a window), so two windows on one note each size its pictures for themselves. A block that
  asks for a picture is kept in the block cache with what its pictures were sized for, and laid out again where that
  differs; other blocks are kept as before, and a note that asks for none isn't laid out again when only its window's
  height changes. Buffers are internal: there is no buffer list. They're keyed by path, so a note deleted on disk
  keeps its buffer.

Previously: "**Buffer:** one open file, with its source, parse, and layouts by width. Buffers are internal: there is no
buffer list. They're keyed by path, so a note deleted on disk keeps its buffer."

## MODIFIED design/tui.md § Screen layout

In the paragraph on scrollbars, after "A code block that scrolls sideways has its own `▄` bar on its last row, under
its code (§ Code blocks that scroll).":

> A picture shown at its own size that's wider than its room has its own `▄` bar on the row under it (§ Pictures in a
> window).

## ADDED design/tui.md § Pictures in a window

After § UI settings (and its § Code blocks that scroll):

> ## Pictures in a window
>
> A note's picture is sized for the window it's in: fitted to it (rendering.md § Blocks and inlines), or at its own
> size by choice. What the window shows at its own size, and its pictures' rest, are kept by `tui/pictures.ts`; the
> sizes are worked out by `tui/images.ts`; the rows laid out by `core/layout/render.ts`; the drawing done by
> `tui/draw-pane.ts`, `tui/opentui.ts` and `tui/placeholders.ts`; the commands are `src/core/commands/motion.ts`'s,
> done in `tui/actions-view.ts`.
>
> - **What it's fitted to.** The window's room: its text columns less what's before the picture (a list's indent, a
>   quote's bar, an embed's frame) — with wrapping on, the layout's room for the block; with wrapping off, the
>   window's, not the note's natural width — and its rows less the picture's `▣` rows, however many its alt text
>   wraps to.
> - **At its own size.** A click on a picture — pressed on the cells it's drawn in, not the blank beside it, a quote's
>   bar or its scrollbar, and released without moving — puts the cursor on its `▣` line and shows it at its own size;
>   another click fits it to the window again. The press is the picture's before the cursor is placed, and never
>   counts toward a double-click; one that moves becomes a selection, as a drag from those rows always did. `z p`
>   (`picture.size`, PIC-D3) does the same from its `▣` line, which the cursor reaches as any row, and `tab` as a
>   link. A picture whose two sizes are one (it fits whole) stays as it is, and the message says so. With the lens
>   open, a click changes its size and leaves the cursor, and the lens, where they are: on the picture's line, the lens
>   would show its markdown instead. Where no pictures are drawn (a terminal that draws none, `[render] images =
>   "never"`), `z p` says so rather than where to go. The `z` group's which-key line names `p`, `h` and `l`.
> - **Scrolled sideways.** Wider than its room, it scrolls as a code block does (§ Code blocks that scroll), its frame
>   rows a block of their own — its `▣` rows aren't in it, but name it, so the cursor on them never moves its offset:
>   a sideways wheel or trackpad over it, or the wheel with `shift`, 6 columns a notch; its `▄` bar, on the row under
>   it, clicked or dragged; `z h` and `z l` (`picture.scroll_left`, `picture.scroll_right`, PIC-D3) a quarter of
>   its room a press, from its `▣` line. The cursor never enters its rows, so nothing brings it back: it stays where
>   it was left. Its rows are frame rows, blank under the picture: no `‹ ›` marks, nothing copied, nothing found.
> - **How long.** It's the window's, by the picture's file as found (an SVG's own file, not its rasterised PNG; a
>   picture on the internet by its address): kept while the window shows the note — scrolled away and back, the lens
>   opened and closed, an edit or an agent's write that moves it, a resize — and dropped when the window shows
>   another note. It isn't saved in the session; a window split off starts with its pictures fitted. The same file
>   twice in a note is at its own size in both places, each at its own (two Obsidian sizes, two sizes). Its sideways
>   offset is kept as a code block's (by its line and how many blocks start there), clamped as the window narrows.
> - **A window resized** fits its fitted pictures again; one at its own size stays so, its offset clamped, and once
>   it fits whole its bar goes — it's still at its own size should the window narrow again. Once a window has been
>   drawn, a change to its size holds its pictures back, whatever the protocol, until the size has rested 120 ms,
>   then draws them at the size it ended at: a separator dragged sends Kitty each picture once. The rest is the
>   window's own, beside the rest after quick scrolling, and checked before Kitty's placeholders, which never wait for
>   scrolling.
> - **Wrapping off.** The window scrolls sideways as a whole (§ Screen layout). A picture is fitted to the window,
>   not to the note's natural width. One at its own size scrolls with the window, with no bar of its own: the
>   window's sideways extent reaches its right edge, the prose laid out as it was, and `z h` and `z l` then scroll the
>   window. Pictures are drawn, cropped, while the window is scrolled sideways, where they used to wait for its left
>   edge.
> - **The layout's key.** The window's own key, which places its cursor and top again, includes its pictures' key, so
>   a toggle that leaves the note's rows as many is still seen. The lens keeps the note's render around it while its
>   block is typed into; it's made again when the pictures' key changes, as when the width does.
> - **The cost.** With Kitty's placeholders, a picture is sent once per size: a resize sends it once, after resting;
>   shown at its own size, once; scrolled sideways, never. With sixel, a view's pictures are drawn again as it
>   scrolls, down, up or sideways, as before; each frame encodes the part that shows, at most the window's pixels —
>   more than a 12-row picture took, no more than a window's. Decoding doesn't change.
> - **Not pictures here:** drawings slipbox makes (Mermaid, maths, `12.16`, `12.17`) keep their sizing, at most 60
>   rows; a click on one does what it did.
