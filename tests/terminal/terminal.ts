// A terminal nobody sees: a pseudo-terminal of Bun's own (`Bun.Terminal`) for the program, its output fed to a
// headless xterm (`@xterm/headless`), which keeps the screen — its text, colours and cursor — for the checks to read
// (TT-D2). It answers what a program asks a terminal at start as a modern terminal does: the cursor's place and the
// device's attributes (xterm's own answers), its colours, and the Kitty keyboard protocol (flags pushed and popped,
// keys then encoded so). It keeps the title and every OSC 52 copy. POSIX only: Bun's pseudo-terminal is.

import { constants } from "node:os";
import xtermHeadless from "@xterm/headless";
import { encodeKey, type Keyboard } from "./keys.ts";

const { Terminal: XTerm } = xtermHeadless as unknown as { Terminal: typeof import("@xterm/headless").Terminal };

/** One run of text in a style, from a row of the screen. */
export interface StyledRun {
  text: string;
  /** `31`, `5;208`, `#rrggbb`; null for the terminal's default. */
  fg: string | null;
  bg: string | null;
  bold: boolean;
}

export interface TerminalOptions {
  cols: number;
  rows: number;
  /** Keys as Kitty's protocol has them (the default: slipbox asks for it), or as a terminal without it. */
  keyboard?: Keyboard;
  /** The colours it answers OSC 10 and 11 with: a dark scheme unless said. */
  colors?: { fg: string; bg: string };
}

/** `#rrggbb` as an OSC colour answer: `rgb:rrrr/gggg/bbbb`. */
const oscColor = (hex: string) => `rgb:${[1, 3, 5].map((i) => hex.slice(i, i + 2).repeat(2)).join("/")}`;

/**
 * Widths as a terminal that keeps grapheme clusters whole has them (kitty, libghostty, WezTerm): a ZWJ family, a flag,
 * an emoji and its selector, a letter and its marks — each one cell or two, as Bun measures the cluster. xterm's own
 * table is Unicode 6's, where most emoji are one cell: what slipbox drew there would drift past them.
 */
function graphemeWidths(): import("@xterm/headless").IUnicodeVersionProvider {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const width = (s: string) => Math.min(2, Bun.stringWidth(s)) as 0 | 1 | 2;
  // xterm's packing of a character's properties: its width, and whether it joins the cell before.
  const value = (w: number, join: boolean) => (w << 1) | (join ? 1 : 0);
  // The cluster printed last: a character that continues it joins its cell (xterm resets `preceding` to 0 at
  // anything not printed, a cursor move or a colour, and a cluster starts again there).
  let cluster = "";
  return {
    version: "graphemes",
    wcwidth: (cp) => width(String.fromCodePoint(cp)),
    charProperties(cp, preceding) {
      const ch = String.fromCodePoint(cp);
      // Printable ASCII never continues a cluster.
      if (cp >= 0x20 && cp < 0x7f) {
        cluster = ch;
        return value(1, false);
      }
      if (preceding !== 0 && cluster) {
        const joined = cluster + ch;
        const first = segmenter.segment(joined)[Symbol.iterator]().next().value?.segment;
        if (first === joined) {
          cluster = joined;
          return value(width(joined), true);
        }
      }
      cluster = ch;
      return value(width(ch), false);
    },
  };
}

/** A palette index as the SGR code that names it: `31`, `91`, or `5;208`. */
function paletteCode(n: number, bg: boolean): string {
  if (n < 8) return String((bg ? 40 : 30) + n);
  if (n < 16) return String((bg ? 100 : 90) + n - 8);
  return `5;${n}`;
}

export class HeadlessTerminal {
  readonly xterm: InstanceType<typeof XTerm>;
  private pty: Bun.Terminal | null = null;
  private proc: Bun.Subprocess | null = null;
  /** The Kitty keyboard flags the program pushed, innermost last (empty: legacy keys). */
  private kitty: number[] = [];
  private pending = 0;
  title = "";
  /** Every OSC 52 copy, decoded, in order. */
  readonly copies: string[] = [];
  /** Everything the program wrote, as text (for checks of what's sent: pictures, the title, a bell). */
  output = "";
  /** When the program last wrote anything (performance.now()). */
  lastOutput = 0;

  constructor(readonly opts: TerminalOptions) {
    const keyboard = opts.keyboard ?? "kitty";
    const colors = opts.colors ?? { fg: "#c0caf5", bg: "#1a1b26" };
    this.xterm = new XTerm({ cols: opts.cols, rows: opts.rows, allowProposedApi: true, scrollback: 1000 });
    this.xterm.unicode.register(graphemeWidths());
    this.xterm.unicode.activeVersion = "graphemes";
    this.xterm.onData((reply) => this.pty?.write(reply));
    this.xterm.onTitleChange((t) => (this.title = t));
    const p = this.xterm.parser;
    if (keyboard === "kitty") {
      p.registerCsiHandler({ prefix: "?", final: "u" }, () => (this.reply(`\x1b[?${this.kitty.at(-1) ?? 0}u`), true));
      p.registerCsiHandler({ prefix: ">", final: "u" }, (ps) => (this.kitty.push(Number(ps[0] ?? 0)), true));
      p.registerCsiHandler({ prefix: "<", final: "u" }, (ps) => {
        for (let n = Number(ps[0] ?? 1) || 1; n > 0 && this.kitty.length; n--) this.kitty.pop();
        return true;
      });
      p.registerCsiHandler({ prefix: "=", final: "u" }, (ps) => {
        const [flags = 0, mode = 1] = ps.map(Number);
        const now = this.kitty.pop() ?? 0;
        this.kitty.push(mode === 2 ? now | flags : mode === 3 ? now & ~flags : flags);
        return true;
      });
    }
    p.registerOscHandler(10, (d) => (d === "?" ? (this.reply(`\x1b]10;${oscColor(colors.fg)}\x07`), true) : false));
    p.registerOscHandler(11, (d) => (d === "?" ? (this.reply(`\x1b]11;${oscColor(colors.bg)}\x07`), true) : false));
    p.registerOscHandler(52, (d) => {
      const data = d.slice(d.indexOf(";") + 1);
      if (data !== "?") this.copies.push(Buffer.from(data, "base64").toString("utf8"));
      return true;
    });
  }

