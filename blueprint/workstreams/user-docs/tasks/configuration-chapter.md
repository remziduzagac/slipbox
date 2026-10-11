---
status: review
assignee: claude-config
blocked_by: []
created: "2026-10-11"
---

# DOC-T2: The configuration chapter

`docs/manual/configuration.md`: every setting and environment variable, from today's `docs/configuration.md`.

## Description

Rewrite `docs/configuration.md` as the manual's configuration chapter: the files and the order they apply in, what
a folder's settings may not do and why (a folder you clone can't choose what runs), how mistakes in a file are
handled, every key with its default, the links' convention, colours, `.editorconfig`, the dictionaries, reloading,
the environment. Code paths (`USER_ONLY` in `core/config.ts`), IDs and history go. Where slipbox keeps things, the
storage folders and what each holds, is written out here (from `blueprint/design/how-it-works.md` § Storage, read
against the code), since the docs never link into the blueprint.

The `## Every key` section keeps its single TOML listing, which a test reads: the test "what configuration.md
promises" in `tests/core.test.ts` reads `docs/manual/configuration.md` instead, its name updated to match.

## Acceptance criteria

- Every key of `DEFAULT_CONFIG` is listed with its default: the test passes reading the new chapter, and fails with a
  default changed in the chapter (mutation-checked, in the Log).
- Every environment variable the code reads is in § Environment, or left out as internal to the tests, said in the
  Log.
- Written as requirements.md § How they are written says: no roadmap or decision ID, no links into `blueprint/`.
- Every claim checked against the code, not the design alone. Where the two disagree, the doc says what the code
  does, and the Log names the difference for the coordinator; neither the code nor the blueprint is changed here.
- Clean under markdownlint at 120 columns; every relative link and anchor in it resolves, but those into chapters
  written in parallel, which DOC-T11 checks.

## Out of scope

- The other chapters and guides (their tasks), `docs/README.md` and the project README (DOC-T11).
- Removing the old reference, and the links to it (DOC-T11).
- `VAULT_CONFIG_TEMPLATE`'s pointer to the docs (DOC-T11).

## References

- Delivers: requirements.md § The documents (`manual/configuration.md`), § Acceptance criteria (the test).
- Rests on: DOC-D2, DOC-D3.
- Sources: `docs/configuration.md`, `src/core/config.ts`, `blueprint/design/how-it-works.md` § Storage,
  `blueprint/design/roots.md` § Settings.

## Log

- 2026-10-11: claude-config started. Read the brief, the workstream, `docs/configuration.md`, `src/core/config.ts`,
  `paths.ts`, `convention.ts`, `theme/index.ts`, `spell.ts`, `indent.ts`, `lint.ts`, `editor.ts`, `crash-reports.ts`,
  `update.ts`, the TUI's reload and session code, how-it-works.md § Storage and roots.md § Settings.
- 2026-10-11: tried on the reference set (a copy in the scratch folder, its own XDG folders): `slipbox info` with a
  user file full of mistakes (each warned as the chapter says), a cloned folder's file naming programs (every
  user-only key dropped with a warning), an enclosing root's file applying before a nested root's, a broken file and a
  missing `--config`, `[colors]` in `slipbox render`, `slipbox init`, a capture, and the storage folders made.
- 2026-10-11: differences from the old reference, the chapter saying what the code does:
  - A file that doesn't parse when slipbox starts is skipped whole, with a warning; keeping a file's last good
    contents is only for a live reload in the TUI. The old doc said only the reload case.
  - `--config` naming a missing file is warned of; `SLIPBOX_CONFIG` naming one is silent (the test pins the first).
  - `lint.enabled = "auto"` with `lint.command` set runs your command whatever markdownlint config there is: "auto"
    waits for a markdownlint config only for the default markdownlint-cli2.
  - `render.code`'s "TS, TSX, JS, Python so far" is out of date: the design's code view covers many more languages;
    the chapter says "where its language has one" and links code.md.
  - `[keys.explorer]` actions include `commit` and `amend`, missing from the old list.
  - `[update] check` in a folder's file is never read, but, unlike every other key only your file may set, it is
    dropped silently: no warning. Not a bug that harms anything; noted for the coordinator.
  - Under the `mono` theme (`NO_COLOR`, or chosen) `[colors]` sets attributes only, `[colors.mono]` included.
  - Warnings about `[keys]` (an unknown command, action or modifier) and `[colors]` are said where they are applied:
    the TUI, and `slipbox render` for colours; `slipbox info` doesn't report them.
- 2026-10-11: bug (not fixed, reported): the warning for the retired `[rename]` table shows a roadmap ID to users:
  `"rename" is retired — renames no longer write a note's old name into it (21.12); …` (`RETIRED` in config.ts).
- 2026-10-11: § Environment: every variable the code reads is in it but `SLIPBOX_TRACE` (the terminal tests'
  coverage log: internal to the tests), `APPDATA` and `LOCALAPPDATA` (native Windows only, not released), and
  `BUN_BE_BUN` (set by slipbox for the tools it runs, never read from you). Added beyond the old table:
  `SLIPBOX_PARSE_CACHE`, and the standard variables slipbox reads (`VISUAL`, `EDITOR`, `SHELL`, `TERM`, `COLORTERM`,
  `TERM_PROGRAM`, the locale's, `DISPLAY`, `WAYLAND_DISPLAY`, `XDG_RUNTIME_DIR`, `TMPDIR`, `USER`, `WSL_DISTRO_NAME`,
  `HOME`, `PATH`); `SLIPBOX_ROOT` and `SLIPBOX_FILE`, which slipbox sets for a command run with `:!`.
- 2026-10-11: storage, read against the code: every file of how-it-works.md § Storage is where it says. Native
  Windows' folders are left out (not released). Run from source, Bun keeps its own transpiler cache in
  `$XDG_CACHE_HOME/bun`: Bun's, not slipbox's, and not in the chapter.
- 2026-10-11: wrote `docs/manual/configuration.md` (690 lines): changing a setting; a folder's settings, the order,
  what only your own file can set, a folder's name; mistakes; every key (one TOML listing, ranges and allowed values
  in its comments); keys, aliases and groups (each pane's actions listed from the code); commands in settings;
  language servers, languages and linters; document types; the links' convention; colours (themes, overrides, every
  role); `.editorconfig`; spelling dictionaries; reloading and settings changed in the TUI (kept per root, a finding
  the old doc didn't say); environment; where slipbox keeps things, written out from how-it-works.md § Storage.
- 2026-10-11: the test "what configuration.md promises" in `tests/core.test.ts` renamed "what manual/configuration.md
  promises" and reads `docs/manual/configuration.md`; it passes. Mutation-checked, the chapter restored after each:
  `ui.scrolloff` listed as 4, `ui.history_limit` left out, the `[watch]` table left out, and `walk.extensions` as
  `["md"]` each make it fail, naming the key. (Two timing tests of the chunked parse in the same file time out under
  the load of the parallel writers; they touch nothing here.)
- 2026-10-11: closing. Lint clean at 120 columns; no blueprint ID or link into `blueprint/`; every setting, key,
  command, alias and CLI command and flag named checked against the code. Links to other chapters are to files only
  (`links-and-roots.md`, `code.md`, `reading.md`, `screen.md`, `editing.md`, `files.md`, `git.md`, `finding.md`,
  `privacy.md`, `cli.md`, `keys.md`, `../guides/install.md`), no anchors in them; `reading.md` doesn't exist yet.
