---
status: done
assignee: claude-cli
blocked_by: []
created: "2026-10-14"
---

# GIT-T5: The merge screen

git's conflicts settled a card at a time (GIT-D5).

## Description

- Opened from Problems, source control or `x` in the git panel on a conflicted file; the three versions from the index's
  stages, the markers as fallback.
- Each card: yours and theirs against the base; `o`, `t`, `b`, `shift+b`, `e`, `a`, `n`, `p`; the result below.
- Saving through `App.writeBuffer`; `s` stages; the conflict prompt's (M)erge on the same screen.

## Acceptance criteria

- A terminal check on a merge of the example set's branches with two conflicts: one taken from each side, the file saved
  and staged, `git status` clean of conflicts.
- `bun run check` passes.
