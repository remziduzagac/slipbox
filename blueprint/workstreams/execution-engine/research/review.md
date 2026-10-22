---
status: current
created: "2026-10-17"
---

# Review: execution engine workstream

## Scope and method

Three independent read-only reviews covered runtime/contracts, architecture/migration, and blueprint/provenance.
Findings were consolidated, checked against the draft and relevant source/parent sections, then corrected only
inside ENG. Follow-up reviews checked the corrections. This is a design review, not an implementation audit or
proof that every future failure is covered. ENG remains draft; accepted decisions were not rewritten or expanded.

Provenance: *read* for document/source comparisons, *ran* for the checks listed below. Source baselines remain the
local `9b3854c` and inspected D235 split, not assumed current main. Fresh/Kakoune research commits and the cited
source paths were rechecked by the provenance reviewer; neither project was executed.

## Verified findings and fixes

### Mutation ordering and overlapping effects

The original runtime assigned workspace lanes to file writes and checkout/repository lanes to git without shared
exclusion. It also computed before acquiring reservations while promising admitted mutation order. The runtime now
assigns conflicting turns at admission and gives overlapping disk/git effects common working-tree reservations.
One total resource order avoids incremental acquisition. Effect-specific turns keep typing independent of saves;
structural apply protects affected document edits during its effect interval. Plans revalidate before effects and
report partial effects if later prerequisites change. See [runtime](../design/runtime.md#execution-and-concurrency).

### Invocation claim and cancellation

Running previously began at a mutation boundary, which does not exist for queries and follows computation for some
tasks. Claim now occurs at dispatch; first effect is separate. No-effects cancellation requires a confirmed stop
before the first effect. Produced mutations reconcile even if derived results are dropped after cancellation.
The acceptance wording no longer promises no effects before any later commit in a multi-effect operation.
See [completion](../design/runtime.md#admission-execution-and-visible-completion).

### Retry identity, expiry and ownership

Identical-input retry wording omitted operation/source/targets and could re-resolve an active target. Profile
credentials also lacked a distinct reconnect identity. The draft now distinguishes wire message IDs and invocation
IDs, checks canonical operation/input identity before target re-resolution, issues per-client authenticated resume
credentials, and applies ownership/access checks to status/cancel/plan/artifact requests. Bounded retry windows
prevent execution after receipt expiry; receipts remain retained through their valid window. Instance-local
receipts are no longer described as persistent state. See
[tasks/retries](../design/runtime.md#tasks-interruption-and-retries)
and [local socket](../design/interfaces.md#local-socket).

### Session context and observation access

Workspace grants did not define mixed-workspace snapshots/frames or retained-frame revocation. Structured metadata
is now filtered, and captures/text waits require access to represented resources at retrieval. Frames retain scope
provenance; no second redacting renderer is introduced. Input context includes mode/pending sequences; mouse input
binds geometry to a frame, and prompt responses cannot borrow another continuation's authority.
See [session control](../design/interfaces.md#tui-session-control).

### Migration feasibility and preserved behavior

ENG-T2 previously moved all task toggles before ENG-T3 transferred documents. `src/tui/app.ts:4061` distinguishes
dirty memory toggles from clean disk toggles, so that migration claim was premature. T2 now migrates only the saved/
clean path and preserves its bounded synchronous clean-check-to-commit interval. T3 completes live ownership and
deletes the temporary route. The live-edit example now distinguishes memory-only edits from later configured
autosave. Scratch/draft ownership is explicit without requiring a graph for every temporary document.
See [ENG-T2](../roadmap.md#eng-t2-prove-one-shared-read-and-mutation).

### Parent changes and acceptance completeness

Partial MODIFIED requirement sections could discard existing editing, compatibility, plan and skill commitments.
The draft now provides complete new sections and exact Previously baselines, including Non-goals and Quality goals.
The reviewer compared all four baselines with the parent. The design integration inventory explicitly blocks
consolidation until complete reconciled design deltas and accepted exposure amendments exist; D235's ownership
clarification and release/tool evidence are included. Acceptance criteria 21–26 cover dependency budgets, artifact/
loading checks, tool integrity/advisories, trust, ordered mutations, retry identity and scoped observation.
See [requirements](../requirements.md) and [integration inventory](../design/changes.md).

## Verification

- Targeted Markdown lint, spelling and offline local links/fragments passed across all 21 ENG Markdown files.
- Repository `bun run check:docs` passed; `bun run test:docs` passed all 24 tests. No implementation/terminal tests
  were claimed for this design-only change. Parent Previously blocks match the four local source sections exactly.
- Follow-up reviewers found their initial issues resolved. Two residual points, receipt/window retention and
  T2's synchronous clean path, were then explicitly corrected and linked to boundary scenarios.
- Review scenarios are specified in [testing.md](../design/testing.md#review-derived-boundary-scenarios); they are
  future implementation acceptance checks, not tests claimed to exist or pass today.

## Deliberately open

Initial profile/exposure policy, exact CLI syntax/protocol limits, shared undo acceptance, D156 git-session exposure,
headless resident-host timing and migration activation remain listed in [ideas/](../ideas/README.md). Concrete resource
budgets and any process-isolation/packaging choice still need measurements. Parent design replacement text must be
completed and reconciled before consolidation. These are explicit decision gates, not silently selected defaults.

## Second cycle (2026-10-17)

Three fresh independent reviewers checked the revised runtime, session/access, and integration contracts. Findings
below were verified against the draft and, for legacy behavior, current source. Corrections remained inside ENG;
accepted decisions were unchanged. Follow-up reviewers confirmed their findings resolved.

### Host policy authority

Implicit-effect checks and caller-context preservation did not explain configured autosave after a memory-only
client edit. The runtime now gives autosave a disclosed host-policy owner, separate from requested child effects.
Discovery exposes that policy, and the client gains neither direct-save permission nor authority to change it.
Configured diagnostics/other autonomous services follow the same explicit owner rule. Scope/trust are rechecked.

### Tasks, timeouts and retained results

A handled launch receipt could expire while its child task still ran. Tasks now pin their launch receipt and client
resume identity until settlement; terminal retention starts after the last child settles. Managed-artifact expiry
is distinct from user export destinations and recovery evidence. Response-wait expiry and execution-budget expiry
now have separate semantics, retaining queued cancellation and never extending work through status/reconnect.

### Mixed-origin session control and all observation channels

Pending key/count sequences previously tracked context but not authority across origin changes. Incompatible
cross-origin completion now cancels the incomplete sequence; prompt continuations retain the intersection of
initiating and responding grants. A final human key cannot promote a synthetic prefix. The observation rule now
covers action results/choices, overlay events, availability explanations and content-bearing host effects, closing
the gap left by snapshot/capture-only wording. Queued delivery also rechecks access.

### Mixed live/disk language edits

`src/tui/app.ts:1888` applies text edits with one undo group per file; shown or already-dirty targets stay in memory,
while unshown clean targets save. The draft specified disk-plan refusal for dirty documents but omitted this mixed
coordinator. It now captures per-target revisions and persistence disposition, validates all targets before effects,
uses complete reservations and reports partial disk failures without rolling back subsequent text. The session
adapter invalidates stale shown-state context through the existing signal, avoiding callbacks into App. Unsupported
LSP create/rename/delete support is not added. T5, acceptance criteria and scenarios cover preserved behavior.

### Persisted plans and canonical text contracts

`src/core/plans.ts:13` stores saved plans in user state; `src/cli/cli.ts:2172` loads them in a later invocation.
Generic client ownership wording did not explain this cross-process contract. Saved CLI plans now retain user/state
ownership; connected plans retain scoped ownership, and live plans cannot survive restart as silently converted
saved-only plans. Range-read continuations bind expected versions, and canonical edit batches define half-open
UTF-16 ranges, overlap rejection and same-offset insertion order matching current LSP application.

### Verification and remaining gates

Follow-up runtime, access and integration reviews found their confirmed issues resolved. Matching scenarios and
acceptance criteria 27–31 were added. Targeted lint, spelling, local links, all four exact parent baselines
and repository `check:docs` passed.
All 24 docs tests passed; these are documentation checks, not execution of proposed engine scenarios. The deliberate
open choices listed above remain open, including full parent design deltas before eventual consolidation.

## Third cycle: different angles (2026-10-17)

Three independent reviews focused on actual workflow compatibility, failure/resource liveness, and implementation
practicality rather than repeating the earlier contract checklist. Findings were checked against source and the
current draft, then corrected only within ENG. Follow-up reviews confirmed the original findings resolved; the
remaining plan-claim recovery clarification was also applied. Accepted decisions and open policy choices remain
unchanged.

### Existing workflow compatibility

`src/core/plans.ts:4` describes managed plans as apply-once, and `src/cli/cli.ts:2191` removes one after successful
application. The draft now explicitly consumes a managed plan independently of invocation retry identity, excludes
concurrent claims across embedded CLI processes, and leaves dry-run non-consuming. Partial/interrupted plans need
inspection. A confirmed pre-effect refusal returns the claim to ready only after a successful recorded release;
inconclusive claims cannot be reclaimed merely by age or PID.

`src/tui/app.ts:9638` saves dirty nonvirtual buffers for disk handoffs; export invokes it at line 9942. External-editor
handoff at line 4147 saves only its selected target. Generic preparation wording did not preserve these scopes under
asynchronous saves. The shared prerequisite coordinator now returns revision/fingerprint evidence, checks the
required dirty set immediately before handoff, and aborts on a refused/stale prerequisite while reporting saves
already completed. Standalone saved CLI behavior remains D17's; direct live operations retain their declared source.

### Failure and storage liveness

Bounded recovery evidence now has an admission rule: reserve capacity and persist initial intent before effects,
refusing safely when unavailable. A later record failure stops new effects and preserves earlier intent instead of
evicting uncertain evidence. No durable task queue or guaranteed power-loss recovery is implied.

Shutdown now performs the existing dirty-text/exit preflight before irreversible disposal. Refused/cancelled quit
leaves the engine operational. Once close is committed, a bounded grace/drain policy handles stuck owned tools,
termination and reconciliation. Uncertain resources remain unavailable for mutations; the design does not release
reservations while writes may still occur or claim a successful safe stop on unsupported platforms.

### Finite tasks versus resident services

`src/core/servers/manager.ts:61` separates readiness from the running client, and line 169 waits for startup rather
than the process's full lifetime. The design now does the same: finite install/start/readiness tasks settle at
ready/failure, and resident processes transfer to the language-service owner. Launch receipts expire normally;
queries retain individual deadlines and service disposal/idle/crash policy controls persistent processes.

### Verification

Acceptance criteria 32–36 and matching compatibility/failure scenarios now cover these corrections. All three
follow-up reviewers confirmed their findings resolved without another architecture layer. Documentation lint,
spelling, local links, all four exact parent baselines and repository `check:docs` passed. All 24 docs tests passed;
these are design checks, not execution of the future engine scenarios. No code, parent blueprint or other workstream was
edited.
