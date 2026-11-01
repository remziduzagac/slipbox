---
status: done
assignee:
blocked_by: [ORF-T25]
created: "2026-10-31"
---

# ORF-T3: Separate resolver admission from lookup

Issue item 1; ORG-T11 resolver follow-up.

## Scope

Characterize resolution precedence, scope/cache identity, symlinks, aliases and ambiguity before extracting link
admission from candidate lookup in src/core/workspace/graph/graph-resolve.ts. Preserve behavior and remove its exact
cap at or below 600 lines.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.

## Extraction plan

Branch: `refactor/issue-170-resolver`, from `origin/dev` at
`19be598d2cbc783455e728484dc2fe7a8d72bbe8`. The preceding ORF-T2 dev push passes on attempt 1.
The ORF-T2 completion record is carried unchanged.

Keep admission and precedence in `src/core/workspace/graph/graph-resolve.ts` (`LinkResolver`), including current
versus legacy wikilinks, protocol dispatch, old-form advice and broken-path/move diagnostics. Extract candidate
lookup to `src/core/workspace/graph/graph-lookup.ts` (`LinkLookup`): filesystem, nested-root, pointer and hosting
targets, attachment/name candidates and their existing caches. One lookup belongs to each resolver and reads the
same live Graph; Graph's index, mutation/invalidation sites and public entry points remain unchanged.

The [extraction manifest](../manifests/t3-resolver-extraction.json) records the methods and entry points before
source changes. No tracked file is relocated or retired, so there is no git mv or old-path rewrite. New
characterization exercises public graph queries before extraction; existing name/export, pointer, hosting,
path-link and symlink tests supply the other invariants. Compare the resolved dependency graph and declaration
identities, inspect the rename-aware diff, build the host binary and probe info/resolution away from the source.

## Characterization and extraction evidence

Four new public-Graph cases add 21 assertions: filename precedence over aliases, current/legacy name admission,
alias proximity and genuine ties, legacy previous-name ambiguity, per-graph name/export-mark cache identity and
existing update invalidation. They pass before extracting. The same eight-owner selection passes before and after:
53 tests, 323 assertions, zero failures, no overflow warnings (1.21/1.25 seconds). Owners: resolver, names, resolution,
path-links, pointers, hosting-integration, redirects and symlinks/following. Existing tests and fixtures are unchanged.

The same three terminal checks pass before and after, with two jobs: nearest-root paths, one target in every form,
and Obsidian names/aliases/ambiguity. Each selection exercises nine commands (8.8/8.1 seconds).

`graph-resolve.ts` shrinks from 605 to 306 lines; `graph-lookup.ts` has 328. The exact resolver exception is removed
from `scripts/check-size.ts`; six handwritten source exceptions remain. No cap is raised. The module map records
the new owner. All sixteen moved members retain their bodies and comments exactly, allowing only private-to-public
access changes on collaborator entry points. Six retained diagnostic/advice methods are byte-identical. The three
dispatch methods change collaborator receivers and formatting only; order, literals and public exports are unchanged.
The two forwarding methods retain Graph's existing invalidation and alias-reader entry points.

The manifest records all dependency deltas: 3,001 → 3,007 static edges, 2,245 → 2,249 runtime edges, no unresolved
reference. Both captures include the new characterization before extraction; all 4,046 declaration identities and
twelve build entries agree. Runtime cycle memberships remain identical (2/5/8). No worker URL, asset, selector,
snapshot, existing test/check name or fixture path moves. Rename-aware diff/summary and whitespace checks pass.

The repository host build compiles all twelve entries (1,463 bundled modules). Standalone typecheck passes.
The required scoped check passes typecheck, boundary, sizes, dependencies, Biome, workflow and documentation gates
(476 Markdown files, 1,735 spelt files). An initial documentation line-length error was corrected before this
attempt reached tests. No product/user behavior changes, dependency, deadline, user-doc or changelog edit is included.

## Initial verification failure and prerequisite

