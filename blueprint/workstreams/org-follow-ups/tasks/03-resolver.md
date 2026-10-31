---
status: todo
assignee:
blocked_by: [ORF-T25]
created: "2026-10-31"
---

# ORF-T3: Separate resolver admission from lookup

Issue item 1; ORG-T11 resolver follow-up.

## Scope

Characterize resolution precedence, scope/cache identity, symlinks, aliases and ambiguity before extracting link
admission from candidate lookup in src/core/workspace/graph/graph-resolve.ts. Preserve behavior and remove its exact
cap at or below 600 lines.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.
