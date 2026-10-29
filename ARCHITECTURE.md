# Architecture

A short map of slipbox's code, for whoever changes it: its layers and the rule between them, where things live, the
invariants every change keeps, and how a change is checked. It changes rarely; the details are in the design (last
section).

slipbox is TypeScript on Bun, compiled into one binary by `bun build --compile`. It is one core with two faces: a TUI
for a person, and a command line for agents and scripts, both over the same plain files.

## The layers

```text
              ┌──────────────────────────────────────────────┐
              │ src/core: pure TypeScript, no terminal       │
              │ roots · walk · parse · links · graph · index │
              │ layout · themes · search · git · export · …  │
              └────────┬───────────────────────┬─────────────┘
                       ▼                       ▼
                   src/tui                  src/cli
                   OpenTUI,                 commands,
                   the full screen          --json
```

- **`src/main.ts`** picks the face. A known command runs the command line; anything else opens the TUI, and only when
  stdin and stdout are a terminal. The TUI is imported lazily, so a command never loads OpenTUI's native renderer.
- **`src/core/`** is everything that doesn't draw: finding a file's root, walking it, parsing notes, resolving and
  rewriting links, the graph and its indexes, search, laying a note out for a width, themes and glyphs, git, language
  servers, export, installing and updating. Both faces call it.
  Export encoding sits below stream dispatch and the format writers; both writers share bounded UTF-8 output without
  importing the dispatcher. Format libraries retain their lazy loading boundaries.
  Language-client contracts and protocol capability/settings adapters sit below the process controller in
  `documents/servers/client/`; the client keeps requests, deadlines, transport and shutdown ownership.
  Semantic role vocabulary and compatibility aliases live in `rendering/theme/roles.ts` below palette construction
  and theme loading; public re-exports preserve the same arrays and objects.
- **`src/cli/`** is the command line: `cli.ts` parses a command line and runs the command, each group of commands in a
  module of its own (`links.ts`, `files.ts`, `git.ts`, …) and what they share in `common.ts`; `args.ts` parses flags.
- **`src/tui/`** is the TUI: `app.ts` is the model (the shared state and the wiring), each feature a controller of its
  own. `shell/screen/draw.ts` composes feature drawing on an abstract `Canvas`; document views, panels and overlays keep
  their area drawing. `actions/` holds registration and the `documents/`, `workspace/` and `shell/` command areas.
  `shell/input/keys.ts` preserves keymap exports over binding, help, alias and decoding owners in `keys/`.
  Mouse keeps input bookkeeping and delegates gestures and area routing to `mouse/`; `vim/` separates shared grammar
  records, motion ranges, operator completion, edit effects and replay. App still owns the same Vim state and buffers.
  Editable flags, header layout, shared geometry/style/controls and location fitting sit below App and region
  composition. Their clients import these helpers directly; the boundary checker rejects reverse composition imports.
  Screen composition delegates tab/view arrangement to `windows/drawing/`, document painting to
  `documents/views/drawing/`, widgets to `shell/overlays/drawing/` and panel painting to each feature. Shared panel
  row/tree/selection mechanisms and geometry records stay below composition; tabs still contain views as before.
  Diagnostics keep the panel, cached findings, trust and cancellation in their controllers; lower problem-row and
  language-protocol helpers receive the current controller or explicit inputs, without loading App or process owners.
  A buffer owns its text, history, marks and caches. Its source/code/note layout helpers read the same buffer and live
  cache getters under `documents/buffers/layout/`; replacing a cache never leaves them with an earlier snapshot.
  Source editing has lower position/text/selection and mutation owners under `documents/editing/source/`, with keyboard
  coordination above them. Its public entry re-exports the original functions; view/buffer and clipboard guards stay local.
  Peek contracts, presentation, synchronization and navigation have separate owners under `navigation/peek/`. Pure
  view-layout and link-anchor helpers stay below their controllers; their caches, probes and live state keep one owner.
  Lens visibility and completion parsing/item helpers sit below their controllers under `documents/editing/`. Request
  epochs, timers, word sets and view state stay in the original controllers; helper inputs retain live references.

