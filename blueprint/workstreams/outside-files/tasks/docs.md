---
status: todo
assignee: ""
blocked_by: [OUT-T1, OUT-T2, OUT-T3, OUT-T4]
created: "2026-11-25"
---

# OUT-T5: The docs, the screenshots, and consolidation

## Description

- Each task's user docs go with its pull request; this one checks them whole, without the blueprint's IDs: the vaults
  guide, the manual's vaults, files, keys and reading pages, the CHANGELOG. "Loose file" stays out of them.
- The screenshots the changes touch, retaken and looked at (`bun run shots`).
- Consolidation, with the maintainer's approval: the root's requirements and design take this workstream's changes
  ([../requirements.md](../requirements.md) § Changes to the root's requirements, [../design.md](../design.md)); dated
  notes under VV-D3, VV-D4, VV-D7, D142 and D270; the roadmap's entry ticked; the workstream archived, its status
  `consolidated`.

## Acceptance criteria

- `bun run check:docs` passes; `space v g` is in keys.md; the shots are current.
- `bun run check` passes.
