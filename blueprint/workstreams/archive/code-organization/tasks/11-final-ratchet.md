---
status: done
assignee:
blocked_by: [ORG-T43]
created: "2026-10-26"
---

# ORG-T11: Final size ratchet and reconciliation

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Set the approved final handwritten ceiling after ORG-T43. Review every inventory row, record cohesive 500–600-line
modules and explicit remaining exceptions with follow-up tasks. Apply test caps and generated-lock cap. Reconcile
docs/manifests; no additional broad extraction in this PR.

Reconcile every issue item in the coverage ledger, including clone/pattern decisions, internal boundaries, unused-code
and error/type findings, completed scope comparisons and unresolved failures. A folder move alone is not completion.

## Evidence required

Boundary, size and focused tests of remaining owners; configured worker/build entry discovery. Repeat final
scopes/timings on mapped cases, record caps and unresolved baseline issues; no whole-suite run.


## Final policy

`scripts/check-size.ts:17` sets the final handwritten source ceiling to 600; 500 remains the responsibility aim. Tests
have a separate 1,500-line ceiling and 1,000-line aim. Existing handwritten exceptions remain exact, non-growing caps
below 1,500. Existing test owners above their separate ceiling receive exact caps; a shrink requires lowering its cap
and reaching the relevant ceiling requires removing it. Import-formatting resets remain restricted to the approved
source-move case, not implementation growth or test caps. No source/test body is split by this ratchet.

The [final ledger](../manifests/t11-final-ratchet.json) maps all 55 original inventory rows and records the actual
owner, cohesion or cap disposition, evidence task and named follow-up. Eighteen source owners remain above the
500-line aim but within 600, each with its responsibility assessment; ten test/check owners remain above 1,000 but
within 1,500. The defaults do not redefine those aims. Generated server locks retain their own measured 1,239-line cap
and offline generator/pinned-key check. Snapshots are not TypeScript test files; process fixtures remain identified
under tests.

## Follow-up implementation

[ORF](../../../org-follow-ups/README.md) tracks issue #170 in delivery order: the overflowing timer and intermittent
deadlines, the seven source and nine test caps below, unused-code proof and measured focused-test migrations.
ORG-D1–ORG-D3 remain authoritative; ORG consolidation/archive and ENG are outside that work.

## Source cap follow-ups

| Owner, relative to src/ | Exact cap | Retained responsibility |
| --- | ---: | --- |
| `cli/cli.ts` | 609 | Command dispatch and output/exit policy |
| `core/workspace/graph/graph-resolve.ts` | 605 | Resolver precedence and related caches |
| `core/workspace/graph/graph.ts` | 998 | One mutable index, generation and feed coordination |
| `tui/app/distribution/updates.ts` | 667 | Quiet offers, restart and detached-child handover |
| `tui/app/runtime/app.ts` | 1,366 | Shared state, wiring, opening/layout and sole note-write gate |
| `tui/app/runtime/watch.ts` | 666 | Graph feed, refresh and conflict-aware reload |
| `tui/workspace/vaults/vaults.ts` | 636 | Ordered leave/reset/restore transaction |

These are explicit ORG-D2 exceptions with named responsibilities and follow-up task proposals, not a blanket App
exemption or a claim that every source file meets 600. The next tasks must preserve the listed invariants and use
coherent child PRs with before/after characterization. They are not additional ORG-T implementation IDs or permission
for growth; the approved task inventory stays at 44.

- **Split command dispatch from output/exit presentation**: Keep argument admission, command dispatch order, text/JSON
  errors and exit codes; characterize both owners before extracting. Remove the cap at or below 600; retain the
  500-line aim.

- **Separate resolver admission from candidate lookup**: Preserve resolution precedence, scope/cache identity,
  symlinks, aliases and ambiguity outcomes. Remove the cap at or below 600; retain the 500-line aim.

- **Separate graph refresh/feed coordination from index state**: Keep one mutable graph, generation ordering and live
  overlay/cache invalidation; no generic graph container. Remove the cap at or below 600; retain the 500-line aim.

- **Separate installed-version observation from update handover**: Preserve quiet-input/answered-offer order, process
  ownership, restart refusal and child cleanup. Remove the cap at or below 600; retain the 500-line aim.

