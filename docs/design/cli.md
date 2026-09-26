# The CLI — the agent surface

The CLI is how agents, scripts and editor keybindings drive slipbox from phase 1–2 onward
(`docs/plan.md`, Principles). The command list is decision `9.1`; this document is its reference.
Code: `src/cli/`. The agent-facing skill that teaches it (plan `9.8`) is
[`skills/slipbox/SKILL.md`](../../skills/slipbox/SKILL.md).

## Semantics: disk is the contract (decision `9.4`)

A CLI call is a second process. It reads the files and the fresh cache, never a TUI's unsaved
buffer. It writes atomically, with a temp file plus rename. The TUI treats a CLI write like any
external writer: it reloads and says so.

From phase 3 the TUI records paths with unsaved changes in `dirty/<pid>.json` in the state dir
(plan `9.9`; `core/stale.ts` has the writer, not yet called). Every CLI call reads it, ignoring and
pruning files from dead pids. Human output then carries a
warning, and `--json` output a `stale` array. It is advisory only: never a lock, never a refusal.
Phase 2's TUI never has unsaved changes, so the list stays empty until phase 3.

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
- **Exit codes:** `0` ok, `1` error, `2` usage, `3` not found, `4` ambiguous, `5` refused
  (`--if-unchanged`).
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
