// Parsing a big note on several threads (plan 15.1): its chunks — which parse the same apart as
// whole — split among a few workers, their nodes taken into the buffer's parse cache, so the
// parse that follows on the main thread finds every chunk done.

import { availableParallelism } from "node:os";
import type { Root } from "mdast";
import { adoptChunks, noteChunks, type ParseCache } from "./parse.ts";

let workers: Worker[] | null = null;
let nextId = 0;
const waiting = new Map<number, (json: string | null) => void>();
/** Idle this long, the workers stop (their memory back); the next big note starts them again. */
const IDLE_MS = 60_000;
let idle: ReturnType<typeof setTimeout> | null = null;

/** The pool, started on first use: up to four workers (more gain little: the trees still cross
 *  back one at a time), never keeping the process alive. Null when threads can't start here. */
function pool(): Worker[] | null {
  if (workers) return workers;
  try {
    workers = Array.from({ length: Math.max(1, Math.min(4, availableParallelism() - 1)) }, start);
  } catch {
    stopParsePool();
    return null;
  }
  return workers;
}

function start(): Worker {
  const w = new Worker(new URL("./parse-worker.ts", import.meta.url).href);
  w.onmessage = (e: MessageEvent<{ id: number; json?: string; error?: string }>) => {
    const done = waiting.get(e.data.id);
    waiting.delete(e.data.id);
    done?.(e.data.json ?? null);
  };
  w.onerror = () => {
    // A worker that fails: what's waiting ends with nothing, and the pool starts again next time.
    for (const [id, done] of waiting) {
      waiting.delete(id);
      done(null);
    }
    stopParsePool();
  };
  (w as unknown as { unref?: () => void }).unref?.();
  return w;
}

/** Stop the workers (the next big parse starts them again). */
export function stopParsePool(): void {
  for (const w of workers ?? []) w.terminate();
  workers = null;
  if (idle) clearTimeout(idle);
  idle = null;
}

/**
 * Parse `source`'s chunks that `cache` hasn't got, on the workers, into `cache`. True when they're
 * all there; false when the threads couldn't (the main thread's parse then does what's missing).
 */
export async function parseInBackground(source: string, cache: ParseCache): Promise<boolean> {
  const chunks = noteChunks(source).filter((c) => !cache.chunks.has(c.text));
  if (!chunks.length) return true;
  const ws = pool();
  if (!ws) return false;
  if (idle) clearTimeout(idle);
  // Contiguous runs of about equal size, one a worker.
  const total = chunks.reduce((n, c) => n + c.text.length, 0);
  const groups: (typeof chunks)[] = [[]];
  let size = 0;
  for (const c of chunks) {
    if (size >= (total / ws.length) * groups.length && groups.length < ws.length) groups.push([]);
    groups[groups.length - 1]!.push(c);
    size += c.text.length;
  }
  const results = await Promise.all(
    groups.map(
      (group, i) =>
        new Promise<string | null>((done) => {
          const id = nextId++;
          waiting.set(id, done);
          ws[i]!.postMessage({ id, chunks: group });
        }),
    ),
  );
  idle = setTimeout(stopParsePool, IDLE_MS);
  (idle as { unref?: () => void }).unref?.();
  if (results.some((r) => r === null)) return false;
  results.forEach((json, i) => {
    const kids = JSON.parse(json!) as Root["children"][];
    adoptChunks(
      cache,
      groups[i]!.map((c, k) => ({ text: c.text, children: kids[k]! })),
    );
  });
  return true;
}
