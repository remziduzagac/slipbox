# Decisions: engine principles

The principles below are accepted. ENG remains a draft workstream; its complete architecture and implementation
plan are not yet accepted. These entries change only ENG's design, not the parent's current requirements or design.

## ENG-D1: Services own their complete lifecycle (2026-10-16)

**Decision:** A service owns its narrow API, mutable state, timers, background work, subscriptions and disposal.
Its lifetime has an identity that is invalidated on close; extracting fields without transferring these duties
does not establish an owner.

**Why:** Explicit ownership makes shutdown, workspace switching and asynchronous delivery understandable and
testable. Evidence: [research.md § A subsystem owns its whole
lifecycle](research/write-up.md#a-subsystem-owns-its-whole-lifecycle).

**Verify:** Closing and reopening a service cannot revive an old callback, timer or result.

## ENG-D2: Scheduling follows the kind of work (2026-10-16)

**Decision:** Replace obsolete query work; let a refresh of the same resource finish while retaining the newest
pending refresh; preserve ordered mutations. Debounced refreshes have a maximum wait. Mutating requests are not
silently replaced or coalesced.

**Why:** Query freshness and refresh progress require different policies. One latest-wins rule can starve a resource
refresh or lose an explicit mutation. Evidence: [research.md § Background work needs more than one scheduling policy](
research/write-up.md#background-work-needs-more-than-one-scheduling-policy).

**Verify:** Continuous invalidations still allow a refresh to finish; new queries replace old results; saves retain
their order and completion receipts.

## ENG-D3: Result applicability is checked at delivery (2026-10-16)

**Decision:** Asynchronous work captures its resource identity, owner lifetime and relevant content/query revisions.
The owner validates them before applying the result, including after it has been queued for delivery. Cancellation
does not replace this check.

**Why:** A cancelled task can already have completed or posted its callback. Evidence:
[research.md § Background work needs more than one scheduling policy](
research/write-up.md#background-work-needs-more-than-one-scheduling-policy).

**Verify:** A result completed before close or a workspace switch but delivered afterward cannot mutate the new owner.

## ENG-D4: Shared models serve distinct interaction surfaces (2026-10-16)

**Decision:** Reuse diff computation, projection, source anchors and suitable layout primitives where their contracts
agree. History, change review, buffer conflicts and merge resolution retain their own interaction and lifecycle.

**Why:** Sharing a model removes duplicate rules without forcing different workflows into one conditional widget.
Evidence: [research.md § Share models where behavior agrees](research/write-up.md#share-models-where-behavior-agrees).

**Verify:** Shared invariants are tested at the model boundary; each surface's own interaction tests remain.

## ENG-D5: Random interaction failures become reproducible regressions (2026-10-16)

**Decision:** Add isolated, seeded stateful interaction tests over real engine/session handlers. Record enough input
and controlled asynchronous ordering to replay failures. Check semantic invariants as well as crashes and hangs;
reduce discovered failures to focused regression cases.

**Why:** Bugs can arise from combinations absent from feature-by-feature examples. Evidence:
[research.md § Random interaction can yield reproducible regressions](
research/write-up.md#random-interaction-can-yield-reproducible-regressions).

**Verify:** A saved failing trace can be replayed without depending on the developer's configuration or real services.

## ENG-D6: Client and extension resources have explicit owners and access (2026-10-16)

**Decision:** Subscriptions, timers, callbacks and tasks belong to an identified owner and retain their access scope.
Closing or revoking that owner stops admission and delivery, cancels disposable work and safely settles accepted
mutations. Future extensions use the same ownership contracts; no plugin runtime is introduced by ENG.

**Why:** A usable extension boundary includes cleanup and authority, beyond registration. Evidence:
[research.md § Extension contracts include cleanup and authority](
research/write-up.md#extension-contracts-include-cleanup-and-authority).

**Verify:** Closing or revoking an owner prevents subsequent callbacks/effects from using its access; already-started
mutations keep inspectable outcomes and follow the documented settlement policy.

## ENG-D7: Preserve Slipbox's interaction model (2026-10-16)

**Decision:** Engine extraction preserves Slipbox's navigation, rendered views, lens and review workflows. Fresh,
Kakoune and TTT are primary comparisons for mechanisms; larger editors are references for specific contracts.

**Why:** The redesign serves Slipbox's existing human-and-agent workspace and ease of use. Its purpose does not
require adopting another editor's interaction model. Agreement: [research
discussion](notes.md#prior-art-research-2026-10-16).
Evidence and scope: [synthesis](research/synthesis.md#keep-the-product-boundary).

**Verify:** Migration slices retain existing reference scenarios and TUI interaction checks.

## ENG-D8: Typed access and discovery describe the running build (2026-10-16)

**Decision:** CLI and connected clients use shared typed operation definitions. Generate discovery and CLI validation
from those definitions, reporting supported sources, effects and host facilities. Keep workflow explanations authored.
Access to existing operations does not require a scripting or plugin runtime.

**Why:** Fresh demonstrates useful shared API access and build-matched help; its script channel also demonstrates
that shared access alone does not imply narrow operation authority.
[Evidence](research/fresh.md#shared-api-and-discovery).
Agreement: [research discussion](notes.md#prior-art-research-2026-10-16).

**Verify:** Discovery matches exposed handlers on each host; generated bindings validate the same inputs as direct
calls.

## ENG-D9: Deferred work retains explicit targets (2026-10-16)

**Decision:** Resolve workspace, document and view targets to identities before deferred execution. Preserve those
identities across waits and reject closed targets. Direct document edits do not take over the person's focus;
visible-session control explicitly targets the shared UI context.

**Why:** Active state can change while work awaits completion. Kakoune's copied context illustrates editing without
moving the person's selection; Fresh's targeting path illustrates the need to handle missing targets explicitly.
Evidence: [Fresh](research/fresh.md#target-identity-and-authority),
[Kakoune](research/kakoune.md#context-is-a-deliberate-choice).
Agreement: [research discussion](notes.md#prior-art-research-2026-10-16).

**Verify:** Closing a target or switching focus before delivery cannot redirect an operation to the new active target.

## ENG-D10: Results belong to the engine, delivery belongs to adapters (2026-10-16)

**Decision:** Engine-owned receipts retain authoritative outcomes independently of transport delivery. Each adapter
observes its own invocations; delivering to one cannot consume another's result. Status reads remain repeatable
until expiry. Handling, background settlement and visible frame completion remain distinct acknowledgements.

**Why:** Fresh explicitly scopes asynchronous result drains by owner; Kakoune's inspected command-send path does not
provide typed completion. Evidence: [Fresh](research/fresh.md#ownership-and-asynchronous-completion),
[Kakoune](research/kakoune.md#two-distinct-surfaces). Agreement: [research
discussion](notes.md#prior-art-research-2026-10-16).

**Verify:** Interleaved clients receive their own results; disconnect and reconnect preserve retained mutation outcomes.

## ENG-D11: Endpoint uncertainty never authorizes cleanup (2026-10-16)

**Decision:** Distinguish absent, incompatible, denied/unreachable and stale endpoints. Inconclusive probes never
authorize deletion; cleanup rechecks ownership and identity. Keep one bounded stream decoder per connection across
handshake and invocation messages, preserving unread bytes.

**Why:** Fresh's control path explicitly handles denied liveness probes and buffered replies. These mechanisms fit
Slipbox's existing proposed transport without another runtime.
[Evidence](research/fresh.md#endpoint-discovery-and-stream-handling).
Agreement: [research discussion](notes.md#prior-art-research-2026-10-16).

**Verify:** Denied probes leave endpoints intact; fragmented and combined frames decode without loss or unbounded
buffering.


## ENG-D12: Bound dependency-backed services and assess isolation (2026-10-16)

**Decision:** Export, typesetting, spelling and parsing have focused service boundaries, explicit inputs and outputs,
resource budgets and cancellation policies. Assess process isolation from input exposure and required authority;
in-process modules, lazy loading and workers are not claimed as security sandboxes. Audit shipped artifacts before
deciding on optional components or smaller distributions. Keep the current single-binary distribution initially.

**Why:** Version pins and audits address reproducibility and known advisories, while malformed content and excessive
resource use require runtime controls. Dependency counts alone do not establish reachable exposure. Evidence:
[dependency review](research/dependency-boundaries.md). Agreement: [service-boundary
discussion](notes.md#dependency-backed-services-2026-10-16).

**Verify:** Each service's limits and failure behavior are exercised; the artifact review distinguishes installed,
shipped and reachable dependencies and records any isolation or packaging follow-up with its evidence.


## ENG-D13: Verify shipped contents and deferred feature loading (2026-10-16)

**Decision:** Derive a normalized package/module/asset manifest from the release build and review changes against a
recorded baseline. New shipped packages and violations of designated startup-loading boundaries fail checks until
intentionally reviewed. Automate package-absence assertions used to justify advisory exceptions. Enforce lazy
loading at feature entry boundaries, allowing static imports inside deferred implementations and type-only imports.

**Why:** Installed dependency closures overestimate some shipped paths and cannot prove absence. A source import
ban alone misses transitive eager loading and rejects valid deferred implementations. Evidence:
[gate review](research/dependency-boundaries.md#gate-review). Agreement: [plan
refinement](notes.md#dependency-plan-refinement-2026-10-16).

**Verify:** Fixtures add an unexpected shipped package and an eager path into a designated heavy feature; both fail.
A deferred feature with internal static imports remains allowed. Artifact-based advisory assertions are checked.

## ENG-D14: Preserve trust enforcement and cover installed tool closures (2026-10-16)

**Decision:** Preserve D172 across every migrated tool/git effect and synthetic-input route. Verify runtime-installed
tool integrity through the frozen installer, and extend advisory review to each built-in tool's pinned closure.
Accepted advisories identify the tool, affected packages, rationale and expiry; one closure's exception cannot
silence another's. Tool execution stays behind the language/tool service and existing guarded runners.

**Why:** Tool lockfiles are separate from the application's audit target, and integrity alone cannot establish safety.
D172 already settles repository-owned code execution; migration must verify enforcement rather than reopen it.
Evidence: [gate review](research/dependency-boundaries.md#gate-review).
Agreement: [plan refinement](notes.md#dependency-plan-refinement-2026-10-16).

**Verify:** Altered tool artifacts are rejected by installation checks; expired or unaccepted tool advisories fail
review. Untrusted roots and connected clients cannot enable repository-selected execution or grant trust.

## ENG-D15: Backend growth stays local and testable (2026-10-16)

**Decision:** ENG improves backend maintainability and verification while preserving product functionality and UI.
Use focused feature owners, explicit integration, reusable fixture/scenario data, controlled dependency ports,
risk-based interaction checks and structural enforcement. Each migration slice names its superseded paths and
removes duplicate orchestration. A small completion checklist covers ownership, contracts, failure, tests and records.

**Why:** Continued feature growth should not require repeated business rules across interfaces or increasingly
broad changes to App and engine wiring. Product breadth and a 1.0 milestone do not determine this migration's scope.
Agreement: [maintainability discussion](notes.md#backend-maintainability-and-testing-2026-10-16).

**Verify:** Migrated features have one authoritative owner, focused tests and adapter checks; representative existing
UI/CLI scenarios remain compatible. Interaction and structural tests detect injected boundary violations.
