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
- **Exit codes:** `0` ok, `1` error, `2` usage, `3` not found, `4` ambiguous (a link, or several
  nvims for `send`), `5` refused (a stale `--if-unchanged`, a write outside the vault or to what
  isn't a note of it, `--create` over an existing file, a note that isn't valid UTF-8, a read of a
  symlink leading out of the vault).
- **Arguments.** More than a command takes is a usage error (exit 2), not silently dropped; an
  empty value for a flag (`--root ''`, `--if-unchanged=`) too. After `--` nothing is an option:
  `slipbox read -- -dash.md` names a note that starts with a dash.
- **Flags.** Global flags may come before or after the command. An unknown flag is a usage
  error, and so is a bad value of a shared flag on any command (`--color` must be `auto`,
  `always` or `never`). `--width` takes a whole number from 20 to 1000, written in digits.
- **Human output** of note text (headings, link text, paths, the scratch) is sanitized like the
  TUI's (constraint `2.9`); only `render`'s own colours are escape codes.
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
| `resolve <link>` | `{link, status, path, abs, heading, line, candidates[]}` |
| `links <note>` | `[{kind, target, heading, text, line, column, status, path, candidates}]` |
| `backlinks <note>` | `{path, backlinks[{from, line, column, text}]}` (a note's links to itself excluded) |

These churn freely before 1.0:

| Command | `data` in `--json` |
| --- | --- |
| `ls` | `[{path, title, size, mtime, tags, links}]` |
| `outline <note>` | `{path, headings[{depth, text, slug, line}]}` |
| `init [dir]` | `{root, created}` |
| `info` | root, mode, marker version, paths, index stats, skipped entries, stale |
| `themes` | `[{name, source, path?, current}]` |
| `commands` | `[{id, title, cli, desc}]` — the registry with CLI equivalents |
| `find <query> [note]` | `{query, regex, whole, count, matches[{path, line, column, match, text}]}` |
| `replace <note> <old> <new>` | `{path, count, dryRun, sha, newSha, changes[{line, before, after}]}` |
| `task <note>` | `{path, tasks[{line, checked, text}]}`; with a line `{path, line, text, checked, changed, sha}` |
| `read <note>` | `{path, abs, sha, bom, crlf, invalidUtf8, content}` |
| `write <note>` | `{path, created, appended, previousSha, sha}` |
| `send <note>` | `{path, line, server, commands[]}` |
| `history` | `{read[{path, at, line}], open[[path…]…]}` (open: the TUI's tabs, each its windows) |

`resolve` treats a target with a scheme (`https:`) as external only outside `[[…]]`, with no spaces,
and when no note has that name: `resolve "Meeting: Q3"` finds `Meeting: Q3.md`. A markdown link
resolves to the note's own path whatever case the link uses (`[x](Note.md)` → `note.md`), so it
counts as a backlink.

## Naming notes

`<note>` is tried in order:

1. An existing file path, relative to the current directory. That also picks the vault, by
   walking up from the file. A file the walk excludes, such as one that is gitignored, hidden
   or under `node_modules`, is still read when named explicitly, as in the TUI. It never joins
   the vault's index.
2. A vault-relative path.
3. A note name, resolved like a `[[wikilink]]` with no linking note. Collisions then go to the
   shortest path, and a real tie exits 4.

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
slipbox task 2026-09-14-weekly 13 --check
slipbox read note --json                 # data.content, data.sha
slipbox write note --stdin --if-unchanged <sha> < new.md
slipbox write logs/2026-10-01 '# 1 October' --create
slipbox send handbook --line 42          # to the running nvim, as space n s does
slipbox history --json                   # data.read[{path,at,line}], data.open (tabs)
```

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
  vault, a symlinked folder on the way included.
- **`task`** lists task items from the parsed note, so a `- [ ]` inside a code block isn't one.
  With a line it toggles that task; `--check` and `--uncheck` set it and change nothing when it is
  already so. A toggle is a one-byte edit, so it works on a note that isn't valid UTF-8 too.
- **Big notes.** `read`, `find`, `replace`, `write` and `send` read a note's bytes and never parse
  it, so a note the walk leaves out for its size is still quick to reach. `find` shows a long line
  as a window around the match (`…` where cut), so its output grows with the matches, not with the
  line; a note it can't read is a warning, and the rest are still searched.
- **What a writer may change.** `write`, `replace` and `task` change only a markdown note of a real
  vault: inside it by its real path, and where the walk lists notes — never `.slipbox/`, `.git/`,
  a hidden folder or `node_modules`, and never a path outside the vault (which would otherwise be
  single-file mode there). `replace --dry-run` only reads, so it previews any note; its `newSha` is
  `null`.
- **`send`** uses `editor.remote` exactly as `space n s` does: the nvim preset finds the running
  nvims (the one picked last in the TUI while it answers, else the only one, else the one working
  where the note lives) and `--server <socket>` names one. Several and no way to choose is exit 4
  with the candidates.
- **`history`** reads the TUI's state: the notes it read, newest first, with the line it was on.

## `resolve`

It uses the same resolver as `links` and the TUI, so it is the CLI equivalent of following a link,
attachments included. Takes `[[target#heading|alias]]` or a bare `target`. With `--from <note>` it
resolves the way a link inside that note does: same directory first, per decision `1.4`, then
markdown-relative paths. With a heading, `line` is that heading's source line. External URLs come
back as `status: "external"`.

## Capture and the scratch (plans `8.1`–`8.4`)

`slipbox capture` **is** the capture path (plan `8.1`). An nvim keybinding, an agent or a shell
calls it, and the user reads the scratch in the TUI.

- **Where.** In the state dir per project by default; with `capture.location = "vault"`, in the
  vault. The project is the vault root; with no vault, the git top-level; with no repo, the
  current directory, which keeps `prompt-buffer.lua`'s per-project behaviour.
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