**The boundary.** `src/core/` never imports `src/tui/`, `src/cli/` or `@opentui/*`, and `src/cli/` never imports
`src/tui/`. Inside the TUI, only `src/tui/shell/terminal/opentui.ts` (the `Canvas` over OpenTUI's buffer) and
`src/tui/shell/terminal/run.ts` (the renderer, input, shutdown) touch OpenTUI; everything else is driven in tests
through a text canvas, with no terminal. `bun run check:boundary` (`scripts/check-boundary.ts`) fails on any import that
crosses.

**The size of a file.** The active source ceiling is 750 lines (D235, ORG-D2), with a 500-line aim and a final
600-line ceiling. Exact legacy caps may only shrink apart from approved import-formatting growth; generated data has
a separate cap. A feature lives in a module of its own, and `App` keeps shared state and wiring.
`bun run check:size` (`scripts/check-size.ts`) checks the ceiling and exact caps.

## Where things live

| Path | What |
| --- | --- |
| `src/core/` | the core; `layout/` (a note laid out), `theme/`, `export/` (formats), `servers/` (language servers) |
| `src/cli/` | the command line: `cli.ts` dispatches, a module per group of commands, `common.ts` what they share |
| `src/tui/` | `app.ts` the model, a controller per feature (`explorer.ts`: `app.explorer`), `draw*.ts`, `actions*.ts` |
| `src/version.ts` | the version, one source; `package.json`'s must match |
| `tests/` | the headless tests by area (`core`, `render`, `vault`, `cli`, `tui`, …), their snapshots, fixtures |
| `tests/terminal/` | the terminal tests: slipbox driven by keys in headless terminals; `herdr/`, a real terminal's |
| `examples/vault/` | the demo folder, which the render tests draw at several widths |
| `examples/home/` | the reference set: every case of every feature, listed in its `CASES.md` |
| `scripts/` | the checks, the release build and its templates, the builders of grammars, locks and the reference set |
| `skills/slipbox/` | the skill that teaches agents the command line |
| `grammars/`, `notices/` | built tree-sitter grammars and the licence texts a release ships |
| `docs/` | the user documentation: guides and the manual |
| `blueprint/` | the design, its decisions and the roadmap |

A few modules to know first:

- `core/application/commands/catalog.ts` (the list, from `core/application/commands/areas/*.ts`) and
  `core/application/commands/registry.ts`: every user action, by its id, with its command-line equivalent.
- `core/workspace/graph/graph.ts`: the notes of a root, their links and backlinks, parsed lazily and cached; how a link
  resolves is `graph-resolve.ts`'s, a note's entry from its text `graph-extract.ts`'s, their shapes `graph-types.ts`'s.
- `core/workspace/walk/`: shared contracts, filtering, IO and traversal below the public walk entry; whole and sliced
  walks use one filter and folder-reader hook. `core/workspace/graph/watch.ts` owns lifecycle and scheduling over
  shared watcher state, directory subscriptions and event reconciliation in `watch/`. Home composition delegates
  containment, persisted walk admission and filtering to `core/workspace/vaults/home/`.
- `core/workspace/mutations/rename/rename.ts`: renames and moves as plans of byte-range edits, previewed first;
  `rename-plan.ts` defines the plan, and `rename-apply.ts` carries it out and undoes it. Shared trash storage and
  vault-marker operations live below both file operations and rename execution in `core/workspace/mutations/trash.ts`.
  `rename/planning/` separates target/source admission, moves, nested roots and relink; `rewriting/` keeps link forms.
  `collecting/` owns the original plan contracts, read-once Collector, admission policy and dirty-tree warnings.
  Public exports remain compatible; collection and planning never import apply execution.
- `core/documents/model/note.ts` and `core/rendering/layout/`: a note from its text to rows for a width, shared by
  `slipbox render` and the TUI. The Markdown `render.ts` entry delegates context/cache ownership to `page/render.ts`,
  recursive blocks to `blocks/dispatch.ts`, row finishing to `rows/` and pictures to `pictures/layout.ts`; inline,
  table and data owners retain their distinct layout policies.
- `core/workspace/search/`: document/section models, query grammar, indexing, hit matching and indexed/scan execution
  beneath public exports. SQLite and scanning share one lower weight table; document find matching and replace-field
  interaction live in `tui/documents/search/`, while workspace Search owns its index/feed/list lifecycle and cross-file
  effects. Buffers and view state remain TUI-owned.
- `cli/cli.ts`: the command line's dispatcher, its help and flags; each command's code is in its group's module, the
  session and the helpers they share in `cli/common.ts`.
- `tui/workspace/explorer/explorer.ts`: live Explorer state, listing lifetime and row cache; `rows/` builds visible
  files, paths and trees, `navigation.ts` handles zoom/reveal and `actions/items.ts` delegates item operations to their
  existing file/vault owners. Small capability contracts keep those mechanisms below App and Explorer composition.
- `tui/workspace/git/`: shared Git state stays in `git.ts`; `state/` owns read scheduling and base/staged caches.
  Branch read/row mechanisms and panel presentation use live capabilities below their controllers; interactive
  worktree prompts remain an App-backed client. Shared view records and marks sit below drawing composition.
- `core/application/config/`: defaults and contracts, ordered loading, trust filtering and validation behind `config.ts`.
  `core/documents/model/data/` retains format-specific readers and shared tree/query helpers. Markdown's `parse.ts`
  coordinates cache/chunk assembly over `parse/` processors, boundaries, transforms and tree queries.
- `core/foundation/platform/fsutil.ts`: atomic writes, and `writeNote`, which never writes outside the root.
- `core/foundation/text/width.ts` and `core/foundation/text/sanitize.ts`: how wide text is, and text made safe for a
  terminal.
- `core/foundation/platform/paths.ts`: slipbox's own config, cache, state and data folders.

## Invariants

What every change keeps. Each is checked by a test or a script where it can be.

- **Every user action is a named command.** Its id and its command-line equivalent (or `null`, for a pure interaction)
  are in `core/application/commands/areas/*.ts`, by area; `tui/actions/` holds registration and command-area folders
  (`documents/`, `workspace/` and `shell/`). `registerActions` registers them all. A command implemented without a spec,
  or specified without an implementation, fails at start-up and fails a test.
- **Disk is the contract.** A command reads saved files only, writes atomically, and is never blocked by an open editor.
  The TUI takes a command's write as any program's: it reloads, or asks when the note has unsaved changes. It lists the
  notes it holds unsaved for commands to warn about (`core/workspace/git/merge/stale.ts`): advice, never a lock.
- **The TUI writes notes only through `App.writeBuffer`:** atomic, inside the root, the watcher told. Besides notes it
  writes only its own state and cache, the scratch, and an export where the user said (`writeExport`, never over a
  note).
- **Nothing is written outside a note's root,** and nothing at all into a folder by opening it. What slipbox keeps goes
  into its own folders (`core/foundation/platform/paths.ts`).
- **Nothing measures text but `core/foundation/text/width.ts`,** and every string entering the layout passes through
  `sanitize`. The command line's human output is sanitised too.
- **Rendering is pure.** A note's layout depends on its text, the width, the glyph set and a link resolver passed in,
  never on the terminal; the render tests hold every demo note to its width.
- **Nothing a folder brings runs unless its root is trusted** (`core/workspace/vaults/trust.ts`), and a folder's own
  config never names a program to run or turns on a network request.
- **A program slipbox runs is optional,** found when present and never required, and is given an argument vector, never
  a shell string (`core/documents/external-editors/editor.ts`).
- **The command line's contract:** one JSON object per call with `--json`, its `schema` versioned apart from slipbox
  (`JSON_SCHEMA` in `cli/cli.ts`); stable exit codes (`EXIT`); `tests/cli/` covers every command as an agent meets it.
- **The docs follow the code.** A change users will see updates `docs/` in the same change; `tests/docs.test.ts` holds
  every command, flag and default key to the manual.

## Checking a change

- `bun run check` runs everything CI runs: the typecheck, the boundary, the supply chain's gates
  (`scripts/check-deps.ts`), Biome, the tests and the rest. `package.json`'s `check` script is the list.
- `bun test <file>` runs one area's tests; `bun test -u` updates snapshots, to be read before they're accepted.
- `bun run test:terminal` runs the terminal tests, slipbox driven in headless terminals, many at once.
- Every bug fixed gets a regression test that fails without the fix; new behaviour gets a test that exercises it.

## Going deeper

The design, in `blueprint/design/`, says how each part works and why: `how-it-works.md` walks through the whole system
and holds the full module map, and a file per part (links, roots, rendering, the TUI, search, language servers, trust,
export, distribution, testing) follows. `blueprint/README.md` says how the blueprint is kept.
