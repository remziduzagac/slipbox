---
status: todo
assignee:
blocked_by: [ORG-T24]
created: "2026-10-26"
---

# ORG-T10: App services and shared pane helpers

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Extract App clipboard serialization and notification timing without moving state ownership or duplicating writeBuffer.
Share only proven footnote/info/outline navigation; keep focus/close/pinning differences explicit.

### Issue coverage and ownership

Complete the pane-navigation and close/leave clone assessments in the coverage ledger; check focus and pinning before
sharing. Record retained differences explicitly. Assess App/watch/update/vault coordination by responsibility as
assigned in the size ledger; split further into coherent PRs before attempting unrelated controller extractions.

## Evidence required

Same owner tests and terminal checks pre/post; source-map/layout snapshots; disposal, cancellation, late reply,
saturation and cleanup tests for lifecycle changes. No universal queue.
