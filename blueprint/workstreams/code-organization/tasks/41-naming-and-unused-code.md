---
status: todo
assignee:
blocked_by: [ORG-T40]
created: "2026-10-26"
---

# ORG-T41: Naming and unused-code cleanup

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Review owner-local role names and configure Knip discovery for all real source, worker, fixture, test, script and build
entries. Triage research's unused file/export/type candidates, unlisted references and dependency/tool flags. Record
used/false-positive/narrow-export/remove/defer outcomes with references. Narrow exported visibility or remove proven
unused declarations only after checking non-TypeScript consumers and documented invocations. No dependency changes,
public command renames or persisted-key changes are bundled here.

## Evidence required

Repeat entry-aware discovery and repository references before/after each removal. Run typecheck and affected tests, plus
worker/build probes for touched entries. Preserve optional tool integration, generated assets and docs scripts. Names
improve ownership clarity without requiring symbol churn across every moved file. Keep each cleanup batch reviewable;
the candidate ledger must account for exclusions and deferred findings.
