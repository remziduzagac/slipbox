---
status: proposed
assignee: claude-cli
blocked_by: []
created: "2026-10-24"
---

# WSP-T2: Where you are, on the top bar, else the status line

WSP-D4 and WSP-D5.

## Description

- `src/tui/where.ts`: `whereOf(app)` gathers the parts (the vault, home's folder, the branch, its track and its
  operation); `fitWhere(parts, width)` cuts them, a pure function. `vaultStatus` in `src/tui/git.ts` goes.
- The top bar's middle: centred, clamped between the chip and the right end's first item, two hot regions
  (`top:vault`: the named folders' list; `top:branch`: the branches' menu), hover.
- The status line's where only while the bar doesn't say it, home's folder included.
- The mouse help (`src/tui/mouse-help.ts`) and `keys.md`'s mouse table.

## Acceptance criteria

- Unit tests: what the bar shows for a named vault, a vault by path, one without git, home, home's folder, Elsewhere,
  a named worktree, a detached head, a branch ahead and behind, a merge and a rebase under way, a wide-character name;
  each cutting step at its width; the span with the left rail off, the outline's button and `indexing…`; the targets;
  the status line's rule.
- Terminal checks, by case: the two clicks (the folders' list and `enter` into another vault; the branches' menu; a
  worktree's `@`), home's folder, Elsewhere, a vault without git and one by path, a detached head, a branch switched
  while slipbox runs, a merge and a rebase under way, a narrow terminal, the bar hidden and zen, a wide-character
  name. A `where()` helper beside `status()` in `tests/terminal/session.ts`; the checks that read the vault off the
  status line read it with it.
- Tried live, on the reference set or a scratch home.
