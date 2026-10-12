// Redirects (17.12; D49): where a note went when it
// moved — by slipbox, `mv`, git or a file manager, detected by its content hash in the index. Kept
// in the vault's state, not its cache: only seeing the move teaches it, so it can't be rebuilt.

import { createHash } from "node:crypto";
import { posix } from "node:path";
import { readJson, writeJson } from "./fsutil.ts";
import { normKey } from "./links.ts";

/** A note's content hash, over its text. */
export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 20);
}

/** A move seen: where to, when, and — git's renames after a merge or a pull (20.21) — by which change. */
export interface Redirect {
  to: string;
  at: string;
  /** The commits the move came between (`1a2b3c4..5d6e7f8`), when git's renames said it. */
  by?: string;
}

interface RedirectFile {
  version: 1;
  redirects: Record<string, Redirect>;
}

const MAX_REDIRECTS = 5000;
/** A chain of moves is followed this far (a → b → c …), and no further: never a loop. */
const MAX_HOPS = 20;

export class Redirects {
  private data: Record<string, Redirect> = {};

  constructor(private readonly file: string) {
    const f = readJson<RedirectFile | null>(file, null);
    if (f?.version === 1 && f.redirects && typeof f.redirects === "object") {
      for (const [from, r] of Object.entries(f.redirects))
        if (r && typeof r.to === "string")
          this.data[from] = {
            to: r.to,
            at: typeof r.at === "string" ? r.at : "",
            ...(typeof r.by === "string" ? { by: r.by } : {}),
          };
    }
  }

  /** Record moves (`by`: the commits git's renames were between), and save. A path that is a note again stops redirecting. */
  add(moves: [from: string, to: string][], now = new Date(), by?: string): void {
    for (const [from, to] of moves) {
      if (from === to) continue;
      this.data[from] = { to, at: now.toISOString(), ...(by ? { by } : {}) };
      delete this.data[to];
    }
    const entries = Object.entries(this.data);
    if (entries.length > MAX_REDIRECTS)
      this.data = Object.fromEntries(entries.sort((a, b) => (a[1].at < b[1].at ? 1 : -1)).slice(0, MAX_REDIRECTS));
    try {
      writeJson(this.file, { version: 1, redirects: this.data } satisfies RedirectFile);
    } catch {}
  }

  /** Where a path went, following a chain of moves; null when it never moved. */
  follow(rel: string): string | null {
    let at = rel;
    for (let i = 0; i < MAX_HOPS; i++) {
      const next = this.data[at]?.to;
      if (!next) return at === rel ? null : at;
      at = next;
    }
    return at;
  }

  /** The old paths whose note name (the file name, no extension) is `name`, case-insensitively. */
  named(name: string): string[] {
    const k = normKey(name);
    return Object.keys(this.data).filter((p) => normKey(posix.basename(p).replace(/\.(md|markdown)$/i, "")) === k);
  }

  all(): Record<string, Redirect> {
    return { ...this.data };
  }
}
