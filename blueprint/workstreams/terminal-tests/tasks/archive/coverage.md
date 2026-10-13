---
status: done
assignee: claude-cli
blocked_by: [TT-T1]
created: "2026-10-13"
---

# TT-T2: The feature map and the coverage test

What's covered is known and checked (TT-D3, TT-D4).

## Description

- Each check declares its area, its feature's name, the `CASES.md` cases or areas it covers and the commands it runs
  for their effect; the runner's report lists them.
- A test in `bun run test` (it needs no terminal: it reads the checks' declarations): every command in
  `core/command-specs.ts` and every area of `examples/home/CASES.md` has a check, or is listed as left out with its
  reason; it fails naming what's uncovered.
- The left-out list starts from what today's trace says no scenario runs.

## Acceptance criteria

- The test, failing on a command or an area added without a check (mutation-checked).
