# Requirements changes

The workstream remains draft. Accepted ENG-D1–ENG-D15 choices are reflected below; the remaining contracts and
implementation scope are proposed. Requirement IDs remain stable within ENG.

## ADDED requirements.md § Execution engine

- **ENG-R1 — One implementation per operation.** TUI, CLI and connected clients call the same application handler.
  An adapter resolves interface input and presents results; it does not independently enforce save, conflict, plan,
  index or tool-execution rules.
- **ENG-R2 — Clear ownership.** The engine owns live document text, revisions, undo, saved baselines, conflict state
  and application services. The TUI owns windows, cursors, selection, layout, focus, keys and prompts. Neither side
  reaches into the other's mutable internals.
- **ENG-R3 — Explicit views of content.** Every operation that consumes text declares whether it uses saved files or
  live documents. Connected clients can inspect and edit live text without automatically saving it. Results identify
  the content and revisions actually used.
- **ENG-R4 — Defined concurrency.** A live edit requires the document revision it was based on. A generated change
  requires all relevant inputs to remain current. Conflicting work is refused or returned for explicit resolution;
  unrelated reads and typing remain responsive.
- **ENG-R5 — Honest completion.** Results distinguish refusal before effects, cancellation, success, partial effects
  and an outcome that cannot be established after interruption. An atomic file replacement is never described as an
  atomic multi-file transaction or a general filesystem compare-and-swap.
- **ENG-R6 — Shared discovery.** Built-in operation definitions provide input and result schemas, effect and access
  declarations, and exposure policy. CLI parsing, usage and discovery are derived from those definitions plus CLI
  bindings. Human output and workflows remain written where they help people.
- **ENG-R7 — Observable state.** Clients obtain coherent snapshots and subscribe to scoped changes without a race
  between the two. Versions and event gaps let them detect stale state; progress and diagnostics are bounded.
- **ENG-R8 — Local connection.** An explicitly enabled local endpoint provides discovery, invocation, subscription,
  status and cancellation. Application execution needs no terminal; session control needs a UI host. No external
  service, TCP listener or required daemon is introduced.
- **ENG-R9 — Enforced access.** Client permissions, vault access and tool trust are enforced by shared execution
  and the engine's effect boundaries. A remote caller cannot claim a human identity, grant itself trust or use an
  internal-only operation through discovery.
- **ENG-R10 — Small composition root.** The engine coordinates focused modules with narrow dependencies. Domain
  algorithms remain directly testable; no universal context object, generic workflow framework or mutable App proxy
  becomes the new center of the system. Application and session handlers use one catalog, executor and receipt
  mechanism; a second automation dispatcher does not reproduce their behavior.
- **ENG-R11 — Incremental delivery.** A feature migrates with its TUI and CLI paths, tests and documentation in one
  slice. Existing contracts remain usable throughout. Socket support is proven before the entire migration finishes.
- **ENG-R12 — Extension boundary.** Future clients and extensions can use public operations and events without
  importing engine state or TUI internals. Plugin loading, packaging and execution are outside this workstream.
- **ENG-R13 — Connected session parity.** An authorized attached client can perform normal TUI workflows through
  the same named actions and input paths, inspect session state and capture a presented frame. Session control uses
  the same endpoint and invocation contracts as engine operations; it does not move UI state into the engine.
  Unavailable host facilities and human-only authority changes are explicit exceptions, checked on every path.
- **ENG-R14 — Defined completion.** Queued, running, handled, frame committed and background task settled have
  distinct meanings. A queued action cancelled before claim never runs later. A response deadline after claim does
  not claim that effects were prevented. Captures identify the exact retained frame or report expiry.
- **ENG-R15 — Reproducible UI automation.** An isolated test host uses the same TUI controllers, action/input paths
  and renderer through the Canvas boundary. Structured snapshots, frame captures and bounded conditions provide
  observations without test-only mutation handlers or mandatory sleep-based scripts. Real terminal tests remain.
- **ENG-R16 — Lifecycle ownership.** Each service/client resource has an owner, lifetime identity and disposal
  contract. Closing invalidates pending delivery, disposes observations and settles accepted mutations under their
  engine owner; reopening the same path does not revive earlier work (ENG-D1, ENG-D3, ENG-D6).
