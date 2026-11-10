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
using a footnote defined elsewhere — were made on the screen's thread, as the render's were: with a footnote mark in
every section, they were most of a cold layout's cost with the parse at hand. Since the review the workers make them
too (SIS-D7, below).

## Known limits

- **The lens's blocks are parsed alone:** a reference or a footnote defined outside the lens shows plain in it.
- **Inline HTML's content isn't styled:** `<b>x</b>` has its tags in `html`, the `x` as text, as the light highlighting
  had it.
- **A diff finds a definition it doesn't show by its line's pattern**, not a parse: one inside a block it doesn't show
  (a list item's) may be missed.
- **Setext headings** (a line underlined with `===`) aren't coloured as headings, as before.
- **While a big note's parse runs**, or after it failed, it has the light highlighting, not its inline styles.
- **A definition added to a big note** changes the stand-ins of every piece using it: past the budget, they go to the
  workers and the pieces keep their own parse (the marks as text) until they're back.
- **A piece's stand-ins its render's chunk didn't need** (a reference to a definition in the same chunk of the
  render's, or a label the render's check and the styles' read differently) are parsed on the screen's thread.

## The pull request's review (2026-11-10)

Three findings, each confirmed in the code, fixed, and tested with a test that fails without its fix:

- **A diff parsed a big note on the screen's thread** (`highlighted` in `diff.ts`: no `limit`, a fresh cache each
  layout, both sides). A diff of a 1 MB note just added took seconds to draw, again on each resize. Diffs are held to
  SIS-D5 now: `styledSource` (`diff-styles.ts`) keeps each text's parse and layout cache in the app's `DiffStyles`,
  parses nothing past the budget, sends a big text to the workers and bumps `version` when it lands, which the diff
  window's, the review's and the merge screen's layout keys hold.
- **The stand-in pass ignored the budget** and never read the buffer's parse. Its parses count against the budget now,
  a piece's stand-in parse is read from the render's chunk holding it, and the workers make the render's (SIS-D7).
  Probed before the fix: a 230 KB note marking a footnote in each paragraph took 566 ms to draw in SOURCE view once its
  parse landed; after it, 126 ms and nothing parsed on the screen's thread.
- **Pending or failed styles looked worse than styles off**: every line got no paints, which turned the light
  highlighting's code spans and links off too. A line of a piece not styled yet has no paints now, so it keeps them;
  its row's signature (`?`) differs from a styled line's with no paints, so the row is made again once it's styled.

Left for the maintainer's list: the styles' cache keyed by text alone (a first piece and another of the same text);
the diff's definition pattern matching inside a fence; `refsOf` keeping a label's spaces as typed; a cold pending layout
calling `inlineStyles` twice; a note half styled while a parse runs. One more found while fixing: a piece shared from
the render's chunk keeps a reference resolved by a definition elsewhere in that chunk under its own text, so deleting
that definition leaves the mark styled until the piece is edited.
