# Keyboard and mouse shortcuts

<a id="keys"></a>

This chapter lists every key slipbox has out of the box. The keys are grouped as help (`?`) lists them. The other
chapters explain what these keys do, and link here for the full lists.

You can change every binding. You can also change:

- the leader
- the names the which-key popup shows
- the `:` commands

[Configuration](configuration.md) says how. A change applies as soon as you save the file.

You don't need to learn new keys first. The arrows, `home`, `end`, the page keys and the `ctrl` shortcuts of other
editors stand beside vim's. [Keys you already know](../guides/keys-you-know.md) lists those on one page.

## Notation

Keys are written as you press them.

- A letter is lowercase unless `shift+` is written. For example, `shift+g` is a capital G.
- Punctuation is written as the character it types (`$`, `{`, `?`, `:`), not as the keys that type it.
- Keys separated by spaces are a sequence. For example, `ctrl+w v` means press `ctrl+w`, let go, then press `v`.
- Modifiers come in the order `ctrl`, `alt`, `shift`, `cmd`, as help shows them.
- On a Mac, `alt` is option and `cmd` is command.

`space` is the leader: the key most sequences start with. Your configuration writes it as `leader`. So choosing another
leader ([`input.leader`](configuration.md)) moves every sequence that starts with it.

Your configuration takes the same notation. It also takes the usual other spellings:

- `G` for `shift+g`
- `esc`, `return` and `pgdn`
- `option+`, `meta+`, `command+` and `super+`
- the modifiers in any order

## Conventions

**Vim's keys first.** Where slipbox can do what a vim key does, the key does it: `shift+h`, `z z`, `ctrl+o`, `g t`,
`g f`, `:q`. The one exception is `?`, which opens help, as in most apps.

**Then the `ctrl` keys VS Code and Obsidian share.** These are `ctrl+f`, `ctrl+p`, `ctrl+s`, `ctrl+z` and `ctrl+y`,
`ctrl+left` and `ctrl+right` by word, `ctrl+shift+f` and `ctrl+tab`. As in vim, `ctrl+w` starts the window keys, and
`ctrl+t` starts the tab keys.

**The leader for the rest.** Everything else is under `space`, in groups: `space l` for links, `space f` for finding,
`space n` for the note, and so on. A group's letter twice opens its list: `space h h`, `space l l`, `space t t`,
`space f f`, `space u u`, `space s s`.

**No emacs keys**, except what a Mac terminal sends for its own keys:

- `alt+b` and `alt+f` for option+left and option+right
- `ctrl+a` and `ctrl+e` for cmd+left and cmd+right

They do what those keys do in any Mac app.

**Every `ctrl` chord has another way**, usually under the leader. Terminals and multiplexers keep some `ctrl` keys for
themselves. For example, zellij takes `ctrl+t`, `ctrl+p`, `ctrl+o` and `ctrl+q`. Nothing takes `space`.

Moving the cursor is the exception. Its chords have plain keys beside them: the arrows, the page keys, `home` and
`end`. `ctrl+c`'s other way is `y y`.

**Plain `q` closes** what has the focus: the explorer, the outline, a panel, resize mode. In a note, it closes the
window, or the tab when it's the tab's last window. It never closes the last tab. Only `ctrl+q`, `space q q`, `:q` and
`:qa` quit. In a list or a prompt, `q` is just typed.

**`ctrl+c` copies** what is selected. In a list or prompt, it cancels. It never quits.

slipbox reads the terminal raw. So `ctrl+c` and `ctrl+z` are keys like any other (copy and undo). They are never an
interrupt or a suspend.

### The which-key popup

