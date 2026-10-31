---
status: todo
assignee:
blocked_by: [ORF-T18]
created: "2026-10-31"
---

# ORF-T19: Prove unused-code dispositions

Issue item 5; ORG-T41 candidate ledger and ORG-T43 refresh.

## Scope

Reconcile all 84 type and 197 runtime-export candidates from the T41 ledger with current entry-aware discovery (T43
retained 194 runtime exports after new tests consumed three). For each, record remove or keep with evidence covering
imports/re-exports, dynamic consumers, workers, build entries, tests, scripts and documented/non-TypeScript uses.
Remove only proven unused declarations; add no dependency and change no public command or persisted key. Use child
tasks for independent cleanup batches if necessary.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.
