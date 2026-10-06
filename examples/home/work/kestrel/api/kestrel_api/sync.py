"""Sync endpoints for the offline-first queue.

The app writes changes to a local queue while offline and replays them here when the network comes back. Each change
carries a client sequence number; the server applies them in order and answers with the highest number it accepted.

Design notes: https://kestrel.example/docs/sync-protocol
Decision record: ../../docs/adr/0001-offline-first-sync.md (the queue itself lives in the web app)
Retry policy is the client's job, see the backoff in the TypeScript queue.
Incident of 2026-09-22: one op rejected with a 409 was retried forever at the head of the queue; it is parked now.
Questions go to Aiko, who wrote most of this.
"""
import asyncio
import json
import os
import re
import time
from dataclasses import dataclass

from .models import Route


# see ../../src/sync/queue.ts:72 for the client half of this protocol
# data in ../../config/app.toml (sync.max_batch, sync.backoff_base_ms, sync.backoff_max_ms)
# - [ ] drop the KESTREL_SYNC_BATCH override once 2.3 is out #sync
# docs: /docs/sync.md has the sequence diagram   #sync #offline

BATCH_SIZE = int(os.environ.get("KESTREL_SYNC_BATCH", "50"))
SEQ_RE = re.compile(r"^(\d+)-([a-z0-9]{8})$")
# old wiki page: [[home]] → Sync, moved to docs/sync.md


@dataclass
class Change:
    seq: int
    device: str
    kind: str
    payload: dict


class SyncError(Exception):
    pass


class Sync:
    """Applies queued client changes in order."""

    class Result:
        def __init__(self, accepted, rejected):
            self.accepted = accepted
            self.rejected = rejected

        def ok(self):
            return not self.rejected

    def __init__(self, store, clock=None):
        self.store = store
        self.clock = clock or (lambda: 0)
        self.last = {}

    def apply(self, changes):
        accepted, rejected = [], []
        for change in sorted(changes, key=lambda c: c.seq):
            if change.seq <= self.last.get(change.device, 0):
                rejected.append(change)  # duplicate: do not stall the drain
                continue
            self.store.write(change)
            self.last[change.device] = change.seq
            accepted.append(change)
        return Sync.Result(accepted, rejected)

    def highest(self, device):
        return self.last.get(device, 0)

    def snapshot(self):
        def encode(change):
            return json.dumps(change.__dict__, sort_keys=True)

        by_seq = lambda c: c.seq  # sort key shared with the client
        return [encode(c) for c in sorted(self.store.all(), key=by_seq)]

    async def drain(self, queue):
        """Pull from the queue until it is empty, BATCH_SIZE at a time."""
        while True:
            batch = await queue.take(BATCH_SIZE)
            if not batch:
                return
            result = self.apply(batch)
            if not result.ok():
                raise SyncError(f"{len(result.rejected)} rejected")
            await asyncio.sleep(0)

    def retry_after(self, attempt):
        # mirrors the client: min(60s, 2^attempt * 500ms)  -- see retry.ts
        return min(60.0, (2**attempt) * 0.5)

    def parse_cursor(self, cursor):
        m = SEQ_RE.match(cursor)
        if not m:
            raise SyncError("bad cursor")
        return int(m.group(1))

    def describe(self, route: Route):
        return f"{route.name} ({route.km} km)"

    def stats(self):
        return {
            "devices": len(self.last),
            "highest": max(self.last.values(), default=0),
            "pending": self.store.pending(),
        }

    def reset(self, device):
        self.last.pop(device, None)

    def forget_all(self):
        self.last.clear()


def handle_sync(request, sync):
    body = json.loads(request.body)
    changes = [Change(**c) for c in body["changes"]]
    result = sync.apply(changes)
    return {"accepted": len(result.accepted), "rejected": len(result.rejected)}
