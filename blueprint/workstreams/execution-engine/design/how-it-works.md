# How the shared execution engine works

Research-based choices in this part follow ENG-D7; see [decisions](../decisions.md).

The extraction preserves Slipbox's navigation, rendered views, lens, review workflows and interaction conventions.
Adapters reuse that UI while moving application responsibilities beneath it. Fresh, Kakoune and TTT supply focused
mechanisms; they do not define a replacement product or interaction model. See the
[research synthesis](../research/synthesis.md) for the proposed adaptations and scope limits.

Backend maintainability and testing are the purpose of ENG; existing functionality and UI are compatibility
constraints (ENG-D15). See [maintenance.md](maintenance.md) for feature integration and the completion checklist.

## The boundary to establish

The engine owns application state and executes application operations. Interfaces translate intent into those
operations and display their results. Existing core modules supply algorithms and guarded system access.

```text
TUI actions and views      CLI parser and output      Local socket clients
        |                         |                          |
        |                  embedded or attached         socket adapter
        +-------------------------+--------------------------+
                                  |
                   one catalog and invocation executor
                         /                       \
            application handlers             session handlers
                         |                       |
          documents / workspaces / services  TUI action/input dispatcher
                         |
           existing core algorithms and guarded system I/O
```

An engine is an object graph with a lifecycle, not necessarily a server. The TUI hosts one in-process. A normal CLI
call opens a short-lived one. An attached client addresses a particular resident instance. All hosts compose the
same handlers; they differ in lifetime and available facilities.

The host composes one catalog and executor from application handlers and, when a TUI is present, session handlers.
Both use the same request/result contracts, discovery and connection. Session handlers delegate to the actual UI
action/input paths; they do not implement an alternative editor. The engine remains usable without them.
See [TTT research](../research/write-up.md) for the source evidence informing this distinction.

There are three distinctions:

- **Action:** interface intent, such as opening a rename picker or toggling a panel. It may collect input, call an
  operation and navigate to the result. Existing named actions and keybindings remain.
- **Operation:** an application contract, such as reading a document, applying text edits, preparing a rename or
  saving a document. It takes explicit input and returns data or an application outcome, without opening a prompt.
- **Domain function:** a parser, diff, edit planner or other focused computation. It does not need an operation
  wrapper unless an interface needs to invoke it as an application capability.

One action can compose several operations. Several actions can call one operation. Session control can invoke
named actions and submit bounded input through a small set of typed operations; individual keys do not each need
their own RPC method. Internal domain functions remain implementation details.

## Dependency direction and composition

Proposed organization, with boundaries more important than directory spelling:

| Area | Owns | May depend on |
| --- | --- | --- |
| `src/core/` | Domain algorithms, formats and existing guarded I/O primitives | Other core modules, runtime |
| Shared execution | Value contracts, catalog, validation, dispatch and receipts | Core value helpers, runtime |
| `src/engine/` | Application state, services, operations and lifecycle | Shared contracts, core, runtime |
| `src/cli/` | Arguments, CLI bindings, human output and legacy envelopes | Public execution API, core helpers |
| `src/tui/` | Interaction, views, layout caches and terminal presentation | Public execution API, core rendering |
| `src/ipc/` | Local endpoint, framing, authentication and client proxy | Public execution contracts, runtime |
| Host bootstrap | Chooses mode and composes engine and adapters | The areas needed by that host |

Core cannot import shared execution, engine or adapters. Shared execution imports no concrete feature handler or
adapter. Engine cannot import TUI, CLI, IPC or OpenTUI. Adapters cannot import engine implementation modules. OpenTUI
remains confined to the current two integration files. Extend the boundary check to enforce these edges.

The host's public execution entry exposes value contracts and a small facade for discovery, invocation, snapshots,
subscriptions and shutdown. It does not return the workspace map, Graph, mutable documents or process handles.
In-process rendering may consume immutable parsed snapshots; socket results contain serializable values instead.

The composition root constructs explicit dependencies. A documents service receives storage and revision support;
it does not receive the whole engine. Feature handlers receive the few services they need. Avoid a global service
locator, an all-purpose context, callbacks into App and circular services that can mutate each other.

