---
status: todo
assignee:
blocked_by: [ORG-T15]
created: "2026-10-26"
---

# ORG-T6: Rendering and export paths

## Approval gate

Draft only; blocked on approval of [the design](../design.md). One behavior-preserving PR into `dev` after the listed
predecessors. Apply the common [review and verification gates](README.md).

## Scope

Group existing layout and export by subarea and relocate export-worker with its URL/build references. Media and
distribution move separately. Preserve dynamic writer dispatch.

## Evidence required

Export formats/streams, image/diagram/paint, layout snapshots and distribution worker-asset tests; relevant
export/render terminal checks. Compare output bytes or existing snapshots.

The PR records actual commands, results and affected paths. No passing result is assumed in this draft.
