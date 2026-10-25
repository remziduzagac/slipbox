# Requirements

## Goals

- **A picture follows its window, not the terminal:** other windows and panes may be beside it. It takes its window's
  text width, never more than its own size, its height bounded by the window's less its `▣` line; no fixed number of
  rows bounds it.
- **A click shows it at its own size,** in place: the text around it as it was (nothing reflows), the picture scrolled
  sideways, with a bar of its own, where it's wider than its window. A second click fits it to the window again. A named
  command and a key do what the click does, and keys scroll it.
- **Limits:** fitting a window's height never shrinks a picture past a floor, so it never becomes too small to see; no
  picture, fitted or at its own size, is drawn larger than the screen's decoding budget, past which there's nothing
  more to see.
- **The cost stays bounded:** a window resized sends Kitty each picture once, at the size it ends at, not at every size
  on the way; with sixel, a frame draws no more of a picture than shows.

## Non-goals

- Drawings slipbox makes as pictures, Mermaid and maths (`12.16`, `12.17`): sized as now, to the words beside them.
- Export and the CLI: `slipbox render` draws no pictures, and an export sizes its own.
- Sizes between fitted and its own, a zoom; moving a picture by dragging it; settings for the limits.
- Keeping which pictures are at their own size in the session, or across windows.

## Builds on

- requirements.md § Reading: pictures where the terminal can draw them (D100, D126, D127); § Constraints, `12.5`: alt
  text and its link are the floor (D101).
- design/rendering.md § Blocks and inlines: how a picture is found, sized, sent to Kitty, drawn with sixel, and the
  decoding budget (D102, D126).
- design/tui.md § Code blocks that scroll: a block's sideways offset, the wheel over it, its bar (D233).
- design/tui.md § Screen layout: the scrollbars, the wheel's 6 columns a notch, the rest after quick scrolling (`12.7`).
- design/tui.md § Buffers, views, tabs, windows: what a window is, and what it keeps while it shows a note.

## Acceptance criteria

- A picture wider than its window's room is drawn at that width, in any window that leaves it the height; one smaller
  is drawn at its own size; neither ever larger than its own size or the decoding budget (PIC-D1, PIC-D2).
- In a window too short for it, a picture is fitted to the window's height less its `▣` rows (however many its alt
  text wraps to), never below the floor; a tall narrow one likewise in width. A window resized or split refits it.
- A still click on a picture fitted smaller than its own size shows it at its own size, rows below it moved down and
  no row of text wrapped differently; scrolled sideways by the wheel, its bar and the keys; a second click fits it
  again. A drag from it selects, and a click beside it, on a quote's bar or on its scrollbar doesn't toggle it. `z p`,
  `z h` and `z l` do the same from its `▣` line (PIC-D3).
- A picture at its own size stays so while the window shows the note — scrolled away and back, the lens opened and
  closed, an edit, the watcher's reload, a resize of the height alone with the lens open — and is fitted again once the
  window shows another note; a toggle that leaves the note's rows as many still moves the cursor and the top right
  (PIC-D4). One file at two Obsidian sizes is shown at each; a picture only in an embedded note toggles too.
- With Kitty's placeholders, scrolling a picture sideways sends nothing; a separator dragged sends each picture once,
  after the drag rests (PIC-D5). With sixel, the source rectangle drawn is what shows, rows and columns.
- With wrapping off, a picture is fitted to the window, and one at its own size scrolls with the window, which reaches
  its right edge, drawn cropped while the window is scrolled sideways (PIC-D6).
- Every case has a unit test and a terminal check (with Kitty's graphics, reading the placeholders' marks); the user
  docs (reading, keys) and a CHANGELOG line say what users see.

## Changes

### MODIFIED requirements.md § Reading

The bullet on embedded notes and pictures, whole:

- An embedded note is drawn in place, read-only (D113). Pictures are drawn where the terminal can (asked of the
  terminal, never read from `$TERM`, and never required), sized to their window — its text width, their height
  bounded by its — never larger than their own size, never shrunk past a floor; a click shows one at its own size,
  scrolled sideways where it's wider than the window. Mermaid and maths are drawn in the terminal's own characters
  first, as pictures by choice, in the theme's colours (D100, D126, D127, PIC-D1–PIC-D3).

Previously: "An embedded note is drawn in place, read-only (D113). Pictures are drawn where the terminal can (asked of
the terminal, never read from `$TERM`, and never required), and Mermaid and maths in the terminal's own characters
first, as pictures by choice, in the theme's colours (D100, D126, D127)."
