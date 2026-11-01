---
status: todo
assignee:
blocked_by: [ORF-T11, ORF-T27]
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

## Prerequisite finding

The original baseline has the retained cold-load Mermaid cache failure, before any relocation. ORF-T27 isolates its
child environment in a separate test-only PR. When this split resumes, update the cold-load regression's executable
owner path in tests/core/rendering/media/diagrams/cold-load.test.ts along with the snapshot selector reader; keep its
two controlled runs and all assertions unchanged. The original baseline and planned manifest remain available for
before/after audit; source, snapshot and fixture bytes have not moved.
