---
status: todo
assignee:
blocked_by: [ORG-T26]
created: "2026-10-26"
---

# ORG-T27: Syntax responsibility splits

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Separate grammar loading, tree ownership, code-model extraction and link tokens behind the existing syntax entry.
Preserve eager imports, initialization and disposal.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.
