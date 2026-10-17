# Verification architecture

Research-based choices in this part follow ENG-D7 through ENG-D11; see [decisions](../decisions.md).

Use the smallest layer that proves each contract. Reuse scenario data across clients while keeping assertions
about distinct boundaries:

| Boundary | What it proves |
| --- | --- |
| Core domain tests | Parsing, diff, ranges and other computations preserve their invariants |
| Execution and engine tests | Preconditions, revisions, effects, cancellation, retries and recovery |
| Composed TUI on a test Canvas | Real actions/input change session state and produce the expected frame |
| Socket tests against those hosts | Framing, discovery, caller context, disconnect and resynchronization |
| CLI adapter tests | Generated argument bindings, legacy envelopes, stdin and exit codes |
| Real terminal checks | Terminal input encoding, modes, OpenTUI integration and presented output |

A headless application host composes only engine operations. A headless UI test host composes the actual TUI
controllers, input dispatcher and drawing over the existing Canvas boundary, with fixed dimensions. It provides
the same session operations as a live host; no test-only action handler or second renderer is introduced. Text/cell
captures and structured session snapshots are both supported. Terminal-only facilities report unavailable.

Use temporary files and explicit dependencies for clock, identifiers and process execution. Pause at read,
revalidation, write, event-queue claim and frame-commit boundaries with controllable barriers. Prove that a queued
request cancelled before claim never runs after the loop resumes, and that an already-claimed action is not falsely
reported as having no effects. Test response loss/retry, human focus changes between input items and frame expiry.
Inject failures around recovery recording. Prefer state/frame conditions to timing sleeps.

Automated hosts isolate configuration, state, cache, tools and clipboard. Interactive hosts retain normal clipboard
behavior. Captures go to caller-approved output paths or bounded response data, with document access checked; they
are not automatic logs of note content. Fixture dimensions and fake external services keep tests reproducible.

Test two clients with interleaved completions: each gets its own result, disconnecting one leaves the other's
receipt intact, and reconnection can inspect the retained outcome. Close a target before deferred execution and
prove no operation falls through to the newly active view/workspace. Exercise denied endpoint probes without
unlinking files, and coalesced handshake/reply frames without losing buffered bytes.

Adapter tests verify named-action coverage against the shared descriptors. Real sockets test fragmented/oversized
messages, client permissions and slow subscribers. Keep TT's actual terminal coverage; simulation cannot establish
terminal protocols or external-tool compatibility. Do not repeat the same assertion at every layer.

Measure cold CLI startup, per-edit engine cost, event fanout and responsiveness during indexing/export in the first
slice. Keep rendering work coalesced and heavy work in the existing workers or asynchronous tasks. The module split
must retain behavior; the engine change is separately verified against the baseline rather than blessed by snapshot
updates alone. Checks should fail on adapter imports of engine internals and missing catalog/action bindings.

## Lifecycle, scheduling and shared models

For each owner, test disposal with work in flight and results queued for delivery (ENG-D1, ENG-D3, ENG-D6). Close and
reopen the same path, then deliver the old result: it must not update the new lifetime. Check that timers and
subscriptions stop, disposable jobs cancel, and accepted mutations retain an owner and settle their receipts.
Revocation tests preserve caller identity through deferred effects and prevent later unauthorized delivery.

Use the fake clock and controlled delivery queue to test the three scheduling policies independently (ENG-D2).
Advance time under continuous query changes and resource invalidations: obsolete queries cannot replace current
results, same-resource refreshes eventually complete and start the newest pending refresh, and explicit mutations
retain their order. Queue a valid result, change its prerequisites, then release delivery to prove the second
applicability check. Failed delivery must permit a later refresh rather than leave a permanently fresh cache.

Shared diff/anchor tests prove the canonical model's invariants (ENG-D4). Use representative fixtures in each
existing surface to prove it consumes that model while preserving its own navigation and actions. These tests do
not require unfinished merge-screen features or a new universal diff widget.

## Stateful randomized interaction

Exercise real engine/session handlers with seeded sequences of typing, undo, saves, resizing, tab changes,
external file events, cancellation and disconnects (ENG-D5). Use temporary copies of the reference set, fake tools
and controlled clocks/queues. Begin with a small bounded run; extend coverage based on discovered failures rather
than introducing a new testing platform.

