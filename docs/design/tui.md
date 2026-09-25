# The TUI

Phase 2: the reader, the "beat leaf" target. **Read-only by decision**: it browses, renders, copies
text, holds several notes and follows external changes. It never writes a note. The only files
it writes are its own state and the scratch. Editing, including `$EDITOR` hand-off, is phase 3.

Code: `src/tui/`. `app.ts` is the model, `draw.ts` paints, `keys.ts` has the default keymap, and
`run.ts` plus `opentui.ts` bind to OpenTUI.

## Screen layout (plan `3.1`)

```text
 1 index  2 alpha                              ← tab bar, only with 2+ tabs
 ▾ notes        ┃ ▌ Heading                    ┃ ← explorer ┃ content (one split) ┃ scrollbar
     alpha      ┃ Text…                        ┃
 READ  notes/alpha.md ↻ reloaded     → [[beta]] (resolved)  L12 40%   ← status line
 ↻ notes/alpha.md changed on disk — reloaded                          ← message or prompt
```

- **Status line.** A mode chip (`READ`, `FILES`, or the keys of a pending sequence); the note's
  path; markers (`↻ reloaded`, `✖ deleted on disk`, `⚠ not watching`, `indexing N…`,
  `(single-file)`). On the right: the focused link and its status, or find progress, the tab
  number, the source line, and the percentage through the note.
- **Bottom line.** Shown only when there is a message (4 s, 8 s for errors) or a prompt (`/`).
- **Scrollbar.** In the pane's last column, only when the note is longer than the pane.
- **Viewport-only (plan `3.2`).** Only rows on screen are drawn. A layout is computed once per
  width and cached on the buffer.

## Buffers, views, tabs, split (plan `3.3`)

- **Buffer.** One open file: its source, parse, and layouts cached by width. Shared by every
  pane that shows it.
- **View.** A buffer plus that pane's own state: its source anchor, top row, focused link,
  history, find and selection.
- **Tab.** One view, or two in a split. A split is side by side when the content is at least
  100 columns wide, and stacked otherwise. Each pane then gets a title row, and the active one
  is highlighted.
- **Buffers list.** `space b` lists every open buffer.

## Positions (plans `3.4`, `3.5`, `3.15`)

A view stores an **anchor**, not a row: the nearest heading above the viewport (slug plus
occurrence), the source-line offset from it, and the absolute source line as a fallback. Rows are
derived per width, so resizing keeps your place. An agent inserting text above you does not move
you, because the heading is found again by slug.

- **Reading position per note.** Saved when you leave a note and on quit, in
  `positions.json` in the state dir. Reopening a note restores it.
- **Session restore.** Tabs, splits, anchors, explorer visibility and theme, in
  `session.json`. Restored when slipbox opens with no path, if `ui.restore_session` is on.

## History (plan `3.6`)

Per view, back and forward stacks of `{note, anchor}`, 200 deep. Following a link, jumping to a
heading and opening from the switcher all push onto it. `H` goes back and `L` goes forward, as in
qutebrowser and vimium. `Ctrl-O`, `Alt-←`, `Alt-→` and Backspace also work.

## Following links (link-follow, pulled into phase 2)

`Tab` and `Shift-Tab` move focus between links, starting from the viewport. `Enter` follows,
`Ctrl-W f` follows into the split, and a mouse click on a link follows it.

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

## Explorer (plan `3.7`) and narrow terminals (plan `3.14`)

A tree of the walked notes, directories first, collapsible. The current note is highlighted and
revealed. `ctrl+w h` or `space e` focuses it. Keys while focused: `j`/`k`, `l`/Enter to open or
expand, `h` to collapse, `gg`/`G`, and Esc or Tab to leave. A mouse click opens a note.

Below `ui.narrow_width` columns (default 90) the explorer cannot sit beside the content:

- **The explorer** starts hidden and opens *over* the content, closing again once a note is
  chosen. The wide-terminal preference (`ui.sidebar`) is kept separately, so widening the
  terminal brings it back.
- **Splits** stack vertically.
- **Tables** that cannot fit become one record per row (see [rendering.md](rendering.md)).

## Overlays (plans `3.8`–`3.10`, `3.13`)

One list component with fuzzy filtering: smart case, bonuses for word and path starts, file
name over directory. Keys: type to filter; `↑`/`↓`, `Ctrl-N`/`Ctrl-P`, Tab and Shift-Tab to move;
Enter to accept; Esc to cancel; click to pick.

| Overlay | Opened by | Lists |
| --- | --- | --- |
| quick switcher | `Ctrl-P`, `space f`, `space space` | every note, with its title |
| outline | `o`, `space o` | the note's headings, current one preselected |
| links | `space l` | outgoing links and their status |
| backlinks | `space r` | notes linking here, with line numbers |
| palette | `:`, `space p` | every command, with its keys |
| buffers | `space b` | open buffers |
| theme | `space t` | themes, **previewed live**; Esc restores the previous one |
| messages | `space m` | the message sink |
| help | `?` | every command and its bindings; Enter runs one |

**The message sink (plan `3.13`).** Config warnings, walk errors, watcher problems and command
feedback all go to one place: the bottom line briefly, and the messages list permanently (the
last 500).

## Find in note

`/` opens a prompt at the bottom and matches incrementally, with smart case. Enter keeps the
matches. `n` and `N` cycle through them, and the status line shows `k/N`. Esc cancels, returning
to where you were. Vault-wide search is phase 4.

## Selection and copying

