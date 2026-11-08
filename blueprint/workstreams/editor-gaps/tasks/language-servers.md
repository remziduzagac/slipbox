---
status: todo
assignee: ""
blocked_by: []
created: "2026-11-08"
---

# EG-T13: What the language servers add

EG-D19.

## Description

- Inlay hints (off by default, `space u h`), the uses of a name (`] r`, `space u shift+r`), the call hierarchy
  (`space c i`, `space c o`), imports fixed on a file's rename in the rename's preview, a range formatted (visual `=`,
  `g =`), `:lsp-restart`.
- The client says it takes them at `initialize`, and the features' names for several servers on one file.

## Acceptance criteria

- Live checks with the TypeScript server, listed for approval before they run (D207): each of the six.
- Unit tests with a fake server for each request and its answer dropped when stale.
- Every bug found gets a regression test; `bun run check` passes; the user docs and a CHANGELOG line come with it.

## Open

- Whether `slipbox mv` asks the servers too (D18), and whether `space v shift+u` takes the imports back (D152).
