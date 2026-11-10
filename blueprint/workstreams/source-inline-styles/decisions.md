# Decisions: Markdown's inline styles in SOURCE view

**Taken on 2026-11-10, each with the answer recommended, by the maintainer's instruction to take the recommended
answer**; the pull request that builds them lists them for the maintainer's review. Each entry says what was chosen,
what could have been chosen instead, and why. An entry is never rewritten; a dated note goes under it
(blueprint/README.md § How things are recorded).

## SIS-D1: The markers kept, dimmed, in a role of their own (2026-11-10)

**Decision:** Every marker of an inline style stays on screen as typed — `**`, `*`, `_`, `~~`, `==`, `$`, a link's
brackets and parentheses, a wiki link's `[[`, `|` and `]]`, a footnote mark's `[^` and `]`, an escape's backslash, an
Obsidian comment whole — in a new theme role, `markup`: the palette's comment colour in every palette theme, `dim` in
`mono`. A marker keeps its style's attributes (the `**` of bold inside italic is italic) and a heading's band behind
it; its colour is always `markup`'s.

**Why:** The issue asks for the markers visible and dim. Of the editors researched
([research/source-inline-styles.md](../../research/source-inline-styles.md)), Emacs's markdown-mode dims them by
default, and Obsidian's users who find them loud dim them with CSS; with the text styled, a marker in the text's own
look reads as part of the word. One role lets a theme or `[colors]` change them all at once.

**Not chosen:** the markers in their style's own look (VS Code, Zed, Obsidian's Source mode): the `**` as loud as the
word; coloured as punctuation, a role per kind of marker: more roles, nothing gained; hidden off the cursor's line
(Obsidian's Live Preview, Typora): it moves the text under the cursor, and READ and the lens are there for that.

## SIS-D2: The text in the render's roles and attributes (2026-11-10)

**Decision:** The text a style holds is drawn as the render composes it (`render-inline.ts`): strong text in `strong`
and bold, emphasis in `emphasis` and italic, struck text in `strike` and struck, both bold and italic where nested; in a
heading, the heading's colour kept and the attribute added; `==highlighted==` text in `highlight` on its band; a
link's text in `link` and its address in `url`; a wiki link's alias in `wikilink` (`embed`, or `image` for a picture),
its target as an address; a footnote mark in `footnote`, a tag in `tag`, maths in `math`, inline HTML's tags in `html`,
a table's pipes and delimiter row in `table_border`.

**Why:** The issue asks for each style shown as it renders: the same roles make SOURCE view and READ look alike, and a
theme's choices for them carry over. No role is new but the markers'.

**Not chosen:** attributes alone (bold without `strong`'s colour): READ and SOURCE view would differ in colour; roles of
SOURCE view's own: twice the roles for the same meaning.

## SIS-D3: A switch, on by default (2026-11-10)

**Decision:** `[render] source_styles`, a boolean, `true` by default. `false` gives the light highlighting of before:
code spans and links by pattern, a line at a time. It covers SOURCE view, the lens and a note's diff alike.

**Why:** Obsidian's users ask for a source mode without styling, and have only CSS for it; some will want the plainer
view, or the old look under a theme whose comment colour is faint. On by default, since what the issue asks for is the
better default: SOURCE view saying what the markers do.

**Not chosen:** no switch (no way back for those who want plain source); off by default (the feature hidden behind a
setting few would find); a switch per place (SOURCE view, lens, diff): one meaning, one key.

## SIS-D4: The render's own parse, cut where it can be (2026-11-10)

**Decision:** The styles come from the render's parse: the note cut at every place it can be cut with the same parse
as whole (`chunkStarts` with a size of one line), each piece parsed by the render's processor (`parseChunk`), a piece
using a label another piece defines parsed again with a stand-in definition (as `parseMarkdown` does), its nodes'
positions turned into stretches of each line. A piece's styles are kept by its text; a piece the buffer's parse holds
(the render's chunks, each a run of pieces) is read from it.

**Why:** The issue asks for CommonMark's rules, not a pattern's: emphasis across a paragraph's lines, `snake_case_words`,
a `*` in a code span, an unclosed `**` while typing. Only the parser has them all, and only the render's own makes READ
and SOURCE view agree. Cut at every place it can be cut, a keystroke parses its paragraph (0.3 ms) and a line added at
the top moves no cut below it; the render's chunks of 40 lines or more were tried first and measured: a line added at
the top moved every cut, and a 1 MB note took 1.6 s a keystroke ([notes.md](notes.md) § Measured).

**Not chosen:** patterns a line at a time, as the light highlighting has (the issue rules it out: emphasis across lines,
nesting, code spans); the whole note parsed each layout (3 s for 1 MB); the render's chunks alone (above); a parser of
its own for inline Markdown (a second reading of the note to keep in step with the render's).

## SIS-D5: A big note's styles wait for its parse on other threads (2026-11-10)

**Decision:** When more than `BACKGROUND_PARSE` (128 KiB) of the note is in neither the styles' cache nor the buffer's
parse, nothing is parsed for the layout: the note is drawn without its inline styles, its parse goes to the parse
workers as a big note's does for READ (`parseAhead`), and the window is drawn again when it lands, the pieces then read
from the parse. What the workers failed on stays plain until it changes. A piece's stand-in parse is made on the
screen's thread, as the render's are; a virtual buffer, never sent to the workers, is parsed there too.

**Why:** A 1 MB note's pieces take 2.5 s to parse; the screen must not wait for colours. The workers already parse a
big note for READ, and their chunks serve SOURCE view too. All or none keeps a note from showing half its styles.

**Not chosen:** parsing up to the budget, the rest later (a note half styled, and a second pass for the rest); a worker
of the styles' own (a second parse of the same text); parsing on the screen's thread whatever the size (seconds of
frozen screen on opening a big note in SOURCE view).

## SIS-D6: The lens and a note's diff the same (2026-11-10)

**Decision:** The lens's source rows and a note's diff (its window, the review, the merge screen: `layoutDiff`) draw the
inline styles as SOURCE view does, under the same switch. The lens parses its blocks alone; a diff parses only the
pieces holding a line it shows, a definition in a piece it doesn't show found by its line's pattern. A note's
before-and-after (`blockdiff.ts`) stays as it was.

**Why:** The issue asks for the diff ("the diff view highlights as SOURCE view does, so it gets this too"); the lens
shows the same source rows, and would look like a different editor without them. The before-and-after already formats
its blocks lightly as they read.

**Not chosen:** SOURCE view alone (the lens and the diff left looking older); the lens parsed with the whole note (its
rows are composed without a parse, so a keystroke there stays cheap).
