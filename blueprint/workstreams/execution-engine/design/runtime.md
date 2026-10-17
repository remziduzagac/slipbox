# Execution, documents and lifecycle

Research-based choices in this part follow ENG-D10; see [decisions](../decisions.md).

## Execution and concurrency

The shared path is: validate input, establish identity and scope, check access, capture inputs, compute, acquire
the required mutation reservation, revalidate prerequisites, commit, reconcile state and publish a result.
Read operations do not acquire mutation reservations. Expensive computation happens outside them.

For ordered mutations, assign a turn at admission for each declared conflicting resource, before asynchronous
computation. Computation can overlap, but effects wait for earlier admitted turns to settle or be cancelled. Resolve
resource scope first; if computation discovers additional resources, refuse/re-plan with the expanded scope rather
than acquire them out of order. Bounded admission prevents unbounded waiting. Conflicts are effect-specific: a save
reserves disk mutation turns,
not the document's memory-edit turn, while structural apply reserves both. Thus save ordering cannot queue ordinary
typing behind I/O. Unrelated resources have no shared turn.

Use a small scheduler with explicit resource reservations, not one global queue:

- A memory edit is an immediate, bounded mutation of one document, requiring its expected revision. In-process
  typing uses the same edit primitive directly through the public typed facade, without JSON serialization, a
  socket round trip or a job per key. It cannot bypass revision or access checks.
- Writes and structural operations reserve affected workspace lanes and the working-tree lane of every overlapping
  checkout. Git mutations reserve the same working-tree lanes and, when shared refs/metadata are affected, the common
  repository lane. Nested vaults in one checkout therefore conflict with a pull/checkout despite distinct workspace IDs.
- Acquire the complete reservation set in one total order: common repository, checkout working tree, workspace,
  then document, with stable IDs within each kind. No incremental acquisition or recursive dispatch while holding
  lanes. This intentionally serializes overlapping disk/git effects initially; refine only if measured.
- Reads and live typing can continue during slow git or I/O tasks. A save requiring a reserved lane returns busy
  or waits with a deadline according to its contract; autosave defers. It never freezes the input loop.

Reservations cover the full effect and authoritative reconciliation interval, not only process launch. Memory edits
do not ordinarily need a disk lane. Save permits later typing against the captured revision. Structural plan apply
also reserves affected document edit turns during its effect interval, preventing a clean document from becoming
dirty after plan validation; return busy/defer edits to those documents while other input remains responsive.
Git work permits later typing but reconciles disk changes against the then-current live text, preserving new dirty
text as a conflict instead of reloading over it. Revalidate before each irreversible effect; a change after an earlier
effect produces partial completion, not an assertion that nothing happened.

Reservations coordinate this engine only. Other instances, editors and git processes remain external writers.
Recheck file identities, fingerprints, buffer revisions and git state at the effect boundary. Existing filesystem
fingerprints and `--if-unchanged` behavior do not provide a general atomic compare-and-swap against arbitrary
external writers. Document this limit; adding a lock file would not make other programs cooperate.

### Service and client lifetimes

Every service instance has a lifetime identity separate from its workspace path or document revision (ENG-D1,
ENG-D3). Closing and reopening the same path creates a new lifetime. The owner registers its timers, subscriptions,
callbacks, background jobs and tool processes explicitly; this is local resource bookkeeping, not a global service
locator or dependency framework.

Ordinary host shutdown first performs the existing dirty-text and handoff/exit preflight while the engine remains
operational. A refused or cancelled quit leaves admission, subscriptions and owner lifetimes intact. Only after
preflight accepts shutdown does irreversible close begin; do not resume partially disposed owners if later drain
fails. Workspace/service close likewise resolves its dirty/active-resource prerequisites before disposal.

Closing is idempotent: stop admitting work, invalidate the lifetime, remove subscriptions and timers, cancel
disposable work, settle already-started mutations and close tools/resources. Queued deliveries check the invalidated
lifetime even if their work has already finished. Closing a service must not merely hide its UI while leaving its
jobs able to apply results.

Client-owned observations and engine-owned mutations have distinct lifetimes (ENG-D6). A connection ending cancels
its waits and subscriptions; an accepted save or git mutation retains an engine owner until it settles, with the
original caller identity and inspectable receipt. Revocation prevents further effects and delivery under that
grant, without pretending an already-started effect was undone. Future extension owners use these same rules.

### Background scheduling and result delivery

