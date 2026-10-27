// Plain searches keep their cheap path. Native regex matching runs in a worker, stopped at a deadline its input sets.
import { createHash } from "node:crypto";
import { everyMatch, findAll, MatchLimitError, type MatchLimits, SHOWN_MATCHES, type TextMatch } from "./replace.ts";
import { notifyLoaded } from "./foundation/platform/lazy.ts";
import { WorkerRequests } from "./foundation/workers/worker-requests.ts";
import { workerUrl } from "./foundation/workers/url.ts";
export const REGEX = "regex";
export type RegexRequest = { source: string; flags: string } & (
  | { kind: "text"; text: string; from: number; to: number; empty: boolean; limits: MatchLimits }
  | { kind: "layout"; lines: string[] }
  | {
      kind: "confirm";
      text: string;
      replacement: string;
      global: boolean;
      end: number;
      pos: number;
      lastEnd?: number;
      eol: string;
    }
);
export type MatchResult = { matches: TextMatch[]; limited: boolean };
export type LayoutMatches = { matches: { row: number; from: number; to: number }[]; limited: boolean };
// Answers have no size cap of the mailbox's: the worker bounds its own by its input (`everyMatch`, `SHOWN_MATCHES`).
const jobs = new WorkerRequests(() => new Worker(workerUrl("regex-worker.ts")), { result: Infinity });

/** A request's deadline: 1.5 seconds, and a second more for each million characters it matches in. A regex that
 *  never finishes still stops within 1.5 seconds on a short note; a big note's every match has the time to be found
 *  and sent. */
export const regexDeadline = (chars: number): number => 1500 + chars / 1000;

/**
 * The matches of `re` in `text`, a regex's in the worker. Every match, however many, unless `show`: a find's, its first
 * matches (`SHOWN_MATCHES`), marked `limited` when there are more. Only captures outgrowing their text cut every match
 * short (`everyMatch`): refused, as a replace must be, unless `partial` takes it marked `limited` (the CLI's find).
 */
export async function matchText(
  text: string,
  re: RegExp,
  options: {
    regex?: boolean;
    from?: number;
    to?: number;
    empty?: boolean;
    show?: boolean;
    partial?: boolean;
    signal?: AbortSignal;
    requests?: Pick<WorkerRequests, "request">;
  } = {},
): Promise<MatchResult> {
  const from = options.from ?? 0;
  const to = options.to ?? text.length;
  const limits = options.show ? SHOWN_MATCHES : everyMatch(to - from);
  let result: MatchResult;
  if (options.regex)
    result = await (options.requests ?? jobs).request<MatchResult>(
      {
        kind: "text",
        text,
        source: re.source,
        flags: re.flags,
        from,
        to,
        empty: options.empty ?? false,
        limits,
      },
      { signal: options.signal, deadline: regexDeadline(text.length) },
    );
  else {
    try {
      result = { matches: findAll(text, re, from, to, options.empty, limits), limited: false };
    } catch (error) {
      if (!(error instanceof MatchLimitError)) throw error;
      result = { matches: error.matches, limited: true };
    }
  }
  if (result.limited && !options.show && !options.partial)
    throw new Error("the matches' captures outgrow the text; no replacement was made");
  return result;
}

type Entry = { value?: LayoutMatches; error?: string; pending: Promise<void>; abort: AbortController; bytes: number };
const cache = new Map<string, Entry>();
const owners = new WeakMap<object, { key: string; abort: AbortController }>();
const ownerIds = new WeakMap<object, number>();
let ownerSerial = 0;
let retained = 0;
export function layoutMatches(lines: string[], re: RegExp, owner: object): Entry {
  const request: RegexRequest = { kind: "layout", lines, source: re.source, flags: re.flags };
  if (!ownerIds.has(owner)) ownerIds.set(owner, ++ownerSerial);
  const key = `${ownerIds.get(owner)}:` + createHash("sha256").update(JSON.stringify(request)).digest("hex");
  const previous = owners.get(owner);
  if (previous && previous.key !== key) previous.abort.abort();
  let cached = cache.get(key);
  if (cached?.abort.signal.aborted && !cached.value) {
    cache.delete(key);
    retained -= cached.bytes;
    cached = undefined;
  }
  if (cached) {
    owners.set(owner, { key, abort: cached.abort });
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  const abort = new AbortController();
  owners.set(owner, { key, abort });
  const entry: Entry = { pending: Promise.resolve(), abort, bytes: 0 };
  cache.set(key, entry);
  entry.pending = jobs
    .request<LayoutMatches>(request, {
      signal: abort.signal,
      deadline: regexDeadline(lines.reduce((n, line) => n + line.length, 0)),
    })
    .then((value) => {
      if (cache.get(key) !== entry) return;
      entry.value = value;
      entry.bytes = JSON.stringify(value).length * 2;
      retained += entry.bytes;
    })
    .catch((error: Error) => {
      if (cache.get(key) !== entry) return;
      if (abort.signal.aborted) {
        cache.delete(key);
        retained -= entry.bytes;
      } else entry.error = error.message;
    })
    .finally(() => {
      while (cache.size > 32 || retained > 4 * 1024 * 1024) {
        const oldest = cache.keys().next().value!;
        const old = cache.get(oldest)!;
        cache.delete(oldest);
        retained -= old.bytes;
        old.abort.abort();
      }
      notifyLoaded(REGEX);
    });
  return entry;
}
export function stopRegexJobs(): void {
  jobs.stop();
  for (const entry of cache.values()) entry.abort.abort();
  cache.clear();
  retained = 0;
}

/** Compute every remaining confirming edit before committing any of them. Offsets follow preceding edits. */
export async function confirmRest(
  text: string,
  c: { re: RegExp; replacement: string; global: boolean; range: [number, number]; pos: number; lastEnd?: number },
  eol: string,
): Promise<{ from: number; length: number; text: string }[]> {
  const result = await jobs.request<{ edits: { from: number; length: number; text: string }[] }>(
    {
      kind: "confirm",
      text,
      source: c.re.source,
      flags: c.re.flags,
      replacement: c.replacement,
      global: c.global,
      end: c.range[1],
      pos: c.pos,
      lastEnd: c.lastEnd,
      eol,
    },
    { deadline: regexDeadline(text.length) },
  );
  return result.edits;
}

export function cancelRegex(owner: object): void {
  owners.get(owner)?.abort.abort();
  owners.delete(owner);
}

/** The owner's search asked for again: if it failed, it isn't answered from the cache but tried afresh. */
export function retryRegex(owner: object): void {
  const current = owners.get(owner);
  const entry = current && cache.get(current.key);
  if (!current || entry?.error === undefined) return;
  cache.delete(current.key);
  owners.delete(owner);
}
