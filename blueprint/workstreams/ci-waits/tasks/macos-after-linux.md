---
status: todo
assignee:
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
