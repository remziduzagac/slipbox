# Operation contracts and observation

Research-based choices in this part follow ENG-D8, ENG-D9; see [decisions](../decisions.md).

## The operation contract

Each built-in operation definition contains:

- Stable ID, summary, input schema and result schema; types and runtime validation come from the same definition.
- Scope requirements: workspace, document, checkout or process-wide; supported saved/live content sources.
- Effect declaration: inspection, memory edit, file write, workspace structure, tool execution or remote git activity.
- Required access and host facilities; exposure to the TUI, ordinary CLI and connected clients independently.
  Effects include implicit child work, such as tool installation, remote resource fetches and host handoffs; a
  nominal inspection cannot silently acquire those effects under a read-only grant.
- Execution class: short local operation or task; cancellation, retry and applicable service-limit behavior (ENG-D12).
- Disclosed host policies affected by this operation, such as existing autosave or background diagnostics. These
  policies retain their own configured authority; they are distinct from caller-requested child effects.
- Optional CLI bindings: public name, aliases, argument/flag mapping, stdin rules and output presenter.

The catalog has two handler groups, application and session, with one descriptor format. One source defines each
named UI action's ID, title, argument shape and declared application/host effects. Keybindings, the palette, attached
CLI discovery and session invocation use that source. Existing `command-specs.ts` is migrated into this structure;
do not maintain a second hand-written remote-action list. A generic invoke-action request still validates the
selected action's argument schema and access; it is not a path around typed contracts.

The registry stays closed to third-party registration initially. Definitions are data plus built-in handlers, not
executable expressions loaded from a vault. A descriptor is discoverable only to callers allowed to use it.

