---
status: done
assignee: claude-cli
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

## Done (2026-10-15)

Every vault's walk leaves the busy folders out, as home's did (`exclusion`'s `busy folder`). The explorer lists what
the walk leaves out from the disk (`tui/explorer-disk.ts`): by its path, a level at a time, browsed and opened, never
indexed; and what it hasn't reached, the vault's own: a folder it couldn't read, home's folders before its walk, so
unfolding one of them lists it at once (VV-T2's gap). A row's marks (`tui/marks.ts`): the index's five states in the
last column, git's mark two before it, a vault's branch (a worktree's after `⎇`) dimmed between; glyphs in all three
sets (`mark…` in `core/glyphs.ts`). Tests: `tests/marks.test.ts` (each mark in each set, the listing, home before its
walk). Left: the terminal check on the reference set, written with the workstream's others in one pass at its end
(the user's, 2026-10-17); and to VV-T6, the link rows, their target in the description column and `not followed`.
