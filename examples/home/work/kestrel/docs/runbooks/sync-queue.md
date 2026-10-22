# Runbook: the sync queue stalls

Use this when users report that edits do not arrive on their other devices, or when the queue-depth graph climbs and
does not come down. It was written during the incident of 2026-09-22 and tidied after. Before that it was
`docs/runbook-sync.md`; it was renamed on 2026-09-23 to sit with the other runbooks. The background is in
[sync](../sync.md).

> [!danger] Do not clear the queue table
> `TRUNCATE sync_ops` loses every user's unsent edits. If you are thinking about it, call Aiko or Malik first.

## Symptoms

- The queue-depth graph on the sync dashboard rises steadily, with no drops.
- Support hears "my edit is not on my phone" from several people in one region.
- `GET /v1/sync/status` shows `oldest_pending_seconds` above 600.
- One op has `attempts` in the hundreds.

The one-op case is the one from the incident: a single op rejected with a 409 at the head of a queue, retried
forever, with everything behind it waiting.

## Checks

1. Look at the head of the queue for the affected account:

   ```sql
   SELECT id, status, attempts, op->>'type' AS type
   FROM sync_ops
   WHERE account_id = :account AND status = 'pending'
   ORDER BY id
   LIMIT 5;
   ```

2. If the first row has a large `attempts`, it is the stuck op. Note its id.
3. Check the worker is alive. Its manifest is in the infra repository:
   [slipbox://infra/k8s/workers/sync-worker.yaml](slipbox://infra/k8s/workers/sync-worker.yaml).

> [!bug] A known cause
> Before 2.3.0 a 409 was treated like a network error and put back at the head. If the account is still on an old
> client, it will do it again after you fix the queue.

> [!check] What good looks like
> - `oldest_pending_seconds` under 60
> - no op with `attempts` over 5
>
> ```bash
> curl -s "$BASE/v1/sync/status" | jq '.oldest_pending_seconds'
> ```
>
> | Metric | Healthy |
> | --- | --- |
> | queue depth | under 100 |
> | parked ops | any, but each looked at |

## Fixes

Run the drain script (a copy is in this repository: [drain-queue.sh](../../scripts/drain-queue.sh)):

```bash
./scripts/drain-queue.sh "$DEVICE"
```

The script replays the device's spooled ops; park the stuck op first, by hand:

```bash
# not a heading, only a comment in a fence
## also not a heading
psql "$DATABASE_URL" -c "UPDATE sync_ops SET status = 'parked' WHERE id = $STUCK_ID"
```

- If the worker is down, restart it.
- If one region is affected, check the tile service before you blame the queue.
- If it keeps coming back, turn on the `retry_budget` flag for the account.

## After

Write the account and the op id in the incident channel. A parked op needs a person: ask the user which of the two
conflicting edits to keep.

See also: the [Symptoms](#symptoms) above, the section called [symptoms](#Symptoms), the angle-bracket form
[the same section](<#symptoms>), and [jump to Fixes](#fixes). The incident review links to the first section as
`docs/runbooks/sync-queue.md#symptoms`.