Check invariants after each step: stale edits change nothing; unrelated documents are untouched; dirty text is not
silently lost; saved baselines correspond to completed writes; closed owners receive no updates; queues remain
bounded; effects and receipts agree. Detect hangs as well as exceptions with a bounded watchdog outside the owner
loop, so a blocked loop cannot also block the watchdog.

A failure artifact records the seed, bounded action sequence, relevant revisions, controlled delivery order and
failing invariant. Replaying uses that recorded order; a seed alone does not promise deterministic external timing.
Reduce a failing sequence to a focused regression before fixing it. Traces use only synthetic/reference fixtures,
not a person's notes, prompts or session history. Logs stay in temporary test output or uncommitted attachments.


## Dependency-backed service checks

For each migrated service, test admission limits, bounded queues, oversized outputs, cancellation, stale delivery
and cleanup using controlled dependencies (ENG-D12). Add representative malformed and excessive-complexity fixtures
at the real dependency boundary where its behavior matters. Prove that failure leaves documents and export
destinations intact. Verify owner-loop responsiveness while heavy work is active.

Separate cooperative cancellation checks from termination checks. A child-process implementation needs crash and
forced-termination tests; an in-process implementation must not claim those guarantees. Use synthetic fixtures
and bounded runners, never uncontrolled resource-exhaustion tests on the developer's machine.

The release-artifact review records runtime versus development dependencies, bundled modules/assets/native or WASM
components, automatically reached paths versus explicitly invoked features, and package versions. Inspect actual
build outputs rather than inferring contents from lockfile counts. Existing dependency gates remain; this design
adds no automatic claim that a clean audit establishes runtime safety.


## Artifact, loading and installed-tool evidence

