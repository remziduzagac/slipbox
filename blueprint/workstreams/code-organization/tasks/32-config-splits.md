---
status: done
assignee:
blocked_by: [ORG-T31]
created: "2026-10-26"
---

# ORG-T32: Configuration and parsing splits

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Separate config defaults/validation/loading, data-format readers and markdown transformations by their existing
contracts. Keep parsing branches explicit and all warnings stable. Lower the handwritten ceiling to 750 with exact
measured legacy exceptions.

### Issue coverage and ownership

Assess the reported data-parser clone explicitly; retain distinct format semantics rather than forcing reuse.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.

## Ownership and extraction

[`t32-extraction.json`](../manifests/t32-extraction.json) records exact intended static/runtime/test deltas and relocated
symbols. No file is moved or retired; moves, retained paths and renamed basenames are empty.

| Area | Owners and responsibilities |
| --- | --- |
| `application/config/` | `config.ts` preserves exports; contracts/defaults, loading and trust are separate |
| `application/config/validation/` | Value predicates, field schemas and merge/retired-setting policy |
| `documents/model/data/` | Positioned contracts, common nodes/tables, links and outline queries |
| `documents/model/data/readers/` | Explicit TOML, INI, YAML/JSON, JSON-comment and delimited parsing |
| `documents/markdown/parse/` | Contracts/cache token, engine, normalization, chunks, transforms, visit and headings |

The configuration entry falls from 999 to 10 lines; data dispatch and Markdown assembly remain small entry points.
Every new owner is below 500 lines (largest: configuration contracts, 325). All 114 original declarations are accounted
for: configuration 32, data 40, Markdown 42. Public types and default/template values are preserved. Executable bodies
remain unchanged apart from export/import placement, with one equivalent block-end helper refactor described below.
Public APIs preserve exports, names and arities (configuration six, data five, Markdown seventeen). There is one
original origin symbol, not a copied cache token. No worker entry, asset, timeout, command or persisted format changes.

The reported `data:203`/`data:372` clone is assessed as retained TOML/INI format-specific line processing. TOML validates
with smol-toml, supports TOML headers/record tables and interprets quoted/multiline values; INI admits repeated line
keys, its own section/comment forms and line continuations. Existing shared node/table helpers remain shared; forcing
a generic reader would conflate distinct admission and source-position contracts. The characterizations explicitly
contrast duplicate-key admission. YAML/JSON also retain their original explicit JSON-validation branch. T40 remeasures
clone locations; this task claims no clone elimination.

## 750-line stage and exact exceptions

ORG-D2's next ceiling is now 750. AGENTS.md, requirements and the design state that active rule. New owners follow it;
pre-existing larger files retain exact, non-growing measurements. Generated server locks retain their separate 1,239-line
cap and offline generator verification. These are staged exceptions, not final blanket exemptions; T11 audits them.

| Handwritten owner under `src/` | Exact cap | Responsibility/rationale and follow-up |
| --- | --- | --- |
| `core/workspace/walk/walk.ts` | 825 | Existing traversal/filtering, ORG-T33 |
| `core/workspace/graph/watch.ts` | 866 | Existing filesystem reconciliation, ORG-T33 |
| `core/workspace/graph/graph.ts` | 998 | Mutable-index composition after T25; core ledger, ORG-T39 |
| `core/workspace/search/search.ts` | 805 | Existing query/dispatch/location policy, ORG-T34 |
| `core/workspace/mutations/rename/rename.ts` | 812 | Existing rename collection/planning orchestration, ORG-T35 |
| `tui/documents/views/draw-pane.ts` | 959 | Existing pane painting/geometry, ORG-T36 |
| `tui/shell/overlays/draw-overlays.ts` | 949 | Existing overlay painting/geometry, ORG-T36 |
| `tui/documents/diagnostics/problems.ts` | 759 | Existing diagnostics presentation/integration, ORG-T37 |
| `tui/app/runtime/app.ts` | 1,366 | Shared-state/wiring after T10/T24; final disposition, ORG-T11 |

An assertion inside the existing size-test declaration fixes the 750/751 boundary. Temporarily restoring LIMIT=1,000
makes it fail; restoring 750 passes. Existing exact-shrink and generated-cap tests remain in force.

## Verification

Baseline is completed ORG-T31 in a clean archive. Bun 1.4.2, Linux aarch64, `TMPDIR=/var/tmp`, NO_COLOR and FORCE_COLOR
unset; TERM=xterm-ghostty, COLORTERM=truecolor. No host markers or user configuration are changed.

