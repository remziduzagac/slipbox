# Keymap

The reading keymap, decided 2026-09-25 as a replacement for the phase 2 keymap in the first
version of [tui.md](tui.md). Every binding here is a default: all of it, plus the leader key,
the which-key group names and the `:` aliases, comes from config and reloads live
([configuration.md](configuration.md)).

## Notation

Keys are written exactly as pressed. Letters are lowercase unless `shift+` is written, and
punctuation (`$ ^ { } [ ] / : |`) is written as the character it types. Words separated by
spaces are a sequence: `ctrl+w v` means press `ctrl+w`, release, then press `v`. `space` is the
leader; config writes it as `leader`, so remapping the leader moves every leader binding with it.

Config uses the same notation and accepts common spellings: `G` means `shift+g`, and `esc`,
`return`, `pgdn`, `option+…`, `super+…` and `command+…` are normalised.

## Conventions

- **Navigation has direct keys**, both vim-style and standard editor keys. **No emacs keys.**
  No `g` keys except `g g`.
- **Everything else is under the leader, `space`.** The which-key popup lists the next keys:
  immediately after the leader, and after 500 ms for the other prefixes (`y`, `ctrl+w`,
  `ctrl+t`, `[`, `]`, `g`). Each entry shows a name and a short explanation, in at most three
  columns packed from the left, and keys with the same action share an entry (`h left`). `backspace` goes up a
  level, and `esc` cancels.
- **Every `ctrl+` chord has a leader route.** Terminals, multiplexers and browsers swallow
  `ctrl+` keys (zellij takes `ctrl+t`, `ctrl+p`, `ctrl+o` and `ctrl+q`); nothing takes `space`.
- **Same letter twice opens that group's list:** `space h h`, `space l l`, `space t t`,
  `space f f`, `space u u`, `space s s`.
- **Plain `q` only closes** the pane or overlay it is in. **`ctrl+c` only copies**, and only
  when something is selected. Neither ever quits.

## The cursor

A reading cursor sits on the rendered text, like vim's normal mode.

- **What it looks like:** a block drawn on the character, and a highlighted row (`space u l`
  toggles the highlight). slipbox draws both itself, so they look the same in every terminal.
- **A line is a rendered row.** A wrapped paragraph has several stops, and table borders and
  blank rows are stops too.
- **Up and down keep the column** across short rows. A CJK character or emoji is one stop.
- **The view follows the cursor,** keeping `ui.scrolloff` rows of margin (default 3).
- **The link under the cursor** is the one every link command acts on.
- **Clicks and find move the cursor.** A mouse click sets it; find results land it on the
  match.
- **Reading position** and session restore remember the cursor.

## Cursor movement

| Movement | Vim keys | Editor keys |
| --- | --- | --- |
| left / right one character | `h` / `l` | `left` / `right` |
| up / down one row | `k` / `j` | `up` / `down` |
| previous / next word start | `b` / `w` | `alt+left` / `alt+right` |
| end of word | `e` | — |
| start / end of row | `0` / `$` | `home` / `end`, `ctrl+left` / `ctrl+right`, `cmd+left` / `cmd+right` |
| first non-blank of row | `^` | — |
| top / bottom of note | `g g` / `shift+g` | `ctrl+home` / `ctrl+end` |
| previous / next heading | `[ [` / `] ]` | `alt+up` / `alt+down` |
| previous / next paragraph | `{` / `}` | `ctrl+up` / `ctrl+down` |

## Scrolling

| Movement | Keys |
| --- | --- |
| half page down / up (cursor moves with it) | `ctrl+d` / `ctrl+u` |
| page down / up (cursor moves with it) | `pagedown` / `pageup` |
| mouse wheel | scrolls the view |

## Selection

| Action | Keys |
| --- | --- |
| extend by character / row | `shift+left` / `shift+right` / `shift+up` / `shift+down` |
| extend by word | `shift+alt+left` / `shift+alt+right` |
| extend to row start / end | `shift+ctrl+left` / `shift+ctrl+right`, `shift+home` / `shift+end` |
| extend by paragraph | `shift+ctrl+up` / `shift+ctrl+down` |
| extend to note top / bottom | `shift+ctrl+home` / `shift+ctrl+end` |
| extend by page | `shift+pageup` / `shift+pagedown` |
| visual mode, by character / whole rows | `v` / `shift+v`, then any movement |
| swap selection ends (visual mode) | `o` |
| copy the selection and leave visual mode | `y` |
| cancel (also clears find highlights) | `esc` |
| mouse | click moves the cursor; drag selects and copies on release |

## Copy

| Action | Keys |
| --- | --- |
| copy the selection, or the cursor row when nothing is selected | `y y` |
| copy the selection (only when something is selected) | `ctrl+c` |
| copy the note's path | `y p` |
| copy `path:line` of the cursor row | `y r` |
| copy the target of the link under the cursor | `y l` |

## Links — `space l`

