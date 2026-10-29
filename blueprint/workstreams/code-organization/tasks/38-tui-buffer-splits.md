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

The buffer child extracts layout mechanisms from the ORG-T37 baseline. Source editing is recorded below;
views/peek, lens/completion and link actions remain for their own cohesive children.
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
