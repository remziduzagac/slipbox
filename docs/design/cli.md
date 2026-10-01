# The CLI — the agent surface

The CLI is how agents, scripts and editor keybindings drive slipbox from phase 1–2 onward
(`docs/plan.md`, Principles). The command list is decision `9.1`; this document is its reference.
Code: `src/cli/`. The agent-facing skill that teaches it (plan `9.8`) is
[`skills/slipbox/SKILL.md`](../../skills/slipbox/SKILL.md).

## Semantics: disk is the contract (decision `9.4`)

A CLI call is a second process. It reads the files and the fresh cache, never a TUI's unsaved
buffer. It writes atomically, with a temp file plus rename. The TUI treats a CLI write like any
external writer: it reloads and says so.

The TUI records the notes it holds with unsaved changes in `dirty/<pid>.json` in the state dir
(plan `9.9`, `core/stale.ts`): written after each key or autosave when the list changes, removed
when it empties and on quit. Every CLI call reads it, ignoring and pruning files from dead pids.
Human output then carries a warning, and `--json` output a `stale` array. It is advisory only:
never a lock, never a refusal.

## Output contract (plan `9.2`)

- **Human output** goes to stdout and diagnostics to stderr, prefixed `slipbox: warning:`.
- **`--json`** prints exactly one object on stdout, whatever happens: a usage error (an unknown
  flag, say), `help` (its text in `data.text`) and `-V` included:

```json
{"schema": 1, "ok": true, "command": "links", "data": [], "warnings": [], "stale": []}
{"schema": 1, "ok": false, "command": "resolve", "error": {"code": 3, "message": "…"},
 "data": null, "warnings": [], "stale": []}
```

- **`schema`** is versioned separately from the app. It only changes when a stable command's
  shape changes.
- **Exit codes:** `0` ok, `1` error, `2` usage, `3` not found (a note, a link's target, a task's
  line, the `--root` folder), `4` ambiguous (a link, or several
  nvims for `send`), `5` refused (a stale `--if-unchanged`, a write outside the vault or to what
  isn't a note of it, `--create` over an existing file, a note or stdin that isn't valid UTF-8, a
  read of a symlink leading out of the vault).
- **Arguments.** More than a command takes is a usage error (exit 2), not silently dropped; an
  empty value for a flag (`--root ''`, `--if-unchanged=`) too. After `--` nothing is an option:
  `slipbox read -- -dash.md` names a note that starts with a dash, and text starting with a dash (a
  list item) goes there too: `slipbox write log --append -- '- 22:10 seeing 2"'` (the error for a
  dash says so).
- **Flags.** Global flags (`--root`, `--config`, `--json`, `--color`, `--plain`, `--from`) may come
  before or after the command. An unknown flag is a usage error, and so is a flag the command
  doesn't take (`write --dry-run` would otherwise write), and a bad value of a shared flag on any
  command (`--color` must be `auto`, `always` or `never`). `--width` takes a whole number from 20
  to 1000, written in digits.
- **Human output** of note text (headings, link text, paths, the scratch) is sanitized like the
  TUI's (constraint `2.9`); only `render`'s own colours are escape codes. **`--json`** keeps values
  whole but escapes what sanitize would remove (C1 controls, DEL, bidi controls and separators) as
  `\uXXXX`, so the raw object is safe to print in a terminal.
- **Colour:** `render` colours only when stdout is a TTY and `NO_COLOR` is unset; `--color always`
  forces it (even with `NO_COLOR`). `--plain`, `--color never` or a pipe give output with no
  escapes. `--theme` and `--glyphs auto|nerd|unicode|ascii` override the config for one render.

**No TTY (plan `9.3`):** `slipbox [path]` (also spelled `slipbox open [path]`) with a non-terminal
stdin or stdout refuses to start the TUI, prints a hint and exits 2. It never paints escape codes
into a pipe. The TUI takes `--root`, `--config` and `--theme` (which beats a theme remembered in the
session); `--json`, `--help` and `--version` run the CLI instead, other known flags are ignored,
and an unknown one is a usage error.

## Stability

