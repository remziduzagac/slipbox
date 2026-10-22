---
status: done
assignee: claude-reading
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

- 2026-10-11: Started (claude-reading).
- 2026-10-11: Read the sources (tui.md, rendering.md, keymap.md, configuration.md) against the code (keys.ts,
  command-specs.ts, config.ts, render.ts, glyphs.ts, app.ts, draw.ts, actions.ts). Tried `slipbox render` on the
  reference set (examples/home and examples/vault: callouts, tasks, tables at 100, 40 and 24 columns, Mermaid,
  maths, embeds, footnotes, broken front matter, TOML, YAML, CSV, a broken JSON, a .py and an .org), and drove the
  TUI headlessly (App and TextCanvas from a scratch script, state in the scratch folder) for the screen's frames, the
  which-key popup, help, the palette, the UI settings list, Info, zen, a narrow screen and `q` on the last window.
- 2026-10-11: Wrote docs/manual/screen.md.
- 2026-10-11: Wrote docs/manual/reading.md. Examples use a neutral `~/notes` folder (`inbox.md`, `ideas/coffee.md`)
  made in the scratch folder; the screen's drawing in screen.md is the headless TUI's own frame, its status line
  edited to read `~/notes`. Every key, setting, alias and command named checked against keys.ts, config.ts and the
  CLI's help by a script.
- 2026-10-11: Bug: help's mouse section (`MOUSE_HELP` in src/tui/actions.ts) is out of date. It says a click in the
  explorer opens a note as a tab (a click selects; a double-click or `enter` opens), that a click on the status line's
  path copies the absolute path (it opens the window's history, **Copy path** first), and lists only the rails'
  `≡ ◷ ▤` (not `±`, `ℹ`, `¹`). The docs say what the code does.
- 2026-10-11: Bug: following a link to a binary file says "attachment X — path copied (images render in a later
  phase)" (`fileLink` in src/tui/actions.ts): pictures are drawn now, so the parenthesis is stale.
- 2026-10-11: For the coordinator: a folder's own `.slipbox/config.toml` can set `render.images_remote = "show"`
  (checked with `loadConfig`), so opening a cloned folder fetches its notes' pictures from the internet without
  asking, while the update check reads only the user's own config ("a network request is yours to allow"). Not
  changed; reading.md says plainly that a folder's config can set it, and links privacy.md.
- 2026-10-11: Differences, the code followed: rendering.md § Glyphs says `SLIPBOX_GLYPHS` or the config value forces a
  set; in the code the variable only replaces `auto` (a set named in config wins). tui.md § Positions says the session
  is restored when slipbox starts with no path; the code restores it whenever it starts on a folder (`slipbox
  ~/notes` too), and skips it only for a file. examples/vault/about-this-vault.md (§ What isn't here) and
  examples/home/CASES.md (inline: "Math and mermaid shown as code/text") still say Mermaid and maths show as code;
  both are drawn now.
- 2026-10-11: Done: both chapters clean under markdownlint at 120 columns, no IDs, no links into blueprint/. Links
  between my two files use anchors (`screen.md#the-status-line`, `screen.md#the-info-view`, `reading.md#glyphs`);
  links to the other chapters name the file only.
- 2026-10-11: accepted by the user; done.