After the leader, a popup lists the keys that can come next. The popup also shows after a pause on any other key that
starts a sequence. [The screen](screen.md#the-which-key-popup) describes it.

In the popup:

- `backspace` goes back a level
- `esc` cancels
- a click on an entry presses its key

Some keys are a binding of their own and also start a sequence. Such a key waits half a second for the next key
([`input.which_key_delay_ms`](configuration.md)), then runs.

## The cursor

A reading cursor sits on the rendered note, like vim's normal mode. It is a block on the character, and its row is
highlighted. `space u l` turns the highlight off.

A line is a row as you see it, so a wrapped paragraph has several.

Every link key acts on the link the cursor is on. A click or a find moves the cursor too.

The window follows the cursor. It keeps [`ui.scrolloff`](configuration.md) rows (3) between the cursor and the
window's edge. [Reading](reading.md) says more.

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
| the picture on the cursor's `▣` line at its own size, or fitted to the window again | `z p` |
| that picture at its own size, a quarter of the window left / right | `z h` / `z l` |

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
| visual mode, by character / by whole rows (then any move selects) | `v` / `shift+v` |
| in visual mode, go to the selection's other end | `o` |
| in visual mode, copy the selection and leave | `y` |
| in visual mode, leave and copy nothing (the same `v` or `shift+v` too) | `esc` |
| clear the selection, or else close the floating editor or the lens, clear find, or go back to the note | `esc` |

In source mode and the lens, a selection made with `shift` or a drag is a visual mode selection. Visual mode's keys act
on it ([Visual mode in source](#visual-mode-in-source)), and any move extends it.

While you type, `shift` with a move selects as in a desktop editor ([Typing](#typing)).

### Copy, cut and paste

| What | Keys |
| --- | --- |
| copy the selection, or the cursor's row when nothing is selected | `y y` |
| copy the selection | `ctrl+c` |
| cut the selection, or the cursor's line when nothing is selected | `ctrl+x` |
| paste after the cursor, or over the selection | `ctrl+v` |
| copy the note's path | `y p` |
| copy `path:line` of the cursor's row | `y r` |
| copy where the link under the cursor points | `y l`, `space l y` |

A cut and a paste are edits. From the rendered note, the window switches to editing first.

In source mode and the lens, `y` is vim's yank. So `y y` copies the line, and `y p` and `y r` work only while reading.
The palette has them everywhere.

In vim, `ctrl+v` starts a block selection and `ctrl+x` makes a number less. Here they are paste and cut.

[Undo, redo and the clipboard](editing.md#undo-redo-and-the-clipboard) says where copies go, and where a paste comes
from.

## Links and history

### Links: `space l`

| What | Direct keys | Leader |
| --- | --- | --- |
| the next / previous link (the cursor goes to it) | `tab` / `shift+tab`, `] l` / `[ l` | `space l n` / `space l p` |
| follow the link under the cursor, or else the row's first | `enter`, `g f`, `g x` | `space l f` |
| follow it into a new tab | `ctrl+enter` | `space l t` |
| follow it into the split | `ctrl+w f` | `space l s`, `space w f` |
| copy where it points | `y l` | `space l y` |
| write a link to a note you pick, as this folder writes links | | `space l i` |
| the links from this note, as a list | | `space l l` |
| backlinks: the notes that link here | | `space l b` |
| relink: point this note's links that a move broke to where the files are now | | `space l r` |

[Links and backlinks](links-and-vaults.md) explains where a link lands.

### Inside a peek

A link into another vault, or to a file of Elsewhere's, opens a peek: the file read in a floating window, the
vault you are in left as it was ([A peek at another vault](links-and-vaults.md#a-peek-at-another-vault)).

| Keys | What |
| --- | --- |
| `o` | go there: into its vault, or into Elsewhere, with its own tabs |
| `t` | keep it as a tab here, read-only, marked with its vault's name |
| `z` | fill the screen, or most of it again |
| `ctrl+o`, `space h n` | back and forward through the files its links moved it to |
| `esc` | close it: you are where you were |

`/` finds in it, and selecting and copying work as in any note. Its links work too: one to the vault you are in
closes the peek and opens there.

### What's under the cursor

In a code file, these keys ask its language server ([Code](code.md)). In a note, slipbox answers.

| What | Keys |
| --- | --- |
| what it is, in a floating window (on a note's link, where it lands) | `shift+k` |
| go to its definition (in a note, follow the link) | `g d` |
| where it's used, to pick from (in a note, its backlinks) | `g r` |
| where its type is defined | `g y` |
| what implements it, to pick from | `g shift+i` |
| rename it everywhere, after a preview (in a note, the heading the cursor is in) | `space c r` |
| code actions: the servers' fixes for the cursor's line, to pick from | `space c a` |
| format the file as its server does, in one undo step | `space c f` |

### History: `space h`

| What | Keys |
| --- | --- |
| back to where you were | `ctrl+o`, `space h p` |
| forward again | `space h n` |
| every place visited, in the left panel: opens it, focuses it, closes it | `space h h` |
| where the note was changed before / after (vim's change list) | `g ;` / `g ,` |

Vim's forward is `ctrl+i`. But terminals send `ctrl+i` as `tab`, which goes to the next link here. So forward is
`space h n`.

`alt+left` and `alt+right` move by word, as option+left and option+right do on a Mac. They don't move through history.

### Inside the history

| Keys | What |
| --- | --- |
| `j` / `k`, `down` / `up` | select an older / newer place (nothing moves yet) |
| `enter`, `l`, `right`, `o`, `s` | go there (the places before it become back, those after it forward) |
| `g g` / `shift+g` | the newest / the oldest place |
| `/` | filter the places by path ([Filtering a panel](#filtering-a-panel)) |
| `q` | close the history |
| `esc` | back to the note (the history stays open) |

## Windows

A tab holds one window, or two in a split. A split is side by side or stacked.

Focus moves past the windows to the explorer on the left and the outline on the right.

Moving a window also sets the split's direction. For example, moving it right makes a split side by side.

[The screen](screen.md) explains windows, tabs and panels.

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
| close the window, or the tab if it's the last (it never quits) | `ctrl+w q`, `q` | `space w q` |
| keep only this window | `ctrl+w o` | `space w o` |
| wider / narrower by a step, then resize mode | `ctrl+w >` / `ctrl+w <` | `space w >` / `space w <` |
| taller / shorter by a step, then resize mode | `ctrl+w +` / `ctrl+w -` | `space w +` / `space w -` |
| equal sizes | `ctrl+w =` | `space w =` |
| resize mode | | `space w r` |

### Resize mode

In resize mode, a key repeats until you leave. So `l l l` widens step by step, and `ctrl+w > > >` keeps widening after
the first chord.

What resizes is what has the focus:

- the explorer's or the outline's width
- the Problems panel's height
- otherwise, the window's share of the split

Any other key leaves the mode and does its usual job.

| Keys | What |
| --- | --- |
| `h` / `l`, `left` / `right`, `<` / `>` | narrower / wider, two columns a step |
| `k` / `j`, `up` / `down`, `-` / `+` | shorter / taller, for a stacked window or the Problems panel |
| `=` | equal sizes (the split evened, the panels at their usual widths) |
| `esc`, `enter`, `q` | leave |

## Tabs: `space t`

| What | Direct keys | Leader |
| --- | --- | --- |
| a new tab with this note (in a split, this window moves to a tab of its own) | `ctrl+t c` | `space t c` |
| the tabs, to pick one | `ctrl+t t` | `space t t` |
| next tab | `g t`, `ctrl+tab`, `ctrl+pagedown`, `ctrl+t n`, `ctrl+t right` | `space t n`, `space t right` |
| previous tab | `g shift+t`, `ctrl+shift+tab`, `ctrl+pageup`, `ctrl+t p`, `ctrl+t left` | `space t p`, `space t left` |
| move the tab left | `ctrl+shift+pageup`, `ctrl+t shift+h`, `ctrl+t shift+left` | `space t shift+h` |
| move it right | `ctrl+shift+pagedown`, `ctrl+t shift+l`, `ctrl+t shift+right` | `space t shift+l` |
| close the tab | `ctrl+t q`, `q` on its last window | `space t q` |
| close the other tabs, except the pinned ones | `ctrl+t o` | `space t o` |
| close every tab except the pinned ones (the explorer then opens a note) | `ctrl+t shift+q` | `space t shift+q` |
| pin or unpin the tab | `ctrl+t m` | `space t m` |

`space t shift+left` and `space t shift+right` move the tab too.

A pinned tab stays at the left and keeps its note. A link followed from it opens in a new tab. Closing the other tabs,
or all of them, leaves it open.

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

Moving selects a row and opens nothing. [Files](files.md) explains what each of these keys does to your files.

| Keys | What |
| --- | --- |
| `j` / `k`, `down` / `up` | select the next / previous row |
| `enter` | open the note as a tab (or go to its tab), fold or unfold a folder, or go into another vault |
| `l`, `right` | open the note as a tab (or go to its tab), or unfold a folder or a vault |
| `z` | zoom in: the view shows the selected folder, or a selected file's folder ([Files](files.md#the-view)) |
| `-` | zoom out: the view shows the folder holding it |
| `o` | open the note in this window, in place of what it shows |
| `h`, `left` | fold the folder, or go to the folder holding the row |
| `s` | open the note in the split's other window, splitting first |
| `g g` / `shift+g` | the first / last row |
| `/` | filter the tree, keeping its folders ([Filtering a panel](#filtering-a-panel)) |
| `a` | show every text file, or go back to what [`files.show`](configuration.md) lists |
| `shift+h` | show hidden files and folders too (`⊘`, not indexed), or hide them again ([Files](files.md)) |
| `n` / `shift+n` | a new note / a new folder in the selected folder (beside a selected file) |
| `r` | rename the selected note, file or folder in its folder, fixing every link to it after a preview |
| `shift+r` | on a nested vault's row, name it, as pointers name it |
| `m` | move it to a folder picked from a tree, fixing links after a preview |
| `d` | delete it to slipbox's trash, after asking (it says how many links break) |
| `u` | restore what was deleted last |
| `shift+u` | undo the last rename, move or relink, after a preview |
| `y` / `x` | copy / cut it, to paste |
| `p` | paste in the selected folder (a copy of what was copied, or what was cut, moved there) |
| `shift+y` | copy the selected row's whole path |
| `v` | give the selected folder a `.slipbox/` folder, making it a vault of its own (it asks for a name) |
| `shift+v` | make the selected nested vault part of the vault holding it again |
| `.` | the row's menu, as its `…` button opens it (each entry's key picks it there) |
| `q` | close the explorer |
| `esc` | back to the note, and the explorer stays open (on a narrow screen, over the note, it closes) |

Below [`ui.narrow_width`](configuration.md) columns (90), the explorer and the outline open over the note.

Opening a symlink that leads out of the vault, or out of home, asks first: `f` follows it, `l` just looks, read-only,
and `n` doesn't ([Links that lead out](vaults.md#links-that-lead-out)).

### Filtering a panel

`/` filters a panel's rows as you type. The rows kept match every word you type, in any order. It works in:

- the explorer
- the history
- source control
- the outline
- the footnotes
- Info
- the Problems panel

| Keys | What |
| --- | --- |
| typing | narrows the rows |
| `down` / `up`, `ctrl+n` / `ctrl+p`, `ctrl+j` / `ctrl+k`, `tab` / `shift+tab` | move through the matches |
| `enter` | open or go to the selected row, and clear the filter |
| `esc`, `ctrl+c`, `ctrl+g` | clear the filter |
| `backspace` | delete a character |
| `ctrl+w`, `ctrl+backspace` | delete a word |
| `ctrl+u` | delete everything typed |

## Outline and the right panel

The right panel has three views: the outline, the footnotes and Info. Each key below opens its view and focuses it.
Press the key again while the view has the focus to close it.

| What | Keys |
| --- | --- |
| the outline: the note's headings | `space o` |
| the footnotes: each one, its text and where it's referred to | `space n f` |
| Info: the file's path, vault, counts, properties, tags and links | `space n i` |

`space n shift+f` adds a footnote after the word at the cursor, and asks for its text.

`:footnotes` shows or hides the footnotes, as the panel's `¹` button does. The `▤` button does the same for the
outline.

### Inside the outline

| Keys | What |
| --- | --- |
| `j` / `k`, `down` / `up` | select the next / previous heading |
| `enter` | go to the heading, and give the note the focus |
| `h`, `left` / `l`, `right` | fold / unfold (`h` on a folded heading goes to its parent) |
| `g g` / `shift+g` | the first / last heading |
| `/` | filter the headings, keeping their parents |
| `r` | rename the heading, fixing every link to it after a preview |
| `q` | close the outline |
| `esc` | back to the note (the outline stays open) |

### Inside the footnotes

The footnotes view has the outline's keys, and four of its own.

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
| `d` | delete it and its references, after asking |
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

The properties editor floats over the windows with the note's front matter. Open it with `e` here, or with
`space n shift+p`. Every editing key works in it.

- `esc` in normal mode, `q` or `:q` close it and write back what changed.
- `ctrl+s` or `:w` write it back and keep it open.

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

`n` goes to the match after the cursor, wherever the cursor has moved. `shift+n` goes to the one before. Both wrap
around the note's ends.

There is no backward search key, since `?` is help. Find with `/`, then press `shift+n`.

`*` and `#` find the word only where it stands whole. `:noh` clears the highlights.

`ctrl+backspace` opens find and replace too, since many terminals send it for `ctrl+h`
([Platform notes](#platform-notes)).

[Finding things](finding.md) explains each of these.

### The find row

| Keys | What |
| --- | --- |
| `enter` | keep the search and its highlights (an empty search clears them) |
| `esc` | cancel, back to the search before it and the cursor where it was |
| `alt+r` / `alt+w` | regular expression / whole words, on or off (also the row's `.*` and `ab` buttons) |
| `alt+h` | the replace row, open or closed (its `⇄` button) |
| `tab`, `ctrl+h` / `shift+tab` | into the replace row / back to the find row |
| `backspace` / `ctrl+w`, `ctrl+backspace` / `ctrl+u` | delete a character / a word / everything typed |

In the replace row:

| Keys | What |
| --- | --- |
| `enter` | replace this match |
| `alt+enter`, `alt+a` | replace them all, in one undo step |
| `ctrl+n`, `down` / `ctrl+p`, `up` | the next / previous match |
| `esc` | close the rows (the search stays) |

`alt+r` and `alt+w` also work in the question that find in every note asks.

## Editing

You edit in one of two places:

- source mode, which shows the note as Markdown
- the lens, which shows the block at the cursor as Markdown and the rest rendered

[Editing](editing.md) explains both.

A key that starts an edit works from the rendered note too. Its first press opens the lens, and the second edits. With
`editor.edit_in = "source"`, it switches the window to source mode instead.

### Modes, undo and saving

| What | Keys |
| --- | --- |
| this window's note as Markdown, or rendered again | `ctrl+k`, `space n v` |
| the lens, at the cursor (`esc` closes it) | `space n l` |
| this window rendered, in the lens or as written, whatever it shows now | the header's `Read`, `Lens`, `Source` |
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
| for a note changed both here and on disk, load theirs, keep yours, diff, or merge | `space n c` |

The `:` commands for saving and quitting (`:w`, `:wq`, `:q!` and the rest) are in [The `:` prompt](#the--prompt).

### Normal mode in source

These keys belong to source mode and the lens. In your configuration, they are under
[`[keys.source]`](configuration.md). While you read, they do nothing.

| What | Keys |
| --- | --- |
| delete / change / copy what a motion or a text object covers | `d` / `c` / `y`, then the motion |
| indent / outdent the lines it covers, a level as the file indents | `>` / `<`, then the motion |
| comment or uncomment the lines it covers, as the language writes comments | `g c`, then the motion |
| the same on whole lines (with a count first, that many) | `d d`, `c c`, `y y`, `> >`, `< <`, `g c c` |
| comment or uncomment the line | `ctrl+/` |
| delete / change to the line's end | `shift+d` / `shift+c` |
| delete the character under the cursor | `x` |
| delete the character / the line's text, and type in its place | `s` / `shift+s` |
| replace the character with the next one you type | `r` |
| join the next line to this one | `shift+j` |
| switch the character's case, and move on | `~` |
| put what was last deleted or copied after / before the cursor (a line goes under / over) | `p` / `shift+p` |
| do the last change again, here | `.` |

The motions are the cursor's keys: `w`, `b`, `e`, `0`, `^`, `$`, `j`, `k`, `g g`, `shift+g`, `{`, `}`, `%`, `f`, `t` and
the rest.

A search is a motion too. For example, `d`, then `/`, the text and `enter` deletes up to the match. `d n` deletes up to
the next one.

After an operator, `g n` / `g shift+n` take the next / previous match itself. For example, press `c g n`, type, then
press `esc`. Then `.` changes the next match, and the next.

A count goes before the operator, the motion or the text object: `3 d d`, `d 2 w`, `5 j`.

A text object follows `i` (inside) or `a` (around): `d i w`, `c i "`, `y a p`.

| Text object | Key after `i` or `a` |
| --- | --- |
| a word / a word with its punctuation | `w` / `shift+w` |
| text in quotes, on the line | `"`, `'`, `` ` `` |
| text in brackets, nested, across lines | `(`, `)` or `b`; `[` or `]`; `{`, `}` or `shift+b`; `<` or `>` |
| a paragraph | `p` |

[Editing](editing.md) lists where these differ from vim.

### Visual mode in source

Visual mode has these keys of its own, besides `o`, `y` and `esc` ([Selecting](#selecting)). In your configuration,
they are under [`[keys.visual]`](configuration.md).

| What | Keys |
| --- | --- |
| delete the selection | `d`, `x`, `backspace`, `delete` |
| delete it and type in its place | `c` |
| indent / outdent its lines | `>` / `<` |
| comment or uncomment its lines | `g c`, `ctrl+/` |
| select a text object (`v i w`, `v i (`) | `i` or `a`, then the object |
| filter its lines through a shell command (types `:'<,'>!`) | `!` |

A count works here too: `v 2 j`, `shift+v 3 >`.

`:` on a selection types `'<,'>` for you. It stands for the selection's lines.

### Typing

While you type, the status chip reads `INSERT`. Keys are text, except these:

| Keys | What |
| --- | --- |
| `esc`, `ctrl+c`, `ctrl+[` | stop typing (`ctrl+c` with a selection copies it) |
| `enter` | a new line, indented as this one (a list goes on, and an empty item ends it) |
| `backspace`, `ctrl+h` / `delete` | delete the character before / after the cursor |
| `ctrl+w`, `ctrl+backspace`, `alt+backspace` | delete the word before the cursor |
| `ctrl+u` | delete what you typed on the line, then the rest before the cursor |
| `tab` / `shift+tab` | indent / outdent the line a level |
| `ctrl+/` | comment or uncomment the line |
| `ctrl+v` | paste the clipboard |
| `ctrl+z` / `ctrl+y` | undo / redo, and go on typing |
| `left`, `right`, `up`, `down` | move |
| `pageup` / `pagedown` | a page up / down, the view with it (in the lens, as far as its edge) |
| `home` / `end`, `cmd+left` / `cmd+right`, `ctrl+a` / `ctrl+e` | the line's start / end |
| `cmd+up` / `cmd+down`, `ctrl+home` / `ctrl+end` | the note's start / end |
| `ctrl+left` / `ctrl+right`, `alt+left` / `alt+right`, `alt+b` / `alt+f` | a word back / forward |
| `shift` with any of the moves above (`shift+left`, `ctrl+shift+right`, `shift+end`…) | select |
| typing, `enter`, a paste | with a selection, replace it |
| `backspace`, `delete` (and `ctrl+w`, `ctrl+u`) / `ctrl+x` | with a selection, delete it / cut it |
| `left` / `right` | with a selection, go to its start / end |
| `ctrl+n` / `ctrl+p` | complete the word from words in the open files |
| `ctrl+s` | save |

With [`editor.auto_pairs`](configuration.md) on:

- a bracket or a quote types its closing half too
- a closing one typed where it already is steps over it
- `backspace` between an empty pair deletes both

### Completion and snippets

Completion shows under the cursor as you type. It offers:

- in a code file, its language server's completions
- in a note, a link's target after `](` or `[[`
- the open files' words, after `ctrl+n`

While it shows, these keys are its own:

| Keys | What |
| --- | --- |
| `ctrl+n`, `down` / `ctrl+p`, `up` | the next / previous item |
| `tab`, `enter` | put the chosen one in |
| `ctrl+e` | close it, and keep typing |
| `esc` | close it, and stop typing |

After you put in a snippet completion, `tab` and `shift+tab` go to its next and previous place to fill in.

### Spelling

With spelling on (`space u s`), these keys work:

| What | Keys |
| --- | --- |
| the next / previous misspelt word | `] s` / `[ s` |
| suggestions for the word under the cursor (`enter` puts one in its place) | `z =` |
| add the word to your own words, so it isn't marked in any note again | `z g` |

### Your shell

`:!cmd` runs `cmd` in your shell, in the vault's top folder, and shows what it prints in a window. In the command,
`%` is the file's path.

`:%!sort`, `:.!cmd`, `:3,7!cmd` and `:'<,'>!cmd` put the lines through it, in one undo step. `!` in visual mode types
`:'<,'>!`.

"Stop the running command", from the palette, ends one still running. [Editing](editing.md) explains these.

## UI: `space u`

| Keys | What |
| --- | --- |
| `space u u` | every UI setting with its value, to change one (window header, breadcrumb, code blocks: no key) |
| `space u t` | pick a theme, previewed as you move (`esc` puts it back) |
| `space u g` | pick the glyphs: nerd, unicode, ascii or auto, previewed |
| `space u shift+w` | readable width: the text in a centred column, [`ui.readable_max`](configuration.md) wide (100) |
| `space u z` | zen: no bars, panels, tabs or window headers, and readable width on |
| `space u l` | the cursor's row highlighted, or not |
| `space u n` | line numbers on the left |
| `space u w`, `alt+z` | wrap long lines, on at first (when off, a wide note scrolls sideways) |
| `space u r` | a link's address shown after its text |
| `space u m` | the mouse on or off (when off, the terminal selects text as it does elsewhere) |
| `space u b` | the top bar on or off |
| `space u d` | the problems bar beside the text, on or off |
| `space u shift+d` | problems marked in the text: off, errors, warnings, all, in turn |
| `space u c` | the code view's cells, in boxes or on tinted bands |
| `space u s` | spelling on or off |

A change applies at once, and is remembered for the folder ([The screen](screen.md#ui-settings)).

Your configuration sets where each setting starts. Once you change that setting in the file, the file wins again.

## Scratch: `space s`

The scratch is a note slipbox keeps for collecting references to hand to an agent. [Editing](editing.md) explains it.

| Keys | What |
| --- | --- |
| `space s s` | open the scratch, floating or on the right as `capture.open_in` says (it updates as agents add) |
| `space s r` | open the scratch in the window on the right |
| `space s a` | add the selection with its `path:line-line`, or the cursor's row with its `path:line`, and show it |
| `space s y` | copy the whole scratch |
| `space s c` | copy the note's context for an agent: it, what it links to, what links to it |
| `space s d` | clear the scratch, after asking |

## Code cells: `space k`

The code view draws a code file as a notebook ([Code](code.md)). Each definition is a cell, with buttons on its header.
Each button has a key, which acts on the cell at the cursor.

| Keys | What | Button |
| --- | --- | --- |
| `space k f`, `z a` | fold the cell to its header, or unfold it | `▾` / `▸` |
| `space k e` | edit the cell, in the lens on its lines | `✎` |
| `space k y` | copy the cell's lines, as the file has them | `⧉` |
| `space k r` | where the cell's definition is used, from its language server | `⇢` |
| `space k p` | the cell's problems, in the Problems panel on the first | `⚠` and a count |
| `space k s` | add the cell to the scratch, with its path and lines | `◎` |
| `space k d` | fold the cells with no change against what's staged, open the others; again, open them all | |

## Git: `space g`

| Keys | What |
| --- | --- |
| `space g` | the git panel: opens it, focuses it, closes it, in turn |
| `] c` / `[ c` | the next / previous line changed against what's staged, as the gutter marks them |

The rest of git is the panel's, and the palette's: `:changes`, `:diff`, `:worktrees`, `:merge-review`, and the commands
titled Branches, Who changed this line, This file's history, Preview the change and Undo the change. A click on a
change's sign in the gutter shows the change, with Revert and Stage. [Git](git.md) explains each of these.

### Inside a diff

A diff opens in a floating window ([How a diff is drawn](git.md#how-a-diff-is-drawn)).

| Keys | What |
| --- | --- |
| `tab` | a note's diff: switch between its blocks before and after and its lines |
| `enter` | on a fold, show the lines it holds; on a line, go to it in the file |
| `$` / `0` | to a long line's end or start, the rows scrolling sideways (both sides of a diff side by side) |
| `esc`, `q` | close it, back to the panel, the list or the question it came from |

### Inside the git panel

Its keys act on the row selected. The panel's footer says the ones that do something there, and a button under the
pointer says its own. `[keys.git]` changes them ([Configuration](configuration.md)).

| Keys | What |
| --- | --- |
| `j` / `k`, `down` / `up` | select the next / previous row |
| `enter` | a file's diff, or a change's; fold or unfold a section; open up a branch or a repository in place |
| `o` | open the file at its change; go into a branch's worktree, or a repository |
| `l`, `right` / `h`, `left` | open up a file into its changes, a branch, a repository / fold it again |
| `s` | stage the file, or the one change (a conflict's file is marked resolved); on a heading, every file under it |
| `u` | unstage it; on Staged's heading, everything |
| `d` | discard what isn't staged, after asking (an untracked file goes to slipbox's trash); remove a worktree |
| `a` / `shift+u` | stage / unstage everything |
| `i` | type the commit's message in the panel's message box |
| `c` | commit what's staged, with the box's message, or one written in a floating editor |
| `shift+c` | amend the last commit with what's staged |
| `v` | review the changes not staged, one at a time (`:review`) |
| `x` | the merge screen, on the file in conflict selected (`:resolve`) |
| `shift+r` | rebase onto the base; while a merge or a rebase is under way, continue, skip or abort it (`:rebase`) |
| `f` | fetch from the remote, in the background (`:fetch`) |
| `p` | pull the upstream's new commits, unsaved notes saved or kept first; where both sides moved, it asks (`:pull`) |
| `shift+p` | push the branch to its upstream; with none, asks to push it to `origin` and track it (`:push`) |
| `z` | the stashes: stash your changes with a message, or pop, apply or drop a stash (`:stash`) |
| `n` | a new branch: its name, where it starts, and where it goes, in a new worktree by default |
| `m` | merge the branch selected into its base, the links it would break shown first |
| `.` | the row's menu, as a right click opens it |
| `g g` / `shift+g` | the first / last row |
| `/` | filter the files, branches and repositories by name |
| `q` | close the git panel |
| `esc` | back to the note (with a filter kept, it clears it first) |

In the message box, `ctrl+enter` commits, `enter` takes the message to the floating editor, and `esc` leaves the box,
keeping what's typed. In the floating editor, every editing key works: `ctrl+s` (or `:w`) commits, and `esc` (or `q`)
leaves it, committing nothing.

### Inside a review

`v` in the git panel walks the changes not staged, one at a time ([Reviewing a change](git.md#reviewing-a-change)).

| Keys | What |
| --- | --- |
| `y` | keep the change: stage it |
| `x` | revert it: its lines as staged again, the file saved |
| `c` | a note for the agent: the change, its file and lines, into the scratch |
| `n` / `p` | the next / previous change |
| `enter` | end the review, and go to the change in its file |
| `esc` | end the review: what you kept, reverted and noted, said |

### Inside the merge screen

`x` on a file in conflict settles its conflicts one at a time ([The merge screen](git.md#the-merge-screen)).

| Keys | What |
| --- | --- |
| `o` / `t` | take yours / theirs |
| `b` / `shift+b` | take both, yours first / theirs first |
| `e` | the result in the file, the lens on this conflict, to settle by hand |
| `a` | the conflict, its base and the lines around it, into the scratch for the agent |
| `n` / `p` | the next / previous conflict |
| `w` | save the file, once every conflict is settled (`ctrl+s` and `:w` too) |
| `s` | stage the saved file, marking it resolved; the next file in conflict opens |
| `esc` | close it, what's settled kept |

## Note, folder, app

### The note: `space n`

Deleting, moving, copying, cutting and exporting act on the explorer's selected note when the explorer has the focus.

| Keys | What |
| --- | --- |
| `space n n`, `ctrl+n` | a new note beside this one, asking its name (`projects/idea` makes the folder too) |
| `space n m` | rename or move the note by its path, or into a folder, fixing links after a preview |
| `space n shift+m` | move the note to a folder picked from a tree |
| `space n h` | rename the heading the cursor is in, fixing every link to it after a preview |
| `space n d` | delete the note to slipbox's trash, after asking |
| `space n y` / `space n x` | copy / cut the note, for `space d p` to paste |
| `space n shift+y` | a copy of the note beside it (`name-copy`), opened |
| `space n o` | export the note as Word, PDF, a web page, an e-book or Markdown, then pick where |
| `space n shift+o` | export notes, picked in order, as one document |
| `space n i` | Info, in the right panel: opens it, focuses it, closes it |
| `space n shift+p` | edit the note's properties (its front matter) in a floating editor |
| `space n q` | this file's problems, in the Problems panel |
| `space n r` | read the note from disk again (with unsaved changes, it asks first) |
| `space n e` | edit the note in your editor, at the cursor's line, in this terminal |
| `space n s` | send the note to your editor running elsewhere (a running nvim, by default) |
| `space n p` | choose the running nvim `space n s` sends to |

### Folders: `space d`

When the explorer has the focus, these keys act on its selected folder (or a selected file's folder). Otherwise they
act on this note's folder.

| Keys | What |
| --- | --- |
| `space d n`, `ctrl+shift+n` | a new folder, asking its name |
| `space d r` | rename the folder in place, fixing links into it after a preview |
| `space d m` | move the folder to a folder picked from a tree |
| `space d d` | delete the folder, and all in it, to slipbox's trash, after asking |
| `space d y` / `space d x` | copy / cut the folder, to paste |
| `space d p` | paste into the folder what was copied (a copy) or cut (moved, links fixed) |

### Vaults and named folders: `space v`

A vault is the folder slipbox works in. [Vaults, home and Elsewhere](vaults.md) explains vaults and their names.

| Keys | What |
| --- | --- |
| `space v v` | the named folders this machine knows (`enter` goes into one) |
| `space v shift+v` | which copy a named folder's links open, when you have two |
| `space v n` | name this vault (or the selected one) as pointers name it, after a preview |
| `space v m` | in Elsewhere, give the folder opened a `.slipbox/`; in a vault or home, make the selected one a vault |
| `space v shift+m` | make a nested vault part of the vault holding it |
| `space v t` | slipbox's trash: what was deleted here (`enter` restores it, and its last row empties it) |
| `space v u` | restore what was deleted last |
| `space v shift+u` | undo the last rename, move, relink or replace in every note, after a preview |
| `space v p` | the Problems panel's All tab: this vault's broken links, lint, conflicts |
| `space v r` | reindex the vault |
| `space v l` | the symlinks you've answered, followed or not: `enter` forgets one, and opening it asks again |
| `space v i` | about this folder: its vault, name and copies, notes, what's skipped, the watcher |
| `space v c` | read the configuration again (saving it does that too) |

### The app

| Keys | What |
| --- | --- |
| `?`, `space ?` | help: every key, by group, searchable (`enter` runs a command) |
| `space m` | the messages slipbox has shown |
| `space r` | report a problem: the bug form, its facts filled in, sent only as you say ([below](#inside-a-report)) |
| `space q q`, `ctrl+q` | quit (refused while a note is unsaved, which it names) |

### Inside a report

`space r` (or `:report`) opens a report in the floating window, typing on its title's line. It's text like any, every
editing key there; what's in it is what leaves. Nothing leaves until you choose how
([Reporting a problem](troubleshooting.md#reporting-a-problem)).

| Keys | What |
| --- | --- |
| `ctrl+s`, `:w` | how to send it, as this machine can: the keys below |
| `o` | in that menu, open the bug form in your browser, filled in (not over SSH, nor without a display) |
| `a` / `c` | copy the bug form's address, filled in / copy the report, as Markdown |
| `v` | copy What slipbox sees, when it doesn't fit in the address |
| `g` | post it with `gh`, after a yes naming the repository, the title and the account |
| `s` / `w` | add the screen as text / where you were (the file, the line and its text), in full |
| `u` | take out what was just added, as any edit |
| `esc`, `q` | leave it, kept as it is until slipbox quits (`esc` twice while typing) |

### Inside Problems

The Problems panel lies across the bottom, in two tabs: This file (`space n q`) and All (`space v p`).

| Keys | What |
| --- | --- |
| `j` / `k`, `down` / `up` | select the next / previous problem (in This file, the note shows it) |
| `enter`, `l`, `right` | go there (from All, in a tab of its own, or the tab showing it) |
| `o` / `s` | in All, open it in this window / in the split |
| `x` | in All, on a merge's conflict: the merge screen on its file |
| `h`, `left` | in All, fold the section, or go to its heading |
| `tab`, `shift+tab` | the other tab |
| `g g` / `shift+g` | the first / last row |
| `/` | filter the tab's problems |
| `q` | close the panel |
| `esc` | back to the note |

On a section's heading in All, `enter`, `o` and `s` fold or unfold it.

## The `:` prompt

`:` opens the palette, which is also a command line. You can:

- type part of a command's name, and pick it from the list
- type one of these commands exactly, and it wins over the matches

Where a command takes an argument, type a space after it to list what it can be: notes, themes, glyph sets, formats,
tags, types.

Your configuration's [`[aliases]`](configuration.md) adds more commands, or renames these.

| Command | What it does |
| --- | --- |
| `:42` | go to line 42 |
| `:w`, `:write` | save the note |
| `:w!` | save over a file that changed on disk |
| `:wa`, `:wall` | save every changed note |
| `:e!` | read the note from disk again, dropping your changes (undo brings them back) |
| `:q`, `:quit` | close the window, or its tab (on the very last one, quit) |
| `:qa`, `:qall` | quit |
| `:wq`, `:x`, `:wqa`, `:xa` | save every changed note and quit |
| `:q!` | quit without saving |
| `:e <note>`, `:open <note>` | open a note, or any text file here, by its path |
| `:vs [note]` / `:sp [note]` | split side by side / stacked, the note in the new window |
| `:tabnew [note]` | a new tab, with this note or the one named |
| `:tabonly`, `:tabo` | close the other tabs, except the pinned ones |
| `:tabpin` | pin or unpin the tab |
| `:source` | the note as Markdown, or rendered again |
| `:lens`, `:live` | open or close the lens |
| `:new <name>` / `:mkdir <name>` | a new note / folder beside this note (with a leading `/`, from the vault's top) |
| `:rename <path>`, `:mv <path>` | rename or move the note, fixing links after a preview |
| `:delete` | delete the note to slipbox's trash, after asking |
| `:trash` | slipbox's trash (`enter` restores an item) |
| `:empty-trash` | the trash, on its last row (`enter` asks, then empties it for good) |
| `:undo-rename` | undo the last rename, move or relink, after a preview |
| `:link` | write a link to a note you pick |
| `:relink` | point this note's links that a move broke to where the files are now |
| `:convert-links [note]` | links rewritten as plain relative paths, after a preview (the note's, else every note's) |
| `:search [words]` | search, ranked as you type |
| `:tags` / `:tag <name>` | the tags here / a tag's notes |
| `:types` / `:type <name>` | the document types here / a type's notes in order |
| `:noh` | clear the find highlights |
| `:problems` | the Problems panel's All tab |
| `:footnotes` | show or hide the footnotes |
| `:context` | copy the note's context for an agent |
| `:export [format]` | export the note, and a format (`docx`, `pdf`, `html`, `epub`, `md`) skips the list |
| `:export-notes` | export notes as one document |
| `:changes` / `:diff` | the branch's changed files / this note's diff, against the base |
| `:worktrees` / `:merge-review` | the worktrees / the links a merge would break |
| `:fetch` / `:pull` / `:push` | fetch, pull or push, as source control's `f`, `p` and `shift+p` |
| `:stash` | the stashes, as source control's `z` |
| `:review` | review the changes not staged, one at a time, as source control's `v` |
| `:resolve [file]` | the merge screen on a file in conflict: the one named, this note, or the first |
| `:rebase` | rebase onto the base, or the merge or rebase under way's choices, as source control's `shift+r` |
| `:continue` / `:skip` / `:abort` | continue the merge or rebase under way, skip the rebase's commit, or abort it |
| `:folders` | the named folders, to pick one to go into |
| `:folders-default` | which copy a named folder's links open |
| `:name [new]` | name this folder, as pointers name it |
| `:init` | give the folder opened in Elsewhere a `.slipbox/` |
| `:trust`, `:untrust` | trust this vault, so its own tools run, or stop trusting it ([Code](code.md)) |
| `:symlinks` | the symlinks you've answered, to forget an answer |
| `:theme <name>` | set the theme |
| `:glyphs <set>` | set the glyphs: `nerd`, `unicode`, `ascii` or `auto` |
| `:zen` / `:wrap` | zen mode / wrapping, on or off |
| `:hidden` | hidden files and folders in the explorer, shown or not, as its `shift+h` |
| `:messages` | the messages slipbox has shown |
| `:reload` / `:reindex` | read the note from disk again / reindex the vault |
| `:config` | read the configuration again |
| `:help` | help: every key and command |

Vim's shell commands are typed here too: `:!cmd` and `:%!cmd` ([Your shell](#your-shell)).

So are vim's substitute commands:

- `:s/old/new/` on the cursor's line
- `:%s/old/new/` on the whole note
- `:'<,'>s/old/new/` on the selection's lines

They take the flags `g`, `i` and `c`. [Finding things](finding.md) explains substitute.

With `c`, slipbox asks at each match:

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
| an entry's key | in a menu, pick that entry (`shift+r` and `r` differ) |
| `left` / `right` | in a tree of folders, fold / unfold |
| `ctrl+a` | in search, more folders: those linked with this one, then every vault, then this one again |

Pasting puts the first line of the text in the list's filter or the prompt.

A prompt is one line to type, such as a new note's name. It takes:

- `enter`
- the cancel keys
- `backspace`
- `ctrl+w` and `ctrl+backspace` for a word
- `ctrl+u` to clear it

A question takes `y` or `n`. `esc` is no, and `enter` isn't an answer.

### The save window

Exporting asks where to save in a window of its own ([Exporting](export.md)). The window has:

- places down the left
- the folder on the right
- the file's name at the bottom

| Keys | What |
| --- | --- |
| `tab` / `shift+tab` | the next / previous part: the places, the folder, the name |
| `up` / `down` | move (in the name, to the folder) |
| `pageup` / `pagedown`, `home` / `end` | in the folder, move by 10, or to the first / last |
| `enter`, `right` | go into a folder or a place, take a file's name, or, in the name, export |
| `left`, `backspace` | in the folder, go up a folder |
| `~` | your home folder |
| typing | in the folder, go to the name that starts so (a `.` first shows hidden ones), or in the name, type it |
| `ctrl+n` | a new folder here, asking its name |
| `ctrl+w`, `ctrl+u` | in the name, delete a word, or all of it |
| `esc`, `ctrl+c`, `ctrl+g` | cancel |

## Mouse

Everything that looks clickable is. A button lights up under the pointer. `space u m` turns the mouse off, which gives
it back to the terminal.

### Around the notes

| Where | What a click does |
| --- | --- |
| `≡` on the left rail (without the rail, on the top bar) | shows the explorer, focused, or hides it |
| `◷` on the left rail | shows the history, focused, or hides it |
| `±` on the left rail | shows source control, the git panel, focused, or hides it |
| `ℹ` on the right rail | shows Info, focused, or hides it |
| `▤` on the right rail (without it, on the window header or the top bar) | shows the outline, focused, or hides it |
| `¹` on the right rail | shows the footnotes, focused, or hides them |
| the top bar's `slipbox` | opens the command palette |
| a window header's `Read` / `Lens` / `Source` | shows it rendered, in the lens or as written; one in italics, why not |
| the top bar's vault | lists the named folders, and `enter` goes into one |
| the top bar's branch | in a repository: pull, push and fetch, then the branches to check one out |
| a heading in a window's breadcrumb | scrolls that window to it, and focuses it |
| the breadcrumb's icon / its `…` | finds a heading / lists the headings the cursor is under |
| a tab | switches to it, a drag moves it, and a middle-click or its `×` closes it |
| the tab strip's `+N` | lists the tabs that don't fit |
| a pane's border | dragged, resizes the explorer, the outline or the split |
| a scrollbar | jumps there, or scrolls when dragged |
| a task's box (`☐` / `☑`) | ticks or unticks it |
| the status line's `‹` / `›` | back / forward in the window's history |
| the status line's path | lists the window's history, with Copy path first |
| the status line's vault and branch, while the top bar is hidden | the same as the top bar's branch |
| a change's sign in the gutter | shows the change, with Revert and Stage |
| the status line's problems | the Problems panel on This file (on All when the file has none), or closes it |
| a sign in the problems bar, a coloured line number | the Problems panel, on that problem |
| a Problems tab's title | switches to it |
| a row in Problems | in This file, shows the problem and goes there on a second click, and in All, opens it |
| the Problems panel's rule | dragged, resizes it |
| a message's floating box | opens the messages list |
| an entry in the which-key popup | opens a group, or runs a command |
| a code cell's button | does what its key does ([Code cells](#code-cells-space-k)) |

### In the notes, panels and lists

| Where | What the mouse does |
| --- | --- |
| a note | a click moves the cursor, or follows the link under it, and a drag selects and copies on release |
| a link out of the vault | a click peeks at the file, and `ctrl+click` goes there at once |
| a note, double / triple click | selects and copies the word / the row |
| a note, the wheel | scrolls (a sideways wheel scrolls sideways when wrapping is off) |
| a code block too wide, a sideways wheel, or the wheel with `shift` | scrolls the block sideways |
| a picture | a click shows it at its own size, and another fits it to the window again |
| a picture at its own size, a sideways wheel or the wheel with `shift` | scrolls it sideways (unwrapped, the window) |
| the tab strip, the wheel | switches to the next or the previous tab |
| the explorer | a click selects a note, a double-click opens it as a tab, and a click on a folder folds or unfolds it |
| the explorer's breadcrumb | a click on a folder zooms the view to it ([Files](files.md#the-view)) |
| the history | a click selects, a double-click goes there |
| source control (the git panel) | a file's row shows its diff, a double-click opens it; a heading folds or unfolds |
| source control, under the pointer | a row's buttons: `+` stage, `−` unstage, `↺` discard, `⧉` its diff |
| source control, a right click | the row's menu: its keys' actions, show it in the explorer, copy its path, a note |
| the outline | a click goes to the heading, or on `▾` / `▸`, folds or unfolds |
| the footnotes, Info | a click goes to the footnote, or opens what the row names |
| a panel, the wheel | scrolls it, and the selection stays |
| a list, the wheel | scrolls it, and the selection moves only to stay in view |
| a list's entry | picks it |
| a question's buttons | OK and Cancel, or Yes and No |
| outside a list or a question | closes it (a question is cancelled) |

## Platform notes

**Mac.** By default, `ctrl+left`, `ctrl+right`, `ctrl+up` and `ctrl+down` switch desktops and open Mission Control. So
they never reach slipbox. `cmd` keys arrive only if the terminal passes them on. Their other keys always work.

**Same key, two names.**

- Many terminals send `ctrl+h` as `ctrl+backspace`, so both open find and replace. In such a terminal, `ctrl+h` also
  does what `ctrl+backspace` does elsewhere: while you type, and in the find row, it deletes the word before the
  cursor.
- `ctrl+/` arrives as `ctrl+_`, so both comment a line.
- `ctrl+i` arrives as `tab`.
- A terminal without the kitty keyboard protocol sends `ctrl+j` as a line feed, which slipbox reads as `ctrl+j`.

**Older terminals** can't tell some keys from the same keys without `shift` or `ctrl`. These are `ctrl+shift+f`,
`ctrl+shift+h`, `ctrl+shift+p`, `ctrl+shift+n`, `ctrl+shift+tab`, `ctrl+tab`, `ctrl+enter` and `ctrl+backspace`. Each
has another key that works everywhere.

**The keypad** arrives apart from the main keys, under the kitty protocol. Its `enter`, arrows and page keys act as the
main ones.

**A shifted space** types a space wherever you type: while editing, in a prompt or a filter, after `f`.

**Multiplexers.** zellij takes `ctrl+t`, `ctrl+p`, `ctrl+o` and `ctrl+q`. tmux and herdr take `ctrl+b`, which slipbox
doesn't use. The leader's keys always work.
