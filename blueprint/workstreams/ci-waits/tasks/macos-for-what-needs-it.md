---
status: todo
assignee:
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
