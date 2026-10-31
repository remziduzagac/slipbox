// Timing only: App owns the visible messages, history, deduplication and drawing guard.
import type { Message } from "./contracts.ts";

export interface ToastContext {
  toasts: Message[];
  now(): number;
  readonly host: { requestRender(): void };
}

type Timers = Pick<typeof globalThis, "setTimeout" | "clearTimeout">;

export class ToastScheduler {
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly context: ToastContext,
    private readonly timers: Timers = globalThis,
  ) {}

  /** How long a message shows. */
  private toastMs(m: Message): number {
    return m.level === "error" ? 8000 : 4000;
  }

  /** Drop the messages whose time is up, and wake again when the next one's is. One not drawn yet keeps its time:
   *  said while slipbox was busy (a start indexing, a slow machine), it isn't gone before it's seen (#40). */
  scheduleToasts(): void {
    if (this.toastTimer) this.timers.clearTimeout(this.toastTimer);
    this.toastTimer = null;
    const now = this.context.now();
    // A corrected wall clock can precede the first frame: restart that toast's lifetime rather than overflow a timer.
    for (const t of this.context.toasts) if (t.shown !== undefined && t.shown > now) t.shown = now;
    const ends = (t: Message) => (t.shown ?? now) + this.toastMs(t);
    this.context.toasts = this.context.toasts.filter((t) => ends(t) > now);
    const drawn = this.context.toasts.filter((t) => t.shown !== undefined);
    if (!drawn.length) return;
    const next = Math.min(...drawn.map(ends)) - now;
    this.toastTimer = this.timers.setTimeout(
      () => {
        this.scheduleToasts();
        this.context.host.requestRender();
      },
      Math.max(10, next),
    );
    (this.toastTimer as { unref?: () => void }).unref?.();
  }

  /** The messages a frame has just drawn: their time begins, those not drawn before. */
  toastsDrawn(drawn: Message[]): void {
    const now = this.context.now();
    let fresh = false;
    for (const t of drawn) if (t.shown === undefined) (t.shown = now), (fresh = true);
    if (fresh) this.scheduleToasts();
  }

  /** Clear the floating messages (a click on one opens the messages list; they're all there). */
  dismissToasts(): void {
    this.context.toasts = [];
    if (this.toastTimer) this.timers.clearTimeout(this.toastTimer);
    this.toastTimer = null;
  }
}
