---
status: todo
assignee:
blocked_by: []
created: "2026-10-11"
---

# DF-T4: A move into a folder; the trash emptied

Moving a note to a folder puts it in the folder; slipbox's trash can be emptied, and empties itself after 30 days.

## Description

- **A4 (DF-D4):** a new path that is an existing folder, or ends in `/`, means into it: `slipbox mv note.md
  ideas/` makes `ideas/note.md`, its links rewritten as for any move; the TUI's move (`space n m`, the explorer's
  `m`) likewise; `--dry-run` and `--plan` too.
- **C1 (DF-D14):** `slipbox trash empty` (a preview, then `--yes`, as `uninstall` does) and the TUI's trash list
  (`space v` trash) empty slipbox's trash; an item older than 30 days removed when the trash is next read or written.
  The CLI command added to `src/core/command-specs.ts` with the TUI's command, as CLAUDE.md's rule says.

## Acceptance criteria

- Each fix with a regression test beside the related tests, that fails without it (mutation-checked, in the Log).
- Tried on the reference set with the CLI, or headlessly as `tests/tui.test.ts` drives the TUI (D209), in the Log.
- The user docs that describe it changed in the same task (`docs/manual/`, `docs/guides/`, the skill for the CLI),
  without IDs; `tests/docs.test.ts` passes.
- The new design text written under its entry in DF's [design.md](../design.md), never in the root's design files.
- The typecheck and the test files touched pass; the whole suite once at the end.

## References

- Delivers: DF-D4, DF-D14; the root's design/links.md § Renames and moves, design/tui.md § Files in the explorer.
- Docs: docs/manual/files.md, cli.md, keys.md, privacy.md (what slipbox keeps), configuration.md (storage).

## Log
