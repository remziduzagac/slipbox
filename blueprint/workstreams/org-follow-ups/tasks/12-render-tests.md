---
status: review
assignee:
blocked_by: [ORF-T11, ORF-T27]
created: "2026-10-31"
---

# ORF-T12: Split rendering tests by feature

Issue item 2; ORG-T11 test ledger.

## Scope

Split tests/render.test.ts by rendering responsibility, preserving titles, assertions, hooks and snapshot identities.
Keep rendered fixture strings byte-identical. Remove its cap at or below 1,500 lines.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.

## Prerequisite finding

The original baseline has the retained cold-load Mermaid cache failure, before any relocation. ORF-T27 isolates its
child environment in a separate test-only PR. When this split resumes, update the cold-load regression's executable
owner path in tests/core/rendering/media/diagrams/cold-load.test.ts along with the snapshot selector reader; keep its
two controlled runs and all assertions unchanged. The original baseline and planned manifest remain available for
before/after audit; source, snapshot and fixture bytes have not moved.

## Build record

- Branch: refactor/issue-170-render-tests, fast-forwarded to green dev 7e697b80 after prerequisite PR #189.
  Carried T27 completion is byte-identical to its saved record; T11 completion is already in dev.
- Before-edit manifest: ../manifests/t12-render-split.json. Eight whole-suite owners and two shared fixtures;
  all 31 top-level suites retain titles, bodies, hooks and assertions, with only relative executable paths updated.
  Both snapshot-bearing suites stay together; their snapshot moves byte-for-byte, without regeneration.
- The original 523-pass/one-failure baseline remains recorded in ORF-T27. The corrected before observation reuses
  T27's fresh review check at byte-identical original test/source/snapshot bytes: 527 pass / zero fail / 39 snapshots /
  60311 assertions / three owners / 22.17 seconds unit time. This includes the regression and timeout inventory.
  No unchanged passing owner or historical failed selection is repeated for baseline collection.

- Relocated the original owner with git mv, then split all 31 suites into eight owners (56–663 lines). Shared
  sandbox factory and layout helpers preserve original bodies; each owner registers its original XDG cleanup
  and preload. Allocator c0 stays beside its original suites. Static import-target union is unchanged.
- Whole-suite audit preserves exact bodies after documented executable-path substitutions and normal formatting.
  Original scripts, generated inputs, comments, assertions, titles and hooks stay intact. Both snapshot suites
  share the layout owner; snapshot bytes are identical. T27 completion is carried unchanged.
  Evidence: tmp/issue/ORF-T12-body-audit.py, body-audit.json and identity-audit.json.
- Before/after selected tests have identical 527 executed identities, 39 snapshots and 60311 assertions:
  22.17 / 21.62 seconds, zero failures. The original pre-prerequisite failed baseline remains recorded.
  No speedup claim. After log: tmp/issue/ORF-T12-after-unit.log.
- Canonical testing/rendering paths, cold-cache subprocess reader, snapshot selector reader and spelling
  exclusion follow the manifest. No timeout site moves or new timeout site is introduced. Only the rendering
  test cap is removed; six legacy test caps remain, with no cap increase.
- The scope selector assumed top-level snapshots. Its two-line path resolution now finds the sibling test
  at any depth, preserving the original root rule. The existing real-repository scope assertion fails with only
  this adaptation undone (expected relocated owner, received no owner); fixed bytes restored exactly, then the
  case passes 28 assertions. Logs: ORF-T12-selector-negative.log and selector-fixed.log. Other selection rules,
  SCOPE_VERSION, workflows and CI deadlines are unchanged.
- The initial private negative probe selected the separate synthetic-scope case and passed; it did not exercise
  the real snapshot assertion. Retained as selector-negative-initial-wrong-filter.log, then corrected only the
  diagnostic filter. The intended negative and restored pass above provide the regression evidence.
- Same three terminal scenarios pass: table borders, changed-word/long-line diff and background diagram layout.
  Before: table/diff pair two checks / eight commands / 2.3 seconds; reused prerequisite diagram one check /
  six commands / 1.8 seconds. After combined: three checks / eleven commands / 3.2 seconds. Two jobs throughout;
  unchanged names, check bodies and budgets. Logs: ORF-T12-before-terminal.log and after-terminal.log.
- Before/after source captures agree: 3131 static / 2290 runtime edges, twelve entries, 4086 declaration
  identities and zero unresolved references. All other selected owners remain, replacing only the retired
  render owner with its actual consumers; exact deltas are in the manifest. Terminal selectors stay identical.
  The relocated snapshot selects exactly its layout owner, with no terminal checks or fallback.
- Migration/stale-reference gate passes. Snapshot relocation is 100%; explicit -M30% review recognizes the
  main layout owner at 32%, while default similarity cannot infer the one-to-eight split. Historical task,
  research and measured inventory references are retained explicitly.
- Initial static prechecks found a missing type-only Span import and unused imports, corrected before tests.
  Initial docs check found the spelling exclusion still assumed the top-level snapshot folder; extending its
  path pattern preserves the existing exclusion without editing snapshot text. Corrected docs/Biome pass:
  482 Markdown / 1798 spelt files / 1196 linted files. A private migration invocation initially passed the
  scope wrapper instead of its snapshot; corrected diagnostic input, source unchanged. Original logs retained.
- Product source, workers, assets, build entries, package and dependencies are unchanged. Test-only relocations
  require no new compiled-product probe; no product behavior or user-doc/changelog change applies.

- Required gnutimeout -k 10 900 bun run check passes all static/docs gates and exactly fifteen reached owners:
  628 tests / zero failures / 39 snapshots / 62730 assertions / 25.04 seconds unit time. All 524 moving cases
  and the cold-cache regression retain their executed identities; the focused before/after selection also
  retains both timeout-policy cases. No overflow warnings or whole-suite fallback.
  Evidence: tmp/issue/ORF-T12-check.log:694, check.exit and verification-summary.json.
- Build complete; fresh review and merge remain separate stages. Final publication records follow. No full
  suite/all-terminal run, failed-job retry, product behavior change, dependency addition or deadline increase.

## Draft publication

- Draft [PR #190](https://github.com/remziduzagac/slipbox/pull/190) is open into dev from
  refactor/issue-170-render-tests. Implementation/evidence commit
  a824c8ccdbb4d6e6a1cfa5efc4d3f880abc3046c is pushed without force. This publication record changes only
  the task file; product tests are not repeated for it.
- Final build-record docs and Biome pass with the counts above. Keep the PR draft; fresh review and merge remain
  separate stages. Final-head CI is pending verification. Stop after this build handoff.
