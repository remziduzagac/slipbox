---
status: done
assignee: claude-code
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

- 2026-10-11: claude-code started. Read the brief, the workstream, the design (`tui.md` § Git, What's under the cursor,
  Problems where they are, The Problems panel, Files beyond notes; `code-view.md`, `lsp.md`, `trust.md`, `links.md`
  § The merge review, `roots.md` § Worktrees), the old references and the code (`src/core/git*.ts`, `gitstage.ts`,
  `gitlog.ts`, `mergereview.ts`, `trust.ts`, `servers/`, `src/tui/git*.ts`, `keys.ts`, `actions.ts`, `app.ts`).
- 2026-10-11: tried on a copy of the reference set in the scratch folder, with its own XDG folders: `changed`,
  `diff` (a changed note, a new one), `worktrees` (from `kestrel-agent-sync-retry`), `merge-review` on five of
  kestrel's branches (moves, a delete, a conflict, none), `doctor` and `doctor <file>` (TypeScript, Python, Rust,
  a Dockerfile, a Gemfile project, a note, Java), `diagnostics` with servers and lint off (a syntax error, a note);
  a merge of `refactor/docs-layout` in a second copy, then `problems` and `relink --dry-run`. The TUI drawn
  headlessly by a script in the scratch folder (the test harness's way, servers off): the code view (TypeScript,
  Python), source mode's syntax errors in the Problems panel, source control (`space g s`, a file staged, `c`), blame
  and a file's history.
- 2026-10-11: `slipbox render <file.ts>` doesn't show the code view: a code file is refused, exit 2 ("is a typescript
  file, with no rendered form"), as CASES.md says. The brief's prompt said otherwise; the chapter doesn't promise it.
- 2026-10-11: differences, the chapters saying what the code does:
  - tree-sitter's syntax errors show only in source mode, out of insert (`problemsShown`), not in the code view;
    `code-view.md` § How it behaves says the code view's problems show "as in source mode". A server's show in both.
  - the Problems panel's All tab has a Frontmatter section (a document type's findings) between Fragile links and
    Lint; `tui.md` § The Problems panel doesn't list it. `slipbox problems` gives `frontmatter` too.
  - each branch's tabs come back on a switch only with `ui.restore_session` on (`headMoved`); `tui.md` doesn't say.
  - `lsp.md`'s servers table: SCSS and Less have no biome (CSS has); JSON with comments (`.jsonc`) is a language of
    its own; Ruby takes `Gemfile` and `Rakefile` too; Java and Kotlin have no server built in (`tui.md` names them
    among the files outlined by a server's symbols, which needs one set up).
  - `space g d` diffs any file of the root on screen, not only a note.
  - the old `docs/configuration.md` says `render.code` maps "TS, TSX, JS, Python so far": the code maps 13 languages
    (`DOCUMENT_GRAMMARS`). For DOC-T9.
- 2026-10-11: after a merge, `problems` says "moved to …" and `relink` fixes the links to a file git moved, but not
  the moved note's own relative links (merge-review's `note-moved`): those are only broken. Not a bug by the design
  (`links.md` promises the first only), but a gap: the chapter tells people to run the merge review first.
- 2026-10-11: more differences, written as the code does them:
  - in the code view a comment is prose, and a plain path in it (`./retry.ts:12`) is no link: `enter` says "no link
    here" (tried on kestrel's `src/sync/queue.ts`, after the parse); source mode follows it, and a comment's URL is a
    link in both. `tui.md` § Files beyond notes promises links in comments without saying the view. Likely a bug of
    the code view (its prose rows carry Markdown's links only); reported, not fixed. The chapter says to switch to
    source mode to follow one.
  - bug, reported, not fixed: `lsp.format` (`space c f`) always sends the server `tabSize: 2` (`insertSpaces` guessed
    from a tab at a line's start), not the file's indentation (`.editorconfig`, `indentUnit`): a server that takes
    the options (the JSON, CSS and HTML servers) would re-indent a four-space file to two. Read in the code, not tried
    (no servers run here). The chapter says only that the file is formatted as its server does.
  - the old `docs/keymap.md` § Git and Code cells and `docs/cli.md` § Git, doctor and diagnostics agree with the code
    on what these chapters name.
- 2026-10-11: wrote `docs/manual/git.md` and `docs/manual/code.md`. Checked: markdownlint clean at 120 columns
  (widths counted in characters); every key, setting, `:` alias and CLI command named found in `keys.ts`,
  `DEFAULT_CONFIG` and `CLI_COMMANDS`; no roadmap or decision ID; every link and anchor resolves (into `screen.md`,
  `editing.md`, `links-and-roots.md` as they stand now). Program output quoted in code blocks keeps its em dashes
  (merge-review's lines, the trust question). The Problems panel's keys are left to `screen.md`, completion's keys to
  `editing.md`; `lint.command` is in `code.md`, as `editing.md` sends it there. In review.
- 2026-10-11: accepted by the user; done.
