---
status: todo
assignee:
blocked_by: [ORG-T2]
created: "2026-10-26"
---

# ORG-T3: Vaults and walking

## Approval gate

Draft only; blocked on approval of [the design](../design.md). One behavior-preserving PR into `dev` after the listed
predecessors. Apply the common [review and verification gates](README.md).

## Scope

Move vaults and walk areas, with their worker entries and clients. Update build lists, worker URLs and selector mappings
atomically.

## Evidence required

Vault discovery, symlink/trust, home slices, walk/list worker tests and matching explorer/vault terminal checks. Probe
source and compiled worker paths.

The PR records actual commands, results and affected paths. No passing result is assumed in this draft.
