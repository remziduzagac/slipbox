# Interfaces and representative flows

Research-based choices in this part follow ENG-D8 through ENG-D11; see [decisions](../decisions.md).

## Adapters

### TUI

Keep named actions, keys, vim motions, lens navigation, cursor positions, focus, overlays and presentation sessions
in the TUI. An action resolves its selection to explicit document/workspace handles, collects arguments and invokes
the engine. A result can lead to a picker, preview or message. Application policy is never implemented solely by
disabling a button.

Tabs reference engine document IDs and TUI view records. Two panes share one document but keep separate cursors and
layout caches. Session persistence uses paths and source anchors, never ephemeral engine IDs. UI-only choices such
as exploring a folder versus entering its vault remain TUI workflows over shared discovery services.

Disk-based TUI handoffs use a shared prerequisite coordinator. Preserve workflow-specific scope: existing context,
export and agent handoffs flush all dirty nonvirtual buffers tracked by the TUI instance; external-editor handoff
saves only the resolved target. Return captured saved revisions/fingerprints and completed/refused saves, not a
Boolean that becomes stale during asynchronous work. Check access to the complete required scope before effects;
a limited connected caller cannot silently skip unauthorized saves and claim the same handoff succeeded.

After saves settle, revalidate required current revisions and dirty-set generation on the owner loop before the
handoff starts. If typing advanced or another required dirty document appeared, return stale/refresh or refusal,
not a claim that current text was saved. A failed required save aborts the handoff; already completed saves remain
reported, without rollback. Capture immutable export/context inputs at this validated boundary. External editors
still see a normal file subject to later external changes; no cross-process snapshot guarantee is introduced.
No prompt, external program or export computation holds document reservations. Standalone saved CLI commands retain
D17; explicitly requested live-source operations use their declared snapshot semantics rather than implicitly
performing the legacy TUI flush workflow.

Clipboard/OSC 52, terminal suspension and opening an interactive editor remain host interactions. The engine can
prepare the handoff and save prerequisites; the adapter performs the terminal effect and reports completion for
reconciliation. An unattended client gets unsupported when it asks for a facility its host does not provide.

### TUI session control

An attached client should be able to perform normal TUI workflows as well as work directly with documents. Publish
a session handler group in the shared catalog, through the same endpoint and generated attached-CLI bindings.
Its compact surface provides:

- List/describe named actions and their current availability; invoke one by stable ID with explicit arguments.
- Inspect a scoped session snapshot: views, tabs, active document IDs, cursors/selections, panels, overlay and focus.
- Submit bounded key, text, paste and mouse input to the existing event dispatcher.
- Wait for a specified session condition or frame generation, and capture that rendered frame.

Session operations require a session ID. Keep document revision, input-context revision and frame generation
distinct: document revision tracks text; context revision tracks the input target, cursor/selection, mode, pending key
sequence/count and active
overlay identity; frame generation tracks rendered output. Background status updates do not change the input context.

Actions depending on a view or focus name that target and its expected context revision. An input sequence is
ordered through the normal session input queue with human input. Before each item, verify its target and context;
after an item's own changes, advance its expected context and affected document revisions for the next item. A human
context change or a relevant
document edit stops the remainder with completed-item count and current revisions. Input already handled remains
applied; the sequence is not a transaction. A closed view never redirects the remaining text to another view.

Mouse input also names the retained frame/geometry it was based on; resizing, scrolling or changed hit targets
invalidates it before dispatch. Prompt responses name the prompt identity and expected context. A response cannot
borrow the authority of a prompt opened by another caller or the person: validate the responding caller's effect
grants and preserve the initiating continuation's attribution. Bound the continuation's effective grants by both
initiator and responder; a weaker answer cannot inherit stronger deferred authority. Human-only prompts refuse
synthetic responses.

Incomplete key commands, counts and other pending input continuations retain initiating origin and effective grants,
not just a context revision. On an incompatible origin change, cancel the pending sequence before handling the new
event as fresh input; a synthetic prefix plus a human suffix never becomes a human-authorized command. Ordinary
mode changes do not claim all later human typing as client input. This preserves one shared editor without adding
macros or other unsupported input facilities.

Keep input batches bounded. Do not hold an exclusive input lease across network waits, tasks or user prompts.
Clients needing independent editing use document operations, which do not move the person's cursor. Session control
deliberately affects the shared visible session; it does not create a private cursor or a multi-user editor.

Commands that open dialogs use the same dialog code as a human action. Apply the shared completion contract:
handling, choices, frames and task outcomes are separate. A frame barrier waits for the submitted action's UI effects;
an asynchronous export or git job still requires its task result. There is no separate UI timeout/retry mechanism.

Capture and structured state are separate: a snapshot can prove the document changed without proving the button
or lens drew correctly. A capture identifies session, frame generation and document revisions. Keep bounded
immutable frame records so requesting a specific retained frame cannot silently return a later one. An expired
frame returns an explicit expiry; clients can request the latest and see its generation. A text/cell capture proves
the renderer's output, not that a physical terminal displayed it; keep terminal tests for that boundary.

