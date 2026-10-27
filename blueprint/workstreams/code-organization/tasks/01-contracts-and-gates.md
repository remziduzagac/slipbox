---
status: review
assignee:
blocked_by: []
created: "2026-10-26"
---

# ORG-T1: Contracts and migration gates

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Extract independent CommandSpec contracts and add regression fixtures for command catalog direction. Capture migration
manifests/test identities. Introduce the 1,000-line source ratchet with measured exceptions. Other reverse-edge
extractions belong to their owner PRs.

### Issue coverage and ownership

Capture a finding ledger from the coverage ledger: every issue item, clone candidate and oversized module has an owner.
Record the verified window/tab and tools-context gaps separately from ORG; refresh baseline test identities and tool
settings. Preserve the current command registry while extracting contracts.

## Evidence required

Command registration, mutation/export dependency cycles, drawing primitives and boundary/size tests. Repeat runtime
graph; preserve startup and error outcomes.

Establish the manifest-driven relocation checks in the design's move-mechanics section: resolved imports and dynamic
path references, source/compiled worker entries and allowlisted intentional old-path fixtures. T44 can run alongside
moves; no gateway/ENG runtime is a prerequisite for these independent checks.

## Implementation and baseline (2026-10-27)

The baseline is `fe3693d`, with the approved design and unchanged application code. T1 extracts the `CommandSpec`
interface from `src/core/command-specs.ts` into `src/core/commands/contracts.ts`; the six area catalogs and their
composer import that independent contract. No complete file moves or compatibility re-exports are needed here.
`scripts/check-boundary.ts` rejects an area's import of its composer, including type-only imports, and imports from
the independent contract. Command metadata, order and startup registration remain unchanged: all 331 entries compare
identically before and after.

`scripts/check-size.ts` enforces the first 1,000-line source ceiling. Its eight handwritten exceptions have exact
measured caps, all below 1,500; a one-line shrink requires lowering the cap. Ordinary growth fails; the ORG-D2 dated
note permits only a documented measured reset for import formatting during moves. Generated server locks have a separate
measured cap and offline generator verification: `bun scripts/lock-servers.ts --check` regenerates from the stored lock
data in memory and compares normalized emitted code. It writes nothing and does not refresh npm resolutions. It also
requires exactly the current pin keys and checks each stored workspace dependency map against the pin's install
manifest. `tests/organization/generated-locks.test.ts` covers missing/orphan pins, changed versions, malformed data,
dropped data, extra code and the committed module. This does not re-resolve or authenticate npm data. The later 750/600
steps remain T10/T11's work (ORG-D2).

Exact cap edits in `scripts/check-size.ts` are the one allowed shared-file conflict between parallel move/extraction
PRs. For ordinary shrink-only conflicts, keep the smaller cap and remeasure the merged source. If a move also changes
import formatting, preserve normal formatting and record the measured import-only delta under the ORG-D2 dated note;
never raise a cap for implementation growth. A file below the ceiling loses its exception.

