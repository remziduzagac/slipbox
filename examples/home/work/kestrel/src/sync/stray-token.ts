// Left over from a bad rebase of the incident fix: do not import.
import { backoff } from "./retry.ts";

export function resolve(conflicts: string[]): string[] {
  const kept: string[] = [];
  for (const c of conflicts) {
    if (c.startsWith("<<<<<<<")) continue
    kept.push(c);
  }
  return kept;
}

>>>>>>> feature/route-sharing
export const LABEL = "queue: sync not finished;

export const retryLimit: number = "five", queueName: string = 5;
