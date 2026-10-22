// A worker's requests, one at a time (15.1, 25.6): a bounded mailbox in front of it, and a line behind the mailbox.
// Up to `requests` requests and `bytes` of their input are held for the worker at once; a caller past either waits
// its turn in the line, never refused (one request larger than `bytes` alone is held too). The deadline counts from
// when the worker is handed the request, not the wait. A deadline, a crash or a request that can't be sent fails that
// request alone: the worker is started afresh for the requests behind it. Every request settles — answered, failed,
// cancelled, or stopped with the mailbox. Workers must install their message handler before awaiting initialization.

/** Why a request failed: `failed` is the worker's own answer (the work itself went wrong); the rest are about the
 *  worker, the wait or the caller, not the work. */
export type WorkerFailure = "cancelled" | "deadline" | "crashed" | "unavailable" | "stopped" | "result" | "failed";

export class WorkerRequestError extends Error {
  constructor(
    message: string,
    readonly kind: WorkerFailure,
  ) {
    super(message);
  }
}

export interface WorkerLimits {
  /** How long the worker has for a request, from when it's handed it (ms). */
  deadline?: number;
  /** Requests held for the worker at once. */
  requests?: number;
  /** Input held for the worker at once (bytes, as `sizeOf` counts). */
  bytes?: number;
  /** The largest answer taken (bytes, as `sizeOf` counts); Infinity for none. */
  result?: number;
}

type Job = {
  id: number;
  request: object;
  bytes: number;
  /** Its own deadline (ms), past the mailbox's. */
  deadline?: number;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
};

/** About how many bytes a message holds — its strings' UTF-16, a few for each other value — without serializing it. */
export function sizeOf(value: unknown): number {
  let total = 0;
  const stack: unknown[] = [value];
  while (stack.length) {
    const v = stack.pop();
    if (typeof v === "string") total += v.length * 2;
    else if (Array.isArray(v)) {
      total += 8;
      for (const x of v) stack.push(x);
    } else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        total += k.length * 2;
        stack.push(x);
      }
    } else total += 8;
  }
  return total;
}

export class WorkerRequests {
  private worker: Worker | null = null;
  private serial = 0;
  /** Held for the worker, in order: the first is the one it has, once sent. */
  private held: Job[] = [];
  /** Waiting for room in `held`, in order. */
  private line: Job[] = [];
  private heldBytes = 0;
  /** The first held request's id once the worker has it, and its deadline. */
  private sent: { id: number; timer: ReturnType<typeof setTimeout> } | null = null;
  private closed = false;
  private readonly limits: Required<WorkerLimits>;

  constructor(
    private factory: () => Worker,
    limits: WorkerLimits = {},
  ) {
    this.limits = { deadline: 10_000, requests: 8, bytes: 8 * 1024 * 1024, result: 16 * 1024 * 1024, ...limits };
  }

  /** Requests and input held for the worker now, and callers waiting behind them (tests). */
  get pending(): { requests: number; bytes: number; waiting: number } {
    return { requests: this.held.length, bytes: this.heldBytes, waiting: this.line.length };
  }

  /** Answer a request; `bytes` is its input's size when the caller knows it better or cheaper than `sizeOf`, `deadline`
   *  its own time on the worker when the work it is says so better than the mailbox's. */
  request<T>(request: object, opts: { signal?: AbortSignal; bytes?: number; deadline?: number } = {}): Promise<T> {
    const { signal } = opts;
    if (this.closed || signal?.aborted)
      return Promise.reject(new WorkerRequestError("worker request cancelled", this.closed ? "stopped" : "cancelled"));
    return new Promise<T>((resolve, reject) => {
      const job: Job = {
        id: ++this.serial,
        request,
        bytes: opts.bytes ?? sizeOf(request),
        deadline: opts.deadline,
        resolve: resolve as (v: unknown) => void,
        reject,
        cleanup: () => {},
      };
      const cancel = () => {
        // The worker had it: stopped, the requests behind it go to a fresh one.
        if (this.sent?.id === job.id) this.detach();
        this.finish(job, undefined, new WorkerRequestError("worker request cancelled", "cancelled"));
      };
      signal?.addEventListener("abort", cancel, { once: true });
      job.cleanup = () => signal?.removeEventListener("abort", cancel);
      this.line.push(job);
      this.admit();
      this.pump();
    });
  }

