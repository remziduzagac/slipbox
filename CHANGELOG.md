# Changelog

Every release of slipbox, newest first: what it added, changed, deprecated, removed and fixed, and its security fixes.
The format is [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/); what a version number promises is in
[Versions](docs/manual/versions.md). A breaking change is marked **Breaking**, with what to do about it.

## [Unreleased]

### Changed

- In source mode and the lens, `backspace` and `delete` delete a selection, as `d` and `x` do, without typing first.
- Where a selection can't be edited, the message names the lens (`space n l`) and source mode (`ctrl+k`).

## [0.3.0] - 2026-10-14

### Added

- Homebrew, on macOS and Linux: `brew install remziduzagac/tap/slipbox`, and `brew upgrade` after.
- The documentation is a website, with search: <https://remziduzagac.github.io/slipbox/docs/>. It has a quick start, a
  page of concepts, and a guide your coding agent can read to walk you through slipbox.
- `[git] signs_at` places the gutter's git signs: `gutter_right`, the default, where they were, against the text;
  `gutter_left`, before the line numbers; or `window_right`, by the scrollbar.
- `space s r` opens the scratch in the window on the right, and `capture.open_in = "right"` (or Scratch opens in the
  UI settings) makes that where it always opens.

### Changed

- The scratch opens in a window floating in the middle of the screen, not as a tab, rendered and edited as any note is.
  `q` closes it, back where you were, what you typed saved; `esc` leaves typing and the lens first, then closes it.
  It opens when it's empty too.
- Adding to the scratch (`space s a`) opens it ready to type a note about what you added: each entry is `**At:**`
  the place, then `**Note:**` with the cursor after it, and a rule between entries. `esc` then `q` takes you back; a
  `**Note:**` left empty is dropped. `slipbox capture` with `--ref` writes the same shape, its text after `**Note:**`.
- The gutter's git signs have softer colours of their own: three new roles, `git_sign_add`, `git_sign_change` and
  `git_sign_delete`, which `[colors]` can set.
- Every page of the documentation is rewritten in short, plain sentences, and there's a quick start, a page of concepts
  and a guide for your agent.
- slipbox describes itself as the terminal companion for coding agents, in its help, its package and its Homebrew
  formula.

### Fixed

- In a rendered note, the blank row after a changed paragraph, list item or heading repeated its git sign in the
  gutter. Only the changed rows are signed now.
- A message said while slipbox was busy, as when it starts indexing a big folder, could be gone before it was ever
  drawn. Its four seconds now start once it's on screen.
- `space f b` opened the heading path as a plain list in the middle of the screen, not the dropdown under the
  breadcrumb, when `space f`'s key hints had shown before the `b`.
- Typing a word and then `(` could open the completion popup after the `(` if the language server was slow with its
  signature help; `enter` then picked a word instead of starting a new line.
- Right after a merge or a pull that moved files, `space l r` could find nothing to relink until the file watcher
  caught up. The folder is now read again before the message says files moved.
- A config warning names a file in your home folder as `~/…`, so its row in the messages list (`space m`) shows what
  it says instead of a long path cut short.

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

[Unreleased]: https://github.com/remziduzagac/slipbox/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/remziduzagac/slipbox/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/remziduzagac/slipbox/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/remziduzagac/slipbox/releases/tag/v0.2.1
