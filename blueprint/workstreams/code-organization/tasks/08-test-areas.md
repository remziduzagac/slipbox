---
status: todo
assignee:
blocked_by: [ORG-T18]
created: "2026-10-26"
---

# ORG-T8: Core test split

## Approval gate

Draft only; blocked on approval of [the design](../design.md). One behavior-preserving PR into `dev` after the listed
predecessors. Apply the common [review and verification gates](README.md).

## Scope

Split core.test.ts by feature into tests/core areas with unchanged assertions and hooks. Move only its required support
into focused modules. Vault and TUI suites have separate PRs.

## Evidence required

Enumerate and compare identities/counts before/after each migrated group; run those groups unchanged. Test selector
nested-file/helper/worker discovery and retained conservative fallback.

The PR records actual commands, results and affected paths. No passing result is assumed in this draft.
