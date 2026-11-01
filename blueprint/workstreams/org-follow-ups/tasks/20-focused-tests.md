---
status: review
assignee:
blocked_by: [ORF-T19]
created: "2026-10-31"
---

# ORF-T20: Move suitable scenarios to focused tests

Issue item 6; ORG-T43 scoped comparisons.

## Scope

Identify App-wide scenarios needing only a collaborator, move them to focused contexts with equivalent assertions and
retain whole-application journeys. Measure conservative D239 reach before and after using the T43 protocol, recording
exact selected files, dependency closures, test identities and completed bounded runs. Hide no App or dynamic-import
edge to reduce a selection. Use child tasks for independent migrations if necessary.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.

## Characterization and plan

Baseline: `703b60e9` on `refactor/issue-170-focused-tests`. Mixed App owners contain independent matching, key
decoding/bindings/help, breadcrumb layout, rendering configuration, source-fence layout and regex-worker cases.
Move sixteen leaf cases into their focused feature owners, preserving suite titles and assertions; keep the shared
keyboard, drawing, configuration, replacement and worker-delivery journeys with App. Configuration loading needs only
a temporary config file, replacing its unrelated App/vault setup. Worker cleanup remains local to both worker owners.

Record exact source/destination paths and titles before extraction in `manifests/t20-focused-tests.json`.
These are partial extractions, with no retired filename, whole-file relocation or source change. Existing focused
owners receive the cases except for the new core regex-worker owner. Compare D239 selections and dependency closures
without changing App, dynamic-import or worker edges; execute comparable affected owners in separate bounded Bun
processes, retaining broad selections as reach evidence distinct from the tests actually run.

## Implementation and reach

The [manifest](../manifests/t20-focused-tests.json) records all sixteen leaf moves, exact selected files, dependency
closures and test identities. Existing filenames remain because they retain shared journeys; these are partial
extractions rather than tracked-file relocations. Review `git diff -M` and its summary against that map. No selector,
source, worker URL, entry point or fixture path moves. Historical ownership manifests keep their original paths.

The migrated cases' closures shrink from 534 nodes to 9 (matching), 8 (keys), 5 (breadcrumb), 25 (config), 22 (source
layout) and 13 (regex workers), counting the owner and all nodes reached by `importGraph()`/`reach()`. Each focused
owner is independent of App, the model harness and drawing composition; the expanded organization guard checks this.
App-linked journeys deliberately retain their 534-node closures. Configuration loading now writes its file in the
existing core sandbox, with the same values and assertions. The regex owners each retain local worker cleanup.

| Changed source | Selected files before → after | Literal leaf declarations before → after | Terminal selection |
| --- | ---: | ---: | --- |
| `tui/shell/screen/topbar/where.ts` | 268 → 268 | 1,762 → 1,746 | all |
| `core/rendering/export/stream.ts` | 330 → 330 | 2,186 → 2,170 | export |
| `core/workspace/search/regex-jobs.ts` | 323 → 324 | 2,123 → 2,114 | all |
| `tui/app/runtime/app.ts` | 267 → 267 | 1,758 → 1,742 | all |

Paths in the table are relative to `src/`. These are conservative D239 selections, not executions of those broad
scopes. The exact before lists and after deltas reconstruct each selection. Literal declarations are a static count,
not expanded parameterized test counts. Location/export/App changes reach sixteen fewer independent scenarios while
retaining the same files; regex retains its seven migrated worker cases in one new file and drops nine unrelated
scenarios. No claim that every feature change has a small selection follows from these migrations.

## Verification

Affected owners run sequentially, one Bun process per file, with the existing preload and 30-second unit default,
a 300-second external per-command and batch bound and ten-second kill grace. Each file gets fresh sibling HOME and
TMPDIR directories under `/var/tmp`, fresh XDG roots and the same color environment. The shared host and filesystem
caches are uncontrolled; these completed observations are not a causal speedup measurement.

| Revision | Owners | Pass / fail | Assertions | Seconds |
| --- | ---: | ---: | ---: | ---: |
| Before | 12 | 83 / 0 | 3,471 | 11.555 |
| After | 13 | 83 / 0 | 3,471 | 11.728 |

Sorted full suite/leaf names compare equal for all 83 executed tests. No snapshots belong to these owners.
The first measurement launcher nested TMPDIR under HOME, causing two config warning-path assertions to receive
abbreviated paths. That incomplete sample is excluded; correcting the launcher's directory arrangement requires no
repository fixture or assertion change. Both completed comparisons have zero timeout-overflow warnings.

The expanded focused-owner isolation guard passes. Six affected terminal checks pass with
`SLIPBOX_TERMINAL_JOBS=2`: regex/whole-word toggling, switcher matching, which-key groups/titles, and its retained
header interaction. Typecheck, lint, boundary and size checks pass, with no handwritten source or test caps remaining.
Logs: `tmp/issue/ORF-T20-{before,after}-*.log`, `ORF-T20-isolation-guard.log`, `ORF-T20-terminal.log` and
`ORF-T20-{typecheck,lint,boundary,size}.log`.

The required `TMPDIR=/var/tmp gnutimeout -k 10 900 bun run check` passes: all static/docs gates and 87 tests across
14 files, with 4,066 assertions. The selection contains the thirteen migration owners and the four organization
guard cases. Log: `tmp/issue/ORF-T20-check.log`. Title/destination and stale-import checks pass; `git diff -M --summary`
shows only the new manifest and focused worker owner, with no retired filename.
