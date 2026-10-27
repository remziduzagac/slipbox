---
status: todo
assignee:
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

## ORG-T23 coordination

ORG-T23 splits independent CLI export outcomes while preserving assertions and intentional overwrite sequences. Its
task record carries focused before/after timings and the unchanged 30-second aggregate default versus each child
process's 20-second deadline. JUnit reporting and file-level budgets remain this task's separate work.
