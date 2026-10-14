---
status: proposed
assignee: null
blocked_by: [GIT-T1]
created: "2026-10-14"
---

# GIT-T4: The rendered diff, a note's

A note's diff as the note reads, its change marked in place (GIT-D2).

## Description

- The renderer's diff layout: the version after, inserted spans marked, deleted text laid out where it was and struck; a
  deleted block struck; a table's changed cell tinted; a picture or diagram marked changed; front matter as properties
  with a changed value marked.
- `[git] diff`, `tab` to switch, unchanged stretches folded.

## Acceptance criteria

- A terminal check: a reworded sentence in a paragraph shows only its changed words, rendered; `tab` shows the source
  diff.
- Render tests for each kind of block; `bun run check` passes.
