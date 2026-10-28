# ORG: Code organization — design and implementation plan (approved 2026-10-27)

Approved for [issue #55](https://github.com/remziduzagac/slipbox/issues/55), based on [research.md](research.md). This
is the design and review overview. [requirements.md](requirements.md) owns the requirements; each of the 44 tasks has
one authoritative file under [tasks/](tasks/README.md). This document links those tasks without copying their scope,
status or dependencies. Target paths describe the approved plan, not completed moves. D235 and D239 still hold;
implementation and timeout changes remain tracked by the task files. See [ORG-D1–ORG-D3](decisions.md).

Read by topic:

- [Scope and completion](#issue-scope-and-completion-criteria).
- [Requirements](requirements.md).
- [Folders and ownership](#modified--blueprintdesignhow-it-worksmd-module-map).
- [Gateway boundary](#added--blueprintdesignhow-it-worksmd-client-interaction-and-future-gateway-boundary).
- [Code verification](#added--blueprintdesigntuimd-ownership-verification-and-separate-adjustments).
- [Code quality and patterns](#added--blueprintdesignhow-it-worksmd-duplication-patterns-and-code-quality).
- [Test organization](#modified--blueprintdesigntestingmd-feature-tests-and-selection).
- [Timeout policy](#added--blueprintdesigntestingmd-timeout-policy-separate-phase).
- [Phases and review gates](#phase-sequence-and-review-gates).
- [Coverage and finding owners](#issue-coverage-and-finding-owners).
- [Detailed tasks](#implementation-tasks).
- [Approved choices](#approved-choices).

## Issue scope and completion criteria

Issue #55's seven Wanted items cover both structure and code quality. Folder organization remains a central phase; it is
not the finish line. The [coverage ledger](#issue-coverage-and-finding-owners) assigns every issue item, measured clone
pair and oversized module to an owner task. Research is the evidence baseline, not a claim that the proposed
improvements are implemented.

| Work | Required outcome | Principal task owners |
| --- | --- | --- |
| Evidence and inventory | Refresh sizes, clone/dependency reports and candidate dispositions | ORG-T1, T40–T43 |
| Folders and ownership | Nested functional groups, matching tests, complete move manifests | ORG-T2–T7, T13–T18 |
| Smaller modules | Cohesive responsibilities, every >500-line module assessed, staged caps | ORG-T10, T25–T39, T11 |
| Repetition | Share equivalent mechanisms; record why similar policies remain separate | ORG-T8, T10, T19–T22, T40 |
| Dependencies | Remove identified reverse edges, enforce their direction and remeasure | ORG-T1, T9, T13, T39, T43 |
| Naming and unused code | Clear roles, narrower exports, validated candidate dispositions | ORG-T41 |
| Types and errors | Focused guards/adapters, explicit preserved refusal/cancel/cleanup contracts | ORG-T28–T29, T42 |
| Useful patterns | Explicit worker/export/controller assessment with tested outcomes | ORG-T24, T29, T39–T40 |
| Tests and testability | Split scenarios and narrow imports; retain necessary integration scope | ORG-T8–T9, T19–T24 |
| Measurement and build | Scoped comparisons; intact source/compiled worker discovery | ORG-T43, each move PR |
| Gateway preparation | Contracts and reusable operation boundaries | ORG-T44, T1, T24, owner tasks |
| Timeout policy | Separate behavior-neutral phase with unchanged default and named budgets | ORG-T12 |

Every accepted finding ends as an implemented improvement with focused evidence, a justified decision to retain the
current code, or a named follow-up with reason and scope. Deferring work must remain visible in the approval review; a
lower line count, folder move, or reduced clone percentage alone does not close the issue. A new performance or build
improvement requires a measured problem and its own coherent behavior-preserving PR. #56 memory/loading, gateway
implementation, new window/tab behavior and discovered bug fixes remain separate work.

## Requirements

[requirements.md](requirements.md) is authoritative for ORG-R1–ORG-R10: organization, size, test scope, behavior
preservation, timeout policy, reuse, dependency direction, code quality, useful patterns and gateway preparation.

## MODIFIED — blueprint/design/how-it-works.md: Module map

Previously: the map names mostly direct `core/*.ts` and `tui/*.ts` modules, alongside the existing layout, export,
servers, commands and theme directories. Research counts 149 direct core files, 95 TUI files and 65 test files.

Recommendation: retain the faces, group core features by functionality, and group TUI features by the scope of the state
they own. Prepare a boundary between client interaction and application operations for a future gateway used by TUI, CLI
and socket clients. ORG extracts existing responsibilities without introducing that gateway or transport.

Prefer explicit relative file imports with the repository's existing resolver; no new aliases, workspace packages or
runtime. Here a module group is a directory, not a separately published package. Use kebab-case for new multiword
filenames and folder-local role names (`controller.ts`, `jobs.ts`, `types.ts`). Keep meaningful established names; do
not rename exported symbols or public commands just to match a path.

### Core: functional groups

Paths in this table are relative to `src/core/`. Each group holds feature subfolders, with implementation, contracts and
worker entries beside their owner. The grouping expresses functionality; it does not make every core function a future
gateway operation. Pure text edits and layout calculations remain directly reusable by clients.

| Group | Feature subfolders | Responsibilities and current families |
| --- | --- | --- |
| `foundation/` | `text/` | width, sanitize, words, myers and blockdiff primitives |
| `foundation/` | `platform/` | fsutil, paths, processes, shell, libc, wsl, sqlite, browser, clipboard, lazy |
| `foundation/` | `workers/` | worker URLs, WorkerRequests and worker-context; feature queues stay with features |
| `application/` | `config/` | configuration loading, defaults, validation and merge |
| `application/` | `commands/` | command specs, independent contracts, catalog and registry |
| `application/` | `distribution/` | install, release, update, restart, skill lifecycle, reports and gh |
| `workspace/` | `vaults/` | vault, home, registry, folders, names, mounts, symlinks, trust, vault-feed/list |
| `workspace/` | `session/` | current position/session persistence and anchor helpers, pending cohesive extraction |
| `workspace/` | `walk/` | walk, walkers, walk-thread/jobs/worker, listing and list-worker |
| `workspace/` | `links/` | links, convention, write-link, pointer, hosting, remotes, reach and redirects |
| `workspace/` | `graph/` | graph types/extract/resolve, index-job, autoindex, watch and backlinks workers |
| `workspace/` | `search/` | search, search-index, scope and regex jobs/worker |
| `workspace/` | `mutations/` | files, rename, plans, replace-files, capture and mutation markers |
| `workspace/` | `git/` | git family, merge, mergereview, conflicts and stale |
| `documents/` | `model/` | note, readers, filetypes, docformats, doctypes, footnotes and context |
| `documents/` | `markdown/` | parse, parsecache, parse-pool/worker, wikilink, tags, obsidian and HTML |
| `documents/` | `syntax/` | syntax, syntax-thread/worker, grammar and code-model responsibilities |
| `documents/` | `editing/` | brackets, comments, indent, replace, snippet and tasks: reusable text operations |
| `documents/` | `external-editors/` | editor command preparation and nvim discovery/protocol helpers |
| `documents/` | `diagnostics/` | diagnostics, lint, lint-visibility, spell/thread/worker and hunspell |
| `documents/` | `servers/` | language-server clients, installation and generated locks |
| `rendering/` | `layout/` | layout and its code, markdown and diff responsibilities |
| `rendering/` | `media/` | images/cache, diagrams, paint, math, svg and typeset |
| `rendering/` | `export/` | export assembly, streaming, formats, assets and worker |
| `rendering/` | `theme/` | themes and glyphs; no layout or application imports |

Related helpers remain with their feature: for example tool-process with platform and landing/convert with links. The
original map placed position in text primitives, but `src/core/position.ts:8` imports filesystem helpers and stores
sessions as well as anchors. Move it intact to workspace/session first; separate persistence from pure anchor logic only
in a tested extraction, preserving stored formats and existing client ownership. Within media use `images/`, `diagrams/`
and `paint/`; within export use `formats/` and `assets/`; within mutations use `rename/`; within layout use `code/`,
`markdown/` and `diff/` as extractions land. Distribution separates installation, updates and reporting when its
manifest warrants it. Do not create empty folders or flatten feature descendants back into a group. Review directories
approaching 20 direct implementation files for a meaningful subarea; 20 is a review trigger, not a reason for arbitrary
subdivisions or a new CI failure. Each move PR supplies an exhaustive manifest.

`application/` contains existing application-wide concerns. ORG-T44 designs the future gateway's API and placement;
implementation follows separately. Recommend a future `src/gateway/` entry and feature contracts, composing the core
operation implementations without importing clients. Existing reusable contracts stay beside their core feature until
there is an actual gateway consumer; do not create empty directories or an unused parallel operation catalog. A core
feature must not acquire TUI buffer, selection, panel or App dependencies just because the TUI invokes it.

### TUI: scopes and feature owners

The intended ownership hierarchy is application → workspace → windows → tabs/document views. One workspace has an active
vault context. Each window has its own tabs and active-tab selection. Tabs displaying the same file share a TUI-owned
buffer and undo history, while cursor, selection, scroll and view mode belong to each view. One shared right-side tools
area follows the active tab in the focused window; focusing that tools area retains its document context. This hierarchy
is the target, not a claim that the current window model already implements it.

Paths below are relative to `src/tui/`. A module's owner follows its state and behavior, rather than the screen position
of a button. Mixed modules move intact first; responsibility extraction follows in the owner task with existing behavior
preserved. App continues to own shared state and wire controllers explicitly during ORG.

| Group | Feature subfolders | Owns |
| --- | --- | --- |
| `app/` | `runtime/` | App composition, background work, watcher coordination and lifecycle |
| `app/` | `settings/`, `distribution/`, `scratch/` | settings, updates/reporting and scratch coordination |
| `workspace/` | `session/`, `vaults/` | session restore, vault switching and workspace context |
| `workspace/` | `explorer/`, `history/`, `git/`, `search/` | vault browsing, history list, Git tools and vault search |
| `windows/` | `layout/`, `tabs/` | window/tab arrangement, focus, splitting, closing and tab strip |
| `documents/` | `buffers/`, `editing/` | shared file buffers/undo; view editing, cursor, lens and completion |
| `documents/` | `views/`, `navigation/` | read/source/code/HTML modes, view positions, following and linking |
| `documents/` | `saving/` | save/autosave coordination, conflicts, save-as and editor handoff |
| `documents/` | `tools/` | shared right-side host and its `info/`, `outline/`, `footnotes/` features |
| `documents/` | `search/`, `media/`, `export/` | in-document find/replace, pictures and export interaction |
| `documents/` | `diagnostics/` | document diagnostics, spelling and language interaction |
| `shell/` | `terminal/`, `input/` | run/opentui/canvas, keys, modes, vim, mouse and input dispatch |
| `shell/` | `screen/`, `panels/`, `overlays/` | screen composition, shared geometry/drawing, panel mechanics, dialogs |
| `actions/` | by command area | named action registration and client coordination; no blanket gateway forwarding |

Within `shell/screen/`, separate top-bar and status-bar composition from drawing primitives. Top-bar composition draws
branding/version/update controls, workspace/zoom/branch context and worker controls from their actual owners. Document
view headers own breadcrumbs and read/lens/source controls; their drawing owns line-number gutters and scrollbars. The
shared right tools are document-scoped despite occupying a shell region. The bottom bar composes document status and
broader history/error controls; placement does not change their owners. Moving the version/update button is a separate
UI change, not a path-move task.

Keep `workspace/git/views/` for Git views, including document diffs/review where their Git semantics belong. A Problems
panel offering document and vault scopes stays one feature with explicit scope; do not duplicate its implementation
across folders. History's list belongs to workspace navigation; per-view back/forward state remains view-owned. Keep
properties' editing behavior with document tools while sharing the floating-editor mechanics from shell overlays.

The current `windows.ts` can move to `windows/layout/` without pretending its state has already been inverted. Extract a
tab-strip module only where cohesive code already exists; do not add a new Window model during relocation. The existing
broad search and panels controllers likewise retain behavior before their local/document/workspace responsibilities are
extracted. Folder names alone do not authorize new per-tab persistence.

Only `shell/terminal/run.ts` and `shell/terminal/opentui.ts` may touch OpenTUI after relocation. Screen composition
calls feature drawing modules explicitly; primitives never import the composer. `App.writeBuffer` remains the sole TUI
note-write gate throughout ORG.

## ADDED — blueprint/design/how-it-works.md: Client interaction and future gateway boundary

**Maintainer-approved scope for #55:** gateway preparation was explicitly added to this workstream. Design contracts
alongside the folder boundaries and extract independently useful responsibilities that will support them. **Separate
follow-up:** implement the gateway, route an initial operation through it, migrate the remaining functionality and add
socket transport. The design was approved on 2026-10-27; task dependencies and implementation PR review still apply.

The future gateway serves application operations to TUI, CLI and socket clients. The TUI keeps live buffers, undo,
selection, focus, pane state and view state. Shared pure algorithms may be called directly from client interaction.
Every user action remains named under roadmap `0.8`; being a named action does not require a gateway round trip.

| Action | Client responsibility | Future application operation |
| --- | --- | --- |
| Type, select, text cut/paste | Edit the local buffer, clipboard coordination, undo and immediate redraw | Save later |
| Change lens, view, pane or tab | Update local interaction and focus | Read data if that view needs it |
| Save or autosave | Choose buffer snapshot, track edits and present conflict/result | Checked atomic file write |
| Follow a link | Select destination window/tab and position the view | Resolve/read target with vault/trust policy |
| Rename/delete/copy/move files | Selection, confirmation and result display | Validate and perform file operation |
| Git command | Collect input and display progress/result | Perform Git operation under its policy |

Text cut/paste and explorer file cut/paste are separate commands with different owners. Mixed actions have a client
coordinator and an operation implementation. File operations retain validation and refusal rules beneath the UI; clients
must not become the only place those rules are enforced. Reusable pure editing functions take text and positions, rather
than a live App or NoteBuffer.

Responsiveness requires execution choices as well as an API boundary: a Promise does not move synchronous work off the
UI thread. Preserve current worker and loading boundaries in ORG. The future gateway design must specify bounded work or
workers/processes for expensive operations, cancellation and progress, and result handling after focus, vault, document
version or client lifetime changes. A completed save of an older snapshot must not mark newer edits clean. Serializing
conflicting writes and reporting external changes belong to that future operation contract. These are migration
requirements to carry forward, not new queues, RPC or asynchronous save semantics in #55.

### Gateway contract design deliverable

ORG-T44 develops the contract design here alongside mechanical moves. Its relevant contracts are reviewed before
contract-dependent extractions (T24); independently useful moves/helpers do not wait for it. Document operation inputs,
outputs, explicit target identity, read/effect classification, errors, cancellation/progress needs, state/resource owner
and the client-side reconciliation step. Keep the public operation contract independent of TUI/CLI/socket presentation.
A method signature alone does not settle execution or delivery guarantees.

#### Contract boundary and common rules (ORG-T44)

**Proposed design, not implemented guarantees.** Source traces below refer to the tree at `4597a8f`, before the
rendering/TUI moves. Existing-code examples establish current behavior; lifecycle requirements describe the future
gateway. No method is routed through a new layer in #55. Public CLI commands, exit codes and stored formats stay as
implemented. These operation names are design vocabulary, not a new runtime catalog or transport schema.

The TUI owns live text, undo, document revision, saved-buffer baseline, selection, view mode, focus and pane state.
Typing, selection and text cut/paste use that local buffer immediately. Explorer cut/paste captures a file identity
locally, then invokes a file mutation; it does not place a NoteBuffer in an operation request. Shared pure text
algorithms remain directly callable. The future gateway owns application-operation validation, execution and outcomes;
its feature services own their workers, processes, caches and cleanup. A Promise alone provides no thread isolation.

| Common value/rule | Proposed meaning |
| --- | --- |
| Request identity | Client invocation ID plus owner lifetime; used for correlation, not an exactly-once promise |
| Resource target | Explicit vault/root identity and absolute file/repository identity; no ambient active tab or cwd |
| Authority | The operation validates the target, trust, symlink and write policy; supplied roots are not authority |
| Content identity | An immutable snapshot tagged with buffer incarnation/revision, distinct from disk observation |
| Disk baseline | Observed disk identity/stamp and available content fingerprint, with its strength made explicit |
| Query result | Explicit target/request identity, data or operation-specific refusal/failure/cancellation |
| Effect result | Known effects, warnings and final/uncertain status; failure or cancellation does not imply rollback |
| Delivery | Client checks lifetime, target and relevant revision again when applying a completion |
| Cancellation | Queries may be abandoned; accepted mutations must settle and report effects already started |
| Work policy | Replace obsolete queries; finish useful refreshes; preserve mutation order for overlapping targets |
| Progress | Operation stages/counts only; adapters choose messages, panes and presentation |
| Close/disconnect | Stop owner-owned reads; do not redirect effects or lose an accepted mutation's outcome |

A plan is a self-contained immutable value carrying its explicit target, proposed effects and per-file expected content
hashes. Its identity means a digest of that value, not a key into a server-held plan record. Apply receives the whole
value and verifies the digest/prerequisites; the digest proves neither authority nor current applicability. The current
RenamePlan stores before/after text and computes hashes when applying; precomputed expected hashes are proposed contract
data. Retained/server-managed plans would require a separate future retention decision and rules.

Delete/restore/copy/move follow the same target, refusal, cancellation and effect rules; files.ts and trash.ts (T13)
remain their core owners. They are outside these eight representative sketches, not exceptions to the boundary.

A query does not edit user content; it may refresh existing caches or derived state under the current policy.
Request/outcome values contain no App, NoteBuffer, renderer, UI object or callback into current selection. The client
keeps its presentation target separately. A closed view cannot be reopened by a late completion; a still-valid file
mutation may finish after that view closes, with its outcome retained by the operation owner. Before implementation,
choose bounded outcome retention/reconnect rules and transport authority separately. No new receipt store, scheduler,
socket protocol or authentication mechanism is installed by this design.

Conflicting mutations need ordering over their actual file/repository footprint, including aliases of one target. A
rename with an uncertain footprint requires a conservative owner scope until validated. Disk preflight and atomic
replacement do not create a transaction against arbitrary external writers. Preserve current refusal checks; stronger
compare-and-write or cross-file rollback guarantees require a separate implementation choice and evidence.

#### Resolve a link

| Contract field | Proposed design |
| --- | --- |
| Kind/target | Query; explicit vault/root, source file and link kind/text |
| Inputs | Parsed target, source content identity and optional immutable source context; no cursor callback |
| Output | Resolved resource/anchor, candidates or refusal, warnings and captured request/content identity |
| Errors | Missing/ambiguous target, forbidden traversal or follow permission needed; preserve existing distinctions |
| Cancel/progress | Abandon obsolete reads; resolving/reading stages; never grant follow permission implicitly |
| Owner/reconciliation | Core graph/links resolve; client chooses destination view and checks its navigation request |

**Existing example:** `src/tui/linking.ts:27` asks Graph.resolveLink; graph resolution and landing remain in
`workspace/graph` and `workspace/links`. `tests/vault.test.ts` covers CLI resolve with headings, blocks and ambiguous
names. Following a target and granting a symlink answer are distinct from resolving it. Resolving an external URL does
not launch a browser or run a program as a hidden query effect.

**Lifecycle:** capture source A, its revision and this navigation request; resolve/read under A's policy; return the
explicit target. If focus moves to B or A's view closes, the client rejects delivery to that view instead of resolving
again against B. If following needs consent, return that requirement and let a separate explicit action obtain it; a
later request revalidates it. Existing synchronous resolution is preserved during ORG; asynchronous delivery checks are
future requirements.

#### Save an immutable snapshot

| Contract field | Proposed design |
| --- | --- |
| Kind/target | Mutation; explicit file, vault/policy context and captured buffer incarnation/revision |
| Inputs | Immutable content bytes with encoding/BOM/EOL, observed disk baseline and scoped conflict decision |
| Output | Written disk fingerprint, saved content identity, known effects or conflict/refusal |
| Errors | Changed/deleted target, invalid encoding, virtual/read-only target, trust/path refusal or write failure |
| Cancel/progress | Cancel before effects; after writing starts, settle and report the write; preparing/writing stages |
| Owner/reconciliation | Core performs checked atomic write; TUI alone advances its saved-buffer baseline |

**Existing example:** `src/tui/saving.ts:37` checks disk changes and applies save rules before calling
`src/tui/app.ts:1172` (writeBuffer). That gate checks virtual/follow/path policy, calls writeNote, notifies the watcher
and updates graph/language state. `src/tui/buffer.ts` owns version, saved text and undo. Existing conflict, keep/reload,
shared-buffer and autosave cases are in `tests/tui.test.ts`; the known autosave fixture condition remains recorded in
the focused-verification section. Save is currently synchronous, not an asynchronous gateway guarantee.

**Lifecycle:** apply the existing local save rules as an undoable edit, then capture file A’s snapshot S at revision 7
and disk baseline D. Submit S. Typing different text creates revision 8 immediately without waiting. Revalidate D and
the target before writing S. On completion, record that S reached disk; revision 8 remains dirty relative to S. Do not
call today's markSaved on whichever text is current. If A’s view closes or another vault becomes active, the outcome
still names A; it cannot mark B clean or recreate A's view. A conflict returns without authorizing an overwrite;
confirmation applies only to the observed conflict. External writers can race checks, so advertise no stronger
filesystem compare-and-swap guarantee than the eventual implementation actually provides.

#### Plan a rename

| Contract field | Proposed design |
| --- | --- |
| Kind/target | Planning/query; explicit vault, source identity and destination input |
| Inputs | Source/destination and relevant saved-file observations; client handles unsaved-buffer preparation |
| Output | Preview, warnings/ambiguities, immutable plan value/digest and per-file prerequisites |
| Errors | Invalid destination, collision, unsupported target, unreadable source or policy refusal |
| Cancel/progress | Cancel planning; scan/resolve/preview stages; caches may refresh, user files do not move |
| Owner/reconciliation | Core owns calculations; client displays preview and retains its buffer ownership |

**Existing example:** `workspace/mutations/rename/rename.ts:133` builds a note rename plan. RenamePlan in
`rename-plan.ts:89` contains affected texts, moves, vault changes and ambiguities. The TUI renaming coordinator and CLI
files handler use this implementation; `tests/vault.test.ts` covers preview, cross-vault links and refusal.

**Lifecycle:** capture source A and destination D; prepare any relevant live buffers through the current client
workflow; build a preview against explicit saved observations. If focus/vault changes, keep the preview bound to A's
request or discard it. Editing an affected file makes its prerequisites stale; approval of an old preview never means
replanning silently against current files. Resolve ambiguities explicitly before requesting apply. Temporary planner
resources are disposed on cancellation; no application operation obtains text from the current active tab later.

#### Apply an approved rename plan

| Contract field | Proposed design |
| --- | --- |
| Kind/target | Mutation; full immutable plan and digest, original vault and explicit affected resources |
| Inputs | Approved plan value, per-file expected hashes and explicit ambiguity resolutions |
| Output | Written/moved identities, warnings, undo reference if created, known/uncertain partial effects |
| Errors | Stale plan, changed destination, path/trust refusal, I/O or incomplete follow-up/index update |
| Cancel/progress | Cancel before effects; settle once started; checking/moving/writing/indexing stages |
| Owner/reconciliation | Mutations own application and recovery facts; client remaps its own views and refreshes facts |

**Existing example:** `rename-apply.ts:170` checks paths and each file's content hash before effects, then moves/writes
and updates indexes/logs. Its Applied result names written/moved paths and warnings (`:131`). Failure after an effect is
not a cross-file rollback promise: its current exceptions do not form a complete partial-effect journal.
`tests/vault.test.ts` covers changed-since-preview refusal and undo; the file-operation client remains separate.

**Lifecycle:** approve the self-contained plan P and digest for A; pass that value to apply and order it against
overlapping mutations; recheck P's prerequisites. A stale file refuses before effects, with no implicit new plan. After
a move/write starts, cancellation or client close cannot be reported as “nothing changed”. Future execution must capture
known effects and uncertainty even if a later write or index step fails. Keep the outcome bound to P and refresh
affected facts; view remapping uses captured identities, not the currently selected row. Undo is a separate checked
operation, not automatic rollback after cancellation. The future effect record is supporting work for migration, not
something the current synchronous API already supplies.

#### Read Git status

| Contract field | Proposed design |
| --- | --- |
| Kind/target | Query/refresh; explicit checkout/worktree identity |
| Inputs | Repository, status options and request identity; no current explorer selection |
| Output | Status entries, observed repository state and warnings tied to that checkout |
| Errors | Repository gone, denied/untrusted execution, process failure or cancellation |
| Cancel/progress | Preserve existing process cancellation; reading stage; useful refreshes may finish before newest |
| Owner/reconciliation | Git owns process/state; client checks repository lifetime before replacing its panel rows |

**Existing example:** `workspace/git/staging/gitstage.ts:43` provides statusLater; TUI Git/panel controllers consume
status and branch information. `tests/gitpanel.test.ts` exercises changing rows and repositories, while core status
parser tests retain literal path handling. This is a saved repository view, not a gateway-owned live-document view.

**Lifecycle:** request status for repository R; focus switches to S while R's process runs. Deliver R's answer only to a
surviving R owner; do not apply it to S's rows. A newer refresh can remain pending without indefinitely replacing a
running useful refresh. Closing R stops its reads and invalidates delivery. Current Git process behavior is retained; no
new global refresh policy is imposed during this workstream.

#### Stage explicit Git paths

| Contract field | Proposed design |
| --- | --- |
| Kind/target | Mutation; explicit checkout/worktree and literal path list |
| Inputs | Selected paths and observed index/worktree prerequisites; operation-specific stage/unstage intent |
| Output | Actual Git result, affected identities and post-operation facts; failure may require rereading status |
| Errors | Changed prerequisites, index lock, repository/policy failure or Git refusal, preserving Git's diagnostic |
| Cancel/progress | Never coalesce explicit mutations; after starting Git, report its actual settlement; staging stage |
| Owner/reconciliation | Git owns execution; TUI owns selection, confirmation and rendering after status refresh |

**Existing example:** `gitstage.ts:116`–`:134` stages/unstages explicit paths using literal pathspec input. It currently
returns GitDone (error text or null), not an expected-state or partial-effect protocol. Core staging tests in
`tests/core.test.ts` include glob/colon filenames and whole-section operations; the panel tests retain integration.

**Lifecycle:** capture R and selected paths before waiting. If a row changes or focus moves, do not stage whatever
occupies that row now. The future operation checks any promised prerequisites before invoking Git. If cancellation
arrives after the process starts, settle and reread affected facts rather than assuming the index is unchanged. The
current implementation's guarantees remain unchanged; stronger stale-state checks and authoritative outcomes are
migration work, not existing behavior inferred from these proposed fields.

#### Search saved resources

| Contract field | Proposed design |
| --- | --- |
| Kind/target | Query; explicit vault/scope, query and request identity |
| Inputs | Parsed query, filters/limit and saved-data mode; any supplied client snapshot is immutable and explicit |
| Output | Ranked hits with file/position and observed content/index identity, warnings or failure |
| Errors | Invalid query, missing/unreadable scope, unavailable index or worker failure under existing fallback policy |
| Cancel/progress | Abandon obsolete query; retain useful index refresh; searching/indexing stages |
| Owner/reconciliation | Search owns index/worker resources; client reconciles its own unsaved-text overlay |

**Existing example:** `workspace/search/search.ts:654` accepts an explicit Graph/index/query; SearchIndex owns the
SQLite query (`search-index.ts:186`), and regex-jobs owns worker matching. `src/tui/search.ts` tracks query and buffer
versions while combining live text. `tests/vault.test.ts` covers scan/index and scope; `tests/regex-jobs.test.ts`
retains worker/TUI-find checks. Current SQLite/scan work is not automatically nonblocking because it returns data.

**Lifecycle:** capture Q for scope V and client snapshot revisions; issue saved-data search while the client can keep
typing. Q2 supersedes Q's presentation. On Q's delivery, check query, scope and relevant live revisions before merging
or showing hits. Standalone CLI results remain saved-file results; another client's unsaved text is not silently
included. Any future server-side snapshot overlay is request-local, not an authoritative second buffer store. Expensive
scan/index work needs bounded slices or a worker/process before promising smooth gateway execution.

#### Export a document or scope

| Contract field | Proposed design |
| --- | --- |
| Prepare kind/target | Query over explicit saved sources and format; private staging may be written |
| Publish kind/target | Mutation of the explicit destination, using the prepared result and write policy |
| Inputs | Captured saved-file scope/observations and export settings; preserve current unsaved-input preparation |
| Output | Artifact paths/fingerprints, warnings and actual publication/cleanup outcome |
| Errors | Invalid format/target, read/worker/format failure, cancellation or write/cleanup failure |
| Cancel/progress | Keep reading/assembling/writing stages; cancel before commit; publication settlement is explicit |
| Owner/reconciliation | Export owns workers/staging and output policy; client owns dialogs and navigation |

**Existing example:** `src/tui/exporter.ts:207` prepares an export, publishes through its prepared-output flow and
always disposes staging (`:266`). `src/core/export/jobs.ts:14` captures the source/policy/format/target request; its
worker builds the result while the owner publishes it. `export/index.ts:179` writes output assets/document. Existing
export and terminal cases cover cancellation, nested diagrams, target refusal and cleanup errors. No immutable
live-buffer export snapshot guarantee is invented for today's saved-file pipeline.

**Lifecycle:** capture source set and destination D after the current client preparation. Run the existing worker
pipeline, including nested workers. Moving focus does not change D or the source set. Before publication, honor
cancellation and target refusal; after the irreversible publication boundary, report what was actually published.
Dispose staging even if the originating view closes, reporting cleanup failure separately from artifact success. A UI
cancel after commit cannot turn a successful publication into “no output”. Future gateway publication must own this
whole lifetime rather than moving only its worker-start call out of the client.

#### Extraction and migration map

These are responsibility owners, not claims that each operation is already a gateway API. Current callers remain direct
throughout #55; a move does not by itself establish reusability or responsiveness.

| Operation | Existing implementation/client | ORG owner; remaining gateway work |
| --- | --- | --- |
| Link resolution | graph/links; TUI linking/following, CLI resolve | T25/T24/T42; explicit request/delivery adapter |
| Save snapshot | fsutil writeNote; App/Saving/NoteBuffer | T24/T38/T42; checked save seam, ordered async outcomes |
| Plan/apply rename | mutations/rename; TUI renaming, CLI files | T13/T35/T42; immutable preview and effect reporting |
| Git status/stage | workspace/git; Git/panel and CLI Git | T30/T39/T42; prerequisites/process settlement |
| Search | workspace/search; TUI search and CLI search | T34/T40/T42; live overlay seam and bounded execution |
| Export | export jobs/formats; exporter and CLI render | T29/T39/T40/T42; full staging/publication ownership |

T9 removes inappropriate editable/drawing composition dependencies; it does not move live buffers into a backend. T24
uses the relevant contracts as an extraction checklist and must demonstrate real focused callers/tests while retaining
integration journeys. T43 reconciles each row with actual extractions and remaining migration work. Future runtime
routing, transport, authorization, request replay/retention and connected-session editing remain the next stack.
Existing public error behavior is mapped per operation; no global replacement error framework follows.

#### ENG reconciliation and future acceptance

**Recommendation:** keep the maintainer-approved TUI-owned-buffer model authoritative for this contract design. Adopt
compatible lifecycle principles, not ENG's proposed document owner. ENG's Documents design moves text, undo and
saved-baseline state into the engine; it cannot simultaneously own the same live record as NoteBuffer. See the [ENG
principles](../execution-engine/decisions.md) and [engine document
proposal](../execution-engine/design/how-it-works.md#documents-and-presentation-buffers). This is a real alternative,
not a naming difference. ENG's accepted decision records and draft architecture are not amended here.

| ENG principle | Compatible application in this proposal |
| --- | --- |
| ENG-D1 | Feature execution owners retain timers, workers, staging and disposal; client buffers retain their lifetime |
| ENG-D2 | Work-specific query/refresh/mutation rules; preserve current queues until a tested migration |
| ENG-D3 | Check identity/lifetime/revision at delivery, even if cancellation was requested |
| ENG-D9 | Capture explicit targets before waiting; closed views cannot redirect operations |
| ENG-D10 | Authoritative operation outcomes are separate from client presentation; no ENG receipt runtime in #55 |
| ENG-D15 | Small testable owners and real client integration, with one implementation of each policy |

For the next stack, a standalone saved-file operation uses checked disk state and returns external-change facts. A
connected edit of a TUI document must coordinate with that client owner, using an explicit document incarnation and
revision; it cannot mutate an engine copy or silently overwrite the live buffer. Define that connected-edit protocol and
its conflict/owner-disconnect policy before implementing it. Alternatively, adopting engine-owned live documents
requires an explicit replacement decision and migration of text/undo ownership; it is not part of ORG. No operation
contract here treats live document handles as interchangeable with saved files.

Future acceptance cases (not new tests or runtime guarantees delivered by this document):

- Save S, type again, then complete S: retain the newer dirty text/undo and record only S as saved.
- Switch vault/focus or close/reopen a view while any query runs: late delivery affects no replacement owner.
- Edit a plan target or occupy its destination after preview: refuse the stale plan before effects; do not replan.
- Cancel before a mutation starts versus after its first effect: distinguish no effects from known/uncertain effects.
- Lose a client after a rename/Git/write starts: retain and reconcile the operation outcome without reviving its view.
- Search while typing in an unsaved buffer: update this client's overlay only for matching query/content identities.
- Export through a nested worker, cancel near publication, then fail cleanup: preserve artifact/outcome distinctions.
- Run an expensive operation while typing/opening a lens: demonstrate bounded UI latency using actual execution.

These cases gate future gateway migration. #55 keeps the current synchronous save, queue/deadline policies,
App.writeBuffer entry, buffer/undo owner, session format and direct calls. This design adds no loading/memory work
under #56 and no sockets, scheduler, execution engine, operation catalog or duplicate document store.

### Responsibility extraction deliverable

For every touched mixed feature, name the local interaction coordinator, reusable application implementation, pure
helpers, contracts and resource owner in its manifest. Extract cohesive implementations into their core feature where
they can be called without TUI state; keep real UI state and interaction in its TUI owner. Existing callers continue
invoking the extracted implementation directly. Preserve one implementation of each policy and the current
App.writeBuffer write gate; do not add a forwarding gateway, new scheduler or duplicate live-document store.

Build only interfaces needed by actual extracted code and tests. Test application calculations and policy through
focused collaborators, with the existing TUI/CLI integration checks retained. Record work that still needs gateway
migration rather than claiming that a path move made an entire operation reusable. Owner tasks T10/T13/T24/T25–T42
perform the relevant extractions; T43 audits the contract-to-owner mapping and remaining migration work.

## ADDED — blueprint/design/tui.md: Ownership verification and separate adjustments

Source inspection on 2026-10-26 establishes the following baseline. Paths and line numbers refer to the unmoved source.
Read evidence is distinguished from executed checks; this inspection alone does not establish latency or race safety.

- **Shared buffers and undo align.** `src/tui/app.ts:440` holds the buffer map, and `:935` reuses a buffer by key.
  `src/tui/buffer.ts:46` holds text and undo/redo stacks. `src/tui/windows.ts:20` splits using the same buffer with a
  new view. Preserve shared-buffer identity and independent view positions when moving these modules.
- **Window/tab containment differs.** `src/tui/app.ts:251` defines a Tab containing views, with one global tab list
  at `:441`. `src/tui/windows.ts:20` adds a second view inside a tab. The intended model has windows containing tabs.
  `src/tui/session.ts:144` restores tabs with panes; `:172` writes that arrangement. Changing containment therefore
  needs a separate behavior change covering session migration, focus, tab commands, scratch and split rendering
  (roadmap `3.3`, `3.15`). Preserve the current model in ORG; isolate it behind the windows feature boundary.
- **The shared tools follow the active view, with a floating-editor exception.** `src/tui/app.ts:855` returns the
  floating view when present; `:862` returns the active tab's active view otherwise. Info (`src/tui/info.ts:44`),
  footnotes (`src/tui/footnotes.ts:28`) and outline (`src/tui/outline.ts:80`) read `app.view`.
  `src/tui/draw.ts:268` composes one shared right area. Preserve this behavior during moves. Recommend that the future
  document-tools context follow the active file tab even during floating editors; treat changing that exception as
  a separate reviewed behavior change with coverage for properties and other virtual buffers.
- **Per-document tool-state restoration is not established.** `src/tui/panels.ts:26` keys stored positions by tool
  kind, not document. `src/tui/outline.ts:82` resets folding and scrolling when its buffer key changes. Remembering
  those values per tab/document needs an explicit state-key and lifetime design; it is not an existing guarantee.
- **One active vault context aligns, with supported outside-file cases.** `src/tui/vaults.ts:266` switches the App's
  context after handling dirty buffers. `src/tui/app.ts:935` also supports outside-file buffers; `:989` describes
  read-only tabs from another vault. Preserve home, Elsewhere, peeks and those read-only tabs; one active vault does
  not mean every displayed file must belong to it (VV behavior and roadmap `17.10`).
- **Local editing and a common save gate align; asynchronous gateway execution is future work.**
  `src/tui/editing.ts:382` pastes into the view's buffer after checking focus/version across clipboard access.
  `src/tui/saving.ts:37` saves through `App.writeBuffer`, and `:205` autosaves with insert/conflict/Git guards.
  `src/tui/app.ts:1165` writes synchronously, then updates watcher/graph/buffer state. Its separation is useful, but
  its signature and implementation do not establish a nonblocking gateway. Preserve it until a dedicated migration.
- **Version/update placement is a planned UI change.** `src/tui/draw-topbar.ts:112` still places worker, version and
  upgrade controls in the right-side list. Moving version/update beside branding requires a separate layout change
  and affected screenshots; ORG only establishes ownership for those controls.

### Focused verification

Executed against unchanged source on 2026-10-26:

```sh
bun test tests/tui.test.ts -t \
  'split, focus, move, swap, close, only|autosave: after the idle delay|a column at the right edge under the tab strip'
bun test tests/tui.test.ts -t 'autosave: after the idle delay'
```

The first run passed the split/focus test and the shared right-rail placement test; the autosave test failed. The
isolated autosave rerun failed at the same assertion, `tests/tui.test.ts:1960`: the file contained `abc` when `ab` was
expected while the fixture's Git index lock existed. Initial idle saving and the mid-insert assertion passed before that
failure. Both runs used external timeouts with forced kill; neither reached its bound.

Follow-up probe: a temporary preload wrapped Git.indexLocked without changing its return value or source/tests. It
logged the cached checkout, a fresh checkoutOf result and the fixture lock's existence. Before the fixture created its
own .git, discovery found and cached /tmp/.git. After tests/tui.test.ts:1956 created the fixture .git directory and its
lock, fresh discovery found the fixture repository, but indexLocked still consulted the cached /tmp checkout and
returned false. The trace reproduced the assertion failure.

Source explains the trace: tests/tui-harness.ts:36 creates fixtures below the temporary directory; setup at
tests/tui.test.ts:1850 constructs App before the test creates its .git. src/core/git.ts:39 walks upward;
src/tui/git.ts:57 retains a non-null checkout, and :76 prefers that checkout over fresh discovery. The fixture's own
.git directory therefore exists, but its lock is not the one being checked. The repository's linked-worktree .git file
is not the checkout selected in this failure.

Control run: set TMPDIR to a newly created temporary parent containing an unrecognized .git sentinel file. This
exercises checkoutOf's existing stop-at-invalid-marker behavior, preventing inheritance of /tmp/.git without changing
that shared directory. The original test, without the probe preload or any source/test edits, passed: one test, seven
assertions, about 830 ms for the run. Probe and control both used a 60-second external bound with a five-second
forced-kill allowance. Temporary evidence is in /tmp/issue55-autosave-probe.log and /tmp/issue55-autosave-isolated.log.

This establishes an environment-dependent interaction between fixture setup and cached ancestor discovery. Recommend
fixture isolation or creating its Git context before App construction in a separately reviewed change; whether live
nested-repository creation should invalidate an existing cached checkout is a separate product-policy question. It does
not establish a linked-worktree defect, a general autosave failure, or a need for longer timeouts. No source or test was
changed, and no whole suite or terminal suite was run.

These checks cover existing interaction behavior, not the proposed window/tab hierarchy, every tool's context, shared
undo across all views, or responsiveness under load. Those broader claims remain source evidence or future acceptance
work as identified above.

Recommend a separate window/tab workstream before any implementation that depends on windows owning tabs. It should also
settle the active-document context and tool-state lifetime above. The future gateway work must reconcile this
TUI-owned-buffer model with the draft ENG proposal; this revision does not adopt ENG wholesale. Neither follow-up is
required for behavior-preserving folder moves. Recheck source evidence before each implementation PR.

## ADDED — blueprint/design/how-it-works.md: Import contracts and loading

Recommendation: a named entry file for each heavy feature, not a re-export-all `index.ts`. Export keeps its current
entry semantics; syntax uses `syntax.ts`, media uses named image/diagram/paint entries, and diagnostics uses spell.
Light `types.ts` files import no heavy implementations for values. A feature's worker entry is not its caller API. The
shared loader moves from `core/lazy.ts` to `core/foundation/platform/lazy.ts` with identical behavior.

Preserve every existing dynamic import and first-use boundary, including export writers and paint loaders. Never
introduce eager imports via a barrel. Syntax and highlight remain as eager as they currently are: #56 decides whether
that changes. Preserve worker-local Hunspell, diagram drawing and export libraries. All worker moves update URL
resolution, compiled entry lists, assets, scope discovery and packaging tests together, with source and compiled probes.

Explicit imports avoid relying on implicit directory resolution. TypeScript recommends matching module resolution to the
runtime; Node package exports define package interfaces, not automatic encapsulation of local relative imports. See the
[TypeScript module reference](https://www.typescriptlang.org/docs/handbook/modules/reference.html) and [Node package
documentation](https://nodejs.org/api/packages.html). The area layout and 20-file trigger are ORG's recommendations, not
prescriptions from either source. Keep Bun's existing configuration and distribution contract.

## ADDED — blueprint/design/how-it-works.md: Internal dependency direction

Preserve the enforced face boundary and worker-only diagram renderer. Contracts and primitives must not import their
composer for values. Extract `editable` from App, drawing primitives from draw, UTF-8 encoding from stream dispatch, and
mutation marker operations below file/rename orchestration. Move CommandSpec into independent command contracts. Use
`import type` for genuine type dependencies; do not conceal runtime work with casts or reverse type dependencies.

Add focused boundary checks for these extracted seams and regression fixtures that reject the reverse edges. Do not ban
every cross-feature import or every type cycle. Repeat the runtime graph after each extraction, reporting SCC membership
against research's mutation (3), export (3) and TUI (64) baseline. A smaller SCC is supporting evidence; initialization,
errors and cancellation tests remain necessary. ENG can later reuse or revise these boundaries without ORG creating a
running engine, IPC, runtime operation registry or new document owners. Contract design is in scope.

## MODIFIED — blueprint/design/tui.md: Feature controllers

Previously: App owns shared state and wires feature controllers, but supplies helpers back to features and also owns
clipboard and notification work (`research.md`, long-module and dependency sections).

Keep App's ownership and `App.writeBuffer` as the only TUI note-write gate. Extract clipboard serialization,
notification scheduling and lower-level predicates as focused collaborators. Give isolated feature logic small, explicit
capability interfaces only where its actual calls justify them. Keep App-based integration tests for wiring, write
refusal, focus and disposal. Do not build a second mock App or a global context containing all App fields.

## ADDED — blueprint/design/how-it-works.md: Size and shared-code conventions

The current handwritten source ceiling is 1,000 lines (T1); about 500 lines is the design aim. Finish with a 600-line
ceiling, with 750 as the next step. At each step, cap every pre-existing larger file at its measured size, never above
1,500. Moves carry caps to the new paths; new modules obey the current ceiling. A cap may reset to measured growth
caused solely by formatting longer import paths, with its old/new value and delta recorded in the task (ORG-D2 dated
note). Preserve normal formatting, non-import code and comments; verify mapped dependencies and executable bodies. This
exception permits no implementation growth. The same applies when import formatting alone moves a file from at or below
the ceiling to above it; the file gets an exact cap equal to its measured size, recorded in the task and removed by its
extraction task. Lower touched exceptions to their actual size and remove them below the ceiling. Final handwritten
exceptions require a named responsibility, rationale and follow-up task; no blanket exemption for App. Keep generated
server locks outside the handwritten ceiling under a separate measured cap and verify their generator. Do not split
embedded strings by hand. The research inventory of all 55 modules over 500 is the backlog, not only the nine over
1,000. Every row receives an extraction or a documented cohesive-module assessment; reaching 600 does not erase the
500-line aim.

For tests, recommend a 1,000-line aim and a 1,500-line ceiling on new/split feature files, with exact non-growing caps
for remaining legacy files; the import-formatting exception above applies to source caps only. Keep process fixtures and
generated snapshots separately identified. This implements the
review of roadmap `27.3`, approved in ORG-D2; source and test rules have distinct defaults.

Extract pane navigation shared by footnotes/info/outline first. Share panel close or scroll helpers only after checking
focus, selection and pinning differences. Keep data-format parsing branches explicit unless identical semantics are
shown. Share fixture creation and protocol framing, never a generic assertion runner that hides scenarios.

Retain WorkerRequests for clients already using it. A narrowly shared lifecycle helper is optional only after tests
cover disposal, late delivery, queue saturation, cancellation and failure cleanup. Diagram retries/persistence, paint's
byte cache and export progress/spooling stay feature-owned. No universal scheduler or queue rewrite. Retain export's
existing format strategy and lazy registry, with encoding below dispatch; no class hierarchy. Concentrate custom AST
guards and library adapters only where repeated contracts are identical. Preserve WriteRefused, CliError,
WorkerRequestError and cleanup semantics; no global result-type conversion. Triage Knip candidates against
worker/build/tool entries before reducing export visibility; delete no behavior based on raw tool output.

## ADDED — blueprint/design/how-it-works.md: Duplication, patterns and code quality

### Repetition with equivalent semantics

Re-run jscpd with research's version, thresholds and source/test scopes; compare clone identities after translating
moved paths. The six production clone pairs have explicit owners in the coverage ledger. Extract the
footnote/info/outline navigation mechanism in ORG-T10 where behavior agrees. Review close/leave and scroll helpers
against focus, pinned selection and filtering before sharing them. Keep data-format branches explicit when their formats
differ.

During test splits, share setup only where environment, trust resets and cleanup lifetimes match. Keep assertions and
scenario names in each test. ORG-T40 completes remaining protocol/setup clone triage and compares the final source and
combined reports. Do not pursue a zero-duplication target or hide tests inside a generic runner.

### Pattern assessment has a deliverable

- **Workers, ORG-T40:** compare diagram, paint, regex, syntax, spelling, export and walk on admission, ownership,
  cancellation, deadlines, progress, retry, caching and disposal. Retain WorkerRequests where already used. Extract a
  small lifecycle helper only for equivalent mechanisms, with disposal, late-delivery, saturation, cancellation and
  failure-cleanup coverage. Record feature policies that must stay separate. A reasoned retain outcome is valid;
  silently skipping the assessment is not.
- **Export, ORG-T29/T39:** retain the existing lazy format strategy; separate UTF-8 encoding below dispatch and isolate
  PDF font/layout adapters. Verify all format registrations still dispatch through their existing loading boundaries,
  including output, cancellation, failure and cleanup. No replacement class hierarchy without a demonstrated need.
- **TUI composition, ORG-T24/T10:** retain explicit App wiring and state ownership. Extract actual small capabilities
  and clipboard/notification collaborators; demonstrate focused tests can avoid constructing App where justified,
  while integration tests still exercise wiring. No generic context object or dependency-injection container.

### Naming, unused declarations, types and failure contracts

ORG-T41 reviews names by role within their new owner, rather than globally stripping prefixes. Public commands and
persisted keys remain stable. Configure unused-code discovery with CLI/TUI/LSP, worker, build, test, fixture, site and
script entries before triaging Knip's reported 58 files, 186 exports and 54 types. Give each candidate a disposition:
used, false positive, narrow visibility, proven unused removal, or deferred with evidence. Preserve optional external
tools and documented scripts. Dependency candidates receive explicit retain/follow-up reasoning; do not silently change
packages. Remove an export separately from its still-used implementation.

ORG-T42 inventories repeated custom AST casts and library adapters, reusing guards only for identical contracts. Keep
runtime guards that validate external input; a cast is not a substitute. Document failure ownership at extracted
boundaries: which layer refuses an operation, cleans up, retries or presents the error. Preserve WriteRefused, CliError
and WorkerRequestError behavior, message/exit contracts and intentional cleanup suppression. Exercise failure and
cancellation paths before and after an adapter extraction; avoid a global result type or compiler-flag overhaul.

### Dependency and build evidence

The known reverse-edge targets are command contracts (ORG-T1), editable/drawing helpers (ORG-T9), mutation markers
(ORG-T13) and export encoding (ORG-T39). Add focused forbidden-edge fixtures for the extracted boundaries and keep
worker-only diagram rendering enforced after moves. Re-run both full and runtime import graphs with research's settings;
report actual component membership, legitimate remaining dependencies and worker URL edges separately.

ORG-T43 brings together the mapped where/export-stream/regex measurements, test identities, dependency results and
source/compiled entry probes. Use completed comparable runs with host/cache conditions and explicit external bounds.
Retain shared integration selection under D239; do not exclude App, dynamic imports or workers to manufacture a smaller
scope. A remaining broad dependency needs an owner explanation or an approved follow-up. Baseline failures, including
the autosave Git-lock assertion recorded above, are reported separately from passing comparisons.

## MODIFIED — blueprint/design/testing.md: Feature tests and selection

Previously: three broad files contain 41,661 lines, the shared TUI harness imports App/topbar helpers, and CLI tests
reach main's dynamic TUI import. D239 follows transitive imports, so splitting files alone retains broad closures.

Target `tests/core/<group>/<feature>/`, `tests/tui/<scope>/<feature>/`, `tests/cli/<area>/` and `tests/support/`. Mirror
the ownership paths above; tests for pure document edits remain separate from TUI buffer/view tests. Keep terminal
checks under their existing feature hierarchy and fixtures under `tests/fixtures/`. Roots retain setup and runner entry
files only. Shared support is split into filesystem fixtures, process fixtures, model harness and canvas helpers; pure
tests never import the model harness. Scope discovery must recursively find the relocated tests, snapshots and helper
dependencies. Preserve preload behavior and snapshot names/content explicitly.

| Old collection | Target scenario owners |
| --- | --- |
| `core.test.ts` | text, config, markdown, media, editing, diagnostics, distribution and capture/mutations |
| `vault.test.ts` | vaults, walk, graph, links, mutations, search, git and CLI integration |
| `tui.test.ts` | input, editor, navigation, screen, explorer, panels, search, diagnostics, media and git |

Move mixed historical review groups scenario by scenario. Preserve titles, assertions, hooks, sandbox lifetime, trust
reset and XDG setup; isolate process-wide environment fixtures. Compare test identities/counts before and after each
split. A scenario spanning features remains integration coverage under its principal behavior, with imports intact.

Separate pure top-bar location/geometry tests from App construction; remove the topbar import from the generic model
harness. Test CLI handlers directly for handler behavior, while retaining launcher dispatch/argument/error tests in a
small launcher suite. Feature/controller tests use real focused collaborators and explicit capabilities; app journeys
retain the full harness. D239 must still select shared integration tests when App dependencies change. Do not fake a
narrow scope by excluding dynamic imports, App or workers from the graph.

Repeat the research's where/export-stream/regex cases at their mapped paths in a disposable baseline checkout. Report
selected unit files and terminal checks separately, wall time, pass/fail/skip, host state, cache conditions and bounds.
The existing 900-second partial runs and host-sensitive failure are not a green timing baseline. Establish passing
focused pre/post runs per PR, report baseline failures separately, and resolve or isolate the installed-skill fixture
before using the completed comparison as acceptance evidence. No uninstall of host skills. No promised percentage
speedup. Coordinate selector changes with CIW-T6 and slow-case work with CIW-T9; preserve conservative fallback.

## ADDED — blueprint/design/testing.md: Timeout policy (separate phase)

Recommendation: **raise no limits initially**. Keep the shared unit default at 30,000 ms; centralize it in
`tests/support/timeouts.ts`, with named existing slow budgets for export reads, large parse, skill integration, server
integration and release-build hooks. Preserve per-file setDefaultTimeout calls where Bun requires them; preload alone is
insufficient. Keep the package runner's numeric fallback aligned and test that alignment.

Name budgets by operation, not speed tier alone. Record the present number and reason for each override; do not assign a
longer constant to all tests in a moved folder. T12 centralizes policy immediately after T1. Split compound CLI export
scenarios in T23, retaining each assertion and any intentional end-to-end sequence. Distinguish aggregate test time from
each CLI child's 20-second bound. Narrow feature tests before considering any later increase; centralization itself does
not shorten execution.

Keep terminal waits (10-second local floor, 30-second CI floor), 120-second check lifetime, frame waits, cleanup grace
and 45-minute CI ceilings separate and unchanged. Product worker/process deadlines remain unchanged too. Keep an
external forced-stop allowance for runs and retain the existing SIGTERM-resistant child test. A larger budget cannot fix
the observed overflowing timer; investigate clock arithmetic separately, with a failing regression test in its own bug
fix if confirmed. That fix is not a behavior-neutral ORG extraction.

Only propose an individual increase after repeated focused runs on supported CI hosts show legitimate work exceeds its
existing budget after narrowing/splitting. Record distributions and the slowest passing run; request approval for the
smallest justified named budget. Neither blanket 60-second units nor longer terminal/CI ceilings is supported by the
current evidence. This phase changes test organization/policy only, preserving application behavior.

## Phase sequence and review gates

Recommendation: run T12 immediately after T1; run the design-only T44 alongside the mechanical moves. T44 gates the
contract-dependent extraction in T24, not the moves. This addresses timeout policy early without making independent
organization work depend on a future gateway or ENG.

Main sequence (IDs are stable): ORG-T1 → T12 → T2–T5 → T13–T15 → T6–T7 → T16–T18 → T8 → T19–T22 → T9 → T23–T24 → T10 →
T25–T39 → T40–T43 → T11. Parallel design lane: T1 → T44 → T24. These are 44 planned tasks. Their files own exact
dependencies; design work can proceed alongside moves without parallel broad rename branches. Each implementation phase
preserves behavior. Consolidate adjacent phases only after reviewing their manifests; keep moves distinct from
responsibility or policy changes.

[Issue coverage](#issue-coverage-and-finding-owners) assigns the seven Wanted items and all measured candidates to
tasks. ORG-T40–T43 make worker/pattern review, naming/unused-code, types/errors and final scoped/build measurements
explicit. The [folder map](#modified--blueprintdesignhow-it-worksmd-module-map) defines the nested owners and TUI
boundaries.

Design approval was granted on 2026-10-27. Task files own status and remaining predecessors. Each task is one planned
PR into `dev`; the implementation and review gates still apply. Recheck open PRs before each task. If a manifest spans
too many independent areas for one sitting, propose numbered child PRs with the same invariants before starting.
Keep each move reviewable. Task IDs remain stable.

For every PR: save an exhaustive move/extraction manifest; run the affected tests before and after, the affected
terminal checks, boundary and size checks. Before proposing it run typecheck, lint, check:docs and the scoped check
required by AGENTS.md. Never run the whole suite or every terminal check. Pure relocations preserve assertions and
snapshot content. Extraction adds characterization coverage where missing; a discovered bug goes in a separate fix with
a regression test verified to fail without it. Explain known baseline failures instead of silently accepting them.
Update affected design/documentation paths and applicable conventions in the same PR. Root consolidation still needs
approval. No #56 loading/memory work, ENG implementation, dependency additions, ready marking or merging.

### Revised task destinations and acceptance

Keep the 44 stable task IDs. T12 establishes unchanged timeout defaults early; T23 handles compound scenario splitting
with test-boundary work. T44 is an independent design lane, required by T24's contract-dependent extractions. Gateway
implementation and window/tab behavior changes remain follow-up work. Task files are authoritative for dependencies.

ORG-T7/T16/T17/T36 must include windows/layout and tab-strip ownership explicitly in their manifests. Existing mixed
modules move intact before extraction; do not split a runtime owner merely to satisfy a folder label. ORG-T1 records
which focused tests exercise shared-buffer edits, independent view positions, right-tool context, session restore, vault
switching, save refusal and clipboard completion after focus/version changes. Missing characterization tests belong to
the extraction that needs them; tests for future windows-containing-tabs belong to the separate change.

The source/module review does not prove input remains smooth under load. Gateway migration must measure typing and focus
responsiveness while representative operations run, in addition to cancellation, stale-result and save-race coverage.
ORG preserves existing execution and checks affected interaction paths before/after each extraction.

### Move mechanics, history and compiled verification

Path-looking text rendered, measured, compared or written into test fixture files (labels, tree samples, expected
output and fixture bodies) is data: keep it byte-identical, list exact retained entries and exclude it from import/path
rewrites, which can change widths or expected strings; the stale-path scan cannot distinguish data from references.

1. **Manifest and review size:** publish exact old/new paths and affected entry points before editing. Use git mv for
   tracked relocations, then one manifest-driven scripted import/path rewrite per move PR. Review its diff before
   accepting it. Git infers renames from similarity; git mv alone does not preserve a special rename record. Keep
   unrelated formatting, symbol renames and responsibility splits out of move commits. Review with git diff -M and
   --summary; split a manifest by coherent feature when rename detection or review becomes unclear.
2. **No stale references:** update static/type imports, re-exports, dynamic imports, workerUrl/new URL references,
   build entries, fixture paths, selector maps and docs from the same manifest. Run typecheck, boundary and size
   checks, plus a resolved import-graph comparison and searches for each old path. Verify string-based worker/asset
   references as well as TypeScript imports. Allowlist deliberate historical fixture strings with a reason; do not
   conceal missed moves behind compatibility barrels. T1 establishes these checks for subsequent move PRs.
3. **Source and worker paths:** run affected source feature tests and the relocated equivalents of the workerUrl
   cases (tests/core.test.ts:4888) and build-entry check (tests/distribution.test.ts:821). The latter currently joins
   worker names under src/core, while src/core/workers.ts:17 resolves source paths relative to its module and compiled
   paths under core. Nested moves must update these assumptions, package.json's entries and scope discovery together.
4. **Compiled binary after each move PR:** build the host binary through the repository's package build command,
   preserving --root=src and autoload flags. Copy/run it by absolute path from a temporary directory away from the
   source tree, with isolated XDG state/config/cache/data. Check info --json and the affected CLI/feature behavior.
   Run the affected terminal scenario against that binary when a TUI path moved; the harness already accepts bin
   (tests/terminal/session.ts:69). Record build command, artifact identity and probe results in the PR.
5. **Workers must actually run:** for each moved or affected worker, issue a representative request through its real
   caller in source and compiled modes, checking completion and any needed cancellation/cleanup. A URL string or
   successful binary startup alone is insufficient: detect missing-worker fallback and verify nested worker spawning
   such as export to diagram. If the shared URL resolver changes, probe all its worker callers as the affected scope.
   Add missing focused probes in that move PR; do not defer compiled-worker evidence until final reconciliation.

Do not run the whole suite or every terminal check. A build/probe failure blocks the affected move; preserve failed
commands and distinguish baseline/environment failures from introduced ones. These are future move-PR gates; no build or
source/test modification is implied by this documentation review.

### Existing review gates

[Tasks](#implementation-tasks) define one PR per task in dependency order. Recheck open work before each move; finish an
area before moving its dependents, and avoid parallel broad rename branches. The design-stage query on 2026-10-26 found
only draft PR #107 open; repository-health #106 has a current 2026-10-26 run. These are observations, not future
clearance to move files. CIW-T6/T9 and any new feature work must be coordinated at execution time.

Each PR names ORG-Tn, carries its complete path manifest, behavior invariants, focused pre/post checks and any baseline
failure. Update affected design path references, AGENTS.md and CONTRIBUTING.md when paths/rules change; consolidate root
design only with approval. No user-visible behavior is intended: user docs/CHANGELOG change only where developer
commands or documented paths actually change, with no blueprint IDs in user docs. Keep PR #107 draft.

## Issue coverage and finding owners

All entries are planned, not completed. Implementation PRs record resulting paths, evidence and dispositions against
research's measured baseline. Every accepted improvement must have a visible outcome before closing #55.

### Full issue scope

| Issue item | Required work and evidence | Owner tasks |
| --- | --- | --- |
| Wanted 1: analysis | Refresh size, clone, dependency, code-quality and test findings | T1, T40–T43 |
| Wanted 2: folders | Nested core/TUI feature groups and matching test owners; complete manifests | T2–T8, T13–T22 |
| Wanted 3: smaller modules | Cohesive splits, all inventory rows assessed, staged caps | T10, T23–T39, T11 |
| Wanted 4: repetition | Share equivalent code; explain retained differences | T8, T10, T19–T22, T40 |
| Wanted 5: patterns | Worker, export and controller pattern assessment | T24, T29, T39–T40 |
| Wanted 6: other improvements | Boundaries, code quality, testability and build | T1, T9, T13, T39–T43 |
| Wanted 7: scoped tests | Narrow feature tests, retain integration, measure pre/post | T8–T9, T19–T24, T43 |
| How: behavior-neutral PRs | Focused checks, build entries, design and conventions | Every task |
| Gateway preparation | Contracts and operation/client separation | T44, T24, owners |
| Additional timeout phase | Unchanged default and named budgets; separate from moves and product deadlines | T12 |

All task IDs here have the prefix ORG-. Preserve roadmap `0.2`, `0.3`, `0.8`, D235 and D239. Window/tab containment,
floating-editor tool context, per-document tool-state persistence and version-button placement are separate behavior
changes; gateway implementation and #56 memory/loading are outside ORG. Their folder boundaries still inform ORG.

### Duplication and pattern dispositions to record

Research's jscpd source-only baseline contains six pairs, not six mandatory abstractions. A task must record whether it
shares, retains or defers each candidate and why. Use identical scan settings and mapped paths for comparison.

| Reported source pair | Owner | Proposed treatment and check |
| --- | --- | --- |
| footnotes:253 / info:251 | T10 | Shared row navigation; feature jumps/folding retained; see task 10 evidence |
| explorer:1163 / history:288 | T10 | Shared leave in PanelFocus; close already shares visibility transitions |
| footnotes:264 / outline:162 | T10 | Same shared row navigation; filtering/pinning order retained |
| data:203 / data:372 | T32 | Keep format-specific parsing explicit unless equivalence is demonstrated |
| diagram-jobs:99 / paint-jobs:54 | T40 | Compare lifecycle cleanup; preserve retry/cache/queue policies |
| draw-panels:610 / draw-panels:680 | T36 | Compare selection/scroll mechanics with pinning and filtering coverage |

File names above refer to the source paths and lines in research.md. The combined report has 104 clone pairs, including
setup/protocol similarities. T8/T19–T22 own fixture review during test splits; T40 accounts for remaining pairs,
including the headless/herdr protocol candidate. Keep assertions visible and cleanup lifetimes unchanged. Raw reports do
not by themselves establish that code is safe to share.

| Pattern candidate | Assessment owner | Completion evidence |
| --- | --- | --- |
| Worker job queues | T40 | Compare seven families; retain policies or test shared lifecycle |
| Export formats | T29, T39 | Keep lazy strategy; encoding helper, PDF adapters and output/failure tests |
| TUI controllers/App | T24, T10 | Actual capability contracts, focused tests, explicit wiring and retained ownership |

### Dependency and code-quality dispositions to record

- T1: independent CommandSpec contracts and catalog-direction fixtures.
- T9: editable and drawing primitives below composition, with reverse-edge fixtures and focused tests.
- T13: mutation markers below file/rename orchestration, retaining refusal and undo.
- T39: UTF-8 encoding below export dispatch, preserving lazy format loading.
- T41: entry-aware Knip triage of the 58 file, 186 export and 54 type candidates, plus package/binary flags.
  Record actual use, false positives, narrowed exports, proven removals and explicit follow-ups. Check naming by role.
- T42: custom AST guards/library adapters and error/refusal/cancellation/cleanup ownership, with characterization.
- T43: full/runtime dependency comparison, worker URL/build edges, recursive test selection and compiled entry probes.

Preserve documented scripts, optional tools, worker entries and generated assets. Do not remove behavior to improve a
report. A dependency or type-only edge may be legitimate; give retained cases a reason rather than imposing a blanket
cycle ban. No global compiler/error-framework change is implied.

### Every oversized module has an owner

These are all 55 modules above 500 lines in research's baseline. Each owner must inspect cohesion, extract useful
responsibilities where needed, or record a justified cohesive-module assessment. The 600-line final ceiling does not
replace the 500-line aim. Generated locks have their own measured cap. A remaining handwritten exception needs its
responsibility, rationale and follow-up; ORG-T11 audits the completed ledger. Split oversized implementation manifests
into coherent child PRs before execution instead of treating an owner assignment as permission for a mass rewrite.

| Baseline file | Lines | Owner |
| --- | ---: | --- |
| `src/tui/app.ts` | 1,446 | ORG-T10 |
| `src/core/graph.ts` | 1,433 | ORG-T25 |
| `src/core/layout/code.ts` | 1,417 | ORG-T26 |
| `src/tui/explorer.ts` | 1,268 | ORG-T30 |
| `src/core/servers/locks.ts` | 1,239 | ORG-T39 |
| `src/core/syntax.ts` | 1,170 | ORG-T27 |
| `src/tui/keys.ts` | 1,166 | ORG-T31 |
| `src/core/layout/render.ts` | 1,076 | ORG-T28 |
| `src/core/export/pdf.ts` | 1,038 | ORG-T29 |
| `src/core/config.ts` | 998 | ORG-T32 |
| `src/tui/gitbranchview.ts` | 992 | ORG-T30 |
| `src/tui/draw-overlays.ts` | 954 | ORG-T36 |
| `src/tui/draw-pane.ts` | 943 | ORG-T36 |
| `src/core/data.ts` | 888 | ORG-T32 |
| `src/core/watch.ts` | 866 | ORG-T33 |
| `src/tui/mouse.ts` | 843 | ORG-T31 |
| `src/core/walk.ts` | 825 | ORG-T33 |
| `src/core/search.ts` | 805 | ORG-T34 |
| `src/core/rename.ts` | 804 | ORG-T35 |
| `src/tui/draw.ts` | 761 | ORG-T36 |
| `src/tui/problems.ts` | 759 | ORG-T37 |
| `src/tui/vim.ts` | 756 | ORG-T31 |
| `src/core/parse.ts` | 736 | ORG-T32 |
| `src/tui/gitpanel.ts` | 713 | ORG-T30 |
| `src/tui/git.ts` | 710 | ORG-T30 |
| `src/tui/draw-panels.ts` | 708 | ORG-T36 |
| `src/tui/editing.ts` | 691 | ORG-T38 |
| `src/tui/peek.ts` | 691 | ORG-T38 |
| `src/tui/languages.ts` | 690 | ORG-T37 |
| `src/tui/buffer.ts` | 679 | ORG-T38 |
| `src/core/servers/client.ts` | 677 | ORG-T39 |
| `src/tui/watch.ts` | 666 | ORG-T10 |
| `src/tui/updates.ts` | 660 | ORG-T10 |
| `src/tui/vaults.ts` | 630 | ORG-T10 |
| `src/core/theme/theme.ts` | 615 | ORG-T39 |
| `src/core/graph-resolve.ts` | 605 | ORG-T25 |
| `src/core/update.ts` | 605 | ORG-T39 |
| `src/cli/cli.ts` | 602 | ORG-T23 |
| `src/core/home.ts` | 586 | ORG-T33 |
| `src/core/servers/languages.ts` | 584 | ORG-T39 |
| `src/core/vault.ts` | 584 | ORG-T39 |
| `src/core/report.ts` | 583 | ORG-T39 |
| `src/tui/views.ts` | 583 | ORG-T38 |
| `src/tui/files.ts` | 568 | ORG-T30 |
| `src/core/merge.ts` | 549 | ORG-T39 |
| `src/core/layout/blockdiff.ts` | 544 | ORG-T26 |
| `src/tui/actions-links.ts` | 541 | ORG-T38 |
| `src/core/servers/manager.ts` | 534 | ORG-T39 |
| `src/core/glyphs.ts` | 531 | ORG-T39 |
| `src/tui/completion.ts` | 524 | ORG-T38 |
| `src/core/reach.ts` | 517 | ORG-T25 |
| `src/tui/panels.ts` | 517 | ORG-T10 |
| `src/core/folders.ts` | 508 | ORG-T39 |
| `src/tui/lens.ts` | 505 | ORG-T38 |
| `src/tui/search.ts` | 503 | ORG-T34 |

### T10 composition assessment

[Task 10](tasks/10-responsibility-splits.md#responsibility-assessment) records the App/watch/update/vault and panel
responsibilities, their current sizes, retained ordering and separately bounded extraction candidates. Clipboard and
notification scheduling are independent collaborators; App keeps shared state and the sole note-write gate. The
remaining composition files have not been asserted to meet the final 600-line ceiling. T11 audits their dispositions
and any final exception against ORG-D2; further controller splits require coherent child PRs with their own lifecycle
characterization rather than extending this extraction's manifest.

### T25 graph assessment

[Task 25](tasks/25-graph-splits.md) records the cache/build, move, editor-overlay, query and admission extractions with
Graph as the sole mutable-index owner. Graph drops below 1,000 lines and its legacy cap is removed. LinkResolver and
Reach receive explicit cohesive-owner assessments; T11 still owns the final staged-ceiling reconciliation. Exact edges,
state/body preservation, isolated owner runs, compiled checks and the ancestor-Git fixture control are in its record.

### T26 code-layout assessment

[Task 26](tasks/26-code-layout-splits.md) preserves the code-layout entry while extracting explicit contracts, page
composition, cell framing/block membership, structural wrapping and documentation owners. The legacy code cap is
removed; the largest new owner is 533 lines. Block-diff formatting is retained with its distinct unit/tint semantics.
The task records exact declaration/edge deltas and complete IR/source-map comparisons; no behavior change is intended.

### Measured completion and known failures

T43 must publish completed, comparable scope runs for the mapped location/header, export-stream and regex cases. Report
selected unit files and terminal checks separately; preserve shared integration selection. Document test identity
counts, assertions/snapshots retained, wall time, environment/cache conditions and external bounds. The research's
partial 900-second runs are not a passing baseline. Fix or isolate host-dependent fixtures without uninstalling host
skills before drawing a timing conclusion.

The ownership review's split/rail checks passed; the autosave assertion failed under inherited /tmp Git discovery. The
focused-verification section records the checkout-cache trace and passing isolated control. Treat the original
environment failure separately from timeout evidence; no fix or budget increase is bundled into this plan.

ORG-T11 checks the ledger against merged task evidence, and ORG-T12 verifies its independent timeout policy. Every
retained or deferred finding needs explicit rationale; unfinished accepted improvements remain visible outstanding work
when reviewing whether #55 is complete.

### T27 syntax assessment

[Task 27](tasks/27-syntax-splits.md) keeps the syntax entry and separates grammar assets/loading, tree ownership,
code-model extraction and link tokens. All mechanisms are below the entry/tree owner with reverse-edge fixtures.
The largest extracted owner is 324 lines; the 1,170-line syntax exception is removed. Eager asset imports, one runtime
initialization, grammar cache identity, embedded parsing and child-first disposal remain unchanged. This is a
responsibility extraction; all seven runtime SCC memberships stay the same.

### T28 Markdown-layout assessment

[Task 28](tasks/28-markdown-layout-splits.md) preserves the Markdown entry and extracts context/cache composition,
recursive block dispatch, row finishing/spacing, picture handling and the identical standalone-node spacing guard.
The legacy render cap is removed; the largest owner is 469 lines. Complete IR/cache/HTML/source-map comparisons and
exact dependency/test deltas are recorded there. Distinct inline and data guards remain separate. The tracked Mermaid
warm-cache test fails equally on both revisions; fresh-cache controls pass, with its isolation follow-up retained in T43.

### T29 PDF assessment

[Task 29](tasks/29-pdf-splits.md) preserves the lazy PDF entry and output lifecycle while separating font adaptation,
line layout/painting, chapter/block writing and pagination. Each export still owns one document and its collaborators;
font fallback, picture and chapter caches keep their original scopes. The PDF cap is removed; the largest owner is
440 lines. Font registration, stream release, footer/bar cleanup and complete PDF-object comparisons are recorded in
the task, including PDFKit's alpha-mask ID serialization variation. All seven runtime SCC memberships remain unchanged.

### T30 Explorer and Git assessment

[Task 30](tasks/30-explorer-splits.md) uses separate child PRs for Explorer and Git controllers, keeping their
independent lifecycles reviewable. The Explorer child separates file visibility, path policy, row construction,
zoom/reveal and item dispatch through live capabilities. Explorer retains view/selection state, listing lifetime and
its row/filter caches; IO remains delegated to the same file/vault owners. Its 1,274-line cap is removed. The unchanged
574-line Files controller is assessed as cohesive write/preview policy. The Git child separates status scheduling,
base/staged caches, branch reads/rows and panel presentation through live capabilities; interactive worktree prompts
remain App-backed. The branch view falls from 1,005 to 473 lines and loses its cap. Git retains shared state and
orchestration at 591 lines; the panel retains selection/input and action orchestration at 540. Both are below the final
600-line ceiling; the task records why their shared lifecycles remain cohesive above the 500-line aim. T11 audits final
size dispositions.

### T31 input assessment

[Task 31](tasks/31-input-splits.md) separates key binding data, context bindings, help, aliases and decoding below a
compatibility entry point; its 1,166-line cap is removed. Mouse bookkeeping/down dispatch stays with its owner while
one gesture collaborator owns the original click/drag state and another routes areas. Vim grammar, range calculation,
operator completion, edit effects and replay use the same App-owned state and buffers. All extracted owners are below
500 lines. Entry-point exports, ordered binding mutations and existing input bodies are preserved; these App-backed
interaction clients introduce no gateway execution or new scheduling policy.

## Implementation tasks

The 44 files below are authoritative for task scope, evidence, status and dependencies. This section is a navigation
index only. [tasks/README.md](tasks/README.md) explains the convention. IDs remain stable; follow the phase order above.

- [ORG-T1: Contracts and migration gates](tasks/01-contracts-and-gates.md).
- [ORG-T2: Core foundations](tasks/02-core-foundations.md).
- [ORG-T3: Vaults and walking](tasks/03-vaults-walk.md).
- [ORG-T4: Graph and links paths](tasks/04-graph-links-mutations.md).
- [ORG-T5: Content feature paths](tasks/05-content-features.md).
- [ORG-T6: Rendering and export paths](tasks/06-render-export.md).
- [ORG-T7: TUI composition paths](tasks/07-tui-areas.md).
- [ORG-T8: Core test split](tasks/08-test-areas.md).
- [ORG-T9: Pure TUI test boundaries](tasks/09-focused-hosts.md).
- [ORG-T10: App services and shared pane helpers](tasks/10-responsibility-splits.md).
- [ORG-T11: Final size ratchet and reconciliation](tasks/11-final-ratchet.md).
- [ORG-T12: Test timeout policy](tasks/12-timeout-policy.md).
- [ORG-T13: Mutation paths](tasks/13-mutation-paths.md).
- [ORG-T14: Search and editing paths](tasks/14-search-editing-paths.md).
- [ORG-T15: Diagnostics and git paths](tasks/15-diagnostics-git-paths.md).
- [ORG-T16: TUI editor and navigation paths](tasks/16-tui-editor-paths.md).
- [ORG-T17: TUI explorer, panels and overlays paths](tasks/17-tui-panel-paths.md).
- [ORG-T18: TUI git and service paths](tasks/18-tui-feature-paths.md).
- [ORG-T19: Vault test split](tasks/19-vault-test-split.md).
- [ORG-T20: TUI editor test split](tasks/20-tui-editor-test-split.md).
- [ORG-T21: TUI feature test split](tasks/21-tui-feature-test-split.md).
- [ORG-T22: TUI screen and journey test split](tasks/22-tui-screen-test-split.md).
- [ORG-T23: CLI test boundaries](tasks/23-cli-test-boundaries.md).
- [ORG-T24: Focused controller capabilities](tasks/24-controller-capabilities.md).
- [ORG-T25: Graph responsibility splits](tasks/25-graph-splits.md).
- [ORG-T26: Code layout responsibility splits](tasks/26-code-layout-splits.md).
- [ORG-T27: Syntax responsibility splits](tasks/27-syntax-splits.md).
- [ORG-T28: Markdown layout responsibility splits](tasks/28-markdown-layout-splits.md).
- [ORG-T29: PDF responsibility splits](tasks/29-pdf-splits.md).
- [ORG-T30: Explorer responsibility splits](tasks/30-explorer-splits.md).
- [ORG-T31: Input responsibility splits](tasks/31-input-splits.md).
- [ORG-T32: Configuration and parsing splits](tasks/32-config-splits.md).
- [ORG-T33: Walk and watch splits](tasks/33-walk-splits.md).
- [ORG-T34: Search splits](tasks/34-search-splits.md).
- [ORG-T35: Rename splits](tasks/35-rename-splits.md).
- [ORG-T36: TUI drawing splits](tasks/36-tui-render-splits.md).
- [ORG-T37: TUI diagnostics splits](tasks/37-tui-service-splits.md).
- [ORG-T38: TUI buffer and editing splits](tasks/38-tui-buffer-splits.md).
- [ORG-T39: Core adapter and export cleanup](tasks/39-core-adapter-splits.md).
- [ORG-T40: Worker patterns and remaining duplication](tasks/40-worker-patterns-and-duplication.md).
- [ORG-T41: Naming and unused-code cleanup](tasks/41-naming-and-unused-code.md).
- [ORG-T42: Types and error contracts](tasks/42-types-and-error-contracts.md).
- [ORG-T43: Scoped measurements and build reconciliation](tasks/43-measurement-and-build.md).
- [ORG-T44: Gateway contracts and extraction boundaries](tasks/44-gateway-contracts.md).

## Approved choices

Approved on 2026-10-27; recorded in [ORG-D1–ORG-D3](decisions.md).

1. **Core groups:** foundation, application, workspace, documents and rendering, with feature-owned subfolders.
2. **Size limits:** 500-line source aim; staged ceilings 1,000 → 750 → 600; exact legacy caps. Tests aim for 1,000
   with a 1,500 ceiling. Generated lock data keeps its separate cap.
3. **Dependencies and testability:** explicit file imports, light contracts and focused capabilities; retain
   App/launcher integration tests, shared TUI buffers and the common write gate.
4. **Reuse and patterns:** small proven helpers and patterns solving demonstrated problems; retain existing
   worker/export/controller mechanisms where appropriate.
5. **Timeout policy:** T12 immediately after T1, with unchanged defaults and named existing budgets. T23 handles
   compound scenario splitting; product, terminal and CI deadlines remain unchanged.
6. **Scope and order:** 44 tasks, with T44 alongside mechanical moves and before T24's relevant extractions. Gateway
   preparation and ENG compatibility review are included; gateway implementation and migration remain the next stack.

The design-approval gate is satisfied. Task files own implementation status and remaining dependencies; the design
checkpoint does not claim source changes or completed tasks. Parent consolidation and merging retain their review gates.
