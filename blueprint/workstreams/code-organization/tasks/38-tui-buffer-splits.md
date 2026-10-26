---
status: todo
assignee:
blocked_by: [ORG-T37]
created: "2026-10-26"
---

# ORG-T38: TUI buffer and editing splits

## Approval gate

Draft only; blocked on approval of [the design](../design.md). One behavior-preserving PR into `dev` after the listed
predecessors. Apply the common [review and verification gates](README.md).

## Scope

Separate buffer layout-cache helpers and source editing helpers; preserve history, marks and save ownership.

## Evidence required

Run focused owner tests and affected terminal checks pre/post; retain failure/cancellation and snapshot contracts.
Verify measured size exceptions and light/heavy import boundaries.

The PR records actual commands, results and affected paths. No passing result is assumed in this draft.