- **ENG-R17 — Scheduling by semantics.** Queries replace obsolete work; same-resource refreshes make progress under
  continuous activity; explicit mutations retain ordering and outcomes. Applicability is checked immediately before
  result delivery, independently of cancellation (ENG-D2, ENG-D3).
- **ENG-R18 — Shared model boundaries.** Diff/projection/anchor rules have one implementation where contracts agree.
  Distinct product surfaces preserve their interaction and lifecycle rather than becoming one conditional widget
  (ENG-D4).
- **ENG-R19 — Replayable stateful checks.** Isolated randomized interaction tests check semantic invariants, crashes
  and hangs; failures retain controlled ordering and can be reduced to focused regressions (ENG-D5).
- **ENG-R20 — Bounded dependency-backed services.** Parsing, spelling, typesetting and export declare their input
  exposure, required authority, limits, cancellation and failure behavior. Heavy work cannot indefinitely block the
  UI owner loop. Isolation and packaging choices follow a shipped-artifact and reachability review (ENG-D12).
  Artifact/loading checks follow ENG-D13; installed-tool review and migrated trust
  enforcement follow ENG-D14 and D172.
- **ENG-R21 — Maintainable growth.** Features have focused owners and narrow dependency ports. Tests reuse fixtures
  and scenario intent across appropriate boundaries, cover shared-state interactions and enforce structural rules.
  Migration removes superseded paths and preserves product functionality, UI and existing CLI behavior (ENG-D15).

## MODIFIED requirements.md § Agents and the CLI

- **Shared execution and declared exposure.** Every user action remains a named command. Application operations
  declare their TUI, ordinary CLI and connected exposure independently; session handlers drive existing actions/input
  with explicit targets and access. Definitions, arguments, availability and effects have one home and structural
  coverage. Ordinary CLI git exclusions remain; attached git-session exposure awaits the D156 amendment in ENG.
- **Ordinary CLI: disk is the contract.** An unattached call reads saved files, writes atomically and is not blocked
  by an open editor. Dirty advisory and `--if-unchanged` remain. Hand-offs retain their existing save prerequisites
  (D17, D145). Finding a running instance never changes this source or routing.
- **Explicit attachment.** A connection selects one running engine. Supported live-document calls edit memory with
  expected revisions; saving remains distinct under current autosave policy. Session control deliberately affects
  the visible TUI; direct document operations preserve the person's focus. No connection failure falls back to
  independent disk writes. Human trust decisions remain unavailable to connected callers.
- `--json` prints one object, apart from human output; exit codes are stable; the TUI never starts without a terminal
  (D18). A small subset of commands is stable and versioned; the rest may change before 1.0 (D15). What is kept (the
  commands and flags, `--json` and its `schema`, the exit codes, the settings and the command names keys call, the
  links slipbox writes and `.slipbox/`), what a minor and a patch release may change before 1.0 and after, and how
  something is retired (deprecated at least a minor release ahead, in the changelog, and warned of while it works)
  are the versioning policy, docs/manual/versions.md, its promises kept as written (GR-D16).
- A generated edit is planned and applied as two explicit steps (D63).
- A skill teaches agents the CLI, kept current with every change (D22); each release carries the one that matches it
  (GR-D10, § Distribution).
- The agent surface grows with slipbox rather than arriving at the end: agents have used it since the first phases
  (D16).

How: design/tui.md § Parity with the CLI; docs/manual/cli.md; docs/manual/versions.md.

The complete execution contract is proposed in ENG; see design/execution/ at consolidation. Existing CLI
compatibility and versioning commitments above remain in force (ENG-D8, ENG-D9, ENG-D15).

Previously (exact parent text at local `9b3854c`; recheck before consolidation):

