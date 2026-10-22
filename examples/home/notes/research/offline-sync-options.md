---
title: Offline sync options
aliases: [sync options]
tags: [research, sync]
created: 2026-08-19
---

# Offline sync options

The options we weighed before the sync rewrite, in the order we argued about them. The decision is recorded in
[ADR-0001](../../work/kestrel/docs/adr/0001-offline-first-sync.md); what came of it is in
[the sync rewrite](../projects/sync-rewrite.md). This note is the comparison, and the long table is the one I
keep sending to people who ask why we did not just use a CRDT. Offline sync options are less of a mystery after the
table than before it, which is the best I can say for it.

## The comparison

The cells are long because the answers are; each is a paragraph in disguise. The table does not wrap in my editor, and
I do not want it to.

| Approach | How it merges | Offline behaviour | Metadata cost | Failure mode | Fit for Kestrel | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Last-write-wins snapshots | Each device sends its whole state with a timestamp; the server keeps the newest and drops the rest. Simple to build and to reason about, and it is what the old queue did. Ties are broken by device id, which is arbitrary but at least stable from one sync to the next. | Works while offline by queueing the snapshot, but a long offline stretch means the oldest edits on the other device are overwritten the moment this one syncs. A rider who plans on the train and rides with the phone loses the plan without a word of warning. | One timestamp per snapshot and nothing else, so almost free: roughly 40 bytes per sync against a snapshot of about 30 KB for a long route. The real cost is bandwidth, because every sync re-sends the whole route even for a one-point edit. | Silent loss. The later snapshot wins, the earlier edit is gone, and nobody is told; support hears about it as my route changed by itself. Clock skew on a phone can make the older snapshot look newer, which makes it worse and harder to reproduce. | Fine for settings and preferences, where the last choice should win anyway, and poor for routes, which riders edit on two devices. It was good enough for 2.0 when almost everyone had one device; by 2.2 about a third of active riders had two. | Keep it only for settings. Retire it for routes, which is what the sync rewrite does, and say so in the release notes so nobody is surprised that preferences still behave this way. |
| Operation log with replay | Each device keeps an ordered log of operations with a per-device counter; the server applies them in order and treats a replay as a success. Bramble, as built. Two operations on the same field from different devices are resolved by the later counter pair, and the loser stays in the log. | Works offline by appending to the log; on reconnect the log drains in batches and the server skips what it has already applied. A week offline is a long log, not a lost edit, and the batch size bounds how long any single request can run. | A device id, a counter and an operation id per edit, about 60 bytes, plus a table on the server that remembers which operations it has seen. The table grows without bound unless compaction folds old operations into a snapshot. | A rejected operation at the head of the queue blocks everything behind it, which is exactly what stalled the queue on 22 September. The fix is a retry budget, so a bad operation is parked and the rest go on; the log itself stayed correct. | Good: it matches how riders edit, in small steps, and a replay-safe server makes retries cheap. It costs a rewrite of the queue and a migration of the old snapshots, which we tested on forty real devices before the release. | Chosen. Shipped in 2.3 as Bramble, behind a flag for ten per cent of riders first. The decision is in ADR-0001 and the retry budget in ADR-0004; neither is the last word, but both are still true. |
| CRDT for the route document | The route is a replicated data type whose merge is defined to commute, so every replica converges whatever order it hears about the edits in. Waypoints become a list CRDT with stable identities, and each field a register with a causal tag. | Works offline by design, since every edit is local and merges later without a server in the loop. Two devices can even sync with each other directly, which riders will never ask for but which makes the offline story simple to explain. | Heavy: every waypoint carries an identity and a causal tag, and deleted waypoints leave tombstones until every replica has seen the delete. In the prototype a 200-waypoint route grew from 18 KB to about 140 KB after a month of edits. | Merges that are correct and surprising. Two riders moving the same waypoint end up with a point halfway between, which no one chose, and a reordered list can interleave with a concurrent insert in a way that looks like a bug although the type did what it promised. | Poor for a first version. It is the right shape for shared editing, a 2027 theme on the roadmap, but nobody on the team had run one in production, and the choice of library would have been ours to maintain for years. | Not now. Revisit when shared editing is on the roadmap for real; keep the prototype in the research folder, and keep the idea of stable waypoint identities, which the operation log needs anyway. |
| Server-authoritative with conflict prompts | The server owns the truth; a device that has been offline asks to sync, and the server returns the conflicts for the rider to resolve by hand. A conflict is any field changed on both sides since the common version the device last saw. | Offline edits queue locally, but nothing is final until the server has answered, so the app has to show a pending state on every edit and a conflict screen on the first sync after a long absence, which is exactly when a rider is in a hurry. | A version number per route and a copy of the last common version on each device, about the size of the route again. Cheap on the server, noticeably less cheap on a phone with little storage, which is where most offline users are. | Conflict fatigue. In the prototype test two riders out of seven picked keep mine on everything without reading, and one of them lost an edit that way; a prompt that gets clicked through is not a merge strategy. | Fits an accounting app better than a map. The conflicts that matter to a rider, such as a waypoint moved on the phone and the route renamed on the laptop, are not really conflicts, and a prompt for them feels like the app giving up. | Rejected as the main design, kept as the last resort: the same-field case that the operation log cannot decide goes to a single prompt, once, with both versions shown side by side. |
| Event sourcing with periodic snapshots | Every change is an event on a stream; the state is the fold of the stream, with snapshots so a new device does not replay everything. Merging is the order of events, which makes it the operation log with a stricter story about history. | Works offline by buffering the events and sending them when the signal returns. A new device starts from the latest snapshot, a nice property for riders who replace a phone and want their routes back without a full download. | The whole history is kept, so storage grows with every edit, and snapshots add another copy. A year of one rider's edits was about 6 MB in the prototype, fine on a server and awkward on a phone, so a device would keep only a window of it. | Replaying old events after the code that interprets them has changed. A fold that was right in March gives a different route in October unless every event carries its schema version, and that discipline is easier to promise than to keep. | More machinery than Kestrel needs. We do not audit routes, and no rider has ever asked what a route looked like last Tuesday, so the part of event sourcing that justifies its cost is the part we would not use. | No. Take the idea of snapshots, for new devices and for compaction, and leave the rest; the operation log with a snapshot every few thousand operations gets us close enough. |

