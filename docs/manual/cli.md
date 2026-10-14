# The command line

Most of what slipbox does is also a command you can type in a shell. With the commands, you can:

- read a note
- find text
- write safely
- follow and fix links
- move files with their links kept
- capture references for an agent
- export

The commands work on the same files as the screen, so you can mix them freely. Run one in a pane beside slipbox, and the
screen reloads what it changed.

The commands serve three kinds of caller:

- You, at a prompt, get short readable output.
- A script or an agent adds `--json`. It gets one JSON object it can parse, with exit codes it can rely on.
- An editor keybinding calls `slipbox capture` or `slipbox send`.

This chapter covers every command, for all three. For each command, it says what the command is for, its flags, and what
it prints. [Working with agents](../guides/agents.md) walks through a session beside an agent.

## Running a command

A command is `slipbox`, the command's name, its arguments and its flags:

```bash
cd ~/notes
slipbox find coffee
slipbox read inbox
slipbox help
```

`slipbox help` lists every command with its flags. `--help` (or `-h`) after any command prints the same list.
`slipbox --version` (or `-V`) prints the version.

- **Flags go anywhere.** They can go before the command, after it, or between its arguments. A flag's value follows it,
  as `--width 80` or `--width=80`.
- **After `--`, nothing is a flag.** Text that starts with a dash (a list item) goes there. So does a note whose name
  starts with a dash. For example, `slipbox write inbox --append -- '- call the plumber'` and
  `slipbox read -- -dash.md`. The error for a stray dash says so.
- **Mistakes are refused, never guessed at.** Each of these is a usage error, exit code 2, and nothing is done:
  - an unknown flag
  - a flag the command doesn't take (`write --dry-run` would otherwise write)
  - more arguments than the command takes
  - an empty value (`--root ''`)

### Opening the screen

`slipbox` with no command, or with a path, opens the screen. You can also spell it `slipbox open [path]`. The screen
opens on the folder or note you name, or else on the current folder. [Getting started](../guides/getting-started.md)
shows a first session.

It takes `--root`, `--config` and `--theme` (a theme for this session). With `--json`, `--help` or `--version`, it runs
the command line instead. Other flags are ignored, and an unknown one is a usage error. A path that isn't there is said
in a line, with exit code 3, before the screen is taken.

The screen needs a terminal. Started from a script, with stdin or stdout not a terminal, slipbox doesn't start the
screen. It prints a hint to use a command instead, and exits with 2. It never paints escape codes into a pipe.

## Where a command works

Each command works in a root. The root is the folder:

- whose notes the command reads
- where `/` in a link starts
- where a wikilink's names are looked up
- whose settings and link convention apply

A file's root is the nearest folder above it that holds a root marker. The root markers are `.git`, `.slipbox/`,
`.obsidian/` and `.zk/` (the setting [`walk.root_markers`](configuration.md)). A command finds the root from the note
you name, or else from the folder you run it in.

A folder with no marker above it works too, as a plain folder of its own. Your home folder and `/` are never roots.
Opened as plain folders, they're listed a level at a time, never walked or indexed. [Links and
roots](links-and-roots.md) explains roots, plain folders and names.

`--root <folder>` says where to start instead. It must name a root (exit 3 otherwise). A note you name is looked for
there. A file still belongs to its nearest root. So a note in a root nested inside `--root` belongs to that nested root.

Running a command writes nothing into your folders. slipbox keeps its index, the scratch, the trash and the rest in
folders of its own, each root's apart ([Where slipbox keeps things](configuration.md#where-slipbox-keeps-things)).
`slipbox info` says where. Only the commands that change files on purpose write, and only inside the note's root.

## Naming a note

Where a command takes `<note>`, you can name it in any of these ways, tried in this order:

1. **A path from the current folder**, such as `ideas/coffee.md` or `../notes/inbox.md`. A file the root's walk leaves
   out (git-ignored, or in a hidden folder) is still read when you name it by its path.
2. **A pointer** to a named folder's file, wherever that folder is on this machine, such as
   `slipbox://notes/ideas/coffee.md`. The command then works in that folder, as it would with the file's path. A folder
   that isn't on this machine is exit 3, and so is a branch that isn't checked out. A name two folders share is exit 4.
3. **A path from the root**, whichever folder you're in.
4. **A note's name**: its file name without the extension, or an alias from its front matter. `coffee` is
   `ideas/coffee.md`. When several notes share the name, the one written in the same case wins. Next, the one in the
   fewest folders wins. A real tie is exit 4, with the candidates. `--from <note>` then picks the one nearest that note.
   A name never depends on the folder you're in.
5. **A data or text file** of the root, by its path with the extension, such as `config/app.toml` or `tools/sync.py`.
   It's read and written as it is, never as a note.

A pointer is also accepted wherever a command takes a note or `--from`. A folder's name and a path joined by a colon,
such as `notes:ideas/coffee.md`, isn't a pointer. When a named folder has that name, it's exit 3, and the message gives
the pointer that names the file.

## What a command prints

### For people

Output goes to stdout. Warnings and errors go to stderr. A warning starts `slipbox: warning:`, and an error starts
`slipbox:`.

