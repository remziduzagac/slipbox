---
status: done
assignee:
blocked_by: [ORG-T24]
created: "2026-10-26"
---

# ORG-T10: App services and shared pane helpers

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Extract App clipboard serialization and notification timing without moving state ownership or duplicating writeBuffer.
Share only proven footnote/info/outline navigation; keep focus/close/pinning differences explicit.

### Issue coverage and ownership

Complete the pane-navigation and close/leave clone assessments in the coverage ledger; check focus and pinning before
sharing. Record retained differences explicitly. Assess App/watch/update/vault coordination by responsibility as
assigned in the size ledger; split further into coherent PRs before attempting unrelated controller extractions.

## Evidence required

Same owner tests and terminal checks pre/post; source-map/layout snapshots; disposal, cancellation, late reply,
saturation and cleanup tests for lifecycle changes. No universal queue.

## Implementation

- `src/tui/app/clipboard/clipboard.ts`: the existing serial promise, abort controller, eight-copy admission count,
  copy and paste bodies. App delegates its public methods and aborts at the original quit point. App retains the
  current vault, vim register, quitting flag and Host; no context snapshots, buffer ownership or write paths moved.
  OSC 52 remains immediate. Each helper uses the vault current when it starts; paste snapshots the register after
  preceding copies finish and before its clipboard read, exactly as before.
- `src/tui/app/notifications/toasts.ts` and `contracts.ts`: the same timer and message types, with App-compatible type
  re-exports. App retains history, visible toast arrays, four-toast admission, click deduplication and drawing
  suppression. The scheduler reads current arrays/clock, keeps 4/8-second lifetimes, first-drawn timing, the 10 ms floor
  and unref. Dismissal clears the timer. No new quit-time notification disposal policy is introduced.
- `src/tui/documents/tools/navigation.ts`: only down/up/top/bottom's identical selection assignments; the existing
  empty-list results, including `-1` for down/bottom, remain. Each tool still unpins, handles filter resumption and
  constructs rows in its original order before dispatch. The same callbacks and row side effects run.
- `PanelFocus.leave`, wired through Panels, shares the five identical content-focus/temporary-overlay transitions.
  Close continues through the existing `showSidebar`/`showOutline` methods. Leaving a wide pane keeps it visible;
  narrow/zen closes only its overlay. Selection, scrolling, filtering, folding and pinning stay feature-owned.
- The four new primitive modules cannot import App or existing composers, even for types. The boundary fixture
  exercises type imports, re-exports and dynamic imports. No gateway execution, scheduling framework, source moves,
  worker URL/build changes, shipped-artifact edits or product timeout changes.

## Clone dispositions

| Research pair | Outcome | Retained differences |
| --- | --- | --- |
| footnotes/info navigation | Shared `navigateRows` | Reference folds versus Info sections/properties |
| footnotes/outline navigation | Same helper | Source/hidden heading jumps and fold trees |
| explorer/history close/leave | Shared leave; existing close delegation | Distinct row models and selected items |

The right tools keep their existing jump behavior: footnotes can reveal a definition or reference; Info can follow a
tag, run a command, jump to a property or copy; outline handles hidden/source headings. Their existing filter and
pinning order is retained. No general scroll helper was introduced: viewport pinning, filtering, row derivation and
selection following remain distinct. Close changes visibility/focus through Panels; leave never changes wide
preferences. The same focus transition is shared across the left and right sides with an explicit side argument.

## Responsibility assessment

| Current owner | Lines | Disposition and rationale |
| --- | ---: | --- |
| `app/runtime/app.ts` | 1,366 | Private services extracted; state/write wiring retained |
| `app/runtime/watch.ts` | 666 | Graph-feed/index/reload owner; graph identity guards replies |
| `app/distribution/updates.ts` | 667 | Offer/restart lifecycle; quiet input and handover ordering |
| `workspace/vaults/vaults.ts` | 636 | Leave/enter transaction; ordered cancellation/reset |
| `shell/panels/panels.ts` | 519 | Retain width/filter/view positions; separate focus controller |

These are cohesive-controller assessments, not claims that every remaining body is primitive or meets 600 lines.
App's exact cap falls 1,454 → 1,366 (−88); the explorer cap falls 1,275 → 1,274 (−1). Neither is an import-growth reset.
App's remaining size includes public presentation-state contracts and feature construction, opening/layout and the
single write gate. Watch retains graph-identity checks, stopped/paused parse work, feed ordering, selection restoration
and conflict-aware reload; Updates retains quiet/answered offer ordering, detached-child ownership, reply cleanup and
restart refusal; Vaults retains one ordered release/reset/restore transaction. Their lifecycle rules are not equivalent
to clipboard serialization or notification timing, so none enters a shared queue or a generic App-shaped context.

