---
status: todo
assignee:
blocked_by: [ORG-T31]
created: "2026-10-26"
---

# ORG-T32: Configuration and parsing splits

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Separate config defaults/validation/loading, data-format readers and markdown transformations by their existing
contracts. Keep parsing branches explicit and all warnings stable. Lower the handwritten ceiling to 750 with exact
measured legacy exceptions.

### Issue coverage and ownership

Assess the reported data-parser clone explicitly; retain distinct format semantics rather than forcing reuse.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.
