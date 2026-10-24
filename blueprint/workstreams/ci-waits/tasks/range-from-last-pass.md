---
status: doing
assignee: claude
blocked_by: []
tracker: [gh:#65]
created: "2026-10-24"
---

# CIW-T1: A push's range from the last run that passed

A push to `dev` or `test` tests what changed since the nearest commit whose run passed under this scope's version, and
the `test` and `terminal` jobs read that range from `changes`.

## Description

In `scripts/ci-scope.ts`: `SCOPE_VERSION` (2); reading the push runs that passed from GitHub's API (an injected
fetch, so tests drive it); the version a commit declares (`git show <sha>:scripts/ci-scope.ts`); the start, walking
back from the commit pushed; the fallback to `test`'s head of the same version, else everything; an empty range or one
between two trees the same tests nothing. `bun run ci:scope` writes `range` beside `code` and `checks`, and
says where the range starts and why; `changedFiles` reads `SCOPE_RANGE` for a push. In `ci.yml`: `changes`
gains `actions: read`, its token on the scope step only on a push; `test` and `terminal` take the range from its
outputs instead of `github.event.before`.

## Acceptance criteria

- Unit tests over a history made for them, the API faked: a pass found back from the commit; runs cancelled or failed
  between two pushes leave their commits in the range; a pass of another version doesn't count; with none, `test`'s
  head when it's of the version, else everything; `test` moved to a pass of the old scope; the API failing; a hash
  that isn't one; a push to `test` of a commit `dev` passed tests nothing.
- The workflow held to it: `changes`' permissions and token, `test` and `terminal` reading its outputs.
- A live try: `bun run ci:scope` as a push to `dev` against the repository's own runs.

## References

- Delivers: design.md § What a push tests (the last run that passed, with none, nothing to test); requirements.md
  § Goals.
- Rests on: (CIW-D1), (CIW-D3); research.md § Runs.
