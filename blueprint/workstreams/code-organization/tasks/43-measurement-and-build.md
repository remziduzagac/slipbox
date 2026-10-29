---
status: review
assignee:
blocked_by: [ORG-T42]
created: "2026-10-26"
---

# ORG-T43: Scoped measurements and build reconciliation

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase gates](../design.md#phase-sequence-and-review-gates) and [move
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

- T25: pointers' “written across folders that don't travel together …” depends on ancestor Git markers. Private
  no-marker/marker/no-marker controls pass/fail/pass; isolated TMPDIR gives 5/5 at both revisions. Keep its host
  assumption separate from Graph extraction results; any fixture fix needs an ancestor-marker regression.

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

## Measurement protocol

The before tree is the published ORG-T23 task, preceding the controller/mechanism extractions. Physical contents of
source, tests, scripts, packages/lockfile, preload, grammars, skill and examples match that published tree, including
ignored fixture data. Both measurements use disposable ordinary repositories; their synthetic indexes omit the same
four ignored-but-tracked fixture files, which remain physically present and byte-identical. The after tree is ORG-T42.
No linked-worktree discovery or installed host skill is used as a timing baseline.

For each mapped path, `scripts/ci-scope.ts` computes the actual selection against its own tree. Reject a whole-suite
fallback. Each selected unit file runs in its own Bun process, sequentially, with a 240-second external per-file
bound. The two initial completed baselines have 900-second external case bounds; after the regex baseline exceeded
that bound, the remaining cases use 1,800 seconds. Existing test/product deadlines are unchanged. Both sides use the
same per-file protocol, fresh HOME/XDG/TMPDIR per case, the existing preload and identical source dependencies;
process/filesystem caches and the shared host are not controlled. Record full completed wall time, tests, assertions,
skips, warnings and any failing file. Per-process execution avoids retaining all test fixtures/timers in one Bun
process. It is not the earlier single-process research timing method.

A first single-process location baseline was killed with exit -9 after 242.829 seconds, without a completed summary.
The next incomplete combined attempts were stopped before the per-file comparison began. These are excluded timing
samples; no speedup or passing-scope claim follows from them. Earlier ORG-T24 completed comparisons remain historical
observations, with their single-process method and warning output, rather than a substitute for the final comparison.
Terminal selection is reported separately from explicitly executed representative feature checks. An `all` terminal
selection is retained as conservative scope evidence; this task does not run every terminal check.

The first per-file regex baseline also reached its 900-second external case bound after 101 selected files; it
includes one 30-second CLI-search test deadline failure. Common files ran several times slower than during the
preceding export baseline, so no speed comparison uses that partial sample. Reruns use a 1,800-second external case
bound; this changes the observation allowance, not the application's or tests' deadlines.

## Dependency and build audit

Repeated Madge **8.0.0** uses the research's `ts,tsx`, tsconfig and source-only settings, then its separate
`skipTypeImports` configuration. The graph includes dynamic imports and seven resolved assets; it is an import model,
not a proof of eager initialization failure or worker lifecycle behavior.

| Graph | Research nodes / edges | Current nodes / edges | Nontrivial SCC sizes |
| --- | ---: | ---: | --- |
| All imports | 335 / 1,911 | 564 / 2,946 | 2, 2, 3, 5, 42, 140 |
| Runtime approximation | 335 / 1,581 | 564 / 2,202 | 2, 5, 8 |

Research runtime SCCs were 3, 3 and 64; the remaining 2/5/8 memberships are recorded in the reconciliation manifest.
The two-module component is Git remote/rebase coordination; five modules connect App/settings/history/session/vault
wiring; eight connect action registration with its area handlers and shared `withView`. These remain composition
feedback, not lower primitives. Type-only components are larger after extraction because explicit contracts preserve
existing owner relationships. No claim that all cycles disappeared, or that larger type SCCs cause runtime faults, is
made. Core/CLI/TUI/OpenTUI and worker-only diagram boundaries still have their enforced gates.

The same `ci-scope.ts` graph-node method finds no App in any of six focused primitive/controller test closures.
Editable/header-layout stay at three/four nodes; new operation-status/focus tests reach ten/two. Atomic-files and
reach-policy increase from 61/62 to 111/112 graph nodes as the same core owners become smaller files; their reached
source lines change from 18,026 to 17,907. This is no additional logical-scope reduction. The earlier T9 removal of
App remains, while these helpers still depend on substantial core configuration/vault policy. Broad integration
selection is retained under D239 rather than weakened to make the measured scopes smaller.

The migration scanner separately includes scripts and explicit worker URLs: 2,984 static and 2,231 runtime import
edges, with no unresolved reference. Its denominator differs from Madge's source graph. All twelve build entries and
eleven literal worker URLs resolve. A final live-reference scan checks 1,735 files against all move/rename manifests
and finds no stale reference after five exact retained DATA/comment entries. Those are the user-project skill example,
the stable replace-suite label, the shipped installer comment and the two width-sensitive tree labels. All 2,391
literal runtime imports across 554 test/fixture files resolve; template and split-segment loaders are checked
separately, including the seven-module header loader. The explicit worker edges are recorded separately; their absence
from Madge alone would not establish dead workers. Generated server locks pass the offline pinned-key/generator
verification.

All eleven real worker clients pass from source and a compiled probe: walk/list, backlinks, parse, syntax, spelling,
regex, paint, image decoder, diagrams and export, including nested export/diagram execution. The full application
compiles all twelve entries (1,458 modules), starts, reports 0.5.1 and serves help. Existing grammar runtime/ABI tests
exercise every configured grammar. The seven source-graph assets have recorded sizes/hashes. Installer template,
shipped skill and render snapshot bytes match the T1 squash; the width-sensitive LONG_ONE/LONG_TWO/COMMAND fixture
expressions remain byte-identical after their test move.

## Test and finding reconciliation

One corrected literal-declaration scanner measures both T1-squash and final trees: 3,562 to 4,016, with 460 additions
and six removals. Of the additions, 217 are suite declarations and 243 are leaf declarations. The six removals are
fully accounted for: two compound CLI export tests become suites with their original names and focused leaf cases; the
CLI runtime-call guard becomes the process-scenario guard; two CI scope/record tests and their surrounding suite
change with the approved terminal-on-push policy. No unexplained literal declaration disappears. Computed cases and
hook/assertion fidelity still rely on the per-task body audits and executed tests, not on the scanner alone.

The final clone scan repeats jscpd **5.4.2**, minimum ten lines/seventy tokens, TypeScript, both original scopes. It
finds four source pairs/55 cloned lines and 183 source-plus-test pairs/3,141 cloned lines. Pair endpoint multisets
match T40; its worker-policy comparison and all retained clone dispositions remain applicable. Source now scans 531
sources / 99,630 lines; combined scans 1,081 sources / 215,521 lines. Tool denominators differ from the size
inventory. The increased test scaffolding is explicit, not presented as reduced duplication.

Final entry-aware Knip **6.43.0** has zero unused-file, binary, dev-dependency and duplicate-alias findings, with 194
export, 84 type and six unlisted-type-reference findings retained explicitly. T42's direct compiler-hook tests now use
three previously reported callback exports; none was removed. No new candidate appears relative to T41's dispositions.
The type-only hast/unist package ownership follow-up remains separate, without dependency changes. Knip remains a
diagnostic with nonzero exit status for retained candidates, not a fabricated clean gate.

All 55 original size-inventory rows map to an existing owner. T11 owns the 600-line final ratchet, cohesive 500–600
assessments, exact remaining caps and named follow-ups. This measurement phase does not claim all files meet 600 or
perform another unreviewed extraction. T40/T41/T42 retain policy differences, source API candidates and incompatible
casts with explicit reasons; folder movement is not their completion evidence.

## Gateway-to-owner reconciliation

The manifest maps every T44 sketch to current implementation/client/test paths: link resolution; save; rename planning
and application; Git status and staging; search; export preparation/publication. Each extracted responsibility has its
existing caller and focused mechanism/characterization coverage; compatibility facades re-export the implementation
rather than duplicate it. Current callers remain direct and no gateway execution, socket, routing or retained request
store is installed.

The TUI remains owner of NoteBuffer text, undo, revision, saved baseline and interactive view/pane state. App remains
the sole TUI note-write gate. Pure editing/layout helpers can be called directly. Future application operations must
capture explicit targets/content, validate authority/staleness and reconcile completion against the same client
lifetime and buffer revision; synchronous extraction alone supplies none of those new delivery guarantees.

ENG's engine-owned document/undo/baseline model remains a conflicting draft alternative. The T44 reconciliation keeps
the approved TUI-owned-buffer model authoritative for this preparation, adopting compatible lifecycle principles only.
ENG records are unchanged. Gateway scheduling/thread isolation, transport authority, request correlation/retention,
partial effects and cancellation after publication remain next-stack implementation work. #56 remains excluded.


## Issue coverage and remaining scope

The issue's numbered requests are reconciled with evidence, not inferred from a folder move:

| Wanted item | Evidence and disposition |
| --- | --- |
| 1: analysis | Research plus repeated dependency, clone, unused, type/error and size inventories |
| 2: feature folders | Core/TUI roots: 149/95 files to zero/zero; largest source folder: 149 to 16 |
| 3: responsibilities | T24–T39 extractions; all 55 inventory rows mapped; final caps remain T11's gate |
| 4: shared repetition | Shared helpers and source clones 93 to 55 lines; retained policy differences have reasons |
| 5: patterns | T40 worker comparison, existing lazy export strategy, explicit TUI collaborators and capabilities |
| 6: other improvements | Enforced lower boundaries, isolated focused tests, worker/assets/compiled-build verification |
| 7: feature tests | T8/T19–T23 owner splits; preserved bodies and mapped runs expose retained integration reach |

Folder counts compare the T1-squash tree with the final tree; they differ from the issue's earlier historical
snapshot. The location and regex selections retain every old unit file and add focused owners. Export's selection
drops only `tests/html-export.test.ts` after T39 puts UTF-8 encoding below dispatch, and adds three focused owners;
shared export integration stays selected. Terminal selectors are unchanged: all/export/all for the three cases. The
manifest gives the exact added/removed file sets. The whole application model remains shared integration coverage. A
change consumed by App can still reach that harness, and CLI dispatch keeps its dynamic TUI import in conservative
D239 discovery. Splitting files alone does not remove those dependencies; these measurements do not claim every
feature change now selects only a tiny unit set or runs faster. New focused collaborators avoid constructing App, but
many existing scenarios intentionally remain integration journeys. Further migration of suitable scenarios to focused
contexts, with equivalent assertions and retained shared journeys, is a coherent testing follow-up; suppressing
dynamic imports or App from selection is not its implementation.

The runner's incomplete shared-process samples and clock-arithmetic warning ledger justify a separate bounded-group/
fixture-lifetime assessment before changing CI execution. This task records completed per-file observations rather
than changing CI policy, increasing test budgets or investigating product loading/memory under #56. The issue itself
is not closed by this evidence record; final accepted caps and explicit outstanding work remain visible in T11.


The ORG-T42 dev run's macOS unit job exceeded the unchanged 30-second deadline in the Git locale/output-bound fixture;
subsequent merge/rebase assertions failed in that run. A single retry passed with no code change, including the
aggregate CI check. All three terminal platforms passed on the initial attempt. This remains an intermittent test
deadline finding with unproven cause, separate from the completed local comparisons and the type-only extraction.


## Completed scoped comparisons

| Case | Before files / passes / seconds | After files / passes / seconds | Assertions before → after |
| --- | ---: | ---: | ---: |
| Location | 259 / 1748 / 407.224 | 262 / 1771 / 408.165 | 16,323 → 16,827 |
| Export stream | 315 / 2180 / 548.459 | 317 / 2198 / 439.506 | 20,072 → 20,560 |
| Regex | 312 / 2100 / 422.884 | 317 / 2134 / 449.623 | 19,322 → 19,866 |

Every completed row has zero failures and two unchanged walk-thread skips. No timeout-overflow warning appears in
these per-file runs; that does not resolve the separate shared-process clock-arithmetic finding. Assertion totals are
host measurements; declaration/leaf identity and per-task body audits establish preservation, rather than equality of
host-sensitive assertion totals.

All twelve representative terminal checks pass: two location-bar scenarios, regex/whole-word toggling, export
publication cancellation, write refusal/cleanup and PDF command entry, once per revision. The full terminal selector
remains all/export/all; executing these feature checks is not a claim to have run every terminal check.

The earlier CLI-search deadline failure is not reproduced in the completed regex baseline or in five focused runs
per revision (five/five pass on each). Its cause remains unproven; no timeout or product code is changed. These are
single completed comparisons on a shared host with uncontrolled caches and expanded coverage, not a causal speedup
claim or a controlled performance benchmark.

The [reconciliation record](../manifests/t43-reconciliation.json) retains exact selections, per-file outcomes/times,
external bounds, graphs/SCC membership, immutable-data hashes, build/worker checks, findings and the gateway owner map.
It excludes incomplete samples from the completed table. All static/docs gates and the focused organization fixtures
must pass before publication.
