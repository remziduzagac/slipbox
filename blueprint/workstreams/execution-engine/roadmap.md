# Draft roadmap

Status: **draft design**. This is a proposed migration order, not authorized implementation. The reserved
ENG-T1–ENG-T6 IDs identify these slices; after acceptance, create their task files with prerequisites and reviewed
acceptance tests. Do not make a single rewrite pull request.

## ENG-T1: Establish the baseline and contracts

Reconcile main, D235's split branch and pending VV/GIT changes. Record existing CLI output, conflict and undo
behavior. Inventory actions and operations; classify presentation-only actions, shared operations and deliberate
exposure exceptions. Specify the first operation schemas and access rules using current vocabulary.

Prepare complete parent design replacements and exact baselines for the [integration inventory](design/changes.md).
Resolve exposure/authority choices before their slice begins; they do not authorize implementation through this plan.

Characterize the existing action/input route with state snapshots and a rendered fixture. Name the old writer,
dispatcher or lifecycle owner each slice replaces, and its deletion target. Keep source evidence separate from
runtime verification; a smaller file alone does not establish that ownership moved.

For each extracted owner, identify its resources, lifetime and result-delivery boundary (ENG-D1, ENG-D3). Classify
its background work as replaceable queries, same-resource refreshes or ordered mutations (ENG-D2). The accepted
principles do not accept this migration sequence or authorize implementation.

Exit: accepted contract examples for a saved read, task toggle, live edit/save and plan/apply; agreed ownership and
content-source rules; no requirement to design every operation name in advance.

## ENG-T2: Prove one shared read and mutation

Compose a minimal embedded engine and move saved read and saved/clean task-toggle orchestration behind it. Connect
existing CLI and the clean TUI path to those handlers. Preserve byte-preserving toggle behavior. Dirty-buffer toggles
remain on the existing memory-edit path until ENG-T3 transfers document ownership; they never call a disk toggle.
Record that temporary route and delete it in ENG-T3; this slice does not claim the entire task-toggle workflow moved.
Keep the clean-state check through the clean toggle commit bounded and synchronous, without yielding into a new
async dispatcher; T2 cannot introduce a clean-to-dirty interleaving before document ownership exists. If that is not
possible, move the minimal document-ownership prerequisite into this slice instead of querying App from the engine. Add
catalog-driven
binding for these commands, leaving legacy commands usable.

Use one descriptor format and invocation lifecycle. Add one existing UI action as the first session handler,
delegating to the real action registry; prove stable-ID lookup and availability without creating another registry.

Exit: one shared handler for each migrated saved operation, direct tests, adapter parity and unchanged CLI contracts; no
callback
from engine into App. This proves the boundary before extracting every service.

## ENG-T3: Transfer document ownership

Extract document text, revisions, undo, saved baseline, conflicts and the single save path. TUI buffers become
presentation records over engine documents. Move watcher reconciliation with them; keep VaultFeed's git batching.
Retain the existing controller split and migrate dependent actions in bounded groups. Complete dirty/live task-toggle
routing through the document edit primitive, remove ENG-T2's temporary route and test the clean-to-dirty race before
claiming one authoritative task-toggle implementation.

Exit: two headless clients can edit and observe one live document; stale edits fail; undo, external writes,
save-during-typing and conflicts preserve the stated rules. Terminal checks retain lens and cursor behavior.

Lifecycle tests close/reopen at the same path and deliver old callbacks afterward. Disposal covers timers and
subscriptions; accepted writes remain engine-owned until settlement (ENG-D1, ENG-D3, ENG-D6).

## ENG-T4: Prove session control, local attachment and observation

First compose the actual TUI over the test Canvas and prove session handlers directly: action dispatch, input,
context checks, snapshots, conditions and frame barriers. The same executor serves application and session handlers.
Then add the explicitly enabled local endpoint: handshake, discovery, invocation status, subscription, cancellation
and receipts, with attached-CLI bindings. Exercise the same scenarios through the connection; transport does not
introduce another implementation of the operations. An application-only test host needs no TUI.

