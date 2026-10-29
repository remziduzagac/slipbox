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

This first child extracts buffer layout mechanisms from the ORG-T37 baseline. Source editing, views/peek,
lens/completion and link actions remain for their own cohesive children; this record does not claim them complete.
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
