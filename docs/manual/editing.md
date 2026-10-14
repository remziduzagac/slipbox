# Editing

slipbox edits the Markdown itself. What you change is the text of the file, and nothing else.

You can see a whole note as Markdown while you edit it. That is source mode. Or you can see only the part you are
working on as Markdown, with the rest of the note still rendered around it. That is the lens.

This chapter covers:

- source mode and the lens
- the keys for typing and changing text
- saving
- what happens when someone else changes a file you are editing
- the tools around writing: tasks, completion, spelling, your linter's findings, commands from your shell, your own
  editor, and the scratch

Making, renaming, moving and deleting files is in [Files](files.md).

You don't need any prior knowledge. Everything in the first section works with the arrow keys, `ctrl+s` and the
mouse. vim's keys are there too, for those who want them. [The vim keys](#the-vim-keys) explains them.

## The basics

While you edit, slipbox is in one of two states: typing, or not typing.

- While you type, keys put text in.
- While you don't, keys are commands: `j` moves down, `u` undoes, and so on.

Three keys are all you need to go between the two:

- `i` starts typing at the cursor. On a rendered note, the first `i` opens the lens. The lens shows the Markdown around
  the cursor, as it is written, with the rest of the note still rendered. The second `i` types into it.
- `esc` stops typing. Your keys are commands again. A second `esc` closes the lens.
- `ctrl+s` saves, typing or not.

The chip at the left of the status line says where you are:

- `INSERT` while you type
- `SOURCE` in source mode
- `LENS` in the lens

| To | Press |
| --- | --- |
| Start typing at the cursor | `i` |
| Start typing after the cursor | `a` |
| Start typing on a new line below | `o` |
| Move the cursor | The arrow keys, `home`, `end`, `pageup`, `pagedown`, or a click |
| Move by word | `ctrl+left` / `ctrl+right` |
| Move by word on a Mac | `alt+left` / `alt+right` (`alt` is option) |
| Delete | `backspace` or `delete` |
| Start a new line | `enter` (a list goes on with its next item) |
| Stop typing | `esc` |
| Save | `ctrl+s` |
| Undo / redo | `ctrl+z` / `ctrl+y` |
| Select | `shift` with a key that moves (`ctrl+shift+left` by word), or drag with the mouse |
| Replace the selection | Type, or paste |
| Delete the selection | `backspace` or `delete` |
| Copy / cut / paste | `ctrl+c` / `ctrl+x` / `ctrl+v` |
| See the whole note as Markdown, and back | `ctrl+k` (source mode) |

A few things work differently from a desktop editor:

- **A click ends typing.** The cursor goes where you clicked. Press `i` to type there.
- **A drag selects, and ends typing too.** Then `ctrl+x` cuts what it selected, and `ctrl+v` pastes over it. `c` types
  in its place.
- **`ctrl+c` with nothing selected stops typing**, as `esc` does. With a selection, it copies it.
- **`ctrl+x` with nothing selected** cuts the cursor's line, when you are not typing.
- **`ctrl+v`** pastes at the cursor while you type, or over the selection if there is one. When you are not typing, it
  pastes after the cursor, or over the selection. A copied line goes under the cursor's line.
