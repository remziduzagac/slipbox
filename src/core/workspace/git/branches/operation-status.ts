// The last observed Git operation, keyed by its caller and invalidated by Git generation or explicit refresh.
import type { Checkout } from "../git.ts";
import { type Operation, operationOf, operationText } from "./gitrebase.ts";

/** The inputs actually used by the operation reader; no client or live document state. */
export interface OperationContext {
  readonly git: { readonly checkout: Pick<Checkout, "gitDir"> | null; readonly generation: number };
  now(): number;
}

/** What's under way in the vault's checkout, as last read: read again when git has news, or half a second on. */
const seen = new WeakMap<OperationContext, { at: number; generation: number; op: Operation | null }>();

/** What's under way now: where you are asks each frame, so git's files are read again only now and then. */
export function operationNow(app: OperationContext): Operation | null {
  const c = app.git.checkout;
  if (!c) return null;
  const s = seen.get(app);
  const now = app.now();
  if (s && s.generation === app.git.generation && now - s.at < 500) return s.op;
  const op = operationOf(c);
  seen.set(app, { at: now, generation: app.git.generation, op });
  return op;
}

/** Where you are's words for what's under way — `rebasing 2/5`, `merging` — and the branch a rebase is of. */
export function operationStatus(app: OperationContext): { text: string; branch: string | null } | null {
  const op = operationNow(app);
  return op ? { text: operationText(op), branch: op.branch } : null;
}

/** Drop the prior observation after an operation settles, even when the Git generation did not change. */
export function forgetOperation(app: OperationContext): void {
  seen.delete(app);
}
