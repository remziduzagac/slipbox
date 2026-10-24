---
status: done
assignee: claude
blocked_by: [CIW-T1]
tracker: [gh:#65]
created: "2026-10-24"
---

# CIW-T2: A pull request's record of what it passed

A pull request's run records the tree it tests and its base; a push takes the record of its parent and its tree, when
its run passed and its head makes that tree, and tests only what came before its parent.

## Description

`changes`, for a pull request, outputs the record's name, `ci-tested-v<version>-<base>-<tree>`, and writes what the
scope said to a file in `$RUNNER_TEMP`; an `actions/upload-artifact` step (pinned as `build.yml` pins it, seven days,
`continue-on-error`, `overwrite`) uploads it. For a push whose range doesn't start at its commit, `ci-scope.ts` lists
the artifacts of that name (every page), and takes the first whose run is a pull request's run of `ci.yml`, completed
with `success`, and whose head, fetched and merged onto the parent (`git merge-tree --write-tree`), makes the push's
tree; the range then ends at the parent.

## Acceptance criteria

- Unit tests: a record taken, the range ending at the parent, empty when the parent passed; a record whose run is
  going, failed, isn't a pull request's or isn't `ci.yml`'s; one whose head makes another tree; a good one after a bad
  one of the same name; the artifacts unreadable.
- The workflow held to it: the upload only for a pull request, from `$RUNNER_TEMP`, never failing the run.

## References

- Delivers: design.md § What a push tests (what a pull request's run passed).
- Rests on: (CIW-D2); research.md § Artifacts.

## Log

- 2026-10-24: `recordRun` and `recordName` in `scripts/ci-range.ts`; `changes` writes `record` and
  `$RUNNER_TEMP/ci-tested.txt` for a pull request, and `ci.yml` uploads it (pinned as `build.yml`, seven days,
  `continue-on-error`, `overwrite`).
- Tests, `tests/ci-range.test.ts`: a record taken, the range empty when the parent passed, ending at the parent when
  an older commit did, not asked for when the commit itself passed; a record whose run is going (once re-run with the
  attempt before's `success` still shown), failed, cancelled, a push's, another workflow's, expired, or unreadable;
  a stranger branch's record for the squash's tree passed over, a good one after it taken, past the first page; the
  pull request's head fetched by its hash into a checkout of `dev` alone; `ci:scope` for a pull request writing the
  record's name and the scope's text.
- A fake API's paging bug (`page=` matched in `per_page=`) failed three record tests before the code was at fault:
  fixed in the fake.
- Mutations, each undone once and caught: the `completed` check (caught once the re-run case was added), the success
  check, the event check, the merge-tree comparison, the paging, the fetch, the record looked up for a commit that
  passed.
- Live, in the right pane: `ci:scope` as a pull request on this branch wrote
  `record=ci-tested-v2-42e879d…-917a019…` and the scope's text.
