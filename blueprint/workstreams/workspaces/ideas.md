# Ideas

## What a workspace holds

- The tabs and windows only, as kept per branch and per folder of home today; the panel layout, the UI settings
  changed and the recent lists shared by the vault's workspaces. (2026-10-24) Proposed (WSP-D2).
- The panel layout per workspace too: a branch brings back whether the explorer and the outline were open and how
  wide. Nearer Obsidian's workspaces, but a branch switch that opens or closes panes surprises; worth it with named
  workspaces, chosen on purpose. (2026-10-24) Proposed not now (WSP-D2).
- Everything per workspace, the UI settings changed included: a theme or line numbers that change with the branch.
  (2026-10-24) Proposed not chosen (WSP-D2).

## The scratch

- The scratch per workspace: it gathers material for the task at hand, as a branch is a task. But the CLI writes it
  (`slipbox capture`) without knowing a workspace, a branch switch would hide what an agent captured, and a worktree
  already gives a task its own scratch. (2026-10-24) Proposed not now (WSP-D3).

## Named workspaces

- Workspaces of your own in one vault (`review`, `writing`), each its tabs and its layout, picked from a list
  (Obsidian's). The issue says later, once the term exists. (2026-10-24) Proposed not now: a non-goal, its line
  reworded (WSP-D2).

## Where you are on the top bar

- Centred on the screen, as a window's title is, moved left only as far as the right end's items need. (2026-10-24)
  Proposed (WSP-D4).
- Left-aligned after the chip: it never moves, but crowds the chip and leaves the bar lopsided. (2026-10-24) Proposed
  not chosen (WSP-D4).
- The branch with git's glyph, `◈ kestrel  ⎇ main`, rather than the status line's `· main`: clearer as a target, but a
  second way to write what the docs already show one way, and a worktree's `@feat` would want it too. (2026-10-24)
  Proposed not chosen (WSP-D4).
- Home's folder as `◈ ~ › notes`, the peek's title's `›` (`~ › todo.md`): read as "home, in notes". A glyph of its own
  for a workspace was weighed and left: one more glyph to learn, in three sets, for one case. (2026-10-24) Proposed
  (WSP-D4).

## The names in the code

- `Session` renamed `Workspaces`, `session.json` renamed: the file holds more than the workspaces (what they share,
  the nvim picked), `slipbox history` reads it, and a rename asks a migration for no one's benefit. (2026-10-24)
  Proposed not chosen (WSP-D6).
