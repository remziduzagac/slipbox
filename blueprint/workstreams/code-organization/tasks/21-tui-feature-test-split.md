---
status: review
assignee:
blocked_by: [ORG-T20]
created: "2026-10-26"
---

# ORG-T21: TUI feature test split

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Move explorer/panels/git/search/diagnostics/media scenarios from tui.test.ts and relocate existing focused suites by
owner. Preserve all assertions and fixture lifetimes.

### Issue coverage and ownership

Use workspace/document/shell test owners from the design. Share setup only when lifetime and policy agree; preserve
shared integration coverage. Record clone dispositions for ORG-T40.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.

## Implementation and verification (2026-10-27)

Baseline: ORG-T20. The [manifest](../manifests/t21.json) maps four split collections and 18 intact focused-suite moves.
There are 121 affected feature owners: workspace explorer/vault/search/Git, document navigation/tools/export/search/
diagnostics/media, shell tools and the pure platform/graph/reach cases from the mixed peek collection. The residual
`tests/tui.test.ts` retains screen, presentation and full-App state journeys for T22. Product source, workers, build
entries, assets and shipped installer/skill text are unchanged. The reference-set catalog changes only its moved marks
suite reference. Comment paragraphs are reflowed to 120 columns without changing executable bodies.

- Complete identities and normalized callbacks/assertions agree for the broad collection's 593 literal leaf calls (387
  moved, 206 residual), all 300 calls in the three split focused collections, and the 18 intact moves. The 979 selected
  literal calls expand to 983 runtime cases, including two existing skips. The global raw baseline has 3,656
  declarations; 51 named duplicated parent wrappers make the expected split 3,707, with no leaf renamed, added or lost.
  A separate expectation adds only wrappers to the immutable baseline; all 1,955 source/script edges, runtime worker
  edges and build entries agree. No snapshot calls or files occur in these collections.
- Before: the selected feature filter on `bun test tests/tui.test.ts -t <feature-filter>` passes 387 tests and 4,012
  assertions; each of the 21 original focused suites runs separately, totaling 594 tests, two skips and 3,812
  assertions. After: all 121 owners in separate Bun processes total 981 tests, two skips and 7,824 assertions. The
  combined 121-file process also passes 981 tests, two skips and 7,824 assertions. Marker-free `/var/tmp` fixture
  parents and `NO_COLOR` unset are used throughout. Assertion totals are measurements on this host; walk-thread has
  expectations inside time-sliced loops, so totals can vary across hosts/runs. Preservation is judged by declarations,
  runtime tests, leaf identities and normalized callbacks, rather than assertion totals alone. No assertion, timeout or
  scenario was weakened. The combined run emits Node TimeoutOverflowWarning output from a language-server child; its
  cause is unclassified, with no failing assertion.
- The generic model sandbox still applies its original file-local UNIT_TIMEOUT_MS and XDG/clipboard cleanup. There are
  no new timeout sites. The Git-panel factory retains the original saved-environment restoration, custom App/canvas
  harness, afterAll hook and Git fixtures; its twelve owners register it separately. The peek factory retains the
  original model sandbox, worker-factory capture and afterEach mock reset for its eight owners. AST comparisons confirm
  both factories' setup statements and helper bodies are unchanged apart from imports and their factory wrapper.
- Six peek owners keep the original local counter and twoVaults closure together: several cases increment that counter
  directly, so extracting its mutable state behind a different API would change the callbacks. All six closure bodies
  are unchanged. Read/parse/fake-thread helpers and mock restoration are shared; the counter closure is a deliberate
  fixture clone for ORG-T40's accounting. The 98 unused helper declarations from cloned broad-suite fragments are listed
  exactly in the manifest and removed with attached comments; retained preambles and hooks are unchanged. Pure cases
  separated from the mixed peek file retain its existing setup dependency until T9 lowers the generic fixture boundary;
  no dependency reduction is claimed for that intermediate state.
- Every new/split file stays below 1,500 lines. The largest affected owner is the intact walk-thread suite at 1,363; the
  largest newly split owner is the cohesive Git-panel row-stability group at 1,343. Auto-index, nested merge/rebase,
  branch/row stability and peek scheduling groups exceed the 1,000-line aim while preserving shared local fixtures and
  integration journeys. Their test ceiling differs from the source caps; no source cap changes.
- D239 discovers all 121 owners. The Git-panel and peek factories select exactly twelve and eight files respectively;
  the generic model harness still reaches all its integration owners. Backlinks and walk worker changes select the deep
  scheduling/walk owners, and unknown non-code paths retain the broad fallback. App's transitive closure remains broad;
  the file split does not fake narrower dependencies. Distribution's graph/selector cases and the timeout-site guard
  pass. Bare filenames, template-built imports, split path components and module-relative fixture/worker URLs are
  checked; intact-move bodies agree after resolving imports and filesystem bases. Historical references have an exact
  retained list, and only changed basenames are marked retired.
- `bun run test:terminal "marks: at a row's right"` passes its one affected check. Worker/compiled behavior retains
  T18's evidence because the product and terminal harness trees are identical. Typecheck, boundary, size, tracked-file
  docs, changed-file Biome and direct Markdown gates pass. No whole-suite or all-terminal run was made. Local captures,
  exact filters, per-owner/combined logs, helper provenance and body audits retain the detailed command output.

### Inherited fixture repair and stack verification

The residual code-wrap group initially fails the same four cases in five baseline and five current runs, with the same
11 scenarios selected each time. This is a fixture-data defect in earlier local moves, not a color/environment finding:
rewriting the sample tree's source labels changes their widths (the intended second line is no longer the longest).
Restoring the two original labels in T6 and T18, with exact rendered-input allowlist entries, makes all eleven cases
pass without changing any title, assertion or product code. Positive controls on the repaired T20 baseline and T21 tree
pass 5/5 runs each. The residual scenarios stay assigned to T22.

Controls unset NO_COLOR before Bun starts; the inherited shell has NO_COLOR=1, COLORTERM=truecolor, TERM=xterm-ghostty
and TERM_PROGRAM=herdsman, with FORCE_COLOR, CLICOLOR and CLICOLOR_FORCE unset. The fixture repair is independent of
color policy: the unchanged-width labels are the required input. Eight affected task tips are checked in clean archives
for both distribution graph cases, the eleven code-wrap cases, migration and size gates. Product source is unchanged.
The earlier 7,824-assertion run remains a measured record for the T21 selection; these eleven residual cases were not
part of that selection.
