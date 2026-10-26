---
status: todo
assignee:
blocked_by: [ORG-T19]
created: "2026-10-26"
---

# ORG-T20: TUI editor test split

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Move editor/input/source/lens scenarios from tui.test.ts into tests/tui areas. Preserve hooks, titles and snapshot
identity; leave unrelated scenarios untouched.

### Issue coverage and ownership

Use tui/documents and shell/input test owners. Preserve buffer/undo ownership and existing edit/save behavior; the
autosave Git-lock baseline failure is recorded, not silently accepted as a passing migration comparison.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.
