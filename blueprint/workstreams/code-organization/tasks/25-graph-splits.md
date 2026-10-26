---
status: todo
assignee:
blocked_by: [ORG-T10]
created: "2026-10-26"
---

# ORG-T25: Graph responsibility splits

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Separate graph cache/build, move reconciliation, overlays and query helpers with one authoritative state owner. Keep
graph contracts light and avoid copying mutable maps.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.
