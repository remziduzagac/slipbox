import type { Level, Message } from "./contracts.ts";
import { ToastScheduler } from "./toasts.ts";

const MESSAGE_LIMIT = 500;
/** Floating messages at once; older ones stay in the messages list. */
const TOAST_LIMIT = 4;

// -------------------------------------------------------------------------------------------
// Messages (3.13)

export interface MessagesContext {
  messages: Message[];
  toasts: Message[];
  now(): number;
  readonly host: { requestRender(): void };
  listMessage(level: Level, text: string): Message;
}

export class Messages {
  /** While a click is handled (`sayingOnce`): the messages it has said, by level and words. */
  private saidInClick: Set<string> | null = null;
  /** Frames being painted, by `whileDrawing`: a message said meanwhile asks for no other (`message`). */
  private drawing = 0;
  private readonly toastScheduler: ToastScheduler;

  constructor(private readonly context: MessagesContext) {
    this.toastScheduler = new ToastScheduler(context);
  }

  /**
   * `fn`, a click's handling, each message it says said once (HDR-D2): ending typing can say a data file doesn't parse,
   * and the click's own command the same words; a second click is its own, and says them again.
   */
  sayingOnce<T>(fn: () => T): T {
    const was = this.saidInClick;
    this.saidInClick = new Set();
    try {
      return fn();
    } finally {
      this.saidInClick = was;
    }
  }

  message(level: Level, text: string): void {
    const said = `${level} ${text}`;
    if (this.saidInClick?.has(said)) return;
    this.saidInClick?.add(said);
    const m = this.context.listMessage(level, text);
    // The same message again (a key held down) refreshes its box rather than stacking another.
    this.context.toasts = [m, ...this.context.toasts.filter((t) => t.text !== text || t.level !== level)].slice(
      0,
      TOAST_LIMIT,
    );
    this.toastScheduler.scheduleToasts();
    // Drawn as it's said, wherever from: a key's command, or git answering in the background, with nothing else to
    // draw it (D263). Said while a frame is painted, it waits for the next, as before: OpenTUI draws again at once for a
    // request made while it draws, so something said on every frame would keep drawing. Said before the host is there
    // (starting up), the first frame draws it.
    if (!this.drawing) this.context.host?.requestRender();
  }

  /** `paint` as one frame is painted: a message said in it asks for no other frame (`message`). */
  whileDrawing<T>(paint: () => T): T {
    this.drawing++;
    try {
      return paint();
    } finally {
      this.drawing--;
    }
  }

  /** Said to the messages list alone, no box: kept for the record (UPG: the daily check's line, its offer shown). */
  listMessage(level: Level, text: string): Message {
    const m = { level, text, at: this.context.now() };
    this.context.messages.push(m);
    if (this.context.messages.length > MESSAGE_LIMIT) this.context.messages.shift();
    return m;
  }

  /** The messages a frame has just drawn: their time begins, those not drawn before. */
  toastsDrawn(drawn: Message[]): void {
    this.toastScheduler.toastsDrawn(drawn);
  }

  /** Clear the floating messages (a click on one opens the messages list; they're all there). */
  dismissToasts(): void {
    this.toastScheduler.dismissToasts();
  }
}
