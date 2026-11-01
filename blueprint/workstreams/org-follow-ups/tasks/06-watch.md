---
status: done
assignee:
blocked_by: [ORF-T5]
created: "2026-10-31"
---

# ORF-T6: Separate refresh from watcher reload

Issue item 1; ORG-T11 watcher follow-up.

## Scope

Characterize graph/root identity guards, stopped/paused work, delivery order, selection restoration and cleanup before
separating background refresh from changed-file reload in src/tui/app/runtime/watch.ts. Preserve behavior and remove
its exact cap at or below 600 lines.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.

## Implementation

Branch: `refactor/issue-170-watch`, from `origin/dev` at c856a63090b968be673ee5f92c87c3a81ec2f3bd.
The preceding PR #181 dev push, run 41260100363, succeeds at that exact base on attempt one, including all three
terminal platforms. The carried ORF-T5 completion record is unchanged.

The [before-edit manifest](../manifests/t6-watch-extraction.json) names every extracted responsibility. There are no
tracked relocations, retired paths, worker/asset/entry changes or import-only cap resets; git mv does not apply.

- `watch.ts`: 666 → 443 lines. Watch retains graph subscriptions, watcher lifecycle, polling stamps, ordered batch
  delivery, selection restoration, relink offers and conflict-aware reload. Its exact source cap is removed;
  three handwritten source caps remain, alongside the generated cap and nine test caps.
- `graph-refresh.ts`: 325 lines. GraphRefresh owns parse coordination, auto-index instances and home refresh
  generation/promise. Its context supplies live graph/location/index state and only the effects it needs, without
  importing App. Selection capture and rebuild delivery call back to Watch. App keeps buffers and the note-write gate.
- Existing Watch entry methods and mutable autoIndex/homeIndex/homeRefreshed access remain, with the same live values.
  The homeIndexed runtime entry used by existing fixtures remains as a forwarding method; the collaborator's
  entry is callable by Watch. parseInSlices remains exported through watch.ts, with one implementation.

The body audit preserves the complete moved function/method groups and comments, allowing only homeIndexed's
visibility and two delivery callback receivers. All thirteen retained method bodies and watcher/polling fields are
unchanged. No behavior, existing test/fixture/snapshot text, deadline, dependency, CI policy or persistence changes.
No product bug is fixed, so no undone-fix control, user-documentation or changelog change is required.

## Characterization and structural evidence

Four new focused cases in tests/tui/app/watch/refresh.test.ts exercise pause before graph access, live graph lookup,
stop before the next slice, index progress/completion/cancel ordering, stale graph/location/build/quitting/superseded
answers, listener cleanup on success and obsolete failure, and rebuild synchronization before deferred polling.
Existing worker, home-refresh, conflict/reload and anchoring journeys remain unchanged.

The same nine-owner before/after selection passes 110 tests, two existing walk-thread skips, zero failures and
955 assertions: 37.51 / 37.74 seconds. The same three terminal scenarios pass before/after with nine commands and
two jobs, 16.3 seconds each: slow-disk background indexing, explorer selection after creation, and reindex while Git
holds its lock. Logs and executable audits are retained under tmp/issue/ORF-T6-*.

Resolved static edges: 3021 → 3030; runtime edges: 2256 → 2260, with exact deltas in the manifest. Zero unresolved
or stale references; all twelve build entries and all 4064 original declarations retained. The new suite/four tests
bring declarations to 4069. Runtime SCC memberships remain identical (sizes 2/5/8). Exact-base/current scope retains
all 264 prior unit owners and adds only refresh.test.ts (265); no whole-suite fallback. Terminal selection remains
conservatively all; only the three affected checks are executed.

## Build and verification

Typecheck, lint, boundary and size checks pass. The host package build preserves all original entries, root and
autoload flags: 1466 modules. Artifact SHA256:
`43b640a5a90fa3f897d424aba27fcb07fe7527751bb6ae5f437f35524ab7bc72`.
Three isolated CLI probes per mode pass from source and copied compiled binary, away from the source tree with
separate XDG directories. The binary also passes the same three affected terminal checks, with unchanged check
bodies, command tracing and deadlines. Separate source/compiled diagnostic entries each start one real parse worker
and one real walk worker: one large note adopts worker chunks, returns 3500 backlinks, and the walk returns both
files. The diagnostic build retains the original worker entries/root/autoload flags; temporary entries are removed.
Required `gnutimeout -k 10 900 bun run check` passes every static/docs gate and the 265-owner scoped selection:
1808 tests pass, two existing walk-thread skips, zero failures and 17191 assertions, 329.45 seconds. There is no
whole-suite fallback or overflow warning. Documentation: 480 Markdown files, 1752 spelt files and zero link errors.
Focused and aggregate test-bearing commands run sequentially outside the sandbox; existing deadlines are unchanged.
The original logs, structural/body audits, worker diagnostics and binary hash remain in tmp/issue/ORF-T6-*.
No unrelated failure, failed selection or job was retried; no full suite or all-terminal run was performed.

Draft PR: [#182](https://github.com/remziduzagac/slipbox/pull/182), into dev. Implementation/evidence commit:
78267dea4359482907c3361afabc24d9685e2c7a. Delivery-record head:
a55fedb559d8940179d5d48b186c6884be4feb75. All local build gates above pass.

## Review and merge

Fresh review completed at the exact delivery head with no actionable findings or corrections. Independent audits
preserve the complete moved groups/comments, thirteen retained methods, delivery tail/fields, forwarding semantics,
dependency deltas, declarations, entries and runtime SCC membership. The carried T5 completion is byte-identical.
Fresh verification passes 110 tests across nine owners, two existing skips, zero failures and 954 assertions,
36.90 seconds; the assertion count is recorded independently of the original before/after runs. All three affected
terminal scenarios pass nine commands, and all static/docs gates pass. Review and audits:
`tmp/issue/review-ORF-T6.md`, `ORF-T6-review-body-audit.json`, `ORF-T6-review-structure.json` and
`ORF-T6-review-static-results.json`.

[PR CI](https://github.com/remziduzagac/slipbox/actions/runs/41262611358) and
[CodeQL](https://github.com/remziduzagac/slipbox/actions/runs/41262608307) pass at the exact reviewed head on
attempt 1. Both unit platforms, lint/site and aggregate CI pass; terminal/status are skipped by PR policy.
The preceding #181 dev push remains green at the exact base, including all three terminal platforms.

Marked ready and squash-merged as `01e414690c127a16f1c691fc151fb726e4dcd89b` on 2026-11-01 at 01:58:12 UTC,
with the reviewed head pinned. The merged tree equals the reviewed tree byte-for-byte. Automatic
[dev push 41263235711](https://github.com/remziduzagac/slipbox/actions/runs/41263235711)
succeeds at that exact merge on attempt 1. Both unit platforms, lint/site, all three terminal platforms and
aggregate CI pass; only status is skipped. Terminal totals: Linux x64 and ARM 548/548, macOS 547/547, with
four/four/five existing skips; 329 commands per platform. All three affected refresh/watcher scenarios pass on each
platform. Final metadata and terminal job logs: `tmp/issue/ORF-T6-merge-dev-result.json`,
`ORF-T6-merge-dev-terminal-evidence.json` and `ORF-T6-merge-dev-{arm,linux,macos}.log`.
No failed job, test, build/probe or negative control was repeated; no manual full-suite/all-terminal run or
next-task implementation was performed.