Use a small scheduling helper for background computations, separate from mutation reservations and invocation
receipts. Each feature selects an explicit policy (ENG-D2):

| Kind of work | Scheduling policy | Example |
| --- | --- | --- |
| Query for changing input | Replace obsolete work and deliver only the current query's result | Search, hover |
| Refresh of one resource | Finish active work; retain at most the newest pending refresh | Repository status |
| Explicit mutation | Preserve admitted order per conflicting resource and every outcome | Save, stage, commit |

Debouncing may defer a refresh but has a maximum wait; continuous input must not postpone all progress. A resource
identity change invalidates its refreshes rather than applying the old resource's result. A same-resource
refresh can publish a version-tagged, explicitly dated snapshot while the next refresh is pending. It cannot mark
a newer invalidation satisfied by an older observation. Mutations are never dropped by latest-request scheduling.

Work uses immutable captured inputs. Before scheduling, record the owner lifetime, resource identity and relevant
document, query, configuration or git revisions. Recheck applicability on the owner loop immediately before
delivery, not only when computation finishes (ENG-D3). A result can become stale while queued. Drop obsolete
observations; if a mutation already produced effects, reconcile those effects and settle its receipt instead of
discarding its outcome.

Clock, background executor and delivery queue are explicit test dependencies. Closing, cancellation and a failed
delivery are distinguishable; failed delivery must not leave a resource permanently deduplicated or marked fresh.
Do not expose these scheduling mechanics as a general remote workflow language.

### Dependency service budgets and failure containment

Each dependency-backed service has a host-configured budget (ENG-D12): input size, appropriate structural complexity
or expansion limits, output size, concurrent work and queue length, cache retention and elapsed time. Examples are
source bytes and parse depth, formula expansion/output, spell batch size, and export pages/assets/output bytes.
Choose concrete defaults from reference fixtures and measurements; do not impose one arbitrary limit on all formats.
Workspace data cannot raise host ceilings. Return a structured limit failure identifying the exhausted budget.

Validate limits before admission and during incremental work where supported. Keep synchronous heavy computations
off the UI owner loop. Cancellation of queued work prevents execution; running cancellation uses declared safe
boundaries. A timer around synchronous in-process code cannot guarantee interruption or bound its memory use.
A feature requiring a hard deadline must use an execution host that can actually terminate that work. Check result
size and applicability before delivery, and reject late derived results after cancellation or owner disposal.
Already-produced mutation effects must still be reconciled and recorded by their retained engine owner; dropping
an observation cannot hide a completed write.

The feature owner cleans temporary outputs on cancellation/failure. Export commits only completed output through
its guarded writer; a dependency failure cannot replace a destination with partial bytes. Report completed effects
and cleanup failures accurately. Do not automatically retry deterministic malformed input. Existing parsing fallback
and unsupported-format behavior remain explicit feature policies, with failures contained to the affected request.

### Edits and undo

A live edit supplies expected revision and source ranges against that revision. Ranges are zero-based half-open
intervals in the captured source; all edits in a batch address that same version. Reject overlapping replacements
before mutation. Multiple zero-length inserts at one offset preserve input order, matching current LSP previews;
apply edits from the end or use an equivalent change-set computation. The LSP adapter converts its line/character
ranges using the negotiated encoding and existing end-of-line clamping policy, then validates the canonical batch.
Engine ranges use one documented
offset convention, UTF-16 code units to match existing string/LSP usage; conversions to byte ranges stay at the core
file-edit boundary. Validate ranges, overlap, surrogate boundaries and replacement text before applying anything.

An accepted connected edit is one undo group, labeled by origin. A TUI insert session can group its own consecutive
edits, but cannot absorb an intervening external client's edit into that group. Undo affects shared document history;
it is not selective undo for each client. It advances the revision like any other edit. Reject stale calls instead
of automatically transforming ranges. Collaborative transformation is outside scope.

Changes include source edit ranges so each view can update its own anchors. Layout coordinates never enter document
contracts. Changes derived asynchronously, such as syntax or diagnostics, apply only to their input revision.

### Mixed live/disk language edits

