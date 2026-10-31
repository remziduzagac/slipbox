---
status: todo
assignee:
blocked_by: [ORF-T4]
created: "2026-10-31"
---

# ORF-T5: Separate vault prompts from switching

Issue item 1; ORG-T11 vault follow-up.

## Scope

Characterize cancellation/reset/restore order, unsaved-buffer refusal, location identity and focus before separating
catalog/prompts from the switch transaction in src/tui/workspace/vaults/vaults.ts. Preserve behavior and remove its
exact cap at or below 600 lines.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.