Each retained frame carries the resource scopes used to render it, including previews, overlays and messages.
Apply one observation policy to snapshots, action results/choices, overlay events, availability explanations and
conditions: filter structured data to readable resources without disclosing forbidden titles/paths. Content-bearing
host actions such as clipboard copy also check read access to their resolved selection before performing the effect.
Deny a frame
capture or visible-text condition unless the caller can currently read every represented resource in that scope;
do not invent a second redacting renderer. Recheck authorization when retrieving retained frames and invalidate
access on revocation. Session-control permission does not itself grant document-content observation.

Conditions are a small typed set: document revision reached, overlay shown/closed, task settled, frame reached or
text visible in a specified frame scope. They have deadlines and subscribe to observations outside the UI loop,
without blocking the events they await. No caller-supplied code or general predicate language is evaluated. A visible
text wait returns the matching frame token so a subsequent capture can inspect the same result.

Session control is a distinct access grant. Invoking an action or synthesizing its key never grants broader
application access: propagate caller identity to every underlying engine call and check actions with host effects
before execution. Human-only trust decisions cannot be accepted through keys, mouse, prompt responses or named
actions. Existing shell/editor/clipboard actions require their declared host-effect grants; the input path cannot
bypass them. A host without a TUI advertises no session and returns unsupported for session requests.

Coverage checks classify each named TUI action as remotely callable, unavailable on this host or intentionally
human-only, with the reason. The goal is full normal workflow coverage, not only a selected list of convenient
commands. Application parity and interface parity are measured separately; neither requires moving cursor, layout
or overlay state into the engine.

### CLI generation and compatibility

Generate the command tree, accepted flags, defaults, validation, usage and operation discovery from explicit
bindings on the catalog. Bindings preserve existing names and can map several commands to one operation. A small
binding mapper handles stdin, path syntax and legacy defaults; it does not duplicate application behavior.

Discovery describes the running build's actual exposed definitions, supported sources, effects and host facilities.
Ship short examples for saved reads, live edits and session actions alongside the generated reference. An agent
can inspect this information without loading a plugin runtime or relying on documentation for a different build.

Keep human presenters and workflow help hand-written. Preserve `--json`'s single schema-1 envelope, existing error
mapping, stdout/stderr separation and exit codes. Engine contracts, socket protocol versions and CLI JSON versions
are independent. A new engine error maps deliberately to an existing CLI error or a separately versioned addition.

Generate reference lists or verify them from the same definitions while keeping the manual's explanations authored.
Preserve DS-D5's hand-written references unless separately amended. Generate CLI capability, not arbitrary CLI
commands for every internal handler. D156's git exclusions and human-only trust operations remain explicit policies.

Proposed routing: an ordinary invocation uses its embedded engine; an explicit instance selector uses an attached
engine. A small instance-list command can aid discovery. Exact flags and names remain to be designed against the
existing CLI. Multiple matches return ambiguity; no match, incompatible protocol or connection loss fails. There
is no automatic attachment or fallback. Always show the resolved instance/workspace in machine provenance.

### Local socket

Start with an explicitly enabled endpoint on the resident TUI engine. A headless host can later compose the same
engine without App. It must explicitly define document ownership and shutdown policy before being shipped.

Use a local stream endpoint: Unix-domain socket on current platforms, a transport abstraction for future named
pipes. No TCP listener, HTTP stack or multiplexer dependency. Runtime discovery belongs in an owner-only runtime
directory, with a private temporary-directory fallback. Plans and apply-recovery records belong in state (D39);
invocation receipts are bounded and instance-local, with no durable replay implied. Nothing is
written into a vault for discovery. Metadata identifies instance nonce, PID, workspace and protocol support. Verify
the handshake; stale PID files alone are not proof an endpoint is safe to remove. Distinguish absent, incompatible,
denied/unreachable and stale endpoints. A denied probe or inconclusive process check never authorizes deletion.
Cleanup checks endpoint ownership and identity again before removing an endpoint proved stale.

Use a small length-prefixed UTF-8 JSON protocol. The first release supports hello/version negotiation, operation
discovery, invoke, invocation/task status and cancellation, and snapshot/subscription. Correlate replies by request
ID and notifications by subscription ID; invoke messages additionally carry their stable invocation/retry identity.
Frame size, input size, output size, task count, event queue and idle
handshake time are bounded. Decode/admit a bounded amount per owner-loop turn, with per-client limits so one
connection cannot starve human input or another client. Status and cancellation do not wait behind a mutation lane.
Keep one bounded stream decoder for the connection lifetime, across handshake and later messages. Preserve bytes
following a decoded frame; handle both fragmented frames and several frames received together.
Large content uses bounded range reads or explicit artifact references rather than unbounded frames. No binary
channel, compression or generic RPC framework initially.

