---
status: todo
assignee:
blocked_by: [ORG-T25]
created: "2026-10-26"
---

# ORG-T26: Code layout responsibility splits

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Separate code cell framing, page composition, wrapping and documentation layout through explicit inputs/builders.
Preserve source maps and width/sanitize invariants.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.
