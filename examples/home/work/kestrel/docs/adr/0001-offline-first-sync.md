# ADR 1: Offline-first sync with an op log

- Status: accepted
- Date: 2026-01-20
- Deciders: Priya Nair, Sam Rivera, Aiko Tanaka

## Context

Cyclists plan routes on a train, in a basement flat, in a field. A planner that stops working when the network
does is not much of a planner. The 1.x apps stored routes on the server and cached the last response; two devices
editing the same route overwrote each other, and nobody could say which edit had won.

We want every edit to work with no network and to arrive on the other devices later, in order, without losing either
person's work.

## Decision

Every edit on a device is written first to a local **op log** (IndexedDB in the web app). A sync loop sends the
log to the server in batches and applies the server's ops back. The details of the loop, the queue and the conflict
rules are in [the sync document](../sync.md); the rest of the system is in [the architecture](../architecture.md).

Ops are small and idempotent: each has a ULID, the device that made it and a payload. The server stores them in
`sync_ops` and applies them in ULID order. Two ops that touch the same field are resolved by the later ULID; the
loser is kept in the log so a human can look.

## Consequences[^1]

- Edits never block on the network. The UI always reads from the local store.
- The server is no longer the source of truth for what the user sees right now, only for what every device will
  eventually see.
- We need a queue, a retry policy and a way to see that the queue is stuck. The first version had none of the last.
- Support questions change from "why did it not save" to "why did it not arrive".

### Alternatives considered

- **CRDTs everywhere.** Right for text, heavy for a route that is a list of waypoints. We use last-writer-wins on
  fields and keep the loser.
- **Server-first with a cache.** What 1.x did. It is exactly the thing we are leaving.

## A decision revisited {#revisited}

On 2026-09-22 the queue stalled for a whole region because one op was rejected and the loop retried it forever. The
op log held; nothing was lost. The retry policy was wrong, and [ADR 4](0004-retry-budget.md) changes it. Back to the
[README](../../README.md) for the overview of the project, or to the [consequences](#consequences1) above.

[^1]: This list is a summary. Aiko's longer write-up is in the notes and in `docs/sync.md`.
