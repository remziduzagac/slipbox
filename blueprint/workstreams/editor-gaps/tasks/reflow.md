---
status: todo
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
