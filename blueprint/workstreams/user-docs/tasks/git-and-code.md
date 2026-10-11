---
status: todo
assignee:
blocked_by: []
created: "2026-10-11"
---

# DOC-T7: The git and code chapters

`docs/manual/git.md` and `docs/manual/code.md`: a repository's history and changes, and its code.

## Description

**git.md**: what slipbox does with git, and what it never runs (hooks, filters); changed lines in the gutter (`] c`,
the preview, undoing a change); source control (stage, unstage, discard, conflicts); commit and amend; blame; a note's
history (its commits, an older version, the diff); branches; worktrees; the changes since a commit; reviewing a merge
(the links it would break); the CLI's git commands.

**code.md**: the code view (definitions as titles, doc comments drawn as prose, imports folded, folding, cells and
their keys, `space k`); the source view; the lens on code; language servers (which languages, how they are found
and installed, `slipbox doctor`); what's under the cursor (hover, definition, references and the rest); rename, code
actions, format; completion; linters; problems (the gutter, the Problems panel, `slipbox diagnostics`, a note's own
problems among them); trust: a folder's code never runs unless you trust its root, what trusting allows, `:trust`,
`[trust] roots`.

## Acceptance criteria

- Written as requirements.md § How they are written says: no roadmap or decision ID, no links into `blueprint/`.
- Every claim checked against the code, not the design alone. Where the two disagree, the doc says what the code
  does, and the Log names the difference for the coordinator; neither the code nor the blueprint is changed here.
- Every key, setting and CLI command a chapter names exists, as the chapter names it.
- Clean under markdownlint at 120 columns; every relative link and anchor in it resolves, but those into chapters
  written in parallel, which DOC-T11 checks.

## Out of scope

- The other chapters and guides (their tasks), `docs/README.md` and the project README (DOC-T11).

## References

- Delivers: requirements.md § The documents (`manual/git.md`, `manual/code.md`).
- Rests on: DOC-D2, DOC-D3.
- Sources: `blueprint/design/tui.md` (§ Git, What's under the cursor, Problems where they are, The Problems panel),
  `code-view.md`, `lsp.md`, `trust.md`, `links.md` § The merge review, `roots.md` § Worktrees, `docs/keymap.md`,
  `docs/cli.md`, `docs/configuration.md`, `src/`.

## Log
