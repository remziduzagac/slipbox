---
status: review
assignee:
blocked_by: [ORG-T19]
created: "2026-10-26"
---

# ORG-T20: TUI editor test split

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Move editor/input/source/lens scenarios from tui.test.ts into tests/tui areas. Preserve hooks, titles and snapshot
identity; leave unrelated scenarios untouched.

### Issue coverage and ownership

Use tui/documents and shell/input test owners. Preserve buffer/undo ownership and existing edit/save behavior; the
autosave Git-lock baseline failure is recorded, not silently accepted as a passing migration comparison.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.

## Implementation and verification (2026-10-27)

Baseline: ORG-T19. The [split manifest](../manifests/t20.json) maps editor/input/source/lens scenarios to 37 files under
`tests/tui/documents/` and `tests/tui/shell/input/`. The residual `tests/tui.test.ts` retains unrelated workspace,
feature and screen journeys for T21/T22; it is an explicit split destination, not a retired path in this phase. No
product, worker, build-entry, asset or shipped-text change is introduced.

- The complete original collection's 797 literal leaf calls retain full parent/title identities and normalized bodies,
  including assertions and hooks: 204 move to these owners and 593 remain. The parameterized escape case runs twice, so
  the selected runtime count is 205. The baseline has 3,614 declarations; 42 named duplicated parent wrappers make the
  expected split 3,656. Only wrappers are appended to a separate expected snapshot for the migration check; the raw
  baseline is untouched. All 1,955 source/script edges, runtime worker edges and build entries agree. No snapshots exist
  in the original collection.
- Before: the selected parent/case filter on `bun test tests/tui.test.ts -t <editor-input-filter>` passes 205 tests and
  1,916 assertions, leaving 593 cases filtered out. After: all 37 owners in separate Bun processes pass the identical
  205 tests and 1,916 assertions. The combined 37-file single-process run passes the same counts. Fixture parents are
  fresh marker-free `/var/tmp` folders with `NO_COLOR` unset.
- Each owner calls the existing `makeSandbox()` at file scope, retaining the TUI harness's file-owned cleanup, XDG and
  clipboard policy and file-local UNIT_TIMEOUT_MS default. No extra timeout calls or trust resets are introduced; the
  timeout guard map is unchanged. Shared suite preambles remain identical apart from the 39 explicitly listed unused
  cloned helper declarations. Imports are narrowed by runtime/type bindings and typechecked. Intentional spelling
  markers remain paired in both moved and residual scenarios. The largest new owner is 558 lines.
- Six editor/input cases from the mixed command collection are included: selection copy, conflict dismissal, timed
  command-prefix dispatch, missing text objects, final-line put/undo and confirmed replacement. Their original titles,
  assertions and callbacks remain unchanged. Five unnecessary `fixtures` to `./fixtures` changes in the residual file
  are reverted; migration and both distribution graph cases pass with the original literals.
- D239 discovers all 38 split destinations. Harness changes select all of them; input and editing changes still select
  the deep vim/insert owners. The unknown-path broad fallback remains. Distribution's import-graph and selector cases
  and the timeout-site guard pass. Module-relative imports, fixture/example paths, template-built paths and split path
  segments were checked. No old path or basename is retired yet, so the retained list is empty.
- `bun run test:terminal "source editor: relative gutter"` passes its single affected check. Typecheck, boundary, size,
  changed-file Biome, the tracked-file docs gate and direct Markdown checks pass. Source and terminal-harness behavior
  is identical to T18, retaining its worker/compiled evidence. No whole-suite or all-terminal run was made. Local raw
  captures, the exact selection filter, per-owner logs and body audits preserve the detailed commands and output.
