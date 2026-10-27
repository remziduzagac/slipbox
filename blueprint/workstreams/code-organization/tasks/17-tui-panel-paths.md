---
status: todo
assignee:
blocked_by: [ORG-T16]
created: "2026-10-26"
---

# ORG-T17: TUI explorer, panels and overlays paths

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Move explorer, panels, overlays and screen regions, preserving focus and drawing order. No helper deduplication in this
move.

### Issue coverage and ownership

Destinations: tui/workspace/explorer and history; tui/documents/tools; tui/shell/panels, overlays and screen. Keep one
shared right-tools host and its existing active-view/floating-editor behavior.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.
