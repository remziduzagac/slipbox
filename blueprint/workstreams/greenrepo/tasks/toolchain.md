---
status: todo
assignee: claude-cli
blocked_by: []
created: "2026-10-12"
---

# GR-T3: The toolchain pinned, and .editorconfig

One place pins each version (GR-D11).

## Description

- `mise.toml`: Bun and the check's tools (zizmor, actionlint, typos, lychee, gitleaks), exact versions, each a week
  old at least as the supply chain asks.
- `.editorconfig`: UTF-8, LF, final newline, two spaces, no trailing whitespace (Markdown's two-space breaks aside).
- The design text under design/repository.md's entry in [design.md](../design.md).

## Acceptance criteria

- `mise install` in the repository gives every tool the check runs.