```sh
bun test tests/core/application/config tests/core/documents/model/data.test.ts \
  tests/core/documents/model/data-readers.test.ts tests/core/documents/markdown/parse.test.ts \
  tests/core/documents/markdown/parse-mechanisms.test.ts tests/organization tests/check-size.test.ts
bun run test:terminal --jobs 2 'config: yours rewritten' "config: a folder's config" \
  'data: TOML' 'data: YAML' 'data: CSV' 'code blocks and properties'
```

- Existing configuration/data/Markdown owners pass 35 tests with 999 assertions before/after. Fifteen new
  characterizations cover loading/default identity, last-good fallback, trust filtering, ordered warnings, field
  validation, format-specific admission, JSON comments, table cells, references/outlines, transforms, normalization,
  position copying, cache records and visitor pruning. The same fifteen pass against original implementations via
  private export-only adapters (55 assertions); the immutable manifest baseline is separate.
- Combined affected owners, organization guards and size-policy checks pass 86 tests, 0 fail, 1,850 assertions across
  sixteen files. Existing test identities remain unchanged; the boundary fixture adds one declaration and the size
  assertion stays within its existing declaration. No assertions, hooks, snapshot names or fixture DATA are rewritten.
- Complete output records match: six configuration/warning/origin records, twelve data trees/outlines/links and sixteen
  Markdown trees/headings/anchors/titles (whole and sliced parses). Public APIs and the shared origin-token identity
  are independently checked.
- Six affected terminal checks pass before/after (7.9/7.8 s, two workers). Live configuration reload and TOML rendering/
  navigation also pass through the production-compiled binary with unchanged build entries and a private outfile.
  Real-worker owners pass six tests with 5,263 assertions before/after (including cache reuse, startup refusal and
  failed-worker restart). The 2 MB note journey passes in baseline/current source (2.7/2.6 s) and in the compiled
  binary, exercising the unchanged parse-worker entry through its new imports.
  Artifact SHA-256: `31c23d7e6cb0edf7373110fdb64a2672dc8cd749faa8d721083da63facd09fee`.
- Static edges: 2,348 to 2,408 (eleven removed, 71 added); runtime: 1,834 to 1,874 (eleven removed, 51 added).
  Declarations: 3,908 to 3,924 (sixteen added, none removed). Entries stay identical and imports resolve. All seven
  runtime SCC memberships stay identical (2, 2, 3, 3, 5, 8, 8); no cycle reduction or speed improvement is claimed.
- Characterization closures count every importGraph/reach node including support/non-src files: configuration 16
  files/14 source modules, data 14/13, Markdown 14/13. None imports App. Data outlines import heading queries and their
  contract directly, so data readers do not load the Markdown dispatch entry just for an outline slug.
- Mapped selector coverage retains every old owner: configuration 369 to 370, data 361 to 362, Markdown 374 to 376.
  Direct entry selections are 369, 361 and 373. The two narrowed Markdown-entry owners are
  `tests/core/workspace/graph/queries/file-links.test.ts` and `tests/home.test.ts`: their data-outline dependency now
  points to the actual heading helper, whose changes still select them. No feature selector is added to mask this
  dependency transfer. Terminal selectors remain unchanged. Every new runtime owner selects its characterization;
  the two type-only contract modules rely on the existing full typecheck rather than an invented runtime edge.
- Typecheck, repository Biome lint, docs/spelling/file links, explicit Markdown lint, boundary/size and offline lock
  generator verification pass.
- Reverse-edge probes reject 320 import/re-export/dynamic/type forms across the 23 new owners and allow their lower
  contracts. Removing the parsing guard makes its committed fixture fail; restoring it passes. Core/TUI boundaries
  remain enforced by the existing checker.

Assertion totals and durations are observations on this host. Fidelity is judged by identities, original bodies and
complete output records; no whole-suite or all-terminal run is used.

### Literal block-end matcher

`parse/chunks.ts` keeps the same block-boundary grammar while matching literal endings with `includes`; the raw-tag
case keeps its case-insensitive expression. The internal capability now exposes only `test`, the member its callers
use. This changes one helper's executable body, not any public parser API. An exhaustive comparison with the original
helper covers 112,068 tag/line pairs with identical results. Two additional characterizations preserve exact endings
and whole/sliced equivalence across a comment block. They also pass against the original implementation. The final
compiled artifact above passes configuration reload, TOML navigation and the real 2 MB parse-worker journey.
