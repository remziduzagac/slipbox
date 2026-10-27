---
status: review
assignee:
blocked_by: [ORG-T21]
created: "2026-10-26"
---

# ORG-T22: TUI screen and journey test split

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Finish tui.test.ts relocation with navigation/screen/overlay/settings/journey scenarios. Keep full-App journeys. Compare
complete test identity inventory; retain no residual historical review bucket.

### Issue coverage and ownership

Use windows, documents/navigation, shell and app test owners. Retain current tabs-containing-views and session tests;
new windows-containing-tabs acceptance belongs to its separate workstream.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.

## Implementation and verification (2026-10-27)

Baseline: ORG-T21. The [manifest](../manifests/t22.json) maps the remaining broad TUI model collection to 53 owners and
relocates the focused header and permanent-location suites. Tests follow app windows/session/watch/config, shell
screen/terminal/overlays, document views/scratch and navigation subareas. There is no residual broad collection or
historical review owner bucket. Existing historical parent titles remain intact as test identities. Full-App journeys
retain current tabs containing views, independent focus/positions and the TUI-owned buffer/write gate; no future
window/tab hierarchy is implemented.

- All 206 split leaf callbacks keep complete parent/title identities and normalized bodies, including assertions and
  hooks. Both intact moves also compare equal after resolving imports and filesystem bases. The raw baseline has 3,707
  declarations; 23 explicitly named duplicated parent wrappers make the expected split 3,730. No leaf identity is added,
  lost or renamed. A separate expectation adds only wrappers to the immutable baseline. All 1,955 source/script edges,
  runtime worker edges and build entries agree. These suites have no snapshot calls or snapshot files.
- Before: `bun test tests/tui.test.ts` passes 206 tests/2,554 assertions, the header file 44/252 and the location file
  7/70. After: the 55 owners in separate Bun processes pass 257 tests and 2,876 assertions; the combined 55-file process
  gives the same 257 tests and 2,876 assertions. Counts are measurements on this host; identity/body comparisons
  establish preservation independently of polling-related assertion variation. Runs use fresh marker-free `/var/tmp`
  parents with NO_COLOR unset before Bun starts. No intermittent failure occurred, and no timeout, assertion or scenario
  is weakened.
- Every split owner registers the existing makeSandbox at file scope. The model harness retains its XDG/clipboard,
  file-local UNIT_TIMEOUT_MS and cleanup policy. No timeout site is added or relocated, so the guard map is unchanged.
  The 13 unused declarations from cloned historical fragments are listed exactly; retained shared preambles and the
  notebook's placedColumn helper are unchanged. The largest split owner is 996 lines, below the 1,000-line aim.
- Rendered tree labels, expected text and fixture-file bodies are kept byte-identical, including the repaired code-wrap
  inputs from T6/T18. Actual module-relative imports, fixture/example bases and the header loader's repository cwd are
  rebased to preserve their targets. The loader's template-built module map and its title/assertion text are unchanged.
  No blanket rewrite of path-looking fixture data is used. The source/code examples from OpenTUI's width check resolve
  from the new terminal owner.
- D239 discovers all 55 nested owners and removes the retired root from its graph. Harness changes reach every owner;
  Git branch changes still select the deep branch-panel suite and the full-App tab journeys. The existing repository
  membership assertion in distribution follows the actual Git-branches owner, replacing its retired broad filename; this
  is a live repository reference, not rendered fixture data. The unknown-path conservative fallback remains, and App's
  integration closure is not hidden. Both graph/selector fixtures, the actual repository-selection case and the
  timeout-site guard pass. Full paths, changed basenames, split segments, template-built paths and import.meta targets
  are checked; historical references have an exact retained list.
- `bun run test:terminal "pinned tabs: a link from a pinned tab"` passes its single affected check.
- Current testing/adapter documentation, benchmark/model-harness comments and export/render/terminal coverage references
  name the feature owners. The terminal exemption retains its complete original reason text with only the referenced
  test path changed; its coverage test passes. No product source, worker entry, asset or shipped installer/skill
  changes. Worker/compiled behavior retains T18's evidence for the identical product tree. Typecheck, boundary, size,
  tracked-file docs, changed-file Biome and direct Markdown gates pass. No whole-suite or all-terminal run was made; raw
  captures, filters, per-file/combined logs and body audits retain the detailed output.
