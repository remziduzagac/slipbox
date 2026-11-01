---
status: review
assignee:
blocked_by: [ORF-T13]
created: "2026-10-31"
---

# ORF-T14: Split link and file terminal checks

Issue item 2; ORG-T11 terminal ledger.

## Scope

Split tests/terminal/checks/links-and-files.ts by feature, preserving check names, assertions, setup/cleanup and
registration. Remove its cap at or below 1,500 lines.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.

## Build plan and move manifest

Branch: `refactor/issue-170-links-files-checks`, from `origin/dev` at
`332012335374f51e2ee306955d8af80acaa88b7c`. The saved ORF-T13 completion record is carried with this PR.

The [move manifest](../manifests/t14.json) records the paths and entry points before extraction. Move the tracked
collection with `git mv` to `checks/links.ts`, retaining its link checks. Extract the existing groups to `roots.ts`,
`named-folders.ts`, `files.ts` (files and renames), `git.ts`, `notes.ts` and `peek.ts`, beside it. Shared terminal
helpers move to `tests/terminal/support/links.ts`; their six existing check consumers import that owner.
Register each check file directly, in the original flattened order, and retain the empty area's left-out record.
Remove the old collection's exact 3,095-line cap. All split owners aim below 1,000 lines and remain below 1,500.

Preserve every check name, area, coverage declaration, assertion, options/setup/cleanup, fixture string and deadline.
Compare sorted check names and the full registration before/after, and run the original 76 checks with
`SLIPBOX_TERMINAL_JOBS=2` on each side. The existing terminal coverage tests verify direct file registration and
coverage. Review `git diff -M` and its summary, check stale executable paths, update the testing ownership design,
and run the required scoped gates before opening a draft PR into `dev` (ORG-D1, ORG-D2; ORG-T11; ORF-R3).

## Baseline execution environment

The sandbox terminal run is invalid: its read-only ancestor `.git` changes root discovery and prevents Git writes,
and listening sockets are refused. Its seven failures do not characterize the original checks. Preserve that log as
`tmp/issue/ORF-T14-terminal-sandbox-invalid.log`; run terminal checks outside that environment with two jobs.

The original collection registers 76 checks; the complete registry has 552. Sorted original check names and the
full ordered registry are saved locally as `tmp/issue/ORF-T14-check-names-before.json` and
`ORF-T14-registration-before.json`. The unchanged terminal coverage owner passes 10 tests / 17 assertions.
Log: `tmp/issue/ORF-T14-unit-before.log`.

## Extraction and verification checkpoint

The valid unrestricted baseline passes all 76 checks / 105 commands with two jobs. Its sorted check names match
the extracted owners exactly; all 552 registry entries retain their names, areas, coverage declarations and order.
No snapshots belong to this collection. The terminal coverage owner passes the same 10 tests / 17 assertions before
and after. Evidence: `tmp/issue/ORF-T14-identities.log`, `ORF-T14-terminal-before.log`,
`ORF-T14-unit-before.log` and `ORF-T14-unit-after.log`.

| Check owner | Lines |
| --- | ---: |
| `links.ts` | 602 |
| `roots.ts` | 547 |
| `named-folders.ts` | 264 |
| `files.ts` | 491 |
| `git.ts` | 740 |
| `notes.ts` | 213 |
| `peek.ts` | 162 |
| `../support/links.ts` | 100 |

The original cap is removed: `check:size` passes with four remaining legacy test caps, 577 source files and
609 test/fixture files. The six helper consumers change only their import path; their caps and line counts are
unchanged. Current executable/selector/build/fixture/design/doc references contain no stale old collection path.
Historical ORG manifests retain their original paths. `git mv` was used; default rename review shows the split
as additions/deletion, while `git diff -M20% --summary HEAD` recognizes the largest child (`git.ts`, 24%).
The complete manifest accounts for every child. Evidence: `ORF-T14-move.diff`, `ORF-T14-stale-references.log`.

Typecheck, lint, boundary, size and docs pass individually. The required unrestricted
`gnutimeout -k 10 900 bun run check` passes all gates and its scoped selection: 22 tests / 73 assertions / zero
failures across the size, terminal coverage, Git fixture and terminal runner owners. It selects all terminal checks
conservatively through the registry/helper; the terminal run below explicitly selects only the original 76 checks.
Logs: `tmp/issue/ORF-T14-check.log` and `ORF-T14-scope.log`.

The first unrestricted post-extraction run has 75 passes / one failure: Elsewhere startup names `/tmp` as its vault.
That result is invalidated by a known sandbox mount-point race. While a sandboxed command runs, its empty
`/tmp/.git` mount point temporarily exists on the host. `checkoutOf` (`src/core/workspace/git/git.ts:42`) accepts
that directory as a checkout, so a simultaneous unrestricted terminal process discovers `/tmp` as a vault.
A later host probe sees no marker because the mount point has already disappeared. Preserve the affected log as
`tmp/issue/ORF-T14-terminal-mount-race-invalid.log`; the failing scenario remains unchanged.

Run subsequent unrestricted tests with `TMPDIR` set to a dedicated parent outside `/tmp`, with no ancestor marker.
This isolates the validation environment; checkout discovery, fixture assertions and deadlines remain unchanged.
The final isolated scoped gate passes all gates and 22 tests / 73 assertions (`ORF-T14-check-isolated.log`).

The isolated terminal run has 75 passes / one failure: the unchanged worktree assertion requires its complete path,
but the longer temporary parent causes that path to be clipped in the popup. Its screen shows the worktree ending
in `kestrel-…`; list drawing caps the popup at 100 columns (`src/tui/shell/overlays/drawing/lists/list.ts:21`).
Log: `tmp/issue/ORF-T14-terminal-long-path-invalid.log:79`; the scenario object is unchanged
(`ORF-T14-worktree-failure-comparison.json`). A shorter marker-free temporary parent is needed to retain this
scenario's original setup and assertions. Use `/var/tmp` for this terminal run; other unrestricted tests keep their
isolated temporary parent. The final terminal run passes all 76 checks / 105 commands with two jobs in 122.1 seconds,
using `TMPDIR=/var/tmp`
outside the sandbox. The original and extracted owners therefore have the same 76-pass result. Log:
`tmp/issue/ORF-T14-terminal-after.log:79`. No check, product source, assertion or deadline changed to address the
environment failures. The final required scoped gate and draft publication are recorded below.

## Build delivery

All sorted check names and the complete ordered registry remain equal; the manifest, rename review, stale-reference
check and cap removal are complete. The final bounded scoped gate passes all gates and 22 tests / 73 assertions
across four reached owners, using an isolated temporary parent outside `/tmp`.
Log: `tmp/issue/ORF-T14-check-final.log`.

[PR #193](https://github.com/remziduzagac/slipbox/pull/193) is a draft into `dev`, on
`refactor/issue-170-links-files-checks`. Implementation/evidence commit:
`e249c35cad76797c8d5e912f611b838e5e8ed239`. Final-head CI is pending; the passing results above are local.
Fresh review and merge are separate stages; this task remains in review until they are complete.
