---
status: todo
assignee: claude-cli
blocked_by: [GR-T3]
created: "2026-10-12"
---

# GR-T4: Biome, and the code formatted once

Biome formats and lints the code (GR-D7).

## Description

- `@biomejs/biome` as an exact dev dependency, a week old; `biome.json`: 120 columns, two spaces, double quotes, the
  recommended rules, with any rule the code breaks by design turned off, each with its reason.
- `bun run check` runs `biome ci`; `bun run format` formats.
- The code formatted in one commit, which only formats and fixes with safe fixes; that commit in
  `.git-blame-ignore-revs`.

## Acceptance criteria

- `bun run check` passes after the reformat, the whole suite included; no snapshot changed.
