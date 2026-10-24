---
status: todo
assignee: claude
blocked_by: [CIW-T1, CIW-T2, CIW-T3]
tracker: [gh:#65]
created: "2026-10-24"
---

# CIW-T4: What runs where, said where the maintainer reads it

`MAINTAINING.md` says what a merge's push and a move to `test` test now; the comments heading `ci.yml` and
`scripts/ci-scope.ts` say the same. The blueprint's own files change at consolidation (design.md).

## Acceptance criteria

- `MAINTAINING.md` § Merging a change and § From dev to a release say what a push to `dev` and to `test` run, and to
  move `test` once `dev`'s run has ended; `bun run check:docs` passes.

## References

- Delivers: design.md § The maintainer's procedures; requirements.md § Acceptance criteria.
