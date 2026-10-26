---
status: todo
assignee:
blocked_by: [ORG-T42]
created: "2026-10-26"
---

# ORG-T43: Scoped measurements and build reconciliation

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Complete the mapped where/export-stream/regex before/after comparisons using a disposable baseline checkout. Compare
selected unit files and terminal checks separately, test identities, completed wall times, host/cache conditions and
external bounds. Re-run full/runtime dependency analysis with research's settings and account for worker URL edges.
Verify moved entries, generated locks, worker URLs, assets, recursive test discovery and compiled distribution paths.
Audit the T44 contract-to-owner map: extracted responsibilities have one implementation, existing callers and focused
tests. Record remaining gateway implementation/migration work and the unresolved ENG ownership reconciliation.

## Evidence required

Report passing comparable runs and known baseline failures separately; partial timeouts do not establish speedup.
Explain remaining shared integration scope under D239; preserve dynamic-import and worker selection. Reconcile clone,
size, unused-code and pattern dispositions across the owner PRs. Recommend any additional measured performance/build
change as a coherent follow-up; #56 remains excluded. This is focused verification, not the full suite.
