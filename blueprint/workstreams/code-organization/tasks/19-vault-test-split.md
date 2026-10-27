---
status: review
assignee:
blocked_by: [ORG-T8]
created: "2026-10-26"
---

# ORG-T19: Vault test split

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Split vault.test.ts by behavior: vault/walk, links/graph, mutations, search/git and CLI integration. Preserve
environment/trust fixtures and scenario identities.

### Issue coverage and ownership

Mirror workspace functional groups. Assess shared filesystem/process fixtures while preserving trust and XDG lifetime.
Keep each scenario and assertion visible; record setup clone dispositions for ORG-T40.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.


## Implementation and verification (2026-10-27)

Baseline: ORG-T8. The [split manifest](../manifests/t19.json) maps the old vault collection to 77 feature files with
per-file case/assertion counts and exact historical references. Workspace vault/walk, graph/links, mutations, search and
Git behavior stays with its owner; CLI contract/reading/spelling cases use tests/cli. Home's large collection is
separated by filter, persistence/retry, limits, reached folders, links, moves and watcher behavior. Plans' write-policy
and link-move cases are separate. No product, worker, build-entry, asset or shipped-text change is introduced.

- All 421 literal leaf calls keep their full parent/title identity and normalized body, including assertions. The raw
  baseline has 3,582 declarations; 32 explicit duplicated parent-suite wrappers make the expected split 3,614. Every
  wrapper delta is named in the manifest; no leaf identity is added, deleted or renamed. A separate expected snapshot
  appends only these wrappers to the untouched baseline for the public migration check, which preserves all 1,955
  source/script edges, runtime worker edges and build entries. There are no vault snapshots to move.
- Before: `bun test tests/vault.test.ts` passes 421 tests, 3,445 assertions. After: each new owner file in its own Bun
  process passes a total of 421 tests and 3,445 assertions. The combined 77-file single-process run also passes the same
  421 tests and 3,445 assertions. Runs use fresh marker-free `/var/tmp` fixture parents with `NO_COLOR` unset. No
  intermittent failure occurred; no assertion, timeout or scenario was weakened.
- The vault sandbox keeps its original XDG state/cache/config/data setup, config override removal and file clipboard.
  Cleanup stays owned by the run preload; no core-style afterAll or trust reset is added. CLI capture retains the same
  streams, input, environment override, default fixture-vault cwd and output shape. Home-walk stamp helpers are moved
  intact. These modules register no test hooks or assertion loops and import no App/model harness.
- The 37 unused helper declarations copied into split review/home/plan fragments are explicitly listed. Remaining shared
  preambles are unchanged; attached comments leave with removed helpers. Imports are narrowed using actual runtime and
  type references, then typechecked. The largest new file is 878 lines, below the 1,000-line aim. For ORG-T40, retain
  the distinct core/vault/TUI setup policies; their cleanup and trust lifetimes differ.
- All 77 owners keep their file-local UNIT_TIMEOUT_MS calls; the existing guard map follows the new paths and passes
  2/2. Intentional spelling fixtures retain paired typos markers. The earlier core marker pair was corrected in T8,
  before this phase, and its complete tracked-file docs gate passes. Staging all new T19 files before check:docs also
  passes, covering all 1,149 tracked files in its spelling input.
- D239 probes discover all 77 nested files. Vault setup selects all 77 owners, CLI capture selects its 14 users and
  home-stamp support selects its four users. The spelling worker selects the deep CLI spelling owner, and the walk
  worker still selects its existing client suite. Unknown non-code paths retain the broad fallback. The two existing
  distribution graph/selector cases pass; no source rule or conservative fallback was narrowed artificially.
- The exact historical allowlist and retired basename cover only blueprint evidence. Full paths, bare filenames,
  template-built imports and split path segments were checked; module-relative fixture/example/source paths retain their
  targets. Source and terminal-harness behavior is unchanged, so T18's worker/compiled/terminal evidence applies to the
  identical product tree. The moving-links and launcher comments now name the feature owners.
- Typecheck, boundary, size, docs, changed-file Biome and direct Markdown checks pass. No whole-suite or all-terminal
  run was made. Local raw captures, wrapper expectations, per-file/combined logs and body audits retain the commands'
  output; the manifest and counts above are the durable verification record.
