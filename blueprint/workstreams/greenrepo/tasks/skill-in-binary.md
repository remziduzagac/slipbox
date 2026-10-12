---
status: todo
assignee: claude-cli
blocked_by: [GR-T4]
created: "2026-10-12"
---

# GR-T12: The skill in the binary

A release install gets the skill that matches it (GR-D10).

## Description

- `slipbox skill` prints `skills/slipbox/SKILL.md`, built into the binary; `slipbox skill --install <dir>` writes
  `<dir>/slipbox/SKILL.md`, saying where, and refuses to write over a file it didn't write unless asked.
- The docs: the CLI chapter, the agents guide (a release install has the skill now), the install guide; the skill
  mentions it.
- The design text under its entry in [design.md](../design.md).

## Acceptance criteria

- Tests of both, and of the compiled binary printing the skill; tried live (D209); `tests/docs.test.ts` passes.
