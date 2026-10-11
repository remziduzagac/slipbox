# Finding things

Every way to find something in slipbox: a note by its name, notes by the words in them, a word in the note you are
reading or in every note, a heading, a footnote, a place you have been, notes by their tags or their kind, and a command
by its name. Following links and backlinks, the other way to get around, is in [Links and roots](links-and-roots.md).

| To find | Keys |
| --- | --- |
| a note or file by its name | `ctrl+p`, `space f f` |
| notes by the words in them, ranked | `space f s` |
| text in this note | `ctrl+f`, `/` |
| text in every note, line by line | `ctrl+shift+f`, `space f g` |
| a heading in this note | `space o` (the outline), `space f o` |
| a footnote | `space n f` |
| where you were | `ctrl+o`, `space h h` |
| notes with a tag | `space f t` |
| notes of a kind, such as decision records | `space f d` |
| a command | `:`, `ctrl+shift+p`, `space f p`, `?` |

## A note by its name: the switcher

`ctrl+p` (`space f f`) opens the quick switcher: every note of the root, and the other files the explorer shows, with
the ones you opened lately first. The note you were on before this one is at the top, so `ctrl+p` then `enter` takes you
back to it. A note whose title differs from its file name shows the title beside its path.

Type to narrow the list. Each word you type must appear in a file's path or title as typed, its letters together, and
the words can come in any order: `cof bre` finds `ideas/coffee-brewing.md`. Case doesn't matter unless a word has a
capital letter. The best matches come first: a word in the file's name ranks over one in its folders, at the start of a
word over the middle, and shorter paths over longer ones. Every list and every pane's filter in slipbox matches the same
way.

Start with `#` to find a symbol instead: in a note, the root's headings; in a code file, its language server's symbols
(functions, classes), as it answers. `enter` opens the file there.

`:e <note>` opens a note by its name, its path, or a pointer, without the list; `:e` alone opens the switcher. From the
command line, `slipbox ls` lists the notes.

## Search

`space f s` (`:search`, or `:search coffee grinder` to start with words) ranks the root's notes and data files by the
words you type, as you type them. Each row shows the file, its line, the heading of the section the words are in, and
the line itself with the words marked; `+3` says three more sections of that file have some of the words. `enter` opens
the file at that line.

