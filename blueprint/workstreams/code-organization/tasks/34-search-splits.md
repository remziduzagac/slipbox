---
status: done
assignee:
blocked_by: [ORG-T33]
created: "2026-10-26"
---

# ORG-T34: Search splits

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Separate query parsing, indexed/scan dispatch and hit location; preserve ranking and fallback.

## Evidence required

Run focused owner tests and affected terminal checks pre/post; retain failure/cancellation and snapshot contracts.
Verify measured size exceptions and light/heavy import boundaries.

## Ownership and extraction

[`t34-extraction.json`](../manifests/t34-extraction.json) records exact static/runtime/test deltas, original declaration
and member destinations, ownership and guard cohorts, and full before/after runtime SCC membership. The baseline is
completed ORG-T33. No file is moved or retired; move, retained-path and renamed-basename lists are empty.

| Owner under `src/` | Responsibility |
| --- | --- |
| `core/workspace/search/search.ts` | Compatible exports over the original implementations |
| `core/workspace/search/model/` | Shared records, document reading, section syntax and size-band packing |
| `core/workspace/search/query/` | Original query grammar and FTS expressions |
| `core/workspace/search/indexing/` | File admission/catch-up and one shared BM25 weight table |
| `core/workspace/search/matching/` | Folded offsets/occurrences, hit location and sanitized snippet marks |
| `core/workspace/search/execution/` | Indexed/scan dispatch, scan filters/ranking and relaxed fallback |
| `tui/documents/search/find.ts` | Document match calculation and the original pending-result WeakMap |
| `tui/documents/search/controls.ts` | Find toggles, replace-field keys and replace-row interaction |
| `tui/workspace/search/search.ts` | Index/feed/list lifecycle, tags/types, unsaved overlay and replace-across flow |

The core entry falls from 805 to 17 lines and its cap is removed. Workspace Search is 382 lines; all thirteen new source
owners are below 500 (largest: document reading, 129). Six handwritten exact exceptions remain under the active
750-line ceiling, with generated locks measured separately. ORG-T11 audits the final dispositions.

The two-line weight owner is a shared data boundary: both SQLite and scanning import the same array, without loading
the SQLite adapter just to rank a scan. `search-index.ts` re-exports the original public constant and its class body
is unchanged. Search still retains the original index/scan choices, weights, strict-before-relaxed order, exclusion
rules, unsaved-text overlays, section selection, Unicode offsets and sanitized snippet marks.

The original document find functions and pending-result map are relocated intact. Views, replacing and document
commands import this owner directly; old workspace exports remain compatible. `Search` owns one reference-only
`FindControls` collaborator over the same App. Its three existing public methods forward directly, returning the
original promise without an extra async wrapper. No view, buffer, overlay, generation, index or job is copied.
Workspace query merging and replace-across effects retain their current owner. No gateway execution, command,
worker URL/build entry, asset, product deadline, persisted format or behavior changes.

## Fidelity, contracts and guards

An original-declaration audit accounts for 47 core declarations, three document-find declarations and all twenty
non-constructor Search members. Original types and executable bodies are unchanged apart from import/export placement
and the three direct forwarding methods. The Search constructor adds only a reference-only collaborator. Its original
public app reference, index/job fields and method names/arities remain intact. Runtime exports remain eleven core,
two index and three TUI exports; the SearchIndex class, weights and document find functions retain one binding.

No existing test, fixture body, assertion, hook, title or snapshot is rewritten. Ten new characterization tests cover
query grammar/FTS, document reading, folded offsets, hit location, scan ranking/restriction/fallback, indexed relaxation,
cell-width/decorated-row matching, live find toggles and replace-field/confirmation interactions. All ten also pass
unchanged original bodies through export/constructor-only adapters in a separate private archive (34 assertions).
Their small graph/view fixtures expose the exercised capabilities; existing real Graph/App integration owners remain.

One added boundary fixture rejects reverse composition imports (including types), runtime SQLite in pure mechanisms
and runtime App in the document clients. It fails with the search guard removed and passes after restoration.
Independent probes reject 271 import variants and allow 22 type contracts. Public dispatch can use SearchIndex types;
index lifecycle remains with its existing owner. The guard does not turn a type-only contract into a runtime edge.

## Verification record

- The same twelve original core/workspace/document search owners pass before/after: 61 tests, 358 assertions each.
- New characterizations plus organization checks pass 41 tests with 818 assertions. All affected owners, those checks
  and the two intentionally narrowed input owners pass together: 113 tests, 1,211 assertions across 24 files.
- Five source-terminal journeys pass before/after: plain find navigation, live regex/whole toggles, replace-row keys,
  ranked vault search and preview/apply/undo of replacement across notes. A fresh production binary passes regex find
  toggles, ranked search and replace-across; original worker entries are retained.
- The two distribution import-graph/selector cases pass (21 assertions). Runtime API and promise-identity probes pass.
- Static edges change from 2,487 to 2,528 (eleven removed, 52 added), runtime edges from 1,919 to 1,946 (nine removed,
  36 added). Test declarations change from 3,936 to 3,947: none removed, eleven added (ten characterizations and the
  guard fixture). Build entries are identical. All relative imports resolve.
- Independent SCC recomputation confirms exactly one removed component: document replacing, overlays and workspace
  search. No component is added; the other six memberships remain unchanged (sizes 2, 2, 3, 5, 8, 8).
- Selector mapping preserves all original owners through their extracted parts. Each old search/index entry selects
  two fewer tests directly: the mouse/vim mechanism fixtures now reach the actual document helper. Terminal selectors
  are unchanged. All thirteen lower owners have reached tests, including the type-contract inspection owners.
- `importGraph`/`reach` closures from Views shrink from 258 to 114 nodes and replacing from 253 to 23. The compatible
  core sections-test closure grows from 108 to 118 as it traverses more modules. New focused core/TUI probes reach
  16/25 nodes and load neither App nor SQLite. Counts include graph nodes outside `src/`, not only runtime modules.

Typecheck, boundary, exact sizes, Biome and documentation checks are required before the PR. Private logs, original
archives, commands, binary hash and independent audit output live under ignored `tmp/issue/`.
