# Design changes

Each change names the root's file and section, its text what the design says now that SIS-T1 is built. The root's
files change when the workstream is consolidated (SIS-T2), with the maintainer's approval. A link in the text points
from here to the root's file; consolidation writes it relative to design/.

## MODIFIED design/tui.md § SOURCE view (plan `4.13`)

Its second paragraph's first two sentences, "A source line is a row … inline code and links.", become the paragraph
below; the rest of the paragraph (fenced code's language, the gutter, the cursor, each row's offsets) stays.

A source line is a row, wrapped at the last space that fits (wrapping on) or kept whole (off); the text column is the
window's full width, readable width aside. Highlighting is per line for what a line says alone: frontmatter, headings,
rules, quote bars, list markers and task boxes, fenced code. Over it, a note's **inline styles** are drawn as the
render draws them, their markers kept (SIS-D1, SIS-D2; `core/rendering/layout/code/source-styles.ts`): the text between
`**` in the `strong` role and bold, between `*` or `_` in `emphasis` and italic, between `~~` in `strike` and struck —
in a heading, the heading's colour with the attribute added and its band behind — `==highlighted==` text in
`highlight` on its band, inline code, a link's text in `link` and its address in `url`, a wiki link's target as an
address and its alias as `wikilink` (`embed` or `image` for `![[…]]`), a footnote mark, a tag, maths, inline HTML's
tags, a table's pipes and delimiter row in `table_border`. The markers — `**`, `_`, `~~`, `==`, `$`, a link's brackets
and parentheses, `[[`, `|`, `]]`, `[^`, an escape's backslash, an Obsidian comment whole — are in `markup`, dimmer than
the text (the theme's comment colour; `mono`, dim), keeping the style's attributes. Only colours and attributes change:
the text, the rows and their offsets are those of the layout without them, so the cursor, a selection and find work as
before.

The styles are the render's parse's (SIS-D4): the note cut at every place it can be cut with the same parse as whole
(`chunkStarts` at a size of one line: a block, or the few that must go together), each piece parsed by the render's
processor, a piece using a label another defines parsed again with a stand-in definition, as `parseMarkdown` does. So
emphasis spans a paragraph's lines and a quote's (past each line's `>`), `snake_case_words` and a `*` in a code span
stay plain, an unclosed `**` stays as typed, and `2*3*4` reads as the render reads it. A piece's styles are kept by its
text in the layout's cache (`SourceCache.styles`): a keystroke parses the piece it changed, and a line added above moves
no cut below it. A piece the buffer's parse holds already (`ParseCache`, the render's chunks, each a run of pieces) is
read from it, never parsed again. Each line's styles are part of its row's signature in the row cache, so a row is made
again only when its styles change.

Off the screen's thread for a big note (SIS-D5): when more than `BACKGROUND_PARSE` (128 KiB) of the note isn't in
either cache, stand-in parses counted, nothing is parsed for the layout; the pieces not styled yet keep the light
highlighting (code spans and links by pattern), the note's parse goes to the parse workers (`parseAhead`), and the
window is drawn again when it lands — the layout made meanwhile kept under a key of its own, gone with the parse. The
workers parse the note's chunks, then those using a definition another chunk holds, with their stand-ins (SIS-D7); a
piece's stand-in parse is read from the render's chunk holding it. What's still missing past the budget once the
workers are done (a piece's stand-ins its render's chunk didn't need) is parsed here. Text the workers failed on keeps
the light highlighting until it changes; a virtual buffer, which isn't sent to them, is parsed here.

`[render] source_styles = false` (SIS-D3) turns the styles off: the light highlighting of before, its code spans and
links by pattern, a line at a time.

Previously: "A source line is a row, wrapped at the last space that fits (wrapping on) or kept whole (off); the text
column is the window's full width, readable width aside. Highlighting is light and per line: frontmatter, headings,
rules, quote bars, list markers and task boxes, fenced code, inline code and links."

## MODIFIED design/tui.md § The lens: live preview (plan `4.14`)

Its paragraph **How it's drawn.** gains, after its first sentence:

The source rows carry a note's inline styles as SOURCE view draws them (SIS-D6), the lens's blocks parsed alone: a
reference or footnote whose definition is outside them shows plain there.

Previously: the paragraph without it.

## MODIFIED design/tui.md § Git (plans `5.11`–`5.14`, `26.x`)

Its bullet **Drawn** (`layoutDiff`), its first sentence's "its text highlighted as SOURCE view highlights it — a note's
Markdown over the whole text, so a fence's or the front matter's lines read as theirs; code a line at a time, only the
lines shown." becomes:

its text highlighted as SOURCE view highlights it — a note's Markdown over the whole text, so a fence's or the front
matter's lines read as theirs, its inline styles (SIS-D6) parsed only in the pieces holding a line shown, a definition
in a piece not shown found by its line's pattern, within SOURCE view's budget (`styledSource`): each text's parse and
layout cache kept by the app between layouts (`DiffStyles`), a big text's parse sent to the parse workers and the diff
laid out again when it lands; code a line at a time, only the lines shown.

Previously: as quoted.

## MODIFIED design/rendering.md § Background parsing and spelling limits

Its paragraph "A big note's chunks go in contiguous batches …" gains, after its first sentence:

Once they're in, the chunks that use a label another chunk defines go too, with their stand-in definitions, in a second
round (`standInChunks`, SIS-D7): taken into the note's parse cache with the stand-ins taken out (`adoptStandIns`), so
the parse that follows on the screen's thread parses nothing. What's left to parse (`unparsed`) counts them once the
chunks are in.

Previously: the paragraph without it.

## MODIFIED design/rendering.md § Themes (plan `2.6`)

After its first paragraph, a paragraph:

`markup` is a Markdown marker kept on screen, in SOURCE view, the lens and a note's diff (SIS-D1): the palette's
comment colour, so it reads dimmer than the text it marks; `mono` draws it dim.

Previously: no `markup` role.

## MODIFIED design/rendering.md § Diffs

Its first sentence's "highlighted as SOURCE view highlights the file" becomes "highlighted as SOURCE view highlights
the file, a note's inline styles included (SIS-D6)".

Previously: "highlighted as SOURCE view highlights the file".