The host creates client profiles and binds them to connections: read-only, document editing and separately enabled
session-control and tool/git effects. A caller cannot self-select a stronger profile. Protect the endpoint and
discovery credentials with owner-only permissions; verify peer identity where available. This is a same-user local
boundary, not a sandbox against malicious code already running as that user. Do not promise isolation a local token
cannot provide.

Issue a random connection credential per enabled profile, bound to that instance and its allowed workspaces and
operation classes; rotate credentials on restart or revocation. The host's user configuration or direct human
interaction enables profiles. A vault's configuration cannot enable a listener, create credentials or grant access.
The handshake authenticates before any discovery or document data is returned. Metadata identifies the endpoint;
possession of its address alone is not authorization.

A profile credential authorizes initial attachment, not a shared retry namespace. The host issues each client an
opaque identity and resume credential bound to instance, profile and allowed scope. Separate clients under one
profile have separate invocation namespaces. Authenticated reconnect resumes that identity; caller-chosen IDs or
an expired/revoked resume credential cannot impersonate it. Resume never restores revoked grants. Retain the client
identity/resume record while admitted tasks or invocations are active, then through their
advertised result-retention period; revocation still takes effect immediately. Clients retain their credential for
that period; losing it leaves uncertain outcomes for explicit inspection.

Trust management remains human-only and cannot be granted by an operation, an input string or a local connection.
Engine access checks also preserve VV's distinct link permission and write containment rules. A connected client
cannot widen them by choosing another workspace. Explicit user-approved file access and following a link are
different authority sources, resolved by the workspace service.

Socket clients use the combined application/session catalog. UI actions and synthesized input are the declared
session-control surface, with normal permission checks and completion semantics. Transport tests can use an
isolated engine host; session tests add the actual TUI adapter. There is no additional test-only mutation path.

### Future extensions

An external extension can eventually discover approved operations, invoke them and consume scoped events. It gets
no Graph, mutable buffer, service registry or App handle. A built-in feature adds a focused module and catalog
entries through ordinary reviewed code. This is enough of an extension seam for the present design.

An extension granted session control can use that same catalog when a TUI is present. This does not imply that
custom widgets or new action handlers can be registered by external code in this workstream.

Future plugin bindings should adapt these public contracts instead of implementing another buffer editor or action
dispatcher. Explicit document/view targets are the default; an active-buffer convenience resolves to an ID and
revision before an edit. Extension handlers and long-lived event subscriptions need separate lifecycle design;
there is no generic hook or middleware chain in the first engine.

Bindings also use the owner/disposal contract (ENG-D6): capabilities remain attached to the caller, and registered
subscriptions, timers, callbacks and tasks have a lifetime. Unloading an eventual extension invalidates that lifetime
and disposes its resources through [runtime.md](runtime.md#service-and-client-lifetimes). Session or panel access
does not imply filesystem-write or process-execution access. This is a contract for later bindings, not plugin
loading, sandboxing or widget registration in this workstream.

Loading third-party code, registering new handlers, UI contributions, packaging, permissions and API stability
require a later proposal. D36/D37 are not overturned by creating the engine. Any future third-party code admitted
in-process would have process authority; a TypeScript interface alone is not a security boundary.

## Representative flows

**Agent reads and edits unsaved text.** It explicitly attaches, obtains a scoped document snapshot at revision 12,
and submits a checked edit. The engine applies it as revision 13 and one undo step, publishes the edit and returns
the revision. The TUI maps existing anchors through the edit and redraws; it does not deliberately focus or move
the human's selection to the edited range. The edit itself writes no file, though configured autosave can later
save the changed document. A later edit based on 12 is refused. Saving 13 is a distinct operation, with current disk
prerequisites checked.

**Ordinary CLI toggles a task.** The embedded engine reads saved bytes and applies the existing checked toggle.
Its CLI adapter preserves current output. A resident TUI observes the disk write: a clean document reloads; a dirty
one enters conflict. An attached task toggle against a live document instead edits that document in memory.

**Rename preview and apply.** Either adapter calls the same planner with explicit scope. The TUI shows a preview;
the CLI emits the existing plan result. Apply validates every input and dirty-buffer prerequisite, reserves the
workspaces and commits through the guarded writers. Events identify moved paths and affected documents. A failure
after two writes reports those two and the pending work, with recovery state; retry does not blindly start over.

**Git pull.** The operation checks checkout identity, access, trust and unsaved-file prerequisites. If a choice is
needed, it returns that state before running git. The TUI's accepted GIT workflow asks and resubmits with current
prerequisites. The task uses guarded git, reserves its resources and reconciles HEAD/files on completion. Sharing
this implementation does not expose pull over CLI or socket without a separate exposure decision.

**Agent drives the visible UI.** It snapshots session A, then invokes the existing outline action by ID against
view V. Its receipt says the action was handled and identifies a committed frame with the outline open. It can
inspect that frame or the overlay state. If the action starts a background operation, the task remains separate.
If the person changes focus before queued typing is claimed, that typing is refused with stale context. To edit
without changing the person's focus, the agent instead reads and edits the document by ID through the same endpoint.
