---
status: proposed
assignee: null
blocked_by: [VV-T2]
created: "2026-10-15"
---

# VV-T3: No-vault, shown as Elsewhere

Everything outside home and the vaults: its own tabs, no index (VV-D3).

## Description

- No-vault's one set of tabs for the machine; "Elsewhere" on the status line and in messages.
- What needs an index (backlinks, search across, link checks by name) said to be unavailable there, not empty.
- The plain folder and the loose file retired from the code's paths that users reach.

## Acceptance criteria

- A terminal check: `slipbox` on a folder outside home opens Elsewhere; a note there says it has no backlinks; going
  back to a vault brings its own tabs.
