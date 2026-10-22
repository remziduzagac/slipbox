// Whole export jobs run away from the screen (10.x): each in a worker of its own (`export-worker.ts`), with its own
// graph, assembly and writer. Only the owner — the command line or the TUI — writes the output, once complete.
import { PreparedExport } from "./spool.ts";
import { isAbsolute } from "node:path";
import type { Config } from "../config.ts";
import { climbsOut } from "../fsutil.ts";
import { Graph } from "../graph.ts";
import { Reach } from "../reach.ts";
import type { VaultLocation } from "../vault.ts";
import { workerUrl } from "../workers.ts";
import type { ExportOutput } from "./index.ts";

export type ExportStage = "reading" | "assembling" | "writing";
export interface ExportRequest {
  loc: VaultLocation;
  config: Config;
  asked: string[];
  thorough: boolean;
  /** The owner's graph reads the persisted index: the worker's does too, not parsing the vault anew. */
  cache: boolean;
  reach: boolean;
  names: { rel: string; aliases: string[]; previous: string[] }[];
  rels: string[];
  format: string;
  target: string;
  /** Private output staging supplied by the owner, never the export destination. */
  spool?: string;
}
export interface ExportJobOptions {
  signal?: AbortSignal;
  progress?: (stage: ExportStage) => void;
}

/** Jobs running at once; one more waits its turn, in order, never refused. */
const AT_ONCE = 2;
let running = 0;
/** Jobs waiting for a turn, in order: each woken with the turn of the job that ended. */
const waiting: (() => void)[] = [];

/** A turn, once a job running ends and hands it over; cancelled while waiting, given up. */
function turn(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const take = () => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    };
    const cancel = () => {
      const at = waiting.indexOf(take);
      if (at >= 0) waiting.splice(at, 1);
      reject(Error("export cancelled"));
    };
    waiting.push(take);
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

/** The graph a job's worker exports from: the owner's root, settings and names, its index read as the owner's is —
 *  a vault's notes parsed already are taken from it, not parsed again. */
export function exportGraph(request: ExportRequest): Graph {
  const graph = new Graph(request.loc, request.config, request.asked).build(request.cache, "lazy");
  graph.thorough = request.thorough;
  if (request.reach) graph.reach = new Reach(request.loc);
  for (const names of request.names) {
    const entry = graph.notes.get(names.rel);
    if (entry) Object.assign(entry, { aliases: names.aliases, previous: names.previous });
  }
  return graph;
}

export class ExportJob {
  // The worker sees the environment as this process has it now (where the cache is, a test's sandbox), not as it
  // started: Bun gives a worker the starting one otherwise.
  constructor(
    private factory = () =>
      new Worker(workerUrl("export-worker.ts"), { env: { ...process.env } as Record<string, string> }),
  ) {}

  /** The export's output, once its worker is done: started now, or when its turn comes, and given as long as it takes,
   *  unless `signal` cancels it. */
  async run(request: ExportRequest, options: ExportJobOptions = {}): Promise<ExportOutput> {
    return this.execute(request, options, (message) => {
      const out = message.output;
      if (!out || !(out.data instanceof Uint8Array) || !Array.isArray(out.files)) throw Error("invalid export result");
      for (const file of out.files)
        if (
          !(file.data instanceof Uint8Array) ||
          typeof file.path !== "string" ||
          isAbsolute(file.path) ||
          climbsOut(file.path) ||
          file.path.includes("\0")
        )
          throw Error("invalid export attachment");
      return out;
    });
  }

  /** Production exports return only a manifest; bytes stay in private files until publication. */
  async prepare(request: ExportRequest, options: ExportJobOptions = {}): Promise<PreparedExport> {
    const dir = await PreparedExport.directory();
    try {
      const value = await this.execute({ ...request, spool: dir }, options, (message) => {
        if (!message.prepared) throw Error("invalid staged export");
        return message.prepared;
      });
      options.signal?.throwIfAborted();
      return await PreparedExport.take(dir, value, options.signal);
    } catch (error) {
      await PreparedExport.remove(dir);
      throw error;
    }
  }

  private async execute<T>(
    request: ExportRequest,
    options: ExportJobOptions,
    decode: (message: { output?: ExportOutput; prepared?: unknown }) => T,
  ): Promise<T> {
    if (options.signal?.aborted) throw Error("export cancelled");
    if (running < AT_ONCE) running++;
    else await turn(options.signal);
    try {
      return await this.inWorker(request, options, decode);
    } finally {
      const next = waiting.shift();
      if (next) next();
      else running--;
    }
  }

  private inWorker<T>(
    request: ExportRequest,
    options: ExportJobOptions,
    decode: (message: { output?: ExportOutput; prepared?: unknown }) => T,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let worker: Worker | null = null;
      let settled = false;
      let started = false;
      const finish = (error?: Error, value?: T) => {
        if (settled) return;
        settled = true;
        options.signal?.removeEventListener("abort", cancel);
        if (worker) {
          worker.onmessage = null;
          worker.onerror = null;
          worker.onmessageerror = null;
          try {
            void worker.terminate();
          } catch {}
        }
        if (error) reject(error);
        else resolve(value!);
      };
      const cancel = () => finish(Error("export cancelled"));
      if (options.signal?.aborted) return cancel();
      try {
        worker = this.factory();
        const owned = worker;
        worker.onmessage = (
          event: MessageEvent<{
            ready?: boolean;
            stage?: ExportStage;
            error?: string;
            output?: ExportOutput;
            prepared?: unknown;
          }>,
        ) => {
          if (settled) return;
          try {
            const message = event.data;
            if (message.ready) {
              if (started) return;
              started = true;
              return owned.postMessage(request);
            }
            if (message.stage) {
              options.progress?.(message.stage);
              return;
            }
            if (message.error) return finish(Error(message.error));
            finish(undefined, decode(message));
          } catch (error) {
            finish(error as Error);
          }
        };
        worker.onerror = (event) => {
          event.preventDefault?.();
          finish(Error(`export worker stopped: ${(event as ErrorEvent).message}`));
        };
        worker.onmessageerror = () => finish(Error("export worker response could not be read"));
        options.signal?.addEventListener("abort", cancel, { once: true });
      } catch (error) {
        finish(error as Error);
      }
    });
  }
}

export function backgroundExport(
  graph: Graph,
  rels: string[],
  format: string,
  target: string,
  options?: ExportJobOptions,
): Promise<ExportOutput> {
  return new ExportJob().run(exportRequest(graph, rels, format, target), options);
}

export function prepareExport(
  graph: Graph,
  rels: string[],
  format: string,
  target: string,
  options?: ExportJobOptions,
): Promise<PreparedExport> {
  return new ExportJob().prepare(exportRequest(graph, rels, format, target), options);
}

function exportRequest(graph: Graph, rels: string[], format: string, target: string): ExportRequest {
  return {
    loc: graph.loc,
    config: graph.config,
    asked: [...graph.askedFolders],
    rels,
    format,
    target,
    thorough: graph.thorough,
    cache: graph.usesCache,
    reach: graph.reach !== null,
    names: [...graph.notes]
      .filter(([, entry]) => entry.aliases.length || entry.previous.length)
      .map(([rel, entry]) => ({ rel, aliases: entry.aliases, previous: entry.previous })),
  };
}
