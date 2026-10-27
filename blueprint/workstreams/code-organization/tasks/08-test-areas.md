---
status: todo
assignee:
blocked_by: [ORG-T18]
created: "2026-10-26"
---

# ORG-T8: Core test split

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Split core.test.ts by feature into tests/core areas with unchanged assertions and hooks. Move only its required support
into focused modules. Vault and TUI suites have separate PRs.

### Issue coverage and ownership

Mirror core functional groups in test paths. Assess shared fixture clones using matching setup/cleanup semantics;
preserve assertions and keep pure support independent of App. Record dispositions for ORG-T40.

## Evidence required

Enumerate and compare identities/counts before/after each migrated group; run those groups unchanged. Test selector
nested-file/helper/worker discovery and retained conservative fallback.
