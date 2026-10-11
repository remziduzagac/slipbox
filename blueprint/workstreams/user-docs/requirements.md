# Requirements

## Goals

- Someone who has never used slipbox can install it, open a folder, read, follow links, search, edit and save, from
  the guides alone (DOC-D2).
- Everything a user can do or set is in the manual: every key, setting, command and behaviour they meet, explained for
  a user (DOC-D2).
- The docs read well on GitHub and in slipbox (DOC-D1), and carry no blueprint IDs (DOC-D3).

## Non-goals

- How slipbox is built, and why: that is the blueprint's.
- A docs site, or any tooling to build one (DOC-D1).
- Rewriting the agent skill: it is checked against the docs, not replaced (DOC-D4).

## The documents

A proposal, for the user to accept:

```text
docs/
  README.md                the map: where to start, the guides, the manual's chapters
  guides/
    install.md             installing, upgrading, uninstalling; macOS, Linux, Alpine, Windows through WSL; Homebrew
    getting-started.md     a first session: open a folder, read, follow links, search, edit, save, quit
    agents.md              working beside agents: the CLI, the skill, the scratch, the context bundle, disk as contract
    code-and-git.md        a repository's code: the code view, language servers, problems, reviewing a branch
    from-obsidian-or-zk.md opening a vault or notebook as it is: its links, its conventions, what differs
    exporting.md           a note, or several, as Word, PDF, a web page, an e-book or portable Markdown
    making-it-yours.md     themes, keys, settings, per folder and your own
  manual/
    screen.md              the layout: panes, tabs, windows, the status line, the mouse
    reading.md             rendering: tables, code, pictures, diagrams, maths, data files, embeds
    links-and-roots.md     roots, link forms and conventions, wikilinks, named folders and pointers, backlinks
    finding.md             the switcher, search, find, the outline, history
    editing.md             source mode, the lens, the keys, saving and conflicts, completion, spelling, commands
    files.md               the explorer: making, moving, renaming with links kept, the trash, undo
    git.md                 changes in the gutter, source control, commit, blame, branches, worktrees, merge review
    code.md                the code view, language servers, linters, problems, trust
    export.md              every format, what each keeps
    keys.md                every key (today's docs/keymap.md)
    configuration.md       every setting and environment variable (today's docs/configuration.md)
    cli.md                 every command (today's docs/cli.md)
    privacy.md             what slipbox sends (the update check), what it never does, what it runs
    troubleshooting.md     slipbox doctor, the usual problems and their fixes
```

The project's README stays the front page: what slipbox is, a screenshot's worth of description, install in one line,
links into `docs/`.

## Builds on

- requirements.md, and every design file, for what slipbox does; the user docs say it for users.
- The README, today's three references and the skill, as source material.

## Acceptance criteria

- Every document above exists, linked from `docs/README.md`; every relative link resolves (markdownlint, and a link
  check).
- No roadmap or decision ID in `docs/` (a search for `` `\d+\.\d+` `` and `D\d+` finds none).
- Every key in `src/core/command-specs.ts`'s default keymap, every config key in `DEFAULT_CONFIG` and every CLI
  command is in the manual; the existing test of configuration defaults reads `docs/manual/configuration.md`.
- The guides' steps are tried as written, on the reference set (D209).
- The skill's commands agree with the CLI chapter.

## Changes

### ADDED requirements.md § Documentation

slipbox ships user documentation, in Markdown in `docs/`: guides for the tasks a newcomer meets, and a manual covering
every key, setting, command and behaviour, written for users, without the blueprint's IDs (DOC-D1–DOC-D4). A change
users will see updates the docs in the same piece of work.
