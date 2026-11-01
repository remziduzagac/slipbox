---
status: doing
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
captures, body audit and controlled ancestor probes. The split remains a local checkpoint, unpublished; no fresh
review, merge, full-suite/all-terminal run, product change or compiled-product probe was performed.
