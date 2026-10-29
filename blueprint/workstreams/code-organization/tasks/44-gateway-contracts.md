---
status: done
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

## Deliverable and evidence

The [contract boundary and sketches](../design.md#contract-boundary-and-common-rules-org-t44) refine eight operations:
link resolution, save, rename planning/application, Git status/staging, saved-resource search and export. Each gives
explicit target/input/output, read/effect classification, errors, cancellation/progress, resource owner, client
reconciliation, an existing-code example and a lifecycle walkthrough. Common rules separate operation outcomes from
presentation and preserve TUI text/undo/revision/saved-baseline ownership. The extraction/migration map names the ORG
owners; ENG reconciliation records its conflicting engine-owned document proposal without changing ENG's records.

Examples are read against the tooling metadata repair preceding ORG-T44 before later source moves; they establish
current behavior, not implemented future gateway guarantees. Lifecycle cases cover typing after save capture,
focus/vault changes, closed/reopened targets, stale plans, cancellation after effects and partial/uncertain outcomes.
Stronger disk transactions, connected edits, transport authority and outcome retention remain explicit next-stack
implementation work.

Local supporting checks pass: 2 link/plan cases, 1 save-conflict case and 2 export-publication/cancellation cases.
Documentation lint/spelling/links and diff whitespace pass. Both changed files are also linted directly with
markdownlint-cli2. This document task changes no src/tests, runtime call paths, deadlines or persisted data and needs no
migration manifest.