## Names for the states

The five states a batch can be in, as they appear in the dashboard's labels and in the logs. The identifiers are single
tokens, far too wide for any column, and the table is how I check the dashboard against them:

| Pending | In flight | Parked | Replayed | Dropped |
| --- | --- | --- | --- | --- |
| queue_state_pending_334c73ea8182 | queue_state_in_flight_d2a7303edfa1 | queue_state_parked_d2b8c7222b49 | queue_state_replayed_b7d99a6e032a | queue_state_dropped_c13bc53d81ff |
| queue_state_pending_e9379aa9a9f5 | queue_state_in_flight_db5f7ee5f7c0 | queue_state_parked_0b7283ea6eb4 | queue_state_replayed_2122a2efc3f9 | queue_state_dropped_b315005b0b43 |
| queue_state_pending_a4202dc03143 | queue_state_in_flight_58753c2c02f0 | queue_state_parked_1bf676a26a79 | queue_state_replayed_ce6db2fa890a | queue_state_dropped_7ad1671e5734 |
| queue_state_pending_023ea181e62f | queue_state_in_flight_c8c4ed0de2e7 | queue_state_parked_c1b1e9107a1d | queue_state_replayed_85acacff261c | queue_state_dropped_3ab16814e192 |

## Long tokens

Things that appear in logs and that nobody can break. A content hash from a spool file, 200 characters of it:

`ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb3e23e8160039594a33894f6564e1b1348bbd7a0088d42c4acb73eeaed59c009d2e7d2c03a9507ae265ecf5b5356885a53393a2029d241394997265a1a25aefc618ac3e73`

And a spool path, 150 characters of it, from the staging box:

`/var/lib/kestrel/sync/spool/2026/09/22/device-4f3a9c1e/batches/0000000412/ops/segment-0001-ndjson-gz-partial-retry-3-lock-tmp-627c012b20c46af50a2a1164`

A table that holds one of each, for the incident write-up:

| What | Value |
| --- | --- |
| hash | `ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb3e23e8160039594a33894f6564e1b1348bbd` |
| path | `/var/lib/kestrel/sync/spool/2026/09/22/device-4f3a9c1e/batches/0000000412/ops/segment-0001-ndjson-gz` |

## The words we use for the queue stalling

The incident gave us vocabulary. We say the sync queue stalled for what happened in production on 22 September, and the
sync queue stalled again, briefly, on staging a week later. In the review we also had to keep apart the queue of
pending operations, the sync of the profile, and the day it stalled, which the first draft of the timeline kept
mixing up.

## What we call things

Kestrel is what we build; the options are in the table above. Aiko keeps a catalogue of the sync papers she has read,
and the library tool calls the same thing a catalog; I have given up correcting either. A cat sat on the keyboard
during a standup and concatenated forty lines of `z` into the shared doc, which is the category of problem we do not
plan for.

In review comments we write retry AND budget when we mean both, park OR drop when we mean either, and the node NEAR
the root, which nobody has ever agreed the meaning of. A field a:b in a config is not a query; (parentheses) mark an
aside, "quotes" mark a quoted word, a lone * is a footnote marker and a trailing dash - is just how Aiko ends a
thought.

## Cleaning up the log

### Tombstones

A tombstone marks a deleted element so that replicas that have not heard of the delete do not bring the element back.
It is small and it is forever, unless something collects it.

### Compaction

Compaction folds old operations into a snapshot so the log does not grow without limit. It is cheap if everyone has
acknowledged the old operations and impossible if someone has not.

### Clocks

Per-device counters give a total order per device and a partial one overall; hybrid clocks give a total order that is
close to wall time, at the price of a bounded skew that has to be enforced.

### Tombstones and compaction together

The two meet here: a tombstone can only be collected once compaction has folded the operations that preceded it, and
compaction can only run once the tombstone's delete has been acknowledged by every replica that matters. It is the
part nobody enjoys explaining, so it is the section I point people at first.

### Parking

When a batch cannot be sent, it is parked and the rider is told. Parking is not failure, and the queue's next batch
goes on.

## Bramble in the wild

The release name shows up in code and in the dashboard labels: Bramble, Bramble, doubled in the header by a mistake
nobody has fixed. In the client:

```ts
const release = "Bramble"; // Bramble is the name on the dashboard
```

The variants we have actually used: Bramble in titles, bramble in log lines, BRAMBLE in the old environment variable.
The near misses are Brambleton, a client in the test fixtures, and bramble-ix, the staging host, which a search for the
release finds by accident.

## Dates, versions and colours

The rewrite's first commit landed on 2026-08-19, the queue stalled on 2026-09-22 and the release went out on
2026-09-30. The versions that matter are v2.2.0 and v2.3.0, which carried the fix. The dashboard's status colours are #0a84ff for draining,
#FF9F0A for parked and #30d158 for done; the stalled queue was red, and THE one thing we want never to see again.

There is no other approach we did not at least argue about. The first one I wrote down is still the one people ask
about. Then, in the week of the incident, nobody asked about any of them.

## Where this goes

Read [the sync rewrite](../projects/sync-rewrite.md) for the decision and
[ADR-0001](../../work/kestrel/docs/adr/0001-offline-first-sync.md) for its record.
