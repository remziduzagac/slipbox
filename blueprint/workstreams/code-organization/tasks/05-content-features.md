---
status: todo
assignee:
blocked_by: [ORG-T4]
created: "2026-10-26"
---

# ORG-T5: Content feature paths

## Approval gate

Draft only; blocked on approval of [the design](../design.md). One behavior-preserving PR into `dev` after the listed
predecessors. Apply the common [review and verification gates](README.md).

## Scope

Move documents, markdown and syntax only, preserving parser/grammar assets and worker boundaries. Search, editing,
diagnostics and git have separate move PRs.

## Evidence required

Focused parser/syntax/search/regex/spell/git tests and affected terminal checks; source and compiled worker probes. No
loading optimization.

The PR records actual commands, results and affected paths. No passing result is assumed in this draft.
