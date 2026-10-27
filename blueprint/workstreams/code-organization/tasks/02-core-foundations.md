---
status: todo
assignee:
blocked_by: [ORG-T12]
created: "2026-10-26"
---

# ORG-T2: Core foundations

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Move text, platform, workers, config and commands areas in separate coherent batches within this PR. Keep width/sanitize
authoritative and resolver settings unchanged.

### Issue coverage and ownership

Destinations: core/foundation/text, platform and workers; core/application/config and commands. Theme moves in T6.
Position/session persistence moves in T3, not into pure text primitives.

## Evidence required

Width/sanitize/config/commands and filesystem/tool-process tests; boundary, size and import resolution. Preserve
environment and optional-tool behavior.
