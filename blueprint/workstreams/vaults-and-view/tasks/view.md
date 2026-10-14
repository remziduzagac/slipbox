---
status: proposed
assignee: null
blocked_by: [VV-T1]
created: "2026-10-15"
---

# VV-T4: The explorer as one tree, and the view

The view, the breadcrumb, zooming out to a common parent and in on purpose (VV-D5).

## Description

- The view starting at what's opened (`x/y` shows `y`, vault `x` named); the breadcrumb above it, `~` for home.
- Going outside the view zooms out to the common parent, only the two paths unfolded; `z` on a folder and a breadcrumb
  click zoom in.
- Gone: the roots beside the tree, `..` above the root as a mode of its own, the named folders' list at the start,
  `:pin-root`.
- Any folder opened where it can be read; a file that can't be written read-only, said so.

## Acceptance criteria

- Terminal checks: `x/y` opened shows `y`; a worktree kept elsewhere chosen, the view at the common parent with both
  paths unfolded; `z` and the breadcrumb zoom in.
- `bun run check` passes; the explorer's chapter in the manual rewritten.
