---
status: todo
assignee:
blocked_by: [ORG-T41]
created: "2026-10-26"
---

# ORG-T42: Types and error contracts

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Review repeated custom AST casts and library adapters, completing remaining work after T28/T29. Extract guards only for
identical contracts and keep validation at external inputs. State which owner refuses, cleans up, retries and presents
failures. Preserve WriteRefused, CliError, WorkerRequestError, user messages, exit codes, cancellation and intentional
cleanup suppression; no global error/result framework or broad compiler-setting change.

## Evidence required

Characterize malformed inputs, refusal, cancellation, adapter failure and cleanup before extraction and run the same
cases after it. Verify narrowing is real rather than casts hiding incompatible states. Record retained casts/adapters
with their rationale and coordinate any dependency/type-package follow-up separately.
