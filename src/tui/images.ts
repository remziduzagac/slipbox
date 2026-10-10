// Images on the internet (plan 12.12): fetched only as `[render] images_remote` says — `show`, or `ask` once you've said
// yes (this once, or for its site) — into the cache, a file per address, and drawn from there as a local one is. A fetch
// is an image's or nothing: a timeout, a size cap, an image's content type.

import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { remoteImageName } from "../core/imagecache.ts";
import { cacheHome, ensureCacheHome } from "../core/paths.ts";
import { looksLikeSvg } from "../core/svg.ts";

/** An SVG read for drawing is at most this big (12.15). */
const MAX_SVG_BYTES = 8 * 1024 * 1024;

/**
 * A picture's cells at most `width` columns wide: `w` × `h` pixels in cells of the terminal's, proportions kept, at most
 * `maxRows` rows (narrower then).
 */
export function fitPicture(w: number, h: number, width: number, cell: { width: number; height: number }, maxRows: number): { cols: number; rows: number } {
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

/** The most an image may weigh, and how long its fetch may take. */
const MAX_BYTES = 20 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

export class RemoteImages {
  /** Fetches under way, by address; and the ones that failed this run — not tried again by themselves (a note laid
   *  out again would ask the site at every frame), only when asked for (`enter`). */
  private readonly pending = new Set<string>();
  private readonly failed = new Set<string>();
  /** The sites said yes to for this run (`ask`'s "this site"). */
  readonly sites = new Set<string>();

  constructor(
    /** How an image is fetched: the host's network. */
    private readonly fetcher: (url: string, init: RequestInit) => Promise<Response>,
    /** Told when a fetch ends: the image there (the notes laid out again), or why not. */
    private readonly done: (url: string, error?: string) => void,
    private readonly dir = join(cacheHome(), "images"),
  ) {}

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

  /** Fetch an image into the cache, once at a time per address; `done` when it's there or it failed. One that failed
   *  this run only `again` (asked for). */
  fetch(url: string, again = false): void {
    if (again) this.failed.delete(url);
    if (this.pending.has(url) || this.failed.has(url) || this.cached(url) || !RemoteImages.site(url)) return;
    this.pending.add(url);
    void this.get(url)
      .then(() => this.done(url))
      .catch((err: Error) => {
        this.failed.add(url);
        this.done(url, err.message);
      })
      .finally(() => this.pending.delete(url));
  }

  private async get(url: string): Promise<void> {
    const res = await this.fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow" });
    if (!res.ok) throw new Error(`the site answered ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) throw new Error(`not an image (${type || "no content type"})`);
    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) throw new Error("larger than 20 MB");
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) throw new Error("larger than 20 MB");
    ensureCacheHome(join(this.dir, ".."));
    mkdirSync(this.dir, { recursive: true });
    const f = this.file(url);
    writeFileSync(`${f}.part`, bytes);
    renameSync(`${f}.part`, f);
  }
}
