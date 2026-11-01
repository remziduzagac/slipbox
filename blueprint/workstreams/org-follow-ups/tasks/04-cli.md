---
status: review
assignee:
blocked_by: [ORF-T3]
created: "2026-10-31"
---

# ORF-T4: Separate CLI dispatch from presentation

Issue item 1; ORG-T11 CLI follow-up.

## Scope

Characterize argument admission, dispatch order, text/JSON errors and exit codes before separating dispatch from
output/exit presentation in src/cli/cli.ts. Preserve behavior and remove its exact cap at or below 600 lines.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.

## Build plan

Branch `refactor/issue-170-cli` starts at dev `1af50dee` after ORF-T3's green dev push. The existing ORF-T3
completion record is carried unchanged. Extract output/exit presentation into `src/cli/output.ts`; `cli.ts` keeps
argument admission, command/root/session dispatch and its existing public exports. Help text, safe JSON encoding,
stream selection, warning/stale order, error classification and strict stdin decoding retain their exact policy.

Record the [extraction manifest](../manifests/t4-cli-extraction.json) before source edits. No tracked file or worker
entry is relocated, so there is no retired path or `git mv`. Add characterization before extraction, compare the same
focused owners and affected startup terminal check before/after, reconcile imports/declarations/entries, build the
package binary and probe source/compiled behavior away from source with isolated state. Remove the exact CLI cap
once below 600; retain the 500-line aim. Review and merge are separate stages.

## Extraction evidence

- CLI dispatcher: 609 → 407 lines; new output owner: 243. Both are below the 500-line aim. Removed only the CLI's
  609-line exception; five handwritten source caps remain, with the separate generated/test policies unchanged.
- `CliOutput` takes the existing Io plus JSON choice and only a Session's `stale`/`allWarnings` capabilities.
  It neither constructs nor owns a session; the dispatcher retains config/root/pointer setup, command lookup,
  argument checks, symlink probing and handler execution in their original order.
- Exact-byte audit preserves HELP, JSON_SCHEMA, safeJson and defaultIo, four admission helpers and five dispatch
  tables. Result/error blocks retain every syntax token and comment after receiver substitution. The root/session/
  handler/probe block is unchanged except its report-presentation call. Existing CLI exports remain available.
- Updated the current module map in blueprint/design/how-it-works.md. No user-visible behavior, command or documented
  invocation changes; no user-doc/changelog update is needed. No worker entry, URL, build setting, dependency,
  handler, fixture, snapshot, existing test/check name, assertion or deadline changes.

## Characterization and focused verification

- Five new pre-extraction characterizations cover parse/version/help/color/root/usage precedence, report admission,
  raw command recovery including malformed JSON flags, safe error encoding and missing/refused outcomes.
  The corrected baseline passes 39 tests / 404 assertions across five owners. The first new expectation mistook
  unresolved-link status/envelope; it was corrected against the unchanged handler, with the initial failure retained.
- Post-extraction selection includes every baseline owner and passes 48 tests / 465 assertions across seven owners.
  Four focused output tests exercise stream/warning/stale order, render escapes, successful nonzero returns,
  undefined-data omission, init's stale exclusion, error codes/data and failing stale reads, and debug policy.
  The existing history owner additionally exercises live/dead/malformed stale records.
- Identical startup refusal terminal scenario passes before/after: one check, three commands, two jobs,
  1.5 / 1.4 seconds. No TUI path moved, so no compiled-terminal relocation probe applies.
- Exact-base structural reconciliation: 3,007 → 3,011 static edges and 2,249 → 2,253 runtime edges, matching the
  manifest; zero unresolved/stale references and twelve unchanged entries. All 4,050 original declarations remain;
  six characterization declarations plus five focused-output declarations yield 4,061. Runtime SCC membership
  remains identical (sizes 2/5/8). Scoped reach retains all 99 original owners and adds only the two new owners,
  selecting 101 without a whole-suite fallback. Conservative terminal selection remains all; only the affected
  scenario is executed, never every terminal check. No reduced-scope or performance claim follows.
- Package build succeeds with all twelve original entries, 1,464 modules and unchanged root/autoload flags.
  Binary SHA256: `ad381b734c53c1c2a1604542927334bd6855a23c2ac201888d3e5b48ca522897`.
- Source and a copied compiled binary each pass thirteen isolated CLI probes away from source: info identity,
  read/render/help, version precedence, malformed-JSON admission, unresolved/ambiguous results, guarded write,
  invalid UTF-8 stdin, unsafe path errors and report-before-root behavior. No affected worker implementation,
  caller or entry moves; existing worker lifecycles remain unchanged.

The focused test commands use `gnutimeout -k 10 300`; the required scoped check uses `gnutimeout -k 10 900 bun run
check`. Test-bearing execution is sequential outside the sandbox, retaining ORF-T1's fixture-cleanup constraint.
Final scoped/static result, branch/PR and fresh-review handoff follow once complete; none is claimed green early.

## Build result and handoff

Required `gnutimeout -k 10 900 bun run check` passes typecheck, boundary, size, dependency/workflow gates, Biome and
docs, then all 101 selected owners: 691 tests, zero failures, 7,376 assertions, 172.86 seconds. No overflow warnings.
This is one completed scoped check, with no whole-suite fallback or failed-selection retry. The compiled-launcher
scenario also passes within that selection, including its existing worker-start checks.

Staged-new-file docs verification passes: 480 Markdown files, 1,746 spelt files and zero link errors. The exact
CLI export-name set is unchanged. Build artifacts and ignored command logs retain their recorded identity/results;
no product/terminal tests are repeated for the final evidence edits.

Branch: `refactor/issue-170-cli`, into `dev`; draft publication follows. Fresh review and merge are pending separate
stages. ORF-T4 remains review until merge; the preceding ORF-T3 completion record stays byte-identical to its saved
post-merge file. No ready marking, merge, promotion, release or next-task implementation is part of this build.
