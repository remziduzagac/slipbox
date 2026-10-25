---
status: done
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

## Log

- 2026-10-24: `MAINTAINING.md` § Merging a change (what a push to `dev` tests, and runs giving way), § From dev to a
  release (`test` tests nothing `dev` passed; move it once `dev`'s run has ended), § Previews (a run that gave way
  leaves its commit without a `ci` check). The comments heading `ci.yml`, `scripts/ci-scope.ts` and
  `scripts/ci-range.ts`. No CHANGELOG line: nothing users see changes.
