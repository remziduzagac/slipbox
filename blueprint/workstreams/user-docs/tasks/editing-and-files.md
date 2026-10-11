---
status: todo
assignee:
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
