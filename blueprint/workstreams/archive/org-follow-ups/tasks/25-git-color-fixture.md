---
status: done
assignee:
blocked_by: [ORF-T24]
created: "2026-11-01"
---

# ORF-T25: Isolate Git-mark colors from the shell

Issue item 4, fixture isolation; a separate test-only prerequisite to resuming ORF-T3.

## Scope

Isolate the Git-panel branch-file color scenario in `tests/tui/workspace/git/panel/input.test.ts` from inherited
NO_COLOR. Preserve its title, assertions and time limits. Add a controlled nonempty, empty and absent setting
regression that checks restoration. Product behavior and shared fixture helpers stay unchanged.

The retained ORF-T3 completion batch fails at `input.test.ts:178`: expected the git_new foreground (undefined),
received `default`. App deliberately selects mono for nonempty NO_COLOR (`src/tui/app/runtime/app.ts:657`).
The invoking unrestricted shell has that setting present/nonempty; both source and fixture match dev. Preserve that
failed batch without retrying it. Fix this fixture separately under the standing host-isolation rule.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery). Observe the controlled regression fail once with
only the isolation fix removed, restore it exactly, then run the affected owner, static/docs and applicable terminal
checks. Whole bun run check commands have a 900-second external bound; focused batches retain 300 seconds, both with
10-second kill grace. Test, product, terminal and CI deadlines remain unchanged.

Branch: `refactor/issue-170-git-color-fixture`, from origin/dev at
`5dd078a231321e40e2c0e648676704305d14a729`. Carry ORF-T24's completion record unchanged. ORF-T3 remains local,
unpushed at `47a324dc`, with its completed source/compiled probes and scoped failure ledger preserved.

Build, fresh review and merge are complete, including this prerequisite's successful automatic dev push.
The saved ORF-T3 extraction and its scoped verification/publication resume next; its historical combined scoped
result retains the fixture failure separately fixed here.


## Implementation and controlled regression

The original color scenario body moves byte-for-byte to the test-local branchFileColors function; its original
named test invokes that function. NO_COLOR is saved, cleared for the whole scenario and restored in finally.
One added regression invokes the same scenario with nonempty, empty and absent settings and checks restoration.
Other scenarios retain their setup. The shared Git-panel helper, App and all product source are unchanged.

Whole-file reversal reconstructs the base byte-for-byte after removing only the helper, new registration and added
regression. All nine original suite/leaf declarations preserve text and order, with one added. The carried ORF-T24
completion record matches its saved artifact exactly.

Removing only the helper's NO_COLOR deletion once makes the controlled regression fail at the original color
assertion: expected undefined, received default (three assertions, exit one). The fixed file is restored exactly.
Under inherited NO_COLOR=1, the original scenario and regression pass: two tests, 23 assertions, zero failures
(391 milliseconds). The unrelated failed ORF-T3 batch is retained without retry.

Logs: `tmp/issue/ORF-T25-negative.log`, `ORF-T25-fixed.log` and `ORF-T25-body-audit.txt`.

## Scoped verification and delivery

`NO_COLOR=1 gnutimeout -k 10 900 bun run check` passes typecheck, boundary, size, dependency/workflow gates,
Biome and docs, then the sole reached unit owner: nine tests, 68 assertions, zero failures (772 milliseconds).
The seven handwritten source caps, one generated cap and nine legacy test caps are unchanged.

The scoped terminal selector reaches no checks. The explicit Git-panel opening scenario passes one check,
four commands, two jobs (0.7 seconds). No full suite or all-terminal run; no product deadline changes.
Evidence: `tmp/issue/ORF-T25-check.log`, `ORF-T25-terminal-scope.log` and `ORF-T25-terminal.log`.

The common delivery design now distinguishes the whole check's 900-second outer wrapper from focused batches'
300-second wrapper, both with ten-second kill grace. Test/product/terminal/CI deadlines remain unchanged. This is
an observation bound for scoped verification, not a change to application or test behavior.

The preceding dev push at the exact base succeeds on attempt one; repository health last ran 2026-10-26, within
eight days. Six changed files: this test owner, task and task index, resolver prerequisite, carried ORF-T24 completion
and the common outer-wrapper policy. No user behavior, user documentation, changelog, dependency or CI change.
The staged-task documentation gate passes: 480 Markdown files, 1,739 spelt files, zero link errors.

## PR delivery, review and merge

[PR #178](https://github.com/remziduzagac/slipbox/pull/178) merged into dev at
`f0bd367acd2ddd6573e8664c77f3b39960209136`, 2026-10-31 23:15:20 UTC. Implementation commit:
`00e354644c1c7f047999a99887ae46ec8d30f493`; reviewed head:
`386ebd38e6270e0f8c28b71bf8159a8c4799a958`. Product source and shared helpers remain unchanged.

Fresh review finds no actionable findings. Its independent whole-file audit reconstructs the base byte-for-byte
after reversing only the documented helper, registration and added regression. All nine original suite/leaf
declarations retain text and order, with one added. Fresh scoped verification under NO_COLOR=1 passes every
static/docs gate and all nine affected-owner tests, 68 assertions, zero failures (798 milliseconds). The explicit
Git-panel terminal scenario passes one check, four commands, two jobs (0.8 seconds). Documentation includes
480 Markdown and 1,739 spelt files, with zero link errors. The negative control and unrelated failed batch are retained.

Before merge, the preceding [dev push](https://github.com/remziduzagac/slipbox/actions/runs/41249000773) succeeds at
the exact base `5dd078a231321e40e2c0e648676704305d14a729`, attempt 1. All executed PR CI and CodeQL checks succeed
at the reviewed head, also on attempt 1. Marked ready and squash-merged with that exact head as the match guard;
the merged tree is byte-identical to the reviewed tree.

The automatic [dev push](https://github.com/remziduzagac/slipbox/actions/runs/41251747777) succeeds at the exact
merge commit on attempt 1: both reached-unit platforms, lint/site, changes and aggregate CI pass. Terminal/status
jobs are skipped for this test-only scope; no terminal execution is claimed for the push.

Evidence: `tmp/issue/review-ORF-T25.md`, `ORF-T25-review-body-audit.txt`, `ORF-T25-review-check.log`,
`ORF-T25-review-terminal.log`, `ORF-T25-merge-pr-final.json`, `ORF-T25-merge-previous-dev-result.json`,
`ORF-T25-merge-result.json`, `ORF-T25-merge-dev-result.json` and `ORF-T25-merge-completion-audit.txt`.

The resolver checkpoint remains local and unpushed at `47a324dc3e4867409aa15211520583f5f40c4b7a` on
`refactor/issue-170-resolver`. Next, rebase that extraction onto newest dev, retain its completion records, probes and
combined scoped ledger, then resume verification/publication. ORF-T3 is not complete. No unrelated failed batch retry,
full suite, all-terminal run, branch promotion or release is included.