Stable from phase 1–2, as the plan requires: changes here bump `schema`.

| Command | `data` in `--json` |
| --- | --- |
| `render <note>` | `{path, width, lines[], headings[{level, text, slug, line}]}` — embedded notes drawn in place |
| `capture [text]` | `{scratch, project, entry}` |
| `scratch show` (also plain `scratch`) | `{path, content, sha}` |
| `scratch path` | `{path, exists}` |
| `scratch clear` | `{path, cleared, previousSha}` |
| `scratch copy` | `{path, chars, methods[], file, confirmed}` |
| `resolve <link>` | `{link, status, path, abs, heading, line, candidates[], vault, via, reason}` |
| `links <note>` | `[{kind, target, heading, text, line, column, end, status, path, candidates, vault, via, reason}]` |
| `problems` | `{broken[], ambiguous[], orphans[]}`: links `{from, line, column, end, kind, target, reason, …}`; paths |
| `problems --lint` | adds `lint[{file, line, column, rule, name, description}]`; a warning when lint is off or fails |
| `problems` (git) | `conflicts[{path, line}]`: during a merge, the unmerged files at their first marker (`5.12`) |
| `changed` | `{base, mergeBase, files[{path, state, from?}]}`: `state` new, modified, renamed, deleted, conflict |
| `diff <note>` | `{path, base, mergeBase, new, rows[{kind, text, line}]}`: `kind` `@@` ` ` `-` `+`; `line`: now |
| `worktrees` | `[{path, branch, head, main, vault, current}]`: the main checkout first |
| `tags [tag]` | `[{tag, count}]`, or a tag's `{tag, notes[]}` (its nested tags' too); exit 3: no note has it |
| `backlinks <note>` | `{path, backlinks[{from, vault, line, column, end, text, kind, target, heading, …}]}` |

These churn freely before 1.0:

| Command | `data` in `--json` |
| --- | --- |
| `ls` | `[{path, title, size, mtime, tags, links}]`; `--files` adds `[{path, group, format, size, mtime}]` |
| `outline <note>` | `{path, headings[{depth, text, slug, line}]}` |
| `context <note>…` | `{start[], depth, backlinks, limit, files[{path, why, depth, from, lines}], left[], text}` |
| `footnotes <note>` | `{path, sha, footnotes[{label, id, text, line, def, references[{line, column, start, end}]}]}` |
| `footnotes <note> add\|edit\|rm\|rename …` | `{path, sha, footnotes[…]}` after it; `--if-unchanged`; exit 5: refused |
| `init [dir]` | `{root, created, identified, id, name, excluded}` — `--name N`, `--private`; exit 5: name in use |
| `init <folder>`, `deinit` | as `mv`: kind `make-vault`, `unmake-vault`; `init` adds `root`, `name` and `id` |
| `info` | root, mode, `vault{id, name, aliases, previous_names, key}`, paths, index stats, skipped, stale |
| `vaults` | `[{key, id, kind, name, aliases, previous_names, path, seen, exists, worktree?{name, main}}]` |
| `mv`, `rename-vault`, `rename-heading`, `relink` | `{kind, from, to, dryRun, move, files[], warnings, skipped, …}` |
| `undo` | as `mv`: the rename taken back (`from` and `to` the other way), plus `undo{id, at}`; exit 3: nothing |
| `cp <note\|folder> [path]` | `{from, to, dir}` — beside it as `name-copy` without a path; exit 5 onto a file |
| `rm <note\|folder>` | `{path, dryRun, breaking, trashed{id, abs, shown, dir, at}}` — to the vault's trash |
| `trash [restore <item>]` | the items, newest first; `restore`: the item put back (exit 5 over something there) |
| `themes` | `[{name, source, path?, current}]` |
| `commands` | `[{id, title, cli, desc}]` — the registry with CLI equivalents |
| `find <query> [note]` | `{query, regex, whole, count, matches[{path, line, column, match, text}]}` |
| `search <words…>` | `{query, engine, relaxed, hits[{path, line, column, heading, section, score, snippet, …}]}` |
| `index` | `{path, rebuilt, indexed, removed, files, ms}` |
| `replace <note> <old> <new>` | `{path, count, dryRun, sha, newSha, changes[{line, before, after}]}` |
| `task <note>` | `{path, sha, tasks[{line, checked, text, raw}]}` |
| `task <note> <line>` | `{path, line, text, checked, changed, sha}` |
| `read <note>` | `{path, abs, sha, bom, crlf, invalidUtf8, content}` |
| `stat <note>` | `{path, abs, vault, properties, size, mtime, title, tags, headings, links, unresolved, backlinks}` |
| `write <note>` | `{path, created, shadows (with --create), appended, previousSha, sha}` |
| `mkdir <path>` | `{path, created}`; an existing path or one outside the vault is exit 5 |
| `send <note>` | `{path, line, server, commands[]}` |
| `history` | `{read[{path, at, line}], open[[path…]…]}` (open: the TUI's tabs, each its windows) |

A link's `line` and `column` are where it starts and `end` (`{line, column}`) where it ends: the column after its last
character. Columns count from 1 in UTF-16 units, as editors and LSP count them (`🌍` is two).

`resolve` treats a target with a scheme (`https:`) as external only outside `[[…]]`, with no spaces,
and when no note has that name: `resolve "Meeting: Q3"` finds `Meeting: Q3.md`. A markdown link
resolves to the note's own path whatever case the link uses (`[x](Note.md)` → `note.md`), so it
counts as a backlink. A markdown link given whole, `resolve '[a](../home.md)' --from people/x.md`,
resolves as markdown (a path from `--from`'s folder), as `links` and the TUI do; never by name.
Backlinks exclude a note's links to itself, and carry how each link is written, so a caller can
rewrite them.

## Naming notes

`<note>` is tried in order:

1. An existing file path, relative to the current directory. That also picks the vault, by
   walking up from the file. A file the walk excludes, such as one that is gitignored, hidden
   or under `node_modules`, is still read when named explicitly, as in the TUI. It never joins
   the vault's index.
2. A vault-relative path.
3. A note name, resolved like a `[[wikilink]]` with no linking note. Collisions then go to the
   shortest path, and a real tie exits 4.
4. A data or text file of the vault (`16.4`), by its path with its extension (`cfg/app.toml`,
   `tool.py`), from the current folder or the vault's root. It's read and written as it is, never
   parsed as a note. A data file renders (`render`, as in the TUI) and has an outline (its
   sections); one that doesn't parse is exit 1 with its error. A text file has no rendered form:
   `render` is exit 2 (`read` gives its text). Source code in a language with a grammar (`16.8`) has
   an outline: its definitions, each heading with a `kind` (`function`, `class`, `method`…). `task`
   is for notes (exit 2 otherwise). `links` on a data file lists its links (`16.15`: URLs, reference
   keys' values, paths that resolve), on a code file those in its comments (`16.10`: URLs, paths
   naming vault files as `/path`, `path:42` as `/path#L42`); `backlinks` of any file lists the
   notes, data files and code files linking to it. A binary file is never written (exit 5).

`ls --files` lists the data and text files too (each with `group` and `format`); `find --files`
searches them as well. `write --create` keeps a name's known extension (`cfg/new.json`,
`tool.py`); any other name is a note and gets `.md`.

## Finding and changing notes

These reach, from the CLI, the state the TUI's find, replace, task and save change. They write the way
the TUI saves: atomically, through a symlink but never outside the vault (`7.5`), keeping a BOM and
CRLF line endings. A note that isn't valid UTF-8 is read but never rewritten (exit 5).

```bash
slipbox find Aster                       # every note: path:line:column: the line
slipbox find 'O2[0-9]:' handbook --regex --json   # one note; data.matches[{path,line,column,match,text}]
slipbox replace kenji-mori Aster ASTER --dry-run  # what would change, line by line
slipbox replace note '(\w+): book' '$1 will book' --regex --lines 10-20
slipbox task 2026-09-14-weekly           # line, [x] or [ ], text
slipbox task 2026-09-14-weekly 17 --check
slipbox read note --json                 # data.content, data.sha
slipbox stat note                        # size, dates, title, counts, encoding: the TUI's note info
slipbox links --all --json               # every link in the vault, each with from: find the broken ones
slipbox write log --append -- '- 22:10 seeing 2"'   # text starting with a dash goes after --
slipbox write note --stdin --if-unchanged <sha> < new.md
slipbox write logs/2026-10-01 '# 1 October' --create
slipbox send handbook --line 42          # to the running nvim, as space n s does
slipbox history --json                   # data.read[{path,at,line}], data.open (tabs)
```

- **Link status words.** `links` reports what a link reaches: `note`, `file`, `anchor` (a heading
  in the same note), `external`, `ambiguous` or `unresolved`. `resolve` answers whether it
  resolves: `resolved` (a note or a file), `external`, `ambiguous` or `unresolved`. A `links` entry
  with `note`, `file` or `anchor` is one `resolve` calls `resolved`.
- **Paths for `--create`** are from the vault's root, wherever you are in it, unless they start
  with `./` or `../` (then from the current folder). A bare note name never depends on the current
  folder: a name several notes share is exit 4 with the candidates (`--from` picks the nearest).
- **`write`** refuses empty or blank text, `write note ""` included (exit 2: a producer that failed
  would otherwise empty the note, and `--if-unchanged` can't tell); `--allow-empty` empties it on
  purpose. Stdin that isn't valid UTF-8 is refused (exit 5), never written as U+FFFD.
  `--append --paragraph` puts a blank line first, so the text is a block of its own and doesn't
  become the next row of a table or the end of a paragraph. `--create` with a name other notes
  have warns, and lists them in `shadows`: `[[name]]` links may now reach the new note.
- **`replace`** builds its answer before it writes, from each changed line alone, so it takes time
  in proportion to the note and a note is never changed without an answer.
- **`find`** across the vault warns about the notes the walk left out for their size (name one to
  search it); `capture` warns about a `--ref` to a missing file or past its end, and refuses an
  empty `--stdin`.
- **`history`** is what the running TUI last saved: it saves the session (open tabs, the note on
  screen, the nvim `send` uses) a second after it changes, not only on quit. `history.list` in the
  TUI is a different list, the window's jumps.
- **`replace`'s changes** carry each match's `line`, `column`, and the line before and after
  (`text`, `textAfter`, a window of a long line), so a preview shows a match inside a longer word.
  The dry run's `sha` is the one `--if-unchanged` wants.
- **`task`'s list** has the note's `sha` and each task's `raw` source line (its text keeps
  `[[links]]`).
- **`history`** marks read notes that are gone (`exists: false`) and says what is on screen:
  `activeTab` and `current` (the active window's note).
- **Patterns** are find's: plain text unless `--regex` (JavaScript syntax), `--whole` keeps to
  whole words, smart case unless `--ignore-case`. With `--regex`, `^` and `$` are a line's start
  and end (a CRLF line ends before its `\r`), an empty match inserts (`replace note '^' '> '
  --regex`), and the replacement takes `$&`, `$1`–`$9` and `$$`. `replace` changes every match
  unless `--first` (the first in the range) or `--first-per-line` (vim's `:s` without `g`);
  `--lines A-B` keeps it to those lines, as `:'<,'>s` does.
- **`--if-unchanged <sha>`** on `replace`, `task` and `write` refuses (exit 5) when the note's bytes
  no longer have that sha, the one `read` reports: nobody changed it since you read it. An empty
  sha is a usage error (exit 2), never a check that passes.
- **`write`** replaces the note's text; `--append` adds to its end on a new line; `--create`
  makes a new note: the argument is then a path in the vault (`.md` added), never a name to
  resolve, and a file already there is refused (exit 5), never overwritten. Text given as
  arguments ends with a newline; `--stdin` is written as it comes. No write reaches outside the
  vault, a symlinked folder on the way included. What counts as a note is the vault's
  `walk.extensions` (a `.txt` note in a vault that lists `txt`), not the walk's exclusions: a note
  a pattern leaves out of the index is still written. A new name with a control or bidi character
  is refused.
- **`task`** lists task items from the parsed note, so a `- [ ]` inside a code block isn't one.
  With a line it toggles that task; `--check` and `--uncheck` set it and change nothing when it is
  already so. A toggle is a one-byte edit, so it works on a note that isn't valid UTF-8 too.
- **Big notes.** `read`, `find`, `replace`, `write` and `send` read a note's bytes and never parse
  it, so a note the walk leaves out for its size is still quick to reach. `find` shows a long line
  as a window around the match (`…` where cut), so its output grows with the matches, not with the
  line; a note it can't read is a warning, and the rest are still searched.
- **What a writer may change.** `write`, `replace` and `task` change a file of the note's root — a
  vault, or a loose file's own folder (`17.1`) — inside it by its real path, and
  where the walk lists notes: never `.slipbox/`, `.git/`, a hidden folder or `node_modules`, and
  never a path outside `--root` when that names the root. `replace --dry-run` only reads, so it
  previews any note; its `newSha` is `null`.
- **Where a command works.** The root is decided by the file: the nearest `.slipbox/` above the
  note argument (or cwd), else the home vault (the file's own folder, listed alone). `$HOME` and
  `/` are never a root. `--root` must name a vault (a folder with `.slipbox/`). Each command records
  the vault in `vaults.json`. A loose file in a git repository gets a warning — `slipbox init
  <root>` would make the repository a vault (`--private` keeps `.slipbox/` out of git) — and the
  CLI never makes one on its own (`17.18`). A `.slipbox/` without an id and a name gets them
  written into its config on first open.
- **`send`** uses `editor.remote` exactly as `space n s` does: the nvim preset finds the running
  nvims (the one picked last in the TUI while it answers, else the only one, else the one working
  where the note lives) and `--server <socket>` names one. Several and no way to choose is exit 4
  with the candidates. Commands that name no `{server}` can't use `--server`: a warning says so.
- **`history`** reads the TUI's state: the notes it read, newest first, with the line it was on.

## `resolve`

It uses the same resolver as `links` and the TUI, so it is the CLI equivalent of following a link,
attachments included. Takes `[[target#heading|alias]]` or a bare `target`. With `--from <note>` it
resolves the way a link inside that note does: same directory first, per decision `1.4`, then
markdown-relative paths. With a heading, `line` is that heading's source line. External URLs come
back as `status: "external"`. `links --all` lists every note's, each with `from`.

**Across vaults** (plan `17.8`–`17.11`, `17.16`): `[[vault:note]]`, bare `vault:note` too when `vault` is a vault's
name, and a path out of the root (relative, `~/`, absolute, or a `file://` URL — a file, not an external link) resolve
into the other vault: `path` and `abs` are absolute, and `vault` names it. `via` says
when a link got there by an `alias`, a `previous-name` or a `redirect` (and a warning says so); `reason` says why one
didn't (`unknown vault "x"`). A backlink from another vault has an absolute `from` and its `vault`.

## Git (plans `5.11`–`5.14`)

What changed on this branch, measured against the base branch (`--base <ref>`, else `[git] base`, else `main`, else
`master`) from where the branch left it — the merge base, as a pull request's diff is:

- **`slipbox changed`**: every file of the vault this branch changed, committed or not, and the untracked ones —
  `M a.md`, `+ b.md`, `D gone.md`, `R notes/new.md  (from notes/old.md)`; files outside the vault's folder left out.
- **`slipbox diff <note>`**: the note's diff, each group after `@@ line N`, `-` and `+` lines with three lines of
  context; `rows[].line` is the line in the note as it is now. A note the base hasn't is all `+` (`new: true`).
- **`slipbox worktrees`**: the repository's checkouts, the main one first — branch, path, and the vault's folder there.
- **`slipbox problems`** lists a merge's unmerged files as `conflicts`, each at its first `<<<<<<<` line.

Outside a git repository, or with no base branch, these exit 3.

## Search (plans `6.1`–`6.8`)

`slipbox search <words…>` ranks the vault's notes and data files by the words: each one somewhere in the file (else,
`relaxed` and a warning, files with some of them), by BM25, a word in the title or an alias counting most, then tags,
headings and the path, then the text. A hit opens at the section with most of the words — `line` and `column` are its
first line with one — and `snippet` is that line, cut around the match, `marks` the words' places in it; `more`
counts the file's other sections with some of the words. `--limit N` (default 20, up to 500).

- **The query**: words (all of them); `"a phrase"`; `prefix*`; `-word` (none of it); `title:word` (in the title or
  an alias); `#tag` or `tag:x` (notes carrying the tag, or one nested under it); `path:folder/` (files whose path
  starts so). Nothing is passed on as FTS5 syntax: every word is quoted. Accents and case don't count. Words are
  whole words: `cat` isn't `catalogue` (`cat*` is).
- **The index** is SQLite FTS5 in the vault's cache (`search.db`). `slipbox index` builds it, or brings it up to the
  files — `--rebuild` starts it again; the TUI keeps it as it runs. Before each search the index catches up with every
  file whose size or mtime changed since, whoever changed it. Until it's been built, a search scans the files with
  the same query, `engine: "scan"` and a warning — slower, the same notes. An index of another version, or one SQLite
  can't read, is made again. A loose folder (the home vault) keeps none: it's scanned.
- **`[search] engine`**: `auto` (the index when it's built, else a scan), `index` (built first when there's none),
  `scan` (never an index).
- **A hit's `section`** is the section it's in, as scout names and bounds it (`{name, line, end}`: `Auth/Setup`,
  `§:file`, `§:part~2`) — the size band's, not the line's heading (that's `heading`); `docs/design/decisions.md`,
  `6.1`, says how files are cut.
- **`find`** is the other tool: every match of a literal or a regex, not ranked.

## Renames (plans `17.15`, `7.1`–`7.4`)

Each `files` entry is `{path, abs, vault, edits[{line, before, after}]}`.

`slipbox mv <note> <new-path>` renames or moves a note (or any file of the vault; the extension is kept when the
new path has none) and rewrites every link to it, in this vault and in every vault whose index links into it
(`17.11`). `--dry-run` is the preview (`7.2`): each changed line, before and after, and nothing written.

- **Each link keeps how it was written:** a name stays a name (`[[plan]]` → `[[roadmap]]`), unless another note has
  the new name — then the path, so it can't reach the wrong one; a path stays a path, a relative one relative, an
  extension written stays, `#heading`, `^block`, `|text` and `\|` stay, a `vault:` prefix stays, a percent-encoded
  URL is encoded again, a reference link's definition is rewritten where it is. A link written as the note's alias is
  still right, and left alone. A filesystem path (`17.16`) stays in its form: relative from the linking file, `~/`,
  absolute, or a `file://` URL.
- **Byte ranges, never re-serialised** (`7.6`): each edit replaces the target at the line and column the index
  recorded (of the links there with that target, the nearest — so the same text in code nearby is left). A file
  whose link isn't there any more (another vault's index older than its file) is skipped, and said so.
- **The note itself:** its own relative links follow it to its new folder; when its name changes, its old name is
  added to its frontmatter's `previous_names` (`rename.previous_names`), spliced in, so links this machine can't
  reach still find it (`17.7`). A redirect is kept too (`17.12`).
- **Refused, nothing written** (exit 5): a target that exists, a path outside the vault or hidden, a file changed
  between the plan and the writing.
- **Git** (`7.3`): a root it writes to whose tree already has changes is named in `warnings`; the rename goes ahead.

**A folder** (`18.3`): `slipbox mv <folder> <new-path>` moves it with everything in it — what the walk doesn't list
too — and rewrites every link to anything in it, from where each linking file will be; links between two files that
move together stay as they are.

**A nested vault's folder** (`18.7`) is a folder of the vault holding it, whichever one the path names: `mv` moves it,
rewriting the links into it by path — this vault's, and those of the vaults that reach it — and its own relative links
out; its id and name go with it (`[[name:…]]` links stay right), and it's recorded at its new place. `rm` counts the
links into it, by path or by name, as the ones that break.

**Deleting and copying** (`18.4`, `18.5`): `slipbox rm` moves a note, file or folder to the vault's trash — in its
state, never in the folder — and says how many links from other notes break (`breaking`, and a warning); `--dry-run`
only says. `slipbox trash` lists what's there; `slipbox trash restore <id|path>` puts an item back where it was,
refused when something is there now. `slipbox cp` copies a note, file or folder, as written.

`slipbox rename-vault <name>` renames this vault: `[vault] name` in its config, the old name added to its
`previous_names`, and every `[[old:…]]` rewritten, here and in the vaults linking into it. `slipbox relink [note]`
rewrites the links of a note (or every note) that reach their note only by a previous name or a redirect, to its name
or path now. Both take `--dry-run`.

`slipbox rename-heading <note> <heading> <new>` renames a heading (`11.9`) — found by its text in any case, or its
slug — and every link to it: `[[note#Heading]]` and `![[note#Heading]]` (their `|text` kept), `[x](note.md#heading)`
in the form it has, the slug (`#new-name`) or the text (`#New%20Name`, `<note.md#New Name>`), the note's own
`[[#Heading]]` and `[x](#heading)`, in this vault and the vaults linking into it; the heading's closing `#`s stay.
Refused (exit 5) when the note has no such heading, has two of its name (a link can't tell them apart), or has a
heading with the new name already. It takes `--dry-run`, and `undo` takes it back.

**Undo** (`7.4`): `slipbox undo` takes back the vault's last rename, move, vault rename or relink — the TUI's or the
CLI's alike: every file it rewrote gets back the text it had, byte for byte (a note's added previous name too), what
moved moves back, and the folders the move made go if they're empty. It's a rename like the others — `--dry-run`
previews it, each changed line the other way; open notes, the index and the redirects follow — and it's refused,
nothing written (exit 5), when a file the rename wrote has changed since, or what moved isn't where it went; it
stays next to undo, so putting the file back lets it through. Undone, it's forgotten: the next `undo` takes the one
before (the vault keeps the last 20, in its state). In a git checkout, each rename is undone only on the branch it was
made on (`5.9`): on another, `nothing to undo on branch main: the last rename was made on branch feat` (exit 3).
A folder made a vault or a vault made a folder (`18.11`) isn't among them: `deinit` and `init` take each other back.

**A folder made a vault, and back** (`18.11`): `slipbox init <folder>` on a folder inside a vault makes it a vault of
its own — its `.slipbox/`, a distinct name suggested unless `--name` — and first rewrites the links that would stop
reaching across the new boundary: the vault's links into it by name or a partial path become `[[name:…]]` (by its
exact path, or any filesystem path, they still reach it); its notes' links out by name or a vault path become
`[[parent:…]]`, from the root `/…` a relative path; its own paths from the parent's root, from its own; other vaults'
`[[parent:…]]` into it, `[[name:…]]`. `slipbox deinit <folder>` undoes it for a vault nested in another: every
`[[its-name:…]]` — the parent's, its own, other vaults' — becomes a name in the parent (a path where two notes would
share the name), `parent:`-prefixed from other vaults; its paths from its root, from the parent's; its `.slipbox/`
goes to the parent's trash (`trash restore` makes it a vault again, the links as they are then), and the machine
forgets it. Both take `--dry-run` and answer like `mv`, `init` adding the vault's `root`, `name` and `id`. Every plan's
writes into another vault's files reach that vault's index at once, as if it had been opened.

## Capture and the scratch (plans `8.1`–`8.4`)

`slipbox capture` **is** the capture path (plan `8.1`). An nvim keybinding, an agent or a shell
calls it, and the user reads the scratch in the TUI.

- **Where.** In the state dir per vault by default; with `capture.location = "vault"`, in the
  vault. A loose folder's scratch is the home vault's, always in its state.
- **Reference forms**, as `prompt-buffer.lua` emits them: `path:42`, `path:42-50`,
  `path:42:10-30`, `path:42:10-50:30`. Paths inside the project are stored relative to it.
  Lines count from 1 and ranges must be in order; `--snippet` past the end of the file exits 3.
- **`--snippet`** reads the referenced lines from disk and fences them, with the language taken
  from the file extension. `--stdin --lang L` fences stdin as `L` code, with or without `--ref`.
  The fence grows when the snippet itself contains fences.
- **`--stdin`.** With `--ref`, stdin is the snippet: a visual selection piped from nvim. Without
  it, stdin is the text.
- **Appending.** Each entry is appended after a blank line, atomically. Output is markdown,
  readable and pasteable as-is.
- **`scratch copy`** uses the clipboard ladder: OSC 52 to `/dev/tty`, then a local tool, then a
  file.
- **`scratch clear --if-unchanged <sha>`** (plan `9.10`) refuses with exit 5 when someone
  appended since you read it.

### Replacing `prompt-buffer.lua`

The nvim side becomes a thin wrapper, for example:

```lua
vim.keymap.set("n", "<leader>pc", function()
  vim.fn.system({ "slipbox", "capture", "--ref", vim.fn.expand("%:p") .. ":" .. vim.fn.line(".") })
end)
vim.keymap.set("v", "<leader>pC", function()
  local s, e = vim.fn.line("v"), vim.fn.line(".")
  if s > e then s, e = e, s end
  vim.fn.system({ "slipbox", "capture", "--snippet", "--ref", ("%s:%d-%d"):format(vim.fn.expand("%:p"), s, e) })
end)
```

## The context bundle (plan `9.7`)

`slipbox context <note>…` writes one markdown document for an agent: the notes asked for, what they link to and what
links to them — the scratch's other half, gathered from the link graph instead of by hand, and written the same way.
Each file is a `## path` section: its reference (`` `path:1-N` ``) and why it's there (`asked for`, `linked from x`,
`links to x`), then its text as it is on disk, fenced (`markdown` for a note, the language for code; the fence
longer than any inside it). Links are left as written: an agent can read `[[name]]` and `slipbox resolve` it.

- **What's in it**, breadth first: the notes asked for; what they link to, in the order the links are written (a note,
  or a file of the vault: code, data); the files linking to them, by path; then, with `--depth N` (0–5; default 1),
  what those links link to, a level at a time. Another vault's note, linked or linking, is included but not followed.
  `--no-backlinks` leaves out the files linking in.