Follow the release-build checks in [the migration plan](../roadmap.md#eng-t6-automated-release-evidence) (ENG-D13).
Use fixtures proving unexpected package membership, transitive eager feature imports and violated absence assertions
are detected. Type-only imports and static imports inside deferred feature modules are allowed. Distinguish code
included in the executable from code initialized at startup, and test worker entry points independently.

Installed-tool tests cover frozen integrity validation and advisory policy for each pinned closure (ENG-D14).
Use controlled advisory responses to test unaccepted, expired and closure-scoped exceptions without relying on live
advisory timing. Run real advisory review separately on lock changes and the upkeep schedule. Test mismatched
artifact integrity through the actual installer boundary using local fixtures; a hash string in a lock is not proof
that installation rejects changed bytes.

Preserve D172 with negative tests for repository-selected tools/settings and guarded git effects in untrusted
roots, including connected actions and synthetic input. Reuse current trust fixtures and update them for each
extracted owner; do not introduce a second trust policy in socket or CLI adapters.

## Reusable scenarios and interaction coverage

Keep fixtures and scenario intent reusable across engine, CLI, socket and composed TUI tests (ENG-D15). A scenario
sets up synthetic documents/resources, describes actions and states semantic expectations. Thin test drivers adapt
those actions to the real public entry points. Start with ordinary helpers and shared fixture data; do not create
a general scenario language or production dispatcher for tests.

Exercise domain rules thoroughly at their owner. Adapter suites prove argument/output mapping, identity propagation
and representative end-to-end behavior rather than duplicating every domain edge case. TUI tests additionally
assert focus, anchors and frames; terminal tests retain encoding and host-integration assertions. Not every scenario
must run through every interface, especially where exposure intentionally differs.

Maintain a small interaction matrix in the test suite for known shared-state boundaries: editing with watcher
changes, rename with dirty documents, git/HEAD changes with live documents, disposal with queued delivery, and
cancellation/disconnect with admitted effects. Each entry names the invariant, participating owners and scenario
that proves it. Extend this matrix when a feature introduces another shared-state interaction; do not attempt every
possible feature pair. Seeded stateful checks complement these deliberate cases (ENG-D5).

## Structural checks and check cadence

Extend existing boundary, size and registration checks to reject forbidden imports, missing action bindings,
duplicate operation IDs and unintended eager loading. Fixtures prove each new structural rule detects a violation;
checks enforce actual dependencies/contracts rather than matching arbitrary naming conventions (ENG-D15).

During development, run checks for changed owners and adapters. Before proposing a change, run the repository's
required complete checks, using the established docs-only path where applicable. Keep deterministic tests isolated
and suitable for parallel execution. Live external-tool, advisory and platform integration checks run in their
appropriate CI/scheduled suites under existing approval rules; test substitutes never stand in for release evidence.
Record suite purpose and invocation beside the tests so focused checks are easy to discover. Focused local runs do
not replace required final validation. Avoid new check orchestration tooling until the existing commands need it.


## Review-derived boundary scenarios

- Reverse computation completion for two admitted mutations; effects retain their conflicting admission turns.
  A save and pull/checkout in nested vaults of one checkout share disk exclusion, while typing during save remains
  responsive. Structural apply prevents an affected document becoming dirty between validation and effects.
- Cancel before dispatch, during pre-effect computation and after a first multi-file effect. Receipts distinguish
  no execution, confirmed no effects and partial effects. Already-produced effects still reconcile after disposal.
- Give two clients one profile and identical invocation IDs. Their outcomes remain separate; valid reconnect resumes
  the original identity. Forged resume and cross-owner status/cancel fail; expired-window retries never execute.
  Retain receipts throughout valid retry windows and verify capacity refusal rather than unsafe eviction.
- Retry after active focus changes: return the original admitted target. Reusing an invocation ID for another
  operation/source/target fails before effects. Canonical object-key order does not create a new invocation.
- Render two workspaces with different grants; filter structured metadata and refuse unauthorized frame/text reads,
  including retained frames after revocation. Stale mouse geometry, pending key context and unrelated prompt
  responses fail without redirecting effects or borrowing another caller's authority.
- Preserve T2's synchronous clean-toggle route; after T3, inject a clean-to-dirty transition before commit and prove
  no disk toggle overwrites live changes. Confirm memory-only edits respect subsequent configured autosave.


## Second-review boundary scenarios

- Trigger configured autosave with a memory-edit-only client; verify disclosed host policy owns the save, direct
  save remains denied, and policy disable/conflict blocks later automatic writes. Preserve triggering attribution.
- Let an export task outlive the launch response and retry window. Reconnect to the same task, then verify terminal
  task/artifact expiry is explicit and successful user-destination exports remain. Never repeat completed effects.
- Distinguish queued response timeout, running response timeout and execution-budget stop; status/reconnect cannot
  restart or extend the original execution budget.
- Apply a text-only LSP edit to a dirty shown document and an unshown clean file. Check memory/save disposition,
  per-document undo, all-target stale refusal and partial disk failure without silent rollback. Change shown state
  after preview and require disposition refresh before effects. Unsupported resource changes are not claimed applied.
- Complete a synthetic prefix/count with a human event and answer a stronger-origin prompt with a weaker client.
  Neither path elevates effective authority. Check session choices/results/events as well as frame access, including
  revocation while a result is queued and content-bearing clipboard effects.
- Read successive text ranges with an intervening edit; expected-version continuation fails. Same-offset insertion
  batches retain input order and malformed/overlapping edits make no changes.

- Create a saved-only plan in standalone process A and apply in process B. Current fingerprints/access still govern
  application. Connected plan ownership remains scoped; invalidated live plans cannot fall back to saved files.


## Third-review compatibility and failure scenarios

- Apply one managed plan concurrently with distinct invocation IDs, including separate embedded CLI processes.
  Only one claims it; dry-run preserves readiness, success consumes it, and partial state rejects ordinary reapply.
  Confirmed pre-effect refusal returns a recorded claim to ready; an interrupted claim requires evidence-based
  inspection rather than automatic stale-PID/age cleanup.
- Fill the recovery quota and inject an initial-record failure: no mutation begins and existing evidence remains.
  Inject a progress-record failure after one effect: further effects stop and earlier intent supports inspection.
- Refuse/cancel quit with a dirty document and pending refresh/save, then edit/save successfully. Committed close
  cannot resume a partly disposed engine. An unresponsive fake tool exercises graceful drain, escalation and failed
  reconciliation; mutations remain blocked while that resource is uncertain.
- Start a server, settle readiness, expire its launch receipt and make a normal query. The resident owner still
  works and later disposal stops it; no launch task occupies admission capacity for the server's full lifetime.
- During handoff saves, change a required document or add another dirty document. Final readiness fails rather than
  claiming current text was saved. Check all-dirty nonvirtual scope for legacy context/export versus one-target
  scope for external-editor handoff; required-save failure aborts while reporting already-completed saves.
