---
status: done
assignee: claude-writes
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

- 2026-10-11: `core/servers/find.ts`: `masonBin()` (what `userInstalls` already looked in) and `serverPath(path)`:
  Mason's `bin` appended when it's a folder and not on `PATH` already (a trailing `/` ignored); no `PATH` is left as
  it is. `core/servers/client.ts` sets the spawned server's `PATH` to it, after the server's own `environment`, so
  every server slipbox starts has it; linters are untouched.
- 2026-10-11: test in tests/servers.test.ts, "the servers of open files (19.1)": the fake server started by the
  manager through a launcher that writes its `PATH` down: absent, yours as it is; present, yours then Mason's;
  already on yours, as it is. Mutation-checked: without the line in `client.ts`, without the "already there" check,
  and without the folder check, it fails.
- 2026-10-11: live, on the reference set (`bun src/main.ts diagnostics work/kestrel/scripts/drain-queue.sh`): on this
  machine shellcheck is only in Mason's `bin`, not on `PATH`, and bash-language-server is found there too. With the
  change, `shellcheck SC2045: Iterating over ls output is fragile` is reported; with it undone, nothing (*ran*).
- 2026-10-11: design/lsp.md § The client for code says it.
- 2026-10-11: accepted by the user; done.
