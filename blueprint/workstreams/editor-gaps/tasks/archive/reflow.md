---
status: done
assignee: ""
blocked_by: []
created: "2026-11-08"
---

# EG-T10: Reflow, both ways

EG-D12.

## Description

- `core/documents/editing/reflow.ts`, pure, over the note's tree: wrap and join, keeping markers, indents, quotes and
  hard breaks, never breaking a link or code span, leaving headings, tables, fences, HTML and front matter.
- `g q`, `g shift+q`, visual `g q`, `:reflow [width]`, `:unwrap`.
- The width: `editor.text_width`, else markdownlint's `MD013` `line_length` read as data, else `.editorconfig`, else
  80.

## Acceptance criteria

- Unit tests for each kind of block, both ways, and round trips.
- A terminal check on the reference set: `g q i p` and `g shift+q i p` on a list item, a quote and a paragraph.
- Every bug found gets a regression test; `bun run check` passes; the user docs and a CHANGELOG line come with it.

## Open

What EG-D12 left open, settled here for the maintainer to confirm; design.md § "MODIFIED design/tui.md § Editing",
its Reflow item, says how.

- A range reflows every paragraph it touches, whole; a selection's `g q` and `:'<,'>reflow` alike.
- Lines break at ASCII spaces and tabs only: a CJK run and a no-break space are never broken.
- A list item's other lines go at its text column, a deeper indent already there kept; a task's box stays on its first
  line; a footnote's lines after its first are indented four; a paragraph at the top starts at column 0.
- No line starts with a word that would open a block there, nor ends in a backslash: the word before goes down with
  it, else the line overflows.
- Inline HTML, inline maths, footnote references and Obsidian `%%` comments are whole, as links and code spans are; a
  callout's first line (its title) is kept as it is; an Obsidian comment block's paragraphs are left alone.
- The width: only a `line_length` stated counts (an `MD013` left on at markdownlint's default says nothing);
  `MD013: false` goes on to `.editorconfig`; the nearest data config first, up to the vault's top, then
  `~/.markdownlint-cli2.jsonc` where the vault has none; `extends` isn't followed; `lint.enabled` doesn't matter.
  `editor.text_width` takes 0–1000, 0 unset. A width typed after `:reflow` wins for that once.
- `:reflow` and `:unwrap` take `'<,'>`, `%`, `.` and `N,M` before them in the palette; `:reflow` in a rendered window
  switches it to editing, as a filter does.
- Markdown notes only: in any other file it says so and changes nothing.
