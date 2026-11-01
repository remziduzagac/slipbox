---
status: done
assignee:
blocked_by: [ORF-T14]
created: "2026-10-31"
---

# ORF-T15: Split vault terminal checks

Issue item 2; ORG-T11 terminal ledger.

## Scope

Split tests/terminal/checks/vaults.ts by feature, preserving check names, assertions, setup/cleanup and registration.
Remove its cap at or below 1,500 lines.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.

## Build plan and move manifest

Branch: `refactor/issue-170-vault-checks`, from `origin/dev` at
`81a3346937d5480a3aa6b643ef208602bcc6d04d`. The saved ORF-T14 completion record is carried with this PR.

The [move manifest](../manifests/t15.json) records paths and entry points before extraction. Use `git mv` to move
this collection to `checks/home.ts`, retaining HOME. Extract switch choices to `vaults.ts`, first-walk watching to
`home-watching.ts`, and the existing groups to `elsewhere.ts`, `explorer-marks.ts` (view and marks), `symlinks.ts`,
`vault-peek.ts` and `repositories.ts`. Move shared fixtures and screen helpers to `tests/terminal/support/vaults.ts`;
its three existing external consumers import that owner directly. Register each collection in the original flattened
order and remove the old exact 2,533-line cap. Split owners aim below 1,000 lines, with the 1,500 ceiling unchanged.

Preserve names, areas, coverage, assertions, setup/cleanup, fixture strings and deadlines. Compare sorted check names
and the ordered registry, then run the original collection before and after with `SLIPBOX_TERMINAL_JOBS=2` and
`TMPDIR=/var/tmp` outside the sandbox. Compare the terminal coverage owner's names and pass count too. Record rename
review, stale-reference check, cap removal and testing ownership; run the required scoped gates before opening the
draft PR (ORG-D1, ORG-D2; ORG-T11; ORF-R3).

## Baseline

The collection registers 52 checks within the complete 552-check registry; no snapshots belong to it. The original
terminal run passes all 51 runnable checks with one existing #73 quarantine skipped, using two jobs and
`TMPDIR=/var/tmp` outside the sandbox. The terminal coverage owner passes 10 tests / 17 assertions.
Logs: `tmp/issue/ORF-T15-terminal-before.log` and `ORF-T15-unit-before.log`; names and ordered registration:
`ORF-T15-check-names-before.json` and `ORF-T15-registration-before.json`.

## Extraction and verification

All 52 sorted check names and all 552 ordered registry entries retain their names, areas and coverage. No snapshots
belong to this collection. Before and after runs both pass 51 runnable checks, with the same #73 quarantine skipped,
using two jobs outside the sandbox with `TMPDIR=/var/tmp`. Both runs exercise 38 commands. The terminal coverage
owner retains all 10 test names and passes 10 tests / 17 assertions on each side.
Logs: `tmp/issue/ORF-T15-identities.log`, `ORF-T15-terminal-before.log`, `ORF-T15-terminal-after.log`,
`ORF-T15-unit-before.log` and `ORF-T15-unit-after.log`.

| Owner under tests/terminal/ | Lines |
| --- | ---: |
| `checks/vaults.ts` | 44 |
| `checks/home.ts` | 947 |
| `checks/home-watching.ts` | 213 |
| `checks/elsewhere.ts` | 184 |
| `checks/explorer-marks.ts` | 288 |
| `checks/symlinks.ts` | 615 |
| `checks/vault-peek.ts` | 30 |
| `checks/repositories.ts` | 49 |
| `support/vaults.ts` | 216 |

The exact vaults cap is removed; size passes with three remaining legacy test caps. `git mv` was used before
extracting the children and recreating the small switch-check owner at the original path. Default rename review shows
that path modified and the children added; `git diff -B -M20% --summary HEAD` recognizes the home extraction as a 38%
copy and the original path as a 98% rewrite. The manifest accounts for every child. Existing helper consumers change
only their import paths. The stale-reference scan finds only valid switch-check registration/selector references to
the original path; historical ORG manifests retain their original collection paths.
Logs: `ORF-T15-move.diff`, `ORF-T15-move-summary.log` and `ORF-T15-stale-references.log`.

Typecheck, lint, boundary, size and docs pass individually. The required bounded scoped gate,
`TMPDIR=/var/tmp gnutimeout -k 10 900 bun run check`, passes all gates and 22 tests / 71 assertions across four
reached owners. Its conservative terminal selection is all; the local terminal comparison explicitly runs only the
original 52 checks. Log: `tmp/issue/ORF-T15-check.log`.

## Build delivery

[PR #194](https://github.com/remziduzagac/slipbox/pull/194) is a draft into `dev`, on
`refactor/issue-170-vault-checks`. Implementation/evidence commit:
`8917d2f8b2d8532566ff4d5ad09fe42f1617ee70`. The passing results above are local; final-head CI is pending.
Fresh review and merge remain separate stages; this task stays in review until both are complete.

## Fresh review correction

Review of `e5435a18486fd5ae0bb4f2ca4d04e9d8ba88523f` found one selection regression: `CHECK_FILES.vaults`
now holds only the switch check, while vault switching and rename source mappings still used that collection name.
Vault switching selected 69 checks instead of 88, losing 19; renames selected 47 instead of 94, losing 47.

Both mappings now include all eight split owners. No earlier check is lost; the runner's existing name matching also
includes two additional checks for vault switching and fifteen for renames. The coverage guard recognizes valid file
selectors as well as name pieces. Two new regression cases exercise source scope through the runner's actual list;
both pass and both fail with just the mapping fix undone, before restoration. The original ten coverage test names
are retained. Logs: `tmp/issue/ORF-T15-review-selectors-before.log`, `ORF-T15-review-selectors-after.log`,
`ORF-T15-review-regression.log` and `ORF-T15-review-negative.log`.

The manifest, move review, stale references, cap removal and testing ownership are consistent with the split. All
52 original check names and 552 ordered registry entries still match. The affected terminal collection passes all
51 runnable checks with the existing #73 skip and 38 commands exercised, using two jobs outside the sandbox.
Size and diff whitespace checks pass. Logs: `tmp/issue/ORF-T15-review-terminal.log` and `ORF-T15-review-size.log`.

The required bounded scoped gate passes all gates and 109 tests / 2,546 assertions across eight reached owners.
Coverage now passes 12 tests / 127 assertions, including the two new regression cases. Log:
`tmp/issue/ORF-T15-review-check.log`. No actionable finding remains after the correction; merge is a separate stage.

## Review and merge

The fresh review found one source-selection regression, corrected in
`4521429d3bc4828df71fb44613159418acce258e` with two regression cases that fail with the mapping fix undone.
No actionable finding remains. Both unit platforms, aggregate CI and CodeQL pass at that exact head. The preceding
`dev` push run, 41322204637, also passes, including all three terminal platforms.

[PR #194](https://github.com/remziduzagac/slipbox/pull/194) was marked ready and squash-merged into `dev` on
2026-11-01 as `9bee02b88a87fe427811216691728aa99a4efbf2`. The automatic
[dev push run](https://github.com/remziduzagac/slipbox/actions/runs/41327187225) passes, including both unit
platforms, all three terminal platforms, lint, site and aggregate CI.
