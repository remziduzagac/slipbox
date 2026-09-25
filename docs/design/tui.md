# The TUI

Phase 2: the reader, the "beat leaf" target. **Read-only by decision**: it browses, renders,
selects and copies text, holds several notes and follows external changes, and never writes a
note. The only files it writes are its own state and the scratch. Editing, including `$EDITOR`
hand-off, is phase 3.

**Every key is in [keymap.md](keymap.md).** This document covers how the parts behave.

Code, in `src/tui/`:

| File | Role |
| --- | --- |
| `app.ts` | the model: state, dispatch, panes, reload |
| `actions.ts` | the command implementations |
| `cursor.ts` | the motions |
| `draw.ts` | painting |
| `keys.ts` | the default keymap, groups and aliases |
| `run.ts`, `opentui.ts` | the OpenTUI binding |

## Screen layout (plan `3.1`)

```text
 ≡  slipbox                                              indexing 3…  ≣   ← top bar (ui.top_bar)
 1 index ×  2 alpha ×                                                    ← tab strip, only with 2+ tabs
                                                                         ← gap (ui.bar_gap)
 ▾ notes    ┃ § Heading › Sub                    ┃ Heading   ← each window: its breadcrumb,
     beta   ┃                                    ┃   Sub       then a blank row
     alpha  ┃ ▌ Sub                              ┃           ← explorer ┃ content ┃ outline
            ┃ Text with the █ursor on its row…   ┃           (both panes optional)
 ␣ l › links  backspace: up · esc: cancel                  ← which-key popup, while a key is pending
 f → Follow link   n → Next link   …
                                                                         ← gap
 READ  notes/alpha.md ↻ reloaded  ● watching   → [[beta]]  L12:7 40%  ← status line
 ↻ notes/alpha.md changed on disk — reloaded                         ← message or prompt
```

**Gaps.** With `ui.bar_gap` (default on), a blank row separates the note from the bar above it
(the tab strip when shown, otherwise the top bar) and from the status line below it. Screens
shorter than 20 rows drop the gaps.

**The top bar** has buttons and vault-wide state; the middle is empty:

- on the left, `≡` toggles the explorer and the `slipbox` chip (plain accent text, no background)
  opens the command palette;
- on the right, vault-wide state (`indexing N…`, `single-file`), then `≣` to toggle the outline.

An icon button is filled with the accent while its pane is open. `ui.top_bar = false` removes the
bar, and zen mode hides it.