```markdown
- **CLI parity.** The CLI reaches every state change the TUI makes, not every interaction: the cursor, scrolling,
  selection, modes, panes, overlays and the conflict prompt are the TUI's alone, and so is git in the editor (D14,
  D156). Every user action is a named command, declared with its CLI equivalent (D11).
- **Disk is the contract.** A CLI call sees saved files only, never an unsaved buffer; it writes atomically, and is
  never blocked by an open editor. It is told which notes the TUI holds unsaved, and a careful writer can refuse to
  clobber (`--if-unchanged`). A hand-off (capture, the context bundle, invoking an agent) saves unsaved notes first
  (D17, D145).
- `--json` prints one object, apart from human output; exit codes are stable; the TUI never starts without a terminal
  (D18). A small subset of commands is stable and versioned; the rest may change before 1.0 (D15). What is kept (the
  commands and flags, `--json` and its `schema`, the exit codes, the settings and the command names keys call, the
  links slipbox writes and `.slipbox/`), what a minor and a patch release may change before 1.0 and after, and how
  something is retired (deprecated at least a minor release ahead, in the changelog, and warned of while it works)
  are the versioning policy, docs/manual/versions.md, its promises kept as written (GR-D16).
- A generated edit is planned and applied as two explicit steps (D63).
- A skill teaches agents the CLI, kept current with every change (D22); each release carries the one that matches it
  (GR-D10, § Distribution).
- The agent surface grows with slipbox rather than arriving at the end: agents have used it since the first phases
  (D16).

How: design/tui.md § Parity with the CLI; docs/manual/cli.md; docs/manual/versions.md.
```

## MODIFIED requirements.md § Editing

- An in-app editor for small edits; a hand-off for anything substantial, to `$EDITOR` in this terminal or to an
  editor already running (D134, D145).
- The editor is vim-shaped and consistent with the other modes: source mode is another layout of the note, and the
  lens edits the block under the cursor in place within the rendered note; undo survives a reload from disk (D146,
  D147).
- Agents write while you read: a note without unsaved changes reloads silently; an outside change to one with unsaved
  changes is said when it lands, and prompts (Load, Keep, Diff, Merge); nothing is resolved automatically. Autosave
  runs after a long idle delay, and quitting with unsaved notes names them (D137–D140). A branch switch is one change
  (D153).
- Frontmatter is changed by byte range, never re-serialised; properties are edited as its text; footnotes are added and
  changed as GFM's (D148, D150, D151).
- The fundamentals short of an IDE: indentation per file, comments, brackets, replace across files, word completion,
  spelling (English and Turkish bundled), a command run, a server's snippets (D155, D157).
- The explorer makes, renames, moves, copies and deletes notes and folders, by buttons and keys; a delete goes to a
  trash, and can be restored (D149).

How: design/tui.md § Editing, § Source mode, § The lens, § Writing notes, § External changes, § Files in the explorer.

Editable text, revision/history, save baselines and conflict transitions belong to the engine. The TUI keeps modal
editing, the lens, views and human conflict prompts. Connected edits join shared undo history as identified steps;
existing autosave policy remains, and attachment never enables it by itself. This changes backend ownership while
preserving the editing capabilities above (ENG-D7, ENG-D15).

Previously (exact parent text at local `9b3854c`; recheck before consolidation):

```markdown
- An in-app editor for small edits; a hand-off for anything substantial, to `$EDITOR` in this terminal or to an
  editor already running (D134, D145).
- The editor is vim-shaped and consistent with the other modes: source mode is another layout of the note, and the
  lens edits the block under the cursor in place within the rendered note; undo survives a reload from disk (D146,
  D147).
- Agents write while you read: a note without unsaved changes reloads silently; an outside change to one with unsaved
  changes is said when it lands, and prompts (Load, Keep, Diff, Merge); nothing is resolved automatically. Autosave
  runs after a long idle delay, and quitting with unsaved notes names them (D137–D140). A branch switch is one change
  (D153).
- Frontmatter is changed by byte range, never re-serialised; properties are edited as its text; footnotes are added and
  changed as GFM's (D148, D150, D151).
- The fundamentals short of an IDE: indentation per file, comments, brackets, replace across files, word completion,
  spelling (English and Turkish bundled), a command run, a server's snippets (D155, D157).
- The explorer makes, renames, moves, copies and deletes notes and folders, by buttons and keys; a delete goes to a
  trash, and can be restored (D149).

How: design/tui.md § Editing, § Source mode, § The lens, § Writing notes, § External changes, § Files in the explorer.
```

## MODIFIED requirements.md § Non-goals

- A markdown previewer with extras, or Obsidian without the GUI (D33).
- Obsidian's life-management features: daily notes, random note, the unique note creator (timestamp-titled notes:
  descriptive file names and renames that fix links instead), the audio recorder, workspaces (restoring a session is
  not this), the web viewer. Nor what a terminal can't hold or slipbox doesn't need: Canvas, Graph view, Slides, Sync,
  Publish, Bases, File recovery (D1, D33).
