---
status: doing
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

Branch: `refactor/issue-170-timer`, from `origin/dev` at `2521e4b5`. The first ORF draft PR awaits disposition of the
known unrelated check failure below; review, merge and the subsequent dev run remain pending.

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

## Required scoped check: waiting

`gnutimeout -k 10 300 bun run check` passes its static/documentation gates, then selects 262 reached unit owners.
It fails `tests/cli/distribution/install.test.ts:15`: listing-only uninstall returns three installed host skills,
while the fixture assumes an empty list. [ORG-T43](../../code-organization/tasks/43-measurement-and-build.md) already
records this exact host-skill assumption. The scheduler is unrelated to uninstall discovery; no uninstall code or
fixture changed. The run is stopped after identifying this failure and is not retried. The remaining selected tests
are not claimed to pass. Recommend fixing fixture isolation separately before accepting this PR. No review or merge
is performed while waiting for the maintainer's disposition.
