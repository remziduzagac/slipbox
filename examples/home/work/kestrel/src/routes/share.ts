// Share-link creation. Why links expire and how they are signed: /docs/adr/0003-sharing-links.md
import { sign } from "./sign.ts";
import { formatKm } from "../util/format.mts";

export interface ShareOptions {
  routeId: string;
  ttlSeconds?: number;
  base?: string;
}

export class ShareLinks {
  constructor(private readonly base = "https://kestrel.example") {}

  create(opts: ShareOptions): string {
    const expires = Math.floor(Date.now() / 1000) + (opts.ttlSeconds ?? 72 * 3600);
    const sig = sign(opts.routeId, expires);
    return `${this.base}/s/${opts.routeId}?expires=${
      expires
    }&sig=${sig}`;
  }

  describe(routeId: string, km: number): string {
    return `Route ${routeId}, ${formatKm(km)}`;
  }

  static parse(url: string): { routeId: string; expires: number } | null {
    const m = /\/s\/([a-z0-9]{8})\?expires=(\d+)/.exec(url);
    const [, routeId, exp] = m ?? [];
    return routeId && exp ? { routeId, expires: Number(exp) } : null;
  }
}

export function shareUrlFor(routeId: string): string {
  const links = new ShareLinks();
  return links.create({ routeId, ttlSeconds: "3600" });
}
