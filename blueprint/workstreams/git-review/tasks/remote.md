---
status: proposed
assignee: null
blocked_by: []
created: "2026-10-14"
---

# GIT-T3: The remote's commands and stash

Fetch, pull (fast-forward), push and stash, asked for and never automatic (GIT-D4, `26.6`).

## Description

- In the git panel: `f` fetch, `p` pull, `shift+p` push, `z` stash (GIT-D12); in the palette as every command.
- git without a terminal: `GIT_TERMINAL_PROMPT=0`; ssh in batch mode unless the user set their own; a failure said in
  git's words with a hint.
- A push's pre-push hook only in a trusted vault (D172, D175); an upstream asked for when the branch has none.
- The status line's ahead and behind; unsaved notes saved or kept before a pull.

## Acceptance criteria

- Terminal checks against a bare repository made in the check's folder: fetch, a fast-forward pull, a push, a stash
  saved and popped; a remote needing a password fails at once.
- `26.6` checked off in the roadmap; `bun run check` passes.
