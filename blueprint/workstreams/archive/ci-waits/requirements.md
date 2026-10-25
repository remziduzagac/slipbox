# Requirements

## Goals

- **Nothing a merge brought goes untested on `dev`.** A push's run tests what changed since the last commit whose run
  passed, not since the push before it, so a run cancelled or failed leaves nothing out of the next one: a run on
  `dev` that passed means every commit up to it passed, on Linux and macOS (issue #65, item 5).
- **A merge doesn't test the same tree twice.** The push of a squash whose tree a pull request's run already passed,
  on the same base, tests only what landed before it untested; usually nothing (item 5).
- **Moving `dev` to `test` doesn't test again what `dev` passed.** A push to `test` of a commit `dev` passed runs no
  test and no terminal check; what `preview.yml` builds and publishes is unchanged (item 7).
- **From a safe start.** Until a run under this scope has passed, a push tests everything since `test`'s head, so
  nothing the runs before it skipped (2026-10-24's cancelled runs) is taken as tested (item 5).
- The full run, by hand, still runs everything (D251).

## Non-goals

- The issue's other items, tasks for later in this workstream: the Linux jobs sharded across runners (item 1),
  `CHECKS_FOR` mapping more of the app's files (item 2), macOS kept for what needs it (item 3: the maintainer chose
  option b on the issue, 2026-10-24, to be recorded as a decision when it's worked), macOS after Linux passes (item 4),
  the slowest tests reported and budgeted (item 6). Splitting `tests/tui.test.ts` is #55's.
- What a pull request's run tests: its scope, its jobs and its runners stay as they are (D239).
- What `test` takes, `preview.yml`, the full run, `main`'s ruleset and the release (D251, D257).
- Any setting of the repository's: the rulesets, a merge queue (D242).

## Builds on

- design/repository.md § How a change lands: squash only, `dev` → `test` → `main` by fast-forward, `test`'s ruleset
  taking only a commit whose `ci` passed (D251).
- design/repository.md § CI, "What a change reaches": the rules that turn a list of changed files into tests and
  checks (D239, D230), which a push's new range is fed to unchanged.
- design/repository.md § CI, the `ci` aggregator: a skipped job counts as passed.
- design/distribution.md § Previews: `preview.yml` builds without testing again (D251).

## Acceptance criteria

- A push's run reads the runs that passed and tests the range from the nearest commit, on its branch's line, whose push
  run passed under the same `SCOPE_VERSION`; with none, from `test`'s head before the push when it's of that version,
  else everything; its log says which, and why. Whatever can't be read tests more, never less.
- A run cancelled or failed between two pushes leaves its changes in the next push's range; a unit test drives a
  history of passes, failures and cancellations through it, and a pass of another version, and `test` moved to one.
- A pull request's run records the tree it tested and its base; a push whose commit has that tree on that base tests
  only the range before its parent, nothing when its parent passed. A record whose run is still going, failed, isn't a
  pull request's run of `ci.yml`, or whose head doesn't make the push's tree on its parent, changes nothing; one good
  record among several of the same name is found. Unit tests for each.
- A push to `test` of a commit whose `dev` run passed runs no test or terminal job, and `ci` passes; a push of one
  whose `dev` run hadn't ended tests the range since the nearest that passed.
- Every job's permissions the least it needs, said in its comment: `changes` alone gains `actions: read`, its token
  passed only on a push; zizmor and actionlint pass (`bun run check:actions`). Tests hold the workflow to it, and to
  `test` and `terminal` reading the range from `changes`, not the event's `before`.
- `blueprint/design/testing.md`, design/repository.md § CI and `MAINTAINING.md` say what runs where.
- A live try: `bun run ci:scope` as a push to `dev` against the repository's own runs, saying where its range starts.

## Changes

### MODIFIED requirements.md § The repository

The fifth bullet becomes:

- CI is hardened and runs on Linux and macOS: no permission by default, each job's grants explained, actions pinned by
  their commit, no credentials kept, timeouts, a pull request's superseded run cancelled, nothing cached (GR-D9). A
  push to `dev` or `test` tests what changed since the last commit whose run passed, less what a pull request's run
  passed on the same tree, so a run on `dev` that passed means every commit up to it did, and `test` tests nothing
  `dev` passed (CIW-D1, CIW-D2, CIW-D3).

Previously: "CI is hardened and runs on Linux and macOS: no permission by default, each job's grants explained,
actions pinned by their commit, no credentials kept, timeouts, a pull request's superseded run cancelled, nothing
cached (GR-D9)."
