---
status: todo
assignee:
blocked_by: []
created: "2026-10-11"
---

# DOC-T10: The agents, code and git, Obsidian or zk, and exporting guides

`docs/guides/agents.md`, `docs/guides/code-and-git.md`, `docs/guides/from-obsidian-or-zk.md` and
`docs/guides/exporting.md`: a guide for each thing people come to slipbox to do.

## Description

**agents.md**: slipbox beside an agent: both see the same files (disk is the contract), and what you see when an
agent writes; the CLI and `--json`; the skill, and installing it; safe writes (`--if-unchanged`); the scratch and
capture, from nvim too; the context bundle; letting an agent see what you're reading.

**code-and-git.md**: opening a repository: the code view, trusting the folder or not, language servers and `slipbox
doctor`, problems, the changed lines in the gutter, committing, reviewing a branch before merging it.

**from-obsidian-or-zk.md**: opening an Obsidian vault or a zk notebook as it is: what slipbox reads (wikilinks,
embeds, tags, front matter, callouts), how it follows their conventions, what it doesn't do (plugins, the apps' own
settings), naming the folder, converting its links to plain paths if you want them.

**exporting.md**: a note as Word or PDF, several notes as one document, a web page, an e-book, Markdown to take
elsewhere; where each goes; what to check before sending it.

## Acceptance criteria

- Written as requirements.md § How they are written says: no roadmap or decision ID, no links into `blueprint/`.
- Each step checked against the code; the CLI steps run as written on the reference set (`scripts/build-home.ts`),
  noted in the Log. The TUI steps are tried live in DOC-T12.
- It sends the reader to the manual for the rest: links to chapters by file; to a section only where the section is
  certain, which DOC-T11 checks.
- Clean under markdownlint at 120 columns.

## Out of scope

- The manual (DOC-T1–DOC-T8), `docs/README.md` and the project README (DOC-T11).
- Trying the TUI steps live (DOC-T12).

## References

- Delivers: requirements.md § The documents (`guides/agents.md`, `guides/code-and-git.md`,
  `guides/from-obsidian-or-zk.md`, `guides/exporting.md`).
- Rests on: DOC-D2, DOC-D3, DOC-D4.
- Sources: `README.md`, `docs/cli.md`, `docs/keymap.md`, `skills/slipbox/SKILL.md`, `blueprint/design/` (links,
  roots, trust, code-view, lsp, export, tui § Git), `src/`.

## Log
