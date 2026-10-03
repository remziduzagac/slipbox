# Keymap

The reading keymap, decided 2026-09-25 as a replacement for the phase 2 keymap in the first
version of [tui.md](tui.md). Every binding here is a default: all of it, plus the leader key,
the which-key group names and the `:` aliases, comes from config and reloads live
([configuration.md](configuration.md)). [keymap-comparison.md](keymap-comparison.md) sets the keys
beside vim's, VS Code's and Obsidian's.

## Notation

Keys are written exactly as pressed. Letters are lowercase unless `shift+` is written, and
punctuation (`$ ^ { } [ ] / : |`) is written as the character it types. Words separated by
spaces are a sequence: `ctrl+w v` means press `ctrl+w`, release, then press `v`. `space` is the
leader; config writes it as `leader`, so remapping the leader moves every leader binding with it.

Config uses the same notation and accepts common spellings: `G` means `shift+g`, and `esc`,
`return`, `pgdn`, `option+…`, `super+…` and `command+…` are normalised.

## Conventions

- **Vim's keys first, the desktop editors' `ctrl` keys second, the leader for the rest** (decided
  2026-09-29). A key keeps its vim meaning where slipbox has the action (`H` `M` `L`, `zz`,
  `ctrl+o`, `gt`, `gf`, `:q`) — `?` aside, which is help, the key most apps give it; the `ctrl` keys
  VS Code and Obsidian share come next (`ctrl+f`, `ctrl+p`, `ctrl+s`, `ctrl+z` / `ctrl+y`,
  `ctrl+←/→` by word, `ctrl+shift+f`, `ctrl+tab`, `alt+←/→` back and forward); `ctrl+w` and `ctrl+t`
  stay vim's and slipbox's prefixes for windows and tabs; everything else is under `space`. **No
  emacs keys.**
- **Direct keys beside navigation** are few: `?` help, `:` the palette, `/` and `ctrl+f` find
  (`n` / `shift+n`), `ctrl+p` the switcher, the `y …` copies, `v` visual mode, `ctrl+e` source
  mode, `ctrl+q` quit. The which-key popup lists the next keys: immediately after the
  leader, and after 500 ms for the other prefixes (`y`, `ctrl+w`, `ctrl+t`, `[`, `]`, `g`, `z`).
  Each entry shows a name and a short explanation, in at most three columns, and keys with the same
  action share an entry (`h left`). `backspace` goes up a level, and `esc` cancels. A key that is
  both a binding and a prefix waits the same delay (`input.which_key_delay_ms`) for the next key
  before it runs.
- **Every `ctrl+` chord has another route**, usually under the leader: terminals, multiplexers
  and browsers swallow `ctrl+` keys (zellij takes `ctrl+t`, `ctrl+p`, `ctrl+o` and `ctrl+q`);
  nothing takes `space`. Cursor movement is the exception (its chords have direct alternatives:
  page keys, arrows, `home` / `end`), and `ctrl+c`'s alternative is `y y`. slipbox reads the
  terminal raw, so `ctrl+c` and `ctrl+z` are keys here (copy, undo) — never an interrupt or a
  suspend.
- **Same letter twice opens that group's list:** `space h h`, `space l l`, `space t t`,
  `space f f`, `space u u`, `space s s`.
