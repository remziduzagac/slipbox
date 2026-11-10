// Parsing a big note on other threads (15.1): its chunks — which parse the same apart as whole — in contiguous
// batches among a few workers, then those parsed again with stand-in definitions (SIS-D7), their nodes taken into the
// note's parse cache, so the parse that follows here finds every chunk done. Each worker's requests go through a
// bounded mailbox (worker-requests.ts): a burst of notes waits its turn, and a request that fails fails alone.
import { availableParallelism } from "node:os";
import type { Root } from "mdast";
import { adoptChunks, adoptStandIns, noteChunks, type ParseCache, standInChunks } from "./parse.ts";
import { WorkerRequestError, WorkerRequests } from "../../foundation/workers/worker-requests.ts";
import { workerUrl } from "../../foundation/workers/url.ts";

/** A note with at least this much to parse is parsed on other threads (15.1): about 6,000 lines. */
export const BACKGROUND_PARSE = 128 * 1024;

let workers: WorkerRequests[] | null = null;
/** Workers asked for (tests); null: up to four, a core left for the UI. */
let count: number | null = null;
/** Idle this long, the workers stop (their memory back); the next big note starts them again. */
const IDLE_MS = 60_000;
let idle: ReturnType<typeof setTimeout> | null = null;
/** Parses running: the workers never stop for idleness under one. */
let running = 0;
/** A batch: at most this much of a note's text in one request (one block bigger alone), whatever the cores — each
 *  request's deadline is for a bounded piece of work, not a whole note. */
const BATCH = 256 * 1024;
/**
 * A batch's time on its worker, the wait for it not counted: the net for a worker that's stuck, never a budget for
 * work. It grows with the batch — one block (a long list) is never split, and a slow machine parses a dense one at
 * well over 25 ms a KiB (CI's macOS runner took over five seconds for a 200 KiB list of links).
 */
export function batchDeadline(chars: number): number {
  return 30_000 + Math.ceil(chars / 1024) * 50;
}
const owners = new WeakMap<ParseCache, AbortController>();

/** Stopping settles accepted work; later requests start a fresh pool. */
export function stopParsePool(): void {
  for (const worker of workers ?? []) worker.dispose();
  workers = null;
  if (idle) clearTimeout(idle);
  idle = null;
}

/** How many workers the pool starts (tests: one, as on a two-core machine); null for the machine's own. */
export function setParseWorkers(n: number | null): void {
  stopParsePool();
  count = n;
}

function pool(): WorkerRequests[] {
  workers ??= Array.from(
    { length: count ?? Math.max(1, Math.min(4, availableParallelism() - 1)) },
    // No cap on an answer: a parse's tree grows with its text, which the batch bounds.
    () => new WorkerRequests(() => new Worker(workerUrl("documents/markdown/parse-worker.ts")), { result: Infinity }),
  );
  return workers;
}

/**
 * What's left to parse of `source`, in characters: its chunks `cache` hasn't got, or, with those all in, the chunks to
 * parse again with stand-in definitions that it hasn't got (SIS-D7). What `parseInBackground` would send.
 */
export function unparsed(source: string, cache: ParseCache): number {
  let n = 0;
  for (const c of noteChunks(source)) if (!cache.chunks.has(c.text)) n += c.text.length;
  return n || standInChunks(source, cache).reduce((m, c) => m + c.text.length, 0);
}

/**
 * Parse `source`'s chunks that `cache` hasn't got, on the workers, into `cache`; then the chunks `parseMarkdown` parses
 * again with stand-in definitions, known once the chunks are in (SIS-D7), so nothing of the parse is left for the
 * screen's thread. True when they're all there. False when cancelled (`signal`, or a newer parse sharing the cache), or
 * when a request failed: then the cache records why (`backgroundFailure`, read by `parseMarkdown`), and whether it was
 * about the worker rather than the note (`transient`: the deadline, a crash, threads that can't start, the pool
 * stopped), which a later parse may try again.
 */
export async function parseInBackground(source: string, cache: ParseCache, signal?: AbortSignal): Promise<boolean> {
  owners.get(cache)?.abort();
  const owner = new AbortController();
  owners.set(cache, owner);
  const abort = signal ? AbortSignal.any([owner.signal, signal]) : owner.signal;
  if (abort.aborted) return false;
  running++;
  if (idle) clearTimeout(idle);
  idle = null;
  /** Chunks parsed on the workers, each batch's nodes taken in (`adopt`) as it parsed: why one failed, if one did;
   *  null when cancelled. */
  const round = async <C extends { text: string; first: boolean }>(
    chunks: C[],
    adopt: (batch: C[], children: Root["children"][]) => void,
  ): Promise<{ failure: { why: string; transient: boolean } | null } | null> => {
    if (!chunks.length) return { failure: null };
    const ws = pool();
    // Contiguous runs of about equal size — at least one a worker, none over BATCH.
    const total = chunks.reduce((n, c) => n + c.text.length, 0);
    const target = Math.max(1, Math.min(BATCH, Math.ceil(total / ws.length)));
    const batches: C[][] = [];
    let size = 0;
    for (const c of chunks) {
      if (!batches.length || (size > 0 && size + c.text.length > target)) {
        batches.push([]);
        size = 0;
      }
      batches[batches.length - 1]!.push(c);
      size += c.text.length;
    }
    const results = await Promise.allSettled(
      batches.map((batch, i) =>
        ws[i % ws.length]!.request<{ json: string }>(
          { chunks: batch.map(({ text, first }) => ({ text, first })) },
          {
            signal: abort,
            bytes: batch.reduce((n, c) => n + c.text.length * 2 + 16, 16),
            deadline: batchDeadline(batch.reduce((n, c) => n + c.text.length, 0)),
          },
        ),
      ),
    );
    if (abort.aborted || owners.get(cache) !== owner) return null;
    // What parsed is kept, whatever else failed: a later parse sends only the rest.
    let failure: { why: string; transient: boolean } | null = null;
    for (const [i, r] of results.entries()) {
      if (r.status === "fulfilled") {
        adopt(batches[i]!, JSON.parse(r.value.json) as Root["children"][]);
        continue;
      }
      // The note's own failure (the worker's answer) says more than one about the worker.
      const own = r.reason instanceof WorkerRequestError && r.reason.kind === "failed";
      if (!failure || own)
        failure = { why: r.reason instanceof Error ? r.reason.message : String(r.reason), transient: !own };
    }
    return { failure };
  };
  try {
    const chunks = await round(
      noteChunks(source).filter((c) => !cache.chunks.has(c.text)),
      (batch, children) =>
        adoptChunks(
          cache,
          batch.map((c, k) => ({ text: c.text, children: children[k]! })),
        ),
    );
    const done =
      chunks && !chunks.failure
        ? await round(standInChunks(source, cache), (batch, children) =>
            adoptStandIns(
              cache,
              batch.map((c, k) => ({ ...c, children: children[k]! })),
            ),
          )
        : chunks;
    if (!done) return false;
    cache.backgroundFailure = done.failure ? { source, ...done.failure } : undefined;
    return !done.failure;
  } catch (error) {
    if (!abort.aborted && owners.get(cache) === owner)
      cache.backgroundFailure = {
        source,
        why: error instanceof Error ? error.message : String(error),
        transient: false,
      };
    return false;
  } finally {
    if (owners.get(cache) === owner) owners.delete(cache);
    if (--running === 0) {
      idle = setTimeout(stopParsePool, IDLE_MS);
      (idle as { unref?: () => void }).unref?.();
    }
  }
}