**The breadcrumb** tops each window, followed by a blank row. It starts with an icon (`§`; nerd
`󰠶`, ascii `#`) that opens the heading finder when clicked, then the chain of headings that
window's cursor is under, each cut to 40 columns, with the outermost dropped first when space
runs short. In a split it shares the window's title row, after the file name. Clicking a heading
focuses that window, puts its cursor on the heading, and scrolls the heading to the window's
first row (as far as the note's end allows). The row stays reserved above the first heading, so
the text doesn't jump. `ui.breadcrumb = false` removes it; zen mode and windows under 8 rows
drop it.

**The tab strip** sits under the top bar and appears only with two or more tabs. Each tab has a
`×` to close it.

**The status line** is about the file. From left to right:

- a mode chip: `READ`, `VISUAL`, `V-LINE`, `FILES`, `OUTLINE`, or the pending keys;
- the note's path (click to copy it);
- `↻ reloaded` after an external change, or `✖ deleted on disk`;
- whether external changes will show up: `● watching` (with a count of polled directories, if
  any), `⚠ not watching` when the watcher failed, `○ not watching` when it is off.

On the right it shows the link under the cursor and its status (or find progress), then the tab,
then `L<source line>:<column>` and the percentage.

**The bottom line** appears only while there is a message (4 s, 8 s for errors) or a prompt.

**Viewport-only (plan `3.2`).** Only rows on screen are drawn, and a layout is computed once
per width and cached on the buffer.

## The cursor

A reading cursor sits on the rendered text, like vim's normal mode.

- **Position:** a (row, column) pair, where a row is a rendered row and the column is a
  display column at the start of a grapheme. `cursor.ts` holds the motions as pure functions
  over the layout: characters, rows with a goal column, words (vim's word classes, each CJK
  character a word, empty rows as stops), row start and end, top and bottom, headings, and
  paragraphs (blank rows).
- **How it looks:** drawn by slipbox, not the terminal: the `cursor` role on its character,
  and the `cursor_line` band on its row (`space u l`). Under `NO_COLOR` the cursor is inverse
  video.
- **Scrolling:** the view keeps `ui.scrolloff` rows (default 3) between the cursor and the
  edges. `ctrl+d` / `ctrl+u` and the page keys move the cursor with the view. The mouse wheel
  moves the view, and pulls the cursor along only as far as it must.
- **What follows from it:** the link under the cursor is the one link commands act on; `y r`
  and `space s a` use the cursor row; find lands on the match; a click sets the cursor.

**Selection.** A selection is an anchor plus the cursor. It's extended by `shift`+movement or by
visual mode (`v` by character, `shift+v` by whole row); `o` swaps the ends, and `esc` clears it.
A mouse drag makes one too, copied on release. Copied text is the rendered text, which is what
you saw.

## Buffers, views, tabs, windows (plan `3.3`)

- **Buffer:** one open file, with its source, parse, and layouts by width. Buffers are
  internal: there is no buffer list. They're keyed by path, so a note deleted on disk keeps
  its buffer.
- **View** (a window): a buffer plus its own cursor, top row, selection, find and history.
  Two windows may show one buffer.
- **Tab:** one window, or two in a split, with an orientation (side by side, or stacked) and a
  ratio (the first window's share). Resize mode (`ctrl+alt+w`, `space w r`) changes the ratio,
  or the explorer or outline width when one is focused, and all of it is kept in the session.
  Side by side falls back to stacked below 80 content columns. With a split, each window gets
  a title row, and the active one is highlighted.

## Positions (plans `3.4`, `3.5`, `3.15`)

**Views store source anchors, not rows** (decision `3.5`):

- **Top of the view:** the nearest heading above it, plus an offset and a fallback line.
- **Cursor:** the same kind of anchor for its row, plus which wrapped row of that source line
  it's on, plus its column.

Rows are re-derived on every re-layout (a resize, a reload), and the anchors are then refreshed
from where they landed. So text an agent inserts above doesn't move you, and removing your
heading later falls back to a current line, not a stale one.

**Saved state:**

- **Reading position** per note, cursor included, in `positions.json` in the state dir.
- **Session:** tabs, splits and their orientation, cursors, explorer visibility, and UI setting
  overrides, in `session.json`. It's restored when slipbox starts with no path, if
  `ui.restore_session` is on.

## History (plan `3.6`)

Each window has back and forward stacks of `{note, top, cursor}`, 200 deep. Following a link,
jumping to a heading and opening a note all push onto them. The history list (`space h h`) shows
the whole timeline and jumps anywhere in it.

## Following links

Each kind of link does something different when followed:

| Link | Following it |
| --- | --- |
| `[[note]]`, `[[note#heading]]` | opens the note, at the heading |
| `[[#heading]]`, `[t](#frag)` | jumps within the note |
| ambiguous `[[name]]` | a picker of the candidates |
| unresolved `[[name]]` | a message; creating the note is phase 4 |
| `[t](other.md#frag)` | opens relative to the note |
| `https://…` | copies the URL; opening a browser over SSH would be wrong |
| attachment `![[x.png]]` | copies the path; images are phase 6 |
| footnote `[1]` | jumps to the definition |

`enter` follows the link under the cursor, or else the row's first link.

## Side panes: explorer (plan `3.7`) and outline

- **Explorer (left):** the walked notes as a tree, directories first. `enter` opens a new tab,
  `l` opens in the current window, and `s` opens in the split.
- **Outline (right):** the current note's headings, indented, foldable (`h`/`l`). While not
  focused it follows the cursor's section, and `enter` jumps to the heading.

Both are windows for `ctrl+w h` / `ctrl+w l`, and each has its own keymap: `[keys.explorer]` and
`[keys.outline]`.

**Narrow terminals (plan `3.14`).** Below `ui.narrow_width` (90) columns, both panes open over
the content on demand and close after a pick. The wide-terminal preferences (`ui.sidebar`,
`ui.outline`) are kept separately, so widening the terminal brings them back. Tables that cannot
fit become records ([rendering.md](rendering.md)).

## Overlays

One list component serves every picker:

- **Pickers:** quick switcher, heading picker, links, backlinks, history, tabs, theme and glyph
  pickers (with live preview; `esc` restores), UI settings, messages, info, and keys.
- **Filtering:** fuzzy, with smart case, preferring word and path starts and file names over
  directories.
- **Keys:** `up`/`down`, `tab`, `ctrl+n`/`ctrl+p` or `ctrl+j`/`ctrl+k` move; `enter` accepts;
  `esc` cancels; a click picks.

**The `:` prompt** is the palette and a command line at once. Typing filters commands by name.
An exact alias from `[aliases]` (`:q`, `:vs`, `:theme dracula`) always wins, and an alias taking
an argument lists completions (notes, themes, glyph sets) once a space is typed.

**The which-key popup** lists the next keys of a pending sequence, across the keymaps active in
the current state. The layout, top to bottom: a header bar (`␣ l › links`), a blank row, the
entries, and a blank row at the bottom. The entries are in at most three columns, as many as
fit. Each column is sized to its own entries, and the columns pack from the left, so a wide pane
never spreads them apart. Each entry is `key → name` with a short, dimmed explanation underneath:

- **For a command:** its `desc` in `core/command-specs.ts`.
- **For a group:** from `[groups]`.

Keys with the same action share one entry, letters first (`j down`). When the screen is too
short for two rows per entry, the explanations go first. It shows at once for the leader, and after
`input.which_key_delay_ms` for other prefixes. `backspace` goes up a level; `esc` cancels.

**The message sink (plan `3.13`).** Config warnings, walk errors, watcher problems and command
feedback all go to one place: the bottom line briefly, the messages list permanently (the last
500).

## UI settings

These are the `space u` toggles and pickers (list in [keymap.md](keymap.md)):

- theme and glyphs
- readable width (the text column capped and centred)
- zen (no chrome; panes only on demand)
- the cursor-row band
- source line numbers in a gutter
- link URLs
- mouse capture

**Persistence.** Changes apply at once and are remembered in the session with the config value
each one overrode. At the next start, or on a config reload, an override is kept only while that
config value is unchanged. Editing the config therefore always wins, and the TUI never writes
your config.

## Configuration reload

The configuration reloads **by itself** when a config file is saved: the user file and the vault
file are polled every second. `space v c` (or `:config`) reloads on demand. A reload applies what
changed, live:

- **keys, leader, aliases, groups:** keymaps rebuilt
- **theme, glyphs, UI defaults:** applied, replacing session overrides of the changed values
- **render settings:** every note re-laid out
- **walk settings:** the vault re-walked, re-indexed and re-watched
- **watch settings:** the watcher restarted

A broken file is reported in the message sink; the valid parts still apply.

## External changes (plans `5.1`–`5.4`)

The watcher subscribes to exactly the directories the walk includes: one non-recursive watch per
directory, sharing the walk's `WalkFilter` (decision `0.11`). Events are debounced
(`watch.debounce_ms`) and settled by `stat`.

- **Changed:** the note reloads silently; phase 2 buffers are never dirty (plan `5.3`). Its
  anchors keep your place, and the change is surfaced at once with `↻ reloaded` and a message
  (plan `5.4`).
- **Deleted:** the buffer keeps showing the last version, marked `✖ deleted on disk`.
- **Created or deleted notes:** these change link statuses, so every layout and the explorer
  refresh. A red `[[link]]` turns resolved when its note appears.
- **New directories** are watched through their whole depth. A `.gitignore` change rescans, and
  open notes that changed during the rescan reload.
- **Files outside the vault** (the scratch in the state dir) are polled while open.

### Bun's watcher, and what covers its gaps

Found while testing on Linux. Bun 1.3's `fs.watch` drops some events, so the watcher has
backstops:

| Bun does not report | Covered by |
| --- | --- |
| a directory renamed out of the vault | each tick checks that watched directories exist |
| the old name in a rename (`g.md → h.md` only reports `h.md`) | re-checking known notes in that directory |
| a note moved to another directory under its name | re-checking known notes with that file name |
| anything on dot-files, `.gitignore` included | `.gitignore` mtimes polled each tick |
| a directory containing a broken symlink (it errors) | that directory is polled instead, with a warning |

The tick runs every `watch.poll_ms`, and every 15th tick sweeps all known notes.

**Degrading loudly (plan `5.2`).** Exhausting the watch limit (`ENOSPC`, `EMFILE`, `ENFILE`)
produces one error message, `⚠ not watching` in the status line, and polling of open notes.

## Modes and dispatch (decision `3.11`)

**Dispatch order:** an overlay first, then the focused pane's keymap (explorer or outline), then
visual mode's, then the normal keymap. Only keymaps at or above the one holding a binding can
make a key a prefix: visual mode's `y` doesn't wait for the normal keymap's `y y`. When a key is
both a binding and a prefix, slipbox waits `input.which_key_delay_ms` for the next key, then
runs the binding.

## Parity with the CLI

Every command is declared in `core/command-specs.ts` with the CLI invocation that reaches the
same state change, or marked as an interaction: cursor, scrolling, selection, focus, panes,
overlays. Tests fail when a command is implemented without a spec or specified without an
implementation. See [cli.md](cli.md).