- **Unsaved changes are saved for you** after 30 seconds without a key pressed ([Saving](#saving)).

## Source mode and the lens

### Source mode

Press `ctrl+k` to see the window's note as its Markdown. `space n v` and `:source` do the same. Press it again to see
the note rendered.

The chip reads `SOURCE`. The cursor stays on its line across the switch.

Everything else works as in the rendered note:

- find
- selecting and copying
- the mouse
- wrapping
- line numbers
- the outline and the breadcrumb

The Markdown is lightly highlighted:

- front matter
- headings
- lists and task boxes
- quotes
- code
- links

### The lens

The lens edits a note in place. Press `space n l` (or `:lens`) to open it.

The blocks around the cursor are shown as their Markdown, between two heavy rules. A block is a paragraph, a heading, a
table, a code block or a list item. The rest of the note stays rendered above and below. Where you are looking is
Markdown. Nothing is half rendered.

**Its label.** The top rule says which lines the lens holds:

- `source · lines 12–18` while you look
- `editing · lines 12–18` while you type

While you type, the rules and the rows' tint turn green.

**Its keys.** When you are not typing, the keys work on the text in the lens, vim's commands too. `esc` closes the
lens, and the whole note renders again.

**Moving.** The cursor stays in the lens.

- Moving past its edge moves the lens with you. It moves onto the next section when that fits, or else a block at a
  time.
- A jump (`g g`, a search, a heading picked in the outline) moves the lens to where you land.
- The lens keeps its place on the screen, and the page scrolls under it.
- A click in the rendered text outside the lens moves the lens there.
- The mouse wheel scrolls the page, and the lens rides with its text.
- While you type, the arrow keys stop at its rules.

**Its size.** The lens opens on the section the cursor is in: the heading and everything under it. It does so when that
section fits in half the window (`editor.lens_max`). Otherwise it opens on the cursor's block and its neighbours, until
it holds at least six rows of Markdown (`editor.lens_min_rows`).

| Key | What it does |
| --- | --- |
| `+` | Takes the next block in |
| `-` | Drops the block farthest from the cursor |
| `=` | Lets the lens size itself again |

After `+` or `-`, the lens keeps that size as it moves.

A block taller than the lens scrolls inside it. The rows out of sight are counted on its rules (`↑ 21 lines`).

**Its counters.** A narrow column before the lens's rows counts each row's distance from the cursor's row. The cursor's
row shows `0`. So you can read vim's counts (`5 j`, `d 3 k`) off it. The gutter keeps the lines' own numbers.
`ui.relative_numbers = "off"` hides the column.

The lens follows you to another note. Following a link from it, or going back with `ctrl+o`, opens the lens on the note
you land on.

### Which one an editing key opens

The editing keys are `i`, `a`, `o` and their capitals. On a rendered note, an editing key opens the way
`editor.edit_in` says ([Configuration](configuration.md)):

| `editor.edit_in` | What an editing key does |
| --- | --- |
| `"live"`, the default | The first press opens the lens on the cursor's block, and the second edits |
| `"source"` | The window switches to source mode, and the key edits at once |

With `"live"`, `esc` `esc` leaves the way you came. The first `esc` stops typing, and the second closes the lens.

Either way, `ctrl+k` and `space n l` open the other one.

### Files beyond notes

Data files (JSON, YAML, TOML, INI, CSV and the like) open rendered. The lens edits them one card at a time: a key and
the values under it, or a few rows of a table.

If a data file stops parsing while you edit it, it switches to source mode when you stop typing. `space n v` renders it
again once it parses.

Other text files open in source mode, since they have no rendered view. Code has a view of its own ([Code](code.md)).
[Reading](reading.md) says how each kind of file is shown.

Two kinds of file can't be edited:

- a file that isn't valid UTF-8, since slipbox would change bytes it can't show you
- a note deleted on disk, which keeps showing its last text, marked `✖ deleted on disk`

## Typing

While you type, the chip reads `INSERT` and most keys put text in. These keys don't:

| Key | What it does |
| --- | --- |
| `enter` | A new line, indented as this one. A list goes on: the same bullet, the next number, an empty task box |
| `enter` on an empty list item | Ends the list, and the item's marker goes |
| `tab` / `shift+tab` | Indents / outdents the line a level ([Indentation](#indentation-and-comments)) |
| `backspace` / `delete` | Deletes the character before / after the cursor. At a line's edge, joins two lines |
| `ctrl+w` | Deletes the word before the cursor |
| `ctrl+u` | Deletes what you typed on this line, then the rest of the line before the cursor |
| The arrow keys, `home`, `end` | Move |
| `pageup` / `pagedown` | Move a page up / down, the note scrolling with the cursor. In the lens, as far as its edge |
| `ctrl+left` / `ctrl+right` | Move by word (also `alt+left` / `alt+right`, and `alt+b` / `alt+f`) |
| `cmd+left` / `cmd+right` | To the line's start / end (also `ctrl+a` / `ctrl+e`, what a Mac terminal sends) |
| `cmd+up` / `cmd+down` | To the note's start / end, where the terminal passes `cmd` (also `ctrl+home` / `ctrl+end`) |
| `shift` with any of these moves | Selects ([below](#selecting-while-you-type)) |
| `ctrl+z` / `ctrl+y` | Undoes / redoes, and you go on typing |
| `ctrl+v` | Pastes the clipboard |
| `ctrl+/` | Comments the line out, or back in |
| `ctrl+n` / `ctrl+p` | Completes the word ([Completion](#completion)) |
| `ctrl+s` | Saves |
| `esc`, or `ctrl+c` with nothing selected | Stops typing. The cursor steps back onto the last character typed |

Your terminal's own paste (`cmd+v`, `ctrl+shift+v`) types the text it pastes.

In code, `enter` goes a level in after an opening bracket, or after Python's or YAML's `:`.

**Closing pairs.** Closing pairs are off by default. With `editor.auto_pairs = true`:

- typing `(`, `[`, `{` or a quote types its closing half too
- typing the closing one where it already is steps over it
- `backspace` between an empty pair deletes both

**Moving lines.** When you are not typing, `alt+shift+up` / `alt+shift+down` move the cursor's line up or down, past
the next one. With lines selected with `shift+v`, they move those lines. Each move is one undo step.

### Selecting while you type

`shift` with a key that moves selects from where the cursor was, as in a desktop editor:

| Keys | Select |
| --- | --- |
| `shift+left` and `shift+right` | A character |
| `shift+up` and `shift+down` | A row |
| `ctrl+shift+left` and `ctrl+shift+right` | A word |
| `shift+home` and `shift+end` | To the line's start and end |
| `shift+pageup` and `shift+pagedown` | A page |

Then:

| Key | What it does |
| --- | --- |
| Typing, `enter` or a paste | Replaces the selection |
| `backspace`, `delete`, `ctrl+w` or `ctrl+u` | Deletes it |
| `ctrl+c` / `ctrl+x` | Copies it / cuts it |
| `left` / `right` | Goes to its start / end |
| `esc` | Stops typing, and the selection goes with it |
| Any other key | Lets the selection go, and does what it does |

What a selection replaces or deletes isn't copied. So `ctrl+v` over it puts what you copied before.

## Undo, redo and the clipboard

| To | When you are not typing | While you type |
| --- | --- | --- |
| Undo | `u` or `ctrl+z` | `ctrl+z` |
| Redo | `ctrl+r`, `ctrl+y` or `shift+u` | `ctrl+y` |

While you type, you go on typing after an undo or a redo.

Everything you type between `i` and `esc` is one step, or up to an undo while you type.

If you undo back to the text as it was saved, the note has no unsaved changes again.

A reload from disk is a step too. When an agent rewrites a note you have open, `u` brings back what was there before.

`g ;` and `g ,` go back and forth through the places you changed. `g i` starts typing again where you last stopped.

You select and copy the same way in a rendered note, in source mode and in the lens. Cutting and pasting change the
text, so they work on the Markdown.

**Selecting.**

- `shift` with an arrow key extends a selection. So does `ctrl+shift` with one, by word or paragraph.
- Dragging with the mouse extends a selection too.
- A double click selects a word, and a triple click the row.
- `v` and `shift+v` start selecting by character or by whole rows ([The vim keys](#the-vim-keys)).
- `esc` clears the selection.

In source mode and the lens, a selection made with `shift` or a drag is visual mode's. Then:

- `backspace`, `delete`, `d` or `x` deletes it
- `c` types in its place
- any move extends it

While you type, `shift` selects as a desktop editor does ([Selecting while you type](#selecting-while-you-type)).

**Copying.** `ctrl+c` copies the selection. `y y` copies the selection, or the cursor's row when nothing is selected.
In visual mode, `y` alone copies it. A drag with the mouse, and a double or triple click, copy what they select.

In a rendered note, you copy the text as you see it on the page, not the Markdown under it.

Three more copies are about the note rather than its text, while you read:

| Key | Copies |
| --- | --- |
| `y p` | The note's full path |
| `y r` | Its path and the cursor's line (`ideas/coffee.md:18`) |
| `y l` | The target of the link under the cursor |

**Cutting and pasting.** `ctrl+x` cuts the selection, or the cursor's line when nothing is selected. `ctrl+v` pastes
after the cursor, or over the selection. A copied line goes under the cursor's line.

On a rendered note with nothing selected, they first switch the window to editing, as `editor.edit_in` says. A
selection made on the rendered page can be copied. Cutting it or pasting over it needs source mode or the lens.

Your terminal's own paste (`ctrl+shift+v`, `cmd+v`) types the text while you type. Otherwise it puts the text as
`ctrl+v` does.

**The clipboard.** Every copy and cut goes to your system clipboard. So does every delete in source mode, as in vim
with `clipboard=unnamedplus`.

slipbox copies two ways at once:

- through the terminal, which also works over SSH
- through your system's tool: `pbcopy` on a Mac, `clip.exe` in WSL, else `wl-copy`, `xclip` or `xsel`

A paste reads the clipboard back, with `pbpaste`, `wl-paste`, `xclip`, `xsel`, or PowerShell in WSL. Where the
clipboard can't be read (over SSH, say), slipbox pastes what it last copied or cut itself.

[Troubleshooting](troubleshooting.md#copying-over-ssh) has the clipboard's problems.

## The vim keys

If you know vim, you know most of this already:

- not typing is vim's normal mode
- typing is its insert mode
- `v` and `shift+v` are its visual mode, by characters and by whole rows

The chip shows the mode (`INSERT`, `VISUAL`) and what is waiting for its next key (`2d`, `di`).

The operators and the other keys below are source mode's and the lens's. In a rendered note, `i`, `a`, `o` and their
capitals switch to editing first. `d`, `c`, `x` or `p` do nothing there.

**Operators** wait for a motion or a text object, and act on what it covers:

| Operator | What it does |
| --- | --- |
| `d` | Deletes |
| `c` | Changes (deletes, then types) |
| `y` | Yanks (copies) |
| `>` and `<` | Indent and outdent |
| `g c` | Comments out or back in |

Doubled, an operator takes the whole line: `d d`, `c c`, `y y`, `> >`, `< <`, `g c c`.

**Motions** are the keys that move the cursor: `w`, `b`, `e`, `0`, `^`, `$`, `j`, `k`, `g g`, `shift+g`, `{`, `}`,
`%`, `f`, `t` and the rest. A search is one too. For example, `d`, then `/`, the text and `enter`, deletes up to the
match.

**Text objects** follow `i` (inside) or `a` (around). An object is a word, text in quotes or brackets, or a paragraph:

- `d i w` deletes a word
- `c i "` changes what is in quotes
- `y a p` copies a paragraph

**Counts** go before the command, the motion or the object: `3 d d`, `d 2 w`, `5 j`.

**`.`** repeats the last change, the text typed with it included. After `c g n` (change the search's next match), type
the new text and `esc`. Then each `.` changes the next match.

**The register** is one. It holds the text last deleted, changed or yanked. A yank and every delete also go to the
system clipboard, as in vim with `clipboard=unnamedplus`. `p` puts what the clipboard holds.

**Undo** is `u`, as in vim. Redo is `ctrl+r`, and `shift+u` too.

**Visual mode.** Movement extends the selection. Then:

| Key | What it does |
| --- | --- |
| `d` | Deletes it |
| `c` | Changes it |
| `y` | Copies it |
| `>` and `<` | Indent or outdent it |
| `g c` | Comments it |
| `o` | Jumps to its other end |
| `i` or `a` with an object | Selects that object (`v i w`) |
| `:` | Types `'<,'>` for a command on its lines |
| `!` | Types `:'<,'>!` to filter them through a command |

A selection made with `shift` and a move, or with a drag, starts visual mode too.

[Keys](keys.md) lists every key, and they can be changed. Source mode's keys are `[keys.source]` in your configuration,
and visual mode's are `[keys.visual]` ([Configuration](configuration.md)).

### Where it isn't vim

- Motions move by the rows you see. On a long line wrapped across several rows, `0`, `$`, `j` and `k` (and `d $`,
  `d j`) work on the row. `shift+d`, `shift+c`, `shift+a`, `shift+i`, `d d` and `c c` take the whole line.
- A word motion never stops inside a word where it wraps.
- `shift+u` redoes.
- `ctrl+v` and `ctrl+x` are paste and cut, beside `ctrl+c`'s copy. So there is no block selection and no decrement.
- There is one register, and no named ones. There are no macros (`q` closes the window).
- `n` always goes to the next match, and `shift+n` to the one before. That holds whichever of `/`, `*` or `#` started
  the search.
- `?` is help, not a search backwards.
- `/` typed with the cursor on a match stays on it.
- A count before `i`, `a` or `o` is ignored (`3 i x` types one x).
- A count before `g g` or `shift+g` is a line number.
- `$` in visual mode stops on the last character, so `v $ d` keeps the line break.
- `.` doesn't repeat a change made in visual mode by characters across several lines.
- `r` and `f` take a character typed, not `enter` or `tab`.
- The cursor stops on trailing spaces and on a tab. A tab is one stop, as wide as it is drawn.
- `<` on a line indented with a tab takes the tab away. It never turns it into spaces.
- Each CJK character is a word for `w`, `b` and `e`. `i w`, `*` and `#` take the whole run of them.
- `:s` takes the ranges `%` and `'<,'>`, not line numbers.
- A note without a last line break gets one when a line is added after its last.

## Saving

A note you have changed is **unsaved** until you save it. The status line says `• unsaved` by its path, and its tab
has a `•`.

| To | Press |
| --- | --- |
| Save this note | `ctrl+s`, `space n w` or `:w` |
| Save every unsaved note, open in a tab or not | `space n shift+w` or `:wa` |
| Save every unsaved note, then quit | `:wq`, `:x`, `:wqa` or `:xa` |

If you quit (`ctrl+q`, or `:q` on the last window) with unsaved changes, slipbox refuses. The message names the notes.
`:q!` quits anyway, throwing the changes away.

Closing a tab or a window doesn't lose anything. The note stays unsaved until you save it, or autosave does.

**Autosave.** A changed note is saved by itself after 30 seconds without a key pressed. `editor.autosave_ms` sets that
wait, in milliseconds. `0` turns autosave off.

- It waits while you are typing, and while git is in the middle of a commit.
- It never writes over a file that changed on disk. It asks instead ([below](#when-a-file-changes-on-disk)).
- It never saves conflict markers from a merge.

**What a save keeps.** A note is written whole and at once (a new file put in the old one's place). So a reader never
sees half of it.

Its byte order mark and its line endings are kept. A file with Windows line endings gets them on its new lines too.

A save also trims the ends of lines, and adds the last line break, where the file's `.editorconfig` asks for them
([Indentation](configuration.md#indentation-editorconfig)).

slipbox saves a note before your editor, the context bundle or an export reads it.

## When a file changes on disk

Another program can change a note you have open: an agent, git, your editor, a sync tool. slipbox notices.

- **A note without unsaved changes** reloads, keeping your place. The status line says `↻ reloaded`. The reload is an
  undo step, so `u` brings back what you had before.
- **A note with unsaved changes** opens the conflict prompt, since both versions matter. While you are typing, the
  prompt waits, and a message says the file changed. The prompt opens with the first key after you stop typing. So
  the letters you type never answer it.
- **A note deleted on disk** keeps showing its last text, marked `✖ deleted on disk`.

The conflict prompt offers four answers, each by its key:

- **(l) Load theirs:** the file as it is on disk. Yours is one `u` away.
- **(k) Keep yours:** your text stays, and the status line says `⚠ differs from disk`. `esc` on the prompt keeps yours
  too. Autosave leaves this note alone, and saving it asks first:
  - `y` writes yours over theirs
  - `n` leaves both as they are
  - `d` shows the differences
- **(d) Diff:** the changes from yours to theirs, line by line, the changed words marked
  ([Git](git.md#how-a-diff-is-drawn)). Closing it, or `enter`, goes back to the prompt.
- **(m) Merge:** both, against the version you started from. What only one side changed is taken. Where both changed
  the same lines, both are kept between `<<<<<<< yours`, `=======` and `>>>>>>> theirs`. The result is unsaved, and
  `:w` writes it. Autosave never saves conflict markers.

`space n c` opens the prompt again.

`:w` on a note whose file changed since you opened it opens the prompt instead of writing. `:w!` writes yours over it.

`:e!` throws your changes away and loads the file (`u` brings them back).

`space n r` (or `:reload`) reads the note from disk again.

- On a note with unsaved changes whose file hasn't changed, it asks first. `y` throws your changes away and loads the
  file (`u` brings them back). `n` or `esc` keeps them, and autosave goes on as before.
- When the file has changed too, it opens the conflict prompt.

**Working beside agents.** An agent using slipbox's command line reads the files on disk, never your unsaved text. So
that it knows, a running slipbox keeps a list of the notes you have unsaved. Every command warns about them:

`slipbox: warning: unsaved changes in a running slipbox: inbox.md`

[Working with agents](../guides/agents.md) has the rest.

## Tasks

Press `ctrl+l` to tick or untick the task at the cursor: `- [ ]` becomes `- [x]`, and back. `space n t` and a click on
the box do the same.

In a list of tasks inside tasks, it ticks the innermost one, from any of its rows.

It works in the rendered note, with no need to edit. It works in source mode and the lens too, on any line of the task.

- On a note without unsaved changes, the tick is written to the file at once. Only that character changes.
- On a note with unsaved changes, it changes the text on screen instead, as an undo step. The note stays unsaved, and
  the message says `done ✓ (unsaved)`.
- If the file changed on disk since you opened it, slipbox reloads it first, and you tick again.

From the command line, `slipbox task inbox.md` lists a note's tasks. `slipbox task inbox.md 12` ticks the one on line 12
([The command line](cli.md)).

## Completion

While you type, `ctrl+n` completes the word you are typing from the words in your open files. `ctrl+p` does the same,
looking backwards.

A list shows under the cursor. While it shows:

| Key | What it does |
| --- | --- |
| `ctrl+n` or `down` / `ctrl+p` or `up` | The next / previous item |
| `tab` or `enter` | Puts the chosen one in |
| `ctrl+e` | Closes the list, still typing |
| `esc` | Closes the list and stops typing |

In a note, typing a link's target (after `](` or `[[`) lists the notes and files it could reach. The one you pick is
written as the folder writes its links ([Links and vaults](links-and-vaults.md)).

In code, the language server offers its own completions. One that puts in a snippet leaves the cursor on the snippet's
first blank. `tab` and `shift+tab` go to the next and previous blank ([Code](code.md)).

## Spelling

Spelling is off until you ask. `space u s` turns it on or off. `spell.enabled = true` makes it on from the start.

With it on, slipbox marks the words of a note's prose that its dictionaries don't know. Code, addresses, tags, maths
and front matter aren't checked.

| Key | What it does |
| --- | --- |
| `] s` / `[ s` | Goes to the next / previous misspelt word, around the note's ends |
| `z =` | Shows the word's suggestions. `enter` puts one in its place. The last row adds the word to your words |
| `z g` | Adds the word to your words. It is marked no more, in any note |

A note is checked in the languages its front matter names (`lang: en-GB`, `lang: [tr, en]`). Without that, it is
checked in `spell.languages` (English by default).

slipbox uses Hunspell dictionaries, the ones LibreOffice and most systems have. It brings its own for English and
Turkish. The words you add count in every language.

The dictionaries load in the background the first time a note needs them, and slipbox answers your keys meanwhile.
The marks come once they're loaded, and a word you've just typed is marked a moment after you type it.

[Spelling dictionaries](configuration.md#spelling-dictionaries) says:

- where slipbox looks for a language's dictionary
- how to add yours
- where your words are kept

From the command line, `slipbox spell inbox.md` lists a note's misspelt words. Add `--suggest` for suggestions.
`slipbox spell --add <word>` adds one to your words.

## Problems as you write

slipbox can show what your Markdown linter finds in a note, where it is. It ships no rules of its own. It runs
markdownlint (markdownlint-cli2) with your configuration.

By default (`lint.enabled = "auto"`), it lints only where there is a markdownlint configuration:

- the folder's own
- yours, in `~/.markdownlint-cli2.jsonc`

`"on"` lints every note, and `"off"` none.

The linter reads the file. So a note is linted when it opens and just after each save, never while it is unsaved.
Typing hides its findings until the next save.

Each finding is a warning:

- counted on the status line
- its line number coloured
- listed in the Problems panel (`space n q`)

If markdownlint isn't installed, slipbox installs it into its own folder the first time it is needed. It doesn't if
`lsp.auto_install = false` ([Privacy](privacy.md)).

[Code](code.md) has the Problems panel, other linters and `lint.command`.

## Indentation and comments

A level of indentation is the file's own: a tab, or so many spaces. The file's `.editorconfig`, its own lines or its
language say which. [Indentation](configuration.md#indentation-editorconfig) has the order, and how to see what a file
uses.

These all indent by it:

- `tab` and `shift+tab` while typing
- `>` and `<`
- a new line after an opening bracket

`ctrl+/` comments out the cursor's line, or the selected lines, or brings them back in. In vim's way, `g c` with a
motion does it too.

A note's comments are HTML's: `<!--` and `-->`. A code file's are its language's.

## Footnotes and properties

`space n shift+f` adds a footnote at the cursor, asking its text. The footnotes view (`space n f`) edits, renames and
deletes them. [Footnotes](finding.md#footnotes) has both.

`space n shift+p` opens the note's properties, its front matter (YAML or TOML), in a floating editor. Every editing
key works there.

- `esc` (not typing), `q` or `:q` closes it.
- `ctrl+s` or `:w` keeps it open.

Either way, what you changed is written into the note and saved. A note without front matter gets some.

## Commands at the colon prompt

`:` opens the command line. vim's commands for editing work there as you would expect:

| Command | What it does |
| --- | --- |
| `:w`, `:write` | Save this note |
| `:w!` | Save over a file that changed on disk |
| `:wa`, `:wall` | Save every unsaved note |
| `:wq`, `:x`, `:wqa`, `:xa` | Save every unsaved note, then quit |
| `:q`, `:quit` | Close the window (the tab, with its last window). On the very last one, quit |
| `:q!` | Quit, throwing unsaved changes away |
| `:e!` | Reload the note from disk, dropping your changes (`u` brings them back) |
| `:source` / `:lens` | Source mode / the lens, on or off |
| `:42` | Go to line 42 |
| `:s/old/new/`, `:%s/old/new/g` | Substitute, on this line / in the whole note ([Finding things](finding.md)) |
| `:!cmd`, `:%!cmd` | Run a command / filter lines through one (next section) |
| `:new name`, `:mkdir name` | A new note / folder ([Files](files.md)) |
| `:rename path`, `:delete` | Rename or delete the note ([Files](files.md)) |
| `:trash` | The trash ([Files](files.md)) |

You can also type part of any command's name and pick it from the list ([The screen](screen.md)).

## Running a command and filtering lines

As in vim, `:!` runs a command by your shell (`$SHELL`), in the vault's top folder.

**Running.** `:!make` runs the command and shows what it prints, both streams. It shows them in a window titled with how
the command ended.

`enter` on a line that names a file and a line opens that file there. Such a line looks like `notes/inbox.md:12`, as
`grep -n` and compilers print them.

**The file's path.** `%` in the command is this file's path from the vault's top: `:!wc -w %`. `\%` is a percent sign.
The command also finds the vault's and the file's paths in `SLIPBOX_ROOT` and `SLIPBOX_FILE`.

**Filtering.** `:{range}!cmd` gives lines to the command, and puts what it prints in their place, as one undo step:

| Command | The lines it gives |
| --- | --- |
| `:%!sort` | The whole note |
| `:.!cmd` | The cursor's line |
| `:3,7!cmd` | Lines 3 to 7 |
| `:'<,'>!column -t` | The selected lines (`!` in visual mode types it for you) |

If the command fails, the lines stay as they were, and you see what it printed. The lines also stay as they were if
the text changed while the command ran.

One command runs at a time. "Stop the running command" in the palette (`:` then its name) ends it, and everything it
started. So does quitting.

A folder's own configuration can't bind keys to these. Only your own can.

## Handing a note to another editor

Two keys give the note to another editor, at the cursor's line. Both save the note first.

**`space n e`** steps aside for an editor in this terminal. slipbox hides, and the editor runs. When you quit it,
slipbox comes back, and reloads the note if it changed.

The editor is `editor.command`, else `$VISUAL`, else `$EDITOR`, else `vi`. The usual ones (vim, nvim, nano, emacs,
helix, micro and others) open at the line.

**`space n s`** sends the note to an editor already running elsewhere, such as nvim in another pane. It doesn't wait.

By default (`editor.remote = ["nvim"]`), slipbox finds the running nvims itself, any nvim 0.9 or later. It sends to:

- the one you picked before for this folder, while it still runs
- else the only one
- else it asks "Send to which nvim?", with the one working where the note lives first

`space n p` always asks. The editor's saves show up in slipbox as they land.

`editor.remote` can name other editors' commands instead. They run in order, with `{file}` and `{line}` filled in. For
example: `["code -g {file}:{line}"]`.

These two settings name programs to run. So only your own configuration can set them, never a folder's
([Configuration](configuration.md)).

From the command line, `slipbox send inbox.md --line 42` does what `space n s` does.

## The scratch

The scratch is a Markdown file where you collect references and snippets to hand to an agent. It holds lines of your
notes and code, each with its `path:line`. You paste it into a prompt when you are ready.

Each vault has its own scratch, kept in slipbox's own state folder. It is outside your notes, and never committed. With
`capture.location = "root"`, it is a note in the vault instead: `scratch.md`, or the name in `capture.file`.

| Key | What it does |
| --- | --- |
| `space s a` | Adds the selection with its lines (`ideas/coffee.md:12-18`), or the cursor row's `path:line` |
| `space s s` | Opens the scratch. It updates as things are added |
| `space s r` | Opens the scratch in the window on the right |
| `space s y` | Copies the whole scratch |
| `space s d` | Clears the scratch, after asking |
| `space s c` | Copies the note's context for an agent: the note, what it links to, what links to it |

The scratch opens in a window floating in the middle of the screen. Use it to jot something down, or to read what
you have gathered.

It's a window like any other. The scratch is rendered, the lens edits it, and `ctrl+k` shows its Markdown. Every key
you move and edit with works there.

- `q` closes it and takes you back where you were. What you typed is saved.
- `esc` stops typing and leaves the lens, as it always does. Then it closes the scratch.

It opens when it's empty too.

With `capture.open_in = "right"`, or Scratch opens in the [UI settings](screen.md#ui-settings), it opens in the window
on the right instead, beside your note. `ctrl+w w` goes back and forth.

Each time you add to it, it opens on what you added, ready for you to type a note about it:

````markdown
**At:** `ideas/coffee.md:5`

**Note:** check the ratio for the small pot

---

**At:** `ideas/coffee.md:3-5`

```markdown
## Brewing

A ratio of 1 to 16 suits a pour-over.
```

**Note:** ▌
````

`esc` then `q` takes you back to the note. If you close it without typing, the empty **Note:** goes. So you can add a
few places quickly and write one note at the last. A line divides each entry from the one before.

Other programs add to the scratch with `slipbox capture`. That is how your editor or an agent puts things there:

```bash
slipbox capture 'check the grind size'            # a line of text
slipbox capture --ref ideas/coffee.md:12-18       # a reference
slipbox capture --ref ideas/coffee.md:5 'check it'   # a reference, and a note on it
slipbox capture --snippet --ref ideas/coffee.md:12-18   # the reference and its lines
slipbox scratch show                              # what it holds; also: path, copy, clear
```

[Working with agents](../guides/agents.md) shows how to capture from nvim, and the context bundle.

## From the command line

The command line changes notes the way slipbox saves them:

- whole and at once
- inside the vault
- keeping their line endings

The commands for editing:

| Command | What it does |
| --- | --- |
| `slipbox read inbox.md` | Shows a note's text, and its `sha` (a fingerprint of its bytes) |
| `slipbox write inbox.md 'text'` | Replaces its text (`--stdin` to read it, `--append` to add to its end) |
| `slipbox replace inbox.md old new` | Replaces text in it (`--dry-run` shows what would change) |
| `slipbox task inbox.md 12` | Ticks or unticks the task on line 12 |
| `slipbox spell inbox.md` | Lists its misspelt words |
| `slipbox send inbox.md --line 12` | Opens it in your running editor |
| `slipbox capture`, `slipbox scratch` | Add to the scratch / show, copy or clear it |

`--if-unchanged <sha>` on `write`, `replace` and `task` refuses to write if the note changed since you read it.

[The command line](cli.md) has every command and flag.
