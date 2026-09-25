# The TUI

Phase 2: the reader, the "beat leaf" target. **Read-only by decision**: it browses, renders,
selects and copies text, holds several notes and follows external changes, and never writes a
note. The only files it writes are its own state and the scratch. Editing, including `$EDITOR`
hand-off, is phase 3.

**Every key is in [keymap.md](keymap.md).** This document covers how the parts behave.

Code, in `src/tui/`:

| File | Role |
| --- | --- |
| `app.ts` | the model: state, dispatch, panes, mouse, reload, session |
| `actions.ts` | the command implementations, the palette, help and pickers |
| `buffer.ts` | a note's text and cached layouts |
| `canvas.ts` | the drawing surface; `TextCanvas` for headless tests |
| `cursor.ts` | the motions |
| `draw.ts` | painting, and the geometry the mouse uses |
| `fuzzy.ts` | the fuzzy ranking every list filters with |
| `keys.ts` | the default keymaps, groups, aliases, and the in-pane actions' titles |
| `run.ts`, `opentui.ts` | the OpenTUI binding |

## Screen layout (plan `3.1`)

```text
 ≡   slipbox                                                 indexing 3…   ← top bar (ui.top_bar)
━━━━━━━━━━━━┳━━━━━━━━━━━┳━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┳━━━━  ← the frame's top rule
 Explorer   ┃ 1 index × ┃ 2 alpha × ┃                               ┃ +3   ← tab strip; +N when some don't fit
━━━━━━━━━━━━╋━━━━━━━━━━━┻━━━━━━━━━━━┻━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┻━━━━  ← the explorer's title rule, the strip's rule
 ▾ notes    ┃ § Heading › Sub                                          ▤   ← the window's breadcrumb (tinted),
 ├─  beta   ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━━  ←   over the outline; ▤ toggles it
 └─  alpha  ┃ ▌ Sub                              ┃ Outline                 ← explorer ┃ note ┃ outline, titled
            ┃ Text with the █ursor on its row…   ┃                         ← (both panes optional)
            ┃                                    ┃ ▾ Heading
           ┌─ ␣ l › links ──────────────────────────────────┐              ← which-key popup, while keys are pending
           │ f → Follow link          n → Next link         │
           │     Opens the link…          Moves to the…     │
           └───────────────────── backspace up · esc cancel ┘
━━━━━━━━━━━━┻━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┻━━━━━━━━━━━━━━━━━━━━━━━  ← the frame's bottom rule
 READ  notes/alpha.md ↻ reloaded  ● watching  → [[beta]] (resolved)  L12:7 40%  ← status line
 ↻ notes/alpha.md changed on disk — reloaded                               ← message or prompt
```

**The frame.** Right under the top bar, a `━` rule in the `border` role runs across the top of
everything: the explorer and the tab strip, which spans the note and the outline. A second runs
under the strip, over the note and the outline, level with the rule under the explorer's title. A
third runs across the bottom of the explorer, the note and the outline, right above the status line.
Windows' header rules and the vertical borders complete it. Where rules and borders meet, one pass
picks the box glyph from the lines that meet there: `┳` where a border starts under a rule, `┻`
where it ends on one, `┣` `┫` `╋` where it continues through, and the corners `┏` `┓` `┗` `┛`
(ascii: `+`). Borders are always the plain `border` colour; focus shows as brightness (see the side
panes). Zen mode has no frame.

**The top bar** has buttons and vault-wide state; the middle is empty:

- on the left, `≡` shows the explorer (focusing it and revealing the current note) or hides it,
  and the `slipbox` chip (plain accent text on the bar) opens the command palette;
- on the right, vault-wide state (`indexing N…`, `single-file`), dropped when fewer than 12
  columns are left.

Toggle buttons have no fill of their own: their glyph is dim (`topbar_button`) while the pane is
closed and bright (`topbar_button_on`) while it is open. `ui.top_bar = false` removes the bar, and
zen mode hides it.

**The breadcrumb** tops each window, between two rules. It starts with an icon (`§`, ascii
`#`) that opens the heading finder when clicked, then the chain of headings that window's cursor
is under, each cut to 40 columns, with the outermost dropped first when space runs short. In a
split it shares the window's title row, after the file name. Clicking a heading focuses that
window, puts its cursor on the heading, and scrolls the heading to the window's first row (as far
as the note's end allows). The row stays reserved above the first heading, so the text doesn't
jump. `ui.breadcrumb = false` removes it; zen mode and windows under 8 rows drop it. Without it
there is no `▤` button (the outline opens with `ctrl+o`) and no header rules, the outline starts
at the top of the content, and a split window gets a plain title row (`tab` / `tab_active`).

The breadcrumb row has its own background, `breadcrumb_band` (`surface` blended into the page
at 35%). The icon is `breadcrumb_icon` (blue), outer headings `breadcrumb` (dim), separators
`breadcrumb_sep` (faint), and the heading the cursor is in `breadcrumb_current` (bold). In a
split, the file name comes first on the same row: `strong` in the active window, `dim` in the
other.

