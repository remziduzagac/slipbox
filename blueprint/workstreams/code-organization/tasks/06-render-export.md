---
status: todo
assignee:
blocked_by: [ORG-T15]
created: "2026-10-26"
---

# ORG-T6: Rendering and export paths

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Group layout, media, export and theme by subarea; relocate export-worker with its URL/build references. Distribution
moves separately. Preserve dynamic writer dispatch.

### Issue coverage and ownership

Destinations: core/rendering/layout, media, export and theme. Keep media worker entries beside their feature.

## Evidence required

Export formats/streams, image/diagram/paint, layout snapshots and distribution worker-asset tests; relevant
export/render terminal checks. Compare output bytes or existing snapshots.
