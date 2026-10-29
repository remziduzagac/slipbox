---
status: done
assignee:
blocked_by: [ORG-T9]
created: "2026-10-26"
---

# ORG-T23: CLI test boundaries

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Organize CLI suites by area, test handlers directly where appropriate, and retain a small launcher suite covering
dispatch, arguments, exit/error behavior and dynamic TUI boundary.

### Issue coverage and ownership

Assess CLI dispatch responsibilities from the size ledger while preserving launcher coverage and exit/error contracts.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.

Split compound CLI export scenarios where independent outcomes permit it, retaining every assertion and intentional
end-to-end sequence. Distinguish the aggregate test budget from each child's 20-second deadline; use T12's named
existing budgets unchanged. Coordinate CIW-T9 and record focused before/after runs.

## Implementation and verification (2026-10-28)

Baseline: the merged ORG-T9 batch and switcher-fixture repair. The [manifest](../manifests/t23.json) assigns all original
CLI process scenarios to 35 command-area owners and adds three reading-handler characterizations in one focused owner.
The launcher owners cover dispatch/flags, exit/error envelopes, terminal refusal, the installed launcher and compiled
entry. `tests/support/cli-process.ts` registers the original demo-copy, child environment and cleanup hooks per file.
It keeps XDG, config, file clipboard and the configured harmless editor; it adds no process-wide environment mutation.

- All 115 unaffected leaf callbacks retain complete parent/title identities and normalized executable bodies. Every
  original assertion expression is preserved. There are no snapshots. The two export aggregate titles become parent
  suites: Word has five cases; PDF, HTML, EPUB and Markdown have four. Default/earlier-export replacement,
  foreign-file refusal/force/replacement and Markdown publication/replacement each remain intentional sequences. An
  independent Word destination fixture creates its output directory explicitly, without relying on another test.
- The old per-file command-run assertion becomes a cross-owner process-scenario catalog guard. It parses TypeScript
  with the already installed tree-sitter packages, accepting actual literal `slipbox` call sites and excluding comments
  and fixture strings. It also rejects parse errors and releases parser/tree resources. Removing the executable
  merge-review scenarios while adding fake calls in a comment and a quoted fixture makes the guard fail; restoring
  them passes. Directory-based graph discovery selects the guard when any CLI owner changes. This guard checks literal first-array
  elements, not execution or reachability; flag-first calls contribute a flag rather than a command, and arbitrary
  unreachable code remains a static-analysis limit. Completed owner runs establish execution separately.
- The exact declaration inventory changes from 3,744 to 3,799: 42 duplicated historical parent wrappers, two export
  parent suites, the documented export leaf/title changes, one renamed catalog guard and three new handler tests with
  their parent suite. `declarationDeltas` lists every multiplicity change. No other title or body changes. The real
  reading handlers use an isolated Session and characterize saved text/hash, heading lines/human output and typed
  not-found refusal. Their graph closure is 84 files versus 344 for the process-reading owner, counting graph nodes
  with `scripts/ci-scope.ts` importGraph/reach. It contains neither main, CLI dispatch nor any TUI module.
- Clean source archives with temporary homes: the original suite passes 118 tests/1,272 assertions in 101.72 seconds;
  the 36 final owners together pass 128 tests/1,325 assertions in 104.28 seconds, and each file in its own
  Bun process totals the same 128 tests/1,325 assertions. The ten additional runtime tests are
  seven independent export outcomes and the three handler cases. Assertion totals include the new handler and
  parse-validity assertions; the expression audit establishes preservation separately. These are measurements on this
  host, not a speedup claim. The original slowest case is skill-command integration at 13.50 seconds; no budget grows.
- The linked-worktree baseline and initial split both reproduce the same two environmental failures: the stat case
  expects plain halden but the checkout labels it with the current branch; uninstall's empty-list case sees skills
  installed in the real home. Clean archives and temporary homes remove both conditions without uninstalling anything
  or changing either assertion. No intermittent failure occurred. NO_COLOR is unset before Bun starts; each CLI child
  retains the original NO_COLOR=1. TERM/COLORTERM remain inherited; FORCE_COLOR is unset. The process-based tests still
  have a 20,000 ms child deadline, separate from UNIT_TIMEOUT_MS=30,000 and the unchanged skill/compiled named budgets.
- All 2,010 static and 1,637 runtime source/script edges and build entries are unchanged, with no unresolved paths.
  The largest scenario owner is 301 lines. Import, module-relative fixture/example/install/build paths, split segments
  and retired-basename references are checked; 29 historical blueprint references have exact retained entries. Rendered,
  compared and written fixture data stays byte-identical. No source, worker URL, asset or shipped installer/skill
  changes. The relocated compiled case builds and checks isolated startup, SQLite and the spelling worker on both
  archives. Product-tree behavior and deadlines are unchanged.
- CLI reading/writing changes preserve their empty terminal selector; reading reaches the direct handler owner and
  sandbox changes reach all 35 process owners. Unknown paths retain conservative fallback. The timeout map names the
  new file-local default sites. The import-graph/selector fixtures, timeout guard and terminal coverage pass together
  (14 tests, 44 assertions); the redesigned catalog/export and handler cases pass 22 tests/233 assertions. Typecheck,
  boundary, size, full Biome and tracked-file documentation checks pass. CIW-T9 records the coordination: CI timing
  reports and file-level budgets remain its separate work. No screen implementation changes or terminal-check behavior
  changes, whole-suite runs or all-terminal runs are included.

### CLI dispatch assessment

`src/cli/cli.ts` remains 609 lines: the public help/catalog and argument tables plus validation, Session construction,
dispatch and result/error presentation. The area handlers already live separately. Retain that cohesive dispatcher in
this test-boundary task; the direct reading tests prove handler behavior without adding a new execution layer. T39 owns
any justified shared adapter/result extraction, and T11 owns the final measured size disposition. No arbitrary line-count
split or blanket App/launcher exclusion is used to reduce reported scope.
