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
| `completion.ts` | completion while typing, signature help (`19.16`); a link's target completed by slipbox (`21.5`) |
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
 READ  notes/alpha.md ↻ reloaded  ● watching  → beta.md (resolved)  L12:7 40%  ← status line
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

**The terminal's title** is `slipbox — <the file on screen>` (its path in its root), else the
folder open in its place: told when it changes, its control characters stripped.

**The top bar** has buttons and the root's state. It sits on the page's
background like the rest, so the frame's rule under it gives it the same half row of air the tab
strip and the titles get from theirs:

- on the left, the `slipbox` chip (plain accent text), which opens the command palette; before
  it, without the left rail, the explorer's `≡`;
- at the right end, the root's state (`indexing N…`), dropped when fewer than 12 columns are left. The root (by
  name or path) and its branch are the status line's (`20.14`, `21.9`); a plain folder's, its path (`20.22`).

Toggle buttons have no fill of their own: their glyph is dim (`topbar_button`) while the pane is
closed and bright (`topbar_button_on`) while it is open. `ui.top_bar = false` removes the bar, as
do `space u b` and "Top bar" in the UI settings (`space u u`, remembered like the other settings; the note gains
its row, `:` still opens the palette, and the indexing state isn't shown); zen mode hides it too.

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

**Pinned tabs** (`ctrl+t m`, `space t m`, `:tabpin`) keep together at the left of the strip, in the order
they were pinned; moving a tab (keys or a drag) stays inside its group. A pinned tab keeps its note:
whatever would open over it — a link, `ctrl+p`, `:e`, the explorer — opens in a new tab instead.
Close others and close all skip pinned tabs (`ctrl+t q` closes one, being about that tab), and the
session keeps them.

**The status line** is about the file. From left to right:

- a mode chip: `READ`, `SOURCE`, `LENS`, `INSERT`, `VISUAL`, `V-LINE`, `FILES` (the explorer or the
  history), `PROBLEMS` (the bottom panel), `OUTLINE`, `FOOTNOTES`, `INFO` (the right panel's views), `RESIZE`, or what's
  pending: keys of a sequence in short form (`␣ l`,
  `C-w`), or an operator, a count, or a key waiting for its character (`2d`, `di`, `dT`, `r`, `2f`);
- where the file is, and its branch (`20.14`, `21.9`), dimmed: the root's name if it has one, else its path, else the
  folder opened — `research · main`, `~/src/experiment · main` (no remote), `notes`, `~/scratch` — and the branch
  checked out now (a detached head: its commit); a named worktree as `research@refactor`. At most 40 columns, a path
  cut from the front to fit; it's the first to go when the path would be left fewer than 24 columns;
- the note's path between back and forward, as an address bar's: `‹ notes/people/kenji-mori.md ›`. `‹` and `›` go
  back and forward in the focused window's history, each bright when there's somewhere to go, dim when not; hovered,
  one says where, above it (`back: home.md › Start here`; back past the root's first place, the root before). A click
  on the path opens the window's history above it, as a browser shows it: **Copy path** first (its absolute path;
  `y p` too), then the places — forward ones on top, the current one marked `●`, back ones under it, each its path
  and heading; a click or `enter` goes there (several steps at once). Cut from the front when short of room, so the
  note's own name stays; the arrows go only with it;
- a marker: `• unsaved`, `• unsaved ⚠ differs from disk` (after keeping yours in a conflict),
  `↻ reloaded` after an external change, or `✖ deleted on disk` — in symbols only (`• ⚠`) on a
  narrow screen, so the path and the position keep their room; then how many problems the file has of each severity
  (`✖ 1  ⚠ 3`; see "Problems where they are") — never what one says, which is the Problems panel's — clicked, the
  Problems panel on This file; with none, the panel's button, dim (`⚠ 0`; Nerd: an alert in a circle; ascii `!`),
  which opens it on All;
- whether external changes will show up: `● watching` (with a count of polled directories, if
  any), `⚠ not watching` when the watcher failed, `○ not watching` when it is off. It is
  dropped when the line is too short.

On the right it shows the link under the cursor and its status (`→ beta.md (resolved)`) in the rendered view
(in source mode and the lens the row is the link's own text, so none is named), then
the note's words (`1,234 words`; the selection's in visual mode, `12 words selected`; frontmatter
not counted, each Han or kana character a word; dropped first when short of room), then
`tab N/M` when there are two or more tabs, then `L<source line>:<column>` and the percentage (`all`
when the note fits), which always shows — the source line of the text under the cursor (a rendered paragraph's row
holds several). Find's progress is in its window's find row, not here.

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
- **Tab:** one window, or two in a split, with an orientation (side by side, or stacked) and a ratio (the first window's
  share). `ctrl+t c` (`tab.new`) in a split moves this window out into a tab of its own, the split gone; with one
  window, it opens its note in a new tab. Resize mode (`space w r`, or a `ctrl+w` step) changes the ratio, or the
  explorer or outline width, or the Problems panel's height, when one is focused, and all of it is kept in the session.
  Side by side falls back to stacked below 80 content columns (a fixed width, not `ui.narrow_width`), and a stacked
  split too short for two windows (under 6 rows) shows only the active one. With a split, each window names its note on
  its breadcrumb row, bright in the active window. Pane widths stay between 12 columns and half the terminal, and
  together leave the note at least 24; a split's ratio stays between 15% and 85%.

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
- **Each branch's tabs** (`5.9`): in a git checkout the session keeps the tabs each branch had when it was left (the
  30 left most recently). Started on a branch, slipbox opens its tabs; a switch to another branch while it runs
  brings that branch's back — unless a note is unsaved, which stays open (said so). A branch it has none for keeps
  what's open.

## History (plan `3.6`)

Each window has back and forward stacks of `{note, top, cursor}`, 200 deep, kept in the session (50
each way) so they go on after a restart. Following a link, jumping to a heading and opening a note
all push onto them. The history list (`space h h`) shows the whole timeline and jumps anywhere in
it, and under it the notes read lately in other tabs and sessions: a note opened in a tab of its own
starts a timeline of its own, and is still found there. The status line's `‹` `›`, around the path, are back and
forward with the mouse; the path, clicked, lists the window's timeline (see the status line, above).

## Switching roots (plans `17.10`, `17.14`, `21.10`)

The TUI is always in one root: a folder holding a root marker, or a plain folder outside every root — known by its
path, walked and indexed as a root is, its session its own (`20.22`, `21.8`); `~` and `/` are listed a level at a
time. **Opening a note of another root switches to it** — following a path out of the root, a pointer, a backlink
from another root, a named folder picked from `:folders` or a root from the explorer: the TUI becomes that root's,
as if started there — its config, its
index (refreshed), its watcher, its reading positions and its session, whose tabs come back, with
the note open (at its heading). Leaving saves the one before as quitting does. **Refused while a
note is unsaved** (`unsaved: … — save (:wa) or revert before leaving`): it would be left behind. The properties
editor closes first, writing its edits into the note — or, while it asks (they don't parse, or changed meanwhile),
nothing switches. A loose file opens as it is, beside the current root's notes: it has no root to switch into.

**Back returns.** `back` (`ctrl+o`) from the first place in a root goes to the root before, at
the note and place you left; each switch is remembered, so a chain of them unwinds one by one.

**The named folders** (`space v v`, `:folders`, `folders.open`; `slipbox folders`): each by the name pointers give it
(`21.6`) and the copy its links open here, those seen last first; `enter` goes into that copy. A repository's worktrees
are its branches, not copies: listed once. **Which copy** a folder's links open (`space v shift+v`, `:folders-default`,
`folders.default`; `slipbox folders default`): this folder's copies, else a pick of the folders with two. **Names**
here, in the status line, `space v i`, the Info view and messages are each root's name as pointers give it — its
`.slipbox/` name, else its repository's remote's — else its path (`~/…`); a named worktree as `name@branch` (`21.9`).

**The background auto-index** (`20.9`): while nobody is working — no key or click for `index.idle_seconds`, no CLI
command from an agent as long, this root's own index done — the TUI walks the home folder for roots a slice at a
time and indexes each, so backlinks from roots never opened appear by themselves. Its place is kept: it resumes
where it stopped, and a pass done, the next is a day later. `[index] background = false` turns it off;
`slipbox index --home` runs it now.

**Moves made elsewhere** (`21.11`): an editor, a file manager or an agent moving notes — seen by their text as they go
and come in one batch of the watcher's — broke links that pointed where they were: the relink is offered once for the
batch, its preview open (`old/plan.md moved to new/plan.md: 1 line of links broke — the relink, to look over`), nothing
written unasked; typing, or with something else open, it's a message instead. **A folder named the old way**
(`[[research:x]]`, `[t](research:x.md)`, when a folder this machine knows has that name) is no link: followed, it says
so, with the pointer that is one; `space c a` writes it (a markdown link, its heading or block kept).

**A named folder moved by hand** (`21.8`): opened where it went — its id or remote at a new path, the one copy that
was elsewhere gone — its session, scratch, trash and reading positions come along, nothing asked; a message says so
("`<name>` moved here from `<path>`: …came along"), and if the move broke links in or out of it, their fix is
previewed at once (`relink`'s, `20.17`). A worktree `git worktree move` took elsewhere is found by git's name for it.
Anything less sure — an unnamed root, two copies gone — starts fresh.
**A second copy of a named folder** (`21.6`, `core/folders.ts`): opened where another copy of it is here too — one
`.slipbox/` id, or one remote — the TUI asks once "`<name>`: 2 copies on this machine — which do links to it open?",
the first found marked `links open it now`; the answer is remembered, and `esc` keeps the first, not asking again. A
copy gone (moved here, a drive unplugged) is no choice: not asked.
**The launcher:** slipbox opened on a plain folder without a file (`slipbox ~`) shows the named folders at once, over
the folder's explorer, when there are any to go into.

**A git repository is a root by itself** (`20.3`), and so are an Obsidian vault and a zk notebook (`21.1`): any folder
holding a root marker (`walk.root_markers`). Opening a file in a repository opens the repository, from its top —
nothing asked, nothing written into it; a repository inside a root is a root of its own, its folder marked in the
explorer. `.slipbox/` gives one settings of its own (`slipbox init`; `--private` keeps it out of git), and a name
pointers use when asked (`slipbox init --name`, `space v n`, `:name`). `space v m` (`:init`, `vault.init`) in a plain
folder gives it `.slipbox/` — "`<folder>` is a folder without .slipbox/ — give it one?" — committed with it like any
file; the TUI goes into it with the note open.

## Renames (plans `17.15`, `7.1`–`7.4`)

`space n m` (`:rename <path>`, `:mv`) asks for the note's new path, the old one typed already; the explorer's `r` for
the selected note's, file's or folder's new name, `m` for a folder to move it to (18.x, below); `space v n` for the
root's new name; `space n h` for a new name of the heading the cursor is under (the outline's `r`, its selected
heading's; `11.9`); `space l r` (`:relink`) relinks this note's links broken by a move it saw (`20.2`);
`:convert-links` (`20.1`) makes every note's links plain paths (`:convert-links <note>`, one note's) — each link several
notes answer to a row of its own at the top, `pick notes/x.md:3`: `enter` lists its notes, and the one picked comes back
as part of the preview. Each shows its **preview** first: a list of every line it changes, in every root
(`notes/index.md:3 [plan](plan.md) → [plan](roadmap.md)`), with the git trees that already have changes and the links
skipped at the top; `enter` carries it out, `esc` leaves everything as it was. What it does is `slipbox mv`'s,
`name`'s, `rename-heading`'s, `relink`'s and `convert-links`'s (`docs/design/cli.md`, "Renames"). **Refused
while a file it rewrites or moves is unsaved** (a moved folder's notes included). After it, the open notes it changed
are reloaded, and a window on a renamed or moved note shows it under its new path, its history following — every note
of a moved folder alike.

**Undo** (`7.4`): `space v shift+u` (the explorer's `shift+u`, `:undo-rename`) takes back the root's last rename, move,
naming, heading rename, relink, conversion to path links or replace in every note — made here or by the CLI
(`slipbox mv`, `name`, `rename-heading`, `relink`, `convert-links`, `replace --all`) — as `slipbox undo` does
(`docs/design/cli.md`, "Renames"): its preview first (`undo: notes/first.md → notes/alpha.md`, each line the other way),
then every file as it was and what moved back where it was, open notes following it back. Refused when a file it wrote
has changed since. `u` puts back a delete; `shift+u` a rename.

## Files in the explorer (plans `18.1`–`18.10`)

The explorer makes and changes files by keys and by buttons, on the selected row — a note, a file, or a folder:

- **New:** `n` a note (`space n n` too, as everywhere), `shift+n` a folder, in the selected folder or beside the
  selected file; the title's two buttons do the same (Nerd: a file and a folder with a plus; unicode `+`, `+▸`).
  which-key in a pane names its actions as help does ("New note here"), and a pane's own key sequence waits for its
  second key, whatever the note binds its first to.
- **Rename (`r`) and move (`m`):** `r` asks for the new name, in its folder (the old one typed); `m` picks a folder
  from a **tree** of the root's (`18.8`): the root first, each folder folded or unfolded as the explorer has it
  (whether or not it holds folders), the folder it's in unfolded and selected (marked `here`); `←` / `→` fold and
  unfold; typing filters to the matching folders under their parents,
  all unfolded, `enter` taking the first match. A folder being moved, and what's in it, isn't offered. Both go through
  the rename's **preview** above: every link to it — and, for a folder, to anything in it — fixed, links between notes
  that move together left as they are, what the walk doesn't list (pictures, hidden files) moving with its folder.
- **Delete (`d`):** asks first (a yes-or-no question: `y`), saying how many links from other notes will break, then
  moves it to the root's **trash** (in its state, never in the folder). `u` puts back what was deleted last;
  `space v t` (`:trash`) lists the trash, `enter` restoring an item — refused when something is at its place again. An
  open note deleted shows its last text, marked deleted; restored, it's reloaded. Refused while a note it takes is
  unsaved.
- **Copy, cut, paste (`y`, `x`, `p`):** `p` pastes into the selected folder (or beside the selected file): a copy —
  `name-copy`, `-2`… when pasted beside the original, the copy's links as written — or what was cut, moved (the
  preview, links fixed). Going into another root forgets what was copied or cut, and `u`'s last delete.
- **The selected row's menu:** while the explorer has focus, the selected row has one button at its end, under the
  title's buttons: `…` (Nerd: three dots; ascii `...`). It opens a menu hanging from it (`.` opens it by key, from the
  row), titled with the row's name, each entry with its key in the explorer, which picks it there too: for a folder
  "New note here" and "New folder here", then "Rename", "Move to…", "Copy", "Cut", for a folder "Give it .slipbox/" (a
  nested root's: "Make it a plain folder"), "Paste … here" (when something is copied or cut), "Delete" (a nested
  root's: "Delete the root"). `enter` or a click does the selected one; `esc` or a click outside closes it. A name that
  doesn't fit beside the button widens the tree: the explorer's horizontal scrollbar appears, and scrolled to its end
  the name ends just before it.
- **A nested root's row** (`18.7`) is a folder of this root: `r` renames its folder and `m` moves it — links into it
  by path fixed here and in the roots that reach it, its own relative links out fixed, its id and name kept (it's
  recorded at its new place); `d` deletes it whole, saying so ("the root outreach (outreach/, 12 notes)") with the
  links into it — by path or by its name — that break. Its menu has "Rename the folder" and, beside it, "Name it"
  (`shift+r`, `R` in the menu): `slipbox name` for it, its folder left where it is.
- **A folder made a root, and back** (`18.11`): `v` on a folder asks for the new root's name (a distinct one typed:
  `halden-logs` for `logs/`), then a preview — links are paths (`20.2`): relative and filesystem ones reach across
  the new boundary as they are, and one written from the root (`/…`) that would now mean the other root is rewritten
  to reach what it did, shown there — a wikilink by a name across the boundary, or by a path from the root, too
  (`21.3`) — as `slipbox init <folder>` does (`docs/design/cli.md`); enter makes it.
  `shift+v` on a nested root's row previews the way back (such links rewritten the other way), and enter puts its
  `.slipbox/` in the trash. The row turns
  into a root's or a folder's, selected. In a plain folder, `v` offers to make the folder a root of its own and goes
  into it.

Every one of these has a leader key too, so which-key lists them (`18.13`): `space n` for a note (rename or move by
path, move, delete, copy, cut, `shift+y` a copy beside it), `space d` for a folder (new, rename, move, delete, copy,
cut, paste), `space v` for a root (make one, make it a plain folder, rename it, the trash, restore). With the explorer
focused they act on its selected row, elsewhere on the current note, its folder, or this root — made a plain folder,
it's left for the root holding it, the note still open. What they do is the CLI's `rm`, `mv`, `cp`, `init` and
`deinit` (`docs/design/cli.md`).

## Following links

Each kind of link does something different when followed:

| Link | Following it |
| --- | --- |
| `[t](note.md)`, `[t](note.md#heading)` | opens the note, at the heading (by its slug or text) |
| `[t](#frag)` | jumps within the note |
| `[t](/docs/plan.md)` | from the nearest root (`21.2`); the root holding nothing there, the filesystem's path |
| `[t](plan)`, no extension | the file as written, else the note `plan.md`, else the folder (zk's links, `21.2`) |
| `[t](docs/)`, a folder | revealed in the explorer, unfolded and focused (one elsewhere: in its own root) |
| `[t](not-yet.md)`, `[t](not-yet)`, a note not written yet | the new-note prompt, its name typed: `enter` makes it |
| a broken link whose file moved | says where it went (`17.12`): `space l r` relinks it — a move never resolves it |
| `[t](../other/x.md)` | opens the note in the other root (`17.9`) |
| `[t](slipbox://notes/x.md#h)` | its folder's copy here (`21.7`), at the heading; not here: said; two: picked |
| `[t](slipbox://kestrel@agent/x.md)` | that branch's checkout or worktree; else git's file, read-only, `#h` unchecked |
| `[[name]]`, `[[name#h]]`, `![[dal.png]]` | within its root (`21.3`): name, path or alias; a tie lists them |
| `[t](other.md#frag)` | opens relative to the note; `#^id` at the block (`20.1`); a bad `%` read as written |
| `[t](n.md#setup-1)` | the second "Setup" (GitHub's numbering); an id first (`{#id}`, `<a id>`), then text |
| `[[n#Setup]]`, `[[n#Install#Linux]]` | the heading by its text (several: the first, said); a path of headings |
| `[t](run.py#L42)`, `#L42-L50`, `#L42C5-L45C10` | opens the file at line 42 (as in a code comment's `run.py:42`) |
| `https://github.com/me/repo/blob/main/x.md` | this repository's own: the file in this copy (a backlink); else a URL |
| `https://…` | copies the URL; opening a browser over SSH would be wrong |
| `file://…`, `~/x.md`, `/home/me/x.md` (nothing there in the root) | opens the file, in whichever root holds it |
| attachment `![x](x.png)` | copies the path (drawn under its link where the terminal draws images, 12.x) |
| a picture online `![x](https://…)` | `images_remote = "ask"`: fetch it — this once, or its site — then drawn (12.12) |
| footnote `[1]` | jumps to the definition |
| tag `#dome/shutter` | lists the notes with the tag (its nested ones too, `#dome/shutter/…`); enter opens one |

**Tags** (`1.6`): `space f t` (`:tags`) lists the root's tags, each with how many notes carry it — a nested tag
indented under its parent, whose count includes its children's — and picking one lists its notes; `:tag name` goes
straight there. A note's tags are its frontmatter's `tags:` and the `#tags` in its text (`docs/design/rendering.md`).

**Writing a link** (`21.5`): `space l i` (`:link`) lists this root's notes and files, the note itself not, and
writes a link to the one picked as the root's convention writes one (`21.4`; `slipbox link`) — a markdown link with
the note's title as its text, or a wikilink by name where the name reaches the note from here, else by its path
from the root — a top-level note's path being its name, a relative path (`../plan`). Typing, it goes at the cursor;
reading, after the word under the cursor (out of a link or a code span), a space before it, saved at once. Not in a
data or text file: links are written in a root's notes.

**How a link landed** (trailscout's review, 2026-10-06): the status line's link under the cursor says it when a tie
decided it — `→ [[Pie]] (resolved, the shortest path of 2 named so)`; and a note coming or going that sends a link by
name elsewhere (a nearer `Pie.md`, a note named like an alias) is said in a message: `[[Pie]] in Home.md reaches
Pie.md now, not Recipes/Baking/Pie.md` — never only when a link breaks or heals.

A link landing on a line (`#L42`, a block's `^id`, a problem, a search hit) lands where that line is shown: in the
rendered view, a line inside a paragraph that wraps lands on the paragraph, not the block after. The backlinks list
shows a link from another root by its path (`21.9`): from home (`~/app/design/plan.md`), else absolute.

`enter` follows the link under the cursor, or else the row's first link; `ctrl+enter` (`space l t`) follows it into
a new tab, as a browser's ctrl+click does, and `ctrl+w f` (`space l s`) into the split. In source mode and inside
the lens, where rows are the markdown itself, `enter` and `space l f` / `s` read the link around the
cursor from the text (`[text](url)`, `![alt](path)`, `[[name]]`, `21.3`); in a text file, a URL or a path naming a
file of the root (`16.10`); a click there places the cursor for editing. A click follows a link
only when it lands on the link: blank space past a row's end or below the note, which the cursor is
clamped from, follows nothing.

The explorer's and the outline's selections stay on the note or heading they select when an agent
adds or removes notes or headings (a selection is kept by what it is, not its row). A reading
position under a repeated heading (a log's `## Weather` entries) keeps its entry when one is
prepended: the anchor also records the heading's occurrence counted from the bottom and the row's
text, and keeps whichever count still finds that text.

## Side panes: explorer (plan `3.7`), history, Info, outline and footnotes

Each side has one panel, which shows one of its views at a time; its rail has a button per view,
bright while that view shows. Clicking a view's button shows the panel on it (and focuses it), or
hides the panel when that view already shows. Each view keeps its own position while another shows
(selection, scroll, sideways offset and filter text) and gets it back when it returns; on its first
showing the explorer reveals the current note and the history selects `here`. The views are a
registry (`LEFT_VIEWS`,
`RIGHT_VIEWS` in `app.ts`) and more will come on both sides, each with its own rows, drawing and
keys.

- **Explorer (left, `≡`):** the walked notes as a tree, directories first, from the folder slipbox was opened on (the
  root's, or a folder of it), with the files `files.show` lists beside them — by default (`auto`) every text file in a
  repository, where code lives, and the data files (JSON, YAML, TOML, INI, CSV) in a notes root (one with `.slipbox/`),
  shown with their extension and their own icon; `a` toggles to every text file and back (`16.5`, "Files beyond notes"
  below). **`..`** on top, roots included (`17.14`): `enter` moves the explorer up a folder — no fence at the root.
  Above the root, a folder is listed a level at a time, never walked (`~` and `/` too; nothing is above `/`): its
  folders, then its files; the root open among them, marked (`sidebar_active`) and unfolded, its tree under it (`h` /
  `l` fold and unfold it; `enter` takes the explorer back down to it); another root by its icon and name, unfolding like
  a folder. A file there opens as a link to it does: in its own root, switching into it — the explorer staying where it
  was, the new root unfolded in it — or, outside every root, beside this one. None of this root's file operations act on
  the rows above it. Moving the selection, or a click on a note, only selects. `enter`, `l` and a double-click open the
  note as a tab, or switch to the tab already showing it; `o` replaces the current window's note, and `s` opens it in
  the split's other window. A click on a folder folds or unfolds it. New notes and folders, renames, moves, deletes,
  copies: "Files in the explorer", below. **A folder that is another root** (`17.13`), nested in this one (`◈`, Nerd: a
  bookshelf), in a folder's blue (role `sidebar_vault`, for `[colors]` to set), is a row of its own, its icon telling it
  from a folder, the root's name dimmed after the folder's when they differ (cut short of its git mark) — a worktree's
  branch instead (`⎇ feat`, `17.19`); `enter` or a double-click goes into it (a switch, below). **In a plain folder**
  (`20.22`) the explorer is its tree, as a root's is; in `~` or `/`, listed a level at a time, each folder in it is a
  row to go into — a root or a plain folder. **The explorer's roots** (`20.15`, `21.9`): under the root open, the other
  roots, each by its name (`◈`), else its path: the root or folder slipbox was opened on, the roots pinned with
  `:pin-root` (`vault.pin_root`, kept with the opened root's state), and the folder of a file open beside this root — a
  loose file a link was followed to, its nearest root else its folder — while one of its files is shown (never the
  scratch's, which lives in slipbox's state folder). A root followed into by a link is the root open while it is, the
  opened one beside it; left, it goes unless pinned. `enter` on another root unfolds it — its notes and files as its
  index has them — `h` folds it again, and a file of it opens there (a switch); a plain folder among them (a loose
  file's) has no index to show, so `enter` goes into it instead (a switch). None of this root's file operations act on
  their rows (a paste, new note or new folder there says `another root's folder: select a folder of this root`). Roots
  never overlap: one inside the root open, or around it, isn't listed apart — its folder is in the tree, or the tree is
  in it. **Git's marks** (`5.11`): in a git checkout each changed file has its state at its row's end — `M` modified,
  `+` new (untracked or added), `R` renamed, `!` in a merge's conflict (`git_modified`, `git_new`, `git_conflict`) — and
  a folder with one in it a `•`. git is asked in the background, a moment after anything changed (a save, the watcher, a
  file operation, a branch switch, a switch of roots — which drops the old root's marks at once).
- **History (left, `◷`, `space h h`):** the active window's timeline, newest first: each place's
  note name and line, the current one marked `here` and selected when the view opens. A click
  selects an entry; `enter` or a double-click jumps there, the places before it becoming back and
  those after it forward. Under it, **recent here**: the notes read in other windows and
  tabs and in earlier sessions — every note with a reading position (`slipbox history`'s list),
  and every open tab's — not already in the timeline, newest first, up to `ui.history_limit` (100;
  0 lists none): each with when (the time today, else the day), or `tab N` when it's open in
  another tab; `enter` opens one in this window. The heading is stepped over. The history never
  scrolls sideways: a name too long for the pane beside its hint is cut (`…`), the hint kept.
- **Filter (`/`, in the explorer, the history, the outline, Info and the footnotes; Problems' All tab, below):** a
  `› text` row at
  the top of the list, a rule under it (joined to the pane's border), then the list —
  while the pane has focus (otherwise `/` is find in the note); typing narrows the rows (`/`
  on a view that kept its filter resumes it). The explorer keeps the tree: the notes whose path
  matches, under their folders (all unfolded), the matched letters highlighted, the selection on the
  first note. The history keeps the entries whose path matches. The outline keeps the
  headings that match under their parents (folds ignored), the selection on the best match. Info keeps the rows
  whose name or value matches, under their sections, unfolded. The footnotes view keeps the footnotes whose label
  or text matches. The arrows and
  `ctrl+n` / `ctrl+p` move, `enter` or a click opens (in the explorer and the history, a
  double-click; the filter clears), `esc` clears it. `ctrl+p`
  stays the flat quick-open across the root.
- **Info (right, `3.19`):** what the file on screen is — the right panel's views all show that file, and follow it.
  Sections that fold (`h`/`l`): **File** (its path, the root it belongs to — none, in a plain folder — its kind, size,
  modified time, words and reading time, lines, encoding and line endings, saved or not), **Properties** (the
  frontmatter's keys and values, nested maps indented under their key), **Tags** (its own, frontmatter's and text's),
  **Links** (links and how many are unresolved, backlinks, headings, footnotes, tasks done; how links are written
  here, `21.4` — `writes`, its `path` and `.md`, then `from` what said them, or each part's source after it, `y`
  copying it whole). `enter` opens what
  a row names: a property's line in the frontmatter (source mode: its own line; rendered, the row that shows it), a
  tag's notes, the links or backlinks list, the outline or the footnotes view; any other row copies its value, as `y`
  does. The root's own information — its name and the other copies of it this machine knows (`21.6`), its notes,
  index (when it was written, what was reached outside the walk, `20.10`) and watcher, the background index of the
  home folder — is `space v i`'s window: a root isn't a file. Names are a column a third of the pane at most, values
  cut to it (no sideways scrolling). `/` filters (see Filter). `space n i`, the `ℹ` button, `slipbox stat` (its
  `root`, `name` and `properties` too). `e` edits the properties (below).
- **The properties editor** (`3.20`): `e` in the Info view, or `space n shift+p`, opens the note's frontmatter — YAML
  or TOML, as the note has it — in a floating window over the others: framed, titled "Properties — note (YAML)", as
  tall as its text. Inside is a window like any, in source mode, with every editing key there is; the keys and
  commands act on it while it's open. `esc` (in normal mode), `q` or `:q` close it, writing its text back when it
  changed, and a click outside its box does too (that click does nothing else: a tab or a pane under it isn't
  reached); `ctrl+s` (`:w`) writes it back and keeps it open, as does `:wa` (after a yes to a question below too).
  Quitting (`ctrl+q`, `:qa`, `:x`) closes
  it first, writing back — `:q!` doesn't. The write is one edit to the note — one undo step there — and the note is
  saved. A note without a frontmatter gets one first; an emptied one is removed. Text that doesn't parse asks before
  it's written (no keeps you editing, and the app open), as does a frontmatter changed in the note meanwhile.
  Following a link from inside it closes it first, as do a split and "in the split": they're of the window under it.
  A note deleted on disk, or not valid UTF-8, has no properties editor (nor is it written into, gone meanwhile), as
  typing into it is refused. Never a reading position, nor in the history.
- **Outline (right):** the current note's headings, indented, foldable (`h`/`l`). While not
  focused it follows the cursor's section, and `enter` jumps to the heading.
- **Footnotes (right, `3.17`):** the current note's footnotes, in the order the note first refers to them (as GFM
  numbers them), then the ones nothing refers to: `[label]` and the definition's text (the definition's label), and
  at the right how many references it has (`2×`), `unused`, or `no definition`. `l` unfolds a footnote into its
  references, each with its line and that line's text; `enter` (or a click) jumps to the definition or that
  reference — in a rendered window onto the reference or definition as drawn, in source mode to the text. While not
  focused it follows the cursor: the footnote the cursor's line refers to or defines. It never scrolls sideways: a
  long row is cut, so its count stays. `/` filters (see Filter). `space n f`, its button, `:footnotes`;
  `slipbox footnotes <note>` gives the same (`docs/design/cli.md`).
- **Adding and changing footnotes** (`3.18`): they're the note's own markdown, GFM's — `[^N]` where it's cited and
  `[^N]: text` at the end, as Obsidian writes them. `space n shift+f` (or `a` in the footnotes view, or the `+` on
  its title) asks the text in a question and adds both: `[^N]`, the next free number, after the word the cursor is
  on — while typing, at the cursor; in a rendered window, that word found in its paragraph's source (never inside a
  link's or code's syntax: after it); `[^N]: text` after the note's last definition when the note ends with them,
  else after a blank line. In the view, `e` edits a footnote's text (its definition becomes one line), `r` renames
  its label in every reference and its definition, `d` deletes both after asking. Each change is one undo step and
  is saved at once, as a task's tick is; the cursor stays where it was. A CRLF note's new lines are CRLF. A note
  deleted on disk, or not valid UTF-8, is refused (`… — not editing`), as typing into it is.

Each pane starts with its view's title ("Explorer", "History", "Info", "Outline", "Footnotes") and a blank row before the
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
  `◷` (ascii `~`), the panel opening beside it. Without it, `≡` is the top bar's and the history opens with
  `space h h`. (The Problems panel, at the bottom, opens from the status line.)
- **The right rail** runs from under the tab strip's rule, its first button level with the breadcrumb. It holds the
  right panel's views: the Info's `ℹ` (Nerd: an i in a circle; ascii `i`), under it the outline's `▤`, then the
  footnotes' superscript (Nerd: `x²`; unicode `¹`; ascii `^`); the panel opens beside it. Without it, `▤` sits at the
  breadcrumb's right end, and the Info and the footnotes open with `space n i` and `space n f`.

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
  `ctrl+p enter` goes back. A query starting with `#` (VS Code's) lists the workspace's symbols instead
  (`19.14`): in a code file, its servers' (`workspace/symbol`), asked as it's typed, each with its kind and
  `path:line`, the last query's answer the one shown; in a note, or where no server gives them, the root's
  headings, slipbox's own symbols. `enter` opens the file there. Find in every
  note (`ctrl+shift+f`, `space f g`) lists each line with the text or regex as `path:line` with the
  line, an open note searched as it is now. Its question takes the window's find toggles, said in it: `alt+r` and
  `alt+w` flip them there.
- **Replace in every note** (`25.4`; `ctrl+shift+h`, `space f shift+r`): what to find — the window's find, or a
  selection on one line, typed already — then what with, then the rename's preview of each line it changes in every
  note and every file the explorer shows (`slipbox replace --all`'s, `--files` as the explorer has them). `enter` does
  it, `esc` leaves everything; `space v shift+u` takes it back, as a rename. A match across lines is one row, each
  break a `⏎`. Refused while a file with a match is unsaved: what's open isn't what's on disk.
- **Search** (`6.5`, `6.9`; `space f s`, `:search words`): the root's notes ranked by the words as they're typed —
  as `slipbox search` ranks them (`docs/design/cli.md`, "Search") — each a row: `path:line`, the section's heading
  and the line, its words marked, `+n` for the file's other sections with some of them. `enter` opens it on that
  line (rendered, at the line's start; in source mode, on the word). The index is the app's to keep: opened (or made)
  as the root opens and brought up to the files in idle slices — the list says `the folder is being indexed: n of m
  files…` the first time, and fills when it's done — then each file again as the graph hears it change (a save here,
  the watcher, a rename, a CLI write). An unsaved note is searched as it's shown, in place of what the index has of
  it. Without an index (`~` or `/` opened as a plain folder, `[search] engine = "scan"`) the files are scanned, and
  the title says so.
  **By root** (`20.16`, `21.10`): `ctrl+a` widens it to the folders linked to or from this one, their hits under a
  `linked folders` divider as `path:line` (`21.9`: from home, else absolute); again, to every root this machine knows
  (`other folders`); again, back to this one. The title says which. `enter` on another root's hit goes into it, at
  that line.
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
[keymap.md](keymap.md) (`COMMAND_GROUPS` in `core/command-specs.ts`), in that document's order. Every command has a
group (a test checks it); one no group claims would still be listed, under "Other", last:

- **Help (`?`, `space ?`, `:help`)** is for learning the keys: every command with all its bindings (source
  mode's own, `[keys.source]`, and visual mode's included), then what
  works inside the explorer, inside the history, inside Problems, while filtering a panel, inside the outline,
  inside Info, inside the footnotes, in resize mode, and with the mouse. Filtering keeps the groups; `enter`
  runs a command (the other entries are reference only). Opened from a panel view or visual mode, it starts at
  that section ("Inside the explorer", "Inside the history", "Inside Problems", "Inside the outline", "Inside
  Info", "Inside the footnotes", "Selection & copy"), with its heading at the top. A new panel view gets its
  own section.
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
- source line numbers in a gutter (on by default)
- the problems bar, and the problems marked in the text (below, "Problems where they are") — the bar and the numbers
  on a shade of their own down the window (`gutter`, halfway from the page to the breadcrumb row's shade, the two
  framing the text), then a column of the page's before the text
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

The configuration reloads **by itself** when a config file is saved: the user file, the enclosing
roots' files (`20.7`) and the root's own are polled every second (or every `watch.poll_ms`, if that is
shorter). `space v c` (or `:config`) reloads on demand. A reload applies what changed, live:

- **keys, leader, aliases, groups:** keymaps rebuilt; unknown commands, unknown actions in
  `[keys.explorer]`, `[keys.outline]`, `[keys.footnotes]`, `[keys.info]` and `[keys.resize]`, and keys
  with an unknown modifier, are reported
- **theme, glyphs, UI defaults:** applied, replacing session overrides of the changed values; a
  changed `ui.split_ratio`, `ui.sidebar`, `ui.outline` or pane width resets the live value
- **`[colors]`:** re-applied to the current theme
- **render settings:** every note re-laid out
- **walk settings:** the root re-walked, re-indexed and re-watched
- **watch settings:** the watcher restarted

A broken file is reported in the message sink: a wrong value keeps its default and the rest of the
file applies; a file that doesn't parse at all keeps what it said before (its last good contents),
so a typo saved mid-edit changes nothing until it's fixed.

## Writing notes (phase 3)

Every write goes one way (`writeBuffer`): the file is replaced atomically (a temp file in the same
folder, then a rename) keeping its permissions; a symlinked note is written through to its target,
and a target outside the root is refused (`7.5`); the watcher is told the write is its own; the
buffer reloads, its windows keeping their anchors, so the cursor stays put.

**Task checkboxes** (`4.11`) are the first write. `ctrl+l` (`space n t`), or a click on the
checkbox, flips the task item holding the cursor — the innermost, from any of its rows — as a
one-byte edit to the file's bytes, so a BOM, CRLF endings and even invalid UTF-8 survive untouched.
If the file changed on disk since it was shown, it is reloaded instead and nothing is written (its
lines may have moved). With unsaved changes it flips the mark in the text on screen instead — an undo
step, left unsaved ("done ✓ (unsaved)") — never on disk under them.

**Handing off to another editor** (`4.1`, `4.2`, `4.12`) comes in two kinds, both opening the note at
the cursor's source line. `space n e` steps aside: the renderer suspends, the editor
(`[editor] command`, else `$VISUAL`, `$EDITOR`, `vi`, given `+line` or `file:line` when it's a
known editor) runs in this terminal, and when it exits slipbox resumes and reloads the note if it
changed. `space n s` sends the note to an editor already running elsewhere and doesn't wait; the
watcher shows its saves as they land. From the properties editor, either closes it first (its text written back)
and hands off its note at the top; from a hover, which isn't a file, nothing is handed off.

**The nvim preset** (`[editor] remote = ["nvim"]`, the default) finds that editor itself. Every
nvim since 0.9 listens on a socket in `$XDG_RUNTIME_DIR` (or `/tmp/nvim.$USER/…`), named `nvim.*`;
slipbox asks each for its working directory and current file, leaving out sockets nothing answers
on. The one picked before for this root is used while it answers (kept in the session); else the
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
the switch, and the outline and breadcrumb keep working. Their headings are the parse's while the
text is saved; while it's being edited they're scanned from the text, each ATX heading line read
the way the render reads it (a line with markup parsed alone), so their text and slugs — and a
`#fragment` followed from source mode — are the render's.

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
lens in normal mode, the block as written, and edit on their second press — as `esc esc` leaves, typing
first, then the lens; `space n l` (`:live`) opens it too. A yank isn't an edit: it goes on at once.
The chip reads `LENS` (`INSERT` while typing). `esc` from typing goes to normal mode with the lens
still open — the vim commands work on what's in it — and `esc` in normal mode closes it: everything
renders again. Reading, there is no lens and the keys are the reading keys. (With `edit_in =
"source"`, an editing key switches the window and edits at once: source mode has nothing to show
first.)

**Its tint.** The rows of markdown between the rules have a background of their own (`lens_band`, a
shade lighter than the page — a code block is darker), so the whole area reads as the lens, not
just its edges.

**Its counters.** The lens keeps a column of its own before its rows (four columns, on its tint): each row's distance
from the cursor's, the cursor's `0` in the current line's colour, the others in the lens's accent — every row a step of
`j` and `k` (a wrapped line's rows too), so vim's counts (`5j`, `d3k`) read off them. The cursor never stops there; the
gutter keeps the lines' own numbers, the lens's too. `[ui] relative_numbers = "off"`: no counters, no column.

**Its mode.** The top rule's label says which: `source · lines 8–13` while viewing (normal mode),
`editing · lines 8–13` while typing. Editing draws the rules and label in `lens_edit` (green where
viewing is the accent) and tints the rows `lens_band_edit`, so the two never look alike.

**Its air.** One blank row sits outside each rule: where the rendered row next to it is already
blank (the gap after a block), that's it; otherwise a blank frame row is added, so the lens never
touches a heading band, a table or a code block. Like the rules, these rows are frame rows.

**Its size by hand.** `+` takes the next block in (the one above, at the note's end), `-` drops the
block farthest from the cursor; the size it comes to is kept as the lens moves — it slides at that
size rather than growing, sections or not — until `=` lets it size itself again, or it closes.

**Its size.** It opens on the cursor's section whole when it fits within `[editor] lens_max` of the window (half): the
innermost one around the cursor — its heading and everything under it to the next heading of its level or higher, a
subsection with it — not padded. A section too tall for it, or text before the first heading, is its blocks: it opens on
the cursor's block and takes in the neighbours (below, then above) until it has `[editor] lens_min_rows` rows of
markdown (6), so a one-line paragraph isn't a sliver and small moves don't reshape it. It never splits a block. An edit
inside it (typing, `dd`, a replace) keeps its lines, grown or shrunk by the edit; typing that reaches past an edge (a
join at its last line, a backspace at its first) extends it to the cursor, so the cursor always sits on a source row and
an edit goes where you see it. A change from elsewhere while you aren't typing (an agent's write, a `:%s`) reopens it on
the cursor's block at its opening size, never stretched by the lines the change added. The cursor placed on a line
outside it (`cgn`, `n`, undo) moves it there first.

**Moving while it's open.** The cursor stays in it. Moving inside changes nothing; moving past an edge into a section
that fits moves it to that section whole, and elsewhere brings the next block in, dropping the far ones once it's taller
than `[editor] lens_max` of the window (half); a jump (`g g`, `shift+g`, a search, `n`, the outline) moves it to the
block landed on. It keeps its height on screen: when it moves or grows, the page scrolls under it, so your eyes stay in
one place. A click in the rendered text outside it moves it there, the clicked line staying under the pointer (the
lens's height on screen is the keyboard's rule; a click keeps what you clicked); the wheel scrolls the page freely, the
lens riding with its text. In insert mode the arrows stop at its rules.

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

**Another note in the window.** Following a link from the lens, or `ctrl+o` / `ctrl+i` to another note, keeps the
lens open on the new note's cursor block: the old note's render, size, place and inner scroll go with it
(`App.resetForBuffer`), so the window never shows one note while keys edit another.

## Files beyond notes (plan `16.x`)

slipbox opens any text file in the root, not only notes (`docs/idea.md`, "Files beyond
markdown"). `core/filetypes.ts` puts each file in a group by its name: **notes** (the root's
`walk.extensions`), **data** (JSON, YAML, TOML, INI, CSV/TSV), **text** (everything else: code,
logs, `.txt`), or **binary** (images, archives…, by extension — and a text-named file holding a NUL
in its first 8 KB), which never opens. Nor does a path in the root that a symlink leads out of: it isn't a file of
the root (the walk leaves it out, the CLI refuses it), so nothing outside is read through it.

A note is read by its format's reader (`core/readers.ts`, `16.2`): each parses into the same mdast
tree — so the index, the render, the lens and the outline work alike for every format — and says
what source mode reads off the raw lines: its headings and the link around the cursor. Markdown's is
the only one: Org and AsciiDoc readers were built and dropped (`16.16`, `16.17`; `docs/idea.md`), and
their files open as text.

- **Opening.** A data or text file opens from the explorer, `ctrl+p`, `:e path`, or a link to it
  (`[config](cfg/app.toml)`, `[run](run.py)`, `[editor](cfg/app.toml#editor)` at that section; binary links
  still copy their path). `:e path` opens a file written a moment ago too, before the watcher has told the index:
  the root learns of it then, as the watcher would have it — if the walk takes it. One git-ignored or under a
  hidden folder is reached (`20.8`): opened, and indexed from then on, as a link to it would; one in
  `node_modules` or `walk.exclude` isn't the root's, and isn't opened.
- **Data files open rendered** (`16.11`–`16.13`, [rendering.md](rendering.md), "Data files"), with
  source mode a key away and the lens editing a card at a time: in YAML and JSON a key with the
  plain values listed right under it (`defaults` and its settings), in TOML and INI one key — never
  padded with pieces of the next card, and moving to the next card rather than gathering them. A
  table's records are blocks of their own: in a CSV or TSV the lens is `lens_min_rows` records
  around the cursor, sliding a record at a time, never the whole table. A data file that doesn't
  parse opens in source mode, the error said each time it opens (a link, `:e`, history); one that
  stops parsing while edited goes there when insert mode ends (never mid-typing: an open quote is
  normal while a value is typed), and `space n v` renders it again once it parses (`16.14`).
- **Text files open in source mode**, highlighted by their language; no markdown headings are looked for in them. They
  have no rendered view: `space n v` and the lens say so and stay in source mode. A window that was in source mode only
  for such a file renders again when it opens a note (a link, `history.back`). **Code in a language the code view maps**
  (`24.x`: TypeScript, TSX, JavaScript, Python so far) opens as a notebook instead — its comments and documentation as
  prose, each definition a cell with buttons, its imports folded, every token as written — and `space n v` switches it
  to source mode and back; editing opens the lens on the cursor's line, doc comment or imports, or source mode
  (`[editor] edit_in`), as for a note. `[render] code = "source"` opens it in source mode as before.
  `docs/design/code-view.md` has the view.
- **Source code through tree-sitter** (`16.6`–`16.9`, `16.18`–`16.23`: TypeScript, TSX, JavaScript, Python, shell,
  Lua, Go, Rust, Swift, HTML, CSS, SCSS, PHP, Dockerfile, Vue, Svelte, Astro, Ruby, C, C++). Each language's grammar
  (the wasm from the language's own npm package, built for this runtime — `bunfig.toml` keeps their native install
  scripts off — or, where npm has none, built from its source into `grammars/`) loads the first time a file of it
  opens, never at start-up; until it lands, the file shows as any text file, and it draws again
  when it does. A parse runs at once on open and then 150 ms after typing pauses — never per key
  (tens of milliseconds for a 4,000-line file) — and the layout uses its last answer:
  - **Highlighting.** highlight.js still colours each line; tree-sitter adds what a line can't
    know alone, that it starts inside a string or comment opened above (a template string's middle
    lines, a docstring, a block comment).
  - **Outline and breadcrumb.** The file's definitions — functions, classes, methods, types,
    interfaces, enums, Rust's structs, traits, impls and modules; Swift's classes, structs, enums, extensions, actors
    and protocols (by their keyword); C's functions, prototypes, structs and typedefs, C++'s classes, namespaces and
    methods; Ruby's modules and `self.` methods; PHP's traits; a Dockerfile's stages (`build (node:22)`); a
    stylesheet's rules, `@media` and mixins; a page's headings (by their text) and its ids (`#about`) — as headings
    nested by where they sit, from a query per language. `space o`, `]]` and the breadcrumb use them as a note's.
  - **A file in several languages** (`16.22`). A page's `<script>` and `<style>`, a Vue, Svelte or Astro component's
    template, script and style, Astro's frontmatter: each part is parsed with its own grammar — `lang="ts"`, `lang="scss"`,
    an HTML script's `type` (JSON is highlighted, not parsed); Astro's scripts are TypeScript. Each part is an outline
    entry (`script setup lang="ts"`, `template`), its definitions under it; its lines are coloured in its language
    (the lines its tags are on, the page's); its strings, comments, links and syntax errors are where they are in the
    file. The grammars of a component's parts load with its own. A PHP file's HTML is coloured as HTML.
  - **Syntax errors** (syntax only: no types, no lint). Where the parser found an error or had to
    invent a missing token, the text is underlined (`syntax_error`), counted in the problems bar, and its line
    number is red when numbers show; the status line counts it (`✖ 1`), and the Problems panel's This file says
    what it is. Never during insert mode — a half-typed line is always broken — and only for
    the text as it is now: after an edit the marks come back when the new parse lands.
  - **Links in comments** (`16.10`): URLs, and paths with an extension that name a file of the
    root — relative to the file, then to its root, where a repo's paths start (a leading `/` too) —
    `path:42` at that line. No wikilinks: code has none. They're drawn as links, `enter` follows
    them (a path in a string too: an import's is worth following), and they count as backlinks
    of what they name — the root's code grammars load in the background as it opens (`20.19`), so they count
    before any code file is opened, and a rename or move rewrites them.
- **Editing and saving** work as for notes: the same undo, saves, autosave and conflict prompt; an
  agent's change to an open file reloads it.
- **What lists them.** The explorer and the switcher show what `files.show` says (`auto`, the default: `renderable` in
  a notes root — one with `.slipbox/` — and `all` elsewhere, a repository where code lives; `notes`; `renderable` —
  notes and data files; or `all` text files), plus `files.include`
  patterns, minus `files.exclude`; the explorer's `a` toggles to all and back. The explorer, the
  tabs and the history show every name with its extension (the switcher lists paths), notes' too
  (`home.md`, `halley.toml`): the formats sit side by side, and the extension says which is which.
  Folders show whether or not anything in them is listed, so a new or empty one is there to open and
  create in.
- **New notes and folders** (`ctrl+n`, `space n n`, `:new`; `space d n`, `:mkdir`; `n` and `shift+n` in
  the explorer): a name, from the current note's folder — or the explorer's selected folder when it
  has focus, or the root with a leading `/` — and folders on the way are made. `.md` is added
  unless the name has a known extension (`.toml`, `.py`…). A note starts with its title (`# Name`),
  opens, and is typed into on the line after the blank one; an
  existing file just opens. Nothing is made outside the root, through a symlink or otherwise. A note in a root
  nested in this one is made there and opens in that root; one under a folder the walk leaves out (`walk.exclude`)
  is made and opens, but isn't one of the root's notes (nor its folder one of its folders), as the walk would say.
  **A name another note has** (`17.5`) would make `[[name]]` reach either: the prompt comes back
  with a distinct one from the new note's folder (`projects-alpha`, then `-2`…), and says where the
  other is; typing the name again makes it anyway — a suggestion, not a rule.

## Editing (plans `4.3`, `4.4`, `4.5`; phase 3 step 3)

Editing is in source mode: `i`, `a`, `o` and their capitals (in [keymap.md](keymap.md)) start typing, switching a
rendered window to source first. A level of indentation is the file's (`25.1`): its `.editorconfig`, else its own lines,
else its language ([configuration.md](configuration.md), "Indentation"). `%` goes to the matching bracket
(`core/brackets.ts`, `25.3`): of its kind, the pairs nested between counted, across lines, by the text alone — a
bracket in a string or a comment counts too, as in vim. In source mode the bracket at the cursor and its match are
marked (`bracket_match`); while typing, the one just before the cursor. The buffer's `source` is the truth; every
change is `NoteBuffer.edit`, one undo step each, except that an insert session (from `i` to `esc`) is one step. The
cursor is a place in the text found through the source layout's `srcMap` (`editing.ts`), so tabs, wide characters and
wrapped rows edit exactly where they show.

**Normal mode** in source is vim-shaped (`vim.ts`): counts, operators (`d` `c` `y` `>` `<` `gc`) that wait for a motion
or a text object, a register, and `.`. Each operator and edit is a named command in `[keys.source]`; what follows an
operator is read the way which-key reads a prefix: a motion is any cursor command the keymap resolves (run with the
cursor put back after, its range taken as text offsets), a text object is found in the text itself; `gn` is the search's
next match in the text (`replacing.ts` finds it with the search's own flags, regex and whole words, as `n` has them:
after `*`, whole words only). `.` replays the keys of the last change, the keys typed in the insert session it started
included (`insertRecord`), a paste as a key of its own, so anything that changed the text repeats exactly — `cgn` then
`.` walks the matches. A visual-mode change repeats on as much text from the cursor, as in vim (`V`, `j`s and the
operator; `v`, `l`s and the operator on one line); one across lines of characters can't be said in keys, and `.` then
has nothing to repeat rather than an older change. Keys are handled one at a time, in order (`App.handleKey` queues
them, a paste too), so a burst of typed keys or a paste never interleaves with a command still running; `.`'s own replay
runs inside its turn.

A changed note is **unsaved** until `:w` / `ctrl+s`: `• unsaved` by its path in the status line,
`•` on its tab; undoing back to the saved text makes it clean again. Saving goes through
`writeBuffer` (atomic, inside the root) and keeps the file's BOM and line endings — a CRLF file
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
changes before the other side reads the file; `space s c` saves every unsaved note before it gathers the context
bundle (`9.7`), which it copies: the note, what it links to and what links to it, as `slipbox context` writes it
(`docs/design/cli.md`), as far as `[context]` says. One that can't be saved (it changed on disk meanwhile) stops it,
nothing copied: `context: x.md changed on disk while unsaved — ␣ n c resolves it first`. An export (`space n o`, or
`space n shift+o` for notes picked in order: `10.x`) saves them the same way before it reads the notes;
`docs/design/export.md` has the rest.

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
  refresh. A red link turns resolved when its note appears.
- **New directories** are watched through their whole depth. A `.gitignore` change rescans, and
  open notes that changed during the rescan reload.
- **Files outside the root** (the scratch in the state dir) are polled while open.
- **What git does lands as one change** (`5.9`, `5.10`): while git holds its index lock (a checkout, a merge, a
  rebase, a commit) the watcher's news waits; when it lets go, everything it changed is applied together. HEAD is
  looked at each second and with each batch: when it moved, `switched to branch feat` — and that branch's tabs back
  (above). Mid-rebase (its `rebase-merge` or `rebase-apply` folder there) HEAD is detached between steps, or while
  stopped on a conflict: not read as moved until the rebase ends, when its branch moved on — no switch away and back.
  The files a branch switch brings and takes for a few seconds after aren't taken for moves (`17.12`): a note only one
  branch has comes and goes, nothing moved. A pull or merge on the same branch is no switch: a rename it brings is a
  move.

### Bun's watcher, and what covers its gaps

Found while testing on Linux. Bun 1.3's `fs.watch` drops some events, so the watcher has
backstops:

| Bun does not report | Covered by |
| --- | --- |
| a directory renamed out of the root | each tick checks that watched directories exist |
| the old name in a rename (`g.md → h.md` only reports `h.md`) | re-checking known notes in that directory |
| a note moved to another directory under its name | re-checking known notes with that file name |
| anything on dot-files, `.gitignore` included | `.gitignore` mtimes polled each tick |
| a directory containing a broken symlink (it errors) | that directory is polled instead, with a warning |

The tick runs every `watch.poll_ms`, and every 15th tick sweeps all known notes. A change counts
when a note's mtime or size differs, so a rewrite in the same second is still seen. Attachments (any
non-note file but editors' temporary files) are reported too, re-laying out only when the attachment
index actually changes, so `![x](image.png)` images change status as they come and go; a note that
appears or grows larger than `walk.max_file_size` is skipped (and dropped from the index), as the
walk would. Events come coalesced (a burst of writes in one folder may report one file), so a
batch also re-stats the known notes in each folder that had events. The TUI's own writes (notes,
the scratch) are ignored once, then forgotten, and only while the file still has the stamp (mtime
and size) the write left: an agent's write landing right after a save is a change, not ours.

**Degrading loudly (plan `5.2`).** Exhausting the watch limit (`ENOSPC`, `EMFILE`, `ENFILE`)
produces one error message, `⚠ not watching` in the status line, and polling of open notes.

## The lint surface (plan `3.21`)

slipbox runs the linter you already use and shows what it finds where it is; it ships no rules of its own
(`docs/idea.md`, "Run this repo's linter, don't ship one"). By default that's `markdownlint-cli2`, found as a
language server is (`19.21`: the root's own `node_modules/.bin` in a root you trust, `PATH`, your installs), else
installed into slipbox's own folder the first time it's needed, pinned (`[lsp] auto_install`; "installing
markdownlint-cli2@0.23.3 into slipbox's own folder…"), and run on slipbox's Bun: with the root's own markdownlint
config when it has one (the linter finds it), else with `~/.markdownlint-cli2.jsonc`. In a root you don't trust
(`23.5`), a note under a markdownlint config that is code (`.cjs`, `.mjs`) or names code to load (`customRules`…)
isn't linted, said once.
`[lint] enabled = "auto"` lints only where one of those configs is — markdownlint's defaults are no one's rules for
notes; `"on"` lints anyway, `"off"` never. `[lint] command` runs another linter, the files appended, as long as it
prints markdownlint-cli2's lines (`path:line[:column] MD013/line-length what's wrong`) — only your own config can
name it, never a root's.

- **A note** is linted once its text is the file's: when it opens, and 300 ms after each save — never while it's
  unsaved, since the linter reads the file. Its findings show only for the text they were found in: typing hides
  them until the next save's run. A finding is a warning among the file's problems ("Problems where they are"):
  counted in the bar and on the status line, its line's number in `warn`, the Problems panel saying what
  (`⚠ 3:5  line-length: Line length [Expected: 80]  markdownlint MD013`).
- **The root** is linted when the Problems panel's All tab opens: its **Lint** section lists the findings by note, and a
  note's own run keeps its rows current. `enter` on one opens the note at that line (in source mode, its column); on a
  note's row, at its first.
- **A linter that can't run** (not installed, or failing without a finding) is said once, and not tried again until
  the config changes.

## What's under the cursor (plans `19.12`, `19.13`)

`shift+k` shows what's under the cursor in a floating window, rendered — a code file's language server's hover (its
type, its docs), or, on a note's link, where it lands (the heading's section, the note's start); read-only, `esc` or `q`
closes it. `g d` goes to the definition — the server's; a single one opens at once, in this root or outside it (a
dependency's types open as a loose file), several are a list — and in a note it follows the link. `g r` lists the
references, each `file:line` with the line's text, to pick from; in a note, its backlinks. `g y` goes to where its type
is defined, `g shift+i` to what implements it (`19.13`; Helix's `goto-type-definition`, `goto-implementation` features):
one at once, several to pick from. A file with no server says so, and `slipbox doctor` says which it would have; a
server that doesn't find these, so too.

**What a server changes** (`19.15`) is made through the buffers — never written behind them — each file's edits
one undo step. A file no window shows is saved after (through the same atomic write as every save), so what an agent
reads on disk is the edit's; one shown is left for its saving, `• unsaved`. Before each of these, and each hover or
jump, the file's servers are told its text now rather than after the pause, so the answer is for the text as it is.

- **`space c r`** renames the symbol under the cursor: the server's name for it typed already, then a preview of every
  line it changes in every file, before and after — `enter` makes it. In a note, it's the heading rename (`11.9`).
- **`space c a`** lists the code actions for the cursor's line — every server's, the preferred ones first, each with
  its server — asked with the problems on that line as each server gave them. One chosen: resolved first when it came
  without its edit, its edit made, then its command run by its server, which may ask slipbox for an edit in turn
  (`workspace/applyEdit`), made the same way. In a note, slipbox's own fixes for the line come first, server or not:
  a fragile link named for sure (`[[Pie]]` → `[[Recipes/Baking/Pie]]`), saved at once.
- **`space c f`** formats the file as its server does (the first that formats), one undo step; left unsaved.

**Completion** (`19.16`) shows as a code file is typed, under the cursor (above it with no room below): at once
after one of its servers' trigger characters (`.`), else once a word is begun and typing pauses (100 ms). Up to ten
items, each with its detail dimmed, the best first — by how well the word typed so far matches, then the server's
order. Typing on narrows the list without asking again, unless the server said its list was partial; a word ended
(a space, an operator) closes it. `tab` or `enter` puts the chosen item in — its edit if it has one, else its text over
the word, a snippet's tab stops dropped — then its other edits (an import at the top), the cursor staying on its
text. Only the last ask's answer is shown: one arriving after a later ask is dropped. **Signature help** shows after
`(` and `,` (as the server names them): the signature on a line above the cursor, the active parameter marked; `)`
or leaving insert closes it. Both are insert mode's, and leaving it closes both.

**A link's target** (`20.13`) in a note is completed by slipbox itself, server or not: right after `](`, the files the
link could reach — this root's notes and files by their path here, other roots' notes (as of their last index) by
theirs (`21.9`: from home, else absolute), the note itself not — each with its full path beside it, this root's
first. What's typed narrows by either form. `tab` or `enter` writes it as the root's convention writes a markdown
link's path (`21.5`: relative or from the root, with or without `.md`), encoded as a link's path is (`a%20b.md`);
another root's, its pointer when a named folder holds it that doesn't travel with this one (`21.7`), else the path
from the note. Right after `[[` (or `![[`), this root's notes and files, each shown as the wikilink would write it —
a name where it reaches the note from here, else its path from the root (a top-level note's being its name, a
relative path: `../plan`) — with its path beside it. Typing past the target (`)`, a space, `]`, `|`, `#`) closes it.
Same keys as above.

**A word from the open files** (`25.5`): `ctrl+n` in insert mode with no popup showing completes the word before the
cursor, as vim's does, server or not, in a note or a code file — the open files' words that start as it does, two
letters or more, each once: this file's first, from the cursor on and then around from the top (`ctrl+p`: back from
the cursor, then around from the end), then each other open file's, named beside it. Typed in lower case, any case
matches (find's smart case). The word the cursor is in isn't offered, nor the word as typed. Typing on narrows the list;
a character no word has, a move, or a backspace past where the word began, closes it. A server's ask waiting on a pause,
or its answer still on the way, is dropped for it; a trigger character closes it and asks the server. Same keys as
above; `.` repeats the word put in.

A file tree-sitter has no outline of (`16.8`: YAML, Java, Kotlin…) takes its language server's symbols as its
outline and breadcrumb (`19.14`), nested as the server nests them, asked for when it opens and again after each change
reaches the server. Where tree-sitter has one, it stays: it's there at once, and leaves out the variables and
properties a server lists.

## Problems where they are (plans `19.8`–`19.11`)

A file's problems, from every source alike, show where they are, in source mode, the lens and the rendered view: its
syntax errors (`16.9`; in source mode, out of insert, for the text as it is), the linter's findings (`3.21`; for the
text they were found in), a note's own (`11.5`: a link that reaches nothing or several notes, a `#heading` or
`#^block` its note hasn't, git's conflict markers; while the note is as saved, since the root's index has the
file's), its language servers' (`19.1`; for the text they were found in — typing hides them until they answer
again; once a server has answered, its syntax errors stand for tree-sitter's — in a root you don't trust, each in its
safe mode until you answer whether you trust it — asked once, the first time it matters, lsp.md's "Trust"), and its linters
without a server (`19.19`: one reading its input on the text as typed, 500 ms after typing pauses; one reading the
file after each save, its findings hidden while the text differs). Each has a severity: error, warning, information,
hint. `[diagnostics] severity` (`warning`) is the least that shows, so a root's notes not written yet —
information — don't mark every page; `"info"` shows them too.

- **The bar** (`space u d`, `[diagnostics] bar`): a column beside the text while line numbers are off. On the row a
  line starts on — in the rendered view, the row its text starts on, or the next one drawn — the worst problem
  starting there by its sign, in its colour (`✖` `error`, `⚠` `warn`, `ℹ` `info`, `·` a hint; the Nerd set's icons;
  ASCII `E W I .`), then how many when more than one (`+` past 9). With `"auto"`, the default, it takes its three
  columns once a file has had a problem, and keeps them while the file is open, so the text doesn't move as problems
  come and go; `"on"` keeps them always, `"off"` never. With line numbers on there's no bar: a line's number takes
  the worst one's colour, bold, and stands for the sign. A click on a sign — or on such a number, where a problem
  starts — opens the Problems panel on This file at that problem (the worst there), the note on it, the panel with
  the keys. No ruler on the right: the Problems panel's This file tab says where in the file they are.
- **The marks** (`[diagnostics] marks`): where each problem is, underlined in its severity's colour
  (`problem_error`, `problem_warn`, `problem_info`; a syntax error keeps `syntax_error`), for the problems at least as
  bad as its level: `"error"` (the default), `"warning"`, `"info"` (all), or `"off"`; `space u shift+d` cycles off →
  errors → warnings → all (an older `true` reads as all, `false` as off). Source mode and the lens know each
  character's place: the problem's own characters. The rendered view knows each piece of text's line: a link's
  problem marks the link as drawn, any other the text its lines became. A link that reaches nothing or several notes
  keeps its own colour and underline whatever the level (`link_unresolved`, `link_ambiguous`), and the Problems
  panel's chosen problem is marked whatever it is (below).
- **The status line**: how many of each severity (`✖ 1  ⚠ 3  ℹ 2`), on any line; what each says is the Problems
  panel's (below).

Both switches are UI settings (`space u u`), remembered as the others are.

## The Problems panel (plan `1.7`)

A panel across the whole width at the bottom, under the windows and the side panes, over the frame's bottom rule —
a third of the rows, at least twelve where that's under 40% of them. It resizes as a window does: with it focused,
resize mode's `j` / `k` (`ctrl+w +` / `-`, `space w r`) make it a row taller or shorter, and its rule drags; `=` puts
it back to a third; its height is kept in the session, and never leaves the note under four rows (a screen too short
for three keeps the note; its keys still work). Its first row has its two tabs, the chosen one bright, a click on a
title switching (`tab` / `shift+tab` too), the tab's filter after them (`/`: `› text`), and a close button at its
right end; then, a blank row above and below it, the tab's list. The panel has the keys while focused (`PROBLEMS` on
the status line), `esc` handing them back to the note and `q` closing it.

- **This file (n)** (`space n q`; a click on the status line's problems, or on a sign of the bar): every problem of the
  file on screen, from every source ("Problems where they are", at `[diagnostics] severity` and up), in the order they
  come, a blank row between them: on its first row the severity's sign, `line:col`, the message, and who found it dimmed
  at the right (`slipbox unresolved`, `markdownlint MD013`); under it the line's text, its leading blanks dropped, the
  problem's part marked as it is in the note. `/` filters them — by place, message, who found it or the line's text —
  `enter` going to the first match, the filter cleared. It follows the file on screen and opens on the problem at or
  after the cursor's line. Moving through it (`j` / `k`, a click) takes the note there, the panel keeping the keys, and
  marks that problem in the note with a background (`link_focus`), whatever `marks` says, while the panel has the focus;
  `enter` (or a second click) goes there, the note taking the keys, a place pushed onto its history.
- **All (n)** (`space v p`, `:problems`; the status line's `⚠ 0` when the file has none): what's wrong in the root, the
  count leaving its orphans out. A heading per kind, with its count, that folds: **Broken links** (the unresolved-link
  set: each link that reaches nothing, and why when there's a reason, such as an unknown folder), **Ambiguous links**
  (each that reaches several notes, and how many), **Fragile links** (each won by where it's written — the nearest or
  the shortest of several of its name — and the path that names its note for sure, `space c a` writing it), **Lint**
  (`3.21`: the linter's findings, when one runs — see "The lint surface"), **Conflicts** (`5.12`: during a merge, each
  file git says is unmerged, at its first `<<<<<<<` marker), **Orphans** (`9.5`: the notes no other note links to —
  another root's links count, a note's own don't — each opened by `enter`). Under the first three, the notes with such
  links, and under a note its problems: the line and the link as written, in the link's colour (a finding: its line,
  rule and what's wrong). `enter` or a click opens the note there in a tab of its own — or switches to the tab showing
  it, a place pushed onto its history — the cursor on the problem's line, on the link as drawn (in source mode, on its
  text); a note's row (an orphan's too) opens at its first. As in the explorer, `o` opens it in this window instead,
  `s` in the split's other. It takes the explorer's keys (`l`
  / `h` unfold and fold a section); `/` filters — its `› text` after the tabs' titles — keeping the problems whose note,
  line or link matches (a conflict or an orphan by its path) under their headings, unfolded; a note's change shows at
  once. Each opening lints the root again (`Lint (n) …` while it runs); `slipbox problems` gives the same (`--lint` for
  the findings).

The same key, the panel open there and focused, closes it; open and not focused, it focuses it.

## Git (plans `5.11`–`5.14`)

`space g` holds what git knows of the root, measured against the base branch (`[git] base`, else `main`, else
`master`) from where this branch left it (the merge base) — what an agent's worktree changed, ready to review:

- **`space g c`** (`:changes`): the files this branch changed, committed or not, and the new ones — `M a.md`,
  `+ c.md`, `R notes/new.md  from notes/old.md`, coloured by state. `enter` shows a file's diff; `esc` there comes
  back to the list.
- **`space g d`** (`:diff`): this note's diff, as it is now (unsaved changes too): each group under its `@@ line N`,
  removed lines red, added green (`diff_del`, `diff_add`, `diff_head`). `enter` on a line goes there.
- **`space g w`** (`:worktrees`): the repository's checkouts — the main one first, this one marked `●` — each by its
  branch. `enter` switches into the root there, at the same note when that branch has it.
- **`space g m`** (`:merge-review`, `20.21`): before a merge, the links it would break. A merge picked — this branch
  into the base, or another branch into this one — and git's tentative result is checked (`slipbox merge-review`): each
  broken link by its note and line, what broke it ("`main` moves `a.md` to `docs/a.md` — the fix: `docs/a.md`"),
  yellow when there's a fix, red when there isn't. `enter` goes to the link (a note only the other branch has, said
  so); `esc` comes back to the branches. Nothing broken, a message says so.

**After a merge or a pull** (`20.21`): HEAD moving on its branch isn't a switch — the tabs stay. Git's renames between
the two commits are evidence of moves; when there are some, a message says so ("branch main moved on: git moved 2
files — …"), and each link broken by one says where its file went, in Problems (`space v p`) and when followed;
`space l r` relinks a note's.

A jump to a line inside a rendered paragraph (a diff's line, a conflict, a finding, `:42` and `ctrl+g`) lands on that
line's text, not the paragraph's first line or its row's end.

## Modes and dispatch (decision `3.11`)

**Dispatch order:** a paste first, then an overlay, then a pane's filter while typing in it, then insert mode's
keys (the completion popup's first), then a key awaited as a character (after `f`, `t`, `r`), then — in source mode
and the lens — counts and an operator's motion around the rest (`vim.ts`), then resize mode's keys (any other key
leaves resize mode and runs as usual), then a pending sequence (where `esc` cancels and `backspace` goes up a level),
then the focused pane's keymap (explorer or outline), then visual mode's, then source mode's own (`[keys.source]`,
in an editable window outside visual mode), then the normal keymap. Only keymaps at or above the one holding a binding can
make a key a prefix: visual mode's `y` doesn't wait for the normal keymap's `y y`. When a key is
both a binding and a prefix, slipbox waits `input.which_key_delay_ms` for the next key, then
runs the binding.

## Known limits

- **A change of width re-wraps a whole note** (plan `15.1`): dragging a border, resize mode,
  toggling a pane, zen, wrap or line numbers, a terminal resize — about 4 ms for a thousand-line
  note and 70 ms for twenty thousand. A buffer keeps its last six widths, so going back and forth
  is cached. Edits, reloads and leaving the lens reuse what didn't change (the parse by chunk, the
  render by block, source mode by line: [architecture.md](architecture.md), "Big notes").
- **A big note's first open reads for a moment** (plan `15.1`): with 128 KB or more to parse, it parses on other
  threads — the window says `reading big.md — 20,000 lines…` for about a third of a second at twenty thousand
  lines, keys wait for it, a click is dropped — then the note is drawn where it was left.

## Parity with the CLI

Every command is declared in `core/command-specs.ts` with the CLI invocation that reaches the
same state change, or marked as an interaction: cursor, scrolling, selection, focus, panes,
overlays. Tests fail when a command is implemented without a spec or specified without an
implementation. See [cli.md](cli.md).
