// A herdr pane, driven: keys and text in, the screen out. Only what needs a real terminal uses it (tests/terminal/herdr:
// the real-terminal checks); slipbox itself never needs herdr.

import { spawnSync } from "node:child_process";

export class HerdrError extends Error {}

/** One herdr CLI call: its stdout, or an error with its stderr. */
export function herdr(...args: string[]): string {
  const r = spawnSync("herdr", args, { encoding: "utf8" });
  if (r.error) throw new HerdrError(`herdr ${args[0]}: ${r.error.message}`);
  if (r.status !== 0) throw new HerdrError(`herdr ${args.join(" ")}: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout;
}

/** Keys herdr's send-keys doesn't know, as the bytes a terminal sends for them. */
const RAW: Record<string, string> = {
  pagedown: "\x1b[6~",
  pageup: "\x1b[5~",
  "shift+pagedown": "\x1b[6;2~",
  "shift+pageup": "\x1b[5;2~",
  "ctrl+pagedown": "\x1b[6;5~",
  "ctrl+pageup": "\x1b[5;5~",
  home: "\x1b[H",
  end: "\x1b[F",
  "ctrl+home": "\x1b[1;5H",
  "ctrl+end": "\x1b[1;5F",
  "shift+ctrl+home": "\x1b[1;6H",
  "shift+ctrl+end": "\x1b[1;6F",
  "alt+up": "\x1b[1;3A",
  "alt+down": "\x1b[1;3B",
  "alt+left": "\x1b[1;3D",
  "alt+right": "\x1b[1;3C",
  "ctrl+up": "\x1b[1;5A",
  "ctrl+down": "\x1b[1;5B",
  "ctrl+left": "\x1b[1;5D",
  "ctrl+right": "\x1b[1;5C",
  "shift+up": "\x1b[1;2A",
  "shift+down": "\x1b[1;2B",
  "shift+left": "\x1b[1;2D",
  "shift+right": "\x1b[1;2C",
  "shift+ctrl+left": "\x1b[1;6D",
  "shift+ctrl+right": "\x1b[1;6C",
  "shift+ctrl+up": "\x1b[1;6A",
  "shift+ctrl+down": "\x1b[1;6B",
  "shift+home": "\x1b[1;2H",
  "shift+end": "\x1b[1;2F",
  "alt+shift+up": "\x1b[1;4A",
  "alt+shift+down": "\x1b[1;4B",
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Pane {
  private constructor(
    readonly id: string,
    /** Split by the runner, so closed by it at the end. */
    readonly owned: boolean,
  ) {}

  /** Columns and rows, as the shell in the pane sees them. */
  cols = 0;
  rows = 0;

  /**
   * The pane given (`--pane`, `SLIPBOX_HERDR_PANE`), or one of its own: split off this one, or in a
   * tab of its own (`tab`), which is as big as the whole window.
   */
  static open(given: string | undefined, cwd: string, tab = false): Pane {
    if (process.env.HERDR_ENV !== "1") throw new HerdrError("not inside herdr: these checks drive a herdr pane");
    if (given) {
      herdr("pane", "get", given); // it exists
      return new Pane(given, false);
    }
    if (tab) {
      const out = JSON.parse(herdr("tab", "create", "--no-focus", "--label", "slipbox terminal", "--cwd", cwd));
      const id = out.result?.root_pane?.pane_id as string | undefined;
      const tabId = out.result?.tab?.tab_id as string | undefined;
      if (!id || !tabId) throw new HerdrError("herdr tab create: no pane id in its reply");
      const p = new Pane(id, true);
      p.tab = tabId;
      return p;
    }
    const out = JSON.parse(herdr("pane", "split", "--current", "--direction", "right", "--no-focus", "--cwd", cwd));
    const id = out.result?.pane?.pane_id as string | undefined;
    if (!id) throw new HerdrError("herdr pane split: no pane id in its reply");
    herdr("pane", "rename", id, "slipbox terminal");
    return new Pane(id, true);
  }

  private tab?: string;

  close(): void {
    if (!this.owned) return;
    if (this.tab) herdr("tab", "close", this.tab);
    else herdr("pane", "close", this.id);
  }

  /**
   * Wait for the shell, then ask it the size (never set it: herdr owns the size). A new tab starts
   * at a placeholder size until herdr lays it out, so ask until two answers agree.
   */
  async measure(): Promise<void> {
    let last = "";
    for (let tries = 0; tries < 10; tries++) {
      const size = await this.ask();
      if (size === last) {
        [this.cols, this.rows] = size.split(" ").map(Number) as [number, number];
        return;
      }
      last = size;
      await sleep(1500);
    }
    throw new HerdrError(`pane ${this.id}: its size never settled`);
  }

  private async ask(): Promise<string> {
    const tag = `__slipbox_herdr_size_${Math.random().toString(36).slice(2, 8)}__`;
    for (let i = 0; i < 60; i++) {
      if (i % 20 === 0) this.run(`echo ${tag} $COLUMNS $LINES`);
      await sleep(100);
      const m = new RegExp(`${tag} (\\d+) (\\d+)`).exec(this.recent(20));
      if (m) return `${m[1]} ${m[2]}`;
    }
    throw new HerdrError(`pane ${this.id}: no shell answered`);
  }

  /** The visible screen, one string per row. */
  screen(): string[] {
    return herdr("pane", "read", this.id, "--source", "visible").replace(/\n$/, "").split("\n");
  }

  /** Recent output, soft wraps joined: for the shell around the app. */
  recent(lines = 200): string {
    return herdr("pane", "read", this.id, "--source", "recent-unwrapped", "--lines", String(lines));
  }

  /**
   * Keys by herdr's names (`j`, `ctrl+q`, `alt+h`, `escape`…). After an escape it pauses: an
   * escape followed at once by a key reads as alt+key.
   */
  async keys(...keys: string[]): Promise<void> {
    for (const k of keys) {
      // One printable character (a capital, a symbol) is typed as itself: a key name for it
      // (`G`, `$`) isn't something every herdr build encodes as that character.
      if ([...k].length === 1 && !/^[a-z0-9]$/.test(k)) this.text(k);
      else {
        try {
          herdr("pane", "send-keys", this.id, k);
        } catch (err) {
          // A key herdr has no name for: the escape sequence a terminal sends for it.
          if (!RAW[k] || !String(err).includes("unsupported key")) throw err;
          this.text(RAW[k]);
        }
      }
      await sleep(k === "escape" || k === "esc" ? 120 : 15);
    }
  }

  /** Text, as typed. */
  text(text: string): void {
    herdr("pane", "send-text", this.id, text);
  }

  /** A shell command line, with enter. */
  run(command: string): void {
    herdr("pane", "run", this.id, command);
  }
}
