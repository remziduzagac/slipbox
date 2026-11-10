// What's under way in git, as drawn: kept from the TUI's look each second (SD-D13), never read as it's drawn; a caller
// that keeps none (a test's App, reading on the screen's thread) reads it again when git has news or half a second on.
import type { Checkout } from "../git.ts";
import { type Operation, operationOf, operationText } from "./operation.ts";

/** The inputs actually used by the operation reader; no client or live document state. */
export interface OperationContext {
  readonly git: { readonly checkout: Pick<Checkout, "gitDir"> | null; readonly generation: number };
  now(): number;
}

/** What's under way in the vault's checkout, as last read: read again when git has news, or half a second on. */
const seen = new WeakMap<OperationContext, { at: number; generation: number; op: Operation | null }>();

/** What's under way as a look last found it, kept for its caller (`keepOperation`): drawn as it is. With it, the
 *  question it answered (`askGit`). */
const kept = new WeakMap<OperationContext, { op: Operation | null; asked: number }>();

/** The questions of git's state, numbered as they're asked (SD-T4). What's kept is the last-asked question's answer,
 *  whatever order the answers come in: a look asked before a checkout, an abort or a continue, and answered after it,
 *  never moves what's kept back. */
let asks = 0;
export const askGit = (): number => ++asks;

/** What's under way now: where you are asks each frame — what's kept, or git's files read again only now and then. */
export function operationNow(app: OperationContext): Operation | null {
  const k = kept.get(app);
  if (k) return k.op;
  const c = app.git.checkout;
  if (!c) return null;
  const s = seen.get(app);
  const now = app.now();
  if (s && s.generation === app.git.generation && now - s.at < 500) return s.op;
  const op = operationOf(c);
  seen.set(app, { at: now, generation: app.git.generation, op });
  return op;
}

/** What's under way, as a look off the screen's thread found it (SD-T4): kept for `app`, drawn from now on — unless
 *  what's kept answered a question asked after this one (`asked`). */
export function keepOperation(app: OperationContext, op: Operation | null, asked: number): void {
  const k = kept.get(app);
  if (k && k.asked > asked) return;
  kept.set(app, { op, asked });
}

/** What's under way read again at once — a key's own read, git having just moved the branch — and kept as read, the
 *  draws following it before the next look; a look asked before it, answering after, leaves it kept. */
export function operationAgain(app: OperationContext, c: Pick<Checkout, "gitDir">): Operation | null {
  const asked = askGit();
  const op = operationOf(c);
  seen.set(app, { at: app.now(), generation: app.git.generation, op });
  if (kept.has(app)) kept.set(app, { op, asked });
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
