---
status: todo
assignee:
blocked_by: [ORG-T27]
created: "2026-10-26"
---

# ORG-T28: Markdown layout responsibility splits

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Separate markdown dispatch, row finishing, picture handling and shared node guards. Keep generated rows, source maps and
HTML behavior identical.

### Issue coverage and ownership

Record which repeated AST guards have identical contracts; retain format-specific branches and source maps.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.
