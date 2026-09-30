# The TUI

The reader of phase 2 — the "beat leaf" target: it browses, renders, selects and copies text,
holds several notes and follows external changes — and the editor of phase 3: task checkboxes,
hand-off to `$EDITOR` or a running nvim, source mode with a vim-shaped normal mode, the lens (live
preview), saving, autosave and the conflict prompt. Every write to a note goes through one path
("Writing notes"); besides notes it writes its own state and the scratch.

**Every key is in [keymap.md](keymap.md).** This document covers how the parts behave.

Code, in `src/tui/`:

| File | Role |
| --- | --- |
| `app.ts` | the model: state, dispatch, panes, mouse, reload, session |
| `actions.ts` | the command implementations, the palette, help and pickers |
| `buffer.ts` | a note's text, its undo steps, unsaved state, and cached layouts |
| `canvas.ts` | the drawing surface; `TextCanvas` for headless tests |
| `cursor.ts` | the motions |
| `draw.ts` | painting, and the geometry the mouse uses |
| `editing.ts` | the cursor as a text offset; insert mode |
| `vim.ts` | normal mode in source and the lens: counts, operators, the register, `.` |
| `replacing.ts` | find and replace: the replace row, `:s` and its confirm |
| `match.ts` | the matching and ranking every list and filter uses |
| `keys.ts` | the default keymaps, groups, aliases, and the in-pane actions' titles |
| `run.ts`, `opentui.ts` | the OpenTUI binding |

## Screen layout (plan `3.1`)

```text
 slipbox                                                indexing 3…     ← top bar (ui.top_bar; can be hidden)
━━━━━━━━━━━━━━━┳━━━━━━━━━━━┳━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┳━━━  ← the frame's top rule
 ≡  Explorer   ┃ 1 index × ┃ 2 alpha × ┃                             ┃ +3  ← left rail (tinted) · explorer ┃ tab strip
 ◷             ┣━━━━━━━━━━━┻━━━━━━━━━━━┻━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━┻━━━  ← the strip's rule, the outline under it
    ▾ notes    ┃ § Heading › Sub                  ┃ Outline            ▤   ← breadcrumb (tinted) ┃ outline · right rail
    ├─  beta   ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
    └─  alpha  ┃ ▌ Sub                            ┃ ▾ Heading              ← explorer ┃ note ┃ outline
               ┃ Text with the █ursor on it…      ┃ └─  Sub                ← (both panes optional)
               ┃                                  ┃
        ┌─ ␣ l › links ─────────────────────────┐ ┃                        ← which-key popup, while keys are pending
        │ f → Follow link      n → Next link    │ ┃
        │     Opens the link…      Moves to the…│ ┃
        └──────────── backspace up · esc cancel ┘ ┃
━━━━━━━━━━━━━━━┻━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┻━━━━━━━━━━━━━━━━━━━━━━  ← the frame's bottom rule
 READ  notes/alpha.md ↻ reloaded  ● watching  → [[beta]] (resolved)  L12:7 40%  ← status line
```

**The frame.** Right under the top bar, a `━` rule in the `border` role runs across the top of
everything: the explorer and the tab strip, which spans the note and the outline. A second runs
under the strip, over the note and the outline, starting at the explorer's border. A
third runs across the bottom of the explorer, the note and the outline, right above the status line.
Windows' header rules and the vertical borders complete it. Where rules and borders meet, one pass
picks the box glyph from the lines that meet there: `┳` where a border starts under a rule, `┻`
where it ends on one, `┣` `┫` `╋` where it continues through, and the corners `┏` `┓` `┗` `┛`
(ascii: `+`). Borders are always the plain `border` colour; focus shows as brightness (see the side
panes). Zen mode has no frame. The lines are light by default (`ui.lines = "light"`: `─ │ ┬ ┴ ├ ┤ ┼`);
`ui.lines = "heavy"` draws them as shown here, `━ ┃ ┳ ┻ ┣ ┫ ╋`. Tables in the note are always light.

**The top bar** has buttons and vault-wide state. It sits on the page's
background like the rest, so the frame's rule under it gives it the same half row of air the tab
strip and the titles get from theirs:

- on the left, the `slipbox` chip (plain accent text), which opens the command palette; before
  it, without the left rail, the explorer's `≡`;
- at the right end, vault-wide state (`indexing N…`, `home vault` for a loose folder), dropped when fewer than 12
  columns are left.

