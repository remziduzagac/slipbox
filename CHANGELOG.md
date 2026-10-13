# Changelog

Every release of slipbox, newest first: what it added, changed, deprecated, removed and fixed, and its security fixes.
The format is [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/); what a version number promises is in
[Versions](docs/manual/versions.md). A breaking change is marked **Breaking**, with what to do about it.

## [Unreleased]

### Added

- Homebrew, on macOS and Linux: `brew install remziduzagac/tap/slipbox`, and `brew upgrade` after.

## [0.2.2] - 2026-10-13

### Changed

- On a rendered note, the editing keys (`i`, `a`, `o` and the others) open the lens: the Markdown around the cursor,
  with the rest of the note still rendered. The key again types there, and `esc` `esc` leaves. Before, they swapped the
  whole note for its Markdown (source mode), which `ctrl+k` left. To keep that, set `edit_in = "source"` under
  `[editor]` in your config.
- OpenTUI, the library slipbox draws the terminal with, is 0.5.14.

### Fixed

- In the lens, the status line's column (`L18:5`) counted the lens's own counters before the text; it counts the text.
- With the lens (`edit_in = "live"`), a new note (`ctrl+n`) opened the lens without typing, and a line break went into
  it anyway. It's typed into at once now, as in source mode.

## [0.2.1] - 2026-10-12

The first release. 0.2.0 was tagged but never released: its build failed a test on the Intel Mac, fixed since.

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
- Builds for macOS and Linux (x64 and ARM, and Alpine's musl), installed by one line
  (`curl -fsSL https://remziduzagac.github.io/slipbox/install.sh | sh`) that checks each download; previews between
  releases, which `slipbox channel` makes an install follow; a Homebrew formula, `slipbox upgrade` and
  `slipbox uninstall`; Windows through WSL.
- `slipbox skill`: the skill for agents carried by the binary, printed or installed where an agent reads skills.

[Unreleased]: https://github.com/remziduzagac/slipbox/compare/v0.2.2...HEAD
[0.2.2]: https://github.com/remziduzagac/slipbox/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/remziduzagac/slipbox/releases/tag/v0.2.1
