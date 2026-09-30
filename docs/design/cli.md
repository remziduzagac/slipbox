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
| `render <note>` | `{path, width, lines[], headings[{level, text, slug, line}]}` |
| `capture [text]` | `{scratch, project, entry}` |
| `scratch show` (also plain `scratch`) | `{path, content, sha}` |
| `scratch path` | `{path, exists}` |
| `scratch clear` | `{path, cleared, previousSha}` |
| `scratch copy` | `{path, chars, methods[], file, confirmed}` |
| `resolve <link>` | `{link, status, path, abs, heading, line, candidates[], vault, via, reason}` |
| `links <note>` | `[{kind, target, heading, text, line, column, status, path, candidates, vault, via, reason}]` |
| `backlinks <note>` | `{path, backlinks[{from, vault, line, column, text, kind, target, heading, block, alias}]}` |

These churn freely before 1.0:

| Command | `data` in `--json` |
| --- | --- |
| `ls` | `[{path, title, size, mtime, tags, links}]`; `--files` adds `[{path, group, format, size, mtime}]` |
| `outline <note>` | `{path, headings[{depth, text, slug, line}]}` |
| `init [dir]` | `{root, created, identified, id, name}` — `--name N`; a name in use is exit 5 |
| `info` | root, mode, `vault{id, name, aliases, previous_names, key}`, paths, index stats, skipped, stale |
| `vaults` | `[{key, id, kind, name, aliases, previous_names, path, seen, exists}]`, newest first |
| `mv`, `rename-vault`, `relink` | `{kind, from, to, dryRun, move, files[], warnings, skipped, written}` (see Renames) |
| `themes` | `[{name, source, path?, current}]` |
| `commands` | `[{id, title, cli, desc}]` — the registry with CLI equivalents |
| `find <query> [note]` | `{query, regex, whole, count, matches[{path, line, column, match, text}]}` |
| `replace <note> <old> <new>` | `{path, count, dryRun, sha, newSha, changes[{line, before, after}]}` |
| `task <note>` | `{path, sha, tasks[{line, checked, text, raw}]}` |
| `task <note> <line>` | `{path, line, text, checked, changed, sha}` |
| `read <note>` | `{path, abs, sha, bom, crlf, invalidUtf8, content}` |
| `stat <note>` | `{path, abs, size, mtime, title, tags, headings, links, unresolved, backlinks}` + `read`'s flags |
| `write <note>` | `{path, created, shadows (with --create), appended, previousSha, sha}` |
| `mkdir <path>` | `{path, created}`; an existing path or one outside the vault is exit 5 |
| `send <note>` | `{path, line, server, commands[]}` |
| `history` | `{read[{path, at, line}], open[[path…]…]}` (open: the TUI's tabs, each its windows) |

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
  vault, a repository, or a loose file's own folder (`17.1`) — inside it by its real path, and
  where the walk lists notes: never `.slipbox/`, `.git/`, a hidden folder or `node_modules`, and
  never a path outside `--root` when that names the root. `replace --dry-run` only reads, so it
  previews any note; its `newSha` is `null`.
- **Where a command works.** The root is decided by the file: the nearest `.slipbox/` above the
  note argument (or cwd), else its git repository, else the home vault (the file's own folder,
  listed alone). `$HOME` and `/` are never a root. Each command records the vault in
  `vaults.json`.
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

**Across vaults** (plan `17.8`–`17.11`): `[[vault:note]]`, bare `vault:note` too when `vault` is a vault's name, and a
path out of the root resolve into the other vault: `path` and `abs` are absolute, and `vault` names it. `via` says
when a link got there by an `alias`, a `previous-name` or a `redirect` (and a warning says so); `reason` says why one
didn't (`unknown vault "x"`). A backlink from another vault has an absolute `from` and its `vault`.

## Renames (plans `17.15`, `7.1`–`7.3`)

Each `files` entry is `{path, abs, vault, edits[{line, before, after}]}`.

`slipbox mv <note> <new-path>` renames or moves a note (or any file of the vault; the extension is kept when the
new path has none) and rewrites every link to it, in this vault and in every vault whose index links into it
(`17.11`). `--dry-run` is the preview (`7.2`): each changed line, before and after, and nothing written.

- **Each link keeps how it was written:** a name stays a name (`[[plan]]` → `[[roadmap]]`), unless another note has
  the new name — then the path, so it can't reach the wrong one; a path stays a path, a relative one relative, an
  extension written stays, `#heading`, `^block`, `|text` and `\|` stay, a `vault:` prefix stays, a percent-encoded
  URL is encoded again, a reference link's definition is rewritten where it is. A link written as the note's alias is
  still right, and left alone.
- **Byte ranges, never re-serialised** (`7.6`): each edit replaces the target at the line and column the index
  recorded (of the links there with that target, the nearest — so the same text in code nearby is left). A file
  whose link isn't there any more (another vault's index older than its file) is skipped, and said so.
- **The note itself:** its own relative links follow it to its new folder; when its name changes, its old name is
  added to its frontmatter's `previous_names` (`rename.previous_names`), spliced in, so links this machine can't
  reach still find it (`17.7`). A redirect is kept too (`17.12`).
- **Refused, nothing written** (exit 5): a target that exists, a path outside the vault or hidden, a file changed
  between the plan and the writing.
- **Git** (`7.3`): a root it writes to whose tree already has changes is named in `warnings`; the rename goes ahead.

`slipbox rename-vault <name>` renames this vault: `[vault] name` in its config, the old name added to its
`previous_names`, and every `[[old:…]]` rewritten, here and in the vaults linking into it. `slipbox relink [note]`
rewrites the links of a note (or every note) that reach their note only by a previous name or a redirect, to its name
or path now. Both take `--dry-run`.

## Capture and the scratch (plans `8.1`–`8.4`)

`slipbox capture` **is** the capture path (plan `8.1`). An nvim keybinding, an agent or a shell
calls it, and the user reads the scratch in the TUI.

- **Where.** In the state dir per vault by default; with `capture.location = "vault"`, in the
  vault. The project is the root: the vault, else the git repository (`17.1`); a loose folder's
  scratch is the home vault's, always in its state.
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

## Installing for agents

`scripts/install-local.sh` writes a `slipbox` launcher into `~/.local/bin` that runs this
checkout with bun. `--skill` also links the skill into `~/.claude/skills/slipbox`. Real packaging
(`bun build --compile`, release assets) is plan `14.x`.
