// The terminal tests' trace (SLIPBOX_TRACE), as slipbox writes it (run.ts) and the tests' terminal reads it
// (tests/terminal/terminal.ts, session.ts). Beside the commands run, a `key` line for every key and paste once
// handled, a `frame` line for every frame written that has something newly painted in it, and a `ready` line once the
// start is in (the vault read after the screen is taken, SD-T10). A frame written isn't on the screen yet: the terminal
// reads it later. So after it, in the output, slipbox marks it, and a test waits for the mark.
//
// Each line names its slipbox, a run of its own: a restart in place (`execve`) keeps the process and the terminal, and
// the slipbox it starts numbers its frames from its first again. A `key` line has how many frames that slipbox had
// painted when it handled the key, and a `frame` line has how many were painted when the frame was written. So a frame
// shows a key when it's the key's slipbox's with a greater number, or a later slipbox's.

import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";

/**
 * The private OSC of the mark: `ESC ] 7701 ; run ; n BEL`, the slipbox's run and the number of its `frame` line. It is
 * written through the frames' own output, after the frame's bytes. A terminal that doesn't know it ignores it.
 */
export const FRAME_SHOWN = 7701;

/** A `key`, `frame` or `ready` line of the trace, read; anything else (a command run) isn't one. `ready`: the start is
 *  in — the vault's first read and what the start opens (SD-T10) — painted in that frame. */
export interface Traced {
  kind: "key" | "frame" | "ready";
  run: string;
  /** The frames the run had painted. */
  n: number;
}

export function traced(line: string): Traced | null {
  const m = /^(key|frame|ready) (\S+) (\d+)$/.exec(line);
  return m ? { kind: m[1] as Traced["kind"], run: m[2]!, n: Number(m[3]) } : null;
}

/** The output the frames are written through (OpenTUI's): false when full, and when it's idle again. */
export interface FrameOutput {
  write(bytes: Uint8Array): boolean;
  idle(): Promise<void>;
  /** The renderer stopped: nothing more is written. */
  gone(): boolean;
}

/** One slipbox's trace of keys and frames, and the marks it writes. */
export class FrameTrace {
  readonly run = randomUUID().slice(0, 8);
  private painted = 0;
  /** The number of the last `frame` line. */
  private written = 0;
  /** A mark the output had no room for, written once it's idle: the latest frame's. */
  private pending: number | null = null;
  private waiting = false;
  private readonly encoder = new TextEncoder();

  constructor(
    private readonly file: string,
    private readonly out: FrameOutput,
  ) {}

  /** A key or a paste handled. */
  key(): void {
    appendFileSync(this.file, `key ${this.run} ${this.painted}\n`);
  }

  /** A frame painted: it shows what was handled before. */
  paint(): void {
    this.painted++;
  }

  /** The start in, as of the frame just painted: a test acts on it once that frame, or a later one, is shown. */
  ready(): void {
    appendFileSync(this.file, `ready ${this.run} ${this.painted}\n`);
  }

  /**
   * A frame written (OpenTUI's `frame`, once its bytes are out). OpenTUI paints and writes one frame at a time, so it
   * holds the latest paint. Traced and marked when something was painted since the last; one with nothing new isn't.
   * A paint never written (cancelled, its frame skipped or failed) isn't traced: the next frame written holds it or a
   * later one, and is.
   */
  frame(): void {
    if (this.painted === this.written) return;
    this.written = this.painted;
    appendFileSync(this.file, `frame ${this.run} ${this.written}\n`);
    this.pending = this.written;
    if (!this.waiting) this.mark();
  }

  private mark(): void {
    const n = this.pending;
    if (n === null || this.out.gone()) return;
    try {
      if (this.out.write(this.encoder.encode(`\x1b]${FRAME_SHOWN};${this.run};${n}\x07`))) {
        this.pending = null;
        return;
      }
    } catch {
      return; // the renderer stopped or gone
    }
    // Full: once it's idle, the latest frame's mark then. One wait at a time, whatever frames come meanwhile.
    this.waiting = true;
    this.out.idle().then(
      () => {
        this.waiting = false;
        this.mark();
      },
      () => {
        this.waiting = false;
      },
    );
  }
}
