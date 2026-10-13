---
status: done
assignee: claude-cli
blocked_by: [TT-T9]
created: "2026-10-13"
---

# TT-T10: The name, the docs and the conventions

"Terminal tests" everywhere (TT-D1).

## Description

- `AGENTS.md`, `MAINTAINING.md`, the README's development section, `CLAUDE.md`-loaded rules: `bun run test:terminal`;
  the design text for design/testing.md under its entries in design.md; no "e2e" left.

## Acceptance criteria

- `tests/docs.test.ts` and the docs check pass; a search for "e2e" finds only history.
