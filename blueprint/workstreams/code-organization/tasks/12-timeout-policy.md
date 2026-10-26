---
status: todo
assignee:
blocked_by: [ORG-T11]
created: "2026-10-26"
---

# ORG-T12: Test timeout policy

## Approval gate

Draft only; blocked on approval of [the design](../design.md). One behavior-preserving PR into `dev` after the listed
predecessors. Apply the common [review and verification gates](README.md).

## Scope

Separate PR: centralize unchanged 30-second default and existing named slow budgets. Keep per-file initialization. Split
compound export scenarios with assertions retained; coordinate CIW-T9. Change no product deadline, terminal wait or CI
ceiling.

## Evidence required

Test runner/default alignment, representative ordinary and slow tests, compound export assertions, and existing
SIGTERM-resistant process case. No overflow fix or limit increase without separate evidence and approval.

The PR records actual commands, results and affected paths. No passing result is assumed in this draft.
