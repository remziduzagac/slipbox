# Finding things

This chapter covers every way to find something in slipbox, from a note by its name to a command by its name.
Following links and backlinks, the other way to get around, is in [Links and vaults](links-and-vaults.md).

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

Press `ctrl+p` (or `space f f`) to open the quick switcher. It lists every note of the vault, and the other files the
explorer shows. The ones you opened lately come first.

The note you were on before this one is at the top. So `ctrl+p` then `enter` takes you back to it.

A note whose title differs from its file name shows the title beside its path.

Type to narrow the list. Each word you type must appear in a file's path or title as typed, its letters together. The
words can come in any order. For example, `cof bre` finds `ideas/coffee-brewing.md`.

Case doesn't matter unless a word has a capital letter.

The best matches come first:

- A word in the file's name ranks over one in its folders.
- A match at the start of a word ranks over one in the middle.
- Shorter paths rank over longer ones.

Every list and every pane's filter in slipbox matches the same way.

Start with `#` to find a symbol instead:

- In a note, the symbols are the vault's headings.
- In a code file, they're its language server's symbols (functions, classes), as the server answers.

`enter` opens the file there.

`:e <note>` opens a note by its name, its path or a pointer, without the list. `:e` alone opens the switcher.

From the command line, `slipbox ls` lists the notes.

## Search

Press `space f s` and type some words. Search ranks the vault's notes and data files by those words, as you type them.
You can also type `:search`, or `:search coffee grinder` to start with words.

Each row shows:

- the file
- its line
- the heading of the section the words are in
- the line itself, with the words marked

`+3` on a row says three more sections of that file have some of the words. `enter` opens the file at that line.

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

Words are whole words. `cat` doesn't find `catalogue`, but `cat*` does.

Case and accents don't count. `cafe` finds `Café`.

A query of filters alone, such as `#coffee -draft`, lists the files that pass them.

Where a word is found decides how much it weighs, from most to least:

1. the note's title or aliases
2. its tags, its headings and its path
3. its text

A note's title is its front matter's `title`. Without one, it's the note's first top-level heading, else its file's
name.

When no file has every word, the files with some of them are listed, and the list's title says so.

### Where a hit opens

A hit opens at the section with the most of the words, on the section's first line with one of them. A file found by
filters alone, such as a tag or a path, opens at its top.

A note with unsaved changes is searched as you see it, not as it is on disk.

### Across vaults

Search starts with the vault you are in. Press `ctrl+a` in the search list to widen it. Each press moves on:

1. to the folders this vault links to, or that link to it, their hits under a "linked folders" divider
2. to every vault this machine knows
3. back to this vault

The list's title says which.

A hit in another vault is shown by its path (`~/code/website/README.md`). `enter` on it switches to that vault, at the
line.

A worktree is left out, even when a note links into it. Its notes are copies of its main checkout's.

`slipbox search` does the same from the command line:

- `--scope here` (the default), `linked` or `all` says where it searches.
- `--limit` sets the number of hits.

### The index

Search reads an index that slipbox keeps in its cache, outside your folder.

- The TUI builds the index in the background when it opens a vault. The first time, the list says "the folder is being
  indexed" and how far it has got. Then the TUI keeps the index up to date as files change, whoever changes them.
- The command line brings the index up to date before each search.
- `slipbox index` builds the index on demand. `--rebuild` starts it again.

Until the index exists, search reads the files themselves. It finds the same notes, more slowly, and the list's title
says "scanned". Your home folder or `/`, opened as a folder, is always read that way.

`search.engine` chooses how search reads ([Configuration](configuration.md)):

| Value | Search uses |
| --- | --- |
| `auto` | the index, once it is built |
| `index` | the index, building it first |
| `scan` | the files, never keeping an index |

## Find in a note

1. Press `ctrl+f` or `/` (or `space f /`). The find row opens at the top of the window.
2. Type what to find. As you type, the cursor moves to the first match after it, and every match is highlighted. The
   count shows at the row's right (`2/7`).
3. Press `enter` to keep the search. To drop it instead, press `esc` while typing. The cursor goes back to where it was.

Then:

