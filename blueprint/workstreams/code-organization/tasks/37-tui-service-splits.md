---
status: doing
assignee:
blocked_by: [ORG-T36]
created: "2026-10-26"
---

# ORG-T37: TUI diagnostics splits

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Separate problems presentation and language integration helpers; preserve trust and cancellation.

## Evidence required

Run focused owner tests and affected terminal checks pre/post; retain failure/cancellation and snapshot contracts.
Verify measured size exceptions and light/heavy import boundaries.

## Implementation and verification

The baseline is the preceding ORG-T36 task as merged into `dev`. This is a behavior-neutral extraction; the manifest
is [t37-extraction.json](../manifests/t37-extraction.json).

- `problems.ts` shrinks from 759 to 535 lines, removing its exact cap. `problems/rows.ts` owns the original All-tab
  aggregation and conflict-line lookup; `problems/contracts.ts` holds the original panel and row records. The original
  controller is the row builder's live receiver, with a deferred callback to its private lint-visibility cache.
- `languages.ts` shrinks from 690 to 578 lines. `languages/workspace-edits.ts` receives the original receiver, retaining
  edit ordering, undo steps, clean/unshown-buffer saves and deferred preview acceptance. `languages/symbols.ts` owns
  the original outline conversion and single `KIND_NAMES` object, re-exported by the public controller.
  `languages/locations.ts` owns the original UTF-16 position and location helpers.
- All 35 Problems and 47 Languages members retain their names and signatures. Unextracted bodies and field initializers
  are unchanged; extracted bodies differ only by explicit input/receiver names. Panel/fold/filter state, note and vault
  parse caches, syntax timers and failure caches, server/trigger/linter maps, trust prompts, process-exit registration,
  abort ownership and vault-change teardown stay with their original owners. No worker, build entry, asset, shipped
  file, fixture data, product deadline or public behavior changes.
- Six characterizations cover URI/resource-edit admission, equal-offset insert order and autosave admission, deferred
  preview effects/current receiver dispatch, symbol nesting/order/fallback, UTF-16 location columns and filtered/folded
  problem rows. They pass against both the extracted helpers and original methods through private export-only adapters:
  six tests and 21 assertions on each side. Existing lifecycle owners cover stale syntax replies, trust and
  cancellation.
- The focused baseline diagnostics, syntax-worker, server-completion and organization run passes 101 tests with 1,321
  assertions across eighteen files. The final combined run passes 108 tests with 1,345 assertions across
  nineteen files, including the seven new declarations. Assertion totals are host measurements; declarations and
  leaf-test identities establish preservation.
- Six source-terminal journeys pass before/after: Problems All and This file, trust/revocation, concurrent linters,
  lint after saves and server rename/code-action/format previews. A fresh compiled binary also passes Problems All,
  lint after saves and server-edit previews.
- Static edges change from 2,820 to 2,837 (two removed, nineteen added); runtime edges from 2,143 to 2,150 (two removed,
  nine added). Test declarations change from 3,961 to 3,968: none removed; six characterizations and one boundary
  fixture added. Build entries are identical and relative imports resolve. All five runtime SCC memberships stay the same
  (2, 2, 3, 5, 8); this task narrows helper dependencies without claiming a cycle reduction.
- Controller test reach remains 262/261 files; mapped lower owners add only the new helper test. The Problems runtime
  helpers retain the same language-server/lint/problems terminal groups through the extended selector; Languages retains
  its existing all-check fallback. Type-only panel records are checked separately by types and boundary fixtures.
- `importGraph`/`reach` counts all graph nodes, including non-source files: workspace-edit and symbol helpers reach
  three/one nodes without App, the server manager or syntax worker facade. Original controller closures change from
  122/67 to 123/70 as their lower modules are named. No heavy dependency moves into a light helper.
- Boundary fixtures reject reverse controller/process imports and runtime App while allowing App types. Independent
  probes reject 240 forbidden import shapes and allow five type imports. Removing the new checker invocation makes
  its fixture fail; restoring it passes. Distribution graph, selector and reached-check integration cases also pass.

The active ceiling remains 750 with two legacy caps and one generated cap. Typecheck, boundary, exact sizes, Biome,
explicit Markdown lint on every changed Markdown file and `check:docs` are required before the PR. Private original
archives, body/API comparisons, binary hash and run logs are kept under ignored `tmp/issue/`.
