---
name: nvim-remote
description: "Drive a running nvim instance (in a sibling Herdr pane or elsewhere in the current git worktree) via nvim's --server RPC. Use when the user explicitly mentions nvim, asks to open/read/edit a file in their live editor, or wants to inspect editor state. Do not use for general file edits — Edit/Write tools are safer for those. Requires an `nv` session already running in the current git worktree."
---

# nvim-remote

Drive a running nvim instance in the current git worktree over its `--server` socket. The user launches nvim via `nv` (a shell function that starts nvim with a socket keyed off the git worktree root). Any pane in the same worktree — including this agent — can then talk to that nvim via `nvim --server $sock --remote-*`.

## When to use

Use only when the user explicitly asks to:

- Open a file in their live editor
- Jump to a line/symbol in what they're editing
- Read the file/buffer they're currently working on
- Save the current buffer
- Run a vim command in their session

**Do not** use for general file edits. The `Edit` and `Write` tools operate on disk directly, without going through nvim's buffer, and are safer for automation. This skill is for editor-integrated workflows where the user wants their live view to update.

## Requirement — an `nv` session must already exist

Compute the socket path from the git worktree root:

```bash
root=$(git -C "$PWD" rev-parse --show-toplevel 2>/dev/null) || root="$PWD"
key="wt-$(printf '%s' "$root" | shasum -a 256 | cut -c1-12)"
sock="${XDG_RUNTIME_DIR:-/tmp}/nvim.${key}.sock"
```

Check it exists before doing anything:

```bash
[ -S "$sock" ] || { echo "no nv session in this worktree — ask user to run 'nv <file>' first"; exit 1; }
```

**Never spawn nvim yourself.** If no socket exists, tell the user to open `nv <file>` in another pane; then re-check.

## Learn the current CLI

The installed nvim binary is the authority. Print the remote flags:

```bash
nvim --help | grep -E '\-\-remote|\-\-server' | head -20
```

Do not rely on memorized syntax — nvim's remote flags occasionally change across versions.

## Open a file

```bash
nvim --server "$sock" --remote-tab file.rs
```

At a specific line:

```bash
nvim --server "$sock" --remote-tab +42 file.rs
```

At line + column:

```bash
nvim --server "$sock" --remote-tab file.rs
nvim --server "$sock" --remote-send ':call cursor(42, 10)<CR>'
```

Prefer `--remote-tab` over `--remote` — the latter replaces whatever's in the current window, which usually surprises the user.

## Read editor state

Current file path:

```bash
nvim --server "$sock" --remote-expr 'expand("%:p")'
```

Line under cursor:

```bash
nvim --server "$sock" --remote-expr 'getline(".")'
```

Whole current buffer:

```bash
nvim --server "$sock" --remote-expr 'join(getline(1,"$"),"\n")'
```

Cursor position `[bufnum, lnum, col, off]`:

```bash
nvim --server "$sock" --remote-expr 'getcurpos()'
```

List of open (listed) buffers:

```bash
nvim --server "$sock" --remote-expr 'map(getbufinfo({"buflisted":1}), "v:val.name")'
```

Currently visible windows and their filenames:

```bash
nvim --server "$sock" --remote-expr 'map(getwininfo(), "bufname(v:val.bufnr)")'
```

## Save

Current buffer:

```bash
nvim --server "$sock" --remote-send ':w<CR>'
```

All modified buffers:

```bash
nvim --server "$sock" --remote-send ':wall<CR>'
```

Only tell the user when you save on their behalf — silent saves are surprising.

## Run vim commands

For commands whose output you need to capture, wrap in `execute()`:

```bash
nvim --server "$sock" --remote-expr 'execute(":messages")'
nvim --server "$sock" --remote-expr 'execute(":ls")'
```

For side-effect commands, `--remote-send` is fine:

```bash
nvim --server "$sock" --remote-send ':nohlsearch<CR>'
```

## Run Lua

Value-returning:

```bash
nvim --server "$sock" --remote-expr 'luaeval("vim.fn.expand(\"%:p\")")'
```

Side-effect (returns nil, no need to capture):

```bash
nvim --server "$sock" --remote-expr 'luaeval("vim.diagnostic.setqflist({open=false})")'
```

Multi-line Lua — write to a temp file and `luafile`:

```bash
cat >/tmp/nvim-remote.lua <<'LUA'
local diags = vim.diagnostic.get(0)
for _, d in ipairs(diags) do print(d.lnum + 1, d.message) end
LUA
nvim --server "$sock" --remote-send ':luafile /tmp/nvim-remote.lua<CR>'
```

## Safety rules

- **Never quit the user's session.** No `:q`, `:qa`, `:qa!` via `--remote-send`. If you must remove a buffer you opened, use `:bd <bufnum>` targeting a specific buffer, never the current one.
- **Never save without telling the user.** `:w` writes to disk; the user should know when their file has been modified.
- **Escape insert mode first.** `--remote-send` runs verbatim. If the user's cursor is in insert mode, your keystrokes insert literal characters. Prefix commands with `<C-\><C-N>` to force normal mode:

  ```bash
  nvim --server "$sock" --remote-send '<C-\><C-N>:e file.md<CR>'
  ```

- **Don't steal focus.** `--remote-tab` opens a new tab but doesn't switch tabs on its own. Adding `--remote-tab-wait` blocks until the tab closes — use it only when you want to know when the user is done.
- **Escape shell metacharacters.** Single-quote the whole `--remote-expr` / `--remote-send` argument. Avoid embedded single quotes (use `''` concatenation or a heredoc-based approach if you need one).

## Multiple nvim / multiple Claude / edge cases

- **Multiple Claude sessions, one nvim**: fine — both connect to the same socket. Commands serialize.
- **Multiple nv sessions in the same worktree**: the first one owns the socket. Subsequent `nv` invocations detect this and start without `--listen` — they're invisible to this skill. The user knows only their first `nv` is reachable.
- **User closed nvim**: the socket file is cleaned up on graceful exit. Re-check `[ -S "$sock" ]` before every call.
- **Discovering sessions in other worktrees** (unusual):

  ```bash
  ls "${XDG_RUNTIME_DIR:-/tmp}"/nvim.wt-*.sock 2>/dev/null
  # for each, query cwd:
  nvim --server "$s" --remote-expr 'getcwd()'
  ```

## Verify a connection

Fast liveness check:

```bash
nvim --server "$sock" --remote-expr 'v:servername'
```

Should print the socket path back. If it doesn't or errors, the socket is stale or nvim isn't listening — tell the user, don't retry silently.
