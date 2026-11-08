---
status: todo
assignee: ""
blocked_by:
  - EG-T1
  - EG-T2
  - EG-T3
  - EG-T4
  - EG-T5
  - EG-T6
  - EG-T7
  - EG-T8
  - EG-T9
  - EG-T10
  - EG-T11
  - EG-T12
  - EG-T13
  - EG-T14
  - EG-T15
  - EG-T16
  - EG-T17
created: "2026-11-08"
---

# EG-T18: The docs, the screenshots, and consolidation

EG-D1.

## Description

- Each task's user docs go with its pull request; this one checks them whole: keys.md, the guides, the
  configuration, the CHANGELOG, without the blueprint's IDs.
- The screenshots the changes touch, retaken and looked at.
- Consolidation: the root's requirements and design take this workstream's changes; notes under D141, D155 and
  GIT-D12; the workstream archived.

## Acceptance criteria

- `bun run check:docs` passes; every new key is in keys.md; the shots are current.
- Every bug found gets a regression test; `bun run check` passes; the user docs and a CHANGELOG line come with it.
