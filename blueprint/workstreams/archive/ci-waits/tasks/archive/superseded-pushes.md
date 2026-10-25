---
status: done
assignee: claude
blocked_by: []
tracker: [gh:#65]
created: "2026-10-24"
---

# CIW-T3: A push's run gives way to the next push to its branch

`ci`'s concurrency: a pull request's number, else the branch for a push, else the run's own; cancelling for a pull
request and a push.

## Acceptance criteria

- A test holds the group and `cancel-in-progress` to what each event gets: a pull request and a push cancelled by the
  next of theirs, a run by hand and a merge group's in groups of their own, never cancelled.

## References

- Delivers: design.md § What a push tests (superseded pushes).
- Rests on: (CIW-D4).

## Log

- 2026-10-24: `ci.yml`'s concurrency. Test: the group and `cancel-in-progress` evaluated as GitHub's expressions for a
  pull request, a push, a run by hand on `test` and a merge group. Mutation: the group as `github.ref` alone (a run by
  hand on `test` sharing a push's group), caught.
- 2026-10-24, the code's review: a push's run re-run is in a group of its own (`github.run_attempt == '1'` for the
  branch's group), so an older commit's re-run can't cancel the newest. Test: a push's attempt 2 in `ci-<run id>`;
  mutation (the attempt left out) caught. The health check passes over a cancelled run for the one before it
  (`scripts/health.ts`'s `failingOnMain`); test and mutation, caught.
