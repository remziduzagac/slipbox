---
status: todo
assignee:
blocked_by: [ORF-T3]
created: "2026-10-31"
---

# ORF-T4: Separate CLI dispatch from presentation

Issue item 1; ORG-T11 CLI follow-up.

## Scope

Characterize argument admission, dispatch order, text/JSON errors and exit codes before separating dispatch from
output/exit presentation in src/cli/cli.ts. Preserve behavior and remove its exact cap at or below 600 lines.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.
