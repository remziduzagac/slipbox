---
status: todo
assignee:
created: "2026-10-11"
---

# T2: Put Mason's `bin` on the language servers' `PATH`

A language server slipbox starts gets Mason's `bin` on its `PATH`, after the user's own, when slipbox finds Mason.

## Description

`core/servers/find.ts` already knows Mason's `bin` (`$XDG_DATA_HOME/nvim/mason/bin`) as a place to look for programs;
`core/servers/client.ts` spawns a server with `process.env` and the server's own `environment`. Add Mason's `bin` to
the end of the spawned server's `PATH` when the folder exists (and isn't already on it). Only for servers; linters
keep their own `PATH` handling (`linters.ts`, `projectPath`).

## Acceptance criteria

- A test starts the fake server with a temporary Mason folder present and sees it last on the server's `PATH`; absent,
  `PATH` is unchanged. It fails without the change.
- design/lsp.md § The client for code says it.

## Out of scope

- Finding other install folders' helpers.

## References

- Delivers: D222; design/lsp.md § The client for code.
- Rests on: D170, D172.

## Log
