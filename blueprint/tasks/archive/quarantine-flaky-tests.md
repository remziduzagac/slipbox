---
status: done
assignee: claude-76
blocked_by: []
related: [T23]
tracker: [gh:#76]
created: "2026-10-24"
---

# T31: The tests and checks that fail at random, quarantined until each is fixed

Issue #76: two terminal checks (#73, #74) and two unit tests (#75) fail at random on CI, on branches that don't touch
them, and each failure stops a pull request or a run on `dev` until it's run again. Quarantine them by name, as the
testing design says, until each is fixed; the terminal checks' runner gains the quarantine it lacks.

## Description

- The two unit tests (`tests/walk-thread.test.ts`, #75): `test.skip`, a `// quarantined: #75` comment saying how each
  fails, their bodies as they were.
- The terminal checks: a check carries the field `quarantined` with its issue (`"#73"`); the runner skips it without
  starting it and reports it as skipped with its issue. The two checks (#73 in `tests/terminal/checks/vaults.ts`, #74
  in `tests/terminal/checks/peek-backlinks.ts`) carry it, a comment saying how each fails, their runs as they were.
- `grep -rn "quarantined:" tests/` lists checks and tests alike, and nothing else.
- `blueprint/design/testing.md` says terminal checks are quarantined the same way.

## Acceptance criteria

- `bun test tests/walk-thread.test.ts` counts the two as skipped; `bun run test:terminal <name>` reports each quarantined
  check as skipped with its issue, and starts no slipbox for it.
- A test of the runner's quarantine that fails without it.
- No assertion of the four changed: only the skip and its note.

## Out of scope

- Fixing #73, #74 and #75: each comes back with its fix, which removes its quarantine.

## References

- Delivers: `blueprint/design/testing.md` § Strategy ("Flaky tests are fixed, or quarantined by name; never retried").
- Rests on: D239 (a pull request runs what its change reaches); T23 (the tests that failed at random, fixed at their
  causes); TT-D3, TT-D6 (the terminal checks, by feature, headless, many at once).

## Log

- 2026-10-24: Validated, from CI's logs (`gh run view --job <id> --log`, kept in `tmp/issue/ci/`): #73's check failed
  on PR #71: on `terminal (ubuntu-24.04-arm)`, job 120896065125, 3.3 s in, `:w` refused but the Messages list looked
  up after it never opened (the last commands run `palette.open, note.save, help.report`); on `terminal
  (ubuntu-24.04)`, job 120903950535, 33 s in, slipbox not exiting cleanly; #74's on `terminal (macos-15)` on `dev` at
  0c97f5c, run 40106060865, "timed out waiting for the nested vault's link among the backlinks"; #75's first test on
  `test (macos-15)` on `dev` at c5d6407, run 40089628823; its second on `test (macos-15)`, PR #70 at 4ce5e0c, run
  40104659534. None of them changed on `origin/dev` since (42e879d), none quarantined; `grep -rn quarantined tests/`
  finds nothing, and the runner (`tests/terminal/run.ts`) has no quarantine. Valid.
- 2026-10-24: Codex isn't used, the maintainer's choice: a fresh Claude reviewer challenges the plan and makes the
  second review. One review round and one test pass, the maintainer's call; CI's Linux jobs are enough.
- 2026-10-24: A fresh Claude reviewer challenged the plan (in Codex's place). Taken: the runner's test spawns it with
  checks made up for it, preloaded (`tests/terminal/made-up-checks.ts`), not over the registry's quarantined checks
  (gone once #73 and #74 are fixed, and a shortened name would start a real check); the made-up checks set the field by
  shorthand, so the grep lists only what's quarantined for real; no release builds for a quarantined check; `--list`
  says which are quarantined. Not taken: a unit test of `notRun` alone (a one-line function, the spawn test covers it);
  a test of the grep itself (it would hold its own pattern); repeating the skipped checks in the run's summary (each
  one's line says it, as the issue asks). Fine as is, by reading: the pool and the `alone` loop both go through
  `runOne`; `--repeat` repeats the skip; the coverage test still counts the two checks (their commands and cases are
  others' too); "declared but never ran" is the worker's, which never starts; Biome's `noSkippedTests` isn't on.
- 2026-10-24: Done: the two unit tests `test.skip`, their notes above them; the field `quarantined` on `Check`
  (`tests/terminal/check.ts`), `notRun` saying why the runner won't start one; the runner (`tests/terminal/run.ts`)
  skips it before any worker, makes no release builds for it, and lists it as quarantined; the two checks carry it,
  their runs unchanged; `blueprint/design/testing.md` § Strategy and TT's design (the runner) say so.
- 2026-10-24: Ran, once each (the maintainer's call: one test pass): the runner's two tests pass
  ("the runner (T31)", then in `tests/terminal-harness.test.ts`); undone one at a time, each part fails its test — the skip
  (the checks reach a worker, which can't find them: "its worker died"), the list (no issue said), the release filter
  (two release builds made, 5 s). `tests/walk-thread.test.ts`: 42 pass, 2 skip. `tests/terminal-coverage.test.ts`:
  10 pass. `SLIPBOX_TERMINAL_JOBS=2 bun run test:terminal peek-backlinks`: 23 passed, 1 skipped (#74's).
- 2026-10-24: Tried live, the runner over the two real checks: each `- … (0 ms) (skipped: quarantined by #73)` (and
  `#74`), `0/0 checks passed …, 2 skipped`; `--list` names their issues; `grep -rn "quarantined:" tests/` lists the two
  checks and the two tests, nothing else. No terminal check of this: the change is the runner's, which drives no
  slipbox; the spawn test is its check. The typecheck, the lint, `check:docs` and `check:size` pass.
- 2026-10-24: Review, one round (the maintainer's call): `/code-review`, and a fresh Claude reviewer started before
  the maintainer made `/code-review` the round's only reviewer. Consolidated, each verified:
  - Real, the runner's test naming `run.ts` by its path broke `tests/distribution.test.ts` ("a pull request runs the
    tests …", D239), which this change's CI wouldn't have run (code-review): ran, `scripts/release.ts` now reached by
    the harness's test too, through `run.ts` and `release-builds.ts`. The edge is real (the runner imports the release
    script), so the expectation names the runner's test; and that test moved to a small file of its own,
    `tests/terminal-runner.test.ts`, so a change to a check file no longer reaches the harness's 37 tests (code-review).
    Ran after: both pass.
  - Real, #73's note (both): job 120896065125 failed 3.3 s in, not 33 s, and its keys went astray after `:w`, which was
    refused as it should be — the Messages list looked up after it never opened, the needle typed into the report
    window; only job 120903950535 ran 33 s, slipbox not exiting cleanly. Ran, read again from the job's log (`(3327
    ms)`, the screen). The note and this Log say what was seen, no cause. #74's "on `dev` too" now "on `dev` itself".
  - Real, the runner spawned without `env`, so without the TMPDIR `tests/setup.ts` sets (code-review): passed. The
    `--list` test compares standard output alone (code-review). The field typed as `` `#${number}` ``, so tsc refuses
    one with no issue (code-review). The design says a headless check (`tests/terminal/checks/`): the real-terminal
    checks' runner (`tests/terminal/herdr/`) has no quarantine (code-review).
  - Not taken: the coverage test counting a quarantined check's commands and cases (code-review) — it's still the
    check that covers them, and each of the two's is covered by 22 to 74 others; a check made the only one of a command
    while quarantined is a question for then. `ci-scope.ts` running `tests/distribution.test.ts` only through what it
    imports, not when the graph changes (code-review) — older than this change, a follow-up. The release builds'
    assertion passing if the builds throw (the Claude reviewer) — they build here and on CI, shown failing with the
    filter undone.
- 2026-10-24: Done: every acceptance criterion met (the four quarantined, their assertions unchanged; the runner's
  quarantine tested, failing without it; the design). Moved to `archive/`; the merge is the maintainer's acceptance.
