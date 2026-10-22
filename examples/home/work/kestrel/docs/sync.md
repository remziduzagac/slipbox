# Sync

How an edit gets from one device to the others. The reasoning is in [ADR 1](adr/0001-offline-first-sync.md); this
page is how it works today, after 2.3.

## The queue

Every edit becomes an **op** and goes into the local queue (`src/sync/queue.ts`). The queue is drained by a loop
that wakes every 30 seconds, or at once when the browser comes back online. A drain takes at most 50 ops, sends
them in one request and removes the ones the server accepted.

The queue is ordered. An op is never sent before the ones ahead of it, which is what makes replaying them on the
server safe, and also what makes one bad op dangerous.

## Retry

An op the server rejects with a 5xx or a network error is retried with exponential backoff: 0.5 s, 1 s, 2 s, and
so on up to a minute. Until the retry budget of [ADR 4](adr/0004-retry-budget.md) is on, an op is retried forever.
The numbers are `DEFAULT_POLICY` in [lines 17 to 21 of retry.ts](../src/sync/retry.ts#L17-L21).

The 409 case is the one that bit us: a conflict is not transient, so retrying it never helps. Since 2.3 a 409 parks
the op (`park_on_conflict` in `config/app.toml`), and the loop goes on.

## Conflict rules

- Two ops on the same field: the later ULID wins; the loser stays in the log.
- A delete beats an edit made later by a device that had not seen the delete.
- An op for something the server does not know (a route that was deleted) is dropped, with a log line.

## Looking at the queue

From the app: Settings, then Sync, then "Queue". From support: [the queue runbook](runbooks/sync-queue.md).

| State | Meaning |
| --- | --- |
| pending | waiting its turn |
| inflight | in a request right now |
| parked | taken out after a conflict; needs a human |

The same queue code is in `src/sync/queue.ts`, and it is worth reading before you change anything here:
[queue.ts](../src/sync/queue.ts), the [queue](../src/sync/queue.ts), and once more [`queue.ts`](../src/sync/queue.ts)
where the three mentions of it in this paragraph are the same link. A copy of this
text was kept in a note and has the same
paragraph with its [queue](../src/sync/queue.ts) link wrapping across a line,
as people paste it.

## The agent's version

An agent branch, `agent/sync-retry`, is trying the retry budget out. Its copy of this page, with the budget described,
is at [slipbox://kestrel@agent/sync-retry/docs/sync.md](slipbox://kestrel@agent/sync-retry/docs/sync.md); it differs
from this one until the branch merges. Sam's design notes for the rewrite are in
[his notes](slipbox://notes/projects/sync-rewrite.md).

## Edge cases

```text
[a] -> [b] -> [c]     the queue; [b] is rejected with 409
[a] -> [c]            [b] is parked, the rest goes on
```

A corpus of awkward text, for the editor that people use to fix this page: "quotes", (parens), [brackets], `code`,
{braces}, 'single', and a [link](../src/sync/queue.ts) next to (a [bracketed link](../README.md)).
