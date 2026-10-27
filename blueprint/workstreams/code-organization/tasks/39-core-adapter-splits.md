---
status: todo
assignee:
blocked_by: [ORG-T38]
created: "2026-10-26"
---

# ORG-T39: Core adapter and export cleanup

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Assess remaining server client/parse/export modules above the aim; extract only measured cohesive adapters. Triage
unused exports against build/worker entry points; no behavior deletion.

### Issue coverage and ownership

Extract UTF-8 encoding below export dispatch and enforce the reverse-edge rule. Record the lazy-format pattern
assessment. Own remaining core size-ledger assessments; unused-code triage is completed separately in ORG-T41.

## Evidence required

Run focused owner tests and affected terminal checks pre/post; retain failure/cancellation and snapshot contracts.
Verify measured size exceptions and light/heavy import boundaries.
