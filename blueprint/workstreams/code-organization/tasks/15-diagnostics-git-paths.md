---
status: todo
assignee:
blocked_by: [ORG-T14]
created: "2026-10-26"
---

# ORG-T15: Diagnostics and git paths

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Move diagnostics, servers, git and distribution families without extraction. Keep worker-local imports and optional tool
integration intact.

### Issue coverage and ownership

Destinations: core/documents/diagnostics and servers, core/workspace/git and core/application/distribution. Media moves
in T6. Preserve generated server locks and verify their generator rather than splitting data by hand.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.
