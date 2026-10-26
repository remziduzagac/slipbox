---
status: todo
assignee:
blocked_by: [ORG-T43]
created: "2026-10-26"
---

# ORG-T11: Final size ratchet and reconciliation

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Set the approved final handwritten ceiling after ORG-T43. Review every inventory row, record cohesive 500–600-line
modules and explicit remaining exceptions with follow-up tasks. Apply test caps and generated-lock cap. Reconcile
docs/manifests; no additional broad extraction in this PR.

Reconcile every issue item in the coverage ledger, including clone/pattern decisions, internal boundaries, unused-code
and error/type findings, completed scope comparisons and unresolved failures. A folder move alone is not completion.

## Evidence required

Boundary, size and focused tests of remaining owners; configured worker/build entry discovery. Repeat final
scopes/timings on mapped cases, record caps and unresolved baseline issues; no whole-suite run.
