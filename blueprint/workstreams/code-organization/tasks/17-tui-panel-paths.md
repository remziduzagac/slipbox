---
status: todo
assignee:
blocked_by: [ORG-T16]
created: "2026-10-26"
---

# ORG-T17: TUI explorer, panels and overlays paths

## Approval gate

Draft only; blocked on approval of [the design](../design.md). One behavior-preserving PR into `dev` after the listed
predecessors. Apply the common [review and verification gates](README.md).

## Scope

Move explorer, panels, overlays and screen regions, preserving focus and drawing order. No helper deduplication in this
move.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.

The PR records actual commands, results and affected paths. No passing result is assumed in this draft.
