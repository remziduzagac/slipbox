---
status: todo
assignee:
blocked_by: [ORG-T36]
created: "2026-10-26"
---

# ORG-T37: TUI diagnostics splits

## Approval gate

Draft only; blocked on approval of [the design](../design.md). One behavior-preserving PR into `dev` after the listed
predecessors. Apply the common [review and verification gates](README.md).

## Scope

Separate problems presentation and language integration helpers; preserve trust and cancellation.

## Evidence required

Run focused owner tests and affected terminal checks pre/post; retain failure/cancellation and snapshot contracts.
Verify measured size exceptions and light/heavy import boundaries.

The PR records actual commands, results and affected paths. No passing result is assumed in this draft.
