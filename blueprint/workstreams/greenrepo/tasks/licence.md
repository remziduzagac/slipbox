---
status: done
assignee: claude-cli
blocked_by: []
created: "2026-10-12"
---

# GR-T1: The licence: Apache-2.0

slipbox is Apache-2.0 (GR-D3, closing `14.6`).

## Description

- `LICENSE` at the root, Apache-2.0's text; `package.json`'s `license` says `Apache-2.0`; the README says so.
- The packs carry `LICENSE` beside the binary and its notices (`scripts/release.ts`); the Homebrew formula names its
  licence (`scripts/homebrew.template.rb`).
- The design text under its entries in [design.md](../design.md).

## Acceptance criteria

- A test that a pack holds `LICENSE` and the formula names Apache-2.0, failing without the change.
- The typecheck and the test files touched pass.

## Log

- 2026-10-12: `LICENSE` from apache.org's text; `package.json`, the README's § Licence, the packs (`release.ts`), the
  formula. Tests: the pack's listing, the formula's licence line, and LICENSE with `package.json` (new); each fails
  with its change undone (mutation-checked).
