---
status: todo
assignee: ""
blocked_by: [SIS-T1]
tracker: [gh:#103]
created: "2026-11-10"
---

# SIS-T2: The workstream consolidated

## Description

With the maintainer's approval: the root's requirements.md and design files take the workstream's changes
([../requirements.md](../requirements.md) § Changes to the root's requirements, [../design.md](../design.md)), its
decisions are cited from them, the roadmap's entry is ticked, and the workstream moves to `workstreams/archive/` with
its status `consolidated`.

## Acceptance criteria

- design/tui.md § SOURCE view, § The lens and § Git, design/rendering.md § Themes and § Diffs, and requirements.md
  § Editing say what the workstream's design.md and requirements.md say.
- `bun run check:docs` passes.
