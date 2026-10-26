---
status: review
assignee:
blocked_by: [ORG-T2]
created: "2026-10-26"
---

# ORG-T3: Vaults and walking

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Move vaults and walk areas, with their worker entries and clients. Update build lists, worker URLs and selector mappings
atomically.

### Issue coverage and ownership

Destinations: core/workspace/vaults, session and walk. Move position/session persistence intact; preserve its format.

## Evidence required

Vault discovery, symlink/trust, home slices, walk/list worker tests and matching explorer/vault terminal checks. Probe
source and compiled worker paths.

## Move manifest and verification

The [T3 manifest](../manifests/t3.json) moves 18 source files: vault discovery/registry/trust/symlinks and feeds into
workspace/vaults, persisted positions into workspace/session, and walking/listing clients, jobs and workers into
workspace/walk. Position/session storage formats and behavior are preserved. Worker arguments, package entries,
fixtures and selector paths move atomically; build entries retain their existing root/autoload flags and sorted order.

The mapped dependency, runtime, declaration and build-entry snapshots are unchanged. All 106 affected source modules
have identical executable bodies after import/worker-path normalization; all 18 moved module bodies match. Selector
filters are unchanged for every moved file. Existing caps remain exact; App's value/type imports are separated and
import-section whitespace is compacted. Its complete boundary comment is preserved.

The actual worker-client matrix passes from source and a host-compiled probe outside the repository: all eleven clients
complete, including the moved walk/list workers and nested export-to-diagram SVG generation. Focused vault/session,
symlink/trust and walk-thread checks, type/boundary/size/lint/docs and source/compiled entry checks are recorded in
`tmp/issue/reviews/t3-*`. Source-only historical references are explicit manifest exceptions; no source compatibility
barrel or loading/memory change is added.

## Local review and trade-off

The shipped skill is byte-identical to the predecessor: its capture-path example refers to a user's project,
so the manifest retains it explicitly. No skill hash changes. The skill installation check passes (1 test).

App retains its exact 1,446-line cap and full boundary comment by splitting a value/type import and removing the blank
line between the final import and `Host`. This import-only style trade-off avoids raising the cap for longer paths;
the maintainer can request a measured cap adjustment during review.

Local checks: 15 vault/session/trust/symlink tests, 4 walk-thread tests and 3 selector/import-graph/build-entry tests
pass. Source TUI navigation passes; the compiled binary outside the repository opens explorer/outline and exits cleanly,
serves info/commands JSON, and rejects an unknown option with exit 2. Typecheck, lint, boundary, size, docs and migration
checks pass. The second review has no remaining correctness findings.
