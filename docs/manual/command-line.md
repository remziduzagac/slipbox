# The command line

The `slipbox` executable can open the TUI or run a command that prints a result and exits. Agents and scripts use
the same command line you can use from your shell. [Commands and flags](cli.md) is the exhaustive reference.

## Choose a command

```bash
slipbox ~/notes/inbox.md           # opens the full-screen interface
slipbox read ~/notes/inbox.md      # prints the saved source, then exits
slipbox render ~/notes/inbox.md --plain
slipbox help
```

Use `read` for exact source and `render --plain` for rendered text without terminal control codes. `outline`,
`search`, `find`, `links` and `backlinks` answer different navigation questions. A write is an explicit command;
reading a file does not require entering the TUI.

## Where a command works

A named file supplies its vault; otherwise the current directory supplies the context. `--root` explicitly selects
where to start. Use full paths when crossing folders so you do not accidentally choose a same-named note elsewhere.
The [vault rules](vaults.md) and [file selection reference](cli.md#where-a-command-works) explain the details.

## Saved files and the running screen

Commands read saved files on disk. A running TUI can hold newer text that has not been saved. A command warns about
such notes, and `--json` reports them in `stale`; that is advice, not a lock or access to an unsaved buffer.

When a command changes a file and you have no unsaved edits, the screen reloads it. If you have unsaved edits,
slipbox asks which text to keep. [Editing](editing.md#when-a-file-changes-on-disk) explains that prompt. Save first
when you want a command to
use exactly what you see.

## Output for people and programs

Human output is the default. `--json` returns a structured envelope so a program can check success and consume the
result without scraping prose. Exit codes distinguish errors, missing targets, ambiguous names and refusals.
The exact [envelope and exit codes](cli.md#what-a-command-prints) belong to the reference.

```bash
slipbox outline ~/notes/inbox.md --json
```

Inspect both the exit status and the response. An empty list can be a valid answer; a failed command is a different
case. Commands that change text can provide previews or conditions; use the options appropriate to the command.

## Guard a write

An agent should read the file and its hash before proposing a replacement, then use `--if-unchanged` with that hash.
A stale hash causes a refusal instead of overwriting a newer saved change. This does not merge simultaneous edits
or make unsaved TUI text visible to the command.

[Working with agents](../guides/agents.md#writes-that-never-clobber-yours) demonstrates the full read/change/write
cycle. Read the [write reference](cli.md#write) before automating it.

## Continue

Use [Commands and flags](cli.md) for exact arguments, [Environment and storage](environment-and-storage.md) for
variables and paths, and [Versions](versions.md) for compatibility promises. The bundled `slipbox skill` teaches
agents this installed version's command interface.
