// Half-written: decorrelated jitter backoff, to replace retry.ts. Not wired in.
export interface Jitter {
  base: number;
  cap: number;
}

export function decorrelated(prev: number, j: Jitter): number {
  const next = Math.random() * (prev * 3 - j.base) + j.base;
  return Math.min(j.cap, next);
}

export function schedule(j: Jitter, attempts: number): number[] {
  const out: number[] = [];
  let prev = j.base;
  for (let i = 0; i < attempts; i++) {
    prev = decorrelated(prev, j);
    out.push(prev);
  }
  return out;
