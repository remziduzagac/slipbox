// Another vault's backlinks, worked out on a thread of their own for the peek (#10, D259; design/tui.md § The peek):
// its graph opened afresh there — its walk, its index caught up, the notes changed since parsed and the index written
// again, or built when it had none — then a note's backlinks, other vaults' links in among them. The main thread gets
// rows to show, and the signatures of the walk and the settings, to know whether its own graph of that vault is out of
// date.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { type Config, loadConfig } from "./application/config/config.ts";
import { type Graph, openGraph } from "./graph.ts";
import { sweepTemps } from "./foundation/platform/fsutil.ts";
import { cacheDir, stateDir } from "./foundation/platform/paths.ts";
import { Reach } from "./reach.ts";
import { probeFollowed } from "./symlinks.ts";
import { configFilesFor, vaultAt } from "./vault.ts";
import { walkContext } from "./foundation/workers/worker-context.ts";
import { WorkerRequestError, WorkerRequests } from "./foundation/workers/worker-requests.ts";
import { workerUrl } from "./foundation/workers/url.ts";

/** A note of the vault at `root`, to list its backlinks; null: the vault's index caught up alone (a kept tab's). */
export interface BacklinksRequest {
  root: string;
  rel: string | null;
  /** This TUI's own vault: its state is the main thread's, never written on the thread — not even as one nested. */
  own?: string;
}

/** A backlink as the peek shows it: the linking file by its absolute path and as it's shown, the line and its text. */
export interface BacklinkRow {
  from: string;
  shown: string;
  line: number;
  text: string;
}

export type BacklinksAnswer =
  /** Home with no index: built in slices while nobody works (VV-D2), never here. */
  | { indexed: false }
  | {
      indexed: true;
      /** Its index was written here: built, or caught up — or may have been, by a run of it cut short (`cut`). */
      wrote: boolean;
      /** The other vaults whose index was written here, by their keys: those nested in it, built (`Reach.discover`). */
      others: string[];
      /** Its walk's, as `vaultSignature` gives it. */
      signature: string;
      /** The settings it was read with, as `configSignature` gives them. */
      config: string;
      rows: BacklinkRow[] | null;
    };

