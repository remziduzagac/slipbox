---
status: todo
assignee:
blocked_by: [ORG-T1]
created: "2026-10-26"
---

# ORG-T2: Core foundations

## Approval gate

Draft only; blocked on approval of [the design](../design.md). One behavior-preserving PR into `dev` after the listed
predecessors. Apply the common [review and verification gates](README.md).

## Scope

Move text, platform, config, theme and commands areas in separate coherent batches within this PR. Keep width/sanitize
authoritative and resolver settings unchanged.

## Evidence required

Width/sanitize/config/commands and filesystem/tool-process tests; boundary, size and import resolution. Preserve
environment and optional-tool behavior.

The PR records actual commands, results and affected paths. No passing result is assumed in this draft.