  private reply(s: string): void {
    this.pty?.write(s);
  }

  /** Start a program in it (one at a time). */
  spawn(argv: string[], opts: { cwd: string; env: Record<string, string> }): Bun.Subprocess {
    this.kitty = [];
    const decoder = new TextDecoder();
    this.pty = new Bun.Terminal({
      cols: this.opts.cols,
      rows: this.opts.rows,
      data: (_t, data) => {
        this.output += decoder.decode(data, { stream: true });
        this.lastOutput = performance.now();
        this.pending++;
        // A copy: xterm parses later, and the pseudo-terminal's buffer is read into again before then.
        this.xterm.write(data.slice(), () => this.pending--);
      },
    });
    this.proc = Bun.spawn(argv, { cwd: opts.cwd, env: opts.env, terminal: this.pty });
    this.lastOutput = performance.now();
    return this.proc;
  }

  /** The program's pid, while it runs. */
  get pid(): number | null {
    return this.proc && this.proc.exitCode === null && this.proc.signalCode === null ? this.proc.pid : null;
  }

  /** Its exit code once it has exited (a signal's death is 128 plus the signal's number, as a shell says). */
  get exitCode(): number | null {
    if (!this.proc) return null;
    if (this.proc.exitCode !== null) return this.proc.exitCode;
    return this.proc.signalCode
      ? 128 + (constants.signals[this.proc.signalCode as keyof typeof constants.signals] ?? 0)
      : null;
  }

  /** Bytes as typed: text, or a key's sequence. */
  write(bytes: string): void {
    this.pty?.write(bytes);
  }

  /** Whether keys go Kitty's way now: the program pushed flags. */
  get kittyKeys(): boolean {
    return !!this.kitty.at(-1);
  }

  /** One key, by name, as this terminal encodes it now: Kitty's way once the program pushed its flags. */
  key(name: string): void {
    this.write(encodeKey(name, this.kitty.at(-1) ? "kitty" : "legacy"));
  }

  /** A real resize: the pseudo-terminal's size and the screen's, and SIGWINCH to the program. */
  resize(cols: number, rows: number): void {
    this.opts.cols = cols;
    this.opts.rows = rows;
    this.xterm.resize(cols, rows);
    this.pty?.resize(cols, rows);
    // The kernel signals a terminal's foreground process, but Bun's child has the pseudo-terminal as its files, not
    // as its controlling terminal (Bun 1.4.2): told here, as the kernel would tell it.
    const pid = this.pid;
    if (pid) process.kill(pid, "SIGWINCH");
  }

  /** Whether everything written has been drawn into the screen. */
  get drawn(): boolean {
    return this.pending === 0;
  }

  /** The visible screen, one string per row (wide characters once, as they show). */
  screen(): string[] {
    const b = this.xterm.buffer.active;
    // Cut at the width: narrowed, xterm keeps a row's cells past it, which a terminal no longer shows.
    return Array.from(
      { length: this.opts.rows },
      (_, i) => b.getLine(b.viewportY + i)?.translateToString(true, 0, this.opts.cols) ?? "",
    );
  }

  /** The visible screen with its colours: each row as runs of one style. */
  runs(): StyledRun[][] {
    const b = this.xterm.buffer.active;
    const cell = b.getNullCell();
    return Array.from({ length: this.opts.rows }, (_, i) => {
      const line = b.getLine(b.viewportY + i);
      const out: StyledRun[] = [];
      if (!line) return out;
      for (let x = 0; x < this.opts.cols; x++) {
        const c = line.getCell(x, cell);
        if (!c || c.getWidth() === 0) continue; // the second half of a wide character
        const fg = c.isFgRGB()
          ? `#${c.getFgColor().toString(16).padStart(6, "0")}`
          : c.isFgPalette()
            ? paletteCode(c.getFgColor(), false)
            : null;
        const bg = c.isBgRGB()
          ? `#${c.getBgColor().toString(16).padStart(6, "0")}`
          : c.isBgPalette()
            ? paletteCode(c.getBgColor(), true)
            : null;
        const bold = c.isBold() !== 0;
        const text = c.getChars() || " ";
        const last = out.at(-1);
        if (last && last.fg === fg && last.bg === bg && last.bold === bold) last.text += text;
        else out.push({ text, fg, bg, bold });
      }
      return out;
    });
  }

  /** The cursor's place on screen: column and row, from 0. */
  cursor(): { x: number; y: number } {
    const b = this.xterm.buffer.active;
    return { x: b.cursorX, y: b.cursorY };
  }

  /** Close the pseudo-terminal (the program, if still running, gets a hangup) and the screen. */
  close(): void {
    this.pty?.close();
    this.pty = null;
  }

  dispose(): void {
    this.close();
    this.xterm.dispose();
  }
}
