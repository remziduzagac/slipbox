---
status: todo
assignee:
blocked_by: [ORG-T22]
created: "2026-10-26"
---

# ORG-T9: Pure TUI test boundaries

## Approval gate

Draft only; blocked on approval of [the design](../design.md). One behavior-preserving PR into `dev` after the listed
predecessors. Apply the common [review and verification gates](README.md).

## Scope

Extract editable and drawing primitives below composition; remove topbar imports from generic model support and isolate
pure location/geometry tests. Keep App integration journeys. CLI and controller seams have separate PRs.

## Evidence required

Focused unit tests plus retained App and launcher journeys for each seam. Repeat mapped where/export-stream/regex scope
measurements; report failures and incomplete runs honestly.

The PR records actual commands, results and affected paths. No passing result is assumed in this draft.
