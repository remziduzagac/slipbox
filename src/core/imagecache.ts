// Where a picture on the internet is kept once fetched (plan 12.12): a file per address in the cache. The TUI fetches
// into it; an export (10.x) draws from it, fetching nothing.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cacheHome } from "./paths.ts";

/** A picture's file's name in the cache: its address, hashed. */
export function remoteImageName(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 32);
}

/** The picture fetched for an address, or null when it hasn't been. */
export function cachedImage(url: string, dir = join(cacheHome(), "images")): string | null {
  const f = join(dir, remoteImageName(url));
  return existsSync(f) ? f : null;
}
