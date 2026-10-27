---
status: todo
assignee:
blocked_by: [ORG-T2]
created: "2026-10-26"
---

# ORG-T3: Vaults and walking

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Move vaults and walk areas, with their worker entries and clients. Update build lists, worker URLs and selector mappings
atomically.

### Issue coverage and ownership

Destinations: core/workspace/vaults, session and walk. Move position/session persistence intact; preserve its format.

## Evidence required

Vault discovery, symlink/trust, home slices, walk/list worker tests and matching explorer/vault terminal checks. Probe
source and compiled worker paths.
