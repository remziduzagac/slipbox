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
  line, the `--root` folder; the TUI's too, a path to open that isn't there said in a line before the
  screen is taken), `4` ambiguous (a link, or several
  nvims for `send`), `5` refused (a stale `--if-unchanged`, a write outside the root or to a binary
  file, `--create` over an existing file, a note or stdin that isn't valid UTF-8, a read of a
  symlink leading out of the root).
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
| `resolve <link>` | `{link, status, path, abs, shown, href, heading, line, candidates, root, name, reason, how, …}` |
| `links <note>` | `[{kind, target, heading, text, line, column, end, status, path, shown, …, how, certainty}]` |
| `problems` | `{broken[], ambiguous[], fragile[], orphans[]}`: links `{from, line, column, end, kind, target, …}` |
| `problems --lint` | adds `lint[{file, line, column, rule, name, description}]`; a warning when lint is off or fails |
| `problems` (git) | `conflicts[{path, line}]`: during a merge, the unmerged files at their first marker (`5.12`) |
| `problems` (types) | `frontmatter[{path, line, message}]`: frontmatter breaking its document type's rules (`22.2`) |
| `changed` | `{base, mergeBase, files[{path, state, from?}]}`: `state` new, modified, renamed, deleted, conflict |
| `diff <note>` | `{path, base, mergeBase, new, rows[{kind, text, line}]}`: `kind` `@@` ` ` `-` `+`; `line`: now |
| `merge-review <branch>` | `{into, from, base, tree, conflicts[], breaks[{path, line, target, cause, to, fix, …}]}` |
| `worktrees` | `[{path, branch, head, main, root, current}]`: the main checkout first; `root`, this root there |
| `tags [tag]` | `[{tag, count}]`, or a tag's `{tag, notes[]}` (its nested tags' too); exit 3: no note has it |
| `backlinks <note>` | `{path, backlinks[{from, root, name, shown, line, column, end, text, kind, target, …}]}` |

These churn freely before 1.0:

| Command | `data` in `--json` |
| --- | --- |
| `ls` | `[{path, title, size, mtime, tags, links}]`; `--files` adds `[{path, group, format, size, mtime}]` |
| `outline <note>` | `{path, headings[{depth, text, slug, line}]}` |
| `context <note>…` | `{start[], depth, backlinks, limit, files[{path, why, depth, from, lines}], left[], text}` |
| `export <note…>` | `{path, format, notes[], bytes, files[]}` — one document, a chapter a note; 5: over a note |
| `footnotes <note>` | `{path, sha, footnotes[{label, id, text, line, def, references[{line, column, start, end}]}]}` |
| `footnotes <note> add\|edit\|rm\|rename …` | `{path, sha, footnotes[…]}` after it; `--if-unchanged`; exit 5: refused |
| `init [dir]` | `{root, created, identified, id, name, excluded}` — id, name with `--name N`; exit 5: name in use |
| `name <new>` | a `.slipbox/` folder's: as `mv`, kind `vault`; a repository's: `{root, name, id, created}`; 5: taken |
| `folders` | `[{name, pointer, remote, id, private, aliases, old, default, copies[{path, seen, found, …}]}]` |
| `init <folder>`, `deinit` | as `mv`: kind `make-vault`, `unmake-vault`; `init` adds `root`, `name` and `id` |
| `info` | `release`, `root`, `mode`, `name`, `key`, `folder{name, pointer, …, copies[]}`, `links`, `index{…}`, … |
| `--plan` (`mv`, `relink`…) | as `--dry-run`, plus `plan{id, made}`: saved for `apply` (`20.18`) |
| `apply [plan]` | as the command that planned it, applied; no plan: `[{id, made, root, command, kind, files}]` |
| `mv`, `name`, `rename-heading`, `relink` | `{kind, from, to, dryRun, move, files[], warnings, skipped, …}` |
| `convert-links` | as `mv`, kind `convert`, plus `ambiguous[]`: the links several notes answer to |
| `undo` | as `mv`: the rename taken back (`from` and `to` the other way), plus `undo{id, at}`; exit 3: nothing |
| `cp <note\|folder> [path]` | `{from, to, dir}` — beside it as `name-copy` without a path; exit 5 onto a file |
| `rm <note\|folder>` | `{path, dryRun, breaking, trashed{id, abs, shown, dir, at}}` — to the vault's trash |
| `trash [restore <item>]` | the items, newest first; `restore`: the item put back (exit 5 over something there) |
| `themes` | `[{name, source, path?, current}]` |
| `commands` | `[{id, title, cli, desc}]` — the registry with CLI equivalents |
| `types [type]` | `[{name, source, paths, notes, problems}]`; a type's `{name, notes[{path, number, status, …}]}` |
| `upgrade` | `{status, from, latest, removed[]}`: `status` upgraded, current or available (`--check`); 1: refused |
| `uninstall` | `{purge, removed, remove[{path, what}], keep[…], notes[], failed[]}`; removes only with `--yes` |
| `find <query> [note]` | `{query, regex, whole, count, matches[{path, line, column, match, text}]}` |
| `search <words…>` | `{query, engine, relaxed, hits[{path, line, column, heading, section, score, snippet, …}]}` |
| `index` | `{path, rebuilt, indexed, removed, files, ms}` |
| `replace <note> <old> <new>` | `{path, count, dryRun, sha, newSha, changes[{line, before, after}]}` |
| `replace --all <old> <new>` | as `mv`, kind `replace`: `from` what it finds, `to` what with |
| `spell <note>` | `{path, languages, missing, words[{line, column, word, suggestions?}]}`; `--add`: `{added, file}` |
| `task <note>` | `{path, sha, tasks[{line, checked, text, raw}]}` |
| `task <note> <line>` | `{path, line, text, checked, changed, sha}` |
| `read <note>` | `{path, abs, sha, bom, crlf, invalidUtf8, content}` |
| `stat <note>` | `{path, abs, root, name, properties, size, mtime, title, tags, headings, links, unresolved, …}` |
| `write <note>` | `{path, created, shadows (with --create), appended, previousSha, sha}` |
| `mkdir <path>` | `{path, created}`; an existing path or one outside the vault is exit 5 |
| `send <note>` | `{path, line, server, commands[]}` |
| `history` | `{read[{path, at, line}], open[[path…]…]}` (open: the TUI's tabs, each its windows) |

A link's `line` and `column` are where it starts and `end` (`{line, column}`) where it ends: the column after its last
character. Columns count from 1 in UTF-16 units, as editors and LSP count them (`🌍` is two).

`resolve` treats a target with a scheme (`https:`) as external only with no spaces, when no note has that name and no
folder has the part before `:` (that's the old form, `21.11`): `resolve "Meeting: Q3"` finds `Meeting: Q3.md`. A
markdown link resolves to the note's own path whatever case the link uses (`[x](Note.md)` → `note.md`), so it counts as
a backlink. A markdown link given whole, `resolve '[a](../home.md)' --from people/x.md`, resolves as markdown (a path
from `--from`'s folder), as `links` and the TUI do; never by name.
Backlinks exclude a note's links to itself, and carry how each link is written, so a caller can
rewrite them.

## Naming notes

`<note>` is tried in order:

1. An existing file path, relative to the current directory. That also picks the vault, by
   walking up from the file. A file the walk excludes is still read when named explicitly, as in
   the TUI: one git-ignored or under a hidden folder is reached, and joins the vault's index from
   then on (`20.8`); one under `node_modules` or `walk.exclude` never joins it.
2. A pointer (`21.10`): `slipbox://research/algorithms/dijkstra.md`, the file in that named folder's copy here
   (`21.6`), found as a link's path is (no extension, a folder). It's that file's path from then on, so the command
   works in its folder, as with the path: `slipbox backlinks slipbox://research/algorithms/dijkstra.md` from
   anywhere. Exit 3 and why when the folder isn't here (or its branch isn't checked out), 4 when two folders have the
   name. Every note argument takes it (`find`'s second, each of `context`'s), and `--from`; `mv` and `cp` take their
   source so, the destination a path in that folder (a pointer there is exit 5). The old form, `research:x.md`
   (`20.20`, gone in `21.12`), is exit 3 with its pointer when a folder has that name; else it stays a name
   (`Meeting: Q3`). An existing file by that very name wins.
3. A vault-relative path.
4. A note name: its file name without the extension (or a declared alias). Collisions then go to the shortest path,
   and a real tie exits 4. That's how a command names a note; links in notes are paths (`20.2`).
5. A data or text file of the vault (`16.4`), by its path with its extension (`cfg/app.toml`,
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
slipbox replace --all Aster Astra --dry-run    # every note: each line it would change; undo takes it back
slipbox spell kenji-mori --suggest             # path:line:column: word → what it might be instead
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

- **Link status words.** `links` reports what a link reaches: `note`, `file`, `folder` (`21.2`),
  `anchor` (a heading in the same note), `external`, `ambiguous` or `unresolved`. `resolve` answers
  whether it resolves: `resolved` (a note, a file or a folder), `external`, `ambiguous` or
  `unresolved`. A `links` entry with `note`, `file`, `folder` or `anchor` is one `resolve` calls
  `resolved`.
- **Paths for `--create`** are from the vault's root, wherever you are in it, unless they start
  with `./` or `../` (then from the current folder). A bare note name never depends on the current
  folder: a name several notes share is exit 4 with the candidates (`--from` picks the nearest).
- **`write`** refuses empty or blank text, `write note ""` included (exit 2: a producer that failed
  would otherwise empty the note, and `--if-unchanged` can't tell); `--allow-empty` empties it on
  purpose. Stdin that isn't valid UTF-8 is refused (exit 5), never written as U+FFFD.
  `--append --paragraph` puts a blank line first, so the text is a block of its own and doesn't
  become the next row of a table or the end of a paragraph. `--create` with a name other notes
  have warns, and lists them in `shadows`, the name a command's `<note>` now finds two notes by.
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
- **`spell <note>`** (`25.6`) lists the words of a note's prose its dictionaries don't know, by line and column (code
  points, as `find`'s): its front matter's `lang`, else `[spell] languages`, or `--lang tr,en` (the dictionaries:
  [configuration.md](configuration.md), "Spelling"). A language with no dictionary is a warning, its words unchecked.
  `--suggest` gives each one's suggestions; `--add <word>` puts a word in your own list, as the TUI's `z g` does.
- **`replace --all <old> <new>`** (`25.4`) replaces in every note — with `--files`, every text file too, as `find
  --files` searches — as a rename is (below): `--dry-run` previews each line it changes, `--plan` saves it for `apply`,
  and `undo` takes it back. A match may cross lines (`--regex`): its lines are one change. A file with a match that
  isn't valid UTF-8 is skipped, and said. `--first`, `--first-per-line`, `--lines` and `--if-unchanged` are one note's:
  with `--all`, a usage error.
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
  vault, or the plain folder a loose file is in (`20.22`) — inside it by its real path, and where the walk
  lists notes (or a note it reached, `20.8`): never `.slipbox/`, `.git/`, a hidden folder or
  `node_modules`, and never a path outside `--root` when that names the root. `replace --dry-run`
  only reads, so it previews any note; its `newSha` is `null`.
- **Where a command works.** The root is decided by the file: its nearest boundary above the note argument (or cwd) — a
  folder holding a root marker (`walk.root_markers`, `21.1`: `.git`, `.slipbox/`, `.obsidian/`, `.zk/`), one root
  however many it holds (`20.3`) — else the plain folder the file is in (or the current one), known by its path
  (`20.22`), walked and indexed as a root is, its state its own. `$HOME` and `/` are never a root; opened as a plain
  folder, they're listed a level at a time, never walked or indexed (the background index walks `~`). `--root` must
  name a root (one of the markers in it), and says where to start: a note named from it is found there, but a file's
  root is its nearest — one in a root nested in `--root` is that root's (21.x). Each command records the root in
  `roots.json` by its path, and its name in the named folders' lookup (`21.6`); its cache and state are its path's
  (`21.8`), reading positions by file. A named folder moved by hand — its id or remote at a new path, the one copy that
  was elsewhere gone — brings its state along: the command that first opens it there says so, and how many lines the
  move broke for `relink` to fix. A root is named, wherever the CLI names one (`info`, `stat`, `folders`), by the name
  pointers give it — its `.slipbox/` name, else its repository's remote's — else shown by its path; never its folder's
  own name. Nothing is written into a root by opening it: `.slipbox/`'s id and name only by `slipbox init --name` and
  `slipbox name` (`--private` keeps `.slipbox/` out of git).
- **`send`** uses `editor.remote` exactly as `space n s` does: the nvim preset finds the running
  nvims (the one picked last in the TUI while it answers, else the only one, else the one working
  where the note lives) and `--server <socket>` names one. Several and no way to choose is exit 4
  with the candidates. Commands that name no `{server}` can't use `--server`: a warning says so.
- **`history`** reads the TUI's state: the notes it read, newest first, with the line it was on.

## `resolve`

It uses the same resolver as `links` and the TUI, so it is the CLI equivalent of following a link,
attachments included: a path, from `--from`'s folder (`[a](../home.md)`, given whole, as markdown), with a heading,
`line` is that heading's source line. Without `--from`, the note a command would name — a path from here or the
vault's root, or its name — else a file by its path from the vault's root. External URLs come back as
`status: "external"`. `links --all` lists every note's, each with `from`.

**A wikilink resolves within its root** (`21.3`): `[[name]]`, `[[name#heading]]`, `![[dal.png]]` — by its path from
the root (`[[Recipes/Weeknight/Dal]]`), its name (case folded, `.md` optional), an alias its front matter gives, or an
attachment by its file name, as Obsidian finds one. Two of a name, notes or attachments: the one in the linking note's
folder, then the deepest folder shared, then the shortest path; a real tie is ambiguous (exit 4), never guessed. A
root nested inside ends its names (a path into it is a path). A file with no root has no names: exit 3, saying what
makes one. Previous names, `[[vault:note]]` and a move remembered aren't read (`20.22`'s removals kept): only the
converter reads them (`20.1`), as the legacy reader it keeps for what it rewrites — `[[name:note]]` by the named
folders' lookup (`21.6`).

**How a link landed** (trailscout's review): `links` and `resolve` give `how` — `path`, `suffix` (the end of its path),
`name` (the only note of it), or the tie broken: `exact-case`, `same-folder`, `deepest-shared`, `shortest`; or the
`via` (`alias`, `old-name`, `another-copy`) — and `certainty`: `exact`, `inferred`, `ambiguous`, `broken`. The last
two ties make a link **fragile** (a note of the name nearer takes it): `problems` lists them as `fragile[]`, each with
`fix`, the path that names its note for sure; `diagnostics` too, as `fragile` with `fix{title, text}`. A command that
makes or removes a note sending links by name elsewhere warns, each: `Home.md:3: [[Pie]] reached X; it reaches Y now`.

**Named folders' words** (`21.10`): a pointer (`slipbox://notes/inbox.md`) names a note wherever a command takes one —
`read`, `outline`, `--from`, … — the file in its folder's copy here (exit 3 and why when it isn't here, 4 when the name
is two folders'). `slipbox name <new>` names this root as pointers name it: a `.slipbox/` folder's name changed, the old
one kept in its config (a pointer by it still finds it, `via: "old-name"`, and `relink` rewrites it to the new); a
repository without `.slipbox/` given one to hold the name; a name a different folder has here refused (exit 5).
`slipbox folders` lists the names this machine knows, each with its copies and the one links open (`*`);
`folders default <name> <path>` makes a copy that one. The TUI's `:folders` and `:name` (`folders.open`, `folder.name`).

**Repairs** (`21.11`): `relink` (the TUI's offer after a batch of moves made elsewhere) fixes links a move broke; a
link naming a folder the old way (`research:x.md`, `[[research:x]]`) is unresolved with why and `suggest`, the pointer
that names its file, and `diagnostics` gives it as `old-form` with `fix` (that pointer, a markdown link).

**Links to a repository's own hosting** (`core/hosting.ts`): GitHub's `/blob/<ref>/`, `/tree/<ref>/`, `/raw/<ref>/`,
GitLab's `/-/blob/<ref>/` (groups nested), Bitbucket's `/src/<ref>/` (its `#markdown-header-` headings), a repository's
own page or `#readme` (its README) — of this checkout's remote, or a named folder's (`21.6`) — are the file in this copy:
`resolve`, `links` and backlinks read them (`via: "hosting"`), a rename rewrites the URL's path, and another ref than
the branch checked out is `inferred`, said by `diagnostics` (`other-ref`).

**A folder's name** (`21.6`, `core/folders.ts`): what a pointer names it by (`slipbox://<name>/…`, `21.7`) — the name
in its `.slipbox/` config, else its repository's remote's last part (`research`); never its folder's own name. `info`
gives `folder{name, pointer, remote, id, private, copies[{path, seen, here, available}], default}` — `pointer` the
remote (`github.com/me/research`) when a different repository this machine knows shares the short name — and the line
`name      research — 2 copies, links open ~/src/research`; a root with neither, `name      none — …: linked to by
relative path`. The lookup (`folders.json` in the state folder) holds each name, its copies and the default one: the
first found, or the one picked (the TUI asks once a second is here); filled from the folders opened and the background
index. A name of two different folders is ambiguous: repositories each by their remote, `.slipbox/` folders until one
is renamed; an alias (`aliases`) finds the folder as its name does, and a name it had (`previous_names`, kept as
`old`) still finds it, said so (`via: "old-name"`); a copy that's gone stays listed, unavailable — another copy answers
meanwhile.

**Pointers** (`21.7`, `core/pointer.ts`): `slipbox://<name>[@branch]/<path>#fragment` — a link into a named folder
(`21.6`), read by `resolve`, `links`, backlinks (another folder's pointers count, as of its index) and renames, which
keep it a pointer, its name, branch and form; a named folder moved needs no link edited. The name is a folder's short
one or a repository's qualified one (`github.com/me/research`: the longest leading part this machine knows as a
remote). `@branch`: the checkout with that branch, a worktree's; else the file as it is there, read from git
(`resolve --json` gives `git{root, rel, branch}`); a branch with `/` in it (`@agent/sync-retry/docs/x.md`) is the
longest branch the repository has. Not here, an unknown name or a gone copy: exit 3 with why; a name of different
folders: exit 4 with each. Links slipbox writes (`21.5`) between folders that don't travel together — not one
repository or a submodule of it, nor, outside git, one folder inside the other — into a named folder are pointers (a
markdown link, in a wikilink root too); `relink` offers each relative link's pointer, one broken where that folder was
included.

**The links' convention** (`21.4`): `info` says how the links slipbox makes in this root look — `links{style, path,
extension}`, each `{value, source, why}`, `source` one of `setting`, `tool`, `notes` (with `share`, a percentage),
`default` (`docs/design/configuration.md`, "The links' convention"). Its line: the parts, then what said each —
`links     wikilinks, by name, without .md — Obsidian's .obsidian/app.json`.

**`slipbox link <note>`** (`21.5`) prints a link to a note or file as slipbox writes one where `--from` is (else from
the root's top): the root's convention, `--style markdown|wiki` the style already chosen (its path and extension then
that style's). A markdown link's text is the note's title (a file's name), a wikilink has none; `--text` gives one,
`--embed` makes it `![…]`. A wikilink is a name only where that name reaches the note from `--from` (21.3's rules),
else the path from the root — a top-level note's path being its name, a relative path (`../plan`); a file outside the
root, a relative path as it's named. `--json`: `{link, path, from, style, pathForm, extension}`. What the TUI's link
picker and completion write; an agent writing a link writes this.

**Across roots** (plan `17.9`–`17.11`, `17.16`, `21.10`): a path out of the root (relative, `~/`, absolute, or a
`file://` URL; a file, not an external link) resolves into the other root: `path` and `abs` are absolute, `root` is
that root's path and `name` its name when it has one (both null for this root's own files, and for a file of no
root). A path that reaches nothing is broken, whatever moved (`20.2`). A backlink from another root has an absolute
`from`, and its `root` and `name`.

**Shown, and `href`:** `shown` is the file by its path (`21.9`) — from this root, else `~/…`, else absolute — in
`resolve`, in each of `links`' and `backlinks`', and in their text output; another root's is beside it, as `root`
and `name`. With `--from`, every resolve gives `href`, the relative path a link from `--from` carries, encoded as a link
is: `slipbox resolve slipbox://research/algorithms/dijkstra.md#Relaxation --from notes/plan.md` gives
`../../research/algorithms/dijkstra.md#relaxation`. Without `--from`, it's null. `--from` also says which root the
link is resolved in, as a note argument does. The `name:path` form (`20.20`) is gone (`21.12`): unresolved, exit 3,
with `suggest`, its pointer.

## Git (plans `5.11`–`5.14`)

What changed on this branch, measured against the base branch (`--base <ref>`, else `[git] base`, else `main`, else
`master`) from where the branch left it — the merge base, as a pull request's diff is:

- **`slipbox changed`**: every file of the vault this branch changed, committed or not, and the untracked ones —
  `M a.md`, `+ b.md`, `D gone.md`, `R notes/new.md  (from notes/old.md)`; files outside the vault's folder left out.
- **`slipbox diff <note>`**: the note's diff, each group after `@@ line N`, `-` and `+` lines with three lines of
  context; `rows[].line` is the line in the note as it is now. A note the base hasn't is all `+` (`new: true`).
- **`slipbox worktrees`**: the repository's checkouts, the main one first (a bare repository has none) — branch, path,
  and the vault's folder there.
- **`slipbox problems`** lists a merge's unmerged files as `conflicts`, each at its first `<<<<<<<` line.

Outside a git repository, or with no base branch, these exit 3.

### Before and after a merge (plan `20.21`)

**`slipbox merge-review <branch> [--into <ref>]`**: the links merging `<branch>` into `--into` (default: the branch
checked out) would break — git's own tentative result (`git merge-tree --write-tree`, git 2.38 or newer), read without
touching the working tree or HEAD. Git can't see these itself: "`refactor` moves `docs/plan.md`; `main` added a link to
it in `docs/b.md`" changes different files and merges cleanly. Branches with no commit in common are refused, as git
refuses to merge them. Each link of the result's notes — a markdown link's path, a wikilink's path or name (`21.3`) —
that reaches nothing there, and wasn't broken in `--into`, comes with its `cause`:

- `moved`: a branch (`by`) renamed the file it names (git pairs renames by similarity) to `to`; `fix` is the target to
  write instead, from the note, its `#fragment` kept and encoded as a link is (a wikilink's in its own form: a name
  stays a name, no `.md` unless written, nothing encoded);
- `deleted`: a branch deleted it, or moved it out of the vault;
- `note-moved`: the note itself moved without its relative link; `to` is what it named from where it was, and `fix`;
- `missing`: neither branch had it — the merged branch's link to nothing.

`--json`: `{into, from, base, tree, conflicts[], breaks[{path, line, column, target, names, cause, by, to, fix}]}`;
`conflicts` are the files git couldn't merge. Committed work only: what isn't committed is in neither branch. A branch
or commit that isn't there is exit 3.

**After a merge or a pull** — a branch moved on since this copy last saw it (each command and the TUI look; the last
commit seen is kept per branch, per copy) — git's renames between the two commits are evidence of moves (`17.12`'s
redirects, each kept with the commits it came between). A link broken by one says so: `problems` gives it `moved`
(where the file is now) and the reason `moved to … — relink fixes it`, `diagnostics` the same, and `slipbox relink`
fixes it. A branch is only ever compared with itself: a switch isn't evidence — a file only one branch has comes and
goes, and nothing moved. Git pairs a move by similarity, so a file also rewritten in the same change may not be
paired: then the link is just broken, the target yours to pick.

## Search (plans `6.1`–`6.8`)

`slipbox search <words…>` ranks the vault's notes and data files by the words: each one somewhere in the file (else,
`relaxed` and a warning, files with some of them), by BM25, a word in the title or an alias counting most, then tags,
headings and the path, then the text. A hit opens at the section with most of the words — `line` and `column` are its
first line with one — and `snippet` is that line, cut around the match, `marks` the words' places in it; `more`
counts the file's other sections with some of the words. `--limit N` (default 20, up to 500).

- **By root** (`20.16`, `21.10`): `--scope here` (the default, so an agent's results are predictable) searches this
  root; `--scope linked` adds the roots linked to or from it — those its notes link into, those whose notes (as of
  their index) link here; `--scope all` every other root this machine knows. This root's hits come first, then the
  others' by score (`--limit` each), each searched with its own index (a scan where it has none). A hit of another
  root has `root` and `name`, and `abs`; `shown` is its path (`21.9`); `roots` lists those searched. Searching a root
  the machine knows doesn't count as opening it: its `seen` (the `folders` order) stays as it was. The old `--scope
  vault` is read as `here`, with a warning.
- **The query**: words (all of them); `"a phrase"` (its words in order, a line break or a comma between them too);
  `prefix*`; `-word` (none of it, with filters alone too: `#project -draft`); `title:word` (in the title or an
  alias); `#tag` or `tag:x` (notes carrying the tag, or one nested under it); `path:folder/` (files whose path
  starts so, ASCII letters in either case). Nothing is passed on as FTS5 syntax: every word is quoted. Accents and
  case don't count. Words are whole words: `cat` isn't `catalogue` (`cat*` is).
- **The index** is SQLite FTS5 in the vault's cache (`search.db`). `slipbox index` builds it, or brings it up to the
  files — `--rebuild` starts it again; the TUI keeps it as it runs. Before each search the index catches up with every
  file whose size or mtime changed since, whoever changed it. Until it's been built, a search scans the files with
  the same query, `engine: "scan"` and a warning — slower, the same notes. An index of another version, or one SQLite
  can't read, is made again. `$HOME` or `/` opened as a plain folder keeps none: it's scanned.
- **The home folder** (`20.9`): `slipbox index --home` runs the background auto-index now, in the foreground — the
  whole pass, or as much as `--budget <ms>` allows, from where it stopped; `--rebuild` starts a pass again. It walks
  `~` for roots (never into a hidden folder, `node_modules`, `venv`, `__pycache__` or `~/Library`; into a root only
  for the roots nested in it), records each in `roots.json` as found (until it's opened) and its name in the named
  folders' lookup, and builds its index, so its links count as backlinks of the roots they reach. `--json`: `{root,
  found, indexed, left, started, finished}`. Every command notes the time it ran (`activity` in the state folder): the
  TUI's auto-index waits while an agent works.
- **Freshness** (`20.10`): `slipbox index --refresh [path]` brings a root's index up to date now — this one's, or
  that of the root holding `path` (outside every root, the plain folder it's in), opened or not: every file's size
  and time checked, every folder listed again. `--json`: `{root, notes, changed, unchanged, gone, reached, indexed,
  ms}`. `info` says when this root's index was written (`index.written`) and where the background index has got to
  (`background`); `roots.json` keeps each root's `indexed` time. A root on a drive that isn't there (under
  `/Volumes`, `/media`, `/run/media`, `/mnt`) is `unavailable`, not gone: kept, never pruned, and a link into it is
  broken with that said ("its drive isn't there") until the drive is back; `folders` marks its copy "not here".
- **`[search] engine`**: `auto` (the index when it's built, else a scan), `index` (built first when there's none),
  `scan` (never an index).
- **A hit's `section`** is the section it's in, as scout names and bounds it (`{name, line, end}`: `Auth/Setup`,
  `§:file`, `§:part~2`) — the size band's, not the line's heading (that's `heading`); `docs/design/decisions.md`,
  `6.1`, says how files are cut.
- **`find`** is the other tool: every match of a literal or a regex, not ranked.

## Renames (plans `17.15`, `7.1`–`7.4`)

Each `files` entry is `{path, abs, root, name, edits[{line, before, after}]}` — `root` and `name` another root's.

`slipbox mv <note> <new-path>` renames or moves a note (or any file of the vault; the extension is kept when the
new path has none) and rewrites every link to it, in this vault and in every vault whose index links into it
(`17.11`) — a note's, a reached note's (`20.8`), a data file's value, a code comment's path (`20.19`: the code files'
grammars are loaded before it plans, so their comments count however fresh the process). `--dry-run` is the preview
(`7.2`): each changed line, before and after, and nothing written.

- **The new path** is from the root, unless it's absolute or starts with `./` or `../` (from the current folder), as
  `write --create` and `mkdir` take one; outside the root, or a pointer, it's refused.
- **Each link keeps how it was written:** a relative path stays relative, `#heading` and `#^block` stay, a
  percent-encoded URL is encoded again, a reference link's definition is rewritten where it is; a filesystem path
  (`17.16`) stays in its form — `~/`, absolute, or a `file://` URL.
- **Byte ranges, never re-serialised** (`7.6`): each edit replaces the target at the line and column the index
  recorded (of the links there with that target, the nearest — so the same text in code nearby is left). A file
  whose link isn't there any more (another vault's index older than its file) is skipped, and said so.
- **The note itself:** its own relative links follow it to its new folder; nothing else is written into it — no
  `previous_names` (`21.12`; `[rename]` is retired). A redirect is kept (`17.12`): evidence for `relink` to fix a link
  this rename couldn't reach, never a way to resolve it.
- **Refused, nothing written** (exit 5): a target that exists (a different file whose name differs only in case
  too), a file where its folder would be, a path outside the vault or hidden, a file changed between the plan and
  the writing.
- **Git** (`7.3`): a root it writes to whose tree already has changes is named in `warnings`; the rename goes ahead.
- **A file's encoding:** one it rewrites keeps its byte order mark and its line endings; one not valid UTF-8 is
  skipped, and said — never written back with U+FFFD where its bytes were.

**A folder** (`18.3`): `slipbox mv <folder> <new-path>` moves it with everything in it — what the walk doesn't list
too — and rewrites every link to anything in it, from where each linking file will be; links between two files that
move together stay as they are. Its new path is taken as a note's.

**A nested vault's folder** (`18.7`) is a folder of the vault holding it, whichever one the path names: `mv` moves it,
rewriting the links into it by path — this vault's, and those of the vaults that reach it — and its own relative links
out; its id and name go with it, and it's recorded at its new place. `rm` counts the links into it as the ones that
break.

**Deleting and copying** (`18.4`, `18.5`): `slipbox rm` moves a note, file or folder to the vault's trash — in its
state, never in the folder — and says how many links from other notes break (`breaking`, and a warning); `--dry-run`
only says. `slipbox trash` lists what's there; `slipbox trash restore <id|path>` puts an item back where it was,
refused when something is there now. `slipbox cp` copies a note, file or folder, as written, to a path taken as
`mv` takes one.

`slipbox name <name>` names this root (`21.10`): a `.slipbox/` folder's `[vault] name` changed, the old name added to
its `previous_names` (a pointer by it still finds the folder, and the relink brings it to the new one), or — never named
— a name and an id written; a repository without `.slipbox/` given one to hold the name. Previewed with `--dry-run`; a
name a different folder has here is refused (exit 5), and so is a `[vault]` table the edit can't follow (a `[ vault ]`
header, dotted `vault.name` keys) — by `init --name` too: edit it by hand. `slipbox relink [note]` rewrites the links of
a note (or every note) by a path — a markdown link's, a wikilink's in its own form — that reach nothing but whose file
was seen to move (`17.12`) — broken, since a move never resolves a link (`20.2`) — to its path now. For every note, it
also fixes what the root's own last move by hand broke (`20.17`, `21.8`), from what the state knows of where it was: its
links out by a path, now reaching nothing, to where they reached from there; and the other roots' links into where it
was (as of their index) to where it is — each in its own form (relative, `~/`, absolute), a link that still reaches
something left alone. The command that first opens a moved folder says how many lines that is. Both take `--dry-run`.

**Plans, in two steps** (`20.18`): every command that generates edits — `mv`, `name`, `rename-heading`,
`relink`, `convert-links`, `init <folder>`, `deinit`, `undo` — takes `--plan`: it says what it would do, as
`--dry-run` does, writing nothing, and saves the plan (its `id`) in the state folder, tied to each file as it is.
`slipbox apply <id>` writes it — refused, nothing written (exit 5), when any of its files changed since, so a stale
plan is never applied — and it's gone; `--dry-run` shows it again and says whether it's still good (`stale: …`
in the warnings). `slipbox apply` alone lists the plans waiting, newest first. So an agent plans, reviews, then
applies; without `--plan` a command still applies at once. `init <folder>` takes it for a folder inside a root, and
`name` for a root that has a `.slipbox/`: making a `.slipbox/` (a plain folder's `init`, a repository's first `name`)
is no edit a plan holds, so `--plan` there is refused (exit 2), nothing written — `--dry-run` previews it.

`slipbox convert-links [note]` (plan `20.1`) makes a note's links — or every note's — plain paths, once, by today's
resolution rules: each `[[…]]` a relative markdown link (`![[…]]` an image-syntax one, which still embeds a note),
its alias kept as the text, else the link as it was drawn (`[[plan#Aims]]` → `[plan › Aims](docs/plan.md#aims)`) —
literal still: what a markdown label would act on (a backslash, brackets, `*`, a backtick, `<`, `&`, `~`, a `_` at a
word's edge) is escaped, and in a table the `|` too. A heading becomes its slug, checked to be in the note, a block
`#^id`, a picture's size Obsidian's markdown form (`![[pic.png|300]]` → `![pic.png|300](pic.png)`). And each markdown
link written from the root (`[x](/docs/x.md)`: here from the nearest root, `21.2`, but the filesystem's root to other
tools) is made relative, so it reads the same anywhere — a reference link's in its definition, once however many use
it; one naming the filesystem's own path is left, as it
means the same after. Spaces, parentheses, `#` and `%` in a path are percent-encoded. Left as written, each said in
the warnings: a link that reaches nothing, a heading or block that isn't there (or a heading no slug can reach,
`## 🎉`), one not where the index has it; and a link several notes answer to, listed in `ambiguous` (`{key, shown,
line, written, candidates[]}`) — written as a path by hand, or picked in the TUI. Wikilinks in code and in the
frontmatter are text, not links, and stay. A vault nested in this one is converted on its own, run there: its notes
aren't this vault's. `--dry-run` previews it; `undo` takes it back (a run that changed nothing isn't logged, so it
can't stand in front of the one that did).

`slipbox rename-heading <note> <heading> <new>` renames a heading (`11.9`) — found by its text in any case, or its
slug — and every link to it: `[x](note.md#heading)` and `![x](note.md#heading)` in the form each has, the slug
(`#new-name`) or the text (`#New%20Name`, `<note.md#New Name>`), and the note's own `[x](#heading)`, in this vault and
the vaults linking into it; the heading's closing `#`s stay.
Refused (exit 5) when the note has no such heading, has two of its name (a link can't tell them apart), or has a
heading with the new name already. It takes `--dry-run`, and `undo` takes it back.

**Undo** (`7.4`): `slipbox undo` takes back the root's last `mv`, `name`, `rename-heading`, `relink`, `convert-links`
or `replace --all` — the TUI's or the CLI's alike: every file it rewrote gets back the text it had, byte for byte (a
folder's `previous_names`, for a `name` taken back), what moved moves back, and the folders the move made go if
they're empty. It's a rename like the others — `--dry-run`
previews it, each changed line the other way; open notes, the index and the redirects follow — and it's refused,
nothing written (exit 5), when a file the rename wrote has changed since, or what moved isn't where it went; it
stays next to undo, so putting the file back lets it through. Undone, it's forgotten: the next `undo` takes the one
before (the vault keeps the last 20, in its state). In a git checkout, each rename is undone only on the branch it was
made on (`5.9`): on another, `nothing to undo on branch main: the last rename was made on branch feat` (exit 3).
A folder made a vault or a vault made a folder (`18.11`) isn't among them: `deinit` and `init` take each other back.

**A folder made a vault, and back** (`18.11`): `slipbox init <folder>` on a folder inside a vault makes it a vault of
its own — its `.slipbox/`, named only with `--name` (the TUI's prompt suggests a distinct name). Links are paths
(`20.2`): relative and filesystem ones reach across the new boundary as they are; one written from the root (`/…`),
which would now mean the other root, is rewritten to reach what it did, shown in the preview. So is a wikilink that
wouldn't reach (`21.3`): a name across the boundary, which a root ends, becomes a path (`[[F/plan]]` into it,
`[[../home]]` out of it); a path from the root is read from the new one (`[[F/x/y]]` inside it is `[[x/y]]`); a name
within it stays a name. `slipbox deinit <folder>` undoes it for a vault nested in another, rewriting such links the
other way — its paths from its root gain its folder, and a name another note of the parent shares (its own, or a
parent's) becomes a path, never landing on the other one: its `.slipbox/` goes to the parent's trash (`trash restore`
makes it a vault again), and the machine forgets it. A git checkout is refused, with `.slipbox/` or without: it's a
vault by itself (`20.3`). Both take `--dry-run` and answer like `mv`, `init` adding the vault's `root`, `name` and `id`.
Every plan's writes into another vault's files reach that vault's index at once, as if it had been opened.

## Capture and the scratch (plans `8.1`–`8.4`)

`slipbox capture` **is** the capture path (plan `8.1`). An nvim keybinding, an agent or a shell
calls it, and the user reads the scratch in the TUI.

- **Where.** In the state dir per vault by default; with `capture.location = "vault"`, in the
  vault. A plain folder's scratch is its own, always in its state: nothing is written into it.
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
longer than any inside it). Links are left as written: paths, which an agent reads as they are.

- **What's in it**, breadth first: the notes asked for; what they link to, in the order the links are written (a note,
  or a file of the vault: code, data); the files linking to them, by path; then, with `--depth N` (0–5; default 1),
  what those links link to, a level at a time. Another vault's note, linked or linking, is included but not followed.
  `--no-backlinks` leaves out the files linking in.
- **What's left out**, named in a last `## Left out` section (and `left[]`): a picture or another binary file, a
  file over 256 KB, and whatever is past `--limit N` (1–500; default 25) — the first 20 named, the rest counted.
- **`[context]`** sets the defaults (`depth`, `backlinks`, `limit`); the flags win.
- **`--copy`** puts it on the clipboard instead, as `scratch copy` does; the output says how, and how big.

The human output is the bundle itself, to pipe into an agent; `--json` has it as `text`, beside what went in.

## Export (plan `10.x`)

`slipbox export <note…> [--to docx|pdf|html|epub|md] [--out|-o <path>]` writes the notes as one document, a chapter
each: Word, PDF, a web page, an e-book or Markdown. Without `-o` it goes beside the first note, under its name
(Markdown's `name.export.md`, its pictures in `name.export.assets/`); `--to` names the format, else `-o`'s extension
does. It never writes over a note but an earlier Markdown export (exit 5), and fetches nothing.
`docs/design/export.md` has what goes in and how.

## `slipbox doctor` (plan `19.7`)

`slipbox doctor` lists each language's servers (languages sharing them together), and for each: found — in the
project, on `PATH`, in a place the user installs tools (Mason's, cargo's, go's), or in slipbox's own installs — and
where; not found but on npm, so installed when it's first needed (its pinned package); or native and nowhere, with how
to get it (`rustup component add rust-analyzer`). An add-on says where it runs: where the project has its config.
Each language's linters without a server (`19.19`) follow, `(linter)` after the name: found in the project or on
`PATH`, or how to get it, and the config files it runs beside. `slipbox doctor <file>` takes one file: its language,
its project's top folder, and the servers that would serve it there, the main one first, then its linters — where each
would run, or that the project has no config for it — then what it would have had and hasn't. A note is exit 3:
slipbox serves notes itself. In a root you don't trust (`23.x`), a warning says so, and what that leaves out there —
`ruby-lsp not run (it runs the project's Gemfile (Bundler))`, `rust-analyzer without the project's code`,
`.vscode/settings.json not read` — and a file's servers left out are listed, `not run here: …`; `(a root you trust)`
follows a trusted project's folder. Git older than 2.42 is warned of in such a root: its filters can still run.
`--json`: an array of `{languages, servers[{name, role, status, where, path, package, hint, requires}],
linters[{name, program, where, path, hint, markers, required}]}`, or for a file `{language, languageId, root, trusted,
limits[], skipped[{name, why}], run[], missing[], linters[]}`, each linter with its `root` (null: not run).

## `slipbox diagnostics` (plan `19.22`)

`slipbox diagnostics <file>` gives a file's problems from every source, for agents and scripts — one line each, `file:line:column:
severity source code: message`, sorted by place:

- its language servers' (`19.x`): started as the TUI starts them (installed first when on npm), told the file, then
  waited for until each has said what it finds and gone quiet for 750 ms, since a server says it in stages — a server
  still at work it said it began (`$/progress`: rust-analyzer loading its workspace) isn't quiet yet; at most
  `--timeout` seconds (60), a server that said nothing by then named in a warning;
- its linters without a server (`19.19`), where its project has their config;
- its syntax errors from tree-sitter, when no server answered (a server has them then);
- for a vault note, its own (`11.5`: links that reach nothing, headings and blocks its targets haven't, conflict
  markers) and the lint surface's (`3.21`).

`--severity` (`error`, `warning`, `info`, `hint`; `[diagnostics] severity` by default, `warning`) is the least shown.
The exit is 1 when one shown is an error, 0 otherwise — the run itself succeeded either way (`--json`'s `ok`). `--json`:
`{path, language, problems[{line, column, endLine, endColumn, severity, source, code, message}], sources[{name, kind,
status}]}`, each source `server` (`answered`, `silent`), `linter` (`ran`, `not asked`, `missing`, `timeout`, `error`,
`off`), `syntax`, `slipbox` or `lint`. A missing file is exit 3.

## `slipbox lsp` (removed)

It served notes to editors over LSP (`11.x`) until links became plain paths (`20.23`). It now says so on stderr and
exits 2, so an editor still starting it shows why in its log.

## Installing for agents

`scripts/install-local.sh` writes a `slipbox` launcher into `~/.local/bin` that runs this
checkout with bun. `--skill` also links the skill into `~/.claude/skills/slipbox`. Releases — a binary per platform,
installed by `install.sh` — are plan `14.x` (`docs/design/distribution.md`).

`slipbox upgrade` (`14.4`) moves the installer's install to the latest release, checked before it's used; `--check`
only says whether there's one. Run from source, it says there are no releases to follow (exit 1); installed by
Homebrew, that `brew upgrade slipbox` does it. The CLI never checks
for updates by itself: the TUI does, once a day.

`slipbox uninstall` (`14.8`) lists what the installer put here — the link, `versions/`, `current`, `bin-link` — and
slipbox's folders it keeps; it removes nothing without `--yes`, so an agent asking only learns. `--purge` takes the
four folders too: settings, state (the scratch and the trash among it), data, cache. Notes, and the `.slipbox/`
folders in them, are never touched.

The launcher gives Bun slipbox's own `bunfig.toml` and no `.env` (`--config`, `--no-env-file`). Bun reads both from
the folder it starts in, which is whatever repository or notes folder you run `slipbox` in: that folder's preload
would run, as its code, whenever slipbox did. A launcher written before 2026-10-07 lacks this: run the script again.
The compiled binary (`bun run build`) is built with Bun's autoloading off — no `bunfig.toml`, `.env`, `tsconfig.json`
or `package.json` of the folder it starts in — for the same reason; one built before 2026-10-10 lacks it.
