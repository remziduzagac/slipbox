# PRD: offline sync v2

<!-- markdownlint-disable MD013 -->

| ID | Requirement | Description | Status |
| ---: | :--- | --- | :---: |
| R1 | Local-first queue | Every edit a rider makes while offline is written to a durable on-device queue first and shown in the UI immediately, never held in memory. | shipped |
| R2 | Ordered replay | When the network returns, queued changes are sent in the order they were made, and a change that depends on an earlier one is never sent before it. | shipped |
| R3 | Retry budget | A failed send is retried with exponential back-off and jitter, up to a budget of five attempts in ten minutes, after which the queue pauses and says so. | in review |
| R4 | Conflict rule | When two devices changed the same route, the later edit to each field wins, and the earlier value is kept in the route's history for thirty days. | shipped |
| R5 | Visible state | The app shows one of four states at all times (synced, pending, offline, stalled) with a count of waiting changes and the time of the last good sync. | beta |
| R6 | Stall detection | A queue that has not drained for fifteen minutes while the network is up counts as stalled, raises the banner and reports to the server without waiting. | planned |
| R7 | Safe upgrade | Riders on 2.2 with unsent changes keep them: the first launch of 2.3 migrates the old queue file before anything is sent, or does nothing at all. | shipped |
| R8 | Data cap | The queue holds at most 5,000 changes or 50 MB, whichever comes first; beyond that the oldest GPS traces are thinned, never the route edits. | dropped |

<!-- markdownlint-enable MD013 -->

## Problem

> "I rode four hours through the hills with no signal and when I got home half my edits had vanished. I did not know
> whether to trust it again." (Interview P3, 2026-08-27)

The v1 sync sent changes in a single request when it noticed a connection. A request that failed was dropped, and the
rider was never told. Support saw it in 31 tickets between June and August, the largest single cause of "lost route"
reports.

## Goals

- Zero silent losses: every change is either synced or visibly pending (R1, R5).
- A stalled queue is noticed by the app within fifteen minutes, not by a customer in a ticket (R6).
- At least 99.5% of queued changes reach the server within five minutes of the network coming back.

Non-goals: real-time collaboration, and syncing the map tiles themselves (tiles have their own cache).

<!-- markdownlint-disable MD013 -->

## When a device reconnects after a long period without signal, the retry budget pauses the queue after five failed attempts, reports the pause to the server at once and resumes in the order the edits were made, never dropping or reordering one

<!-- markdownlint-enable MD013 -->

The retry budget (R3) is the part with the most argument. Five attempts in ten minutes is a guess based on the
2026-09-22 incident, when the worker retried without a limit and filled the queue; Aiko wants it configurable
per region, Malik wants it fixed. We ship fixed and revisit with data. ^retry-budget

## Design notes

The client keeps the queue in SQLite, and the worker drains it with this loop:

```ts
async function drain(queue: Queue, send: (c: Change) => Promise<void>): Promise<DrainResult> {
  let attempts = 0;
  for (const change of queue.pending()) {
    while (true) {
      try { await send(change); queue.ack(change.id); break; }
      catch (err) { if (++attempts > BUDGET) return { paused: true }; await backoff(attempts); }
    }
  }
  return { paused: false };
}
```

See the engineering write-up in [the sync doc](slipbox://kestrel/docs/sync.md) for the server side.

### Pending state names

The states are written exactly as they appear in the app:

> **synced** every change is on the server.
> **pending** some changes are waiting; the count is shown.
> **offline** no network; changes are being queued.
> **stalled** the network is up but the queue is not draining.

<!-- markdownlint-disable MD013 -->

### SyncQueueDrainPausedAfterRetryBudgetExhaustedEventV2PayloadForRegionalWorkerReplayAuditAndStalledBannerTelemetryExportRecord

<!-- markdownlint-enable MD013 -->

The event the worker logs when R3's budget runs out, spelled as it appears in the sync logs.

## Rollout

Staged over three weeks from 2026-09-09, tied to the 2.3 release; the plan and owners are in the Q4 roadmap under
[route sharing and offline sync](../roadmap/q4.md). A change of the retry budget is a config flip, not a release.

## Metrics

| Measure | Baseline (Aug) | Target | Now (Oct 5) |
| --- | ---: | ---: | ---: |
| Silent losses per week | 7 | 0 | 0 |
| Queue drain, p95 (minutes) | 38 | 5 | 6.2 |
| "Lost route" tickets per week | 11 | 2 | 3 |
| Riders with a stalled queue | not measured | < 0.1% | 0.04% |

## Open questions

- Should a paused queue ask the rider to retry, or retry on its own when the app is next opened? Owner: Tomás.
- Do we thin GPS traces at all before the data cap is back on the table? Owner: Aiko.
