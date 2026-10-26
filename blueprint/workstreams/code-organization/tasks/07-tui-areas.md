---
status: todo
assignee:
blocked_by: [ORG-T6]
created: "2026-10-26"
---

# ORG-T7: TUI composition paths

## Approval gate

Draft only; blocked on approval of [the design](../design.md). One behavior-preserving PR into `dev` after the listed
predecessors. Apply the common [review and verification gates](README.md).

## Scope

Move only App/background/session/watch, terminal adapters, input and action registration into their folders. Update
boundary/tool paths atomically. Feature controllers move in ORG-T16–ORG-T18 before test relocation.

## Evidence required

TUI command parity, wiring, input/focus/save tests and checks for moved features. Compare snapshots and source/compiled
launch; verify only two adapters import OpenTUI.

The PR records actual commands, results and affected paths. No passing result is assumed in this draft.
