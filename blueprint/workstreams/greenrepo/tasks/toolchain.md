---
status: done
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

## Log

- 2026-10-12: `mise.toml` pins Bun 1.4.2 and zizmor 1.30.1, actionlint 1.7.12, typos 1.50.3 (1.51.1 was six days
  old), lychee 0.24.2, gitleaks 8.30.1 and, for actionlint's script checks, ShellCheck 0.11.0, from aqua (whose
  downloads mise checks against their attestations or sums). `mise.lock` records each download's address and SHA-256
  for linux-x64, linux-arm64, macos-arm64 and macos-x64, so CI installs exactly those. `.editorconfig`: UTF-8, LF,
  final newline, two spaces, trailing whitespace trimmed but in Markdown. `mise trust` was needed once on this
  machine; where mise isn't active in a shell, `mise x -- bun run check`.

## Design text

For design/repository.md § The check: "`mise.toml` pins Bun and the check's tools, and `mise.lock` their downloads'
sums for the four platforms CI and releases use; mise reads them locally (`mise install`, once), `jdx/mise-action` in
CI. `package.json`'s `engines` stays the floor for running from source."
