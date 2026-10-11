---
status: done
assignee: claude-editing
blocked_by: []
created: "2026-10-11"
---

# DOC-T6: The editing and files chapters

`docs/manual/editing.md` and `docs/manual/files.md`: changing a note, and making, moving and removing files.

## Description

**editing.md**: the two ways to edit, the lens and source mode, and switching between them; vim's keys (modes,
operators, text objects, registers, undo, `.`) and the desktop editors' keys; saving (autosave, `ctrl+s`, `:w`);
a file changed on disk while you edit it (reloading, the conflict prompt); notes with unsaved changes, and agents;
completion; spelling; tasks; the problems shown as you write (the lint surface); indentation (`.editorconfig`);
snippets; the `:` commands for editing; running a command and filtering lines (`:!`); handing a note to your
editor or a running nvim; the scratch (what it is, `space s`, capture from the CLI).

**files.md**: the explorer: moving in it, what it shows (`files.show`, hidden and ignored files), opening files, new
notes and folders, renaming and moving with links kept (what changes, the preview), copying, deleting to slipbox's
trash and restoring, undoing a file operation; the same from the CLI.

## Acceptance criteria

- Written as requirements.md § How they are written says: no roadmap or decision ID, no links into `blueprint/`.
- Every claim checked against the code, not the design alone. Where the two disagree, the doc says what the code
  does, and the Log names the difference for the coordinator; neither the code nor the blueprint is changed here.
- Every key, setting and CLI command a chapter names exists, as the chapter names it.
- Clean under markdownlint at 120 columns; every relative link and anchor in it resolves, but those into chapters
  written in parallel, which DOC-T11 checks.

## Out of scope

- The other chapters and guides (their tasks), `docs/README.md` and the project README (DOC-T11).
- The code view's own editing and a language server's edits (DOC-T7); how links are rewritten, beyond what a user
  sees (DOC-T5).

## References

- Delivers: requirements.md § The documents (`manual/editing.md`, `manual/files.md`).
- Rests on: DOC-D2, DOC-D3.
- Sources: `blueprint/design/tui.md` (§ Writing notes, Source mode, The lens, Editing, External changes, The lint
  surface, Files in the explorer, Renames), `blueprint/design/links.md` § Renames and moves, the roadmap's `25.x`,
  `docs/keymap.md`, `docs/cli.md`, `src/tui/`, `src/core/`.

## Log

- 2026-10-11: started (claude-editing).
- 2026-10-11: read the sources: the References, `docs/keymap.md`, `docs/configuration.md`, `docs/cli.md`, the code
  (`src/tui/keys.ts`, `src/core/command-specs.ts`, `src/core/config.ts`, `src/tui/editing.ts`, `src/tui/vim.ts`,
  `src/tui/completion.ts`, `src/tui/snippets.ts`, `src/tui/spelling.ts`, `src/tui/shellrun.ts`, `src/core/files.ts`,
  `src/core/rename.ts`, and `src/tui/app.ts`'s saving, autosave, conflict, hand-off and explorer code) and the tests.
- 2026-10-11: tried on a copy of the reference set, its state folders its own: `info`, `mkdir` (from a subfolder: from
  the root; `./`: from here), `write --create`, `mv` (`--dry-run`, a rename, a move, a note reached by `[[name]]`
  links), `undo`, `cp` (beside it twice, a folder), `rm` (`--dry-run`, a note, a folder), `trash`, `trash restore` (and
  refused over a file there again, exit 5), `capture` (text, `--ref`, `--snippet`, `--stdin`), `scratch show`, `copy`,
  `clear`. And the TUI headless, the App driven by keys as `tests/tui.test.ts` drives it, from a script in my scratch
  folder: typing, `ctrl+z` and `shift`+arrows while typing, the lens with `edit_in = "live"`, a task ticked in an
  unsaved note, the conflict prompt and its merge, `space n r` on an unsaved note, selections in source mode.
- 2026-10-11: differences (the docs say what the code does): (1) while typing, `ctrl+z`, `ctrl+y`, `shift`+arrows,
  `pageup` and `pagedown` do nothing (insert mode swallows them); the old keymap doesn't say so, and someone who
  doesn't know vim will press them. (2) A `shift`+arrow selection in source mode isn't visual mode: `d`, `x` and `c`
  don't act on it (`x` deletes the cursor's character and the selection stays); only `ctrl+c`, `ctrl+x` and `ctrl+v`
  do. A mouse drag in source mode is visual mode. `backspace` and `delete` are unbound when not typing ("delete is
  not bound"). (3) Snippets are only a language server's: there are no snippets of your own. (4) A new note's name
  with an extension slipbox doesn't know (`notes.txt`) gets `.md` added (`notes.txt.md`), as the design says.
- 2026-10-11: bugs, not fixed: (a) `space n r` (`note.reload`) on a note with unsaved changes whose file has not
  changed on disk opens the conflict prompt, titled "changed on disk, and you have unsaved changes"; `esc` then keeps
  yours, turning autosave off for it. `reloadBuffer` calls `conflictPrompt` without asking `changedOnDisk()`.
  (b) `slipbox mv <note> <folder>` where the folder exists, `ideas2/` with its slash too, renames the note to
  `ideas2.md` beside the folder instead of moving it in or refusing (`cleanTarget` strips the slash, then the note's
  extension is added); `space n m` the same. The doc tells you to give the whole path.
- 2026-10-11: gaps for the coordinator: nothing empties the trash (no command, no setting; the doc says to delete it
  by hand in the state folder); `slipbox write <path> --create --allow-empty` with no text still says "write needs the
  text, or --stdin", so the CLI can't make an empty note.
- 2026-10-11: done: `docs/manual/editing.md` (445 lines) and `docs/manual/files.md` (252 lines), lint clean; every key,
  setting, alias and CLI command named checked against the code. Links only to other chapters, no anchors in them.
- 2026-10-11: accepted by the user; done.