Toggle buttons have no fill of their own: their glyph is dim (`topbar_button`) while the pane is
closed and bright (`topbar_button_on`) while it is open. `ui.top_bar = false` removes the bar, as
do `space u b` and "Top bar" in the UI settings (`space u u`, remembered like the other settings; the note gains
its row, `:` still opens the palette, and the vault state isn't shown); zen mode hides it too.

**The breadcrumb** tops each window, between two rules. It starts with an icon (`§`, ascii `#`) that
opens the heading finder when clicked, then the chain of headings that window's cursor is under,
each cut to 40 columns. When they don't all fit, the middle collapses into `…`: the first heading,
`…`, and as many of the innermost as fit; then only the first and the last, cut (down to 8 columns
each); then `…` and the last; then `…` alone. Clicking `…` (or `space f b`) opens the whole path as
a dropdown hanging under the breadcrumb, centred across the screen, at least half its width (60 to
100 columns) and room for 8 entries between blank rows, framed like the other popups: one heading
per row, each hanging off the one above with `└─`, the current one marked `here` and selected.
Typing filters it, as in every list (the filter's row sits under the title); the arrows and `ctrl+n`
/ `ctrl+p` move, `enter` or a click jumps there as a breadcrumb click does, `esc` or a click outside
closes it. In a split it shares the window's title row, after the file name. Clicking a heading
focuses that window, puts its cursor on the heading, and scrolls the heading to the window's first
row (as far as the note's end allows). The row stays reserved above the first heading, so the text
doesn't jump. `ui.breadcrumb = false` removes it; zen mode and windows under 8 rows drop it. Without
the right rail (below), the `▤` button sits at the breadcrumb's right end; when no window shows a
breadcrumb either, it moves to the right end of the top bar (with neither, in zen or with
`ui.top_bar = false`, the outline opens with `space o`). Without a breadcrumb there are no header
rules, the outline starts at the top of the content, and a split window gets a plain title row
(`tab` / `tab_active`).

The breadcrumb row has its own background, `breadcrumb_band` (`surface` blended into the page
at 35%). The icon is `breadcrumb_icon` (blue), outer headings `breadcrumb` (dim), separators
`breadcrumb_sep` (faint), and the heading the cursor is in `breadcrumb_current` (bold). In a
split, the file name comes first on the same row: `strong` in the active window, `dim` in the
other.

Rules run above and below it. The rule above is the frame's rule under the tab strip; the lower
window of a stacked split draws its own.

**The tab strip** sits under the top bar whenever a note is open, even with a single tab, on the
page's background like the top bar and the status line. A tab reads ` N name `: its number, the file
name with its extension, cut to 24 columns, and `↻` for 3 s after a reload; a pinned tab has a pin
(`⚑`) before its name. Each tab has a `×` to close it and a `┃` after it, joined to the rules above
and below the strip (`┳`, `┻`). The active tab is bright (`tab_active`) while the note has focus and
dimmer (`tab_active_idle`) otherwise; other tabs are `tab`. When the tabs don't all fit, the strip
shows a run of them that includes the active tab: from the first tab, scrolled just enough to bring
the active one in. A `+N` button at the far right, behind its own `┃`, counts the tabs left out;
tabs always stop before it, even when the one left has to be cut short, and clicking it opens the
tab list (`ctrl+t t`) to pick one. A tab holds the note and its outline but not the explorer, so
with the explorer open beside the content the strip starts after the explorer's border and spans the
note and the outline. The explorer runs from under the frame's top rule to its bottom rule, and
stays put when the strip appears or goes.

**Pinned tabs** (`ctrl+t shift+p`, `:tabpin`) keep together at the left of the strip, in the order
they were pinned; moving a tab (keys or a drag) stays inside its group. A pinned tab keeps its note:
whatever would open over it — a link, `ctrl+p`, `:e`, the explorer — opens in a new tab instead.
Close others and close all skip pinned tabs (`ctrl+t q` closes one, being about that tab), and the
session keeps them.

**The status line** is about the file. From left to right:

- a mode chip: `READ`, `SOURCE`, `LENS`, `INSERT`, `VISUAL`, `V-LINE`, `FILES` (the explorer or
  the history), `OUTLINE`, `RESIZE`, or what's pending: keys of a sequence in short form (`␣ l`,
  `C-w`), or an operator, count or `r` (`2d`, `di`);
- the note's path (click to copy its absolute path), cut from the front when short of room, so the
  note's own name stays;
- a marker: `• unsaved`, `• unsaved ⚠ differs from disk` (after keeping yours in a conflict),
  `↻ reloaded` after an external change, or `✖ deleted on disk` — in symbols only (`• ⚠`) on a
  narrow screen, so the path and the position keep their room;
- whether external changes will show up: `● watching` (with a count of polled directories, if
  any), `⚠ not watching` when the watcher failed, `○ not watching` when it is off. It is
  dropped when the line is too short.

On the right it shows the link under the cursor and its status (`→ [[beta]] (resolved)`), then
the note's words (`1,234 words`; the selection's in visual mode, `12 words selected`; frontmatter
not counted, each Han or kana character a word; dropped first when short of room), then
`tab N/M` when there are two or more tabs, then `L<source line>:<column>` and the percentage (`all`
when the note fits), which always shows. Find's progress is in its window's find row, not here.

**Find** (`/`, `ctrl+f`) belongs to a window, so it's typed there: a row of its own under the
breadcrumb (or at the window's top when there's none), `› query` with the match count at its right
(`2/7`, `no matches`, `not a regex`) and two toggles before it, clickable and bright while on — `.*`
regex (`alt+r`) and `ab` whole words (`alt+w`), kept for the window's next search, and `⇄`
(`alt+h`), which opens and closes the replace row (below); a rule under it.
The query is plain text by default, smart case (a capital makes it case-sensitive); it matches the
note's text as a layout shows it — the look of a pane's filter. The row stays while the search is on
(`n`, `shift+n`, `*` move through the matches) and goes with it (`esc`, `:noh`); the text moves down
two rows while it's there. A window too short for it asks in a question's window (below).

**Replace** (`ctrl+h`, `space f r`, or `tab` from the find field) is the same find row with a second
row under it: `⇄ replacement` with `replace` and `all` buttons at its right, the rule under both. It works on the
markdown, so a rendered window switches to editing first (`editor.edit_in`: source mode or the lens)
and every match is a real place in the file. `tab` / `ctrl+h` and `shift+tab` move between the two
fields. In the replace field `enter` replaces the match at the cursor (or the next one) and moves on,
`alt+enter` or `alt+a` replaces them all as one undo step, `ctrl+n` / `ctrl+p` move between matches
without replacing, and `esc` closes both rows, keeping the edits and the search. While it's open the
count is of the note's text, so it's exactly what would be replaced; with regex on, the replacement
takes `$&`, `$1`–`$9` and `$$`. Opened on a selection within a line, the selection is the query;
across lines, the replacing stays within the selection's lines. Messages (`replaced 3 matches`) show
while the rows are open. The text moves down three rows.

Vim's `:s` (`docs/design/keymap.md`) uses the same engine, `core/replace.ts`; with its `c` flag the
same two rows ask at each match, `replace? y n a q` where the buttons were.

**Messages and questions never take a row of their own,** so the note never changes height for them.
Messages float as boxes at the top right of the content, hanging from the rule under the chrome at
the top of the window under them (its breadcrumb, find and replace rows, which stay in sight),
newest on top and stacked down, four at most:
each framed in its level's colour with its glyph first — `✗` error, `!` warning, `·` info (ascii
`x`, `!`, `-`; an info message that starts with its own symbol, such as `↻`, keeps just that) —
and wrapped to three rows. Each shows 4 s (8 s an error); the same message again refreshes its box
rather than stacking a second. Clicking one opens the messages list and clears the boxes. Popups
and questions draw over them. On a screen too small for a box (under 30 columns), a message takes
over the status line while it shows.

**Questions** — anything slipbox asks: a name for a new note, a rename, "delete it?" — float in a
window of their own near the top of the content, framed like the lists: the question (wrapped, six
rows at most), the answer typed on its own row after `›` (its end kept in view as it grows), and
buttons at the bottom right, `OK enter` and `Cancel esc`. A yes-or-no question has no answer row and
`Yes y`, `No n` (`esc` is no too; `enter` isn't an answer). The buttons click; a click outside the
window cancels. The status line stays. Find's is in its window (above). On a screen too small for
the window (under 30 columns, or too short), a question takes over the status line — a yes-or-no
one ending `y / n` — and in zen, with neither bar, the screen's last row.

**Scrollbars.** The last column of each window is its scrollbar: a `▐` track (`scrollbar_track`)
with a `▐` thumb (`scrollbar` in the active window, `border` in the other); ascii `|` and `#`. The
explorer and the outline get the same bar in their last column while their rows overflow (the
thumb bright while the pane is focused). With wrapping off, each window's last row belongs to a
horizontal bar: a `▄` track and thumb under the text (ascii `-` and `#`), drawn when the note is
wider than the window; the row stays reserved when it isn't, so the text doesn't jump. A side pane
whose rows are wider than it scrolls sideways too: its rows are clipped instead of cut with `…`,
and its last row holds the same `▄` bar (only while they overflow). Every bar can be clicked and
dragged; in a side pane that focuses the pane and pins its scroll, like the wheel. A horizontal
wheel or trackpad scrolls a side pane sideways as it does the note.

**Hover.** Buttons, tabs and their `×`, `+N`, breadcrumb headings and icon, the status path and
which-key entries are drawn in the `hover` role while the mouse is over them. Rows in lists and
panes show their selection instead.

**Viewport-only (plan `3.2`).** Only rows on screen are drawn, and a layout is computed once per
width and cached on the buffer. A drawing failure never takes the app down: the screen says so on
its first row, it is reported once as an error message and the last frame's geometry is kept (tests
fail on it instead). A window narrower than 8 columns isn't drawn.

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
  moves the view, and pulls the cursor along only as far as it must — inside a tall lens too,
  so the cursor is never on a row the lens hides.
- **What follows from it:** the link under the cursor is the one link commands act on; `y r`
  and `space s a` use the cursor row; find lands on the match; a click sets the cursor.

