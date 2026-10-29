---
status: doing
assignee:
blocked_by: [ORG-T37]
created: "2026-10-26"
---

# ORG-T38: TUI buffer and editing splits

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Separate buffer layout-cache helpers and source editing helpers; preserve history, marks and save ownership.

### Issue coverage and ownership

Include the document views, peek, lens and completion modules assigned in the coverage ledger. Preserve per-view state,
shared buffer history, save ownership and stale clipboard-result guards; split unrelated extractions into child PRs.

## Evidence required

Run focused owner tests and affected terminal checks pre/post; retain failure/cancellation and snapshot contracts.
Verify measured size exceptions and light/heavy import boundaries.


## Buffer layout child PR

The buffer child extracts layout mechanisms from the ORG-T37 baseline. Source editing and navigation are recorded
below; lens/completion remain for their own cohesive child.
The exact edge, runtime, test and build deltas are in [t38-buffer-extraction.json](../manifests/t38-buffer-extraction.json).

- `documents/buffers/buffer.ts` shrinks from 692 to 596 lines. `layout/source.ts`, `layout/code.ts` and `layout/note.ts`
  own its original three layout bodies; `layout/contracts.ts` names their buffer/cache capabilities.
- `NoteBuffer` retains the text, all undo/redo and marks, parse state, embedded-note set, save metadata and original
  cache fields and reset sites. One private `layoutContext` holds the same buffer plus live getters of parsed version,
  layout map, source cache and render cache. Cache replacement remains visible immediately; no buffer or cache is copied.
- Token comparisons preserve all 87 unextracted members, including every original field initializer. Three extracted
  bodies differ only by explicit buffer/cache receiver names; public parameters/defaults and both runtime exports
  (`NoteBuffer`, `BACKGROUND_PARSE`) stay identical. The constructor adds only the reference/getter bridge.
- Six cache/history characterizations pass both the original buffer and extraction: six tests, 25 assertions on each
  side. They cover cache reuse/invalidation, six-entry insertion eviction, source/render cache identities, selective
  pending-library eviction, shared undo/redo, and code-layout variants for cells, marks and width.
- The baseline focused views, undo, differential lens, watcher relayout and organization run passes 182 tests with
  1,982 assertions across thirty files. The final combined run passes 189 tests with 2,010 assertions across 31 files,
  adding only the six characterizations and boundary fixture.
  Assertion totals are host measurements; declarations and leaf-test identities establish preservation.
- Six affected source-terminal journeys pass before/after: source editing and undo/save, lens sizing, embedded notes,
  comment links in code view, syntax-error marks and pictures following resized/split windows. A fresh production binary
  passes source editing, embedded notes and resized/split pictures.
- Static edges change from 2,837 to 2,861 (24 added, none removed), runtime edges from 2,150 to 2,157 (one removed,
  eight added). Test declarations change from 3,968 to 3,975: none removed, six characterizations and one boundary
  fixture added. Build entries and all five runtime SCC memberships are unchanged (2, 2, 3, 5, 8).
- The buffer's 265 reached test files remain selected; only the new characterization file is added. Terminal coverage
  keeps the original all-check fallback. Relative imports and worker/build entry paths resolve without path changes.
- `importGraph`/`reach` counts graph nodes, including non-source files: source/code/note helpers reach 19/67/82 nodes,
  without loading NoteBuffer or App. The original buffer closure changes from 98 to 101; the new helper test reaches
  104 nodes without App. Type-only buffer capabilities do not create runtime reverse edges.
- Boundary fixtures and independent probes reject runtime buffer/App imports from all four helper owners (64 refused,
  24 type imports allowed). Removing the checker invocation makes the regression fail; restoring it passes.

The active ceiling stays 750 with two existing legacy caps and one generated cap; this child adds none. Typecheck,
exact sizes, boundary, Biome, explicit Markdown lint on all changed Markdown and `check:docs` are required before the PR.
Private body/API audits, before/after logs and compiled-binary hash are retained under ignored `tmp/issue/`.


## Source editing child PR

The baseline is the preceding buffer-layout child. Exact deltas are in
[t38-editing-extraction.json](../manifests/t38-editing-extraction.json).

- `documents/editing/editing.ts` shrinks from 692 to fourteen lines, preserving its 28 public function bindings through
  direct re-exports. Nine `source/` owners separate positions, admission/mode policy, session lifecycle, insertion and
  boundaries, newline handling, deletion, line operations, typed selection and keyboard coordination. The largest is
  255 lines. No wrapper changes an async return, function name, parameter/default or clipboard settlement behavior.
