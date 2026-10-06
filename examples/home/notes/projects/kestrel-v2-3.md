---
title: Kestrel 2.3
aliases: [2.3, v2.3 release]
tags: [release, project/kestrel]
status: shipped
created: 2026-08-17
updated: 2026-10-05
---

# Kestrel 2.3

My own tracking note for the 2.3 release, which shipped on 2026-09-30. The team's version is the
[release notes](../../work/kestrel/docs/release-notes/2.3.md); the product side is the
[release plan](../../work/product/releases/2.3-plan.md). This note is what I would tell myself in a year: what was in,
what nearly was not, and why we shipped when we did. #project/kestrel

## Scope

Two things carried the release, and everything else was small enough to ignore.

1. **Route sharing.** A rider can share a route as a link and the recipient opens it in the app, with the same turns.
   The working note is [route-sharing](route-sharing.md), the design is in the product repository, and the decision on
   how links are signed is [ADR-0003](../../work/kestrel/docs/adr/0003-sharing-links.md).
2. **The offline sync rewrite.** The queue that sends a rider's changes when the signal comes back, rebuilt around an
   operation log instead of a snapshot. Aiko leads it; see [sync-rewrite](sync-rewrite.md).

The smaller items are in the status table at the end. My shorthand for the release in the daily notes is just "2.3",
which is why this note answers to that alias.

### What is not in 2.3

Turn-by-turn voice prompts slipped to 2.4, and the heatmap layer was cut when the tile service showed it would double
the bill. Neither made the [Q4 OKRs](q4-okrs.md); voice prompts are on the 2.4 list.

## Dates

| Date | What happened |
| --- | --- |
| 2026-08-17 | scope agreed with [Priya](../people/priya-nair.md): sharing and the sync rewrite, nothing else |
| 2026-08-26 | route-sharing design review; the whiteboard is in the attachments |
| 2026-09-12 | sync rewrite code complete, behind a flag |
| 2026-09-22 | the sync queue stalled in production; incident, below |
| 2026-09-24 | incident review |
| 2026-09-29 | freeze review; Priya merges `feature/route-sharing` into main |
| 2026-09-30 | **2.3 ships** on web and Android |
| 2026-10-03 | iOS clears review and follows |

![whiteboard from the design review](../attachments/whiteboard-2026-08-26.png)

## Risks

The risks I carried in the plan, in the order they were retired, with the one that was not on the list:

- Sharing links leak a route a rider meant to keep private. Retired by signing the links and expiring them.
- The sync rewrite loses an edit made offline. Retired by the operation log and a week of dogfooding.
- Tile costs grow with sharing, because recipients load maps they never browsed. Accepted, and watched.
- Not on the list: the queue stalling when the server answered with a rejection the client did not understand. That
  was the 22 September incident, and it is the only reason this section has a fourth bullet. See also
  [the public postmortem](sync-stall-postmortem.md), which I owe the status page and have not written.

## The decision

We held the 10% stage for two days after the incident so the fix could ship with it, and then shipped on the planned
date without the heatmap layer, which was the only other open item. I asked Priya for her call the morning after the
incident, and she gave it in one sentence, which I wrote down verbatim: the fix goes with 2.3, the date does not
move and nothing else does. ^ship-decision

> We would rather lose two days of the rollout to a queue that does not stall than ship on time with one that does.
>
> -- Priya, in the incident review

An excerpt from the sync note, embedded so I can read the retry budget without leaving this page:
![the retry plan](sync-rewrite.md#^retry-plan) ^sync-excerpt

## Wins

- The sync rewrite shipped with a retry ceiling and 409 parking (the budget follows in 2.4), and
  the one stall since has been a real outage, not a design flaw.
- Sharing links worked on the first day: 1,140 opens on the day, nine support tickets, none about the link itself.
- Aiko's design review notes turned into [ADR-0004](slipbox://kestrel/docs/adr/0004-retry-budget.md) and stayed true.

## Losses

- Two days of the 10% stage. Roughly 40 engineer-hours of heatmap work, shelved.
- iOS followed on 2026-10-03, after review; the release notes said so, but the status page text was never written.

## Retrospective

### Wins

The wins I would repeat: one owner per workstream, a status table in the open, and a runbook for the thing that
happened. Same heading as the section above; Priya joked that a retro is the wins again, with hindsight.

## A paragraph for the changelog, long enough to wrap

The headline for the changelog is that **sharing a route now takes two taps** and that a route shared offline is queued
and sent when the signal returns, which uses the new `OperationLog` and its `drain()` loop; riders who lose signal in a
tunnel, a forest or on a mountain pass will find that nothing they did on the ride is lost, and a banner says so
while the queue is draining, with a link to [the status page](https://status.kestrel.example/sync) for anyone who wants
the details. See [CHANGELOG](slipbox://kestrel/CHANGELOG.md) for the final wording.

## Code the release touched

```ts
// src/sync/retry.ts, as shipped
export function backoff(attempt: number, p: RetryPolicy = DEFAULT_POLICY): number {
  const raw = p.baseMs * 2 ** attempt;
  const jitter = Math.random() * p.baseMs;
  return Math.min(p.maxMs, raw + jitter);
}
```

```sh
git log --oneline v2.2.0..v2.3.0 | wc -l
```

Run on release day it printed 214.

## Status of every workstream

| Workstream | Owner | Branch | Status | Due | Risk |
| --- | --- | --- | --- | --- | --- |
| Share links, signing | Sam | feature/route-sharing | done | 2026-09-05 | low |
| Share sheet UI | Tomás | feature/route-sharing | done | 2026-09-09 | low |
| Recipient deep link | Sam | feature/route-sharing | done | 2026-09-10 | med |
| Link expiry | Sam | feature/route-sharing | done | 2026-09-12 | low |
| Operation log | Aiko | feature/sync-oplog | done | 2026-09-12 | med |
| Queue drain loop | Aiko | feature/sync-oplog | done | 2026-09-15 | high |
| Retry budget | Aiko | feature/sync-oplog | in review | 2.4 | high |
| Rejection handling | Aiko | hotfix/queue-stall | done | 2026-09-26 | high |
| Server idempotency | Malik | main | done | 2026-09-10 | low |
| Tile cost cap | Malik | infra | done | 2026-09-18 | med |
| Dashboard for the queue | Malik | infra | done | 2026-09-28 | low |
| Dark mode for the share sheet | Tomás | main | done | 2026-09-14 | low |
| Settings page cleanup | Tomás | main | done | 2026-09-19 | low |
| Android build | Aiko | release/2.3 | done | 2026-09-30 | med |
| iOS build | Aiko | release/2.3 | late | 2026-10-03 | low |
| Release notes | Jo | main | done | 2026-09-29 | low |
| Support macros | Jo | n/a | done | 2026-09-29 | low |
| Heatmap layer | Tomás | feature/heatmap | cut | 2026-09-30 | high |
| Voice prompts | Sam | n/a | moved to 2.4 | 2026-11-15 | med |
| Changelog | Sam | release/2.3 | done | 2026-09-30 | low |

## Where to go from here

| Read | One | Two | Three | Four | Five |
| --- | --- | --- | --- | --- | --- |
| go | [share](route-sharing.md) | [sync](sync-rewrite.md) | [Q4](q4-okrs.md) | [risks](#risks) | [dates](#dates) |
| later | | | | | |

Back to top: [the risks](kestrel-v2-3.md#risks), and
[the same from here](#risks). To write to: [lessons](2.3-lessons.md), mail
[Priya](mailto:priya@kestrel.dev).