- **Separate App opening/layout policy from composition**: Keep TUI buffer ownership, initialization/disposal order,
  view anchors and App.writeBuffer authority; introduce focused capabilities rather than an App-shaped service bag.
  Remove the cap at or below 600; retain the 500-line aim.

- **Separate background refresh from watcher reload delivery**: Preserve graph/root identity guards, stopped/paused
  work, ordering, selection restoration and cleanup. Remove the cap at or below 600; retain the 500-line aim.

- **Separate vault catalog/prompts from switch transaction**: Preserve cancellation/reset/restore order,
  unsaved-buffer refusal, location identity and live UI focus. Remove the cap at or below 600; retain the 500-line
  aim.

## Test cap follow-ups

| Existing test/check owner | Exact cap |
| --- | ---: |
| `tests/distribution.test.ts` | 2,510 |
| `tests/export.test.ts` | 1,624 |
| `tests/render.test.ts` | 1,990 |
| `tests/servers.test.ts` | 2,038 |
| `tests/terminal/checks/links-and-files.ts` | 3,095 |
| `tests/terminal/checks/navigating.ts` | 1,824 |
| `tests/terminal/checks/outside-and-code.ts` | 1,900 |
| `tests/terminal/checks/reading.ts` | 1,737 |
| `tests/terminal/checks/vaults.ts` | 2,533 |

The ledger names the follow-up split for each: distribution gates, format/picture export, rendering/snapshots,
language/protocol/process servers, and the five terminal feature collections. Preserve titles, assertions, hooks,
snapshot/check identities and terminal registration; aim for 1,000 per owner and never exceed 1,500 in a new/split
owner. A cap is removed when its original owner reaches that ceiling. No large rendered data string is reformatted or
snapshot regenerated to satisfy this phase.

## Coverage reconciliation

All issue #55 wanted items and ORG-R1–ORG-R10 have evidence in
[T43](43-measurement-and-build.md#issue-coverage-and-remaining-scope), with explicit retained/deferred outcomes.
Folders follow features; source/test ownership and real lower collaborators are separate from gateway execution.
Source clone mechanisms, incompatible worker policies, unused source contracts, type-package ownership, specialized
AST casts and existing failure/cleanup contracts have their T40/T41/T42 dispositions. T43 records six completed mapped
scopes, twelve representative terminal checks, the compiled workers/assets and exact test identity changes.
Conservative App/shared integration selection is retained, not hidden to claim a smaller CI run.

Known test-isolation/host assumptions, shared-process clock warnings and intermittent deadline failures remain in
T43's ledger. The macOS dev timeout passed one retry without a code change; no known red dev job is bypassed. The
retained caps and test-fixture/scope follow-ups are visible outstanding work, rather than assertions that all code is
now small or every feature change has a tiny scope. No whole-suite/all-terminal run, product deadline change, #56
work, runtime gateway, socket, new buffer owner or ENG implementation is bundled here.

## Verification record

Eight size-gate tests pass with 55 assertions. They exercise 600/1,500 independently through the script, reject one
line of growth, require exact-cap lowering, and remove a cap at its own group's ceiling. Negative controls applying
the source ceiling to tests and using the wrong cap-removal ceiling both fail the intended new regression before
restoration. A third negative control restores symlink-following traversal and fails the same regression: fixture
links to files, directories and cycles are data, not additional trees to traverse. Existing source ratchet cases
remain; the approved 600 limit is checked directly.

The repository gate measures 557 source and 554 test/fixture files, with seven handwritten, one generated and nine
legacy-test caps. The source tree, build entries and worker URLs are unchanged. The only new test declaration is the
distinct-ceiling regression; the final declaration count is 4,017, with all 4,016 preceding identities retained. The
T43 completed comparisons remain the final product-code measurement because this phase changes only developer gates
and documentation. Gate fixture coverage and the offline generator are verified directly.

The combined focused selection passes 52 tests with 887 assertions across ten files. Typecheck, Biome, boundary,
source/test sizes, dependency gates, offline generator and documentation checks pass. Product source bytes remain
unchanged; no terminal/screenshot refresh or repeated full product scope is needed for this developer-gate change.
