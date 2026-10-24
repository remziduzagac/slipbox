# The TUI

The reader — it browses, renders, selects and copies text, holds several notes and follows external changes (D26,
D137) — and the editor: task checkboxes, hand-off to `$EDITOR` or a running nvim, source mode with a vim-shaped normal
mode, the lens (live preview), saving, autosave and the conflict prompt (D134, D144). Every write to a note goes
through one path ("Writing notes"); besides notes it writes its own state and the scratch.

**Every key is in [keys.md](../../docs/manual/keys.md).** This document covers how the parts behave.

Code, in `src/tui/`:

| File | Role |
| --- | --- |
| `app.ts` | the model: the shared state (tabs, windows, buffers, panels, the overlay, messages) and the wiring |
| `settings.ts`, `session.ts` | the keymaps, theme, glyphs, UI settings, live reload; the workspaces kept and restored |
| `views.ts`, `lens.ts`, `code.ts` | a window's layout, cursor and scrolling; the lens and source mode; code blocks |
| `input.ts`, `mouse.ts` | keys and pastes, dispatched in order, the which-key popup; clicks, drags, the wheel |
| `overlays.ts`, `properties.ts` | lists, prompts and dialogs; the properties editor in the floating window |
| `panels.ts`, `history.ts` | the side panels, their widths and filters; the history |
| `explorer.ts`, `explorer-disk.ts`, `marks.ts` | the explorer, one tree and its view; what the walk leaves out; marks |
| `following.ts`, `peek.ts` | links followed only when you say so; the peek at another vault's file |
| `git.ts`, `info.ts`, `outline.ts`, `footnotes.ts` | git's state, changes and commits; Info; the outline; footnotes |
| `gitpanel.ts`, `gitview.ts`, `gitmouse.ts`, `draw-git.ts` | the git panel: rows, keys, buttons, footer; mouse |
| `gitsteady.ts` | the git panel's rows by what they are: the selection, the pointer's row, a click's |
| `gitbranchview.ts`, `gitreposview.ts` | the git panel's branches and worktrees; the repositories in the view |
| `diffview.ts`, `review.ts`, `mergescreen.ts` | the diff window; reviewing a change; the merge screen |
| `gitremote.ts`, `rebase.ts` | fetch, pull, push and stash; a diverged pull, rebasing, what's under way |
| `problems.ts`, `languages.ts` | the Problems panel and marks; syntax, language servers, linters, trust |
| `windows.ts`, `files.ts`, `vaults.ts` | windows and tabs; file operations and the trash; vaults gone into and made |
| `renaming.ts`, `linking.ts`, `search.ts` | renames previewed; links under the cursor, inserted; search, tags, types |
| `watch.ts`, `saving.ts` | the watcher, polling, indexing, reloads; saving, autosave, conflicts, quitting |
| `pictures.ts`, `exporter.ts`, `handoff.ts`, `scratch.ts` | pictures; export; hand-offs to an editor; scratch |
| `actions.ts`, `actions-*.ts` | the command implementations, by area; `registerActions` registers them all |
| `palette.ts` | the command palette and the help list |
| `buffer.ts` | a note's text, its undo steps, unsaved state, and cached layouts |
| `canvas.ts` | the drawing surface; `TextCanvas` for headless tests |
| `cursor.ts` | the motions |
| `draw.ts`, `draw-*.ts` | painting — the frame, then each region in a file of its own — and the mouse's geometry |
| `where.ts` | where you are, for the top bar and the status line: the vault, the workspace, the branch, cut to fit |
| `editing.ts` | the cursor as a text offset; insert mode |
| `completion.ts` | completion while typing, signature help (`19.16`); a link's target completed by slipbox (`21.5`) |
| `vim.ts` | normal mode in source and the lens: counts, operators, the register, `.` |
| `replacing.ts` | find and replace: the replace row, `:s` and its confirm |
| `match.ts` | the matching and ranking every list and filter uses |
| `keys.ts` | the default keymaps, groups, aliases, and the in-pane actions' titles |
| `run.ts`, `opentui.ts` | the OpenTUI binding |

## Screen layout (plan `3.1`)

