---
status: done
assignee: ""
blocked_by: []
tracker: [gh:#103]
created: "2026-11-10"
---

# SIS-T1: The inline styles in SOURCE view, the lens and a note's diff

SIS-D1 to SIS-D6. Done on 2026-11-10.

## Description

- `src/core/rendering/layout/code/source-styles.ts`: a note's pieces (`chunkStarts(lines, 1)`) parsed by the render's
  processor, with stand-in definitions; their nodes turned into each line's paints (a stretch, a role or the line's
  own raised, attributes, a background) and signatures; kept by a piece's text, or read from the buffer's
  `ParseCache`; all or none past a limit, said by `pending`.
- `source.ts`'s `layoutSource` takes `styles`: each line's paints over its light highlighting (`applyPaints`), a cell
  carrying attributes and a background, the line's signature part of its row's in the row cache.
- The `markup` role, in every theme; `[render] source_styles`, on by default.
- The buffer's source layout passes its parse cache and the limit (`BACKGROUND_PARSE`, now exported by
  `parse-pool.ts`), sends a big note's parse to the workers and keeps the layout made meanwhile under a key of its own;
  the window is drawn again when the parse lands.
- The lens (`composeLive`) and the diff (`layoutDiff`, the side-by-side diff's lines, the review and the merge screen)
  take `styles`; a diff's cells carry the attributes.

## Acceptance criteria

- Unit tests (`tests/core/rendering/layout/code/source-styles.test.ts`): a test per style, markers kept and text
  styled; rows, text and `srcMap` as with styles off, wrapped and not; CommonMark's edge cases; headings, list items,
  tables, a tab, CRLF; a footnote and a reference defined in another piece; the buffer's parse used, and nothing parsed
  past the limit, said as pending; the incremental layout equal to a fresh one after 600 random edits; a diff's lines;
  the lens's rows; the switch off.
- TUI tests (`tests/tui/documents/views/source-styles.test.ts`): a note in SOURCE view, bold bold and its markers in
  their own colour, and the switch off; a big note plain while its parse runs on other threads, styled and drawn again
  once it lands.
- Each behaviour mutation-checked once: 24 mutations, each failing a test.
- A terminal check (`tests/terminal/checks/markdown-inline.ts`): the demo vault's handbook in SOURCE view, its bold
  text bold, its `**` in the markup role's colour; it fails with the switch's default off.
- The manual's SOURCE view section, the configuration reference (the key, the role), the CHANGELOG; the screenshots
  that show a note's Markdown with a link in it retaken (SOURCE view, the lens's, the conflict prompt's, the vault
  switch's), the others that showed none unchanged.
