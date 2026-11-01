---
status: review
assignee:
blocked_by: [ORF-T9, ORF-T26]
created: "2026-10-31"
---

# ORF-T10: Split distribution tests by feature

Issue item 2; ORG-T11 test ledger.

## Scope

Split tests/distribution.test.ts into focused distribution-gate owners, preserving titles, assertions, hooks and
snapshot identities. Remove its cap at or below 1,500 lines.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.

## Before-edit plan

- Branch: refactor/issue-170-distribution-tests from green dev e0b013aaf1d1690a73162898b2f2ea255f5bac1c (#186).
  ORF-T9/T26 completion records carried unchanged; corrective dev run 41297049491 passes all platforms on attempt 1.
- The [manifest](../manifests/t10-distribution-split.json) records one tracked relocation and five feature owners:
  supply-chain/advisories, release/package execution, installation/uninstall, updates, and channels/bootstrap.
  The complete release suite, its nested build hook and named budget stay together; every describe block stays whole.
- Shared sandbox/tree helpers retain file-owned cleanup. Pack/release fixtures have their own helper, so the light
  filesystem fixture does not import release implementations. Existing helper bodies and call signatures stay intact.
- Preserve existing leaf/suite names, assertions, hooks, snapshots, fixture strings and deadlines. Mechanical live
  path references follow the move: the exact scope-owner list, the timeout guard and canonical design module maps.
  The size fixture receives its own synthetic test cap after the distribution cap is removed, preserving assertions.
- Capture declarations/source dependencies/build entries and actual scope before editing. Run the original owner
  and the existing size/timeout guards before and after; retain the compiled-package execution in those runs.
  No product, worker, package, dependency, runtime entry, CI policy or user behavior change is included.

## Baseline and timeout inventory

- Original distribution owner passes all 81 tests, including the compiled-package cases; the size owner passes all
  eight tests and the budget-value guard passes. The three-owner command records 90 passes and one failure,
  1577 assertions, 24.52 seconds; it is not a green aggregate. `tmp/issue/ORF-T10-before-unit.log` retains it.
- The strict timeout-site inventory lacks four already-existing explicit UNIT_TIMEOUT_MS sites: ORF-T3's resolver,
  ORF-T4's dispatch/output and ORF-T26's new Git fixture regression. Actual defaults are unchanged. Add only those
  four inventory entries before relocation; keep the guard's equality assertion and all budgets intact.
- This reconciles the named-site reader already touched by this move, including the omission introduced in T26.
  Retain the failed baseline, verify the corrected guard separately, then proceed with the original moving cases.
  No unchanged failed aggregate or CI job is retried, and no passing full-baseline claim is made.

## Extraction and verification

- Five owners replace the 2510-line file: supply-chain 676, release 917, installation 194, updates 256 and
  channels 509 lines. Two shared helpers are 24/40 lines. The release suite and its nested build hook stay whole;
  one host release is built per run, with the original named budget and all compiled-package assertions.
- All seven describe blocks are byte-identical after reversing only the real scope guard's owner-path list.
  Synthetic graph fixture text is unchanged. The tree/pack/release helper bodies agree exactly after indentation
  normalization; file-owned cleanup and repository-root resolution retain their meaning. No test/snapshot renamed.
- Removed only the distribution test cap. The size fixture now injects a synthetic legacy test cap into its copied
  script. All existing assertions are byte-identical; reversing that setup reconstructs the complete base file.
  Fixture-only undo fails with expected exit 1 / received 0, then fixed bytes are restored exactly.
- The timeout-site guard passes after inventory reconciliation; inventory-only undo reproduces its failure once,
  then exact restoration. Reversing the four existing-site entries and five moved-owner paths reconstructs the
  complete base guard. Its assertion logic and all policy values remain unchanged.
- After extraction, all 91 cases pass across seven owners: 1575 assertions, 24.99 seconds. The original moving
  distribution cases all passed before extraction. The initial inventory failure remains recorded separately;
  no speedup or completed green combined-baseline claim follows from those observations.
- Structural captures agree exactly: 3131 static / 2290 runtime source edges, twelve build entries, 4085 literal
  declaration identities and zero unresolved references. Every non-distribution scope owner is retained; the
  original owner becomes only the relevant feature owners. Release scope 4 → 6 files, dependency gates 4 → 7,
  install 320 → 323 and update 319 → 322; terminal selections are identical, no whole-suite fallback.
- `git mv` precedes extraction. The measured rename similarity is 36%, visible with `git diff -M30%`; the default
  threshold cannot infer a one-to-five split. Canonical testing/distribution design maps and live path readers move
  with it. Historical research/tasks/inventories are retained as exact manifest entries with reasons.
- Logs, executable extraction script and body/scope/fixture audits are retained in `tmp/issue/ORF-T10-*`.
- The affected restart terminal check passes one scenario / four commands / two jobs, 13.0 seconds; its prior
  green base run passes on every platform. No terminal check body, registration or harness changes.
  The staged migration/stale-reference gate and bounded scoped check follow.

## Build delivery

- Required `gnutimeout -k 10 900 bun run check` passes all static/docs gates and the exact seven reached owners:
  91 tests / 1575 assertions / zero failures, 24.27 seconds of tests, 33.57 seconds for the complete command.
  No missing owner, overflow warning or whole-suite fallback. Terminal selection is empty for this test-only move;
  the explicit distribution restart check above also passes.
- Final static results: 577 source / 574 test/fixture files; zero handwritten source caps, one generated cap and
  eight test caps. Biome checks 1181 files; docs check 481 Markdown / 1780 spelt files with zero link errors.
- Migration check passes exact source graph/runtime edges, build entries, declaration multiplicities and stale-path
  checks against the published manifest. Original moving test bodies, helper bodies and compiled-package coverage
  remain intact. All executed case names agree with the original baseline, including computed cases.
- The original failed timeout-inventory baseline and both controlled metadata-fixture failures remain preserved.
  No unexplained failure or CI job is retried; no budget, dependency, product behavior or CI setting changes.
- Logs/results: `tmp/issue/ORF-T10-check.log`, result JSON and verification/body/scope/migration records. Carry the
  T9/T26 completion records unchanged. Draft publication follows; fresh review and merge remain separate stages.
