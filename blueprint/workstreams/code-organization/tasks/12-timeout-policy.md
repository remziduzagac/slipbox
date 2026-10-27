---
status: review
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

## Implementation and verification

The policy lives in `tests/support/timeouts.ts`: the unchanged 30,000 ms unit default and operation-named existing
budgets, with their reasons. All existing file-local `setDefaultTimeout` calls remain at their call sites; export reads
retain their 60,000 ms file default. The numeric package fallbacks remain 30,000 and an alignment test checks both
`test` and `test:docs`. Intentionally short injected timeout cases and child-process bounds remain feature-local.

After substituting constants and normalizing formatting, Bun executable code matches the baseline in all 18 modified
existing files. The timeout policy test, boundary fixtures, bundled dictionary test, graceful-stop-resistant tool test and
initialize-timeout cleanup, syntax worker and skill-command integration tests pass. No assertion, product deadline,
terminal wait or process-kill policy changed.
The autosave ancestor-checkout interaction and broad-run environment/timer findings remain separate; no timeout increase
or timer-arithmetic fix is included. Source application code and build entries are unchanged.

The policy names the unchanged tighter syntax budgets (15,000 and 20,000 ms), clarified that export reads still
initialize their file default locally, and added a guard for all ten existing file-local initialization sites. The
numeric runner fallback is intentionally duplicated in package JSON and checked against the shared constant.

### Failure inventory

| Observation | Classification | Treatment in T12 |
| --- | --- | --- |
| External 900-second aggregate expiry | Incomplete run; no per-test budget measurement | No increase |
| Autosave reused an ancestor checkout | Fixture and checkout-cache interaction | Separate finding |
| Baseline socket, shell and clipboard assertions | Environment/assertion failures | Separate finding |
| Earlier invalid timer warnings | Clock behavior; no evidence of a small budget | Separate investigation |
| Focused runner/forced-stop cases | Passing policy/process checks | Existing values retained |

The release-build hook remains 240,000 ms; equivalence checking covers its argument without repeating a release build
for this test-only change. Product/child-process/terminal clocks and intentionally injected tiny timeout cases retain
their original owners and numbers.

The initialization guard names its explicit path-map maintenance requirement; later test moves update that map.
Source-inspection and setup comments retain the budget rationale and point at the policy. Formatting expands several
existing callback bodies: inspect `git diff -w` alongside the 18-file executable-equivalence result to separate that
formatting from the budget substitutions.
