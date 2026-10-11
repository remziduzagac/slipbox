---
status: todo
assignee:
created: "2026-10-11"
---

# T8: A moved code or data file's own relative paths are rewritten

Moving a code or data file rewrites the relative paths it holds (in comments, in a data file's links), as a note's own
relative links are.

## Description

A move rewrites the files linking in, and a note's own relative links when its folder changes; a code file's comment
paths (`16.10`) and a data file's links (`16.15`) are left, and break. Use the index's link ranges for those files to
rewrite them in their own form, previewed with the rest of the move's plan.

## Acceptance criteria

- A test: `src/a.ts` with `// see ../docs/x.md` moved to `src/sub/a.ts` gets `../../docs/x.md`; a YAML file's `$ref`
  or path likewise. It fails without the change.
- design/links.md § Renames and moves says it.

## References

- Delivers: design/links.md § Renames and moves.
- Rests on: D63.

## Log
