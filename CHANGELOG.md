# Changelog

Every release of slipbox, newest first: what it added, changed, deprecated, removed and fixed, and its security fixes.
The format is [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/); what a version number promises is in
[Versions](docs/manual/versions.md). A breaking change is marked **Breaking**, with what to do about it.

## [Unreleased]

The first release.

### Added

- A terminal app for reading and writing Markdown notes in any folder: a git repository, an Obsidian vault, a zk
  notebook, or a plain folder, opened as it is, with nothing to set up and nothing written into it by opening it.
- Notes drawn properly in the terminal: tables fitted to the width, highlighted code, pictures where the terminal draws
  them, Mermaid diagrams and maths as text, callouts, footnotes and front matter; themes and glyph sets.
- Links in the forms GitHub, Obsidian and zk write them, followed between folders; folders named once and reached by
  `slipbox://` pointers wherever they are; backlinks; every link kept through renames and moves.
- Editing in source mode or in the lens, with vim's keys or the usual editor keys; saving that asks before writing over
  another program's change; autosave, completion, spelling, find and replace in one note or every note.
- Search over an index kept up to date as files change, the switcher, the outline, tags, history and the trash.
- Git: changed lines in the gutter, source control and commits, blame and a file's history, and the links a branch or a
  merge would break.
- Code files as documents, with language servers and linters; nothing a folder brings runs until you trust it.
- Exports to Word, PDF, a web page, an e-book or Markdown.
- A command line for agents and scripts on the same files: every change the TUI makes, one JSON object per call with
  `--json`, stable exit codes, and a skill that teaches it to agents.
- Builds for macOS and Linux (x64 and ARM, and Alpine's musl), an installer that checks each download, a Homebrew
  formula, `slipbox upgrade` and `slipbox uninstall`; Windows through WSL.

[Unreleased]: https://github.com/remziduzagac/slipbox/commits/main
