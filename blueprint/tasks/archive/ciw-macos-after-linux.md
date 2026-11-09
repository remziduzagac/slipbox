---
status: done
assignee: claude
priority: low
blocked_by: []
tracker: [gh:#65]
created: "2026-10-24"
---

# CIW-T8: macOS starts after Linux passes

Issue #65's item 4, for later: not part of the change that delivers CIW-T1 to CIW-T4.

## Description

A pull request's macOS jobs wait for the Linux job of the same kind (`needs`), and don't run if it fails.

## References

- Rests on: issue #65, item 4; design/repository.md § CI.
- Delivers: D272; design/repository.md § CI.

## Log

- 2026-11-09: done with CIW-T7, in one pull request (D272). The matrices split: `test` on `ubuntu-24.04`, `terminal`
  on `ubuntu-24.04` and `ubuntu-24.04-arm`; `test-macos` and `terminal-macos` on `macos-15`, `needs` their Linux job,
  with no status function in their `if:`, so GitHub's own `success()` skips them when it failed, was cancelled or was
  skipped. They're named `test (macos-15)` and `terminal (macos-15)`, as the matrix named them, so no check's name
  changes; `ci` waits for both and counts a skipped job as passed, as before.
- 2026-11-09: `needs` is the same for every event, so a push's and the full run's macOS jobs wait for Linux too: taken
  as D272's cost rather than a copy of each macOS job per event.
- 2026-11-09: tests in tests/ci-range.test.ts: each macOS job needs its Linux job, has its steps, permissions and
  timeout, keeps its check's name, and no other job runs on macOS; its `if:` is its Linux job's and `macos`, for every
  event and output; `ci`'s own script, run with `NEEDS` made up, passes a macOS job skipped and fails one failed or
  cancelled, or its Linux job failed. Mutation-checked: `test-macos` without its Linux job in `needs` fails (*ran*).