- All of vim, or an IDE: vim's marks, macros, named registers and block selection aren't wanted (D146, D155).
- Lint rules of slipbox's own, and installing native language servers or linters: the system is the user's (D160,
  D162).
- Working-tree git as ordinary standalone CLI commands: an agent runs `git` itself (D156). Any connected invocation
  of existing TUI git workflows requires the explicit exposure amendment retained as open in ENG.
- A typesetting engine: a PDF good enough to hand someone a note (D181). Credentials for an online service: Google Docs
  is reached by a Word file, uploaded (D183).
- For now: extending slipbox with commands that shell out, output sinks and external panes, all deferred (D37);
  in-process plugins, dropped (D36); an outside search engine, postponed until trailscout has an SDK (D124).
- A required daemon or hosted/TCP service. ENG proposes an explicitly enabled local attachment endpoint; D13's
  deferral is amended only when that proposal is accepted. This does not introduce a plugin runtime.

Previously (exact parent text at local `9b3854c`; recheck before consolidation):

```markdown
- A markdown previewer with extras, or Obsidian without the GUI (D33).
- Obsidian's life-management features: daily notes, random note, the unique note creator (timestamp-titled notes:
  descriptive file names and renames that fix links instead), the audio recorder, workspaces (restoring a session is
  not this), the web viewer. Nor what a terminal can't hold or slipbox doesn't need: Canvas, Graph view, Slides, Sync,
  Publish, Bases, File recovery (D1, D33).
- All of vim, or an IDE: vim's marks, macros, named registers and block selection aren't wanted (D146, D155).
- Lint rules of slipbox's own, and installing native language servers or linters: the system is the user's (D160,
  D162).
- Git in the editor from the CLI: an agent runs `git` itself (D156).
- A typesetting engine: a PDF good enough to hand someone a note (D181). Credentials for an online service: Google Docs
  is reached by a Word file, uploaded (D183).
- For now: extending slipbox with commands that shell out, output sinks and external panes, all deferred (D37);
  in-process plugins, dropped (D36); a server agents connect to, deferred, not rejected (D13); an outside search
  engine, postponed until trailscout has an SDK (D124).
```

## MODIFIED requirements.md § Quality goals

- **Rendering at least as good as leaf's** (D4, D25, D88, D89). Checked by slipbox replacing leaf for reading `docs/`,
  phase 1's finish line, and by the render tests: every demo note at six widths, in both glyph sets, with no row past
  its width, and the table allocator over 5,000 generated inputs (design/testing.md § Strategy).
- **Declared and checked interface coverage.** Named actions and application operations share checked definitions.
  Tests verify ordinary CLI bindings and attached session coverage separately, preserving human-only trust and
  unsupported-host exceptions. New action definitions without matching registration or explicit exposure fail
  checks. Attached git exposure remains subject to the D156 amendment (ENG-R6, ENG-R9, ENG-R13).
- **A contract agents can rely on** (D15, D18). The stable commands' `--json` shapes change only with `schema`; checked
  by `tests/cli.test.ts`, which runs every command as an agent meets it (docs/manual/cli.md § What stays stable).
- **The CLI never needs a terminal** (D8). The core imports nothing from the TUI or OpenTUI, nor the CLI from the TUI.
  Checked by `bun run check:boundary`, in `bun run check` and in CI (design/how-it-works.md § The boundary is
  enforced, not hoped for).
- **A note is never lost, nor rewritten unseen** (D7, D40, D63, D139, D140, D142, D148). Every write is atomic;
  autosave never overwrites another writer's change; every generated edit is a plan, shown first and refused when a
  file changed since; CRLF, a BOM, no final newline and invalid UTF-8 survive an edit. Checked by the fixture vault's
  awkward files (design/testing.md § The fixture vault), and by exit 5 for a stale plan or `--if-unchanged`
  (docs/manual/cli.md § What a command prints).
- **Safe to open anything** (D166, D172–D177, D195). Nothing a folder brings runs unless you trust its root: not its
  programs, nor the code its servers would run, its git config and files, or the `bunfig.toml` and `.env` Bun would
  read. A folder's own config never names a program to run, nor trusts itself; trusting takes no file edited; an agent
  can't grant it. Checked by the tests, one of them that the compiled binary loads nothing of its folder, and said by
  `slipbox doctor` (design/trust.md).