- All 41 declarations, including the original key sets and bracket map, compare token-for-token with their originals
  after adding exports. The original App, View and NoteBuffer still hold all state. `snippets.ts` changes only its
  position import to the lower owner; its body stays identical. `keyChar` comes directly from its existing decoding
  owner, preserving the same function binding.
- Six characterizations pass original bodies through export-only adapters and the extracted owners (six tests and
  thirty assertions each): graphemes/CRLF, UTF-16 line offsets, refusal precedence/labels, indentation, key/word-motion
  predicates and pending clipboard results. The clipboard case includes a positive control and rejects replies after
  quitting, changing the active view or editing the buffer revision.
- The focused editing, input, source navigation and organization baseline passes 227 tests with 2,628 assertions
  across forty files. The extraction passes 234 tests with 2,661 assertions across 41 files. Test declarations have
  seven additions and no removals; assertions are measured on the local host.
- Six source-terminal journeys pass before/after: immediate Escape, the typing gutter, desktop-style selections,
  source editing/undo/save, Vim grammar and commenting. A fresh compiled binary passes source editing, selection and
  commenting journeys. The three distribution graph/selector integration cases also pass.
- Static edges change from 2,861 to 2,899 (ten removed, 48 added); runtime edges from 2,157 to 2,187 (nine removed,
  39 added). Test declarations change from 3,975 to 3,982 (six characterizations and one boundary fixture). Build
  entries and all relative paths remain valid. The editing/snippets two-module runtime component disappears; the
  other four memberships stay identical (2, 3, 5, 8).
- All 265 original reached test files stay selected, with only the new lower-owner test added through the extracted
  owners. The terminal selector keeps its existing all-check fallback. `importGraph`/`reach` counts graph nodes,
  including non-source files: the facade changes from fifteen to 24; position, text and selection owners reach
  three, four and four nodes without App or the facade. All public bindings are the same functions exported by their
  lower owners.
- Boundary fixtures enforce facade direction, source-helper tiers and type-only App capabilities. Independent probes
  reject 412 forbidden shapes and allow 74 type/lower-tier imports; removing the checker invocation makes its fixture
  fail. The active 750-line ceiling and two legacy/one generated caps stay unchanged.

Typecheck, Biome, boundary, size, every touched Markdown file and `check:docs` are required before the PR. Private
original snapshots, token/API checks, selector records, terminal output and binary hash live under ignored `tmp/issue/`.


## Navigation and views child PR

The baseline is the preceding source-editing child. Exact deltas and state owners are recorded in
[t38-navigation-extraction.json](../manifests/t38-navigation-extraction.json).

- `navigation/peek.ts` shrinks from 691 to thirteen lines. Eight `peek/` owners separate contracts, live peek/place
  access, path admission/switching, presentation, the shared probe, synchronization, opening and history interaction.
  The largest is 290 lines. Original holder/generation checks, catch-up serialization, parsing/retirement sets,
  signature cache and mutable probe stay single allocations in their respective owners; no async wrapper is added.
- `views/views.ts` shrinks from 584 to 497 lines. Width/cache, selected-text, task-hit and anchor conversions live in
  `views/layout/`. Three state-free methods retain their signatures as forwarders; the other 27 members, constructor,
  parse set and field initializers are unchanged. The same natural-width WeakMap remains shared by its callers.
- `actions/documents/actions-links.ts` shrinks from 541 to 467 lines. Six fragment/heading/pointer/punctuation helpers
  live in `actions/documents/links/anchors.ts`; its other ten declarations and registration table are unchanged.
  Helpers import App only as types and stay below action composition.
- Token comparisons preserve all 58 extracted declarations/bodies and 37 retained declarations/members after export
  and formatting normalization. Public namespaces and prototype signatures are unchanged (sixteen peek values, three
  view values and four link-action values); re-exports retain the lower owners' exact bindings, including `peekProbe`.
- Seven characterizations pass original bodies through export-only adapters and the new owners (seven tests,
  24 assertions each): wrapped source anchors/end columns, natural widths/decorations, wide-character selection,
  checkbox hit boundaries, line/pointer anchors, title width budgets and backlink Markdown encoding/pending text.
- The focused navigation, views and organization baseline passes 343 tests with 2,774 assertions across 53 files.
  The final combined run passes 351 tests with 2,801 assertions across 54 files. There are eight new declarations
  (seven characterizations and one boundary fixture), none removed; assertion totals are host measurements.
- Eight source-terminal journeys pass before/after: peek/open/keep/fill, links within a peek and history, asynchronous
  backlink lists, return to a backlink row, task toggling, all target forms, missing-heading/block fallback and narrowed
  window headers. A fresh production binary passes peek interaction, asynchronous backlinks and task toggling.
