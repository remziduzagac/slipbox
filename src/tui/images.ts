// Images on the internet (plan 12.12): fetched only as `[render] images_remote` says — `show`, or `ask` once you've said
// yes (this once, or for its site) — into the cache, a file per address, and drawn from there as a local one is. A fetch
// is an image's or nothing: a timeout, a size cap, an image's content type.

import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import { extname, join } from "node:path";
import { remoteImageName } from "../core/rendering/media/images/imagecache.ts";
import { cacheHome, ensureCacheHome } from "../core/foundation/platform/paths.ts";
import { looksLikeSvg } from "../core/rendering/media/images/svg.ts";

/** An SVG read for drawing is at most this big (12.15). */
const MAX_SVG_BYTES = 8 * 1024 * 1024;

/** The most of a picture the screen shows (PIC-D2): what's decoded for it, a megapixel and 2,048 pixels a side. */
export const SCREEN_PIXELS = 1_000_000;
export const SCREEN_SIDE = 2048;
/** The least a picture is shrunk to fit its window's height (PIC-D1): 12 rows tall, or 20 columns wide. */
export const FLOOR_ROWS = 12;
export const FLOOR_COLS = 20;

export interface Cells {
  cols: number;
  rows: number;
}

/**
 * A picture's two sizes in cells (PIC-D1, PIC-D2): `own`, its `w` × `h` pixels brought within the screen's budget; and
 * `fit`, that at one scale — never larger, at most `room.cols` wide, and within that at most `room.rows` tall (its
 * window's rows less its `▣` rows), but never under the floor, 12 rows or 20 columns, unless its own size or its room
 * is smaller. Proportions kept: its rows follow from its columns.
 */
export function pictureSizes(
  w: number,
  h: number,
  room: Cells,
  cell: { width: number; height: number },
): { fit: Cells; own: Cells } {
  const b = Math.min(1, SCREEN_SIDE / w, SCREEN_SIDE / h, Math.sqrt(SCREEN_PIXELS / (w * h)));
  const [pw, ph] = [w * b, h * b];
  // (Less a hair before rounding up: the budget's scale is irrational, and a column count that holds exactly `r` rows
  // would otherwise come out `r + 1e-15` rows, one row more than its room.)
  const rowsOf = (cols: number) => Math.max(1, Math.ceil((cols * cell.width * ph) / pw / cell.height - 1e-9));
  // The columns `rows` rows hold, a fraction.
  const colsOf = (rows: number) => (rows * cell.height * pw) / ph / cell.width;
  const ownCols = Math.max(1, Math.ceil(pw / cell.width));
  const widest = Math.max(1, Math.min(ownCols, room.cols));
  const tall = Math.floor(colsOf(Math.max(1, room.rows)));
  const floor = Math.max(Math.floor(colsOf(FLOOR_ROWS)), FLOOR_COLS);
  const cols = Math.max(1, Math.min(widest, Math.max(tall, floor)));
  return { own: { cols: ownCols, rows: rowsOf(ownCols) }, fit: { cols, rows: rowsOf(cols) } };
}

/**
 * A drawing's cells (12.16, 12.17) at most `width` columns wide: `w` × `h` pixels in cells of the terminal's,
 * proportions kept, at most `maxRows` rows (narrower then).
 */
export function fitPicture(
  w: number,
  h: number,
  width: number,
  cell: { width: number; height: number },
  maxRows: number,
): { cols: number; rows: number } {
  let cols = Math.max(1, Math.min(width, Math.ceil(w / cell.width)));
  let rows = Math.max(1, Math.ceil((cols * cell.width * h) / w / cell.height));
  if (rows > maxRows) {
    rows = maxRows;
    cols = Math.max(1, Math.min(width, Math.round((rows * cell.height * w) / h / cell.width)));
  }
  return { cols, rows };
}

/**
 * A file's text where it's an SVG (12.15) — by its name (`.svg`), or, a picture fetched and kept by its address (no
 * name of its own, 12.12), by how it starts — else null; null too where it's larger than 8 MB.
 */
