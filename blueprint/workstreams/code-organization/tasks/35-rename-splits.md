---
status: doing
assignee:
blocked_by: [ORG-T34]
created: "2026-10-26"
---

# ORG-T35: Rename splits

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Separate rename planning and collection seams while preserving byte-range edits and stale checks.

## Evidence required

Run focused owner tests and affected terminal checks pre/post; retain failure/cancellation and snapshot contracts.
Verify measured size exceptions and light/heavy import boundaries.

## Ownership and extraction

[`t35-extraction.json`](../manifests/t35-extraction.json) records exact static/runtime/test deltas, original declaration
destinations, ownership/guard cohorts and full runtime SCC membership. The baseline is completed ORG-T34. No file is
moved or retired; move, retained-path and renamed-basename lists are empty.

| Owner under `core/workspace/mutations/rename/` | Responsibility |
| --- | --- |
| `rename.ts`, `rename-plan.ts` | Existing public exports and plan/error/Collector bindings |
| `planning/targets.ts` | Target normalization, folder intent, existing entries and source admission |
| `planning/files.ts`, `planning/move.ts` | Note/file/folder plans, move collection and followed-link exclusions |
| `planning/nested.ts` | Nested-root movement and cross-root backlink collection |
| `planning/relink.ts` | Relink, pointer offers and evidence from a vault moved by hand |
| `rewriting/links.ts` | Existing own-link/backlink retargeting in each link form |
| `collecting/contracts.ts` | Original error class and plan/edit records |
| `collecting/policy.ts` | Rewrite admission, path display, entry identity and original warning wording |
| `collecting/collector.ts` | Original read-once text/edit/skip caches and collector methods |
| `collecting/dirty-trees.ts` | Original advisory discovery of already-dirty Git trees |

The rename entry falls from 812 to 20 lines and its cap is removed; the plan entry falls from 354 to 16. Every new owner
is below 500 lines (largest: relink, 206). Five exact handwritten exceptions remain under the active 750-line ceiling,
with the generated lock cap separate. ORG-T11 audits final dispositions.

No new collection implementation or state allocation is introduced. The complete original Collector retains its maps,
read-once file text, graph reference, identity caches, live `leave` callback, edit ordering and refusal/skip reasons.
All 36 original declarations are accounted for: twenty planning declarations and sixteen plan/collection declarations,
including the complete fifteen-member Collector. Types and emitted executable bodies are identical apart from exports
and import locations. The five existing apply/link/log/vault/heading modules are byte-identical to the baseline.

Public runtime exports remain eighteen rename and eleven plan exports, with the same names and arities. Public and
lower imports share one RenameError class, one Collector class and the original planning/dirty-tree functions.
FileChange/RenamePlan shapes, byte-range edits, persisted-plan data and hash-based stale checks remain unchanged.
There is no gateway execution, new plan retention, worker/asset change, product deadline or behavior change.

## Characterization and boundaries

Six new tests exercise target/folder intent and hidden/outside/blocker refusals; one cached original text with CRLF
preview edits; cached collection refusal; invalid UTF-8 retention/refusal; self-contained plan application preserving
BOM, Unicode, CRLF and unrelated bytes; and complete stale-plan refusal before any link edit or move. All six also pass
unchanged original bodies through export-only adapters in a separate private archive (28 assertions).

The existing edit, hash-check, rollback and undo paths remain exercised by real Graph/App/CLI owners. No existing
fixture body, assertion, hook, title, snapshot or literal data is rewritten. Planning still reads and prepares values;
applying checks each affected content hash before effects through the unchanged execution owner.

One added boundary fixture rejects reverse public/effect imports, including type/dynamic imports, and collection
imports of higher planning/rewriting. It fails with the guard removed and passes after restoration. Independent probes
reject 580 import variants across all ten new owners and allow their lower contracts. All ten lower import closures
exclude the public rename/plan facades and apply execution; no reverse facade is needed to reach shared types.

## Verification record

- The same thirteen focused mutation and TUI owners pass before/after: 64 tests and 428 assertions each. Additional
  write-policy, file-integration and link-conversion owners pass before/after: 24 tests and 171 assertions each.
- New characterizations and organization checks pass 38 tests with 815 assertions. A combined shared-process run of
  all affected owners, characterizations and guards passes 126 tests with 1,414 assertions across 25 files.
- Six source-terminal journeys pass before/after: preview/apply rename, relink/undo, home followed-link writes, a
  moved folder's outgoing link, nested-root exclusion and failed-move rollback. A fresh production binary passes
  rename preview/apply, relink/undo and moved-folder outgoing-link journeys.
- Both distribution import-graph/selector cases pass (21 assertions). Public API/class identity probes pass.
- Static edges change from 2,528 to 2,588 (nineteen removed, 79 added); runtime edges from 1,946 to 1,994 (seventeen
  removed, 65 added). Test declarations change from 3,947 to 3,954: none removed, seven added (six characterizations
  and the guard fixture). Build entries are identical; all relative imports resolve.
- An independent frozen-manifest comparison and SCC recomputation preserve all six runtime memberships (sizes
  2, 2, 3, 5, 8, 8). No cycle reduction is claimed. Selector mapping preserves every original owner and terminal
  selector; every lower owner has reached tests. No existing test is narrowed out of either public entry.
- `importGraph`/`reach` closures from path-moves and refusals grow from 276/127 to 286/137 nodes as their compatible
  entries traverse the ten new modules. Counts include graph nodes outside `src/`, not only source runtime modules.
  The focused characterization closure excludes App. No import-closure reduction is claimed for these public entries.

Typecheck, boundary, exact sizes, Biome and docs are required before the PR, including explicit Markdown lint over every
changed Markdown file. Private commands, original archives, logs, binary hash and independent audit output are under
ignored `tmp/issue/`.