Beat leaf: leaf has no mouse selection. Drag in a pane to select rendered text. On release it is
copied, like a terminal would copy it, and a message says how much. `y y` copies again, and
`c s` captures the selection to the scratch with a `path:line-line` reference.

| Keys | Copies |
| --- | --- |
| `y p` | the note's absolute path |
| `y r` | a `path:line` reference to the top line |
| `y l` | the focused link's resolved path, or its URL |

**Clipboard (plan `8.5`).** OSC 52 through the renderer, which owns the terminal. On top of that,
`pbcopy`, `wl-copy` or `xclip` when present. When neither is available, it writes
`clipboard.txt` in the state dir and says so.

## External changes (plans `5.1`–`5.4`)

The watcher subscribes to exactly the directories the walk includes: one non-recursive watch per
directory, sharing the walk's `WalkFilter` (decision `0.11`). Events are debounced
(`watch.debounce_ms`, 120 ms) and settled by `stat`, into created, changed and deleted.

- **Changed:** the buffer reloads silently, since phase 2 buffers are never dirty (plan `5.3`).
  Its anchor keeps the reading position, and the change is surfaced the moment it lands
  (plan `5.4`): `↻ reloaded` in the status line and tab, plus a message.
- **Rename writes:** editors' and agents' temp-and-rename saves are handled as changes.
- **Deleted:** the buffer keeps showing the last version, marked `✖ deleted on disk`.
- **Created or deleted notes:** these change link statuses everywhere, so every layout and the
  explorer refresh. A red `[[link]]` turns resolved as soon as its note appears.
- **New directories** are watched as they appear. A `.gitignore` change rescans the vault.
- **Own writes** (the scratch, when it lives in the vault) are ignored by path and mtime.
- **Files outside the vault**, such as the scratch in the state dir, are polled while open.
  An agent's `slipbox capture` therefore appears as you watch the scratch.
- **Anchors** are refreshed after every re-layout, so a fallback line never goes stale. After
  an insertion above, a later removal of the heading still lands near where you were.

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

The tick runs every `watch.poll_ms`, 2 s by default. Every 15th tick sweeps all known notes as a
last backstop. A directory that appears, even nested and already full (`mkdir -p`, a moved-in
tree), is watched through its whole depth, and its notes are reported as created.

### Degrading loudly (plan `5.2`)

- **Watch limit exhausted** (`ENOSPC`, `EMFILE`, `ENFILE`, the inotify limits on the Linux VMs):
  one error message, `⚠ not watching` in the status line, and polling of open notes every
  `watch.poll_ms` (2 s).
- **One directory unwatchable:** found while testing, Bun's `fs.watch` fails for a directory
  that contains a broken symlink. That directory is polled instead, with a warning. It never goes
  silently quiet.

## Modes and dispatch (decision `3.11`)

Three modes in phase 2: overlay, pending sequence, normal. **Dispatch order:** overlay → pending
→ focused region (explorer) → global keymap. Every binding names a command id from the registry
(plan `0.8`).

When a key is both a binding and a prefix, as `space` is (page down, and the leader), slipbox
waits 400 ms for the next key, then runs the binding.

## Default keymap (plan `3.12`)

Remap in config under `[keys]` by command id; `""` unbinds. `slipbox commands` lists every id.

### Reading

| Keys | Command |
| --- | --- |
| `j` `k` `↓` `↑` `Ctrl-E` `Ctrl-Y` | scroll a line |
| `Ctrl-D` `Ctrl-U` | half page |
| `space` `PgDn` `Ctrl-F` / `PgUp` `Ctrl-B` `Shift-space` | page |
| `gg` `Home` / `G` `End` | top / bottom |
| `}` `]]` / `{` `[[` | next / previous heading |
| `/` then `n` `N` | find in note |

### Links and navigation

| Keys | Command |
| --- | --- |
| `Tab` / `Shift-Tab` | next / previous link |
| `Enter` `gf` | follow the link |
| `Ctrl-W f` | follow into the split |
| `H` `Ctrl-O` `Alt-←` `Backspace` / `L` `Alt-→` | back / forward |
| `Ctrl-P` `space f` `space space` | quick switcher |
| `o` `space o` | outline |
| `space l` / `space r` | links / backlinks |
| `:` `space p` | command palette |

### Tabs, split, explorer

| Keys | Command |
| --- | --- |
| `t` | open the note in a new tab |
| `gt` / `gT` | next / previous tab |
| `Ctrl-W c` | close the tab |
| `Ctrl-W v` `Ctrl-W s` `Ctrl-W q` | open or close the split |
| `Ctrl-W w` `Ctrl-W l` | focus the other pane, or leave the explorer |
| `space b` | buffers |
| `space e` / `Ctrl-W h` | toggle / focus the explorer |
| `space E` | reveal the note in the explorer |

### Copy, capture, look, app

| Keys | Command |
| --- | --- |
| `y p` `y r` `y l` `y y` | copy path, reference, link, selection |
| `c c` / `c s` | capture a reference / the selection to the scratch |
| `c y` / `c d` / `space s` | copy / clear / open the scratch |
| `space t` / `space g` | theme picker / cycle glyphs |
| `r` / `R` | reload the note / reindex the vault |
| `space m` / `?` | messages / keys |
| `q` `Ctrl-C` | quit, saving positions and session |
| `Esc` | close an overlay; clear selection, find, link focus |

## Parity with the CLI

Every TUI command is declared in `core/command-specs.ts` with the CLI invocation that reaches the
same state change, or marked as an interaction: scrolling, focus, modes and overlays. A test
fails if a command is implemented without a spec, or specified without an implementation. See
[cli.md](cli.md).