export function svgText(path: string): string | null {
  const ext = extname(path).toLowerCase();
  if (ext && ext !== ".svg") return null;
  try {
    if (statSync(path).size > MAX_SVG_BYTES) return null;
    if (!ext) {
      const head = Buffer.alloc(512);
      const fd = openSync(path, "r");
      const n = readSync(fd, head, 0, 512, 0);
      closeSync(fd);
      if (!looksLikeSvg(head.subarray(0, n).toString("utf8"))) return null;
    }
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** The most an image may weigh, how many fetches run at once and wait their turn, and how long one may take. */
export interface RemoteImageLimits {
  bytes: number;
  concurrent: number;
  queued: number;
  timeout: number;
}
const DEFAULT_LIMITS: RemoteImageLimits = {
  bytes: 20 * 1024 * 1024,
  concurrent: 3,
  queued: 32,
  timeout: 15_000,
};
type Transfer = { retry: boolean; url: string; abort: AbortController; done: () => void; promise: Promise<void> };

/** Downloads belong to the picture session, shared across its views until cancelled or disposed. */
export class RemoteImages {
  /** Fetches under way or waiting, by address; and the ones that failed this run — not tried again by themselves (a
   *  note laid out again would ask the site at every frame), only when asked for (`enter`). */
  private readonly pending = new Map<string, Transfer>();
  private readonly failed = new Set<string>();
  private queue: Transfer[] = [];
  private active = 0;
  private closed = false;
  private readonly limits: RemoteImageLimits;
  /** The sites said yes to for this run (`ask`'s "this site"). */
  readonly sites = new Set<string>();

  constructor(
    /** How an image is fetched: the host's network. */
    private readonly fetcher: (url: string, init: RequestInit) => Promise<Response>,
    /** Told when a fetch ends: the image there (the notes laid out again), or why not. Not told of one cancelled. */
    private readonly done: (url: string, error?: string) => void,
    private readonly dir = join(cacheHome(), "images"),
    limits: Partial<RemoteImageLimits> = {},
  ) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  /** Where an address's image is kept: one file per address. */
  file(url: string): string {
    return join(this.dir, remoteImageName(url));
  }

  /** The image fetched for an address, or null when it hasn't been. */
  cached(url: string): string | null {
    const f = this.file(url);
    return existsSync(f) ? f : null;
  }

  /** The site an address is on (`https://example.org`), or null when it isn't a web address. */
  static site(url: string): string | null {
    try {
      const u = new URL(url);
      return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
    } catch {
      return null;
    }
  }

  /** Deduplicate active/queued addresses. Saturated automatic requests can be admitted on the next redraw. */
  fetch(url: string, again = false): boolean {
    if (again) this.failed.delete(url);
    if (this.closed || this.failed.has(url) || this.cached(url) || !RemoteImages.site(url)) return false;
    const pending = this.pending.get(url);
    if (pending) {
      if (pending.abort.signal.aborted) pending.retry = true;
      return true;
    }
    if (this.active >= this.limits.concurrent && this.queue.length >= this.limits.queued) return false;
    let done!: () => void;
    const promise = new Promise<void>((resolve) => {
      done = resolve;
    });
    const job = { retry: false, url, abort: new AbortController(), done, promise };
    this.pending.set(url, job);
    this.queue.push(job);
    this.pump();
    return true;
  }

  cancel(url: string): void {
    const job = this.pending.get(url);
    if (!job) return;
    job.retry = false;
    job.abort.abort();
    const at = this.queue.indexOf(job);
    if (at !== -1) {
      this.queue.splice(at, 1);
      this.pending.delete(url);
      job.done();
    }
  }

  cancelAll(): void {
    for (const url of this.pending.keys()) this.cancel(url);
  }

  dispose(): void {
    this.closed = true;
    this.cancelAll();
  }

  async settle(): Promise<void> {
    while (this.pending.size) await Promise.all([...this.pending.values()].map((job) => job.promise));
  }

  private pump(): void {
    while (!this.closed && this.active < this.limits.concurrent && this.queue.length) {
      const job = this.queue.shift()!;
      this.active++;
      void this.get(job)
        .then(
          () => {
            if (!job.abort.signal.aborted && !this.closed) this.done(job.url);
          },
          (err: Error) => {
            if (job.abort.signal.aborted || this.closed) return;
            if (this.failed.size >= 2048) this.failed.delete(this.failed.values().next().value!);
            this.failed.add(job.url);
            this.done(job.url, err.message);
          },
        )
        .finally(() => {
          this.pending.delete(job.url);
          this.active--;
          job.done();
          if (job.retry && !this.closed) this.fetch(job.url, true);
          this.pump();
        });
    }
  }

  private async get(job: Transfer): Promise<void> {
    const signal = AbortSignal.any([job.abort.signal, AbortSignal.timeout(this.limits.timeout)]);
    let abortFetch!: () => void;
    const aborted = new Promise<never>((_, reject) => {
      abortFetch = () => reject(signal.reason);
      signal.addEventListener("abort", abortFetch, { once: true });
    });
    let res: Response;
    try {
      signal.throwIfAborted();
      res = await Promise.race([
        this.fetcher(job.url, { signal, redirect: "follow" }).then((answer) => {
          if (signal.aborted) {
            void answer.body?.cancel().catch(() => {});
            signal.throwIfAborted();
          }
          return answer;
        }),
        aborted,
      ]);
    } finally {
      signal.removeEventListener("abort", abortFetch);
    }
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let fd: number | undefined;
    const file = this.file(job.url);
    const part = `${file}.${randomUUID()}.part`;
    const tooLarge = () => new Error(`larger than ${this.limits.bytes / 1024 / 1024} MB`);
    const cancelBody = () => {
      if (reader) void reader.cancel().catch(() => {});
      else void res.body?.cancel().catch(() => {});
    };
    signal.addEventListener("abort", cancelBody, { once: true });
    try {
      signal.throwIfAborted();
      if (!res.ok) throw new Error(`the site answered ${res.status}`);
      const type = res.headers.get("content-type") ?? "";
      if (!type.startsWith("image/")) throw new Error(`not an image (${type || "no content type"})`);
      if (Number(res.headers.get("content-length") ?? 0) > this.limits.bytes) throw tooLarge();
      if (!res.body) throw new Error("empty image response");
      ensureCacheHome(join(this.dir, ".."));
      mkdirSync(this.dir, { recursive: true });
      fd = openSync(part, "wx", 0o600);
      reader = res.body.getReader();
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        signal.throwIfAborted();
        if (done) break;
        size += value.byteLength;
        if (size > this.limits.bytes) throw tooLarge();
        let at = 0;
        while (at < value.byteLength) {
          const written = writeSync(fd, value, at, value.byteLength - at);
          if (!written) throw new Error("image cache write made no progress");
          at += written;
        }
      }
      closeSync(fd);
      fd = undefined;
      signal.throwIfAborted();
      renameSync(part, file);
    } finally {
      signal.removeEventListener("abort", cancelBody);
      cancelBody();
      reader?.releaseLock();
      if (fd !== undefined) closeSync(fd);
      rmSync(part, { force: true });
    }
  }
}
