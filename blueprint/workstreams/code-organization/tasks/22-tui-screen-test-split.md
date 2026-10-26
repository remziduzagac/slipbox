---
status: todo
assignee:
blocked_by: [ORG-T21]
created: "2026-10-26"
---

# ORG-T22: TUI screen and journey test split

## Approval gate

Draft only; blocked on approval of [the design](../design.md). One behavior-preserving PR into `dev` after the listed
predecessors. Apply the common [review and verification gates](README.md).

## Scope

Finish tui.test.ts relocation with navigation/screen/overlay/settings/journey scenarios. Keep full-App journeys. Compare
complete test identity inventory; retain no residual historical review bucket.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.

The PR records actual commands, results and affected paths. No passing result is assumed in this draft.
