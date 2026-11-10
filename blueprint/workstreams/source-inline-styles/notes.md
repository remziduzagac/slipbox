# Notes

## How it was drafted (2026-11-10)

Issue #103 asked for research first, then four points to decide: the markers dim or in their style's colour, a
switch and its default, the theme roles, and speed on a long note. The research
([research/source-inline-styles.md](../../research/source-inline-styles.md)) was done first; each point was then
decided with the answer recommended (decisions.md), by the maintainer's instruction to take the recommended answer,
and built in one pull request (SIS-T1).

What was checked against the code before the design (`dev` at `79fb95c7`):

- `highlightLine` in `src/core/rendering/layout/code/source.ts` coloured a line alone: headings, list markers, task
  boxes, quote bars, and inline code and `[text](url)` links by pattern; everything else `text`.
- The render composes a style's role and attributes in `src/core/rendering/layout/markdown/render-inline.ts`: `strong`
  over plain text and `A_BOLD`, `emphasis` and `A_ITALIC`, `strike` and `A_STRIKE`, `highlight` on its band.
- `parseMarkdown` (`src/core/documents/markdown/parse.ts`) cuts the note at `chunkStarts` (blocks of at least 40 lines),
  keeps each chunk's nodes by its text in the buffer's `ParseCache`, and parses a chunk using another's definition again
  with a stand-in for it. `chunkStarts(lines, 1)` cuts at every safe place, and its cuts hold the render's.
- The parse's positions are lines and columns, and `tame` keeps every offset, so a node's place is a place in the line
  as typed.

## Measured

On a generated note (headings, paragraphs across lines with emphasis, lists, quotes, code, tables, a footnote mark in
each section and the footnotes at the end), Bun 1.4.2 on the development VM, `layoutSource` at 100 columns, wrapping on,
the mean of a few runs:

| | 20 KB (813 lines) | 200 KB (7.8k lines) | 1 MB (38.6k lines) |
| --- | --- | --- | --- |
| styles off: cold | 7–11 ms | 59–73 ms | 293–332 ms |
| on: cold, nothing parsed | 53–68 ms | 364–521 ms | 1.8–2.7 s |
| on: cold, the note's parse at hand, no footnote marks | 12 ms | 85 ms | 446 ms |
| on: cold, the note's parse at hand, a footnote mark in each section | 27 ms | 278 ms | 1.16 s |
| styles off: a keystroke mid-note | 0.7 ms | 4.2 ms | 23 ms |
| on: a keystroke mid-note | 2.0 ms | 10 ms | 52 ms |
| on: a line added at the top | 1.6 ms | 13 ms | 65 ms |

The render's chunks were tried first (SIS-D4): a keystroke mid-note took 4.5 ms, 12 ms and 47 ms, but a line added at
the top 40 ms, 342 ms and 1.64 s, every cut below it moved. A paragraph parses in about 0.3 ms whatever the note's size.

A keystroke's extra cost on a 1 MB note is the cutting (`chunkStarts`, 6 ms), the pieces' texts and their look-up in
the cache, and each line's signature; its parse is one paragraph's. A cold layout with nothing parsed (2.5 s at 1 MB)
never happens on the screen's thread past 128 KiB (SIS-D5): the parse workers do it. The stand-in parses — a piece
using a footnote defined elsewhere — are made on the screen's thread, as the render's are: with a footnote mark in every
section, they're most of a cold layout's cost with the parse at hand.

## Known limits

- **The lens's blocks are parsed alone:** a reference or a footnote defined outside the lens shows plain in it.
- **Inline HTML's content isn't styled:** `<b>x</b>` has its tags in `html`, the `x` as text, as the light highlighting
  had it.
- **A diff finds a definition it doesn't show by its line's pattern**, not a parse: one inside a block it doesn't show
  (a list item's) may be missed.
- **Setext headings** (a line underlined with `===`) aren't coloured as headings, as before.
- **While a big note's parse runs**, its inline styles and the light highlighting's inline colours are both off, for
  the second or two the workers take.
- **The stand-in parses** run on the screen's thread: a note with thousands of paragraphs each marking a footnote
  defined elsewhere takes a second to show in SOURCE view the first time, as READ takes for the same note.
