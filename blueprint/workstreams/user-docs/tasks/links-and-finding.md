---
status: todo
assignee:
blocked_by: []
created: "2026-10-11"
---

# DOC-T5: The links and roots, and finding chapters

`docs/manual/links-and-roots.md` and `docs/manual/finding.md`: how slipbox reads and writes links across folders,
and every way to find something.

## Description

**links-and-roots.md**: what a root is and how slipbox finds it (its markers), a plain folder, `.slipbox/` and
`slipbox init`, a folder's name and pointers to it (`slipbox://`), switching roots (`space v`), worktrees as roots;
the forms a link takes (paths, `/`, relative, wikilinks, headings and blocks, links in front matter, links to the
repository's own hosting); conventions (how a folder writes links, and how slipbox tells); where a link lands, and how
it says so; following links (`enter`, into a new tab or the split, back and forward); writing links (`space l i`,
completion); backlinks; links kept through renames and moves; relinking and repairs; converting a folder's links;
tags; links that reach nothing.

**finding.md**: the switcher, search across notes (what it searches, where a hit opens, across roots), finding in a
note and finding and replacing (in a note, in every note, `:%s`), the outline and footnotes panes, history (back,
forward, `space h`), tags, document types (ADRs and the like: listed, ordered, `] t`), the palette as a way to find
a command.

## Acceptance criteria

- Written as requirements.md § How they are written says: no roadmap or decision ID, no links into `blueprint/`.
- Every claim checked against the code, not the design alone. Where the two disagree, the doc says what the code
  does, and the Log names the difference for the coordinator; neither the code nor the blueprint is changed here.
- Every key, setting and CLI command a chapter names exists, as the chapter names it.
- Clean under markdownlint at 120 columns; every relative link and anchor in it resolves, but those into chapters
  written in parallel, which DOC-T11 checks.

## Out of scope

- The other chapters and guides (their tasks), `docs/README.md` and the project README (DOC-T11).
- The merge review (DOC-T7); the explorer's renames, as a file operation (DOC-T6), beyond what they do to links.

## References

- Delivers: requirements.md § The documents (`manual/links-and-roots.md`, `manual/finding.md`).
- Rests on: DOC-D2, DOC-D3.
- Sources: `blueprint/design/links.md`, `roots.md`, `search.md`, `document-types.md`, `tui.md` (§ Following
  links, Switching roots, History, Side panes), `docs/keymap.md`, `docs/cli.md`, `src/core/`, `src/tui/`.

## Log