  /** Callers from the line into the mailbox while there's room, in order. */
  private admit(): void {
    while (this.line.length) {
      const next = this.line[0]!;
      const room =
        this.held.length === 0 ||
        (this.held.length < this.limits.requests && this.heldBytes + next.bytes <= this.limits.bytes);
      if (!room) return;
      this.line.shift();
      this.held.push(next);
      this.heldBytes += next.bytes;
    }
  }

  /** The first held request to the worker, when it has none: one that can't be sent fails, and the next goes. */
  private pump(): void {
    while (!this.sent) {
      const job = this.held[0];
      if (!job) {
        (this.worker as (Worker & { unref?: () => void }) | null)?.unref?.();
        return;
      }
      try {
        const worker = this.worker ?? this.start();
        (worker as Worker & { ref?: () => void }).ref?.();
        worker.postMessage({ ...job.request, id: job.id });
        const timer = setTimeout(() => {
          this.detach();
          this.finish(job, undefined, new WorkerRequestError("worker request deadline exceeded", "deadline"));
        }, job.deadline ?? this.limits.deadline);
        this.sent = { id: job.id, timer };
      } catch (error) {
        this.detach();
        this.finish(job, undefined, new WorkerRequestError(`worker could not run: ${error}`, "unavailable"), false);
      }
    }
  }

  private start(): Worker {
    const worker = this.factory();
    this.worker = worker;
    worker.onmessage = (event: MessageEvent) => {
      if (this.worker !== worker) return;
      const job = this.held[0];
      if (!job || this.sent?.id !== job.id) return;
      const data = event.data;
      if (!data || typeof data !== "object") {
        this.detach();
        return this.finish(job, undefined, new WorkerRequestError("invalid worker response", "crashed"));
      }
      if (data.id !== job.id) return;
      if (this.limits.result !== Infinity && sizeOf(data) > this.limits.result)
        return this.finish(job, undefined, new WorkerRequestError("worker result capacity reached", "result"));
      this.finish(job, data, data.error ? new WorkerRequestError(String(data.error), "failed") : undefined);
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      if (this.worker !== worker) return;
      const why = `worker stopped unexpectedly: ${(event as ErrorEvent).message || "no reason given"}`;
      const job = this.sent ? this.held[0] : undefined;
      this.detach();
      if (job) this.finish(job, undefined, new WorkerRequestError(why, "crashed"));
    };
    return worker;
  }

  /** A request settled, held or still waiting: its room to the next caller, and the worker to the next request. */
  private finish(job: Job, value?: unknown, error?: Error, pump = true): void {
    const held = this.held.indexOf(job);
    if (held >= 0) {
      this.held.splice(held, 1);
      this.heldBytes -= job.bytes;
    } else {
      const waiting = this.line.indexOf(job);
      if (waiting < 0) return;
      this.line.splice(waiting, 1);
    }
    if (this.sent?.id === job.id) {
      clearTimeout(this.sent.timer);
      this.sent = null;
    }
    job.cleanup();
    if (error) job.reject(error);
    else job.resolve(value);
    this.admit();
    if (pump) this.pump();
  }

  /** The worker let go of (terminated); the next request starts another. */
  private detach(): void {
    const worker = this.worker;
    this.worker = null;
    if (this.sent) {
      clearTimeout(this.sent.timer);
      this.sent = null;
    }
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      try {
        void worker.terminate();
      } catch {}
    }
  }

  /** The worker stopped, and every request held or waiting failed with why; a later request starts another. */
  stop(error = new WorkerRequestError("worker stopped", "stopped")): void {
    this.detach();
    const jobs = [...this.held.splice(0), ...this.line.splice(0)];
    this.heldBytes = 0;
    for (const job of jobs) {
      job.cleanup();
      job.reject(error);
    }
  }

  /** Stopped for good: later requests are refused. */
  dispose(): void {
    this.closed = true;
    this.stop();
  }
}
