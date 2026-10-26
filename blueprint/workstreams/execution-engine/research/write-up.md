---
status: current
created: "2026-10-16"
---

# Research: execution architecture and prior art

TTT was read on 2026-10-16 at commit `091ce83f27583a73438738377473ad611f67ada3`; it was not built or run.
These observations inform the ENG draft; they do not establish runtime reliability or accept a design decision.

## Slipbox baseline

The baseline is the inspected local checkout at `9b3854c`, plus the D235 split at `refactor/split-tui-files@01699fc`.
The split is an implementation input, not assumed merged. Reconcile the actual main branch and unfinished work
before applying this design; branch names and task indexes alone do not establish completion.

In the baseline, `src/core/application/commands/registry.ts` registers callbacks over an arbitrary context. The TUI uses
`App` as that
context. `src/core/application/commands/catalog.ts` supplies titles and CLI equivalents as strings, not executable
contracts.
`src/cli/cli.ts` performs argument validation and application orchestration separately. `src/tui/buffer.ts` combines
editable text, undo and saved-file state with layout caches and display state. `App.writeBuffer` coordinates atomic
writes, watcher suppression, graph refresh and server notification.

The split branch reduces file sizes and introduces feature controllers. Those controllers still receive the whole
`App`; its shared buffers and write path remain TUI-owned. ENG addresses that dependency and ownership boundary.

## What TTT shares

TTT's command registry stores IDs, titles, shortcuts and callbacks. Keybindings invoke commands by ID. Scripted
`exec` finds a command by title and invokes that same ID; plugins invoke it by ID directly.

