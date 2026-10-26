---
status: todo
assignee:
blocked_by: [ORG-T24]
created: "2026-10-26"
---

# ORG-T10: App services and shared pane helpers

## Approval gate

Draft only; blocked on approval of [the design](../design.md). One behavior-preserving PR into `dev` after the listed
predecessors. Apply the common [review and verification gates](README.md).

## Scope

Extract App clipboard serialization and notification timing without moving state ownership or duplicating writeBuffer.
Share only proven footnote/info/outline navigation; keep focus/close/pinning differences explicit.

## Evidence required

Same owner tests and terminal checks pre/post; source-map/layout snapshots; disposal, cancellation, late reply,
saturation and cleanup tests for lifecycle changes. No universal queue.

The PR records actual commands, results and affected paths. No passing result is assumed in this draft.
