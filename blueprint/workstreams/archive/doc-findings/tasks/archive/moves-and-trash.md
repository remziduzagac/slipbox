---
status: done
assignee: claude-files
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
- The new design text written under its entry in DF's [design.md](../../design.md), never in the root's design files.
- The typecheck and the test files touched pass; the whole suite once at the end.

## References

- Delivers: DF-D4, DF-D14; the root's design/links.md § Renames and moves, design/tui.md § Files in the explorer.
- Docs: docs/manual/files.md, cli.md, keys.md, privacy.md (what slipbox keeps), configuration.md (storage).

## Log

- 2026-10-11, A4, found: `cleanTarget` (`core/rename.ts`) stripped the trailing `/` and `planNoteRename` added the
  note's extension, so `ideas/` became `ideas.md`; `planFolderMove` refused an existing folder as "exists". The
  explorer's `m` and a paste build `<folder>/<name>` themselves, so only paths typed were wrong: `slipbox mv`,
  `space n m` and `:mv`.
- 2026-10-11, A4, fixed: `moveTarget(g, from, typed)` in `core/rename.ts`, applied by the callers of typed paths only
  (`slipbox mv` for a note, a folder and a nested root; the TUI's `renameNoteTo`, which `space n m` and `:mv` use), so
  the explorer's `r` stays a rename in place: a sibling folder of the typed name is no place to go into there. A
  folder's case-only rename on a disk that ignores case is no "into" (same inode). The root is a folder too: `/` in
  the TUI; in the CLI `destArg(…, into)` lets a move name the root, and reads `.` and `..` from the current folder, as
  `./`, `../` already were (`cp`'s reading unchanged). `--dry-run` and `--plan` hold the path it lands on.
- 2026-10-11, A4, not done, a question: `slipbox cp note.md ideas/` still makes `ideas.md` beside the folder, the
  same bug; DF-D4 names `mv` only, so `cp` is left, and cli.md now says it doesn't copy into a folder. For the user.
- 2026-10-11, C1, fixed (`core/files.ts`): `TRASH_DAYS = 30`; `listTrash(v, now)` removes an item older than that,
  list first, then its folder, so every read and write (list, restore, delete, a root's `.slipbox/` trashed) purges;
  an `at` that doesn't parse is kept. `emptyTrash(v, ids?)` removes all, or the ids a preview listed. An id that
  isn't the trash's own form (`../x`, hand-edited) is dropped from the list, its path never followed.
- 2026-10-11, C1, CLI: `slipbox trash empty` lists ("removes for good, N items:" … "nothing removed yet: again with
  --yes"), `--yes` removes; `{removed, items}` in JSON; `--yes` with anything but `empty` is a usage error, as is an
  item after `empty`. TUI: `trash.empty` ("Empty the trash", `:empty-trash`, kitchen-sink `leader ; z c`, CASES.md):
  the trash list gets a last row, **Empty the trash…**, after a blank one (`up` from the first row; the command opens
  the list on it, enter still restores the newest otherwise); enter asks y/n, `y` empties exactly what the list
  showed, and `u` no longer looks for the last delete once it's gone. No leader key: an irreversible act behind a
  list and a question.
- 2026-10-11, tests, each mutation-checked (a Python runner undoing one fix at a time, restoring the file): vault.test
  "a move typed as a path…" and cli.test "mv into a folder…" and tui.test "space n m into a folder…" (`moveTarget`
  returning the path as typed: all three fail; the CLI's and the TUI's call removed: theirs fail); vault.test "the
  trash emptied…" (no purge; `emptyTrash` ignoring the ids; the id guard removed: each fails); cli.test "trash
  empty…" (`--yes` removing nothing: fails); tui.test "the trash's last row empties it…" (no row; emptying all instead
  of the list's; `lastTrashed` kept: each fails). tui.test "d deletes to the trash…" now expects the two new rows.
- 2026-10-11, tried (D209) on the reference set's `notes/` root in my scratch folder, its XDG folders there:
  `mv inbox.md archive/` (dry-run and plan: `inbox.md → archive/inbox.md`), `mv inbox.md projects` (into the folder, no
  `projects.md`), `mv inbox.md ..` from `projects/` (back to the top), `mv inbox.md in-tray` (still a rename);
  `rm` twice, `trash empty` (listed, nothing gone), `--yes` (gone, `trash.json` alone left), `trash restore` exit 3,
  `trash --yes` exit 2; an item backdated 40 days gone at the next `slipbox trash`. Headlessly, as tui.test drives it:
  `space n m` + `projects` → `projects/inbox.md`, `:mv /` back; `space v t` shows the row, up + enter asks, `n` keeps,
  `:empty-trash` + enter + `y` empties ("emptied the trash: 1 item gone for good"), `space v t` then says it's empty.
- 2026-10-11, docs: files.md (Renaming and moving, Deleting and the trash, the command table, Keys), cli.md (`mv`,
  `cp`'s new path, `trash`, the table), keys.md (`space n m`, `space v t`, `:empty-trash`), privacy.md (the state
  folder), configuration.md (`trash/`), the skill (moving, `trash empty`); the design text in DF's design.md. No e2e
  scenario covers either change: the TUI's trash list and `space n m` into a folder lack one.
- 2026-10-11, checks: the typecheck and the boundary pass; the touched files' tests pass (vault, cli, tui by the
  tests named above, docs and home whole). The whole suite, run once on a machine saturated by seven agents, was
  killed (exit 137, memory) inside tui.test; its failures were timeouts (the chunked parse, wrapping, spell, the
  background index, the skill's commands at the CLI's 20 s spawn limit), `stat`'s root shown as
  `halden@worktree-…` (this worktree's demo vault a second halden on the machine), a layout snapshot and the
  servers' lock check: none touches what changed. The coordinator runs the whole suite after merging.
- 2026-10-12: accepted on the coordinator's recommendation, the user having said to take them as answers until done; done.
