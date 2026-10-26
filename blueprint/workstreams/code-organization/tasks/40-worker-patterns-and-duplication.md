---
status: todo
assignee:
blocked_by: [ORG-T39]
created: "2026-10-26"
---

# ORG-T40: Worker patterns and remaining duplication

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Compare diagram, paint, regex, syntax, spelling, export and walk lifecycle policies against WorkerRequests. Record a
retain/extract outcome per mechanism. Extract only proven equivalent lifecycle helpers; preserve feature admission,
retry, cache, timeout and progress behavior. Complete the six source-clone dispositions and remaining test/protocol
clone triage from the coverage ledger; fixture sharing must preserve setup, trust, process and cleanup lifetimes.

## Evidence required

Re-run jscpd using research's version/scopes/thresholds and mapped paths. Explain retained clones and any new ones. For
an extracted lifecycle helper, test disposal, late delivery, saturation, cancellation and failure cleanup in every
adopting owner. Validate shared protocol fixtures with their specific checks; never run every terminal check. If no
shared lifecycle abstraction is justified, deliver the comparison and retained-policy rationale rather than
manufacturing a refactor. Split independent protocol or lifecycle extractions into child PRs before implementation.
