---
status: todo
assignee:
blocked_by: [ORG-T33]
created: "2026-10-26"
---

# ORG-T34: Search splits

## Approval gate

Draft only; blocked on approval of [the design](../design.md). One behavior-preserving PR into `dev` after the listed
predecessors. Apply the common [review and verification gates](README.md).

## Scope

Separate query parsing, indexed/scan dispatch and hit location; preserve ranking and fallback.

## Evidence required

Run focused owner tests and affected terminal checks pre/post; retain failure/cancellation and snapshot contracts.
Verify measured size exceptions and light/heavy import boundaries.

The PR records actual commands, results and affected paths. No passing result is assumed in this draft.
