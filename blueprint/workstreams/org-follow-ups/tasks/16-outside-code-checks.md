---
status: todo
assignee:
blocked_by: [ORF-T15]
created: "2026-10-31"
---

# ORF-T16: Split external-change and code terminal checks

Issue item 2; ORG-T11 terminal ledger.

## Scope

Split tests/terminal/checks/outside-and-code.ts by feature, preserving check names, assertions, setup/cleanup and
registration. Remove its cap at or below 1,500 lines.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.
