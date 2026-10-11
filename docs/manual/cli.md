# The command line

Most of what slipbox does is also a command you can type in a shell: read a note, find text, write safely, follow and
fix links, move files with their links kept, capture references for an agent, export. The commands work on the same
files as the screen, so you can mix them freely: run one in a pane beside slipbox and the screen reloads what it
changed.

They serve three kinds of caller. You, at a prompt, get short readable output. A script or an agent adds `--json` and
gets one JSON object it can parse, with exit codes it can rely on. An editor keybinding calls `slipbox capture` or
`slipbox send`. This chapter covers every command, for all three: what each is for, its flags, and what it prints.
[Working with agents](../guides/agents.md) walks through a session beside an agent.

## Running a command

A command is `slipbox`, the command's name, its arguments and its flags:

```bash
cd ~/notes
slipbox find coffee
slipbox read inbox
slipbox help
```

`slipbox help` lists every command with its flags. `--help` (or `-h`) after any command prints the same list, and
`slipbox --version` (or `-V`) prints the version.

- **Flags go anywhere**: before the command, after it, between its arguments. A flag's value follows it, as
  `--width 80` or `--width=80`.
- **After `--`, nothing is a flag.** Text that starts with a dash (a list item) goes there, and so does a note whose
  name starts with one: `slipbox write inbox --append -- '- call the plumber'`, `slipbox read -- -dash.md`. The error
  for a stray dash says so.
- **Mistakes are refused, never guessed at.** An unknown flag, a flag the command doesn't take (`write --dry-run`
  would otherwise write), more arguments than the command takes, or an empty value (`--root ''`) is a usage error,
  exit code 2, and nothing is done.

### Opening the screen

`slipbox` with no command, or with a path, opens the screen (also spelled `slipbox open [path]`): the folder or note
you name, else the current folder. [Getting started](../guides/getting-started.md) shows a first session.

It takes `--root`, `--config` and `--theme` (a theme for this session). With `--json`, `--help` or `--version` it runs
the command line instead; other flags are ignored, and an unknown one is a usage error. A path that isn't there is
said in a line, exit code 3, before the screen is taken.

The screen needs a terminal. Started from a script, with stdin or stdout not a terminal, slipbox doesn't start it: it
prints a hint to use a command instead and exits with 2. It never paints escape codes into a pipe.

## Where a command works

Each command works in a root: the folder whose notes it reads, where `/` in a link starts, where a wikilink's names
are looked up, whose settings and link convention apply. A file's root is the nearest folder above it holding a root
marker: `.git`, `.slipbox/`, `.obsidian/` or `.zk/` (the setting [`walk.root_markers`](configuration.md)). A command
finds it from the note you name, or else from the folder you run it in. A folder with no marker above it works too,
as a plain folder of its own. Your home folder and `/` are never roots: opened as plain folders, they're listed a
level at a time, never walked or indexed. [Links and roots](links-and-roots.md) explains roots, plain folders and
names.

`--root <folder>` says where to start instead: it must name a root (exit 3 otherwise), and a note you name is looked
for there. A file still belongs to its nearest root, so a note in a root nested inside `--root` is that root's.

Running a command writes nothing into your folders. slipbox keeps its index, the scratch, the trash and the rest in
folders of its own, each root's apart ([Where slipbox keeps things](configuration.md#where-slipbox-keeps-things));
`slipbox info` says where. Only the commands that change files on purpose write, and only inside the note's root.

## Naming a note

Where a command takes `<note>`, you can name it in any of these ways, tried in this order:

1. **A path from the current folder**: `ideas/coffee.md`, `../notes/inbox.md`. A file the root's walk leaves out
   (git-ignored, or in a hidden folder) is still read when you name it by its path.
2. **A pointer** to a named folder's file, wherever that folder is on this machine:
   `slipbox://notes/ideas/coffee.md`. The command then works in that folder, as it would with the file's path. A
   folder that isn't on this machine, or a branch that isn't checked out, is exit 3; a name two folders share, exit 4.
3. **A path from the root**, whichever folder you're in.
4. **A note's name**: its file name without the extension, or an alias from its front matter. `coffee` is
   `ideas/coffee.md`. When several notes share the name, the one written in the same case wins, then the one in the
   fewest folders; a real tie is exit 4, with the candidates. `--from <note>` then picks the one nearest that note.
   A name never depends on the folder you're in.
5. **A data or text file** of the root by its path, extension included: `config/app.toml`, `tools/sync.py`. It's read
   and written as it is, never as a note.

A pointer is also accepted wherever a command takes a note or `--from`. A folder's name and a path joined by a colon,
`notes:ideas/coffee.md`, isn't one: when a named folder has that name, it's exit 3, and the message gives the pointer
that names the file.

## What a command prints

### For people