**Selection.** A selection is an anchor plus the cursor. It's extended by `shift`+movement or by
visual mode (`v` by character, `shift+v` by whole row); `o` swaps the ends, and `esc` clears it.
A mouse drag makes one too, copied on release; in source mode or the lens it is a visual
selection (as vim's mouse makes one), so `d`, `c`, `x`, `>`, `<` and `y` act on it and `esc`
leaves it. Copied text is the rendered text, which is what you saw. A double-click on a link
follows it once: the second click, landing in the note it opened, is swallowed.

## Buffers, views, tabs, windows (plan `3.3`)

- **Buffer:** one open file, with its source, parse, and layouts by width. Buffers are
  internal: there is no buffer list. They're keyed by path, so a note deleted on disk keeps
  its buffer.
- **View** (a window): a buffer plus its own cursor, top row, selection, find and history.
  Two windows may show one buffer.
- **Tab:** one window, or two in a split, with an orientation (side by side, or stacked) and a
  ratio (the first window's share). Resize mode (`space w r`, or a `ctrl+w` step) changes the ratio,
  or the explorer or outline width when one is focused, and all of it is kept in the session.
  Side by side falls back to stacked below 80 content columns (a fixed width, not
  `ui.narrow_width`), and a stacked split too short for two windows (under 6 rows) shows only the
  active one. With a split, each window names its note on its breadcrumb row, bright in
  the active window. Pane widths stay between 12 columns and half the terminal, and together
  leave the note at least 24; a split's ratio stays between 15% and 85%.

## Positions (plans `3.4`, `3.5`, `3.15`)

**Views store source anchors, not rows** (decision `3.5`):

- **Top of the view:** the nearest heading above it, plus an offset and a fallback line, plus which
  row of that source line it is (a wrapped paragraph's, a table row's), so a resize and back
  returns the same top. A table's rules belong to the lines beside them (the header rule to the
  delimiter line, the bottom rule to the last row), so a cursor on one stays on it.
- **Cursor:** the same kind of anchor for its row, plus which wrapped row of that source line
  it's on, plus its column.
- **Selection:** its fixed end is kept the same way, so a resize or a pane toggle keeps it on the
  same text (whole-row selections take whatever the rows hold after re-wrapping).

Rows are re-derived on every re-layout (a resize, a reload), and the anchors are then refreshed
from where they landed. So text an agent inserts above doesn't move you, and removing your
heading later falls back to a current line, not a stale one.

**Saved state:**

- **Reading position** per note, cursor included, in `positions.json` in the state dir.
- **Session:** tabs and the active tab, splits with their orientation and ratio, cursors, each
  window's history (its last 50 places each way), the explorer's and the outline's visibility and
  widths, UI setting overrides, the palette's recent commands and the recent notes, in
  `session.json`. The tabs and windows are restored when slipbox starts with
  no path, if `ui.restore_session` is on; UI setting overrides and recent commands on every start.

## History (plan `3.6`)

Each window has back and forward stacks of `{note, top, cursor}`, 200 deep, kept in the session (50
each way) so they go on after a restart. Following a link, jumping to a heading and opening a note
all push onto them. The history list (`space h h`) shows the whole timeline and jumps anywhere in
it, and under it the notes read lately in other tabs and sessions: a note opened in a tab of its own
starts a timeline of its own, and is still found there.

## Switching vaults (plans `17.10`, `17.14`)

The TUI is always in one root: a vault, or a loose folder of the home vault (the top bar says
`home vault` then). **Opening a note of another vault switches to it** —
following `[[vault:note]]` or a path out of the root, a backlink from another vault, a vault picked
from the list or the explorer: the TUI becomes that root's, as if started there — its config, its
index (refreshed), its watcher, its reading positions and its session, whose tabs come back, with
the note open (at its heading). Leaving saves the one before as quitting does. **Refused while a
note is unsaved** (`unsaved: … — save (:wa) or revert before leaving`): it would be left behind. A
loose file opens as it is, beside the current vault's notes: it has no vault to switch into.

**Back returns.** `back` (`ctrl+o`) from the first place in a vault goes to the vault before, at
the note and place you left; each switch is remembered, so a chain of them unwinds one by one.

**The known vaults** (`space v v`, `:vaults`, `vault.switch`): the machine's list (`vaults.json`,
`slipbox vaults`), most recently seen first — each by its name and its path; `enter` switches.
**The launcher:** slipbox opened on a loose folder without a file (`slipbox ~`) shows this list at
once, over the folder's explorer, when there are vaults to show.

**A git repository without `.slipbox/`** (`17.18`): opening a file in one offers to make it a vault
— "`<root>` is a git repository without .slipbox/ — make it a vault?" — with three answers: make it
a vault (`.slipbox/` committed with it like any file), make it a **private** vault (listed in its
`.git/info/exclude`: never in `git status`), or not now (`esc` too): the file stays loose, and that
repository isn't asked about again. Made a vault, the TUI goes into it with the note open.
`space v m` (`:init`, `vault.init`) asks again, for the loose folder's repository or the folder
itself.

## Renames (plans `17.15`, `7.1`–`7.3`)

`space n m` (`:rename <path>`, `:mv`) asks for the note's new path, the old one typed already; the explorer's `r`
for the selected note's, file's or folder's new name, `m` for a folder to move it to (18.x, below); `space v n` for
the vault's new name; `space l r` (`:relink`) relinks this note's links that reach their
note by an old name or a move. Each shows its **preview** first: a list of every line it changes, in every vault
(`notes/index.md:3  [[plan]]  →  [[roadmap]]`), with the git trees that already have changes and the links skipped
at the top; `enter` carries it out, `esc` leaves everything as it was. What it does is `slipbox mv`'s,
`rename-vault`'s and `relink`'s (`docs/design/cli.md`, "Renames"). **Refused while a file it rewrites is unsaved.**
After it, the open notes it changed are reloaded, and a window on a renamed or moved note shows it under its new
path, its history following — every note of a moved folder alike.

## Files in the explorer (plans `18.1`–`18.10`)

The explorer makes and changes files by keys and by buttons, on the selected row — a note, a file, or a folder:

- **New:** `n` a note (`space n n` too, as everywhere), `shift+n` a folder, in the selected folder or beside the
  selected file; the title's two buttons do the same (Nerd: a file and a folder with a plus; unicode `+`, `+▸`).
  which-key in a pane names its actions as help does ("New note here"), and a pane's own key sequence waits for its
  second key, whatever the note binds its first to.
- **Rename (`r`) and move (`m`):** `r` asks for the new name, in its folder (the old one typed); `m` picks a folder
  from a **tree** of the vault's (`18.8`): the root first, each folder folded or unfolded as the explorer has it
  (whether or not it holds folders), the folder it's in unfolded and selected (marked `here`); `←` / `→` fold and
  unfold; typing filters to the matching folders under their parents,
  all unfolded, `enter` taking the first match. A folder being moved, and what's in it, isn't offered. Both go through
  the rename's **preview** above: every link to it — and, for a folder, to anything in it — fixed, links between notes
  that move together left as they are, what the walk doesn't list (pictures, hidden files) moving with its folder.
- **Delete (`d`):** asks first (a yes-or-no question: `y`), saying how many links from other notes will break, then
  moves it to the vault's **trash** (in its state, never in the folder). `u` puts back what was deleted last;
  `space v t` (`:trash`) lists the trash, `enter` restoring an item — refused when something is at its place again. An
  open note deleted shows its last text, marked deleted; restored, it's reloaded. Refused while a note it takes is
  unsaved.
- **Copy, cut, paste (`y`, `x`, `p`):** `p` pastes into the selected folder (or beside the selected file): a copy —
  `name-copy`, `-2`… when pasted beside the original, the copy's links as written — or what was cut, moved (the
  preview, links fixed).
- **The selected row's menu:** while the explorer has focus, the selected row has one button at its end, under the
  title's buttons: `…` (Nerd: three dots; ascii `...`). It opens a menu hanging from it (`.` opens it by key, from the
  row), titled with the row's name, each entry with its key in the explorer, which picks it there too: for a folder
  "New note here" and "New folder here", then "Rename", "Move to…", "Copy", "Cut", for a folder "Make it a vault" (a
  vault's: "Make it a plain folder"), "Paste … here" (when something is copied or cut), "Delete". `enter` or a click
  does the selected one; `esc` or a click outside closes it. A name that doesn't fit beside the button widens the
  tree: the explorer's horizontal scrollbar appears, and scrolled to its end the name ends just before it.
- **A nested vault's row** (`18.7`) is a folder of this vault: `r` renames its folder and `m` moves it — links into it
  by path fixed here and in the vaults that reach it, its own relative links out fixed, its id and name kept (it's
  recorded at its new place); `d` deletes it whole, saying so ("the vault outreach (outreach/, 12 notes)") with the
  links into it — by path or by its name — that break. Its menu has "Rename the folder" and, beside it, "Rename the
  vault" (`shift+r`, `R` in the menu): `rename-vault` for it, its folder left where it is.
- **A folder made a vault, and back** (`18.11`): `v` on a folder asks for the new vault's name (a distinct one typed:
  `halden-logs` for `logs/`), then previews the links that would stop reaching across the new boundary, rewritten —
  `[[observing-log-2026]]` in the parent becomes `[[halden-logs:observing-log-2026]]`, and so on, as `slipbox init
  <folder>` does (`docs/design/cli.md`); enter makes it. `shift+v` on a nested vault's row previews the way back —
  its `[[name:…]]` links become names here — and enter puts its `.slipbox/` in the trash. The row turns into a vault's
  or a folder's, selected. In a loose folder, `v` offers to make the folder a vault of its own and goes into it.

