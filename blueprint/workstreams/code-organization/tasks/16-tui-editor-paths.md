---
status: todo
assignee:
blocked_by: [ORG-T7]
created: "2026-10-26"
---

# ORG-T16: TUI editor and navigation paths

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Move editor, navigation, search and scratch controllers plus their actions and helpers. Keep buffer ownership and save
gate intact.

### Issue coverage and ownership

Destinations: tui/documents/buffers, editing, views, navigation, saving and search; tui/workspace/search;
tui/app/scratch. Move mixed search modules intact before tested responsibility extraction.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.
