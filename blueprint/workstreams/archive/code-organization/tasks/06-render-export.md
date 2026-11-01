---
status: done
assignee:
blocked_by: [ORG-T15]
created: "2026-10-26"
---

# ORG-T6: Rendering and export paths

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Group layout, media, export and theme by subarea; relocate export-worker with its URL/build references. Distribution
moves separately. Preserve dynamic writer dispatch.

### Issue coverage and ownership

Destinations: core/rendering/layout, media, export and theme. Keep media worker entries beside their feature.

## Evidence required

Export formats/streams, image/diagram/paint, layout snapshots and distribution worker-asset tests; relevant
export/render terminal checks. Compare output bytes or existing snapshots.

## Implementation and structural evidence

The [T6 manifest](../manifests/t6.json) maps 56 files into rendering/layout, media, export and theme. Layout has code,
markdown and diff subareas; media groups images, diagrams and paint; export separates format writers and asset helpers
from orchestration. Existing modules move intact and no newly organized directory has more than ten direct
implementation files. No filename basename changes, compatibility barrels, runtime extraction or loading-policy changes
are introduced.

Baseline ORG-T44: `bun scripts/organization/migration.ts capture tmp/issue/t6-before.json` captured 1,954 edges and
2,614 literal test declarations. Mapped dependency/runtime edges, build entries and the exact test multiset agree. All
103 affected source bodies match after import/worker/asset-path normalization; mapped SCCs and all 56 selector filters
are preserved. The relocated export worker retains its broad fallback selection rather than inheriting a narrow
export-only rule. Existing exact caps move with their files; no growth adjustment is needed.

Worker arguments remain core-relative; sorted package entries and the diagram-renderer ownership gate follow the moves.
The generated boundary fixture's relative import is updated as well. Bare folder/file references and split path segments
are scanned in addition to full paths. Both shipped installer-template and skill-text bytes are unchanged; manifest
exceptions are historical blueprint references. No self-referential manifest exceptions are added.

## Local evidence and cache condition

Each owner file runs in a separate process, identically on baseline and current: export 60/60, export-streaming 15/15,
paint jobs 3/3 and HTML-export 5/5 pass on both. Render initially passes 523 with one cache-dependent case failing on
both revisions; 39 snapshots are preserved and snapshot files are unchanged. Three drawing-boundary cases pass.

All eleven real worker clients complete from source and a host-compiled probe outside the repository, including nested
export-to-diagram SVG. The actual package binary opens explorer/outline and exits cleanly, serves info/commands JSON and
rejects an unknown option with exit 2. Source diagram and multi-format export terminal checks pass (2). Typecheck, lint,
boundary, size, docs and migration gates pass.

The named render case is “drawn while its library loads: its code, the layout saying it waited, the block not kept —
drawn once it's in” (`tests/render.test.ts`). It expects a cold Mermaid pending state. With fresh XDG directories per
run it passes five times on baseline and five on current. In a separate same-sandbox cold/warm pair, the first run
passes and the second fails identically on each revision: the disk cache makes the first layout already drawn. The
controls unset NO_COLOR, leave FORCE_COLOR unset and keep COLORTERM=truecolor/TERM=xterm-ghostty. This is a
cache-state-dependent fixture expectation, not evidence of an introduced move defect. Host caches and assertions are
unchanged. Warm-run failures remain recorded; fresh complete-file comparisons are recorded separately.

The complete render file with fresh XDG directories also passes on baseline and current: 524/524 on each, 39 snapshots
and 60,294 assertions on each. The warm-cache failures above are retained as a separate condition, not discarded.

Follow-up: carry the named Mermaid cold-load/warm-cache case into ORG-T43's outstanding-findings ledger for a separate
test-isolation bug fix, with a regression that exercises repeated runs against the same cache. Preserve product cache
policy; this move does not fix that pre-existing test weakness.

The code-block tree labels are rendered fixture data, not imports or live source references. Keep their original text
and relative line widths; the exact retained entry protects the code-wrap geometry assertions during this move.
