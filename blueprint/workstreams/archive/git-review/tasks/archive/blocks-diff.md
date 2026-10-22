---
status: done
assignee: claude-cli
blocked_by: []
created: "2026-10-14"
---

# GIT-T4: A note's diff before and after

A note's diff as before-and-after blocks, the changed words marked in each (GIT-D2, the user's choice of 2026-10-15).

## Description

- Each changed block laid out twice, in a `before` and an `after` frame, lightly formatted (headings, emphasis, links, a
  table's cells); the removed words marked in the first, the added in the second; a block added or removed whole laid
  out once, marked.
- `[git] diff = "blocks" | "source"` for notes, blocks by default; `tab` switches to the source lines; unchanged
  stretches folded to a line saying how many lines they hold; the same in every diff window a note's diff appears in.

## Acceptance criteria

- A terminal check: a reworded sentence in a paragraph shows a before and an after block, only its changed words marked;
  `tab` shows the source diff.
- Render tests for a paragraph, a list item, a table's row, a heading, a block added and a block removed; `bun run
  check` passes.
