---
status: todo
assignee:
blocked_by: [ORG-T8]
created: "2026-10-26"
---

# ORG-T19: Vault test split

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Split vault.test.ts by behavior: vault/walk, links/graph, mutations, search/git and CLI integration. Preserve
environment/trust fixtures and scenario identities.

### Issue coverage and ownership

Mirror workspace functional groups. Assess shared filesystem/process fixtures while preserving trust and XDG lifetime.
Keep each scenario and assertion visible; record setup clone dispositions for ORG-T40.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.