Output goes to stdout, and warnings and errors to stderr, each starting `slipbox: warning:` or `slipbox:`. Text that
comes from your notes (a heading, a link's text, a path) is cleaned of control characters before it reaches your
terminal, so a note can't move your cursor or change your terminal's title. Only `render` adds escape codes, for its
colours.

### For programs: `--json`

With `--json`, a command prints exactly one JSON object on stdout, whatever happens: a usage error, `help` (its text
in `data.text`) and `--version` (`data.version`) included.

```json
{"schema": 1, "ok": true, "command": "links", "data": [], "warnings": [], "stale": []}
```

```json
{"schema": 1, "ok": false, "command": "read", "error": {"code": 3, "message": "no note or file \"tea\" in …"},
 "data": null, "warnings": [], "stale": []}
```

- `schema` is the format's version, apart from slipbox's: it changes only when a stable command's output changes
  ([below](#what-stays-stable)).
- `ok` says whether the command succeeded; when it didn't, `error` has the exit code and the message.
- `data` is the command's answer, given with each command below. On some failures it says more: the candidates of an
  ambiguous name, a note's current `sha` when `--if-unchanged` refused. Otherwise it's `null`.
- `warnings` are what the human output prints on stderr.
- `stale` lists notes a running slipbox holds with unsaved changes ([below](#unsaved-changes-in-a-running-slipbox)).

Values are whole, never shortened. Characters a terminal would act on (C1 controls, DEL, bidirectional controls) are
escaped as `\uXXXX`, so the raw object is safe to print.

The shapes below use a short notation: `{path, sha}` is an object with those keys, `files[]` a list, and
`files[{path, line}]` a list of such objects; `key?` is there only sometimes.

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | done |
| 1 | an error: something failed (a file that doesn't parse, git couldn't answer, an editor wouldn't start) |
| 2 | a usage error: an unknown flag, a missing argument, a bad value; nothing was done |
| 3 | not found: a note, a link's target, a task's line, the `--root` folder, a pointer's folder |
| 4 | ambiguous: a name or a link several notes answer to, or several running nvims for `send` |
| 5 | refused: a stale `--if-unchanged`, a write outside the root, over an existing file, or to a binary file |

Exit code 5 also covers a note or stdin that isn't valid UTF-8 (never rewritten, so no byte is lost) and a read of a
symlink leading out of the root. `diagnostics` exits with 1 when it shows an error, and `uninstall` when it couldn't
remove something.

### Unsaved changes in a running slipbox

A command reads and writes the files on disk, never what the screen holds unsaved: what you've saved is what a
command sees. It writes each file atomically (a new file, renamed into place), so a reader never sees half of one.
When a command writes a note the screen has open, the screen reloads it, or asks what to do if you have unsaved
changes there ([Editing](editing.md)).

So a script or an agent can tell, every command checks which notes a running slipbox holds with unsaved changes. The
human output warns (`unsaved changes in a running slipbox: inbox.md`), and `--json` lists them in `stale`. It's
advice, never a lock: a write still goes through.

### Lines and columns

Lines count from 1 everywhere. A link's `column` counts UTF-16 units from 1, as editors and language servers count
(`🌍` is two), and its `end` is the line and column just after its last character. `find`, `replace` and `spell`
count columns in characters (code points).

### What stays stable

slipbox is young, and most commands may still change before its 1.0. These are stable: their output changes only
with a new `schema`.

- `render`, `capture`, `scratch` (`show`, `path`, `clear`, `copy`)
- `resolve`, `links`, `backlinks`, `problems`, `tags`
- `changed`, `diff`, `merge-review`, `worktrees`

The exit codes and the `--json` envelope are stable for every command.

## Flags every command takes

| Flag | What it does |
| --- | --- |
| `--root <folder>` | where to start: a root ([Where a command works](#where-a-command-works)) |
| `--config <file>` | your settings from this file, instead of `$SLIPBOX_CONFIG` or `~/.config/slipbox/config.toml` |
| `--json` | one JSON object on stdout ([For programs](#for-programs---json)) |
| `--color <when>` | `auto` (the default), `always` or `never`: whether `render` colours its output |
| `--plain` | no colour and no other escape codes (`render`) |
| `--from <note>` | the note a link is written in (`resolve`, `link`); the nearest of several notes of a name |
| `-h`, `--help` | the list of commands and their flags |
| `-V`, `--version` | the version |

Every command checks `--color`'s value, even one that draws nothing. [Configuration](configuration.md) has the
settings files and the environment variables.

## Every command

| Command | What it does |
| --- | --- |
| [`render`](#render) | a note drawn as text, for reading in a terminal |
| [`read`](#read) | a note's text exactly, and its `sha` |
| [`stat`](#stat) | a note's size, dates, title, counts and front matter |
| [`outline`](#outline) | a note's headings with their lines |
| [`ls`](#ls) | the notes of the root |
| [`tags`](#tags) | the tags and how many notes carry each; a tag's notes |
| [`types`](#types) | document types (ADRs and the like) and their notes |
| [`history`](#history) | the notes you read in the screen, and what's open there |
| [`find`](#find) | every match of some text, in a note or every note |
| [`search`](#search) | notes ranked by words |
| [`index`](#index) | build or refresh the indexes |
| [`write`](#write) | replace, append to or create a note |
| [`replace`](#replace) | replace text in a note, or in every note |
| [`task`](#task) | list a note's tasks, or tick one |
| [`footnotes`](#footnotes) | list, add, edit, rename or remove footnotes |
| [`spell`](#spell) | the words a note's dictionaries don't know |
| [`mkdir`](#mkdir) | make a folder |
| [`resolve`](#resolve) | follow a link to the file it reaches |
| [`link`](#link) | a link to a note, written as this folder writes links |
| [`links`](#links) | a note's links, each with what it reaches |
| [`backlinks`](#backlinks) | the notes and files linking to a note |
| [`problems`](#problems) | broken and ambiguous links, orphans, merge conflicts, front matter breaking its rules |
| [`mv`](#mv) | rename or move a note, file or folder, every link to it kept |
| [`cp`](#cp) | copy a note, file or folder |
| [`rm`](#rm) | delete to slipbox's trash |
| [`trash`](#trash) | what's in the trash; put something back, or empty it |
| [`rename-heading`](#rename-heading) | rename a heading and every link to it |
| [`relink`](#relink) | fix links a move broke |
| [`convert-links`](#convert-links) | turn wikilinks and links from the root into relative paths |
| [`undo`](#undo) | take back the last rename, move, relink, conversion or replace |
| [`apply`](#apply) | write a plan saved with `--plan` |
| [`info`](#info) | the root, its name, its link convention, where its state is |
| [`init`](#init) | give a folder a `.slipbox/` folder, and a name |
| [`deinit`](#deinit) | make a root nested in another a plain folder again |
| [`name`](#name) | name this root, as pointers name it |
| [`folders`](#folders) | the named folders this machine knows, and their copies |
| [`changed`](#changed) | what this branch changed against its base |
| [`diff`](#diff) | a note's changes on this branch |
| [`worktrees`](#worktrees) | the repository's checkouts |
| [`merge-review`](#merge-review) | the links a merge would break |
| [`capture`](#capture) | add text or a file reference to the scratch |
| [`scratch`](#scratch) | show, locate, copy or clear the scratch |
| [`context`](#context) | a note and its neighbours as one document for an agent |
| [`send`](#send) | open a note in your running editor |
| [`export`](#export) | notes as Word, PDF, a web page, an e-book or Markdown |
| [`doctor`](#doctor) | the language servers and linters slipbox would use, and where they are |
| [`diagnostics`](#diagnostics) | a file's problems from every source |
| [`themes`](#themes) | the themes you can use |
| [`commands`](#commands) | every named command, and its command-line equivalent |
| [`upgrade`](#upgrade) | install the latest release |
| [`uninstall`](#uninstall) | remove what the installer put here |
| [`help`](#help) | this list, in the terminal |

## Reading

### `render`

Draws a note as the screen does, as text: headings, tables laid out to the width, code highlighted, embedded notes
drawn in place. Use it to read a note in a terminal or to hand a readable copy to another program. A data file (TOML,
YAML, JSON, CSV and the like) renders too; a code or other text file has none (exit 2: `read` gives its text), and
data that doesn't parse is exit 1 with the error. [Reading](reading.md) shows what each part of a note looks like.

```bash
slipbox render ideas/coffee.md
slipbox render coffee --width 80 --plain
```

- `--width <columns>`: the width to lay it out at, a whole number from 20 to 1000; by default the terminal's, else
  100.
- `--theme <name>`: a theme for this one render (`slipbox themes` lists them), instead of the setting
  [`theme`](configuration.md).
- `--glyphs <set>`: `auto`, `nerd`, `unicode` or `ascii`, instead of [`render.glyphs`](configuration.md).
- Colour: only when stdout is a terminal and `NO_COLOR` isn't set. `--color always` forces it (even with
  `NO_COLOR`); `--plain`, `--color never` or a pipe give none. Without colour, a link's address follows its text, as
  [`render.show_urls`](configuration.md) says.

`--json`: `{path, width, lines[], headings[{level, text, slug, line}]}`. `lines` are the rows as plain text, `width`
the width they were laid out at once the margins are taken off, and each heading's `line` its line in the file.

### `read`

Prints a note's text as it is on disk. With `--json` you also get its `sha`, the fingerprint the safe writes check
([Changing notes](#changing-notes)).

```bash
slipbox read inbox
slipbox read ideas/coffee.md --json
```

`--json`: `{path, abs, sha, bom, crlf, invalidUtf8, content}`. `content` is the text whole (the human output has
control characters removed); `bom` and `crlf` say whether the file has a byte order mark and Windows line endings,
which writes keep; `invalidUtf8` that it has bytes that aren't UTF-8 (shown as `�`, and the note is never rewritten).

`read` reads the bytes and never parses the note, so it's quick even for a note too large for the index.

### `stat`

A note's facts in one call, as the screen's Info view (`space n i`) shows them: its path and root, size, last change,
title, tags, front matter, and how many headings, links and backlinks it has.

```bash
slipbox stat coffee
```

`--json`: `{path, abs, root, name, properties, size, mtime, title, tags[], headings, links, unresolved, backlinks,
sha, bom, crlf, invalidUtf8}`. `properties` is the front matter (or `null`); `headings`, `links`, `unresolved` (links
that reach nothing) and `backlinks` are counts. `root` is `null` in a plain folder, and `name` the root's name.

### `outline`

A note's headings, each with the line it's on. A data file's outline is its sections (a TOML table, a YAML key); a
code file's, its definitions (functions, classes and so on), in a language slipbox has a grammar for.

```bash
slipbox outline ideas/coffee.md
```

`--json`: `{path, headings[{depth, text, slug, line}]}`; a code file's headings have `kind` (`function`, `class`,
`method`…) instead of `slug`.

### `ls`

Lists the notes of the root, by path.

```bash
slipbox ls
slipbox ls --files
```

- `--files`: data and text files too (code, configuration).

`--json`: `[{path, title, size, mtime, tags[], links}]`, `links` a count; with `--files`, the other files follow as
`{path, group, format, size, mtime}`, `group` being `data` or `text` and `format` the file's (`toml`, `python`…).

### `tags`

The tags in the root's notes, each with how many notes carry it; or, given a tag, the notes that carry it. A nested
tag counts under its parent: a note tagged `#coffee/espresso` is one of `#coffee`'s.

```bash
slipbox tags
slipbox tags '#coffee'
```

`--json`: `[{tag, count}]`; with a tag, `{tag, notes[]}`. A tag no note has is exit 3. The `#` is optional.

### `types`

Document types: notes that follow a convention, such as ADRs (architecture decision records) or agent skills, found
by where they are, plus the types your settings define ([`types`](configuration.md)). Without an argument, each type
with how many notes are of it and how many break its rules; with a type, its notes in order, each with its number,
title and status, and what supersedes it.

```bash
slipbox types
slipbox types adr
```

`--json`: `[{name, source, paths[], notes, problems}]`, `source` being `built-in` or `config`; with a type,
`{name, source, paths[], notes[{path, title, number, status, supersededBy}]}`. An unknown type is exit 3.
`problems` lists each rule broken ([`problems`](#problems)). [Finding things](finding.md) shows the types in the
screen.

### `history`

What you've been reading in the screen: the notes, newest first, each with the line you were on, and the tabs open
now. The screen saves this a second after it changes, so it's current while slipbox runs. An agent uses it to see
what you're looking at.

```bash
slipbox history
```

`--json`: `{read[{path, at, line, exists}], open[], activeTab, current}`. `exists` is `false` for a note deleted
since; `open` lists the tabs, each a list of its windows' notes; `current` is the note in the active window, or
`null`.

## Finding

### `find`

Every match of some text, in one note or in every note of the root, each on its line. Not ranked: for that, use
`search`.

```bash
slipbox find grind
slipbox find 'grind|roast' ideas/coffee.md --regex
```

- `--regex`: the text is a regular expression (JavaScript's).
- `--whole`: whole words only.
- `--ignore-case`: ignore case. Without it, case is ignored unless the text has a capital letter.
- `--files`: data and text files too, not only notes.

The human output is `path:line:column: the line`, a long line shown as a window around the match (`…` where it's
cut). A note too large for the index is left out of a search of every note, with a warning: name it to search it.

`--json`: `{query, regex, whole, count, matches[{path, line, column, match, text}]}`, `match` being what matched and
`text` its line.

### `search`

Ranks the root's notes and data files by the words you give, as the screen's search does, each hit where the note
has most of the words. The query is written as in the screen: words, `"a phrase"`, `prefix*`, `-word`, `title:`,
`#tag` and `path:` ([What you can type](finding.md#what-you-can-type)). [Finding things](finding.md#search) explains
the ranking and where a hit opens. When no note has every word, those with some are listed, with a warning.

```bash
slipbox search grind size
slipbox search '"cold brew" -decaf path:ideas/'
```

Flags:

- `--limit <n>`: at most this many hits, from 1 to 500 (20 by default).
- `--scope here|linked|all`: `here` (the default) searches this root; `linked` adds the roots its notes link to and
  those linking to it; `all` every root this machine knows. This root's hits come first, then the others' by score.
  Neither takes in a worktree, even one a note links into: its notes are copies of its main checkout's.

Search uses the root's index when it has one ([`index`](#index)), brought up to date with every file changed since,
whoever changed it. Until the index is built it reads the files instead: the same notes, more slowly, and a warning.
The setting [`search.engine`](configuration.md) can make it always use the index, or never.

`--json`: `{query, scope, engine, relaxed, roots[], hits[]}`. `engine` is `index` or `scan`, `relaxed` true when not
every word was found, and `roots` the other roots searched. Each hit is `{path, abs, shown, line, column, heading,
section{name, line, end}, score, snippet, marks[], more, root, name}`: the line with most of the words (`snippet`, the
words' places in it as `marks`, `[start, end]` pairs), the heading above it, the section it's in, and `more`, the
note's other sections with some of the words. `root` and `name` are another root's, else `null`.

### `index`

slipbox keeps two indexes for each root: the link index (each note's title, tags, headings and links, which every
command reads) and the search index (the words, for `search`). The screen keeps both up to date as it runs, and
commands catch them up with what changed; `index` is for doing it now. Without a flag, it builds the search index or
brings it up to date.

```bash
slipbox index
slipbox index --rebuild
slipbox index --refresh
```

- `--rebuild`: start again from nothing.
- `--refresh [path]`: bring a root's link index up to date now (every file's size and time checked, every folder
  listed again): this root's, or that of the root holding `path`, opened before or not. A path outside every root
  means the plain folder it's in.
- `--home`: run the background index of your home folder now, in the foreground: it finds the roots under your home
  folder and indexes each, so their links count as backlinks of the roots they reach. With `--budget <ms>` it stops
  after that long and carries on from there next time (0, the default, is the whole pass); `--rebuild` starts a new
  pass.

`--json`: `{path, rebuilt, indexed, removed, files, ms}`; with `--refresh`, `{root, notes, changed, unchanged, gone,
reached, indexed, ms}`; with `--home`, `{root, found, indexed, left, started, finished}`. A plain folder listed a
level at a time (your home folder, `/`) has no index: exit 5.

## Changing notes

`write`, `replace`, `task` and `footnotes` change a note as the screen saves one:

- atomically, never half-written;
- keeping its byte order mark and its line endings;
- only inside the note's root, by its real path (a symlinked folder leading out is refused), and only where the root's
  notes are: never in `.slipbox/`, `.git/`, `node_modules` or a hidden folder (unless you named a note there);
- never a binary file, and never a note that isn't valid UTF-8 (its bytes would be lost; a task can still be ticked).

Any of these refused is exit 5, with nothing written. Data and text files of the root are written as they are, never
parsed as notes.

**The safe way to change a note someone else may be editing** is to read its `sha`, then write with
`--if-unchanged`: if the note changed in between, the write is refused (exit 5) instead of overwriting the change.

```bash
sha=$(slipbox read ideas/coffee.md --json | jq -r .data.sha)
printf '# Coffee\n\nRevised.\n' | slipbox write ideas/coffee.md --stdin --if-unchanged "$sha"
```

The `sha` is the first 16 hex digits of the SHA-256 of the file's bytes. `read`, `task`, `footnotes` and
`replace --dry-run` report it; `write`, `replace`, `task` and `footnotes` take `--if-unchanged`. An empty sha is a
usage error, never a check that passes.

### `write`

Replaces a note's text, appends to it, or creates a new note.

```bash
slipbox write ideas/coffee.md --create '# Coffee'
slipbox write coffee --append -- '- try a finer grind'
slipbox write coffee --append --paragraph 'Espresso wants a finer grind than filter.'
printf '# Coffee\n\nNotes on brewing.\n' | slipbox write coffee --stdin
```

The text is the arguments after the note, joined by spaces and ending with a newline, or stdin as it comes with
`--stdin`.

- `--create`: make a new note. The argument is then a path, never a name: from the root, or from the current folder
  when it starts with `./` or `../`. `.md` is added unless the name has an extension slipbox knows (`config.toml`
  stays as it is). An existing file is refused (exit 5), never overwritten. A name other notes already have is
  written, with a warning: naming it by that name now takes a path.
- `--append`: add the text at the end, on a new line. With `--paragraph`, after a blank line, so it's a block of its
  own (a line appended right after a table would become its next row).
- `--stdin`: read the text from stdin. It must be valid UTF-8 (exit 5 otherwise).
- `--if-unchanged <sha>`: only if the note still has this sha (exit 5 otherwise).
- `--allow-empty`: empty the note on purpose. Without it, empty or blank text is refused (exit 2), so a failed
  program piped into `write` can't empty a note. With `--create` and no text at all, it makes an empty note, to fill
  later: `slipbox write ideas/tea --create --allow-empty`.

A note that doesn't exist is exit 3 (add `--create`). A new name with a control character is refused (exit 5).

`--json`: `{path, created, shadows[]?, appended, previousSha, sha}`. `shadows`, with `--create`, lists the other
notes of the same name; `previousSha` is `null` for a new note.

### `replace`

Replaces text in a note, every match unless you say otherwise. Run it with `--dry-run` first to see each line before
and after.

```bash
slipbox replace coffee finer coarser --dry-run
slipbox replace coffee finer coarser --first
slipbox replace coffee '^' '> ' --regex --lines 3-5
```

The text to find takes `find`'s flags (`--regex`, `--whole`, `--ignore-case`). With `--regex`, the replacement may
use `$&` (the match), `$1` to `$9` (its groups) and `$$` (a dollar sign); `^` and `$` are a line's start and end, and
an empty match inserts (the last example quotes lines 3 to 5).

- `--first`: only the first match (in the range).
- `--first-per-line`: the first match on each line, as vim's `:s` without `g`.
- `--lines <a-b>`: only lines `a` to `b` (or one line, `12`).
- `--dry-run`: show what would change; write nothing.
- `--if-unchanged <sha>`: only if the note still has this sha.

`--json`: `{path, count, dryRun, sha, newSha, changes[{line, column, before, after, text, textAfter}]}`. `sha` is
the note's before (the one `--if-unchanged` wants), `newSha` after (`null` on a dry run); each change has the match
and its replacement, and its line before and after (a window of a long line).

**In every note**: `--all`, with the text and its replacement and no note:

```bash
slipbox replace --all 'cold brew' 'cold-brew' --dry-run
```

It works as a rename does ([Moving, copying and deleting](#moving-copying-and-deleting)): `--dry-run` shows each line
it would change, `--plan` saves it for `apply`, and `undo` takes it back. `--files` covers data and text files too. A
match may span lines (with `--regex`); a file with a match that isn't valid UTF-8 is skipped, and said. `--first`,
`--first-per-line`, `--lines` and `--if-unchanged` are one note's, and a usage error with `--all`. `--json`: as
[`mv`](#mv)'s, with `kind` `replace`, `from` the text found and `to` its replacement.

### `task`

Lists a note's tasks (`- [ ]` and `- [x]` items, never those inside code), or ticks one by its line, as `ctrl+l` does
in the screen.

```bash
slipbox task coffee
slipbox task coffee 5
slipbox task coffee 5 --check
```

With a line, it toggles the task there. `--check` and `--uncheck` set it instead, and change nothing when it's
already so. `--if-unchanged <sha>` applies, as in `write`. A line with no task is exit 3, with the note's tasks; a
file that isn't a note, exit 2.

`--json`: listing, `{path, sha, tasks[{line, checked, text, raw}]}` (`raw` the source line, its links as written);
ticking, `{path, line, text, checked, changed, sha}`.

### `footnotes`

Lists a note's footnotes (each label, its text and line, and where it's referred to), or changes them as the
screen's footnote keys do.

```bash
slipbox footnotes coffee
slipbox footnotes coffee add 8 'From the café on the corner.'
slipbox footnotes coffee rename 1 cafe
slipbox footnotes coffee edit cafe 'From the café on the corner, in May.'
slipbox footnotes coffee rm cafe
```

- `add <line[:column]> <text>`: a new footnote referred to at that line, at the column given or else the line's end;
  its definition goes at the end of the note.
- `edit <label> <text>`: a footnote's new text.
- `rename <label> <new>`: a new label, every reference to it too.
- `rm <label>`: the footnote and its references.

A label is given with or without its `[^…]`. `--if-unchanged <sha>` applies. A footnote that isn't there is exit 3, a
file that isn't a note exit 5.

`--json`: `{path, sha, footnotes[{label, id, text, line, def, references[{line, column, start, end}]}]}`, after the
change when there was one.

### `spell`

The words of a note's prose its dictionaries don't know, each with its line and column. The languages are the
note's front matter `lang`, else [`spell.languages`](configuration.md) (English by default); a language with no
dictionary is a warning, its words unchecked. [Editing](editing.md) covers spelling in the screen.

```bash
slipbox spell coffee
slipbox spell coffee --suggest --lang en,fr
slipbox spell --add Aeropress
```

- `--lang <a,b>`: these languages instead.
- `--suggest`: each word's suggestions too.
- `--add <word>`: put a word in your own list, as `z g` does in the screen. It takes the word alone, no note.

`--json`: `{path, languages[], missing[], words[{line, column, word, suggestions[]?}]}`, `missing` the languages
with no dictionary; with `--add`, `{added, file}`.

### `mkdir`

Makes a folder in the root, and its parents. The path is from the root, or from the current folder when it starts
with `./` or `../`, or absolute.

```bash
slipbox mkdir ideas/drinks
```

An existing path, or one outside the root, is refused (exit 5). `--json`: `{path, created}`.

## Links

These commands read links as the screen does, with the same rules: a path relative to the note, `/…` from the root,
`~/…`, an absolute path or `file://` URL, a wikilink looked up within the root, a pointer to a named folder's file.
[Links and roots](links-and-roots.md) explains every form, and how slipbox picks among notes a wikilink's name could
mean.

**What a link reaches.** `links` reports it as `note`, `file`, `folder`, `anchor` (a heading in the same note),
`external` (a web address), `ambiguous` or `unresolved`. `resolve` reports `resolved` (a note, file or folder),
`external`, `ambiguous` or `unresolved`.

**How it got there**, for every link that reaches a file, is `how`:

- `path`: by its path; `name`: the only note of that name; `pointer`: a `slipbox://` pointer; `hosting`: a link to
  the repository's own page on its host, read as the file here; `suffix`: a wikilink naming the end of a path;
- `alias`: a name from a note's front matter; `old-name`: a pointer by a folder's earlier name; `another-copy`: a
  named folder's other copy, the usual one not being here;
- a tie between notes of a name, broken by `exact-case` (the name's case), `same-folder` (the one beside the linking
  note), `deepest-shared` (the one sharing most folders with it) or `shortest` (the one in the fewest folders).

And `certainty` is `exact`, `inferred`, `ambiguous` or `broken`. A tie broken by `deepest-shared` or `shortest` is
**fragile**: a new note of the name, nearer the link, would take it. `problems` lists those.

**Paths shown.** `shown` is a file's path as you'd want to read it: from this root, else from your home folder
(`~/…`), else absolute. A file in another root also has that root's path and name as `root` and `name`; for this
root's files both are `null`.

### `resolve`

Follows a link to the file it reaches: the command-line equivalent of following a link in the screen. Give the link
as it's written, and with `--from` the note it's written in, since a relative link and a wikilink depend on where they
are. A link given whole, `[text](target)` or `[[name]]`, is read as that kind of link.

```bash
slipbox resolve ideas/coffee.md
slipbox resolve '../inbox.md#Today' --from ideas/coffee.md
slipbox resolve '[[coffee]]' --from inbox.md
slipbox resolve slipbox://notes/ideas/coffee.md --json
```

Without `--from`, the link is taken as a note a command would name ([Naming a note](#naming-a-note)), else a file's
path from the root. A target with a scheme (`https:`) is external when it has no spaces and no note has that name, so
`resolve 'Meeting: Q3'` still finds `Meeting: Q3.md`. A link to a heading, a block (`#^id`) or lines (`#L42`) also
gives that line. A heading or block that isn't there gives the note without a line (following the link opens it at
its top), and a warning says which heading or block wasn't found.

The human output is the file's path, and `:line` for a heading, a block or lines. Unresolved is exit 3, ambiguous exit
4 with the candidates (for a pointer whose name different folders have, each folder's path); external is exit 0, the
address printed.

`--json`: `{link, status, path, abs, shown, href, heading, line, candidates[], root, name, reason, how, certainty,
git?, suggest?}`.

- `href`, with `--from`: the relative path a link in that note would carry, encoded as a link is
  (`../inbox.md#today`); without `--from`, `null`.
- `reason`: why it didn't resolve, when there's more to say (a named folder that isn't on this machine).
- `git`: for a pointer to a branch not checked out here, `{root, rel, branch}`: the file as it is on that branch.
- `suggest`: for a link written as a folder's name, a colon and a path (`notes:ideas/coffee.md`), the pointer to write
  instead.

### `link`

Prints a link to a note or file, written as slipbox would write it in a note: the folder's convention (a markdown
link or a wikilink, its path form, with or without `.md`), from where `--from` is, else from the root. This is how
the screen's link picker and completion write links, and how an agent should write one. [Links and
roots](links-and-roots.md) explains the convention; `slipbox info` says what it is here and why.

```bash
slipbox link ideas/coffee.md --from inbox.md
slipbox link coffee --from inbox.md --style wiki
slipbox link coffee --embed --text Coffee
```

- `--style markdown|wiki`: that style rather than the folder's.
- `--text <text>`: the link's text. A markdown link's is otherwise the note's title (a file's name); a wikilink has
  none.
- `--embed`: an embed, `![…]`.

A wikilink is a name only where that name reaches the note from `--from`; otherwise it's a path. Into a named folder
that doesn't travel with this one, the link is a pointer.

`--json`: `{link, path, from, style, pathForm, extension}`: the link, and the convention it followed.

### `links`

A note's links, each with what it reaches. `--all` lists every note's in the root at once, each with `from`: a way to
find the broken ones.

```bash
slipbox links ideas/coffee.md
slipbox links --all --json
```

A data file's links are its web addresses, paths and reference values; a code file's, the addresses and paths in its
comments.

`--json`: `[{from?, kind, target, heading, text, line, column, end, status, path, shown, candidates[], root, name,
reason, how, certainty}]`. `kind` is how it's written (`markdown`, `wiki`, `embed`, `image`…), `target` its target as
written, `status` what it reaches, `end` `{line, column}`. An `external` link's `path` is its web address, whole; it
reaches no file, so its `shown`, `root` and `name` are `null`.

### `backlinks`

The notes, data files and code files linking to a note (or to any file), each with where the link is and how it's
written. A note's links to itself aren't counted; links from another root are, as of that root's index.

```bash
slipbox backlinks coffee
```

`--json`: `{path, backlinks[{from, shown, line, column, end, text, kind, target, heading, block, alias, root, name}]}`.
Each says how the link is written, so it can be rewritten.

### `problems`

What's wrong in the root: links that reach nothing, links several notes answer to, fragile links, and orphans (notes
nothing links to). In a git repository mid-merge, the files with conflicts; and the notes whose front matter breaks
their document type's rules.

```bash
slipbox problems
slipbox problems --lint
```

- `--lint`: your Markdown linter's findings on every note too: markdownlint-cli2 with your configuration, as the screen
  runs it ([`lint.enabled`](configuration.md)). When lint is off or fails, a warning says why.

`--json`: `{broken[], ambiguous[], fragile[], orphans[], conflicts[{path, line}], frontmatter[{path, line, message}],
lint[{file, line, column, rule, name, description}]?}`. Each link is `{from, line, column, end, kind, target, text,
reason, candidates[], moved?, fix?}`: a broken link's `moved` is where its file went, if slipbox saw it move
(`relink` fixes it); a fragile link's `fix` is a target that names its note for sure. A conflict's `line` is its first
`<<<<<<<`.

## Moving, copying and deleting

These change files and the links to them, in this root and in every root whose index links into it. Every link keeps
its form: a relative path stays relative, a wikilink a wikilink, `#heading` stays, a reference link's definition is
rewritten where it is. [Files](files.md) explains what changes, and what the screen shows.

**Preview first.** Each of `mv`, `rename-heading`, `relink`, `convert-links`, `undo`, `name`, `init` (on a folder in
a root), `deinit` and `replace --all` takes:

- `--dry-run`: the preview, every line it would change before and after; nothing written.
- `--plan`: the preview, saved as a plan with an id, nothing written. `slipbox apply <id>` writes it later, refused
  if any file in it changed since. So you (or an agent) plan, review, then apply.

`rm` takes `--dry-run` alone, and `cp` neither.

Without either flag, the command writes at once. A rename that can't be done whole is refused (exit 5), nothing
written: a target that exists (or differs only in case), a path outside the root, a file changed between planning
and writing. A file that isn't valid UTF-8 is skipped and said, never rewritten.

In a git repository, a root with uncommitted changes is named in the warnings; the change goes ahead.

**`--json` of a change** (`mv`, `rename-heading`, `relink`, `convert-links`, `undo`, `name`, `init` and `deinit` of a
nested folder, `replace --all`, `apply`): `{kind, from, to, dryRun, move, files[], warnings[], skipped[],
ambiguous[]?, written[], undo?, plan?}`.

- `kind`: `note`, `folder`, `root` (a root's name), `heading`, `relink`, `convert`, `replace`, `make-root` (`init`)
  or `unmake-root` (`deinit`).
- `move`: `{from, to, dir}`, the absolute paths moved, when something moves.
- `files[{path, abs, root, name, edits[{line, before, after}]}]`: each file rewritten, and each line in it.
- `skipped`: links left as they are, and why. `written`: the files written (empty on a dry run).
- `undo`: for `undo`, `{id, at}`, the change taken back. `plan`: with `--plan`, `{id, made}`.

### `mv`

Renames or moves a note, file or folder, and rewrites every link to it.

```bash
slipbox mv ideas/coffee.md ideas/drinks/coffee.md --dry-run
slipbox mv ideas/coffee.md ideas/drinks/coffee.md
slipbox mv ideas/coffee.md archive/
slipbox mv ideas drafts
```

The new path is from the root, or from the current folder when it is `.` or `..` or starts with `./` or `../`, or
absolute; it must stay in the root. A folder that's there, or a path ending in `/`, is moved into, as the shell's `mv`
does, keeping the name: `archive/` makes `archive/coffee.md`, and the folder if need be; `./` from the top of the root
moves it there. Any other path is the file's whole new path, and a note's extension is kept when it has none.

A note's own relative links are rewritten to work from its new folder, as are the paths in a code file's comments
and a data file's values. A folder moves with everything in it, and links between two of its files stay as they are.
A root nested in this one moves as a folder, keeping its name. A pointer as the new path is refused (exit 5); a
pointer as what to move is fine.

`--dry-run`, `--plan`. `--json`: [a change](#moving-copying-and-deleting), `kind` `note` or `folder`.

### `cp`

Copies a note, file or folder. Without a new path, the copy goes beside it as `name-copy`.

```bash
slipbox cp ideas/coffee.md ideas/tea.md
slipbox cp ideas/coffee.md archive/
slipbox cp coffee
```

The new path is read as `mv` reads it: from the root, or from the current folder when it is `.` or `..` or starts
with `./` or `../`. A folder that's there, or a path ending in `/`, is copied into, keeping the name: `archive/` makes
`archive/coffee.md`, and the folder if need be. Into the folder it is in already, the copy goes beside it as
`name-copy`, as without a path. Any other path is the copy's whole path. An existing file there is refused (exit 5).
Links aren't rewritten: the copy says what the original says.

`--json`: `{from, to, dir}`.

### `rm`

Moves a note, file or folder to slipbox's trash, which is kept in slipbox's own state, never in your folder. It says
how many links from other notes will break.

```bash
slipbox rm ideas/tea.md --dry-run
slipbox rm ideas/tea.md
```

- `--dry-run`: say what it would do, and the links that would break.

`--json`: `{path, dryRun, breaking, trashed}`: `breaking` the links that break, `trashed` the trash item
`{id, abs, shown, dir, at}` (`null` on a dry run).

### `trash`

Lists what's in the root's trash, newest first; `trash restore` puts an item back where it was; `trash empty` empties
it.

```bash
slipbox trash
slipbox trash restore ideas/tea.md
slipbox trash empty
slipbox trash empty --yes
```

`restore` takes the item's id or its path. Something now where it was is refused (exit 5); nothing of that name in
the trash is exit 3.

`empty` lists what it would remove, and removes nothing until you add `--yes`; then everything in the trash is gone
for good. The trash keeps an item 30 days in any case: anything deleted longer ago is removed the next time the trash
is read or written.

`--json`: `[{id, abs, shown, dir, at}]`; `restore` gives the item put back; `empty` gives `{removed, items}`, the items
removed (or, without `--yes`, that would be) and whether they were.

### `rename-heading`

Renames a heading, found by its text in any case or by its slug, and rewrites every link to it: `[x](note.md#old)` in
whichever form each has (the slug, or the text encoded), and the note's own `[x](#old)`, in this root and the roots
linking into it.

```bash
slipbox rename-heading coffee Brewing 'Making it' --dry-run
```

Refused (exit 5) when the note has no such heading, has two of that name (a link couldn't tell them apart), or already
has one with the new name. `--dry-run`, `--plan`; `undo` takes it back. `--json`: [a
change](#moving-copying-and-deleting), `kind` `heading`.

### `relink`

Fixes links a move broke: links that reach nothing, whose file slipbox saw move, rewritten to where it is now. Given no
note, it does every note, and also what a move of the whole root by hand broke: its links out, and other roots' links
into it. It also offers a pointer for a relative link into a named folder that doesn't travel with this one.

```bash
slipbox relink --dry-run
slipbox relink inbox
```

A move slipbox saw is one it made, or one git recorded between two commits of the same branch (after a pull or a
merge). [Links and roots](links-and-roots.md) covers repairs. `--dry-run`, `--plan`; `undo` takes it back.
`--json`: [a change](#moving-copying-and-deleting), `kind` `relink`.

### `convert-links`

Rewrites a note's links (or every note's) as plain relative paths, once: each wikilink becomes a markdown link (an
embed an image-syntax one), and each link written from the root (`/ideas/coffee.md`) becomes relative, so it reads
the same in any tool. A heading becomes its slug, a wikilink's alias the link's text.

```bash
slipbox convert-links --dry-run
slipbox convert-links inbox
```

What it can't decide is left as written and said in the warnings: a link that reaches nothing, a heading or block
that isn't there, and a link several notes answer to (listed in `ambiguous` as `{key, shown, line, written,
candidates[]}`, for you to write as a path or pick in the screen). Wikilinks in code and in front matter are text,
and stay. A root nested in this one is converted on its own. `--dry-run`, `--plan`; `undo` takes it back.
`--json`: [a change](#moving-copying-and-deleting), `kind` `convert`.

### `undo`

Takes back the root's last `mv`, `name`, `rename-heading`, `relink`, `convert-links` or `replace --all`, made in the
screen or by a command alike: every file it rewrote gets its text back exactly, what moved moves back, and folders it
made go if empty. The next `undo` takes back the one before; the root keeps the last 20.

```bash
slipbox undo --dry-run
slipbox undo
```

Refused (exit 5) when a file it wrote has changed since, or what moved isn't where it went; put the file back and it
goes through. In a git repository, a change is undone only on the branch it was made on. Nothing to undo is exit 3.
`init` and `deinit` aren't among these: each takes the other back. `--dry-run`, `--plan`. `--json`: [a
change](#moving-copying-and-deleting), the change taken back, with `undo`.

### `apply`

Writes a plan saved with `--plan`, then forgets it. Without an id, it lists the plans waiting, newest first.

```bash
slipbox mv ideas/coffee.md ideas/drinks/coffee.md --plan
slipbox apply
slipbox apply <id> --dry-run
slipbox apply <id>
```

`<id>` is the id `--plan` printed. Refused (exit 5), nothing written, when any file in the plan changed since it was
made: a stale plan is never applied. `--dry-run` shows it again, and warns when it's stale. A plan that isn't there is
exit 3.

`--json`: the plan's [change](#moving-copying-and-deleting); listing, `[{id, made, root, command, kind, from, to,
files}]`, `files` a count.

## Roots and named folders

A root can have a name, which other folders' links use to reach it wherever it is on each machine:
`slipbox://notes/ideas/coffee.md`. The name is its `.slipbox/` folder's, else its git remote's last part (a repository
cloned from `github.com/me/research` is `research`), never the folder's own name. [Links and
roots](links-and-roots.md) explains names and pointers.

### `info`

Says how slipbox sees the folder you're in: the root, its name and copies, how links are written here and what said
so, the index, the settings files read, and where the cache, state and scratch are. A good first command in a new
folder.

```bash
slipbox info
```

```text
slipbox   0.2.0
root      /home/you/notes (root)
name      notes
links     markdown links, relative, with .md — style: the notes, 100% of 382 links; …
```

`--json`: `{version, release, root, mode, name, key, markerVersion, config{user, sources[], theme}, cache, state,
scratch, notes, index{…, written, reached}, background{…}, search{engine, index}, skipped[{rel, reason}], folder,
links, stale[]}`.

- `mode` is `root` for a root, `folder` for a plain folder; `release` is `null` when slipbox runs from its source.
- `folder` is the root's name: `{name, pointer, remote, id, private, copies[{path, seen, here, available}],
  default}`, or `null`. `pointer` is the name pointers use; `default`, the copy links open.
- `links` is the convention: `{style, path, extension}`, each `{value, source, why}`, `source` being `setting`,
  `tool`, `notes` (with `share`, a percentage) or `default`.
- `skipped` lists what the walk left out, and why (too large, a symlink out of the root, a nested root).

### `init`

Gives a folder a `.slipbox/` folder, which makes it a root and holds its own settings; with `--name`, a name. Without
a folder, the current one.

```bash
slipbox init ~/notes --name notes
slipbox init ideas --name ideas --dry-run
slipbox init ideas --name ideas
```

- `--name <name>`: name it. A name a different folder already has is refused (exit 5); a clone's repository is no
  different folder, so a clone may take its name.
- `--private`: keep `.slipbox/` out of git (listed in the repository's exclude file).
- `--dry-run`: say what it would do, writing nothing. What the run would refuse, a name taken say, it refuses too
  (exit 5).

On a folder inside a root, it makes that folder a root of its own and rewrites the links that would stop reaching
across the new boundary (a link from the root, `/…`, and a wikilink by name across it). That's a change like a
rename: `--plan` works there, and `deinit` takes it back. Making a `.slipbox/` anywhere else has no edits to plan, so
`--plan` is a usage error there (`--dry-run` previews it).

`--json`: `{root, created, identified, id, name, excluded}` (`excluded`, the file `--private` listed it in); with
`--dry-run`, `{root, dryRun}`. On a folder inside a root, [a change](#moving-copying-and-deleting), `kind`
`make-root`, with `root`, `name`, `id` and `created`.

### `deinit`

Makes a root nested inside another a plain folder of it again, rewriting links the other way: its paths from its root
gain its folder, and a name the parent's notes share becomes a path. Its `.slipbox/` goes to the parent's trash
(`trash restore` makes it a root again), and its pointers, in every root this machine has indexed, become relative
paths or the parent's pointer.

```bash
slipbox deinit ideas --dry-run
```

Only a root nested in another, made a root by its `.slipbox/` alone, can be: anything else is refused (exit 5). A git
repository, say, stays a root with or without `.slipbox/`. `--dry-run`, `--plan`.
`--json`: [a change](#moving-copying-and-deleting), `kind` `unmake-root`.

### `name`

Names this root as pointers name it. A root with a `.slipbox/` has its name changed, the old one kept, so pointers by
the old name still find it (and `relink` rewrites them). A repository without one is given a `.slipbox/` to hold the
name.

```bash
slipbox name journal --dry-run
slipbox name journal
```

A name a different folder has here is refused (exit 5), and so is a plain folder (`init` makes it a root first), or
a `.slipbox/config.toml` whose `[vault]` table the edit can't follow (edit it by hand). A clone may take its
repository's name, as `init --name` may give it: a copy of the repository is no different folder ([Copies of a
folder](links-and-roots.md#copies-of-a-folder)). `--dry-run`; `--plan` where a `.slipbox/` exists (making one has
nothing to plan: exit 2). `--json`: [a change](#moving-copying-and-deleting), `kind` `root`; for a repository given a
`.slipbox/`, `{root, name, id, created}`.

### `folders`

The named folders this machine knows: each name, its copies, and the copy links open (`*`). slipbox learns them from
the folders you open and from the background index. `folders default <name> <path>` makes that copy the one links
open.

```bash
slipbox folders
slipbox folders default notes ~/notes
```

A copy that's gone is listed as not here, and another copy answers meanwhile. A name two folders share is ambiguous
(exit 4, each folder's path among the candidates) until one is renamed. A clone with a `.slipbox/` name of its own is
listed under that name, and is still a copy of its repository: the repository's full name opens its default copy, and
`folders default` can make the clone that copy. The repository then lists it too, marked `*`, with its name.

`--json`: `[{name, pointer, remote, id, private, aliases[], old[], default, copies[{path, seen, found,
available}]}]`, `old` being the names it had; `default` gives `{name, default}`. A path that isn't a copy of the
folder (or of its repository) is refused (exit 5), and an unknown name is exit 3.

## Git

These compare what this branch changed with its base, as a pull request does: from where the branch left the base
(the merge base), committed or not. The base is `--base <ref>`, else [`git.base`](configuration.md), else `main`,
else `master`. Outside a git repository, or with no base, they're exit 3. [Git](git.md) covers git in the screen.

### `changed`

Every file of the root this branch changed, untracked ones included: `+` new, `M` modified, `R` renamed (with where
from), `D` deleted, `!` in conflict.

```bash
slipbox changed
slipbox changed --base main
```

`--json`: `{base, mergeBase, files[{path, state, from?}]}`, `state` being `new`, `modified`, `renamed`, `deleted` or
`conflict`.

### `diff`

A note's changes on this branch: each group headed `@@ line N` (where the change starts), then its lines with `-`,
`+` or a space before them, three lines of context around each change. A note the base doesn't have is all `+`.

```bash
slipbox diff README.md
```

- `--base <ref>`: compare with this instead.

`--json`: `{path, base, mergeBase, new, rows[{kind, text, line}]}`. `kind` is `@@` (a group's head), `-`, `+`, or a
space (a line both have); `line` is the line in the note as it is now (a removed line's, where it was).

### `worktrees`

The repository's checkouts, the main one first, each with its branch and folder, and this root's folder in it. `*`
marks the one you're in.

```bash
slipbox worktrees
```

`--json`: `[{path, branch, head, main, root, current}]`, `root` being this root's folder in that checkout.

### `merge-review`

Before you merge a branch, the links the merge would break. Git can't see these: a branch that moves
`docs/plan.md` and another that adds a link to it change different files and merge cleanly, with the link broken.
slipbox asks git for the merge's result without touching your working folder or branch (it needs git 2.38 or later)
and checks every link in its notes.

```bash
slipbox merge-review fix/retry
```

```text
merging fix/retry into main: 1 link would break
  README.md:12:3  docs/plan.md — fix/retry moves docs/plan.md to docs/design/plan.md — the fix: docs/design/plan.md
```

- `--into <ref>`: the branch merged into (by default, the one checked out).

Each break says why: `moved` (a branch moved the file, `to` where, and `fix` the link to write instead), `deleted` (a
branch deleted it, or moved it out of the root), `note-moved` (the linking note moved without its relative link), or
`missing` (neither branch had it). Only committed work counts. Branches with no commit in common are refused, as git
refuses to merge them; a branch that isn't there is exit 3.

`--json`: `{into, from, base, tree, conflicts[], breaks[{path, line, column, target, names, cause, by, to, fix}]}`,
`conflicts` being the files git couldn't merge.

## The scratch and the context bundle

The scratch is a Markdown file per root where you, your editor or an agent collect references and notes to hand to
an agent; you read it in the screen with `space s s` ([The scratch](editing.md#the-scratch)). By default it's kept in
slipbox's state, not among your notes; [`capture.location`](configuration.md) `= "root"` keeps it in the root, as
[`capture.file`](configuration.md) names it. A plain folder's scratch is always in slipbox's state.
[Working with agents](../guides/agents.md) shows it in use, and nvim keybindings that capture.

### `capture`

Appends to the scratch: some text, a reference to lines of a file, or both, each entry after a blank line.

```bash
slipbox capture "Ask about the grinder"
slipbox capture --ref ideas/coffee.md:5-6 --snippet
printf 'brew ratio 1:16\n' | slipbox capture --stdin --lang text
```

- `--ref <reference>`: lines of a file, as `path:42`, `path:42-50`, `path:42:10-30` (columns 10 to 30 of line 42) or
  `path:42:10-50:30` (line 42 column 10 to line 50 column 30). Lines count from 1, in order. A path inside the root
  is stored relative to it. A file that isn't there, or a line past its end, is kept with a warning.
- `--snippet`: the referenced lines read from disk and added, fenced, in the file's language; past the file's end is
  exit 3.
- `--stdin`: read from stdin. With `--ref`, stdin is the snippet (a selection piped from your editor); without, it's
  the text. Empty stdin is refused (exit 2).
- `--lang <language>`: fence stdin as code in this language.

The human output is the scratch's path. `--json`: `{scratch, project, entry}`, `project` being the root and `entry`
what was added.

### `scratch`

```bash
slipbox scratch
slipbox scratch path
slipbox scratch copy
sha=$(slipbox scratch show --json | jq -r .data.sha)
slipbox scratch clear --if-unchanged "$sha"
```

- `show` (also plain `scratch`): its text. `--json`: `{path, content, sha}`.
- `path`: where it is. `--json`: `{path, exists}`.
- `copy`: onto the clipboard: through the terminal (OSC 52, which works over SSH), else a clipboard program, else a
  file in slipbox's state, said. An empty scratch is exit 3. `--json`: `{path, chars, methods[], file, confirmed}`,
  `methods` being how it was copied, `confirmed` whether a clipboard program took it (a terminal never says).
- `clear`: empty it. With `--if-unchanged <sha>` (the `sha` from `show`), refused (exit 5) if something was added
  since you read it. `--json`: `{path, cleared, previousSha}`.

### `context`

Writes one Markdown document for an agent: the notes you name, what they link to, and what links to them, each with
its path and why it's there, then its text as it is on disk, fenced. It's the scratch's other half, gathered from
the links instead of by hand.

```bash
slipbox context ideas/coffee.md
slipbox context coffee inbox --depth 2 --limit 40 --no-backlinks
slipbox context coffee --copy
```

Each file is a `## path` section with its reference (`` `path:1-N` ``) and why it's included (`asked for`, `linked
from …`, `links to …`). Another root's note is included but not followed. Left out, and named in a last
`## Left out` section: pictures and other binary files, files over 256 KB, and whatever is past the limit.

- `--depth <n>`: how many links out to follow, 0 to 5 (by default [`context.depth`](configuration.md), 1).
- `--no-backlinks`: leave out the files linking in (by default as [`context.backlinks`](configuration.md) says).
- `--limit <n>`: at most this many files, 1 to 500 (by default [`context.limit`](configuration.md), 25).
- `--copy`: put it on the clipboard instead, as `scratch copy` does; the output says how, and how big.

`--json`: `{start[], depth, backlinks, limit, files[{path, why, depth, from, lines}], left[{path, why, from,
reason}], chars, text}`, `why` being `start`, `link` or `backlink`, a left-out file's `reason` `limit`, `binary`,
`size` or `unreadable`; with `--copy`, `copied` too.

## Your editor

### `send`

Opens a note in an editor that's already running, at a line, as `space n s` does in the screen. By default that's a
running nvim (0.9 or later): the one you last picked in the screen while it answers, else the only one running, else
the one working in the note's folder. [`editor.remote`](configuration.md) can name another editor.

```bash
slipbox send coffee --line 8
```

- `--line <n>`: the line, from 1 (by default 1).
- `--server <socket>`: the nvim to use. With an editor command that names no `{server}`, a warning says it has no
  effect.

No nvim running, or none at `--server`, is exit 3; several and no way to choose is exit 4, with the candidates as
`{socket, cwd, file}`. An editor that won't start or fails is exit 1. `--json`: `{path, line, server, commands[]}`,
the commands it ran.

## Exporting

### `export`

Writes notes as one document: Word (the default), PDF, a web page, an e-book or portable Markdown, a chapter for each
note in the order given. [Exporting](export.md) says what each format keeps.

```bash
slipbox export ideas/coffee.md
slipbox export coffee --to pdf
slipbox export coffee inbox -o exports/coffee.docx
```

- `--to docx|pdf|html|epub|md`: the format; else `-o`'s extension says, else Word.
- `--out <path>` (or `-o`): where to write it. A folder, or a path ending in `/` (made if it isn't there), puts it
  there under the first note's name.

Without `-o`, it goes beside the first note under its name (`ideas/coffee.docx`); Markdown's as `coffee.export.md`,
its pictures in `coffee.export.assets/` (the root's only; anything else stays a link). The other formats hold the
root's pictures only, too: one from outside it is its alt text. A file already at the path is replaced without
asking, but never a note, of this root or another (exit 5), other than an earlier Markdown export
([Exporting](export.md#from-the-command-line)). It fetches nothing from the network. `--json`:
`{path, format, notes[], bytes, files[]}`, `files` being the pictures written beside it.

## Code

[Code](code.md) explains language servers, linters and trust; these two commands show what slipbox would run, and
what it finds.

### `doctor`

Lists each language's language servers and linters, and for each where it was found (in the project, on your `PATH`,
where you install tools, or slipbox's own installs), that slipbox installs it from npm when it's first needed, or how
to get it. Given a file, it says that file's language, its project folder, which servers and linters would serve it
there and which it would lack. [Troubleshooting](troubleshooting.md) starts here.

```bash
slipbox doctor
slipbox doctor src/shelf.ts
```

In a root you don't trust, a warning says what that leaves out. A note is exit 3: slipbox serves notes itself.
`doctor` only looks; it installs nothing.

`--json`: `[{languages[], servers[{name, role, status, where, path, package, hint, requires}], linters[{name,
program, where, path, hint, markers, required}]}]`; for a file, `{language, languageId, root, trusted, limits[],
skipped[{name, why}], run[], missing[], linters[]}`, each linter with its `root` (`null`: not run).

### `diagnostics`

A file's problems from every source, one line each, sorted by place: its language servers' (started, told the file,
and waited for until each has answered and gone quiet), its linters', its syntax errors when no server answered, and
for a note, its own (links that reach nothing, merge conflict markers) and your Markdown linter's.

```bash
slipbox diagnostics ideas/coffee.md
slipbox diagnostics ideas/coffee.md --severity info
```

Each line is `path:line:column: severity source code: message`.

- `--severity <level>`: the least shown, `error`, `warning`, `info` or `hint` (by default
  [`diagnostics.severity`](configuration.md), `warning`).
- `--timeout <seconds>`: the longest to wait for the servers (60 by default); one that said nothing by then is named
  in a warning.

Starting a language server can install it from npm first, as the screen does ([Code](code.md)). The exit code is 1
when an error is shown, else 0; `ok` is true either way, as the run itself succeeded. A file that isn't there is
exit 3.

`--json`: `{path, language, problems[{line, column, endLine, endColumn, severity, source, code, message}],
sources[{name, kind, status}]}`, each source's `kind` being `server`, `linter`, `syntax`, `slipbox` or `lint`.

## slipbox itself

### `themes`

The themes you can use, built in and your own, the one in use marked `*`.

```bash
slipbox themes
```

`--json`: `[{name, source, path?, current}]`, `source` being `built-in` or `user` (with its `path`).

### `commands`

Every named command, the screen's actions included, with its command-line equivalent, or `(interaction)` for one
that only makes sense in the screen.

```bash
slipbox commands
```

`--json`: `[{id, title, cli, desc}]`, `cli` being `null` for an interaction.

### `upgrade`

Installs the latest release, checked before it's used, when slipbox was put here by its installer; the version it
replaces is kept. [Installing slipbox](../guides/install.md) covers installing.

```bash
slipbox upgrade --check
slipbox upgrade
```

- `--check`: only say whether there's a newer one.

Installed by Homebrew, it says `brew upgrade slipbox` does it; run from source, that there are no releases to follow
(both exit 1). The command line never checks for updates by itself ([Privacy](privacy.md)). `--json`: `{status,
from, latest, removed[]}`, `status` being `upgraded`, `current` or `available`.

### `uninstall`

Lists what the installer put here (the `slipbox` link, the versions) and slipbox's own folders, and removes the
installer's files only with `--yes`. Your notes, and the `.slipbox/` folders in them, are never touched.

```bash
slipbox uninstall
slipbox uninstall --purge --yes
```

- `--yes`: remove them. Without it, it only lists.
- `--purge`: slipbox's four folders too: your settings, its state (sessions, the scratch, the trash), its data (your
  own words, the language servers it installed) and its cache.

`--json`: `{purge, removed, remove[{path, what}], keep[{path, what}], notes[], failed[]}`. Exit 1 when something
couldn't be removed.

### `help`

`slipbox help`, or `--help` anywhere, prints every command with its flags. With `--json`, the text is `data.text`.
`slipbox lsp` isn't a command: it says why on stderr and exits with 2, so an editor set up to start it shows the
reason in its log.

## For agents and scripts

Agents have a guide of their own, the skill: `skills/slipbox/SKILL.md` in slipbox's source. It tells an agent which
command to use for what, to parse `--json`, and to write with `--if-unchanged`. [Working with
agents](../guides/agents.md) shows how to install it.

A few habits keep a script or an agent safe:

- Parse `--json`, never the human output, and check the exit code.
- Before rewriting a note, read its `sha`, and write with `--if-unchanged`. Check `stale`: a note listed there has
  unsaved changes in your screen, and writing it brings up the conflict prompt there.
- Preview changes that touch many files with `--dry-run`, or `--plan` them and `apply` after a look.
- Write a link with `slipbox link`, so it follows the folder's convention.
- Never write into `.slipbox/` or slipbox's own folders; `info` shows where they are.
