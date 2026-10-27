---
status: todo
assignee:
blocked_by: [ORG-T20]
created: "2026-10-26"
---

# ORG-T21: TUI feature test split

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Move explorer/panels/git/search/diagnostics/media scenarios from tui.test.ts and relocate existing focused suites by
owner. Preserve all assertions and fixture lifetimes.

### Issue coverage and ownership

Use workspace/document/shell test owners from the design. Share setup only when lifetime and policy agree; preserve
shared integration coverage. Record clone dispositions for ORG-T40.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.
