---
status: todo
assignee: claude-cli
blocked_by: []
created: "2026-10-13"
---

# TT-T9: The terminal tests in CI

On every pull request, on Linux and macOS (TT-D6).

## Description

- `ci.yml`: the terminal tests on ubuntu (x64, arm64) and macOS (arm64, Intel), in parallel within each job, inside the
  `ci` aggregator; the screen of a failing check in the job's log. The release build runs them too.

## Acceptance criteria

- Green on all four on a pull request; a check broken on purpose fails `ci` with its screen in the log.
