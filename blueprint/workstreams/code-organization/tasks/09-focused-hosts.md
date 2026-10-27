---
status: todo
assignee:
blocked_by: [ORG-T22]
created: "2026-10-26"
---

# ORG-T9: Pure TUI test boundaries

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Extract editable and drawing primitives below composition; remove topbar imports from generic model support and isolate
pure location/geometry tests. Keep App integration journeys. CLI and controller seams have separate PRs.

### Issue coverage and ownership

Place pure helpers under their document or shell owner. Add forbidden reverse-edge fixtures and retain full-App
journeys; no new window/tab behavior. Report actual dependency reductions rather than only file counts.

## Evidence required

Focused unit tests plus retained App and launcher journeys for each seam. Repeat mapped where/export-stream/regex scope
measurements; report failures and incomplete runs honestly.
