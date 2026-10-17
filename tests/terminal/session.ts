// One check's slipbox: a fresh copy of the demo vault (or the reference set built, halden beside it), its own config,
// state, cache, home and temporary folder, slipbox started in a headless terminal of its own (terminal.ts), and ways
// to drive and check it. Every check waits for the screen to agree (up to a timeout) rather than sleeping a fixed time.

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { buildHome } from "../../scripts/build-home.ts";
import type { Keyboard } from "./keys.ts";
import { HeadlessTerminal, type StyledRun } from "./terminal.ts";

export type { StyledRun } from "./terminal.ts";

export const REPO = join(import.meta.dir, "..", "..");
export const DEMO = join(REPO, "examples", "vault");

/**
 * Where a check's folder goes, by its real path: a home reached through a symlink isn't a person's (slipbox resolves
 * paths, and `~` would never match it). On macOS, /tmp (/private/tmp) rather than the per-user temporary folder
 * (/private/var/folders/…/T/), a path long enough that messages and lists naming files in it wrap and cut differently
 * from Linux's.
 */
const BASE = realpathSync(process.platform === "darwin" ? "/tmp" : tmpdir());

/** The size a check's terminal has unless it asks for another: the size today's scenarios were written at. */
export const SIZE = { cols: 236, rows: 85 };

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The least a check's wait for the screen gets (`SLIPBOX_TERMINAL_WAIT`, ms). */
export const WAIT = Number(process.env.SLIPBOX_TERMINAL_WAIT ?? 10_000);

export interface SessionOptions {
  /** The note opened, relative to the vault (default: home.md). */
  open?: string;
  /** Extra user config, as TOML; `{vault}` is the check's copy of the vault, `{home}` and `{dir}` likewise. */
  config?: string;
  /** Run before slipbox starts, with the CLI at hand (`s.cli`): `init` another vault, say. */
  setup?: (s: Session) => void;
  /**
   * Start here instead (a path relative to the check's folder: `home/notes` is the reference set's notes). `null`: no
   * path at all, as `slipbox` alone.
   */
  startAt?: string | null;
  /**
   * The reference set (examples/home), built into the check's folder: `home/`, with its repositories' histories, is
   * $HOME for slipbox, the CLI and git; halden is `vault/` beside it. Without it, the demo vault is `vault/`.
   */
  home?: boolean;
  /** The folder slipbox starts in, relative to the check's folder (default: the repository). */
  cwd?: string;
  /** More arguments, before the path (`--theme`, `nord`). */
  args?: string[];
  /** More environment (`SLIPBOX_GLYPHS: "ascii"`); `{dir}` is the check's folder. */
  env?: Record<string, string>;
  /** Don't wait for the first frame: a start meant to fail, or one the check waits for itself. */
  noWait?: boolean;
  /** The terminal's size (default SIZE). */
  size?: { cols: number; rows: number };
  /** Keys as Kitty's protocol has them (the default), or as a terminal without it. */
  keyboard?: Keyboard;
  /** A terminal that draws Kitty's graphics: slipbox's pictures as placeholder cells (the docs' screenshots). */
  graphics?: boolean;
}

export class CheckFailed extends Error {}

/** What the check needs isn't there (said why): skipped, named — never a silent pass. */
export class Skipped extends Error {}

export class Session {
  readonly dir: string;
  readonly vault: string;
  /** The check's home folder: the reference set's, with `home`; an empty one otherwise. */
  readonly home: string;
  readonly trace: string;
  readonly term: HeadlessTerminal;

