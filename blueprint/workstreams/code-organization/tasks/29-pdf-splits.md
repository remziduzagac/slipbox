---
status: todo
assignee:
blocked_by: [ORG-T28]
created: "2026-10-26"
---

# ORG-T29: PDF responsibility splits

## Approval gate

Draft only; blocked on approval of [the design](../design.md). One behavior-preserving PR into `dev` after the listed
predecessors. Apply the common [review and verification gates](README.md).

## Scope

Separate PDF font adaptation, line layout, block writing and pagination under the existing lazy writer entry. Preserve
output and error/cleanup contracts.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.

The PR records actual commands, results and affected paths. No passing result is assumed in this draft.