- **Plain `q` closes**: the explorer, the outline or resize mode where they have focus; in the note,
  the window (vim's `:q` without the quitting), or the tab when it's the last window — never the
  last one, which only `ctrl+q`, `:q` or `:qa` quit. In lists and prompts it is typed. **`ctrl+c`
  copies** when something is selected, and in a list or prompt it cancels; it never quits.

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
| previous / next word start | `b` / `w` | `ctrl+left` / `ctrl+right` |
| end of word | `e` | — |
| start / end of row | `0` / `$` | `home` / `end`, `cmd+left` / `cmd+right` |
| first non-blank of row | `^` | — |
| top / bottom of note | `g g` / `shift+g` | `ctrl+home` / `ctrl+end` |
| previous / next heading | `[ [` / `] ]` | `alt+up` / `alt+down` |
| previous / next paragraph | `{` / `}` | `ctrl+up` / `ctrl+down` |
| top / middle / bottom row on screen | `shift+h` / `shift+m` / `shift+l` | — |
| a line by number (a prompt; `:42` too) | `42 g g`, `42 shift+g` (source) | `ctrl+g`, `space f l` |

## Scrolling

| Movement | Keys |
| --- | --- |
| half page down / up (cursor moves with it) | `ctrl+d` / `ctrl+u` |
| page down / up (cursor moves with it) | `pagedown` / `pageup` |
| the cursor's line to the middle / top / bottom of the window | `z z` / `z t` / `z b` |
| mouse wheel | scrolls the view |
| horizontal wheel or trackpad | scrolls sideways: the note with wrapping off, a side pane with rows wider than it |

## Selection

| Action | Keys |
| --- | --- |
| extend by character / row | `shift+left` / `shift+right` / `shift+up` / `shift+down` |
| extend by word | `shift+ctrl+left` / `shift+ctrl+right`, `v` + `w` `b` `e` |
| extend to row start / end | `shift+home` / `shift+end`, `v` + `0` `$` |
| … also | `shift+cmd+left` / `shift+cmd+right` (where the terminal passes `cmd` through) |
| extend by paragraph | `shift+ctrl+up` / `shift+ctrl+down` |
| extend to note top / bottom | `shift+ctrl+home` / `shift+ctrl+end` |
| extend by page | `shift+pageup` / `shift+pagedown` |
| visual mode, by character / whole rows | `v` / `shift+v`, then any movement (the same key again leaves) |
| swap selection ends (visual mode) | `o` |
| copy the selection and leave visual mode | `y` |
| cancel (also clears find highlights; with neither, focuses the note) | `esc` |
| mouse | click moves the cursor (on a link, follows it); drag selects and copies on release |

## Copy

| Action | Keys |
| --- | --- |
| copy the selection, or the cursor row when nothing is selected | `y y` |
| copy the selection (only when something is selected) | `ctrl+c` |
| copy the note's path | `y p` |
| copy `path:line` of the cursor row | `y r` |
| copy the target of the link under the cursor | `y l` |

Every copy goes to the system clipboard (through the terminal, then `wl-copy`, `xclip` or
`pbcopy`), and so does every cut (`x`, `d…`, `c…`, as vim with `clipboard=unnamedplus`). `p` puts
what the system clipboard holds — read with `wl-paste`, `xclip`, `xsel` or `pbpaste` — and falls
back to slipbox's own register when it can't be read (over SSH, say). The terminal's paste
(`ctrl+shift+v`, `cmd+v`) types the text while typing, and puts it like `p` in normal mode.
`ctrl+v` is not bound.

## Links — `space l`

| Action | Direct keys | Leader |
| --- | --- | --- |
| next / previous link (the cursor jumps to it) | `tab` / `shift+tab`, `] l` / `[ l` | `space l n` / `space l p` |
| follow the link under the cursor, else the first on the row | `enter`, `g f`, `g x`, click on it | `space l f` |
| follow it into the split | `ctrl+enter`, `ctrl+w f` | `space l s`, `space w f` |
| copy its target | `y l` | `space l y` |
| links from this note (list) | — | `space l l` |
| backlinks: notes linking here (list) | — | `space l b` |
| relink: this note's links that reach a note by an old name or a move, to its name now (`:relink`) | — | `space l r` |
| convert every note's links to plain paths, after a preview (`:convert-links`, `20.1`) | — | — |

What's under the cursor, as vim and LazyVim have it (`19.12`, `19.13`) — in code, its language server answers; in a
note, slipbox does:

| Action | Keys |
| --- | --- |
| hover: what it is, floating (types, docs); on a note's link, where it lands | `shift+k` |
| go to its definition; in a note, follow the link | `g d` |
| its references, to pick from; in a note, its backlinks | `g r` |

What a code file's language server changes (`19.15`) — `space c`, as LazyVim has it:

| Action | Keys |
| --- | --- |
| rename the symbol under the cursor everywhere, after a preview; in a note, the cursor's heading | `space c r` |
| code actions: the servers' fixes and refactorings for the cursor's line, to pick from | `space c a` |
| format the file, as its server formats it: one undo step | `space c f` |

Typing in a code file, its server's completion shows under the cursor (`19.16`) — in a note, a link's target after
`](`, slipbox's own (`20.13`); while it shows, these keys are its,
as vim's and blink.cmp's:

| Action | Keys |
| --- | --- |
| the next / previous item | `ctrl+n`, `down` / `ctrl+p`, `up` |
| put the chosen one in (with its import, if it has one) | `tab`, `enter` |
| close it, still typing | `ctrl+e` |
| close it and leave insert | `esc` |

## History — `space h`

| Action | Direct keys | Leader |
| --- | --- | --- |
| back / forward | `ctrl+o` / `alt+right`, `alt+left` (back) | `space h p` / `space h n` |

Vim's forward is `ctrl+i`, but terminals send `ctrl+i` as `tab`, which is next link here: forward is
`alt+right` (VS Code's) and `space h n`.
| history, in the left panel (open → focus → close) | — | `space h h` |

## Windows — `space w`

One split per tab, side by side or stacked.

| Action | Direct keys | Leader |
| --- | --- | --- |
| split side by side | `ctrl+w v`, `ctrl+\` | `space w v` |
| split stacked | `ctrl+w s` | `space w s` |
| focus left / down / up / right | `ctrl+w h` `j` `k` `l`, `ctrl+w` + arrows | `space w` + same |
| other window | `ctrl+w w` | `space w w` |
| move window left / down / up / right | `ctrl+w shift+h` `j` `k` `l`, `ctrl+w shift+`arrows | `space w` + same |
| swap the two windows | `ctrl+w x` | `space w x` |
| close this window (the tab, when it's the last window; never quits) | `ctrl+w q`, `q` | `space w q` |
| keep only this window | `ctrl+w o` | `space w o` |
| wider / narrower, one step (then resize mode) | `ctrl+w >` / `ctrl+w <` | `space w >` / `<` |
| taller / shorter, one step (then resize mode) | `ctrl+w +` / `ctrl+w -` | `space w +` / `-` |
| equal sizes | `ctrl+w =` | `space w =` |

### Resize mode

One chord enters a mode; its keys repeat until you leave, so `l l l` widens step by step. The
which-key popup lists the keys while the mode is on, and the status chip reads `RESIZE`. The vim
keys `ctrl+w >` `<` `+` `-` resize one step and then enter the mode, so `ctrl+w > > >` keeps
widening without the chord.

| Action | Keys |
| --- | --- |
| enter resize mode | `space w r`; or resize one step with `ctrl+w >` `<` `+` `-` |
| narrower / wider (2 columns a step) | `h` / `l`, `left` / `right`, `<` / `>` |
| shorter / taller (a stacked split) | `k` / `j`, `up` / `down`, `-` / `+` |
| equal sizes | `=` (also `ctrl+w =`, `space w =` outside the mode) |
| leave | `esc`, `enter`, `q`; any other key leaves and does its normal job |

**What resizes follows focus:** the explorer's or the outline's width when it is focused, otherwise
the active window's share of the split. Sizes are remembered in the session, and the defaults come
from `ui.split_ratio`, `ui.sidebar_width` and `ui.outline_width`; `=` evens a split to half and puts
the pane widths back to those defaults. Pane widths stay between 12 columns and half the terminal,
leaving the note at least 24; a split stays between 15% and 85%. The mode's keys are `[keys.resize]`
in config.

- **Focus moves beyond the panes:** out to the explorer on the left and the outline on the
  right, and back.
- **Moving a window** also chooses the split's orientation: moving right makes it the right pane
  of a side-by-side split.
- **Side by side falls back to stacked** when the terminal is too narrow.

## Tabs — `space t`

| Action | Direct keys | Leader |
| --- | --- | --- |
| new tab with the current note (`:tabnew`) | `ctrl+t c` | `space t c` |
| list tabs (pick one) | `ctrl+t t` | `space t t` |
| next tab | `g t`, `ctrl+tab`, `ctrl+pagedown`, `ctrl+t n`, `ctrl+t right` | `space t n`, `space t right` |
| previous tab | `g shift+t`, `ctrl+shift+tab`, `ctrl+pageup`, `ctrl+t p`, `ctrl+t left` | `space t p`, `space t left` |
| go to tab N | `alt+1` … `alt+9`, `ctrl+t 1` … `ctrl+t 9` | `space t 1` … `space t 9` |
| move tab left / right | `ctrl+shift+pageup` / `pagedown`, `ctrl+t shift+h` / `l` (or arrows) | `space t` + the same |
| close tab | `ctrl+t q`, `q` on its last window | `space t q` |
| close the other tabs but the pinned (`:tabonly`) | `ctrl+t o` | `space t o` |
| close all tabs but the pinned (the explorer then opens a note) | `ctrl+t shift+q` | `space t shift+q` |
| pin / unpin tab (`:tabpin`): kept left, its note kept, never bulk-closed | `ctrl+t m` | `space t m` |

## Explorer — left pane

| Action | Direct keys | Leader |
| --- | --- | --- |
| open → focus → close (a cycle) | — | `space e` |
| reveal the current note | — | `space shift+e` |

Inside the explorer (`[keys.explorer]` in config):

| Key | Action |
| --- | --- |
| `j` / `k`, `down` / `up` | move (selects only; nothing opens) |
| `enter` | open the note as a tab (or switch to its tab) / fold or unfold a folder |
| `l`, `right` | open the note as a tab (or switch to its tab) / unfold a folder |
| `o` | open the note in the current window, replacing what it shows |
| `h`, `left` | collapse |
| `s` | open in the split's other window (splitting first) |
| `g g` / `shift+g` | top / bottom |
| `/` | filter: type to narrow the tree (folders kept); arrows move, `enter` opens, `esc` clears |
| `a` | show every text file, or back to what `files.show` lists (notes and data files) |
| `n` / `shift+n` | a new note / folder in the selected folder (beside a selected file); `space n n` too |
| `r` | rename the selected note, file or folder (a nested vault's folder too), in its folder: links fixed |
| `shift+r` | on a nested vault's row: rename the vault (its name; the folder stays) |
| `m` | move it to a folder picked from a tree (`←` `→` fold, typing filters): links fixed after a preview |
| `d` | delete it to the vault's trash, after asking (it says how many links break) |
| `u` | restore what was deleted last (`space v t`, `:trash`: the rest) |
| `shift+u` | undo the vault's last rename, move or relink, after a preview (`7.4`) |
| `y` / `x` / `p` | copy / cut it; paste in the selected folder: a copy (`name-copy` beside it), or a move |
| `v` / `shift+v` | make the selected folder a vault (its name asked) / a nested vault a plain folder; links previewed |
| `.` | the selected row's menu, as its `…` button opens it: each entry with its key, which picks it there |
| `q` | close the explorer |
| `esc` | back to the note; the explorer stays open (over the content, it closes) |
| mouse | click a folder to fold or unfold it; click a note to select it, double-click to open it as a tab |
| buttons | the title's new note and new folder; the selected row's `…`: its menu (rename, move, delete…) |

The history view (`space h h`, the left rail's `◷`) takes the same keys: `j` / `k` move, `enter`,
`l` or a click jumps to the place, `/` filters, `q` closes, `esc` goes back to the note.

### Notes, folders, vaults — `space n`, `space d`, `space v`

Everything the explorer does to files has a leader key too, so which-key lists it (`18.13`): `space n` for a note,
`space d` for a folder, `space v` for a vault. With the explorer focused they act on its selected row (`space d`: a
file's folder); elsewhere on the current note, its folder, or this vault.

| Keys | Action |
| --- | --- |
| `space n n` / `space d n` | a new note / folder in the selected folder, or beside this note |
| `space n m` | rename or move the note by its path (`:rename`, `:mv`): links fixed after a preview |
| `space n h` | rename the heading the cursor is under: every link to it fixed after a preview (`11.9`) |
| `space n shift+m` / `space d m` | move the note / the folder to a folder picked from a tree |
| `space d r` | rename the folder in place |
| `space n d` / `space d d` | delete the note / the folder to the vault's trash, after asking (`:delete`) |
| `space n y` / `space d y` | copy the note / the folder, to paste |
| `space n x` / `space d x` | cut the note / the folder, to paste (a move, links fixed) |
| `space d p` | paste into the folder: what was copied, or cut |
| `space n shift+y` | a copy of the note beside it (`name-copy`), opened |
| `space v t` / `space v u` | the trash (`:trash`) / restore what was deleted last |
| `space v shift+u` | undo the last rename, move or relink (`:undo-rename`, `7.4`): its preview, then as it was |
| `space v p` | the problems (`:problems`, `1.7`): broken and ambiguous links, in the left panel |
| `space v m` | make a vault (`:init`): this loose folder; in a vault, the selected folder (or this note's) |
| `space v shift+m` | make the vault a plain folder of the one holding it (this one: then into its parent) |
| `space v n` | rename the vault (the selected one, or this one) |

## Outline — right pane

| Action | Direct keys | Leader |
| --- | --- | --- |
| open → focus → close (a cycle) | — | `space o` |

Like the explorer: opening it focuses it; while open but unfocused, the key focuses it; while
focused, the key closes it and focus returns to the note. The `▤` button on the right rail (or, without
it, at the right of the breadcrumb) runs `outline.toggle` instead: show and focus, or hide. It lists the note's headings
and, while unfocused, keeps its selection on the section the cursor is in. Inside the outline
(`[keys.outline]` in config):

| Key | Action |
| --- | --- |
| `j` / `k`, `down` / `up` | move |
| `enter` | jump to the heading; focus goes to the note |
| mouse click | jump to the heading (the note takes focus); on the `▾`/`▸` marker, fold or unfold |
| `h` / `l`, `left` / `right` | fold / unfold |
| `g g` / `shift+g` | top / bottom |
| `/` | filter: type to narrow the headings (their parents kept); `enter` jumps, `esc` clears |
| `r` | rename the selected heading: every link to it fixed after a preview (`11.9`) |
| `q` | close the outline |
| `esc` | back to the note (over the content, the outline closes) |

**Footnotes** (`3.17`) are the right panel's other view, its superscript button (unicode `¹`, ascii `^`) under the
outline's: `space n f` cycles it as `space o` does the outline (`:footnotes` toggles it). It takes the outline's keys:
`j` / `k` move, `enter` (or a click) jumps to the footnote's definition, or to a reference, `l` / `h` unfold and fold a
footnote's references, `/` filters by label and text, `q` closes, `esc` goes back to the note. Changing them (`3.18`,
`[keys.footnotes]`): `a` adds one at the note's cursor (as `space n shift+f` does anywhere, and the `+` on the view's
title), `e` edits the selected one's text, `r` renames its label, `d` deletes it after asking.

**Info** (`3.19`) is the right panel's first view, its button above the outline's: `space n i` cycles it. It takes
the outline's keys (`[keys.info]`): `j` / `k` move, `enter` (or a click) opens what a row names — a property's line,
a tag's notes, the links, backlinks, outline or footnotes — or copies its value, `y` copies, `h` / `l` fold and unfold
a section, `/` filters, `e` edits the properties, `q` closes, `esc` goes back to the note.

**The properties editor** (`3.20`: `e` there, or `space n shift+p`) floats over the windows with the note's
frontmatter: every editing key works in it. `esc` in normal mode, `q` or `:q` close it, writing back what changed;
`ctrl+s` or `:w` write it back and keep it open.

Below `ui.narrow_width` columns (default 90), the explorer and the outline open over the content.

## Find — `space f`

| Action | Direct keys | Leader |
| --- | --- | --- |
| find in this note, in the window's find row (empty clears) | `ctrl+f`, `/`, then `n` / `shift+n` | `space f /` |
| while typing it: regex / whole words (also its `.*` / `ab` buttons) | `alt+r` / `alt+w` | — |
| find and replace (the markdown); into replace / back | `ctrl+h`; `tab` / `shift+tab` | `space f r` |
| the replace row open / closed (its `⇄` button) | `alt+h` | — |
| in replace: one / all, one undo step (or buttons) / move | `enter` / `alt+a` (`alt+enter`) / `ctrl+n`, `ctrl+p` | — |
| onto the next / previous character typed on the line; just before it | `f` / `shift+f`; `t` / `shift+t` | — |
| the last `f` `t` again / the other way | `;` / `,` | — |
| the whole word under the cursor, forward / backward | `*` / `#` | — |
| quick switcher: find a note by name; `#` first, a symbol (a server's, else a heading) | `ctrl+p` | `space f f` |
| outline picker: find a heading in this note | — | `space f o` |
| the vault's tags (`:tags`), then a tag's notes (`:tag name`) | — | `space f t` |
| heading path: the breadcrumb's headings as a dropdown | — | `space f b` |
| find in every note and file: each line with the text (open ones as they are) | `ctrl+shift+f` | `space f g` |
| search the vault, ranked as you type (`:search`); `ctrl+a` more vaults (`20.16`); enter opens | — | `space f s` |
| go to a line by number (`:42` too) | `ctrl+g` | `space f l` |
| command palette / command line | `:`, `ctrl+shift+p` | `space f p` |
| *(reserved for phase 4)* tags | — | `space f t` |

`n` always goes to the match after the cursor and `shift+n` to the one before, wherever it has
moved since the last one — never vim's "the way the search went" — and they wrap around the note
(the message says so: "from the top"). There is no backward search key (`?` is help): search with
`/`, then `shift+n`. `*` and `#`
search for the whole word under the cursor (or, off a word, the next one on its row): not inside
longer words, smart case like `/`.

### The `:` prompt

You can type part of a command's name and pick it from the list. You can also type an exact
**alias**, which always wins over the matches. Typing an alias that takes an argument, then
a space, lists the candidates: notes, themes, glyph sets. Aliases come from `[aliases]` in
config.

| Alias | Runs |
| --- | --- |
| `:q`, `:quit` | close the window, or its tab; on the very last one, quit (vim's) |
| `:qa`, `:qall` | quit |
| `:42` | go to line 42 |
| `:help` | all keys and commands |
| `:lens`, `:live` | open or close the lens |
| `:e <note>`, `:open <note>` | open a note, or any text file of the vault by its path (`:e tool.py`) |
| `:tags`, `:tag <name>` | the vault's tags; a tag's notes |
| `:theme <name>` | set the theme |
| `:glyphs <nerd\|unicode\|ascii\|auto>` | set the glyph set |
| `:zen` | toggle zen mode |
| `:wrap` | toggle wrapping |
| `:vs` / `:sp` | split side by side / stacked |
| `:tabnew` | new tab with the current note |
| `:new <name>` / `:mkdir <name>` | a new note / folder beside this note (a leading `/`: from the vault's root) |
| `:noh` | clear find highlights |
| `:messages` | open the messages list |
| `:reload` | reload the note from disk |
| `:reindex` | reindex the vault |
| `:vaults` | the vaults this machine knows: pick one to switch to |
| `:init` | make this loose folder a vault |
| `:vault-moved` | a copy of this vault gone from where it was: did it move here? (`20.5`) |
| `:pin-root` | keep this vault among the explorer's roots after leaving it, or no longer (`20.15`) |
| `:delete` | delete the note to the vault's trash (asks first) |
| `:trash` | the trash: `enter` restores an item |
| `:config` | reload the configuration |

**Substitute** is vim's, typed at the `:` prompt (`find.substitute`): `:s/old/new/` on the cursor's
line, `:%s/old/new/` on the note, `:'<,'>s/old/new/` on the last selection's lines — pressing `:` on a
selection types `'<,'>` for you. Without `g` only the first match on each line is replaced; `i`
ignores case (otherwise smart case, as `/`); `c` asks at each match in the window's find and replace
rows, `replace? y n a q` (`l` replaces this one and stops, `esc` stops too). The pattern is a
JavaScript regex; any punctuation can delimit (`:s#a/b#c#`) and `\` escapes it. In the replacement
`\1`–`\9` are groups, `&` the match, `\&` a literal `&`. `^` and `$` are a line's start and end, and
a match of nothing inserts there: `:%s/^/> /` quotes every line, `:%s/$/!/` ends each with `!`. A
substitute is one undo step, confirmed or not, and works on the markdown: a rendered window switches
to editing first. `'<,'>` is the last selection's lines, also after it ended.

## Editing

Phase 3 (plan). The hand-offs (`space n e`, `space n s`) are under "Note, vault, app". Editing
happens in source mode; the keys that start it work from the render too, switching the window to
source first.

| Action | Keys |
| --- | --- |
| tick or untick the task item at the cursor (the innermost, on any of its rows) | `ctrl+l`, `space n t`, a click |
| show this window's note as its raw markdown, or rendered again (`:source`) | `ctrl+e`, `space n v` |
| open the lens: the markdown around the cursor, the rest rendered (`:lens`); `esc` closes it | `space n l` |
| the lens a block bigger / smaller (the size kept as it moves) / its own size again | `+` / `-` / `=` |
| type before the cursor / after it | `i` / `a` |
| type at the line's first non-blank / its end | `shift+i` / `shift+a` |
| open a line below (continuing a list) / above, and type | `o` / `shift+o` |
| cut the character under the cursor (it goes to the clipboard, as vim's `x`) | `x` (source) |
| undo / redo (an insert session is one step) | `u`, `ctrl+z` / `ctrl+r`, `ctrl+y`, `shift+u` |
| a new note beside this one (`:new name`; `projects/idea` makes the folder too) | `ctrl+n`, `space n n` |
| a new folder beside this note (`:mkdir name`) | `ctrl+shift+n`, `space d n` |
| rename or move the note (`:rename path`, `:mv path`): a preview, then `enter` | `space n m` |
| rename the vault: a preview, then `enter` | `space v n` |
| delete the note to the vault's trash, after asking (`:delete`) | `space n d` |
| a copy of the note beside it (`name-copy`), opened | `space n shift+y` |
| the trash: what was deleted, `enter` restores (`:trash`) | `space v t` |
| make this loose folder a vault (`:init`), or in a vault a folder of it | `space v m` |
| save (`:w`, `:write`) | `ctrl+s`, `space n w` |
| save every changed note (`:wa`, `:wall`); `:wqa`, `:xa` save all and quit | `space n shift+w` |
| save over a file changed on disk / reload it, dropping changes (undoable) | `:w!` / `:e!` |
| the conflict prompt again: load theirs, keep yours, diff, merge | `space n c` |
| save everything and quit / quit without saving | `:wq`, `:x` / `:q!` |
| quit (asks nothing when all is saved) | `ctrl+q`, `space q q`, `:qa` |

**Normal mode in source** is vim-shaped (`[keys.source]`; these keys do nothing in the render):

| Action | Keys |
| --- | --- |
| delete / change / yank what a motion or text object covers | `d` / `c` / `y` + motion |
| indent / outdent the lines it covers (two spaces) | `>` / `<` + motion |
| … whole lines | `dd` `cc` `yy` `>>` `<<` |
| to the line's end: delete / change | `shift+d` / `shift+c` |
| substitute the character / the line | `s` / `shift+s` |
| replace the character with the next one typed | `r` |
| join the line below / toggle case | `shift+j` / `~` |
| move the line (or V's lines) up / down | `alt+shift+up` / `alt+shift+down` |
| older / newer change (vim's change list) / insert where the last insert ended | `g ;` / `g ,` / `g i` |
| put after / before (a line register: under / over the line) | `p` / `shift+p` |
| repeat the last change | `.` |
| in visual mode: delete, change, indent, outdent the selection | `d` `x`, `c`, `>`, `<` |
| in visual mode: select a text object (`viw`, `vi(`); counts work (`v2j`, `V3>`) | `i` / `a` + object |

Motions are the reading keys (`w` `b` `e` `0` `^` `$` `j` `k` `g g` `shift+g` `{` `}`, `f` `t`…), and
a search: after an operator, `/` covers the text up to the match you accept, and `n` / `shift+n` up
to the next or previous one (`d/foo`, `dn`). `j`, `k`,
`g g` and `shift+g` take whole lines (with a count, to that line: `d3G`), `e` and `$` include the
character they land on, `cw` changes to the word's end, and `dw` stops at the line's end. An
exclusive motion that ends at a line's start ends at the end of the line before instead, and from
the first non-blank takes whole lines (vim's rule): `d}` keeps the blank line, `c}` changes the
paragraph's lines, `db` at a line's start stays on the line above. `}` in the last paragraph goes
to its last character. Text objects follow `i` (inside) or `a` (around):
`w` `W` a word, `"` `'` `` ` `` quotes on the line (`a"` takes the space after, else before), `(` `b`
`[` `{` `B` `<` brackets (nested, across lines; `i(` with the brackets on lines of their own takes the
lines between, whole), `p` a paragraph (`ap` on the last one takes the blank lines before it).
`g n` / `g shift+n` after an operator is the search's next / previous match
(the one under the cursor included): `cgn`, type, `esc`, then `.` changes the next one, and the next.
A count goes before the command, the motion or the text object (`3dd`, `d2w`, `5j`, `d2i(`, `d2aw`).
`cw` on a word's last letter, or a one-letter word, changes just that letter, as in vim. The
status chip shows what's pending (`2d`, `di`). The register holds the last text deleted, changed or
yanked; a yank also goes to the clipboard.

Quitting (`ctrl+q`, `:q`) with unsaved changes is refused, naming the notes. In **insert mode**
(the chip reads `INSERT`) keys are text, except: `esc` (or `ctrl+c`) back to normal, the cursor
stepping back onto a character; `enter` a new line with the same indentation, continuing a list
(the same bullet, the next number, an empty task box) — or, on an item with nothing after its
marker, ending the list; `backspace` / `delete` a character (joining lines at an edge); `ctrl+w`
the word before; `ctrl+u` what was typed on the line, then the rest before the cursor, and at the
line's start joins it to the one above (`ctrl+w` too stops once where the insert began); `tab` /
`shift+tab` indent or outdent the line by two spaces; the arrows, `home` and `end` move; `ctrl+s`
saves. A paste goes into the text. While a code file's completion shows, `tab`, `enter`, `ctrl+n`, `ctrl+p`, `up`,
`down` and `ctrl+e` are its (`space c`, above).
Source mode's own keys are `[keys.source]` in config: the operators and edits above (`d c y > < D C s
S r J p P ~ . x`), which win over the reading keys there.

**Where source mode isn't vim.** Motions move by the rows you see, as in reading: on a long line
wrapped across rows, `0`, `$`, `j` and `k` (and `d$`, `dj`) work on the row, while `D`, `C`, `A`,
`I`, `dd` and `cc` work on the whole source line. A word motion never stops inside a word where it
wraps. Each CJK character is a word for `w`, `b` and `e`, while `iw`, `*` and `#` take the whole run
of them. `/` typed with the cursor on a match stays on it (vim moves to the next). `r` and `f` take
a character typed, not `enter` or `tab`. A count before `gg` or `G` is a line number (`3gg`, `5G`).
The cursor stops on trailing spaces and on a tab (one stop, as wide as it's drawn), as in vim. Also
not vim: `$` in visual mode stops on the last character, so `v$d` keeps the line break; `<` on a
tab-indented line takes the tab (never turns it into spaces); a count before `i`, `a`, `o` is
ignored (`3ix` types one x); `n` and `shift+n` go forward and back through the note whichever of
`/`, `*` or `#` started the search; `.` doesn't repeat a characterwise visual change that spans
lines; `:s` takes only `%` and `'<,'>` for ranges (`:2,5s` says so). A note with no final newline
gets one when a line is added after its last.

## UI — `space u`

| Keys | Action |
| --- | --- |
| `space u u` | list the UI settings with their current values; pick one to change it |
| `space u t` | theme picker, previewed live (`esc` restores) |
| `space u g` | glyph picker: nerd, unicode, ascii or auto (previewed live) |
| `space u shift+w` | readable width: the text column capped at `ui.readable_max` (100), centred |
| `space u z` | zen: no bars, frame, panes, tabs or breadcrumbs; readable width on |
| `space u l` | cursor-row highlight on / off |
| `space u n` | source line numbers in a left gutter |
| `space u w` | wrap long lines (on by default; `alt+z` too); off, notes keep their width and scroll sideways |
| `space u r` | link URLs shown after the link text |
| `space u m` | mouse on / off; off gives the mouse back to the terminal for native selection |
| `space u b` | top bar on / off (the palette chip and vault state); the note takes its row |
| `space u d` | the problems bar on / off: each line's problems, counted, coloured by the worst (`19.9`) |
| `space u shift+d` | problems marked in the text on / off: underlined where they are (`19.10`) |

**Persistence.** UI settings apply at once and are remembered in the session. Config sets the
defaults, and a session setting is kept only while the config value it overrode is unchanged:
edit the config and the config wins again.

## Scratch — `space s`

| Keys | Action |
| --- | --- |
| `space s s` | open the scratch (it updates live as agents capture) |
| `space s a` | add the selection with its `path:line-line`, or `path:line` of the cursor row |
| `space s y` | copy the whole scratch |
| `space s c` | copy the note's context for an agent: it, what it links to, what links to it (`:context`, `9.7`) |
| `space s d` | clear the scratch (asks first) |

## Git — `space g`

| Keys | Action |
| --- | --- |
| `space g c` | the files this branch changed against the base (`:changes`); enter: a file's diff (`5.13`) |
| `space g d` | this note's diff against the base, as it is now (`:diff`); enter goes to the line |
| `space g w` | the worktrees by branch (`:worktrees`); enter opens this note in the one picked (`5.14`) |
| `space g m` | a merge picked: the links it would break, with their fixes (`:merge-review`, `20.21`) |

## Note, vault, app

| Keys | Action |
| --- | --- |
| `space n e` | edit in your editor at the cursor's line, in this terminal; back here when it closes |
| `space n s` | send the note to your editor already running elsewhere: a running nvim by default |
| `space n p` | choose which running nvim `space n s` sends to (it asks by itself when unsure) |
| `space n r` | reload this note from disk |
| `space n i` | the Info view (`3.19`): open, focus, close — the file's path, vault, counts, properties, tags, links |
| `space v v` | switch vault: the vaults this machine knows (`:vaults`); `back` returns |
| `space v r` | reindex the vault |
| `space v i` | vault info: root, instance, notes, skipped paths, cache and state, watcher, copies |
| `space v c` | reload the configuration (it also reloads by itself when a config file is saved) |
| `space m` | messages |
| `?`, `space ?` | help: every key, grouped, searchable (commands, panes, resize mode, mouse); `enter` runs a command |
| `space q q` | quit (also `ctrl+q`, `:q`) |

## In lists and prompts

Pickers, the palette and help share these keys (a prompt, such as `/`, takes `backspace`,
`ctrl+w`, `ctrl+u`, `enter` and the cancel keys):

| Key | Action |
| --- | --- |
| `down` / `up`, `tab` / `shift+tab`, `ctrl+n` / `ctrl+p`, `ctrl+j` / `ctrl+k` | move (wrapping around) |
| `pagedown` / `pageup`, `ctrl+d` / `ctrl+u` | move by 10 |
| `j` / `k` | move, in lists without a filter |
| `enter` | accept |
| `esc`, `ctrl+c`, `ctrl+g` | cancel |
| `backspace`, `ctrl+w` or `ctrl+backspace` | delete a character / a word of the filter |
| paste | the first line of the pasted text goes into the filter or prompt |
| `ctrl+u` | clear a prompt |
| an entry's key | in a menu (the explorer row's `…`): pick that entry (`R` isn't `r`) |
| `y` / `n` | answer a yes-or-no question (`esc` is no; `enter` isn't an answer) |

## Mouse

Everything on screen that looks clickable is clickable. Buttons, tabs, breadcrumb headings and the
other small targets are highlighted with the `hover` role under the pointer. `space u m` turns the
mouse off, which gives it back to the terminal.

### Chrome

| Where | What the mouse does |
| --- | --- |
| `≡` (on the left rail; without it the top bar's) | show the explorer (and focus it) / hide it |
| `◷` (on the left rail) | show the history (and focus it) / hide it |
| `▤` (on the right rail; without it the breadcrumb's or the top bar's) | show the outline (and focus it) / hide it |
| superscript, `¹` (on the right rail, under `▤`) | show the footnotes (and focus them) / hide them |
| info, `ℹ` (on the right rail, above `▤`) | show the Info (and focus it) / hide it |
| top bar `slipbox` chip | open the command palette |
| window breadcrumb | scroll that window to the heading, and focus it; its icon finds a heading |
| breadcrumb `…` | the whole heading path as a dropdown; click or `enter` on one to jump there |
| tab | click to switch; drag to reorder; middle-click or `×` to close |
| tab strip, wheel | previous / next tab |
| tab strip `+N` | the tabs that don't fit: open the tab list |
| pane borders | drag to resize the explorer, the outline, or the split |
| scrollbar (window, explorer, outline) | click to jump; drag to scroll |
| horizontal scrollbar | click to jump sideways; drag to scroll sideways (a side pane's also focuses it) |
| a task's checkbox (`☐` / `☑`) | tick or untick it |
| status line path | copy the note's path |
| a message's floating box | click to open the messages list (the boxes go) |
| which-key popup | click an entry: a group opens it, a command runs it |

### Content, panes, lists

| Where | What the mouse does |
| --- | --- |
| note | click moves the cursor, or follows the link under it; drag selects and copies on release |
| note, double / triple click | select and copy the word / the row |
| note, wheel | scroll the view |
| explorer, outline | a click anywhere in the pane focuses it; rows as in their sections above |
| lists, wheel | scroll the list; the selection moves only to stay in view |
| explorer, outline, wheel | scroll the pane (the selection stays) |
| a question's buttons | OK, Cancel; Yes, No |
| outside a list or a question's window | close it (the question: cancelled) |

## Platform notes

- **macOS:** `ctrl+left` / `ctrl+right` / `ctrl+up` / `ctrl+down` switch desktops and open
  Mission Control by default, so they never arrive. `cmd+left` / `cmd+right` arrive only if the
  terminal passes them through. Their alternatives always work.
- **Keypad:** under the kitty protocol its keys arrive apart from the main ones; `enter`, the arrows
  and the paging keys on it act like the main ones. Legacy terminals send `ctrl+j` as a line feed,
  which slipbox reads as `ctrl+j`.
- **Older terminals:** `ctrl+shift+e`, `ctrl+tab`, `ctrl+enter` and `ctrl+backspace` can't be
  told apart from their plain forms. Each one has a fallback that works everywhere.
- **Multiplexers:** zellij takes `ctrl+t`, `ctrl+p`, `ctrl+o` and `ctrl+q`, and tmux and herdr
  take `ctrl+b`, which slipbox doesn't use. The leader routes always work.
