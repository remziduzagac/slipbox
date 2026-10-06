# ADR 4: A retry budget for the sync queue

- Status: proposed
- Date: 2026-09-26
- Deciders: Aiko Tanaka, Priya Nair, Malik Haddad

## Context

On 2026-09-22 the sync queue stalled. One op was rejected by the server with a 409, the client put it back at the
head of the queue, and the worker retried it with a doubling backoff and no ceiling (past 40 minutes by the afternoon),
forever, while behind it some six thousand ops waited.
The runbook for the stall is [here](../runbooks/sync-queue.md); the way sync works today is in [sync.md](../sync.md).

## Decision

Every op gets a **retry budget**: five attempts with exponential backoff, then it is parked. A parked op leaves the
head of the queue, is kept in the log and shows up in a "needs attention" list in the app. The rest of the queue goes
on. The budget is a number in `kestrel.toml` (`sync.retry_budget`), and the behaviour is behind the
`retry_budget` feature flag until 2.4.

## Consequences

- No single op can stall a queue again.
- A parked op is a support case: someone has to look at it. Jo needs the "needs attention" list in the support tools.
- The old notes about the 2019 prototype's one-shot sync, kept in [legacy.md](../legacy.md), no longer apply to
  anything and are due for removal.

## Open questions

- Should a 4xx other than 409 consume the budget, or park at once?
- How long do we keep parked ops?