| Action | Direct keys | Leader |
| --- | --- | --- |
| next / previous link (the cursor jumps to it) | `ctrl+tab` / `ctrl+shift+tab` | `space l n` / `space l p` |
| follow the link under the cursor, else the first on the row | `enter`, `ctrl+enter`, click | `space l f` |
| follow it into the split | — | `space l s` |
| copy its target | `y l` | `space l y` |
| links from this note (list) | — | `space l l` |
| backlinks: notes linking here (list) | — | `space l b` |

## History — `space h`

| Action | Direct keys | Leader |
| --- | --- | --- |
| back / forward | `shift+h` / `shift+l`, `ctrl+backspace` (back) | `space h p` / `space h n` |
| history list (pick an entry) | — | `space h h` |

## Windows — `space w`

One split per tab, side by side or stacked.

| Action | Direct keys | Leader |
| --- | --- | --- |
| split side by side | `ctrl+w v`, `ctrl+w \|` | `space w v` |
| split stacked | `ctrl+w s`, `ctrl+w -` | `space w s` |
| focus left / down / up / right | `ctrl+w h` `j` `k` `l`, `ctrl+w` + arrows | `space w` + same |
| other window | `ctrl+w w` | `space w w` |
| move window left / down / up / right | `ctrl+w shift+h` `j` `k` `l`, `ctrl+w shift+`arrows | `space w` + same |
| swap the two windows | `ctrl+w x` | `space w x` |
| close this window | `ctrl+w q` | `space w q` |
| keep only this window | `ctrl+w o` | `space w o` |

### Resize mode

One chord enters a mode; its keys repeat until you leave, so `l l l` widens step by step. The
which-key popup lists the keys while the mode is on, and the status chip reads `RESIZE`.

| Action | Keys |
| --- | --- |
| enter resize mode | `ctrl+alt+w`, `space w r` |
| narrower / wider | `h` / `l`, `left` / `right` |
| shorter / taller (a stacked split) | `k` / `j`, `up` / `down` |
| equal sizes | `=` (also `ctrl+w =`, `space w =` outside the mode) |
| leave | `esc`, `enter`, `q`; any other key leaves and does its normal job |

**What resizes follows focus:** the explorer's or the outline's width when it is focused,
otherwise the active window's share of the split. Sizes are remembered in the session, and the
defaults come from `ui.split_ratio`, `ui.sidebar_width` and `ui.outline_width`. The mode's keys
are `[keys.resize]` in config.

`ctrl+alt+w` arrives when `alt` does. On macOS that means Option set to act as Alt (Ghostty:
`macos-option-as-alt`); otherwise use `space w r`.

- **Focus moves beyond the panes:** out to the explorer on the left and the outline on the
  right, and back.
- **Moving a window** also chooses the split's orientation: moving right makes it the right pane
  of a side-by-side split.
- **Side by side falls back to stacked** when the terminal is too narrow.

## Tabs — `space t`

| Action | Direct keys | Leader |
| --- | --- | --- |
| new tab with the current note | `ctrl+t o` | `space t o` |
| list tabs (pick one) | `ctrl+t t` | `space t t` |
| next tab | `ctrl+t n`, `ctrl+t right`, `ctrl+pagedown` | `space t n` |
| previous tab | `ctrl+t p`, `ctrl+t left`, `ctrl+pageup` | `space t p` |
| go to tab N | `ctrl+t 1` … `ctrl+t 9` | `space t 1` … `space t 9` |
| move tab left / right | `ctrl+t shift+h` / `shift+l`, `ctrl+t shift+left` / `shift+right` | `space t` + the same |
| close tab | `ctrl+t q` | `space t q` |

## Explorer — left pane

| Action | Direct keys | Leader |
| --- | --- | --- |
| open → focus → close (a cycle) | `ctrl+e` | `space e` |
| reveal the current note | `ctrl+shift+e` (kitty-protocol terminals only) | `space shift+e` |

Inside the explorer (`[keys.explorer]` in config):

| Key | Action |
| --- | --- |
| `j` / `k`, `down` / `up` | move |
| `enter` | open the note in a new tab / expand a folder |
| `l`, `right` | open in the current window / expand |
| `h`, `left` | collapse |
| `s` | open in the split |
| `g g` / `shift+g` | top / bottom |
| `q` | close the explorer |
| `esc` | back to the note; the explorer stays open |
| mouse | click a folder to fold or unfold it; click a note to open it here, double-click for a new tab |

## Outline — right pane

| Action | Direct keys | Leader |
| --- | --- | --- |
| toggle | `ctrl+o` | `space o` |

It lists the note's headings and highlights the section the cursor is in. Inside the outline
(`[keys.outline]` in config):

| Key | Action |
| --- | --- |
| `j` / `k`, `down` / `up` | move |
| `enter`, mouse click | jump to the heading; clicking the `▾`/`▸` marker folds instead |
| `h` / `l`, `left` / `right` | fold / unfold |
| `g g` / `shift+g` | top / bottom |
| `q` | close the outline |
| `esc` | back to the note |

