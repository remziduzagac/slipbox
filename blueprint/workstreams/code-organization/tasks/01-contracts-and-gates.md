---
status: todo
assignee:
blocked_by: []
created: "2026-10-26"
---

# ORG-T1: Contracts and migration gates

## Approval gate

Draft only; blocked on approval of [the design](../design.md). One behavior-preserving PR into `dev` after the listed
predecessors. Apply the common [review and verification gates](README.md).

## Scope

Extract independent CommandSpec contracts and add regression fixtures for command catalog direction. Capture migration
manifests/test identities. Introduce the 1,000-line source ratchet with measured exceptions. Other reverse-edge
extractions belong to their owner PRs.

## Evidence required

Command registration, mutation/export dependency cycles, drawing primitives and boundary/size tests. Repeat runtime
graph; preserve startup and error outcomes.

The PR records actual commands, results and affected paths. No passing result is assumed in this draft.
