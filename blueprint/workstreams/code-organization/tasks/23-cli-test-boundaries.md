---
status: todo
assignee:
blocked_by: [ORG-T9]
created: "2026-10-26"
---

# ORG-T23: CLI test boundaries

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Organize CLI suites by area, test handlers directly where appropriate, and retain a small launcher suite covering
dispatch, arguments, exit/error behavior and dynamic TUI boundary.

### Issue coverage and ownership

Assess CLI dispatch responsibilities from the size ledger while preserving launcher coverage and exit/error contracts.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.

Split compound CLI export scenarios where independent outcomes permit it, retaining every assertion and intentional
end-to-end sequence. Distinguish the aggregate test budget from each child's 20-second deadline; use T12's named
existing budgets unchanged. Coordinate CIW-T9 and record focused before/after runs.
