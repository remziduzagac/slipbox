---
status: done
assignee:
blocked_by: [ORF-T22]
created: "2026-11-01"
---

# ORF-T23: Isolate the autosave Git context

Issue item 4, fixture isolation; a separate test-only prerequisite to resuming ORF-T3.

## Scope

Create the autosave test's own Git context before constructing App in
`tests/tui/documents/saving/conflicts.test.ts`. Preserve its title, assertions and all existing time limits.
Add a controlled regression with `.git` in an ancestor directory, owned by the test's sandbox.

Trace whether a test in the shared selection creates `.git` directly in the temporary directory or the
run folder that `tests/setup.ts` installs as TMPDIR. Fix a demonstrated producer in this same test-only PR,
with a regression that fails without its isolation fix. Distinguish sandbox visibility from host observations;
do not change a shared temporary directory to hide the problem.

The existing [ORG finding](../../code-organization/design.md#focused-verification) records the ancestor-checkout
and cached-context interaction. Product source, shared harness behavior, deadlines, dependencies and CI stay unchanged.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery). Observe the controlled regression fail with the
fixture fix removed once, restore it exactly, and run affected owners and the applicable terminal checks.
Record the marker investigation, retained uncertainty, scoped/static checks and PR delivery here.

Branch: `refactor/issue-170-autosave-fixture`, from origin/dev at
`5254a04494a9f57176795353c3b170c1ea89626d`. Carry ORF-T22's completion record unchanged.
The resolver extraction stays local on its separate branch. Build, fresh review and merge remain separate stages;
confirm the fixture PR's dev push before resuming ORF-T3 verification and publication.

## Implementation and regression

The test-local `autosaveVault` creates `.git` before its fixture is passed to `setup` and App is constructed.
Only the original autosave case opts into this fixture. Its title, assertions, sleeps and comments remain
byte-identical after undoing that one added setup argument; other existing cases keep their ordinary fixture.

The new case moves its prepared vault beneath a private ancestor checkout, proves that ancestor is discoverable,
and checks App selected the local checkout. It exercises ordinary idle saving, deferral under the local index lock
while the ancestor is unlocked, and saving after the lock is removed. All directories belong to the existing
file-owned sandbox and cleanup. No shared harness, product behavior, source, deadline or cap changes.

Removing only the early `.git` creation once makes the controlled case fail: App selects the ancestor rather than
the local root. The fixed file is then restored byte-for-byte. The required scoped check passes all static gates
and the entire affected owner: 12 tests, 71 assertions, zero failures (1.351 seconds). The selector reaches no
terminal checks; an explicit autosave terminal scenario also passes, five commands, two jobs (5.7 seconds).

Logs: `tmp/issue/ORF-T23-negative.log`, `ORF-T23-body-audit.txt`, `ORF-T23-check.log` and `ORF-T23-terminal.log`.

## Temporary-root marker investigation

Unrestricted host inspection finds no `/tmp/.git`; sandbox inspection sees a read-only directory there. The earlier
sandbox observation therefore does not establish a marker on the host where the scoped tests ran.

Static searches cover temporary-directory variables and marker writes across tests, helpers and scripts. An initial
namespace-assignment probe fails before tests run. A default-export wrapper then executes 52 marker-related owners,
but its later named-import control fails: Bun's named bindings bypass it, so this is insufficient marker evidence.
A module-level replacement passes the named-import control. The corrected selection narrows to 37 explicit marker
writers, with a private named-import control executed afterward: 378 tests pass across 38 files, 3,313 assertions,
zero failures (64.95 seconds). The control records creation and removal with stacks; neither the run-folder marker
nor `/tmp/.git` is observed to change. The failed theme case is excluded from this separate writer diagnostic and
remains recorded below; this is not a passing rerun of the original 52-owner selection. Temporary executable probes
are removed after each diagnostic.

No test creating a persistent marker above the fixtures is demonstrated, so no producer fix is included. The exact
trigger in the earlier shared-run failure remains unproved; the controlled regression establishes the fixture's
independence from an ancestor checkout without claiming a fresh causal trace of that historical run.

The diagnostic selection is not a green verification: 484 tests pass and one fails (4,213 assertions, 80 seconds).
`tests/regressions.test.ts:333` expects `tokyo-night` but receives `mono` with inherited NO_COLOR. App explicitly
selects mono under that environment setting (`src/tui/app/runtime/app.ts:657`); this is separate from Git fixtures.
The failed diagnostic is preserved without retry. A separate test-only environment-isolation follow-up is queued;
it does not alter this PR's scoped passing result or broaden its implementation.

Evidence: `tmp/issue/ORF-T23-git-marker-sites.txt`, `ORF-T23-marker-owners.json`,
`ORF-T23-marker-selection.log`, `ORF-T23-marker-selection-traced.log`, `ORF-T23-marker-trace.jsonl` and
`ORF-T23-marker-module-{control,selection}.log`, `ORF-T23-marker-module-trace.jsonl`.
The trace's method and limits are retained; no whole suite or all-terminal run.

## PR delivery, review and merge

[PR #176](https://github.com/remziduzagac/slipbox/pull/176) merged into dev at
`e8662a7c59bac84b65dbf4fa42f218cffff4f5b1`, 2026-10-31 22:23:03 UTC. Implementation commit: `ac6c49bc`;
reviewed head: `171712f23c9f28d116ce1a1615e09224037d2b7b`. Source, shared helpers and all caps compare
unchanged to the base; the only test change is the autosave owner above.

Fresh review finds no actionable findings. Its whole-file audit reconstructs the base byte-for-byte after reversing
only the documented fixture changes and added case. Fresh required scoped verification passes every static/docs gate
and all 12 affected-owner tests, 71 assertions, zero failures (1.38 seconds); the explicit autosave terminal scenario
passes, one check, five commands, two jobs (5.8 seconds). Documentation includes 478 Markdown and 1,737 spelt files,
with zero link errors. The preserved negative control and unrelated failed diagnostic are not repeated.

Before merge, the preceding [dev push](https://github.com/remziduzagac/slipbox/actions/runs/41243296407) succeeds at
the exact base `5254a04494a9f57176795353c3b170c1ea89626d`, attempt 1. All executed PR CI and CodeQL checks succeed
at the reviewed head, also on attempt 1. Marked ready and squash-merged with that exact head as the match guard;
the merged tree is byte-identical to the reviewed tree.

The automatic [dev push](https://github.com/remziduzagac/slipbox/actions/runs/41247944044) succeeds at the exact
merge commit on attempt 1: both reached-unit platforms, lint/site, changes and aggregate CI pass. Terminal/status
jobs are skipped for this test-only scope; no terminal execution is claimed for the push.

Evidence: `tmp/issue/review-ORF-T23.md`, `ORF-T23-review-body-audit.txt`, `ORF-T23-review-check.log`,
`ORF-T23-review-terminal.log`, `ORF-T23-merge-pr-final.json`, `ORF-T23-merge-previous-dev-result.json`,
`ORF-T23-merge-result.json` and `ORF-T23-merge-dev-result.json`.

The separate theme-fixture isolation PR is next, before resumed ORF-T3 build. The resolver extraction remains saved
separately. The shared-run marker trigger remains unproved; no full run, branch promotion or release is included.
