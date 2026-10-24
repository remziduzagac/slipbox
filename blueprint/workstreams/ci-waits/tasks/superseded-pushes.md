---
status: todo
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
