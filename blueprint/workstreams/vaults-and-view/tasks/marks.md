---
status: proposed
assignee: null
blocked_by: [VV-T4]
created: "2026-10-15"
---

# VV-T5: A row's marks, and busy folders listed

Vaults, worktrees, links, the index's five states and git's marks in the explorer's columns (VV-D8, VV-D9).

## Description

- The busy folders and what `.gitignore` leaves out listed and browsed, not indexed.
- The columns at the right: the index's state last, git's mark before it, the row's description dimmed.
- Each mark in the nerd, unicode and ascii glyphs (`core/glyphs.ts`), none an emoji, each one column wide.

## Acceptance criteria

- Render tests for each mark in each glyph set; a terminal check on the reference set showing a vault, a worktree, a
  link not followed, `node_modules` not indexed and a folder that can't be read.
