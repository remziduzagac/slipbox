---
status: todo
assignee:
blocked_by: [ORG-T42]
created: "2026-10-26"
---

# ORG-T43: Scoped measurements and build reconciliation

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Complete the mapped where/export-stream/regex before/after comparisons using a disposable baseline checkout. Compare
selected unit files and terminal checks separately, test identities, completed wall times, host/cache conditions and
external bounds. Re-run full/runtime dependency analysis with research's settings and account for worker URL edges.
Verify moved entries, generated locks, worker URLs, assets, recursive test discovery and compiled distribution paths.
Audit the T44 contract-to-owner map: extracted responsibilities have one implementation, existing callers and focused
tests. Record remaining gateway implementation/migration work and the unresolved ENG ownership reconciliation.

## Evidence required

Report passing comparable runs and known baseline failures separately; partial timeouts do not establish speedup.
Explain remaining shared integration scope under D239; preserve dynamic-import and worker selection. Reconcile clone,
size, unused-code and pattern dispositions across the owner PRs. Recommend any additional measured performance/build
change as a coherent follow-up; #56 remains excluded. This is focused verification, not the full suite.

- T6: render's “drawn while its library loads …” needs a separate isolation fix and repeated-same-cache regression.

- T7: explorer/which-key “space n notes, space d folders, space v vaults …”: cause unproven; separate isolation fix.

- T12/T21: known clock-arithmetic TimeoutOverflowWarning output in shared processes: 18,198 lines for 121 split owners
  versus 4,069 for the old 22 files in an independent observation; groups alone are quiet, with no test failure. These
  are output observations, not a performance comparison. Investigate separately with a clock-arithmetic regression.


T9 records two CLI fixture assumptions for T23 isolation: listing-only uninstall discovers installed host skills, and
stat expects an unqualified vault name even inside a linked worktree. Baseline/current controls reproduce each; the
focused launcher selection passes separately. Keep these failures separate from the passing mapped scope timings.

- ORG-T9 CI follow-up: the switcher row-ownership fixture now publishes on reopening, with a controlled 400 ms first
  repaint that reproduces the old 300 ms timer race. Existing assertions and the separate 6.5-second wait case are
  unchanged; the fixed regression passes five repeats, the harness file passes 35 tests, and the watcher terminal
  check passes. No product code or deadline changed.
