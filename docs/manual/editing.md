# Editing

slipbox edits the Markdown itself: what you change is the text of the file, and nothing else. You can see a whole note
as Markdown while you edit it (source mode), or only the part you are working on, with the rest of the note still
rendered around it (the lens). This chapter covers both; the keys for typing and changing text; saving; what happens
when someone else changes a file you are editing; and the tools around writing: tasks, completion, spelling, your
linter's findings, commands from your shell, your own editor, and the scratch. Making, renaming, moving and deleting
files is in [Files](files.md).

You don't need to know vim. Everything in the first section works with the arrow keys, `ctrl+s` and the mouse. vim's
keys are there too, for those who want them: [The vim keys](#the-vim-keys) explains them.

## Editing without vim

While you edit, slipbox is in one of two states: typing, or not typing. While you type, keys put text in. While you
don't, keys are commands: `j` moves down, `u` undoes, and so on. Three keys are all you need to go between the two:

- `i` starts typing at the cursor. On a rendered note, it first shows the note as its Markdown (source mode), so you
  type into the text as it is written.
- `esc` stops typing. Your keys are commands again.
- `ctrl+s` saves, typing or not.

The status line's chip, at its left, says where you are: `INSERT` while you type, `SOURCE` in source mode, `LENS` in
the lens.

| To | Press |
| --- | --- |
| start typing at the cursor | `i` (or `a` to type after it, `o` to type on a new line below) |
| move the cursor | the arrow keys, `home`, `end`, `pageup`, `pagedown`, or a click |
| move by word | `ctrl+left` / `ctrl+right` (on a Mac, `alt+left` / `alt+right`: `alt` is option) |
| delete | `backspace` or `delete` |
| start a new line | `enter`: a list goes on with its next item |
| stop typing | `esc` |
| save | `ctrl+s` |
| undo / redo | `ctrl+z` / `ctrl+y` |
| select | `shift` with a key that moves (`ctrl+shift+left` by word), or drag with the mouse |
| replace the selection | type, or paste; `backspace` or `delete` deletes it |
| copy / cut / paste | `ctrl+c` / `ctrl+x` / `ctrl+v` |
| see the note rendered again | `ctrl+k` |

A few things work differently from a desktop editor:

- **A click ends typing.** The cursor goes where you clicked; press `i` to type there. A drag selects, and ends
  typing too: `ctrl+x` cuts what it selected, `ctrl+v` pastes over it, and `c` types in its place.
- **`ctrl+c` with nothing selected stops typing**, as `esc` does. With a selection, it copies it.
- **`ctrl+x` with nothing selected** cuts the cursor's line, when you are not typing.
- **`ctrl+v`** pastes at the cursor while you type, over the selection if there is one. When you are not typing, it
  pastes after the cursor (a copied line goes under the cursor's line), or over the selection.
- **Unsaved changes are saved for you** after 30 seconds without a key pressed ([Saving](#saving)).

## Source mode and the lens

### Source mode

`ctrl+k` (or `space n v`, or `:source`) shows the window's note as its Markdown; press it again to see it rendered.
The chip reads `SOURCE`, and the cursor stays on its line across the switch. Everything else works as in the rendered
note: find, selecting and copying, the mouse, wrapping, line numbers, the outline and the breadcrumb. The Markdown is
lightly highlighted: front matter, headings, lists and task boxes, quotes, code and links.

### The lens

The lens edits a note in place. `space n l` (or `:lens`) opens it: the blocks around the cursor (a paragraph, a
heading, a table, a code block, a list item) are shown as their Markdown between two heavy rules, and the rest of the
note stays rendered above and below. Where you are looking is Markdown; nothing is half rendered.

- **Its label.** The top rule says which lines it holds: `source · lines 12–18` while you look, and
  `editing · lines 12–18` while you type, when the rules and the rows' tint turn green.
- **Its keys.** Not typing, the keys work on the text in the lens (vim's commands too). `esc` closes it, and the
  whole note renders again.
- **Moving.** The cursor stays in the lens. Moving past its edge moves the lens with you: onto the next section when
  that fits, or a block at a time. A jump (`g g`, a search, a heading picked in the outline) moves it to where you
  land. The lens keeps its place on the screen, and the page scrolls under it. A click in the rendered text outside
  it moves it there; the mouse wheel scrolls the page, the lens riding with its text. While you type, the arrow keys
  stop at its rules.
- **Its size.** It opens on the section the cursor is in (the heading and everything under it) when that fits in
  half the window (`editor.lens_max`); otherwise on the cursor's block and its neighbours, until it holds at least six
  rows of Markdown (`editor.lens_min_rows`). `+` takes the next block in, `-` drops the block farthest from the
  cursor, and the lens keeps that size as it moves; `=` lets it size itself again. A block taller than the lens
  scrolls inside it, the rows out of sight counted on its rules (`↑ 21 lines`).
- **Its counters.** A narrow column before its rows counts each row's distance from the cursor's (`0` on the
  cursor's row), so vim's counts (`5 j`, `d 3 k`) can be read off it. The gutter keeps the lines' own numbers.
  `ui.relative_numbers = "off"` hides the column.

The lens follows you to another note: following a link from it, or going back with `ctrl+o`, opens the lens on the
note you land on.

### Which one an editing key opens

On a rendered note, an editing key (`i`, `a`, `o` and their capitals) opens the way `editor.edit_in` says
([Configuration](configuration.md)):

- `"source"`, the default: the window switches to source mode, and the key edits at once.
- `"live"`: the first press opens the lens on the cursor's block, and the second edits. `esc` `esc` leaves the way you
  came: the first stops typing, the second closes the lens.

Either way, `ctrl+k` and `space n l` open the other one.

### Files beyond notes

Data files (JSON, YAML, TOML, INI, CSV and the like) open rendered, and the lens edits one card at a time: a key and
the values under it, or a few rows of a table. A data file that stops parsing while you edit it switches to source
mode when you stop typing, and `space n v` renders it again once it parses. Other text files open in source mode,
since they have no rendered view; code has a view of its own ([Code](code.md)). [Reading](reading.md) says how each
kind of file is shown.

Two kinds of file can't be edited: one that isn't valid UTF-8 (slipbox would change bytes it can't show you), and a
note deleted on disk, which keeps showing its last text, marked `✖ deleted on disk`.

## Typing

While you type, the chip reads `INSERT` and most keys put text in. These don't:

| Key | What it does |
| --- | --- |
| `enter` | a new line, indented as this one; a list goes on: the same bullet, the next number, an empty task box |
| `enter` on an empty list item | ends the list: the item's marker goes |
| `tab` / `shift+tab` | indents / outdents the line a level ([Indentation](#indentation-and-comments)) |
| `backspace` / `delete` | deletes the character before / after the cursor; at a line's edge, joins two lines |
| `ctrl+w` | deletes the word before the cursor |
| `ctrl+u` | deletes what you typed on this line, then the rest of the line before the cursor |
| the arrow keys, `home`, `end` | move |
| `pageup` / `pagedown` | a page up / down, the note scrolling with the cursor; in the lens, as far as its edge |
| `ctrl+left` / `ctrl+right` | move by word (also `alt+left` / `alt+right`, and `alt+b` / `alt+f`) |
| `cmd+left` / `cmd+right` | to the line's start / end (also `ctrl+a` / `ctrl+e`, what a Mac terminal sends) |
| `cmd+up` / `cmd+down` | to the note's start / end, where the terminal passes `cmd` (also `ctrl+home` / `ctrl+end`) |
| `shift` with any of these moves | selects ([below](#selecting-while-you-type)) |
| `ctrl+z` / `ctrl+y` | undoes / redoes, and you go on typing |
| `ctrl+v` | pastes the clipboard |
| `ctrl+/` | comments the line out, or back in |
| `ctrl+n` / `ctrl+p` | completes the word ([Completion](#completion)) |
| `ctrl+s` | saves |
| `esc`, or `ctrl+c` with nothing selected | stops typing; the cursor steps back onto the last character typed |

Your terminal's own paste (`cmd+v`, `ctrl+shift+v`) types the text it pastes. In code, `enter` after an opening
bracket, or after Python's or YAML's `:`, goes a level in.

**Closing pairs.** With `editor.auto_pairs = true`, typing `(`, `[`, `{` or a quote types its closing half too;
typing the closing one where it already is steps over it, and `backspace` between an empty pair deletes both. It is
off by default.

**Moving lines.** Not typing, `alt+shift+up` / `alt+shift+down` move the cursor's line (or the lines selected with
`shift+v`) up or down past the next one, as one undo step.

### Selecting while you type

`shift` with a key that moves selects, from where the cursor was, as in a desktop editor: `shift+left` and
`shift+right` a character, `shift+up` and `shift+down` a row, `ctrl+shift+left` and `ctrl+shift+right` a word,
`shift+home` and `shift+end` to the line's start and end, `shift+pageup` and `shift+pagedown` a page. Then:

- typing, `enter` or a paste replaces the selection;
- `backspace` or `delete` deletes it (so do `ctrl+w` and `ctrl+u`);
- `ctrl+c` copies it, and `ctrl+x` cuts it;
- `left` and `right` go to its start and end;
- any other key lets it go, and does what it does. `esc` stops typing, and the selection goes with it.

What a selection replaces or deletes isn't copied, so `ctrl+v` over it puts what you copied before.

## Undo, redo and the clipboard

Not typing, `u` or `ctrl+z` undoes, and `ctrl+r`, `ctrl+y` or `shift+u` redoes; while you type, `ctrl+z` and `ctrl+y`
do, and you go on typing. Everything you type between `i` and `esc` is one step, or up to an undo while you type.
Undo back to the text as it was saved, and the note has no unsaved changes again. A reload from disk is a step too:
when an agent rewrites a note you have open, `u` brings back what was there before.

`g ;` and `g ,` go back and forth through the places you changed; `g i` starts typing again where you last stopped.

You select and copy the same way in a rendered note, in source mode and in the lens. Cutting and pasting change the
text, so they work on the Markdown.

**Selecting.** `shift` with an arrow key (or `ctrl+shift` with one, by word or paragraph) extends a selection; so does
dragging with the mouse. A double click selects a word, a triple click the row. `v` and `shift+v` start selecting by
character or by whole rows ([The vim keys](#the-vim-keys)). `esc` clears the selection. In source mode and the lens,
a selection made with `shift` or a drag is visual mode's: `d` or `x` deletes it, `c` types in its place, and any move
extends it. While you type, `shift` selects as a desktop editor does ([Selecting while you
type](#selecting-while-you-type)).

**Copying.** `ctrl+c` copies the selection; `y y` copies the selection, or the cursor's row when nothing is selected,
and `y` alone copies it in visual mode. A drag with the mouse, and a double or triple click, copy what they select. In
a rendered note you copy the text as you see it on the page, not the Markdown under it. Three more copies are about
the note rather than its text, while you read: `y p` copies its full path, `y r` its path and the cursor's line
(`ideas/coffee.md:18`), and `y l` the target of the link under the cursor.

**Cutting and pasting.** `ctrl+x` cuts the selection, or the cursor's line when nothing is selected, and `ctrl+v`
pastes: after the cursor (a copied line under the cursor's line), or over the selection. On a rendered note, with
nothing selected, they first switch the window to editing, as `editor.edit_in` says; a selection made on the rendered
page can be copied, but cutting it or pasting over it needs source mode or the lens. Your terminal's own paste
(`ctrl+shift+v`, `cmd+v`) types the text while you type, and otherwise puts it as `ctrl+v` does.

**The clipboard.** Every copy and cut goes to your system clipboard, and so does every delete in source mode, as in vim
with `clipboard=unnamedplus`. slipbox copies two ways at once: through the terminal, which also works over SSH, and
through your system's tool: `pbcopy` on a Mac, `clip.exe` in WSL, else `wl-copy`, `xclip` or `xsel`. A paste reads the
clipboard back (`pbpaste`, `wl-paste`, `xclip`, `xsel`, or PowerShell in WSL); where it can't be read (over SSH, say),
slipbox pastes what it last copied or cut itself. [Troubleshooting](troubleshooting.md#copying-over-ssh) has the
clipboard's problems.

## The vim keys

If you know vim, you know most of this already: not typing is vim's normal mode, typing is its insert mode, and `v`
and `shift+v` are its visual mode, by characters and by whole rows. The chip shows the mode (`INSERT`, `VISUAL`) and
what is waiting for its next key (`2d`, `di`). The operators and the other keys below are source mode's and the
lens's: in a rendered note, `i`, `a`, `o` and their capitals switch to editing first, and `d`, `c`, `x` or `p` do
nothing.

- **Operators** wait for a motion or a text object, and act on what it covers: `d` deletes, `c` changes (deletes,
  then types), `y` yanks (copies), `>` and `<` indent and outdent, `g c` comments out or back in. Doubled, they take
  the whole line: `d d`, `c c`, `y y`, `> >`, `< <`, `g c c`.
- **Motions** are the keys that move the cursor: `w`, `b`, `e`, `0`, `^`, `$`, `j`, `k`, `g g`, `shift+g`, `{`, `}`,
  `%`, `f`, `t` and the rest. A search is one too: `d`, then `/`, the text and `enter`, deletes up to the match.
- **Text objects** follow `i` (inside) or `a` (around): a word, text in quotes or brackets, a paragraph. `d i w`
  deletes a word, `c i "` changes what is in quotes, `y a p` copies a paragraph.
- **Counts** go before the command, the motion or the object: `3 d d`, `d 2 w`, `5 j`.
- **`.`** repeats the last change, the text typed with it included. After `c g n` (change the search's next match),
  type the new text and `esc`; then each `.` changes the next match.
- **The register** is one: the text last deleted, changed or yanked. A yank and every delete also go to the system
  clipboard, as in vim with `clipboard=unnamedplus`, and `p` puts what the clipboard holds.
- **Undo** is `u`, as in vim; redo is `ctrl+r`, and `shift+u` too.
- **Visual mode**: movement extends the selection; then `d` deletes it, `c` changes it, `y` copies it, `>` and `<`
  indent it, `g c` comments it, `o` jumps to its other end, and `i` or `a` with an object selects that object
  (`v i w`). `:` types `'<,'>` for a command on its lines, and `!` types `:'<,'>!` to filter them through a command.
  A selection made with `shift` and a move, or with a drag, starts it too.

[Keys](keys.md) lists every key, and they can be changed: source mode's are `[keys.source]` in your configuration,
visual mode's `[keys.visual]` ([Configuration](configuration.md)).

### Where it isn't vim

- Motions move by the rows you see. On a long line wrapped across several rows, `0`, `$`, `j` and `k` (and `d $`,
  `d j`) work on the row, while `shift+d`, `shift+c`, `shift+a`, `shift+i`, `d d` and `c c` take the whole line. A
  word motion never stops inside a word where it wraps.
- `shift+u` redoes. `ctrl+v` and `ctrl+x` are paste and cut, beside `ctrl+c`'s copy: there is no block selection and
  no decrement.
- One register, no named ones, and no macros (`q` closes the window).
- `n` always goes to the next match and `shift+n` to the one before, whichever of `/`, `*` or `#` started the search.
  `?` is help, not a search backwards. `/` typed with the cursor on a match stays on it.
- A count before `i`, `a` or `o` is ignored (`3 i x` types one x). A count before `g g` or `shift+g` is a line number.
- `$` in visual mode stops on the last character, so `v $ d` keeps the line break. `.` doesn't repeat a change made
  in visual mode by characters across several lines.
- `r` and `f` take a character typed, not `enter` or `tab`. The cursor stops on trailing spaces and on a tab (one
  stop, as wide as it is drawn). `<` on a line indented with a tab takes the tab away, never turning it into spaces.
- Each CJK character is a word for `w`, `b` and `e`, while `i w`, `*` and `#` take the whole run of them.
- `:s` takes the ranges `%` and `'<,'>`, not line numbers.
- A note without a last line break gets one when a line is added after its last.

## Saving

A note you have changed is **unsaved** until you save it: the status line says `• unsaved` by its path, and its tab
has a `•`. To save:

- `ctrl+s`, `space n w` or `:w` saves this note.
- `space n shift+w` or `:wa` saves every unsaved note, open in a tab or not.
- `:wq`, `:x`, `:wqa` and `:xa` save every unsaved note, then quit.

Quitting (`ctrl+q`, `:q` on the last window) with unsaved changes is refused, and the message names the notes. `:q!`
quits anyway, throwing the changes away. Closing a tab or a window doesn't lose anything: the note stays unsaved
until you save it, or autosave does.

**Autosave.** A changed note is saved by itself after 30 seconds without a key pressed (`editor.autosave_ms`, in
milliseconds; `0` turns it off). It waits while you are typing, and while git is in the middle of a commit. It never
writes over a file that changed on disk (it asks instead, below), and never saves conflict markers from a merge.

**What a save keeps.** A note is written whole and at once (a new file put in the old one's place), so a reader never
sees half of it. Its byte order mark and its line endings are kept: a file with Windows line endings gets them on its
new lines too. A save also trims the ends of lines and adds the last line break where the file's `.editorconfig` asks
for them ([Indentation](configuration.md#indentation-editorconfig)).

Before your editor, the context bundle or an export reads a note, slipbox saves it.

## When a file changes on disk

Another program can change a note you have open: an agent, git, your editor, a sync tool. slipbox notices.

- **A note without unsaved changes** reloads, keeping your place, and the status line says `↻ reloaded`. The reload
  is an undo step, so `u` brings back what you had before.
- **A note with unsaved changes** opens the conflict prompt, since both versions matter. While you are typing, it
  waits: a message says the file changed, and the prompt opens with the first key after you stop typing, so the
  letters you type never answer it.
- **A note deleted on disk** keeps showing its last text, marked `✖ deleted on disk`.

The conflict prompt offers four answers, each by its key:

- **(l) Load theirs:** the file as it is on disk. Yours is one `u` away.
- **(k) Keep yours:** your text stays, and the status line says `⚠ differs from disk`. Autosave leaves this note
  alone, and saving it asks first: `y` writes yours over theirs, `n` leaves both as they are, `d` shows the
  differences. `esc` on the prompt keeps yours too.
- **(d) Diff:** the changes from yours to theirs, line by line. Closing it goes back to the prompt.
- **(m) Merge:** both, against the version you started from. What only one side changed is taken; where both changed
  the same lines, both are kept between `<<<<<<< yours`, `=======` and `>>>>>>> theirs`. The result is unsaved, and
  `:w` writes it. Autosave never saves conflict markers.

`space n c` opens the prompt again. `:w` on a note whose file changed since you opened it opens the prompt instead of
writing; `:w!` writes yours over it. `:e!` throws your changes away and loads the file (`u` brings them back).

`space n r` (or `:reload`) reads the note from disk again. On a note with unsaved changes whose file hasn't changed,
it asks first: `y` throws your changes away and loads the file (`u` brings them back), `n` or `esc` keeps them, and
autosave goes on as before. When the file has changed too, it opens the conflict prompt.

**Working beside agents.** An agent using slipbox's command line reads the files on disk, never your unsaved text. So
that it knows, a running slipbox keeps a list of the notes you have unsaved, and every command warns about them:
`slipbox: warning: unsaved changes in a running slipbox: inbox.md`. [Working with agents](../guides/agents.md) has
the rest.

## Tasks

`ctrl+l` (or `space n t`, or a click on the box) ticks or unticks the task at the cursor: `- [ ]` becomes `- [x]`,
and back. In a list of tasks inside tasks, it is the innermost one, from any of its rows. It works in the rendered
note, with no need to edit.

On a note without unsaved changes, the tick is written to the file at once, and only that character changes. On a
note with unsaved changes, it changes the text on screen instead, as an undo step, and the note stays unsaved (the
message says `done ✓ (unsaved)`). If the file changed on disk since you opened it, slipbox reloads it first, and you
tick again.

From the command line, `slipbox task inbox.md` lists a note's tasks and `slipbox task inbox.md 12` ticks the one on
line 12 ([The command line](cli.md)).

## Completion

While you type, `ctrl+n` completes the word you are typing from the words in your open files (`ctrl+p` the same,
looking backwards). A list shows under the cursor; while it shows:

| Key | What it does |
| --- | --- |
| `ctrl+n` or `down` / `ctrl+p` or `up` | the next / previous item |
| `tab` or `enter` | puts the chosen one in |
| `ctrl+e` | closes the list, still typing |
| `esc` | closes the list and stops typing |

In a note, typing a link's target (after `](` or `[[`) lists the notes and files it could reach, and the one you
pick is written as the folder writes its links ([Links and roots](links-and-roots.md)). In code, the language server
offers its own completions; one that puts in a snippet leaves the cursor on the snippet's first blank, `tab` and
`shift+tab` going to the next and previous ([Code](code.md)).

## Spelling

Spelling is off until you ask: `space u s` turns it on or off, and `spell.enabled = true` makes it on from the start.
With it on, the words of a note's prose that its dictionaries don't know are marked (code, addresses, tags, maths and
front matter aren't checked).

| Key | What it does |
| --- | --- |
| `] s` / `[ s` | the next / previous misspelt word, around the note's ends |
| `z =` | the word's suggestions: `enter` puts one in its place; the last row adds the word to your words |
| `z g` | adds the word to your words: it is marked no more, in any note |

A note is checked in the languages its front matter names (`lang: en-GB`, `lang: [tr, en]`), else in
`spell.languages` (English by default). slipbox uses Hunspell dictionaries, the ones LibreOffice and most systems
have, and brings its own for English and Turkish; the words you add count in every language.
[Spelling dictionaries](configuration.md#spelling-dictionaries) says where slipbox looks for a language's dictionary,
how to add yours, and where your words are kept.

From the command line, `slipbox spell inbox.md` lists a note's misspelt words, `--suggest` with suggestions, and
`slipbox spell --add <word>` adds one to your words.

## Problems as you write

slipbox can show what your Markdown linter finds in a note, where it is. It ships no rules of its own: it runs
markdownlint (markdownlint-cli2) with your configuration. By default (`lint.enabled = "auto"`) it does so only where
there is one: the folder's own markdownlint configuration, or yours in `~/.markdownlint-cli2.jsonc`. `"on"` lints
every note, and `"off"` none.

The linter reads the file, so a note is linted when it opens and just after each save, never while it is unsaved:
typing hides its findings until the next save. Each finding is a warning: counted on the status line, its line
number coloured, and listed in the Problems panel (`space n q`). If markdownlint isn't installed, slipbox installs it
into its own folder the first time it is needed, unless `lsp.auto_install = false` ([Privacy](privacy.md)).
[Code](code.md) has the Problems panel, other linters and `lint.command`.

## Indentation and comments

A level of indentation is the file's own: a tab, or so many spaces, as its `.editorconfig`, its own lines or its
language say ([Indentation](configuration.md#indentation-editorconfig) has the order, and how to see what a file
uses). `tab` and `shift+tab` while typing, `>` and `<`, and a new line after an opening bracket all indent by it.

`ctrl+/` comments out the cursor's line, or the selected lines (`g c` with a motion, in vim's way), or brings them
back in. A note's comments are HTML's: `<!--` and `-->`. A code file's are its language's.

## Footnotes and properties

`space n shift+f` adds a footnote at the cursor, asking its text, and the footnotes view (`space n f`) edits, renames
and deletes them: [Footnotes](finding.md#footnotes) has both.

`space n shift+p` opens the note's properties, its front matter (YAML or TOML), in a floating editor where every
editing key works. `esc` (not typing), `q` or `:q` closes it, and `ctrl+s` or `:w` keeps it open: either way, what
you changed is written into the note and saved. A note without front matter gets some.

## Commands at the colon prompt

`:` opens the command line, where vim's commands for editing work as you would expect:

| Command | What it does |
| --- | --- |
| `:w`, `:write` | save this note |
| `:w!` | save over a file that changed on disk |
| `:wa`, `:wall` | save every unsaved note |
| `:wq`, `:x`, `:wqa`, `:xa` | save every unsaved note, then quit |
| `:q`, `:quit` | close the window (the tab, with its last window); on the very last one, quit |
| `:q!` | quit, throwing unsaved changes away |
| `:e!` | reload the note from disk, dropping your changes (`u` brings them back) |
| `:source` / `:lens` | source mode / the lens, on or off |
| `:42` | go to line 42 |
| `:s/old/new/`, `:%s/old/new/g` | substitute, on this line / in the whole note ([Finding things](finding.md)) |
| `:!cmd`, `:%!cmd` | run a command; filter lines through one (next section) |
| `:new name`, `:mkdir name` | a new note / folder ([Files](files.md)) |
| `:rename path`, `:delete`, `:trash` | rename or delete the note; the trash ([Files](files.md)) |

You can also type part of any command's name and pick it from the list ([The screen](screen.md)).

## Running a command and filtering lines

As in vim, `:!` runs a command by your shell (`$SHELL`), in the root's folder:

- `:!make` runs it and shows what it prints, both streams, in a window titled with how it ended. `enter` on a line
  that names a file and a line (`notes/inbox.md:12`, as `grep -n` and compilers print them) opens that file there.
- `%` in the command is this file's path from the root (`\%` a percent sign): `:!wc -w %`. The command also finds
  the root's and the file's paths in `SLIPBOX_ROOT` and `SLIPBOX_FILE`.
- `:{range}!cmd` gives lines to the command and puts what it prints in their place, as one undo step: `:%!sort` the
  whole note, `:.!cmd` the cursor's line, `:3,7!cmd` lines 3 to 7, `:'<,'>!column -t` the selected lines (`!` in
  visual mode types it for you). If the command fails, the lines stay as they were and you see what it printed; so
  they do if the text changed while it ran.

One command runs at a time. "Stop the running command" in the palette (`:` then its name) ends it, and everything it
started; so does quitting. A folder's own configuration can't bind keys to these: only your own can.

## Handing a note to another editor

Two keys give the note to another editor, at the cursor's line. Both save it first.

- **`space n e`** steps aside for an editor in this terminal: slipbox hides, the editor runs, and when you quit it,
  slipbox comes back and reloads the note if it changed. The editor is `editor.command`, else `$VISUAL`, else
  `$EDITOR`, else `vi`; the usual ones (vim, nvim, nano, emacs, helix, micro and others) open at the line.
- **`space n s`** sends the note to an editor already running elsewhere, such as nvim in another pane, and doesn't
  wait. By default (`editor.remote = ["nvim"]`) slipbox finds the running nvims itself (any nvim 0.9 or later): the
  one you picked before for this folder while it still runs, else the only one, else it asks "Send to which nvim?",
  the one working where the note lives first. `space n p` always asks. Its saves show up in slipbox as they land.

`editor.remote` can name other editors' commands instead, run in order, with `{file}` and `{line}` filled in:
`["code -g {file}:{line}"]`. These two settings name programs to run, so only your own configuration can set them,
never a folder's ([Configuration](configuration.md)). From the command line, `slipbox send inbox.md --line 42` does
what `space n s` does.

## The scratch

The scratch is a Markdown file where you collect references and snippets to hand to an agent: lines of your notes
and code, each with its `path:line`, pasted into a prompt when you are ready. Each root has its own, kept in
slipbox's own state folder, outside your notes and never committed. With `capture.location = "root"` it is a note in
the root instead (`scratch.md`, or the name in `capture.file`).

| Key | What it does |
| --- | --- |
| `space s a` | adds the selection with its lines (`ideas/coffee.md:12-18`), or the cursor row's `path:line` |
| `space s s` | opens the scratch; it updates as things are added |
| `space s y` | copies the whole scratch |
| `space s d` | clears the scratch, after asking |
| `space s c` | copies the note's context for an agent: it, what it links to, what links to it |

Other programs add to it with `slipbox capture`, which is how your editor or an agent puts things there:

```bash
slipbox capture 'check the grind size'            # a line of text
slipbox capture --ref ideas/coffee.md:12-18       # a reference
slipbox capture --snippet --ref ideas/coffee.md:12-18   # the reference and its lines
slipbox scratch show                              # what it holds; also: path, copy, clear
```

[Working with agents](../guides/agents.md) shows how to capture from nvim, and the context bundle.

## From the command line

The command line changes notes the way slipbox saves them: whole and at once, inside the root, keeping their line
endings. The commands for editing:

| Command | What it does |
| --- | --- |
| `slipbox read inbox.md` | a note's text, and its `sha` (a fingerprint of its bytes) |
| `slipbox write inbox.md 'text'` | replaces its text (`--stdin` to read it; `--append` to add to its end) |
| `slipbox replace inbox.md old new` | replaces text in it (`--dry-run` shows what would change) |
| `slipbox task inbox.md 12` | ticks or unticks the task on line 12 |
| `slipbox spell inbox.md` | lists its misspelt words |
| `slipbox send inbox.md --line 12` | opens it in your running editor |
| `slipbox capture`, `slipbox scratch` | add to the scratch; show, copy or clear it |

`--if-unchanged <sha>` on `write`, `replace` and `task` refuses to write if the note changed since you read it.
[The command line](cli.md) has every command and flag.
