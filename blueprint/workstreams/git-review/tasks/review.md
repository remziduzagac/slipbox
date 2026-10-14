---
status: proposed
assignee: null
blocked_by: [GIT-T1]
created: "2026-10-14"
---

# GIT-T2: Reviewing a change, a hunk at a time

`v` in the git panel: the working tree's changes walked one hunk at a time, each kept, reverted or noted (GIT-D3).

## Description

- The hunks across every changed file against what's staged (`26.1`'s), untracked files as wholly added, in path order;
  the window showing one with its file, its place and the keys.
- `y` stages the hunk; `x` reverts it, saved, one undo step, a file with unsaved typing skipped and said; `c` asks for a
  note and adds a scratch entry with the file, the lines and the note; `n`, `p`, `enter`, `esc`.
- The summary at the end: kept, reverted, noted; `space s y` named.

## Acceptance criteria

- A terminal check: an agent's changes to three files reviewed; one kept (staged in git), one reverted (the file as
  staged), one noted (in the scratch with its lines).
- `bun run check` passes; the manual's git chapter describes it.
