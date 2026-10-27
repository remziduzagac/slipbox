---
status: todo
assignee:
blocked_by: [ORG-T4]
created: "2026-10-26"
---

# ORG-T13: Mutation paths

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Move files, rename, plans, capture and replace-files into mutations. Extract shared marker operations below
orchestration, preserving refusal/undo behavior.

### Issue coverage and ownership

Destination: core/workspace/mutations. Add a forbidden reverse-edge fixture for shared marker operations.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.