A focused workspace-edit coordinator uses documents/changes for the currently supported LSP text-edit subset.
Preserve the current per-target persistence policy: shown or already-dirty documents change in memory; unshown
clean targets are edited and saved. The TUI supplies explicit shown-document IDs as request context, so the engine
never reads App or infers visibility from global state. Capture each target's source revision/fingerprint, language
version when supplied, and memory-only versus save disposition when previewing; revalidate all before first effects.
The session adapter binds shown-state generation to the invocation's existing invalidation signal and invalidates
it on a relevant visibility change before first effects. Recheck that signal with document prerequisites on the
owner loop; the application service never calls back into App. Once effects start, keep the recorded disposition
and report any safe stop as partial rather than choosing a new save policy mid-apply. A stale generation requires
refresh rather than silently saving a newly shown document.

Reserve the complete affected document set plus disk lanes for saved targets during apply. Validate every target,
range, access and prerequisite first; stale input refuses the entire batch before effects. Apply each document's
edits as one undo group, preserving existing per-document history rather than promising global multi-document undo.
Dirty memory targets are valid for this coordinator; the disk-only rename plan's dirty refusal is a separate policy.

Memory edits can be committed together on the owner loop, but mixed disk saves are not atomic with them. Retain
recovery/progress identifying changed documents, completed saves and pending effects. On a later disk failure, stop,
preserve unsaved results, report partial completion and never roll back over subsequent edits. Resource operations
(create/rename/delete) remain outside the supported LSP subset; do not claim they applied or expand their support
as part of backend extraction. Preview/confirmation and source-edit behavior remain the existing TUI workflow.

### One save and reconciliation path

Move the responsibility of `App.writeBuffer` into documents/storage orchestration. The TUI delegates to it during
migration; no second writer is introduced. Saving captures a revision and serialized bytes, checks the disk baseline,
uses the existing guarded atomic writer, registers the exact own-write fingerprint, updates the saved baseline and
notifies the graph, search and language-server services.

If typing advances during asynchronous saving, mark only the captured text as saved; newer text remains dirty.
Applying save-format rules is an explicit document edit with its own revision. Ordinary save preserves encoding,
permissions and existing invalid-UTF-8 refusals; byte-preserving operations such as a clean checkbox toggle keep
their current special handling.

Configured autosave is a host-owned policy with its own scoped save authority, not inherited client authority.
A document-edit grant permits memory edits under that disclosed policy: it is not a promise that changed text will
never reach disk. The edit cannot alter autosave settings or gain direct-save permission. Discovery/live snapshots
state whether autosave applies; the timer rechecks document state, disk baseline, current host policy and trust.
Record both the host-policy origin and triggering edits. Turning autosave off or encountering conflict suppresses
future automatic saves as today. Other autonomous services follow the same explicit owner rule, not arbitrary
privileged event handlers. Tests cover memory-edit-only clients with autosave enabled and disabled.

A write can succeed while graph refresh or a notification fails. Report the disk write as completed with a warning,
mark the derived service stale and schedule reconciliation. Never report a generic failure that invites repeating
the file write. Publish the content change after its authoritative state is updated; indexing can finish later.

Watcher observations enter the same reconciliation service as own writes. Match own writes by the actual written
fingerprint, not only by path or a time window. Clean documents reload with undo and anchor behavior preserved.
Dirty documents keep local text, capture the disk alternative and enter conflict. Keep/load/merge/overwrite are
explicit transitions; the TUI decides when to show their prompt. Keep suspends autosave as today. An overwrite
choice is bound to the observed disk and document revisions and is checked again before writing.

HEAD changes and index locks retain `VaultFeed`'s batching rules. A branch change invalidates plans and derived
results tied to the old HEAD. It does not silently move an agent invocation into the newly selected workspace.

### Plans and multi-file effects

Reuse existing change plans and logs, with a shared checked-apply coordinator. A plan records workspace/file
identities, input fingerprints, intended effects and required choices. Live plans additionally bind document
revisions. Destination absence, vault boundaries and checkout assumptions are prerequisites too.

Saved-only CLI plans belong to the local user's state namespace, preserving separate plan/apply invocations across
short-lived engine processes (D63). Apply resolves current workspace identity and access, then validates stored
fingerprints; a process-local workspace handle is not a persistent plan prerequisite. Connected-created plans retain
caller ownership unless explicitly shared by host policy, and possession of a local plan ID grants no connected
access. Live plans additionally bind engine/document lifetimes: restart or close invalidates them rather than
silently reinterpreting their inputs as saved files. Recovery inspection can use persisted before/after evidence,
but applying new effects requires current authority and revalidated inputs.

