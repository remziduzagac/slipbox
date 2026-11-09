---
status: done
assignee: claude
priority: low
blocked_by: []
tracker: [gh:#65]
created: "2026-10-24"
---

# CIW-T7: macOS kept for what needs it

Issue #65's item 3, for later: not part of the change that delivers CIW-T1 to CIW-T4.

## Description

The maintainer chose option b on the issue (2026-10-24), to be recorded as a decision when it's worked: a pull request
runs macOS only when it touches what differs on macOS (the terminal's input and output, spawning processes, the file
system's paths, times and watchers, fonts and pictures, the installer, the workflows), or carries a `macos` label; every
change runs on macOS after the merge, and in the full run. A pull request's record (CIW-D2) must then say which systems
its run tested, a push test the others, and `SCOPE_VERSION` go up.

## References

- Rests on: issue #65, item 3; design/repository.md § CI.
- Delivers: D272; design/repository.md § CI (What differs on macOS), design/testing.md § Strategy.

## Log

- 2026-11-09: recorded as D272, with CIW-T8 in one pull request. `MACOS` in `scripts/ci-scope.ts`, beside
  `CHECKS_FOR`: path patterns in groups, each saying why it differs on macOS, the tests beside each group's files with
  them; the issue's list, with Apple's SQLite (the search index's FTS5 tables and queries, `14.13`) and the packages
  and the toolchain (Bun and OpenTUI's native library are each system's own build) added. `macosFor` gives the reason
  (the first file of the list, the label, or a diff or labels that can't be read), `eventLabels` reads the labels from
  `GITHUB_EVENT_PATH` as strings; `bun run ci:scope` writes `macos=true|false` and logs why.
- 2026-11-09: the record and the version, as this task's description asks, needed nothing: since D266 (scope 3) a pull
  request writes no record and none is trusted, so every push already tests macOS on all it brought. `SCOPE_VERSION`
  stays 3.
- 2026-11-09: `ci.yml`: `test-macos` and `terminal-macos` run only when `changes` says `macos`; `pull_request` takes
  `labeled`, so the label added runs the checks again. Tests in tests/ci-range.test.ts: each pattern names a file there
  is; the files of each group run macOS, files that only use them and the docs don't; the label exactly, any other or
  none not; labels unread or a diff unread run it; `ci:scope`'s output for a pull request, labelled or not, and for
  every other event. Mutation-checked: the label compared to another name, and `labeled` dropped, fail them (*ran*).
