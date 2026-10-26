---
status: todo
assignee:
blocked_by: [ORG-T20]
created: "2026-10-26"
---

# ORG-T21: TUI feature test split

## Approval gate

Draft only; blocked on approval of [the design](../design.md). One behavior-preserving PR into `dev` after the listed
predecessors. Apply the common [review and verification gates](README.md).

## Scope

Move explorer/panels/git/search/diagnostics/media scenarios from tui.test.ts and relocate existing focused suites by
owner. Preserve all assertions and fixture lifetimes.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.

The PR records actual commands, results and affected paths. No passing result is assumed in this draft.
