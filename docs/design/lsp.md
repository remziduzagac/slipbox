# The LSP face

`slipbox lsp` serves vaults to an editor over the Language Server Protocol (plan `11.x`; why, in the plan's "Phase 5
decided 2026-10-01"): nvim, or any editor, gets slipbox's graph — the same core the TUI and the CLI answer from. Later
this document also covers slipbox's own client for code languages (`19.x`).

## Starting it

`slipbox lsp` speaks on stdio. `--config <file>` names the user config, as for the CLI; `--stdio` and
`--clientProcessId` are taken and ignored, since editors pass them by habit. Nothing but the protocol reaches stdout:
slipbox's own news — a config problem, a walk error, a watcher falling back to polling — goes to the editor's log
(`window/logMessage`), never a pop-up.

## Vaults only

A file belongs to the nearest folder above it with `.slipbox/`, as in the TUI and the CLI. A file outside every vault
gets nothing from slipbox: markdown elsewhere is left to whatever else the editor runs there (marksman). The workspace
folders the editor names at `initialize` are opened once it says it's ready (`initialized`), so its first request
doesn't wait on a walk; any other vault opens when a file of it first comes up. Each one opened is recorded as seen on
this machine (`17.6`), as the TUI and the CLI record theirs.

Each vault's graph is the TUI's: the persisted index read and refreshed, other vaults reached through the machine's
list (`17.8`), an alias counted whichever note was parsed first (`17.7`). The TUI's watcher keeps it current, and
`core/vault-feed.ts` — the TUI's own handling of git, shared — holds the watcher's news while git writes and doesn't
take a branch switch's files for moves (`5.9`, `5.10`). A server and a TUI on one vault see the same vault.

## The session

- **`initialize`** answers with `serverInfo` (`slipbox` and its version) and incremental document sync: open, change,
  close and save.
- **Ending it:** `shutdown` then `exit` is exit 0; `exit` without `shutdown`, or the editor's pipe closing, is 1, as
  the protocol has it.
- **An editor gone without a word:** the process id `initialize` gives is looked at every 3 seconds, and the server
  ends when it's no longer there.

## Unsaved text

An editor's open note stands for the note as the editor has it (`11.8`): its links, headings, tags and names count —
for this note's requests and for others', so a link typed and not yet saved is already a backlink. Its text counts as
soon as it opens, then again once typing pauses for 150 ms: a parse per pause, not per key, and a request about the
note asks for its latest text first. Closing it gives the file back.

Only the server's answers see it. The persisted index keeps the file's entry, moves are known by the file's text, and
the file changing under an open note (an agent's write) leaves the editor's text standing until the editor reloads. So
"disk is the contract" (`9.4`) still holds for the CLI and the TUI, which the editor's unsaved text never reaches.

## What it serves

So far the session and the vault as the editor has it (`11.2`, `11.7`, `11.8`); the features follow `11.3`–`11.11`.