The required `gnutimeout -k 10 300 bun run check` selects 353 unit owners, not the whole suite. It fails the existing
`stat` case at `tests/cli/reading/metadata.test.ts:65`: the expectation is `vault halden`, but the demo in this linked
worktree correctly prints `vault halden@refactor/issue-170-resolver`. The shared helper's `DEMO` names the repository's
`examples/vault` (`tests/support/cli-process.ts:26`); the case uses it instead of the sandbox copy. Human stat output
uses `rootLabel` (`src/cli/info.ts:171`), whose existing worktree branch suffix is in
`src/core/workspace/vaults/names.ts:28–29`. None of these files changes in this extraction.

[ORG-T43](../../archive/code-organization/tasks/43-measurement-and-build.md) already records this exact
host assumption immediately before its measurement protocol. [ORF-T22](22-stat-fixture.md) isolates the fixture in
its own PR, retaining the assertion and adding controlled ordinary-checkout and linked-worktree cases. The product
label is unchanged. The original failure remains recorded rather than retried without a fix.

The scoped run was stopped with SIGINT, exit 130; it has no passing aggregate result. Its final output also reports
a null child exit at `tests/distribution.test.ts:1293` during the interruption; that observation remains undiagnosed,
not presented as an independent established defect. Neither was rerun before prerequisite ORF-T22 was fixed and merged.

Local evidence: `tmp/issue/ORF-T3-before-unit.log`, `ORF-T3-after-unit.log`, `ORF-T3-before-terminal.log`,
`ORF-T3-after-terminal.log`, `ORF-T3-body-audit.txt`, `ORF-T3-structure.log`, `ORF-T3-export-audit.log`,
`ORF-T3-build.log` and `ORF-T3-check-final.log` (first failure at line 251). Preserve this incomplete scoped result.

## Resumed build after ORF-T22

