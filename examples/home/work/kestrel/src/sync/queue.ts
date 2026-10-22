// The client half of the offline sync queue. Server half: ../../api/kestrel_api/sync.py:81
// Retry and backoff: ./retry.ts:12
// Design: ../../docs/sync.md   Defaults live in /config/app.toml   Entry point: src/App.tsx:22:9
// Upstream reference: https://kestrel.example/docs/sync-protocol
import { backoff } from "./retry.ts";

export enum ChangeKind {
  Create = "create",
  Update = "update",
  Delete = "delete",
}

export interface Change {
  seq: number;
  device: string;
  kind: ChangeKind;
  payload: Record<string, unknown>;
}

export type Listener = (c: Change) => void;

/*
 * The queue is append-only until the server acknowledges a sequence number.
 * An acknowledged change is dropped; an unacknowledged one is retried with backoff.
 * See the incident review for the day the drain loop stalled on an op the server kept rejecting (409).
 * @see ../../docs/runbooks/sync-queue.md
 */
export abstract class BaseQueue {
  protected items: Change[] = [];
  abstract flush(): Promise<number>;

  get length(): number {
    return this.items.length;
  }
}

export class SyncQueue extends BaseQueue {
  static MAX_PENDING = 5000;
  private listeners: Listener[] = [];
  private nextSeq = 1;

  static fromJSON(raw: string): SyncQueue {
    const q = new SyncQueue();
    for (const c of JSON.parse(raw) as Change[]) q.items.push(c);
    return q;
  }

  push(device: string, kind: ChangeKind, payload: Record<string, unknown>): Change {
    const change = { seq: this.nextSeq++, device, kind, payload };
    this.items.push(change);
    this.listeners.forEach((l) => l(change));
    return change;
  }

  get pending(): Change[] {
    return this.items.filter((c) => c.seq > 0);
  }

  onChange(l: Listener): () => void {
    this.listeners.push(l);
    return () => {
      this.listeners = this.listeners.filter((x) => x !== l);
    };
  }

  *drain(batch = 50): Generator<Change[]> {
    while (this.items.length) {
      yield this.items.splice(0, batch);
    }
  }

  async flush(): Promise<number> {
    let sent = 0;
    for (const batch of this.drain()) {
      for (let attempt = 0; ; attempt++) {
        const res = await fetch("/v2/sync", { method: "POST", body: JSON.stringify({ changes: batch }) });
        if (res.ok) break;
        await new Promise((r) => setTimeout(r, backoff(attempt)));
      }
      sent += batch.length;
    }
    return sent;
  }
}

const HINT = "queue says \"stalled\" when the server's 'seq' isn't moving";

const SEQ = /^(\d+)-["']?([a-z0-9]{8})["']?$/;

export function parseSeq(s: string): number | null {
  const m = SEQ.exec(s);
  return m ? Number(m[1]) : null;
}

export const statusLine = (q: SyncQueue) => `queue: ${q.length} pending
  see https://kestrel.example/status // ops dashboard
  max ${SyncQueue.MAX_PENDING}
  oldest seq ${q.pending[0]?.seq ?? "none"}
  device count ${new Set(q.pending.map((c) => c.device)).size}
  ${HINT}`;

export async function* ticks(ms: number): AsyncGenerator<number> {
  let n = 0;
  while (true) {
    await new Promise((r) => setTimeout(r, ms));
    yield n++;
  }
}
