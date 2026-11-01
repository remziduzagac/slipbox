---
status: review
assignee:
blocked_by: [ORF-T10]
created: "2026-10-31"
---

# ORF-T11: Split server tests by feature

Issue item 2; ORG-T11 test ledger.

## Scope

Split tests/servers.test.ts by language/protocol/process ownership, preserving titles, assertions, hooks and snapshot
identities. Remove its cap at or below 1,500 lines.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.

## Build record

- Branch: `refactor/issue-170-server-tests`, from `origin/dev` at `990a9f00`. The ORF-T10 completion record is
  carried unchanged. The preceding dev push 41302381875 succeeds on attempt 1; test-only terminal jobs were skipped.
- Before-edit [manifest](../manifests/t11-server-split.json): four whole-suite feature owners under
  `tests/core/documents/servers/`, plus two shared fixtures. `git mv` records the manager relocation before splitting.
- All eight top-level suites move whole, including the manager's nested suite and computed protocol cases. Exact
  suite bodies, helper bodies after dedenting, timeout values, assertions and rendered fixture strings remain.
- Each owner registers its own sandbox, XDG/config isolation, cleanup and afterEach trust reset. Local package/lock
  helpers close over that sandbox; event/wait helpers share their original bodies. Fake-server path resolves to the
  same `tests/fixtures/fake-lsp.ts`. Source, assets, entries, workers, package settings and snapshots are unchanged.
- Original focused baseline: 73 tests / zero failures / 877 assertions across server/timeout owners, 13.84 seconds.
  Relocated equivalents: 73 / zero / 877 across five owners, 13.90 seconds. Same case identities, no speedup claim.
- Original terminal checks: server crash/restart and incremental linter results pass, two checks / six commands /
  two jobs / 2.1 seconds; after relocation, two checks / six commands / two jobs / 2.2 seconds.
- Source/declaration captures before/after: 3131 static / 2290 runtime edges, twelve build entries, all 4085 literal
  declarations, zero unresolved references. Source snapshots match exactly. Live docs and timeout inventory updated;
  historical task/research paths retained explicitly in the manifest. Only the server-test cap is removed.
- Body/import/scope/stale-reference audits pass. All 73 executed case identities match before/after; local import
  targets retain their union and resolve. The eight-owner PR selection includes the four replacements, size/timeout
  guards and both live example-case readers, with no whole-suite fallback or selected terminal checks.
- Source paths retain every other selected owner; the retired collection becomes only its actual feature consumers.
  Client 319→322, find/install 323→326, manager 319→321, languages 390→392, linters 390→391; fake fixture 6→7.
  Terminal selectors are unchanged. Broad App integration remains selected; no reduced-scope performance claim.
- Explicit rename review with `git diff -M30%` recognizes manager at 33%; default rename detection cannot infer
  this one-to-four split. Staged migration gate passes. New owners are client479/discovery569/manager715/linters259.
- Terminal bodies, harness and registration remain unchanged.
- Product/worker/build inputs are byte-identical: no product entry moved, no compiled-worker reprobe required for
  this test-only relocation. No bug fix, user-facing behavior, dependency, deadline or CI-policy change is included.

## Verification and delivery

- `gnutimeout -k 10 900 bun run check` passes typecheck, boundary, size, dependency/workflow gates, Biome and docs,
  then 110 tests / zero failures / 1015 assertions across the exact eight selected owners, 14.63 seconds of unit
  execution. No fallback or overflow warnings. All 73 moving/inventory case identities also occur in this run.
- Docs: 481 Markdown / 1786 spelt files / zero link errors; Biome: 1186 files. Size: 577 source / 579 test/fixture
  files, zero handwritten source caps, one generated cap and seven test caps. All four replacements meet the aim.
- Evidence: `tmp/issue/ORF-T11-{before,after}-unit.log`, terminal logs, body/scope/import/migration audits and
  `ORF-T11-check.log` with verification-summary JSON. The initial private scope diagnostic included its own
  temporary script; the corrected audit checks the actual fourteen-path change and is preserved separately.
- No source behavior or user-visible command/path changes: user documentation and CHANGELOG need no update.
  The live example-case index and blueprint test ownership map follow the relocated tests. No full-suite run,
  all-terminal run, timeout change, dependency change or unrelated-failure retry.
- Fresh review remains pending. Publish a draft into dev, then stop after build; do not mark done before merge.
