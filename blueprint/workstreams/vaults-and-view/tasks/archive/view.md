---
status: done
assignee: claude-cli
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

## Done (2026-10-15)

The view (`explorerTop`) and the breadcrumb's trail (`explorerTrail`) in `src/tui/app.ts`; the breadcrumb drawn under
the explorer's title (`drawCrumbs`). `z` zooms in, `-` (nvim-tree's and oil's key for the parent folder) out a level, a
click on the breadcrumb to its folder; going somewhere outside the view zooms it out to the common parent, only the two
paths unfolded. Another vault's row unfolds in place with `l`; `enter` goes into it. Gone: `..`, the roots beside the
tree, the named folders' list at the start, `:pin-root` (`vault.pin_root`). A file you may not write opens read-only,
said; a folder you may not read says why. The workstream's design.md has the text for tui.md. Left to VV-T5: the busy
folders listed and the rows' marks; the drawings' compact rows (`worktree/kestrel/` as one row) aren't drawn.
