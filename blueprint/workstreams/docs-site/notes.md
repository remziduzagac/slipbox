# Notes: the documentation site

## 2026-10-14: why slipbox's docs aren't as good as herdsman's

The user asked why slipbox's documentation isn't as good as herdsman's (github.com/remziduzagac/herdsman, a fork of
herdr with herdr's docs adapted). Compared (*read*: herdsman's `docs/next/website/` and its Pages workflow;
slipbox's `docs/`):

- **Where it's read.** herdsman: a Starlight site at `/herdsman/docs/`, a sidebar in five groups, search, light and
  dark, edit links. slipbox: Markdown on GitHub; the Pages site only the installer's, its index sending a visitor to
  the repository.
- **The front door.** herdsman's home: Install and Quick start buttons, "Pick your path" cards (new to multiplexers;
  coming from tmux), a prompt to paste into an agent that reads `agent-guide.md`, the core guides as cards.
  slipbox's map: two links to start, then lists.
- **The quick start.** herdsman: one command, the mouse, an agent, six keys in a table, detaching. slipbox: a
  ten-minute walkthrough that starts by making notes with heredocs.
- **Concepts.** herdsman: a page of terms, a few sentences each. slipbox: a chapter, "How slipbox works".
- **The prose.** herdsman: short sentences ("A workspace is the top-level project container. Use one workspace per
  repo, task, or investigation."). slipbox: dense, colons and semicolons chaining clauses.
- **Generated reference.** herdsman's configuration reference from a JSON file, with a filter.
- **What slipbox had more of:** about 83,000 words over 24 pages, 14 screenshots, troubleshooting, privacy and
  versions chapters, the skill, and tests holding the docs to the code.

Proposed: the site (Starlight, from `docs/`), the front door, a plain-language pass, generated references, each a pull
request. The user: "I think we should fix everything and have documentation website as herdsman on githubpages".

Found on the way: greenrepo's DOC-06 (a docs site) was an accepted deviation until after the first release (GR-D8);
the site meets it.

## 2026-10-14: the reference chapters stay written by hand

Read for generating their lists, the keys, configuration and command-line chapters turned out better written: keys
paired in rows with plain descriptions, the settings as a TOML file to copy, each command's flags explained; and the
tests already fail on a key, default, command or flag left out. The user: "keep them hand-written" (DS-D5). Their prose
was rewritten like every page's.

Also asked: what sharp's LGPL asks of the project. Nothing, as used (installed on CI, never run, never distributed), but
the user chose to have it not installed at all: an override puts a placeholder in its place (DS-D1's cost).
