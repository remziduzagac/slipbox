---
status: todo
assignee:
blocked_by: []
created: "2026-10-11"
---

# DOC-T4: The screen and reading chapters

`docs/manual/screen.md` and `docs/manual/reading.md`: where things are on the screen, and how slipbox draws what
you read.

## Description

**screen.md**: the layout: tabs, windows and splits, the side panes (explorer, outline, footnotes, history, Info) as
places on the screen, the status line and breadcrumb, the which-key popup, the palette, help (`?`), messages,
floating windows, resize mode, the mouse; the UI settings changed live (`space u`); where you were, kept between
sessions.

**reading.md**: how a note is drawn: headings, paragraphs and wrapping, lists and tasks, quotes and callouts, tables
that fit, code blocks highlighted, footnotes, front matter, pictures (which terminals draw them, and pictures on the
internet), diagrams, maths, embedded notes; data files (JSON, YAML, TOML, CSV and the like), other text files and
binary ones; themes and glyphs as they change what you see; the reading cursor and moving through a note; `slipbox
render`.

## Acceptance criteria

- Written as requirements.md § How they are written says: no roadmap or decision ID, no links into `blueprint/`.
- Every claim checked against the code, not the design alone. Where the two disagree, the doc says what the code
  does, and the Log names the difference for the coordinator; neither the code nor the blueprint is changed here.
- Every key, setting and CLI command a chapter names exists, as the chapter names it.
- Clean under markdownlint at 120 columns; every relative link and anchor in it resolves, but those into chapters
  written in parallel, which DOC-T11 checks.

## Out of scope

- The other chapters and guides (their tasks), `docs/README.md` and the project README (DOC-T11).
- Links (DOC-T5), the explorer's file operations (DOC-T6), the code view (DOC-T7).

## References

- Delivers: requirements.md § The documents (`manual/screen.md`, `manual/reading.md`).
- Rests on: DOC-D2, DOC-D3.
- Sources: `blueprint/design/tui.md` (§ Screen layout, The cursor, Buffers, views, tabs, windows, Positions, Side
  panes, Overlays, UI settings, Files beyond notes, Modes and dispatch), `blueprint/design/rendering.md`,
  `docs/keymap.md`, `docs/configuration.md`, `src/tui/`, `src/core/`.

## Log
