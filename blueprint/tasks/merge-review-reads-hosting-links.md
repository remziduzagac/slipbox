---
status: todo
assignee:
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
