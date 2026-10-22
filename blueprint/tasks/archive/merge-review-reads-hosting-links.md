---
status: done
assignee: claude-links
created: "2026-10-11"
---

# T6: The merge review reads links to the repository's own hosting

Before a merge, a link to this repository's hosting (`https://github.com/me/repo/blob/main/x.md`) that the merge would
break is reported, as a path's or a wikilink's is.

## Description

`core/mergereview.ts` reads markdown links' paths and wikilinks. A link to the repository's own hosting is the file in
this copy (D87), so a merge that moves or deletes the file breaks it the same way. Read it through `core/hosting.ts`,
report it with its cause, and the fix in its own form (the URL with the new path). Pointers naming this repository
itself, if any, likewise.

## Acceptance criteria

- A test in the merge review's suite: a branch moves `docs/plan.md`, main adds a hosting link to it; the review
  reports it, with the fixed URL. It fails without the change.
- design/links.md § The merge review says which forms it reads.

## References

- Delivers: design/links.md § The merge review.
- Rests on: D66, D87.

## Log

- 2026-10-11: The merge review's `named` returned null for every URL and pointer. It now reads a link to this
  repository's hosting: a URL naming one of this checkout's remotes (`checkoutRemotes`), its path from the
  repository's top, a branch with `/` told by the repository's branches when the path as first split isn't in `into`
  (`splitRef`, shared with the graph). The fix is the URL with its new path after the ref, its `#fragment` kept
  (`withHostedPath`, moved from `rename.ts` into `hosting.ts` so the rename and the review write it alike).
- 2026-10-11: Pointers naming this folder (by its name, an alias, an old name or its qualified remote, compared by the
  folder's key), at no branch, are read as paths from the root; the fix is the pointer by its name as written, an
  extensionless path and encoding kept. A pointer at a branch names that branch, not this merge's result, and another
  repository's URL or a repository's own page names no path this merge moves: not checked.
- 2026-10-11: Test "the merge review reads links to this repository's hosting and pointers naming this folder" in
  `tests/vault.test.ts` (the merge review's suite): a URL at `main`, one at `feature/x`, a pointer, another
  repository's URL and the repository's page; the first three reported with their fixes. Mutation-checked twice: with
  `named` reading no hosting URL or pointer, it finds nothing; with the branch split off, the `feature/x` row's fix is
  wrong. Both fail; restored, it passes.
- 2026-10-11: Tried on the reference set (`work/kestrel`): `merge-review refactor/docs-layout` and
  `cleanup/remove-legacy` report as before (18 links, 1 link). The reference set has no committed hosting link or
  self-pointer a branch breaks, so the new forms were exercised by the test only; adding such a case to
  `examples/home/.build/kestrel.toml` would let the TUI's review (`space g m`) be tried on one.
- 2026-10-11: design/links.md § The merge review says which forms it reads, and § Links to the repository's own
  hosting that the review checks them.
- 2026-10-11: accepted by the user; done.
