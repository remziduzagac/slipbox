---
status: done
assignee: claude-cli
blocked_by: []
created: "2026-10-15"
---

# VV-T1: Vault, home and Elsewhere, in everything users read

The words of VV-D1 to VV-D3 in the docs, the help, the messages and the status line.

## Description

- "Root", "plain folder" and "loose file" replaced in `docs/`, the README, the help and every message; the status line
  names the vault, home or Elsewhere.
- Command titles and descriptions in `src/core/command-specs.ts` in the same words; the ids, which already say vault,
  kept.
- design/terms.md: the new words, the old ones retired.

## Acceptance criteria

- `tests/docs.test.ts` fails on "root" meaning a vault in the docs; `bun run check` passes.

## Done (2026-10-15)

Words only. Vault in everything users read; a folder and a file outside every vault said so, as they still are,
until VV-T2 and VV-T3 make home and Elsewhere, and put them on the status line. The names agents, scripts and configs
depend on keep root (the workstream's design.md lists them). `tests/docs.test.ts` holds the docs, the README, the skill
and the messages to it.
