---
status: review
assignee:
blocked_by: [ORF-T12, ORF-T28]
created: "2026-10-31"
---

# ORF-T13: Split export tests by feature

Issue item 2; ORG-T11 test ledger.

## Scope

Split tests/export.test.ts by format/picture export responsibility, preserving titles, assertions, hooks and snapshot
identities. Remove its cap at or below 1,500 lines.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.

## Build plan

Branch: `refactor/issue-170-export-tests`, from `origin/dev` at `aae897b4`. The preceding T12 dev push
[41307899497](https://github.com/remziduzagac/slipbox/actions/runs/41307899497) succeeds at that exact squash on
attempt 1; terminal jobs are skipped for test-only scope. T12's completion record is carried unchanged.

The [before-edit manifest](../manifests/t13-export-split.json) maps fourteen whole suites to eight owners: assembly,
each of five formats, picture assets and publication policy. Four support modules retain the original filesystem,
node, picture and document-reader mechanisms. Each owner retains the original XDG setup, PNG beforeAll and unit
default. No snapshots, product entry, worker, build setting or terminal check move.

Record the original focused baseline before git mv; compare exact suite/helper bodies, imports, declarations,
source graphs and D239 consumer selections after relocation. Remove only the export cap, update the timeout
inventory and current testing map, and run affected export terminal checks plus the bounded scoped check.

## Checkpoint and retained failure

The original export owner and timeout inventory pass 62 tests / 712 assertions in 7.41 seconds. Three affected
export terminal scenarios pass, four commands/two jobs. After relocation, the same selection retains all 62
identities but has 60 passes / two failures / 681 assertions in 8.27 seconds; this is not a passing comparison.
The failures classify loose Markdown files as notes in the publication and Markdown overwrite scenarios.

All fourteen suite bodies and the original helpers compare exactly after export/indent/path reversal. Source
graphs remain 3,131 static / 2,290 runtime edges, twelve entries and 4,086 literal declarations, no unresolved
references. Typecheck, Biome, sizes and docs pass after correcting missing/unused imports. Eight owners are
98–280 lines; the export cap is removed locally, five test caps remain. No original assertion or deadline changes.

A separate non-test probe creates an ancestor `.git` and reproduces the loose-file classification; without that
marker it returns NotAnExport. The exact ancestor present in the failed test process was not captured. The
publication code and root discovery are unchanged; the fixture assumes its temporary ancestors have no marker.
Retain this failure and finish a separate test-only isolation prerequisite under the standing host-fixture rule
before resuming relocation verification. No unrelated failed selection is repeated or passing aggregate claimed.

Private evidence: `tmp/issue/ORF-T13-before-unit.log`, `ORF-T13-after-unit.log`, before-terminal log, structural
captures, body audit and controlled ancestor probes. The split was retained as a local checkpoint, unpublished,
before the separate fixture prerequisite.
No passing after-comparison was claimed for that checkpoint.


## Resumed build after the fixture prerequisite

[PR #191](https://github.com/remziduzagac/slipbox/pull/191) merged ORF-T28 at
`9f975f5977018c16edb91ddd2bb616ed3ce5de77`. Its
[automatic dev push](https://github.com/remziduzagac/slipbox/actions/runs/41310467440) succeeds at that exact
squash on attempt 1; terminal/status jobs are skipped for this test-only scope. The unpublished split is rebased
onto that base. T28's completion record is carried byte-identically; T12's completion is already in the base.

The shared export fixture now delegates environment and marker setup to the unchanged `export-sandbox.ts` from
T28. Its original PNG beforeAll, live binding, root helper and staging/disposal helper retain their bodies. Each
of the eight owners registers its original unit default and fixture once. T28's ancestor regression names the
relocated publication and Markdown owners with the same two-case filter, assertions, environment and deadline.

The manifest retains the original checkpoint ranges and records ranges against the corrected 1,619-line base.
Independent body comparison preserves all fourteen whole suites (1,277 body lines), including computed cases,
strings, comments and assertions. The original 64 imported binding/target pairs remain, all new imports resolve,
and support bodies match after dedenting, export modifiers and the real WebP fixture path reversal. The sandbox
helper is unchanged. Reversing the ancestor reader, timeout inventory and cap removal reconstructs each base file
byte-for-byte. Audit: `tmp/issue/ORF-T13-resume-body-audit.py`, its JSON and log.

The corrected baseline from T28 is 63 tests / 717 assertions / zero failures, including the ancestor regression
and timeout inventory (8.93 seconds). The relocated equivalent passes the same 63 tests / 717 assertions across
ten owners (8.29 seconds). The earlier 60-pass/two-failure result remains retained; it is not a green comparison.
Removing only the reader adaptation once makes the existing ancestor regression fail at its nested exit-code
assertion after three assertions. The fixed file is restored byte-for-byte, then included in the passing selection.
Logs: `tmp/issue/ORF-T13-resume-reader-negative.log` and `ORF-T13-resume-after-unit.log`. No limit changes.

Source capture preserves exactly 3,131 static and 2,290 runtime edges, twelve build entries and all 4,087 literal
declaration identities, with no unresolved or stale path. For all ten measured export source paths, every other
consumer is retained and only the retired export owner is replaced by the eight actual new consumers. Terminal
selectors remain `export`; shared integration reach is retained. The PR selects exactly eleven owners: the eight
relocated owners, ancestor regression, size guard and timeout inventory, with no terminal selection or fallback.
Full deltas are in the manifest and `tmp/issue/ORF-T13-resume-structure.json`; no logical-scope reduction is claimed.

The same three affected export terminal scenarios pass, four commands / two jobs / 3.8 seconds; the corrected
before-state evidence from T28's fresh review is three checks / four commands / 3.7 seconds. These observations
are not a speed comparison. Log: `tmp/issue/ORF-T13-resume-terminal.log`.

Eight owners measure 97–283 lines; the current 1,619-line export cap is removed, leaving five legacy test caps.
The original git mv is a separate local move commit; explicit `git diff -M15% --summary` identifies the assembler
relocation at 17 percent similarity. The lower threshold makes the one-to-eight split visible; default rename
detection alone cannot represent it. No snapshot is regenerated or moved. Current testing ownership and both
live readers are updated. Product source, workers, assets, build entries, dependencies, terminal bodies, CI and
deadlines are unchanged; preceding compiled-product evidence remains applicable to this test-only relocation.

Standalone typecheck, Biome, boundary and size pass. The required
`gnutimeout -k 10 900 bun run check` passes every static/docs gate and exactly eleven reached owners:
71 tests / zero failures / 757 assertions / 8.53 seconds unit time / 18.055 seconds whole command. No overflow
warnings or fallback. All 63 corrected before/after executed identities are retained; only the eight size-guard
cases supplement that selection. Docs: 483 Markdown / 1,814 spelt files / zero link errors; Biome: 1,209 files.
Evidence: `tmp/issue/ORF-T13-resume-check.log`, result JSON and verification-summary JSON.

The first scoped-check attempt stops before tests because the disposable baseline archive beneath `tmp/issue`
exposes intentionally invalid example projects to TypeScript. The structural comparison had already completed;
removing only that owned archive restores the normal typecheck inputs. Its log and result remain as
`tmp/issue/ORF-T13-resume-check-archive-contamination.log` and result JSON. No product or test correction, failed
unchanged test selection or historical failure retry is involved. One new long evidence line is wrapped too.

Fresh review and merge remain separate stages. No user-visible behavior or command/documented path changes,
so no user-doc or CHANGELOG edit is needed.


## Draft publication

Draft [PR #192](https://github.com/remziduzagac/slipbox/pull/192) is open into `dev` on
`refactor/issue-170-export-tests`. Rebased move/split commits are `e0e44878` and `5616642b`; completed build
evidence is `6096eabf`. The documentation-only publication record follows those commits. The required scoped
check and three affected terminal checks pass as recorded above; no source or test change follows that validation.

Final staged-record docs and Biome checks pass: 483 Markdown / 1,814 spelt files / zero link errors / 1,209 linted
files. T28's completion remains byte-identical. All original failures and the reader control are retained.
Final-head CI is pending and is not claimed green. Fresh review and merge remain separate requested stages;
keep the PR draft and stop at the build handoff. No full-suite/all-terminal run, deadline/dependency/CI change,
branch promotion, release or next-task implementation is included.
