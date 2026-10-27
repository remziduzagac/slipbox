---
status: todo
assignee:
blocked_by: [ORG-T29]
created: "2026-10-26"
---

# ORG-T30: Explorer responsibility splits

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Separate explorer row construction, zoom/navigation and item actions without moving controller ownership or changing
disk/write policy.

### Issue coverage and ownership

Assess explorer, file-action and Git-controller responsibilities assigned by the coverage ledger. Keep each extraction
cohesive; propose child PRs before combining unrelated Git and explorer changes.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.
