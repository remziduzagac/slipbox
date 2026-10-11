# Keys

Every key slipbox has out of the box, grouped as help (`?`) lists them. The other chapters explain what these keys do
and link here for the full lists. Every binding can be changed, and so can the leader, the names the which-key popup
shows and the `:` commands: [Configuration](configuration.md) says how. A change applies as soon as you save the file.

## Notation

Keys are written as you press them. A letter is lowercase unless `shift+` is written: `shift+g` is a capital G.
Punctuation is written as the character it types (`$`, `{`, `?`, `:`), not as the keys that type it. Keys separated by
spaces are a sequence: `ctrl+w v` means press `ctrl+w`, let go, then press `v`. Modifiers come in the order `ctrl`,
`alt`, `shift`, `cmd`, as help shows them. On a Mac, `alt` is option and `cmd` is command.

`space` is the leader, the key most sequences start with. Your configuration writes it `leader`, so choosing another
leader ([`input.leader`](configuration.md)) moves every sequence that starts with it.

Your configuration takes the same notation, and the usual other spellings: `G` for `shift+g`, `esc`, `return`, `pgdn`,
`option+`, `meta+`, `command+`, `super+`, and the modifiers in any order.

## Conventions

- **Vim's keys first.** Where slipbox can do what a vim key does, the key does it: `shift+h`, `z z`, `ctrl+o`, `g t`,
  `g f`, `:q`. The one exception is `?`, which opens help, as in most apps.
- **Then the `ctrl` keys** VS Code and Obsidian share: `ctrl+f`, `ctrl+p`, `ctrl+s`, `ctrl+z` and `ctrl+y`, `ctrl+left`
  and `ctrl+right` by word, `ctrl+shift+f`, `ctrl+tab`. `ctrl+w` starts the window keys and `ctrl+t` the tab keys, as in
  vim.
- **The leader for the rest.** Everything else is under `space`, in groups: `space l` links, `space f` finding,
  `space n` the note, and so on. The group's letter twice opens its list: `space h h`, `space l l`, `space t t`,
  `space f f`, `space u u`, `space s s`.
- **No emacs keys**, but for what a Mac terminal sends for its own: `alt+b` and `alt+f` for option+left and
  option+right, `ctrl+a` and `ctrl+e` for cmd+left and cmd+right. They do what those keys do in any Mac app.
- **Every `ctrl` chord has another way**, usually under the leader. Terminals and multiplexers keep some `ctrl` keys
  for themselves (zellij takes `ctrl+t`, `ctrl+p`, `ctrl+o` and `ctrl+q`), and nothing takes `space`. Moving the cursor
  is the exception: its chords have plain keys beside them (the arrows, the page keys, `home` and `end`). `ctrl+c`'s
  other way is `y y`.
- **Plain `q` closes** what has the focus: the explorer, the outline, a panel, resize mode. In a note it closes the
  window, or the tab when it's the tab's last window, but never the last tab: only `ctrl+q`, `space q q`, `:q` and
  `:qa` quit. In a list or a prompt, `q` is just typed.
- **`ctrl+c` copies** what is selected, and in a list or prompt it cancels. It never quits. slipbox reads the terminal
  raw, so `ctrl+c` and `ctrl+z` are keys like any other (copy and undo), never an interrupt or a suspend.

### The which-key popup