| Press | To |
| --- | --- |
| `n` | Go to the next match |
| `shift+n` | Go to the previous match |
| `alt+r` | Make the query a regular expression (JavaScript's). It's the `.*` button in the row. |
| `alt+w` | Match whole words only. It's the `ab` button in the row. |
| `*` | Find the whole word under the cursor, forward |
| `#` | Find the whole word under the cursor, backward |
| `esc` | End the search and clear the highlights. `:noh` does the same. |

`n` and `shift+n` go from wherever the cursor has moved since. Both wrap around the note, and say so.

The window keeps `alt+r` and `alt+w` for its next search.

The search is plain text by default, and smart about case. Lower case matches either case, and a capital matches only
itself.

In a rendered note, the search matches the text as you see it, so `**bold**` is found by `bold`. In source mode, it
matches the Markdown.

There is no backward-search key, as `?` is help. Search with `/`, then press `shift+n`.

On the current row, you can jump to a character you type:

| Press | To |
| --- | --- |
| `f` | Jump onto the next character you type |
| `t` | Jump to just before the next character you type |
| `shift+f`, `shift+t` | The same, to the previous one |
| `;` | Repeat the jump |
| `,` | Repeat the jump the other way |

To go to a line by its number, press `ctrl+g` (or `space f l`), or type `:42`.

### Find and replace

Press `ctrl+h` to add a replace row under the find row. `space f r` does the same, and so does `tab` from the find row.

Replacing works on the Markdown. So a rendered window switches to editing first, to source mode or the lens, as
`editor.edit_in` says ([Configuration](configuration.md)).

| Press | To |
| --- | --- |
| `enter` in the replace row | Replace the match at the cursor, and move to the next |
| `alt+a` (or `alt+enter`) | Replace every match, as one step that `u` undoes |
| `ctrl+n`, `ctrl+p` | Move between matches without replacing |
| `tab`, `shift+tab` | Move between the two rows |
| `alt+h` (the `⇄` button) | Open or close the replace row |
| `esc` | Close both rows, keeping what you replaced |

With regular expressions on, the replacement can use:

- `$&`, the match
- `$1` to `$9`, its groups
- `$$`, a dollar sign

Opened on a selection within one line, the selection is what to find. On a selection across lines, replacing stays
within those lines.

### Vim's substitute

Vim's `:s` works too, typed at the `:` prompt:

| Type | To replace on |
| --- | --- |
| `:s/old/new/` | the cursor's line |
| `:%s/old/new/` | the whole note |
| `:'<,'>s/old/new/` | the lines of the last selection |

Pressing `:` with a selection types `'<,'>` for you.

The flags:

| Flag | Does |
| --- | --- |
| `g` | Replaces every match on a line. Without it, only the first. |
| `i` | Ignores case |
| `c` | Asks at each match, `replace? y n a q`, in the window's find rows |

The pattern is a JavaScript regular expression. Any punctuation can stand for `/` (`:s#a/b#c#`), and `\` escapes it.

`^` and `$` are a line's start and end. A match of nothing inserts there, so `:%s/^/> /` quotes every line.

In the replacement:

- `\1` to `\9` are groups.
- `&` is the match.
- `\&` is a plain `&`.

A substitute is one undo step. It works on the Markdown, as replacing does.

From the command line, `slipbox replace <note> <old> <new>` replaces in one note. Add `--dry-run` to see each change
first.

## Find in every note

Press `ctrl+shift+f` (or `space f g`), and type what to find. slipbox lists every line that has it, in every note and
every file the explorer shows. Each row is the place and the line, such as `ideas/coffee.md:12`. `enter` opens the file
at that line.

- A note you have open is searched as it is now, unsaved changes and all.
- The window's find settings apply. `alt+r` and `alt+w` switch them as you type, and the question says which are on.
- The list stops at the first 1,000 lines.

From the command line, `slipbox find <text>` does the same, and `slipbox find <text> <note>` searches one note. It
takes `--regex`, `--whole` and `--ignore-case`, and `--files` for files other than notes.

### Replace in every note

1. Press `ctrl+shift+h` (or `space f shift+r`). slipbox asks what to find. The window's find, or text selected on one
   line, is typed already.
2. Give what to find. slipbox asks what to replace it with.
3. Give the replacement. slipbox shows a preview: every line it would change, in every note and every file the
   explorer shows.
4. Press `enter` to do it, or `esc` to leave everything as it was.

In the preview, a match that spans lines is one row, its line breaks shown as `⏎`.

Replacing is refused while a file with a match has unsaved changes, since what you see isn't what is on disk.

`space v shift+u` takes it back, as it takes back a rename.

From the command line, run `slipbox replace --all <old> <new>`. `--dry-run` shows the preview, and `slipbox undo` takes
it back.

## The outline

Press `space o` to open the outline on the right. It shows the note's headings, indented by level, and takes the focus.

- Pressed while the outline has the focus, `space o` closes it.
- Pressed from the note while the outline is open, it focuses the outline.

The `▤` button shows or hides the outline.

While you read, the outline follows the cursor. Its selection is on the section you are in.

Inside the outline:

| Press | To |
| --- | --- |
| `j`, `k` | Move |
| `enter` (or a click) | Jump to the heading. The note takes the focus. |
| `h`, `l` | Fold and unfold a heading's subheadings |
| `/` | Filter the headings, keeping their parents. `esc` clears the filter. |
| `r` | Rename the selected heading, and every link to it, after a preview |
| `q` | Close the outline |
| `esc` | Go back to the note |

Without opening a pane:

- `space f o` lists the note's headings, to pick one.
- `space f b` lists the headings the cursor is under, as the breadcrumb at the top of the window shows them.
- `[ [` and `] ]` move to the previous and next heading. [Reading](reading.md) has the keys that move through a note.

From the command line, `slipbox outline <note>` lists a note's headings with their lines.

## Footnotes

Press `space n f` to open the footnotes view in the right panel. You can also type `:footnotes`, or click its button
under the outline's.

The view lists the note's footnotes in the order the note first refers to them, then any it never refers to. Each shows
its label and text. At the right, it shows one of these:

- how many references it has (`2×`)
- `unused`
- `no definition`

While you read, the view follows the cursor to the footnote the cursor's line refers to or defines.

| Press | To |
| --- | --- |
| `j`, `k` | Move |
| `enter` (or a click) | Jump to the footnote's definition |
| `l` | Unfold a footnote into its references, each with its line. `enter` on one jumps there. |
| `h` | Fold it again |
| `/` | Filter by label and text |
| `q` | Close the view |
| `esc` | Go back to the note |

The view changes footnotes too:

| Press | To |
| --- | --- |
| `a` | Add one at the note's cursor, as `space n shift+f` does from anywhere |
| `e` | Edit the selected footnote's text |
| `r` | Rename its label in every reference |
| `d` | Delete it, its references too, after asking |

Adding asks for the footnote's text. Then it writes a reference such as `[^1]` after the word the cursor is on, and
its definition, `[^1]: text`, at the note's end.

Each change is saved at once, as one undo step.

From the command line, `slipbox footnotes <note>` lists them. `add`, `edit`, `rename` and `rm` after it change them
([The command line](cli.md#footnotes)).

## History

### Back and forward

Following a link, jumping to a heading or opening a note each leaves a place to come back to.

- `ctrl+o` (or `space h p`) goes back.
- `space h n` goes forward again.

Vim's forward key, `ctrl+i`, reaches slipbox as `tab`, which moves to the next link.

Each window has its own history, kept between sessions. Going back from the first place you visited in a vault returns
to the vault before.

The status line works like a browser's address bar:

- `‹` and `›` around the note's path go back and forward with the mouse. Each is bright when there is somewhere to go,
  and hovering one says where.
- A click on the path lists the window's places, to jump to any of them. Copy path is at the top.

### The history list

Press `space h h` to open the history in the left panel, with the focus in it. Pressed again, it closes it, as
`space o` does the outline.

It lists the window's places, newest first, with the current one marked `here`. `enter` jumps to one. The places before
it become back, and the places after it forward.

Under them, "recent here" lists the notes you read in other windows and tabs and in earlier sessions, newest first.
Each shows when you read it, or the tab it is open in. `enter` opens one in this window.

`ui.history_limit` says how many it lists: 100 by default, and 0 lists none ([Configuration](configuration.md)).

Inside the list:

| Press | To |
| --- | --- |
| `j`, `k` | Move |
| `/` | Filter by path |
| `q` | Close the panel |
| `esc` | Go back to the note |

Every note also reopens where you left it. [The screen](screen.md) has what slipbox keeps between sessions.

From the command line, `slipbox history` lists the notes read lately and what is open.

## Tags

Press `space f t` (or type `:tags`) to list the vault's tags. Each shows how many notes carry it, and a nested tag is
indented under its parent.

Pick a tag to list its notes. A parent's list includes the notes of the tags under it. `enter` opens a note.

`:tag coffee` goes straight to a tag's notes.

To find notes by a tag and words at once, search for both, such as `#coffee grinder`. Following a tag in a note lists
its notes too. What counts as a tag is in [Links and vaults](links-and-vaults.md#tags).

From the command line, `slipbox tags` lists the tags, and `slipbox tags coffee` lists a tag's notes.

## Document types

Some notes are of a kind, known by where they are. slipbox can list them in order. Two kinds are built in:

| Type | Its notes | Ordered by |
| --- | --- | --- |
| `adr` | a note in a folder named `adr`, `adrs`, `decisions` or `decision-records` | the number in its file's name |
| `skill` | an agent skill's `SKILL.md` | the path |

Press `space f d` (or type `:types`) to list the types the vault has. Each shows how many notes are of it.

Pick a type, or type `:type adr`, to list its notes in order. Each note shows:

- its number
- its title
- its status
- what supersedes it

`] t` and `[ t` open the next and previous note of the type of the one you are reading. They say where it is, such as
`adr 2 of 5`, and its status.

A note's status is its front matter's `status`. Without one, it's a `Status:` line, else the first line of a
`## Status` section.

A status that reads "Superseded by …" names the note that supersedes it, by a link or by its number.

You can define your own types, or change the built-in ones, in a `[types.<name>]` table of your config or a folder's.
It sets:

- which paths
- the order
- the status key
- the front matter each note must have

[Configuration](configuration.md) has the keys. A note breaking its type's rules shows it among its problems
([Code](code.md)).

From the command line, `slipbox types` lists the types, and `slipbox types adr` lists a type's notes in order.

## A command by its name: the palette

1. Press `:` to open the command palette. `ctrl+shift+p`, `space f p` or a click on the `slipbox` chip in the top bar
   opens it too.
2. Type part of a command's name.
3. Press `enter` to run it.

`?` (or `space ?`) opens help: every command, with all its keys.

After `space`, the which-key popup lists the keys that can come next.

[The command palette](screen.md#the-command-palette), [Help](screen.md#help) and
[The which-key popup](screen.md#the-which-key-popup) describe them. [Keys](keys.md) lists every key.
