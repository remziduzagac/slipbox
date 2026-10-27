---
status: todo
assignee:
blocked_by: [ORG-T17]
created: "2026-10-26"
---

# ORG-T18: TUI git and service paths

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Move git, diagnostics, media, export, settings and distribution controllers with their area drawing. Complete the TUI
map; keep App wiring identical.

### Issue coverage and ownership

Destinations: tui/workspace/git and its views; tui/documents/diagnostics, media and export; tui/app/settings and
distribution. Retain App composition and the current buffer write gate.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.
