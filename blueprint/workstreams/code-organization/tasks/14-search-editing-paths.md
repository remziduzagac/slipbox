---
status: todo
assignee:
blocked_by: [ORG-T5, ORG-T13]
created: "2026-10-26"
---

# ORG-T14: Search and editing paths

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Move search and editing families, including regex worker/client and all source/compiled URL references. Keep queue and
deadline policy unchanged.

### Issue coverage and ownership

Destinations: core/workspace/search, core/documents/editing and external-editors. Pure text helpers remain callable by
clients; external-editor process integration is a distinct responsibility.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.
