---
status: done
assignee: claude
priority: low
blocked_by: []
tracker: [gh:#65]
created: "2026-10-24"
---

# CIW-T5: The Linux jobs split across runners

Issue #65's item 1, for later: not part of the change that delivers CIW-T1 to CIW-T4.

## Description

`test` and `terminal` on `ubuntu-24.04` and `ubuntu-24.04-arm` sharded in two or three (by test file, by check area), so
a scoped run there takes about five minutes; macOS stays one job each.

## References

- Rests on: issue #65, item 1; design/repository.md § CI.
- Delivers: D275; design/repository.md § CI, design/testing.md § Strategy, `MAINTAINING.md` § Merging a change.

## Log

- 2026-11-10: measured before choosing, from the job logs of 2026-11-10 (a pull request's run, 42726853524, and a
  push's, 42762627359): a file's time from the end of the file before it to the end of its own. The unit tests ran
  one file after another, 572 to 661 seconds; the 16 slowest files (eight seconds or more) were over a third of it.
  Simulated over both runs: by count alone, three parts came within 100 seconds of each other; with those files'
  seconds, within about 20. The terminal checks: five areas, links and files 38% of the time (and the slow disk's
  checks run alone, 106 seconds after the rest); by area the longest part would be about 400 seconds against 290 for
  an even third; by check file, 76 of them, about 320.
- 2026-11-10: chosen, three parts each (D275). The terminal checks split by check file, not by area, as above; a check
  file keeps a feature's checks and the release builds the checks of upgrading share on one runner. `ci` needed no
  change: a job in parts is one result to it, a success only when every part passed.
- 2026-11-10: `scripts/ci-shard.ts` holds the rule; `scripts/ci-scope.ts` reads `SCOPE_SHARD` and runs its part of the
  tests, of the change's or of every one, and hands the runner `--shard i/n`; the runner takes its part of the checks
  its filters chose. Tests in `tests/ci-shard.test.ts`: every item in exactly one part, for any count and any number
  of items, none among them; the same items the same parts in any order; the parts balanced; every test file `bun
  test` would find under `tests/`; the whole suite's tests and checks, and a change's scope (a script, a file of the
  app's, one test file, nothing a test reads), each in exactly one part, an empty part running none; each check file
  whole in one part; the runner's lists of its parts, which are its list; a part misspelt refused; the workflow's
  matrices and `ci`'s own script on a part failed or cancelled. `tests/ci-range.test.ts` holds each macOS job to its
  Linux job's steps but the part. Mutation-checked, fifteen mutations, each killed: a part chosen wrongly, an item put
  twice, the checks' order lost, a check of no file let through, every part the first's, a folder of tests skipped,
  `4/3` taken, a check run alone weighed as one, an empty part run as `bun run test` (everything), a run of everything
  split as none, the runner's `--shard` dropped by `ci:scope` or by the runner, a job's `SCOPE_SHARD` or `shard` list
  dropped, and `ci` passing a cancelled job.