  constructor(readonly opts: SessionOptions = {}) {
    this.dir = realpathSync(mkdtempSync(join(BASE, "slipbox-terminal-")));
    this.vault = join(this.dir, "vault");
    this.home = join(this.dir, "home");
    // The reference set puts halden beside it as vault/ itself.
    if (opts.home) buildHome(this.dir);
    else cpSync(DEMO, this.vault, { recursive: true });
    for (const d of ["config/slipbox", "state", "cache", "data", "home", "tmp"])
      mkdirSync(join(this.dir, d), { recursive: true });
    const config = (opts.config ?? "")
      .replaceAll("{vault}", this.vault)
      .replaceAll("{home}", this.home)
      .replaceAll("{dir}", this.dir);
    // Lint and language servers off unless a check asks: they'd run npx, start servers, install them. The
    // background auto-index too (20.9): it would walk the whole home folder.
    const off = `${/^\[lint\]/m.test(config) ? "" : '\n[lint]\nenabled = "off"\n'}${/^\[lsp\]/m.test(config) ? "" : "\n[lsp]\nenabled = false\n"}${/^\[index\]/m.test(config) ? "" : "\n[index]\nbackground = false\n"}`;
    writeFileSync(join(this.dir, "config", "slipbox", "config.toml"), `${config}${off}`);
    this.trace = join(this.dir, "trace");
    writeFileSync(this.trace, "");
    const size = opts.size ?? SIZE;
    this.term = new HeadlessTerminal({
      cols: size.cols,
      rows: size.rows,
      keyboard: opts.keyboard,
      graphics: opts.graphics,
    });
  }

  get cols(): number {
    return this.term.opts.cols;
  }

  get rows(): number {
    return this.term.opts.rows;
  }

  /** What slipbox and the CLI run with: this check's own folders, never yours. */
  env(): Record<string, string> {
    return {
      XDG_CONFIG_HOME: `${this.dir}/config`,
      XDG_STATE_HOME: `${this.dir}/state`,
      XDG_CACHE_HOME: `${this.dir}/cache`,
      XDG_DATA_HOME: `${this.dir}/data`,
      HOME: this.home,
      TMPDIR: `${this.dir}/tmp`,
      SLIPBOX_TRACE: this.trace,
      // Its own config, whatever the shell exports (SLIPBOX_CONFIG would win over XDG_CONFIG_HOME).
      SLIPBOX_CONFIG: `${this.dir}/config/slipbox/config.toml`,
      SLIPBOX_CLIPBOARD: "file", // copies land in the state dir, not on your clipboard
      ...Object.fromEntries(Object.entries(this.opts.env ?? {}).map(([k, v]) => [k, v.replaceAll("{dir}", this.dir)])),
    };
  }

  /** The environment slipbox starts with: a terminal's, the check's folders, and nothing of yours but PATH. */
  private processEnv(): Record<string, string> {
    return {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      LANG: "C.UTF-8",
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      ...this.env(),
    };
  }

  /** Start slipbox and wait for its first frame (unless the check waits itself: `noWait`). */
  async start(): Promise<void> {
    this.opts.setup?.(this);
    const at = this.opts.startAt;
    const file =
      at === null
        ? []
        : [
            at !== undefined
              ? isAbsolute(at)
                ? at
                : join(this.dir, at)
              : join(this.vault, this.opts.open ?? "home.md"),
          ];
    const cwd = this.opts.cwd !== undefined ? join(this.dir, this.opts.cwd) : REPO;
    // Bun by its own path: with $HOME the check's, nothing may depend on finding it.
    const argv = [process.execPath, join(REPO, "src", "main.ts"), ...(this.opts.args ?? []), ...file];
    this.term.spawn(argv, { cwd, env: this.processEnv() });
    if (this.opts.noWait) return;
    await this.until(() => /\b(READ|SOURCE|FILES|LENS)\b/.test(this.statusLine()), 15000, "slipbox to start");
    // Its first frame isn't its last at start: what it reads after drawing (the index, git) redraws it.
    await this.settle();
  }

  /** Quit, then start again with these options changed (the same folders: its state carries over). */
  async restart(changes: Partial<SessionOptions> = {}): Promise<void> {
    await this.quit();
    Object.assign(this.opts as SessionOptions, changes);
    await this.start();
  }

