// Painting reads completed math/SVG results; their expensive conversion belongs to a worker.
import { createHash } from "node:crypto";
import { notifyLoaded } from "../../../foundation/platform/lazy.ts";
import { workerUrl } from "../../../foundation/workers/url.ts";

export type PaintRequest =
  | { kind: "math"; source: string; color: string; inline: boolean }
  | { kind: "size"; source: string }
  | { kind: "png"; source: string; width: number }
  | { kind: "image-size"; source: string; at: number }
  | { kind: "image"; source: string; at: number };
export type PaintResult = string | { width: number; height: number; pixels?: Uint8Array } | Uint8Array | null;
type Job = { key: string; request: PaintRequest };

export let paintRevision = 0;

export class PaintJobs {
  private worker: Worker | null = null;
  private ready = false;
  private queue: Job[] = [];
  private pending = new Set<string>();
  private current: Job | null = null;
  private serial = 0;
  private cache = new Map<string, { value: PaintResult; bytes: number }>();
  private bytes = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private idle: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(
    private changed: () => void,
    private factory = () => new Worker(workerUrl("rendering/media/paint/paint-worker.ts")),
    private deadline = 3000,
  ) {}

  get(request: PaintRequest): PaintResult | undefined {
    if (this.closed || request.source.length > (request.kind === "math" ? 32768 : 8 * 1024 * 1024)) return null;
    const key = createHash("sha256").update(JSON.stringify(request)).digest("hex");
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit.value;
    }
    paintRevision++;
    if (this.pending.has(key) || this.pending.size >= 8) return undefined;
    this.pending.add(key);
    this.queue.push({ key, request });
    this.pump();
    return undefined;
  }

  async settle(): Promise<void> {
    while (this.pending.size && !this.closed) await new Promise((resolve) => setTimeout(resolve, 5));
  }

  private stop(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.idle) clearTimeout(this.idle);
    this.timer = this.idle = null;
    const worker = this.worker;
    this.worker = null;
    this.ready = false;
    if (worker) void worker.terminate();
  }

  private complete(value: PaintResult): void {
    if (!this.current) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const { key } = this.current;
    this.current = null;
    this.pending.delete(key);
    const bytes =
      value && typeof value === "object" && "pixels" in value && value.pixels
        ? value.pixels.byteLength
        : value instanceof Uint8Array
          ? value.byteLength
          : typeof value === "string"
            ? Buffer.byteLength(value)
            : 32;
    if (bytes > 8 * 1024 * 1024) {
      value = null;
    }
    const kept = value === null ? 32 : bytes;
    while (this.cache.size && (this.bytes + kept > 16 * 1024 * 1024 || this.cache.size >= 512)) {
      const old = this.cache.keys().next().value!;
      this.bytes -= this.cache.get(old)!.bytes;
      this.cache.delete(old);
    }
    this.cache.set(key, { value, bytes: kept });
    this.bytes += kept;
    this.changed();
    this.pump();
  }

  private pump(): void {
    if (this.closed || this.current) return;
    const job = this.queue.shift();
    if (!job) {
      (this.worker as unknown as { unref?: () => void } | null)?.unref?.();
      this.idle = setTimeout(() => this.stop(), 30000);
      this.idle.unref();
      return;
    }
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
    this.current = job;
    const id = ++this.serial;
    try {
      if (!this.worker) this.worker = this.factory();
      const worker = this.worker;
      (worker as unknown as { ref?: () => void }).ref?.();
      worker.onmessage = (event: MessageEvent<{ id: number; value: PaintResult; ready?: boolean }>) => {
        if (this.worker !== worker || this.current !== job) return;
        if (event.data.ready) {
          this.ready = true;
          worker.postMessage({ id, request: job.request });
          return;
        }
        if (this.worker === worker && event.data.id === id && this.current === job) this.complete(event.data.value);
      };
      const fail = () => {
        if (this.worker !== worker || this.current !== job) return;
        this.stop();
        this.complete(null);
      };
      worker.onerror = (event) => {
        event.preventDefault?.();
        fail();
      };
      worker.onmessageerror = fail;
      this.timer = setTimeout(fail, this.deadline);
      if (this.ready) worker.postMessage({ id, request: job.request });
    } catch {
      this.stop();
      this.complete(null);
    }
  }

  dispose(): void {
    this.closed = true;
    this.stop();
    this.queue = [];
    this.current = null;
    this.pending.clear();
    this.cache.clear();
    this.bytes = 0;
  }
}

export const paintJobs = new PaintJobs(() => notifyLoaded("pictures"));
