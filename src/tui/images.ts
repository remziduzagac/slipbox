// Images on the internet (plan 12.12): fetched only as `[render] images_remote` says — `show`, or `ask` once you've said
// yes (this once, or for its site) — into the cache, a file per address, and drawn from there as a local one is. A fetch
// is an image's or nothing: a timeout, a size cap, an image's content type.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cacheHome } from "../core/paths.ts";

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
    return join(this.dir, createHash("sha256").update(url).digest("hex").slice(0, 32));
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
    mkdirSync(this.dir, { recursive: true });
    const f = this.file(url);
    writeFileSync(`${f}.part`, bytes);
    renameSync(`${f}.part`, f);
  }
}