The shared executor is one focused module group: contracts, catalog and invocation lifecycle. It owns validation,
client access checks and request receipts once per invocation. Application handlers own domain preconditions and
effects; session handlers own UI routing. There is no second gateway with another catalog or retry policy. A host
without a TUI registers application handlers only. Handler registration is built-in composition, not a plugin API.

A session action can invoke application operations with the same caller identity and a correlated child request.
The session action holds no document/workspace reservation while doing so. Nested calls never re-enter a session
queue that is waiting for them; long work returns a task handle. Direct service calls inside the engine stay plain
function calls, without manufacturing RPC requests between services.

Keep the existing runtime and dependencies initially. Use ordinary modules and explicit composition; introducing
a dependency-injection framework, an event bus package or a schema package is not a prerequisite.

## Modules and functional responsibilities

These are responsibility groups. A group can begin in one small file and split when its concerns justify it.

Each service is a lifecycle owner (ENG-D1), not a bag of App fields. Its contract identifies its state, resources,
result-applicability rules and disposal behavior; the runtime details are in
[runtime.md](runtime.md#service-and-client-lifetimes). The composition root creates and closes owners, while the
owner controls its timers, subscriptions and work. Tests can construct an owner without App or a terminal.

| Module group | Functions it provides | State it owns |
| --- | --- | --- |
| Contracts and catalog | Define types, schemas, effects, exposure; list and describe operations | Static definitions |
| Execution | Validate, authorize, scope, dispatch, classify outcomes, retain receipts | Active invocations |
| Workspaces | Resolve vault ownership, acquire/release services, load configuration | Workspace handles |
| Documents | Open/read live text, apply edits, group undo, reload, save and resolve conflicts | Live document records |
| Changes | Prepare, inspect, check and apply plans; report recovery and undo | Plans and apply records |
| Observation | Reconcile watcher/HEAD news, publish changes, snapshots and subscriptions | Revisions and events |
| Tasks | Start, inspect and cancel longer work; progress and shutdown | Tasks and cancellation |
| Feature operations | Search, links, files, capture, export, diagnostics, language services, git | Service caches |
| Host services | Supply filesystem, clock, process runner and storage locations | Runtime resources |
| Session bridge | Describe/invoke real UI actions, dispatch input, snapshot and capture | UI queue, frame records |

Feature groups remain separate. Search coordinates the existing search index; git coordinates the existing git
modules. Execution does not contain a switch statement implementing every feature. Registration happens explicitly
at composition time and rejects duplicate IDs, missing schemas and impossible exposure declarations.

### Feature service boundaries

| Service | Application functions | Uses |
| --- | --- | --- |
| Reading and links | Read/stat, resolve, outline, backlinks, tags with provenance | Documents, workspaces, core graph |
| Search | Parse query, select scope, query saved index, overlay live text, locate hits | Workspaces, documents, tasks |
| Files and structure | Prepare moves, copy, trash/restore, naming and vault-boundary changes | Workspaces, changes |
| Capture and context | Append/check scratch, gather excerpts/context with exclusions | Documents, workspaces, storage |
| Export | Capture revisions, assemble, write output, report exclusions | Documents, tasks, core export |
| Language services | Acquire/start tools, own server lifetime, sync/query text | Documents, policy, tasks |
| Git | Inspect refs/index, prepare mutations, run guarded git, reconcile HEAD | Workspaces, documents, tasks |

Cross-file LSP edits, formatting and quick fixes use documents/changes through the
[mixed live/disk coordinator](runtime.md#mixed-livedisk-language-edits), preserving per-target memory/save and undo
behavior. Language services never write around it; supported text edits do not imply new resource-operation support.
Generated file edits do not pass through the TUI's modal editor. Git hunk actions bind the selected diff to its
index and working-tree fingerprints before applying; a stale displayed hunk cannot act on a newer diff.

### Dependency-backed service boundaries

Parsing, spelling, typesetting and export remain focused owners (ENG-D12). Their narrow service ports accept
immutable content snapshots and explicit options, returning derived data or bounded output artifacts. They do not
receive App, mutable documents, arbitrary filesystem access or a general process runner merely for convenience.
A service's orchestrator resolves authorized inputs and destinations and commits results through existing guarded
writers. Fonts, dictionaries, includes and other auxiliary resources have an explicit resolution policy.

Core computations may stay directly callable behind these ports; there is no requirement to turn every helper into
a catalog operation. The composition root selects an implementation and execution host without changing public
operation contracts. Parsing/spelling reuse existing worker arrangements where appropriate; export/typesetting
placement is assessed from actual blocking work and limits. Lazy loading is a startup choice, not isolation.

Feature entry points load expensive implementations on demand (ENG-D13). Static imports inside those deferred
modules remain valid. Spelling and grammar workers have their own initialization boundaries; loading a worker is
not automatically loading it during ordinary CLI startup. The host's composition must preserve these boundaries.

Language/tool services retain the frozen installer and guarded execution policy (ENG-D14, D172). Installed tool
closures are an independently reviewed supply-chain surface, not assumed covered by the application lock audit.
No adapter implements its own tool lookup or trust grant.

An in-process dependency still has process authority, regardless of its TypeScript port. A worker can protect
responsiveness but is not an OS security boundary. A child process can permit termination and fault containment;
restricted filesystem/network authority requires explicit platform controls beyond spawning it. Record these
properties honestly before choosing an isolation mechanism. No sandbox framework is required by this design.

### Shared models and product surfaces

Share models and computations where their contracts agree; preserve each surface's interaction and lifecycle
(ENG-D4). Git history, working-tree review, unsaved-buffer conflicts and merge resolution use common diff and
source-anchor models. Selection, choice of sides, staging, editing and navigation remain responsibilities of their
respective surfaces. A diff model does not know which overlay or panel consumes it.

Core owns diff computations and source mappings; shared rendering owns suitable projection/layout primitives;
TUI controllers own product workflows. The same rule applies to text inputs, filtering and scroll/anchor helpers.
Move a component only when its state and contract are actually shared. Do not replace duplicate code with a single
widget whose behavior is selected by many product-specific flags. Keep model-invariant tests and surface tests at
their respective boundaries; consolidation must leave one implementation of each shared rule.

Configuration and policy belong with workspace resolution and execution respectively, not in feature-specific
copies. User configuration is supplied explicitly when composing an engine; no feature changes process environment
or global current directory to switch scope. Configuration reload has a generation used by dependent caches and
plans. Trust/access revocation stops new effects immediately, invalidates grants and restarts or stops affected
tools; already-started effects are reconciled and reported, not claimed to have been undone.

### Workspaces and resource ownership

A workspace describes file ownership and application scope, not an explorer view. Use the accepted VV model:
marked vaults, home, and Elsewhere when VV-T3 is implemented. Home keeps its slice-based index and caps. Elsewhere
has no graph; a request needing one returns an unavailable capability, not an empty result.

Each engine has a small workspace registry. Its primary workspace is used by the host; other workspaces can be
acquired for links, search or peeks without giving each a full editor session. Open watchers and language servers
only as needed. Reference counts and bounded idle eviction dispose unused resources; dirty documents and active
tasks keep their owners alive. A CLI query does not start the TUI's background jobs.

A git checkout is a separate identity from a vault. Nested vaults can share one checkout; worktrees have separate
working trees and shared repository metadata. Git operations resolve both identities before scheduling.

### Documents and presentation buffers

Extract the text model from `NoteBuffer`: text, encoding/BOM/EOL, version, saved baseline, undo, deletion and conflict
state become engine-owned. Keep layout caches, folded cells, view modes and custom drawn windows in the TUI.
Parsed or syntax snapshots are derived from a document revision and may be shared without exposing mutation.

A document has an opaque ID, owning workspace, canonical path identity, displayed path, monotonically increasing
revision and saved-file fingerprint. Canonicalization follows existing path and symlink rules: preserve lexical
paths for display, resolve targets for access checks and deduplicate aliases where that policy permits. Recheck
ownership after moves and marker changes. Never use the current tab or process working directory as hidden scope.

Read-only snapshots from git, diffs and peeks are distinct from editable documents. A properties editor uses a
temporary draft tied to a parent revision; accepting it applies a checked edit to the parent. UI-only virtual
windows do not require engine documents. An explicit agent edit targets an editable document in its own workspace;
it does not make a read-only peek editable. Editable scratch and temporary commit/output drafts need explicit
resource kinds and permitted storage roots; they do not acquire vault permissions by bypassing document services.
Preserve their existing persistence and discard behavior, without requiring graph/index ownership for every draft.
