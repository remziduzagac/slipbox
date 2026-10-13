// How long a share link lives. The default is 72 hours; a group ride's link lasts until the ride is over.
// Decided in ADR 3, on share links.
export interface Expiry {
  seconds(now: Date): number;
}

/** The default lifetime: the same for every link. */
export class FixedExpiry implements Expiry {
  constructor(private readonly ttl = 72 * 3600) {}

  seconds(): number {
    return this.ttl;
  }
}

/** A group ride's link: valid until the ride ends, never less than an hour. */
export class RideExpiry implements Expiry {
  constructor(private readonly end: Date) {}

  seconds(now: Date): number {
    return Math.max(3600, Math.floor((this.end.getTime() - now.getTime()) / 1000));
  }
}

export const DEFAULT_EXPIRY: Expiry = new FixedExpiry();

export const expiresAt = (now: Date, e = DEFAULT_EXPIRY): number => Math.floor(now.getTime() / 1000) + e.seconds(now);
