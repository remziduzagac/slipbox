---
status: todo
assignee:
blocked_by: [ORG-T39]
created: "2026-10-26"
---

# ORG-T11: Final size ratchet and reconciliation

## Approval gate

Draft only; blocked on approval of [the design](../design.md). One behavior-preserving PR into `dev` after the listed
predecessors. Apply the common [review and verification gates](README.md).

## Scope

Set the approved final handwritten ceiling after ORG-T39. Review every inventory row, record cohesive 500–600-line
modules and explicit remaining exceptions with follow-up tasks. Apply test caps and generated-lock cap. Reconcile
docs/manifests; no additional broad extraction in this PR.

## Evidence required

Boundary, size and focused tests of remaining owners; configured worker/build entry discovery. Repeat final
scopes/timings on mapped cases, record caps and unresolved baseline issues; no whole-suite run.

The PR records actual commands, results and affected paths. No passing result is assumed in this draft.
