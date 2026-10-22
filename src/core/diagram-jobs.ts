// A bounded queue and cache shared by diagram layouts. Only one worker renders at a time.
import { diagramKey, type DiagramStore } from "./diagram-cache.ts";
import type { DrawingColors, Drawn } from "./diagram-render.ts";
import { workerUrl } from "./workers.ts";

export type DiagramRequest =
  | { kind: "text"; source: string; width: number; ascii: boolean; scroll: boolean }
  | { kind: "svg"; source: string; colors: DrawingColors; family: string };
type Result = Drawn | string | null;
type Job = { key: string; request: DiagramRequest; done: () => void; promise: Promise<void> };
const MAX_ENTRIES = 2048;
const MAX_BYTES = 2 * 1024 * 1024;
const failure = (why: string): Drawn => ({ why });

type DiagramPolicy = {
  deadline: number;
  startup: number;
  batch: boolean;
  cacheBudget: number;
  timeoutRetries: 0 | 1;
};
const SCREEN_POLICY: DiagramPolicy = {
  deadline: 500,
  startup: 2000,
  batch: false,
  cacheBudget: MAX_BYTES,
  timeoutRetries: 1,
};
export const BATCH_DIAGRAM_POLICY: Readonly<DiagramPolicy> = {
  deadline: 5000,
  startup: 2000,
  batch: true,
  cacheBudget: 16 * MAX_BYTES,
  timeoutRetries: 0,
};

/** One worker, replaceable in tests to exercise deadlines and late deliveries with ordinary input. */
export class DiagramJobs {
  private worker: Worker | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private idle: ReturnType<typeof setTimeout> | null = null;
  private serial = 0;
  private current: Job | null = null;
  private pending = new Map<string, Job>();
  private queue: Job[] = [];
  private cache = new Map<string, { value: Result; bytes: number }>();
  private bytes = 0;
  private ready = false;
  private full = false;
  private disposed = false;
  private retries = new Map<string, number>();

  private policy: DiagramPolicy;

  constructor(
    private changed: () => void,
    private factory = () => new Worker(workerUrl("diagram-worker.ts")),
    policy: Partial<DiagramPolicy> = {},
    private readonly store: () => DiagramStore | null = () => null,
  ) {
    this.policy = { ...SCREEN_POLICY, ...policy };
  }

  get(request: DiagramRequest): Result | undefined {
    if (this.disposed) return failure("diagram renderer closed");
    if (request.source.length > 32768) return failure("source too large to draw");
    const key = diagramKey(request);
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.value;
    }
    if (this.pending.has(key)) return undefined;
    const disk = this.store();
    const saved = disk?.get(key) ?? disk?.get(this.failureKey(key));
    if (saved !== undefined) {
      this.remember(key, saved);
      return this.cache.get(key)?.value ?? failure("document drawing cache full");
    }
    if (this.policy.batch && this.full) return failure("document drawing cache full");
    if (this.pending.size >= 8) return undefined;
    let done!: () => void;
    const promise = new Promise<void>((resolve) => {
      done = resolve;
    });
    const job = { key, request, done, promise };
    this.pending.set(key, job);
    this.queue.push(job);
    this.pump();
    return undefined;
  }

  busy(): boolean {
    return this.pending.size > 0;
  }

  async settle(): Promise<void> {
    while (this.pending.size) await Promise.all([...this.pending.values()].map((job) => job.promise));
  }

  private stop(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.idle) clearTimeout(this.idle);
    this.timer = this.idle = null;
    const worker = this.worker;
    this.worker = null;
    this.ready = false;
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      void worker.terminate();
    }
  }

  private finish(value: Result): void {
    const job = this.current;
    if (!job) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.current = null;
    this.remember(job.key, value);
    const final = this.cache.get(job.key)?.value;
    if (final !== undefined) {
      if (final === null || (typeof final === "object" && "why" in final)) {
        const why = final?.why;
        // Kept on disk: the failures the source and rendering inputs decide (a timeout too, as #180 asks). Not the
        // worker unavailable or slow to start: those recover without anything changing.
        if (
          why === "took too long to draw" ||
          why === "drawing output too large" ||
          why === "render limit reached" ||
          why?.startsWith("not drawn:") ||
          why === "nothing to draw" ||
          why === "too wide to draw"
        ) {
          this.store()?.put(this.failureKey(job.key), final);
        }
      } else this.store()?.put(job.key, final);
    }
    this.pending.delete(job.key);
    job.done();
    this.pump();
    this.changed();
  }

  private failureKey(key: string): string {
    return `${key}:${this.policy.deadline}:${this.policy.startup}:${this.policy.timeoutRetries}`;
  }

  private remember(key: string, value: Result): void {
    if (JSON.stringify(value).length * 2 > MAX_BYTES / 2) value = failure("drawing output too large");
    const size = JSON.stringify(value).length * 2;
    if (this.policy.batch && (this.bytes + size > this.policy.cacheBudget || this.cache.size >= MAX_ENTRIES)) {
      this.full = true;
      return;
    }
    while ((this.bytes + size > this.policy.cacheBudget || this.cache.size >= MAX_ENTRIES) && !this.policy.batch) {
      const oldest = this.cache.keys().next().value!;
      this.bytes -= this.cache.get(oldest)!.bytes;
      this.cache.delete(oldest);
      this.retries.delete(oldest);
    }
    this.cache.set(key, { value, bytes: size });
    this.bytes += size;
  }

  private fail(why = "diagram worker unavailable"): void {
    const job = this.current;
    this.stop();
    if (job && why === "took too long to draw" && this.policy.timeoutRetries > 0 && !this.retries.has(job.key)) {
      this.retries.set(job.key, 1);
      this.current = null;
      this.queue.unshift(job);
      this.pump();
      return;
    }
    this.finish(failure(why));
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    for (const job of this.pending.values()) job.done();
    this.pending.clear();
    this.queue = [];
    this.current = null;
    this.cache.clear();
    this.retries.clear();
    this.bytes = 0;
  }

  private pump(): void {
    if (this.current) return;
    if (!this.queue.length) {
      if (this.worker) {
        this.idle = setTimeout(() => this.stop(), 30000);
        this.idle.unref();
      }
      return;
    }
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
    this.current = this.queue.shift()!;
    if (!this.worker) {
      try {
        const worker = this.factory();
        this.worker = worker;
        (worker as unknown as { unref?: () => void }).unref?.();
        worker.onmessage = (event: MessageEvent) => {
          if (this.worker !== worker) return;
          if (event.data.ready && !this.ready) {
            this.ready = true;
            this.send();
          } else if (event.data.id === this.serial && this.current) {
            this.finish(event.data.value ?? null);
          }
        };
        worker.onerror = (event) => {
          event.preventDefault();
          if (this.worker === worker) this.fail();
        };
        this.timer = setTimeout(() => this.fail("diagram worker took too long to start"), this.policy.startup);
      } catch {
        this.fail();
      }
    } else this.send();
  }

  private send(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fail("took too long to draw"), this.policy.deadline);
    try {
      this.worker!.postMessage({ id: ++this.serial, request: this.current!.request });
    } catch {
      this.fail();
    }
  }
}
