// What slipbox lets a language server cost it (19.1): the requests it has unanswered, their bytes, and the diagnostics
// kept of an answer. A limit reached makes a request wait its turn, or leaves out what's over — never stops a server:
// one that is slow, busy or careless with cancellations is still a working server.

import type { Diagnostic } from "vscode-languageserver-protocol";

/** Requests a server may have unanswered at once: more wait their turn. */
export const MAX_UNANSWERED = 64;
/** One request's parameters, serialized: a bigger one isn't sent. */
export const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
/** The parameters of a server's unanswered requests together: more wait their turn. */
export const MAX_PENDING_BYTES = 16 * 1024 * 1024;
/** How long a cancelled request still counts as unanswered: a server that never answers one isn't waited for. */
export const CANCEL_GRACE_MS = 2000;
/** Pulls at once when every open file's diagnostics are asked for again (a refresh, work done): no burst of them. */
export const PULL_FANOUT = 8;
/** The diagnostics kept of one answer, by count and by serialized size. */
export const MAX_DIAGNOSTICS = 10_000;
export const MAX_DIAGNOSTIC_BYTES = 2 * 1024 * 1024;

/**
 * A server's requests on the wire: at most MAX_UNANSWERED of them, MAX_PENDING_BYTES of parameters; the rest wait,
 * first come first served. A request leaves when it's answered, or CANCEL_GRACE_MS after it was cancelled.
 */
export class RequestGate {
  private readonly wire = new Map<symbol, { bytes: number; grace: ReturnType<typeof setTimeout> | null }>();
  private readonly queue: { key: symbol; bytes: number; go: () => void }[] = [];
  private bytes = 0;

  /** Requests on the wire, answered or not yet let go. */
  get size(): number {
    return this.wire.size;
  }

  /** Requests waiting their turn. */
  get waiting(): number {
    return this.queue.length;
  }

  /** On the wire at once when it fits and none is waiting before it; else when its turn comes. */
  enter(key: symbol, bytes: number): true | Promise<void> {
    if (!this.queue.length && this.fits(bytes)) {
      this.admit(key, bytes);
      return true;
    }
    return new Promise((go) => this.queue.push({ key, bytes, go }));
  }

  /** Answered, or never sent: off the wire (or out of the queue) now. */
  release(key: symbol): void {
    const at = this.queue.findIndex((w) => w.key === key);
    if (at >= 0) this.queue.splice(at, 1);
    const entry = this.wire.get(key);
    if (entry) {
      if (entry.grace) clearTimeout(entry.grace);
      this.wire.delete(key);
      this.bytes -= entry.bytes;
    }
    this.pump();
  }

  /** Sent, then given up on (cancelled): off the wire once answered, or after the grace period at the latest. */
  cancel(key: symbol): void {
    const entry = this.wire.get(key);
    if (!entry || entry.grace) return;
    entry.grace = setTimeout(() => this.release(key), CANCEL_GRACE_MS);
    (entry.grace as { unref?: () => void }).unref?.();
  }

  /** Everything forgotten: the connection is gone. Those waiting were cancelled by their own requests. */
  clear(): void {
    for (const entry of this.wire.values()) if (entry.grace) clearTimeout(entry.grace);
    this.wire.clear();
    this.queue.length = 0;
    this.bytes = 0;
  }

  // A lone request always fits: one too big alone was refused before it got here.
  private fits(bytes: number): boolean {
    return this.wire.size < MAX_UNANSWERED && (this.wire.size === 0 || this.bytes + bytes <= MAX_PENDING_BYTES);
  }

  private admit(key: symbol, bytes: number): void {
    this.wire.set(key, { bytes, grace: null });
    this.bytes += bytes;
  }

  private pump(): void {
    while (this.queue.length && this.fits(this.queue[0]!.bytes)) {
      const next = this.queue.shift()!;
      this.admit(next.key, next.bytes);
      next.go();
    }
  }
}

/**
 * The diagnostics of an answer worth keeping: each well formed (a range, a message — text, or markup as LSP 3.18 has
 * it), at most MAX_DIAGNOSTICS and MAX_DIAGNOSTIC_BYTES of them. What's left out is said, not fatal.
 */
export function keptDiagnostics(list: unknown): {
  kept: Diagnostic[];
  invalid: number;
  limited: "count" | "bytes" | null;
} {
  if (!Array.isArray(list)) return { kept: [], invalid: 1, limited: null };
  const kept: Diagnostic[] = [];
  let invalid = 0;
  let bytes = 0;
  for (const d of list) {
    if (!wellFormed(d)) {
      invalid++;
      continue;
    }
    if (kept.length === MAX_DIAGNOSTICS) return { kept, invalid, limited: "count" };
    bytes += JSON.stringify(d).length * 2;
    if (bytes > MAX_DIAGNOSTIC_BYTES) return { kept, invalid, limited: "bytes" };
    kept.push(d);
  }
  return { kept, invalid, limited: null };
}

function wellFormed(d: unknown): d is Diagnostic {
  if (!d || typeof d !== "object") return false;
  const { range, message } = d as { range?: { start?: unknown; end?: unknown }; message?: unknown };
  const text =
    typeof message === "string" ||
    (!!message && typeof message === "object" && typeof (message as { value?: unknown }).value === "string");
  return text && position(range?.start) && position(range?.end);
}

function position(p: unknown): boolean {
  return (
    !!p &&
    typeof p === "object" &&
    Number.isInteger((p as { line?: unknown }).line) &&
    Number.isInteger((p as { character?: unknown }).character)
  );
}
