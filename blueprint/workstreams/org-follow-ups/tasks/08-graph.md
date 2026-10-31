---
status: todo
assignee:
blocked_by: [ORF-T7]
created: "2026-10-31"
---

# ORF-T8: Separate graph refresh from index state

Issue item 1; ORG-T11 graph follow-up.

## Scope

Characterize the single mutable graph, generation order and overlay/cache invalidation before extracting refresh/feed
coordination from src/core/workspace/graph/graph.ts. Introduce no generic graph container. Preserve behavior and remove
its exact cap at or below 600 lines.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.
