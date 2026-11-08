---
status: todo
assignee: ""
blocked_by: []
created: "2026-11-08"
---

# EG-T2: Jump labels

EG-D3.

## Description

- `cursor.jump`: targets in every window of the tab, each word start and link as drawn; labels from a home-row
  alphabet, the nearest the shortest, widths by `width.ts`; a mode of their own in the dispatch.
- `s` in the reading keymap, `g w` there and in SOURCE view.

## Acceptance criteria

- A terminal check: in a split, a label typed in each window moves the cursor there and focuses it; on a link,
  `enter` follows it; `esc` and a key no label starts with leave everything as it was.
- Unit tests for the targets and the labels' order.
- Every bug found gets a regression test; `bun run check` passes; the user docs and a CHANGELOG line come with it.

## Open

- The lens, whose keys are SOURCE view's.
- Whether a label is an operator's motion (`d g w`).
