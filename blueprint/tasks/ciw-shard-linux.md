---
status: todo
assignee:
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
