---
status: todo
assignee: ""
blocked_by: [EG-T1]
created: "2026-11-08"
---

# EG-T8: Find in every note, and a replace with rows left out

EG-D10.

## Description

- The list fills as the query is typed, each query a request to the regex worker, a newer one taking back the last.
- It opens on the selection or the cursor's word, selected; `space f w`.
- `path:` narrows the files; `] q` / `[ q` after it closes.
- Replace's preview: before and after on each row, `ctrl+x` and a click dropping a row, the title counting those kept;
  one undo step.

## Acceptance criteria

- A terminal check: typing narrows live; it opens on the cursor's word; `path:ops/`; `] q` twice after closing; a
  replace with two rows dropped, undone in one step.
- Every bug found gets a regression test; `bun run check` passes; the user docs and a CHANGELOG line come with it.

## Open

- Whether `] q` steps through the last list of places whatever its kind.
- How a literal `path:` is found, and whether `slipbox find` takes `path:`.
- A replace with rows left out has no `slipbox replace` form.
