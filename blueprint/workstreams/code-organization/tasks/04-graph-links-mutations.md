---
status: todo
assignee:
blocked_by: [ORG-T3]
created: "2026-10-26"
---

# ORG-T4: Graph and links paths

## Approval gate

Draft only; blocked on approval of [the design](../design.md). One behavior-preserving PR into `dev` after the listed
predecessors. Apply the common [review and verification gates](README.md).

## Scope

Move graph and links families only, preserving authoritative graph maps and all resolution contracts. Mutation paths
move separately in ORG-T13.

## Evidence required

Graph/link/rename/plan tests and corresponding file/rename terminal checks. Preserve refusal, undo and watcher
contracts; compare runtime SCCs.

The PR records actual commands, results and affected paths. No passing result is assumed in this draft.