Planning is read-only apart from retaining the plan in slipbox's state. Applying rechecks every prerequisite before
the first effect. Dirty-document refusal concerns documents owned by that resident engine; an ordinary embedded
CLI retains D17 and never treats another instance's dirty advisory as a lock or authoritative live state. Initially a
disk plan touching dirty live documents is refused with the files listed; adapters
can save or discard them explicitly and re-plan. Do not silently save all buffers to make a rename succeed.

A successful rename follows document identity to its new path and updates graph ownership and view notifications.
Deleted or moved documents with unsupported live state are refused before effects. Restore and undo check current
content before replacing it; undoing an old plan must not overwrite later work.

Multi-file changes are not atomic. Before applying, retain a bounded apply record and recovery inputs in state,
reusing the existing rename log where possible. Record completed effects and next steps; stop on failure, report
partial completion and require inspection before recovery. Recovery validates current content before restoring;
it never blindly rolls back over outside edits. A crash after a write but before recording it requires comparing
the recorded before/after fingerprints. No generic transaction framework is needed.

Plan application has an explicit lifecycle: ready, applying, applied/consumed or partial/recovery-required. Dry-run
inspects without consuming. Claim plan identity before effects, separately from invocation IDs, so concurrent applies
or new invocation IDs cannot reuse a managed plan. Saved CLI plans need a plan-scoped atomic claim in user state
across standalone processes; an in-memory engine lane alone is insufficient. A successful apply consumes the ready
record, preserving current CLI removal behavior. A confirmed pre-effect refusal releases the claim back to ready
only after that release is recorded successfully. Interrupted or inconclusive applying claims require inspection
of retained intent; age or PID disappearance alone never authorizes reclaiming one. A partial plan cannot be normally
reapplied; inspect/recover or
create a newly reviewed plan from current inputs. Lost responses never turn consumed plans back into ready plans.

Reserve recovery capacity and persist required initial before/after intent before effects. If quota or state-storage
writing fails, refuse without beginning those effects; never evict unresolved evidence to admit another mutation.
Record each next intended effect before executing it. If post-effect progress/finalization cannot be recorded, stop
new effects, retain the earlier intent and report partial/unknown outcome with reconciliation required. Storage can
fail despite free-space estimates; the apply protocol must handle that case rather than claim guaranteed recording.
Resolved records can be cleaned under an explicit retention policy; uncertain records require inspected resolution.
This is bounded operation-specific recovery state, not a durable execution queue or universal transaction system.

### Tasks, interruption and retries

Short queries and edits finish directly. Indexing, exports, tool acquisition/startup and remote git use finite task
records: task ID,
operation, workspace, status, bounded progress, result and cancellation availability. A normal CLI waits and maps
the final result into its existing output; connected clients may inspect the task separately.

Tool install/start/readiness tasks settle when ready or failed. A successfully started persistent language-server
process then belongs to the language-service owner, not to an indefinitely running launch task. Readiness receipts
can expire normally while the server remains usable. Individual requests retain deadlines; the process lifetime
uses existing idle/disposal/crash-restart policy and does not inherit a completed launch request's execution timeout.
The host service still requires configured scope/trust authority and bounded process counts.

A response-wait deadline ends the caller's wait: if unclaimed, cancel queued execution; after claim, return an
inspectable running receipt without automatically stopping the task. A separate execution deadline requests safe
cancellation under the operation's declared budget. The reply deadline never promises no effects from running work.
Polling, retries and reconnects do not extend or restart that execution deadline; host-configured task ceilings still
apply. CLI waiting maps these states deliberately instead of reporting an unconfirmed timeout as a failed write.

Cancellation removes queued work and stops computation before effects. After effects begin, stop only at a declared
safe boundary and report completed effects. Killing a git process does not mean git rolled back: inspect HEAD,
index and merge/rebase state before reporting. If inspection fails, report an unknown outcome with reconciliation
required. An execution deadline follows the same rules; it is not a promise of no effects.

Resident hosts retain bounded receipts keyed by authenticated client identity and invocation ID. A retry lookup
precedes active-target resolution. Compare the operation ID, original arguments, source/options and explicit target
handles; return the original admitted target identities and receipt, never re-resolve active state on retry. Changed
operation or input under the same ID is refused. Canonical equality is defined from validated values, not JSON key
order; deadline/status polling does not change the original operation's identity. Publish the receipt retention limit at
connection. This prevents duplicate execution during that lifetime, not exactly-once execution across crashes.
Use bounded host-issued retry windows tied to the client and instance. A retry whose window expired can read a
still-retained receipt but cannot initiate execution if that receipt is gone; return expired/unknown outcome.
A new window does not authorize automatic replay of an uncertain mutation. After restart, inspect or re-plan writes
with uncertain outcomes; never automatically replay them.

