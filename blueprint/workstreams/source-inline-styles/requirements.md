# Requirements

## Goals

- **Each inline style shown as it renders, its markers kept** (SIS-D1, SIS-D2): the text between `**` bold, between
  `*` or `_` italic, between `~~` struck, `==highlighted==` text on its band, in headings and list items too; a link's
  text apart from its address; wiki links, footnote marks, tags, maths and inline HTML as the render colours them. The
  markers stay as typed, in a colour of their own, dimmer than the text.
- **Nothing hidden and nothing moved:** the text is exactly what's in the file. Only colours and attributes change, so
  the cursor, a selection, find and each row's map of offsets (`srcMap`) are as they were.
- **The same parse as the render** (SIS-D4): what READ shows as bold is what SOURCE view shows as bold, by CommonMark's
  rules, not a pattern's — a `*` in a code span, `snake_case_words`, an unclosed `**` while typing, emphasis across a
  paragraph's lines, a footnote or a reference defined elsewhere in the note.
- **The lens and a diff the same** (SIS-D6).
- **A switch** (SIS-D3): `render.source_styles`, on by default; off, the light highlighting of before.
- **No slower to type in** (SIS-D5): a keystroke parses the paragraph it changed, never the note; a big note is never
  parsed on the screen's thread for it.

## Non-goals

- Hiding the markers, at the cursor or anywhere.
- Styles in code files, data files or a fence's code.
- The before-and-after diff of a note's blocks (`blockdiff.ts`).

## Builds on

- design/tui.md § SOURCE view: the source layout (`core/rendering/layout/code/source.ts`), its per-line highlighting and
  its row cache.
- design/rendering.md § Blocks and inlines: how the render composes an inline style's role and attributes
  (`render-inline.ts`).
- design/rendering.md § Background parsing and spelling limits: a big note's parse on the parse workers, its chunks
  kept in the buffer's parse cache.

## Acceptance criteria

- A unit test per style: its markers kept as `markup`, its text in the render's role and attributes; the rows, their
  text and `srcMap` the same as with styles off.
- The issue's edge cases tested: a `*` in a code span, `snake_case_words`, an unclosed `**`, emphasis across lines and
  across a quote's lines, `2*3*4`, headings, list items, tables, a tab's indent, CRLF, a footnote and a reference
  defined in another chunk.
- The incremental layout, styles on, equal to a fresh one after any edit.
- A diff's lines and the lens's rows styled.
- A big note in SOURCE view plain while its parse runs on other threads, styled and drawn again once it lands.
- A terminal check of a note in SOURCE view: its bold text bold, its `**` in the markup role's colour.

## Changes to the root's requirements

### MODIFIED requirements.md § Editing

The second bullet becomes:

- The editor is vim-shaped and consistent with the other modes: source mode is another layout of the note, showing its
  inline styles as the render reads them, their markers kept and dimmed, nothing hidden (SIS-D1, SIS-D4); the lens
  edits the block under the cursor in place within the rendered note; undo survives a reload from disk (D146, D147).

Previously: "The editor is vim-shaped and consistent with the other modes: source mode is another layout of the note,
and the lens edits the block under the cursor in place within the rendered note; undo survives a reload from disk
(D146, D147)."