- **Fast at 5,000 notes, and on a big note** (D17, D111, D120). The first note paints within a tenth of a second
  while the graph builds in the background or comes from the cache; editing a big note costs what changed. Checked
  by `bun scripts/bench.ts` (design/testing.md § Timings; the measurements in design/how-it-works.md § Performance,
  measured).
- **Nothing identifying leaves the machine** (D199). The update check asks for the newest release its channel offers
  (on the preview channel, the newest preview as well: GR-D15) and sends nothing that identifies you; only the TUI
  checks, never the CLI; `DO_NOT_TRACK` or the config turns it off. Bun's own crash reports are turned off at start
  (D221; design/distribution.md § Updates).

Previously (exact parent text at local `9b3854c`; recheck before consolidation):

```markdown
- **Rendering at least as good as leaf's** (D4, D25, D88, D89). Checked by slipbox replacing leaf for reading `docs/`,
  phase 1's finish line, and by the render tests: every demo note at six widths, in both glyph sets, with no row past
  its width, and the table allocator over 5,000 generated inputs (design/testing.md § Strategy).
- **Everything a person can change, an agent can** (D11, D14). Checked by the command registry: a command implemented
  without its CLI equivalent declared, or declared and not implemented, fails at start-up and fails a test
  (design/tui.md § Parity with the CLI).
- **A contract agents can rely on** (D15, D18). The stable commands' `--json` shapes change only with `schema`; checked
  by `tests/cli.test.ts`, which runs every command as an agent meets it (docs/manual/cli.md § What stays stable).
- **The CLI never needs a terminal** (D8). The core imports nothing from the TUI or OpenTUI, nor the CLI from the TUI.
  Checked by `bun run check:boundary`, in `bun run check` and in CI (design/how-it-works.md § The boundary is
  enforced, not hoped for).
- **A note is never lost, nor rewritten unseen** (D7, D40, D63, D139, D140, D142, D148). Every write is atomic;
  autosave never overwrites another writer's change; every generated edit is a plan, shown first and refused when a
  file changed since; CRLF, a BOM, no final newline and invalid UTF-8 survive an edit. Checked by the fixture vault's
  awkward files (design/testing.md § The fixture vault), and by exit 5 for a stale plan or `--if-unchanged`
  (docs/manual/cli.md § What a command prints).
- **Safe to open anything** (D166, D172–D177, D195). Nothing a folder brings runs unless you trust its root: not its
  programs, nor the code its servers would run, its git config and files, or the `bunfig.toml` and `.env` Bun would
  read. A folder's own config never names a program to run, nor trusts itself; trusting takes no file edited; an agent
  can't grant it. Checked by the tests, one of them that the compiled binary loads nothing of its folder, and said by
  `slipbox doctor` (design/trust.md).
- **Fast at 5,000 notes, and on a big note** (D17, D111, D120). The first note paints within a tenth of a second
  while the graph builds in the background or comes from the cache; editing a big note costs what changed. Checked
  by `bun scripts/bench.ts` (design/testing.md § Timings; the measurements in design/how-it-works.md § Performance,
  measured).
- **Nothing identifying leaves the machine** (D199). The update check asks for the newest release its channel offers
  (on the preview channel, the newest preview as well: GR-D15) and sends nothing that identifies you; only the TUI
  checks, never the CLI; `DO_NOT_TRACK` or the config turns it off. Bun's own crash reports are turned off at start
  (D221; design/distribution.md § Updates).
```

## Builds on

