---
status: todo
assignee:
blocked_by: [ORG-T35]
created: "2026-10-26"
---

# ORG-T36: TUI drawing splits

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Separate overlay widgets and pane painting into owner-local helpers with unchanged geometry.

### Issue coverage and ownership

Separate shell composition, window/tab drawing, document headers and owner-local feature drawing. Assess the shared
selection/scroll clone with pinning and filtering tests; preserve geometry and existing tab/window containment.

## Evidence required

Run focused owner tests and affected terminal checks pre/post; retain failure/cancellation and snapshot contracts.
Verify measured size exceptions and light/heavy import boundaries.