/** A vault's walk in a word: its notes' paths, mtimes and sizes, its other files' paths, its folders, the vaults in it. */
export function vaultSignature(g: Graph): string {
  const hash = createHash("sha1");
  for (const [rel, e] of [...g.notes].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    hash.update(`n\0${rel}\0${e.mtimeMs}\0${e.size}\n`);
  for (const rel of g.filePaths().sort()) hash.update(`f\0${rel}\n`);
  for (const rel of [...g.dirs].sort()) hash.update(`d\0${rel}\n`);
  for (const rel of g.nestedRoots().sort()) hash.update(`v\0${rel}\n`);
  return hash.digest("hex");
}

/** A vault's settings in a word, those a graph reads: its walk's (what a theme or a key is changes nothing). */
export function configSignature(config: Config): string {
  return createHash("sha1").update(JSON.stringify(config.walk)).digest("hex");
}

/** The work itself, on the worker (`backlinks-worker.ts`): the vault opened afresh, caught up, and asked. */
export async function backlinksThere(request: BacklinksRequest): Promise<BacklinksAnswer> {
  const loc = vaultAt(request.root);
  if (loc.mode === "home" && !existsSync(join(cacheDir(loc), "index.json"))) return { indexed: false };
  // A thread let go of while it wrote the index (a peek's request taking it back, slipbox quitting) left its temporary
  // file behind: gone once it's older than any write takes.
  sweepTemps(cacheDir(loc), "index.json");
  sweepTemps(stateDir(loc), "redirects.json");
  sweepTemps(stateDir(loc), "heads.json");
  // The links it follows asked whether they answer, as the walk wants them asked first (VV-D6): what was asked on
  // another thread isn't known on this one, and a folder through one not asked is left out of the walk, and the index.
  await probeFollowed(loc.root);
  const config = loadConfig({ ...configFilesFor(loc) }).config;
  const g = openGraph(loc, config, true, "lazy");
  // Home's index of another version's making, unread (VV-D2): it's as good as none — built in slices while nobody
  // works, never here. (One of this version whose every note changed since is caught up.)
  if (loc.mode === "home" && !g.indexRead) return { indexed: false };
  g.thorough = true;
  // The roots it reaches, read from the machine's list, never written to it from here: the peek records them. A note's
  // backlinks find them (`discover`), and build the index of a vault nested in it that has none; a tab's catch-up,
  // asking for none, doesn't. The others its links reach are read alone, writing nothing of theirs — this TUI's own
  // vault among them, whose state the main thread holds; each is caught up by a request of its own. Nor parsed whole
  // for a name: where a link into one lands is no backlink of this vault's note.
  const reach = new Reach(loc, {
    record: false,
    readOnly: true,
    thorough: false,
    ...(request.own ? { owned: [request.own] } : {}),
  });
  g.reach = reach;
  g.ensureAll();
  let rows: BacklinkRow[] | null = null;
  if (request.rel !== null) {
    // Code files' comments link too (16.10): their grammars, which a thread starts without.
    await g.loadGrammars();
    rows = g.backlinks(request.rel).flatMap((b) => {
      // Another vault's index may be another slipbox's: a link in it without a line isn't one to show.
      if (typeof b.from !== "string" || !Number.isInteger(b.line) || b.line < 1) return [];
      const from = isAbsolute(b.from) ? b.from : join(g.root, b.from);
      return [{ from, shown: g.shownPath(from), line: b.line, text: typeof b.text === "string" ? b.text : "" }];
    });
  }
  return {
    indexed: true,
    // Its own write, not a file's mtime: one written meanwhile by another is no write of this one's, and a coarse
    // clock can give a write the mtime it had.
    wrote: g.writtenAt !== null,
    others: reach.written(),
    signature: vaultSignature(g),
    config: configSignature(config),
    rows,
  };
}

/** Idle this long, the thread stops (its memory back); the next peek starts it again. */
const IDLE_MS = 60_000;
/** A request's time on the thread: the net for one that's stuck, not a budget — a big vault never indexed parses for
 *  minutes (8 s for 5,000 notes measured). */
const DEADLINE = 10 * 60_000;

let requests: WorkerRequests | null = null;
/** The environment the thread was started with: changed (a test's sandbox), it's started again. */
let startedIn = "";
let idle: ReturnType<typeof setTimeout> | null = null;
type Waiting = { request: BacklinksRequest; resolve: (a: BacklinksAnswer | null) => void; reject: (e: Error) => void };
/**
 * The request the thread has, how to take it back, and the tabs' catch-ups of its vault riding on it: answered with
 * its answer, waiting again if it's taken back.
 */
type Running = { job: Waiting; abort: AbortController; riders: Waiting[] };
let running: Running | null = null;
/** The newest peek's request, waiting for the one running: an older one waiting is answered null (moved on). */
let next: Waiting | null = null;
/**
 * Vaults whose request was taken back mid-run: it may have written their index, unsaid — the next answer for one says
 * it was written, so its index is read again.
 */
const cut = new Set<string>();
/**
 * Vaults whose index is wanted caught up — a kept tab's, a graph reached for a link (each its own graph, held by its
 * own reach) — after the peeks' requests: every one asking a vault answered with its one run.
 */
const refresh = new Map<string, Waiting[]>();

/** How the thread starts (a test's own fails to). */
export const backlinkThread = {
  // It sees the environment as this process has it now (where the cache is, a test's sandbox), not as it started: Bun
  // gives a worker the starting one otherwise.
  factory: (): Worker =>
    new Worker(workerUrl("backlinks-worker.ts"), { env: { ...process.env } as Record<string, string> }),
};

function channel(): WorkerRequests {
  const env = JSON.stringify(process.env);
  if (requests && startedIn !== env) {
    requests.dispose();
    requests = null;
  }
  startedIn = env;
  // No cap on an answer: a note linked from thousands lists them all, as it did on the main thread.
  requests ??= new WorkerRequests(() => backlinkThread.factory(), { deadline: DEADLINE, result: Infinity });
  return requests;
}

/** An answer as the thread gave it, checked against what was asked: a thread's message is data like any. */
function checked(a: unknown, request: BacklinksRequest): BacklinksAnswer {
  const v = (a ?? {}) as { [K in keyof Extract<BacklinksAnswer, { indexed: true }>]?: unknown };
  if (v.indexed === false) return { indexed: false };
  const row = (r: Partial<BacklinkRow>) =>
    typeof r?.from === "string" &&
    typeof r.shown === "string" &&
    typeof r.text === "string" &&
    Number.isInteger(r.line) &&
    r.line! > 0;
  if (
    v.indexed !== true ||
    typeof v.wrote !== "boolean" ||
    !Array.isArray(v.others) ||
    !v.others.every((k) => typeof k === "string") ||
    typeof v.signature !== "string" ||
    typeof v.config !== "string" ||
    !(request.rel === null ? v.rows === null : Array.isArray(v.rows) && v.rows.every(row))
  )
    throw new Error("the thread's answer isn't one");
  const rows = v.rows as BacklinkRow[] | null;
  const others = v.others as string[];
  return { indexed: true, wrote: v.wrote, others, signature: v.signature, config: v.config, rows };
}

function pump(): void {
  if (running) return;
  const first = refresh.keys().next();
  const job = next ?? (first.done ? null : refresh.get(first.value)![0]!);
  if (!job) return;
  if (job === next) next = null;
  const abort = new AbortController();
  const mine: Running = { job, abort, riders: [] };
  // The catch-ups of the vault this one opens, waiting: they ride on this one.
  const riding = refresh.get(job.request.root) ?? [];
  refresh.delete(job.request.root);
  mine.riders.push(...riding.filter((w) => w !== job));
  running = mine;
  if (idle) clearTimeout(idle);
  idle = null;
  // Settled, it runs no more — before its caller hears, who may ask again at once: a request answered is never taken
  // back for a peek's, nor run again.
  const over = () => {
    if (running === mine) running = null;
  };
  // What this thread knows, as it is now, taken as the thread's own (T12): the root markers your config names — else
  // its walk finds other vaults than this one does — its environment, and the followed links' answers.
  channel()
    .request<unknown>({ ...job.request, context: walkContext() }, { signal: abort.signal })
    .then((a) => checked(a, job.request))
    .then(
      (a) => {
        over();
        const root = job.request.root;
        // Said written once it's read: a run that couldn't read it (home's of another version) keeps the mark.
        job.resolve(a.indexed && cut.delete(root) ? { ...a, wrote: true } : a);
        // Its index written once, by this one's: said once, by its own caller.
        for (const r of mine.riders) r.resolve(a.indexed ? { ...a, rows: null, wrote: false, others: [] } : a);
      },
      (e) => {
        // Taken back (`askBacklinks`): what waits again is waiting; stopped (slipbox quitting), nobody to answer.
        if (abort.signal.aborted) return;
        over();
        // Failed: every one riding on it hears so, its graph there parsed where it's held (`peek.ts`).
        const stopped = e instanceof WorkerRequestError && e.kind === "stopped";
        for (const w of [job, ...mine.riders]) {
          if (stopped) w.resolve(null);
          else w.reject(e);
        }
      },
    )
    .finally(() => {
      over();
      if (next || refresh.size) return pump();
      if (running) return;
      idle = setTimeout(stopBacklinkJobs, IDLE_MS);
      (idle as { unref?: () => void }).unref?.();
    });
}

/** A catch-up waiting (again, taken back), with the others of its vault. */
function waitAgain(job: Waiting): void {
  const waiting = refresh.get(job.request.root);
  if (waiting) waiting.push(job);
  else refresh.set(job.request.root, [job]);
}

/**
 * A note's backlinks in the vault at `root`, worked out on the thread — or, `rel` null, that vault's index caught up
 * alone, for a kept tab. One request runs at a time; null: moved on, or the thread stopped.
 *
 * - A peek's newest waits for the one running; an older one waiting is answered null.
 * - A peek's request takes back what runs for another vault — its thread let go, what it parsed kept in the parse cache
 *   (20.11): a tab's catch-up waits again; a peek's is answered null (its peek is gone; it asks its catch-up again).
 *   Else a big vault's index built for a tab, or for a peek closed since, would keep every peek waiting. What runs for
 *   its own vault it waits for: that work is its own, and the index it writes is read at once.
 * - A tab's catch-up rides on the request of its vault that runs, or starts — answered with its answer, waiting again
 *   if it's taken back; every one waiting for one vault is answered by its one run.
 */
export function askBacklinks(request: BacklinksRequest): Promise<BacklinksAnswer | null> {
  return new Promise((resolve, reject) => {
    const job = { request, resolve, reject };
    const root = request.root;
    if (request.rel === null) {
      if (running?.job.request.root === root) return void running.riders.push(job);
      waitAgain(job);
    } else {
      next?.resolve(null);
      next = job;
      const r = running;
      if (r && r.job.request.root !== root) {
        running = null;
        cut.add(r.job.request.root);
        if (r.job.request.rel !== null) r.job.resolve(null);
        else waitAgain(r.job);
        for (const rider of r.riders) waitAgain(rider);
        r.abort.abort();
      }
    }
    pump();
  });
}

let stops = 0;

/** How many times the thread was stopped: a request answered null since it was asked, if it changed, was stopped. */
export function backlinkStops(): number {
  return stops;
}

/** The thread stopped, every request waiting answered null; a later request starts it again. */
export function stopBacklinkJobs(): void {
  stops++;
  if (idle) clearTimeout(idle);
  idle = null;
  next?.resolve(null);
  next = null;
  for (const jobs of refresh.values()) for (const job of jobs) job.resolve(null);
  refresh.clear();
  cut.clear();
  if (running) {
    running.job.resolve(null);
    for (const r of running.riders) r.resolve(null);
    running.abort.abort();
    running = null;
  }
  requests?.dispose();
  requests = null;
}
