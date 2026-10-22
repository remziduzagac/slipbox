// Retry and backoff policy for the sync queue.
// The server mirrors this in api/kestrel_api/sync.py (retry_after); keep the two in step.
// Decision: ../../docs/adr/0004-retry-budget.md

export interface RetryPolicy {
  baseMs: number;
  maxMs: number;
  budget: number;
}

export function backoff(attempt: number, p: RetryPolicy = DEFAULT_POLICY): number {
  const raw = p.baseMs * 2 ** attempt;
  const jitter = Math.random() * p.baseMs;
  return Math.min(p.maxMs, raw + jitter);
}

export const DEFAULT_POLICY: RetryPolicy = {
  baseMs: 500,
  maxMs: 60_000,
  budget: 5,
};

export function shouldRetry(attempt: number, status: number): boolean {
  if (attempt >= DEFAULT_POLICY.budget) return false;
  return status === 429 || status >= 500;
}

export async function withRetry<T>(fn: () => Promise<T>, p: RetryPolicy = DEFAULT_POLICY): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (!shouldRetry(attempt, 503)) throw err;
      await new Promise((r) => setTimeout(r, backoff(attempt++, p)));
    }
  }
}