Below `ui.narrow_width` columns (default 90), the explorer and the outline open over the content.

## Find — `space f`

| Action | Direct keys | Leader |
| --- | --- | --- |
| find in this note (the cursor goes to the match) | `ctrl+f`, `/`, then `n` / `shift+n` | `space f /` |
| quick switcher: find a note by name | `ctrl+p` | `space f f` |
| outline picker: find a heading in this note | — | `space f o` |
| command palette / command line | `:` | `space f p` |
| *(reserved for phase 4)* vault text search / tags | — | `space f s` / `space f t` |

### The `:` prompt

You can type part of a command's name and pick it from the list. You can also type an exact
**alias**, which always wins over the fuzzy match. Typing an alias that takes an argument, then
a space, lists the candidates: notes, themes, glyph sets. Aliases come from `[aliases]` in
config.

| Alias | Runs |
| --- | --- |
| `:q`, `:quit` | quit |
| `:e <note>`, `:open <note>` | open a note |
| `:theme <name>` | set the theme |
| `:glyphs <nerd\|unicode\|ascii>` | set the glyph set |
| `:zen` | toggle zen mode |
| `:vs` / `:sp` | split side by side / stacked |
| `:tabnew` | new tab with the current note |
| `:noh` | clear find highlights |
| `:messages` | open the messages list |
| `:reload` | reload the note from disk |
| `:reindex` | reindex the vault |
| `:config` | reload the configuration |

## UI — `space u`

| Keys | Action |
| --- | --- |
| `space u u` | list the UI settings with their current values; pick one to change it |
| `space u t` | theme picker, previewed live (`esc` restores) |
| `space u g` | glyph picker: nerd, unicode, ascii (previewed live) |
| `space u w` | readable width: the text column capped at `ui.readable_max` (100), centred |
| `space u z` | zen mode: no top bar, explorer, outline, tab strip or status line; readable width on |
| `space u l` | cursor-row highlight on / off |
| `space u n` | source line numbers in a left gutter |
| `space u r` | link URLs shown after the link text |
| `space u m` | mouse on / off; off gives the mouse back to the terminal for native selection |

**Persistence.** UI settings apply at once and are remembered in the session. Config sets the
defaults, and a session setting is kept only while the config value it overrode is unchanged:
edit the config and the config wins again.

## Scratch — `space s`

| Keys | Action |
| --- | --- |
| `space s s` | open the scratch (it updates live as agents capture) |
| `space s a` | add the selection with its `path:line-line`, or `path:line` of the cursor row |
| `space s y` | copy the whole scratch |
| `space s d` | clear the scratch (asks first) |

## Note, vault, app

| Keys | Action |
| --- | --- |
| `space n r` | reload this note from disk |
| `space n i` | note info: path, size, modified time, links, backlinks, encoding |
| `space v r` | reindex the vault |
| `space v i` | vault info: root, notes, skipped paths, cache and state, watcher |
| `space v c` | reload the configuration (it also reloads by itself when a config file is saved) |
| `space m` | messages |
| `space ?` | every key and command, searchable |
| `space q q` | quit (also `ctrl+q`, `:q`) |

## Mouse

Everything on screen that looks clickable is clickable. The item under the pointer is highlighted
with the `hover` role. `space u m` turns the mouse off, which gives it back to the terminal.

### Chrome

| Where | What the mouse does |
| --- | --- |
| top bar `≡` / `▤` | toggle the explorer / the outline |
| top bar `slipbox` chip | open the command palette |
| window breadcrumb | scroll that window to the heading, and focus it; its icon finds a heading |
| tab | click to switch; drag to reorder; middle-click or `×` to close |
| tab strip, wheel | previous / next tab |
| pane borders | drag to resize the explorer, the outline, or the split |
| scrollbar | click to jump; drag to scroll |
| status line path | copy the note's path |
| message line | click to open the messages |
| which-key popup | click an entry: a group opens it, a command runs it |

### Content, panes, lists

| Where | What the mouse does |
| --- | --- |
| note | click moves the cursor; drag selects and copies on release |
| note, double / triple click | select and copy the word / the row |
| note, wheel | scroll the view |
| explorer, outline | see their sections above |
| lists, wheel | move the selection |

## Platform notes

- **macOS:** `ctrl+left` / `ctrl+right` / `ctrl+up` / `ctrl+down` switch desktops and open
  Mission Control by default, so they never arrive. `cmd+left` / `cmd+right` arrive only if the
  terminal passes them through. Their alternatives always work.
- **Older terminals:** `ctrl+shift+e`, `ctrl+tab`, `ctrl+enter` and `ctrl+backspace` can't be
  told apart from their plain forms. Each one has a fallback that works everywhere.
- **Multiplexers:** zellij takes `ctrl+t`, `ctrl+p`, `ctrl+o` and `ctrl+q`, and tmux and herdr
  take `ctrl+b`, which slipbox doesn't use. The leader routes always work.
