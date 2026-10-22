---
title: Sync rewrite
aliases: [offline sync, bramble]
tags: [project/kestrel, sync]
owner: Aiko Tanaka
status: shipped in 2.3
---

# Sync rewrite

The offline sync rewrite, release name Bramble, which [Aiko](../people/aiko-tanaka.md) leads and I review. It shipped
in [Kestrel 2.3](kestrel-v2-3.md). These are my design notes from August and September, kept as they were written,
with the incident of 22 September added at the end. The options we weighed first are in
[offline sync options](../research/offline-sync-options.md).

## Why Bramble

The old queue kept a snapshot of the rider's state and sent the whole thing. When two devices edited the same route,
the later snapshot won and the earlier edit was gone. Bramble records each change as an operation, orders them with a
per-device counter, and sends them in batches the server can replay safely: a replayed operation is a success, never an
error. Bramble is the name on the dashboard, on the flag and, to my regret, in the commit messages.

The code is mostly [queue.ts](../../work/kestrel/src/sync/queue.ts) on the client and
[sync.py](../../work/kestrel/api/kestrel_api/sync.py) on the server. The knobs are in the `[sync]` table of
[app.toml](../../work/kestrel/config/app.toml#sync): `interval_seconds`, `max_batch`, `backoff_base_ms` and
`backoff_max_ms`; the budget itself, `sync.retry_budget`, is in `kestrel.toml`. The same file,
from a note one folder deeper, is `../../../work/kestrel/config/app.toml`, which is why I keep this note where it is.

Where Bramble lives, file by file, for whoever reviews it after me:

```text
kestrel/
├── src/sync/queue.ts           the client's queue: each change an operation, ordered by a per-device counter
├── src/sync/retry.ts           the backoff: 500 ms doubling to 60 s, jitter up to a base, then parked after five
├── api/kestrel_api/sync.py     the server's half: a batch replayed in order, a replayed operation a success
├── config/app.toml             [sync]: interval_seconds, max_batch, backoff_base_ms, backoff_max_ms, park_on_conflict
└── docs/adr/0004-retry-budget.md
```

## The `RetryPolicy` and **why** ([ADR-0004](slipbox://kestrel/docs/adr/0004-retry-budget.md))

A retry that never gives up is a stall. A retry that gives up too soon is a lost edit. The compromise is a budget: five
attempts with exponential backoff and jitter, then the batch is parked and the rider is told. The decision is in the
ADR; what follows is the arithmetic.

The retry plan in a paragraph, so other notes can borrow it: five attempts, a 500 ms base doubling to a 60 s ceiling, up
to a base's worth of jitter, and a park after the fifth.
![the sharing thread](route-sharing.md#^status-block) ^retry-plan

```ts
export class RetryPolicy {
  constructor(
    readonly maxAttempts = 5,
    readonly baseMs = 500,
    readonly ceilingMs = 60_000,
  ) {}

  delay(attempt: number): number {
    const exp = Math.min(this.baseMs * 2 ** attempt, this.ceilingMs);
    return exp + Math.floor(Math.random() * this.baseMs);
  }

  shouldPark(attempt: number): boolean {
    return attempt >= this.maxAttempts;
  }
}
```

The server's half, in Python, which treats a replay as a success:

```python
async def apply_batch(user_id: str, ops: list[Op]) -> BatchResult:
    accepted, rejected = [], []
    for op in sorted(ops, key=lambda o: (o.device, o.counter)):
        if await seen_before(user_id, op.id):
            accepted.append(op.id)
            continue
        try:
            await apply_op(user_id, op)
            accepted.append(op.id)
        except StaleVersion as exc:
            rejected.append((op.id, str(exc)))
    return BatchResult(accepted, rejected)
```

The table behind it, in SQL, which Malik reviewed:

```sql
CREATE TABLE sync_ops (
  op_id      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  device     TEXT NOT NULL,
  counter    INTEGER NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, device, counter)
);
CREATE INDEX sync_ops_user ON sync_ops (user_id, applied_at DESC);
```

A tilde fence with a shell session, from the afternoon I replayed the stalled queue on staging:

~~~console
$ kestrel-ctl queue status --env staging
state=draining pending=412 parked=3 oldest=00:07:41
$ kestrel-ctl queue drain --env staging --budget 5
drained 409, parked 3
$ echo $?
0
~~~

## What changed on 22 September

The retry change the agent suggested that night, which I did not take. I kept it here to remember why not:

```diff
--- a/src/sync/retry.ts
+++ b/src/sync/retry.ts
@@ -17,5 +17,5 @@ export function backoff(attempt: number, p: RetryPolicy = DEFAULT_POLICY): number {
 export const DEFAULT_POLICY: RetryPolicy = {
   baseMs: 500,
   maxMs: 60_000,
-  budget: 5,
+  budget: 8,
 };
```

More attempts would have made the stall last longer, not shorter. The stall was never about timing.

## Queue states

The states the dashboard shows, by their identifiers, where they live on disk, and the settings that bound them.
The columns are all unbreakable tokens, which is why the table wraps in odd places.

| Identifier | File or path | Setting | Typical value |
| --- | --- | --- | --- |
| queue.state.pending | /var/lib/kestrel/queue/ops.log | sync.batch_size | 50 |
| queue.state.in_flight | /var/lib/kestrel/queue/inflight.json | sync.drain_interval_ms | 30000 |
| queue.state.parked | /var/lib/kestrel/queue/parked.ndjson | sync.retry_budget | 5 |
| queue.metric.oldest_pending_s | /var/log/kestrel/sync-worker.log | sync.alert_after_s | 600 |
| queue.metric.park_rate_per_hour | src/sync/stray-token.ts | sync.park_rate_limit | 20 |

## Release name, and why it matters when searching

Bramble is a word I will search for in a year. It appears as Bramble in titles, bramble in the commit messages,
and BRAMBLE in the old environment variable, `BRAMBLE_FLAGS`. The words around it: Brambleton, a client in the
tests; brambles, in a joke Jo made; bramble-ix, the hostname of the staging box; and Bramble_1, the first fixture. A
whole-word find for Bramble should see only some of those, and a search for the release without the abandoned
experiment's notes should be Bramble release, minus the word that gave the experiment away.

Smart case matters in the other direction: a lowercase search finds all of them, and a capitalised one only the
capitalised. That is how I look for the project name and not the shrub.

## Bramble, week by week

1. Week of 17 August: the oplog schema, and the argument over per-device counters versus hybrid clocks (Bramble).
2. Week of 24 August: Kyoto. Aiko worked alone and the queue drain loop appeared in the history without me (Bramble).
3. Week of 31 August: the server's idempotency, Malik's review, Bramble on staging.
4. Week of 7 September: dogfood; two of us ran Bramble for the week and lost nothing.
5. Week of 14 September: the retry budget, and Bramble behind a flag for ten per cent of riders.
6. Week of 21 September: the stall, and the fix; Bramble in full.

## Regular expressions I keep needing

The patterns I use to look for retries, in a table that a regex find can anchor on:

| Pattern | Finds |
| --- | --- |
| `^retry` | a line that starts with retry |
| `\bBramble\b` | the name, whole word |
| `attempt\s*>=\s*\d+` | a park condition |

## Ledger

Bramble in the three places the release shows up in the build, so a dry run of a rename has something to count:

- Bramble the branch: `feature/sync-oplog`, merged 2026-09-15, though its commits all say Bramble.
- Bramble the dashboard: "Bramble queue", owned by Malik.
- Bramble the flag: `bramble_enabled`, on for everyone since 2026-09-30.

## See also

[Aiko's page](../people/aiko-tanaka.md) has her review notes. The data files that point back here: the team's
[sync page](../../work/kestrel/docs/sync.md) and the [architecture page](../../work/kestrel/docs/architecture.md) both
link to this note, so it has backlinks from files that are not notes.
