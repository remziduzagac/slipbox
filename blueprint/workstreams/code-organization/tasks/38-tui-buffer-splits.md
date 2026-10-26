---
status: todo
assignee:
blocked_by: [ORG-T37]
created: "2026-10-26"
---

# ORG-T38: TUI buffer and editing splits

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Separate buffer layout-cache helpers and source editing helpers; preserve history, marks and save ownership.

### Issue coverage and ownership

Include the document views, peek, lens and completion modules assigned in the coverage ledger. Preserve per-view state,
shared buffer history, save ownership and stale clipboard-result guards; split unrelated extractions into child PRs.

## Evidence required

Run focused owner tests and affected terminal checks pre/post; retain failure/cancellation and snapshot contracts.
Verify measured size exceptions and light/heavy import boundaries.