Text that comes from your notes (a heading, a link's text, a path) is cleaned of control characters before it reaches
your terminal. So a note can't move your cursor or change your terminal's title. Only `render` adds escape codes, for
its colours.

### For programs: `--json`

With `--json`, a command prints exactly one JSON object on stdout, whatever happens. That includes a usage error, `help`
(its text in `data.text`) and `--version` (`data.version`).

```json
{"schema": 1, "ok": true, "command": "links", "data": [], "warnings": [], "stale": []}
```

```json
{"schema": 1, "ok": false, "command": "read", "error": {"code": 3, "message": "no note or file \"tea\" in …"},
 "data": null, "warnings": [], "stale": []}
```

- `schema` is the format's version, apart from slipbox's. It changes only when a stable command's output changes
  ([below](#what-stays-stable)).
- `ok` says whether the command succeeded. When it didn't, `error` has the exit code and the message.
- `data` is the command's answer, given with each command below. On some failures it says more, such as the candidates
  of an ambiguous name, or a note's current `sha` when `--if-unchanged` refused. Otherwise it's `null`.
- `warnings` are what the human output prints on stderr.
- `stale` lists the notes a running slipbox holds with unsaved changes ([below](#unsaved-changes-in-a-running-slipbox)).

Values are whole, never shortened. Characters a terminal would act on (C1 controls, DEL, bidirectional controls) are
escaped as `\uXXXX`. So the raw object is safe to print.

The shapes below use a short notation:

- `{path, sha}` is an object with those keys.
- `files[]` is a list.
- `files[{path, line}]` is a list of such objects.
- `key?` is there only sometimes.

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Done |
| 1 | An error: something failed (a file that doesn't parse, git couldn't answer, an editor wouldn't start) |
| 2 | A usage error: an unknown flag, a missing argument, a bad value. Nothing was done. |
| 3 | Not found: a note, a link's target, a task's line, the `--root` folder, a pointer's folder |
| 4 | Ambiguous: a name or a link several notes answer to, or several running nvims for `send` |
| 5 | Refused: a stale `--if-unchanged`, a write outside the root, over an existing file, or to a binary file |

Exit code 5 also covers:

- a note or stdin that isn't valid UTF-8 (never rewritten, so no byte is lost)
- a read of a symlink leading out of the root

`diagnostics` exits with 1 when it shows an error. `uninstall` exits with 1 when it couldn't remove something.

### Unsaved changes in a running slipbox

A command reads and writes the files on disk, never what the screen holds unsaved. What you've saved is what a command
sees. A command writes each file atomically (a new file, renamed into place), so a reader never sees half of one. When a
command writes a note the screen has open, the screen reloads it. If you have unsaved changes there, the screen asks
what to do ([Editing](editing.md)).

Every command checks which notes a running slipbox holds with unsaved changes, so a script or an agent can tell. The
human output warns (`unsaved changes in a running slipbox: inbox.md`). `--json` lists them in `stale`. The check is
advice, never a lock. A write still goes through.

### Lines and columns

Lines count from 1 everywhere.

A link's `column` counts UTF-16 units from 1, as editors and language servers count. (`🌍` is two.) A link's `end` is the
line and column just after its last character.

`find`, `replace` and `spell` count columns in characters (code points).

### What stays stable

slipbox is young, and most commands may still change before its 1.0. These commands are stable, and their output changes
only with a new `schema`:

- `render`, `capture`, `scratch` (`show`, `path`, `clear`, `copy`)
- `resolve`, `links`, `backlinks`, `problems`, `tags`
- `changed`, `diff`, `merge-review`, `worktrees`

The exit codes and the `--json` envelope are stable for every command. [Versions](versions.md) says what each kind of
release may change, and how a command or a flag is retired.

## Flags every command takes

| Flag | What it does |
| --- | --- |
| `--root <folder>` | Where to start: a root ([Where a command works](#where-a-command-works)) |
| `--config <file>` | Your settings from this file, instead of `$SLIPBOX_CONFIG` or `~/.config/slipbox/config.toml` |
| `--json` | One JSON object on stdout ([For programs](#for-programs---json)) |
| `--color <when>` | Whether `render` colours its output: `auto` (the default), `always` or `never` |
| `--plain` | No colour and no other escape codes (`render`) |
| `--from <note>` | The note a link is written in (`resolve`, `link`). Of several notes of a name, the nearest. |
| `-h`, `--help` | The list of commands and their flags |
| `-V`, `--version` | The version |

Every command checks `--color`'s value, even one that draws nothing. [Configuration](configuration.md) has the settings
files and the environment variables.

## Every command

| Command | What it does |
| --- | --- |
| [`render`](#render) | A note drawn as text, for reading in a terminal |
| [`read`](#read) | A note's text exactly, and its `sha` |
| [`stat`](#stat) | A note's size, dates, title, counts and front matter |
| [`outline`](#outline) | A note's headings with their lines |
| [`ls`](#ls) | The notes of the root |
| [`tags`](#tags) | The tags and how many notes carry each; a tag's notes |
| [`types`](#types) | Document types (ADRs and the like) and their notes |
| [`history`](#history) | The notes you read in the screen, and what's open there |
| [`find`](#find) | Every match of some text, in a note or every note |
| [`search`](#search) | Notes ranked by words |
| [`index`](#index) | Build or refresh the indexes |
| [`write`](#write) | Replace, append to or create a note |
| [`replace`](#replace) | Replace text in a note, or in every note |
| [`task`](#task) | List a note's tasks, or tick one |
| [`footnotes`](#footnotes) | List, add, edit, rename or remove footnotes |
| [`spell`](#spell) | The words a note's dictionaries don't know |
| [`mkdir`](#mkdir) | Make a folder |
| [`resolve`](#resolve) | Follow a link to the file it reaches |
| [`link`](#link) | A link to a note, written as this folder writes links |
| [`links`](#links) | A note's links, each with what it reaches |
| [`backlinks`](#backlinks) | The notes and files linking to a note |
| [`problems`](#problems) | Broken and ambiguous links, orphans, merge conflicts, front matter breaking its rules |
| [`mv`](#mv) | Rename or move a note, file or folder, every link to it kept |
| [`cp`](#cp) | Copy a note, file or folder |
| [`rm`](#rm) | Delete to slipbox's trash |
| [`trash`](#trash) | What's in the trash; put something back, or empty it |
| [`rename-heading`](#rename-heading) | Rename a heading and every link to it |
| [`relink`](#relink) | Fix links a move broke |
| [`convert-links`](#convert-links) | Turn wikilinks and links from the root into relative paths |
| [`undo`](#undo) | Take back the last rename, move, relink, conversion or replace |
| [`apply`](#apply) | Write a plan saved with `--plan` |
| [`info`](#info) | The root, its name, its link convention, where its state is |
| [`init`](#init) | Give a folder a `.slipbox/` folder, and a name |
| [`deinit`](#deinit) | Make a root nested in another a plain folder again |
| [`name`](#name) | Name this root, as pointers name it |
| [`folders`](#folders) | The named folders this machine knows, and their copies |
| [`changed`](#changed) | What this branch changed against its base |
| [`diff`](#diff) | A note's changes on this branch |
| [`worktrees`](#worktrees) | The repository's checkouts |
| [`merge-review`](#merge-review) | The links a merge would break |
| [`capture`](#capture) | Add text or a file reference to the scratch |
| [`scratch`](#scratch) | Show, locate, copy or clear the scratch |
| [`context`](#context) | A note and its neighbours as one document for an agent |
| [`send`](#send) | Open a note in your running editor |
| [`export`](#export) | Notes as Word, PDF, a web page, an e-book or Markdown |
| [`doctor`](#doctor) | The language servers and linters slipbox would use, and where they are |
| [`diagnostics`](#diagnostics) | A file's problems from every source |
| [`themes`](#themes) | The themes you can use |
| [`commands`](#commands) | Every named command, and its command-line equivalent |
| [`upgrade`](#upgrade) | Install the latest release |
| [`channel`](#channel) | Which releases slipbox follows: stable ones, or previews too |
| [`uninstall`](#uninstall) | Remove what the installer put here |
| [`skill`](#skill) | The skill for agents: printed, or installed where an agent finds it |
| [`help`](#help) | This list, in the terminal |

## Reading

### `render`

Draws a note as the screen does, as text:

- headings
- tables laid out to the width
- code highlighted
- embedded notes drawn in place

Use it to read a note in a terminal, or to hand a readable copy to another program. [Reading](reading.md) shows what
each part of a note looks like.

A data file (TOML, YAML, JSON, CSV and the like) renders too. A code or other text file has no rendering. That's exit 2,
and `read` gives its text. Data that doesn't parse is exit 1, with the error.

```bash
slipbox render ideas/coffee.md
slipbox render coffee --width 80 --plain
```

- `--width <columns>`: the width to lay it out at. It's a whole number from 20 to 1000. By default it's the terminal's
  width, or else 100.
- `--theme <name>`: a theme for this one render, instead of the setting [`theme`](configuration.md). `slipbox themes`
  lists them.
- `--glyphs <set>`: `auto`, `nerd`, `unicode` or `ascii`, instead of [`render.glyphs`](configuration.md).
- **Colour** comes only when stdout is a terminal and `NO_COLOR` isn't set. `--color always` forces it, even with
  `NO_COLOR`. `--plain`, `--color never` or a pipe give none. Without colour, a link's address follows its text, as
  [`render.show_urls`](configuration.md) says.

With `--json`, the data is `{path, width, lines[], headings[{level, text, slug, line}]}`:

- `lines` are the rows as plain text.
- `width` is the width they were laid out at, once the margins are taken off.
- Each heading's `line` is its line in the file.

### `read`

Prints a note's text as it is on disk. With `--json`, you also get its `sha`. That's the fingerprint the safe writes
check ([Changing notes](#changing-notes)).

```bash
slipbox read inbox
slipbox read ideas/coffee.md --json
```

With `--json`, the data is `{path, abs, sha, bom, crlf, invalidUtf8, content}`:

- `content` is the text whole. (The human output has control characters removed.)
- `bom` says whether the file has a byte order mark, and `crlf` whether it has Windows line endings. Writes keep both.
- `invalidUtf8` says whether the file has bytes that aren't UTF-8. They're shown as `�`, and the note is never
  rewritten.

`read` reads the bytes and never parses the note. So it's quick even for a note too large for the index.

### `stat`

Gives a note's facts in one call, as the screen's Info view (`space n i`) shows them:

- its path and root
- its size and last change
- its title, tags and front matter
- how many headings, links and backlinks it has

```bash
slipbox stat coffee
```

With `--json`, the data is `{path, abs, root, name, properties, size, mtime, title, tags[], headings, links, unresolved,
backlinks, sha, bom, crlf, invalidUtf8}`:

- `properties` is the front matter, or `null`.
- `headings`, `links`, `unresolved` and `backlinks` are counts. `unresolved` counts the links that reach nothing.
- `root` is `null` in a plain folder.
- `name` is the root's name.

### `outline`

Lists a note's headings, each with the line it's on. A data file's outline is its sections, such as a TOML table or a
YAML key. A code file's outline is its definitions (functions, classes and so on), in a language slipbox has a grammar
for.

```bash
slipbox outline ideas/coffee.md
```

With `--json`, the data is `{path, headings[{depth, text, slug, line}]}`. A code file's headings have `kind`
(`function`, `class`, `method`…) instead of `slug`.

### `ls`

Lists the notes of the root, by path.

```bash
slipbox ls
slipbox ls --files
```

- `--files`: data and text files too (code, configuration).

With `--json`, the data is `[{path, title, size, mtime, tags[], links}]`, where `links` is a count. With `--files`, the
other files follow as `{path, group, format, size, mtime}`:

- `group` is `data` or `text`.
- `format` is the file's format (`toml`, `python`…).

### `tags`

Lists the tags in the root's notes, each with how many notes carry it. Given a tag, it lists the notes that carry it. A
nested tag counts under its parent. A note tagged `#coffee/espresso` is one of `#coffee`'s.

```bash
slipbox tags
slipbox tags '#coffee'
```

With `--json`, the data is `[{tag, count}]`. With a tag, it's `{tag, notes[]}`. A tag no note has is exit 3. The `#` is
optional.

### `types`

Lists document types. A document type is a set of notes that follow a convention, such as ADRs (architecture decision
records) or agent skills. slipbox finds them by where they are. The types your settings define are listed too
([`types`](configuration.md)).

- Without an argument, it lists each type, with how many notes are of it and how many break its rules.
- With a type, it lists the type's notes in order. Each has its number, title and status, and what supersedes it.

```bash
slipbox types
slipbox types adr
```

With `--json`, the data is `[{name, source, paths[], notes, problems}]`, where `source` is `built-in` or `config`. With
a type, it's `{name, source, paths[], notes[{path, title, number, status, supersededBy}]}`. An unknown type is exit 3.

[`problems`](#problems) lists each rule broken. [Finding things](finding.md) shows the types in the screen.

### `history`

Shows what you've been reading in the screen:

- the notes, newest first, each with the line you were on
- the tabs open now

The screen saves this a second after it changes, so it's current while slipbox runs. An agent uses it to see what you're
looking at.

```bash
slipbox history
```

With `--json`, the data is `{read[{path, at, line, exists}], open[], activeTab, current}`:

- `exists` is `false` for a note deleted since.
- `open` lists the tabs. Each tab is a list of its windows' notes.
- `current` is the note in the active window, or `null`.

## Finding

### `find`

Lists every match of some text, in one note or in every note of the root, each on its line. The matches aren't ranked.
For a ranking, use `search`.

```bash
slipbox find grind
slipbox find 'grind|roast' ideas/coffee.md --regex
```

- `--regex`: the text is a regular expression (JavaScript's).
- `--whole`: whole words only.
- `--ignore-case`: ignore case. Without it, case is ignored unless the text has a capital letter.
- `--files`: data and text files too, not only notes.

The human output is `path:line:column: the line`. A long line is shown as a window around the match, with `…` where it's
cut.

A note too large for the index is left out of a search of every note, with a warning. Name the note to search it.

With `--json`, the data is `{query, regex, whole, count, matches[{path, line, column, match, text}]}`. `match` is what
matched, and `text` is its line.

### `search`

Ranks the root's notes and data files by the words you give, as the screen's search does. Each hit is where the note has
most of the words.

You write the query as in the screen ([What you can type](finding.md#what-you-can-type)). It can hold:

- words
- `"a phrase"`
- `prefix*`
- `-word`
- `title:`
- `#tag`
- `path:`

[Finding things](finding.md#search) explains the ranking and where a hit opens. When no note has every word, the notes
with some of them are listed, with a warning.

```bash
slipbox search grind size
slipbox search '"cold brew" -decaf path:ideas/'
```

Flags:

- `--limit <n>`: at most this many hits, from 1 to 500 (20 by default).
- `--scope here|linked|all`: which roots to search.
  - `here` (the default) searches this root.
  - `linked` adds the roots its notes link to, and the roots linking to it.
  - `all` searches every root this machine knows.

This root's hits come first, then the others' by score. Neither `linked` nor `all` takes in a worktree, even one a note
links into. A worktree's notes are copies of its main checkout's.

Search uses the root's index when it has one ([`index`](#index)). The index is brought up to date with every file
changed since, whoever changed it. Until the index is built, search reads the files instead. It finds the same notes,
more slowly, with a warning. The setting [`search.engine`](configuration.md) can make it always use the index, or never.

With `--json`, the data is `{query, scope, engine, relaxed, roots[], hits[]}`:

- `engine` is `index` or `scan`.
- `relaxed` is true when not every word was found.
- `roots` are the other roots searched.

Each hit is
`{path, abs, shown, line, column, heading, section{name, line, end}, score, snippet, marks[], more, root, name}`:

- `snippet` is the line with most of the words.
- `marks` are the words' places in it, as `[start, end]` pairs.
- `heading` is the heading above it, and `section` the section it's in.
- `more` is the note's other sections with some of the words.
- `root` and `name` are another root's, else `null`.

### `index`

slipbox keeps two indexes for each root:

- The link index holds each note's title, tags, headings and links. Every command reads it.
- The search index holds the words, for `search`.

The screen keeps both up to date as it runs, and commands catch them up with what changed. `index` is for doing it now.
Without a flag, it builds the search index or brings it up to date.

```bash
slipbox index
slipbox index --rebuild
slipbox index --refresh
```

- `--rebuild`: start again from nothing.
- `--refresh [path]`: bring a root's link index up to date now. Every file's size and time is checked, and every folder
  listed again. Without `path`, it's this root's index. With `path`, it's the index of the root holding `path`, opened
  before or not. A path outside every root means the plain folder it's in.
- `--home`: run the background index of your home folder now, in the foreground. It finds the roots under your home
  folder and indexes each, so their links count as backlinks of the roots they reach. With `--budget <ms>`, it stops
  after that long, and carries on from there next time. The default, 0, is the whole pass. `--rebuild` starts a new
  pass.

With `--json`, the data is `{path, rebuilt, indexed, removed, files, ms}`. With `--refresh`, it's
`{root, notes, changed, unchanged, gone, reached, indexed, ms}`. With `--home`, it's
`{root, found, indexed, left, started, finished}`.

A plain folder listed a level at a time (your home folder, `/`) has no index. `index` there is exit 5.

## Changing notes

`write`, `replace`, `task` and `footnotes` change a note as the screen saves one:

- atomically, never half-written
- keeping its byte order mark and its line endings
- only inside the note's root, by its real path (a symlinked folder leading out is refused)
- only where the root's notes are, never in `.slipbox/`, `.git/`, `node_modules` or a hidden folder (unless you named a
  note there)
- never a binary file
- never a note that isn't valid UTF-8, since its bytes would be lost (a task can still be ticked)

A write any of these refuses is exit 5, with nothing written. Data and text files of the root are written as they are,
never parsed as notes.

**The safe way to change a note someone else may be editing** is to read its `sha`, then write with `--if-unchanged`. If
the note changed in between, the write is refused (exit 5) instead of overwriting the change.

```bash
sha=$(slipbox read ideas/coffee.md --json | jq -r .data.sha)
printf '# Coffee\n\nRevised.\n' | slipbox write ideas/coffee.md --stdin --if-unchanged "$sha"
```

The `sha` is the first 16 hex digits of the SHA-256 of the file's bytes. `read`, `task`, `footnotes` and
`replace --dry-run` report it. `write`, `replace`, `task` and `footnotes` take `--if-unchanged`. An empty sha is a usage
error, never a check that passes.

### `write`

Replaces a note's text, appends to it, or creates a new note.

```bash
slipbox write ideas/coffee.md --create '# Coffee'
slipbox write coffee --append -- '- try a finer grind'
slipbox write coffee --append --paragraph 'Espresso wants a finer grind than filter.'
printf '# Coffee\n\nNotes on brewing.\n' | slipbox write coffee --stdin
```

The text is the arguments after the note, joined by spaces and ending with a newline. With `--stdin`, it's stdin as it
comes.

- `--create`: make a new note. The argument is then a path, never a name. The path is from the root, or from the current
  folder when it starts with `./` or `../`. `.md` is added unless the name has an extension slipbox knows (`config.toml`
  stays as it is). An existing file is refused (exit 5), never overwritten. A name other notes already have is written,
  with a warning. Naming the note by that name now takes a path.
- `--append`: add the text at the end, on a new line.
- `--paragraph`: with `--append`, add the text after a blank line, so it's a block of its own. A line appended right
  after a table would become its next row.
- `--stdin`: read the text from stdin. It must be valid UTF-8 (exit 5 otherwise).
- `--if-unchanged <sha>`: write only if the note still has this sha (exit 5 otherwise).
- `--allow-empty`: empty the note on purpose. Without it, empty or blank text is refused (exit 2). So a failed program
  piped into `write` can't empty a note. With `--create` and no text at all, it makes an empty note to fill later, as in
  `slipbox write ideas/tea --create --allow-empty`.

A note that doesn't exist is exit 3 (add `--create`). A new name with a control character is refused (exit 5).

With `--json`, the data is `{path, created, shadows[]?, appended, previousSha, sha}`. With `--create`, `shadows` lists
the other notes of the same name. `previousSha` is `null` for a new note.

### `replace`

Replaces text in a note, every match unless you say otherwise. Run it with `--dry-run` first to see each line before and
after.

```bash
slipbox replace coffee finer coarser --dry-run
slipbox replace coffee finer coarser --first
slipbox replace coffee '^' '> ' --regex --lines 3-5
```

The text to find takes `find`'s flags (`--regex`, `--whole`, `--ignore-case`). With `--regex`, the replacement may use:

- `$&`, the match
- `$1` to `$9`, its groups
- `$$`, a dollar sign

With `--regex`, `^` and `$` are a line's start and end, and an empty match inserts. The last example uses this to quote
lines 3 to 5.

- `--first`: only the first match (in the range).
- `--first-per-line`: the first match on each line, as vim's `:s` without `g`.
- `--lines <a-b>`: only lines `a` to `b` (or one line, `12`).
- `--dry-run`: show what would change, and write nothing.
- `--if-unchanged <sha>`: only if the note still has this sha.

With `--json`, the data is
`{path, count, dryRun, sha, newSha, changes[{line, column, before, after, text, textAfter}]}`:

- `sha` is the note's sha before the change, the one `--if-unchanged` wants.
- `newSha` is its sha after the change (`null` on a dry run).
- Each change has the match and its replacement, and its line before and after (a window of a long line).

**In every note**, give `--all`, with the text and its replacement and no note:

```bash
slipbox replace --all 'cold brew' 'cold-brew' --dry-run
```

It works as a rename does ([Moving, copying and deleting](#moving-copying-and-deleting)):

- `--dry-run` shows each line it would change.
- `--plan` saves it for `apply`.
- `undo` takes it back.

`--files` covers data and text files too. A match may span lines (with `--regex`). A file with a match that isn't valid
UTF-8 is skipped, and said. `--first`, `--first-per-line`, `--lines` and `--if-unchanged` are for one note, and a usage
error with `--all`.

With `--json`, the data is as [`mv`](#mv)'s, with `kind` `replace`. `from` is the text found, and `to` is its
replacement.

### `task`

Lists a note's tasks, or ticks one by its line, as `ctrl+l` does in the screen. A task is a `- [ ]` or `- [x]` item,
never one inside code.

```bash
slipbox task coffee
slipbox task coffee 5
slipbox task coffee 5 --check
```

With a line, it toggles the task there. `--check` and `--uncheck` set it instead, and change nothing when it's already
so. `--if-unchanged <sha>` applies, as in `write`. A line with no task is exit 3, with the note's tasks. A file that
isn't a note is exit 2.

With `--json`, a listing's data is `{path, sha, tasks[{line, checked, text, raw}]}`. `raw` is the source line, its links
as written. Ticking gives `{path, line, text, checked, changed, sha}`.

### `footnotes`

Lists a note's footnotes, or changes them as the screen's footnote keys do. The list gives each label, its text and
line, and where it's referred to.

```bash
slipbox footnotes coffee
slipbox footnotes coffee add 8 'From the café on the corner.'
slipbox footnotes coffee rename 1 cafe
slipbox footnotes coffee edit cafe 'From the café on the corner, in May.'
slipbox footnotes coffee rm cafe
```

- `add <line[:column]> <text>`: a new footnote, referred to at that line, at the column given or else at the line's end.
  Its definition goes at the end of the note.
- `edit <label> <text>`: a footnote's new text.
- `rename <label> <new>`: a new label, for every reference to it too.
- `rm <label>`: removes the footnote and its references.

You give a label with or without its `[^…]`. `--if-unchanged <sha>` applies. A footnote that isn't there is exit 3. A
file that isn't a note is exit 5.

With `--json`, the data is
`{path, sha, footnotes[{label, id, text, line, def, references[{line, column, start, end}]}]}`. When there was a change,
the data is as it is after the change.

### `spell`

Lists the words of a note's prose that its dictionaries don't know, each with its line and column. [Editing](editing.md)
covers spelling in the screen.

The languages are the note's front matter `lang`, or else [`spell.languages`](configuration.md) (English by default). A
language with no dictionary is a warning, and its words go unchecked.

```bash
slipbox spell coffee
slipbox spell coffee --suggest --lang en,fr
slipbox spell --add Aeropress
```

- `--lang <a,b>`: these languages instead.
- `--suggest`: each word's suggestions too.
- `--add <word>`: put a word in your own list, as `z g` does in the screen. It takes the word alone, no note.

With `--json`, the data is `{path, languages[], missing[], words[{line, column, word, suggestions[]?}]}`. `missing`
lists the languages with no dictionary. With `--add`, the data is `{added, file}`.

### `mkdir`

Makes a folder in the root, and its parents. The path is from the root, or from the current folder when it starts with
`./` or `../`. It can also be absolute.

```bash
slipbox mkdir ideas/drinks
```

An existing path, or one outside the root, is refused (exit 5). With `--json`, the data is `{path, created}`.

## Links

These commands read links as the screen does, with the same rules. A link can be:

- a path relative to the note
- `/…`, from the root
- `~/…`
- an absolute path or `file://` URL
- a wikilink, looked up within the root
- a pointer to a named folder's file

[Links and roots](links-and-roots.md) explains every form, and how slipbox picks among notes a wikilink's name could
mean.

**What a link reaches.** `links` reports it as one of these:

- `note`
- `file`
- `folder`
- `anchor`, a heading in the same note
- `external`, a web address
- `ambiguous`
- `unresolved`

`resolve` reports `resolved` (a note, file or folder), `external`, `ambiguous` or `unresolved`.

**How it got there** is `how`, for every link that reaches a file:

| `how` | What it means |
| --- | --- |
| `path` | By its path |
| `name` | The only note of that name |
| `pointer` | A `slipbox://` pointer |
| `hosting` | A link to the repository's own page on its host, read as the file here |
| `suffix` | A wikilink naming the end of a path |
| `alias` | A name from a note's front matter |
| `old-name` | A pointer by a folder's earlier name |
| `another-copy` | A named folder's other copy, the usual one not being here |
| `exact-case` | A tie between notes of a name, broken by the name's case |
| `same-folder` | A tie broken by the one beside the linking note |
| `deepest-shared` | A tie broken by the one sharing most folders with the linking note |
| `shortest` | A tie broken by the one in the fewest folders |

`certainty` is `exact`, `inferred`, `ambiguous` or `broken`.

A tie broken by `deepest-shared` or `shortest` is **fragile**. A new note of the name, nearer the link, would take it.
`problems` lists those.

**Paths shown.** `shown` is a file's path as you'd want to read it. It's from this root, or else from your home folder
(`~/…`), or else absolute. A file in another root also has that root's path and name, as `root` and `name`. For this
root's files, both are `null`.

### `resolve`

Follows a link to the file it reaches. It's the command-line equivalent of following a link in the screen.

Give the link as it's written. With `--from`, give the note it's written in, since a relative link and a wikilink depend
on where they are. A link given whole, as `[text](target)` or `[[name]]`, is read as that kind of link.

```bash
slipbox resolve ideas/coffee.md
slipbox resolve '../inbox.md#Today' --from ideas/coffee.md
slipbox resolve '[[coffee]]' --from inbox.md
slipbox resolve slipbox://notes/ideas/coffee.md --json
```

Without `--from`, the link is taken as a note a command would name ([Naming a note](#naming-a-note)). Failing that, it's
a file's path from the root.

A target with a scheme (`https:`) is external when it has no spaces and no note has that name. So
`resolve 'Meeting: Q3'` still finds `Meeting: Q3.md`.

A link to a heading, a block (`#^id`) or lines (`#L42`) also gives that line. A heading or block that isn't there gives
the note without a line, so following the link opens it at its top. A warning says which heading or block wasn't found.

The human output is the file's path, with `:line` for a heading, a block or lines. Unresolved is exit 3. Ambiguous is
exit 4, with the candidates. For a pointer whose name different folders have, the candidates are each folder's path.
External is exit 0, with the address printed.

With `--json`, the data is `{link, status, path, abs, shown, href, heading, line, candidates[], root, name, reason, how,
certainty, git?, suggest?}`:

- `href`, with `--from`, is the relative path a link in that note would carry, encoded as a link is
  (`../inbox.md#today`). Without `--from`, it's `null`.
- `reason` says why the link didn't resolve, when there's more to say (a named folder that isn't on this machine).
- `git` is for a pointer to a branch not checked out here. It's `{root, rel, branch}`, the file as it is on that branch.
- `suggest` is for a link written as a folder's name, a colon and a path (`notes:ideas/coffee.md`). It's the pointer to
  write instead.

### `link`

Prints a link to a note or file, written as slipbox would write it in a note. It follows the folder's convention:

- a markdown link or a wikilink
- its path form
- with or without `.md`

The link is written from where `--from` is, or else from the root. This is how the screen's link picker and completion
write links, and how an agent should write one. [Links and roots](links-and-roots.md) explains the convention.
`slipbox info` says what it is here, and why.

```bash
slipbox link ideas/coffee.md --from inbox.md
slipbox link coffee --from inbox.md --style wiki
slipbox link coffee --embed --text Coffee
```

- `--style markdown|wiki`: that style rather than the folder's.
- `--text <text>`: the link's text. Without it, a markdown link's text is the note's title (a file's name). A wikilink
  has none.
- `--embed`: an embed, `![…]`.

A wikilink is a name only where that name reaches the note from `--from`. Otherwise it's a path. Into a named folder
that doesn't travel with this one, the link is a pointer.

With `--json`, the data is `{link, path, from, style, pathForm, extension}`. That's the link, and the convention it
followed.

### `links`

Lists a note's links, each with what it reaches. `--all` lists every note's links in the root at once, each with `from`.
It's a way to find the broken ones.

```bash
slipbox links ideas/coffee.md
slipbox links --all --json
```

A data file's links are its web addresses, paths and reference values. A code file's links are the addresses and paths
in its comments.

With `--json`, the data is `[{from?, kind, target, heading, text, line, column, end, status, path, shown, candidates[],
root, name, reason, how, certainty}]`:

- `kind` is how the link is written (`markdown`, `wiki`, `embed`, `image`…).
- `target` is its target as written.
- `status` is what it reaches.
- `end` is `{line, column}`.

An `external` link's `path` is its web address, whole. It reaches no file, so its `shown`, `root` and `name` are `null`.

### `backlinks`

Lists the notes, data files and code files linking to a note (or to any file). Each comes with where the link is and how
it's written. A note's links to itself aren't counted. Links from another root are counted, as of that root's index.

```bash
slipbox backlinks coffee
```

With `--json`, the data is
`{path, backlinks[{from, shown, line, column, end, text, kind, target, heading, block, alias, root, name}]}`. Each
backlink says how the link is written, so it can be rewritten.

### `problems`

Lists what's wrong in the root:

- links that reach nothing
- links several notes answer to
- fragile links
- orphans (notes nothing links to)
- in a git repository mid-merge, the files with conflicts
- the notes whose front matter breaks their document type's rules

```bash
slipbox problems
slipbox problems --lint
```

- `--lint`: your Markdown linter's findings on every note too. That's markdownlint-cli2 with your configuration, as the
  screen runs it ([`lint.enabled`](configuration.md)). When lint is off or fails, a warning says why.

With `--json`, the data is `{broken[], ambiguous[], fragile[], orphans[], conflicts[{path, line}], frontmatter[{path,
line, message}], lint[{file, line, column, rule, name, description}]?}`.

Each link is `{from, line, column, end, kind, target, text, reason, candidates[], moved?, fix?}`:

- A broken link's `moved` is where its file went, if slipbox saw it move. `relink` fixes it.
- A fragile link's `fix` is a target that names its note for sure.

A conflict's `line` is its first `<<<<<<<`.

## Moving, copying and deleting

These commands change files and the links to them. They do it in this root, and in every root whose index links into it.
Every link keeps its form:

- A relative path stays relative.
- A wikilink stays a wikilink.
- `#heading` stays.
- A reference link's definition is rewritten where it is.

[Files](files.md) explains what changes, and what the screen shows.

**Preview first.** Each of `mv`, `rename-heading`, `relink`, `convert-links`, `undo`, `name`, `init` (on a folder in a
root), `deinit` and `replace --all` takes:

- `--dry-run`: the preview, every line it would change, before and after. Nothing is written.
- `--plan`: the preview, saved as a plan with an id. Nothing is written. `slipbox apply <id>` writes it later, and is
  refused if any file in it changed since. So you (or an agent) plan, review, then apply.

`rm` takes `--dry-run` alone, and `cp` takes neither.

Without either flag, the command writes at once. A rename that can't be done whole is refused (exit 5), and nothing is
written. It can't be done whole when there is:

- a target that exists (or differs only in case)
- a path outside the root
- a file changed between planning and writing

A file that isn't valid UTF-8 is skipped and said, never rewritten.

In a git repository, a root with uncommitted changes is named in the warnings. The change goes ahead.

**`--json` of a change.** These commands give a change as their data:

- `mv`, `rename-heading`, `relink`, `convert-links`, `undo` and `name`
- `init` and `deinit` of a nested folder
- `replace --all`
- `apply`

A change is `{kind, from, to, dryRun, move, files[], warnings[], skipped[], ambiguous[]?, written[], undo?, plan?}`:

- `kind` is `note`, `folder`, `root` (a root's name), `heading`, `relink`, `convert`, `replace`, `make-root` (`init`) or
  `unmake-root` (`deinit`).
- `move` is `{from, to, dir}`, the absolute paths moved, when something moves.
- `files[{path, abs, root, name, edits[{line, before, after}]}]` lists each file rewritten, and each line in it.
- `skipped` lists the links left as they are, and why.
- `written` lists the files written (empty on a dry run).
- `undo`, for `undo`, is `{id, at}`, the change taken back.
- `plan`, with `--plan`, is `{id, made}`.

### `mv`

Renames or moves a note, file or folder, and rewrites every link to it.

```bash
slipbox mv ideas/coffee.md ideas/drinks/coffee.md --dry-run
slipbox mv ideas/coffee.md ideas/drinks/coffee.md
slipbox mv ideas/coffee.md archive/
slipbox mv ideas drafts
```

The new path is from the root, or from the current folder when it is `.` or `..` or starts with `./` or `../`. It can
also be absolute. It must stay in the root.

A folder that's there, or a path ending in `/`, is moved into, as the shell's `mv` does, keeping the name. So `archive/`
makes `archive/coffee.md`, and makes the folder if need be. `./` from the top of the root moves it there. Any other path
is the file's whole new path. A note's extension is kept when the new path has none.

A note's own relative links are rewritten to work from its new folder. So are the paths in a code file's comments and a
data file's values. A folder moves with everything in it, and links between two of its files stay as they are. A root
nested in this one moves as a folder, keeping its name. A pointer as the new path is refused (exit 5). A pointer as what
to move is fine.

`mv` takes `--dry-run` and `--plan`. With `--json`, the data is [a change](#moving-copying-and-deleting), with `kind`
`note` or `folder`.

### `cp`

Copies a note, file or folder. Without a new path, the copy goes beside it as `name-copy`.

```bash
slipbox cp ideas/coffee.md ideas/tea.md
slipbox cp ideas/coffee.md archive/
slipbox cp coffee
```

The new path is read as `mv` reads it. It's from the root, or from the current folder when it is `.` or `..` or starts
with `./` or `../`.

A folder that's there, or a path ending in `/`, is copied into, keeping the name. So `archive/` makes
`archive/coffee.md`, and makes the folder if need be. Into the folder it is in already, the copy goes beside it as
`name-copy`, as without a path. Any other path is the copy's whole path. An existing file there is refused (exit 5).

Links aren't rewritten. The copy says what the original says.

With `--json`, the data is `{from, to, dir}`.

### `rm`

Moves a note, file or folder to slipbox's trash. The trash is kept in slipbox's own state, never in your folder. `rm`
says how many links from other notes will break.

```bash
slipbox rm ideas/tea.md --dry-run
slipbox rm ideas/tea.md
```

- `--dry-run`: say what it would do, and the links that would break.

With `--json`, the data is `{path, dryRun, breaking, trashed}`. `breaking` is the links that break. `trashed` is the
trash item `{id, abs, shown, dir, at}` (`null` on a dry run).

### `trash`

Lists what's in the root's trash, newest first. `trash restore` puts an item back where it was. `trash empty` empties
the trash.

```bash
slipbox trash
slipbox trash restore ideas/tea.md
slipbox trash empty
slipbox trash empty --yes
```

`restore` takes the item's id or its path. If something is now where the item was, `restore` is refused (exit 5).
Nothing of that name in the trash is exit 3.

`empty` lists what it would remove, and removes nothing until you add `--yes`. Then everything in the trash is gone for
good. The trash keeps an item 30 days in any case. Anything deleted longer ago is removed the next time the trash is
read or written.

With `--json`, the data is `[{id, abs, shown, dir, at}]`. `restore` gives the item put back. `empty` gives
`{removed, items}`. That's the items removed (or, without `--yes`, the items that would be), and whether they were.

### `rename-heading`

Renames a heading, and rewrites every link to it. It finds the heading by its text, in any case, or by its slug. In this
root and the roots linking into it, it rewrites:

- `[x](note.md#old)`, in whichever form each has (the slug, or the text encoded)
- the note's own `[x](#old)`

```bash
slipbox rename-heading coffee Brewing 'Making it' --dry-run
```

It's refused (exit 5) when the note:

- has no such heading
- has two of that name (a link couldn't tell them apart)
- already has one with the new name

It takes `--dry-run` and `--plan`, and `undo` takes it back. With `--json`, the data is [a
change](#moving-copying-and-deleting), with `kind` `heading`.

### `relink`

Fixes links a move broke. These are links that reach nothing, whose file slipbox saw move. `relink` rewrites them to
where the file is now.

Given no note, it does every note. It also fixes what a move of the whole root by hand broke: its links out, and other
roots' links into it. And it offers a pointer for a relative link into a named folder that doesn't travel with this one.

```bash
slipbox relink --dry-run
slipbox relink inbox
```

A move slipbox saw is one it made, or one git recorded between two commits of the same branch (after a pull or a merge).
[Links and roots](links-and-roots.md) covers repairs.

`relink` takes `--dry-run` and `--plan`, and `undo` takes it back. With `--json`, the data is [a
change](#moving-copying-and-deleting), with `kind` `relink`.

### `convert-links`

Rewrites a note's links (or every note's) as plain relative paths, once:

- Each wikilink becomes a markdown link. An embed becomes an image-syntax one.
- Each link written from the root (`/ideas/coffee.md`) becomes relative, so it reads the same in any tool.
- A heading becomes its slug.
- A wikilink's alias becomes the link's text.

```bash
slipbox convert-links --dry-run
slipbox convert-links inbox
```

What it can't decide is left as written, and said in the warnings:

- a link that reaches nothing
- a heading or block that isn't there
- a link several notes answer to

A link several notes answer to is listed in `ambiguous` as `{key, shown, line, written, candidates[]}`. You write it as
a path, or pick in the screen.

Wikilinks in code and in front matter are text, and stay. A root nested in this one is converted on its own.

`convert-links` takes `--dry-run` and `--plan`, and `undo` takes it back. With `--json`, the data is [a
change](#moving-copying-and-deleting), with `kind` `convert`.

### `undo`

Takes back the root's last `mv`, `name`, `rename-heading`, `relink`, `convert-links` or `replace --all`. It takes back a
change made in the screen or by a command alike.

- Every file it rewrote gets its text back exactly.
- What moved moves back.
- Folders it made go, if empty.

The next `undo` takes back the one before. The root keeps the last 20.

```bash
slipbox undo --dry-run
slipbox undo
```

`undo` is refused (exit 5) when a file the change wrote has changed since, or what moved isn't where it went. Put the
file back, and it goes through. In a git repository, a change is undone only on the branch it was made on. Nothing to
undo is exit 3.

`init` and `deinit` aren't among these. Each takes the other back.

`undo` takes `--dry-run` and `--plan`. With `--json`, the data is [a change](#moving-copying-and-deleting). It's the
change taken back, with `undo`.

### `apply`

Writes a plan saved with `--plan`, then forgets it. Without an id, it lists the plans waiting, newest first.

```bash
slipbox mv ideas/coffee.md ideas/drinks/coffee.md --plan
slipbox apply
slipbox apply <id> --dry-run
slipbox apply <id>
```

`<id>` is the id `--plan` printed. If any file in the plan changed since the plan was made, `apply` is refused (exit 5),
and nothing is written. A stale plan is never applied. `--dry-run` shows the plan again, and warns when it's stale. A
plan that isn't there is exit 3.

With `--json`, the data is the plan's [change](#moving-copying-and-deleting). A listing gives
`[{id, made, root, command, kind, from, to, files}]`, where `files` is a count.

## Roots and named folders

A root can have a name. Other folders' links use it to reach the root, wherever the root is on each machine, as in
`slipbox://notes/ideas/coffee.md`.

The name is its `.slipbox/` folder's. Failing that, it's its git remote's last part: a repository cloned from
`github.com/me/research` is `research`. It's never the folder's own name. [Links and roots](links-and-roots.md) explains
names and pointers.

### `info`

Says how slipbox sees the folder you're in:

- the root, its name and its copies
- how links are written here, and what said so
- the index
- the settings files read
- where the cache, state and scratch are

It's a good first command in a new folder.

```bash
slipbox info
```

```text
slipbox   0.2.0
root      /home/you/notes (root)
name      notes
links     markdown links, relative, with .md — style: the notes, 100% of 382 links; …
```

With `--json`, the data is `{version, release, root, mode, name, key, markerVersion, config{user, sources[], theme},
cache, state, scratch, notes, index{…, written, reached}, background{…}, search{engine, index}, skipped[{rel, reason}],
folder, links, stale[]}`:

- `mode` is `root` for a root, and `folder` for a plain folder.
- `release` is `null` when slipbox runs from its source.
- `folder` is the root's name, `{name, pointer, remote, id, private, copies[{path, seen, here, available}], default}`,
  or `null`. `pointer` is the name pointers use. `default` is the copy links open.
- `links` is the convention, `{style, path, extension}`. Each of these is `{value, source, why}`. `source` is `setting`,
  `tool`, `notes` (with `share`, a percentage) or `default`.
- `skipped` lists what the walk left out, and why (too large, a symlink out of the root, a nested root).

### `init`

Gives a folder a `.slipbox/` folder, which makes it a root and holds its own settings. With `--name`, `init` gives it a
name too. Without a folder, it works on the current one.

```bash
slipbox init ~/notes --name notes
slipbox init ideas --name ideas --dry-run
slipbox init ideas --name ideas
```

- `--name <name>`: name it. A name a different folder already has is refused (exit 5). A clone's repository is no
  different folder, so a clone may take its name.
- `--private`: keep `.slipbox/` out of git (listed in the repository's exclude file).
- `--dry-run`: say what it would do, writing nothing. It refuses what the run would refuse, such as a name taken
  (exit 5).

On a folder inside a root, `init` makes that folder a root of its own. It rewrites the links that would stop reaching
across the new boundary:

- a link from the root, `/…`
- a wikilink by name across it

That's a change like a rename. `--plan` works there, and `deinit` takes it back. Making a `.slipbox/` anywhere else has
no edits to plan, so `--plan` is a usage error there. `--dry-run` previews it.

With `--json`, the data is `{root, created, identified, id, name, excluded}`. `excluded` is the file `--private` listed
it in. With `--dry-run`, the data is `{root, dryRun}`. On a folder inside a root, the data is [a
change](#moving-copying-and-deleting), with `kind` `make-root`, and with `root`, `name`, `id` and `created`.

### `deinit`

Makes a root nested inside another a plain folder of it again. It rewrites links the other way:

- Its paths from its root gain its folder.
- A name the parent's notes share becomes a path.
- Its pointers, in every root this machine has indexed, become relative paths or the parent's pointer.

Its `.slipbox/` goes to the parent's trash. `trash restore` makes it a root again.

```bash
slipbox deinit ideas --dry-run
```

Only a root nested in another, made a root by its `.slipbox/` alone, can be made a plain folder. Anything else is
refused (exit 5). A git repository, for example, stays a root with or without `.slipbox/`.

`deinit` takes `--dry-run` and `--plan`. With `--json`, the data is [a change](#moving-copying-and-deleting), with
`kind` `unmake-root`.

### `name`

Names this root, as pointers name it. A root with a `.slipbox/` has its name changed, and the old one is kept. So
pointers by the old name still find it, and `relink` rewrites them. A repository without a `.slipbox/` is given one to
hold the name.

```bash
slipbox name journal --dry-run
slipbox name journal
```

These are refused (exit 5):

- a name a different folder has here
- a plain folder (`init` makes it a root first)
- a `.slipbox/config.toml` whose `[vault]` table the edit can't follow (edit it by hand)

A clone may take its repository's name, as `init --name` may give it. A copy of the repository is no different folder
([Copies of a folder](links-and-roots.md#copies-of-a-folder)).

`name` takes `--dry-run`. It takes `--plan` where a `.slipbox/` exists. Making one has nothing to plan, so `--plan`
there is exit 2.

With `--json`, the data is [a change](#moving-copying-and-deleting), with `kind` `root`. For a repository given a
`.slipbox/`, it's `{root, name, id, created}`.

### `folders`

Lists the named folders this machine knows. For each, it shows the name, its copies, and the copy links open (`*`).
slipbox learns them from the folders you open, and from the background index. `folders default <name> <path>` makes that
copy the one links open.

```bash
slipbox folders
slipbox folders default notes ~/notes
```

A copy that's gone is listed as not here, and another copy answers meanwhile. A name two folders share is ambiguous
until one is renamed. That's exit 4, with each folder's path among the candidates.

A clone with a `.slipbox/` name of its own is listed under that name. It's still a copy of its repository. The
repository's full name opens its default copy, and `folders default` can make the clone that copy. The repository then
lists the clone too, marked `*`, with its name.

With `--json`, the data is
`[{name, pointer, remote, id, private, aliases[], old[], default, copies[{path, seen, found, available}]}]`. `old` is
the names it had. `folders default` gives `{name, default}`.

A path that isn't a copy of the folder (or of its repository) is refused (exit 5). An unknown name is exit 3.

## Git

These commands compare what this branch changed with its base, as a pull request does. The comparison starts where the
branch left the base (the merge base). It takes in changes committed or not.

The base is `--base <ref>`, else [`git.base`](configuration.md), else `main`, else `master`. Outside a git repository,
or with no base, these commands are exit 3. [Git](git.md) covers git in the screen.

### `changed`

Lists every file of the root this branch changed, untracked ones included. A mark says how each changed:

| Mark | Meaning |
| --- | --- |
| `+` | New |
| `M` | Modified |
| `R` | Renamed (with where from) |
| `D` | Deleted |
| `!` | In conflict |

```bash
slipbox changed
slipbox changed --base main
```

With `--json`, the data is `{base, mergeBase, files[{path, state, from?}]}`. `state` is `new`, `modified`, `renamed`,
`deleted` or `conflict`.

### `diff`

Shows a note's changes on this branch. Each group is headed `@@ line N` (where the change starts). Its lines follow,
with `-`, `+` or a space before them. Each change has three lines of context around it. A note the base doesn't have is
all `+`.

```bash
slipbox diff README.md
```

- `--base <ref>`: compare with this instead.

With `--json`, the data is `{path, base, mergeBase, new, rows[{kind, text, line}]}`:

- `kind` is `@@` (a group's head), `-`, `+`, or a space (a line both have).
- `line` is the line in the note as it is now. For a removed line, it's where the line was.

### `worktrees`

Lists the repository's checkouts, the main one first. Each has its branch and folder, and this root's folder in it. `*`
marks the one you're in.

```bash
slipbox worktrees
```

With `--json`, the data is `[{path, branch, head, main, root, current}]`. `root` is this root's folder in that checkout.

### `merge-review`

Before you merge a branch, it shows the links the merge would break.

Git can't see these. Say one branch moves `docs/plan.md`, and another adds a link to it. They change different files and
merge cleanly, with the link broken.

slipbox asks git for the merge's result, without touching your working folder or branch. Then it checks every link in
the result's notes. It needs git 2.38 or later.

```bash
slipbox merge-review fix/retry
```

```text
merging fix/retry into main: 1 link would break
  README.md:12:3  docs/plan.md — fix/retry moves docs/plan.md to docs/design/plan.md — the fix: docs/design/plan.md
```

- `--into <ref>`: the branch merged into (by default, the one checked out).

Each break says why:

| Why | What happened |
| --- | --- |
| `moved` | A branch moved the file. `to` says where, and `fix` is the link to write instead. |
| `deleted` | A branch deleted it, or moved it out of the root. |
| `note-moved` | The linking note moved without its relative link. |
| `missing` | Neither branch had it. |

Only committed work counts. Branches with no commit in common are refused, as git refuses to merge them. A branch that
isn't there is exit 3.

With `--json`, the data is
`{into, from, base, tree, conflicts[], breaks[{path, line, column, target, names, cause, by, to, fix}]}`. `conflicts`
lists the files git couldn't merge.

## The scratch and the context bundle

The scratch is a Markdown file per root. You, your editor or an agent collect references and notes in it, to hand to an
agent. You read it in the screen with `space s s` ([The scratch](editing.md#the-scratch)).

By default, the scratch is kept in slipbox's state, not among your notes. [`capture.location`](configuration.md)
`= "root"` keeps it in the root, as [`capture.file`](configuration.md) names it. A plain folder's scratch is always in
slipbox's state.

[Working with agents](../guides/agents.md) shows the scratch in use, and nvim keybindings that capture.

### `capture`

Appends some text, a reference to lines of a file, or both, to the scratch. Each entry goes after a blank line.

```bash
slipbox capture "Ask about the grinder"
slipbox capture --ref ideas/coffee.md:5-6 --snippet
printf 'brew ratio 1:16\n' | slipbox capture --stdin --lang text
```

- `--ref <reference>`: lines of a file. Lines count from 1, in order. A path inside the root is stored relative to it. A
  file that isn't there, or a line past its end, is kept with a warning. The reference is one of these:
  - `path:42`
  - `path:42-50`
  - `path:42:10-30`, columns 10 to 30 of line 42
  - `path:42:10-50:30`, line 42 column 10 to line 50 column 30
- `--snippet`: read the referenced lines from disk, and add them fenced, in the file's language. A reference past the
  file's end is exit 3.
- `--stdin`: read from stdin. With `--ref`, stdin is the snippet (a selection piped from your editor). Without `--ref`,
  it's the text. Empty stdin is refused (exit 2).
- `--lang <language>`: fence stdin as code in this language.

The human output is the scratch's path. With `--json`, the data is `{scratch, project, entry}`. `project` is the root,
and `entry` is what was added.

### `scratch`

Shows, locates, copies or clears the scratch.

```bash
slipbox scratch
slipbox scratch path
slipbox scratch copy
sha=$(slipbox scratch show --json | jq -r .data.sha)
slipbox scratch clear --if-unchanged "$sha"
```

- `show` (also plain `scratch`): its text. With `--json`, the data is `{path, content, sha}`.
- `path`: where it is. With `--json`, the data is `{path, exists}`.
- `copy`: puts it on the clipboard. It goes through the terminal (OSC 52, which works over SSH), else a clipboard
  program. Failing both, it goes to a file in slipbox's state, and says so. An empty scratch is exit 3. With `--json`,
  the data is `{path, chars, methods[], file, confirmed}`. `methods` is how it was copied. `confirmed` says whether a
  clipboard program took it (a terminal never says).
- `clear`: empties it. With `--if-unchanged <sha>` (the `sha` from `show`), it's refused (exit 5) if something was added
  since you read it. With `--json`, the data is `{path, cleared, previousSha}`.

### `context`

Writes one Markdown document for an agent. It holds:

- the notes you name
- what they link to
- what links to them

Each comes with its path and why it's there, then its text as it is on disk, fenced. The document is the scratch's other
half, gathered from the links instead of by hand.

```bash
slipbox context ideas/coffee.md
slipbox context coffee inbox --depth 2 --limit 40 --no-backlinks
slipbox context coffee --copy
```

Each file is a `## path` section, with its reference (`` `path:1-N` ``) and why it's included (`asked for`,
`linked from …`, `links to …`). Another root's note is included but not followed.

These are left out, and named in a last `## Left out` section:

- pictures and other binary files
- files over 256 KB
- whatever is past the limit

Flags:

- `--depth <n>`: how many links out to follow, 0 to 5. By default it's [`context.depth`](configuration.md), 1.
- `--no-backlinks`: leave out the files linking in. By default, it's as [`context.backlinks`](configuration.md) says.
- `--limit <n>`: at most this many files, 1 to 500. By default it's [`context.limit`](configuration.md), 25.
- `--copy`: put it on the clipboard instead, as `scratch copy` does. The output says how, and how big.

With `--json`, the data is `{start[], depth, backlinks, limit, files[{path, why, depth, from, lines}], left[{path, why,
from, reason}], chars, text}`:

- `why` is `start`, `link` or `backlink`.
- A left-out file's `reason` is `limit`, `binary`, `size` or `unreadable`.
- With `--copy`, `copied` is there too.

## Your editor

### `send`

Opens a note at a line, in an editor that's already running, as `space n s` does in the screen. By default the editor is
a running nvim (0.9 or later). It's the first of these:

- the one you last picked in the screen, while it answers
- the only one running
- the one working in the note's folder

[`editor.remote`](configuration.md) can name another editor.

```bash
slipbox send coffee --line 8
```

- `--line <n>`: the line, from 1 (by default 1).
- `--server <socket>`: the nvim to use. With an editor command that names no `{server}`, a warning says it has no
  effect.

No nvim running, or none at `--server`, is exit 3. Several, and no way to choose, is exit 4, with the candidates as
`{socket, cwd, file}`. An editor that won't start or fails is exit 1.

With `--json`, the data is `{path, line, server, commands[]}`. `commands` are the commands it ran.

## Exporting

### `export`

Writes notes as one document, with a chapter for each note in the order given. The document can be:

- Word (the default)
- PDF
- a web page
- an e-book
- portable Markdown

[Exporting](export.md) says what each format keeps.

```bash
slipbox export ideas/coffee.md
slipbox export coffee --to pdf
slipbox export coffee inbox -o exports/coffee.docx
```

- `--to docx|pdf|html|epub|md`: the format. Without it, `-o`'s extension says, or else it's Word.
- `--out <path>` (or `-o`): where to write it. A folder, or a path ending in `/`, puts it there under the first note's
  name. The folder is made if it isn't there.

Without `-o`, the document goes beside the first note, under its name (`ideas/coffee.docx`). A Markdown export goes
there as `coffee.export.md`, with its pictures in `coffee.export.assets/`. Those are the root's pictures only. Anything
else stays a link. The other formats also hold only the root's pictures. A picture from outside the root is its alt
text.

A file already at the path is replaced without asking. A note is never replaced, of this root or another (exit 5). The
one exception is an earlier Markdown export ([Exporting](export.md#from-the-command-line)).

`export` fetches nothing from the network. With `--json`, the data is `{path, format, notes[], bytes, files[]}`. `files`
are the pictures written beside it.

## Code

[Code](code.md) explains language servers, linters and trust. These two commands show what slipbox would run, and what
it finds.

### `doctor`

Lists each language's language servers and linters. For each, it says one of these:

- where it was found (in the project, on your `PATH`, where you install tools, or slipbox's own installs)
- that slipbox installs it from npm when it's first needed
- how to get it

Given a file, it says:

- that file's language
- its project folder
- which servers and linters would serve it there
- which it would lack

[Troubleshooting](troubleshooting.md) starts here.

```bash
slipbox doctor
slipbox doctor src/shelf.ts
```

In a root you don't trust, a warning says what that leaves out. A note is exit 3, since slipbox serves notes itself.
`doctor` only looks. It installs nothing.

With `--json`, the data is `[{languages[], servers[{name, role, status, where, path, package, hint, requires}],
linters[{name, program, where, path, hint, markers, required}]}]`. For a file, it's
`{language, languageId, root, trusted, limits[], skipped[{name, why}], run[], missing[], linters[]}`. There, each linter
has its `root`, which is `null` when it wasn't run.

### `diagnostics`

Lists a file's problems from every source, one line each, sorted by place. The sources are:

- its language servers, started, told the file, and waited for until each has answered and gone quiet
- its linters
- its syntax errors, when no server answered
- for a note, its own problems (links that reach nothing, merge conflict markers)
- for a note, your Markdown linter's findings

```bash
slipbox diagnostics ideas/coffee.md
slipbox diagnostics ideas/coffee.md --severity info
```

Each line is `path:line:column: severity source code: message`.

- `--severity <level>`: the least severity shown, `error`, `warning`, `info` or `hint`. By default it's
  [`diagnostics.severity`](configuration.md), `warning`.
- `--timeout <seconds>`: the longest to wait for the servers (60 by default). A server that said nothing by then is
  named in a warning.

Starting a language server can install it from npm first, as the screen does ([Code](code.md)). The exit code is 1 when
an error is shown, and 0 otherwise. `ok` is true either way, as the run itself succeeded. A file that isn't there is
exit 3.

With `--json`, the data is `{path, language, problems[{line, column, endLine, endColumn, severity, source, code,
message}], sources[{name, kind, status}]}`. Each source's `kind` is `server`, `linter`, `syntax`, `slipbox` or `lint`.

## slipbox itself

### `themes`

Lists the themes you can use, built in and your own. The one in use is marked `*`.

```bash
slipbox themes
```

With `--json`, the data is `[{name, source, path?, current}]`. `source` is `built-in`, or `user` (with its `path`).

### `commands`

Lists every named command, the screen's actions included, with its command-line equivalent. A command that only makes
sense in the screen shows `(interaction)` instead.

```bash
slipbox commands
```

With `--json`, the data is `[{id, title, cli, desc}]`. `cli` is `null` for an interaction.

### `upgrade`

Installs the latest release, when slipbox was put here by its installer. The release is checked before it's used. The
version it replaces is kept.

When slipbox follows previews ([`channel`](#channel)), `upgrade` installs the newest of the latest release and the
newest preview. [Installing slipbox](../guides/install.md) covers installing.

```bash
slipbox upgrade --check
slipbox upgrade
```

- `--check`: only say whether there's a newer one.

Installed by Homebrew, it says that `brew upgrade slipbox` does it. Run from source, it says there are no releases to
follow. Both are exit 1. The command line never checks for updates by itself ([Privacy](privacy.md)).

With `--json`, the data is `{status, from, latest, removed[]}`. `status` is `upgraded`, `current` or `available`.

### `channel`

Says which releases slipbox follows, when its installer put it here:

- `stable`: the releases
- `preview`: the previews as well

`slipbox upgrade` and the daily update check take the newest the channel offers. On `preview`, that's the newest of the
latest release and the newest preview. The installer sets the channel, to `preview` when run with `--preview`. This
command says the channel, and changes it.

```bash
slipbox channel
slipbox channel set preview
slipbox channel set stable
```

Back on `stable`, a preview you have stays until a release newer than it is out
([Previews](../guides/install.md#previews)).

Installed by Homebrew, or run from source, slipbox has no channel. The command says how that slipbox updates instead,
and exits with 5.

With `--json`, the data is `{channel}`. With `set`, it's `{channel, previous}`.

### `uninstall`

Lists what the installer put here (the `slipbox` link, the versions) and slipbox's own folders. It removes the
installer's files only with `--yes`. Your notes, and the `.slipbox/` folders in them, are never touched.

```bash
slipbox uninstall
slipbox uninstall --purge --yes
```

- `--yes`: remove them. Without it, it only lists.
- `--purge`: slipbox's four folders too:
  - your settings
  - its state (sessions, the scratch, the trash)
  - its data (your own words, the language servers it installed)
  - its cache

With `--json`, the data is `{purge, removed, remove[{path, what}], keep[{path, what}], notes[], failed[]}`. It exits
with 1 when something couldn't be removed.

### `skill`

Gives the skill for agents ([below](#for-agents-and-scripts)), as this slipbox carries it. That's the version that
matches its commands. It prints the skill. With `--install`, it writes the skill where an agent finds skills.

```bash
slipbox skill
slipbox skill --install ~/.claude/skills
```

- `--install <folder>`: write it to `<folder>/slipbox/SKILL.md`, making the folders it needs, and say where. Run again,
  it writes nothing, and says so. Over an earlier slipbox's skill, it writes this one.
- `--force`: write over a file slipbox didn't write, or in place of a link. A file slipbox didn't write is one whose
  front matter doesn't name it `slipbox`. A link is, for example, the one `scripts/install-local.sh --skill` makes to
  the source's skill. Without `--force`, both are refused (exit 5), and nothing is written. A link is removed, never
  written through. What it leads to stays as it is.
- `--dry-run`: say what it would write, writing nothing. It refuses as the run would.

With `--json`, the data is `{name, version, text}`. With `--install`, it's `{path, version, status, link, dryRun}`:

- `status` is `created`, `updated` (an earlier slipbox's skill was there), `replaced` (with `--force`) or `unchanged`.
- `link` is the `{path, to}` it replaced, else `null`.

### `help`

`slipbox help`, or `--help` anywhere, prints every command with its flags. With `--json`, the text is `data.text`.

`slipbox lsp` isn't a command. It says why on stderr, and exits with 2. So an editor set up to start it shows the reason
in its log.

## For agents and scripts

Agents have a guide of their own, built into slipbox: the skill. [`slipbox skill`](#skill) prints it, and
`slipbox skill --install <folder>` installs it. In slipbox's source, it's `skills/slipbox/SKILL.md`.

The skill tells an agent:

- which command to use for what
- to parse `--json`
- to write with `--if-unchanged`

[Working with agents](../guides/agents.md) shows how to install it.

A few habits keep a script or an agent safe:

- Parse `--json`, never the human output, and check the exit code.
- Before rewriting a note, read its `sha`, and write with `--if-unchanged`. Check `stale`. A note listed there has
  unsaved changes in your screen, and writing it brings up the conflict prompt there.
- Preview changes that touch many files with `--dry-run`, or `--plan` them and `apply` after a look.
- Write a link with `slipbox link`, so it follows the folder's convention.
- Never write into `.slipbox/` or slipbox's own folders. `info` shows where they are.
