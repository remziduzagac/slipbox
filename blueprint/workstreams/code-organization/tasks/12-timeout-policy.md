---
status: todo
assignee:
blocked_by: [ORG-T1]
created: "2026-10-26"
---

# ORG-T12: Test timeout policy

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Run immediately after T1 in a separate behavior-neutral PR. Centralize the unchanged 30-second default and existing
named slow budgets at tests/support/timeouts.ts; preserve required per-file initialization and align the package
runner's fallback. Inventory timeout failures separately from assertion failures and inherited fixture/environment
state. This phase does not depend on test moves or gateway design, and does not promise that centralization fixes slow
execution. Product deadlines, terminal waits, process-kill policy and CI ceilings stay unchanged.

Compound CLI scenario splitting remains with T23, after focused test boundaries are available; coordinate CIW-T9. Any
later budget increase needs measured evidence after narrowing, independently reviewed.

## Evidence required

Verify runner/default alignment, representative ordinary and existing slow tests, and the SIGTERM-resistant process
case. Record the existing autosave checkout-cache finding separately from timeout failures. No timer-overflow fix,
blanket increase or assertion change belongs in this phase. Preserve named budgets through later file moves.
