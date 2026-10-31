---
status: todo
assignee:
blocked_by: [ORF-T8]
created: "2026-10-31"
---

# ORF-T9: Separate App opening and layout policy

Issue item 1; ORG-T11 App follow-up; follows ORF-T3 through ORF-T8.

## Scope

Characterize TUI buffer ownership, initialization/disposal order, view anchors and App.writeBuffer authority before
extracting opening/layout rules through focused capabilities from src/tui/app/runtime/app.ts. Keep App composition and
shared state; introduce no App-shaped service bag. Remove its exact cap at or below 600 lines. If needed, record
numbered child PR tasks before their work starts.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.
