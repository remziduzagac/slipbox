# ORG design and plan (draft)

Proposed for [#55](https://github.com/remziduzagac/slipbox/issues/55), from [research.md](research.md).
All target paths below are proposals, not existing files. [requirements.md](requirements.md) gives ORG-R1–ORG-R5.
No source or test moves, timeout changes or decisions are authorized by this document. D235 and D239 still hold.

## MODIFIED — blueprint/design/how-it-works.md: Module map

Previously: the map names mostly direct `core/*.ts` and `tui/*.ts` modules, alongside the existing layout, export,
servers, commands and theme directories. Research counts 149 direct core files, 95 TUI files and 65 test files.

Recommendation: retain the faces and put each area's implementation, contracts and worker entries together. Prefer
explicit relative file imports with the repository's existing resolver; no new aliases, workspace packages or runtime.
Use kebab-case for new multiword filenames and folder-local role names (`controller.ts`, `jobs.ts`, `types.ts`).
Do not rename exported symbols or public commands just to match a path. Keep unambiguous established names when useful.

The following is the target ownership map. Listed families include their related helpers; each move PR supplies an
exhaustive old-to-new manifest before editing. No residual miscellaneous folder is an acceptable end state.

| Core folder | Owns; current families assigned here |
| --- | --- |
| `text/` | width, sanitize, position, words, myers and blockdiff primitives |
| `platform/` | fsutil, paths, processes, tool-process, shell, libc, wsl, sqlite, browser, clipboard, lazy |
| `config/` | config loading, defaults, validation and merge |
| `vaults/` | vault, home, registry, folders, names, mounts, symlinks, trust, vault-feed/list |
| `walk/` | walk, walkers, walk-thread/jobs/worker, listing and list-worker |
| `links/` | links, convention, write-link, pointer, hosting, remotes, reach, redirects, landing, convert |
| `graph/` | graph, graph-types/extract/resolve, index-job, autoindex, watch, backlinks jobs/worker |
| `documents/` | note, readers, filetypes, docformats, doctypes, footnotes and context |
| `markdown/` | parse, parsecache, parse-pool/worker, wikilink, tags, obsidian and HTML family |
| `syntax/` | syntax, syntax-thread/worker, grammar and code-model responsibilities |
| `search/` | search, search-index, scope, regex-jobs/worker |
| `mutations/` | files, rename family, plans, replace-files, capture and mutation marker helpers |
| `editing/` | editor, nvim, brackets, comments, indent, replace, snippet and tasks |
| `diagnostics/` | diagnostics, lint, lint-visibility, spell/thread/worker and hunspell |
| `git/` | git family, merge, mergereview, conflicts and stale |
| `media/` | images/cache, diagrams/cache/jobs/render/worker, paint jobs/worker, math, svg and typeset |
| `workers/` | URL resolution, WorkerRequests and worker-context; no feature queue policy |
| `distribution/` | install, release, update, restart, skill/lifecycle, report, crash-reports and gh |
| `commands/` | existing specs plus catalog, registry and independent spec contracts |
| `layout/` | existing layout; subfolders `code/`, `markdown/`, `diff/` as responsibility splits land |
| `export/` | existing export; assembly, streaming, formats, assets and its relocated worker |
| `theme/` | existing themes plus glyphs; no layout or application imports |
| `servers/` | existing language-server clients, installation and generated locks |

Within media use `images/`, `diagrams/` and `paint/`; within export use `formats/` and `assets/`; within mutations use
`rename/`. These are ownership groups, not a requirement to create empty folders. Do not flatten their descendants
back into their parent. Review any directory approaching 20 direct implementation files for a meaningful subarea;
20 is a review trigger, not a reason to create arbitrary numbered folders or a new CI failure.

| TUI folder | Owns; current families assigned here |
| --- | --- |
| `app/` | App composition, background work, session, vault switching and watcher orchestration |
| `terminal/` | run, opentui, canvas; only run and opentui touch OpenTUI |
| `input/` | input, keys, modes, vim, mouse and mouse-help |
| `screen/` | draw composition, geometry, primitives, headers/status/topbar, where and windows |
| `editor/` | buffer, editing, cursor, lens, saving/saveas, handoff, completion, snippets, placeholders |
| `navigation/` | following, linking, history, marks, views, code and HTML view state |
| `explorer/` | explorer and explorer-disk, file operations, renaming and vault list |
| `git/` | git family, diffview, review, mergescreen and rebase; nested `views/` for panel views |
| `panels/` | panels, outline, footnotes, info and panel navigation; feature drawing lives with its owner |
| `overlays/` | overlays, dialog, palette, listings/list-types, properties and their drawing |
| `search/` | search, match and replacing |
| `diagnostics/` | problems and its drawing, languages and spelling |
| `media/` | pictures and images |
| `export/` | exporter |
| `settings/` | settings |
| `scratch/` | scratch |
| `distribution/` | updates and report |
| `actions/` | registration and existing actions by command area; split only where ownership is clear |

App remains the state owner and composition root; feature controllers remain explicitly constructed by App. Moving
files does not transfer buffer ownership, introduce an engine or require a dependency-injection container. Screen
regions call feature drawing modules through explicit imports; drawing primitives never import the screen composer.

### Import contracts and loading

Recommendation: a named entry file for each heavy feature, not a re-export-all `index.ts`. Export keeps its current
entry semantics; syntax uses `syntax.ts`, media uses named image/diagram/paint entries, and diagnostics uses spell.
Light `types.ts` files import no heavy implementations for values. A feature's worker entry is not its caller API.
The shared loader moves from `core/lazy.ts` to `core/platform/lazy.ts` with identical behavior.

Preserve every existing dynamic import and first-use boundary, including export writers and paint loaders. Never
introduce eager imports via a barrel. Syntax and highlight remain as eager as they currently are: #56 decides whether
that changes. Preserve worker-local Hunspell, diagram drawing and export libraries. All worker moves update URL
resolution, compiled entry lists, assets, scope discovery and packaging tests together, with source and compiled probes.

Explicit imports avoid relying on implicit directory resolution. TypeScript recommends matching module resolution to
the runtime; Node package exports define package interfaces, not automatic encapsulation of local relative imports.
See the [TypeScript module reference](https://www.typescriptlang.org/docs/handbook/modules/reference.html) and
[Node package documentation](https://nodejs.org/api/packages.html). The area layout and 20-file trigger are ORG's
recommendations, not prescriptions from either source. Keep Bun's existing configuration and distribution contract.

## ADDED — blueprint/design/how-it-works.md: Internal dependency direction

Preserve the enforced face boundary and worker-only diagram renderer. Contracts and primitives must not import their
composer for values. Extract `editable` from App, drawing primitives from draw, UTF-8 encoding from stream dispatch,
and mutation marker operations below file/rename orchestration. Move CommandSpec into independent command contracts.
Use `import type` for genuine type dependencies; do not conceal runtime work with casts or reverse type dependencies.

Add focused boundary checks for these extracted seams and regression fixtures that reject the reverse edges. Do not
ban every cross-feature import or every type cycle. Repeat the runtime graph after each extraction, reporting SCC
membership against research's mutation (3), export (3) and TUI (64) baseline. A smaller SCC is supporting evidence;
initialization, errors and cancellation tests remain necessary. ENG can later reuse or revise these boundaries without
ORG creating engine, IPC, operation catalogs or new document owners.

## MODIFIED — blueprint/design/tui.md: Feature controllers

Previously: App owns shared state and wires feature controllers, but supplies helpers back to features and also owns
clipboard and notification work (`research.md`, long-module and dependency sections).

Keep App's ownership and `App.writeBuffer` as the only TUI note-write gate. Extract clipboard serialization,
notification scheduling and lower-level predicates as focused collaborators. Give isolated feature logic small,
explicit capability interfaces only where its actual calls justify them. Keep App-based integration tests for wiring,
write refusal, focus and disposal. Do not build a second mock App or a global context containing all App fields.

## ADDED — blueprint/design/how-it-works.md: Size and shared-code conventions

Recommendation: about 500 lines is the design aim; finish with a 600-line handwritten source ceiling, stepped through
1,000 and 750. At each step, cap every pre-existing larger file at its measured size, never above 1,500. Moves carry
caps to the new paths; new modules obey the current ceiling. Lower touched exceptions to their actual size and remove
them below the ceiling. Final handwritten exceptions require a named responsibility, rationale and follow-up task;
no blanket exemption for App. Keep generated server locks outside the handwritten ceiling under a separate measured
cap and verify their generator. Do not split embedded strings by hand. The research inventory of all 55 modules over
500 is the backlog, not only the nine over 1,000. Every row receives an extraction or a documented cohesive-module
assessment; reaching 600 does not erase the 500-line aim.

For tests, recommend a 1,000-line aim and a 1,500-line ceiling on new/split feature files, with exact non-growing caps
for remaining legacy files. Keep process fixtures and generated snapshots separately identified. This implements the
review of roadmap `27.3`, subject to approval; source and test rules have distinct defaults.

Extract pane navigation shared by footnotes/info/outline first. Share panel close or scroll helpers only after checking
focus, selection and pinning differences. Keep data-format parsing branches explicit unless identical semantics are
shown. Share fixture creation and protocol framing, never a generic assertion runner that hides scenarios.

Retain WorkerRequests for clients already using it. A narrowly shared lifecycle helper is optional only after tests
cover disposal, late delivery, queue saturation, cancellation and failure cleanup. Diagram retries/persistence,
paint's byte cache and export progress/spooling stay feature-owned. No universal scheduler or queue rewrite.
Retain export's existing format strategy and lazy registry, with encoding below dispatch; no class hierarchy.
Concentrate custom AST guards and library adapters only where repeated contracts are identical. Preserve WriteRefused,
CliError, WorkerRequestError and cleanup semantics; no global result-type conversion. Triage Knip candidates against
worker/build/tool entries before reducing export visibility; delete no behavior based on raw tool output.

## MODIFIED — blueprint/design/testing.md: Feature tests and selection

Previously: three broad files contain 41,661 lines, the shared TUI harness imports App/topbar helpers, and CLI tests
reach main's dynamic TUI import. D239 follows transitive imports, so splitting files alone retains broad closures.

Target `tests/core/<area>/`, `tests/tui/<area>/`, `tests/cli/<area>/` and `tests/support/`, with areas matching source.
Keep terminal checks under their existing feature hierarchy and fixtures under `tests/fixtures/`. Roots retain setup
and runner entry files only. Shared support is split into filesystem fixtures, process fixtures, model harness and
canvas helpers; pure tests never import the model harness. Scope discovery must recursively find the relocated tests,
snapshots and helper dependencies. Preserve preload behavior and snapshot names/content explicitly.

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
`tests/support/timeouts.ts`, with named existing slow budgets for export reads, large parse, skill integration,
server integration and release-build hooks. Preserve per-file setDefaultTimeout calls where Bun requires them;
preload alone is insufficient. Keep the package runner's numeric fallback aligned and test that alignment.

Name budgets by operation, not speed tier alone. Record the present number and reason for each override; do not assign
a longer constant to all tests in a moved folder. Split compound CLI export scenarios in this phase, retaining each
assertion and any intentional end-to-end sequence. Distinguish aggregate test time from each CLI child's 20-second
bound. Narrow feature tests first; a shared default increase would mask excess work and weaken hang detection.

Keep terminal waits (10-second local floor, 30-second CI floor), 120-second check lifetime, frame waits, cleanup grace
and 45-minute CI ceilings separate and unchanged. Product worker/process deadlines remain unchanged too. Keep an
external forced-stop allowance for runs and retain the existing SIGTERM-resistant child test. A larger budget cannot
fix the observed overflowing timer; investigate clock arithmetic separately, with a failing regression test in its
own bug fix if confirmed. That fix is not a behavior-neutral ORG extraction.

Only propose an individual increase after repeated focused runs on supported CI hosts show legitimate work exceeds
its existing budget after narrowing/splitting. Record distributions and the slowest passing run; request approval for
the smallest justified named budget. Neither blanket 60-second units nor longer terminal/CI ceilings is supported by
the current evidence. This phase changes test organization/policy only, preserving application behavior.

## Draft sequence and review gates

[Tasks](tasks/README.md) define one PR per task in dependency order. Recheck open work before each move; finish an
area before moving its dependents, and avoid parallel broad rename branches. The design-stage query on 2026-10-26
found only draft PR #107 open; repository-health #106 has a current 2026-10-26 run. These are observations, not future
clearance to move files. CIW-T6/T9 and any new feature work must be coordinated at execution time.

Each PR names ORG-Tn, carries its complete path manifest, behavior invariants, focused pre/post checks and any baseline
failure. Update affected design path references, AGENTS.md and CONTRIBUTING.md when paths/rules change; consolidate
root design only with approval. No user-visible behavior is intended: user docs/CHANGELOG change only where developer
commands or documented paths actually change, with no blueprint IDs in user docs. Keep PR #107 draft.

## Choices for approval

1. **Recommend the area map above, explicit file imports and named light entry points.** Alternative: the same area
   ownership with `index.ts` facades that export only approved light APIs. Both use feature folders; no flat outcome.
2. **Recommend 500-line source aim, ceilings 1,000 → 750 → 600 and exact legacy caps; tests aim 1,000/cap 1,500.**
   Alternative: end at a strict 500 handwritten-source ceiling, accepting more extractions and reviewed exceptions.
3. **Recommend focused capability seams plus retained App/launcher integration tests.** Alternative: approve moves and
   test splits first and defer capability extraction, accepting that many dependency scopes remain broad.
4. **Recommend small proven shared helpers and existing worker/export/controller patterns.** Alternative: authorize
   moves alone now and return for approval on each helper extraction; no universal queue or ENG implementation.
5. **Recommend unchanged 30-second default and named current slow budgets in ORG-T12.** Alternative: approve only
  timeout
   centralization now and defer compound-scenario splitting to CIW-T9. No blanket increase is recommended.
6. **Recommend the 39-PR dependency sequence, with tasks split further before work if their manifest is too
   large to review in one sitting.** Alternative: finish all path moves before any responsibility/test-boundary work,
   accepting a longer period with broad tests and oversized modules.

Approval settles these choices before any decision record or implementation. Task order is a proposal, not activation.
