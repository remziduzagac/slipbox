---
status: todo
assignee:
blocked_by: [ORG-T23, ORG-T44]
created: "2026-10-26"
---

# ORG-T24: Focused controller capabilities

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Apply narrow explicit capabilities only to location/panel navigation seams shown by current calls; test real controllers
without App where feasible, with full-App wiring tests retained. Repeat the three mapped scope probes.

### Issue coverage and ownership

Record the controller-pattern assessment: extracted real capabilities, retained App ownership and measured import scope.
Use T44's contract design to distinguish application operations from local interaction. Extract reusable application
responsibilities where supported by current calls; keep existing callers and buffer ownership, without routing
functionality through a gateway.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.
