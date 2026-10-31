---
status: todo
assignee:
blocked_by: [ORF-T11]
created: "2026-10-31"
---

# ORF-T12: Split rendering tests by feature

Issue item 2; ORG-T11 test ledger.

## Scope

Split tests/render.test.ts by rendering responsibility, preserving titles, assertions, hooks and snapshot identities.
Keep rendered fixture strings byte-identical. Remove its cap at or below 1,500 lines.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.