Exit: direct, CLI-attached and socket calls agree; missing/ambiguous instances fail without fallback; permissions,
disconnect, duplicate requests, bounded queues and resynchronization are tested. Session input uses the real TUI
dispatcher, preserves context and acknowledges rendering; it cannot bypass application or human-only access rules.
Queued timeout prevents later execution; claimed actions report their real status. Captures and task status prove
different completion boundaries. Configuration, state and clipboard remain isolated in automated runs.

## ENG-T5: Transfer plans and longer operations

Move plan/apply coordination, recovery records and task lifecycle behind shared services. Exercise a cross-file
rename, one mixed live/disk language edit and one long operation. Preserve shown/dirty target memory edits and
unshown clean-target saves, with captured dispositions, per-document undo and explicit partial disk outcomes. Migrate
capture, search, diagnostics, language servers and export by concern, with
saved/live capabilities explicit. Transfer git orchestration when its prerequisites and exposure are reviewed.

Select each service's scheduling policy and test progress and stale-result delivery under controlled continuous
activity. Share existing diff/anchor models across current surfaces while preserving their workflows (ENG-D2–ENG-D4).

Exit per feature: one implementation, explicit source and prerequisites, cancellation/failure tests and adapter
coverage. Independent module groups may be delivered separately; no feature must wait for an exhaustive catalog.

## ENG-T6: Complete boundaries and consolidation

Finish CLI bindings and structural action coverage, remove superseded orchestration and temporary delegates, and
enforce public engine imports. Check that App and the engine composition root remain wiring, with focused services
under D235's size limit. Reconcile pending VV/GIT tasks against the new owners.

Audit every named action for session exposure and every effect path for caller-context propagation, including
synthetic input and deferred callbacks. Remove old registry metadata and execution paths as their consumers migrate.

Add bounded seeded interaction/invariant runs and deterministic failure replay over the composed hosts (ENG-D5).
Confirm that the owned-resource contract serves future bindings without introducing a plugin runtime (ENG-D6).

Before consolidation, compare every full delta against the current parent, preserve unchanged requirements and
record accepted amendments including the D235 ownership clarification. Summary inventory entries cannot be applied.

Exit: requirements acceptance criteria exercised, normal checks and agreed terminal checks pass, user docs and
skill match shipped behavior, public contracts versioned, parent blueprint reconciled with accepted decisions.
Consolidation and roadmap reordering require the maintainer's approval.

## Research-driven review checks

The [synthesis](research/synthesis.md) refines existing slices rather than adding another architecture phase.
ENG-T1 fixes explicit target and discovery contracts; ENG-T4 verifies endpoint probe states, buffered decoding and
interleaved client outcomes; ENG-T6 checks preserved TUI workflows alongside the deleted orchestration paths.


## Dependency-backed service and supply-chain checks

These checks deliver ENG-R20, ENG-D12, ENG-D13 and ENG-D14 within the existing slices.

### ENG-T1: Inventory and baselines

Inventory parsing, spelling, typesetting and export: inputs, auxiliary-resource lookup, execution host, authority,
limits and feature loading boundaries. Identify all built-in installed tool closures and existing integrity checks.
Establish separate installed-package, shipped-artifact and startup-loading baselines. Record tool/git paths that
must preserve D172; the trust policy is already settled, not an implementation prerequisite to reopen.

### ENG-T4: Connected authority

Exercise read-only, editing, session-control and tool-effect grants against untrusted roots. Synthetic keys,
actions, prompt responses and deferred calls cannot grant trust or evade guarded tool/git execution. Closed or
revoked scopes cannot redirect effects to another workspace.

### ENG-T5: Service and tool migration