The [finding ledger](../design.md#issue-coverage-and-finding-owners) is authoritative for the seven issue items, six
clone pairs, pattern/type/error candidates and 55 oversized modules. The [verified hierarchy
findings](../design.md#focused-verification) remain separate behavior changes; this contract
extraction changes neither windows/tabs nor the active-document tools. No new duplicate finding ledger is introduced.

### Relocation checker for subsequent move PRs

Run `scripts/organization/migration.ts` from the checkout root, before and after a mechanical move:

```sh
bun scripts/organization/migration.ts capture /tmp/org-before.json
# Apply the PR's reviewed move manifest and its single scripted import rewrite.
bun scripts/organization/migration.ts check /tmp/org-before.json /tmp/org-moves.json
```

The manifest has `moves` (old full repository path to new full path) and `retained` (exact old-path occurrences kept
with a reason). For example:

```json
{
  "moves": { "src/core/example.ts": "src/core/foundation/example.ts" },
  "retained": [
    { "file": "history.md", "text": "src/core/example", "reason": "Historical measurement" }
  ]
}
```

The capture records resolved imports in `src/` and `scripts/`, type imports, literal dynamic imports and worker/URL
references, runtime import edges, build entry points and the multiset of literal test/suite declarations. Worker paths
resolve from the imported `workerUrl` helper, including callers in nested folders. The comparison maps both ends of each
edge and build entry through the manifest, fails on unresolved paths or lost/added dependencies and tests, and searches
tracked files for old full paths, including extensionless forms, with filename boundaries so prefix-sharing siblings are
not flagged. The input manifest is excluded by its exact resolved path; sibling manifests are still scanned. Snapshot
overwrite is refused so the before evidence is retained. Keep the manifest and both snapshots with the PR's measurement
artifacts.

Worker detection supports a literal first argument to `workerUrl`, with a plain, unaliased named import of that helper
(the first matching import statement). Aliased/namespace helpers, alternate explicit URL bases, computed arguments
and template-built worker paths require manual review and the affected worker's source/compiled execution checks.
Test files supply literal declarations, not import edges; their imports still need typechecking. Comments and quoted
fixture text are excluded from the declaration capture. Conditional/parameterized cases such as `test.each` and
`test.skipIf` are not expanded or counted as plain declarations.

This gate is deliberately for mechanical relocations: a responsibility extraction such as T1 has intentional graph
changes to review. It does not parse arbitrary computed paths or establish test nesting/hook equivalence. Split string
paths, computed test cases, fixtures, selector mappings and dynamically constructed URLs still need the design's
explicit old-path search and review. Typechecking, focused tests, worker-entry tests and the copied compiled binary
checks remain required; matching graph counts alone are insufficient.

### Reproducible baseline capture

The corrected capture of `fe3693d` has **2,594 literal test/suite declarations**, 1,945 resolved source/script edges,
1,606 runtime import edges and 12 build entries, with no unresolved paths. These are lexical declaration identities, not
Bun's executed test count. The original raw-text capture counted comments and fixture strings too; its declaration count
must not be used as the baseline.

The full snapshot is retained locally at `tmp/issue/t1-baseline.json` (ignored generated evidence). Its SHA-256 is
`3dfc6695ec36e0f0e2fd73bfc79464637a6239c0cad3a99fe58bd518cbcfea88`.
From the T1 checkout, reproduce it with Bun 1.4.2 and the reviewed capture implementation:

```sh
baseline_dir=$(mktemp -d /tmp/org-t1-baseline-XXXXXX)
git archive fe3693d | tar -x -C "$baseline_dir"
ln -s "$PWD/node_modules" "$baseline_dir/node_modules"
mkdir -p tmp/issue
bun -e '
  import { capture } from "./scripts/organization/migration.ts";
  const snapshot = capture(process.argv[1]!);
  if (snapshot.unresolved.length) throw new Error(snapshot.unresolved.join("\n"));
  await Bun.write("tmp/issue/t1-baseline.json", JSON.stringify(snapshot, null, 2) + "\n");
' "$baseline_dir"
```

This is the T1 measurement baseline. Each later mechanical move PR captures its own immediate pre-move tree with the
same checker version on both sides; T1's intentional contract extraction is not an empty graph delta from `fe3693d`.

### Verification record

- The initial source-only scanner reported 1,585 runtime import edges, identical before and after. Its interpretation
  differs from research's Madge count; it is not a claim of four new dependencies. Full SCC membership matches research:
  mutation (3), export dispatch (3) and TUI composition (64). Their extractions retain their assigned owners.
- The only source graph changes are six removed area-to-composer type edges and seven new imports of the contract.
  The build entry list is unchanged. Test declarations retain the baseline except the old size-slack assertion,
  replaced by the stricter one-line-shrink assertion; new check fixtures are added.
- Focused pre/post checks: registry/keymap (5), drawing primitives (4, **baseline only**; reverse-edge extractions for
  drawing/editable remain T9), boundary/import syntax and worker URLs/build entries (6), all passing.
  The reviewed contract/migration/size, offline generation and startup tests pass (22 tests). Negative fixtures
  cover skipped tests, missing build entries and a moved worker whose URL/build entry did not follow.
- Source terminal checks: both checks matching `which-key: the leader` pass. The package build succeeds. A copied
  compiled binary, run away from the repository with isolated XDG directories, passes the panel/which-key check and
  exits cleanly; `info --json` and `commands --json` succeed, and an unknown option exits 2 with its expected error.
- Startup failure paths: `tests/organization/startup.test.ts` constructs the actual App through the TUI harness.
  A spec without an implementation and an implementation without a spec both reject with the registration error
  from `src/tui/actions.ts`; each mutation is restored in `finally`.
  `registerActions(app)` has no spec-list parameter, so these serial tests retain the shared-array mutations rather
  than adding a production API for tests. The file passes in two separate plain processes; two additional instrumented
  runs exited in 0.57/0.60 seconds and observed zero active timers, Worker creations or filesystem watcher creations.
  The harness disables live watching/indexing; OS watcher startup is after registration in the App constructor.
- The existing autosave/index-lock finding remains the documented ancestor-checkout/fixture interaction. T1 does not
  change its fixture, checkout caching or timeout. T12 remains next; T44 may proceed alongside the move sequence.
- `bun run check` passed typechecking, boundary/size, dependency, lint, workflow and documentation gates, then failed
  in its broad selected test run. Socket permission, shell output and two asynchronous clipboard failures reproduce
  on the unchanged `fe3693d` baseline in `tests/core.test.ts` and `tests/clipboard-async.test.ts`. The broad run was
  stopped after cascading fixture/environment failures and
  invalid-timer warnings; its remaining failures are not individually diagnosed. This is not a green aggregate run.
  Focused T1 evidence above stands separately; CI and maintainer review are still required before completion.

The gate corrections are confined to T1: contributor instructions now state the 1,000-line ceiling; CONTRIBUTING.md and
MAINTAINING.md contain no obsolete numeric ceiling. Prefix and script-edge regression fixtures, and the
commented-out-test regression, were run against the original T1 checker and all three failed before the fixes. The
command metadata/composer remains unchanged. Keep the PR draft until all test and terminal CI jobs are green and the
maintainer asks to advance it.

Comment handling now uses a single forward scanner that preserves string/template/regex literals and blanks comments
without changing offsets. Regression coverage distinguishes division followed by a comment from a regex literal.
This remains a lexical tool: templates are opaque and regex starts use expression/line context, not a full syntax tree.

Tool settings: Bun 1.4.2, TypeScript 7.0.2, repository compiler/Biome configuration; no dependency changes. The source
inventory is now 329 files, with the added contract below the size ceiling. No user-visible behavior change requires a
manual or changelog entry.


### Inventory correction before ORG-T18

The declaration scanner now excludes member calls named test, it or describe after Bun transpilation. The measured
baseline after ORG-T17 is 2,604 literal suite/test declarations; the earlier 2,614 inventory included ten false positives
(one selector-fixture path and nine terminal screen-matching strings). No real declaration was removed or added. Both
sides of subsequent comparisons use the corrected scanner. Earlier task counts remain their recorded measurements,
made consistently with the preceding scanner on both sides. Regression inputs are added inside the existing quoted
fixture test; the old scanner fails them and the corrected scanner passes all eight migration tests.


### Literal-content correction before ORG-T8

A split exposed another inventory limitation: quotes in regex literals and nested templates could hide later real
calls. Declaration scans now use the shared linear lexer to mask those contents, preserving positions and recovering
the original title text. Default comment/path scanning is unchanged. The corrected post-T18 baseline has 3,566 literal
suite/test declarations across 126 files. An independent TypeScript-grammar tree walk agrees on every declaration,
including multiplicity; the earlier regex-based counts remain historical measurements made consistently on both sides.
Regression inputs inside the existing fixture test cover quote-bearing regexes, nested templates/comments and template
titles. The quote-bearing-regex case fails before the repair; the eight migration tests pass afterward. No dependency
or product-code change is required. Subsequent split checks use this version on both sides and separately account for
duplicated parent-suite wrappers while preserving all leaf identities and callbacks.

The corrected inventory also closes the earlier evidence gap: clean archives of the T1 squash and ORG-T18 have 3,562
and 3,566 declarations respectively, with none removed and exactly four added. Earlier whole-inventory claims covered
the narrower scanner's subset; the complete comparison now confirms the expected additions only:

- ORG-T12: `package test and documentation runners retain the shared unit fallback`.
- ORG-T12: `Bun file-local timeout sites stay named; update this map when a file moves`.
- ORG-T13: `shared trash and marker operations reject reverse mutation imports in every form`.
- ORG-T13: `the real shared mutation module stays below orchestration`.

The additional same-line postfix-increment/decrement division fixture fails before its two-character guard and passes
afterward. TSX closing tags are lowered by Bun before inventory scanning and are covered explicitly. Computed names and
runtime expansion still require review; an unterminated template is masked to the end rather than inventing later
calls. Default comment/path mode retains its prior behavior.

### Inventory provenance after D266

The numeric inventory totals in the original task verification records and manifests were measured before D266 was
inserted into the PR series. D266 adds two net declarations and renames three existing declarations; the corrected
scanner measures 3,562 at the T1 squash and 3,564 after D266. Keep those original measurements historical. Rebased
phase checks capture both sides with the same scanner and preserve the exact multiset except each phase's recorded
guards or parent-suite wrappers; per-owner test and assertion inventories retain their original measurement context.