The local extraction was rebased without conflict onto `origin/dev` at
`5254a04494a9f57176795353c3b170c1ea89626d` after PR #175 merged. Its automatic
[dev push](https://github.com/remziduzagac/slipbox/actions/runs/41243296407) passes on attempt 1, including both
reached-unit platforms, lint/site and aggregate CI; terminal/status jobs are skipped for that test-only scope.
The ORF-T2 and ORF-T22 completion records are carried unchanged. No source changes accompany the rebase.

Structural reconciliation adds ORF-T22's one new metadata declaration to both sides of the historical extraction
capture: all 4,047 declarations agree, all twelve entries agree, and the same static/runtime edge deltas have no
unresolved references. No source changed in the prerequisite, so the recorded runtime cycle memberships still apply.

The package-built binary has SHA256 `bd6c3e38263fb55883bd584188de6a7e719eb891f1bc13483824858164bab508`.
Source and copied binary run by absolute path from a temporary directory away from the repository, with private
home/config/state/cache/data directories. Both pass info identity, five resolution cases (filename, alias, path,
ambiguous aliases and unresolved path), exact exit codes and two backlinks. The real backlinks client also starts
one worker and returns two indexed backlinks in both source and compiled modes; no fallback is accepted. The compiled
worker probe uses the package build's twelve-entry set with only main replaced by its diagnostic caller, retains
the root/autoload flags, and runs outside the repository. Its temporary source and binary are removed.

Logs: `tmp/issue/ORF-T3-resume-structure.log`, `ORF-T3-resume-binary-probe.log`,
`ORF-T3-resume-worker-source.log`, `ORF-T3-resume-worker-build.log` and `ORF-T3-resume-worker-compiled.log`.

## Retained autosave fixture failure and isolation prerequisites

The resumed `gnutimeout -k 10 300 bun run check` passes all static/docs gates (477 Markdown files, 1,739 spelt
files). Its 353-owner unit selection has no whole-suite fallback. All four resolver characterization cases pass,
as do the isolated stat fixture and controlled worktree-label case from ORF-T22.

The selection then fails `tests/tui/documents/saving/conflicts.test.ts:128`: the autosave Git-lock case expects
`ab\n` while the file contains `abc\n`. The log records one failed case and 1,871 pass lines before interruption,
with zero overflow warnings. These are partial observations, not a passing aggregate. The exact check process group
1447951 was stopped with SIGINT (exit 130); no test, failed selection or historical failure was rerun afterward.
Evidence: `tmp/issue/ORF-T3-resume-check.log:1890` (assertion), `:1900` (test identity).

This matches the retained [ORG autosave finding](../../archive/code-organization/design.md#focused-verification), which
already traced the same assertion to cached ancestor-checkout discovery. The current fixture constructs App at
`conflicts.test.ts:115` before creating its own `.git`/lock at lines 124–125. Autosave uses
`src/tui/documents/saving/saving.ts:208`, and `src/tui/workspace/git/git.ts:79` prefers its cached checkout when
checking the lock. A later namespace check saw a read-only `/tmp/.git` inside the sandbox and none on the
unrestricted host; the initial sandbox observation does not establish the host state during this failed run. All
these source/fixture files were byte-identical to origin/dev at that run; the extraction changes candidate lookup only.
The current failure was not instrumented or rerun to claim a fresh
causal trace; the matching historical trace and unchanged fixture establish the retained finding separately.

Recommend a separate test-only PR giving this autosave fixture its Git context before App construction, with a
controlled ancestor-checkout regression; preserve its title, assertions and deadlines. Resume ORF-T3's scoped
verification and publication after that prerequisite. No additional task, fixture fix, commit, push, draft PR,
fresh review or merge is included in this waiting record. The rebased extraction and both completion edits remain.


## Resumed build after ORF-T23 and ORF-T24

The saved, unpushed extraction was rebased without conflict onto `origin/dev` at
`5dd078a231321e40e2c0e648676704305d14a729` after PRs #176 and #177 merged. PR #177's automatic
[dev push](https://github.com/remziduzagac/slipbox/actions/runs/41249000773) succeeds on attempt 1; both reached-unit
platforms, lint/site and aggregate CI pass, with terminal/status skipped for that test-only scope. The rebased source
is unchanged, and the ORF-T24 completion record is carried unchanged alongside the existing ORF-T2 record.

[ORF-T23](23-autosave-fixture.md) creates the autosave fixture's Git context before App construction and adds a
controlled ancestor-checkout regression. Its corrected marker-writer diagnostic demonstrates no temporary-root
marker producer; the original shared-run trigger remains unproved. The diagnostic separately exposed an inherited
NO_COLOR theme assumption, isolated with a controlled regression in [ORF-T24](24-theme-fixture.md). Each prerequisite
preserves the original assertions and deadlines and records its failing undone-fix control. Neither failure is hidden
by retrying an unchanged fixture. The initial incomplete resolver scoped runs remain retained above.

Final structural comparison captures current dev plus the identical characterization and the rebased extraction:
3,001 → 3,007 static edges, 2,245 → 2,249 runtime edges, all 4,049 declaration identities and twelve entries retained,
zero unresolved references. The initial disposable capture lacked installed dictionary assets; attaching the same
node_modules resolves those four asset paths on both sides. Manifest deltas are unchanged. Source, characterization,
size policy and module-map bytes match the saved extraction, preserving its body audit and compiled probe evidence.
Logs: `tmp/issue/ORF-T3-final-structure-fixed-assets.log` and `ORF-T3-final-rebase-audit.txt`.

## Aggregate external bound; draft publication pending

The final `gnutimeout -k 10 300 bun run check` passes all static/docs gates (479 Markdown files, 1,741 spelt
files), then reaches the unchanged 300-second external aggregate bound, exit 124. Its 353-owner selection has
1,831 pass lines, zero failed test cases and zero overflow warnings, but no completed aggregate summary. The four
resolver characterizations, isolated stat/worktree cases, autosave Git-lock case and theme preview case all pass.

The log reaches 293 preceding file owners, then is interrupted in `tests/tui/shell/screen/rules.test.ts`; 59 selected
owners have not started. SIGTERM is reported at lines 2455–2456, with the child exit 143 at line 2458. This is an
external aggregate timeout, not a demonstrated assertion failure or a proven product performance cause. Existing
per-test deadlines are unchanged. No selection, interrupted case or successful file is rerun after the timeout.

Evidence: `tmp/issue/ORF-T3-final-check-verified-docs.log` and `ORF-T3-final-scope-completion.json`, which lists the
selected, preceding, interrupted and remaining owners. The two earlier final attempts stopped at documentation
wrapping errors before running tests; their logs remain, and the corrected task text passes its docs precheck.

Recommend completing only the interrupted owner and the 59 owners not yet started in bounded batches, retaining this
incomplete combined run and all existing deadlines. The handover's failed-check stop is retained for disposition;
no fresh terminal run, commit, push, draft PR, review or merge follows this timeout. The existing before/after
terminal results and source/compiled probes remain recorded above; this aggregate check is not claimed green.


## Scoped completion and Git-panel color fixture

The interrupted owner and 59 owners not yet reached run in two sequential 30-file batches, each with
`gnutimeout -k 10 300 bun test --timeout 30000`. Whole bun run check commands use a 900-second outer wrapper;
all test deadlines remain unchanged. The original exit 124 is retained, and no completed owner is repeated.
The two initial pass lines from the interrupted owner are excluded from the combined counts below.

| Part | Owners | Passes | Skips | Failures |
| --- | ---: | ---: | ---: | ---: |
| Completed before interruption | 293 | 1,829 | 0 | 0 |
| Completion batch 1 | 30 | 272 | 2 | 0 |
| Completion batch 2 | 30 | 266 | 0 | 1 |
| Combined selected owners | 353 | 2,367 | 2 | 1 |

Batch 1 passes in 49.974 seconds, with 2,330 assertions. Batch 2 finishes in 21.405 seconds, with 1,852 assertions,
but fails `tests/tui/workspace/git/panel/input.test.ts:178`: expected the git_new foreground (undefined), received
`default`. The case assumes color while App deliberately selects mono under inherited nonempty NO_COLOR
(`src/tui/app/runtime/app.ts:657`). The fixture and App source are unchanged from dev; the invoking unrestricted
shell has NO_COLOR present and nonempty. The combined scoped result is not green, and the failed batch is not retried.

The standing fixture-isolation follow-up is ORF-T25: keep this case's title, body and assertions, isolate its color
preference, and add a controlled nonempty/empty/absent environment regression in a separate test-only PR. The saved
resolver extraction stays local while that prerequisite builds. No deadline, product behavior or shared helper changes.

Evidence: `tmp/issue/ORF-T3-completion-batch-1.log`, `ORF-T3-completion-batch-2.log:27`,
`ORF-T3-completion-results.json` and `ORF-T3-completion-summary.json`. The summary verifies exact coverage of all
353 selected owners without repeating the 293 completed owners; no total first-part assertion count is inferred.


## Publication after ORF-T25

The saved local extraction rebases without conflict onto current dev at
`f0bd367acd2ddd6573e8664c77f3b39960209136`, after [ORF-T25](25-git-color-fixture.md), PR #178, merges. Its
[automatic dev push](https://github.com/remziduzagac/slipbox/actions/runs/41251747777) succeeds at that exact
commit on attempt 1. Both reached-unit platforms, lint/site and aggregate CI pass; terminal/status are skipped
for this test-only prerequisite. The ORF-T25 completion record is carried unchanged, alongside ORF-T2's record.

All source, characterization, size-policy and module-map bytes are identical to saved extraction `47a324dc`.
The package build entries and fixed Git-color owner equal current dev. The original body/export audits,
before/after characterizations, three affected terminal scenarios, package build, isolated CLI probes and real
source/compiled backlinks-worker requests therefore remain applicable; no product source changed in any prerequisite.
The fresh structural comparison against dev plus the identical characterization preserves all 4,050 declaration
identities and twelve entries. Static edges remain 3,001 → 3,007 and runtime edges 2,245 → 2,249, exactly the
manifest's deltas, with zero unresolved or stale references. The extra declaration is ORF-T25's regression.

The current selector names exactly the same 353 owners, with no whole-suite fallback. Its conservative terminal
selection remains all; only the three affected scenarios recorded above were executed. On the rebased tree under
NO_COLOR=1, the changed Git-color owner passes nine tests, 68 assertions, zero failures (904 milliseconds),
including the preserved original case and the new environment-restoration regression. No unrelated failed batch
or previously completed unchanged owner is repeated. Replacing only that owner's seven passes/one failure in the
retained ledger with its nine passes yields 2,369 passing tests and two skips across all 353 selected owners.
This is combined owner coverage, not a single completed aggregate check. The original exit 124, interrupted runs
and one-failure batch remain recorded above and in their original logs; no total first-part assertion count is inferred.

Publication evidence: `tmp/issue/ORF-T3-publish-previous-dev.json`, `ORF-T3-publish-rebase-audit.txt`,
`ORF-T3-publish-structure.log`, `ORF-T3-publish-scope.json`, `ORF-T3-publish-fixed-owner.log` and
`ORF-T3-publish-verification-summary.json`. Final publication gates pass: typecheck, boundary, size, dependency
checks, Biome, workflow checks and documentation. Logs: `ORF-T3-publish-static-results.json` and each
`ORF-T3-publish-<gate>.log`. The size gate counts 562 source files with six handwritten/one generated caps and
559 test/fixture files with nine legacy caps. The package binary still matches the SHA256 recorded above.

[Draft PR #179](https://github.com/remziduzagac/slipbox/pull/179) is open into dev on
`refactor/issue-170-resolver`. Rebased extraction commit: `915fe433`; completed build evidence:
`55e9ac30ceaf1050d46846307316cc0d4d6ae5b2`. Both are pushed without force. The completed-evidence documentation
gate passes: 480 Markdown files, 1,742 spelt files, zero link errors.

## Review and merge completion

Fresh review at `0738052d0618761ca8e1b821e5edaa878df9cab3` has no actionable findings. Its independent body,
export, cache/invalidation, declaration/entry, dependency and combined-owner audits agree with the extraction
manifest and retained evidence. Fresh focused verification passes 53 tests / 323 assertions across eight owners,
and the three affected terminal scenarios pass nine commands with two jobs. Typecheck, boundary, size, dependency,
lint, workflow and documentation gates all pass. Review: `tmp/issue/review-ORF-T3.md`.

Final-head [PR CI](https://github.com/remziduzagac/slipbox/actions/runs/41252417122) and
[CodeQL](https://github.com/remziduzagac/slipbox/actions/runs/41252414855) succeed on attempt 1. Both unit
platforms, lint/site and aggregate CI pass; terminal/status jobs are skipped by PR policy. The preceding PR #178
dev push above succeeds at the exact unchanged base before merge. The PR description records the completed review
and passing checks; its head remains unchanged.

PR #179 was marked ready, then squash-merged with the reviewed head enforced by --match-head-commit. Merge:
`1af50deec5b3f6b31971ad2ba70f9a297826da28`, 2026-10-31 23:35:09 UTC. Its automatic
[dev push](https://github.com/remziduzagac/slipbox/actions/runs/41253152724) succeeds at that exact merge on
attempt 1: both unit platforms, lint/site, all three terminal platforms and aggregate CI pass. Terminal totals:
ARM 548/548, Linux x64 548/548, macOS 547/547, with unchanged four/four/five skips and 329 commands per platform.
All three affected resolver scenarios pass on each platform. Origin/dev is fetched at the merge, and the merged
tree equals the reviewed head byte-for-byte before this completion edit.

Merge evidence: `tmp/issue/ORF-T3-merge-pr-final.json`, `ORF-T3-merge-ci.json`, `ORF-T3-merge-codeql.json`,
`ORF-T3-merge-previous-dev-result.json`, `ORF-T3-merge-result.json`, `ORF-T3-merge-dev-result.json`,
`ORF-T3-merge-dev-arm.log`, `ORF-T3-merge-dev-linux.log` and `ORF-T3-merge-dev-macos.log`. The original interrupted
and failed scoped runs remain retained; no failed selection or job is retried. No full run, manual all-terminal
run, deadline change, branch promotion, release or next-task implementation is performed in this merge stage.
This completion record is carried onto the next branch; ORF-T4 build is next.