Establish each migrated service's budgets, cleanup and failure checks. Preserve lazy feature entry points for
export, typesetting, diagrams, SVG, spelling and grammar loading where applicable. Allow static imports inside a
deferred implementation; detect transitive eager paths from startup rather than matching import syntax alone.

Cover built-in tool locks independently of the application lockfile: frozen integrity-checked installation,
advisory review per pinned closure and scoped exceptions with rationale and expiry. Audit unavailable/failed and
clean results remain distinct. Do not require network advisory queries on ordinary feature invocations.

### ENG-T6: Automated release evidence

Produce a normalized shipped module/package/asset manifest from the release build using the same entry points,
flags and target. If the pinned compiler cannot expose adequate metadata for compilation, document and verify the
coverage of a matching analysis build; do not present approximate evidence as an exact artifact inventory.
Account for worker entries, WASM/native assets and target-specific additions. Diff package membership against a
reviewed baseline; changes require an explicit baseline edit and rationale. Version-only updates remain visible
without being treated as newly introduced package names.

Automate package-absence assertions used by advisory exceptions and test designated eager-loading boundaries.
Manifest inclusion and startup evaluation are separate checks: dynamically imported code can still ship. Use
runtime loading observations where static build evidence cannot establish initialization behavior. Retain ordinary
licence, advisory and dependency gates; a passed manifest check is not a security certification.

Record evidence for retaining service placement or proposing specific isolation or packaging. Dependency removal
and new distributions require a separate justified choice.

## Related upkeep and optional measurement

S1: record a reviewed runtime package-set baseline, with reasons for additions and counts derived from it, in the
dependency gate. S5: actually audit the site's lockfile, trigger on its changes and cover its build dependency
licences separately from binary notices. These are recorded follow-ups in
[dependency proposals](ideas/dependencies.md#repository-upkeep-follow-ups),
not prerequisites for moving the first engine handler; do not silently add them to unrelated migration slices.

S7: optionally measure unique bundled size, startup cost and feature usage of parser and export closures. Deduplicate
overlapping closures. Findings may support a later decision under D184/D210; no replacement work is scheduled here.


## Maintainability checks across migration slices

ENG-D15 and ENG-R21 apply to every slice through the [completion
checklist](design/maintenance.md#feature-completion-checklist).
ENG-T1 maps feature owners, public ports, representative compatibility scenarios and old-path deletion targets.
ENG-T2 establishes reusable fixture/scenario helpers with thin real-interface drivers, not a new test framework.
ENG-T3 and ENG-T5 cover the relevant shared-state interactions with controlled clocks, tools and delivery queues.
Each transferred owner removes its old orchestration or records a forwarding delegate and its removal slice.
ENG-T6 removes remaining delegates, verifies structural gates and confirms preserved product/UI behavior.

Future features can follow the same checklist and add focused scenarios. No functionality expansion, UI redesign,
feature removal or 1.0 milestone is required to complete this backend migration.


## Second-review contract checks

ENG-T3 verifies canonical edit batches/range reads and disclosed host-owned autosave authority. ENG-T4 verifies
mixed-origin input continuations and authorization across every session observation channel. ENG-T5 proves mixed
live/disk language edits, cross-process saved plans, lifetime-bound live plans, and task/receipt/client retention
through settlement. Separate response/execution deadlines and explicit terminal result/artifact expiry apply across
all those slices. These clarify existing contracts and preserve current workflows, not new product functionality.


## Third-review compatibility and failure checks

ENG-T1 records legacy handoff scopes and apply-once plan behavior with source evidence. ENG-T3 verifies cancelled
quit leaves owners usable and handoff readiness survives asynchronous save races. ENG-T5 separates finite tool
readiness from resident ownership, proves plan-scoped cross-process claims, and injects recovery quota/record
failures. Bounded shutdown and uncertain-resource refusal are verified before deleting legacy lifecycle paths.
ENG-T6 checks these scenarios and evidence under acceptance criteria 32–36; no new user workflow is introduced.
