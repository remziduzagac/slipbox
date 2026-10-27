---
status: review
assignee:
blocked_by: [ORG-T5, ORG-T13]
created: "2026-10-26"
---

# ORG-T14: Search and editing paths

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Move search and editing families, including regex worker/client and all source/compiled URL references. Keep queue and
deadline policy unchanged.

### Issue coverage and ownership

Destinations: core/workspace/search, core/documents/editing and external-editors. Pure text helpers remain callable by
clients; external-editor process integration is a distinct responsibility.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.

## Implementation and local evidence

The [T14 manifest](../manifests/t14.json) moves 13 files into workspace/search, documents/editing and
documents/external-editors. Pure text operations remain callable without TUI state; process/editor integration stays
separate. Regex worker URLs and sorted package entries move together; editing selector rules follow the new paths.
Existing queue, cancellation and deadline policies are unchanged. No compatibility facade is added.

Baseline ORG-T13 plus the ORG-D2 import-formatting note:
`bun scripts/organization/migration.ts capture tmp/issue/t14-before.json` captured 1,954 edges and 2,614 literal test
declarations. The mapped migration check preserves dependency/runtime edges, declarations and build entries, and
therefore mapped SCC membership. All 34 affected source bodies match after import/worker-path normalization. Every
moved-file selector is preserved; no size cap changes are needed.

Six retained paths are historical blueprint references. One retained suite label in `tests/core.test.ts` names the
original source location so its baseline test identity stays unchanged; it is not an import or runtime reference.

Local checks: 24 text-editing/editor-argv tests, 21 search tests, 17 regex-job/TUI-find tests and two terminal journeys
(find and editor hand-off) pass. All eleven actual worker clients complete from source and a host-compiled probe
outside the repository, including regex and nested export-to-diagram SVG. The actual package binary opens
explorer/outline and exits cleanly, serves info/commands JSON and rejects an unknown option with exit 2. Typecheck,
lint, boundary, size, docs and migration checks pass. Assertions and snapshots are unchanged.

Known follow-up: ORG-T19–ORG-T22 must rename the retained suite source label together with its identity baseline.
