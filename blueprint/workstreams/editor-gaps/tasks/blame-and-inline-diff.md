---
status: todo
assignee: ""
blocked_by: [EG-T4]
created: "2026-11-08"
---

# EG-T12: Blame for the file, and the inline diff

EG-D16, EG-D17.

## Description

- `space g b`: the blame column, by line and by block, mapped to the text now, newer commits brighter, read again
  when git has news; a click or `space g shift+b` shows a commit.
- `space g o`: removed lines drawn in place, never text, added and changed ones tinted; against what's staged, then
  the base, then off; `] c` / `[ c` through what it shows.
- Spans drawn but never text, stepped over by the cursor and left out of copies and find (rendering.md § The layout
  IR).

## Acceptance criteria

- A terminal check: the column on a note with lines from two commits and one uncommitted; the inline diff on a
  changed note, both bases, in SOURCE view and rendered.
- Every bug found gets a regression test; `bun run check` passes; the user docs and a CHANGELOG line come with it.

## Open

- The code view: by row of code, or by cell.