  /** Quit (discarding changes); true if it exited cleanly. One that won't quit is killed. */
  async quit(): Promise<boolean> {
    if (!this.exited()) {
      await this.keys("escape", "escape");
      this.term.write(":q!");
      await this.keys("enter");
      await this.until(() => this.exited(), 5000, "slipbox to quit").catch(() => undefined);
    }
    if (!this.exited()) {
      const pid = this.term.pid;
      if (pid) process.kill(pid, "SIGKILL");
      await this.until(() => this.exited(), 5000, "slipbox to be killed").catch(() => undefined);
      return false;
    }
    return this.exitCode() === 0;
  }

  /** Kill what's left, close the terminal, and remove the check's folder. */
  cleanup(): void {
    const pid = this.term.pid;
    if (pid) process.kill(pid, "SIGKILL");
    this.term.dispose();
    rmSync(this.dir, { recursive: true, force: true });
  }

  /** The pid of slipbox while it runs, or null. */
  pid(): number | null {
    return this.term.pid;
  }

  /** Send slipbox a signal (SIGTERM, SIGHUP…), as a closing terminal or `kill` would. */
  signal(sig: NodeJS.Signals): void {
    const pid = this.pid();
    if (!pid) throw new CheckFailed(`no slipbox running to send ${sig} to\n${this.dump()}`);
    process.kill(pid, sig);
  }

  /** The terminal's title, as slipbox last set it. */
  title(): string {
    return this.term.title;
  }

  /** Resize the terminal, as dragging a split or the window does (SIGWINCH); waits for the redraw. */
  async resize(cols: number, rows: number): Promise<void> {
    this.term.resize(cols, rows);
    await this.settle();
  }

  /** The commands run so far (SLIPBOX_TRACE: its other lines are keys handled and frames painted). */
  commands(): string[] {
    return readFileSync(this.trace, "utf8")
      .split("\n")
      .filter((l) => l && l !== "key" && l !== "frame");
  }

  /** The trace's lines: commands run, `key` for each key or paste handled, `frame` for each frame painted. */
  private traced(): string[] {
    return readFileSync(this.trace, "utf8").split("\n");
  }

  /** How many keys and pastes slipbox has handled so far. */
  private handled(): number {
    return this.traced().filter((l) => l === "key").length;
  }

  /**
   * Wait until slipbox has handled `n` more keys than `before`, and painted a frame after the last of them (or WAIT
   * has gone by, or it has exited): on a loaded machine it reads keys late and draws late, and what a check reads
   * next must show them.
   */
  private async taken(before: number, n: number): Promise<void> {
    const shown = () => {
      let keys = 0;
      let at = -1;
      const lines = this.traced();
      for (let i = 0; i < lines.length && at < 0; i++) if (lines[i] === "key" && ++keys === before + n) at = i;
      return at >= 0 && lines.indexOf("frame", at) > at;
    };
    const end = Date.now() + WAIT;
    while (!shown() && !this.exited() && Date.now() < end) await sleep(5);
  }

  // -------------------------------------------------------------------------------------------
  // Driving.