- **What's left out**, named in a last `## Left out` section (and `left[]`): a picture or another binary file, a
  file over 256 KB, and whatever is past `--limit N` (1–500; default 25) — the first 20 named, the rest counted.
- **`[context]`** sets the defaults (`depth`, `backlinks`, `limit`); the flags win.
- **`--copy`** puts it on the clipboard instead, as `scratch copy` does; the output says how, and how big.

The human output is the bundle itself, to pipe into an agent; `--json` has it as `text`, beside what went in.

## `slipbox doctor` (plan `19.7`)

`slipbox doctor` lists each language's servers (languages sharing them together), and for each: found — in the
project, on `PATH`, in a place the user installs tools (Mason's, cargo's, go's), or in slipbox's own installs — and
where; not found but on npm, so installed when it's first needed (its pinned package); or native and nowhere, with how
to get it (`rustup component add rust-analyzer`). An add-on says where it runs: where the project has its config.
`slipbox doctor <file>` takes one file: its language, its project's top folder, and the servers that would serve it
there, the main one first, then what it would have had and hasn't. A note is exit 3: slipbox serves notes itself.
`--json`: an array of `{languages, servers[{name, role, status, where, path, package, hint, requires}]}`, or for a
file `{language, languageId, root, run[], missing[]}`.

## `slipbox lsp` (plan `11.x`)

Not a command like the others: it serves vaults to an editor over LSP on stdio until the editor ends the session, and
nothing but the protocol reaches stdout. It takes `--config <file>` (and ignores `--stdio` and `--clientProcessId`,
which editors pass by habit); any other argument is exit 2. What it serves, and how, is [lsp.md](lsp.md).

## Installing for agents

`scripts/install-local.sh` writes a `slipbox` launcher into `~/.local/bin` that runs this
checkout with bun. `--skill` also links the skill into `~/.claude/skills/slipbox`. Real packaging
(`bun build --compile`, release assets) is plan `14.x`.
