---
status: todo
assignee:
blocked_by: [ORG-T28]
created: "2026-10-26"
---

# ORG-T29: PDF responsibility splits

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Separate PDF font adaptation, line layout, block writing and pagination under the existing lazy writer entry. Preserve
output and error/cleanup contracts.

### Issue coverage and ownership

Record why the current lazy export strategy is retained; verify font/layout adapters and failure/cleanup behavior.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.