| Source | What this proposal builds on |
| --- | --- |
| [how-it-works.md](../../design/how-it-works.md#one-core-two-faces) | Core and interface dependency boundaries |
| [Disk is the contract](../../design/how-it-works.md#the-cli-and-the-tui-disk-is-the-contract) | Saved CLI semantics |
| [D11–D18](../../decisions/foundations.md) | Actions, parity, server deferral and CLI compatibility |
| [D36–D37, D235](../../decisions/foundations.md) | Extension scope and the module split |
| [Writing notes](../../design/tui.md#writing-notes) | Atomic writes, task toggles and editor handoff |
| [Trust](../../design/trust.md) | Human trust decisions and guarded tools |
| [D39–D40](../../decisions/roots-and-links.md) | Storage separation and one walk |
| [VV design](../archive/vaults-and-view/design.md) | Home, explorer view, peek and proposed link permissions |
| [GIT design](../archive/git-review/design.md) | Diff foundation, remote commands and remaining review work |
| [TT](../archive/terminal-tests/README.md) | Terminal coverage retained alongside engine tests |

### Relationship to existing work

- **D235:** retain useful extractions; move application responsibilities from controllers into the engine in slices.
  Presentation controllers remain. Lower size caps as code moves; no permanent compatibility layer over all of App.
- **VV:** preserve the accepted vault vocabulary and ownership rules. Explorer view and peek remain presentation;
  vault discovery, access checks and document identity become shared services. Pending VV rules are dependencies,
  not silently declared implemented by this draft.
- **GIT:** keep its diff algorithms and accepted workflows. Shared git operations do not automatically become CLI or
  socket commands: D156's exposure policy needs separate approval if changed.
- **TT:** keep real terminal checks for keys, mouse, drawing and terminal protocols. Engine tests cover execution
  without having to navigate the screen.
- **Roadmap:** adoption would amend the ordering at § The big files split, § Vaults and the explorer's view and
  § Git: reviewing, diffing and merging. This draft does not reorder the accepted roadmap.

## Scope limits

One local user and one authoritative host per engine instance, with owned workers/tool processes as required. Multiple
instances may open the same files, retaining external
change handling. There is no distributed collaboration, CRDT, automatic merge of simultaneous live edits, hosted
service, TCP listener, persistent task queue, general transaction engine or automatic daemon startup.

The design permits a headless resident host, but the first socket host can be the existing TUI process. A plugin
runtime, a new remote shell facility and terminal-process byte access are not included. Session control can drive
the existing TUI, including keys and mouse, under its declared access profile. Native Windows
transport implementation stays with `14.14`–`14.17`; its boundary must not assume Unix paths throughout the engine.

## Acceptance criteria

These are future implementation checks, not claims about this document or the current code.

1. A read, task toggle and planned rename use one handler each from direct engine calls, CLI and TUI adapters.
   Socket tests exercise the supported subset against those same handlers and results.
2. Two live clients edit revision N: the first advances it; the second receives a conflict with no edits applied.
   Undo removes the connected edit as one step. Other views retain valid source anchors.
3. A saved read and a live read of a dirty document return different content with explicit provenance. Search, export
   and context tests verify their declared content source, including mixed saved/live inputs.
4. An external write reloads a clean document and marks a dirty one conflicted. An own write is processed once;
   a later external write is not suppressed. Keeping local text disables autosave until explicit resolution.
5. A plan is refused before any write when an input, destination, buffer revision, permission or git prerequisite
   changed. An injected failure during apply reports completed and pending effects and leaves inspectable recovery.
6. Confirmed cancellation before the first effect has no effects. Cancellation after effects reports them. A lost socket
response
   followed by a repeated request does not execute that request twice within the documented receipt lifetime.
7. Snapshot plus subscription has no missed intervening change. A slow or disconnected client resynchronizes after
   an explicit gap. Old diagnostics and completed searches cannot replace newer results.
8. Unknown operations, invalid input, oversized messages and unauthorized access are refused at the shared boundary.
   Socket clients cannot change trust or reach undeclared callbacks. Synthetic input and deferred effects retain
   their client identity and cannot bypass these checks.
9. Normal CLI commands preserve their flags, exit codes and JSON schema. Attached writes fail on missing or ambiguous
   instances; they never fall back. Help and discovery agree with the operation catalog.
10. Headless tests use isolated files, clocks and process runners. Existing rendering, docs and terminal coverage
    remains; moved behavior is tested at its new owner and adapter behavior at its boundary.
11. A connected client invokes a named TUI action, moves a cursor, opens a panel and types through the real input
    handlers. A capture after its frame barrier shows the resulting UI. Application task completion is reported
    separately; a missing session fails clearly. Input automation cannot grant trust or bypass operation access.
12. Hold the input queue, let a request time out before claim, then resume: it applies no input. If already claimed,
    its receipt reports the actual outcome or still-running status. A human focus change between input items stops
    the remainder, reports the applied count and never redirects typing to the newly focused view.
13. A captured frame token identifies matching session/document revisions; expiry fails explicitly. A task that
    starts from an action remains running after that action's first frame is committed. The test host exercises
    both cases without a real terminal or arbitrary delays.
14. Close and reopen an owner at the same path with a result queued: the old result is rejected. Its timers and
    observations stop; any accepted mutation still settles with an inspectable receipt under the engine owner.
15. Under continuous invalidations, a same-resource refresh completes and the newest pending refresh follows.
    Query results apply only to the current request; saves/git mutations retain their admitted order and outcomes.
16. Compute a result, queue delivery, then change the document, query, resource identity or owner lifetime: delivery
    rechecks applicability. Mutation effects already produced are reconciled rather than hidden as a dropped result.
17. Two existing diff surfaces consume the shared model and preserve their respective actions and anchor behavior;
    canonical model tests cover their shared invariants. No unfinished GIT feature is required for this proof.
18. A bounded seeded run exercises engine/session events and detects an injected invariant failure or hang. Its
    recorded action/delivery sequence replays the failure in isolation and can be reduced to a regression case.
19. Each migrated owner satisfies the feature completion checklist and identifies removed legacy paths. Existing
    product/UI scenarios remain compatible; product changes are separately scoped.
20. Shared scenarios prove domain behavior once and adapter integration at appropriate boundaries. Controlled
    dependencies reproduce key interactions; structural fixtures detect forbidden imports and missing bindings.

21. Dependency-backed services enforce their declared admission/output budgets, retain owner-loop responsiveness
    and clean partial outputs on failure (ENG-R20, ENG-D12).
22. Release checks detect unexpected shipped packages, violated absence assertions and eager loading across declared
    feature boundaries, while allowing static imports within deferred modules (ENG-R20, ENG-D13).
23. Built-in installed-tool closures have integrity and scoped/expiring advisory checks; migrated tool/git effects
    preserve D172 for untrusted roots, including connected and deferred routes (ENG-R9, ENG-R20, ENG-D14).
24. Reverse the completion order of two conflicting mutation computations: effects retain admission order. Save,
    structural plans and git work in the same checkout cannot overlap conflicting disk effects (ENG-R4, ENG-R17).
25. Same-profile clients with identical invocation IDs retain distinct receipts; authenticated reconnect preserves
    identity, expired retries never initiate execution, and changed operation/targets are refused (ENG-R5, ENG-R9).
26. Cross-workspace snapshots disclose only authorized resources; frame capture/waits cannot reveal unreadable
    content or retrieve it after grant revocation. Stale mouse/prompt contexts are refused (ENG-R9, ENG-R13).

27. A supported LSP text edit changes a dirty shown document in memory and saves an unshown clean target. Stale
    prerequisites refuse before effects; a later disk failure reports preserved memory changes and completed saves
    as partial, with per-document undo and no new resource-operation support (ENG-R1, ENG-R4, ENG-R5, ENG-R21).
28. A task outlives its launch request's retry window; reconnect still inspects/cancels that same task until settlement
    and advertised expiry. Task expiry never deletes a caller-owned export or repeats its effects (ENG-R5, ENG-R16).
29. Memory-edit-only clients observe disclosed autosave policy without gaining direct-save or policy-change authority.
    Queued response timeout, running response timeout and execution deadline have distinct tested effects (ENG-R9, ENG-R14).
30. Mixed-origin key continuations cannot become human-authorized actions. Session results/choices and events enforce
    the same resource access as snapshots/captures, including revocation before delivery (ENG-R9, ENG-R13).

31. A saved CLI plan created in one process applies in a later process under the local user/state namespace, after
    current checks. A connected caller cannot claim another plan by ID; restarted live plans fail rather than
    becoming saved plans (ENG-R4, ENG-R9, ENG-R11).

32. Managed plans apply once across distinct invocation IDs and standalone processes; concurrent apply is excluded,
    dry-run does not consume, and partial plans require inspection rather than ordinary reapply (ENG-R4, ENG-R5).
33. Recovery quota/state-write failure refuses before effects; a later record failure stops further effects and
    preserves evidence. Unresolved records cannot be silently evicted to admit new work (ENG-R5, ENG-R20).
34. Cancelled/refused ordinary quit leaves the engine usable. A stuck tool follows bounded drain/escalation and
    unresolved resources stay blocked rather than losing their reservation while writes remain possible (ENG-R16).
35. Tool readiness settles separately from resident-server lifetime: launch receipts expire normally while queries
    still work, and owner disposal stops the server without leaking capacity (ENG-R16, ENG-R20).
36. Handoff scope matches the existing workflow; advancing required text during save prevents a stale handoff.
    A required save refusal aborts it while reporting completed saves (ENG-R5, ENG-R11, ENG-R21).