```text
 slipbox                    ◈ notes · main ↑2           indexing 3…     ← top bar (ui.top_bar; can be hidden)
━━━━━━━━━━━━━━━┳━━━━━━━━━━━┳━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┳━━━  ← the frame's top rule
 ≡  Explorer   ┃ 1 index × ┃ 2 alpha × ┃                             ┃ +3  ← left rail (tinted) · explorer ┃ tab strip
 ◷             ┣━━━━━━━━━━━┻━━━━━━━━━━━┻━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━┻━━━  ← the strip's rule, the outline under it
    ▾ notes    ┃ § Heading › Sub  Read Lens Source┃ Outline            ▤   ← window header (tinted) ┃ outline · rail
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

**The terminal's title** is `slipbox — <the file on screen>` (its path in its vault), else the
folder open in its place: told when it changes, its control characters stripped.

**The top bar** has buttons, where you are, and the vault's state. It sits on the page's background like the rest, so
the frame's rule under it gives it the same half row of air the tab strip and the titles get from theirs:

- on the left, the `slipbox` chip (plain accent text), which opens the command palette; before it, without the left
  rail, the explorer's `≡`;
- in the middle, **where you are** (WSP-D4; `where.ts`): the vault after the vault glyph (`◈`; Nerd: a bookshelf; ascii
  `#`), by its name or its path, as § How a vault is named and shown in roots.md says (`◈ kestrel`,
  `◈ ~/src/experiment`, home `◈ ~`; Elsewhere `Elsewhere`, no glyph, being no vault); then the workspace when it isn't
  the vault's own, a folder of home opened by name, by home's path for it (`◈ ~ › notes`); then the branch as the status
  line said it: `· main`, how far it's ahead of its upstream and behind (`↑2 ↓1`; GIT-D4), a merge or a rebase under way
  (`merging`, `rebasing 2/5`; GIT-D6), a named worktree's after its name (`◈ kestrel@feat`), a detached head by its
  commit. The vault and the workspace are drawn in the bar's text, the branch and what follows it dim (`status_dim`), a
  part under the mouse in `hover`; every name passes through `sanitize`, and every width is `core/width.ts`'s. **Where
  it goes:** in the span between the left side's last item (the chip) and the right end's first (`indexing…`, or the
  outline's button when the bar has it), 2 columns kept from each beyond its padding; centred on the screen, then
  clamped into that span, so it moves right or left only as far as it must. **Short of room,** cut in this order, each
  step only while it still doesn't fit: a path is cut from the front (the vault's, then the workspace's, to 12 columns
  each, `…earch/notes`, each step cutting from the whole text, so a part given up gives a path its room back); the
  branch's ahead and behind go; the branch is cut from its end, to 8 columns, then goes; a merge or a rebase under way
  goes (kept after the branch, a sign that something's to finish); the workspace goes; the vault's name is cut, a name
  from its end and a path from the front, to 6 columns. Narrower still, nothing is drawn, and the status line says where
  if it has the room (below). **Clicked**, two targets, each a hot region only while its part is drawn: the vault's
  (`top:vault`: the glyph, the name, and the workspace after it, `◈ ~ › notes`) lists the named folders, seen last
  first, and `enter` goes into one (`space v v`, § Going into a vault), from Elsewhere too; the branch's (`top:branch`:
  from the space before its `·`, or a worktree's `@`, through the operation: `· main ↑2 merging`, `@feat`), in a
  repository, opens the branches' menu as the status line's did (GIT-D8): Pull while there's an upstream not gone, Push,
  Fetch and the git panel, then the branches;
- at the right end, the vault's state (`indexing N…`), dropped when fewer than 12 columns are left.

Toggle buttons have no fill of their own: their glyph is dim (`topbar_button`) while the pane is closed and bright
(`topbar_button_on`) while it is open. `ui.top_bar = false` removes the bar, as do `space u b` and "Top bar" in the
UI settings (`space u u`, remembered like the other settings; the note gains its row, `:` still opens the palette,
the indexing state isn't shown, and the status line says where you are); zen mode hides it too.

**The window header** tops each window, between two rules: in a split the window's file name, then the breadcrumb,
then at its right the mode's buttons, and at the far right of the window at the top right, without the right rail,
the outline's `▤` (HDR-D1). In a split the name is `strong` in the active window and `dim` in the other, cut to half
the row. `ui.window_header = false` removes it, as do "Window header" in the UI settings list and the palette; zen
mode, the floating window and windows under 8 rows have none (HDR-D3). Without a header there are no header rules,
the outline starts at the top of the content, and a split window gets a plain title row (`tab` / `tab_active`). It is
drawn by `drawWindowHeader` (`src/tui/draw-header.ts`), which `drawPane` calls.

**The mode's buttons**, `Read`, `Lens` and `Source`, are the window's three modes, the rendered view, the lens and
source mode, as a radio group (HDR-D2). Exactly one is selected: the window's mode (`view.source`: Source,
`view.live`: Lens, else Read), drawn `topbar_button_on`; the others are `topbar_button`, and `hover` under the mouse.
They are drawn from the window's own flags each frame, after its layout is asked for, since laying a window out can
change its mode without `setViewMode` (a data file that stopped parsing goes to source mode once typing ends,
`views.ts`; a window given another file, `Lens.fitMode`): nothing about them is kept between frames. Two windows on one
file each have their own. Typing isn't a mode: while typing, the button of the mode it's in stays selected, as the chip
says `INSERT`. A mode the window can't switch to (`Lens.refusal(view, mode)`, the one place `setViewMode`'s refusals
are decided, returning the message and its level and saying nothing itself) is disabled: drawn
`topbar_button_disabled`, never `hover` (`button()`'s `hovers`). The header asks every frame, so it asks
`Lens.canSwitch`, which never parses: a data file whose text changed since its last parse (`NoteBuffer.parseCurrent`)
is taken to parse, its Read and Lens lit, until a parse says otherwise — a click's, which asks of the text as it is,
or a switch's. So no keystroke or edit parses a data file in source mode, whatever its size or however many windows show
it, and data is never judged mid-typing (an open quote is normal there). The selected one
is never disabled: it's the mode the window is in, even where the window couldn't switch to it now (typing in the
lens on data that stopped parsing: Lens selected, until typing ends and the window goes to source mode, said). A file
with no rendered view (a text file; code not in a
language the view maps, or `[render] code = "source"`; data that doesn't parse) has only Source; a drawn buffer (a
diff, a review, the merge screen) can switch to nothing, but it shows only in the floating window, which has no
header. A read-only file, a peek kept as a tab, a file Elsewhere and the scratch in the window on the right have all
three, as their modes do today. The labels are the same for every file: for code, Read is the code as a document and
Lens a cell's source; Source is always the file as written.

**A click** on a button, like every click, first ends typing (`mouse.ts`: its undo step closes, the unsaved changes
kept in the buffer), then focuses the button's window and its content region, as a heading's click does, so the
status chip, which describes the focused window, agrees. Then, on another enabled button, it runs that mode's named
command, `view.mode_read`, `view.mode_lens` or `view.mode_source`, which switches straight there through
`Lens.setViewMode` (Lens from Source never passes through Read) and says what the window shows now, in the toggles'
words. On the selected button it changes nothing more: a radio group never deselects. On a disabled one it says why,
in `setViewMode`'s words; the command says it, as it does any refusal. One click never says a thing twice: where ending
typing in this file, in this window or another on it, said why already (data that stopped parsing goes to source mode),
the click adds nothing: while a click is handled, each message it says is said once (`App.sayingOnce`), its words
`unparsedText`'s wherever they're said; a second click is its own, and says them again. A click focuses its window as
a heading's does (`Mouse.focusWindow`). The hit areas are
`mode:<window>:<read|lens|source>`, the window's index checked as a heading's is; the selected and the disabled keep
theirs, without `hover`. The which-key popup over the header hides them as it hides the headings'
(`draw-overlays.ts`), and so does the floating window, whose margins can lie over the header's row: what lies under it
can't be clicked through it, its own hit areas aside (`drawApp`), and completion's popup, which can hang over a
stacked split's lower header. The modes' table, `MODES`, with `ViewMode` and `viewMode`, is `modes.ts`'s, a module
that imports nothing at load (the lens and the header import each other through the app), for the header, the
mouse, the lens and the status chip (its chip the selected button's label) alike; the header asks `Lens.canSwitch`,
`refusal` without its words. The lens's message names what it shows: a note's
markdown, code, a data file's own format (`the YAML`; `lensWhat`).

**Room** (HDR-D4). The header's row, from the right: `▤` where it is, then the buttons, then the breadcrumb between
the name and them. The buttons are three labels side by side, each with a space either side: ` Read ` ` Lens `
` Source `, 20 columns; shortened, ` R ` ` L ` ` S `, 9; at the least, the selected one's letter alone, 3. The
breadcrumb is drawn in the columns between the name and the buttons less one at each end, as now, and folds into them
as before. The buttons take the widest form that leaves the breadcrumb its least room: its narrowest form but `…`
alone — the icon and its space, `… ›`, and 8 columns of a heading, 14 columns — while the breadcrumb shows, whatever
headings the cursor is under and whatever the mode (a window's headings depend on it), so a window's form changes
only with its width (HDR-D7, HDR-D8); nothing when the breadcrumb is hidden. Past that, the breadcrumb folds further, as
`crumbLayout` does, until only `…` or nothing is left; the selected letter goes only where it doesn't fit beside the
name and `▤` (a split's window squeezed to its narrowest, about 12 columns). `modeButtons` (`draw-header.ts`) picks
the form, from the breadcrumb's least room, `crumbLeast`, beside `crumbLayout`. The name keeps its place (cut to half
the row, as now), and `▤` its.

**The breadcrumb**, on the header after the name, starts with an icon (`§`, ascii `#`) that opens the heading finder
when clicked, then the chain of headings that window's cursor is under, each cut to 40 columns. When they don't all
fit, the middle collapses into `…`: the first heading, `…`, and as many of the innermost as fit; then only the first
and the last, cut (down to 8 columns each); then `…` and the last; then `…` alone. Clicking `…` (or `space f b`) opens
the whole path as a dropdown hanging under the header, centred across the screen, at least half its width (60 to 100
columns) and room for 8 entries between blank rows, framed like the other popups: one heading per row, each hanging
off the one above with `└─`, the current one marked `here` and selected. Typing filters it, as in every list (the
filter's row sits under the title); the arrows and `ctrl+n` / `ctrl+p` move, `enter` or a click jumps there as a
breadcrumb click does, `esc` or a click outside closes it. Clicking a heading focuses that window, puts its cursor on
the heading, and scrolls the heading to the window's first row (as far as the note's end allows). The header stays
above the first heading, so the text doesn't jump. `ui.breadcrumb = false` hides the breadcrumb alone: the header
keeps its name, its buttons and `▤` (HDR-D3). Without the right rail (below), the `▤` button sits at the header's
right end; when no window shows a header, it moves to the right end of the top bar (with neither, in zen or with
`ui.top_bar = false`, the outline opens with `space o`).

The header has its own background, `breadcrumb_band` (`surface` blended into the page at 35%; the role keeps its
name, HDR-D1). The breadcrumb's icon is `breadcrumb_icon` (blue), outer headings `breadcrumb` (dim), separators
`breadcrumb_sep` (faint), and the heading the cursor is in `breadcrumb_current` (bold). A disabled button is
`topbar_button_disabled`: in italics in every theme, its colour halfway from an enabled one's to `surface2` (in the
terminal's palette colour 8, dim; without colour, dim; HDR-D5, HDR-D6).

Rules run above and below the header. The rule above is the frame's rule under the tab strip; the lower window of a
stacked split draws its own.

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
workspace keeps them.

**The status line** is about the file. From left to right:

- a mode chip: `READ`, `SOURCE`, `LENS`, `INSERT`, `VISUAL`, `V-LINE`, `FILES` (the explorer or the
  history), `GIT` (the git panel), `PROBLEMS` (the bottom panel), `OUTLINE`, `FOOTNOTES`, `INFO` (the right panel's
  views), `RESIZE`, or what's pending: keys of a sequence in short form (`␣ l`,
  `C-w`), or an operator, a count, or a key waiting for its character (`2d`, `di`, `dT`, `r`, `2f`);
- where you are, and its branch, dimmed, **only while the top bar doesn't say it** (WSP-D5): the bar hidden
  (`ui.top_bar = false`, `space u b`; zen has neither bar), or too narrow for even the vault: with a note open, a bar
  that narrow leaves the status line no room either; with none, the status line has the row and says it. The same parts
  as the top bar's, without the glyph (`20.14`, `21.9`; D65, D77; `whereOf` in `tui/where.ts`): the vault's name if it
  has one, else its path — `research · main`, `~/src/experiment · main` (no remote), `notes` — home as `~`, a folder of
  home opened by name after it (`~ › notes`), and Elsewhere as `Elsewhere` (VV-D2, VV-D3); then the branch checked out
  now (a detached head: its commit), a named worktree as `research@refactor`; then, a branch with an upstream not gone,
  how far it's ahead of it and behind it as of the last fetch, only what isn't zero (`research · main ↑2 ↓1`; ascii
  `+2 -1`; GIT-D4); then a merge or a rebase under way (`kestrel · main merging`,
  `kestrel@agent/sync-retry rebasing 2/5`, a rebase's branch named rather than its detached commit; GIT-D6). Clicked, in
  a repository, the whole of it opens the branches' menu (§ Side panes), as before: unlike the top bar's, it has no
  vault target. At most 40 columns, cut as the top bar's is; it's the first to go when the path would be left fewer than
  24 columns, so on a narrow screen neither bar may say where;
- the note's path between back and forward, as an address bar's: `‹ notes/people/kenji-mori.md ›`. `‹` and `›` go
  back and forward in the focused window's history, each bright when there's somewhere to go, dim when not; hovered,
  one says where, above it (`back: home.md › Start here`; back past the vault's first place, the vault before). A click
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

On the right it shows the link under the cursor and its status (`→ beta.md (resolved)`) in the rendered view (in source
mode and the lens the row is the link's own text, so none is named), then, while the explorer has the keys and its
cursor is on a `⊘` row, why that row isn't indexed (`⊘ not indexed: generated (node_modules), git-ignored`; VV-D9, D244:
`Marks.selectedWhy`) — gone when the cursor moves off, cut to the room left after the words and the link are dropped,
drawn after the mode chip when no file is open (after where you are, when the status line says it) — then the note's
words (`1,234 words`; the selection's in visual mode, `12 words selected`; frontmatter not counted, each Han or kana
character a word; dropped first when short of room), then `tab N/M` when there are two or more tabs, then
`L<source line>:<column>` and the percentage (`all` when the note fits), which always shows — the source line of the
text under the cursor (a rendered paragraph's row holds several), and its column in the row's own text: the lens's
counters and a code cell's border and padding before it aren't text, so they aren't counted. Find's progress is in its
window's find row, not here.

**Find** (`/`, `ctrl+f`) belongs to a window, so it's typed there: a row of its own under the
window header (or at the window's top when there's none), `› query` with the match count at its right
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

Vim's `:s` ([keys.md](../../docs/manual/keys.md)) uses the same engine, `core/replace.ts`; with its `c` flag the
same two rows ask at each match, `replace? y n a q` where the buttons were.

**Messages and questions never take a row of their own,** so the note never changes height for them.
Messages float as boxes at the top right of the content, hanging from the rule under the chrome at
the top of the window under them (its header, find and replace rows, which stay in sight),
newest on top and stacked down, four at most:
each framed in its level's colour with its glyph first — `✗` error, `!` warning, `·` info (ascii
`x`, `!`, `-`; an info message that starts with its own symbol, such as `↻`, keeps just that) —
and wrapped to three rows. Each shows 4 s (8 s an error) from the frame that first draws it — one said while slipbox
was busy, a start indexing, isn't gone before it's seen (#40); the same message again refreshes its box
rather than stacking a second. A message asks for its frame as it's said, whatever says it — a key's command, git
answering in the background (D263) — so it doesn't wait for the next key. One said while a frame is painted
(`App.whileDrawing`, around the host's whole paint) asks for no frame: OpenTUI would draw again at once for it, and
something said on every frame would keep drawing; it shows on the next frame drawn, which may be the next key's (a
spell checker's missing dictionary, said as a note is drawn). Clicking one opens the
messages list and clears the boxes. Popups
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
and its last row holds the same `▄` bar (only while they overflow). A code block that scrolls sideways has its own
`▄` bar on its last row, under its code (§ Code blocks that scroll). Every bar can be clicked and
dragged; in a side pane that focuses the pane and pins its scroll, like the wheel. A horizontal
wheel or trackpad scrolls a side pane sideways as it does the note.

**Hover.** Buttons (the header’s mode buttons but the selected and the disabled), tabs and their `×`, `+N`, breadcrumb
headings and icon, the top bar's vault and branch, the
status path and which-key entries are drawn in the `hover` role while the mouse is over them. Rows in lists and
panes show their selection instead. After each frame what's under the pointer is worked out again from where it
last was, moved or clicked (`Mouse.rehover`, D261), and the frame drawn again once when that changed: whatever
came under a still pointer (the git panel's rows as git answers, a tab moved, a mode button a click there left
switchable once the mode changed back) shows its hover, not the one before it.

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

**Selection.** A selection is an anchor plus the cursor. It's extended by `shift`+movement or by visual mode (`v` by
character, `shift+v` by whole row); `o` swaps the ends, and `esc` clears it. A mouse drag makes one too, copied on
release. In source mode or the lens, one made by a drag or by `shift`+movement is a visual selection (as vim's mouse
makes one; DF-D15, DF-D28), so `d`, `c`, `x`, `>`, `<` and `y` act on it (`backspace` and `delete` as `d`, D231), any
movement extends it and `esc` leaves it;
an operator's shifted motion (`d shift+right`) leaves none behind. While typing, `shift`+movement selects as a desktop
editor does (§ Editing). Copied text is the rendered text, which is what you saw. A double-click on a link follows it
once: the second click, landing in the note it opened, is swallowed.

## Buffers, views, tabs, windows (plan `3.3`)

Notes open as buffers, shown in tabs, with one split (D141):

- **Buffer:** one open file, with its source, parse, and layouts by width. Buffers are
  internal: there is no buffer list. They're keyed by path, so a note deleted on disk keeps
  its buffer.
- **View** (a window): a buffer plus its own cursor, top row, selection, find and history.
  Two windows may show one buffer.
- **Tab:** one window, or two in a split, with an orientation (side by side, or stacked) and a ratio (the first window's
  share). `ctrl+t c` (`tab.new`) in a split moves this window out into a tab of its own, the split gone; with one
  window, it opens its note in a new tab. Resize mode (`space w r`, or a `ctrl+w` step) changes the ratio, or the
  explorer or outline width, or the Problems panel's height, when one is focused: a split's ratio kept in the
  workspace, the widths and the height for the vault, across its workspaces.
  Side by side falls back to stacked below 80 content columns (a fixed width, not `ui.narrow_width`), and a stacked
  split too short for two windows (under 6 rows) shows only the active one. With a split, each window names its note on
  its header, bright in the active window (on a row of its own when the header is off). Pane widths stay between 12
  columns and half the terminal, and
  together leave the note at least 24; a split's ratio stays between 15% and 85%.

## Positions (plans `3.4`, `3.5`, `3.15`)

**Views store source anchors, not rows** (D98):

- **Top of the view:** the nearest heading above it, plus an offset and a fallback line, plus which
  row of that source line it is (a wrapped paragraph's, a table row's), so a resize and back
  returns the same top. A table's rules belong to the lines beside them (the header rule to the
  delimiter line, the bottom rule to the last row), so a cursor on one stays on it. On a reload the heading is
  found again by its slug and its occurrence index (else the first heading of that slug); if no heading has the
  slug, the absolute line is used, clamped (D98; `core/position.ts`).
- **Cursor:** the same kind of anchor for its row, plus which wrapped row of that source line
  it's on, plus its column.
- **Selection:** its fixed end is kept the same way, so a resize or a pane toggle keeps it on the
  same text (whole-row selections take whatever the rows hold after re-wrapping).

Rows are re-derived on every re-layout (a resize, a reload), and the anchors are then refreshed
from where they landed. So text an agent inserts above doesn't move you, and removing your
heading later falls back to a current line, not a stale one. While typing, a cursor past a line's last character stays
past it through a re-layout; leaving insert mode reads where typing stopped (`g i`'s place) before it lets go of that,
so a re-layout still pending at `esc` (the index done, a grammar loaded, in the background) can't put it a character
short.

**Saved state:**

- **Reading position** per note, cursor included, in `positions.json` in the state dir: one file for the machine,
  each note by its absolute path and the vault it was read from (D76; [roots.md](roots.md) § State by vault).
- **Workspaces** (WSP-D1, WSP-D2): a workspace is the tabs and the active one, the pinned ones, splits with their
  orientation and ratio, and each window's note, cursor and history (its last 50 places each way). A vault keeps its
  workspaces in its `session.json` (the `Session`, `tui/session.ts`), found in this order: in home, one per folder
  opened by name (below); else the branch's, once left; else, in home, home's own; else the vault's last tabs,
  whatever branch left them (a vault without git, a detached head, which keeps none of its own, a branch not yet
  left). Beside them, shared by them: the explorer's and the outline's visibility and widths, the Problems panel's
  height, UI setting overrides, the palette's recent commands, the recent notes and the nvim picked for send. A
  workspace is restored when slipbox starts with no note named, no path or a folder (`slipbox ~/notes`), if
  `ui.restore_session` is on; a file named opens that file alone (DF-D11). UI setting overrides and recent commands on
  every start.
- **Each branch's workspace** (`5.9`; D153): in a git checkout each branch has the workspace it had when it was left
  (the 30 left most recently). Started on a branch, slipbox opens its tabs; a switch to another branch while it runs
  brings that branch's back — unless a note is unsaved, which stays open (said so). A branch it has none for keeps
  what's open, which becomes its own.
- **Each folder of home's workspace** (VV-D2): each folder of home opened by name (`slipbox ~/notes`, a folder
  revealed; the 30 left most recently) has a workspace of its own beside home's own (its top's), so each brings back
  its own tabs; one it has none for opens its own note ([roots.md](roots.md) § Home). The top bar names it
  (`◈ ~ › notes`).

## History (plan `3.6`)

Each window has back and forward stacks of `{note, top, cursor}`, 200 deep, kept in the workspace (50
each way) so they go on after a restart. Following a link, jumping to a heading and opening a note
all push onto them. The history list (`space h h`) shows the whole timeline and jumps anywhere in
it, and under it the notes read lately in other tabs and sessions: a note opened in a tab of its own
starts a timeline of its own, and is still found there. The status line's `‹` `›`, around the path, are back and
forward with the mouse; the path, clicked, lists the window's timeline (see the status line, above).

## Going into a vault (plans `17.10`, `17.14`, `21.10`)

The TUI is always in one vault ([roots.md](roots.md)): a folder holding a vault marker, home (`~`, a vault without one),
or Elsewhere, the rest of the file system, one place for the machine (VV-D1–VV-D3); each with its workspaces, its own
(`21.8`; D76, WSP-D1). The current vault is the one whose tabs are shown. **Choosing a file or folder of another vault
goes into it** (VV-D4; `switchVault` in `tui/vaults.ts`): `enter` or a double-click on another vault's row in the
explorer, a file of another vault opened from the explorer or with `:e` (a path, a pointer; `intoOther`), `o` in a peek
(§ The peek), the git panel's `o` on a repository, a checkout or a branch's worktree (Open), a named folder picked from
`space v v` or from the top bar's vault, clicked (WSP-D4), a folder link that leads out of the vault (revealed in its
own vault, D81). The TUI becomes that vault's, as if started there — its config, its index (refreshed), its watcher, its
reading positions and your workspace there, whose tabs come back, with the note open (at its heading). What git said of
the vault left is forgotten — its files' states, the git panel's files, where its branch stood, those opened up — and
the git panel's message box is emptied: a message typed in one vault is never committed in another. Leaving saves the
one before as quitting does. **Refused while a note is unsaved** (`unsaved: … — save (:wa) or revert before leaving`):
it would be left behind. The properties editor closes first, writing its edits into the note — or, while it asks (they
don't parse, or changed meanwhile), nothing switches. **Looking never moves you** (VV-D7): following a link into another
vault, a backlink from one and another vault's search hit open a peek instead, going there a choice (§ The peek).

**Back returns.** `back` (`ctrl+o`) from the first place in a vault goes to the vault before, at the note and place
you left; each switch is remembered, so a chain of them unwinds one by one. From a vault gone into from a tab kept from
a peek, back goes into the vault it was kept in.

**The view follows** (VV-D5): the explorer's unfolded folders are kept by their absolute paths, then given the new
vault's keys; a view holding the new vault stays, the folders down to the vault unfolded; one not holding it zooms out
to the common parent (§ Side panes); where the tree can't show the vault (its path has a hidden folder: a worktree in
`.claude/worktrees/`), the view moves to the vault. Started in a folder outside every vault (`slipbox /srv/x`),
Elsewhere's, or in `~`, home, nothing opens over the explorer: the launcher of D50 is gone.

**The named folders** (`space v v`, `:folders`, `folders.open`; `slipbox folders`), from anywhere: each by the name
pointers give it (`21.6`; D74) and the copy its links open here, those seen last first; `enter` goes into that copy. A
repository's worktrees are its branches, not copies: listed once. **Which copy** a folder's links open (`space v
shift+v`, `:folders-default`, `folders.default`; `slipbox folders default`): this folder's copies — its repository's, a
clone with a `.slipbox/` name of its own among them (DF-D30) —, else a pick of the folders with two. **Names** here, on
the top bar (the status line, while it's hidden), `space v i`, the Info view and messages are each vault's name as
pointers give it — its `.slipbox/` name, else its repository's remote's — else its path (`~/…`); a named worktree as
`name@branch` (`21.9`); home `~`; Elsewhere `Elsewhere`.

**The background auto-index** (`20.9`; D61): while nobody is working — no key or click for `index.idle_seconds`, no CLI
command from an agent as long, this vault's own index done — the TUI walks home a slice at a time and builds its
index, then indexes each vault found in it, so backlinks from vaults never opened appear by themselves (VV-D2;
[roots.md](roots.md) § Home, § The index). Its place is kept: it resumes where it stopped, and a pass done, the next is
a day later. `[index] background = false` turns it off, the TUI then walking home alone while home is open;
`slipbox index --home` runs it now.

**Moves made elsewhere** (`21.11`; D78): an editor, a file manager or an agent moving notes — seen by their text as they
go and come in one batch of the watcher's — broke links that pointed where they were: the relink is offered once for the
batch, its preview open (`old/plan.md moved to new/plan.md: 1 line of links broke — the relink, to look over`), nothing
written unasked; typing, or with something else open, it's a message instead. **A folder named the old way**
(`[[research:x]]`, `[t](research:x.md)`, when a folder this machine knows has that name) is no link: followed, it says
so, with the pointer that is one; `space c a` writes it (a markdown link, its heading or block kept).

**A named folder moved by hand** (`21.8`; D76): opened where it went — its id or remote at a new path, the one copy that
was elsewhere gone — its workspaces, scratch, trash and reading positions come along, nothing asked; a message says so
("`<name>` moved here from `<path>`: …came along"), and if the move broke links in or out of it, their fix is
previewed at once (`relink`'s, `20.17`). A worktree `git worktree move` took elsewhere is found by git's name for it.
Anything less sure — an unnamed vault, two copies gone — starts fresh.
**A second copy of a named folder** (`21.6`, `core/folders.ts`): opened where another copy of it is here too — one
`.slipbox/` id, or one remote — the TUI asks once "`<name>`: 2 copies on this machine — which do links to it open?",
the first found marked `links open it now`; the answer is remembered, and `esc` keeps the first, not asking again. A
copy gone (moved here, a drive unplugged) is no choice: not asked.

**A git repository is a vault by itself** (`20.3`), and so are an Obsidian vault and a zk notebook (`21.1`; D69): any
folder holding a vault marker (`walk.root_markers`). Opening a file in a repository opens the repository, from its top
— nothing asked, nothing written into it; a repository inside a vault is a vault of its own, its row marked in the
explorer. `.slipbox/` gives one settings of its own (`slipbox init`; `--private` keeps it out of git), and a name
pointers use when asked (`slipbox init --name`, `space v n`, `:name`). `space v m` (`:init`, `vault.init`) in a vault or
home makes the explorer's selected folder (or this note's) a vault of its own (§ Files in the explorer); in Elsewhere it
offers the folder opened a `.slipbox/` — "`<folder>` is a folder without .slipbox/ — give it one?" — committed with it
like any file, and the TUI goes into it with the note open.

## Renames (plans `17.15`, `7.1`–`7.4`)

`space n m` (`:rename <path>`, `:mv`) asks for the note's new path, the old one typed already — a folder there, or a
path ending in `/`, moves it into that folder ([links.md](links.md) § Renames and moves; DF-D4, DF-D21); the explorer's
`r` for the selected note's, file's or folder's new name, `m` for a folder to move it to (18.x, below); `space v n` for
the vault's new name; `space n h` for a new name of the heading the cursor is under (the outline's `r`, its selected
heading's; `11.9`); `space l r` (`:relink`) relinks this note's links broken by a move it saw (`20.2`); `:convert-links`
(`20.1`) makes every note's links plain paths (`:convert-links <note>`, one note's) — each link several notes answer to
a row of its own at the top, `pick notes/x.md:3`: `enter` lists its notes, and the one picked comes back as part of the
preview. Each shows its **preview** first (D143, D52, D63): a list of every line it changes, in every vault
(`notes/index.md:3 [plan](plan.md) → [plan](roadmap.md)`), with the git trees that already have changes and the links
skipped at the top; `enter` carries it out, `esc` leaves everything as it was. What it does is `slipbox mv`'s, `name`'s,
`rename-heading`'s, `relink`'s and `convert-links`'s ([cli.md](../../docs/manual/cli.md) § Moving, copying and
deleting). **Refused while a file it rewrites or moves is unsaved** (a moved folder's notes included). After it, the
open notes it changed are reloaded, and a window on a renamed or moved note shows it under its new path, its history
following — every note of a moved folder alike.

**Undo** (`7.4`; D152): `space v shift+u` (the explorer's `shift+u`, `:undo-rename`) takes back the vault's last
rename, move, naming, heading rename, relink, conversion to path links or replace in every note — made here or by the
CLI (`slipbox mv`, `name`, `rename-heading`, `relink`, `convert-links`, `replace --all`) — as `slipbox undo` does
([cli.md](../../docs/manual/cli.md) § Moving, copying and deleting): its preview first
(`undo: notes/first.md → notes/alpha.md`, each line the other way), then every file as it was and what moved back where
it was, open notes following it back. Refused when a file it wrote has changed since. The renames are a stack in the
vault's state (the last 20): undo takes the newest, and there is no redo; the rename is done again (D152). In a git
checkout each rename records its branch and is undone only there (`5.9`; D153). `u` puts back a delete; `shift+u` a
rename.

## Files in the explorer (plans `18.1`–`18.10`)

The explorer makes and changes files by keys and by buttons, on the selected row — a note, a file, or a folder
(D149):

- **New:** `n` a note (`space n n` too, as everywhere), `shift+n` a folder, in the selected folder or beside the
  selected file; the title's two buttons do the same (Nerd: a file and a folder with a plus; unicode `+`, `+▸`).
  which-key in a pane names its actions as help does ("New note here"), and a pane's own key sequence waits for its
  second key, whatever the note binds its first to.
- **Rename (`r`) and move (`m`):** `r` asks for the new name, in its folder (the old one typed); `m` picks a folder
  from a **tree** of the vault's (`18.8`): the vault first, each folder folded or unfolded as the explorer has it
  (whether or not it holds folders), the folder it's in unfolded and selected (marked `here`); `←` / `→` fold and
  unfold; typing filters to the matching folders under their parents,
  all unfolded, `enter` taking the first match. A folder being moved, and what's in it, isn't offered. Both go through
  the rename's **preview** above: every link to it — and, for a folder, to anything in it — fixed, links between notes
  that move together left as they are, what the walk doesn't list (pictures, hidden files) moving with its folder.
- **Delete (`d`):** asks first (a yes-or-no question: `y`), saying how many links from other notes will break, then
  moves it to the vault's **trash** (in its state, never in the folder). `u` puts back what was deleted last;
  `space v t` (`:trash`) lists the trash, `enter` restoring an item — refused when something is at its place again; its
  last row, **Empty the trash…** (`up` from the first; `trash.empty`, `:empty-trash`, opens the list on it), asks —
  "Empty the trash? Its 3 items go for good: none can be restored." — and `y` removes, for good, the items the list
  showed (one deleted since stays), as `slipbox trash empty --yes` does after its listing (DF-D14). The trash keeps
  nothing past 30 days: an older item is removed, its folder too, whenever the trash is next read or written — listed,
  restored from, deleted to (`core/files.ts`, `listTrash`, `TRASH_DAYS`). An open note deleted shows its last text,
  marked deleted; restored, it's reloaded. Refused while a note it takes is unsaved.
- **Copy, cut, paste (`y`, `x`, `p`):** `p` pastes into the selected folder (or beside the selected file): a copy —
  `name-copy`, `-2`… when pasted beside the original, the copy's links as written — or what was cut, moved (the
  preview, links fixed). Going into another vault forgets what was copied or cut, and `u`'s last delete.
- **The selected row's menu:** while the explorer has focus, the selected row has one button at its end, under the
  title's buttons: `…` (Nerd: three dots; ascii `...`). It opens a menu hanging from it (`.` opens it by key, from the
  row), titled with the row's name, each entry with its key in the explorer, which picks it there too: for a folder
  "Zoom
  in here" (`z`), "New note here" and "New folder here", then "Rename", "Move to…", "Copy", "Cut", "Copy path"
  (`shift+y`, the row's whole path), for a folder "Give it .slipbox/" (a nested
  vault's: "Make it part of the vault holding it"), "Paste … here" (when something is copied or cut), "Delete" (a nested
  vault's: "Delete the vault"). `enter` or a click does the selected one; `esc` or a click outside closes it. A name
  that doesn't fit beside the button widens the tree: the explorer's horizontal scrollbar appears, and scrolled to its
  end the name ends just before it.
- **A nested vault's row** (`18.7`) is a folder of this vault: `r` renames its folder and `m` moves it — links into it
  by path fixed here and in the vaults that reach it, its own relative links out fixed, its id and name kept (it's
  recorded at its new place); `d` deletes it whole, saying so ("the vault outreach (outreach/, 12 notes)") with the
  links into it — by path or by its name — that break. Its menu has "Rename the folder" and, beside it, "Name it"
  (`shift+r`, `R` in the menu): `slipbox name` for it, its folder left where it is.
- **A folder made a vault, and back** (`18.11`): `v` on a folder asks for the new vault's name (a distinct one typed:
  `halden-logs` for `logs/`), then a preview — links are paths (`20.2`): relative and filesystem ones reach across
  the new boundary as they are, and one written from the vault's top (`/…`) that would now mean the other vault is
  rewritten to reach what it did, shown there — a wikilink by a name across the boundary, or by a path from the top, too
  (`21.3`) — as `slipbox init <folder>` does ([cli.md](../../docs/manual/cli.md)); enter makes it.
  `shift+v` on a nested vault's row previews the way back (such links rewritten the other way), and enter puts its
  `.slipbox/` in the trash. The row turns
  into a vault's or a folder's, selected. In Elsewhere, `space v m` offers the folder opened a `.slipbox/` and goes into
  it (§ Going into a vault).

Every one of these has a leader key too, so which-key lists them (`18.13`): `space n` for a note (rename or move by
path, move, delete, copy, cut, `shift+y` a copy beside it), `space d` for a folder (new, rename, move, delete, copy,
cut, paste), `space v` for a vault (make one, make it part of the vault holding it, rename it, the trash, restore). With
the explorer focused they act on its selected row, elsewhere on the current note, its folder, or this vault — made part
of the vault holding it, it's left for that vault, the note still open. What they do is the CLI's `rm`, `mv`, `cp`,
`init` and `deinit` ([cli.md](../../docs/manual/cli.md)).

## Following links

The forms a link takes, and how each resolves, are [links.md](links.md) (D68); here, what following each does. A link
that leads out of the current vault — into another vault, a vault nested in this one, home or Elsewhere — peeks at
what it leads to, going there a choice (VV-D7; § The peek):

| Link | Following it |
| --- | --- |
| `[t](note.md)`, `[t](note.md#heading)` | opens the note, at the heading (by its slug or text) |
| `[t](#frag)` | jumps within the note |
| `[t](/docs/plan.md)` | from the vault's top (`21.2`); nothing there, the filesystem's path |
| `[t](plan)`, no extension | the file as written, else the note `plan.md`, else the folder (zk's links, `21.2`) |
| `[t](docs/)`, a folder | revealed in the explorer, unfolded and focused (out of the vault: going into its own) |
| `[t](not-yet.md)`, `[t](not-yet)`, a note not written yet | the new-note prompt, its name typed: `enter` makes it |
| a broken link whose file moved | says where it went (`17.12`): `space l r` relinks it — a move never resolves it |
| `[t](../other/x.md)` | another vault's note: a peek at it (`17.9`; VV-D7) |
| `[t](slipbox://notes/x.md#h)` | its folder's copy here (`21.7`), at the heading; not here: said; two: picked |
| `[t](slipbox://kestrel@agent/x.md)` | that branch's checkout or worktree; else git's file, read-only, `#h` unchecked |
| `[[name]]`, `[[name#h]]`, `![[dal.png]]` | within its vault (`21.3`): name, path or alias; a tie lists them |
| `[t](other.md#frag)` | opens relative to the note; `#^id` at the block (`20.1`); a bad `%` read as written |
| `[t](n.md#setup-1)` | the second "Setup" (GitHub's numbering); an id first (`{#id}`, `<a id>`), then text |
| `[[n#Setup]]`, `[[n#Install#Linux]]` | the heading by its text (several: the first, said); a path of headings |
| `[t](run.py#L42)`, `#L42-L50`, `#L42C5-L45C10` | opens the file at line 42 (as in a code comment's `run.py:42`) |
| `https://github.com/me/repo/blob/main/x.md` | this repository's own: the file in this copy (a backlink); else a URL |
| `https://…` | copies the URL; opening a browser over SSH would be wrong |
| `file://…`, `~/x.md`, `/home/me/x.md` (out of the vault) | a peek at the file, in whichever vault holds it |
| attachment `![x](x.png)` | copies the path (drawn under its link where the terminal draws images, 12.x) |
| a picture online `![x](https://…)` | `images_remote = "ask"`: fetch it — this once, or its site — then drawn (12.12) |
| footnote `[1]` | jumps to the definition |
| tag `#dome/shutter` | lists the notes with the tag (its nested ones too, `#dome/shutter/…`); enter opens one |

**Tags** (`1.6`): `space f t` (`:tags`) lists the vault's tags, each with how many notes carry it — a nested tag
indented under its parent, whose count includes its children's — and picking one lists its notes; `:tag name` goes
straight there. A note's tags are its frontmatter's `tags:` and the `#tags` in its text ([links.md](links.md) § Tags;
D53).

**Writing a link** (`21.5`; D83): `space l i` (`:link`) lists this vault's notes and files, the note itself not, and
writes a link to the one picked as the vault's convention writes one (`21.4`; `slipbox link`) — a markdown link with the
note's title as its text, or a wikilink by name where the name reaches the note from here, else by its path from the
vault's top — a top-level note's path being its name, a relative path (`../plan`). Typing, it goes at the cursor;
reading, after the word under the cursor (out of a link or a code span), a space before it, saved at once. Not in a data
or text file: links are written in a vault's notes.

**How a link landed** (D86): the status line's link under the cursor says it when a tie
decided it — `→ [[Pie]] (resolved, the shortest path of 2 named so)`; and a note coming or going that sends a link by
name elsewhere (a nearer `Pie.md`, a note named like an alias) is said in a message: `[[Pie]] in Home.md reaches
Pie.md now, not Recipes/Baking/Pie.md` — never only when a link breaks or heals.

A link landing on a line (`#L42`, a block's `^id`, a problem, a search hit) lands where that line is shown: in the
rendered view, a line inside a paragraph that wraps lands on the paragraph, not the block after. The backlinks list
shows a link from another vault by its path (`21.9`): from home (`~/app/design/plan.md`), else absolute; following it
peeks (§ The peek).

`enter` follows the link under the cursor, or else the row's first link; `ctrl+enter` (`space l t`) follows it into
a new tab, as a browser's ctrl+click does, and `ctrl+w f` (`space l s`) into the split; a link out of the vault peeks
there too. In source mode and inside
the lens, where rows are the markdown itself, `enter` and `space l f` / `s` read the link around the
cursor from the text (`[text](url)`, `![alt](path)`, `[[name]]`, `21.3`); in a text file, a URL or a path naming a
file of the vault (`16.10`); a click there places the cursor for editing. A click follows a link
only when it lands on the link: blank space past a row's end or below the note, which the cursor is
clamped from, follows nothing.

The explorer's and the outline's selections stay on the note or heading they select when an agent
adds or removes notes or headings (a selection is kept by what it is, not its row). A reading
position under a repeated heading (a log's `## Weather` entries) keeps its entry when one is
prepended: the anchor also records the heading's occurrence counted from the bottom and the row's
text, and keeps whichever count still finds that text.

## The peek

**Looking never moves you** (VV-D7; `tui/peek.ts`): a link that leads out of the current vault — into another vault, a
vault nested in this one among them, home, or a file outside every vault, by a path, a pointer or a wikilink — opens a
peek, never a switch (D50's switch on following a link is gone). So does a backlink from another vault (`space l b`,
`g r`), another vault's hit in the search widened with `ctrl+a`, and `ctrl+enter` or the split's follow on such a link.
`:e` with a path or a pointer, the explorer and `space v v` still go there: choosing, not looking (VV-D4; § Going into a
vault). A folder link out of the vault is revealed in its own vault, as before (D81), going into it, from a peek too.

- **The window:** the floating window (`3.20`) of kind `peek`, a virtual buffer of the file's text (`peek:<path>`,
  never read from or written to the disk again, never a place remembered), read-only (`a peek is read-only — o goes
  there, to edit it`). A note is rendered, a data or code file shown as its kind opens; a binary file isn't peeked at,
  said so. A file reached through a link its place hasn't followed isn't read: the peek holds `Not read here: … isn't
  followed in kestrel`, `t` keeps nothing, and `o` goes there, where opening it asks; a link of the current vault's on
  the way asks first, as opening it would ([roots.md](roots.md) § Links followed only when you say so). Its
  `elsewhere` holds its vault's name and the vault's graph and path there: the layout reads its links and
  embeds in that graph, and `followLink` resolves them there (`tui/actions.ts`). Its size: the screen's width less an
  eighth (at least four columns) and four more for its margin, and the main area's height less a tenth (at least a row)
  and two more, centred; `z` (`peek.fill`) the whole content area, no margin; again, back. Titled
  `kestrel › docs/architecture.md`, `~ › todo.md` in home, `Elsewhere › /etc/hosts` outside every vault, the path cut
  from the front when it doesn't fit (`peekTitle`), so the vault and the file's name stay; its bottom border `o go
  there · t keep as a tab · z fill · ctrl+o back · esc closes` (`z smaller` while it fills the screen, `ctrl+o back`
  while it has somewhere to go back to). The top bar keeps the current vault (the status line, while the bar is
  hidden), the status line's path being the peek's (`kestrel: docs/architecture.md`).
- **Keys:** the peek's keymap (`DEFAULT_PEEK_KEYS`, over the note's, not in visual mode): `o` `peek.go`, `t`
  `peek.tab`, `z` `peek.fill`; `esc` closes it (a find first), `q` too, as every floating window. `/`, the moves, the
  selection and `y` as in any rendered note. The keymap has no table of its own in the config: a key for its commands
  is bound in `[keys]`.
- **`o` (`peek.go`):** into its vault as a switch does (`switchVault`, at the cursor's place in the peek), the trail
  kept, so `ctrl+o` comes back; refused while a note is unsaved, the peek staying. Outside every vault, into Elsewhere,
  the file editable there (VV-D3). On a tab kept from a peek, from the palette: the same, into that file's vault.
- **`t` (`peek.tab`):** a tab here of the file (`buffer`'s path-keyed buffer beside the vault), at the peek's place. A
  file of another vault is read-only whenever it's open here (`markElsewhere`: `read-only here: kestrel's — go into
  kestrel to edit it`), the workspace's tabs bringing it back so; its tab marked `kestrel: architecture.md`, its links
  read in its vault. One outside every vault is read-only too (`read-only here: Elsewhere's — o goes there, to edit
  it`), marked `Elsewhere`; `o` goes into Elsewhere. Back (`ctrl+o`) from the vault gone into from such a tab goes into
  the vault it was kept in, its tabs.
- **Links inside it:** one to the peeked note's vault moves the peek there, the place left kept: `ctrl+o` back, and
  forward, inside the peek (`peekStep`; a file gone since is dropped, said). One to the current vault closes the peek
  and opens there, in the tabs, as a link does. One to a third vault, or outside every vault, moves the peek there too.
  A wikilink by a name that vault has no note of, or a path not written yet, is said, never made: notes are written in
  their own vault. In a file outside every vault, its paths are read from its folder (`b.md` as `./b.md`), its
  wikilinks said to need a vault.
- **Backlinks:** under a Markdown note, after a rule, `Linked from (n):` — each a link from the note's folder to the
  line linking here (`[~/notes/index.md:41](<../../../notes/index.md#L41>) — architecture`), followed as any link in
  the peek; a file's name holding `<`, `>`, `%`, `#` or a control character has them percent-encoded in the link, and
  a control character shown as its escape (`\n`) in its text; none: `Linked from: no note links here.`
- **Worked out on a thread** (D259; `core/backlinks-jobs.ts`, `core/backlinks-worker.ts`): the note shows at once, and
  meanwhile `Linked from: reading kestrel's index…` — or, its vault without an index here, `Linked from: kestrel has no
  index here yet — building it; they're shown when it's done.` The list takes that line's place, the peek laid out
  again, if the same peek still shows the note (a rename that gave this TUI a new reach meanwhile changes nothing);
  moved on, kept as a tab or closed, it's dropped. Back at a place (`ctrl+o`, forward), the list it showed there is
  shown again at once, the cursor on its row, until the thread's comes again. The list shows first; the graph here is
  caught up after. At each peek the thread opens the vault afresh: the links it follows asked first whether they answer,
  as the walk wants them asked (VV-D6; what one thread asked, another doesn't know); its walk, its index caught up with
  what changed since and written again, or built; then the note's backlinks, other vaults' links in among them, code
  comments' too (their grammars loaded there), a link another slipbox's index holds without a line left out. Its `Reach`
  records no root in the machine's list (`record: false`) but knows those it finds; the peek records the roots in and
  around the vault on the main thread, before asking (its reach's `nested: "none"`). The other vaults its links reach it
  reads alone (`readOnly`), this TUI's own among them: their indexes, their redirects and the commit they caught up with
  are written by their own requests, never there; nor is one parsed whole for a name (`thorough: false`), as where a
  link into one lands is no backlink of this note. A vault nested in it built for the first time is the exception — but
  not this TUI's own vault, which the request names (`own`). Each request carries what this thread knows, taken as the
  thread's own (`walkContext`, as the walk's threads' do, T12): the root markers your config names — else its walk finds
  other vaults than this one does — its environment, and the followed links' answers. One request runs at a time. A
  peek's newest waits behind the one running, an older one waiting dropped. A newer peek's request takes back what runs
  for another vault — its thread let go, what it parsed kept in the parse cache: a catch-up taken back waits again,
  after the peeks'; a peek's is answered null (its peek is gone), and its vault's catch-up asked again, to wait. What
  runs for its own vault it waits for: that work is its own, and the index it writes is read at once. A request taken
  back mid-run may have written its vault's index: the next answer for that vault that reads it says it was written. A
  vault is caught up once at a time: the catch-ups of a vault (a kept tab's, a graph reached for a link, each its own)
  ride on the request of that vault that runs, or that starts, every one answered by its one run, waiting again if it's
  taken back. The thread stopped (slipbox quitting, another vault gone into) asks nothing again. A temporary file older
  than an hour beside a vault's index, its redirects or its heads, left by a thread let go of mid-write, is swept before
  the next write of it (a write takes seconds; a network share's clock may be minutes off this machine's). Home with an
  index of another version's counts as none; one of this version whose every note changed since is caught up. An answer
  has no size cap: a note linked from thousands lists them all. The thread stops a minute after its last answer, when
  you go into another vault (whatever it works on is for the vault left, or for the one gone into, whose index is the
  main thread's from then on: what it parsed is kept in the parse cache), and when slipbox quits; it's started anew when
  the environment it was started in changed. Home without an index: `Linked from: ~ has no index here yet — o goes
  there, and finds them.`, none built — home's is built in slices while nobody works (VV-D2). Elsewhere's: `no backlinks
  in Elsewhere — it has no index; a note in a vault or home has them.` The thread failing: `Linked from: not worked out
  — <why>.`, and every request riding on that one hears so; the notes the graph here lacks are then parsed here, as when
  the index can't be written — home's excepted, the background index's (VV-D2).
- **Its graph here:** the graph the peek reads its links and embeds in is the one this vault reaches it by
  (`Reach.graphAt`, opened on the main thread: its walk and its index read), given a reach of its own. The TUI's `Reach`
  is never `thorough`: a link by a name the vault has no note of is laid out unresolved, not looked for by parsing the
  vault whole first. Instead, a graph it opens for a link whose index is behind its walk — notes it lacks, notes gone it
  still lists, their links counted here (`indexBehind`) — or that has none, is caught up on the thread, its index built
  (home's excepted; `tuiReach`'s `opened`), so a name only those notes declare is found a moment later (D259) — as is a
  third vault a peeked vault's links reach, held by that vault's reach. Not this TUI's own vault, reached from another's
  links: its index is its own graph's, and its state this thread's. A vault taken from the machine's list first (a
  search of every vault, a relink) is caught up once a link reaches it, and recorded as seen then. A graph opened anew
  for changed settings asks nothing more (`Reach.reopen`): its answer came just now. Home's notes a graph here still
  lacks (one come since the thread's walk) are never parsed here, nor asked again: they wait for home's next peek
  (VV-D2) — asking again would never end for a note slipbox can't read; nor is home's graph built again for them unless
  its index was written since the graph was built (`Graph.indexChanged`: by its thread, a run another answer rode on,
  the background index, the CLI), which may hold them. Each answer brings the signature of the walk the thread made (its
  notes' paths, mtimes and sizes, its other files, its folders, the vaults in it; the graph's own kept by its
  generation): when it differs from the graph's, or the graph has notes it didn't parse and isn't being parsed here, the
  links that vault follows are asked here too, and the graph is opened again in place from the index the thread wrote,
  its redirects read again (the thread may have found moves); the roots in and around it are found again only when the
  vaults in it changed, each found being recorded in the machine's list (a graph a link opened, with no reach of its own
  yet, is given one then, once, after its rebuild — not by an answer that changes nothing); and every view is laid out
  again: the peek's and a kept tab's read through it, and this vault's own notes may reach a note of it by a name it has
  only now. The answer brings the signature of the settings it was read with too, those a graph reads (its walk's: a
  theme or a key changed opens nothing anew): when they differ from the graph's, the graph is opened anew with them,
  every buffer reading through the old one given it (`Reach.reopen`; the vault gone, the old one kept), since a graph's
  settings are fixed when it's made. A vault's catch-ups run one after another, each against the graph held for it by
  then (this TUI's reach as it is then, or a peeked vault's), so an answer that comes while another's waits on its probe
  never opens anew a graph already let go of. A rebuild that fails leaves the backlinks shown. When that index couldn't
  be written, or the thread failed, its notes are parsed here as this vault's own are (`parseInSlices`, `tui/watch.ts`):
  a slice at a time, a big one on the parse threads, stopped once the graph is let go of. A tab of another vault's file
  — kept from a peek, back with the session — asks the thread to catch its vault up too, with its first view
  (`makeView`; a buffer read for an edit alone asks nothing, a split nothing more), its index built if it has none
  (`keepCaughtUp`). A rename that gives this TUI a new reach (a vault made or unmade, this vault's config renamed) gives
  every buffer of another vault's file that vault's graph as the new reach opens it, and asks its catch-up
  (`reachedAgain`), or none, its file no vault's other than this one any more (a vault unmade). The TUI's reached graphs
  write nothing of their vaults' here (`readOnly`): no index, no redirects, no commit caught up with, no `git diff` run
  here to find moves — but home's walk, kept as every graph on the main thread keeps it, never on the thread
  (`Graph.keepsWalk`). The thread does it all, off the keys, and each answer has the graph's redirects read again. A
  vault nested in this one without an index is opened and built on the thread, not parsed whole here (`nested: "open"`).
  Once the thread has written another vault's index — the peeked one's, or one nested in it it built (`others`), each
  stamped indexed in the machine's list — this vault's backlinks from other vaults are read again, the machine's list
  with them, whatever the indexes' mtimes say (a coarse clock gives a rewrite the mtime it had), and what's worked out
  from them (its `generation`: the Info view's count); every view is laid out again whether or not the graph there
  changed (`othersChanged`), and the explorer's rows are made again, a vault's saying whether it has an index. A third
  vault's graph, held by a peeked vault's reach, is caught up only while that vault's graph is held itself.
- **Mouse:** a click on a link out of the vault peeks; `ctrl+click` (`link.go`, the terminal's ctrl with a click) goes
  there at once, a peek skipped; within the vault it's a click. A click outside the peek closes it.

The git panel's files of another checkout open in the diff window, not a peek (§ Git), though VV-D7 and VV-D10 had a
worktree's file there in one.

Not done:

- The first peek into a vault opens its graph on the main thread, as `Reach` opens one: its config, its walk, its index
  read (never caught up with git there: its thread does that) — and again, from the index its thread wrote, when the
  vault changed. A big vault holds the keys while that's read (0.15 s for 5,000 notes whose index is 65 MB): a vault's
  entries sent between threads measured slower than read from disk (D259).
- A peek open isn't updated while its vault changes, nor is its graph watched: the next peek reads it as it is.
- A tab of home's file, home without an index here, reads its links as home's walk names its notes, their aliases
  unknown, until a peek into home once the background index has built its index: nothing parses home whole here.
- Each peek's thread reads every other vault's index again for the links into this one, and walks each vault its notes
  name (`[[name:note]]`), reading its index, though a link into another vault is never a backlink of the note; a cache
  across peeks, by each index's mtime, as the main thread's `Reach` keeps, is for later.

## Side panes: explorer (plan `3.7`), history, the git panel, Info, outline and footnotes

Each side has one panel, which shows one of its views at a time; its rail has a button per view,
bright while that view shows. Clicking a view's button shows the panel on it (and focuses it), or
hides the panel when that view already shows. Each view keeps its own position while another shows
(selection, scroll, sideways offset and filter text) and gets it back when it returns; on its first
showing the explorer reveals the current note and the history selects `here`. The explorer's rows
changed while it wasn't shown (a note revealed, the view zoomed out to hold it, its folder gone, a
path selected), its selection goes where they say when it returns (`Explorer.later`), not to the
index it had, another row's now — not in another vault, nor under a filter, whose rows (every note
matching it) are the same whatever the view; a path it's asked to select while hidden is looked for
in its tree, not under the filter of the view shown. The git panel keeps to its rows by what they
are (D261). The views are a
registry (`LEFT_VIEWS`,
`RIGHT_VIEWS` in `panels.ts`) and more will come on both sides, each with its own rows, drawing and
keys.

- **Explorer (left, `≡`): one tree, the view a part of it** (VV-D5; `tui/explorer.ts`). The view (`explorer.top`,
  absolute) is a folder: its rows are what's in it. In the vault open, the vault's own tree from there
  (`rootTree(sub)`): the walked notes, directories first, with the files `files.show` lists beside them — by default
  (`auto`) every text file in a repository, where code lives, and the data files (JSON, YAML, TOML, INI, CSV) in a notes
  vault (one with `.slipbox/`), shown with their extension and their own icon; `a` toggles to every text file and back
  (`16.5`, "Files beyond notes" below), `shift+h` to the hidden names too and back (below) — the walk's folders,
  nested vaults by their rows. Anywhere else — above the
  vault, beside it, in another vault, a nested one's folder — the folder is listed a level at a time, never walked
  (`outsideRows`): its folders, then its files as this vault's `files.show` lists them (`auto` worked out from the
  listed folder's own vault), hidden ones left out unless `files.hidden` is on, `.git` always (a busy folder is
  listed, VV-D8; below). Such a folder is read off the main thread (T12; `Listings` in `tui/listings.ts`,
  `core/listing.ts`), so one on a disk that answers slowly never freezes the keys or the screen: on one of two listing
  threads, apart from the walk's, its entries the explorer lists (a hidden name, while they aren't listed, never read)
  and what its rows and marks say of each (a folder or a file, where a link leads, a vault's key, name and branch, one
  you may not read, a busy folder) — a link's answer, and so its mark, still read here from the answers kept. Kept, at
  most 256 folders besides those the tree last showed (let go of once a tree is built, never while it's being built),
  a listing is read again in the background as the tree is built again once it's a second old, or under other
  settings (`[walk]`, `files.hidden`), its rows replaced only when it says something new (compared by a digest the
  thread makes of all they're built from: its entries, whether its vault is a notes vault, its links' scope), the
  selection kept on the row it was on — and a row the explorer meant to select in a folder not
  listed yet (`-`'s folder it came from, a note revealed: `Explorer.wanted`) selected when it comes, unless you moved
  the selection since. A folder moved is let go of, the folders it left and came into read again, and a file
  operation in the vault reads its folders listed this way again: an answer read before is dropped; one read under
  settings changed since (another vault gone into) is read again at once. Each entry is asked one access check, a
  folder its markers and, a busy name, whether it holds a note; another disk mounted there (the mount table, read at
  most every five seconds) is listed by its name alone, never looked at — a folder or a file as its folder's entry
  says (a file bind-mounted, a container's `/etc/hosts`). A listing has a whole walk's ten minutes, counted from when
  a thread takes it: one at a time on each thread, the others wait in one line, each going to a thread once it's
  free — never behind a folder that doesn't answer while the other thread is free. Stopped (the TUI quitting), a
  listing asked or waiting is refused, never a thread started again for it. Until a folder's first listing
  answers, nothing is under it; after 150 ms a dim `listing…` row says it's being read, and one that can't be listed
  says why, in `l`'s words (`can't read: it isn't there`; `can't read: no answer in time`): rows that only say
  something, never opened or marked. On one, nothing acts on its own path (opening, zooming, copying its path,
  renaming, moving, deleting, copying or cutting it, a vault made of it: `ON_THE_ROW`); the rest does as on any row of
  its folder (moving, folding it, a new note or folder there, a paste, a restore, the menu). One that failed is read
  again a minute later (`RETRY_MS`), not at every rebuild; a folder listed before whose thread gives no answer when
  it's read again stays as it was listed. A folder `l` refuses as its folder's listing said it (you may not read it)
  has that listing, and its own, read again (`Listings.again`), nothing else in its folder: one you may read now
  unfolds at the next `l`. A test's App, not the TUI's, lists at once here
  (`AppOptions.listOffThread`). There the vault open is a row,
  highlighted (`sidebar_active`), its tree under it while unfolded; another vault is a row with the vault's icon (`◈`,
  Nerd: a bookshelf; `17.13`, D51) in a folder's blue (`sidebar_root`, for `[colors]` to set; `sidebar_vault`, its old
  name, read as it: DF-D22), its name dimmed after the folder's when they differ, its branch among its marks (below). A
  row's path is its path in the vault for what the vault's own tree holds, else absolute (`outside`), and so is a
  folder's key in `expanded`; none of this vault's file operations act on an `outside` row (a paste, new note or new
  folder there says `another vault's folder: select a folder of this vault`), but one `walk.exclude` leaves out (D246,
  below). **It starts** at the folder opened
  (`slipbox x/y`: y, in vault x; `prepare`'s `folder`), set once the notes are open, so the note shown outside it leaves
  it be; opened on a note, at its vault. In Elsewhere it has no tree of its own: every folder is listed a level at a
  time, by its whole path, the view starting at the folder opened. **The breadcrumb**, on the row under the pane's
  title, says where the view is: `~` for home when the view is in it (else `/`, home by its name), then each folder
  down to the view and a `›`, the view always among them; a vault with its
  icon, the vault open highlighted, the view bold. Past the view, dimmed, the trail (`explorer.trail`): the folders it
  can zoom back into — the view zoomed out from, or where you went when it zoomed out by itself — kept while the view is
  on their way. Too long for the pane, the trail gives way first (from its end, its first folder cut short, kept while
  four columns are left), then the folders above the view, from the start, to `…`. A click on a folder of it zooms the
  view there (`xcrumb:<path>`). **Zooming** on purpose (`zoomTo`): `z` (`zoom_in`) on a folder or vault, a file's folder
  on a file; `-` (`zoom_out`, nvim-tree's and oil's key for the parent) a folder up, the folder left unfolded and
  selected; nothing above `/`, said. **By itself** (`zoomToHold`), only outward: going somewhere outside the view — a
  note opened, followed to, gone back or forward to, revealed (`space shift+e`), a folder link followed, a vault gone
  into — zooms the view out to the common parent of the view and the place, only their two paths unfolded (what was
  unfolded in the old view kept, every other folder folded), the trail at the place. Not for what the tree doesn't list
  (a hidden folder's file while hidden names aren't listed, `.git`'s always: `listedDown`), nor the scratch; the
  explorer's first showing, a workspace's tabs restored, and the filter's
  `esc` reveal the note only inside the view. **A folder gone:** the view and the trail go with a folder slipbox renames
  or moves (`followMove`, from `Renaming.apply`, as the folds do); one deleted, or gone outside slipbox, gives way to
  its nearest folder still there when the tree or the breadcrumb is built again (`keepToWhatsThere`), the view's said
  (`~/x isn't there any more: the view is on ~`). **Keys on a row:** `enter` (or a double-click) folds or unfolds a
  folder and the vault open's row, opens a note as a tab (or switches to the tab already showing it), goes into another
  vault (VV-D4; § Going into a vault); `l` unfolds any folder or vault in place, another vault's listed a level at a
  time, its rows not this vault's to change; `h` folds an unfolded folder or vault, else the folder holding the row
  (when it's a row of the view); `o` replaces the current window's note (on a folder, unfolds it), and `s` opens it in
  the split's other window. Moving the selection, or a click on a note, only selects; a click on a folder folds or
  unfolds it. New notes and folders, renames, moves, deletes, copies: "Files in the explorer", above. **Any folder you
  may read:** a folder you may not read says why when it's opened on, unfolded or zoomed into
  (`can't read ~/x: you may not read it (no permission)`), nothing unfolded; a file you may not write — it, or its
  folder, for the save's rename — opens read-only (`buf.readOnly`), said at once and when typing is refused
  (`notes/a.md is read-only: you may not write it (no permission)`). Gone with VV-D5: `..` and climbing above the vault,
  the other roots beside the tree (the one opened, those pinned, a loose file's folder: the view holds them now),
  `:pin-root` (`vault.pin_root`, its `roots.json` in the vault's state no longer read). Not done: Windows' drives and
  shares above everything (VV-D5), with native Windows; the breadcrumb's top is `~` or `/`.
- **What the walk leaves out, listed** (VV-D8; `tui/explorer-disk.ts`). In each folder of the vault's own tree the
  explorer shows — the view's, and each unfolded under it — what's on the disk that the walk didn't give is read
  (`fromDisk`), a link aside (§ Links followed only when you say so, [roots.md](roots.md)), and a hidden name unless
  they're listed (below). What the
  walk leaves out — `node_modules` and the other busy folders (D237: ignored, or no note at their top; a notes `build/`
  is the vault's own), what `.gitignore` or `walk.exclude` leaves out, home's
  skip list — is a row by its absolute path (`outside`, its `leftOut` the reason `exclusion` gives), listed a level at
  a time as a folder outside the vault, never this vault's to rename, move or delete, nor to make a note in (`a folder
  this vault doesn't index: select one it does`) — but what `walk.exclude` leaves out, your own setting, takes a new
  note, a new folder or a paste as a typed path into it does, said `not indexed` (D246: `Files.newItemBase` gives the
  row's folder when `Graph.notIndexed` says so of the row's path; a busy folder, a `.gitignore`'s, home's skip list or
  a vault there is refused as before); a file of it opens from the explorer, and by `:e` the same way (D249), never
  indexed; a note of it a link reached (`20.8`) is listed there, not under a folder of the vault's own. What it hasn't
  reached — a folder it couldn't read, home's folders before its walk, a folder or file come since the walk — is the
  vault's, by its path in it (`unwalked`), listed from the disk until the walk has it: so a top-level folder of home
  unfolded before home was ever walked lists what's in it at once. `rowPath` gives a path at or under what the walk
  leaves out its absolute path (a hidden one only in home); the view zooms out by itself to hold such a file
  (`zoomToHold`: only a hidden folder's isn't, `listedDown`), and the view's own folder can be one (`ownView` null).
  The busy folders whose names start with a dot (`.venv`, `.cache`) are hidden, listed only with the hidden names.
- **Hidden names, listed when asked** (D250; `files.hidden`, the explorer's `shift+h`). Off by default: nothing whose
  name starts with a dot is listed (`listsName`), as before. On — `files.hidden` in your config or a vault's, or a UI
  setting (`hidden_files`, `uiDefaults`) changed by `shift+h` (`toggle_hidden`, the command `explorer.toggle_hidden`,
  `:hidden`) or the UI settings' list, kept for the vault as the others are; it says `explorer: hidden files shown` or
  `… not shown` and keeps the selection on its row (`Explorer.toggleHidden`) — they're listed as the walk's other
  left-outs are: in the vault's own tree a hidden folder or file is a row by its absolute path, its `leftOut` the walk's
  reason — `hidden`, or `.slipbox`'s `always skipped`, said `slipbox's own folder` — whatever the walk knows of it (a
  hidden folder a note was made in, among `graph.dirs`, is only that row, the note in its rows); a folder of them
  listed a level at a time, the reason carried down. Listed a level at a time anywhere else (above the vault, another
  vault's, Elsewhere), a hidden name carries the same reason itself (`hiddenOut`). `.git` is never listed. So each is
  `⊘`, and the status line says `hidden` (D244). `rowPath` gives a path at or under a hidden name its absolute path
  while they're listed (in a vault; in home always), but a hidden file reached keeps its path in the vault. A hidden
  file opened from its row in a vault is reached (`20.8`; `reachHidden`, `Graph.reachFile`), as `:e` reaches it:
  indexed from then on, its row `●` — a reached file under a left-out folder is (`Graph.known`) — its folder still
  `⊘`, and hidden names hidden again, it stays in the vault's tree by its path there, as one reached always was; in
  home, whose walk never takes a hidden folder, and in `.slipbox`, it opens unreached. The walks — home's and
  every vault's — are unchanged: only what the explorer lists changes. The switcher, the explorer's filter, search and
  find list what's indexed, as for the busy folders: a hidden file only once reached. Hidden again, a view in a hidden
  folder (not the vault's own way to it) goes out to the folder holding it.
- **A row's marks** (VV-D9; `tui/marks.ts`, drawn by `drawTree`). At a row's right, in columns that line up: the
  index's state in the last (`indexGlyph`, `INDEX_ROLE`) — indexed `●` (`sidebar_mark`: dimmer than a name), indexing
  `◐` (`info`), not indexed `⊘` (`sidebar`), can't read `⚿` (a lock in Nerd; `warn`), a problem `⚠` (`warn`), ascii
  `*`, `~`, `-`, `#`, `!`; git's mark two columns before it (`5.11`; D154): a file's state — `M` modified, `+` new
  (untracked or added), `R` renamed, `!` in a merge's conflict (`git_modified`, `git_new`, `git_conflict`) — or a
  folder's with one in it (`markGitFolder`, `•`; `o` in ascii, where `*` says indexed); and, between the name and
  those, dimmed and ending a space short of git's column, what describes the row (`describe`): a vault's branch when
  it's a repository's top, a worktree's after `⎇`, a link's target and whether it's followed (`→ /mnt/disk/data`, then
  `not followed`, `just looking` or `not answering` while the walk doesn't go through it — in a folder out of the
  vault open, by the rule of the place it's in, unfolded only once asked; `Marks.describe`, from
  `Following.describe`), its place cut from the front to fit, the state kept (`RowMarks.fit`); a folder of home where
  another disk is mounted, `another disk` (VV-D2, [roots.md](roots.md) § Home). Each glyph is one
  column wide in every set (`core/glyphs.ts`, `mark…`); none is an emoji. A vault's other name stays after its
  folder's (`17.13`); a row with its menu's button shows no marks. The index's state: a folder of the vault's own tree
  is indexed, or indexing while home is unwalked, while the walk hasn't reached it (`unwalked`; past home's cap, not
  indexed), or while a note in it waits to be parsed (`app.indexing`, `graph.pendingPaths`); what the walk leaves out
  (`leftOut`) and every folder in it, unfolded there or zoomed into (`outsideRows` carries `leftOut` down, to a vault
  of its own), a busy folder anywhere (`busyFolderAt` for one outside the vault open: the rule of D237, asked once
  per row drawn), a link not followed or not answering, and a note too big
  (`walk.max_file_size`) are not indexed; the vault open's row is indexing while its index is built, else indexed;
  another vault's is indexed when its index is on the disk, indexing while the background index builds it
  (`AutoIndex.status.current`), else unmarked; a note or file in what the walk leaves out that was reached (a link to
  it, a hidden one opened) is indexed. A
  folder you may not list and a file you may not read: can't read; a link whose target isn't there: a problem. A file's
  row carries one only when it isn't its folder's. **Why a row is `⊘`** (D244) is said in words, never on the row —
  there's no width for it — but on the status line while the explorer's cursor is on it, and in Info for the file on
  screen (its row's reason, or its folder's): the rule that marked it says which it is (`Marks.index` gives the rule
  and what it read; `Marks.why` the words), never a second guess. A busy folder: `generated (node_modules)` when it
  holds no note at its top, `git-ignored` when its repository ignores it, both when both hold (`busyWhy`, D237's two
  things); a folder in it says the busy folder's name, carried down with the reason (`TreeRow.leftOutAt`). What
  `.gitignore` leaves out, `git-ignored`; `walk.exclude`; a hidden name listed (D250), `hidden`; home's skip list:
  `hidden`, `home's Downloads`, `a system
  folder (Library)`, `git's own folder`; `on another disk`; a link: `a link not followed` (looked at or not), `a link
  followed, its disk not answering`, `a link to a folder holding the vault`, `a second link to a folder followed
  already`; a note `over walk.max_file_size`; a folder of home past its walk's cap, `past home's limit of 5,000
  folders` (or its notes'). What the disk says of a row (`Facts`: access, a broken link, the
  size, a vault's index and branch) is read once per row drawn, again when the tree is built again: never for the rows
  out of sight, so the pane's width for its sideways scroll keeps the index's column for every folder and vault, and a
  file's mark only the disk gives may take a name's last columns. Never either for the row of a folder where another
  disk is mounted (VV-D2), nor by `rowPath` or a left-out row's check for a marker: one that stops answering would hang
  the tree. Unfolded, what's in it carries `another disk` down as any left-out folder's rows carry its reason, read as
  you asked; only a mount point's row says `another disk`. git is asked for its marks in the background, a moment after
  anything changed (a save, the watcher, a file operation, a branch switch, going into another vault — which drops the
  old vault's marks at once); asked while a question is still out, it's asked again once that one's answered, so a
  stage or a commit is never answered by a question from before it.
- **History (left, `◷`, `space h h`):** the active window's timeline, newest first: each place's
  note name and line, the current one marked `here` and selected when the view opens. A click
  selects an entry; `enter` or a double-click jumps there, the places before it becoming back and
  those after it forward. Under it, **recent here**: the notes read in other windows and
  tabs and in earlier sessions — every note with a reading position (`slipbox history`'s list),
  and every open tab's — not already in the timeline, newest first, up to `ui.history_limit` (100;
  0 lists none): each with when (the time today, else the day), or `tab N` when it's open in
  another tab; `enter` opens one in this window. The heading is stepped over. The history never
  scrolls sideways: a name too long for the pane beside its hint is cut (`…`), the hint kept.
- **Source control (left, `±`): the git panel**, by mouse as by keys, its keys shown (GIT-D8; `tui/gitpanel.ts`, the
  panel's state, rows, keys and footer, `app.gitPanel`; `tui/gitview.ts`, the working tree's sections;
  `tui/gitbranchview.ts`, the branches; `tui/gitreposview.ts`, the repositories; `tui/draw-git.ts`; `tui/gitmouse.ts`).
  `space g` (`git.view`) opens it and focuses it, again closes it, as `space e` the explorer (GIT-D12); the status
  line's mode chip says `GIT` while it has the keys. Shown again (opened, or its view picked on the rail), git is asked
  again about all it shows (`GitPanel.shown`). **Its top**, as the pane's rows allow: from 10 rows, the repository
  (`Git.repoName`: the vault's name, else the main checkout's folder's) and its branch, a click (`git:head`) the status
  line's branches; from 13, under it, where the branch stands — `↑5 ↓2 on main`, its own base's figures (GIT-D10;
  `↑0` shown too), then its upstream's: `↑1 origin/main`, `in step with origin/main`, `not pushed` (no upstream),
  `origin/x is gone`; `HEAD detached` when it is; from 18 (17 without that line), **the message box**: a frame titled
  Message, its text wrapped, its last three rows shown, `ctrl+enter commits` in it while empty; a click (`git:box`) or
  `i` (`message`) types in it (`GitPanel.typing`, keys to `messageKey`: typed, `backspace`, `ctrl+w` and
  `ctrl+backspace`, `ctrl+u`; a paste, every line), `ctrl+enter` commits what's staged with it in the background,
  as typed: a line starting with `#` is its own (`commitLater`, the box emptied when it's in), `enter` takes it to the
  floating editor, `esc`, `ctrl+c` and `ctrl+g` leave it, as a click anywhere else does. **The buttons**, flowing over
  as many rows as they take while eight rows are left under them (`buttons()`): Commit (and the count staged), Amend,
  Review (while a change isn't staged or a file is untracked), `Resolve N` (while files are in conflict), Pull (the
  count behind, once there's an upstream, not when it's gone), Push (the count ahead; Publish with no upstream), Fetch,
  Stash, and while a merge or a rebase is under way Continue, Skip (a rebase's) and Abort — each running its key's
  action; Commit with the box empty opens the editor, Amend starts from the box's text when it has one. Then the
  filter's row (`/`), the rows, and at the foot, under a rule, the keys of the row selected (`footer(row)`; with none,
  commit's and fetch's, and `shift+r continue…` while something is under way), or, under the pointer, a button's or a
  row's button's key and what it does (`pointedAt`), or, typing in the box, its keys.
- **Its rows** (`rows()`), each section under a heading that `enter`, a click, `l` and `h` fold (`GitPanel.folded`;
  the merged and older branches, the other repositories and home's folded to begin with): **Conflicts**, **Staged**,
  **Changes**, **Untracked** (`26.2`), a line saying `nothing uncommitted` when they're empty; **This branch against
  main** — what the branch changed against its own base, committed or not, its untracked files and conflicts
  (`changedLater`: the merge base, `git diff --name-status -M` against the working tree, the status's new files), asked
  again whenever git has news, none on the base itself; **This file: name** — Its diff against main (`git.diff`), Its
  history (`git.history`), Who changed this line (`git.blame`), for the note on screen in this checkout, not while
  filtering; **Branches**; **Other repositories** (VV-D10). Headings are rows: the selection moves through them, and
  on one, `s`, `u` and `d` act on its files (`sectionAction`), in one call of git's: Changes' and Untracked's staged,
  Staged's all unstaged (by path, never `git reset`, so a merge under way stays one), Changes' discarded after asking
  (`Discard every change that isn't staged, in 2 files? …`; untracked files stay; refused while one is unsaved). A
  heading's buttons are always drawn at its end: `−` on Staged, `+ ↺` on Changes, `+` on Untracked, `+ New` on
  Branches. Each file has its state letter in its colour (`M`, `A`, `D`, `R`, `U`, `?`) and its folder dim; a rename
  staged, `R old.md → new.md` (moved to another folder, both paths whole); `l` opens a file up into its changes (a
  staged file's against the last commit — a staged rename's against the name it had there, `textsOf` reading the
  last commit by `from` — a changed one's against what's staged, as on disk), `h` folds it; its diff (a click, `enter`)
  and the review (`v`) read the same texts. git takes each path as that file (`literalArgs`: `--literal-pathspecs` on
  the commands given paths only, never in the environment, which a hook would inherit), so `Why?.md` or `:a.md` never
  names another. A rename is unstaged whole, both its paths. A change is staged as `git add -p` does: the index given
  its text with that change made (`hash-object`, `update-index`), so nothing else in it moves. A file unsaved here isn't
  discarded: git works on the file on disk; an untracked file discarded goes to the trash, as the explorer's `d`. git's
  answer comes in the background, again whenever it has news; `23.6`'s guards apply in a vault not trusted (D175).
- **Its keys** (`[keys.git]`, `DEFAULT_GIT_KEYS`, actions `GIT_ACTIONS`): `j`/`k`, `g g`/`shift+g` move; `enter`
  (`open`) a file's or a change's diff in the diff window (GIT-D2, `showWorkDiff`: a staged one's against the last
  commit, a changed one's against what's staged, an untracked file's all added; `esc` back to the panel), folds a
  heading, opens up a branch or a repository; `o` (`go`) opens the file at its change, goes into a branch's worktree
  (a branch without one: its menu) or a repository, or into a checkout at a file of its own (VV-D4); `l`/`h` open up
  and fold; `s`, `u`, `d` stage (a conflict's file: marked resolved), unstage, discard after asking (on a branch, a
  worktree removed, a gone one pruned at once); `a`/`shift+u` everything; `c`/`shift+c` commit and amend (the box's
  message one commit at a time: `ctrl+enter` again before git answers is said, not run, `committing`); `f` fetch, `p`
  pull, `shift+p` push, `z` the stashes (`fetch`, `pull`, `push`, `stash`, each running `git.fetch`… so the palette's
  are the same); `v` the review (`review`), `x` the merge screen on the conflicted file selected (`resolve`), `shift+r`
  a rebase onto the base, or while a merge or a rebase is under way its continue, skip and abort (`rebase`; `continue`,
  `skip` and `abort` are actions with no key); `n` a new branch, `m` Merge… on the branch selected; `.` the row's menu;
  `/` filters files, branches and repositories by name — `enter` keeps the filter and acts on the row, `esc` clears it
  before it leaves; `q` closes, `esc` leaves. The explorer's keymap has none of git's: its `p` pastes and its `z` zooms
  in.
- **By mouse** (`gitmouse.ts`; each row a hot region `git:row:<i>`, its buttons `git:act:<i>:<action>` before it): a
  click selects a row and does what `enter` does, a double-click what `o` does (a heading, a branch, a repository only
  toggle; a click on a branch's line, label or buttons' row only selects); the pointer on a row (and the row selected)
  shows its buttons at its end — a working file's `+` or `−`, `↺` but on Staged and Conflicts, `⧉` its diff; a
  change's `+`/`−`, `↺`; a branch's file's, a "This branch against" file's and a repository's file's `⧉`; a
  repository's `›`, going in. A right click (button 2) opens the row's menu at the pointer (`GitPanel.menu`): for a
  file, its keys' actions with their keys, then Show it in the explorer, A note for the agent… (the scratch's capture
  of the file at the change, `formatEntry`, typing after its note), Copy its path; a branch's, a repository's, their
  own; a heading has none. The glyphs are `Glyphs.git`'s (`● ⎇ ✎ ◆ ✓` marks, `+ − ↺ ⧉` a row's buttons, `✓ ⟳`
  commit's and fetch's; ascii `* & ~ ! =`, `+ - x d`, `* @`).
- **Its rows by what they are, not where they were** (D261; `tui/gitsteady.ts`, `Steady`, as `GitPanel.steady`): each
  row has a key whatever its place (`rowKey`: its kind and what it's of — a file by section and path, a branch by name,
  a change by its lines, hashed, so one edited is another; rows alike, such as two changes alike in a file, are told
  apart by their order, `keysOf`, as `watch.ts` tells headings apart). As git answers, rows come, go and are sorted
  under the pointer and the selection, and the panel keeps to them: **the selection** stays on its row, moved to its new
  place — scrolled to, unless the wheel scrolled the panel away from it (kept as it is) or the pointer rests on the rows
  (its row's line wins); every writer goes through `GitPanel.select` (a key that moves it, which shows it though the
  wheel had scrolled the panel; a key that acts on its row, a click, a right click, the panel following a file staged to
  where it went) or `place` (the panel's own pick, kept at its place: its own keys, `esc` and the filter leave it
  there); one that doesn't say (a view's selection restored) is taken as it is, and the explorer, revealing a note while
  it isn't the view shown, leaves the panel's selection alone, as the panel, answering while the explorer is shown (a
  file staged followed), puts its own where it comes back to (`leftPositions`), finding its row among its own rows
  (`GitPanel.filter`, the panel's filter, not the explorer's). A row gone a moment (a file's changes while git's answer
  is read again) is still the one, the selection back on it when it's back, for a second (`A_MOMENT`); longer, the row
  in its place is the selection's, and one back after longer with no frame drawn meanwhile is let go of all the same;
  the moment is the row's (`lost`: its key, and since when), so another row picked meanwhile — by a key, the panel, or a
  writer that didn't say — starts afresh. Of another repository (outside one, another folder's list: the view's once its
  repositories are found, the last one's drawn until then, `RepoView.listedDir`), nothing selected or pointed at before
  is looked for, between frames too (a key or a click before its rows are drawn does nothing, but on a pick made there
  since, which its first frame follows too); in a checkout, the explorer's view changing changes nothing, its rows the
  checkout's; another note open changes nothing (This file's rows are known by what they do). **The row under a resting
  pointer** stays on its line (`settle`): the pointer holding the rows (on them, not their scrollbar's column, reported
  since they showed, the mouse on), the scroll is set so that row is where the last frame drew it, past the list's end
  if it must, blank under it until the pointer leaves — not when the view was scrolled, filtered or navigated by a key
  since, nor in another repository, nor when its line is no longer the list's (the panel's top grew over it). Gone from
  the rows (a file staged by its `+`), it isn't kept for: the rows move as they come — kept in place, the rows arriving
  above it, the Staged a file goes to, would go out of sight. Below the last row, the last is kept where it is, so no
  row above it comes under the pointer; one gone a moment is kept to while the pointer doesn't move, the moment its own
  (an earlier row's goes with its anchor). Rows gone above it at the top, it moves up. **Between frames**, a click, a
  right click and the footer take a row's hot id (`hotRow`) to the row the last frame drew there (`rowAt`, `hotNow`),
  and a key to the row drawn selected, the panel's own pick too (or the row set since), the filter's `enter` too; a row
  gone since does nothing, and says nothing (a new branch from a branch gone; any other row gone, `n` starts one from
  HEAD, and `resolve`, as its button, opens the merge screen on this note when it's in conflict, else on the first file
  in conflict). A key that moves the selection moves it from there; the panel's own keys leave it, and its pick, as they
  are. After each frame what's under the pointer is worked out again from where it last was (`Mouse.rehover`, § Hover),
  and drawn again when it isn't the row the frame drew by (`gitHover`), so its hover is the frame's. Scrolled past the
  list's end, the scrollbar counts the blank, and the wheel down, with nothing more to show, leaves it as it is.
- **The Branches section** (GIT-D9; `gitbranchview.ts`, `core/gitbranches.ts`): the local branches
  (`branchesLater`: `for-each-ref` with each tip and its date, `worktree list --porcelain -z` for where each is checked
  out — a folder's name may hold a line break; a git before 2.36 refuses `-z`, and the list is read as lines then,
  which form a git takes asked once and kept by its path (`worktreeRecordsLater`) — a folder gone marked `prunable`),
  ordered by `orderBranches`: the branch here (`●`, `here`, by the folders' real paths), those checked out in a
  worktree (`⎇`), those touched in 30 days (`OLD_MS`), the newest first; then folded under **Merged or older (n)**
  those merged into their base and the older — never one here or in a worktree. Merged is asked once a base
  (`for-each-ref --merged=<base>`: a branch merged into its kept base, else into any of its candidates, never the
  `main` or `master` fallback). Each row's figures, asked for the rows drawn (`statsOf`, again when git has news):
  `↑ahead ↓behind on base` (`rev-list --left-right --count base...branch`, against each candidate, the nearest kept), a
  worktree's uncommitted files `✎n` (`status --porcelain` there; here, the panel's own), `◆` for a worktree's work to
  review (uncommitted, or ahead and not merged), `✓` merged, `folder gone`; short of room, the base's name goes first,
  then the behind, the name kept to 28 columns. **Opened up in place** (`opened`): its worktree's folder (or `its
  folder is gone`), its buttons — Open (into the worktree, VV-D4, at the note open here when it has it), or Check out
  here (`beforeCheckout`, `git switch`) and Open in a worktree (one made in `[git] worktrees`'s folder, or one typed,
  then gone into); Merge…; Remove… for a worktree; Prune for a gone one — always in the same places, so a click never
  lands on one moved under the pointer; then its worktree's uncommitted files (`Uncommitted (n)`) and its commits'
  files against its base (`Against main (n)`, `git diff base...branch`), each a diff in the diff window (against the
  merge base, a renamed file's under the name it had there and titled `old → new`, or, uncommitted, the worktree's
  last commit). A file read from disk for a diff (`readForDiff`, the working tree's and the repositories' too) is read
  as git keeps it: a link is the path it leads to, never followed; past 8 MB, or not a regular file, it isn't read and
  the diff says why. Its menu (`.`, a right click): its buttons' and Compare
  against…, A new branch from it…, Copy its name.
- **A new branch** (`n`, `+ New`; `newBranch`): its name (`check-ref-format --branch`, said when git won't take it),
  where it starts (this branch, the bases listed there are, every other branch, or a commit typed; `n` on a branch's
  row, and its menu's A new branch from it…, start from that branch without asking), and where it goes: In a new
  worktree (the default, `worktreeFolder`), In a new worktree, in another folder…, Check it out here (unsaved notes
  first), Just make it. In a worktree, one command, `git worktree add --no-track -b <name> -- <folder> <from>`
  (`newWorktreeLater`): git makes the branch before it looks at the folder, so a branch it made for a folder it then
  refused is deleted again; else `git branch --no-track <name> <from>`, then `git switch` (no hook in a vault not
  trusted, `gitArgs`); its base kept (`keepBase`); it's opened up and, once a list of the branches asked for since is
  shown (`listed`; with git's news faster than it lists them, an answer overtaken by a newer question is shown meanwhile
  — never one from before, a failure or another repository's), selected, its section unfolded to it (one just made from
  its base is merged, so folded with the older ones) — with the git panel showing, nothing done in it since the branch
  was asked for (`GitPanel.touched`, a key, its filter's too, a click or the wheel: the panel keeping its selection
  within rows that went isn't you), the Branches shown and the panel's filter matching it; else it's left as you put it.
  Selected, it's brought into sight (the panel unpinned). A checkout — a switch, a worktree made or removed — runs in
  the background (`checkoutLater`) with ten minutes to finish, not fifteen seconds: a big tree, or a trusted vault's LFS
  filters, take a while; stopped, the message says what it may have left (a worktree half checked out, a folder partly
  deleted). Refused, git may have done some of it, so the branches are asked again all the same: a worktree removed and
  its branch kept (`git branch -d` asks for it to be merged into its upstream, or, with none, here — not into its base);
  a worktree made by Open in a worktree and refused by a hook once checked out; a branch made and its switch refused,
  shown as a made one is, HEAD seen at once either way (a hook can refuse once it's switched); a worktree stopped
  partway, or refused by a hook once checked out (`git branch -D` can't delete the branch a worktree has), whose branch
  is still there (`newWorktreeLater`'s `left`: a branch there before is never one it made) keeps its base and is shown,
  git's refusal said and nothing claimed done. What git answers is drawn as it lands: a message asks for its own frame
  (D263), and a list opened once git answers asks for its own (`Overlays.openListLater`: Compare against…, Remove…'s
  question, Merge…'s menu). An answer that comes once you've gone into another vault only says itself — nothing gone
  into, opened up or selected there (`still`: `Vaults.visits`, counted each time a vault is gone into, so one gone into
  again is another visit) — and a list opened once git answers never opens while something else has your keys since it
  was asked (`Overlays.busy`, where `Input.dispatchKey` sends them: a question, a key sequence begun, a window over the
  note, typing in a note, the commit's message or a filter, a command of the note's waiting for its next key (an
  operator, a count, `f`'s character), visual mode, resizing panes — not where they went as it was asked), where a key
  meant for that would answer it: it says so, and you ask again. Nor is a worktree made by Open in a worktree gone into
  then: `o` goes into it.
- **Remove…** (`remove`): refused, said why, for a worktree with uncommitted files (`not removed: ~/x has 2
  uncommitted files — commit or discard them there first`) and for a branch not merged into its base (`… isn't merged
  into dev — 1 commit of its own; merge it first`); else asked — Remove it, keep the branch; Remove it and the branch
  (`git worktree remove`, no `--force`; `git branch -d`). git deletes a worktree's ignored files with it, unasked, and
  an ignored note is still the vault's (D61): never refused for them, the question names them — `also deletes 2
  ignored notes and 1 other ignored file: local/draft.md, local/b.md, .env` (`ignoredLater`: `git status --ignored`,
  an ignored folder looked into, links not followed, a thousand files at most; a busy folder's, such as
  `node_modules` or `dist`, never listed). The worktree you're in — by the folders' real paths, so one opened through
  a link to it too (`realPath`; a branch is `here` the same way) — and the main checkout aren't removed from here.
  **Prune** forgets the worktrees whose folders are gone (`git worktree prune`).
- **Merge…** (`mergeMenu`): The links it would break (`showMergeReview`, `20.21`, against the branch's own base), Merge
  it — run where the base is checked out, here (unsaved notes first) or in its worktree (`git merge --no-edit`, in the
  background; in a vault not trusted no hook, `commit.gpgSign=false`); a conflict said, `git merge --abort` named — or,
  checked out nowhere, said so; Into another branch… among those checked out here or in a worktree.
- **The repositories in the view** (VV-D10, GIT-D11; `tui/gitreposview.ts`, `core/gitrepos.ts`) are found under the
  explorer's view (`explorer.top`, else the vault) three folders down (`reposUnder`, `REPO_DEPTH`), 2,000 folders at
  most, in the background: not into a hidden folder, a busy one (`busyFolderAt`, VV-D8, D237) or a repository, whose
  folders are its own; a checkout's `.git` makes it one, and a worktree found beside its main checkout is grouped under
  it, by its repository's shared git folder (`groupRepos`, `repoKey`). Found again each time the panel is shown
  (`RepoView.again`). **In a repository**, its own panel, and after it, folded, **Other repositories (n)**: the view's
  others; on their rows, their own keys (`enter`, `l`, `h`, `o`, the menu) are theirs, the panel's (the message, commit,
  fetch, …) the panel's. **In a vault that isn't one** — home, a vault without git, Elsewhere — they're the panel: a
  line saying `~/work holds 3 repositories` (or that it holds none), then each repository's row; in a folder of home,
  the view not home itself, the rest of home's repositories (looked for from `~`) folded under **More in home (n)**.
  Each row says, at its end, its checkouts' uncommitted files (`✎n`), its main checkout's ahead and behind its upstream,
  or `clean`, `◆` when a worktree has uncommitted files, `asking git…` meanwhile: `git status --branch` asked per
  checkout (`checkoutStateLater`) for the repositories drawn and the checkouts of those opened up, again when git has
  news or the panel's shown again. **Ordered** by what needs attention, as far as git has said (`attention`): a worktree
  with uncommitted files, uncommitted files, ahead of or behind the upstream, clean, then not asked yet; then by name.
  **Sorted so only as the panel's drawn** (`GitPanel.drawnRows`), and not while the pointer is on the panel's rows
  (D261): on a row or between them, where the last frame drew them (`gitRows`, against where the mouse last said it was,
  `Mouse.at`), the mouse on, and reported there since the rows showed and since the mouse came on — a pointer that
  hasn't moved since holds nothing. Until then a repository stays where it was drawn, under the pointer, and for a key,
  a click or the footer between frames (`RepoView.ordered`: the order last drawn for the folder they were found in, so a
  view still showing the last one's list keeps it, and its own is sorted). The repositories the filter hides are ordered
  too, in their place when it's cleared; a folded section's aren't sorted; one found since comes after. The hold ends
  when the pointer leaves the rows or the mouse is turned off, never on a key. Sorted differently, the selection stays
  on its row — a repository's, or a checkout's or a file's of one opened up, as the last frame drew it — and scrolls
  into view; where the panel put it (`place`: the first row when it's shown, the filter's first match), it stays in that
  place until a key moves it, a key acts on its row, or a click picks one (`select`); `esc`, the filter and the panel's
  own keys (commit, push, …) leave it there. Rows that come or go are kept to by what they are, as all the panel's rows
  are (above: its rows by what they are). **Opened up in place** (`enter`, a click): each checkout's row, the main one
  `●`, a worktree `⎇`, by branch and folder, and its uncommitted files, each a diff against its last commit in the diff
  window. **`o`** goes into a repository (its first checkout), the checkout selected, or a checkout at the file selected
  (`switchVault`, VV-D4); `enter` on a checkout too. The filter keeps repositories by name. Not done: the panel asks
  again when it's shown, not when the terminal gets the focus back (VV-D10).
- **The branches' menu**, from the top bar's branch (`top:branch`) or the status line's (`status:branch`), in a
  repository: the branches list (`openBranches`) with Pull (while
  there's an upstream not gone; its count when behind), Push (or Push, and track it on origin), Fetch and The git panel
  before the branches. A switch refused (`checkedOut`) still reads HEAD and the files again: a hook can refuse once
  it's switched.
- **A change's sign in the gutter**, clicked (`gsign:<line>`, GIT-D12): a menu at the sign — `line 12, against what's
  staged`, Revert it (`r`, `revertChange`: as `git.change_undo`, unsaved, one undo step), Stage it (`s`, `stageSign`:
  the index given the change's lines as they are now, an untracked file staged whole, refused while the file is
  unsaved), then the change's lines, `-` and `+`, eight at most.
- **Commit** (`26.3`): `c` (or Commit with the box empty) writes the message for what's staged in the floating editor,
  `shift+c` amends the last commit (its message to start from); `#` lines say what's staged and are left out (when a
  line of the message to start from begins with `#`, the guide's begin with `;`, or the next of git's marks:
  `commentFor`, as `core.commentChar = auto`), `ctrl+s` commits (in the background: a hook can take a while), `esc` or
  `q` leaves it, and the focus goes back where it was. An empty message, or a hook refusing, is said in git's words and
  the editor stays. In a vault not trusted the commit's hooks don't run and it isn't signed — the repository's own
  config could name what runs — and both the editor and a message say so.
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
  stays the flat quick-open across the vault.
- **Info (right, `3.19`):** what the file on screen is — the right panel's views all show that file, and follow it.
  Sections that fold (`h`/`l`): **File** (its path, the vault it belongs to — home, or Elsewhere — its kind, size,
  modified time, words and reading time, lines, encoding and line endings, saved or not; `index`, only when it isn't
  indexed: why, as the status line says it of its explorer row — its own `⊘`, or its folder's, D244; a file no row
  lists, under a hidden folder (`.git`, home's `.config`), as its row would: the walk's reason for its path, D249),
  **Properties** (the frontmatter's keys and values, nested maps indented under their key), **Tags** (its own,
  frontmatter's and text's), **Links** (links and how many are unresolved, backlinks, headings, footnotes, tasks done;
  how links are written here, `21.4` — `writes`, its `path` and `.md`, then `from` what said them, or each part's
  source after it, `y` copying it whole). `enter` opens what a row names: a property's line in the frontmatter
  (source mode: its own line; rendered, the row that shows it), a tag's notes, the links or backlinks list, the outline
  or the footnotes view; any other row copies its value, as `y` does. The vault's own information — its name and the
  other copies of it this machine knows (`21.6`), its notes, index (when it was written, what was reached outside the
  walk, `20.10`; home's cap) and watcher, the background index — is `space v i`'s window: a vault isn't a file. Names
  are a column a third of the pane at most, values cut to it (no sideways scrolling). `/` filters (see Filter). `space
  n i`, the `ℹ` button, `slipbox stat` (its `root`, `name` and `properties` too). `e` edits the properties (below).
- **The properties editor** (`3.20`; D151): `e` in the Info view, or `space n shift+p`, opens the note's frontmatter —
  YAML or TOML, as the note has it — in a floating window over the others: framed, titled "Properties — note (YAML)", as
  tall as its text. Inside is a window like any — a view of a buffer that isn't a file — in source mode, with every
  editing key there is; the keys and commands act on it while it's open. `esc` (in normal mode), `q` or `:q` close it,
  writing its text back when it changed, and a click outside its box does too (that click does nothing else: a tab or a
  pane under it isn't reached); `ctrl+s` (`:w`) writes it back and keeps it open, as does `:wa` (after a yes to a
  question below too). Quitting (`ctrl+q`, `:qa`, `:x`) closes it first, writing back — `:q!` doesn't. The write is one
  edit to the note — its text goes back over the frontmatter's bytes as one splice, never parsed and re-serialised
  (`7.6`; D148), one undo step there — and the note is saved. A note without a frontmatter gets one first; an emptied
  one is removed. Text that doesn't parse asks before it's written (no keeps you editing, and the app open), as does a
  frontmatter changed in the note meanwhile. Following a link from inside it closes it first, as do a split and "in the
  split": they're of the window under it. A note deleted on disk, or not valid UTF-8, has no properties editor (nor is
  it written into, gone meanwhile), as typing into it is refused. Never a reading position, nor in the history.
- **The scratch** (`8.3`; D229): `space s s` opens it as `[capture] open_in` says, or the UI settings' Scratch opens.
  `"float"`, the default: a floating window framed as the properties editor's, but of the scratch's own file and a
  window like any inside — rendered, the lens to edit it, `ctrl+k` its markdown — three quarters of the screen and in
  the middle of it, its size fixed as entries come. `q` or `:q` close it, back where you were, what was typed saved (a
  save refused, the file changed on disk meanwhile, keeps it open); `esc` ends a selection, a find and the lens first,
  as in any window, and closes it last. `"right"`:
  the tab's window on the right, side by side — in a split already, its other window takes it — and `q` there closes
  that window, saving it too. `space s r` opens it on the right whatever the setting. The scratch's file is made,
  empty, when it isn't there yet: it opens to be typed in before anything is captured. A capture in the TUI (`space s
  a`, a code cell's `space k s`) opens it on the new entry — `**At:**` its reference, its lines fenced, `**Note:**`, a
  rule (`---`) before it when there's anything above — typing after `**Note:**` in the lens (or the source, as `[editor]
  edit_in` says); on the right, the cursor goes there. A `**Note:**` left empty is dropped as the scratch closes, as the
  TUI adds the next entry, and from `space s y`'s copy (`dropEmptyAsks`). What `slipbox capture` adds, the same shape,
  shows in an open scratch (the file is polled) and opens nothing.
- **Outline (right):** the current note's headings, indented, foldable (`h`/`l`). While not
  focused it follows the cursor's section, and `enter` jumps to the heading.
- **Footnotes (right, `3.17`):** the current note's footnotes, in the order the note first refers to them (as GFM
  numbers them), then the ones nothing refers to: `[label]` and the definition's text (the definition's label), and
  at the right how many references it has (`2×`), `unused`, or `no definition`. `l` unfolds a footnote into its
  references, each with its line and that line's text; `enter` (or a click) jumps to the definition or that
  reference — in a rendered window onto the reference or definition as drawn, in source mode to the text. While not
  focused it follows the cursor: the footnote the cursor's line refers to or defines. It never scrolls sideways: a
  long row is cut, so its count stays. `/` filters (see Filter). `space n f`, its button, `:footnotes`;
  `slipbox footnotes <note>` gives the same ([cli.md](../../docs/manual/cli.md)).
- **Adding and changing footnotes** (`3.18`; D150): they're the note's own markdown, GFM's — `[^N]` where it's cited
  and `[^N]: text` at the end, as Obsidian writes them. `space n shift+f` (or `a` in the footnotes view, or the `+` on
  its title) asks the text in a question and adds both: `[^N]`, the next free number — one past the highest numeric
  label — after the word the cursor is on — while typing, at the cursor; in a rendered window, that word found in its
  paragraph's source by how many times it came before, since a rendered row knows its source only by line (never
  inside a link's or code's syntax: after it); `[^N]: text` into the block of definitions that ends the note, after
  its last, else after a blank line. Definitions are never reordered. In the view, `e` edits a footnote's text (its
  definition becomes one line), `r` renames its label in every reference and its definition, `d` deletes both after
  asking: each changes the text it names and nothing else. Each change is one undo step and is saved at once, as a
  task's tick is; the cursor stays where it was. A CRLF note's new lines are CRLF. A note
  deleted on disk, or not valid UTF-8, is refused (`… — not editing`), as typing into it is.

Each pane starts with its view's title ("Explorer", "History", "Source control", "Info", "Outline", "Footnotes") and a
blank row before the list — the explorer's breadcrumb, there — panes under 8 rows skipping both. The explorer runs from
under the frame's top rule, beside the tab strip. The outline starts right under the tab strip too, beside the note's
windows: their headers and rules stop at its border (which meets the header's rule in `┫`), and its title sits
level with the window header. The outline's button (`▤`) is on the right rail, bright while the outline is open.

**The rails** (`ui.left_rail`, `ui.right_rail`, both on by default) are columns of buttons at the
edges, one button per row from the top. Each is a tinted column (the `rail` role, a shade darker than
the page), 3 columns wide, with no border: the frame's rules run over it unbroken. Without colour
(NO_COLOR) there's no tint, so a rail is 4 columns with a border on its inner side, joined to the
rules it meets. Each is generic: a place for buttons, whatever they open.

- **The left rail** runs from under the top bar's rule to the frame's bottom rule, its first button level with the tab
  strip. It holds the left panel's views, the explorer's `≡`, the history's `◷` (ascii `~`) and source control's `±`
  (ascii `+`), the panel opening beside it. Without it, `≡` is the top bar's and the history opens with `space h h`.
  (The Problems panel, at the bottom, opens from the status line.)
- **The right rail** runs from under the tab strip's rule, its first button level with the window header. It holds the
  right panel's views: the Info's `ℹ` (Nerd: an i in a circle; ascii `i`), under it the outline's `▤`, then the
  footnotes' superscript (Nerd: `x²`; unicode `¹`; ascii `^`); the panel opens beside it. Without it, `▤` sits at the
  window header's right end, and the Info and the footnotes open with `space n i` and `space n f`.

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

Both are windows for `ctrl+w h` / `ctrl+w l`, and each has its own keymap: `[keys.explorer]` (the history's too),
`[keys.git]` and `[keys.outline]`.

**Narrow terminals (plan `3.14`).** Below `ui.narrow_width` (90) columns (and never beside the note below 50, the room
for both panes and the note's 24), and in zen mode, both panes open over the content on demand (6 columns wider than
their width, leaving at least 6 of the note) and close after a pick. The wide-terminal preferences (`ui.sidebar`,
`ui.outline`) are kept separately, so widening the terminal brings them back. Tables that cannot fit become records
([rendering.md](rendering.md) § The table allocator). Click targets under an overlaid pane (a breadcrumb heading, the
`▤` button) are off while it's open, and the rules it covers stop at its border, which joins them with `┳`, `┫` and `┻`.
Over the note, a pane's border and margin belong to it (clicks there focus it); the side panes take clicks and the wheel
before the note's borders and scrollbars, and the outline, drawn over the explorer, before the explorer.

## Overlays

One list component serves every picker. Like every floating window, it has a margin in its own
colour around its border, one row above and below and two columns at the sides, since a cell is
about twice as tall as it is wide (the explorer and outline over the content get two blank columns
past theirs), so the content behind never runs up to the edge.

- **Pickers:** quick switcher, heading picker, links, backlinks, history, tabs, theme and glyph
  pickers (with live preview, D95; `esc` restores), UI settings, messages, info, and keys. The quick
  switcher lists recent notes and files first (kept for the vault), the previous one on top, so
  `ctrl+p enter` goes back. A query starting with `#` (VS Code's) lists the workspace's symbols instead
  (`19.14`): in a code file, its servers' (`workspace/symbol`), asked as it's typed, each with its kind and
  `path:line`, the last query's answer the one shown; in a note, or where no server gives them, the vault's
  headings, slipbox's own symbols. `enter` opens the file there. Find in every
  note (`ctrl+shift+f`, `space f g`) lists each line with the text or regex as `path:line` with the
  line, an open note searched as it is now. Its question takes the window's find toggles, said in it: `alt+r` and
  `alt+w` flip them there.
- **Replace in every note** (`25.4`, D155; `ctrl+shift+h`, `space f shift+r`): what to find — the window's find, or a
  selection on one line, typed already — then what with, then the rename's preview of each line it changes in every
  note and every file the explorer shows (`slipbox replace --all`'s, `--files` as the explorer has them). `enter` does
  it, `esc` leaves everything; `space v shift+u` takes it back, as a rename. A match across lines is one row, each
  break a `⏎`. Refused while a file with a match is unsaved: what's open isn't what's on disk.
- **Search** (`6.5`, `6.9`; `space f s`, `:search words`): the vault's notes ranked by the words as they're typed — as
  `slipbox search` ranks them ([search.md](search.md); [cli.md](../../docs/manual/cli.md) § `search`) — each a row:
  `path:line`, the section's heading and the line, its words marked, `+n` for the file's other sections with some of
  them. `enter` opens it on that line (rendered, at the line's start; in source mode, on the word). The index is the
  app's to keep: opened (or made) as the vault opens and brought up to the files in idle slices — the list says
  `the folder is being indexed: n of m files…` the first time, and fills when it's done — then each file again as the
  graph hears it change (a save here, the watcher, a rename, a CLI write). An unsaved note is searched as it's shown, in
  place of what the index has of it. With `[search] engine = "scan"` the files are scanned, and the title says so; in
  Elsewhere, which has no index, search says so
  (`Elsewhere has no index to search — search finds in a vault or home: space v v goes into one`; VV-D3). **By vault**
  (`20.16`, `21.10`; D64, D79): `ctrl+a` widens it to the folders linked to or from this one, their hits under a
  `linked folders` divider as `path:line` (`21.9`: from home, else absolute); again, to every vault this machine knows
  (`other folders`); again, back to this one. The title says which. `enter` on another vault's hit peeks at it, at that
  line (§ The peek).
- **Filtering** (`3.16`): each space-separated word as typed — its letters together, never one by
  one — and every word, in any order (`hand oper` finds `handbook/operations-handbook.md`); smart
  case, word by word. Ranked by where each word lands: in the label over its description, in the
  file name over its folders, at a word start, earlier; the shorter first. The explorer, the history
  and the outline filter the same way. Highlights follow the original text even where lowercasing
  changes its length; the explorer lights the note's name where a word matched it.
- **Keys:** as in [keys.md](../../docs/manual/keys.md) § In lists and prompts: the arrows, `tab` and
  `ctrl+n`/`ctrl+p` move (wrapping around), `enter` accepts, `esc` cancels. The wheel scrolls the
  list three rows a notch (the selection moves only to stay in view), a click picks, and a click
  outside closes the list. A counter in the bottom border shows `n/m`, and an empty list says "no
  matches" or "nothing here".
- **Groups and footers:** a list may have group headings (dim, bold capitals, with a blank row
  before each but the first and a full rule under each; never selected, moving skips them) and a
  footer. The footer is always four rows under a rule, so the list doesn't jump (on a short screen
  it's left out before the list gets under four rows): the selected entry's name
  (bold), its explanation in normal text (wrapping to a second row), and its other bindings
  ("also", as keycaps). Explanations are the `desc` of each command in `core/commands/*.ts`:
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

Help and the palette list the same commands for different jobs, in the groups of [keys.md](../../docs/manual/keys.md)
(`COMMAND_GROUPS` in `core/command-specs.ts`), in that document's order. Every command has a group (a test checks it);
one no group claims would still be listed, under "Other", last:

- **Help (`?`, `space ?`, `:help`)** is for learning the keys: every command with all its bindings (source
  mode's own, `[keys.source]`, and visual mode's included), then what
  works inside the explorer, inside the history, inside Problems, while filtering a panel, inside the outline,
  inside Info, inside the footnotes, in resize mode, and with the mouse. Filtering keeps the groups; `enter`
  runs a command (the other entries are reference only). Opened from a panel view or visual mode, it starts at
  that section ("Inside the explorer", "Inside the history", "Inside Problems", "Inside the outline", "Inside
  Info", "Inside the footnotes", "Selection & copy"), with its heading at the top. A new panel view gets its
  own section.
- **The palette (`:`)** is for doing things. Empty, it lists the commands last run from the
  palette or help (the last 5, kept for the vault) and then every command by group (except the
  internal `esc` handler); typing ranks the best match first,
  without groups. Each command shows its first binding and first alias.

**The `:` prompt** is the palette and a command line at once. An exact alias from `[aliases]` (`:q`,
`:vs`, `:theme dracula`) always wins, and an alias taking an argument lists completions (notes,
themes, glyph sets) once a space is typed. Move to a candidate and `enter` applies it; `enter`
without moving runs the alias bare (`:theme` opens the theme picker, `:e` the note picker).

**The which-key popup** lists the next keys of a pending sequence, across the keymaps active in the current state. It is
framed like the other popups: a bordered box on the overlay background, with the pending keys and the group's name as
its title (`␣ l › links`), the hint (`backspace up · esc cancel`) in its bottom border, a blank row inside above and
below the entries, and the same margin; it sits centred just above the bottom of the content area. A prefix of one key,
which no popup above it lists with its explanation (`z`, `[`, `]`, `g`, `y`, `ctrl+w`), has its explanation in the title
too, after a colon: `z › scroll: the cursor's line to the middle (z), top (t), …` (DF-D31; `groupExplanation` in
`tui/input.ts`). The box widens to hold that title, as far as the screen allows (past the entries' 140 columns), and a
title still too long is cut with `…`. On a short screen the blank rows go first, then the explanations (the blank rows
never show without them); entries that still don't fit are counted in the bottom border (`+3 more`), and with no room at
all the popup isn't drawn. The entries are in at most three columns, as many as fit. Each column is sized to its own
entries, so a long explanation in one never spreads the others apart. Each entry is `key → name` with a short, dimmed
explanation underneath:

- **For a command:** its `desc` in `core/commands/*.ts`.
- **For a group:** from `[groups]`: its explanation under its name, or, for a prefix of one key, in the popup's own
  title.

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

These are the `space u` toggles and pickers (list in [keys.md](../../docs/manual/keys.md)):

- theme and glyphs
- readable width (the text column capped and centred)
- zen (no chrome; panes only on demand)
- the cursor-row band
- source line numbers in a gutter (on by default)
- the problems bar, and the problems marked in the text (below, "Problems where they are") — the bar and the numbers
  on a shade of their own down the window (`gutter`, halfway from the page to the window header's shade, the two
  framing the text), then a column of the page's before the text
- the window header (no key of its own: the `space u u` list, or the palette; HDR-D3)
- the breadcrumb on it (likewise)
- wrapping (below)
- code blocks too wide: scrolled sideways or wrapped (no key of its own; below)
- link URLs
- mouse capture
- spelling (below)

**Commands run by your shell (`25.7`; D155).** `:!cmd` and `:{range}!cmd` ([keys.md](../../docs/manual/keys.md), "Your
shell") run what you type, never what a vault brings: a folder's config can't bind `shell.run` or `shell.filter`
([configuration.md](../../docs/manual/configuration.md), "What only your own file can set"; D166). It runs by `$SHELL
-c` in the vault's folder, `SLIPBOX_ROOT` and `SLIPBOX_FILE` in its environment, in a process group of its own so
stopping it stops what it started; the TUI goes on meanwhile, `running: cmd` said. `:!cmd`'s standard error goes through
its standard output's pipe, so the window lists what it prints in the order it reached the pipe: `/bin/sh` points the
shell's standard error at its standard output and becomes it (D264). (A program that holds its output back off a
terminal still writes it late.) A filter's lines are its standard output alone, and the window a failed one opens lists
the two as they were read. Each stream is decoded as a stream, so a character cut across two reads stays whole. What it
prints is kept to 2 MB (the window says so when cut short), a filter's output to 32 MB; the window is a list — each line
sanitized, filtered as typed — whose `enter` on a `path:line` of the vault opens it.

**Spelling (`25.6`, D157; `space u s`, `[spell] enabled`).** A note's misspelt words are marked (`spell`: underlined) in
every view — source, rendered and the lens — as `core/spell.ts` finds them: its prose, word by word — not its front
matter, code, HTML or maths, a link's address, a wikilink, a tag, a URL or an email, nor an abbreviation (`API`), an
identifier (`camelCase`, `snake_case`, `x86`), a path or a dotted name (`file.ts`) — checked against its languages'
dictionaries, a word any of them knows being right. Its languages are its front matter's `lang` (`lang: tr`,
`lang: [tr, en]`), else `[spell] languages`; English and Turkish come with slipbox, any other is yours or the system's
([configuration.md](../../docs/manual/configuration.md) § Spelling dictionaries); a language with none is said once.
Hunspell, as WebAssembly, runs on a thread of its own (`core/spell-thread.ts`, D232): it builds each dictionary there
the first time, and checks there the words a note's checker has no answer for yet; the window is drawn again when the
dictionaries are there, and again as answers come. A word not answered yet isn't marked: one just typed is marked a
moment later, and the marks already shown stay meanwhile. Source rows mark a word by its offsets; a rendered row finds
it among the prose of its spans (not code, a URL, a tag). A find's match or the selection shows over a mark. `] s` /
`[ s` go to the next / previous one where the window shows it, `z =` lists the one under the cursor's suggestions — each
language's best in turn, asked of the thread, the keys after waiting for them — and puts the one picked in its place (an
edit, one undo step, left unsaved), `z g` adds it to your words (`~/.local/share/slipbox/spell/words.txt`, one a line,
what `slipbox spell --add` writes): every dictionary loaded takes it at once. `slipbox spell` is the CLI's.

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

**Persistence.** Changes apply at once and are remembered for the vault, across its workspaces, with the config value
each one overrode: yours, in slipbox's state, never in the vault's settings or your config (WSP-D1); on every start
(with a path too). At the next start, or on a config reload, an
override is kept only while that config value is unchanged. Editing the config therefore always
wins, and the TUI never writes your config.

### Code blocks that scroll

With wrapping on, a code block too wide for its room in a rendered note keeps its lines whole and scrolls sideways
on its own (`[render] code_wrap = "scroll"`, the default; D233; the layout's side: rendering.md § Blocks and inlines).
The window doesn't move; paragraphs, lists, quotes and tables wrap as ever. Code blocks in lists, quotes, callouts
and embedded notes do the same, as do the code a diagram or maths falls back to, code in the scratch and in a hover,
and a Mermaid diagram too wide to draw at its closest.

- **What shows.** Each row of the block shows its block's width of its line from the block's offset, its gutter and a
  container's indent before it fixed. `‹` in the gutter says text of the row is out of sight to the left (its
  indentation alone doesn't count), `›` in the block's right margin that some is to the right. The block's last row
  holds its `▄` bar under its code, only while the block overflows; a diagram gets a row for it.
- **Its offset** is the window's, by the block's first line and how many blocks before it start there (an embed's are
  all at one line), kept while the window shows the note — scrolled away, the lens opened and closed, a resize (then
  clamped) — and dropped when the window shows another note. It isn't saved in the workspace.
- **The cursor drives it.** A move that leaves the cursor in a block's code keeps it 4 columns from either edge (a
  quarter of a narrow block), as the window does with wrapping off: `l` `h`, the words, `$`, `f`, a click. `0` and
  `home` go to the code's start, past its gutter; on the gutter or an indent, nothing is hidden and the block stays.
  Moving off the block leaves its offset as it was. A move up or down keeps the cursor's column on the screen (its
  goal is a screen column), so it goes straight through a scrolled block, and down a scrolled block's lines without
  moving it — unless a shorter line pulls it back to show the cursor.
- **The mouse.** A sideways wheel or trackpad over a block, or the wheel with `shift`, scrolls it 6 columns a notch
  without moving the cursor; elsewhere the wheel does what it did. A click or a drag on its bar moves it there. A block
  the mouse moved stays where it was left — a re-layout (a linter's answer, the watcher) doesn't bring it back to a
  cursor in it — until the cursor next moves. A click lands on the character drawn under the pointer.
- **Find** brings a match past the edge into sight, the whole match where it fits, else from its start.
- **Copy** takes the rows' text, and a row is a whole line: never only the part on screen. Cut and paste are the
  lens's and source mode's, which show the Markdown.

Not here: source mode and the lens draw the Markdown, which `ui.wrap` alone wraps; with wrapping off a note is laid out
at its natural width with every line of code whole, and the whole window scrolls (above), a block only following it —
it never scrolls on its own then. `code_wrap = "wrap"` wraps each long line at the block's width, its rows after the
first marked `↪`, as `slipbox render` always does. The code view's cells are the file, broken at their structure
(code-view.md § What it looks like), not a code block.

## Configuration reload

The configuration reloads **by itself** when a config file is saved: the user file, the enclosing
vaults' files (`20.7`; D12, D62) and the vault's own are polled every second (or every `watch.poll_ms`, if that is
shorter). `space v c` (or `:config`) reloads on demand. A reload applies what changed, live:

- **keys, leader, aliases, groups:** keymaps rebuilt; unknown commands, unknown actions in
  `[keys.explorer]`, `[keys.git]`, `[keys.outline]`, `[keys.footnotes]`, `[keys.info]` and `[keys.resize]`, and keys
  with an unknown modifier, are reported
- **theme, glyphs, UI defaults:** applied, replacing the UI overrides kept of the changed values; a
  changed `ui.split_ratio`, `ui.sidebar`, `ui.outline` or pane width resets the live value
- **`[colors]`:** re-applied to the current theme
- **render settings:** every note re-laid out
- **walk settings:** the vault re-walked, re-indexed and re-watched
- **watch settings:** the watcher restarted

A broken file is reported in the message sink: a wrong value keeps its default and the rest of the
file applies; a file that doesn't parse at all keeps what it said before (its last good contents),
so a typo saved mid-edit changes nothing until it's fixed.

## Writing notes

Every write goes one way (`writeBuffer`; D142): the file is replaced atomically (a temp file in the same
folder, then a rename) keeping its permissions; a symlinked note is written through to its target,
and a target outside the vault is refused (`7.5`) — in home, a link you followed is written through wherever it
leads, and in Elsewhere what the file system allows (VV-D6; [roots.md](roots.md) § Links followed only when you say
so); the watcher is told the write is its own; the
buffer reloads, its windows keeping their anchors, so the cursor stays put.

**Task checkboxes** (`4.11`) are the first write. `ctrl+l` (`space n t`), or a click on the
checkbox, flips the task item holding the cursor — the innermost, from any of its rows; in source mode and the lens,
the one holding the cursor's line, found in the parse — as a one-byte edit to the file's bytes, so a BOM, CRLF
endings and even invalid UTF-8 survive untouched.
If the file changed on disk since it was shown, it is reloaded instead and nothing is written (its
lines may have moved). With unsaved changes it flips the mark in the text on screen instead — an undo
step, left unsaved ("done ✓ (unsaved)") — never on disk under them.

**Handing off to another editor** (`4.1`, `4.2`, `4.12`; D145) comes in two kinds, both opening the note at
the cursor's source line. `space n e` steps aside: the renderer suspends, the editor
(`[editor] command`, else `$VISUAL`, `$EDITOR`, `vi`, given `+line` or `file:line` when it's a
known editor) runs in this terminal, and when it exits slipbox resumes and reloads the note if it
changed. `space n s` sends the note to an editor already running elsewhere and doesn't wait; the
watcher shows its saves as they land. From the properties editor, either closes it first (its text written back)
and hands off its note at the top; from a hover, which isn't a file, nothing is handed off.

**The nvim preset** (`[editor] remote = ["nvim"]`, the default) finds that editor itself. Every
nvim since 0.9 listens on a socket in `$XDG_RUNTIME_DIR` (or `/tmp/nvim.$USER/…`), named `nvim.*`;
slipbox asks each for its working directory and current file, leaving out sockets nothing answers
on. The one picked before for this vault is used while it answers (kept for the vault); else the
only one running; else a picker, "Send to which nvim?", listing each by folder and file, the one
working where the note lives first. `space n p` always opens it. The note goes over in two
commands, since nvim's `--remote` takes no `+line`: `--remote {file}`, then `--remote-send
<C-\><C-N>:{line}<CR>` (the line alone, so a file name never becomes keys).

Other editors take templates (D159): `remote` is a list of commands run in order, each waited for before
the next, stopping at the first that fails (`code -g {file}:{line}` is one); `{server}` in one is
the picked nvim's socket. Every template is split into arguments and `{file}` / `{line}` filled in
inside them, never through a shell, so a file name can't become a command; a template without
`{file}` gets the file appended, except a remote one.

## Source mode (plan `4.13`)

`space n v` and `ctrl+k` (`:source`) switch a window's note between its raw markdown and the
rendered view, and the header's Source button (`view.mode_source`) sets it (HDR-D2); the status chip reads `SOURCE`. It
is another layout of the same note (`core/layout/source.ts`; D146), so everything
built on the layout works the same in both: the cursor keys, find and `*`, visual selection and
copy, the mouse, wrapping, line numbers, the scrollbars. The cursor stays on its source line across
the switch, and the outline and breadcrumb keep working. Their headings are the parse's while the
text is saved; while it's being edited they're scanned from the text, each ATX heading line read
the way the render reads it (a line with markup parsed alone), so their text and slugs — and a
`#fragment` followed from source mode — are the render's.

A source line is a row, wrapped at the last space that fits (wrapping on) or kept whole (off); the
text column is the window's full width, readable width aside. Highlighting is light and per line:
frontmatter, headings, rules, quote bars, list markers and task boxes, fenced code, inline code and
links. Fenced code uses its declared language's syntax colours, with plain text for unknown languages (#81).
The gutter keeps git and problem signs; `ui.relative_numbers` set to `source` or `both` shows other source lines'
distance from the cursor's line, retaining the current line's absolute number. `lens` (the default) and `off` keep
absolute source numbers; `both` also enables the lens's counters. The current line uses `cursor_line`; normal mode
draws a block cursor, INSERT uses the terminal's bar cursor, hidden on leaving INSERT or covering it with an overlay.
Every row records, for each cell drawn, the offset in its source line it shows — a tab is
spaces up to the next stop, all mapping to the tab; a wide character is one cell two columns wide;
a control character shows as `�` and never reaches the terminal; a CRLF's CR isn't shown — so a
cursor column maps to an exact place in the text, which editing (next) builds on.

## The lens: live preview (plan `4.14`)

Editing a rendered note happens in **the lens** (D147): whole blocks around the cursor shown as their
markdown between two rules, the rest of the note rendered above and below it. Where you're looking
is source; nothing is half rendered. Its rules are heavy (`━`, ascii `=`) whatever `ui.lines` says,
in the `lens` role (the accent, bold), so they stand out from the frame and from a note's own rules;
the top one is labelled with its lines (`━━ source · lines 12–18 ━━`). A block is a top-level node
(a paragraph, a heading, a table, a code block, a quote) or a list's top-level item, each with the
blank lines after it, so the blocks cover the note.

**The session.** `i` `a` `o` and the other editing keys open the lens in normal mode (`[editor] edit_in =
"live"`, the default: D224), the block as written, and edit on their second press — as `esc esc` leaves, typing
first, then the lens; `space n l` (`:live`) opens it too, and the header's Lens button (`view.mode_lens`) from any
mode, source mode included (HDR-D2). A yank isn't an edit: it goes on at once.
The chip reads `LENS` (`INSERT` while typing). `esc` from typing goes to normal mode with the lens
still open — the vim commands work on what's in it — and `esc` in normal mode closes it: everything
renders again, as does the header's Read button (`view.mode_read`). Reading, there is no lens and the keys are the
reading keys. (With `edit_in =
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
the drawing, clicks, drags and scrolling map screen rows around them (`Lens.screenRows`).

**How it's drawn.** It is composed, not re-rendered (`core/layout/live.ts`): the render with the
lens's rows swapped for source rows (which carry `srcMap`, so everything in
[Editing](#editing-plans-43-44-45) works in it) and its rules as frame rows
(`decor`: the cursor steps over them, find ignores them, they map to no text). While it's being
typed into, the render around it is reused — the rows after it renumbered by the lines added or
taken away — so a keystroke never re-parses the note (plan `15.1`'s per-block re-layout, for the
lens; D120). Leaving insert mode, or an edit reaching outside it, lays the note out afresh — re-parsing
only the chunks the edits touched and re-rendering only their blocks.

**Another note in the window.** Following a link from the lens, or `ctrl+o` / `ctrl+i` to another note, keeps the
lens open on the new note's cursor block: the old note's render, size, place and inner scroll go with it
(`Lens.resetForBuffer`), so the window never shows one note while keys edit another.

## Files beyond notes (plan `16.x`)

slipbox opens any text file in the vault, not only notes (D107). `core/filetypes.ts` puts each file in a group by its
name: **notes** (the vault's `walk.extensions`), **data** (JSON, YAML, TOML, INI, CSV/TSV), **text** (everything else:
code, logs, `.txt`), or **binary** (images, archives…, by extension — and a text-named file holding a NUL in its first 8
KB), which never opens. A path in the vault that a symlink leads out of is read only once you've said to follow the
link, or to just look this once: asked the first time it's opened, the CLI refusing it until then (VV-D6;
[roots.md](roots.md) § Links followed only when you say so).

A note is read by its format's reader (`core/readers.ts`, `16.2`; D110): each parses into the same mdast
tree — so the index, the render, the lens and the outline work alike for every format — and says
what source mode reads off the raw lines: its headings and the link around the cursor. Markdown's is
the only one (`16.16`, `16.17`; D112): Org and AsciiDoc files open as text.

- **Opening.** A data or text file opens from the explorer, `ctrl+p`, `:e path`, or a link to it
  (`[config](cfg/app.toml)`, `[run](run.py)`, `[editor](cfg/app.toml#editor)` at that section; binary links
  still copy their path). `:e path` opens a file written a moment ago too, before the watcher has told the index:
  the vault learns of it then, as the watcher would have it — if the walk takes it. One git-ignored or under a
  hidden folder is reached (`20.8`): opened, and indexed from then on, as a link to it would; one in a busy folder
  (`node_modules`…), `walk.exclude`, `.git` or `.slipbox` or, in home, what its skip list leaves out isn't the vault's:
  it opens, polled while it's open, and is never indexed (VV-D8). `:e` opens it as the explorer opens its `⊘` row — by
  the row's path (`Explorer.rowPath`), through `App.open`, the same call (D249) — by its path from the vault's top or
  its whole path; one in a vault nested in this one goes into that vault, as its row does. Info says why it isn't
  indexed, a file no row lists (under a hidden folder) by the walk's reason for its path (`Marks.whyAt`).
- **Data files open rendered** (`16.11`–`16.13`, D108; [rendering.md](rendering.md) § Data files), with
  source mode a key away and the lens editing a card at a time: in YAML and JSON a key with the
  plain values listed right under it (`defaults` and its settings), in TOML and INI one key — never
  padded with pieces of the next card, and moving to the next card rather than gathering them. A
  table's records are blocks of their own: in a CSV or TSV the lens is `lens_min_rows` records
  around the cursor, sliding a record at a time, never the whole table. A data file that doesn't
  parse opens in source mode, the error said each time it opens (a link, `:e`, history); one that
  stops parsing while edited goes there when insert mode ends (never mid-typing: an open quote is
  normal while a value is typed), and `space n v` renders it again once it parses (`16.14`).
- **Text files open in source mode**, highlighted by their language; no markdown headings are looked for in them. They
  have no rendered view: `space n v` and the lens say so and stay in source mode; the header's Read and Lens
  buttons are disabled, a click saying so (HDR-D2). A window that was in source mode only
  for such a file renders again when it opens a note (a link, `history.back`). **Code in a language the code view maps**
  (`24.9`: the 13 grammars with definitions; D125, D130) opens as a notebook instead — its comments and documentation
  as prose, each definition a cell with buttons, its imports folded, every token as written — and `space n v` switches
  it to source mode and back; editing opens the lens on the cursor's line, doc comment or imports, or source mode
  (`[editor] edit_in`), as for a note. `[render] code = "source"` opens it in source mode.
  The same disabled buttons apply to data that doesn't parse and code configured as source.
  [code-view.md](code-view.md) has the view.
- **Source code through tree-sitter** (`16.6`–`16.9`, `16.18`–`16.23`; D109, D123: TypeScript, TSX, JavaScript,
  Python, shell, Lua, Go, Rust, Swift, HTML, CSS, SCSS, PHP, Dockerfile, Vue, Svelte, Astro, Ruby, C, C++). A `.h` is
  C's (D123). Each language's grammar (the wasm from the language's own npm package, built for this runtime —
  `bunfig.toml` keeps their native install scripts off — or, where npm has none, built from its source into
  `grammars/`, D121) loads the first time a file of it opens, never at start-up; until it lands, the file shows as
  any text file, and it draws again when it does. Grammar loading, parsing and extraction of spans, outline, errors,
  comment links, embedded languages and the code model run together in `core/syntax-worker.ts`, on one thread for the
  process (`core/syntax-thread.ts`, as the spelling thread is), stopped when slipbox quits. `tui/languages.ts`
  schedules the first pass on open and debounces later passes for 150 ms. It installs only a reply for the same buffer
  revision and request; superseded work is cancelled, and leaving the vault or quitting lets go of every pass. The
  layout uses its last answer.
  Its bounded mailbox (`core/worker-requests.ts`) holds eight requests and 16 MiB of their input; a caller past that
  waits its turn. A pass's deadline counts from when the worker is handed it: twenty seconds, as the spelling
  thread's, since a pass is a whole source's and can't be batched as a big note's parse is (a 3.7 MiB minified bundle
  took 4.3 s on a fast machine, idle, and missed a five-second deadline with its cores busy). A source is at most 4 MiB
  (`SYNTAX_SOURCE_LIMIT`, D252); its answer has no cap of its own, its size following the source's (a span a line of a long
  string or comment can make it several times the text). Failures keep readable source and are reported once per
  revision. One that was the thread's (the deadline, a crash, a thread that can't start) is tried again when the file
  is opened again, as a big note's parse is (15.1); the code's own (the worker's error answer) waits for an edit or a
  reload. Graph comment-link lookup keeps its separate existing 256 KiB file guard.
  A local 596,670-byte TypeScript fixture (10,001 lines) took 107 ms to parse plus 195 ms for outline, spans, comment
  links and code-model extraction; a 296,670-byte Python fixture took 41 ms plus 92 ms (2026-10-18, one run; #177).
  These measurements motivate moving extraction as well as parsing off the UI thread.
  The retained structure serves:
  - **Highlighting.** highlight.js still colours each line; tree-sitter adds what a line can't
    know alone, that it starts inside a string or comment opened above (a template string's middle
    lines, a docstring, a block comment).
  - **Outline and breadcrumb.** The file's definitions — functions, classes, methods, types,
    interfaces, enums, Rust's structs, traits, impls and modules; Swift's classes, structs, enums, extensions, actors
    and protocols (by their keyword); C's functions, prototypes, structs and typedefs, C++'s classes, namespaces and
    methods; Ruby's modules and `self.` methods; PHP's traits; a Dockerfile's stages (`build (node:22)`); a
    stylesheet's rules, `@media` and mixins; a page's headings (by their text) and its ids (`#about`) — as headings
    nested by where they sit, from a query per language. `space o`, `]]` and the breadcrumb use them as a note's.
  - **A file in several languages** (`16.22`; D122). A page's `<script>` and `<style>`, a Vue, Svelte or Astro
    component's template, script and style, Astro's frontmatter: each part is parsed with its own grammar — `lang="ts"`,
    `lang="scss"`, an HTML script's `type` (JSON is highlighted, not parsed); Astro's scripts are TypeScript. Each part
    is an outline entry (`script setup lang="ts"`, `template`), its definitions under it; its lines are coloured in its
    language (the lines its tags are on, the page's); its strings, comments, links and syntax errors are where they are
    in the file. The grammars of a component's parts load with its own. A PHP file's HTML is coloured as HTML.
  - **Syntax errors** (syntax only: no types, no lint). Where the parser found an error or had to
    invent a missing token, the text is underlined (`syntax_error`), counted in the problems bar, and its line
    number is red when numbers show; the status line counts it (`✖ 1`), and the Problems panel's This file says
    what it is. Never during insert mode — a half-typed line is always broken — and only for
    the text as it is now: after an edit the marks come back when the new parse lands.
  - **Links in comments** (`16.10`): URLs, and paths with an extension that name a file of the
    vault — relative to the file, then to its vault's top, where a repo's paths start (a leading `/` too) —
    `path:42` at that line. No wikilinks: code has none. They're drawn as links, `enter` follows
    them (a path in a string too: an import's is worth following), and they count as backlinks
    of what they name — the vault's code grammars load in the background as it opens (`20.19`), so they count
    before any code file is opened, and a rename or move rewrites them.
- **Editing and saving** work as for notes: the same undo, saves, autosave and conflict prompt; an
  agent's change to an open file reloads it.
- **What lists them.** The explorer and the switcher show what `files.show` says (`auto`, the default: `renderable` in
  a notes vault — one with `.slipbox/` — and `all` elsewhere, a repository where code lives; `notes`; `renderable` —
  notes and data files; or `all` text files), plus `files.include`
  patterns, minus `files.exclude`; the explorer's `a` toggles to all and back, and its `shift+h` adds the hidden names
  (`files.hidden`, D250; § Side panes), which the switcher never lists unless reached. The explorer, the
  tabs and the history show every name with its extension (the switcher lists paths), notes' too
  (`home.md`, `halley.toml`): the formats sit side by side, and the extension says which is which.
  Folders show whether or not anything in them is listed, so a new or empty one is there to open and
  create in.
- **New notes and folders** (`ctrl+n`, `space n n`, `:new`; `space d n`, `:mkdir`; `n` and `shift+n` in
  the explorer): a name, from the current note's folder — or the explorer's selected folder when it
  has focus, or the vault's top with a leading `/` — and folders on the way are made. `.md` is added
  unless the name has a known extension (`.toml`, `.py`…). A note starts with its title (`# Name`),
  opens, and is typed into on the line after the blank one, in the lens or source mode as `edit_in` says (at once:
  making it was the editing key's first press); an existing file just opens. Nothing is made outside the vault, through
  a symlink or otherwise. A note in a vault
  nested in this one is made there and opens in that vault; one under a folder the walk leaves out (`walk.exclude`)
  is made and opens, but isn't one of the vault's notes (nor its folder one of its folders), as the walk would say —
  and its message says so, as every later save's does (`created drafts/x.md (not indexed: walk.exclude)`, D246;
  [roots.md](roots.md) § The walk).
  **A name another note has** (`17.5`) would make `[[name]]` reach either: the prompt comes back
  with a distinct one from the new note's folder (`projects-alpha`, then `-2`…), and says where the
  other is; typing the name again makes it anyway — a suggestion, not a rule.

## Editing (plans `4.3`, `4.4`, `4.5`)

Editing is in source mode (D146): `i`, `a`, `o` and their capitals (in [keys.md](../../docs/manual/keys.md)) start
typing, switching a rendered window to source first (D105). A level of indentation is the file's (`25.1`; D155): its
`.editorconfig`, else its own lines, else its language ([configuration.md](../../docs/manual/configuration.md) §
Indentation: `.editorconfig`). `%` goes to the matching bracket (`core/brackets.ts`, `25.3`): of its kind, the pairs
nested between counted, across lines, by the text alone — a bracket in a string or a comment counts too, as in vim. In
source mode the bracket at the cursor and its match are marked (`bracket_match`); while typing, the one just before the
cursor. The buffer's `source` is the truth; every change is `NoteBuffer.edit`, one undo step each, except that an insert
session (from `i` to `esc`) is one step. The cursor is a place in the text found through the source layout's `srcMap`
(`editing.ts`), so tabs, wide characters and wrapped rows edit exactly where they show.

**Desktop keys while typing** (DF-D15). Insert mode keeps vim's keys and adds a desktop editor's, none of them keys
vim's insert mode uses here (`editing.ts`, `insertKey`). `ctrl+z` and `ctrl+y` undo and redo without leaving it: what
was typed so far closes as a step of its own, the undo or redo runs, and a new step opens at the cursor, so text typed
after an undo ends the redo, as in a desktop editor; `.` then repeats what's typed from there, as an `i` would have
started it. The page keys move the cursor a window's height less two rows, over rows of text only (the lens's rules
stop them, as they stop the arrows), and in source mode scroll the view as far, as reading's page keys do;
`ctrl+home` and `ctrl+end` go to the note's start and end, as `cmd+up` and `cmd+down`. `shift` with any of typing's
moves (the arrows, `home` and `end`, the page keys, the word keys, the `cmd` arrows and `ctrl+a` / `ctrl+e`) selects:
the window's selection, anchored where the cursor was, its ends between characters as the cursor is while typing, so
the character after its end is neither drawn in it nor taken (`typedSelection`). With one, a character typed, `enter`
or a paste (`ctrl+v`, or the terminal's own) replaces it; `backspace`, `delete`, `ctrl+w` and `ctrl+u` delete it;
what it replaces or deletes isn't copied, so a paste over it puts what was copied before. `ctrl+c` copies it and
`ctrl+x` cuts it, to the clipboard and the register; `ctrl+c` leaves insert only with nothing selected. `left` and
`right` go to its start and end; any other key lets it go and does what it does; leaving insert drops it. These keys
are fixed, as insert mode's others are (`ctrl+s` among them), not a keymap's.

**Normal mode** in source is vim-shaped (`vim.ts`): counts, operators (`d` `c` `y` `>` `<` `gc`) that wait for a motion
or a text object, a register, and `.`. Each operator and edit is a named command in `[keys.source]`; what follows an
operator is read the way which-key reads a prefix: a motion is any cursor command the keymap resolves (run with the
cursor put back after, its range taken as text offsets), a text object is found in the text itself; `gn` is the search's
next match in the text (`replacing.ts` finds it with the search's own flags, regex and whole words, as `n` has them:
after `*`, whole words only). `.` replays the keys of the last change, the keys typed in the insert session it started
included (`insertRecord`), a paste as a key of its own, so anything that changed the text repeats exactly — `cgn` then
`.` walks the matches. A visual-mode change repeats on as much text from the cursor, as in vim (`V`, `j`s and the
operator; `v`, `l`s and the operator on one line); one across lines of characters can't be said in keys, and `.` then
has nothing to repeat rather than an older change. Keys are handled one at a time, in order (`Input.handleKey` queues
them, a paste too), so a burst of typed keys or a paste never interleaves with a command still running; `.`'s own replay
runs inside its turn.

A changed note is **unsaved** until `:w` / `ctrl+s` (D138): `• unsaved` by its path in the status line,
`•` on its tab; undoing back to the saved text makes it clean again. Saving goes through
`writeBuffer` (atomic, inside the vault) and keeps the file's BOM and line endings — a CRLF file
gets CRLF for new lines too; a file that isn't valid UTF-8 can't be edited or saved over. Parsing
waits until something needs it (the rendered view), so typing never re-parses the note; while it's
unsaved, source mode's outline comes from a quick scan of the text's headings.

**Outside changes and conflicts** (`4.5`, `5.5`–`5.7`). A clean note that changes on disk reloads,
and the reload is one more undo step: `u` brings back what was there before an agent rewrote it (and
`:e!`, dropping your changes, is undoable the same way). A note with unsaved changes that changes on
disk opens the **conflict prompt** (D139), which each choice answers with its key. While you're typing (into
it or any note) it waits: a message says the file changed, and the prompt opens with the first key
after typing ends — not the `esc` itself, which a second `esc` closing the lens would answer — so
letters meant for the text never pick a choice.

- **(l) Load theirs** — the file's version; yours is one `u` away.
- **(k) Keep yours** — the status line says `⚠ differs from disk`; autosave stays off for it, and
  saving asks first (**y** write over it, **n** not now, **d** see the diff). `esc` does the same. Answered, the
  prompt doesn't nag: after (k) Keep yours, later changes on disk don't open it again, since saving is where it asks;
  `space n c` reopens it (D139).
- **(d) Diff** — yours → theirs, `-` and `+` lines with context; closing it returns to the prompt.
- **(m) Merge** — a three-way merge by lines against the version you started from (`core/merge.ts`):
  what only one side changed is taken, the same change once, and different changes to the same
  lines are marked `<<<<<<< yours` / `=======` / `>>>>>>> theirs` (with the note's own line endings).
  The result is unsaved (one undo step); the file is theirs now, so `:w` writes it without asking.
  Autosave never writes the markers: with conflicts marked, it stays off until you save.

`space n c` reopens the prompt. When a list or prompt is already open, a message says so instead.
`:w` on a note whose file changed since it was loaded opens the prompt rather than writing over it;
`:w!` writes over it.

**Autosave** (`4.7`, `5.6`, `5.10`; D138, D140, D153): a changed note is saved after `[editor] autosave_ms` (30 s; `0`
turns it off) without a key pressed — not while you're in insert mode, not after (k) Keep yours until a saved, confirmed
write, not over a file changed on disk (the conflict prompt comes instead), not with a merge's conflict markers in it,
and not while git holds its `index.lock` (a commit in progress: it tries again later; in a worktree or submodule, the
lock in the git directory its `.git` file names). **Hand-offs save first** (`4.10`; D145): `space n e`, `space n s` and
a capture into an open scratch write unsaved changes before the other side reads the file; `space s c` saves every
unsaved note before it gathers the context bundle (`9.7`; D32), which it copies: the note, what it links to and what
links to it, as `slipbox context` writes it ([cli.md](../../docs/manual/cli.md) § The scratch and the context bundle),
as far as `[context]` says. One that can't be saved (it changed on disk meanwhile) stops it, nothing copied:
`context: x.md changed on disk while unsaved — ␣ n c resolves it first`. An export (`space n o`, or `space n shift+o`
for notes picked in order: `10.x`) saves them the same way before it reads the notes; [export.md](export.md) has the
rest.

Quitting with unsaved changes is refused (`:q!` quits anyway); a signal still quits.

## External changes (plans `5.1`–`5.4`)

The watcher subscribes to exactly the directories the walk includes: one non-recursive watch per
directory, sharing the walk's `WalkFilter` (D40). Events are debounced
(`watch.debounce_ms`) and settled by `stat` (D137). The graph follows the watcher's news, updated from each batch
rather than rebuilt (`5.8`; D137).

- **Changed:** a note without unsaved changes reloads silently (plan `5.3`), as one more undo
  step. Its anchors keep your place, and the change is surfaced at once with `↻ reloaded` and a
  message (plan `5.4`). Other open notes re-lay out only if they link to it. A note with unsaved
  changes opens the conflict prompt instead ("Writing notes").
- **Reloaded by hand** (`space n r`, `:reload`; DF-D6): a note without unsaved changes is read from disk again, as a
  change is. One with unsaved changes whose file is as it was loaded asks `Discard your changes to <note>? It's loaded
  from disk again: u brings them back.`: `y` loads the file as `:e!` does (one more undo step), `n` or `esc` keeps
  your text, and autosave is left as it was (the conflict prompt's `esc` would turn it off for the note: (k) Keep
  yours). A file that did change, or was deleted, opens the conflict prompt.
- **Deleted:** the buffer keeps showing the last version, marked `✖ deleted on disk`.
- **Created or deleted notes:** these change link statuses, so every layout and the explorer
  refresh. A red link turns resolved when its note appears. A note written and removed between two of the watcher's
  looks is said deleted all the same: a layout drawn meanwhile may have found it on the disk (a path link resolves by
  its file before the index knows it), and draws its link red again.
- **New directories** are watched through their whole depth, except in home before its walk ([roots.md](roots.md) §
  Home): there only those in a folder asked for by name (one you opened, a tab's brought back) are; one new at home's
  top is watched alone, a note moved into one it sees is followed there, and the rest is the walk's. A folder gone takes
  the notes and the other files known in it with it. A `.gitignore` change rescans, and open notes that changed during
  the rescan reload.
- **Files no watcher sees** — outside the vault (the scratch in the state dir), in what the walk leaves out, in home's
  skip list, and one the graph knows that the watcher doesn't take (`VaultWatcher.sees`: reached, `20.8`, in a folder it
  doesn't watch, hidden or ignored in one it does, or no note in a folder it polls) — are polled while open
  (`Watch.poll`), never one read through a link not followed (VV-D6). One the graph knows, changed, is told to it as the
  watcher would tell it, through the feed (held while git writes), once a change, as the graph has it (note or file),
  and the watcher told it's heard a note (`VaultWatcher.heard`), so its sweep doesn't say it again; one it can't stat (a
  folder on the way locked, made a file) is gone, never an error. One told gone that comes back, reached before (20.8),
  is reached again, as opening it reaches it. A build the watcher is synced to tells it of every open note changed
  before, the watched too, the same way, through the feed (`Watch.rebuilt`), after what the feed is applying (a branch's
  tabs built for as its switch is seen: `VaultFeed.whenApplied`), and a batch reloads each open note once. A file the
  graph comes to know while it's open is the vault's from then, its window, unsaved text and undo kept (`App.claim`: at
  each build, at a change to that file, as it's read again, and at each poll): a note a branch brings, its tab back
  before the batch that brings it; one in a folder of home walked since; one reached. Never one changed on disk since it
  was read: the poll reads it again first. A link forgotten, the notes open through it are no longer the vault's and
  read-only, and news of them heard late is dropped while their path still goes through the link; the link followed
  again, its target answering (`Following.lift`), they're writable — in a vault only once it takes them, as a write
  there never lands outside it; in home and Elsewhere at once — one changed meanwhile read again first. One read through
  a link not followed is never written (`App.writeBuffer`), nor read through it to toggle a task or to ask about a
  change out there (the conflict prompt).
- **What git does lands as one change** (`5.9`, `5.10`; D153): while git holds its index lock (a checkout, a merge, a
  rebase, a commit) the watcher's news waits; when it lets go, everything it changed is applied together. HEAD is
  looked at each second and with each batch: when it moved, `switched to branch feat` — and that branch's tabs back
  (above). Mid-rebase (its `rebase-merge` or `rebase-apply` folder there) HEAD is detached between steps, or while
  stopped on a conflict: not read as moved until the rebase ends, when its branch moved on — no switch away and back.
  The files a branch switch brings and takes for a few seconds after aren't taken for moves (`17.12`): a note only one
  branch has comes and goes, nothing moved. The index records the branch it was written on, so at the next open an
  index from another branch pairs no vanished notes as moves either. A pull or merge on the same branch is no switch:
  a rename it brings is a move.

### Bun's watcher, and what covers its gaps

Found while testing, on Linux and then on macOS. Bun's `fs.watch` drops some events, so the watcher has backstops:

| Bun does not report | Covered by |
| --- | --- |
| a directory renamed out of the vault | each tick stats the watched directories: one gone is reported |
| on macOS, anything just after a watch is added or removed | each tick: a directory whose mtime moved is listed again |
| the old name in a rename (`g.md → h.md` only reports `h.md`) | re-checking known notes in that directory |
| a note moved to another directory under its name | re-checking known notes with that file name |
| anything on dot-files, `.gitignore` included | `.gitignore` mtimes polled each tick |
| a directory containing a broken symlink (it errors) | that directory is polled instead, with a warning |

**The second look.** On macOS one FSEvents stream serves every watched folder, and Bun restarts it "since now" each
time a watch is added or removed: at start, and whenever a folder comes or goes, nothing anywhere is reported for a
moment. So each tick stats every watched directory (the check that each still exists took that stat already) and
lists one again only when its mtime moved since what it held was last known. What it holds that isn't known (a note,
an attachment, a folder, adopted with all inside) is pending as if its event had come, and so is what's known there
and gone; the debounce settles them with the events that did come. A folder that changed after the walk began, which
the walk may have read before its watch began, is listed on the first tick. A folder read within 2 s of its last
change is listed again on each tick until that change is older, since a coarse clock (FAT's, HFS+'s) can give the
next change the same mtime. In a folder listed, not walked (`~`, `/`), the second look takes in notes only. A note
rewritten in place moves no folder's mtime: the sweep finds that.

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
(D160). By default that's `markdownlint-cli2`, found as a language server is (`19.21`, D164: the vault's own
`node_modules/.bin` in a vault you trust, `PATH`, your installs), else installed into slipbox's own folder the first
time it's needed, pinned (`[lsp] auto_install`; "installing markdownlint-cli2@0.23.3 into slipbox's own folder…"), and
run on slipbox's Bun: with the vault's own markdownlint config when it has one (the linter finds it), else with
`~/.markdownlint-cli2.jsonc`. In a vault you don't trust (`23.5`; D174), a note under a markdownlint config that is
code (`.cjs`, `.mjs`) or names code to load (`customRules`…) isn't linted, said once.
`[lint] enabled = "auto"` lints only where one of those configs is — markdownlint's defaults are no one's rules for
notes; `"on"` lints anyway, `"off"` never. `[lint] command` runs another linter, the files appended, as long as it
prints markdownlint-cli2's lines (`path:line[:column] MD013/line-length what's wrong`) — only your own config can
name it, never a vault's (D166).

- **A note** is linted once its text is the file's: when it opens, and 300 ms after each save — never while it's
  unsaved, since the linter reads the file. Its findings show only for the text they were found in: typing hides
  them until the next save's run. A finding is a warning among the file's problems ("Problems where they are"):
  counted in the bar and on the status line, its line's number in `warn`, the Problems panel saying what
  (`⚠ 3:5  line-length: Line length [Expected: 80]  markdownlint MD013`).
- **The vault** is linted when the Problems panel's All tab opens: its **Lint** section lists the findings by note, and
  a note's own run keeps its rows current. `enter` on one opens the note at that line (in source mode, its column); on a
  note's row, at its first.
- **A linter that can't run** (not installed, failing without a finding, too slow, or ended by a signal) is said once,
  and not tried again until the config changes.
- **A run printing more than slipbox reads** (16 MiB, [lsp.md](lsp.md) § Finite tool runs) shows none of its findings,
  since a list missing some would pass for whole: said once for that note (`lint: inbox.md: stdout output limit
  (16 MiB) exceeded; partial output discarded — this run's findings aren't shown`), the note not linted again until its
  next save, and lint kept on. The vault's run stops at the first such batch, its **Lint** heading saying why
  (`Lint — not shown: …`). Quitting cancels the runs under way, unsaid.

## What's under the cursor (plans `19.12`, `19.13`)

`shift+k` shows what's under the cursor in a floating window, rendered — a code file's language server's hover (its
type, its docs; D161), or, on a note's link, where it lands (the heading's section, the block, the lines, the note's
start); read-only, `esc` or `q` closes it. A heading or block that isn't there is said, as following says it — `No
heading "pricing" in prd/route-sharing.md: the link opens the note at its top.` — above the note's start, where
following opens it, the window titled with the note's path alone (DF-D26). `g d` goes to the definition — the server's;
a single one opens at once, in this vault, or outside it in the vault that holds it, or Elsewhere, gone into as `:e`
goes (VV-D4: a dependency's types outside the project among them), several are a list —
and in a note it follows the link. `g r` lists the references, each `file:line` with the line's text, to pick from; in a
note, its backlinks. `g y` goes to where its type is defined, `g shift+i` to what implements it (`19.13`; Helix's
`goto-type-definition`, `goto-implementation` features): one at once, several to pick from. A file with no server says
so, and `slipbox doctor` says which it would have; a server that doesn't find these, so too.

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
- **`space c f`** formats the file as its server does (the first that formats), one undo step; left unsaved. The server
  is asked to indent as slipbox works the file's indentation out (`25.1`, § Editing): its `.editorconfig`, else its
  own lines, else its language's — `tabSize` that step (a tab's width where it's tabs), `insertSpaces` unless it's
  tabs; never a fixed 2 (DF-D8).

**Completion** (`19.16`) shows as a code file is typed, under the cursor (above it with no room below): at once after
one of its servers' trigger characters (`.`), else once a word is begun and typing pauses (100 ms). Up to ten items,
each with its detail dimmed, the best first — by how well the word typed so far matches, then the server's order. Typing
on narrows the list without asking again, unless the server said its list was partial; a word ended (a space, an
operator) closes it. `tab` or `enter` puts the chosen item in — its edit if it has one, else its text over the word —
then its other edits (an import at the top), the cursor staying on its text. **A snippet** (`25.8`, D155; slipbox says
it takes them) is expanded first (`core/snippet.ts`, LSP's grammar): a choice its first, a variable its value
(`TM_FILENAME`…), each new line indented as the line, a tab as the file indents, a stop written again given its
placeholder's text. The cursor goes to its first stop, the placeholder marked as selected: the first key typed replaces
it (a backspace takes it), and its mirrors follow what's typed. `tab` goes to the next stop, `shift+tab` back; `$0`
(else the snippet's end) is the last, and ends it — as do leaving insert (`esc`, `:e!`), the cursor leaving the stop,
and an edit cutting across one. The stops follow the text, an import added above included. Typing through a snippet
isn't one `.` repeats. Only the last ask's answer is shown: one arriving after a later ask is dropped. **Signature
help** shows after `(` and `,` (as the server names them): the signature on a line above the cursor, the active
parameter marked; `)` or leaving insert closes it. Both are insert mode's, and leaving it closes both. A paste closes
the completion as a word ended does: the next `tab` or `enter` never writes over what was pasted.

**A link's target** (`20.13`) in a note is completed by slipbox itself, server or not: right after `](`, the files the
link could reach — this vault's notes and files by their path here, other vaults' notes (as of their last index; not
home's) by theirs (`21.9`: from home, else absolute), the note itself not — each with its full path beside it, this
vault's first. What's typed narrows by either form. `tab` or `enter` writes it as the vault's convention writes a
markdown link's path (`21.5`: relative or from the vault's top, with or without `.md`), encoded as a link's path is
(`a%20b.md`); another vault's, its pointer when a named folder holds it that doesn't travel with this one (`21.7`), else
the path from the note. Right after `[[` (or `![[`), this vault's notes and files, each shown as the wikilink would
write it — a name where it reaches the note from here, else its path from the vault's top (a top-level note's being its
name, a relative path: `../plan`) — with its path beside it. Typing past the target (`)`, a space, `]`, `|`, `#`) closes
it. The list is built when the target starts and kept while it's typed, and where an indent moves the target (what's
before it, the indent aside, unchanged); another target, on its line or another, the cursor gone there, gets its own. A
paste closes it, and the next key typed makes it again. Its notes are as they were when it was built, this vault's and
other vaults' (as last indexed) alike. While what's typed matches nothing it shows nothing, and the keys act as with no
popup, until a backspace brings a match back. Closed (`ctrl+e`), accepted, or replaced by `ctrl+n`'s words, it's
dropped, and a key typed after in the same target builds it again. Built per key, it would read every other vault's
index each time; building it works out each folder's pointer name once (`PointerMemo` in `core/write-link.ts`), not once
per note, and puts it in order once. A word typed on from an earlier one is matched only among that one's matches, the
longest such word's (a backspace's is a shorter word typed before), none past a non-match: each word matches whole, and
a capital only makes it match as typed, so nothing else can. With a word typed, the best 500 are shown, and every match
is kept to narrow from. Same keys as above.

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

A file's problems, from every source alike (D167), show where they are, in source mode, the lens and the rendered
view: its syntax errors (`16.9`; in source mode and the code view, out of insert, for the text as it is; DF-D10), the
linter's findings (`3.21`; for the text they were found in), a note's own (`11.5`: a link that reaches nothing or
several notes, a `#heading` or `#^block` its note hasn't, git's conflict markers; while the note is as saved, since the
vault's index has the file's), its language servers' (`19.1`; for the text they were found in — typing hides them until
they answer again; once a server has answered, its syntax errors stand for tree-sitter's — in a vault you don't trust,
each in its safe mode until you answer whether you trust it — asked once, the first time it matters:
[trust.md](trust.md) § Trusting a vault; D174, D177), and its linters without a server (`19.19`, D163: one reading its
input on the text as typed, 500 ms after typing pauses; one reading the file after each save, its findings hidden while
the text differs). Each has a severity: error, warning, information, hint. `[diagnostics] severity` (`warning`) is the
least that shows, so a vault's notes not written yet — information — don't mark every page; `"info"` shows them too.

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
it back to a third; its height is kept for the vault, and never leaves the note under four rows (a screen too short
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
- **All (n)** (`space v p`, `:problems`; the status line's `⚠ 0` when the file has none): what's wrong in the vault, the
  count leaving its orphans out. A heading per kind, with its count, that folds: **Broken links** (the unresolved-link
  set: each link that reaches nothing, and why when there's a reason, such as an unknown folder), **Ambiguous links**
  (each that reaches several notes, and how many), **Fragile links** (each won by where it's written — the nearest or
  the shortest of several of its name — and the path that names its note for sure, `space c a` writing it), **Lint**
  (`3.21`: the linter's findings, when one runs — see "The lint surface"), **Conflicts** (`5.12`, D154: during a merge,
  each file git says is unmerged, at its first `<<<<<<<` marker; `x` on one opens the merge screen, § Git), **Orphans**
  (`9.5`, D27: the notes no other note links to — another vault's links count, a note's own don't — each opened by
  `enter`). Under the first three, the notes with such links, and under a note its problems: the line and the link as
  written, in the link's colour (a finding: its line, rule and what's wrong). `enter` or a click opens the note there in
  a tab of its own — or switches to the tab showing it, a place pushed onto its history — the cursor on the problem's
  line, on the link as drawn (in source mode, on its text); a note's row (an orphan's too) opens at its first. As in the
  explorer, `o` opens it in this window instead, `s` in the split's other. It takes the explorer's keys (`l` / `h`
  unfold and fold a section); `/` filters — its `› text` after the tabs' titles — keeping the problems whose note, line
  or link matches (a conflict or an orphan by its path) under their headings, unfolded; a note's change shows at once.
  Each opening lints the vault again (`Lint (n) …` while it runs); `slipbox problems` gives the same (`--lint` for the
  findings).

The same key, the panel open there and focused, closes it; open and not focused, it focuses it.

## Git (plans `5.11`–`5.14`, `26.x`)

`space g` is the git panel (`git.view`, GIT-D12; § Side panes): its keys act on what's selected there, and what's about
the cursor's line stays out of it (`] c`, `[ c`; a click on a change's sign in the gutter). What git knows of the
vault is measured against each branch's own base, from where this branch left it (the merge base) — what an agent's
worktree changed, ready to review (D154, GIT-D10):

- **`:changes`** (`git.changes`): the files this branch changed, committed or not, and the new ones — `M a.md`,
  `+ c.md`, `R notes/new.md  from notes/old.md`, coloured by state. `enter` shows a file's diff; `esc` there comes
  back to the list. The panel's **This branch against main** is the same list, kept in sight.
- **`:diff`** (`git.diff`; the panel's This file → Its diff against main): this note's diff, as it is now (unsaved
  changes too), in the diff window (below). `enter` on a line goes there.
- **`:worktrees`** (`git.worktrees`): the repository's checkouts — the main one first, this one marked `●` — each by
  its branch. `enter` goes into the vault there, at the same note when that branch has it (VV-D4). The panel's
  Branches section has them on their branches, with what each holds (§ Side panes).
- **`:merge-review`** (`git.merge_review`, `20.21`; D66): before a merge, the links it would break. A merge picked —
  this branch into its own base (GIT-D10, `Git.baseOf`; else `[git] base`, `main` or `master`), or another branch into
  this one — and git's tentative result is checked (`slipbox merge-review`): each broken link by its note and line,
  what broke it ("`main` moves `a.md` to `docs/a.md` — the fix: `docs/a.md`"), yellow when there's a fix, red when
  there isn't. `enter` goes to the link (a note only the other branch has, said so); `esc` comes back to the branches.
  Nothing broken, a message says so. A branch's Merge… in the panel offers the same, into the branch's own base.

**Each branch's own base** (GIT-D10; `core/gitbase.ts`): a branch's base (`chooseBase`, `baseFor`) is the one kept for
it in `bases.json` (slipbox's state, by repository: its shared git folder's real path, `repoKey`) — by a new branch's
From, or Compare against… — when it's still there; else the nearest of its candidates (`candidates`): `[git] bases`
(default `["main"]`), with `[git] base` when set, a base listed there measured only against those before it
(`["main", "dev"]`: dev against main, main against none), the nearest the one that leaves the branch fewest commits of
its own (`git rev-list --count c..branch`; a tie, the first); else `[git] base`, main or master. Null for the trunk
itself. A base is a branch's name (a remote-tracking one's such as `origin/dev`, a tag's, or a commit's; D255) before
git is given it (`refName`, as
`git check-ref-format` has it, the one rule for every name slipbox hands git; `refusedName` says why one is refused):
`[git] base` and `[git] bases`, a vault's own config's too, are checked as the config is read, anything else left out
and said; a kept one is checked before use; and git is given each after `--end-of-options`. `Git.baseOf` asks it once
each time git has news, `Git.fallbackBase` `[git] base`, main or master the same — never on every frame that draws it;
the panel, This branch against main, Merge…, `:merge-review` (`openMergeReview`: this branch into its own base, as
D154's amendment of 2026-10-17 settles it) and the rebase onto the base use it; `:changes` (`openChanges`) and `:diff`
(`showDiff`) ask afresh each time, off the screen's thread (`Git.baseLater`, § Asynchronous git reads). The CLI's
`changed` and `diff` choose it the same way (D255): `--base`, else the branch's own (`baseFor`), else `[git] base`, main
or master; `data.baseChosen` says how (`given`, `kept`, `nearest`, `configured`). `merge-review` merges the branch it
names into `--into`, else HEAD.

**A base asked for** (D255; `core/gitbase.ts`): `resolveBase` (`resolveBaseLater` on the screen) takes what was typed —
never an option, a space or a control character — and keeps a branch, remote branch or tag by its plain name
(`plainName` of git's `--symbolic-full-name`: `refs/heads/dev`, `heads/dev` and `dev` are `dev`, `HEAD` the branch
checked out, `origin` its default branch), anything else (`HEAD~3`, `ORIG_HEAD`, a short hash) as the commit it names: a
kept base never moves with HEAD, and the branch itself is refused however it's spelt (`full`). Opening the screen with
`--base <ref>` (`tui/run.ts` `prepare`, `baseAtOpen`) keeps it for the branch checked out there before the screen is
taken: a ref that names nothing is said in a line, exit 3; a detached HEAD, the branch itself or no repository keep
nothing, said as the screen opens (`AppOptions.notes`, `warnings`). Compare against… lists the local branches, then the
remote-tracking ones (`remoteBranchesLater`: `refs/remotes/`, their `HEAD`s left out), then **A branch, tag or
commit…**, a prompt checked the same way. With a remote-tracking base (`isRemoteTracking`: under `refs/remotes/`, loose
or packed), This branch against ends with when the fetch that last moved it ran (`remoteMovedAt`: its reflog's last
entry, in the repository's shared folder; `· updated 2 h ago`, or `· as of the last fetch` where git kept no record, as
for a branch a clone made), whether it's remote asked once each time git has news.

What's on request (the changes, a diff, the worktrees) asks git there and then; the explorer's marks and the panel's
rows are asked in the background (D154; § Side panes).

**After a merge or a pull** (`20.21`; D66): HEAD moving on its branch isn't a switch — the tabs stay. Git's renames
between the two commits are evidence of moves; when there are some, the folder is read again (the watcher may not have
brought the merge's files yet, #40) and a message says so ("branch main moved on: git moved 2 files — …"), and each
link broken by one says where its file went, in Problems (`space v p`) and when followed; `space l r` relinks a
note's.

A jump to a line inside a rendered paragraph (a diff's line, a conflict, a finding, `:42` and `ctrl+g`) lands on that
line's text, not the paragraph's first line or its row's end.

**The working tree's git** (`26.x`: the gutter's changes, the git panel, commit, blame and history, branches, the
review, the remote and stash, the merge screen, pulling and rebasing) is the TUI's alone: none of it has a CLI
equivalent, its commands marked as interactions, since an agent runs `git` itself (D156). The review against the base
has one (`slipbox changed`, `diff`, `worktrees`, `merge-review`; [cli.md](../../docs/manual/cli.md) § Git). A git
client's whole range stays out: interactive rebase, cherry-pick, submodules, managing remotes, a commit graph, a
forge's pull requests (GIT-D1).

**Branches** (`26.5`; `git.branches`, the palette's, and the branch where you are clicked): the local branches, this
one marked `here` and selected; `enter` checks one out, and "A new branch from here…" asks its name and makes it where
HEAD is (`git switch -c`; a name git won't take is said). Unsaved notes first: saved, then the switch; or kept as typed
(a file the switch changes is then a conflict to settle on saving); or nothing done. git refusing — a change of yours
it would overwrite — says why in its words. A switch done is git's own (`5.9`, "Each branch's tabs"): each branch keeps
its tabs. The git panel's Branches section makes branches with their worktrees, and removes them (§ Side panes).

**Blame and a file's history** (`26.4`, `22.1`; the panel's This file, and the palette's Who changed this line,
`git.blame`, and This file's history, `git.history`): blame shows who last changed the cursor's line — the commit, its
author, its day and its whole message — in the floating window. It blames the last commit, never the working tree
(whose blame could run a repository's filter): the cursor's line is found there through a line diff, and a line changed
since is said to be not committed yet. The history lists the file's commits, newest first, followed back through its
renames (one from before shows the path it had); `enter` on one reads it as it was (read-only, a note rendered) or
shows its diff to the text as it is now, `enter` on a line going there.

**The working tree's changes** (`26.1`; `[git] signs`): a file's lines changed against what's staged — its text as it is
now, unsaved typing included (`core/gitsigns.ts`) — are signed in the gutter: `▎` added (`git_sign_add`), `▎` changed
(`git_sign_change`), `▁` lines deleted below the line (`▔` above the first; `git_sign_delete`), each role the explorer's
or a diff's colour halfway to the page, so the signs don't pull the eye from the text (D225). A rendered row joining
several lines takes their strongest; the blank row between two blocks, no line of the file, has none (#41).
`[git] signs_at` places them (D225): `gutter_right`, the default, the gutter's
last column, the one before the text — with no gutter (no line numbers, no problems bar), a file that has had a change
gets a column of its own and keeps it, so the text doesn't move; `gutter_left`, the gutter's first column, the window's
margin before the problems bar and the line numbers, there with or without a gutter; `window_right`, a column kept at
the window's right edge by the scrollbar once the file has had a change, the text a column narrower. What's staged is
asked of git (`git show :path`, with `23.6`'s guards where the vault isn't trusted, D175) in the background, again
whenever git has news; a file git hasn't is every line added, one it ignores has no signs; line endings don't count,
nor does a byte order mark (git's text has it, the buffer keeps it apart): a change's lines never carry it, and staging
one keeps the index's.
`] c` / `[ c` go to the next and previous change (around the ends); the palette's Preview the change
(`git.change_preview`) shows the one on the cursor's line as a diff in the floating window, and Undo the change
(`git.change_undo`) undoes it — its lines as staged put back, one undo step, left unsaved. A click on a change's sign
does both from a menu (§ Side panes).

**The diff** (GIT-D2; `core/merge.ts` `diffView`, `core/layout/diff.ts`, `tui/diffview.ts`): `:diff` (the panel's
This file diff too), a file's diff from `:changes`' list, the git panel's `enter` on a file or a change, a branch's or
another repository's file in the panel, a history entry's diff to now, the conflict prompt's (D)iff and the overwrite
question's "(d) Show the differences first" draw one way, in the floating window, as wide as the screen less its
margins.

- **Compared:** the two texts without their line endings or a byte order mark (`comparable`): CRLF is LF, as git has
  it for a checkout that turns LF into CRLF and as the gutter's signs have it, so a CRLF file's diff against git's LF
  is its changed lines, not all of them. What changed of them, and of the final line break (when both texts have a
  last line), is a dim row of its own, as git says `\ No newline at end of file` (`unseenRows`, D245): the line endings
  (`\ line endings: CRLF → LF`, or `mixed`) and the mark (`\ byte order mark removed`) before the diff's first row, at
  line 1; the final line break (`\ no newline at end of file`, `\ newline at end of file added`) after its last, at
  the last line — whether or not a line changed too; alone, the diff's only rows. The command line's `git diff` says
  it instead of rows: "only the line endings (CRLF → LF) changed from main".
- **Found:** hunks of lines by the Myers diff (`core/myers.ts`), as git's xdiff finds them, which every diff, the
  gutter's signs, blame and the three-way merge use: the common head and tail trimmed; the lines only one side has set
  aside as changed, whatever else is (a rewrite costs a read); the rest searched from both ends at once for the
  shortest edit's middle, each half the same way (Myers' middle snake: O((N+M)·D) time, O(N+M) memory). Past a cost of
  the square root of the lines (256 at the least), a search takes the furthest point either end reached as its middle:
  a correct diff, coarser than the shortest; past a budget of work, what's left is replaced whole. Inside a hunk, the
  removed lines are paired with the added ones, in order: the pairs that make the hunk most alike, none less than half
  alike. How alike two lines are is twice the words kept over the words of both; punctuation is diffed but not counted,
  and two lines of punctuation alone are alike. Only a pair whose words in common could make it half alike is diffed by
  word, the likeliest first, until 100,000 tokens are spent (`PAIR_TOKENS`); the others aren't paired. A hunk past
  2,500 removed lines times added ones pairs in place, the first with the first; two lines past 4,000 tokens between
  them are never paired (`MAX_TOKENS`). A pair is diffed again by word: a word is letters, marks, digits and `_` (a
  Chinese or Japanese character on its own), and white space and every other character are tokens of their own. A
  changed run loses the white space at its ends, unless that's all it is, and runs with only white space between them
  are one.
- **Drawn** (`layoutDiff`): a row a line, its sign and a space before it (`-` in `diff_del`, `+` in `diff_add`), its
  text highlighted as source mode highlights it — a note's Markdown over the whole text, so a fence's or the front
  matter's lines read as theirs; code a line at a time, only the lines shown. A changed row is on its sign's tint (the
  row's `fill`, each span's `bg`), its changed words on `diff_del_word` or `diff_add_word` — found cell by cell, by
  the offset each of the highlighted row's cells shows (`srcMap`), so a tab and a combining mark after it shift no
  mark; an unchanged row isn't
  tinted. Each group — hunks whose context meets, or leaves a line between, are one — is under `@@ line N`
  (`diff_head`), with up to three unchanged lines around it. The unchanged stretches between groups, before the first
  and after the last fold to `▸ N unchanged lines` (`dim`); a stretch of one line is shown instead. `enter` on a fold
  opens it, the cursor staying on its row. What no line shows is its `\ …` row, `dim` (`acrossRow`, as a head and a
  fold are drawn).
- **Long lines** scroll sideways as a code block does (D233). With wrapping on and `[render] code_wrap = "scroll"`,
  the rows are one block, their text from the gutter's end; the heads and folds stay put (`part: "top"`), and a last
  row holds the scrollbar. The cursor, a sideways wheel and `shift` with the wheel scroll it. `code_wrap = "wrap"`
  wraps a long line, `↪` in the gutter of its rows after the first; wrapping off, the rows are whole and the window
  scrolls.
- **The window:** a read-only buffer with a layout of its own (`NoteBuffer.drawn`), its text a line a row. It has no
  gutter, line numbers on or not, and no source mode or lens: switching says "a diff is drawn one way". `enter` on a
  line closes it and opens the file there, when the file is there and in the vault; the conflict prompt's, a branch's
  and another repository's go back instead. `esc`, `q` and `:q` go back to what opened it: the git panel, the changes'
  list, the prompt. Two texts the same are said ("no differences from main"), and go back; two whose only change no
  line shows open on its rows (above), `enter` on one going to its line. The wheel over the floating
  window scrolls it, never the window or the side pane under it.
- **Roles:** `diff_add` and `diff_del` have a `bg`, the line's tint: their colour 12% of the way from the page in a
  dark theme, 14% in a light one; `diff_add_word` and `diff_del_word` are the same colours 32% and 34% of the way. The
  terminal's theme can't mix its sixteen colours with the page: a diff's lines have their sign's colour alone, and the
  changed words are bold and underlined, as without colour (`NO_COLOR`). A span's background role (`Span.bg`) gives its
  bold and underline as well as its colour (`layout/style.ts`), so the words are marked where there's no tint to give.

**Before and after** (GIT-D2; `core/blockdiff.ts` `blockDiff`, `core/layout/blockdiff.ts` `layoutBlockDiff`): a note's
diff (a file the walk reads as a note) in every window a diff opens in, unless `[git] diff = "source"` (default
`blocks`).

- **Its blocks** (`noteBlocks`): the note's top-level nodes as the parse has them, a list a block per item (a nested
  list's items blocks of their own after their item's own lines), a table a block per row (the header's with its
  delimiter row). A line no node covers that isn't blank is a block as written.
- **Found:** the line diff, as the source diff's. Each run of hunks is widened to the nearest cut on each side of it,
  in the unchanged lines around, that splits no block of `from` or of `to`; a run of unchanged lines with no such cut
  before the next hunk joins the two. Groups with no more than a line of text between them are one, and a line of text
  before the first or after the last is taken in. In a group, the blocks the same on both sides are found by their
  text; between them each removed block is paired with the added one most like it (`pairLines` with `prose`: white
  space is one, so a paragraph wrapped again differs only in its words), none less than half alike — within the pairs'
  budget of tokens (above), so a note rewritten whole shows its blocks removed and added at once. Two blocks past
  `MAX_TOKENS` together (a fence of about 150 lines) are compared by their lines instead (`diffByLines`: twice the
  lines kept over the lines of both, each line a token of the budget; D245). A pair is a change, the rest removed or
  added whole; the unchanged blocks in a group are shown between, unframed. Each pair's lines are diffed too
  (`pairDiff`): where each line before is now, and, for a pair compared by its lines, its changed lines (their runs of
  the block's text, `delLines` and `addLines`) and, in each changed line paired with one like it (`pairLines`), its
  changed words. The window finds the blocks the first time it draws them: a diff opened on its lines (`[git] diff =
  "source"`) never pays for them.
- **Drawn:** each group under `@@ <the heading it's under in to>  (line N)`, or `@@ line N` above the first heading
  (`diff_head`). A change is two frames as wide as the window, however narrow (the label cut to fit), `before` and
  `after` on their top rules (`git_sign_delete`, `git_sign_add`), lightly formatted: a heading's text in its colour,
  emphasis, strong and struck text in theirs, a link or a wikilink as it reads, inline code and maths without their
  marks, a list's marker (its bullet, its number, a task's box) with its text hung under it — a lead too wide for the
  frame loses its indent, then itself, before its text is cut — a table's row its cells between `│`, a quote with its
  bar, a fence, the frontmatter and anything else as written. A CRLF note's CR isn't shown, and its line break in a
  paragraph is a space, as an LF one is. Each cell knows the offset in its block of what it shows,
  so the words the pair doesn't share are on `diff_del_word` in the first and `diff_add_word` in the second; a node
  whose source changed where none of it shows (a link's target, `**` added) is marked whole. A pair compared by its
  lines is drawn whole too, its changed lines' cells on `diff_del` or `diff_add` and their changed words on the
  stronger tint; a changed line drawn as written (code, the frontmatter) has its row's padding tinted to the frame's
  edge, so a blank line added shows. A block added or removed whole is one frame, `added` or `removed`, its text on
  `diff_add` or `diff_del`. The unchanged stretches between groups, before the first and after the last fold to `▸ N
  unchanged lines` (blank, they're nothing); `enter` on one shows its blocks. What no line shows is its `\ …` row,
  `dim`, before the first group and after the last (`blockDiff`'s `unseen`). No new roles: the frames' rules are the
  gutter signs' roles, the marked words the diff's.
- **The window:** its text a unit a line — a head, a fold, a line of a block shown, with a `-`, a `+` or a space and
  a space before it, as the source diff's rows read, a `\ …` row — and each layout row's `src` its first word's unit;
  `enter` goes to the unit's line: a `before` line's, found by its pair's line diff, where it is in the `after` block
  if it's unchanged, else where its run of changes is (the line after it, inside the block), as the source diff's
  removed lines go (D245); a removed block's, where it was. `tab`
  (`git.diff_view`, the diff window's own keymap, `DEFAULT_DIFF_KEYS`) switches between the blocks and the lines, the
  cursor on the first line's row at or after the line it was on; a code file's diff says it has only its lines. The
  review's and the merge screen's keymaps have it too: there, `tab` switches each hunk, or each side against the
  base, for the rest of the review or of the file's screen (`reviewSwitch`, `mergeSwitch`).

**Side by side** (GIT-D7; `core/layout/splitdiff.ts` `layoutSplitDiff`): a code file's diff (anything not a note) where
each side gets at least `SPLIT_MIN` (80) text columns — the window less a sign and a space before each text, ` │ `
between (the left's `›` in its first column) and a column after the right's text (`splitColumns`) — unless `[git]
diff_layout = "unified"` (default `auto`); `"split"` puts it side by side however narrow. `from` on the left, `to` on
the right (`splitRows`): an unchanged line on both; in a run of changes, each removed line beside the added line it's
paired with (the k-th paired of each), those paired with none beside each other in order, a side with no line blank.
A changed side is on its sign's tint up to the rule, its changed words on the stronger. The heads, the folds and the
`\ …` rows span both. Each row's `src` is the unified row it stands for (the right's, else the left's), so the
window's text, `enter` and the folds are the unified diff's, and a resize between the two layouts keeps them.

- **Scrolling:** both sides scroll by the one offset, as a code block's rows do (D233). A row's `scroll` (`CodeScroll`)
  gains `right`: where its second text starts, after the first's `total` columns, padded, and what's fixed between;
  that text is drawn `total - w` columns to the left as well as by the offset (`scrolledCol`, `scrolledInSight`,
  `unscrolledCol` in `layout/ir.ts`), each text showing its own `‹` and `›`. The cursor stops on the texts up to the
  right's end, and moving it reveals its side. With `[render] code_wrap = "wrap"` each side wraps in its column, `↪` on
  its rows after the first; wrapping off, the rows are whole and the window scrolls.
- **The code view's cells folded** (`cell.fold_unchanged`, `space k d`): every cell with no line changed against what's
  staged (the gutter's signs, `26.1`) folds to its header and every one with one opens, the cursor on the first that
  changed; with every unchanged cell folded already, every cell opens. A file with no change says so and folds nothing.
  Only on that key: a diff doesn't fold the cells by itself.

**Reviewing a change** (GIT-D3; `core/gitreview.ts`, `tui/review.ts`): `v` in the git panel (`[keys.git]`'s `review`),
its Review button, `:review` or `git.review` walks the working tree's changes against what's staged — the gutter's hunks
(`gitChanges`), the files as they are on disk — across every file `git status` has changed and not staged, and every
untracked one, as wholly added, in one path order across both (`localeCompare`). A folder (a submodule's), a file gone
or binary (a NUL in its first 8,192 characters), an empty untracked file and a tracked one with no version staged are
left out; a deleted file is one hunk, all removed. Each hunk is shown in the floating window, as wide as a diff's: a
row with its file, its lines (a deletion's, the line before it) and its place (`change 2 of 3 here, 5 of 9 in all`, a
new or deleted file said, what was done with it), a row of its keys, then its diff as every diff is drawn
(`layoutDiff`): its lines as staged and as they are, with up to three of the file's lines on each side (`hunkView`),
each row at its line in the file. The window is a screen of parts (`layoutScreen`, `layout/screen.ts`): text rows and
diffs, a line of its text each, the review's own keys over the note's (`reviewKeys`, `DEFAULT_REVIEW_KEYS`, as a peek
has its own). A note's hunk is its blocks before and after (`asBlocks`, `[git] diff`) — the file with this change undone
against the file as it is (`hunkBlocks`), so its paragraphs are whole, no head and no folds (`blockDiff`'s `heads` and
`folds` off) — and its lines where only blank lines changed; a code file's lines go side by side where there's room
(`sideBySide`, `layoutScreen`'s `split`, a part that changes something). `enter` goes to the line of what's under the
cursor (`srcAt`: a block's span carries its line's unit), as in the diff window; the window is as tall as its rows.

- `y` (`git.review_keep`) stages the hunk as the git panel's `s` stages a change (`stageChange`): found again among
  the file's changes now (`findChange`: the same lines as staged and now, where it was — at its line in the file, or
  its place in what's staged, whichever didn't move; the same lines elsewhere are another change), since the index or
  the file may have moved under it. Each hunk the review reverts or keeps moves the file's others with it (`movedBy`):
  where they're looked for, and the lines drawn around them. A new or deleted file is staged whole.
- `x` (`git.review_revert`) puts the hunk's lines back as staged, in the file's buffer, as one edit — the part of the
  text that differs — so one undo step there, and saves it at once (`Saving.save`, so `App.writeBuffer`); a save
  refused (the file changed on disk) leaves it unsaved, said (`reverted, but not saved — :w saves it`). A file with
  unsaved typing is never written over: the hunk is skipped, said, and the review goes on. The edit is made on the
  disk's text: a buffer without unsaved typing that wasn't read again since the file changed (the watcher off, or not
  yet run) is read first. A new file goes to the trash, asked first (`Files.deleteItem`); a deleted one comes back as
  staged (`discardFile`); a file outside the vault is refused, as slipbox writes only inside it.
- A file changed since the review read it is left as it is by `y` and `x`, and said (`changed since the review read
  it`): the hunk not found where it was, a deleted file there again, a new file's lines not those shown.
- `c` (`git.review_note`) asks for a note, then adds an entry to the scratch without opening it (`Scratch.add`): the
  file and the hunk's lines (`path:from-to`), its diff fenced, and the note (`hunkEntry`).
- `n` and `p` (`git.review_next`, `git.review_prev`) move; `enter` (`git.review_go`) ends the review and opens the file
  at the line under the cursor, else the hunk's first (refused on a deleted file, `x` bringing it back, and outside the
  vault); `esc` and `q` end it. `tab` (`git.diff_view`) draws a note's hunk as its lines, or as its blocks again, as in
  the diff window, for the rest of the review.

After `y`, `x` or `c`, the review goes on to the next hunk not yet dealt with, after it and then from the start; with
none left, it ends. Its end, however it comes, says what it did (`tallyText`): `review: 1 kept (staged), 1 reverted,
1 note for the agent in the scratch — space s y copies it; 2 left as they were` — `space s y` named when a note was
written, whatever the key is now. Nothing is committed.

**The remote and stash** (`26.6`; GIT-D4; `core/gitremote.ts`, `tui/gitremote.ts`): the git panel's keys and buttons and
the palette's commands, none of `space g`'s. `f` (`:fetch`, `git.fetch`) fetches — the branch's remote, else origin,
git's own choice; `p` (`:pull`, `git.pull`) pulls, fast-forward only (`git pull --ff-only --no-rebase`), and where both
sides moved asks merge or rebase (below); `shift+p` (`:push`, `git.push`) pushes the branch to its upstream (`git push
--end-of-options <remote> refs/heads/<branch>:<its ref>`, the remote and ref as `%(upstream:remotename)` and
`%(upstream:remoteref)` name them; a remote, branch or ref whose name isn't one git takes — one that starts with `-`
among them — is refused before git is run, said, as a base rebased onto is, `refusedName`, by `refName`'s rule). A
branch with no upstream is asked "Push it to origin/<branch>, and track it there?" (`-u`): origin, else the only remote;
with none, or several and no origin, said how to set one. Each is asked for, none on a timer, nothing in the background
reaching the network; each runs in the background, one at a time ("git is still fetching" to another), a message saying
it's under way and how it went: "fetched: main is 3 commits behind origin/main — p pulls (:pull)", "pulled: main
fast-forwarded to 1a2b3c4", "pushed main to origin/main". Before a pull, unsaved notes are saved or kept, as before a
branch switch (`beforeCheckout`); HEAD moving on is then the feed's (`5.9`, `checkHead`): no switch, the tabs stay. A
failure is git's own words (`gitReason`): a remote's refusal (`[rejected] main -> main (fetch first)`, with "fetch them
(f) and pull (p) first"), else its `fatal:` or `error:` line and the files it names, else a conflict.

git runs without a terminal: `GIT_TERMINAL_PROMPT=0`, so a login git can't make with what it has fails at once ("could
not read Username for '…': terminal prompts disabled") rather than wait at a prompt; and ssh in batch mode
(`GIT_SSH_COMMAND="ssh -o BatchMode=yes"`), which asks no password or passphrase, unless you set your own
(`GIT_SSH_COMMAND`, `GIT_SSH`, or `core.sshCommand` in any of git's config). Credential helpers still answer. A failure
that's a login (`needsLogin`: prompts disabled, permission denied, a host's key) adds "git in a terminal can log in (git
fetch), then try here again". git's words are read (a pull's "Not possible to fast-forward", "Everything up-to-date", a
conflict), so the commands slipbox reads them from — the remote's, the stash's, a merge's and a rebase's, the branch
merged in the git panel, the merge review — run in git's English (`inEnglish`: `LC_ALL=C`, no `LANGUAGE`). A command
that prints more than slipbox reads (16 MiB) is stopped, and said so (`failureOf`). In a vault not trusted, a push runs
no hook, its pre-push neither, and the remote's commands refuse a program the repository's own config names for the
remote ([trust.md](trust.md)).

`z` (`:stash`, `git.stash`) lists the stashes, newest first (`git stash list`), under "Stash the changes…" and
"Stash the changes, untracked files too…" (`--include-untracked`), each asking a message (none: git's own, `WIP on
main: …`); `enter` on a stash offers Pop it, Apply it, and Drop it… after asking. A stash is acted on by its name as
listed and only while that name still holds its commit: one saved meanwhile (an agent, a terminal) renumbers them, and
the pick is refused, said why. Saving and bringing one back change the files: unsaved notes are saved or kept first.
git's "No local changes to save" is said as nothing to stash; a conflict, in git's words, the stash kept.

Where you are shows a branch with an upstream ahead of it and behind it (§ Screen layout: the top bar, else the
status line), as of the last fetch:
read from `git status --branch`'s first line, asked with the status in the background whenever git has news
(`statusLater`), so after a fetch, a pull, a push, or HEAD moving.

**Pulling where both sides moved** (GIT-D6; `core/gitremote.ts` `pullLater`, `tui/rebase.ts`): a pull that can't
fast-forward (git's "Not possible to fast-forward") asks: `(m)` merge the upstream into the branch (`git pull
--no-rebase --ff --no-edit`: git's own message, never an editor; `--ff` over a `pull.ff = only`), `(r)` rebase the
branch onto it (`git pull --rebase`; over files changed, asked to stash them first, below), `(n)` nothing. Selected is
what git's config says (`pullDefault`): a rebase where `branch.<name>.rebase`, else `pull.rebase`, is true or a kind of
rebase, else a merge.

**Rebasing onto the base** (`git.rebase`, `:rebase`, `shift+r` in the git panel — its `rebase`): the branch rebased onto
the base's tip — the branch's own (GIT-D10, `baseOf`), else `[git] base`, main or master (`baseBranch`) — after asking,
with how many commits each side has (`aheadBehind`); unsaved notes saved or kept first, as before a pull. On the base,
detached, or with nothing new on the base: said, nothing run.

**A rebase over files changed** (D247; `core/gitrebase.ts` `changedTracked`, `stashFirst` in `tui/rebase.ts`): git
won't start a rebase over tracked files changed, staged or not, so slipbox asks first instead of saying git's refusal.
`shift+r`'s question becomes "Stash your changes, rebase agent onto main, put them back? 2 files changed; its 3 commits
replayed after main's 1 new."; the pull's `(r)` asks "Stash your changes, rebase main onto origin/main, put them back?
1 file changed." Yes runs the rebase with `--autostash` (`git rebase --autostash`, `git pull --rebase --autostash`):
git stashes them, rebases, and puts them back, as changes not staged (a new file stays staged). No: nothing runs. The
files are read with `git status --untracked-files=no --ignore-submodules=all`, as git's own check sees them; a clean
tree asks and runs as before. Unsaved notes saved after `shift+r`'s question may change a file: then the stash is asked
about there. Untracked files stay git's to judge, as without slipbox: its autostash doesn't take them, and it rebases
past them, refusing in its words only where one would be overwritten (`The following untracked working tree files
would be overwritten by checkout: n.md`), the changes stashed put back first. A rebase that stops at a conflict keeps
them stashed until it ends, continued or aborted. Where putting them back conflicts, git keeps them in the stash, as
`autostash`, and marks the files in conflict. slipbox knows it by the stash the rebase left behind — the newest
stash's commit before and after (`withAutostash`, `stashKept`), never git's words, which change between its versions
— and also when a continue, a skip or an abort ends the rebase: the end's message says so, naming the entry and the
files (`rebased agent onto main — your changes conflicted going back, so git kept
them in the stash, stash@{0} ("autostash"): 1 file in conflict (b.md) — x in source control settles it (:resolve), then
drop the stash (z)`).

**A merge or a rebase under way** (`core/gitrebase.ts` `operationOf`), or a cherry-pick or a revert begun in a
terminal: read from git's own files, no git run — `rebase-merge/` (`msgnum`, `end`, `head-name`), `rebase-apply/`
(`next`, `last`; `applying`, a `git am`, is none of slipbox's), `MERGE_HEAD` and its `MERGE_MSG`, `CHERRY_PICK_HEAD` or
`REVERT_HEAD` with the commit `MERGE_MSG` names (a revert's subject, unquoted), and `sequencer/` alone, a series
between its commits, a cherry-pick or a revert as its `todo`'s next line says — again when git has news or half a
second on (`operationNow` in `tui/rebase.ts`). Where you are says it after the branch (§ Screen layout): `rebasing
2/5`, `merging`, `cherry-picking`, `reverting` (`operationText`). `shift+r` then offers, as a question with keys
titled by what's under way (`operationTitle`: `Cherry-picking "Retry with a budget"`): `(x)` the merge screen on a file
still in conflict, `(c)` continue (`git.continue`, `:continue`: `git rebase --continue`, `git cherry-pick --continue`,
`git revert --continue`, or `git commit --no-edit` for a merge; refused, said which, while a file is in conflict),
`(s)` skip (`git.skip`, `:skip`: `git rebase --skip`, `git cherry-pick --skip`, `git revert --skip`; a merge has none),
`(a)` abort (`git.abort`, `:abort`: `git <kind> --abort`; asked first, as a rebase is: "Abort the cherry-pick? main
goes back as it was before it, and what's settled so far is lost."). The git panel has the three as buttons meanwhile:
Continue, Skip (not a merge's) and Abort, each saying what it does (`OPERATIONS`).

Each runs in the background, one git command at a time with the remote's (`runInBackground`), without a terminal or an
editor (`GIT_TERMINAL_PROMPT=0`, `GIT_EDITOR=true`, `GIT_SEQUENCE_EDITOR=true`: a commit settled on the way keeps its
message). After it, HEAD is seen and git asked again; a stop at a conflict says where (`the rebase stopped at commit 1
of 2: 1 file in conflict (src/sync/retry.ts)`, `the cherry-pick stopped: 1 file in conflict (b.md)`) and opens the merge
screen on its first file; a stop for another reason is said in git's words, with `shift+r`'s choices named; the end is
said (`rebased: the rebase is done`), a merge screen of git's still open closed. Neither the merge screen nor the pull's
question (above) opens over typing — in a note, a window or the git panel's message — or over a question or a list
already open, whose keys would take letters meant for those (`busy`, as the conflict prompt waits, `5.5`): said instead,
with the key that opens it (`x in source control opens the merge screen (:resolve)`; `p in source control (:pull) asks
how to bring them together`). In a vault not trusted, `gitArgs`'s guards hold — no hook runs (a rebase's `pre-rebase`, a
merge's `pre-merge-commit`), no merge driver — and nothing is signed (`commit.gpgSign=false`); said.

**The merge screen** (GIT-D5; `core/conflicts.ts`, `tui/mergescreen.ts`): `x` on a file in conflict in the git panel
(its `resolve`, or its Resolve button), `x` on a conflict in the Problems panel's All tab, `:resolve [file]` or
`git.merge_screen` — the file named, else the conflicted file selected in the panel, else this note when it's in
conflict, else the first that is — opens the file's buffer (read again first when git changed it on disk and it has no
unsaved changes) and reads git's markers (`parseConflicts`): `<<<<<<< label`, yours, `||||||| label` and the base where
git wrote it (diff3, zdiff3), `=======`, theirs, `>>>>>>> label`; a marker that doesn't close, or a `=======` outside a
conflict (a setext heading's), is text. The markers give the conflicts, so what was settled by hand stays settled. git
doesn't widen its markers for a side with a seven-character `=======` line in it (a setext heading's underline), so a
conflict with more than one `=======` that could part the sides — after diff3's base marker, where there's one; one
before it is yours — can be read more than one way (`Conflict.ambiguous`): the index's stages choose the one way whose
yours is in stage 2 and theirs in stage 3 (and a marked base in stage 1). With no stage that does, or more than one
way that fits, the conflict is ambiguous: its card shows it as marked, and `o`, `t`, `b` and `shift+b` are refused,
said, `e` settling it by hand. A complete set of markers inside a fenced code block — the fence open from before the
`<<<<<<<` to after the `>>>>>>>` — is an example of git's markers, text, unless neither side's stage holds those lines,
which makes them git's own conflict in a code block (`readConflicts`). Each conflict's base where the markers don't hold
it comes from the index's stage 1 (`withStages`): yours is found in stage 2, and theirs in stage 3, where the stretches
before put it (else wherever it is), each mapped back onto stage 1 through that side's changes (`toBase`, a boundary
inside a change widened to the whole of it), the two ranges joined. Line endings and a byte order mark aren't compared,
finding a side or diffing it against the base: the index holds LF where a checkout (`eol=crlf`) has CRLF. Where neither
has it (the stages gone), there's no base. A file in conflict with no marker (one side deleted it) is said, with `s` in
the git panel to mark it resolved — its buffer unsaved, `:w` first, as `s` stages the file on disk. `enter` on a
conflicted file in the panel shows its diff, not the screen.

The screen, in the floating window as tall as a peek's, a conflict at a time: its number, its line in the result and
how it's settled; the keys; while a rebase is under way, that yours is what's rebased onto and theirs the commit
replayed; the base's lines; yours, then theirs, each under its marker's label as a diff against the base, whole (no
folds) — with no base, all added — a note's as its blocks before and after (no head, no folds), a code file's side by
side where there's room; then the file as it will be (`resultView`): each conflict settled (its lines `+`) or still
marked, two lines around it, under a head naming it and how it's settled, the stretches between folded. Its own keys
(`mergeKeys`, `DEFAULT_MERGE_KEYS`):

- `o`, `t`, `b`, `shift+b` (`git.merge_ours`, `_theirs`, `_both`, `_both_theirs`) settle the conflict — yours, theirs,
  both with yours first or theirs first — and go on to the next one not settled.
- `e` (`git.merge_edit`) puts the result in the file's buffer as one edit — the conflicts not settled still marked,
  `markers` set so autosave doesn't write them — and opens the file at the conflict, in the mode the editing keys use
  (`[editor] edit_in`: the lens by default). `x` in the git panel (or `:resolve`) reads what's left of it onto the
  screen again.
- `a` (`git.merge_agent`) asks for a note and adds the conflict to the scratch (`conflictExcerpt`): its lines in the
  file, three lines around it, the base between the sides as diff3 writes it; a note left empty is "a merge conflict:
  settle it, keeping what each side meant".
- `n`, `p` (`git.merge_next`, `_prev`) move between conflicts; `tab` (`git.diff_view`) draws a note's sides as their
  lines, or as their blocks again, as in the diff window.
- `w` (`git.merge_save`), and `ctrl+s` and `:w` there (`note.save` sends them to it, as the commit editor's), once
  every conflict is settled: the result into the buffer as one edit, saved through `App.writeBuffer`; refused, said,
  while one isn't, or when the buffer changed since the screen read it. A save refused (the file changed on disk) puts
  the buffer back as the screen read it, so nothing's in it the screen doesn't show, and says `x` reads the file again;
  the conflict prompt's merge (below) leaves the result in the note, unsaved, its prompt saying how.
- `s` (`git.merge_stage`) once saved: the file read again first — one changed since it was saved, or with markers
  still in it (a side's own lines can hold them), isn't staged, said — then `git add` the file, which marks it
  resolved; the next file in conflict opens, else what comes next is said (`shift+r` continues the rebase, or
  concludes the merge).
- `esc` closes it; what's settled is kept for the file while its text is the same, and opening it again brings it back.

The conflict prompt's (M)erge (`5.5`), where its three-way merge leaves a conflict, opens the same screen on the note's
text as loaded (the base), as typed (yours) and on disk (theirs) (`fromMerge`, from `mergeChunks`, which `merge3` is now
built on): `w` puts the result in the note, measured against the text on disk from then on (`NoteBuffer.rebase`), and
saves it; `esc` goes back to the prompt; `s` is git's alone. A merge with no conflict is applied as before, unsaved.

Not done: the diff window's, the review's, the merge screen's and the peek's keymaps have no table in the config
(`[keys.git]` is the git panel's): their commands are bound in `[keys]` only, as the reference set's full config does
for `git.diff_view`.

**Settings** (the manual's configuration chapter lists them with the rest): `[git] base`, `[git] bases` (default
`["main"]`, each branch's own base guessed among them, GIT-D10), `[git] diff = "blocks" | "source"` (a note's diff,
default `blocks`), `[git] diff_layout = "auto" | "unified" | "split"` (a code file's, default `auto`), `[git]
worktrees` (default `"{parent}/{repo}-{branch}"`, `worktreeFolder`: `{parent}` the folder holding the main checkout,
`{repo}` its folder's name, `{branch}` the branch's made safe for a folder's — `/`, `\`, `:` and the like a `-`, no dot
or dash at its ends, `branch` when nothing's left — `~` home, a relative path from `{parent}`; GIT-D13), `[git] signs`
and `signs_at`. `git.worktrees` is your own config's alone (`USER_ONLY`: it says where slipbox makes folders, outside
the vault). `[keys.git]`, the git panel's keymap, is a key table as `[keys.explorer]` is.

## Modes and dispatch

Keys reach layers, each owning some of them (D99, D105):

| Mode | Owns keys | Examples |
| --- | --- | --- |
| overlay | every key | switcher, palette, pickers, prompts, the conflict prompt |
| filter | typed text, and moving through the matches | `/` in the explorer or the history |
| insert | typed text, and the few keys that edit, move or select (DF-D15) | `i`, `a`, `o` in source or the lens |
| a character | the next key, as a character | after `f`, `t`, `r` |
| operator | a count, a motion or a text object | after `d`, `c`, `y`, `>`, `<` |
| resize | its own keys; any other key leaves it, then runs | `space w r`, then `h j k l` |
| pending | the next key of a sequence | `space l …`, `ctrl+w …`, `g g` |
| pane | keys of the focused side pane | explorer, history, git panel, outline |
| visual | selection keys, and movement extends | `v`, `shift+v` |
| floating | a peek's, a review's, the merge screen's, a diff's own keys | `o`, `y`, `t`, `tab` |
| source | source mode's and the lens's own keys, before the reading ones | `x`, `d`, `p`, `.` |
| normal | everything else | cursor, links, tabs |

Every binding names a registry command (D11), and config remaps all of them. Editing keys work only where the
text is editable, in the source layer; the keys that start an edit and undo are in the reading layer too, and
switch the window to source first (D105). The conventions that settle collisions between keys (D99, D106,
D128) are the user's to read: [keys.md](../../docs/manual/keys.md) § Conventions.

**Dispatch order:** a paste first, then an overlay, then a pane's filter while typing in it, then insert mode's
keys (the completion popup's first), then a key awaited as a character (after `f`, `t`, `r`), then — in source mode
and the lens — counts and an operator's motion around the rest (`vim.ts`), then resize mode's keys (any other key
leaves resize mode and runs as usual), then a pending sequence (where `esc` cancels and `backspace` goes up a level),
then the focused pane's keymap (explorer, git panel or outline), then visual mode's — else, in a peek, a review, the
merge screen or a diff window, its own keys (`DEFAULT_PEEK_KEYS`, `DEFAULT_REVIEW_KEYS`, `DEFAULT_MERGE_KEYS`,
`DEFAULT_DIFF_KEYS`) —, then source mode's own (`[keys.source]`, in an editable window outside visual mode), then the
normal keymap. Only keymaps at or above the one holding a
binding can make a key a prefix: visual mode's `y` doesn't wait for the normal keymap's `y y`. When a key is
both a binding and a prefix, slipbox waits `input.which_key_delay_ms` for the next key, then
runs the binding.

## Known limits

- **A change of width re-wraps a whole note** (plan `15.1`): dragging a border, resize mode,
  toggling a pane, zen, wrap or line numbers, a terminal resize — about 4 ms for a thousand-line
  note and 70 ms for twenty thousand. A buffer keeps its last six widths, so going back and forth
  is cached. Edits, reloads and leaving the lens reuse what didn't change (the parse by chunk, the
  render by block, source mode by line: [how-it-works.md](how-it-works.md) § Performance, measured, "Big notes";
  D120).
- **A big note's first open reads for a moment** (plan `15.1`; D120): with 128 KB or more to parse, it parses on other
  threads — the window says `reading big.md — 20,000 lines…` for about a third of a second at twenty thousand
  lines, keys wait for it, a click is dropped — then the note is drawn where it was left.

## Parity with the CLI

Every command is declared in `core/commands/*.ts` with the CLI invocation that reaches the same state change, or
marked as an interaction: cursor, scrolling, selection, focus, panes, overlays (D11, D14). Editing keys are interactions
too: the state they change, a note's text, is reached from the CLI by `write`, `replace` and `task` (D14, D18). Git in
the editor is marked so too, though it changes state: it is the TUI's alone (§ Git; D156). Tests fail when a command is
implemented without a spec or specified without an implementation. See [cli.md](../../docs/manual/cli.md).

## Asynchronous git reads

History, blame, commit messages and old-version reads use `core/gitlog.ts`'s asynchronous forms and
`core/gitops.ts`'s bounded `gitReadLater`. Capability discovery is asynchronous too. Each command allows fifteen
seconds and 64 MiB of output; cancellation or a limit returns no result and closes owned pipes/processes. Unix
cleanup includes the owned process group. Existing trust guards, literal path arguments and noninteractive sync
APIs remain. Merge stages are read in parallel; explicit branch diffs select their base asynchronously.

`tui/gitquery.ts` owns the current foreground request. A newer request, Escape, leaving the vault, opening another
tab or quitting cancels it. Completion checks the repository, document version and disk identity, view and HEAD commit;
staged/index reads also check the index's identity and timestamps. Results are fetched afresh, so no stale history/blob
cache is introduced. Existing content remains while a loading message is shown. The key that starts a read waits for
it, as any key waits for what it does: a list's selection, source control's and the branches' rows, `space g d`, a link
to another branch's file, and `esc` back to the list a diff came from all return their reads to the key, so the keys
typed after it act on what it opened. Completion requests a repaint. The base a diff is taken against is the branch's
own; on a detached HEAD, `[git] base` or main/master, and one not there is named. These reads do not change the
separate policies for git mutations.
