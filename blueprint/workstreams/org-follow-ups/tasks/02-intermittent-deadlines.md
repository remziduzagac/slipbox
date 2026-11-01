---
status: done
assignee:
blocked_by: [ORF-T21]
created: "2026-10-31"
---

# ORF-T2: Investigate intermittent deadlines

Issue item 4; follows ORF-T21's separate uninstall fixture isolation after ORF-T1.

## Scope

With the overflow noise removed, investigate the macOS Git locale/output-bound 30-second failure, the CLI-search
deadline and ORG-T12/T43 shared-process observations. Record controls and ruled-out causes. Fix a demonstrated cause
with a failing regression; otherwise retain the unexplained finding explicitly. Raise no limit and retry away no
failure.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.

## Investigation plan

Branch: `refactor/issue-170-deadlines`, from `origin/dev` at
`3e92e8a72109b9e79f02e51c517b59cc9955fd44`. The preceding ORF-T21 dev push passes on attempt 1.
[PR #174](https://github.com/remziduzagac/slipbox/pull/174) merged into dev on 2026-10-31 as
`19be598d2cbc783455e728484dc2fe7a8d72bbe8`, from reviewed head
`44d736c015d48174d8832843bb37c5fa0d9b8fd9`.

Read the original macOS Git failure and CLI-search partial sample before running controls. Trace the two fixtures
and their process/output/cleanup ownership; compare isolated and bounded shared execution after ORF-T1. Separate
clock rollback, fixture environment leakage, temporary-directory lifetime and output-drain hypotheses. A demonstrated
cause gets a deterministic regression and one undone-fix control; unproved causes remain explicit. Preserve all
existing deadlines and CI policy. The two carried task edits record ORF-T1/T21 completion only.

## Outcome

Both historical deadline causes remain unproved. The post-ORF-T1 isolated and bounded shared controls pass without
overflow warnings. This is an evidence-only change: no product, fixture, timeout, dependency or CI edit, and no new
behavior requiring user documentation, a changelog entry or an undone-fix regression. Passing controls do not close
either intermittent failure. ORF-R2 permits retaining these findings with the evidence below.

## Original failures

### macOS Git locale and output bound

The original [ORG-T42 dev run, attempt 1](https://github.com/remziduzagac/slipbox/actions/runs/40922496255/attempts/1),
at `7044998b1a77a98696bc64d73a5ef4caa0f52eff`, fails the locale/output-bound test at 30,000.16 ms. The preserved
`tmp/issue/ORF-T2-original-t42-dev-failed.log:50056` names it. Warnings begin at line 4883, before this owner opens
at line 11708; 19,172 overflow warnings appear between that opening and the timeout, 28,983 across the log.
The following nine Git scenarios fail too. The historical second attempt passed without a code change, as ORG-T43
records; no attempt or failed job was rerun here.

`tests/core/workspace/git/merge/operations.test.ts:155` combines locale/option checks with two 17,000,000-byte stdout
floods. `src/core/workspace/git/branches/gitremote.ts:296` and `gitrebase.ts:196` use 16 MiB output bounds and
120-second local process deadlines, distinct from the test's unchanged 30-second budget. The test replaces PATH,
LC_ALL and LANGUAGE at lines 179–203. Restoration is in the pending callback's finally block. A timeout while it is
pending could leave the fake Git selected for later cases: consistent with the next case returning null for
ahead/behind, but the original log captures neither PATH nor the pending command, so this is a hypothesis, not a
demonstrated cause. It does not explain the first timeout by itself.

ORF-T1 identifies the scheduler's clock rollback and fixes its overflow. The original macOS log establishes overlap
with that flood, not that the flood caused this deadline. The original Git test has no per-command trace, so locale
setup, child completion and output handling cannot be distinguished retrospectively. Linux controls below do not
establish macOS process behavior.

### CLI search's compound scenario

The original incomplete ORG-T43 regex sample is retained as
`tmp/issue/ORF-T2-original-t43-serial-before-regex-jobs-38.log:5`. The first scenario reaches its last `info` call,
receives empty stdout and fails at 30,031.11 ms, with a 30,000 ms timeout report and one dangling process killed.
The next two cases pass in 4.10 and 3.67 seconds. The partial sample is still excluded from passing/timing comparisons
in [ORG-T43's reconciliation record](../../archive/code-organization/manifests/t43-reconciliation.json).

`tests/cli/search/process.test.ts:12` makes five sequential CLI calls under one test deadline. Its helper at
`tests/support/cli-process.ts:50` gives each child a separate unchanged 20-second bound, captures stdout/stderr, and
returns its exit code; the failed human-output assertion preserves none of that child's stderr or exit status.
`src/cli/info.ts:28` reads the graph and search status before returning output. Empty stdout alone cannot identify a
scan, index lock, graph read, child timeout, startup failure or scheduling delay. There is no evidence that `info`
finished its work and merely stayed alive after writing.

This sample already uses one Bun process per owner, with private HOME/XDG/TMPDIR and zero overflow warnings. Shared
App timers and ORF-T21's uninstall discovery therefore cannot account for this observation. Comparing Bun summary
durations in the original partial regex sample and preceding completed export sample, on the same baseline, finds
97 common passing owners: 96 take at least twice as long, with a median ratio of 5.25. The preceding search owner
takes 1.469 seconds; the completed regex baseline later records 1.325 seconds externally. This broad slowdown is
consistent with a host/cache change, but neither sample captures host load or per-command spans. It is not a causal
measurement or a reason to raise a deadline. ORG-T43's earlier five passing controls per revision remain historical
observations, not a disposition of this failure; none was repeated here as a retry.

## Post-fix controls

All new controls use Bun 1.4.2, Git 2.51.0, Linux ARM64, the unchanged preload and sequential unrestricted execution.
Each command has an external 300-second bound and ten-second kill grace; test and product bounds stay
unchanged. No failed control or historical aggregate selection was repeated.

| Control | Result | Local log under tmp/issue/ |
| --- | --- | --- |
| Git merge/operations owner alone | 13 pass, 84 assertions, 0.636 s | `ORF-T2-git-isolated.log` |
| CLI search owner alone | 3 pass, 11 assertions, 1.308 s | `ORF-T2-search-isolated.log` |
| Five-owner shared clock/fixture group | 24 pass, 157 assertions, 2.17 s | `ORF-T2-shared-clocks.log` |
| Git locale/flood phase diagnostic | 1 pass, 9 assertions, 0.171 s | `ORF-T2-git-phases.log` |
| CLI first scenario with child timings | 1 pass, 8 assertions, 0.928 s | `ORF-T2-cli-timings.log` |

The isolated commands are `gnutimeout -k 10 300 bun test <owner>` for the two owners above. The shared command selects
those two plus `tests/tui/app/notifications/toasts.test.ts`, `tests/tui/shell/screen/messages.test.ts` and
`tests/core/workspace/graph/moves/reconcile.test.ts`. It exercises App clock replacement, global Date.now replacement
and restoration, notification expiry and Git/CLI fixtures in one Bun process. All 24 pass and no overflow warning
appears. This bounds the observation to these five owners; it does not prove all shared-process orderings safe.

The Git diagnostic copies the existing owner into an ignored temporary test, resolves its imports to the same
modules, and inserts monotonic phase timestamps in the original locale/flood case. All nine original assertions
remain. Locale/option probes complete at 12.70 ms, stash overflow at 36.03 ms and rebase overflow at 50.28 ms from
the first phase. Both floods return the expected output-bound refusal. That rules out an unconditional hang in
either output path on this host; it does not rule out the macOS intermittent case. The unmodified owner also passes
its following real Git operations in both isolated and shared controls.

The CLI diagnostic preloads a wrapper around Bun.spawnSync, preserving its arguments and result. For the five calls
in order, child durations are 191.94, 132.90, 138.91, 117.66 and 330.31 ms; all exit 0 with nonempty stdout and empty
stderr. The original eight assertions pass. This rules out an unconditional stall across that scan/index/read/info
sequence on this host. Temporary executable probe files are removed after execution; their text and logs remain in
the ignored evidence directory only. No tracked test or product file is instrumented.

## Fixture lifetime and retained findings

`tests/setup.ts:16` tests process liveness with signal 0 and removes apparently dead run directories at lines 27–30.
ORF-T1's separate diagnostic demonstrated that crossing sandbox PID namespaces can remove a live unrestricted run's
directory. ORF-T2 avoids that condition by running every test sequentially outside the sandbox; it is a distinct
local execution constraint, not evidence for the original macOS timeout or isolated CLI slowdown. No preload or
runner policy changes here. ORG-T12's ancestor-checkout, socket/shell/clipboard and external aggregate-expiry findings
remain separate from per-test deadlines, as its failure inventory requires.

Retain the macOS first timeout, its possible environment-restoration cascade, and the isolated CLI compound deadline
as unresolved. Before proposing a fix, capture the pending Git command and environment restoration on a new macOS
failure, or each CLI child's duration/exit/stderr and host load on a new search failure. No automatic retry, raised
budget, suppressed dynamic import or CI grouping change is justified by these controls. Product loading/memory work
under #56 and the later focused-scenario migration under ORF-T20 remain separate.

## Build verification

The unchanged timeout-policy owner passes two tests with five assertions, covering the package fallback and every
file-local budget site (`gnutimeout -k 10 300 bun test tests/organization/timeouts.test.ts`). The required
`gnutimeout -k 10 300 bun run check` passes typecheck, boundary, source/test sizes, dependency/workflow gates, Biome
and documentation checks: 476 Markdown files, 1,735 spelt files. Its unit selector reports documentation only, three
changed files, and skips product tests. The explicit controls above supply the investigation's executed test evidence.

`SLIPBOX_TERMINAL_JOBS=2 gnutimeout -k 10 300 bun run test:terminal:changed` succeeds with no terminal checks reached;
no terminal feature changes or execution are claimed. The seven source, one generated and nine test caps are unchanged.
Diff whitespace check passes. No source/test relocations, generated assets, snapshot refresh, full run, review or
merge is part of this build stage. The only other tracked edits are the carried ORF-T1/T21 completion records.

Local logs: `tmp/issue/ORF-T2-timeout-policy.log`, `ORF-T2-check.log` and `ORF-T2-terminal-scope.log`.

## Review and delivery

Fresh review at the merged PR head found no actionable findings. Its scoped check passes every static/docs gate;
documentation-only unit selection reaches no tests. The bounded six-owner shared control passes 26 tests with
162 assertions and zero overflow warnings (2.34 seconds). Terminal selection succeeds with no checks reached;
no terminal-feature execution is claimed. PR CI and CodeQL pass at the exact reviewed head. Historical failures and
diagnostic probes were inspected without repeating them. Both deadline causes and the possible Git
environment-restoration cascade remain explicitly unresolved.

The preceding [dev push](https://github.com/remziduzagac/slipbox/actions/runs/41239553858) at the base passes on its
first attempt: both reached-unit platforms, lint/site and aggregate CI; terminal jobs are skipped. Its successful
completion was verified before this merge. PR #174 was then marked ready and squash-merged with the reviewed head
matched exactly.

The automatic [dev push](https://github.com/remziduzagac/slipbox/actions/runs/41240966128) at
`19be598d2cbc783455e728484dc2fe7a8d72bbe8` passes on its first attempt: lint/site, scope selection and aggregate CI.
Unit, terminal and status jobs are skipped for this documentation-only scope; no product-test or terminal execution
is claimed for this push. ORF-T3 build is next; no failed job or selection was rerun.
