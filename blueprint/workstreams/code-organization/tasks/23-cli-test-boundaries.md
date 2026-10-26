---
status: todo
assignee:
blocked_by: [ORG-T9]
created: "2026-10-26"
---

# ORG-T23: CLI test boundaries

## Approval gate

Draft only; blocked on approval of [the design](../design.md). One behavior-preserving PR into `dev` after the listed
predecessors. Apply the common [review and verification gates](README.md).

## Scope

Organize CLI suites by area, test handlers directly where appropriate, and retain a small launcher suite covering
dispatch, arguments, exit/error behavior and dynamic TUI boundary.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.

The PR records actual commands, results and affected paths. No passing result is assumed in this draft.
