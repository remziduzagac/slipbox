---
status: todo
assignee: ""
blocked_by: []
created: "2026-11-08"
---

# EG-T1: Lists of places: the preview, where a pick opens, the last list again

EG-D2.

## Description

- Which lists are lists of places, and the place a row carries (a path, its vault, a line, a range).
- The preview: the place as slipbox shows its file, read-only, at the hit with it marked; beside the list on a wide
  screen, under it on a narrow one; `ctrl+t` and a click on the footer hide and show it; a file read off the keys.
- `alt+enter`: here, the split, a new tab or a peek, a peek of the current vault's file included; a palette command
  for terminals that take `alt+enter`.
- `space '`: the last list of places, its query, rows, selection, scroll and preview kept while slipbox runs in the
  vault.

## Acceptance criteria

- A terminal check on the reference set: the switcher, search, find in every note, references, backlinks and links
  each preview their row at 120 columns (beside) and 80 (under); `ctrl+t` and a click hide it; `alt+enter` opens a
  pick in each of the four places; `space '` brings a closed list back as it was.
- Unit tests for the preview's place and landing, and for the list kept.
- Every bug found gets a regression test; `bun run check` passes; the user docs and a CHANGELOG line come with it.

## Open

- How the palette's command for `alt+enter` reaches the pick, since the palette closes the list.
- Whether `ctrl+t`'s choice is remembered as a setting.
