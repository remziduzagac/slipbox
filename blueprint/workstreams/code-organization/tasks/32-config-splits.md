---
status: todo
assignee:
blocked_by: [ORG-T31]
created: "2026-10-26"
---

# ORG-T32: Configuration and parsing splits

## Approval gate

Draft only; blocked on approval of [the design](../design.md). One behavior-preserving PR into `dev` after the listed
predecessors. Apply the common [review and verification gates](README.md).

## Scope

Separate config defaults/validation/loading, data-format readers and markdown transformations by their existing
contracts. Keep parsing branches explicit and all warnings stable. Lower the handwritten ceiling to 750 with exact
measured legacy exceptions.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.

The PR records actual commands, results and affected paths. No passing result is assumed in this draft.
