---
status: done
assignee:
blocked_by: [ORG-T23, ORG-T44]
created: "2026-10-26"
---

# ORG-T24: Focused controller capabilities

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Apply narrow explicit capabilities only to location/panel navigation seams shown by current calls; test real controllers
without App where feasible, with full-App wiring tests retained. Repeat the three mapped scope probes.

### Issue coverage and ownership

Record the controller-pattern assessment: extracted real capabilities, retained App ownership and measured import scope.
Use T44's contract design to distinguish application operations from local interaction. Extract reusable application
responsibilities where supported by current calls; keep existing callers and buffer ownership, without routing
functionality through a gateway.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.

## Implementation and verification (2026-10-28)

Baseline: ORG-T23. The [extraction manifest](../manifests/t24-extraction.json) lists every intended static/runtime edge
and declaration delta, the resource owners and complete runtime SCC membership. No source file is relocated.

### Responsibilities and contracts

- `src/core/workspace/git/branches/operation-status.ts:12` owns the existing operation observation functions and their single
  weak caller-identity cache. `OperationContext` requires only the checkout's Git directory, generation and clock.
  Where, the Git panel and the operation coordinator retain the same App identity as caller. The 500 ms comparison,
  generation refresh, cached null observations and explicit invalidation after refresh are unchanged. There is no new
  poller, scheduler, retention store or request routing.
- `src/tui/shell/screen/topbar/contracts.ts:7` defines the location selectors' actual read capabilities: location,
  glyphs, branch/tracking/operation observations, explorer zoom, workspace label and changed paths. The calculations in
  where.ts and location.ts are unchanged. They depend on core observations, not Git interaction orchestration.
- `src/tui/shell/panels/focus.ts:19` is the real visibility/focus controller. Panels passes App-owned state through five
  narrow properties and supplies the current-width predicate as its sixth capability. The controller reads current
  state, including replacement pane/UI objects; nothing is copied. It owns no buffer, positions, filters or window/tab
  state. Panels retains sizing, view switching, filtering and integration wiring. Region's type moves below composition;
  App retains its existing type export and its 1,454-line cap. Other App runtime statements are unchanged.

These boundaries follow T44: Git observation is an application query; panel visibility/focus and location presentation
are client interaction. Existing callers invoke the extracted code directly. App retains shared state, TUI buffer/undo
ownership and writeBuffer; gateway execution, client migration, socket transport and ENG implementation remain outside
this task. No broader controller context, mock App or dependency container is introduced.

### Fidelity and focused checks

- Independent normalized body comparison confirms the two operation functions, WeakMap initialization and five focus
  transitions. The remaining nineteen panel methods are unchanged. The rest of Git interaction differs only by the
  extracted invalidation call. App, both location selectors and gitpanel retain their runtime bodies after removing
  imports/types. No worker URL, build entry, asset, stored format, command identity or fixture data changes.
- Source/script edges change 2,010 to 2,018 and runtime edges 1,637 to 1,640, with every removal/addition recorded
  explicitly. The declaration inventory changes 3,799 to 3,816: fourteen characterization tests and three parent suites;
  no existing declaration is removed or renamed. Runtime SCC sizes remain 2/2/3/3/5/8/8; their full membership is
  recorded rather than inferred from counts. Their membership is identical: T24 removes no runtime cycle; its benefit
  is the narrower contracts and import closures.
- Direct test closures, using ci-scope importGraph/reach and counting graph nodes: operation observations 10 files
  (8 source), panel focus 2 (1 source), location selectors 16 (14 source). None imports App or the model harness.
  The where module's own closure falls from 86 files to 13 and location's from 87 to 14; App was not a runtime import
  in either earlier closure. Existing full-App integration selection remains intact.
- Baseline location/panel owners pass 18 tests/119 assertions; baseline Git-panel branch/review owners pass 45/300.
  Current owners, fourteen characterizations and organization fixtures together pass 104 tests/1,026 assertions.
  A new live-state replacement assertion also passes against the original Panels in the baseline archive. Characterization
  covers operation TTL/generation/invalidation/identity/nulls, panel focus/preferences/overlays and location/branch data.
- The primitive guard now includes focus and the location contracts/selectors and forbids their reverse dependencies on
  App, drawing, Panels and Git interaction orchestration, including type imports. Fixtures extend the existing checker
  test. Nine value/type/re-export/dynamic/require/extensionless import shapes are rejected; core and sibling geometry
  contracts remain allowed. There is no whole-App exclusion from dependency discovery.
- Exactly six terminal checks pass before and after (4.5 and 4.2 seconds): the three location-bar cases, outline
  opening/focus, zen and rebase continue/skip/abort. The normal package build produces a standalone host binary; the
  permanent-bar and rebase-continuation checks also pass against it from isolated terminal fixtures. Build flags,
  --root=src and entry points are unchanged.
- Typecheck, boundary, size and full Biome pass. New source modules have 35, 54 and 18 lines. No size cap grows.
  Documentation and spelling checks are repeated after all new files are staged.

### Mapped scope probes

The three research probes are repeated through the same scope() discovery and package test command, with explicit
selected-file arguments and the existing 900-second external bound. No full-suite fallback is accepted. Baseline and
current archives use private ordinary Git repositories and temporary homes, with NO_COLOR unset before Bun starts;
TERM/COLORTERM are inherited and FORCE_COLOR is unset. Named test budgets, child deadlines and terminal waits are
unchanged. The host is Linux aarch64 with Bun 1.4.2 and the existing dependencies. Each run starts a fresh Bun
process; filesystem/compiler caches are not purged and host load is not reserved. The three baseline runs precede the
three current runs. These are passing scope comparisons, not a controlled performance experiment.

| Case | Revision | Unit files | Pass | Skip | Fail | Seconds |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| location | T23 | 259 | 1748 | 2 | 0 | 366.453 |
| location | T24 | 260 | 1752 | 2 | 0 | 364.783 |
| export stream | T23 | 315 | 2180 | 2 | 0 | 385.211 |
| export stream | T24 | 315 | 2180 | 2 | 0 | 388.631 |
| regex | T23 | 312 | 2100 | 2 | 0 | 368.998 |
| regex | T24 | 312 | 2100 | 2 | 0 | 362.809 |

All six scoped unit runs completed with zero failures. Their two existing walk-thread skips are unchanged. Assertions
are host measurements, not the identity-preservation criterion; the declaration/body audits above establish that
independently. App integration selection is retained; the additional location owner adds four tests.

The known timer-arithmetic warning counts before/after are location 27,763 to 27,420, export stream 27,221 to 27,797,
regex 27,037 to 27,326. They are warnings in passing runs; no timer policy or deadline changed. Terminal discovery stays
broad (all, export, all), recorded separately. Only the six affected terminal checks above ran locally. No whole-suite
or all-terminal run was made, and these measurements make no speedup claim.
