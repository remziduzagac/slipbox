---
status: todo
assignee:
blocked_by: [ORG-T3]
created: "2026-10-26"
---

# ORG-T4: Graph and links paths

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Move graph and links families only, preserving authoritative graph maps and all resolution contracts. Mutation paths
move separately in ORG-T13.

### Issue coverage and ownership

Destinations: core/workspace/graph and links. Keep graph state authoritative and existing resolution behavior.

## Evidence required

Graph/link/rename/plan tests and corresponding file/rename terminal checks. Preserve refusal, undo and watcher
contracts; compare runtime SCCs.
