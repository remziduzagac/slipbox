---
status: proposed
assignee: null
blocked_by: [GIT-T3, GIT-T5]
created: "2026-10-14"
---

# GIT-T6: Pulling where both sides moved, and rebasing onto the base

A diverged pull and a rebase onto the base, their conflicts through the merge screen (GIT-D6).

## Description

- A pull that can't fast-forward asks merge, rebase or nothing, defaulting to `pull.rebase`.
- `shift+r` in the git panel rebases onto the base's tip.
- An operation under way on the status line; continue, skip and abort in `space g`; hooks only where trusted.

## Acceptance criteria

- Terminal checks: a diverged pull merged; a branch rebased onto the base through one conflict; a rebase aborted, the
  branch as it was.
- `bun run check` passes.
