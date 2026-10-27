---
status: review
assignee:
blocked_by: [ORG-T18]
created: "2026-10-26"
---

# ORG-T8: Core test split

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Split core.test.ts by feature into tests/core areas with unchanged assertions and hooks. Move only its required support
into focused modules. Vault and TUI suites have separate PRs.

### Issue coverage and ownership

Mirror core functional groups in test paths. Assess shared fixture clones using matching setup/cleanup semantics;
preserve assertions and keep pure support independent of App. Record dispositions for ORG-T40.

## Evidence required

Enumerate and compare identities/counts before/after each migrated group; run those groups unchanged. Test selector
nested-file/helper/worker discovery and retained conservative fallback.


## Implementation and verification (2026-10-27)

Baseline: ORG-T18 plus the separate literal-content inventory repair. The [split manifest](../manifests/t8.json) maps
core.test.ts to 54 feature files (52 core, one organization boundary file, one pure TUI matching file), with exact
per-file case/assertion counts, 34 retained historical references and the retired basename. No product module, worker
URL, package entry, asset or shipped text changes. New files stay below the 1,000-line aim; the largest is 607 lines.

- The corrected baseline has 3,566 declarations and the split 3,582: the only delta is sixteen additional describe
  wrappers, listed individually in the manifest. They preserve each original parent title while mixed historical review
  suites follow their scenario owner. All 292 literal leaf calls retain their complete parent/title identity and
  normalized callback body, including assertions. Every shared suite preamble matches after accounting for ten
  explicitly recorded unused helper declarations dropped from cloned fragments. No assertions or tests were added,
  removed, renamed or shortened; there are no core snapshots to move. The retained find/replace source-label title is
  unchanged; any identity rename is deferred to a separate approved change.
- `bun test tests/core.test.ts` before the split passes 313 tests and 61,112 assertions. Running each of the 54 new
  files in its own Bun process passes the same 313 tests and 61,112 assertions; runtime-expanded cases are retained.
  Owner controls use fresh marker-free `/var/tmp` temporary parents with `NO_COLOR` unset. Import cleanup briefly
  removed a required newParseCache binding; typecheck and the focused file caught it, it was restored, and all final
  owner counts match. This was an introduced preparation error, not an intermittent baseline failure.
- tests/support/core-sandbox.ts carries the original-equivalent XDG/clipboard policy, file-local cleanup callback and
  per-test trust reset. It registers nothing until each owner file calls it, so cached module evaluation cannot attach
  cleanup only to the first file. A width/trust two-file run passes as a shared-process lifetime control. All owner
  files retain their own setDefaultTimeout(UNIT_TIMEOUT_MS), and the existing timeout guard's expected map follows all
  54 paths without changing its title or assertions. The timeout guard passes 2/2.
- Fixture disposition for ORG-T40: share the matching core setup within this split; retain vault and TUI setup until
  their owner phases assess policy/lifetime differences. Pure support imports no App or model harness. Required local
  fixture/scenario helpers stay with their owners; no assertion runner or residual mixed-review collection remains.
- The migration check uses an untouched corrected baseline capture and a separate expected-wrapper snapshot: copy the
  baseline and append only each manifest suiteWrapperDeltas entry before comparison. The public gate then preserves all
  1,955 source/script edges, runtime worker edges and package entries, and exactly the declared wrapper delta. The raw
  baseline is retained locally; no expected leaf identity is edited. Full paths, bare names, template-built imports and
  split path segments were reviewed. The historical allowlist is explicit and limited to blueprint.
- D239 probes discover all 54 nested files; changing core replace selects its new owner, changing core-sandbox selects
  all 54 users, and the parse-worker selects its threaded owner. An unknown non-code path retains the broad fallback.
  The existing two distribution import/scope fixtures pass. Actual selected counts (39 for replace, 54 for the helper,
  39 for parse-worker) retain real integration dependencies; this phase claims no timing or scope speedup.
- Typecheck, boundary, size, docs, changed-file Biome and direct Markdown checks pass. No source or terminal-harness
  module changed, so ORG-T18's compiled/worker and terminal controls remain evidence for the identical product tree. No
  whole-suite or all-terminal run was made. Individual command logs and the independent AST/body audit are kept in the
  local review record; the manifest and counts above are the durable verification record.


An independent check confirmed declarations, moved bodies, the eleven module-relative paths, sandbox registration and
timeout guards; the combined shared-process run of the split owners and organization fixtures passes 332 tests with
61,206 assertions across 60 files. The duplicated timeout-policy prose is replaced by a short pointer to the central
policy; the file-local calls are unchanged.


Spelling fixtures keep their paired typos-off/on markers in the owner file. The docs gate is run with the complete
split staged so its tracked-file spelling scan includes every new file; the intentionally misspelled inputs and all
assertions are unchanged.
