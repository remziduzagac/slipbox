---
status: todo
assignee:
blocked_by: [ORG-T6]
created: "2026-10-26"
---

# ORG-T7: TUI composition paths

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Move App/background/session/watch, vault and window coordination, terminal adapters, input and action registration into
their folders. Update boundary/tool paths atomically. Remaining feature controllers move in ORG-T16–ORG-T18 before test
relocation.

### Issue coverage and ownership

Destinations: tui/app/runtime, tui/workspace/session and vaults, tui/shell/terminal and input, and tui/actions. Move
current window arrangement to tui/windows/layout; preserve tabs containing views and current session data.

## Evidence required

TUI command parity, wiring, input/focus/save tests and checks for moved features. Compare snapshots and source/compiled
launch; verify only two adapters import OpenTUI.
