---
status: todo
assignee:
blocked_by: [ORG-T1]
created: "2026-10-26"
---

# ORG-T44: Gateway contracts and extraction boundaries

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Design the gateway contracts and feature ownership alongside the folder map, in [the design](../design.md). Refine the
initial link/save/rename/Git/search/export sketches with existing behavior, explicit targets, inputs/outputs, errors,
effects, progress/cancellation and resource lifetimes. Map each operation to existing implementation and client
coordination; identify reusable core responsibilities and the owner task that will extract them without changing runtime
routing.

Reconcile the proposed TUI-owned buffer with ENG's engine-owned document design. Record applicable ENG principles, the
concrete conflict and a proposed resolution for subsequent gateway implementation. Keep live typing, selection, undo,
panes and view state local; application operations must not rely on ambient active-tab state.

## Evidence required

Trace representative operations through current code and tests. Walk through save-while-typing, focus/vault changes,
closed targets, stale rename plans, cancellation and partial effects. Clearly distinguish guarantees already present
from proposed gateway guarantees. Produce an explicit extraction/migration map and acceptance cases for the future
implementation. This task designs contracts; it creates no runtime gateway, socket, scheduler or new document owner.

Run alongside mechanical moves after T1. Review the relevant contracts before T24's contract-dependent extractions;
ordinary moves and independently useful helpers do not wait for this design. Preserve existing-call-path parity. Gateway
execution, routing, socket transport and functionality migration belong to the next stack.