- Static edges change from 2,899 to 2,958 (fifteen removed, 74 added), runtime edges from 2,187 to 2,221 (fourteen
  removed, 48 added), and test declarations from 3,982 to 3,990. All four SCC memberships remain identical (2, 3, 5, 8),
  build entries are unchanged and relative imports resolve. No path-looking fixture data is rewritten.
- The 261/262/261 original test-file selections for peek/views/link actions remain intact; their mapped lower owners
  add only the new helper test. Peek helpers keep the original peek-only terminal selector through its extended rule;
  views and link actions keep their all-check fallback. The existing distribution scope fixture verifies the new path.
- `importGraph`/`reach` counts graph nodes, including non-source files: pure view helpers reach two to six nodes,
  peek presentation eight, link anchors nineteen and the new helper test 33, without App or a public facade.
  Synchronization retains its existing graph/lifecycle dependencies; public closures grow only with the new modules.
- Boundary fixtures and independent import-shape probes reject facades, higher peek tiers and runtime App (864 refused,
  71 type/lower imports allowed). Removing the checker invocation makes the fixture fail. Types, sizes, boundary,
  Biome and all changed Markdown/docs gates are required before publishing.

View/buffer/history/save ownership and all worker/probe/cancellation contracts remain unchanged. The active 750 ceiling
and two legacy/one generated caps are unchanged.


## Lens and completion child PR

The baseline is the preceding navigation/views child. Exact graph, runtime and test deltas are recorded in
[t38-contexts-extraction.json](../manifests/t38-contexts-extraction.json).

- `editing/lens.ts` shrinks from 512 to 473 lines. Its live-layout contract and state-free visibility mechanisms live
  in `lens/contracts.ts` and `lens/visibility.ts`. Two methods keep their signatures as forwarders; the other eighteen
  members and `unparsedText` are unchanged. Live-layout composition and all per-view lens state remain with the controller.
- `editing/completion.ts` shrinks from 524 to 391 lines. Completion/signature records, target/word/snippet context and
  item construction/ordering separate into three owners under `completion/`. Timer, request epochs, word sets, request
  admission, narrowing, acceptance, paste and stale-reply checks stay in the original controller as single allocations.
- Token comparisons preserve thirteen extracted declarations/bodies and 33 retained declarations/members. Lens retains
  its five public runtime exports and completion its seven, with unchanged names, arities, prototypes and direct
  lower-owner binding identity. No asynchronous wrapper or new buffer snapshot is introduced.
- Six characterizations pass against original bodies through export-only adapters and the extracted owners (24
  assertions each): half-open hidden ranges, signed distances, visible movement/clamping, Unicode word starts,
  target admission, stable item ordering/identity and snippet indentation/file variables.
- The focused editing, views, link-completion and organization baseline passes 307 tests with 2,840 assertions across
  48 files. The final combined run passes 314 tests with 2,867 assertions across 49 files, adding six characterizations
  and one boundary fixture. Declarations change from 3,990 to 3,997 with nothing removed; assertions are host measurements.
- Six source-terminal journeys pass before/after: lens sizing and following a link, retained/narrowed completion,
  target changes and language-server completion/signature help. A fresh compiled binary passes lens sizing, retained
  link completion and language-server completion/signature help.
- Static edges change from 2,958 to 2,973 (five removed, twenty added), runtime edges from 2,221 to 2,226 (five removed,
  ten added). All four runtime SCC memberships remain identical (2, 3, 5, 8); build entries and relative paths are valid.
  No fixture labels, sample text, expected output, worker paths or shipped artifacts change.
- All 262 original lens and 261 completion test-file selections remain intact; mapped lower owners add only the new
  characterization file. Their terminal selector keeps its existing all-check fallback. `importGraph`/`reach` counts
  all graph nodes: visibility reaches one, context parsing two, item construction 124 and the characterization test
  128, all without App runtime or controller facades. Item construction retains its original graph/link dependencies.
- Boundary fixtures reject controller imports, including types, and runtime App imports. Independent probes reject
  140 forbidden import shapes and allow fifteen type capabilities; removing the checker invocation makes the fixture
  fail. The active ceiling and exact legacy/generated caps are unchanged.

All assigned T38 owners are within the final 600-line ceiling: buffer 596, source facade fourteen, peek facade thirteen,
views 497, link actions 467, lens 473 and completion 391. Buffer/history/save and request lifetime ownership are unchanged.
Typecheck, boundary, sizes, Biome, all touched Markdown and `check:docs` are required before publishing.
