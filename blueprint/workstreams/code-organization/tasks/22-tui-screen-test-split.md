---
status: todo
assignee:
blocked_by: [ORG-T21]
created: "2026-10-26"
---

# ORG-T22: TUI screen and journey test split

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Finish tui.test.ts relocation with navigation/screen/overlay/settings/journey scenarios. Keep full-App journeys. Compare
complete test identity inventory; retain no residual historical review bucket.

### Issue coverage and ownership

Use windows, documents/navigation, shell and app test owners. Retain current tabs-containing-views and session tests;
new windows-containing-tabs acceptance belongs to its separate workstream.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.