  async keys(...keys: string[]): Promise<void> {
    const before = this.handled();
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]!;
      this.term.key(k);
      // A terminal without Kitty's keys sends escape as the start of alt+key: the escape is seen taking effect (the
      // screen changing, within a second) before the next key goes. With Kitty's, nothing waits.
      if ((k === "escape" || k === "esc") && i < keys.length - 1 && !this.term.kittyKeys) {
        const before = this.text();
        const end = Date.now() + 1000;
        while (Date.now() < end && this.text() === before) await sleep(10);
      } else await sleep(2);
    }
    await this.taken(before, keys.length);
    await this.settle();
  }

  /** Text, as typed: a key for each character (each code point, as slipbox reads them). */
  async type(text: string): Promise<void> {
    const before = this.handled();
    this.term.write(text);
    await this.taken(before, [...text].length);
    await this.settle();
  }

  /** Text pasted, as a terminal sends a paste: bracketed (one event, not keys). */
  async paste(text: string): Promise<void> {
    const before = this.handled();
    this.term.write(`\x1b[200~${text}\x1b[201~`);
    await this.taken(before, 1);
    await this.settle();
  }

  /** Raw bytes, as a terminal would send them (a key no name covers, a query's answer). */
  async send(bytes: string): Promise<void> {
    const sent = performance.now();
    this.term.write(bytes);
    await this.settle(sent);
  }

  /** A command line at `:`: typed and entered. */
  async ex(command: string): Promise<void> {
    await this.keys(":");
    await this.type(command);
    await this.keys("enter");
  }

  /**
   * Wait until slipbox has been quiet a while (nothing written for `quiet` ms, all of it drawn, no frame half drawn),
   * or `max` ms. After input `sent` at a time, first for it to answer — anything written since, up to a second: on a
   * loaded machine slipbox reads a key late, and quiet before it has is no sign of anything. Its work after a key (a
   * search, a parse) can take longer still: a check waits for what it expects with `until`.
   */
  async settle(sent?: number, max = 1500, quiet = 40): Promise<void> {
    if (sent !== undefined) {
      const answer = sent + 1000;
      while (this.term.lastOutput <= sent && performance.now() < answer) await sleep(5);
    }
    const end = performance.now() + max;
    await sleep(quiet);
    while (performance.now() < end) {
      if (this.term.drawn && !this.term.midFrame && performance.now() - this.term.lastOutput >= quiet) return;
      await sleep(10);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Reading.

  screen(): string[] {
    return this.term.screen();
  }

  text(): string {
    return this.screen().join("\n");
  }

  /** The last non-empty row: the status line (or a prompt over it). */
  statusLine(): string {
    const rows = this.screen();
    for (let i = rows.length - 1; i >= 0; i--) if (rows[i]!.trim()) return rows[i]!;
    return "";
  }

  topBar(): string {
    return this.screen()[0] ?? "";
  }

  /** The screen with its colours: each row as runs of one style. */
  runs(): StyledRun[][] {
    return this.term.runs();
  }

  /** The style of the first place `needle` shows on screen: the run its first character is in. */
  styleOf(needle: string): StyledRun | null {
    for (const row of this.runs()) {
      const plain = row.map((r) => r.text).join("");
      const at = plain.indexOf(needle);
      if (at < 0) continue;
      let n = 0;
      for (const r of row) {
        if (at < n + r.text.length) return r;
        n += r.text.length;
      }
    }
    return null;
  }

  /** The first row containing `needle`, or -1. */
  rowOf(needle: string | RegExp): number {
    return this.screen().findIndex((r) => (typeof needle === "string" ? r.includes(needle) : needle.test(r)));
  }

  /** The terminal's main screen after slipbox has left it: what it printed on its way out, the last `lines` rows. */
  after(lines = 30): string {
    const b = this.term.xterm.buffer.normal;
    const rows: string[] = [];
    for (let i = 0; i < b.length; i++) rows.push(b.getLine(i)?.translateToString(true) ?? "");
    while (rows.length && !rows.at(-1)!.trim()) rows.pop();
    return rows.slice(-lines).join("\n");
  }

  /** Every OSC 52 copy slipbox sent the terminal, in order. */
  osc52(): string[] {
    return this.term.copies;
  }

  /** A path a check names: `~/…` in the check's home, an absolute one as it is, else in the vault's copy. */
  path(rel: string): string {
    if (rel.startsWith("~/")) return join(this.home, rel.slice(2));
    return isAbsolute(rel) ? rel : join(this.vault, rel);
  }

  read(rel: string): string {
    return readFileSync(this.path(rel), "utf8");
  }

  exists(rel: string): boolean {
    return existsSync(this.path(rel));
  }

  /** The slipbox CLI, as an agent runs it beside the TUI: the same vault, config and state. */
  cli(...args: string[]): { code: number; out: string } {
    return this.cliIn(this.vault, ...args);
  }

  /** The CLI run from a folder (`~/…` in the reference set). */
  cliIn(cwd: string, ...args: string[]): { code: number; out: string } {
    const { SLIPBOX_TRACE: _, ...env } = this.processEnv();
    const r = spawnSync(process.execPath, [join(REPO, "src", "main.ts"), ...args], {
      cwd: this.path(cwd),
      encoding: "utf8",
      env: { ...env, NO_COLOR: "1" },
    });
    return { code: r.status ?? -1, out: r.stdout };
  }

  /** What was copied last (SLIPBOX_CLIPBOARD=file puts copies in clipboard.txt in the state dir). */
  clipboard(): string {
    for (const f of readdirSync(join(this.dir, "state"), { recursive: true }) as string[]) {
      if (f.endsWith("clipboard.txt")) return readFileSync(join(this.dir, "state", f), "utf8");
    }
    return "";
  }

  /** Write a file from outside the app (an agent's edit): in the vault, or `~/…`. */
  write(rel: string, text: string): void {
    const p = this.path(rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, text);
  }

  /** slipbox has exited, and everything it wrote is on the screen (its last words come after its exit is known). */
  exited(): boolean {
    return this.exitCode() !== null && this.term.drawn && performance.now() - this.term.lastOutput >= 30;
  }

  exitCode(): number | null {
    return this.term.exitCode;
  }

  // -------------------------------------------------------------------------------------------
  // Checks: each waits up to `timeout` for the screen to agree.

  async until(ok: () => boolean, timeout = WAIT, what = "the condition"): Promise<void> {
    // At least WAIT, whatever the check asked: a machine with a check on every core (CI's too) is slower than the one
    // a check was written on, and a wait that passes returns at once — only a failure takes longer to say so.
    const end = Date.now() + Math.max(timeout, WAIT);
    for (;;) {
      // Only between frames: in one, the screen is part the last frame, part the next.
      if (!this.term.midFrame && ok()) return;
      if (Date.now() > end) throw new CheckFailed(`timed out waiting for ${what}\n${this.dump()}`);
      // Exited: what was awaited may have come with it (an exit itself, its last words) — looked at once more.
      if (this.exited() && !ok()) throw new CheckFailed(`slipbox exited while waiting for ${what}\n${this.after(40)}`);
      await sleep(20);
    }
  }

  /**
   * Do `act`, then wait up to `every` ms for `ok`; again, until it holds or `within` ms (at least WAIT) have gone by.
   * For what lands only once slipbox is ready (the dictionaries loaded): a key pressed early does nothing.
   */
  async retry(act: () => Promise<void>, ok: () => boolean, what: string, every = 1000, within = WAIT): Promise<void> {
    const end = Date.now() + Math.max(within, WAIT);
    for (;;) {
      await act();
      const by = Date.now() + every;
      while (Date.now() < by && !ok()) await sleep(20);
      if (ok()) return;
      if (Date.now() > end) throw new CheckFailed(`timed out waiting for ${what}\n${this.dump()}`);
      if (this.exited()) throw new CheckFailed(`slipbox exited while waiting for ${what}\n${this.after(40)}`);
    }
  }

  async see(needle: string | RegExp, timeout = WAIT): Promise<void> {
    await this.until(() => this.rowOf(needle) >= 0, timeout, `the screen to show ${needle}`);
  }

  async notSee(needle: string | RegExp, timeout = WAIT): Promise<void> {
    await this.until(() => this.rowOf(needle) < 0, timeout, `the screen to stop showing ${needle}`);
  }

  async status(needle: string | RegExp, timeout = WAIT): Promise<void> {
    const has = () =>
      typeof needle === "string" ? this.statusLine().includes(needle) : needle.test(this.statusLine());
    await this.until(has, timeout, `the status line to show ${needle}`);
  }

  /** A message showing: in its floating box (a long one wraps, so the needle is kept short). */
  async message(needle: string | RegExp, timeout = WAIT): Promise<void> {
    await this.see(needle, timeout);
  }

  async file(rel: string, check: (text: string) => boolean, what = `${rel} to change`, timeout = WAIT): Promise<void> {
    await this.until(() => this.exists(rel) && check(this.read(rel)), timeout, what);
  }

  expect(ok: boolean, what: string): void {
    if (!ok) throw new CheckFailed(`${what}\n${this.dump()}`);
  }

  /** The screen, for a failure message. */
  dump(): string {
    return this.screen()
      .map((r, i) => `${String(i).padStart(3)}│${r.trimEnd()}`)
      .join("\n");
  }
}