A handled invocation that starts engine-owned tasks retains its originating receipt and authenticated client record
until every admitted child task settles, even if the launch request's retry window closes. Repeating that invocation
returns the same task handle, never starts it again. Advertise bounded terminal task/result retention and explicit
expiry; account for these records in admission limits. Revocation stops unauthorized status/delivery without
orphaning already-started mutations. Closing a connection cancels its observation, not this ownership link.

Artifacts distinguish managed temporary outputs from caller-owned export destinations. Managed artifacts have
advertised retention and cleanup; expiry returns an explicit missing/expired result rather than rerunning a task.
Task/receipt expiry never deletes a successful export at a user-selected destination. Uncertain recovery inputs
remain with the bounded recovery record until resolved; do not silently expire them as ordinary task output.

The engine owns receipt completion; each adapter registers observation of its own invocations. Delivering a result
to one adapter never destructively consumes another adapter's outcome. Repeated status reads are safe until expiry;
connection delivery acknowledgements do not alter the authoritative operation result.

Keep active invocation receipts until they settle; refuse new admission at the configured capacity rather than
evicting running work. A completed receipt cannot expire before its admitting retry window closes; capacity limits
include that retained state. Refuse new admission rather than evict a receipt that still prevents duplicate execution.
For task-launch receipts, terminal retention starts when the last admitted child task settles, not when the launch
handler returns. Completed receipts then expire after their advertised retention window. Client identity survives
reconnection within the instance, so reconnecting does not create a new retry namespace for the same request.

After committed close begins, use a host-configured bounded drain/grace period for admitted work. Request graceful
stop, then terminate owned worker/process trees where supported. Do not release conflicting reservations as safely
settled while a process may still write. Reconcile after termination; if effects cannot be established, mark those
resources uncertain and refuse further mutations until inspected. A bounded drain can report unsettled/unknown
outcomes rather than pretending every task completed. Platform inability to terminate descendants is an explicit
limit, not a successful safe stop. Forced exit retains current data-loss semantics and no restart replay promise.

On disconnect, cancel connection-owned queries; let accepted mutations settle or reach a safe stop, retaining their
receipts. Engine-owned background jobs continue. Shutdown closes admission and subscriptions, reconciles or reports
unsettled mutations under the drain policy,
stops workers/servers where possible and disposes resources. Dirty text blocks ordinary TUI shutdown under the existing
policy;
forced exit retains today's data-loss meaning. There is no new recovery autosave implied by this design.

### Admission, execution and visible completion

Use the same invocation lifecycle for application and session requests:

| State or acknowledgement | Meaning | What the caller can conclude |
| --- | --- | --- |
| Queued | Validated and waiting; handler has not claimed the request | Cancellation can guarantee no effects |
| Running | Handler claimed it at dispatch, including computation | A deadline alone cannot guarantee no effects |
| Handled | Immediate operation finished, or a UI action routed successfully | Inspect outcome, choices or task IDs |
| Frame committed | Renderer committed a frame covering the handled session action | Its UI effects can be captured |
| Task settled | Referenced background work returned its final outcome | Inspect completed/partial effects |

Handler claim and the first effect are distinct boundaries. Running work can still be computing with no effects;
only a confirmed stop before its first effect may report cancellation with no effects. Queries also have a claim
boundary even though they have no mutation commit.

Queued cancellation and handler claim are mutually exclusive transitions on the owning loop. A cancelled queued
action must not run when the loop catches up. After claim, a caller's response deadline can return an in-progress
receipt while work settles; it must not label an action cancelled without stopping it. The caller can inspect or
cancel the task when supported. Use unknown outcome only when completion cannot actually be established.

A session action receipt identifies child application requests, resulting choices and the session revision after
handling. Frame acknowledgement is optional for clients doing only application work. It does not wait for unrelated
indexing or language-server activity. Waiting for a frame or a task does not hold a document or input reservation.
This makes a fast edit, opening a picker and starting an export distinct, observable outcomes of one contract.

A frame barrier covers changes handled through a particular action sequence. If later input supersedes the
requested UI state before a draw, report that with the actual context/frame revisions instead of claiming the
intermediate state appeared. A condition such as overlay-shown or text-visible identifies a frame where the
expected state was actually drawn. Background task completion remains independent of either observation.
