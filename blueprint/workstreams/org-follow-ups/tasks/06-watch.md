---
status: todo
assignee:
blocked_by: [ORF-T5]
created: "2026-10-31"
---

# ORF-T6: Separate refresh from watcher reload

Issue item 1; ORG-T11 watcher follow-up.

## Scope

Characterize graph/root identity guards, stopped/paused work, delivery order, selection restoration and cleanup before
separating background refresh from changed-file reload in src/tui/app/runtime/watch.ts. Preserve behavior and remove
its exact cap at or below 600 lines.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.