Search is for finding the notes about something. To find every place a word or a pattern occurs, use
[Find in every note](#find-in-every-note) instead.

### What you can type

| Typed | Finds files with |
| --- | --- |
| `coffee grinder` | every word, anywhere in the file |
| `"cold brew"` | the words together, in that order |
| `grind*` | a word starting so: `grind`, `grinder`, `grinding` |
| `-decaf` | not this word |
| `title:coffee` | the word in the title or an alias |
| `#coffee`, `tag:coffee` | the tag, or a tag nested under it |
| `path:ideas/` | a path starting so |

Words are whole words: `cat` doesn't find `catalogue`, but `cat*` does. Case and accents don't count: `cafe` finds
`Café`. A query of filters alone, `#coffee -draft`, lists the files that pass them.

A word in a note's title or aliases weighs the most, then its tags, its headings and its path, then its text. A note's
title is its front matter's `title`, else its first top-level heading, else its file's name. When no file has every
word, the files with some of them are listed, and the title says so.

### Where a hit opens

A hit opens at the section with the most of the words, on its first line with one of them. A file found by filters alone
(a tag, a path) opens at its top. A note with unsaved changes is searched as you see it, not as it is on disk.

### Across roots

Search starts with the root you are in. `ctrl+a` in the search list widens it to the folders this root links to, or that
link to it, their hits under a "linked folders" divider; again, to every root this machine knows; again, back to this
root. The list's title says which. A hit in another root is shown by its path (`~/code/website/README.md`), and `enter`
on it switches to that root, at the line. A worktree is left out, as its notes are copies of its main checkout's, even
when a note links into it.

`slipbox search` does the same from the command line: `--scope here` (the default), `linked` or `all`, and `--limit` for
the number of hits.

### The index

Search reads an index that slipbox keeps in its cache, outside your folder. The TUI builds it when it opens a root, in
the background (the first time, the list says "the folder is being indexed" and how far it has got), then keeps it up to
date as files change, whoever changes them. The command line brings it up to date before each search, and
`slipbox index` builds it on demand (`--rebuild` starts it again).

Until the index exists, search reads the files themselves and finds the same notes, more slowly; the list's title then
says "scanned". Your home folder or `/`, opened as a folder, is always read that way. `search.engine` chooses: `auto`
(the index once it is built), `index` (build it first), or `scan` (never keep one); see
[Configuration](configuration.md).

## Find in a note

`ctrl+f` or `/` (`space f /`) opens the find row at the top of the window. As you type, the cursor moves to the first
match after it, every match is highlighted, and the count shows at the row's right (`2/7`). `enter` keeps the search;
`esc` while typing drops it and puts the cursor back. Then:

- `n` goes to the next match and `shift+n` to the previous one, wherever the cursor has moved since; both wrap around
  the note, and say so.
- `alt+r` makes the query a regular expression (JavaScript's), `alt+w` matches whole words only. They are the `.*` and
  `ab` buttons in the row, and the window keeps them for its next search.
- `*` finds the whole word under the cursor forward, `#` backward.
- `esc` ends the search and clears the highlights; so does `:noh`.

The search is plain text by default, and smart about case: lower case matches either case, a capital only itself. In a
rendered note it matches the text as you see it, so `**bold**` is found by `bold`; in source mode, the Markdown. There
is no backward-search key, as `?` is help: search with `/`, then `shift+n`.

On the current row, `f` and `t` jump onto, or just before, the next character you type, and `shift+f` and `shift+t` the
previous one; `;` repeats the jump, `,` repeats it the other way.

To go to a line by its number: `ctrl+g` (`space f l`), or type `:42`.

### Find and replace

`ctrl+h` (`space f r`, or `tab` from the find row) adds a replace row under the find row. Replacing works on the
Markdown, so a rendered window switches to editing first: to source mode or the lens, as `editor.edit_in` says
([Configuration](configuration.md)).

- `enter` in the replace row replaces the match at the cursor and moves to the next.
- `alt+a` (or `alt+enter`) replaces every match, as one step that `u` undoes.
- `ctrl+n` and `ctrl+p` move between matches without replacing; `tab` and `shift+tab` move between the two rows.
- `alt+h` (the `⇄` button) opens or closes the replace row; `esc` closes both rows, keeping what you replaced.

With regular expressions on, the replacement can use `$&` (the match), `$1` to `$9` (its groups) and `$$` (a dollar
sign). Opened on a selection within one line, the selection is what to find; on a selection across lines, replacing
stays within those lines.

### Vim's substitute

Vim's `:s` works too, typed at the `:` prompt: `:s/old/new/` on the cursor's line, `:%s/old/new/` on the whole note,
`:'<,'>s/old/new/` on the lines of the last selection (pressing `:` with a selection types `'<,'>` for you).

- Flags: `g` replaces every match on a line (without it, only the first); `i` ignores case; `c` asks at each match,
  `replace? y n a q`, in the window's find rows.
- The pattern is a JavaScript regular expression. Any punctuation can stand for `/` (`:s#a/b#c#`), and `\` escapes it.
- In the replacement, `\1` to `\9` are groups, `&` the match and `\&` a plain `&`.
- `^` and `$` are a line's start and end, and a match of nothing inserts there: `:%s/^/> /` quotes every line.

A substitute is one undo step, and works on the Markdown, as replacing does. From the command line,
`slipbox replace <note> <old> <new>` replaces in one note, with `--dry-run` to see each change first.

## Find in every note

`ctrl+shift+f` (`space f g`) asks what to find, then lists every line, in every note and every file the explorer shows,
that has it: `ideas/coffee.md:12` and the line. `enter` opens the file at that line. A note you have open is searched as
it is now, unsaved changes and all. The window's find settings apply, and `alt+r` and `alt+w` switch them as you type;
the question says which are on. The list stops at the first 1,000 lines.

From the command line, `slipbox find <text>` does the same (`--regex`, `--whole`, `--ignore-case`; `--files` for files
other than notes), and `slipbox find <text> <note>` searches one note.

### Replace in every note

`ctrl+shift+h` (`space f shift+r`) asks what to find (the window's find, or text selected on one line, typed already),
then what to replace it with, then shows a preview: every line it would change, in every note and every file the
explorer shows. `enter` does it; `esc` leaves everything as it was. A match that spans lines is one row, its line breaks
shown as `⏎`.

It is refused while a file with a match has unsaved changes, since what you see isn't what is on disk. `space v shift+u`
takes it back, as it takes back a rename. From the command line: `slipbox replace --all <old> <new>`, with `--dry-run`
for the preview and `slipbox undo` to take it back.

## The outline

`space o` opens the outline on the right, the note's headings indented by level, and puts the focus in it. Pressed while
the outline has the focus, it closes it; pressed from the note while the outline is open, it focuses it. The `▤` button
shows or hides it.

While you read, the outline follows the cursor, its selection on the section you are in. Inside it:

- `j` and `k` move, `enter` (or a click) jumps to the heading, and the note takes the focus;
- `h` and `l` fold and unfold a heading's subheadings;
- `/` filters the headings, keeping their parents; `esc` clears the filter;
- `r` renames the selected heading, and every link to it, after a preview;
- `q` closes the outline, and `esc` goes back to the note.

Without opening a pane, `space f o` lists the note's headings to pick one, and `space f b` lists the headings the cursor
is under, as the breadcrumb at the top of the window shows them. `[ [` and `] ]` move to the previous and next heading
([Reading](reading.md) has the keys that move through a note). From the command line, `slipbox outline <note>` lists a
note's headings with their lines.

## Footnotes

`space n f` opens the footnotes view in the right panel (`:footnotes`, or its button under the outline's): the note's
footnotes in the order the note first refers to them, then any it never refers to. Each shows its label and text, and at
the right how many references it has (`2×`), `unused`, or `no definition`. While you read, it follows the cursor to the
footnote the cursor's line refers to or defines.

- `j` and `k` move; `enter` (or a click) jumps to the footnote's definition;
- `l` unfolds a footnote into its references, each with its line, and `enter` on one jumps there; `h` folds it again;
- `/` filters by label and text; `q` closes the view; `esc` goes back to the note.

The view changes footnotes too:

- `a` adds one at the note's cursor, as `space n shift+f` does from anywhere: it asks for the footnote's text, then
  writes a reference such as `[^1]` after the word the cursor is on, and its definition, `[^1]: text`, at the note's
  end;
- `e` edits the selected footnote's text, `r` renames its label in every reference, and `d` deletes it, its references
  too, after asking.

Each change is saved at once, as one undo step. From the command line, `slipbox footnotes <note>` lists them, and
`add`, `edit`, `rename` and `rm` after it change them ([The command line](cli.md#footnotes)).

## History

### Back and forward

Following a link, jumping to a heading, opening a note: each leaves a place to come back to. `ctrl+o` (`space h p`) goes
back, and `space h n` goes forward again. (Vim's forward key, `ctrl+i`, reaches slipbox as `tab`, which moves to the
next link.) Each window has its own history, kept between sessions, and going back from the first place you visited in a
root returns to the root before.

The status line works like a browser's address bar: `‹` and `›` around the note's path go back and forward with the
mouse, each bright when there is somewhere to go, and hovering one says where. A click on the path lists the window's
places, with Copy path at the top, to jump to any of them.

### The history list

`space h h` opens the history in the left panel, focused (pressed again, it closes it, as `space o` does the outline).
It lists the window's places, newest first, the current one marked `here`; `enter` jumps to one, the places before it
becoming back and the places after it forward. Under them, "recent here" lists the notes you read in other windows and
tabs and in earlier sessions, newest first, each with when, or the tab it is open in; `enter` opens one in this window.
`ui.history_limit` says how many it lists (100 by default; 0 lists none; see [Configuration](configuration.md)).

Inside, `j` and `k` move, `/` filters by path, `q` closes the panel, and `esc` goes back to the note. Every note also
reopens where you left it; [The screen](screen.md) has what slipbox keeps between sessions. From the command line,
`slipbox history` lists the notes read lately and what is open.

## Tags

`space f t` (`:tags`) lists the root's tags, each with how many notes carry it, a nested tag indented under its parent.
Pick one to list its notes, a parent's including those of the tags under it; `enter` opens one. `:tag coffee` goes
straight to a tag's notes.

To find notes by a tag and words at once, search for both: `#coffee grinder`. Following a tag in a note lists its notes
too. What counts as a tag is in [Links and roots](links-and-roots.md#tags). From the command line: `slipbox tags`, and
`slipbox tags coffee` for a tag's notes.

## Document types

Some notes are of a kind, known by where they are, and slipbox can list them in order. Two kinds are built in:

| Type | Its notes | Ordered by |
| --- | --- | --- |
| `adr` | a note in a folder named `adr`, `adrs`, `decisions` or `decision-records` | the number in its file's name |
| `skill` | an agent skill's `SKILL.md` | the path |

`space f d` (`:types`) lists the types the root has, each with how many notes are of it. Pick one (or type `:type adr`)
to list its notes in order: each with its number, its title, its status, and what supersedes it. `] t` and `[ t` open
the next and previous note of the type of the one you are reading, and say where it is: `adr 2 of 5`, and its status.

A note's status is its front matter's `status`, else a `Status:` line, else the first line of a `## Status` section. A
status that reads "Superseded by …" names the note that supersedes it, by a link or by its number.

You can define your own types, or change the built-in ones, in a `[types.<name>]` table of your config or a folder's:
which paths, the order, the status key, and the front matter each note must have. [Configuration](configuration.md) has
the keys; a note breaking its type's rules shows it among its problems ([Code](code.md)). From the command line,
`slipbox types` lists the types and `slipbox types adr` a type's notes in order.

## A command by its name: the palette

`:` opens the command palette (also `ctrl+shift+p`, `space f p`, or a click on the `slipbox` chip in the top bar): type
part of a command's name, and `enter` runs it. `?` (`space ?`) opens help, every command with all its keys, and after
`space` the which-key popup lists the keys that can come next. [The command palette](screen.md#the-command-palette),
[Help](screen.md#help) and [The which-key popup](screen.md#the-which-key-popup) describe them, and [Keys](keys.md)
lists every key.
