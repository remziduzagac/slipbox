---
status: done
assignee: claude-moves
created: "2026-10-11"
---

# T4: `slipbox deinit` relinks pointers that name the folder

Unmaking a named folder rewrites the pointers that name it, from the files this machine reaches, as paths.

## Description

`planUnmakeVault` rewrites `/…` links and wikilinks so they keep reaching what they reached, but not pointers by the
folder's name (`slipbox://<name>/…`), which then break: once the folder has no name, nothing can resolve them. Plan
them too, as the relink would: each pointer from another root's file (the backlinks across roots, `reach.ts`) becomes
a relative path where the two travel together, else the path a link between separate folders gets (design/links.md
§ Between folders). The plan is previewed and applied like the rest (`plans.ts`).

## Acceptance criteria

- A test: two roots, one named, the other linking into it by pointer; `deinit` on the named one plans and applies the
  pointer's rewrite; afterwards the link resolves. It fails without the fix.
- The TUI's `shift+v` on a named folder's row previews the same plan.
- design/roots.md § `.slipbox/` and design/links.md § Pointers say it.

## References

- Delivers: design/roots.md § `.slipbox/`; design/links.md § Pointers.
- Rests on: D74, D75, D149.

## Log

- 2026-10-11: Fixed (`src/core/rename.ts`, `pointersByItsName`, called from `planUnmakeVault`): the pointers naming
  the folder (by its name, an alias or a name it had; landing in this copy) are found in its own notes, the
  parent's (in memory), and every other root's this machine knows, from their saved indexes (`Reach.notesElsewhere`
  in `src/core/workspace/links/reach.ts`, sharing `inbound`'s list of roots: not worktrees, only those there). Each
  becomes, per
  design/links.md § Between folders, a relative path where its root (the parent's, for the folder's own files)
  travels with the parent; else the parent's pointer (`slipbox://<parent>/<folder>/<path>`) when the parent is named;
  else a relative path. Fragment, `<…>`, a folder's `/` and percent-encoding kept. A pointer at a branch becomes the
  parent's pointer at that branch, or with an unnamed parent is left and said in the plan's warnings.
- 2026-10-11: Not used: the backlinks themselves (`v.backlinks(rel)`): another root's pointer to a folder of it
  (`slipbox://name/` or a subfolder) isn't a backlink across roots, so it would have been missed.
- 2026-10-11: The TUI's `shift+v` (explorer) and `space v shift+m` call `planUnmakeVault`, so they preview the same
  plan with no change of their own.
- 2026-10-11: Tests: `deinit rewrites the pointers by its name, …` in tests/vault.test.ts (18.11): a named parent, its
  named nested folder, an unnamed parent with a named nested folder, a third root linking into both by pointer (one
  with `#fragment`, one `<…>` with a space); the dry run's edits, the files after, and every link resolving after.
  `V on a named folder previews the pointers by its name rewritten, …` in tests/tui.test.ts (18.x explorer): the
  preview lists the other root's pointer, and enter writes it. Mutation-checked: without the call both fail; with the
  form choice forced either way (always the parent's pointer, never it) the vault test fails.
- 2026-10-11: Tried on the reference set: a pointer to `handbook` (nested in `work/product`) added to
  `notes/index.md` (`slipbox://handbook/how-we-write.md#voice`, `slipbox://handbook/`); `deinit handbook --dry-run`
  in `work/product` listed both as `slipbox://product/handbook/…` (product named by its remote, notes apart), applied,
  and `links index.md` in notes resolved both. Found: another root's pointers are read from its saved index, written
  only once all its notes are parsed (`backlinks`, `ls`, the TUI's idle parse): after `links` or `index` alone the
  notes root had none, as § Backlinks says of every backlink across roots.
- 2026-10-11: design/links.md § Pointers (a paragraph of its own) and design/roots.md § `.slipbox/` say it.
  docs/cli.md (the `deinit` paragraph under § Renames) doesn't mention pointers either way: left, as the task names no
  user docs.
- 2026-10-11: accepted by the user; done.