Every one of these has a leader key too, so which-key lists them (`18.13`): `space n` for a note (rename or move by
path, move, delete, copy, cut, `shift+y` a copy beside it), `space d` for a folder (new, rename, move, delete, copy,
cut, paste), `space v` for a vault (make one, make it a plain folder, rename it, the trash, restore). With the explorer
focused they act on its selected row, elsewhere on the current note, its folder, or this vault — made a plain folder,
it's left for the vault holding it, the note still open. What they do is the CLI's `rm`, `mv`, `cp`, `init` and
`deinit` (`docs/design/cli.md`).

## Following links

Each kind of link does something different when followed:

| Link | Following it |
| --- | --- |
| `[[note]]`, `[[note#heading]]` | opens the note, at the heading |
| `[[#heading]]`, `[t](#frag)` | jumps within the note |
| ambiguous `[[name]]` | a picker of the candidates |
| unresolved `[[name]]` | the new-note prompt, the name typed: `enter` makes it beside this note |
| `[[vault:name]]`, `[t](../other/x.md)` | opens the note in the other vault (`17.8`, `17.9`) |
| `[[vault:name]]` that doesn't resolve | says why: `unknown vault "x"`, or where it was last seen |
| `[t](other.md#frag)` | opens relative to the note |
| `[t](run.py#L42)` | opens the file at line 42 (as in a code comment's `run.py:42`) |
| `https://…` | copies the URL; opening a browser over SSH would be wrong |
| `file://…`, `~/x.md`, `/home/me/x.md`, `[[../other/x]]` | opens the file, in whichever vault holds it (`17.16`) |
| attachment `![[x.png]]` | copies the path; images are phase 6 |
| footnote `[1]` | jumps to the definition |
| tag `#dome/shutter` | lists the notes with the tag (its nested ones too, `#dome/shutter/…`); enter opens one |

**Tags** (`1.6`): `space f t` (`:tags`) lists the vault's tags, each with how many notes carry it — a nested tag
indented under its parent, whose count includes its children's — and picking one lists its notes; `:tag name` goes
straight there. A note's tags are its frontmatter's `tags:` and the `#tags` in its text (`docs/design/rendering.md`).

A link reached by a note's alias or previous name, or through a redirect (the note moved: `17.12`),
follows too, and says so. The backlinks list
shows another vault's link with that vault's name: `app: design/plan.md`.

`enter` follows the link under the cursor, or else the row's first link. In source mode and inside
the lens, where rows are the markdown itself, `enter` and `space l f` / `s` read the link around the
cursor from the text (`[[…]]`, `![[…]]`, `[text](url)`); in a text file, a URL or a path naming a
file of the vault (`16.10`); a click there places the cursor for editing. A click follows a link
only when it lands on the link: blank space past a row's end or below the note, which the cursor is
clamped from, follows nothing.

The explorer's and the outline's selections stay on the note or heading they select when an agent
adds or removes notes or headings (a selection is kept by what it is, not its row). A reading
position under a repeated heading (a log's `## Weather` entries) keeps its entry when one is
prepended: the anchor also records the heading's occurrence counted from the bottom and the row's
text, and keeps whichever count still finds that text.

## Side panes: explorer (plan `3.7`), history, outline and footnotes

Each side has one panel, which shows one of its views at a time; its rail has a button per view,
bright while that view shows. Clicking a view's button shows the panel on it (and focuses it), or
hides the panel when that view already shows. Each view keeps its own position while another shows
(selection, scroll, sideways offset and filter text) and gets it back when it returns; on its first
showing the explorer reveals the current note and the history selects `here`. The views are a
registry (`LEFT_VIEWS`,
`RIGHT_VIEWS` in `app.ts`) and more will come on both sides, each with its own rows, drawing and
keys.

- **Explorer (left, `≡`):** the walked notes as a tree, directories first, with the files
  `files.show` lists beside them — by default the data files (JSON, YAML, TOML, INI, CSV), shown with
  their extension and their own icon; `a` toggles to every text file and back (`16.5`, "Files beyond
  notes" below). Moving the selection, or a click on a note, only selects. `enter`, `l` and a
  double-click open the note as a tab, or switch to the tab already showing it; `o` replaces the
  current window's note, and `s` opens it in the split's other window. A click on a folder folds or
  unfolds it. New notes and folders, renames, moves, deletes, copies: "Files in the explorer",
  below. **A folder that is another vault** (`17.13`), nested in this one (`◈`, Nerd: a
  bookshelf), in a folder's blue (role `sidebar_vault`, for `[colors]` to set), is a row of its
  own, its icon telling it from a folder, the vault's name dimmed after the folder's when they
  differ; `enter` or a double-click goes into it (a switch, below). **In a loose folder** (the home
  vault) the explorer lists the folder alone: `..` to go up, then each folder in it — a vault or a
  loose folder — and its files; going into a loose folder lists that one (`17.14`).
- **History (left, `◷`, `space h h`):** the active window's timeline, newest first: each place's
  note name and line, the current one marked `here` and selected when the view opens. A click
  selects an entry; `enter` or a double-click jumps there, the places before it becoming back and
  those after it forward. Under it, **recent in this vault**: the notes read in other windows and
  tabs and in earlier sessions — every note with a reading position (`slipbox history`'s list),
  and every open tab's — not already in the timeline, newest first, up to `ui.history_limit` (100;
  0 lists none): each with when (the time today, else the day), or `tab N` when it's open in
  another tab; `enter` opens one in this window. The heading is stepped over. The history never
  scrolls sideways: a name too long for the pane beside its hint is cut (`…`), the hint kept.
- **Filter (`/`, the explorer, the history and the outline):** a `› text` row at the top of the
  list, a rule under it (joined to the pane's border), then the list —
  while the pane has focus (otherwise `/` is find in the note); typing narrows the rows (`/`
  on a view that kept its filter resumes it). The explorer keeps the tree: the notes whose path
  matches, under their folders (all unfolded), the matched letters highlighted, the selection on the
  first note. The history keeps the entries whose path matches. The outline keeps the headings that
  match under their parents (folds ignored), the selection on the best match. The arrows and
  `ctrl+n` / `ctrl+p` move, `enter` or a click opens (in the explorer and the history, a
  double-click; the filter clears), `esc` clears it. `ctrl+p`
  stays the flat quick-open across the vault.
- **Outline (right):** the current note's headings, indented, foldable (`h`/`l`). While not
  focused it follows the cursor's section, and `enter` jumps to the heading.
- **Footnotes (right, `3.17`):** the current note's footnotes, in the order the note first refers to them (as GFM
  numbers them), then the ones nothing refers to: `[label]` and the definition's text (the definition's label), and
  at the right how many references it has (`2×`), `unused`, or `no definition`. `l` unfolds a footnote into its
  references, each with its line and that line's text; `enter` (or a click) jumps to the definition or that
  reference — in a rendered window onto the reference or definition as drawn, in source mode to the text. While not
  focused it follows the cursor: the footnote the cursor's line refers to or defines. It never scrolls sideways: a
  long row is cut, so its count stays. `space n f`, its button, `:footnotes`; `slipbox footnotes <note>` gives
  the same (`docs/design/cli.md`).

Each pane starts with its view's title ("Explorer", "History", "Outline", "Footnotes") and a blank row before the
list; panes under 8 rows skip both. The explorer runs from under the frame's top
rule, beside the tab strip. The outline starts right under the tab strip too,
beside the note's windows: their breadcrumbs and rules stop at its border (which meets the
breadcrumb's rule in `┫`), and its title sits level with the breadcrumb. The outline's button
(`▤`) is on the right rail, bright while the outline is open.

**The rails** (`ui.left_rail`, `ui.right_rail`, both on by default) are columns of buttons at the
edges, one button per row from the top. Each is a tinted column (the `rail` role, a shade darker than
the page), 3 columns wide, with no border: the frame's rules run over it unbroken. Without colour
(NO_COLOR) there's no tint, so a rail is 4 columns with a border on its inner side, joined to the
rules it meets. Each is generic: a place for buttons, whatever they open.

- **The left rail** runs from under the top bar's rule to the frame's bottom rule, its first button
  level with the tab strip. It holds the left panel's views, the explorer's `≡` and the history's
  `◷` (ascii `~`), and the panel opens beside it. Without it, `≡` is the top bar's and the history
  opens with `space h h`.
- **The right rail** runs from under the tab strip's rule, its first button level with the
  breadcrumb. It holds the right panel's views, the outline's `▤` and under it the footnotes' superscript (Nerd: `x²`; unicode `¹`; ascii `^`), and
  the panel opens beside it. Without it, `▤` sits at the breadcrumb's right end and the footnotes open with
  `space n f`.

Every width (the panes, the note, the narrow cutoff) is shared out after the rails' columns.
Zen mode hides both.

Focus shows as brightness (without colour, as an underline), never as a coloured border: a pane's
title is bright (`pane_title_active`) while the pane has focus and dimmer (`pane_title`) otherwise,
and the active tab is bright (`tab_active`) while the note has focus and dimmer (`tab_active_idle`)
otherwise. All of them stay bold, so nothing shifts.

Both trees show depth by indentation plus dim tree lines (the `tree_guide` role): `├─` into each
child, `└─` into the last one, and `│` where an ancestor has siblings still to come (ascii: `|`, ``
` ``, `-`). The outline marks headings that have sub-headings with fold markers of its own (`▾` /
`▸`; ascii `v` / `>`); the explorer marks folders with its folder glyphs. The wheel scrolls a pane
without moving its selection, and the pane stays where the wheel left it until it is focused,
revealed or opened, the note scrolls, or the outline's note changes; and a click anywhere in a pane
focuses it.

Both are windows for `ctrl+w h` / `ctrl+w l`, and each has its own keymap: `[keys.explorer]` and
`[keys.outline]`.

**Narrow terminals (plan `3.14`).** Below `ui.narrow_width` (90) columns (and never beside the note
below 50, the room for both panes and the note's 24), and in zen mode, both panes open over the
content on demand (6 columns wider than their width, leaving at least 6 of the note) and close after
a pick. The wide-terminal preferences (`ui.sidebar`, `ui.outline`) are kept separately, so widening
the terminal brings them back. Tables that cannot fit become records ([rendering.md](rendering.md)).
Click targets under an overlaid pane (a breadcrumb heading, the `▤` button) are off while it's open,
and the rules it covers stop at its border, which joins them with `┳`, `┫` and `┻`.
Over the note, a pane's border and margin belong to it (clicks there focus it); the side panes take
clicks and the wheel before the note's borders and scrollbars, and the outline, drawn over the
explorer, before the explorer.

## Overlays

One list component serves every picker. Like every floating window, it has a margin in its own
colour around its border, one row above and below and two columns at the sides, since a cell is
about twice as tall as it is wide (the explorer and outline over the content get two blank columns
past theirs), so the content behind never runs up to the edge.

- **Pickers:** quick switcher, heading picker, links, backlinks, history, tabs, theme and glyph
  pickers (with live preview; `esc` restores), UI settings, messages, info, and keys. The quick
  switcher lists recent notes and files first (kept in the session), the previous one on top, so
  `ctrl+p enter` goes back; vault search (`ctrl+shift+f`, `space f g`) lists each matching line as
  `path:line` with the line, an open note searched as it is now.
- **Filtering** (`3.16`): each space-separated word as typed — its letters together, never one by
  one — and every word, in any order (`hand oper` finds `handbook/operations-handbook.md`); smart
  case, word by word. Ranked by where each word lands: in the label over its description, in the
  file name over its folders, at a word start, earlier; the shorter first. The explorer, the history
  and the outline filter the same way. Highlights follow the original text even where lowercasing
  changes its length; the explorer lights the note's name where a word matched it.
- **Keys:** as in [keymap.md](keymap.md), "In lists and prompts": the arrows, `tab` and
  `ctrl+n`/`ctrl+p` move (wrapping around), `enter` accepts, `esc` cancels. The wheel scrolls the
  list three rows a notch (the selection moves only to stay in view), a click picks, and a click
  outside closes the list. A counter in the bottom border shows `n/m`, and an empty list says "no
  matches" or "nothing here".
- **Groups and footers:** a list may have group headings (dim, bold capitals, with a blank row
  before each but the first and a full rule under each; never selected, moving skips them) and a
  footer. The footer is always four rows under a rule, so the list doesn't jump (on a short screen
  it's left out before the list gets under four rows): the selected entry's name
  (bold), its explanation in normal text (wrapping to a second row), and its other bindings
  ("also", as keycaps). Explanations are the `desc` of each command in `core/command-specs.ts`:
  a plain sentence saying what it does ("Moves the cursor to the end of the row").
- **Keycaps:** key bindings are spelled out (`ctrl+d`, `shift+g`, `space l y`, `esc`) and each
  binding is its own keycap (`keycap` role; `keycap_selected` on the selected row), so the space
  inside a sequence (`g g`) can't be mistaken for the gap between bindings. In help at most three
  show, in columns sized per section so they line up down it; the palette has two fixed columns
  (the first key, the first alias), aligned across the whole list; plain bindings come before variants
  (such as the selection-extending ones), and the rest are shown in the footer. On a narrow screen
  the columns that don't fit are dropped from the row (help's footer still lists the extras). The
  columns have no names: they are simply the first, second and third way to do it.
  Without a keycap background (`NO_COLOR`), the columns are separated by `·`.

Help and the palette list the same commands for different jobs, in the groups of
[keymap.md](keymap.md) (`COMMAND_GROUPS` in `core/command-specs.ts`), in that document's order:

- **Help (`?`, `space ?`, `:help`)** is for learning the keys: every command with all its bindings (source
  mode's own, `[keys.source]`, and visual mode's included), then what
  works inside the explorer, inside the history, while filtering a panel, inside the outline, in
  resize mode, and with the mouse. Filtering keeps the groups; `enter` runs a command (the other
  entries are reference only). Opened from the explorer, the history, the outline or visual mode,
  it starts at that section ("Inside the explorer", "Inside the history", "Inside the outline",
  "Selection & copy"), with its heading at the top. A new panel view gets its own section.
- **The palette (`:`)** is for doing things. Empty, it lists the commands last run from the
  palette or help (the last 5, kept in the session) and then every command by group (except the
  internal `esc` handler); typing ranks the best match first,
  without groups. Each command shows its first binding and first alias.

**The `:` prompt** is the palette and a command line at once. An exact alias from `[aliases]` (`:q`,
`:vs`, `:theme dracula`) always wins, and an alias taking an argument lists completions (notes,
themes, glyph sets) once a space is typed. Move to a candidate and `enter` applies it; `enter`
without moving runs the alias bare (`:theme` opens the theme picker, `:e` the note picker).

**The which-key popup** lists the next keys of a pending sequence, across the keymaps active in the
current state. It is framed like the other popups: a bordered box on the overlay background, with
the pending keys as its title (`␣ l › links`), the hint (`backspace up · esc cancel`) in its bottom
border, a blank row inside above and below the entries, and the same margin; it sits centred just
above the bottom of the content area. On a short screen the blank rows go first, then the
explanations (the blank rows never show without them); entries that still don't fit are counted in
the bottom border (`+3 more`), and with no room at all the popup isn't drawn. The entries are in at
most three columns, as many as fit. Each column is sized to its own entries, so a long explanation
in one never spreads the others apart. Each entry is `key → name` with a short, dimmed explanation
underneath:

- **For a command:** its `desc` in `core/command-specs.ts`.
- **For a group:** from `[groups]`.

Keys with the same action share one entry, letters first (`j down`); groups come before commands,
and a group without a name reads `+more`. It shows at once for the leader, and after
`input.which_key_delay_ms` for other prefixes, never with `input.which_key = false` (resize mode's
popup shows regardless: it is that mode's only cue). `backspace` goes up a level; `esc` cancels.
Groups read `+name`; clicking an entry presses its key, and the popup covers what's under it (clicks
on its background do nothing). It also shows in resize mode (titled "resize", with "keys repeat ·
any other key leaves").

**The message sink (plan `3.13`).** Config warnings, walk errors, watcher problems and command
feedback all go to one place: a floating box briefly, the messages list permanently (the last
500).

## UI settings

These are the `space u` toggles and pickers (list in [keymap.md](keymap.md)):

- theme and glyphs
- readable width (the text column capped and centred)
- zen (no chrome; panes only on demand)
- the cursor-row band
- source line numbers in a gutter
- the breadcrumb (no key of its own: the `space u u` list, or the palette)
- wrapping (below)
- link URLs
- mouse capture

**Wrapping off (`space u w`, `alt+z`, `ui.wrap = false`).** Each note is laid out at its natural width:
first very wide, then at its widest real row (trailing spaces, rules and right-aligned
decorations such as a code block's language label don't count), never narrower than the pane.
Paragraphs stay on one row and tables keep their natural column widths. Each window then scrolls
sideways: the view keeps the cursor 4 columns from either edge (a quarter of a narrow window), a
horizontal wheel or trackpad scrolls it 6 columns a notch without moving the cursor, clicks land on
the column under the pointer, and the offset is clamped when the window changes size. Full-width
elements (code block backgrounds, rules, heading bands) span the natural width, so a code block's
language label sits at the note's right edge. Wrapping off takes precedence over readable width,
zen's cap and `render.max_width`: the text is never narrower than the pane, so it isn't centred.
The first layout is 2000 columns wide and only the first 1500 count, so a note wider than that
still wraps there; a run of one repeated character more than 20 columns wide ending a row counts as
a rule (so a titled rule such as the properties header counts only up to its title).

**Persistence.** Changes apply at once and are remembered in the session with the config value each
one overrode, on every start (with a path too). At the next start, or on a config reload, an
override is kept only while that config value is unchanged. Editing the config therefore always
wins, and the TUI never writes your config.

## Configuration reload

The configuration reloads **by itself** when a config file is saved: the user file and the vault
file are polled every second (or every `watch.poll_ms`, if that is shorter). `space v c` (or
`:config`) reloads on demand. A reload applies what changed, live:

- **keys, leader, aliases, groups:** keymaps rebuilt; unknown commands, and unknown actions in
  `[keys.explorer]`, `[keys.outline]` and `[keys.resize]`, are reported
- **theme, glyphs, UI defaults:** applied, replacing session overrides of the changed values; a
  changed `ui.split_ratio`, `ui.sidebar`, `ui.outline` or pane width resets the live value
- **`[colors]`:** re-applied to the current theme
- **render settings:** every note re-laid out
- **walk settings:** the vault re-walked, re-indexed and re-watched
- **watch settings:** the watcher restarted

A broken file is reported in the message sink: a wrong value keeps its default and the rest of the
file applies; a file that doesn't parse at all keeps what it said before (its last good contents),
so a typo saved mid-edit changes nothing until it's fixed.

## Writing notes (phase 3)

Every write goes one way (`writeBuffer`): the file is replaced atomically (a temp file in the same
folder, then a rename) keeping its permissions; a symlinked note is written through to its target,
and a target outside the vault is refused (`7.5`); the watcher is told the write is its own; the
buffer reloads, its windows keeping their anchors, so the cursor stays put.

**Task checkboxes** (`4.11`) are the first write. `ctrl+l` (`space n t`), or a click on the
checkbox, flips the task item holding the cursor — the innermost, from any of its rows — as a
one-byte edit to the file's bytes, so a BOM, CRLF endings and even invalid UTF-8 survive untouched.
If the file changed on disk since it was shown, it is reloaded instead and nothing is written (its
lines may have moved).

**Handing off to another editor** (`4.1`, `4.2`, `4.12`) comes in two kinds, both opening the note at
the cursor's source line. `space n e` steps aside: the renderer suspends, the editor
(`[editor] command`, else `$VISUAL`, `$EDITOR`, `vi`, given `+line` or `file:line` when it's a
known editor) runs in this terminal, and when it exits slipbox resumes and reloads the note if it
changed. `space n s` sends the note to an editor already running elsewhere and doesn't wait; the
watcher shows its saves as they land.

**The nvim preset** (`[editor] remote = ["nvim"]`, the default) finds that editor itself. Every
nvim since 0.9 listens on a socket in `$XDG_RUNTIME_DIR` (or `/tmp/nvim.$USER/…`), named `nvim.*`;
slipbox asks each for its working directory and current file, leaving out sockets nothing answers
on. The one picked before for this vault is used while it answers (kept in the session); else the
only one running; else a picker, "Send to which nvim?", listing each by folder and file, the one
working where the note lives first. `space n p` always opens it. The note goes over in two
commands, since nvim's `--remote` takes no `+line`: `--remote {file}`, then `--remote-send
<C-\><C-N>:{line}<CR>` (the line alone, so a file name never becomes keys).

Other editors take templates: `remote` is a list of commands run in order, each waited for before
the next, stopping at the first that fails (`code -g {file}:{line}` is one); `{server}` in one is
the picked nvim's socket. Every template is split into arguments and `{file}` / `{line}` filled in
inside them, never through a shell, so a file name can't become a command; a template without
`{file}` gets the file appended, except a remote one.

## Source mode (plan `4.13`)

`space n v` (`:source`) shows a window's note as its raw markdown, and again rendered; the status
chip reads `SOURCE`. It is another layout of the same note (`core/layout/source.ts`), so everything
built on the layout works the same in both: the cursor keys, find and `*`, visual selection and
copy, the mouse, wrapping, line numbers, the scrollbars. The cursor stays on its source line across
the switch, and the outline and breadcrumb keep working, their headings borrowed from the render.

A source line is a row, wrapped at the last space that fits (wrapping on) or kept whole (off); the
text column is the window's full width, readable width aside. Highlighting is light and per line:
frontmatter, headings, rules, quote bars, list markers and task boxes, fenced code, inline code and
links. Every row records, for each cell drawn, the offset in its source line it shows — a tab is
spaces up to the next stop, all mapping to the tab; a wide character is one cell two columns wide;
a control character shows as `�` and never reaches the terminal; a CRLF's CR isn't shown — so a
cursor column maps to an exact place in the text, which editing (next) builds on.

## The lens: live preview (plan `4.14`, phase 3 step 5)

Editing a rendered note happens in **the lens**: whole blocks around the cursor shown as their
markdown between two rules, the rest of the note rendered above and below it. Where you're looking
is source; nothing is half rendered. Its rules are heavy (`━`, ascii `=`) whatever `ui.lines` says,
in the `lens` role (the accent, bold), so they stand out from the frame and from a note's own rules;
the top one is labelled with its lines (`━━ source · lines 12–18 ━━`). A block is a top-level node
(a paragraph, a heading, a table, a code block, a quote) or a list's top-level item, each with the
blank lines after it, so the blocks cover the note.

**The session.** With `[editor] edit_in = "live"`, `i` `a` `o` and the other editing keys open the
lens typing; `space n l` (`:live`) opens it in normal mode. The chip reads `LENS` (`INSERT` while
typing). `esc` from typing goes to normal mode with the lens still open — the vim commands work on
what's in it — and `esc` in normal mode closes it: everything renders again. Reading, there is no
lens and the keys are the reading keys.

**Its tint.** The rows of markdown between the rules have a background of their own (`lens_band`, a
shade lighter than the page — a code block is darker), so the whole area reads as the lens, not
just its edges.

**Its mode.** The top rule's label says which: `source · lines 8–13` while viewing (normal mode),
`editing · lines 8–13` while typing. Editing draws the rules and label in `lens_edit` (warm: orange
where viewing is the accent) and tints the rows `lens_band_edit`, so the two never look alike.

**Its air.** One blank row sits outside each rule: where the rendered row next to it is already
blank (the gap after a block), that's it; otherwise a blank frame row is added, so the lens never
touches a heading band, a table or a code block. Like the rules, these rows are frame rows.

**Its size by hand.** `+` takes the next block in (the one above, at the note's end), `-` drops the
block farthest from the cursor; the size it comes to is kept as the lens moves — it slides at that
size rather than growing — until `=` lets it size itself again, or it closes.

**Its size.** It opens on the cursor's block and takes in the neighbours (below, then above) until
it has `[editor] lens_min_rows` rows of markdown (6), so a one-line paragraph isn't a sliver and
small moves don't reshape it. It never splits a block. An edit inside it (typing, `dd`, a replace)
keeps its lines, grown or shrunk by the edit; typing that reaches past an edge (a join at its last
line, a backspace at its first) extends it to the cursor, so the cursor always sits on a source row
and an edit goes where you see it. A change from elsewhere while you aren't typing (an agent's
write, a `:%s`) reopens it on the cursor's block at its opening size, never stretched by the lines
the change added. The cursor placed on a line outside it (`cgn`, `n`, undo) moves it there first.

**Moving while it's open.** The cursor stays in it. Moving inside changes nothing; moving past an
edge brings the next block in, dropping the far ones once it's taller than `[editor] lens_max` of
the window (half); a jump (`g g`, `shift+g`, a search, `n`, the outline) moves it to the block
landed on. It keeps its height on screen: when it moves or grows, the page scrolls under it, so your
eyes stay in one place. A click in the rendered text outside it moves it there, the clicked line
staying under the pointer (the lens's height on screen is the keyboard's rule; a click keeps what
you clicked); the wheel scrolls the page freely, the lens riding with its text. In insert mode the
arrows stop at its rules.

**A block taller than the lens** (plan `4.15`) scrolls inside it: the lens shows `lens_max` of the
window, the rest of the block out of sight above and below, counted on its rules (`↑ 21 lines`,
`↓ 24 lines`), and the rendered text around it stays on screen. Moving through the block scrolls
the lens to keep the cursor two rows from its rules; the wheel over the lens scrolls inside it, and
at its end goes on to the page. Growing to its minimum never pulls in a neighbour too big for it:
a heading next to a long code block stays a small lens until the cursor moves into the block. The
hidden rows are still in the layout — motions, find and editing see all of the block — and only
the drawing, clicks, drags and scrolling map screen rows around them (`App.screenRows`).

**How it's drawn.** It is composed, not re-rendered (`core/layout/live.ts`): the render with the
lens's rows swapped for source rows (which carry `srcMap`, so everything in
[Editing](#editing-plans-43-44-45-phase-3-step-3) works in it) and its rules as frame rows
(`decor`: the cursor steps over them, find ignores them, they map to no text). While it's being
typed into, the render around it is reused — the rows after it renumbered by the lines added or
taken away — so a keystroke never re-parses the note (plan `15.1`'s per-block re-layout, for the
lens). Leaving insert mode, or an edit reaching outside it, lays the note out afresh — re-parsing
only the chunks the edits touched and re-rendering only their blocks.

## Files beyond notes (plan `16.x`)

slipbox opens any text file in the vault, not only notes (`docs/idea.md`, "Files beyond
markdown"). `core/filetypes.ts` puts each file in a group by its name: **notes** (the vault's
`walk.extensions`), **data** (JSON, YAML, TOML, INI, CSV/TSV), **text** (everything else: code,
logs, `.txt`), or **binary** (images, archives…, by extension — and a text-named file holding a NUL
in its first 8 KB), which never opens.

A note is read by its format's reader (`core/readers.ts`, `16.2`): each parses into the same mdast
tree — so the index, the render, the lens and the outline work alike for every format — and says
what source mode reads off the raw lines: its headings and the link around the cursor. Markdown's is
the only one: Org and AsciiDoc readers were built and dropped (`16.16`, `16.17`; `docs/idea.md`), and
their files open as text.

- **Opening.** A data or text file opens from the explorer, `ctrl+p`, `:e path`, or a link to it
  (`[config](cfg/app.toml)`, `[[run.py]]`, `[[cfg/app.toml#editor]]` at that section; binary links
  still copy their path).
- **Data files open rendered** (`16.11`–`16.13`, [rendering.md](rendering.md), "Data files"), with
  source mode a key away and the lens editing a card at a time: in YAML and JSON a key with the
  plain values listed right under it (`defaults` and its settings), in TOML and INI one key — never
  padded with pieces of the next card, and moving to the next card rather than gathering them. A
  table's records are blocks of their own: in a CSV or TSV the lens is `lens_min_rows` records
  around the cursor, sliding a record at a time, never the whole table. A data file that doesn't
  parse opens in source mode, the error said each time it opens (a link, `:e`, history); one that
  stops parsing while edited goes there when insert mode ends (never mid-typing: an open quote is
  normal while a value is typed), and `space n v` renders it again once it parses (`16.14`).
- **Text files open in source mode**, highlighted by their language; no markdown headings are
  looked for in them. They have no rendered view: `space n v` and the lens say so and stay in
  source mode. A window that was in source mode only for such a file renders again when it opens a
  note (a link, `history.back`).
- **Source code through tree-sitter** (`16.6`–`16.9`: TypeScript, TSX, JavaScript, Python, shell,
  Lua, Go, Rust). Each language's grammar (the wasm from the language's own npm package, built for
this runtime; `bunfig.toml` keeps their native install scripts off) loads the first time a file of it
  opens, never at start-up; until it lands, the file shows as any text file, and it draws again
  when it does. A parse runs at once on open and then 150 ms after typing pauses — never per key
  (tens of milliseconds for a 4,000-line file) — and the layout uses its last answer:
  - **Highlighting.** highlight.js still colours each line; tree-sitter adds what a line can't
    know alone, that it starts inside a string or comment opened above (a template string's middle
    lines, a docstring, a block comment).
  - **Outline and breadcrumb.** The file's definitions — functions, classes, methods, types,
    interfaces, enums, Rust's structs, traits, impls and modules — as headings nested by where they
    sit, from a query per language. `space o`, `]]` and the breadcrumb use them as a note's.
  - **Syntax errors** (syntax only: no types, no lint). Where the parser found an error or had to
    invent a missing token, the text is underlined (`syntax_error`), and its line number is red
    when numbers show; the status line says `✖ n syntax errors`, or the error itself on the
    cursor's line. Never during insert mode — a half-typed line is always broken — and only for
    the text as it is now: after an edit the marks come back when the new parse lands.
  - **Links in comments** (`16.10`): URLs, and paths with an extension that name a file of the
    vault — relative to the file, then to the vault's root, where a repo's paths start —
    `path:42` at that line. No wikilinks: code has none. They're drawn as links, `enter` follows
    them (a path in a string too: an import's is worth following), and they count as backlinks
    of what they name.
- **Editing and saving** work as for notes: the same undo, saves, autosave and conflict prompt; an
  agent's change to an open file reloads it.
- **What lists them.** The explorer and the switcher show what `files.show` says (`notes`,
  `renderable` — notes and data files, the default — or `all` text files), plus `files.include`
  patterns, minus `files.exclude`; the explorer's `a` toggles to all and back. The explorer, the
  tabs and the history show every name with its extension (the switcher lists paths), notes' too
  (`home.md`, `halley.toml`): the formats sit side by side, and the extension says which is which.
  Folders show whether or not anything in them is listed, so a new or empty one is there to open and
  create in.
- **New notes and folders** (`ctrl+n`, `space n n`, `:new`; `space d n`, `:mkdir`; `n` and `shift+n` in
  the explorer): a name, from the current note's folder — or the explorer's selected folder when it
  has focus, or the vault's root with a leading `/` — and folders on the way are made. `.md` is added
  unless the name has a known extension (`.toml`, `.py`…). A note starts with its title (`# Name`),
  opens, and is typed into on the line after the blank one; an
  existing file just opens. Nothing is made outside the vault, through a symlink or otherwise.
  **A name another note has** (`17.5`) would make `[[name]]` reach either: the prompt comes back
  with a distinct one from the new note's folder (`projects-alpha`, then `-2`…), and says where the
  other is; typing the name again makes it anyway — a suggestion, not a rule.

## Editing (plans `4.3`, `4.4`, `4.5`; phase 3 step 3)

Editing is in source mode: `i`, `a`, `o` and their capitals (in [keymap.md](keymap.md)) start
typing, switching a rendered window to source first. The buffer's `source` is the truth; every
change is `NoteBuffer.edit`, one undo step each, except that an insert session (from `i` to `esc`)
is one step. The cursor is a place in the text found through the source layout's `srcMap`
(`editing.ts`), so tabs, wide characters and wrapped rows edit exactly where they show.

**Normal mode** in source is vim-shaped (`vim.ts`): counts, operators (`d` `c` `y` `>` `<`) that
wait for a motion or a text object, a register, and `.`. Each operator and edit is a named command
in `[keys.source]`; what follows an operator is read the way which-key reads a prefix: a motion is
any cursor command the keymap resolves (run with the cursor put back after, its range taken as
text offsets), a text object is found in the text itself; `gn` is the search's next match in the
text (`replacing.ts` finds it with the window's find toggles). `.` replays the keys of the last
change, the keys typed in the insert session it started included (`insertRecord`), a paste as a key
of its own, so anything that changed the text repeats exactly — `cgn` then `.` walks the matches. A
visual-mode change repeats on as much text from the cursor, as in vim (`V`, `j`s and the operator;
`v`, `l`s and the operator on one line); one across lines of characters can't be said in keys, and
`.` then has nothing to repeat rather than an older change. Keys are handled one at a time, in
order (`App.handleKey` queues them, a paste too), so a burst of typed keys or a paste never
interleaves with a command still running; `.`'s own replay runs inside its turn.

A changed note is **unsaved** until `:w` / `ctrl+s`: `• unsaved` by its path in the status line,
`•` on its tab; undoing back to the saved text makes it clean again. Saving goes through
`writeBuffer` (atomic, inside the vault) and keeps the file's BOM and line endings — a CRLF file
gets CRLF for new lines too; a file that isn't valid UTF-8 can't be edited or saved over. Parsing
waits until something needs it (the rendered view), so typing never re-parses the note; while it's
unsaved, source mode's outline comes from a quick scan of the text's headings.

**Outside changes and conflicts** (`4.5`, `5.5`–`5.7`). A clean note that changes on disk reloads,
and the reload is one more undo step: `u` brings back what was there before an agent rewrote it (and
`:e!`, dropping your changes, is undoable the same way). A note with unsaved changes that changes on
disk opens the **conflict prompt**, which each choice answers with its key. While you're typing (into
it or any note) it waits: a message says the file changed, and the prompt opens with the first key
after typing ends — not the `esc` itself, which a second `esc` closing the lens would answer — so
letters meant for the text never pick a choice.

- **(l) Load theirs** — the file's version; yours is one `u` away.
- **(k) Keep yours** — the status line says `⚠ differs from disk`; autosave stays off for it, and
  saving asks first (**y** write over it, **n** not now, **d** see the diff). `esc` does the same.
- **(d) Diff** — yours → theirs, `-` and `+` lines with context; closing it returns to the prompt.
- **(m) Merge** — a three-way merge by lines against the version you started from (`core/merge.ts`):
  what only one side changed is taken, the same change once, and different changes to the same
  lines are marked `<<<<<<< yours` / `=======` / `>>>>>>> theirs` (with the note's own line endings).
  The result is unsaved (one undo step); the file is theirs now, so `:w` writes it without asking.
  Autosave never writes the markers: with conflicts marked, it stays off until you save.

`space n c` reopens the prompt. When a list or prompt is already open, a message says so instead.
`:w` on a note whose file changed since it was loaded opens the prompt rather than writing over it;
`:w!` writes over it.

**Autosave** (`4.7`, `5.6`, `5.10`): a changed note is saved after `[editor] autosave_ms` (30 s;
`0` turns it off) without a key pressed — not while you're in insert mode, not after (k) Keep yours
until a saved, confirmed write, not over a file changed on disk (the conflict prompt comes instead),
not with a merge's conflict markers in it, and not while git holds its `index.lock` (a commit in
progress: it tries again later; in a worktree or submodule, the lock in the git directory its
`.git` file names). **Hand-offs
save first** (`4.10`): `space n e`, `space n s` and a capture into an open scratch write unsaved
changes before the other side reads the file.

Quitting with unsaved changes is refused (`:q!` quits anyway); a signal still quits.

## External changes (plans `5.1`–`5.4`)

The watcher subscribes to exactly the directories the walk includes: one non-recursive watch per
directory, sharing the walk's `WalkFilter` (decision `0.11`). Events are debounced
(`watch.debounce_ms`) and settled by `stat`.

- **Changed:** a note without unsaved changes reloads silently (plan `5.3`), as one more undo
  step. Its anchors keep your place, and the change is surfaced at once with `↻ reloaded` and a
  message (plan `5.4`). Other open notes re-lay out only if they link to it. A note with unsaved
  changes opens the conflict prompt instead ("Writing notes").
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

The tick runs every `watch.poll_ms`, and every 15th tick sweeps all known notes. A change counts
when a note's mtime or size differs, so a rewrite in the same second is still seen. Attachments (any
non-note file but editors' temporary files) are reported too, re-laying out only when the attachment
index actually changes, so `![[image.png]]` embeds change status as images come and go; a note that
appears or grows larger than `walk.max_file_size` is skipped (and dropped from the index), as the
walk would. Events come coalesced (a burst of writes in one folder may report one file), so a
batch also re-stats the known notes in each folder that had events. The TUI's own writes (notes,
the scratch) are ignored once, then forgotten, and only while the file still has the stamp (mtime
and size) the write left: an agent's write landing right after a save is a change, not ours.

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

## Known limits

- **A change of width re-wraps a whole note** (plan `15.1`): dragging a border, resize mode,
  toggling a pane, zen, wrap or line numbers, a terminal resize — about 12 ms for a thousand-line
  note and 180 ms for twenty thousand. A buffer keeps its last six widths, so going back and forth
  is cached. Edits, reloads and leaving the lens reuse what didn't change (the parse by chunk, the
  render by block, source mode by line: [architecture.md](architecture.md), "Big notes").
- **Pathological nesting parses slowly** (future optimization: plan `15.2`). A list nested
  hundreds of levels deep takes seconds in the markdown parser, on the main thread.

## Parity with the CLI

Every command is declared in `core/command-specs.ts` with the CLI invocation that reaches the
same state change, or marked as an interaction: cursor, scrolling, selection, focus, panes,
overlays. Tests fail when a command is implemented without a spec or specified without an
implementation. See [cli.md](cli.md).
