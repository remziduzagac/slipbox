---
status: done
assignee:
blocked_by: []
created: "2026-10-31"
---

# ORF-T1: Fix the overflowing timer

Issue item 3; ORG-T12, ORG-T21 and ORG-T43.

## Scope

Trace the warning to its timer and distinguish a product defect from fixture or dependency behavior. Add a focused
regression, observe it fail with the fix removed once, then restore the fix. Preserve all deadline values. Record what
users experienced if product behavior changes, with matching design, user documentation and a Fixed CHANGELOG entry.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.

## Implementation and verification

Branch: `refactor/issue-170-timer`, from `origin/dev` at `2521e4b5`.
[PR #171](https://github.com/remziduzagac/slipbox/pull/171) merged into dev on 2026-10-31 as `3a83e20e`, from reviewed
head `7d8d76b81b5a2cc369a5b5446efd906855b5fab0`. The known unrelated check failure below has its own following task,
ORF-T21. The subsequent dev push run passes; see the delivery record below.

The overflow is in `src/tui/app/notifications/toasts.ts:30`: a toast drawn on the real clock can outlive a test's
replacement clock, and a wall clock corrected backwards has the same effect. Its future `shown` timestamp produces
an epoch-sized delay, which Bun clamps to one millisecond. The callback repeats the same arithmetic indefinitely.
A trace of the T21 feature-owner group locates it in the parent Bun process, correcting the earlier language-server
child attribution. The observed delay was 1,793,464,022,074 ms, with 28,690 warning lines.

The scheduler now restarts only a future-dated toast's normal lifetime at the corrected time. Simply clamping the delay
would retain that future timestamp and keep the message alive for years. Normal four/eight-second expiry, undrawn
messages, history timestamps, dismissal and the ten-millisecond floor remain covered.

`tests/tui/app/notifications/toasts.test.ts:83` exercises the pending callback after a backwards jump, both info/error
lifetimes, undrawn messages and history timestamps. The focused regression initially fails with 1,793,023,172,340 ms
instead of 4,000 ms. Removing the fix once reproduces that failure; restoring it passes all four scheduler tests
with 34 assertions.

Passing checks:

- `gnutimeout -k 10 300 bun test tests/tui/app/notifications/toasts.test.ts`
  plus `tests/tui/shell/screen/messages.test.ts`, `tests/tui/shell/screen/tab-strip.test.ts` and
  `tests/tui/documents/media/pictures.test.ts`: 59 tests, 503 assertions, no overflow warnings.
- `SLIPBOX_TERMINAL_JOBS=2 bun run test:terminal "info: the vault's info in its own window"`
  plus `"config: mistakes are warnings in the messages"`: both checks pass, eight commands exercised.
- Typecheck, Biome lint, boundary and size checks pass. No cap, deadline, dependency, worker or module path changes.
  Documentation checks include the plan, current design, screen manual and Fixed changelog entry.

The exploratory 121-owner run is excluded from passing verification: 634 pass, two skips, 49 fail and 35 errors. A concurrent
sandbox preload can remove the unrestricted run's temporary directory: `tests/setup.ts:16` treats a PID invisible in
its namespace as dead, and line 30 deletes its directory. A Git wait then fails and the remaining fixtures cascade
with ENOENT. That selection is not rerun or reported as green. Remaining focused tests run unrestricted, sequentially.
The separate four-owner clock/LSP probe passes 54 tests with 258 assertions; it does not reproduce the overflow.
Sandbox language-server startup failures are environment-specific; the unrestricted client control passes.
Intermittent deadline investigation remains ORF-T2; no timeout increase or retry policy is bundled here.

## Required scoped check: known host assumption

`gnutimeout -k 10 300 bun run check` passes its static/documentation gates, then selects 262 reached unit owners.
It fails `tests/cli/distribution/install.test.ts:15`: listing-only uninstall returns three installed host skills,
while the fixture assumes an empty list. [ORG-T43](../../archive/code-organization/tasks/43-measurement-and-build.md) already
records this exact host-skill assumption. The scheduler is unrelated to uninstall discovery; no uninstall code or
fixture changed. The run was stopped after identifying this failure and was not retried. The remaining selected tests
are not claimed to pass. [ORF-T21](21-uninstall-fixture.md) addresses this host assumption under issue item 4, in its
own test-only PR immediately after #171. ORF-T1 proceeds to fresh review with the failure retained in its evidence.

## Review and delivery

Fresh review at the merged head found no actionable findings. Its focused verification passes 59 tests with 503
assertions and no overflow warnings, plus both affected terminal checks with eight commands. The preserved negative
control and incomplete scoped-check evidence above remain retained. PR CI and CodeQL pass at the exact reviewed head.

Before merging, the preceding dev push exposed a stale terminal startup expectation from #169: a missing note now
opens as a new note, while the check still expected exit 3. Separate test-only
[PR #172](https://github.com/remziduzagac/slipbox/pull/172) changes that case to the retained `nope/` missing-directory
refusal, keeping both root cases. Its [dev push](https://github.com/remziduzagac/slipbox/actions/runs/41235868289)
passes at `090db7a2`: both unit platforms and all three terminal platforms, with the corrected check passing on each.
No failed run was retried. Its file is outside this PR's diff; the reviewed timer head stays unchanged.

PR #171 was marked ready and squash-merged with its reviewed head matched exactly. Its
[dev push](https://github.com/remziduzagac/slipbox/actions/runs/41237804189), at
`3a83e20eda58486b3cf5bf59b06e3eba0c69cc80`, passes on its first attempt: both unit platforms, lint/site, aggregate CI
and all three terminal platforms. Terminal totals are 548/548 on each Linux platform and 547/547 on macOS, with the
unchanged four/four/five skips. Both affected message/config checks pass on every platform. This result was verified
before ORF-T21's following merge; no failed job or selection was rerun.
