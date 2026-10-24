---
status: done
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

## Log

- 2026-10-24: `scripts/ci-range.ts` (`pushRange`, `versionAt`, `githubApi`), `SCOPE_VERSION` and `SCOPE_RANGE` in
  `scripts/ci-scope.ts`, `changes`' `range` output in `ci.yml`. A push's empty range runs nothing (`code` and `checks`
  false), where an empty diff of a pull request still runs everything (D230).
- Tests, `tests/ci-range.test.ts`: the nearest pass, a failed run listed anyway, a pass off the line; a pass of another
  version, the version raised, hashes that aren't; `test`'s head of the version, of another, all zeros, unknown, ahead;
  the runs unreadable, no token, a commit with no version; `changedFiles` given a range, an empty one, `all` and
  garbage; `ci:scope` spawned as `changes` for a push against a fake API server (`GITHUB_API_URL`): the docs since a
  pass, nothing for a commit that passed (a push to `test`), everything with none; the workflow's permissions, token
  and `SCOPE_RANGE`. `tests/distribution.test.ts`' scope test: a push with nothing to read its range from runs
  everything. 15 and 5 pass.
- Mutations, each undone once and caught by its test: the version check on a pass and on `test`'s head, the success
  filter, the empty range running nothing, `SCOPE_RANGE` read back as `before`, the token for a pull request.
- Live, in the right pane, against the repository's own runs (read-only, the maintainer's token): as a push to `dev`,
  "none of the 20 commits whose runs passed is behind it with this scope", then everything: `test`'s head
  (`71313f3`) is of the scope before — the first run under it, as designed. As a push to `test`, the same.
- 2026-10-24, the code's review: an element of the runs' list that isn't one is passed over; the log says "which runs
  passed is unknown" when they can't be read, not that none passed; `test`'s head read with `commit()`. Tests for
  each; mutations caught.