After the leader, and after a pause on any other key that starts a sequence, a popup lists the keys that can come
next: [The screen](screen.md#the-which-key-popup) describes it. In it, `backspace` goes back a level, `esc` cancels,
and a click on an entry presses its key.

A key that is a binding of its own and also starts a sequence waits for the next key, half a second
([`input.which_key_delay_ms`](configuration.md)), then runs.

## The cursor

A reading cursor sits on the rendered note, like vim's normal mode: a block on the character, and its row highlighted
(`space u l` turns the highlight off). A line is a row as you see it, so a wrapped paragraph has several. The link the
cursor is on is the one every link key acts on, and a click or a find moves the cursor too. The window follows it,
keeping [`ui.scrolloff`](configuration.md) rows (3) between it and the window's edge. [Reading](reading.md) says more.

### Moving

| Where to | Vim's keys | Other keys |
| --- | --- | --- |
| left / right a character | `h` / `l` | `left` / `right` |
| up / down a row | `k` / `j` | `up` / `down` |
| previous / next word | `b` / `w` | `ctrl+left` / `ctrl+right`, `alt+left` / `alt+right`, `alt+b` / `alt+f` |
| the end of the word | `e` | |
| the row's start / end | `0` / `$` | `home` / `end`, `cmd+left` / `cmd+right`, `ctrl+a` / `ctrl+e` |
| the row's first character that isn't a space | `^` | |
| the note's top / bottom | `g g` / `shift+g` | `ctrl+home` / `ctrl+end`, `cmd+up` / `cmd+down` |
| previous / next heading | `[ [` / `] ]` | `alt+up` / `alt+down` |
| previous / next paragraph | `{` / `}` | `ctrl+up` / `ctrl+down` |
| the window's top / middle / bottom row | `shift+h` / `shift+m` / `shift+l` | |
| the matching bracket (source mode and the lens) | `%` | |
| onto the next / previous character you type, on the row | `f` / `shift+f` | |
| up to the next / previous character you type | `t` / `shift+t` | |
| the last `f` or `t` again / the other way | `;` / `,` | |
| a line by its number | `42 g g`, `42 shift+g` (source mode) | `ctrl+g`, `space f l`, `:42` |

### Scrolling

| What | Keys |
| --- | --- |
| half a page down / up, the cursor along | `ctrl+d` / `ctrl+u` |
| a page down / up, the cursor along | `pagedown` / `pageup` |
| the cursor's line to the window's middle / top / bottom | `z z` / `z t` / `z b` |

## Selection and copy

### Selecting

| What | Keys |
| --- | --- |
| select as you move, by character or row | `shift+left` / `shift+right`, `shift+up` / `shift+down` |
| … by word | `ctrl+shift+left` / `ctrl+shift+right`, `alt+shift+left` / `alt+shift+right` |
| … to the row's start / end | `shift+home` / `shift+end`, `ctrl+shift+a` / `ctrl+shift+e` |
| … the same, with `cmd` | `shift+cmd+left` / `shift+cmd+right` |
| … by paragraph | `ctrl+shift+up` / `ctrl+shift+down` |
| … to the note's top / bottom | `ctrl+shift+home` / `ctrl+shift+end`, `shift+cmd+up` / `shift+cmd+down` |
| … by page | `shift+pageup` / `shift+pagedown` |
| visual mode, by character / by whole rows: then any move selects | `v` / `shift+v` |
| in visual mode: to the selection's other end | `o` |
| in visual mode: copy the selection and leave | `y` |
| in visual mode: leave, copying nothing (the same `v` or `shift+v` too) | `esc` |
| clear the selection; else close the floating editor or the lens, clear find, or go back to the note | `esc` |

### Copy, cut and paste

| What | Keys |
| --- | --- |
| copy the selection, or the cursor's row when nothing is selected | `y y` |
| copy the selection | `ctrl+c` |
| cut the selection, or the cursor's line when nothing is selected | `ctrl+x` |
| paste: after the cursor, or over the selection | `ctrl+v` |
| copy the note's path | `y p` |
| copy `path:line` of the cursor's row | `y r` |
| copy where the link under the cursor points | `y l`, `space l y` |

A cut and a paste are edits: from the rendered note, the window switches to editing first. In source mode and the
lens, `y` is vim's yank, so `y y` copies the line and `y p` and `y r` work only while reading (the palette has them
everywhere). Vim's `ctrl+v` and `ctrl+x` (block selection, and a number less) are paste and cut here. Where copies go,
and where a paste comes from, is in [Undo, redo and the clipboard](editing.md#undo-redo-and-the-clipboard).

## Links and history

### Links: `space l`

| What | Direct keys | Leader |
| --- | --- | --- |
| the next / previous link (the cursor goes to it) | `tab` / `shift+tab`, `] l` / `[ l` | `space l n` / `space l p` |
| follow the link under the cursor, else the row's first | `enter`, `g f`, `g x` | `space l f` |
| follow it into a new tab | `ctrl+enter` | `space l t` |
| follow it into the split | `ctrl+w f` | `space l s`, `space w f` |
| copy where it points | `y l` | `space l y` |
| write a link to a note you pick, as this folder writes links | | `space l i` |
| the links from this note, as a list | | `space l l` |
| backlinks: the notes that link here | | `space l b` |
| relink: point this note's links that a move broke where the files are now | | `space l r` |

[Links and roots](links-and-roots.md) explains where a link lands.

### What's under the cursor

In a code file, these ask its language server ([Code](code.md)); in a note, slipbox answers.

| What | Keys |
| --- | --- |
| what it is, in a floating window; on a note's link, where it lands | `shift+k` |
| go to its definition; in a note, follow the link | `g d` |
| where it's used, to pick from; in a note, its backlinks | `g r` |
| where its type is defined | `g y` |
| what implements it, to pick from | `g shift+i` |
| rename it everywhere, after a preview; in a note, the heading the cursor is in | `space c r` |
| code actions: the servers' fixes for the cursor's line, to pick from | `space c a` |
| format the file as its server does, in one undo step | `space c f` |

### History: `space h`

| What | Keys |
| --- | --- |
| back to where you were | `ctrl+o`, `space h p` |
| forward again | `space h n` |
| every place visited, in the left panel: opens it, focuses it, closes it | `space h h` |
| where the note was changed before / after (vim's change list) | `g ;` / `g ,` |

Vim's forward is `ctrl+i`, but terminals send `ctrl+i` as `tab`, which goes to the next link here; so forward is
`space h n`. `alt+left` and `alt+right` move by word, as option+left and option+right do on a Mac, not through history.

### Inside the history

| Keys | What |
| --- | --- |
| `j` / `k`, `down` / `up` | select an older / newer place; nothing moves yet |
| `enter`, `l`, `right`, `o`, `s` | go there: the places before it become back, those after it forward |
| `g g` / `shift+g` | the newest / the oldest place |
| `/` | filter the places by path ([Filtering a panel](#filtering-a-panel)) |
| `q` | close the history |
| `esc` | back to the note; the history stays open |

## Windows

A tab holds one window, or two in a split, side by side or stacked. Focus moves past the windows to the explorer on the
left and the outline on the right. Moving a window also sets the split's direction: moving it right makes a split side
by side. [The screen](screen.md) explains windows, tabs and panels.

### Windows: `space w`

| What | Direct keys | Leader |
| --- | --- | --- |
| split side by side | `ctrl+w v`, `ctrl+\` | `space w v` |
| split stacked | `ctrl+w s` | `space w s` |
| focus left | `ctrl+w h`, `ctrl+w left` | `space w h`, `space w left` |
| focus down | `ctrl+w j`, `ctrl+w down` | `space w j`, `space w down` |
| focus up | `ctrl+w k`, `ctrl+w up` | `space w k`, `space w up` |
| focus right | `ctrl+w l`, `ctrl+w right` | `space w l`, `space w right` |
| the other window | `ctrl+w w` | `space w w` |
| move the window left | `ctrl+w shift+h`, `ctrl+w shift+left` | `space w shift+h`, `space w shift+left` |
| move it down | `ctrl+w shift+j`, `ctrl+w shift+down` | `space w shift+j`, `space w shift+down` |
| move it up | `ctrl+w shift+k`, `ctrl+w shift+up` | `space w shift+k`, `space w shift+up` |
| move it right | `ctrl+w shift+l`, `ctrl+w shift+right` | `space w shift+l`, `space w shift+right` |
| swap the two windows | `ctrl+w x` | `space w x` |
| close the window (the tab, if it's the last; never quits) | `ctrl+w q`, `q` | `space w q` |
| keep only this window | `ctrl+w o` | `space w o` |
| wider / narrower by a step, then resize mode | `ctrl+w >` / `ctrl+w <` | `space w >` / `space w <` |
| taller / shorter by a step, then resize mode | `ctrl+w +` / `ctrl+w -` | `space w +` / `space w -` |
| equal sizes | `ctrl+w =` | `space w =` |
| resize mode | | `space w r` |

### Resize mode

In resize mode a key repeats until you leave, so `l l l` widens step by step, and `ctrl+w > > >` keeps widening after
the first chord. What resizes is what has the focus: the explorer's or the outline's width, the Problems panel's height,
else the window's share of the split. Any other key leaves the mode and does its usual job.

| Keys | What |
| --- | --- |
| `h` / `l`, `left` / `right`, `<` / `>` | narrower / wider, two columns a step |
| `k` / `j`, `up` / `down`, `-` / `+` | shorter / taller: a stacked window, or the Problems panel |
| `=` | equal sizes: the split evened, the panels at their usual widths |
| `esc`, `enter`, `q` | leave |

## Tabs: `space t`

| What | Direct keys | Leader |
| --- | --- | --- |
| a new tab with this note; in a split, this window moved to a tab of its own | `ctrl+t c` | `space t c` |
| the tabs, to pick one | `ctrl+t t` | `space t t` |
| next tab | `g t`, `ctrl+tab`, `ctrl+pagedown`, `ctrl+t n`, `ctrl+t right` | `space t n`, `space t right` |
| previous tab | `g shift+t`, `ctrl+shift+tab`, `ctrl+pageup`, `ctrl+t p`, `ctrl+t left` | `space t p`, `space t left` |
| move the tab left | `ctrl+shift+pageup`, `ctrl+t shift+h`, `ctrl+t shift+left` | `space t shift+h` |
| move it right | `ctrl+shift+pagedown`, `ctrl+t shift+l`, `ctrl+t shift+right` | `space t shift+l` |
| close the tab | `ctrl+t q`, `q` on its last window | `space t q` |
| close the other tabs, but the pinned ones | `ctrl+t o` | `space t o` |
| close every tab but the pinned ones (the explorer then opens a note) | `ctrl+t shift+q` | `space t shift+q` |
| pin or unpin the tab | `ctrl+t m` | `space t m` |

`space t shift+left` and `space t shift+right` move the tab too. A pinned tab stays at the left and keeps its note: a
link followed from it opens in a new tab, and closing the others, or all, leaves it open.

To go to a tab by its place:

| Tab | Keys |
| --- | --- |
| 1 | `alt+1`, `ctrl+t 1`, `space t 1` |
| 2 | `alt+2`, `ctrl+t 2`, `space t 2` |
| 3 | `alt+3`, `ctrl+t 3`, `space t 3` |
| 4 | `alt+4`, `ctrl+t 4`, `space t 4` |
| 5 | `alt+5`, `ctrl+t 5`, `space t 5` |
| 6 | `alt+6`, `ctrl+t 6`, `space t 6` |
| 7 | `alt+7`, `ctrl+t 7`, `space t 7` |
| 8 | `alt+8`, `ctrl+t 8`, `space t 8` |
| 9 | `alt+9`, `ctrl+t 9`, `space t 9` |

## Explorer

| What | Keys |
| --- | --- |
| the explorer: opens it, focuses it, closes it, in turn | `space e` |
| this note, shown and selected in the explorer | `space shift+e` |

### Inside the explorer

Moving selects a row and opens nothing. [Files](files.md) explains what each of these does to your files.

| Keys | What |
| --- | --- |
| `j` / `k`, `down` / `up` | select the next / previous row |
| `enter` | open the note as a tab (or go to its tab); fold or unfold a folder; on `..`, up a folder |
| `l`, `right` | open the note as a tab (or go to its tab); unfold a folder |
| `o` | open the note in this window, in place of what it shows |
| `h`, `left` | fold the folder, or go to the folder holding the row |
| `s` | open the note in the split's other window, splitting first |
| `g g` / `shift+g` | the first / last row |
| `/` | filter the tree, its folders kept ([Filtering a panel](#filtering-a-panel)) |
| `a` | show every text file, or back to what [`files.show`](configuration.md) lists |
| `n` / `shift+n` | a new note / a new folder in the selected folder (beside a selected file) |
| `r` | rename the selected note, file or folder in its folder, every link to it fixed after a preview |
| `shift+r` | on a nested root's row: name it, as pointers name it |
| `m` | move it to a folder picked from a tree, links fixed after a preview |
| `d` | delete it to slipbox's trash, after asking (it says how many links break) |
| `u` | restore what was deleted last |
| `shift+u` | undo the last rename, move or relink, after a preview |
| `y` / `x` | copy / cut it, to paste |
| `p` | paste in the selected folder: a copy of what was copied, or what was cut, moved there |
| `v` | give the selected folder a `.slipbox/` folder, making it a root of its own (a name asked) |
| `shift+v` | make the selected nested root a plain folder again |
| `.` | the row's menu, as its `…` button opens it; each entry's key picks it there |
| `q` | close the explorer |
| `esc` | back to the note; the explorer stays open (over the note, on a narrow screen, it closes) |

Below [`ui.narrow_width`](configuration.md) columns (90), the explorer and the outline open over the note.

### Filtering a panel

`/` in the explorer, the history, source control, the outline, the footnotes, Info or the Problems panel filters its
rows as you type: every word you type, in any order.

| Keys | What |
| --- | --- |
| typing | narrows the rows |
| `down` / `up`, `ctrl+n` / `ctrl+p`, `ctrl+j` / `ctrl+k`, `tab` / `shift+tab` | move through the matches |
| `enter` | open or go to the selected row; the filter clears |
| `esc`, `ctrl+c`, `ctrl+g` | clear the filter |
| `backspace` | delete a character |
| `ctrl+w`, `ctrl+backspace` | delete a word |
| `ctrl+u` | delete everything typed |

## Outline and the right panel

The right panel has three views: the outline, the footnotes and Info. Each key below opens its view and focuses it;
pressed again while the view has the focus, it closes it.

| What | Keys |
| --- | --- |
| the outline: the note's headings | `space o` |
| the footnotes: each one, its text and where it's referred to | `space n f` |
| Info: the file's path, root, counts, properties, tags and links | `space n i` |

`space n shift+f` adds a footnote after the word at the cursor, asking its text. `:footnotes` shows or hides the
footnotes, as the panel's `¹` button does; the `▤` button does the same for the outline.

### Inside the outline

| Keys | What |
| --- | --- |
| `j` / `k`, `down` / `up` | select the next / previous heading |
| `enter` | go to the heading; the note takes the focus |
| `h`, `left` / `l`, `right` | fold / unfold; `h` on a folded heading goes to its parent |
| `g g` / `shift+g` | the first / last heading |
| `/` | filter the headings, their parents kept |
| `r` | rename the heading, every link to it fixed after a preview |
| `q` | close the outline |
| `esc` | back to the note; the outline stays open |

### Inside the footnotes

The outline's keys, and four of its own.

| Keys | What |
| --- | --- |
| `j` / `k`, `down` / `up` | select the next / previous footnote or reference |
| `enter` | go to the footnote's text, or to that reference |
| `h`, `left` / `l`, `right` | hide / show a footnote's references |
| `g g` / `shift+g` | the first / last row |
| `/` | filter by label and text |
| `a` | add a footnote at the note's cursor (as the view's `+` button does) |
| `e` | edit the selected footnote's text |
| `r` | rename its label |
| `d` | delete it, its references too, after asking |
| `q` | close the footnotes |
| `esc` | back to the note |

### Inside Info

| Keys | What |
| --- | --- |
| `j` / `k`, `down` / `up` | select the next / previous row |
| `enter` | open what the row names (a property's line, a tag's notes, the links), or copy its value |
| `y` | copy the row's value |
| `h`, `left` / `l`, `right` | fold / unfold a section |
| `g g` / `shift+g` | the first / last row |
| `/` | filter the rows by name and value |
| `e` | edit the note's properties in a floating editor |
| `q` | close Info |
| `esc` | back to the note |

The properties editor (`e` here, or `space n shift+p`) floats over the windows with the note's front matter, and every
editing key works in it. `esc` in normal mode, `q` or `:q` close it and write back what changed; `ctrl+s` or `:w` write
it back and keep it open.

## Find: `space f`

| What | Direct keys | Leader |
| --- | --- | --- |
| find in this note, in the window's find row | `ctrl+f`, `/` | `space f /` |
| the next / previous match | `n` / `shift+n` | |
| the whole word under the cursor, forward / backward | `*` / `#` | |
| find and replace in this note | `ctrl+h` | `space f r` |
| find in every note and file | `ctrl+shift+f` | `space f g` |
| replace in every note and file, after a preview | `ctrl+shift+h` | `space f shift+r` |
| search: notes ranked by your words as you type | | `space f s` |
| the quick switcher: a note by its name, or a symbol after `#` | `ctrl+p` | `space f f` |
| a heading of this note | | `space f o` |
| the headings the cursor is under, as a dropdown | | `space f b` |
| the tags here, then a tag's notes | | `space f t` |
| the document types here, then a type's notes in order | | `space f d` |
| the next / previous note of this note's document type | `] t` / `[ t` | |
| the command palette | `:`, `ctrl+shift+p` | `space f p` |

`n` goes to the match after the cursor and `shift+n` to the one before, wherever the cursor has moved, and both wrap
around the note's ends. There is no backward search key (`?` is help): find with `/`, then press `shift+n`. `*` and `#`
find the word only where it stands whole. `:noh` clears the highlights. `ctrl+backspace` opens find and replace too,
since many terminals send it for `ctrl+h` ([Platform notes](#platform-notes)). [Finding things](finding.md) explains
each of these.

### The find row

| Keys | What |
| --- | --- |
| `enter` | keep the search and its highlights; an empty one clears them |
| `esc` | cancel: the search before it, and the cursor where it was |
| `alt+r` / `alt+w` | regular expression / whole words, on or off (also the row's `.*` and `ab` buttons) |
| `alt+h` | the replace row, open or closed (its `⇄` button) |
| `tab`, `ctrl+h` / `shift+tab` | into the replace row / back to the find row |
| `backspace`; `ctrl+w`, `ctrl+backspace`; `ctrl+u` | delete a character; a word; everything typed |

In the replace row:

| Keys | What |
| --- | --- |
| `enter` | replace this match |
| `alt+enter`, `alt+a` | replace them all, in one undo step |
| `ctrl+n`, `down` / `ctrl+p`, `up` | the next / previous match |
| `esc` | close the rows; the search stays |

`alt+r` and `alt+w` work in the question that find in every note asks, too.

## Editing

You edit in source mode, the note as Markdown, or in the lens, the block at the cursor as Markdown and the rest
rendered: [Editing](editing.md) explains both. A key that starts an edit works from the rendered note too, switching the
window to source mode first.

### Modes, undo and saving

| What | Keys |
| --- | --- |
| this window's note as Markdown, or rendered again | `ctrl+k`, `space n v` |
| the lens, at the cursor; `esc` closes it | `space n l` |
| the lens a block bigger / smaller / back to its own size | `+` / `-` / `=` |
| type before / after the cursor | `i` / `a` |
| type at the line's first character that isn't a space / at its end | `shift+i` / `shift+a` |
| type on a new line below (a list goes on) / above | `o` / `shift+o` |
| type where you last stopped typing | `g i` |
| move the line, or the selected lines, up / down | `alt+shift+up` / `alt+shift+down` |
| tick or untick the task at the cursor | `ctrl+l`, `space n t` |
| undo (all you typed in one go is one step) | `u`, `ctrl+z` |
| redo | `ctrl+r`, `ctrl+y`, `shift+u` |
| save | `ctrl+s`, `space n w` |
| save every changed note | `space n shift+w` |
| a note changed both here and on disk: load theirs, keep yours, diff, or merge | `space n c` |

The `:` commands for saving and quitting (`:w`, `:wq`, `:q!` and the rest) are in [The `:` prompt](#the--prompt).

### Normal mode in source

These keys are source mode's and the lens's own ([`[keys.source]`](configuration.md) in your configuration); while you
read, they do nothing.

| What | Keys |
| --- | --- |
| delete / change / copy what a motion or a text object covers | `d` / `c` / `y`, then the motion |
| indent / outdent the lines it covers, a level as the file indents | `>` / `<`, then the motion |
| comment or uncomment the lines it covers, as the language writes comments | `g c`, then the motion |
| the same on whole lines (a count first: that many) | `d d`, `c c`, `y y`, `> >`, `< <`, `g c c` |
| comment or uncomment the line | `ctrl+/` |
| delete / change to the line's end | `shift+d` / `shift+c` |
| delete the character under the cursor | `x` |
| delete the character / the line's text, and type in its place | `s` / `shift+s` |
| replace the character with the next one you type | `r` |
| join the next line to this one | `shift+j` |
| switch the character's case, and move on | `~` |
| put what was last deleted or copied after / before the cursor (a line: under / over) | `p` / `shift+p` |
| do the last change again, here | `.` |

The motions are the cursor's keys: `w`, `b`, `e`, `0`, `^`, `$`, `j`, `k`, `g g`, `shift+g`, `{`, `}`, `%`, `f`, `t` and
the rest. A search is a motion too: `d`, then `/`, the text and `enter`, deletes up to the match, and `d n` up to the
next one. After an operator, `g n` / `g shift+n` take the next / previous match itself: `c g n`, type, `esc`, then `.`
changes the next match, and the next. A count goes before the operator, the motion or the text object: `3 d d`, `d 2 w`,
`5 j`.

A text object follows `i` (inside) or `a` (around): `d i w`, `c i "`, `y a p`.

| Text object | Key after `i` or `a` |
| --- | --- |
| a word / a word with its punctuation | `w` / `shift+w` |
| text in quotes, on the line | `"`, `'`, `` ` `` |
| text in brackets, nested, across lines | `(`, `)` or `b`; `[` or `]`; `{`, `}` or `shift+b`; `<` or `>` |
| a paragraph | `p` |

[Editing](editing.md) lists where these differ from vim.

### Visual mode in source

Visual mode's own keys ([`[keys.visual]`](configuration.md)), beside `o`, `y` and `esc` ([Selecting](#selecting)):

| What | Keys |
| --- | --- |
| delete the selection | `d`, `x` |
| delete it and type in its place | `c` |
| indent / outdent its lines | `>` / `<` |
| comment or uncomment its lines | `g c`, `ctrl+/` |
| select a text object, `v i w`, `v i (` | `i` or `a`, then the object |
| filter its lines through a shell command (types `:'<,'>!`) | `!` |

A count works here too: `v 2 j`, `shift+v 3 >`. `:` on a selection types `'<,'>` for you, the selection's lines.

### Typing

While you type (the status chip reads `INSERT`), keys are text, except:

| Keys | What |
| --- | --- |
| `esc`, `ctrl+c`, `ctrl+[` | stop typing |
| `enter` | a new line, indented as this one; a list goes on (an empty item ends it) |
| `backspace`, `ctrl+h` / `delete` | delete the character before / after the cursor |
| `ctrl+w`, `ctrl+backspace`, `alt+backspace` | delete the word before the cursor |
| `ctrl+u` | delete what you typed on the line, then the rest before the cursor |
| `tab` / `shift+tab` | indent / outdent the line a level |
| `ctrl+/` | comment or uncomment the line |
| `ctrl+v` | paste the clipboard |
| `left`, `right`, `up`, `down` | move |
| `home` / `end`, `cmd+left` / `cmd+right`, `ctrl+a` / `ctrl+e` | the line's start / end |
| `cmd+up` / `cmd+down` | the note's start / end |
| `ctrl+left` / `ctrl+right`, `alt+left` / `alt+right`, `alt+b` / `alt+f` | a word back / forward |
| `ctrl+n` / `ctrl+p` | complete the word from words in the open files |
| `ctrl+s` | save |

With [`editor.auto_pairs`](configuration.md) on, a bracket or a quote types its closing half too, a closing one typed
where it already is steps over it, and `backspace` between an empty pair deletes both.

### Completion and snippets

Completion shows under the cursor as you type: a code file's language server's, a link's target after
`](` or `[[` in a note, or the open files' words after `ctrl+n`. While it shows, these keys are its own:

| Keys | What |
| --- | --- |
| `ctrl+n`, `down` / `ctrl+p`, `up` | the next / previous item |
| `tab`, `enter` | put the chosen one in |
| `ctrl+e` | close it, and keep typing |
| `esc` | close it, and stop typing |

In a snippet completion put in, `tab` and `shift+tab` go to its next and previous place to fill in.

### Spelling

With spelling on (`space u s`):

| What | Keys |
| --- | --- |
| the next / previous misspelt word | `] s` / `[ s` |
| suggestions for the word under the cursor; `enter` puts one in its place | `z =` |
| add the word to your own words, marked in no note again | `z g` |

### Your shell

`:!cmd` runs `cmd` in your shell, in the root's folder (`%` is the file's path), and shows what it prints in a window.
`:%!sort`, `:.!cmd`, `:3,7!cmd` and `:'<,'>!cmd` put the lines through it, in one undo step; `!` in visual mode types
`:'<,'>!`. "Stop the running command", from the palette, ends one still running. [Editing](editing.md) explains these.

## UI: `space u`

| Keys | What |
| --- | --- |
| `space u u` | every UI setting with its value; pick one to change it (the breadcrumb's too, which has no key) |
| `space u t` | pick a theme, previewed as you move (`esc` puts it back) |
| `space u g` | pick the glyphs: nerd, unicode, ascii or auto, previewed |
| `space u shift+w` | readable width: the text in a centred column, [`ui.readable_max`](configuration.md) wide (100) |
| `space u z` | zen: no bars, panels, tabs or breadcrumbs, and readable width on |
| `space u l` | the cursor's row highlighted, or not |
| `space u n` | line numbers on the left |
| `space u w`, `alt+z` | wrap long lines (on at first); off, a wide note scrolls sideways |
| `space u r` | a link's address shown after its text |
| `space u m` | the mouse on or off; off, the terminal selects text as it does elsewhere |
| `space u b` | the top bar on or off |
| `space u d` | the problems bar beside the text, on or off |
| `space u shift+d` | problems marked in the text: off, errors, warnings, all, in turn |
| `space u c` | the code view's cells: in boxes, or on tinted bands |
| `space u s` | spelling on or off |

A change applies at once and is remembered for the folder ([The screen](screen.md#ui-settings)). Your configuration
sets where each starts, and wins again once you change that setting in the file.

## Scratch: `space s`

The scratch is a note slipbox keeps for collecting references to hand to an agent: [Editing](editing.md) explains it.

| Keys | What |
| --- | --- |
| `space s s` | open the scratch; it updates as agents add to it |
| `space s a` | add the selection with its `path:line-line`, or the cursor's row with its `path:line` |
| `space s y` | copy the whole scratch |
| `space s c` | copy the note's context for an agent: it, what it links to, what links to it |
| `space s d` | clear the scratch, after asking |

## Code cells: `space k`

The code view draws a code file as a notebook: each definition a cell, with buttons on its header ([Code](code.md)).
Each button has a key, which acts on the cell at the cursor.

| Keys | What | Button |
| --- | --- | --- |
| `space k f`, `z a` | fold the cell to its header, or unfold it | `▾` / `▸` |
| `space k e` | edit the cell: the lens on its lines | `✎` |
| `space k y` | copy the cell's lines, as the file has them | `⧉` |
| `space k r` | where the cell's definition is used, from its language server | `⇢` |
| `space k p` | the cell's problems: the Problems panel, on the first | `⚠` and a count |
| `space k s` | add the cell to the scratch, with its path and lines | `◎` |

## Git: `space g`

| Keys | What |
| --- | --- |
| `space g s` | source control: the changed files, in the left panel (opens it, focuses it, closes it) |
| `space g c` | the files this branch changed against the base; `enter` shows a file's diff |
| `space g d` | this note's diff against the base; `enter` goes to the line |
| `space g h` | this file's history: its commits, one read as it was, or its diff to now |
| `space g b` | who last changed the cursor's line: the commit, its author, date and message |
| `space g o` | the branches: check one out, or make a new one from here |
| `space g w` | the worktrees by branch; `enter` opens this note in the one you pick |
| `space g m` | a merge you pick: the links it would break, each with its fix |
| `] c` / `[ c` | the next / previous line changed against what's staged, as the gutter marks them |
| `space g p` | the change on the cursor's line, as a diff in a floating window |
| `space g r` | undo that change: its lines put back as staged, in one undo step, unsaved |

[Git](git.md) explains each of these.

### Inside source control

| Keys | What |
| --- | --- |
| `j` / `k`, `down` / `up` | select the next / previous file or change |
| `enter`, `o` | open the file at the change |
| `l`, `right` | open a file up into its changes |
| `h`, `left` | fold a file's changes; from a change, back to its file |
| `s` | stage the file, or the one change (a conflict's file: marked resolved) |
| `u` | unstage it |
| `d` | discard what isn't staged, after asking (an untracked file goes to slipbox's trash) |
| `a` / `shift+u` | stage / unstage everything |
| `.` | its diff, in a floating window |
| `c` | commit what's staged: write the message in a floating editor |
| `shift+c` | amend the last commit with what's staged |
| `g g` / `shift+g` | the first / last row |
| `/` | filter the files by path |
| `q` | close source control |
| `esc` | back to the note |

In the commit message's editor, every editing key works; `ctrl+s` (or `:w`) commits, and `esc` (or `q`) leaves it,
committing nothing.

## Note, folder, app

### The note: `space n`

Deleting, moving, copying, cutting and exporting act on the explorer's selected note when the explorer has the focus.

| Keys | What |
| --- | --- |
| `space n n`, `ctrl+n` | a new note beside this one, its name asked (`projects/idea` makes the folder too) |
| `space n m` | rename or move the note by its path, or into a folder; links fixed after a preview |
| `space n shift+m` | move the note to a folder picked from a tree |
| `space n h` | rename the heading the cursor is in, every link to it fixed after a preview |
| `space n d` | delete the note to slipbox's trash, after asking |
| `space n y` / `space n x` | copy / cut the note, for `space d p` to paste |
| `space n shift+y` | a copy of the note beside it (`name-copy`), opened |
| `space n o` | export the note: Word, PDF, a web page, an e-book or Markdown, then where |
| `space n shift+o` | export notes, picked in order, as one document |
| `space n i` | Info, in the right panel: opens it, focuses it, closes it |
| `space n shift+p` | edit the note's properties (its front matter) in a floating editor |
| `space n q` | this file's problems, in the Problems panel |
| `space n r` | read the note from disk again |
| `space n e` | edit the note in your editor, at the cursor's line, in this terminal |
| `space n s` | send the note to your editor running elsewhere (a running nvim, by default) |
| `space n p` | choose the running nvim `space n s` sends to |

### Folders: `space d`

These act on the explorer's selected folder when it has the focus (a selected file's folder), else on this note's.

| Keys | What |
| --- | --- |
| `space d n`, `ctrl+shift+n` | a new folder, its name asked |
| `space d r` | rename the folder in place, links into it fixed after a preview |
| `space d m` | move the folder to a folder picked from a tree |
| `space d d` | delete the folder, and all in it, to slipbox's trash, after asking |
| `space d y` / `space d x` | copy / cut the folder, to paste |
| `space d p` | paste into the folder what was copied (a copy) or cut (moved, links fixed) |

### Roots and named folders: `space v`

A root is the folder slipbox works in; [Links and roots](links-and-roots.md) explains roots and their names.

| Keys | What |
| --- | --- |
| `space v v` | the named folders this machine knows: `enter` goes into one |
| `space v shift+v` | which copy a named folder's links open, when you have two |
| `space v n` | name this root (or the selected one) as pointers name it, after a preview |
| `space v m` | give this plain folder a `.slipbox/`; in a root, make the selected folder a root of its own |
| `space v shift+m` | make a nested root a plain folder of the root holding it |
| `space v t` | slipbox's trash: what was deleted here; `enter` restores it, and its last row empties it |
| `space v u` | restore what was deleted last |
| `space v shift+u` | undo the last rename, move, relink or replace in every note, after a preview |
| `space v p` | the Problems panel's All tab: this root's broken links, lint, conflicts |
| `space v r` | reindex the root |
| `space v i` | about this folder: its root, name and copies, notes, what's skipped, the watcher |
| `space v c` | read the configuration again (saving it does that too) |

### The app

| Keys | What |
| --- | --- |
| `?`, `space ?` | help: every key, by group, searchable; `enter` runs a command |
| `space m` | the messages slipbox has shown |
| `space q q`, `ctrl+q` | quit; refused while a note is unsaved, which it names |

### Inside Problems

The Problems panel lies across the bottom, in two tabs: This file (`space n q`) and All (`space v p`).

| Keys | What |
| --- | --- |
| `j` / `k`, `down` / `up` | select the next / previous problem (This file: the note shows it) |
| `enter`, `l`, `right` | go there; in All, in a tab of its own (or the tab showing it) |
| `o` / `s` | in All: open it in this window / in the split |
| `h`, `left` | in All: fold the section, or go to its heading |
| `tab`, `shift+tab` | the other tab |
| `g g` / `shift+g` | the first / last row |
| `/` | filter the tab's problems |
| `q` | close the panel |
| `esc` | back to the note |

On a section's heading in All, `enter`, `o` and `s` fold or unfold it.

## The `:` prompt

`:` opens the palette, which is also a command line. Type part of a command's name and pick it from the list, or type
one of these commands exactly: it wins over the matches. Where a command takes an argument, typing a space after it
lists what it can be (notes, themes, glyph sets, formats, tags, types). Your configuration's
[`[aliases]`](configuration.md) adds more, or renames these.

| Command | What it does |
| --- | --- |
| `:42` | go to line 42 |
| `:w`, `:write` | save the note |
| `:w!` | save over a file that changed on disk |
| `:wa`, `:wall` | save every changed note |
| `:e!` | read the note from disk again, dropping your changes (undo brings them back) |
| `:q`, `:quit` | close the window, or its tab; on the very last one, quit |
| `:qa`, `:qall` | quit |
| `:wq`, `:x`, `:wqa`, `:xa` | save every changed note and quit |
| `:q!` | quit without saving |
| `:e <note>`, `:open <note>` | open a note, or any text file here, by its path |
| `:vs [note]` / `:sp [note]` | split side by side / stacked, the note in the new window |
| `:tabnew [note]` | a new tab, with this note or the one named |
| `:tabonly`, `:tabo` | close the other tabs, but the pinned ones |
| `:tabpin` | pin or unpin the tab |
| `:source` | the note as Markdown, or rendered again |
| `:lens`, `:live` | open or close the lens |
| `:new <name>` / `:mkdir <name>` | a new note / folder beside this note (a leading `/`: from the root) |
| `:rename <path>`, `:mv <path>` | rename or move the note, links fixed after a preview |
| `:delete` | delete the note to slipbox's trash, after asking |
| `:trash` | slipbox's trash: `enter` restores an item |
| `:empty-trash` | the trash, on its last row: `enter` asks, then empties it for good |
| `:undo-rename` | undo the last rename, move or relink, after a preview |
| `:link` | write a link to a note you pick |
| `:relink` | point this note's links that a move broke where the files are now |
| `:convert-links [note]` | links rewritten as plain relative paths, after a preview: the note's, else every note's |
| `:search [words]` | search, ranked as you type |
| `:tags`, `:tag <name>` | the tags here; a tag's notes |
| `:types`, `:type <name>` | the document types here; a type's notes in order |
| `:noh` | clear the find highlights |
| `:problems` | the Problems panel's All tab |
| `:footnotes` | show or hide the footnotes |
| `:context` | copy the note's context for an agent |
| `:export [format]` | export the note; a format (`docx`, `pdf`, `html`, `epub`, `md`) skips the list |
| `:export-notes` | export notes as one document |
| `:changes` / `:diff` | the branch's changed files / this note's diff, against the base |
| `:worktrees` / `:merge-review` | the worktrees / the links a merge would break |
| `:folders` | the named folders: pick one to go into |
| `:folders-default` | which copy a named folder's links open |
| `:name [new]` | name this folder, as pointers name it |
| `:init` | give this plain folder a `.slipbox/` |
| `:pin-root` | keep this root among the explorer's roots after you leave it, or no longer |
| `:trust`, `:untrust` | trust this root, so its own tools run, or stop trusting it ([Code](code.md)) |
| `:theme <name>` | set the theme |
| `:glyphs <set>` | set the glyphs: `nerd`, `unicode`, `ascii` or `auto` |
| `:zen` / `:wrap` | zen mode / wrapping, on or off |
| `:messages` | the messages slipbox has shown |
| `:reload` / `:reindex` | read the note from disk again / reindex the root |
| `:config` | read the configuration again |
| `:help` | help: every key and command |

Vim's substitute and shell commands are typed here too: `:s/old/new/` on the cursor's line, `:%s/old/new/` on the whole
note, `:'<,'>s/old/new/` on the selection's lines, with the flags `g`, `i` and `c`; and `:!cmd` and `:%!cmd`
([Your shell](#your-shell)). [Finding things](finding.md) explains substitute. With `c`, slipbox asks at each match:

| Keys | What |
| --- | --- |
| `y` | replace this match |
| `n` | skip it |
| `a` | replace this and every one after |
| `l` | replace this one, then stop |
| `q`, `esc` | stop |

## In lists and prompts

The switcher, the palette, help, pickers and menus share these keys:

| Keys | What |
| --- | --- |
| `down` / `up`, `tab` / `shift+tab`, `ctrl+n` / `ctrl+p`, `ctrl+j` / `ctrl+k` | move, wrapping around the ends |
| `pagedown` / `pageup`, `ctrl+d` / `ctrl+u` | move by 10 |
| `j` / `k` | move, in a list you can't type in (a menu) |
| `enter` | pick the selected entry |
| `esc`, `ctrl+c`, `ctrl+g` | cancel |
| `backspace` / `ctrl+w`, `ctrl+backspace` | delete a character / a word of what's typed |
| an entry's key | in a menu, picks that entry (`shift+r` and `r` differ) |
| `left` / `right` | in a tree of folders: fold / unfold |
| `ctrl+a` | in search: more folders, those linked with this one, then every root, then this one again |

Pasting puts the first line of the text in the list's filter or the prompt. A prompt (one line to type, such as a new
note's name) takes `enter`, the cancel keys, `backspace`, `ctrl+w` and `ctrl+backspace` for a word, and `ctrl+u` to
clear it. A question takes `y` or `n`; `esc` is no, and `enter` isn't an answer.

### The save window

Exporting asks where in a window of its own: places down the left, the folder on the right, the file's name at the
bottom ([Exporting](export.md)).

| Keys | What |
| --- | --- |
| `tab` / `shift+tab` | the next / previous part: the places, the folder, the name |
| `up` / `down` | move; in the name, to the folder |
| `pageup` / `pagedown`, `home` / `end` | in the folder: by 10, to the first / last |
| `enter`, `right` | go into a folder or a place; on a file, take its name; in the name, export |
| `left`, `backspace` | in the folder: up a folder |
| `~` | your home folder |
| typing | in the folder: to the name that starts so (a `.` first shows hidden ones); in the name: the name |
| `ctrl+n` | a new folder here, its name asked |
| `ctrl+w`, `ctrl+u` | in the name: delete a word, or all of it |
| `esc`, `ctrl+c`, `ctrl+g` | cancel |

## Mouse

Everything that looks clickable is, and a button lights up under the pointer. `space u m` turns the mouse off, which
gives it back to the terminal.

### Around the notes

| Where | What a click does |
| --- | --- |
| `≡` on the left rail (without the rail, on the top bar) | shows the explorer, focused, or hides it |
| `◷` on the left rail | shows the history, focused, or hides it |
| `±` on the left rail | lit while source control shows (`space g s`); a click on it does nothing |
| `ℹ` on the right rail | shows Info, focused, or hides it |
| `▤` on the right rail (without it, on the breadcrumb or the top bar) | shows the outline, focused, or hides it |
| `¹` on the right rail | shows the footnotes, focused, or hides them |
| the top bar's `slipbox` | opens the command palette |
| a heading in a window's breadcrumb | scrolls that window to it, and focuses it |
| the breadcrumb's icon / its `…` | finds a heading / lists the headings the cursor is under |
| a tab | switches to it; dragged, moves it; middle-click or its `×` closes it |
| the tab strip's `+N` | lists the tabs that don't fit |
| a pane's border | dragged, resizes the explorer, the outline or the split |
| a scrollbar | jumps there; dragged, scrolls |
| a task's box (`☐` / `☑`) | ticks or unticks it |
| the status line's `‹` / `›` | back / forward in the window's history |
| the status line's path | lists the window's history, with Copy path first |
| the status line's problems | the Problems panel on This file (on All when the file has none), or closes it |
| a sign in the problems bar, a coloured line number | the Problems panel, on that problem |
| a Problems tab's title | switches to it |
| a row in Problems | This file: shows the problem, and goes there on a second click; All: opens it |
| the Problems panel's rule | dragged, resizes it |
| a message's floating box | opens the messages list |
| an entry in the which-key popup | a group opens it; a command runs |
| a code cell's button | as its key ([Code cells](#code-cells-space-k)) |

### In the notes, panels and lists

| Where | What the mouse does |
| --- | --- |
| a note | a click moves the cursor, or follows the link under it; a drag selects and copies on release |
| a note, double / triple click | selects and copies the word / the row |
| a note, the wheel | scrolls; a sideways wheel scrolls sideways when wrapping is off |
| the explorer | a click selects a note, a double-click opens it as a tab; a click on a folder folds or unfolds it |
| the history, source control | a click selects, a double-click goes there |
| the outline | a click goes to the heading; on `▾` / `▸`, folds or unfolds |
| the footnotes, Info | a click goes to the footnote, or opens what the row names |
| a panel, the wheel | scrolls it; the selection stays |
| a list, the wheel | scrolls it; the selection moves only to stay in view |
| a list's entry | picks it |
| a question's buttons | OK, Cancel; Yes, No |
| outside a list or a question | closes it (a question: cancelled) |

## Platform notes

- **Mac:** by default `ctrl+left`, `ctrl+right`, `ctrl+up` and `ctrl+down` switch desktops and open Mission Control, so
  they never reach slipbox. `cmd` keys arrive only if the terminal passes them on. Their other keys always work.
- **Same key, two names:** many terminals send `ctrl+h` as `ctrl+backspace`, so both open find and replace; `ctrl+/`
  arrives as `ctrl+_`, so both comment a line; `ctrl+i` arrives as `tab`. A terminal without the kitty keyboard protocol
  sends `ctrl+j` as a line feed, which slipbox reads as `ctrl+j`.
- **Older terminals** can't tell `ctrl+shift+f`, `ctrl+shift+h`, `ctrl+shift+p`, `ctrl+shift+n`, `ctrl+shift+tab`,
  `ctrl+tab`, `ctrl+enter` and `ctrl+backspace` from the same keys without `shift` or `ctrl`. Each has another key that
  works everywhere.
- **The keypad**, under the kitty protocol, arrives apart from the main keys; its `enter`, arrows and page keys act as
  the main ones. A shifted space types a space wherever you type: while editing, in a prompt or a filter, after `f`.
- **Multiplexers:** zellij takes `ctrl+t`, `ctrl+p`, `ctrl+o` and `ctrl+q`; tmux and herdr take `ctrl+b`, which slipbox
  doesn't use. The leader's keys always work.
