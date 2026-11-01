---
status: done
assignee:
blocked_by: [ORG-T12]
created: "2026-10-26"
---

# ORG-T2: Core foundations

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Move text, platform, workers, config and commands areas in separate coherent batches within this PR. Keep width/sanitize
authoritative and resolver settings unchanged.

### Issue coverage and ownership

Destinations: core/foundation/text, platform and workers; core/application/config and commands. Theme moves in T6.
Position/session persistence moves in T3, not into pure text primitives.

## Evidence required

Width/sanitize/config/commands and filesystem/tool-process tests; boundary, size and import resolution. Preserve
environment and optional-tool behavior.

## Move manifest and implementation

The exhaustive [T2 manifest](../manifests/t2.json) records 29 source moves. Text and platform primitives now live in
feature folders under foundation; worker infrastructure has its own folder. Configuration and commands live under
application, with area catalogs below commands/areas and independent contracts beside the composer and registry.
Imports and executable/fixture/document references were rewritten from one manifest plan (`tmp/issue/t2-plan.json`).
Historical decisions, archived workstreams and explicitly dated baseline measurements remain in the manifest's exact
file/text allowlist. No compatibility barrel or exported-symbol rename is introduced.

The worker URL API remains core-relative. Relocating its helper preserves that base for source callers and keeps the
compiled entry-root rule. Migration and test-selection scanners use the same core-relative worker convention, including
nested export callers. Command boundary checks and their fixtures now name the moved contract, composer and areas.

## Verification and review

The mapped pre/post snapshots have identical resolved imports, runtime edges, test-declaration multisets and build
entries (1,949 edges and 2,612 declarations); exact historical-reference exceptions are in the manifest. Typecheck,
boundary and size checks pass. Focused foundation/config/worker-URL/build-entry checks pass (16), command registration
checks pass (2), and contract/migration/default-policy checks pass (12).

A source and host-compiled probe exercised all eleven worker clients: walk, listing, backlinks, parse, syntax, spell,
regex, painting, native image decoding, diagrams and export. Both also produced the diagram SVG through the nested
export-to-diagram worker path. Requests use the actual client classes/functions, verify results and stop the clients.
The probe build retains the package's root/autoload flags and worker entries; its compiled executable runs from an
isolated temporary directory. The package's actual CLI build also passes its compiled SQLite/index/spell test.
Probe artifacts are `tmp/issue/worker-probe.ts`, `run-worker-probe.py` and `reviews/t2-workers-*.log`.

The generated selector fixture imports the moved URL helper and expects its new sort order. The selector matrix
preserves the original terminal filters for all 29 moved files, including blockdiff, shell and worker-context. Retired
basenames are explicit in the manifest, and prose-only historical uses have exact exceptions. Current prose/module-map
references, the worker URL JSDoc attachment and wraps are corrected; sample-case formatting is preserved except the
actual path/name substitutions. The expanded distribution/scope test run is recorded below.

The expanded local distribution and scope/range run passes: 97 tests across distribution.test.ts and ci-range.test.ts.
The generated fixture failure is fixed, and all 331 command records retain their original content and order.

The final executable-body comparison checks every moved module after canonicalizing import paths. It caught and
corrected a rewritten literal shell range selector; asset-base rewriting is now restricted to explicit import.meta
bases. All 28 ordinary moved modules retain equivalent bodies; the URL helper is the sole intentional implementation
adaptation, verified by the source/compiled worker matrix.

Both shell range and process cases pass with normal local process permissions; the existing range test was verified to
fail with the incorrect rewritten selector. Source and compiled TUI panel checks pass. All listed source, selector and
compiled checks pass.

The syntax-worker structure fixture keeps its explicit source base at core/, independently of the URL helper's
folder. Using the nested helper URL as that base looks for the entry in the helper's folder instead and fails with
ModuleNotFound. The existing structure test reproduces that failure before correction and passes afterward; all four
syntax-worker tests and the existing source/compiled URL characterization pass (five tests, eleven assertions).
No test identity, assertion, product worker resolver or build entry changes in this correction.
