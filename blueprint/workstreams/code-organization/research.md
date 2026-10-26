# ORG research: the code's organization

## Scope and provenance

Read and measured on 2026-10-26 at `d3e406f27dd9e0d2736a09fd640edcc941eaacef`, the starting `origin/dev` of
`refactor/issue-55`. This is analysis for [#55](https://github.com/remziduzagac/slipbox/issues/55), not an approved
target structure. All source locations below refer to that commit. Interpretations and possible extraction seams
are research conclusions, not decisions. D235's 1,500-line ceiling and D239's dependency-based test selection hold.
Roadmap `0.2` and `0.3` establish the faces and their boundary; `14.10` covers supply-chain gates.

Commands ran locally with the existing dependencies. Analysis tools ran through `bunx`, without adding a dependency,
script or configuration to the project. Raw output is retained in ignored `tmp/issue/`; the findings and reproducible
commands below are the durable record. No source or test file was moved or edited in the working tree.

## Flat directories are a finding

Counting direct files separately from descendants gives the following baseline. Lines include comments and blank
lines, using `splitlines()`; this agrees with `scripts/check-size.ts:47` for these files.

| Directory | Direct files | Direct TypeScript files | Their lines | Direct subdirectories |
| --- | ---: | ---: | ---: | ---: |
| `src/core/` | 149 | 149 | 36,970 | 5 |
| `src/tui/` | 95 | 95 | 37,850 | 0 |
| `tests/` | 65 | 65 | 80,427 | 3 |

Method: enumerate `Path(directory).iterdir()`, count `is_file()` and `is_dir()`, then sum the lines of direct `.ts`
and `.tsx` files. `tmp/issue/sizes.json` holds the recursive source inventory. There are **328 source TypeScript
files, 96,622 lines, 55 files over 500 lines and 9 over 1,000**. The issue's older counts are not this baseline.
`bun run check:size` passed: none exceeds 1,500 and none has a special cap (`tmp/issue/size-check.log`).

The direct folders contain distinguishable areas already named in files: `src/core/graph.ts:1`,
`src/core/search.ts:1`, `src/tui/gitpanel.ts:1` and `src/tui/explorer.ts:1`. Existing subfolders such as
`src/core/export/` and `src/core/servers/` demonstrate area boundaries, while all TUI areas share one directory.
This is a navigation and ownership problem alongside module size: splitting files alone would increase those flat
counts. The design stage must organize **core, TUI and tests into folders by area or feature**, using these counts as
its starting evidence. Folder naming and placement of shared primitives remain design choices; retaining the flat
layout is outside the intended outcome.

## Long modules and responsibility seams

The complete inventory above 500 lines is at the end. Length identifies inspection candidates, not a requirement to
cut at a particular line. These nine files cross 1,000 lines; their responsibilities reveal different kinds of work.

| File | Lines | Responsibilities and source anchors |
| --- | ---: | --- |
| `src/tui/app.ts` | 1,446 | Controllers `534`; construction `606`; buffers `935`; writes `1165`; clipboard `1346` |
| `src/core/graph.ts` | 1,433 | Build `224`; parse `562`; cache `614`; moves `670`; overlays `962`; queries `1072` |
| `src/core/layout/code.ts` | 1,417 | Page composition `130`; cell frames `699`; wrapping `1144`; docs `1247` |
| `src/tui/explorer.ts` | 1,268 | Item menu `137`; tree rows `440`; zoom `566`; root tree `683`; actions `1000` |
| `src/core/servers/locks.ts` | 1,239 | Generated, embedded language-tool lockfiles, provenance `1`, data `4` |
| `src/core/syntax.ts` | 1,170 | Grammar loading `321`; tree ownership `543`; code model `700`; link tokens `1125` |
| `src/tui/keys.ts` | 1,166 | Default bindings `51`; pane descriptions `600`; aliases `982`; key decoding `1098` |
| `src/core/layout/render.ts` | 1,076 | Tree setup `155`; row finishing `245`; block dispatch `385`; pictures `645` |
| `src/core/export/pdf.ts` | 1,038 | Font fallback `119`; line layout `320`; block writing `692`; page numbers `1007` |

`App` is already composed of controllers (`src/tui/app.ts:534`–`604`), but also implements several services itself.
Extracting clipboard serialization or notification timing has a clearer seam than splitting its method list evenly.
Its write gate (`1165`) is an invariant to preserve, not a convenience to duplicate in a new feature folder.

`Graph` combines indexing, disk/cache interaction, movement reconciliation, live overlays and link queries. Existing
`graph-extract.ts`, `graph-resolve.ts` and `graph-types.ts` already separate some work (`src/core/graph.ts:59`–`75`).
Further splits should preserve one authoritative graph and avoid copying its mutable maps between new owners.

The code renderer's `layoutCode` spans lines `130`–`639`, with closures that share composition state. Moving only its
bottom helpers would leave the large orchestration intact. Identify explicit layout inputs and output builders before
extracting page/cell/documentation responsibilities. Preserve source maps and measured width handling.

The locks file is generated data, not a multipurpose service. Its generator is named at `src/core/servers/locks.ts:1`.
Treat generated-data placement separately from hand-written module size; changing it requires checking the generator
and compiled asset loading, not manually distributing its strings.

The current size check already supports a ratchet: `LIMIT` is 1,500 (`scripts/check-size.ts:16`), `CAPPED` is
empty (`22`), and `judgeSizes` compares each file with its cap or the default (`34`–`44`). A cap can be reduced when
it is over 200 lines above the current size (`25`, `42`). Issue #55 asks for about 500 lines as an aim; the design
stage must specify the smaller default and staged exception policy without treating generated lock data as a
hand-written controller. Roadmap `27.3` separately records evaluation of test-file size ratchets.

## Duplication: measured candidates, not a general rewrite

Ran jscpd 5.4.2:

```sh
bunx jscpd src tests --min-lines 10 --min-tokens 70 --format typescript \
  --reporters json,console --output tmp/issue/jscpd
bunx jscpd src --min-lines 10 --min-tokens 70 --format typescript \
  --reporters json,console --output tmp/issue/jscpd-src
```

The combined report found **104 clone pairs, 1,508 duplicated lines, 0.7493% of 201,252 scanned lines** in 438
sources. The source-only report found **6 pairs, 93 duplicated lines, 0.09634% of 96,532 scanned lines** in 317
sources. These are the tool's denominators, not the inventory's: parser/format selection and line counting differ.
Do not compare its percentage with the inventory total. Report paths are `jscpd/jscpd-report.json` and
`jscpd-src/jscpd-report.json` under the evidence directory. The tool reports locations relative to each scan root.

| Source clone pair (file:line) | Reported lines | Interpretation after reading |
| --- | ---: | --- |
| `src/tui/footnotes.ts:253`, `src/tui/info.ts:251` | 27 | Shared pane navigation actions are a candidate |
| `src/tui/explorer.ts:1163`, `src/tui/history.ts:288` | 16 | Panel close/leave behavior shares a shape |
| `src/tui/footnotes.ts:264`, `src/tui/outline.ts:162` | 16 | Overlaps the pane-navigation candidate above |
| `src/core/data.ts:203`, `src/core/data.ts:372` | 12 | Data-format parsing similarity; keep format semantics visible |
| `src/core/diagram-jobs.ts:99`, `src/core/paint-jobs.ts:54` | 11 | Pending/idle cleanup; queue policies still differ |
| `src/tui/draw-panels.ts:610`, `src/tui/draw-panels.ts:680` | 11 | Selection/scroll bounds; preserve pinning |

The combined report is dominated by test/setup similarities. Examples: `tests/core.test.ts:6178` and
`tests/tui-git.test.ts:1277` share 25 reported lines; `tests/terminal/herdr/session.ts:303` and
`tests/terminal/session.ts:459` share 25. Shared test fixtures and terminal protocol helpers merit inspection, but
assertions and scenario descriptions should remain visible in their own tests. These thresholds miss shorter and
semantic duplication; the small production percentage does not prove all repetition is benign or absent.

## Dependencies and layers

Ran madge 8.0.0 against the source, with TypeScript resolution:

```sh
bunx madge --extensions ts,tsx --ts-config tsconfig.json --json src
```

The default graph (`tmp/issue/madge.json`) has **335 nodes and 1,911 edges**. A Tarjan traversal of that JSON found
seven nontrivial strongly connected components, with sizes **16, 3, 7, 2, 7, 5 and 83**. These are components, not
seven individual cycles. The graph also contains seven resolved assets outside `src/`: package metadata, the
bundled skill and five grammar binaries; hence its node count differs from the source `.ts` inventory. Full
membership and incoming/outgoing counts are in `tmp/issue/graph-summary.json`.

A second pass ran from an ignored directory with a `.madgerc` containing:

```json
{"detectiveOptions":{"ts":{"skipTypeImports":true},"tsx":{"skipTypeImports":true}}}
```

It used absolute-equivalent paths back to the same source and tsconfig. That graph has **335 nodes and 1,581 edges**,
with three nontrivial components: file mutations (3), export writer dispatch (3), and TUI composition (64).
`tmp/issue/madge-runtime.json` and `graph-runtime-summary.json` retain it. This is an import-analysis approximation:
it includes dynamic imports and does not prove an eager initialization failure or a runtime hang.

Type-only feedback is substantial. `src/core/commands/files.ts:3` imports `CommandSpec` from the joining catalog;
`src/core/graph-types.ts:7` refers to `Graph`; `src/core/diagram-cache.ts:5` refers to `DiagramRequest`.
Those edges should not be described as runtime faults. Separate reusable contracts from a composition module where
it improves ownership, rather than banning all type-only feedback without examining it.

Runtime feedback has concrete seams:

- `src/core/rename-apply.ts:10` imports `trashVaultMarker` from files, while file operations call rename planning.
  Mutation orchestration and shared marker operations need an explicit owner.
- `src/core/export/html.ts:6` and `src/core/export/markdown.ts:10` import `utf8` from the dispatcher
  `src/core/export/stream.ts:6`; that dispatcher dynamically loads the writers. A lower-level encoding helper could
  remove the return edge without changing writer behavior.
- `src/tui/files.ts:19` and `src/tui/mouse.ts:14` import `editable` from App. The composition root is also a helper
  provider. Drawing has similar feedback: `src/tui/draw-topbar.ts:6` imports drawing primitives from `draw.ts`, which
  composes its regions. Move contracts and primitives to their actual lower-level owner when the design is agreed.

The default graph's highest fan-in includes App (83), fsutil (73), vault (51), paths/sanitize/width (46 each), graph
(42), and layout IR (39). App's fan-out is 87. Counts include type edges and dynamic imports. High fan-in for width
and sanitize reflects deliberate shared invariants; high fan-in alone is not a defect.

`bun run check:boundary` passed (`tmp/issue/boundary.log`). The check's rules are at
`scripts/check-boundary.ts:16`, and the special diagram worker owner at `25`. It does not enforce feature direction
inside core or TUI, lower-level drawing primitives, or dependency-free contracts. Folder moves should preserve the
face boundary and add only the narrower rules justified by the eventual design. This analysis found internal
composition feedback, not evidence that the enforced core/TUI boundary is broken.

## Naming, unused code, types and errors

Names carry area prefixes in the flat layout: `graph-*`, `draw-*`, `git*`, `rename-*`, while existing feature folders
use local names (`src/core/export/jobs.ts:1`, `src/core/servers/client.ts:1`). Roles also differ across similarly named
files: `src/core/watch.ts:1` owns filesystem observation; `src/tui/watch.ts:1` coordinates graph and open-note updates.
A folder design should make both area and role legible without renaming public commands or changing behavior.

Ran knip 6.43.0 with `bunx knip --reporter json`, using default project discovery; retained
`tmp/issue/knip.json` and `knip.log`.
The process returned 1 with **58 unused-file candidates, 186 unused exports, 54 unused types, 6 unlisted package
references, 5 unlisted binaries and 2 unused development dependencies**. There were zero unresolved-import entries.
These are raw candidate counts across the discovered project, including the site and tooling, not proven removals.

The 58 file candidates split into 25 example files, 18 test files, 8 source files, 4 site files and 3 scripts.
Default discovery therefore overreaches the implementation inventory. For example, the flagged `scripts/bench.ts`
and `scripts/sample-metrics.ts` have documented invocations (`blueprint/design/testing.md:328`, `174`), and the
flagged `site/scripts/check-links.ts` is invoked by `site/package.json:9`. The two development-package candidates
are `markdownlint-cli2` and `vscode-languageserver`; the former is invoked through a computed executable path in
`scripts/check-docs.ts:69`, so its flag is not evidence that the project can drop its docs linter.
The latter is imported by the fake server fixture (`tests/fixtures/fake-lsp.ts:12`), itself flagged as unused; this
is another entry-discovery issue rather than an established unused dependency.

Examples requiring configuration-aware triage:

- Knip marks `src/core/backlinks-worker.ts` and other workers unused; build entry points are explicit in
  `package.json:36`, and worker URLs are formed through `src/core/workers.ts`. These files cannot be deleted based on
  default entry discovery. The project's scope graph explicitly recognizes `workerUrl` (`scripts/ci-scope.ts:177`).
- `src/core/parse.ts:371` exports `HEADING_ID`; Knip reports the export unused. Distinguish removing `export` from
  deleting the implementation, and verify non-TypeScript consumers before either change. A repository search
  found only its declaration and internal use (`src/core/parse.ts:379`); similarly, the flagged `htmlEntities`
  export is used internally at `src/core/html.ts:36` and `116`. These support narrower export surfaces, not deletion
  of those behaviors.
- Knip reports `unist` and `hast` type references as unlisted (`src/core/parse.ts:9`, `src/core/export/html.ts:7`).
  Resolve direct type ownership deliberately; an organizational change should not silently add or remove packages.
- Optional host tools such as `nvim` are flagged as binaries (`src/core/nvim.ts`); their optional runtime integration
  is not an unused source declaration.

TypeScript already enables `strict`, `noUncheckedIndexedAccess` and `noImplicitOverride` (`tsconfig.json:19`–`23`),
while unused locals and parameters are disabled (`26`–`27`). The source review found repeated custom-AST casts in
`src/core/layout/render.ts:525`–`526` and `src/core/layout/render-inline.ts:200`–`213`, plus library adaptation in
`src/core/export/pdf.ts:280`. Concentrating custom node guards and library adapters is a testability/readability
candidate; this is not a finding that the current casts are incorrect. Avoid a global type-tightening change mixed
with path moves. The search results are retained in `tmp/issue/type-escapes.txt` and include comment false positives.

Failures have several existing contracts: `WriteRefused` (`src/core/fsutil.ts:133`), `CliError`
(`src/cli/common.ts:49`), `WorkerRequestError` (`src/core/worker-requests.ts:12`), and ordinary `Error` in export jobs
(`src/core/export/jobs.ts:49`). Some catches intentionally suppress cleanup failures (`src/core/export/jobs.ts:149`);
others rethrow after cleanup (`src/core/export/jobs.ts:107`). Do not replace them all with one result type: preserve
write refusal, retry, cancellation and presentation semantics. A future extraction should state which failures are
expected and which layer displays them; characterization tests must cover those paths before changing an adapter.

## Patterns worth evaluating in the design stage

`WorkerRequests` already handles bounded admission, cancellation and deadlines (`src/core/worker-requests.ts:63`).
Regex, syntax and walk clients use it (`src/core/regex-jobs.ts:25`, `src/core/syntax-thread.ts:23`,
`src/core/walk-thread.ts:76`). There is no evidence for replacing these with a second general queue.

Diagram and paint queues share lifecycle details but not all policy: diagram has screen/batch policies, timeout retry
and persisted successes/failures (`src/core/diagram-jobs.ts:16`, `126`, `174`); paint keeps byte-bounded image results
and announces revisions (`src/core/paint-jobs.ts:15`, `68`). Export uses two concurrent, individually owned workers,
progress, cancellation and spool publication (`src/core/export/jobs.ts:40`, `115`, `145`). A shared transport or
lifecycle helper could reduce repeated worker cleanup; a universal cache/job abstraction could erase necessary
policy distinctions. Any extraction needs tests for disposal, late delivery, queue saturation and cancellation.

Export already has a strategy-shaped contract: `ExportFormat`, lazy `FORMATS` and `formatFor`
(`src/core/export/index.ts:39`, `56`, `116`). Preserve lazy loading and the assembled document; do not add a class
hierarchy just to name a pattern. The dispatch/encoding dependency and PDF font/layout responsibilities are more
concrete opportunities than a new format framework.

App's controllers already implement the project's preferred composition (`src/tui/app.ts:534`). Moving controllers
into feature folders will help navigation; it will not alone narrow imports or test selection. Smaller explicit host
capabilities could improve isolated testing, but changing state ownership belongs in an explicitly approved phase.
Do not introduce a dependency-injection container or service locator on the evidence of file size alone.

## Tests and selection

The direct `tests/` directory contains 63 `.test.ts` files and two other TypeScript files. The largest three are
`tests/tui.test.ts` (**21,146 lines**), `tests/vault.test.ts` (**13,587**) and `tests/core.test.ts` (**6,928**).
Their combined **41,661 lines** account for more than half the direct test-directory TypeScript lines. Counts are
from the same inventory method; `tmp/issue/test-sections.txt` retains top-level describe groups with locations.

`tests/tui.test.ts:25`–`81` imports commands, config, graph, paths, layout, syntax, pictures, keys, editing and the
full harness. The harness also imports App and top-bar location items (`tests/tui-harness.ts:18`, `20`), making
a location-only dependency visible to every user of that harness. It mixes OpenTUI grapheme parity (`85`),
input/view interactions and feature scenarios.
`tests/vault.test.ts:27`–`76` imports the CLI, graph, discovery, rename, symlinks, walking and rendering.
`tests/core.test.ts:20`–`70` imports capture, config, parsing, math, images, lint, installation, editing helpers and
rendering. These are responsibility collections, not narrowly scoped suites.

Some features already have separate files: `tests/regex-jobs.test.ts`, `tests/tui-updates.test.ts` and
`tests/html-tui.test.ts`. Separation is therefore an established repository technique. It has a limit: a TUI test
that imports `tests/tui-harness.ts` still reaches App and its controllers. Moving those tests into separate files does
not by itself isolate their imports. Pure feature tests should import the feature directly where possible, while
actual composed-App and terminal behavior remains integration coverage.

Selection uses reverse transitive reachability (`scripts/ci-scope.ts:231`) and recognizes named repository paths and
workers in addition to imports (`177`). The design must account for this graph, snapshots and `CHECKS_FOR`, not merely
rename test files. `tests/setup.ts` is a global preload (`bunfig.toml:14`), so shared setup changes intentionally have
wide scope. Terminal checks already live by feature under `tests/terminal/checks/`; their harness stays shared.

There is another independent source of breadth: `tests/cli.test.ts:31` names `src/main.ts`, and its helper launches
that file (`79`). Main dynamically imports the TUI (`src/main.ts:50`), which the scope graph follows even when a
particular CLI invocation never enters it. The dependency scanner's fixture explicitly retains that dynamic edge
(`tests/distribution.test.ts:391`, `427`). Thus a header change selecting CLI tests does not establish that header
code runs in those tests. Source dependencies and invocation-specific execution are different facts. Narrower
CLI-function tests with retained launcher coverage, or a separately reviewed selection-policy refinement, are
candidates for stage 2; merely putting unchanged imports into smaller test files will retain this breadth.

Feature ownership is visible in existing describe groups, but historical review groups mix it again:
`tests/tui.test.ts:3686`, `3931`, `4028` and `tests/core.test.ts:612`, `655`. A split should classify individual
scenarios by the behavior they exercise, rather than moving each historical review group intact. Representative
seams already named by tests are core width/sanitize/config (`tests/core.test.ts:138`, `155`, `345`), discovery/walk
(`tests/vault.test.ts:111`, `284`), cross-root rename/search (`2586`, `3841`), and TUI cursor/selection/editing
(`tests/tui.test.ts:205`, `334`, `1597`). Preserve the assertions and their fixture lifetime when relocating them:
core owns a sandbox and resets trust after each test (`tests/core.test.ts:127`, `136`); vault sets process-wide XDG
paths (`tests/vault.test.ts:77`); TUI uses the shared harness sandbox (`tests/tui.test.ts:83`).

### Timeout findings and current limits

The scoped runs repeatedly hit per-test limits as well as the separate whole-command bound. No project timeout setting
was changed. These are observed expiries at the starting commit, not evidence of a quantified increase over earlier
runs: this session has no controlled earlier failure-rate sample.

| Test (source anchor) | Measured expiry in the location case | In the export-stream case |
| --- | ---: | ---: |
| Word export scenario, `tests/cli.test.ts:400` | 30,047.83 ms | 30,006.92 ms |
| Excluded-note writing scenario, `tests/cli.test.ts:535` | 30,062.60 ms | No expiry recorded |

Both logs explicitly say the test timed out after **30,000 ms**. The first scenario exercises several exports and
CLI launches in one test; each launch has its own **20,000 ms** child-process bound (`tests/cli.test.ts:79`–`82`).
Those limits are distinct: a larger test budget does not repair a child invocation exceeding its own deadline.
Likewise, splitting a file without splitting or narrowing that compound scenario does not reduce its own work.
The wide dependency scope does explain why a location-only change runs it at all; it does not prove the cause of
its individual timeout. Other assertion failures, including interrupted distribution output, are not counted as
per-test timeout expiries here. Raw evidence: `tmp/issue/unrestricted-scope-where.log` and
`unrestricted-scope-stream.log`; the table is updated with the remaining case before this stage ends.

Current timeout layers, read from code:

- **Runner default:** `bun test --timeout 30000` (`package.json:16`); docs use the same default (`17`).
  `scripts/ci-scope.ts:310` selects files and invokes that package script; it does not set a per-feature deadline.
- **File/harness defaults:** ten `setDefaultTimeout` calls were found under tests. Nine use 30,000 ms, including
  `tests/tui-harness.ts:44`, `tests/core.test.ts:124` and `tests/cli.test.ts:30`; export reads use 60,000 ms
  (`tests/export-reads.test.ts:17`). `tests/setup.ts:10` explains why setting a preload default alone reaches only
  the first file. The inventory is `tmp/issue/default-timeouts.txt`.
- **Named slow scenarios and hooks:** the skill-command integration case uses 180,000 ms
  (`tests/cli.test.ts:785`); large parse cases use 60,000 and 120,000 ms (`tests/worker-requests.test.ts:301`, `311`);
  one syntax responsiveness case uses 20,000 ms (`tests/syntax-worker-tui.test.ts:53`). The release build's
  `beforeAll` uses 240,000 ms (`tests/distribution.test.ts:1008`), a hook budget rather than an ordinary test limit.
  Other explicit examples include 60,000 ms in `tests/tui.test.ts:5910`, 90,000 ms in
  `tests/servers.test.ts:1406` and 120,000 ms in `tests/servers.test.ts:1525`. These values are not one shared default.
- **Terminal observation waits:** the minimum wait is 10,000 ms, configurable by `SLIPBOX_TERMINAL_WAIT`
  (`tests/terminal/session.ts:43`); `until` takes the maximum of that floor and its argument (`522`), polling every
  20 ms (`529`). CI overrides the minimum to 30,000 ms (`.github/workflows/ci.yml:189`,
  `.github/workflows/build.yml:77`). Some checks ask for more, such as 20,000 and 30,000 ms during updates
  (`tests/terminal/checks/updates.ts:75`, `81`). A frame wait is a separate setting (`session.ts:83`), defaulting to
  1,000 ms (`tests/terminal/terminal.ts:63`, `290`).
- **Terminal check lifetime:** `SLIPBOX_TERMINAL_LIMIT` defaults to 120,000 ms
  (`tests/terminal/worker.ts:26`), with a Promise race around startup and the check (`43`). Quit and cleanup follow
  that race (`66`); quitting tries a 5,000 ms wait, subject to the session's minimum, before SIGKILL and another
  wait (`tests/terminal/session.ts:251`–`256`). Thus this is not a hard process-wall-clock ceiling. No terminal
  check was run in this analysis, so no terminal timeout rate is measured here.
- **CI job ceiling:** the test and terminal jobs each allow 45 minutes (`.github/workflows/ci.yml:129`, `170`).
  This is separate from each test/check deadline; the local 15-minute measurement bound is intentionally lower.
  Hitting that analysis bound does not establish that CI requires a larger job timeout.
- **Run termination:** the measurement command wraps the selected run in `gnutimeout -k 10 900`, a 900-second
  command budget followed by a 10-second forced-stop allowance. This is analysis harness configuration in ignored
  files, not a project timeout change. `tests/setup.ts:41` installs SIGTERM cleanup/exit handling; an in-process
  timer or cleanup handler is not a guarantee that every child exits promptly. Retain a forced-stop bound for runs
  that ignore or delay SIGTERM. The completed location run returned 124 at 900.088 seconds; that result alone does
  not demonstrate that SIGKILL was necessary.

The existing SIGTERM-resistant tool fixture was also run on its own, without editing it:

```sh
gnutimeout -k 10 300 bun test --timeout 30000 ./tests/tool-process.test.ts \
  -t 'a tool that ignores the graceful stop'
```

The fixture deliberately ignores SIGTERM, sets a 300 ms tool deadline and 50 ms grace, and asserts SIGKILL and no
remaining process (`tests/tool-process.test.ts:56`–`64`). Its measured result is retained in
`tmp/issue/sigterm-probe.log`: **one pass, zero failures, 381.90 ms for the test, 548.00 ms for the run**.
This distinguishes a stubborn child from an unresponsive test runner; it is not
proof that every Bun test run ignores SIGTERM. The sandbox-only regex log also contains `TimeoutOverflowWarning`
and an effective 1 ms timer; those warnings are not per-test timeout reports and are not a reason to raise defaults.

Stage 2 must propose a **separate phase for timeout policy**, keeping it out of source/test moves. The proposal
needs a recommendation on any increase, a shared default with named slow-case constants, and a distinction between
noise from machine load, over-broad test scope, compound scenarios and a stuck worker/process. These observations
do not establish that a blanket increase or a file split alone will fix the expiries. Product deadlines and loading
behavior remain outside that test-policy change.

### Scoped execution baseline

Measurements are being collected in an ignored archive copy of the baseline, with one appended newline in one
source file at a time. Each run uses `bun run test:changed`; original bytes are restored between runs. The archive
has its own baseline commit and `origin/dev` ref and shares only installed node_modules. Logs, timings, selected test
files and failures will be recorded here before the research stage ends. No whole-suite or terminal run is used.

## Where #55 meets #56

[#56](https://github.com/remziduzagac/slipbox/issues/56), memory and loading on first use, follows #55's moves and
stays outside ORG's behavior changes. The following import sites are a structural baseline, not memory measurements.
A static import inside a dynamically loaded writer or a worker is different from a static import on the main path.

| Library | Static value import | Existing boundary to preserve |
| --- | --- | --- |
| `pdfkit` | `src/core/export/pdf.ts:14` | Writer loaded dynamically by `export/index.ts:65` and `stream.ts:29` |
| `docx` | `src/core/export/docx.ts:7`–`30` | Writer loaded dynamically by `export/index.ts:58` and `stream.ts:40` |
| `fontkit` | `src/core/export/fonts.ts:9` | Font adapter used by PDF; its types-only imports load nothing |
| `web-tree-sitter` | `src/core/syntax.ts:15` | Parser module static; grammar initialization/loading is separate |
| `highlight.js` | `src/core/layout/highlight.ts:5`–`32` | Core and language registrations are static in that module |
| `hunspell-asm` | `src/core/hunspell.ts:9` | Static worker-side adapter; WASM factory created on first dictionary |

`src/core/graph.ts:12` statically imports syntax helpers, so moving syntax into a folder would not by itself defer
its module. The syntax module imports the WASM asset at `src/core/syntax.ts:16`, while parser initialization and
individual grammar loading happen at `321`–`325`. Similarly, `src/core/layout/render.ts:26` and
`src/core/layout/source.ts:12` statically import highlighting. Preserve these facts for #56 to assess; ORG does not
change them or infer retained bytes from an import declaration.

Worker modules are execution and loading boundaries, not dead files: syntax imports the parser
(`src/core/syntax-worker.ts:2`), spelling imports the Hunspell adapter (`src/core/spell-worker.ts:5`), paint calls
lazy rasterizer/typesetter loaders (`src/core/paint-worker.ts:2`–`3`), diagrams load their renderer in their own
worker (`src/core/diagram-worker.ts:2`, `7`), and export invokes the selected writer in its worker
(`src/core/export-worker.ts:4`, `25`). Walk, list, parse, backlinks and regex also have separate build entry points
(`package.json:36`). A worker's lifetime and its module's loading time are separate concerns. Worker relocation must
update the source/compiled URL contract (`src/core/workers.ts:16`) and the build list without pulling worker-only
libraries onto the caller's thread.

`src/core/lazy.ts:1` currently sits directly in core, below its consumers: it imports only `node:async_hooks` (`6`)
and owns the loading/ready/failed cache, synchronous `lazy` (`17`), awaited `load` (`25`), error inspection (`33`),
and completion observers (`39`). Syntax consumes it at `src/core/syntax.ts:41`. This helper does not make its caller's
static imports lazy; the loader passed to it determines when the dependency is acquired.

The target folders must leave room for **one deliberate entry point per heavy feature**, with light contracts kept
separate from heavy implementation and worker entry files. Its exact names and the shared loader's destination
remain for stage 2, with recommendation-first options. No ORG phase may turn an existing dynamic import into a
static one, including through a new re-export barrel. Path moves preserve first-use loading, worker isolation and
lazy-loader behavior. Loading policy changes, retained-memory work and new loading optimizations belong to #56.

## Where ORG meets ENG

Read the draft ENG README, architecture proposal and parent-change inventory:
`blueprint/workstreams/execution-engine/README.md:1`, `ideas/architecture.md:1` and `design/changes.md:1`.
ENG proposes an application engine, document ownership, explicit ports, operation contracts and optional attached
clients. Its `design/changes.md` explicitly targets the parent's module map, TUI ownership, testing and D235.

ORG meets ENG at App's mixed responsibilities, graph/workspace lifetime, worker delivery and composed test hosts.
ORG can improve area folders, local helper direction, file sizes and focused tests under the **current** ownership
model. It must not quietly implement ENG's document engine, socket, execution contracts or move application state to
a new backend layer. ENG remains draft; ORG neither waits on it nor adopts its target structure as a prerequisite.
Stage 2 should leave feature boundaries understandable enough that ENG could later fit within them or revise them.

## Baseline coordination and limits

The open-PR query returned an empty list on 2026-10-26. Recheck before a move phase; issue #55 explicitly asks to avoid
conflicts with open work. The scope/testing tasks left from #65 include path mapping and slow-test work
(`blueprint/tasks/ciw-map-more-files.md`, `blueprint/tasks/ciw-slowest-tests.md`); coordinate changes to
`scripts/ci-scope.ts` with them. No repository-health issue was returned even with `--state all`; health freshness
could not be assessed.

This research does not prove a performance improvement from folders, identify every semantic clone, establish that
all Knip findings are removable, or approve a new architecture. Those limits matter when sizing behavior-preserving
phases. Design choices, options with recommendations, target folders and phased tasks belong to the next stage.

## Inventory: every source module above 500 lines

Responsibility summaries are read from each file's opening contract (line 1 unless an explicit symbol anchor is
given above). The two watch modules have different owners; this table identifies them by full path.

| File (source anchor) | Lines | Responsibility |
| --- | ---: | --- |
| `src/tui/app.ts:1` | 1,446 | Composition, buffers, writes, notifications, clipboard |
| `src/core/graph.ts:1` | 1,433 | Index build/cache, moves, overlays, link queries |
| `src/core/layout/code.ts:1` | 1,417 | Code-document cells, prose, wrapping, source maps |
| `src/tui/explorer.ts:1` | 1,268 | Tree rows, navigation, zoom and item actions |
| `src/core/servers/locks.ts:1` | 1,239 | Generated language-tool lockfile data |
| `src/core/syntax.ts:1` | 1,170 | Grammar loading, syntax trees and code-model extraction |
| `src/tui/keys.ts:1` | 1,166 | Bindings, pane help, aliases and input normalization |
| `src/core/layout/render.ts:1` | 1,076 | Markdown tree dispatch, pictures and row finishing |
| `src/core/export/pdf.ts:1` | 1,038 | PDF fonts, line layout, block painting and pagination |
| `src/core/config.ts:1` | 998 | Defaults, TOML loading, validation and root merging |
| `src/tui/gitbranchview.ts:1` | 992 | Branch/worktree rows and branch operations |
| `src/tui/draw-overlays.ts:1` | 954 | Dialogs, lists, menus, help and save-as painting |
| `src/tui/draw-pane.ts:1` | 943 | Note rows, marks, gutter, pictures and cursor painting |
| `src/core/data.ts:1` | 888 | Data-format parsing into document trees |
| `src/core/watch.ts:1` | 866 | Filesystem observation and change reconciliation |
| `src/tui/mouse.ts:1` | 843 | Hit routing, selection, dragging and wheel input |
| `src/core/walk.ts:1` | 825 | Walk filtering and filesystem traversal |
| `src/core/search.ts:1` | 805 | Ranked text search, query parsing and fallback scanning |
| `src/core/rename.ts:1` | 804 | Rename/move plan construction and related links |
| `src/tui/draw.ts:1` | 761 | Screen geometry, shared drawing primitives and composition |
| `src/tui/problems.ts:1` | 759 | Diagnostics panel, marks and problem navigation |
| `src/tui/vim.ts:1` | 756 | Counts, operators, motions and text objects |
| `src/core/parse.ts:1` | 736 | Markdown parse pipeline, anchors and transformations |
| `src/tui/gitpanel.ts:1` | 713 | Source-control panel state, message editing and actions |
| `src/tui/git.ts:1` | 710 | Repository state and source-control orchestration |
| `src/tui/draw-panels.ts:1` | 708 | Explorer, history, git and right-panel painting |
| `src/tui/editing.ts:1` | 691 | Source text operations and cursor mapping |
| `src/tui/peek.ts:1` | 691 | Read-only floating view, finding, copying and navigation |
| `src/tui/languages.ts:1` | 690 | Syntax/server/linter integration and tool trust |
| `src/tui/buffer.ts:1` | 679 | Text/history state and cached layouts |
| `src/core/servers/client.ts:1` | 677 | Language-server process, protocol and diagnostics |
| `src/tui/watch.ts:1` | 666 | Graph batches, polling, background index and note reload |
| `src/tui/updates.ts:1` | 660 | Upgrade offers, dialogs and restart coordination |
| `src/tui/vaults.ts:1` | 630 | Vault switching, creation and named-folder interaction |
| `src/core/theme/theme.ts:1` | 615 | Semantic roles, palette and color calculations |
| `src/core/graph-resolve.ts:1` | 605 | Link resolution across paths, names and roots |
| `src/core/update.ts:1` | 605 | Release discovery, verification and upgrade steps |
| `src/cli/cli.ts:1` | 602 | CLI argument parsing, command dispatch and output |
| `src/core/home.ts:1` | 586 | Incremental home walk and retained directory facts |
| `src/core/servers/languages.ts:1` | 584 | Language and server definitions, file types and root markers |
| `src/core/vault.ts:1` | 584 | Root discovery, markers, location and initialization |
| `src/core/report.ts:1` | 583 | Report facts, text serialization and issue form URL |
| `src/tui/views.ts:1` | 583 | View layout, cursor, scrolling and selection |
| `src/tui/files.ts:1` | 568 | File/folder creation, movement, trash and restoration |
| `src/core/merge.ts:1` | 549 | Line/word differences and three-way merge |
| `src/core/layout/blockdiff.ts:1` | 544 | Formatted before/after block differences |
| `src/tui/actions-links.ts:1` | 541 | Named link, backlink and peek actions |
| `src/core/servers/manager.ts:1` | 534 | Language-server ownership, startup and configuration |
| `src/core/glyphs.ts:1` | 531 | Glyph sets, terminal capability choice and fallbacks |
| `src/tui/completion.ts:1` | 524 | Language completion, filtering and applying edits |
| `src/core/reach.ts:1` | 517 | Other-root discovery and cross-root link facts |
| `src/tui/panels.ts:1` | 517 | Panel focus, widths, filters and resizing |
| `src/core/folders.ts:1` | 508 | Named-folder identity and local registrations |
| `src/tui/lens.ts:1` | 505 | Read/source view and live-preview lens transitions |
| `src/tui/search.ts:1` | 503 | Ranked text search, query parsing and fallback scanning |
