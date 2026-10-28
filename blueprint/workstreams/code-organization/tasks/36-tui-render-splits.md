---
status: doing
assignee:
blocked_by: [ORG-T35]
created: "2026-10-26"
---

# ORG-T36: TUI drawing splits

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Separate overlay widgets and pane painting into owner-local helpers with unchanged geometry.

### Issue coverage and ownership

Separate shell composition, window/tab drawing, document headers and owner-local feature drawing. Assess the shared
selection/scroll clone with pinning and filtering tests; preserve geometry and existing tab/window containment.

## Evidence required

Run focused owner tests and affected terminal checks pre/post; retain failure/cancellation and snapshot contracts.
Verify measured size exceptions and light/heavy import boundaries.

## Ownership and extraction

[`t36-extraction.json`](../manifests/t36-extraction.json) owns the exact static/runtime/test deltas, symbol destinations,
window/tab ownership, cache locations, intentional clone reuse and guard cohorts, plus full SCC membership. The
baseline is completed ORG-T35. No file is moved or retired; move/retained-path/renamed-basename lists are empty.

| Owner under `src/tui/` | Responsibility |
| --- | --- |
| `shell/screen/draw.ts`, `shell/screen/frame/` | Screen composition, rails and frame joints |
| `shell/screen/geometry/contracts.ts` | Original Geometry/PaneGeom/Separator/ScrollbarGeom records |
| `windows/drawing/` | Existing global tab strip and per-tab view arrangement |
| `documents/views/draw-header.ts`, `documents/views/drawing/breadcrumb.ts` | Per-view document header and breadcrumb |
| `documents/views/drawing/` | Pane/line/picture painting, with marks and cursor/scroll/completion chrome |
| `shell/overlays/drawing/` | Floating frame, which-key, menus/dropdowns, dialogs, lists/footers and labels |
| `shell/panels/draw-panels.ts` | Sidebar composition over its current selected feature |
| `shell/panels/drawing/` | Shared chrome, tree guides, row metrics and selection/scroll policy |
| `workspace/explorer/drawing/`, `workspace/history/drawing/` | Feature-owned explorer/history painting |
| `documents/tools/{info,footnotes,outline}/draw.ts` | Active-document tools' own painting |

The document-pane entry falls from 959 to eight lines and the overlay entry from 949 to twelve; their caps are
removed. Panel composition falls from 710 to 53 and screen composition from 600 to 236. Every new owner is below 500
lines (largest: pane painting, 484). Three exact handwritten exceptions remain under the active 750-line ceiling,
with generated locks separate. ORG-T11 audits final dispositions.

### Window and document containment

The existing model is preserved: App's global tabs contain views; the active tab's views are arranged as windows.
The tab strip and arrangement drawing now sit under `windows/drawing/`, beside their existing layout owner. No new
Window model, per-window tab data, persisted session shape or layout policy is introduced. The document header remains
a cohesive 100-line owner; its breadcrumb is below screen composition. Right-side info/outline/footnote tools read
the same live active `app.view`. Floating content retains the same view, clipping and hit shielding. Buffers remain
TUI-owned; no gateway executes or routes actions here.

### State and clone assessment

The original `naturalWidths` row cache remains one WeakMap shared by the sidebar and document tools; the original
`firstRowCache` remains one layout-keyed WeakMap in diagnostic-mark drawing. Row/view/buffer objects, paint order,
styles, marks, sanitization and geometry arrays are not copied or reinterpreted.

The reported footnote/outline selection-and-scroll clone is exactly the existing four statements in `followSelection`.
Both owners now call that helper after their original cursor-following assignment and filter/row preparation. Pinning
still suppresses automatic following while filtered counts clamp the viewport; empty selection remains zero and a
zero-height viewport keeps its existing behavior. The helper's emitted body is unchanged. Its type is narrowed from
SidePaneState to the three exercised fields: `selected`, `scroll` and optional `pinned`. No new selection policy is added.
An exhaustive old/new comparison agrees for 202,176 selection/scroll/count/height/pinning combinations.

## Fidelity and boundary evidence

All 74 original declarations are accounted for: pane 26, overlays eighteen, panels nineteen and screen eleven. Original
function/type bodies compare identically after expanding the two intentional helper calls back to their four original
statements. Geometry records move intact. Four adjacent header/diagnostics/Git/status consumers have import-only body
differences. No existing test, assertion, title, hook, snapshot or literal fixture data changes.

Public exports retain eight pane, thirteen overlay, seven panel and two screen runtime values, with unchanged names,
arities and data. Shared selection, label marking and breadcrumb imports retain the same function bindings. New
owner guards reject all four higher drawing compositions even for types, and runtime App imports; the pure selection
helper rejects App types too. Geometry records retain the existing View type without loading App. Probes reject
1,729 import variants across 36 guarded owners/consumers and allow 35 view-type contracts. The boundary fixture fails
with its guard removed and passes after restoration.

## Verification record

- The same 48 drawing-owner files pass before/after: 244 tests and 3,828 assertions. Ten additional diagnostics,
  Git drawing, picture, document-tool, Save As and choice-dialog consumers pass before/after: 217 tests and 1,321
  assertions. Six new helper characterizations also pass original bodies via export-only adapters (fourteen assertions).
- New characterizations and organization guards pass 39 tests with 804 assertions. All affected owners and guards
  pass in one shared process: 500 tests, 5,953 assertions across 67 files. The already-recorded timer-arithmetic
  TimeoutOverflowWarning appears in this shared run (ORG-T12/T43); no deadline or timer behavior is changed here.
- Twenty-seven complete Canvas frames match before/after across three widths: text cells, styles, native cursor,
  images and complete hit geometry with only view references normalized to window/file identities. Cases include
  document rendering, which-key, list/help, outline pin/filter, tab changes and split windows.
- Eight affected source-terminal journeys pass before/after: split windows, pinned tabs, right outline without a
  rail, footnotes, which-key, confirmation, Save As and completion shielding a stacked window's header. A fresh
  production binary passes split-window, footnote and Save As journeys.
- The distribution graph, selector and reached-check integration cases pass (three tests, 49 assertions).
- Static edges change from 2,588 to 2,820 (64 removed, 296 added), runtime edges from 1,994 to 2,143 (45 removed,
  194 added). Test declarations change from 3,954 to 3,961: none removed, seven added (six helper characterizations
  and the boundary fixture). Build entries are identical; all relative imports resolve.
- Independent frozen-manifest/SCC recomputation confirms removal of exactly the eight-module drawing component
  recorded in the manifest. No new component appears; the other five memberships remain unchanged (2, 2, 3, 5, 8).
- Selector mapping preserves all 261 original drawing test files and terminal coverage through their actual lower owners.
  The pane/overlay compatibility facades are no longer production-loaded; their own reach narrows to ten/nine test files
  and the update-check harness. The screen/sidebar composers retain their original reach. Runtime helpers have
  reached tests; the geometry-only contract remains covered by the typecheck and contract/guard inspections.
- `importGraph`/`reach` closures for diagnostics and Git painting fall from 284 to eleven/36 nodes. App-backed panel
  selection/header tests grow from 454 to 483/484 as composition traverses more modules. The new pure helper test
  reaches nine nodes without App. Counts include graph nodes outside `src/`, not only source runtime modules.

Typecheck, exact sizes, boundary, Biome and docs are required before the PR, including explicit Markdown lint on every
changed Markdown file. Private commands, original archives, frame records, binary hash and audit output live under
ignored `tmp/issue/`.
