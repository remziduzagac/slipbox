---
status: done
assignee: claude-cli
blocked_by: []
created: "2026-10-14"
---

# GIT-T10: Branches in the git panel, their worktrees and bases

The Branches section, a worktree marked on its branch, each branch against its own base (GIT-D9, GIT-D10).

## Description

- The Branches section: this branch, the ones checked out in a worktree (`⎇`, its folder), those touched lately, then
  folded the merged and the untouched; each with its uncommitted changes, ahead and behind on its base, `◆`, `✓`; `/`
  filters. Asked in the background.
- Opened up in place: with a worktree, its changes and `[Open] [Review] [Merge…]`; without, `[Check out here] [Open in
  a worktree] [Merge…]`; a file's diff in a peek (VV-D7).
- New branch: a name, `From`, and a new worktree for it, ticked, in a folder asked for; Remove, merged only, after
  asking; a gone folder marked, with Prune.
- Each branch's base: kept when slipbox makes the branch; else the nearest of `[git] bases`; "Compare against…"; used
  by `space g c`, `space g d`, the review, the merge review and the panel.

## Acceptance criteria

- A terminal check on the example set: branches listed in order, the worktrees marked; one opened up; one gone into; a
  branch made from `dev` in a new worktree, shown `↑n on dev`; a merged worktree removed after asking, one with changes
  refused.
- Unit tests for the base: kept, guessed among `[git] bases`, changed.
- `bun run check` passes.
