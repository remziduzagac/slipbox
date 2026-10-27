// The TUI clipboard: serialized helper work, immediate terminal delivery and cancellation on quit.
import { copyTextAsync, osc52Sequence, readClipboardAsync } from "../../../core/foundation/platform/clipboard.ts";
import { type Keyed, stateDir } from "../../../core/foundation/platform/paths.ts";

export interface ClipboardText {
  text: string;
  linewise: boolean;
}

/** Current shared state, read at the same points as the queued work. No register or vault is copied. */
export interface ClipboardContext {
  readonly vim: { readonly register: ClipboardText | null };
  readonly loc: Keyed;
  readonly quitting: boolean;
  readonly host: { osc52(text: string): boolean; requestRender(): void };
  message(level: "info" | "warn", text: string): void;
}

export class Clipboard {
  constructor(
    readonly context: ClipboardContext,
    private readonly tools = { copyTextAsync, readClipboardAsync },
  ) {}

  private clipboardTask: Promise<unknown> = Promise.resolve();
  private clipboardAbort = new AbortController();
  private clipboardPending = 0;

  /**
   * What `p` puts: the system clipboard when it can be read and holds something else than the
   * register (text copied in another app); else the register — whose line-wise-ness a clipboard
   * that holds the same text keeps.
   */
  async pasteText(): Promise<{ text: string; linewise: boolean } | null> {
    await this.clipboardTask;
    const reg = this.context.vim.register;
    const clip = await this.tools.readClipboardAsync(stateDir(this.context.loc), this.clipboardAbort.signal);
    if (clip === null || clip === "" || (reg && clip === reg.text)) return reg;
    return { text: clip, linewise: false };
  }

  /** Text on the clipboard; said so (`what` names it: "copied <what>"), unless `announce` is false. */
  copy(text: string, announce = true, what = `${text.length} characters`): Promise<boolean> {
    // Said whether or not the caller announces: its own "copied" or "yanked" would claim a copy that never happens.
    if (this.clipboardPending >= 8) {
      this.context.message("warn", "clipboard busy — copy again after it finishes");
      return Promise.resolve(false);
    }
    // OSC 52 now, in the order copies are made, as it was when copying waited for the helpers: the terminal's
    // clipboard never waits for them, only the system's.
    const osc52 = osc52Sequence(text) !== null && this.context.host.osc52(text);
    const run = async () => {
      if (this.context.quitting) return false;
      const r = await this.tools.copyTextAsync(text, {
        osc52: () => osc52,
        fallbackDir: stateDir(this.context.loc),
        signal: this.clipboardAbort.signal,
      });
      if (this.context.quitting) return false;
      // SLIPBOX_CLIPBOARD=file sends copies to the file on purpose; otherwise the file means no clipboard answered.
      const onPurpose = process.env.SLIPBOX_CLIPBOARD === "file";
      if (announce) {
        this.context.message(
          "info",
          r.file
            ? onPurpose
              ? `copied ${what} to ${r.file}`
              : `clipboard unavailable — wrote ${r.file} (${what})`
            : `copied ${what}`,
        );
        // The helper answered after the key's frame was drawn: drawn now, not at the next key.
        this.context.host.requestRender();
      }
      return !r.file;
    };
    this.clipboardPending++;
    const task = this.clipboardTask.then(run).catch((err) => {
      if (this.context.quitting) return false;
      this.context.message("warn", `clipboard: ${(err as Error).message}`);
      this.context.host.requestRender();
      return false;
    });
    task.finally(() => this.clipboardPending--);
    this.clipboardTask = task;
    return task;
  }

  abort(): void {
    this.clipboardAbort.abort();
  }
}