Sources: [registry.go:5](https://github.com/eugenioenko/ttt/blob/091ce83/internal/command/registry.go#L5),
[commands.go:37](https://github.com/eugenioenko/ttt/blob/091ce83/internal/app/commands.go#L37),
[exec_script.go:340](https://github.com/eugenioenko/ttt/blob/091ce83/internal/app/exec_script.go#L340),
[commands_plugin.go:426](https://github.com/eugenioenko/ttt/blob/091ce83/internal/app/commands_plugin.go#L426).

Its `--exec` startup runner and `--listen` HTTP endpoint both call `RunExecScriptSep`. The runner understands keys,
typing, mouse actions, command execution, panel selection, screenshots, debug dumps and waits. The listener uses
loopback TCP, not a Unix-domain socket. Its source describes a single-operator debug facility, with concurrent
scripts unsynchronized, rather than a public multi-client API.

Sources: [main.go:389](https://github.com/eugenioenko/ttt/blob/091ce83/cmd/ttt/main.go#L389),
[listen.go:14](https://github.com/eugenioenko/ttt/blob/091ce83/internal/app/listen.go#L14),
[listen.go:30](https://github.com/eugenioenko/ttt/blob/091ce83/internal/app/listen.go#L30),
[exec_script.go:166](https://github.com/eugenioenko/ttt/blob/091ce83/internal/app/exec_script.go#L166).

The registry's callback has no typed application input or result. The script interpreter is a separate command
grammar. The inspected paths therefore demonstrate shared UI execution, not generated CLI contracts or an
independent headless application engine. This is an architectural distinction, not a criticism of its debug tool.

## Completion means the UI handled the request

Scripted input and main-thread actions are posted as requests to the existing event loop. The loop claims a request,
handles it through normal input/action paths, redraws, then acknowledges completion. A queued request that times out
can be cancelled before it is claimed; one already claimed waits for completion. `wait-for` checks rendered text
through the same loop with a deadline.

Sources: [exec_script.go:529](https://github.com/eugenioenko/ttt/blob/091ce83/internal/app/exec_script.go#L529),
[eventloop.go:290](https://github.com/eugenioenko/ttt/blob/091ce83/internal/app/eventloop.go#L290),
[eventloop.go:425](https://github.com/eugenioenko/ttt/blob/091ce83/internal/app/eventloop.go#L425),
[exec_script.go:398](https://github.com/eugenioenko/ttt/blob/091ce83/internal/app/exec_script.go#L398).

Acknowledging the redraw does not prove that an asynchronous git or language-server task started by a command has
finished. ENG should distinguish action accepted, frame presented and underlying task complete instead of treating
them as one boolean.

## State and presentation are both observable

TTT's debug structure includes active buffer text and modified state, cursor, viewport, tabs, focus, overlays,
selection, diagnostics and widget tree. Its text screenshot is a separate observation. The plugin editor API reads
the active in-memory buffer; inserts use undo commands and notify editor change handling. These are useful examples
of direct content access alongside control through the UI.

Sources: [debug_dump.go:14](https://github.com/eugenioenko/ttt/blob/091ce83/internal/app/debug_dump.go#L14),
[debug_dump.go:65](https://github.com/eugenioenko/ttt/blob/091ce83/internal/app/debug_dump.go#L65),
[plugin_api.go:34](https://github.com/eugenioenko/ttt/blob/091ce83/internal/app/plugin_api.go#L34),
[plugin_api.go:169](https://github.com/eugenioenko/ttt/blob/091ce83/internal/app/plugin_api.go#L169).

## Lessons for ENG

1. Provide both application operations and session-control operations over one endpoint. Headless content editing
   and driving the visible TUI serve different uses; both can share execution without sharing mutable internals.
2. Route session actions to the real named action/input handlers. A separate automation implementation would test
   itself while normal UI behavior could remain broken.
3. Acknowledge handled input and expose a frame barrier for visual observations. Keep task completion separate.
   Prefer bounded state/event predicates to sleeps.
4. Expose structured snapshots of documents and UI sessions as well as rendered captures. Test application results
   through state and visual/interaction contracts through the actual frame and input path.
5. Address operations and actions by stable IDs and explicit targets. Titles remain display text; active-buffer
   shortcuts should not make unattended edits depend on a human changing tabs.
6. Share invocation contracts, validation and discovery. A script grammar can be optional CLI convenience; it should
   not become the only machine API or the source of all operation semantics.
7. Give the automation client explicit scheduling and completion semantics. TTT's documented single-operator
   listener is not evidence that concurrent human/agent requests have the contracts ENG needs.

TTT's architecture document also distinguishes domain, service, presentation and application ownership, including
cancellation, request identity and stale-result handling. It explicitly identifies remaining UI-owned I/O and App
ownership work. The useful lesson is to evaluate actual ownership and lifecycle, not just command availability.

Source: [ARCHITECTURE.md](https://github.com/eugenioenko/ttt/blob/091ce83/ARCHITECTURE.md).

Documentation read: [Introduction](https://tttedit.dev/getting-started/introduction/),
[Testing plugins](https://tttedit.dev/guides/plugin-testing/) and
[Plugin authoring](https://tttedit.dev/guides/plugin-authoring/).

## Further architecture findings

The following source observations use the same pinned TTT commit. Their applications informed the accepted
principles [ENG-D1–ENG-D6](../decisions.md); implementation details remain draft. TTT was not run.

### A subsystem owns its whole lifecycle

TTT's architecture defines a subsystem owner by its typed API, timers and background work, cancellation/shutdown,
request identity, stale-result handling and mutation boundary. `RepositoryState` implements request sequences and
rejects responses for an obsolete request or active file. This is stronger than putting App's fields in a new class.

Read: [application owners][owners] and [repository result checks][repository-results].

Proposal: each ENG service declares which resources it owns, how it is disposed and which identity/revision makes a
result applicable. Closing and reopening the same path should not revive callbacks from the old service lifetime.

### Background work needs more than one scheduling policy

TTT's async helper supports delayed execution, a maximum debounce wait, keyed request deduplication and a policy
that lets the current refresh complete before running the newest queued refresh. It checks request identity both
after work finishes and when the queued delivery runs. Its clock, executor and delivery mechanism are injectable.

Read: [task options][task-options], [scheduling][task-schedule] and [result delivery][task-delivery].

Proposal: distinguish latest-query work, refreshes of one resource, and ordered mutations. Obsolete search queries
can be replaced; continuous repository activity should not indefinitely cancel every refresh. Save and git
mutations must not be coalesced like refresh requests. Cancellation and stale-result rejection are separate duties.

### Share models where behavior agrees

TTT's design calls for shared diff projection, layout, styling and anchors, with separate surfaces when interaction
and lifecycle differ. The architecture explicitly rejects turning these into one highly conditional diff widget.

Read: [shared diff behavior][diff-models].

Proposal: GIT's history, change review, unsaved-file conflict and merge surfaces share diff/anchor computations;
each retains its own workflow and state. The same principle applies to reusable text inputs and list filtering.
Consolidating the engine should not require a universal UI component.

### Extension contracts include cleanup and authority

TTT declares distinct plugin permissions for editor reads/writes, filesystem access, commands, panels, process
execution and network access. Destroying a plugin stops its timers, closes its Lua state and clears callbacks and
listeners. These are concrete parts of the host contract, not just registration conveniences.

Read: [permission declarations][plugin-permissions] and [destruction][plugin-destroy].

Proposal: future extension/client subscriptions and tasks have explicit owners and disposal. Granting a panel or
session capability does not implicitly grant filesystem writes or process execution. This informs today's public
boundaries without introducing a plugin runtime in ENG.

### Random interaction can yield reproducible regressions

TTT's chaos harness builds the real App on a simulated screen, chooses randomized events/commands and records a
seed, event count, event descriptions and failure stack. A replay test regenerates the event sequence from that
seed. The harness isolates configuration and clipboard; it includes a hang watchdog as well as panic reporting.

Read: [harness and reports][chaos-harness] and [seed replay][chaos-replay].

Proposal: exercise combinations such as typing, resize, tab switches, external changes and cancellation using
sample fixtures. Check state invariants as well as crashes; retain a minimal reproducer for each discovered bug.
Seed replay alone does not reproduce every asynchronous timing, so record controlled event ordering when needed.

### Migration should have an explicit deletion target

TTT's convergence plan requires characterization and a canonical owner before each repair. Exit criteria include
removing duplicate models and moving UI-owned I/O. A larger rewrite is reconsidered only if bounded incremental
changes fail to improve the identified architectural problems.

Read: [preparation gates][migration-gates] and [rewrite checkpoint][rewrite-checkpoint].

Proposal: judge ENG slices by one surviving behavior implementation, removed old paths, preserved workflows and
clear lifecycle ownership. File size and a new folder are useful signals, not sufficient evidence of improvement.

[owners]: https://github.com/eugenioenko/ttt/blob/091ce83/ARCHITECTURE.md#application-owners
[repository-results]: https://github.com/eugenioenko/ttt/blob/091ce83/internal/app/repository_state.go#L756
[task-options]: https://github.com/eugenioenko/ttt/blob/091ce83/internal/asynctask/task.go#L28
[task-schedule]: https://github.com/eugenioenko/ttt/blob/091ce83/internal/asynctask/task.go#L98
[task-delivery]: https://github.com/eugenioenko/ttt/blob/091ce83/internal/asynctask/task.go#L153
[diff-models]: https://github.com/eugenioenko/ttt/blob/091ce83/ARCHITECTURE.md#shared-diff-behavior
[plugin-permissions]: https://github.com/eugenioenko/ttt/blob/091ce83/internal/plugin/permissions.go#L62
[plugin-destroy]: https://github.com/eugenioenko/ttt/blob/091ce83/internal/plugin/plugin.go#L254
[chaos-harness]: https://github.com/eugenioenko/ttt/blob/091ce83/tests/chaos/chaos_test.go#L30
[chaos-replay]: https://github.com/eugenioenko/ttt/blob/091ce83/tests/chaos/chaos_test.go#L493
[migration-gates]: https://github.com/eugenioenko/ttt/blob/091ce83/ARCHITECTURE.md#preparation-gate
[rewrite-checkpoint]: https://github.com/eugenioenko/ttt/blob/091ce83/ARCHITECTURE.md#rewrite-checkpoint

## Comparison priorities

Fresh, Kakoune and TTT are the primary comparisons. The larger editors below are narrow references for individual
contracts, not templates for Slipbox. Initial documentation screening is retained here; source findings for
[Fresh](fresh.md) and [Kakoune](kakoune.md) supersede their study-next lists. No project was built or run.

### Fresh

Its site documents an agent-facing `--cmd` interface, `--skill` and script access to plugin/editor actions. Its
architecture describes background plugin execution delivering commands to the main editor loop, and separates
buffer state from per-split view state. Read: [agent interface][fresh-site] and [architecture][fresh-architecture].

Study next: how CLI, plugin and editor operations share definitions and results; how action scope, asynchronous
completion and attached-session discovery work in source. These docs do not establish that Fresh generates its
CLI from one typed operation catalog. This is the closest additional candidate for an end-to-end comparison.

### Neovim

Its API documentation describes generated RPC dispatch from public API definitions, discoverable API metadata,
compatibility rules and buffer-update subscriptions. Buffer events carry a change counter useful for detecting
intervening edits. Read: [API documentation][neovim-api].

Study next: generation boundaries, buffer/window/tab handles, notifications and client compatibility. Its explicit
indexing conventions and exceptions also show why ENG must define offsets/ranges precisely. Adapt these contracts
without adopting an entire editor runtime or assuming every API operation has compare-and-swap semantics.

### Helix

Its architecture describes coherent text transactions that support inversion for undo and mapping selections/marks
through edits. It distinguishes document and view identities, while acknowledging terminal coupling in the current
view layer. Read: [architecture][helix-architecture].

Study next: a canonical edit/change representation shared by undo, cursor/anchor updates and multiple views. The
document is useful both for its model and its candid distinction between intended and actual boundaries.

### Kakoune

Its JSON UI protocol sends rendering/status/menu information to a client and accepts keys, paste, resize, scroll
and mouse input. Read: [JSON UI protocol][kakoune-json].

Study next: the smallest useful presentation/input protocol, session control and keeping UI transport separate from
content operations. A display protocol alone does not provide ENG's checked document edits or task outcomes.

### Visual Studio Code

Its command API supports invocation with arguments and results. Its extension-host documentation distinguishes UI
and workspace execution locations and describes lazy activation. Read: [commands][vscode-commands] and
[extension host][vscode-host].

Study next: command contributions, extension disposal and where capabilities execute. Its API documentation says
many built-in features use the same extension API; this is a useful precedent for maintaining public boundaries.
The relevant lessons do not require copying its workbench or marketplace. Read: [extension API][vscode-api].

[fresh-site]: https://getfresh.dev/
[fresh-architecture]: https://getfresh.dev/docs/architecture
[neovim-api]: https://neovim.io/doc/user/api/
[helix-architecture]: https://github.com/helix-editor/helix/blob/master/docs/architecture.md
[kakoune-json]: https://github.com/mawww/kakoune/blob/master/doc/json_ui.asciidoc
[vscode-commands]: https://code.visualstudio.com/api/extension-guides/command
[vscode-host]: https://code.visualstudio.com/api/advanced-topics/extension-host
[vscode-api]: https://code.visualstudio.com/api/

## Applied in the ENG draft

These are proposed adaptations, not additional claims about TTT:

| Finding | Adaptation | Draft section |
| --- | --- | --- |
| Shared commands | One descriptor source and executor | [Contracts][contracts] |
| Loop acknowledgements | Separate queued, running, handled, frame and task states | [Completion][completion] |
| State/screen inspection | Snapshots, retained frame tokens and typed conditions | [Session control][session] |
| Single-operator scripts | Context checks, bounded batches, partial progress and retries | [Session control][session] |
| Layered tests | Actual UI on a Canvas, socket tests and real-terminal coverage | [Verification][verification] |

[contracts]: ../design/contracts.md#the-operation-contract
[completion]: ../design/runtime.md#admission-execution-and-visible-completion
[session]: ../design/interfaces.md#tui-session-control
[verification]: ../design/testing.md

The first release needs neither a new automation language nor a plugin runtime. Direct typed calls, generated CLI
bindings and the local protocol share the same built-in capabilities; real TUI input remains a session operation.