An invocation carries an operation ID, input, invocation ID and explicit target handles. Wire message IDs correlate
individual replies; invocation IDs identify retained execution and retries, including across status requests. The host
supplies a client
identity, access grants, configuration context and cancellation signal. Those trusted fields cannot be supplied
inside socket arguments. Receipt/task status, cancellation, plans and artifacts also enforce ownership and current
access; opaque IDs alone are not authorization. Deadline and retry-window limits are advertised at connection.
Response-wait and execution deadlines are distinct and have bounded defaults; callers can shorten the execution
budget within host limits. Status/reconnect never extends that budget. See [runtime](runtime.md#tasks-interruption-and-retries).

Preserve this context across child operations, deferred callbacks and tool results. Synthetic input retains its
client origin through the normal key/mouse dispatcher; it never becomes a human key because it reached that loop.
Do not store an ambient current caller on App while asynchronous actions can overlap. Each continuation carries
its own immutable invocation context, and each requested effect rechecks current access when it begins. Independently
enabled host policies use their own explicit owner/context, retain triggering-client attribution and recheck current
host scope/trust. An event callback cannot silently promote a client request into arbitrary host-authorized work.

Resolve document/workspace/view targets to lifetime identities when admitting a request. A closed target returns
missing or stale target; deferred execution never substitutes the currently active document, window or workspace.
An active-target convenience resolves once and reports the chosen identity before any asynchronous continuation.

Titles are presentation text, never machine identifiers. A convenience CLI command can resolve a title only when
it is unique, then report the resolved ID. Availability is structured: available, disabled by current state,
unsupported on this host or denied to this caller. A disabled button and a programmatic invocation observe the same
application preconditions; a cached availability answer is advisory and rechecked at execution.

Illustrative contracts, without fixing final names:

| Operation | Important input | Important result |
| --- | --- | --- |
| Read | Workspace/path or document ID, source, bounded range | Content, identity, source, revision/fingerprint |
| Edit | Document ID, expected revision, checked source edits | New revision, applied edits, undo group |
| Save | Document ID, expected revision, disk prerequisite | Written fingerprint, saved revision, dirty state |
| Plan rename | Workspace, source, destination, content source | Plan ID, input revisions, effects, required choices |
| Apply plan | Plan ID and choices tied to its prerequisites | Completed effects, revisions, recovery if partial |
| Search | Workspace scope, query, source, result limit | Hits, input provenance, freshness and exclusions |
| Start export | Selected documents, source, destination, format | Task ID, then output artifact and warnings |

Document revisions are scoped to an engine instance; file fingerprints survive independent CLI processes. Neither
is accepted in place of the other. Artifacts are explicit outputs with a path, media type and ownership, not an
unrestricted file-serving route. Reading an artifact over a connection still requires that client's access.

Results carry structured data, warnings, provenance and relevant revisions. Expected failures have stable symbolic
codes and details: invalid input, missing or ambiguous target, forbidden, unsupported, stale input, conflict, busy,
cancelled, partial or unknown outcome. Bug exceptions become an internal failure with a correlation ID; private
paths, text and raw process output are not emitted into a general log by default.

Application operations do not print, prompt, suspend the terminal or select a current buffer. A handler needing a
user choice returns the alternatives and prerequisites. The adapter obtains a choice and makes a subsequent call.
The engine revalidates at that call; waiting for a prompt never holds a lock.

Session-control operations can change focus or open a prompt through existing actions. They return the resulting
session state, including a choice still needed; opening a prompt is not completion of its underlying application
operation. Direct application operations remain available when a client already knows its arguments.

### Content source is independent of transport

| Source | Meaning | Mutations |
| --- | --- | --- |
| Saved | File bytes and validated persisted indexes | Write disk under the operation's existing policy |
| Live | Engine document text; saved files for explicitly included unopened documents | Edit memory; save separately |

Ordinary CLI commands select saved content. Attachment selects an instance, not a content source: attached callers
can request either where supported. A live read identifies dirty documents; a saved read can report the engine's
dirty advisory without substituting their text. A connected disk write still produces an external-change transition
for a dirty live document; sharing a process does not authorize overwriting it.

Search, context and export declare their source explicitly. Live search overlays open documents over saved results,
including removal of matches deleted in memory. A multi-document result records its revision set and index freshness;
it is not advertised as a filesystem-wide point-in-time snapshot. Index-only link queries report their saved basis
until a live graph overlay is implemented. Unsupported live queries fail clearly rather than returning saved data
under a live label.

Keep saved graph/index state separate from live overlays. An unsaved edit must not contaminate a later saved query
in the same resident engine. Any caches that depend on text include content source and revision in their key.

## Observation and client state

Events describe application facts: document changed/saved/conflicted, workspace changed, plan status, task progress,
diagnostics ready, index freshness. They carry engine-instance ID, sequence, subject revisions and invocation origin
where known. Progress can be coalesced; committed state changes cannot disappear without an explicit gap.

Provide snapshot-and-subscribe as one engine boundary. Register the subscriber and capture its scoped snapshot at
sequence S without yielding between them; deliver subsequent events after S. Snapshots are immutable values,
bounded by requested scope. Larger paged queries include a revision token and are retried if it expires. Bounded
text-range continuations likewise name the expected document revision or saved-file fingerprint; stale continuation
fails rather than silently assembling chunks from different versions. A client starts a new read explicitly.

Keep a bounded in-memory event history and per-client queue. Reconnection can resume inside the retained window;
outside it, or after overflow, return resync-required and take another snapshot. Never promise durable event replay.
Slow consumers cannot block typing or grow memory without limit. Subscribers cannot mutate state synchronously
inside publication; mutations return through the execution boundary after the current commit finishes.

Subscription filtering can skip global sequence numbers without losing an event in that scope. Loss is signaled
explicitly; clients do not infer it from every numerical gap. Access changes invalidate affected subscriptions and
their snapshots before more data is delivered.

The TUI updates presentation state and schedules drawing from these facts. It does not rebuild application rules
in event handlers. Search requests carry a query generation as well as content revisions, so an old response cannot
replace a newer query even when the documents have not changed.

Session events add context changes, action receipts, overlay state and frame commits. Their origin links back to
the same invocation IDs. Session snapshots include referenced document IDs/revisions instead of duplicating entire
document text. A combined snapshot is captured on the owning loop without yielding, or reports separate revision
tokens rather than claiming a coherent combined state. The same session resource-provenance rule applies to action
results, choices, events, availability explanations and waits, not only snapshot/capture endpoints. Unauthorized
metadata is safely omitted or refused, including already-queued deliveries after access changes.
