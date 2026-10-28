---
status: doing
assignee:
blocked_by: [ORG-T32]
created: "2026-10-26"
---

# ORG-T33: Walk and watch splits

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Separate traversal/filtering and filesystem event reconciliation within their owners.

## Evidence required

Run focused owner tests and affected terminal checks pre/post; retain failure/cancellation and snapshot contracts.
Verify measured size exceptions and light/heavy import boundaries.

## Ownership and extraction

[`t33-extraction.json`](../manifests/t33-extraction.json) records exact static/runtime/test deltas, original symbol and
member destinations, full runtime SCC membership and fixture receiver changes. No source file is moved or retired;
move, retained-path and renamed-basename lists are empty. The baseline is completed ORG-T32.

| Area | Responsibilities |
| --- | --- |
| `workspace/walk/` | Public exports and shared walk records |
| `workspace/walk/filtering/` | Existing `WalkFilter`, busy/home policy and disk inspection |
| `workspace/walk/io/` | Stamp/settling rules and the one live folder-reader hook |
| `workspace/walk/traversal/` | Whole/sliced traversal, listing, symlink decisions and traversal state |
| `workspace/graph/watch/` | Shared state, directory subscriptions/admission, reconciliation, IO and contracts |
| `workspace/vaults/home/` | Home cache persistence/admission, containment paths, records and shared filter factory |

The walk entry falls from 825 to 25 lines, the watcher from 866 to 360, and home composition to 150. Their two exact
legacy caps are removed; seven handwritten exceptions and the separate generated-lock cap remain under the active
750-line ceiling. Every new owner is below 500 lines (largest: home cache, 332). Final dispositions remain ORG-T11's.

`VaultWatcher` owns lifecycle, scheduling, debounce and public API. One `WatchState` contains the original nineteen
private data fields, each allocated once. Directory and reconciliation collaborators share its actual maps, sets and
queues, the same options object and live callback capabilities. Replacing options such as `known` remains visible.
Public `degraded` remains an own writable/enumerable field; cached `realRoot` remains on the watcher. Constructor IO
retains its original order; the two new constructors only retain references. Close still owns the original timer and
subscription cleanup. Public `watchNamed` forwards once to its original implementation in the directory owner.

Home cache DTOs, version/filter checks, folder stamps, caps and persistence paths stay unchanged. Its shared filter
factory sits below both cache and composition. Traversal retains the original `WalkFilter` and `SlicedWalk` classes,
not copied implementations; the folder-reader hook and relist sentinel retain one identity through public exports.
No worker URL, package build entry, asset, deadline, command, behavior or persisted format changes.

## Characterization and boundary evidence

Eleven new tests exercise live folder-reader replacement, whole/sliced results, busy/home decisions and relist/symlink
refusals; shared directory reservations, degraded/polling lifecycle and closed-state refusal; move-history clocks and
replacement known maps; and home containment, filtering and cache admission. One boundary fixture rejects reverse
imports from mechanisms to composition, including type and dynamic imports. It fails with the guard removed and
passes with it restored. An independent import-shape probe rejects 330 variants across all nineteen new owners and
allows their lower contracts.

Seven existing fixtures deliberately inspect private watcher internals. A pure support module returns the actual new
state or directory owner; it allocates no watcher, hook, timer or sandbox. Nineteen receiver projections and one call
retargeted to the still-owned `lookAgain` method preserve the original operations. A transpiled body comparison after
normalizing those receiver paths finds identical fixture logic, assertions and literal data across all seven files.
Titles, hooks and snapshots are unchanged. No production compatibility shim is added for private test access.

The original declarations are accounted for: walk 51, home 26 and watcher 11, plus all 50 non-constructor watcher
members. Original bodies differ only by exports/imports, the state/collaborator receiver paths and one public forwarding
method. Constructor comparison preserves ordered effects and verifies empty collaborator bodies. Runtime API probes
preserve 28 walk exports, 13 home exports and two watcher exports, including ten public watcher methods/getters and
`degraded`'s property descriptor.

## Verification record

- The same twenty affected walk/watch/home/symlink and TUI owners pass before and after: 150 tests, zero failures;
  832/833 observed assertions respectively. Assertion totals are host observations; fixture logic and identities are
  compared independently. The separate real walk-worker lifecycle file is also exercised on both trees.
- New characterizations plus organization checks pass 41 tests with 811 assertions across eleven files. The existing
  worker file passes 42 tests with two skips and 586 assertions on each tree. The eleven new characterizations also
  pass against unchanged original bodies through export/receiver-only adapters in a separate private archive.
- Five affected source-terminal journeys pass on both trees: busy-folder admission, folder rename/deletion, an open
  note deleted/restored with a new deep folder, opening a folder of home by name, and a home folder's time set back.
- A fresh production build passes three compiled journeys: busy folders, home-folder opening and watcher deletion/
  restoration. The build retains all original worker entries and exercises background traversal from the binary.
- Exact capture is 2,408 to 2,487 static edges, 1,874 to 1,919 runtime edges and 3,924 to 3,936 test declarations.
  The manifest declares thirteen static removals/92 additions and thirteen runtime removals/58 additions. No existing
  test identity is removed; twelve declarations are added (eleven characterizations and the boundary fixture).
  Build entries are identical. An independent frozen-manifest comparison and SCC recomputation preserve the same
  seven runtime SCC memberships (sizes 2, 2, 3, 3, 5, 8, 8); no cycle reduction is claimed.
- Selector coverage for each original entry is preserved by the entry plus its extracted owners. The watcher test
  formerly reached through home now reaches its actual lower home helper. Terminal feature selectors are unchanged.
  All nineteen new owners select focused tests and all relative imports resolve. Focused mechanism closures contain
  35/36/38 nodes for walk/watch/home respectively and exclude App composition; counts follow `importGraph`/`reach`
  from each characterization entry and include test/support modules, not only source runtime modules.

Local logs, commands, immutable baseline archives, binary hash and audit output are under ignored `tmp/issue/`.

The first PR run exposed two missed fixture references: the distribution graph assertion still expected the walk
entry's former direct `fsutil` import, and the no-events regression scenario accessed the former private `watchers`
field. Both fail locally before correction. The graph assertion now checks the actual filtering owner; the regression
uses the same state projection as the other fixtures. Its emitted operations/data remain identical after receiver
normalization. Both full test files pass before/after: 110 tests and 1,801 assertions on each tree. No product code or test identity
changes in this
correction. A scan of remaining private watcher accesses finds only the already-projected fixtures and retained main
methods; unrelated layout/worker `pending` properties are unchanged.
