---
status: done
assignee: claude
priority: low
blocked_by: []
tracker: [gh:#65]
created: "2026-10-24"
---

# CIW-T9: The slowest tests found and kept in check

Issue #65's item 6, for later: not part of the change that delivers CIW-T1 to CIW-T4.

## Description

Each test's time in CI reported (the JUnit reporter has it), the slowest listed, and a budget for a test file's time, so
one slow test is seen when it lands.

## References

- Rests on: issue #65, item 6; design/repository.md § CI.
- Delivers: D276; design/testing.md § Timeout policy, design/repository.md § CI, `MAINTAINING.md` § Merging a change.

## ORG-T23 coordination

ORG-T23 splits independent CLI export outcomes while preserving assertions and intentional overwrite sequences. Its
task record carries focused before/after timings and the unchanged 30-second aggregate default versus each child
process's 20-second deadline. JUnit reporting and file-level budgets remain this task's separate work.

## Log

- 2026-11-10: Bun 1.4.2's `bun test --reporter=junit --reporter-outfile=<file>` writes a `<testsuite>` for each test
  file, its time from loading the file to its last hook (a top-level wait and a `beforeAll` counted), a nested one for
  each `describe`, and a `<testcase>` for each test with its time. It doesn't make the file's folder, and a file that
  fails to load isn't in it (the run fails anyway). The console's output stays as it was.
- 2026-11-10: measured before choosing, from the job logs of 2026-11-09 and 2026-11-10 (62 runs; 63 Linux test jobs or
  parts and 41 macOS jobs that passed), each file's time from the end of the file before it to the end of its own,
  which matched the sum of its tests' to a tenth of a second. Linux: 545 files; at their longest, five over 20 seconds
  (walk-thread 32.8, release 31.4, skill 31.4, worker-requests 29.2, samples 28.5), then 19.9 (the terminal harness),
  19.2, 17.2, 16.1, 15.5, and 527 under eight. Most files' longest was at most two fifths over their median (walk-thread
  from 25.4 to 32.8); the agents' capture's moved most, from 2.1 to 9.2. macOS: runs of every test took 0.86 to 2.38
  times Linux's; a file's time moved far more (the samples' 14.7 to 121.4, the header's 5.6 to 36.0, the branches'
  panel's 8.5 to 33.0), up to 4.9 times its longest on Linux.
- 2026-11-10: chosen (D276). `BUDGET`, 30 seconds on Linux, one and a half times the longest of every file but five;
  those five a budget of their own (`BUDGETS`, 45 or 50 seconds, each with why), one and a half times their longest on
  each system; `MACOS_FACTOR` 4, which keeps the samples' 121.4 seconds on macOS within 200 by that margin. `SLOW_TESTS`
  rewritten from runs' reports by `bun scripts/test-times.ts slow <run>…`, by hand, so a tree's parts don't change from
  one run to the next.
- 2026-11-10: `scripts/test-times.ts` reads the report, says the slowest, judges the budgets and rewrites `SLOW_TESTS`;
  `ci:scope` hands `bun test` the reporter when `SCOPE_REPORT` is set, or writes an empty report for a part with
  nothing to run. Each `test` job: `SCOPE_REPORT` in the runner's temporary folder, a `test times` step once the tests
  ran, and the report uploaded (`test-times-<system>-<part>`). Tests in `tests/test-times.test.ts`: the report read
  (nested describes, a skip, a failure, the escapes, a describe closed where it opens; the empty one; not one); a file
  over BUDGET failing with its name, time and budget, one at it passing; one near it said; an exception passing past
  BUDGET and failing past its own, near its own said; macOS's factor; a report missing, not one, or none named; the
  summary's slowest, its cells; the command's exit, step summary and annotation; `ci:scope`'s report for each part, the
  empty part's, none without `SCOPE_REPORT`; both jobs' steps; `SLOW_TESTS` from the times and rewritten in
  `scripts/ci-shard.ts`, the file as it is written back the same; each file's longest over several runs' reports.
  Mutation-checked, twenty mutations, each killed.
- 2026-11-10: the pull request's first run, 42777169917, ran every test (it changes the workflow): each part's
  summary in its log and step summary, its report uploaded, no file over its budget. A note there said the samples'
  own budget could go, as they took 15.8 s on Linux; but that budget is for macOS's 121 seconds. One run sees one
  system, so the note was dropped: whether a file still needs its own is for both systems' reports. `SLOW_TESTS`
  rewritten from that run's Linux reports with `bun scripts/test-times.ts slow 42777169917`: 546 files measured, 12
  of eight seconds or more.
- 2026-11-10: that run's macOS job showed its summary with budgets four times Linux's, its report uploaded, no file
  over (the samples' 100.5 s of 200, the parse threads' 35.5 of 120). One test of this change's own failed there: the
  command's, run on macOS, expected Linux's budget; it now reads the budget of the system it runs on.