T11 owns reconciliation with the final staged ceiling and exceptions. If further size work is required, each coherent
child PR needs its own extraction manifest and before/after owner checks: App presentation contracts/opening versus
composition; Watch background parsing/home refresh versus buffer reload/feed application; Updates installed-version
observation versus offer/restart handover; Vaults catalog/prompts versus the switch transaction. Those are assessed
boundaries, not permission to reorder lifecycles or silently defer a required final-ceiling gate. Further controller
extractions must be planned as those separate PRs before implementation.

## Verification

Baseline is the preceding ORG-T24 task tree in a clean archive. The extraction manifest is
[`t10-extraction.json`](../manifests/t10-extraction.json): exact static/runtime edge and declaration deltas, full runtime
SCC memberships, unchanged build entries, resource ownership and reverse-edge guard cohort. No files were moved and no
stale path exemptions are needed. All existing declaration identities remain; new tests only characterize these seams.

- Affected owner baseline: 183 pass, 2 existing walk-thread skips, 0 fail, 1,742 assertions across 33 files. The same
  owners plus focused additions and organization guards: 226 pass, 2 skips, 0 fail, 2,602 assertions across 45 files
  (39.69 s). The final focused services/navigation/focus and organization set passes 46 tests, 876 assertions.
- Two new App-backed movement/close/leave scenarios pass against both the preceding task implementation and the
  extraction (102 assertions each). They check five pane owners on wide, narrow and zen screens and filter/pin order.
- Five identical source terminal checks pass before/after (3.5/3.6 s, three workers): `copy: yy the row`,
  `cut and paste: ctrl+x`, `outline: space o opens`, `outline: outlineOpen (panelFocused)` and
  `config: mistakes are warnings`. All filters are distinctive name prefixes; no all-terminal run was used.
- A fixed-root matrix of 12 width/zen/right-tool combinations and five actions gives 60 byte-identical frames,
  geometry records and layout source maps. No path-like fixture data or snapshot names were rewritten.
- Independent AST/emitted-body comparison confirms six extracted bodies, 42 other App methods, 102 shared-state field
  initializers, all five pane owners and the existing Panel/PanelFocus methods. Only the documented helper dispatch,
  context/IO qualifiers and the one clipboard abort delegation differ; all policy bodies remain the same.
- Focused clipboard, toast, row-navigation and focus-controller tests load no App or TUI harness. Their importGraph
  reach closures count all graph nodes from each test entry, including tests/support/non-src nodes, as in T9:
  clipboard 7 files/6 src; toast, navigation and focus 2 files/1 src each. Runtime SCC membership is unchanged:
  2, 2, 3, 3, 5, 8, 8. This extraction narrows ownership/test setup; it does not claim a cycle reduction.

The measured declaration multiset is 3,816 → 3,835 (19 added, none removed); static edges 2,018 → 2,026
(1 removed, 9 added), runtime edges 1,640 → 1,646 (1 removed, 7 added), build entries unchanged. Counts use the corrected
literal-content scanner on both sides. Assertion counts and wall times are host measurements, not identity proofs.
Runs use Bun 1.4.2 on Linux aarch64 with a temporary HOME, NO_COLOR unset, TERM=xterm-ghostty and COLORTERM=truecolor;
FORCE_COLOR is unset. No failure was classified as a baseline defect. The two walk-thread skips remain unchanged.

Typecheck, full Biome, documentation spelling/Markdown/file links, boundary and size gates pass. All four touched
Markdown files are also linted explicitly. A host binary built with the existing package build entries/flags passes
the clipboard-copy and outline terminal checks. Thirty-six reverse-import probes (nine forms per new primitive) are
rejected; lower-level imports remain allowed. Removing the clipboard primitive rule makes the committed guard fixture
fail; restoring it passes. The frozen extraction manifest passes an independent exact-delta and SCC recomputation;
all local imports resolve and the focused test closures avoid composition. No broad suite or all-terminal run was used.

The final independent audit also compares 432 original-switch/helper combinations across all three tools, including
empty lists and out-of-range selections; all preserve selection and unrelated pane state. All four extracted private
field initializers match the preceding task byte for byte. Existing selectors retain every selected test and the same
terminal-check discovery for all eight changed owner modules; the new wiring owner is additionally reached. Each new
service/navigation module selects its focused owner. The three tool headers remain above their imports; the five
navigation/wiring tests pass again after the import-only formatting correction.