Rules run above and below it. The rule above is the frame's rule under the tab strip; the lower
window of a stacked split draws its own.

**The tab strip** sits under the top bar whenever a note is open, even with a single tab. A tab
reads ` N name `: its number, the file name without `.md`, cut to 24 columns, and `↻` for 3 s after
a reload. Each tab has a `×` to close it and a `┃` after it, joined to the rules above and below the
strip (`┳`, `┻`). The active tab is bright (`tab_active`) while the note has focus and dimmer
(`tab_active_idle`) otherwise; other tabs are `tab`. When the tabs don't all fit, the strip shows a
run of them that includes the active tab: from the first tab, scrolled just enough to bring the
active one in. A `+N` button at the far right, behind its own `┃`, counts the tabs left out;
clicking it opens the tab list (`ctrl+t t`) to pick one. A tab holds the note and its outline but
not the explorer, so with the explorer open beside the content the strip starts after the explorer's
border and spans the note and the outline. The explorer runs from under the frame's top rule to its
bottom rule, and stays put when the strip appears or goes.

**The status line** is about the file. From left to right:

- a mode chip: `READ`, `VISUAL`, `V-LINE`, `FILES`, `OUTLINE`, `RESIZE`, or the pending keys
  (in short form: `␣ l`, `C-w`);
- the note's path (click to copy its absolute path);
- `↻ reloaded` after an external change, or `✖ deleted on disk`;
- whether external changes will show up: `● watching` (with a count of polled directories, if
  any), `⚠ not watching` when the watcher failed, `○ not watching` when it is off. It is
  dropped when the line is too short.

On the right it shows the link under the cursor and its status (`→ [[beta]] (resolved)`) or find
progress (`/query 2/7`), then `tab N/M` when there are two or more tabs, then `L<source
line>:<column>` and the percentage (`all` when the note fits).

**The bottom line** appears only while there is a message (4 s, 8 s for errors) or a prompt.
Clicking a message opens the messages list.

**The scrollbar** is the last column of each window: a `▐` track (`scrollbar_track`) with a `▐`
thumb (`scrollbar` in the active window, `border` in the other); ascii `|` and `#`. It can be
clicked and dragged.

**Hover.** Every clickable region is drawn in the `hover` role while the mouse is over it.

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
  Side by side falls back to stacked below 80 content columns (a fixed width, not
  `ui.narrow_width`). With a split, each window names its note on its breadcrumb row, bright in
  the active window. Pane widths stay between 12 columns and half the terminal; a split's ratio
  between 15% and 85%.

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
- **Session:** tabs and the active tab, splits with their orientation and ratio, cursors, the
  explorer's and the outline's visibility and widths, UI setting overrides, and the palette's
  recent commands, in `session.json`. It's restored when slipbox starts with no path, if
  `ui.restore_session` is on (recent commands are kept either way).

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

- **Explorer (left):** the walked notes as a tree, directories first. Moving the selection only
  selects. `enter`, `l` and a click open the note as a tab, or switch to the tab already showing
  it; `o` replaces the current window's note, and `s` opens it in the split.
- **Outline (right):** the current note's headings, indented, foldable (`h`/`l`). While not
  focused it follows the cursor's section, and `enter` jumps to the heading.

Each pane starts with its title, "Explorer" or "Outline", then a row before the list: a rule under
the explorer's title (level with the rule under the tab strip, which it meets in `╋`), a blank row
under the outline's. Panes under 8 rows skip both. The explorer runs from under the frame's top
rule, beside the tab strip. The outline belongs to the note, so it opens under the note's
breadcrumb: the top-right window's breadcrumb row and the rule under it run across the outline's
column, and the outline's button (`▤`) sits at the far right of that row, bright while the outline
is open. Focus shows as brightness, never as a coloured border: a pane's title is bright
(`pane_title_active`) while the pane has focus and dimmer (`pane_title`) otherwise, and the active
tab is bright (`tab_active`) while the note has focus and dimmer (`tab_active_idle`) otherwise. All
of them stay bold, so nothing shifts.

