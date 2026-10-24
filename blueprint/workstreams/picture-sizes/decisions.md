# Decisions: pictures sized to their window

All six were taken as recommended while the maintainer was away (2026-10-24), as they asked for that night: each is
the option the design recommended, and each is the maintainer's to confirm or change (notes.md § Settled while the
maintainer was away).

## PIC-D1: A picture is fitted to its window, at one scale, above a floor (2026-10-24)

**Decision:** A picture is drawn at one scale of its own size: at most 1, at most what its room's columns allow, and
within that what its window's height less its `▣` rows allows — never less than the floor, the larger of what makes
it 12 rows tall and what makes it 20 columns wide. Its room is the window's text columns less what stands before it
(an indent, a quote's bar, an embed's frame), with wrapping on or off. The 12-row cap goes (it was `12.6`'s).

**Why:** Other windows and panes sit beside a note's window, so the window, not the terminal, bounds a picture. One
scale keeps the proportions whichever bound wins. The floor works in both directions because a short window makes a
picture too few rows and a tall picture too few columns; 12 rows is today's cap, so no picture is drawn smaller than
before, and 20 columns is a thumbnail at 8-pixel cells (*ours*).

**Not chosen:** a floor relative to the window, which moves as it does and is harder to say; no floor in columns,
which lets a tall picture in a short window shrink to a few (notes.md § The issue, and a first design).

## PIC-D2: The screen's decoding budget is the ceiling, as it is (2026-10-24)

**Decision:** A picture's own size is its pixels, or the note's size for it (Obsidian's, which may enlarge a smaller
file, as before), brought within the screen's decoding budget — one megapixel, 2,048 a side — which no picture on the
screen exceeds, fitted or at its own size. The budget isn't raised.

**Why:** Past it, the terminal would only enlarge the pixels decoded; within it, a picture at its own size is its
decoded pixels one to one, nothing is decoded again for a size, and Kitty's placeholders can name every cell of it.

**Cost:** The docs' 1,734 × 950 screenshots show at their own size as 1,351 × 740 (169 × 47 cells of 8 × 16), not
1:1 (research.md § Measured).

**Not chosen:** a budget of 4 megapixels and 4,096 a side for a picture shown at its own size — a second decode, up to
16 MB kept per such picture, up to four times the bytes sent to Kitty once.

## PIC-D3: A click, `z p`, and `z h` / `z l` for a picture alone (2026-10-24)

**Decision:** A click on a picture (on its drawn cells, released without moving) puts the cursor on its `▣` line and
toggles it between fitted and its own size; `z p` (`picture.size`) does the same from its `▣` line. Wider than its
room, it scrolls sideways as a code block does — the wheel sideways or with `shift`, its bar — and `z h` / `z l`
(`picture.scroll_left`, `picture.scroll_right`) scroll it a quarter of its room a press; with wrapping off they scroll
the window. `enter` keeps copying a picture's path. Code blocks keep their keys: `z h` and `z l` don't scroll them.

**Why:** Every action is a named command (plan `0.8`'s registry), and the cursor reaches a picture only by its `▣`
line, so the keys act from there; moving the cursor there on a click keeps the cursor on screen while the picture
grows below it. `z h` and `z l` are vim's sideways scroll; `z p`, `z h` and `z l` are free. Extending them to code
blocks would widen the issue.

**Not chosen:** `enter` toggling (it copies the path, or asks to fetch); the wheel's 6 columns for a key press, a
notch of many.

## PIC-D4: At its own size while the window shows the note (2026-10-24)

**Decision:** Which pictures are at their own size is the window's, by the picture's file as found (an SVG's own
file, a picture online by its address), kept while the window shows the note and dropped when it shows another; not
saved in the session. Its sideways offset is kept as a code block's.

**Why:** It's how a code block's offset already lives (D233), and by file rather than by line, so an agent writing
above the picture doesn't drop it back to fitted under the reader.

**Cost:** The same file twice in a note toggles in both places.

**Not chosen:** the note's for the session, in every window; saved in the session.

## PIC-D5: A window resized holds its pictures back until its size rests (2026-10-24)

**Decision:** Once a window has been drawn, a change to its size holds its pictures back, with either protocol,
until the size has rested 120 ms; then they're drawn at the size it ended at.

**Why:** A fitted picture follows its window, and Kitty is sent a picture once per size: without the rest, a
separator dragged sends each picture at every column it passes. The rest is the one quick scrolling has (`12.7`).

## PIC-D6: With wrapping off, a picture follows the window too (2026-10-24)

**Decision:** With wrapping off, a picture is fitted to the window, not to the note's natural width; at its own size
it scrolls with the window, which reaches its right edge, and has no bar of its own; pictures are drawn cropped while
the window is scrolled sideways.

**Why:** With wrapping off the whole window scrolls and no block scrolls on its own (D233); a picture keeps to that.
Drawn cropped, it no longer disappears when the window is scrolled sideways.
