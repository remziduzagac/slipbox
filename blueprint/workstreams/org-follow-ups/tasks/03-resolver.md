---
status: doing
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

[ORG-T43](../../code-organization/tasks/43-measurement-and-build.md) already records this exact
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

## Retained autosave fixture failure; draft publication pending

The resumed `gnutimeout -k 10 300 bun run check` passes all static/docs gates (477 Markdown files, 1,739 spelt
files). Its 353-owner unit selection has no whole-suite fallback. All four resolver characterization cases pass,
as do the isolated stat fixture and controlled worktree-label case from ORF-T22.

The selection then fails `tests/tui/documents/saving/conflicts.test.ts:128`: the autosave Git-lock case expects
`ab\n` while the file contains `abc\n`. The log records one failed case and 1,871 pass lines before interruption,
with zero overflow warnings. These are partial observations, not a passing aggregate. The exact check process group
1447951 was stopped with SIGINT (exit 130); no test, failed selection or historical failure was rerun afterward.
Evidence: `tmp/issue/ORF-T3-resume-check.log:1890` (assertion), `:1900` (test identity).

This matches the retained [ORG autosave finding](../../code-organization/design.md#focused-verification), which
already traced the same assertion to cached ancestor-checkout discovery. The current fixture constructs App at
`conflicts.test.ts:115` before creating its own `.git`/lock at lines 124–125. Autosave uses
`src/tui/documents/saving/saving.ts:208`, and `src/tui/workspace/git/git.ts:79` prefers its cached checkout when
checking the lock. The host's `/tmp/.git` exists. All these source/fixture files are byte-identical to origin/dev;
the extraction changes candidate lookup only. The current failure was not instrumented or rerun to claim a fresh
causal trace; the matching historical trace and unchanged fixture establish the retained finding separately.

Recommend a separate test-only PR giving this autosave fixture its Git context before App construction, with a
controlled ancestor-checkout regression; preserve its title, assertions and deadlines. Resume ORF-T3's scoped
verification and publication after that prerequisite. No additional task, fixture fix, commit, push, draft PR,
fresh review or merge is included in this waiting record. The rebased extraction and both completion edits remain.