Both trees show depth by indentation plus dim tree lines (the `tree_guide` role): `├─` into each
child, `└─` into the last one, and `│` where an ancestor has siblings still to come (ascii: `|`,
`` ` ``, `-`). The outline marks headings that have sub-headings with fold markers of its own (`▾`
/ `▸`; ascii `v` / `>`); the explorer marks folders with its folder glyphs. The wheel scrolls a
pane without moving its selection, and a click anywhere in a pane focuses it.

Both are windows for `ctrl+w h` / `ctrl+w l`, and each has its own keymap: `[keys.explorer]` and
`[keys.outline]`.

**Narrow terminals (plan `3.14`).** Below `ui.narrow_width` (90) columns, and in zen mode, both
panes open over the content on demand (6 columns wider than their width, leaving at least 6 of
the note) and close after a pick. The wide-terminal preferences (`ui.sidebar`,
`ui.outline`) are kept separately, so widening the terminal brings them back. Tables that cannot
fit become records ([rendering.md](rendering.md)).

## Overlays

One list component serves every picker. Like every floating window, it has a margin in its own
colour around its border, one row above and below and two columns at the sides, since a cell is
about twice as tall as it is wide (the explorer and outline over the content get two blank columns
past theirs), so the content behind never runs up to the edge.

- **Pickers:** quick switcher, heading picker, links, backlinks, history, tabs, theme and glyph
  pickers (with live preview; `esc` restores), UI settings, messages, info, and keys.
- **Filtering:** fuzzy, with smart case, preferring word and path starts and file names over
  directories.
- **Keys:** as in [keymap.md](keymap.md), "In lists and prompts": the arrows, `tab` and
  `ctrl+n`/`ctrl+p` move (wrapping around), `enter` accepts, `esc` cancels. The wheel scrolls the
  list three rows a notch (the selection moves only to stay in view), a click picks, and a click
  outside closes the list. A counter in the bottom border shows `n/m`, and an empty list says "no
  matches" or "nothing here".
- **Groups and footers:** a list may have group headings (dim, bold capitals, with a blank row
  before each but the first and a full rule under each; never selected, moving skips them) and a
  footer. The footer is always four rows, so the list doesn't jump: the selected entry's name
  (bold), its explanation in normal text (wrapping to a second row), and its other bindings
  ("also", as keycaps). Explanations are the `desc` of each command in `core/command-specs.ts`:
  a plain sentence saying what it does ("Moves the cursor to the end of the row").
- **Keycaps:** key bindings are spelled out (`ctrl+d`, `shift+g`, `space l y`, `esc`) and each
  binding is its own keycap (`keycap` role; `keycap_selected` on the selected row), so the space
  inside a sequence (`g g`) can't be mistaken for the gap between bindings. In help at most three
  show, in columns sized per section so they line up down it; the palette has two fixed columns
  (the first key, the first alias), aligned across the whole list; plain bindings come before variants
  (such as the selection-extending ones), and the rest are shown in the footer. The columns have
  no names: they are simply the first, second and third way to do it.
  Without a keycap background (`NO_COLOR`), the columns are separated by `·`.

Help and the palette list the same commands for different jobs, in the groups of
[keymap.md](keymap.md) (`COMMAND_GROUPS` in `core/command-specs.ts`), in that document's order:

- **Help (`?`, `space ?`)** is for learning the keys: every command with all its bindings, then what
  works inside the explorer, inside the outline, in resize mode, and with the mouse. Filtering keeps
  the groups; `enter` runs a command (the other entries are reference only). Opened from the
  explorer, the outline or visual mode, it starts at that section ("Inside the explorer", "Inside
  the outline", "Selection & copy"), with its heading at the top.
- **The palette (`:`)** is for doing things. Empty, it lists the recently run commands (the last
  5, kept in the session) and then every command by group; typing ranks the best match first,
  without groups. Each command shows its first binding and first alias.

**The `:` prompt** is the palette and a command line at once. An exact alias from `[aliases]`
(`:q`, `:vs`, `:theme dracula`) always wins, and an alias taking an argument lists completions
(notes, themes, glyph sets) once a space is typed.

**The which-key popup** lists the next keys of a pending sequence, across the keymaps active in
the current state. It is framed like the other popups: a bordered box on the overlay background,
with the pending keys as its title (`␣ l › links`), the hint (`backspace up · esc cancel`) in its
bottom border, and the same margin; it sits centred just above the bottom of the content area.
The entries are in at most three columns, as many as fit. Each column is sized to its own entries,
so a long explanation in one never spreads the others apart. Each entry is `key → name` with a
short, dimmed explanation underneath:

- **For a command:** its `desc` in `core/command-specs.ts`.
- **For a group:** from `[groups]`.

Keys with the same action share one entry, letters first (`j down`). When the screen is too
short for two rows per entry, the explanations go first. It shows at once for the leader, and after
`input.which_key_delay_ms` for other prefixes, never with `input.which_key = false`. `backspace`
goes up a level; `esc` cancels. Groups read `+name`; clicking an entry presses its key. It also
shows in resize mode (titled "resize", with "keys repeat · any other key leaves").

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
file are polled every second (or every `watch.poll_ms`, if that is shorter). `space v c` (or
`:config`) reloads on demand. A reload applies what changed, live:

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

**Dispatch order:** an overlay first, then resize mode's keys (any other key leaves resize mode
and runs as usual), then a pending sequence (where `esc` cancels and `backspace` goes up a
level), then the focused pane's keymap (explorer or outline), then visual mode's, then the normal
keymap. Only keymaps at or above the one holding a binding can
make a key a prefix: visual mode's `y` doesn't wait for the normal keymap's `y y`. When a key is
both a binding and a prefix, slipbox waits `input.which_key_delay_ms` for the next key, then
runs the binding.

## Parity with the CLI

Every command is declared in `core/command-specs.ts` with the CLI invocation that reaches the
same state change, or marked as an interaction: cursor, scrolling, selection, focus, panes,
overlays. Tests fail when a command is implemented without a spec or specified without an
implementation. See [cli.md](cli.md).
