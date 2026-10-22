// One real-terminal check's slipbox, in a herdr pane: a fresh copy of the demo vault (or the reference set built, halden
// beside it), its own config, state and cache, the app started in the pane, and ways to drive and check it. Every check
// waits for the screen to agree (up to a timeout) rather than sleeping a fixed time. The headless checks
// (tests/terminal/session.ts) are the rest; this is what needs a real terminal.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { buildHome } from "../../../scripts/build-home.ts";
import { herdr, type Pane, sleep } from "./herdr.ts";

export const REPO = join(import.meta.dir, "..", "..", "..");
export const DEMO = join(REPO, "examples", "vault");

export interface SessionOptions {
  /** The note opened, relative to the vault (default: home.md). */
  open?: string;
  /** Extra user config, as TOML; `{vault}` is the scenario's copy of the vault. */
  config?: string;
  /** Run before slipbox starts, with the CLI at hand (`s.cli`): `init` another vault, say. */
  setup?: (s: Session) => void;
  /**
   * Start here instead (a path relative to the scenario's folder: `loose` is `<dir>/loose`,
   * `home/notes` the reference set's notes). `null`: no path at all, as `slipbox` alone.
   */
  startAt?: string | null;
  /**
   * The reference set (examples/home), built into the scenario's folder: `home/`, with its
   * repositories' histories, is $HOME for slipbox, the CLI and git; halden is `vault/` beside it.
   */
  home?: boolean;
  /** The folder slipbox starts in, relative to the scenario's folder (default: the repository). */
  cwd?: string;
  /** More arguments, before the path (`--theme`, `nord`). */
  args?: string[];
  /** More environment (`SLIPBOX_GLYPHS: "ascii"`); `{dir}` is the scenario's folder (`HOME: "{dir}/home"`). */
  env?: Record<string, string>;
  /** Don't wait for the first frame: a start meant to fail, or one the scenario waits for itself. */
  noWait?: boolean;
}

/** A word for sh: single-quoted. */
const shq = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

export class CheckFailed extends Error {}

/** The pane isn't back at a shell: nothing after this can run in it. */
export class Stuck extends Error {}

/** What the scenario needs isn't there (said why): skipped, named — never a silent pass. */
export class Skipped extends Error {}

export class Session {
  readonly dir: string;
  readonly vault: string;
  /** The reference set's home folder, when the scenario has it (`home`). */
  readonly home: string;
  readonly trace: string;
  private marker: string;

  constructor(
    readonly pane: Pane,
    readonly opts: SessionOptions = {},
  ) {
    this.dir = mkdtempSync(join(tmpdir(), "slipbox-herdr-"));
    this.vault = join(this.dir, "vault");
    this.home = join(this.dir, "home");
    // The reference set puts halden beside it as vault/ itself.
    if (opts.home) buildHome(this.dir);
    else cpSync(DEMO, this.vault, { recursive: true });
    for (const d of ["config/slipbox", "state", "cache"]) mkdirSync(join(this.dir, d), { recursive: true });
    // {vault} in a scenario's config is this scenario's own copy of the vault.
    // The machine's own linter stays out of the scenarios unless one asks for it (3.21).
    const config = (opts.config ?? "")
      .replaceAll("{vault}", this.vault)
      .replaceAll("{home}", this.home)
      .replaceAll("{dir}", this.dir);
    // Lint and language servers off unless a scenario asks: they'd run npx, start servers, install them.
    // The background auto-index too (20.9): it would walk your own home folder.
    const off = `${/^\[lint\]/m.test(config) ? "" : '\n[lint]\nenabled = "off"\n'}${/^\[lsp\]/m.test(config) ? "" : "\n[lsp]\nenabled = false\n"}${/^\[index\]/m.test(config) ? "" : "\n[index]\nbackground = false\n"}`;
    writeFileSync(join(this.dir, "config", "slipbox", "config.toml"), `${config}${off}`);
    this.trace = join(this.dir, "trace");
    writeFileSync(this.trace, "");
    this.marker = `__slipbox_herdr_exit_${Math.random().toString(36).slice(2, 8)}__`;
  }

  /** What slipbox and the CLI run with: this scenario's own folders, never yours. */
  env(): Record<string, string> {
    return {
      XDG_CONFIG_HOME: `${this.dir}/config`,
      XDG_STATE_HOME: `${this.dir}/state`,
      XDG_CACHE_HOME: `${this.dir}/cache`,
      XDG_DATA_HOME: `${this.dir}/data`,
      SLIPBOX_TRACE: this.trace,
      // Its own config, whatever the shell exports (SLIPBOX_CONFIG would win over XDG_CONFIG_HOME).
      SLIPBOX_CONFIG: `${this.dir}/config/slipbox/config.toml`,
      SLIPBOX_CLIPBOARD: "file", // copies land in the state dir, not on your clipboard
      ...(this.opts.home ? { HOME: this.home } : {}),
      ...Object.fromEntries(Object.entries(this.opts.env ?? {}).map(([k, v]) => [k, v.replaceAll("{dir}", this.dir)])),
    };
  }

  /** Start slipbox and wait for its first frame (unless the scenario waits itself: `noWait`). */
  async start(): Promise<void> {
    const env = Object.entries(this.env())
      .map(([k, v]) => `${k}=${shq(v)}`)
      .join(" ");
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
    // A marker of this start's own: started again in one scenario, the last exit's is still on screen.
    this.marker = `__slipbox_herdr_exit_${Math.random().toString(36).slice(2, 8)}__`;
    // Bun by its own path: with $HOME the reference set's, nothing may depend on finding it.
    const argv = [process.execPath, join(REPO, "src", "main.ts"), ...(this.opts.args ?? []), ...file]
      .map(shq)
      .join(" ");
    this.pane.run(`clear; cd ${shq(cwd)} && ${env} ${argv}; echo ${this.marker} $?`);
    if (this.opts.noWait) return;
    await this.until(
      () =>
        this.statusLine().includes("READ") ||
        this.statusLine().includes("SOURCE") ||
        this.statusLine().includes("FILES"),
      10000,
      "slipbox to start",
    );
    // Its first frame isn't its last at start (a loaded machine is slower to finish): keys sent before
    // it settles can be read as the terminal's answers, and lost.
    await this.settle();
  }

  /** Quit, then start again with these options changed (the same folders: its state carries over). */
  async restart(changes: Partial<SessionOptions> = {}): Promise<void> {
    await this.quit();
    Object.assign(this.opts as SessionOptions, changes);
    await this.start();
  }

  /**
   * Quit (discarding changes) and wait for the shell; true if it exited cleanly. A slipbox that
   * won't quit is killed — it must never be left to swallow the next scenario's keys — and if even
   * that fails, the run stops (Stuck).
   */
  async quit(): Promise<boolean> {
    if (!this.exited()) {
      await this.pane.keys("escape", "escape");
      this.pane.text(":q!");
      await this.pane.keys("enter");
      await this.until(() => this.exited(), 5000, "slipbox to quit").catch(() => undefined);
    }
    if (!this.exited()) {
      // The pane's own slipbox, by its pid; or by its command line, which names this scenario's own
      // folder (started with a path) — either way nothing else.
      const pid = this.pid();
      if (pid) process.kill(pid, "SIGKILL");
      else spawnSync("pkill", ["-f", this.dir]);
      await this.until(() => this.exited(), 5000, "slipbox to be killed").catch(() => undefined);
      if (!this.exited()) throw new Stuck(`slipbox in pane ${this.pane.id} would not quit or die; stopping`);
      // Killed, it left the terminal as it had it — the alternate screen, raw keys: reset for the next.
      this.pane.run("reset");
      await this.until(() => this.pane.recent(5).trim() !== "", 5000, "the terminal reset").catch(() => undefined);
      return false;
    }
    return this.exitCode() === 0;
  }

  cleanup(): void {
    rmSync(this.dir, { recursive: true, force: true });
  }

  /** The pid of slipbox running in the pane, or null. */
  pid(): number | null {
    const info = JSON.parse(herdr("pane", "process-info", "--pane", this.pane.id)).result?.process_info;
    const p = (info?.foreground_processes ?? []).find((x: { argv: string[] }) =>
      x.argv.some((a) => a.endsWith(join("src", "main.ts"))),
    );
    return p ? (p.pid as number) : null;
  }

  /** Send slipbox a signal (SIGTERM, SIGHUP…), as a closing terminal or `kill` would. */
  signal(sig: NodeJS.Signals): void {
    const pid = this.pid();
    if (!pid) throw new CheckFailed(`no slipbox running to send ${sig} to\n${this.dump()}`);
    process.kill(pid, sig);
  }

  /** The terminal's title, as slipbox last set it. */
  title(): string {
    return JSON.parse(herdr("pane", "get", this.pane.id)).result?.pane?.terminal_title ?? "";
  }

  /** The pane's size in its tab's layout, as herdr lays it out (with no client attached, not the pty's). */
  layoutSize(): { cols: number; rows: number } {
    const panes = JSON.parse(herdr("pane", "layout", "--pane", this.pane.id)).result?.layout?.panes ?? [];
    const rect = panes.find((p: { pane_id: string }) => p.pane_id === this.pane.id)?.rect ?? { width: 0, height: 0 };
    return { cols: rect.width, rows: rect.height };
  }

  /** Zoom the pane to the whole tab, or back: a real resize (SIGWINCH), as dragging a split is. */
  async zoom(on: boolean): Promise<void> {
    herdr("pane", "zoom", this.pane.id, on ? "--on" : "--off");
    await this.settle();
  }

  /** The commands run so far (SLIPBOX_TRACE). */
  commands(): string[] {
    return readFileSync(this.trace, "utf8").split("\n").filter(Boolean);
  }

  // -------------------------------------------------------------------------------------------
  // Driving.

  async keys(...keys: string[]): Promise<void> {
    // An escape and the key after it, read together, are alt+key — and a loaded machine reads late,
    // whatever the pause between them. So the escape is seen taking effect (the screen changing,
    // within a second) before the next key goes.
    let from = 0;
    for (let i = 0; i < keys.length - 1; i++) {
      if (keys[i] !== "escape" && keys[i] !== "esc") continue;
      if (i > from) {
        await this.pane.keys(...keys.slice(from, i));
        await this.settle();
      }
      const before = this.pane.screen().join("\n");
      await this.pane.keys(keys[i]!);
      const end = Date.now() + 1000;
      while (Date.now() < end && this.pane.screen().join("\n") === before) await sleep(20);
      from = i + 1;
    }
    await this.pane.keys(...keys.slice(from));
    await this.settle();
  }

  async type(text: string): Promise<void> {
    this.pane.text(text);
    await this.settle();
  }

  /** Text pasted, as a terminal sends a paste: bracketed (one event, not keys). */
  async paste(text: string): Promise<void> {
    this.pane.text(`\x1b[200~${text}\x1b[201~`);
    await this.settle();
  }

  /** A command line at `:`: typed and entered. */
  async ex(command: string): Promise<void> {
    await this.pane.keys(":");
    await sleep(60);
    this.pane.text(command);
    await sleep(60);
    await this.keys("enter");
  }

  /** Wait until the screen stops changing (or `max` ms). */
  async settle(max = 1500): Promise<void> {
    let last = "";
    let same = 0;
    const end = Date.now() + max;
    while (Date.now() < end) {
      const now = this.pane.screen().join("\n");
      if (now === last && ++same >= 2) return;
      if (now !== last) same = 0;
      last = now;
      await sleep(40);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Reading.

  screen(): string[] {
    return this.pane.screen();
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

  /** The first row containing `needle`, or -1. */
  rowOf(needle: string | RegExp): number {
    return this.screen().findIndex((r) => (typeof needle === "string" ? r.includes(needle) : needle.test(r)));
  }

  /** A path a scenario names: `~/…` in the reference set's home, an absolute one as it is, else in halden's copy. */
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
    const { SLIPBOX_TRACE: _, ...env } = this.env();
    const r = spawnSync(process.execPath, [join(REPO, "src", "main.ts"), ...args], {
      cwd: this.path(cwd),
      encoding: "utf8",
      env: { ...process.env, ...env, NO_COLOR: "1" },
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

  /** The shell printed the marker with an exit code (the command line itself has `$?` there). */
  exited(): boolean {
    return this.exitCode() !== null;
  }

  exitCode(): number | null {
    // In the scrollback; or on the visible screen when the terminal is still in the alternate
    // screen (a killed slipbox never left it), where the scrollback reads empty.
    const re = new RegExp(`${this.marker} (\\d+)`);
    const m = re.exec(this.pane.recent(15)) ?? re.exec(this.pane.screen().join("\n"));
    return m ? Number(m[1]) : null;
  }

  // -------------------------------------------------------------------------------------------
  // Checks: each waits up to `timeout` for the screen to agree.

  async until(ok: () => boolean, timeout = 3000, what = "the condition"): Promise<void> {
    const end = Date.now() + timeout;
    for (;;) {
      if (ok()) return;
      if (Date.now() > end) throw new CheckFailed(`timed out waiting for ${what}\n${this.dump()}`);
      // Exited: what was awaited may have come with it (an exit itself, its last words) — looked at
      // once more, since it may have happened between the two looks.
      if (this.exited() && !ok())
        throw new CheckFailed(`slipbox exited while waiting for ${what}\n${this.pane.recent(40)}`);
      await sleep(50);
    }
  }

  async see(needle: string | RegExp, timeout = 3000): Promise<void> {
    await this.until(() => this.rowOf(needle) >= 0, timeout, `the screen to show ${needle}`);
  }

  async notSee(needle: string | RegExp, timeout = 3000): Promise<void> {
    await this.until(() => this.rowOf(needle) < 0, timeout, `the screen to stop showing ${needle}`);
  }

  async status(needle: string | RegExp, timeout = 3000): Promise<void> {
    const has = () =>
      typeof needle === "string" ? this.statusLine().includes(needle) : needle.test(this.statusLine());
    await this.until(has, timeout, `the status line to show ${needle}`);
  }

  /** A message showing: in its floating box (a long one wraps, so the needle is kept short). */
  async message(needle: string | RegExp, timeout = 3000): Promise<void> {
    const has = () => this.screen().some((r) => (typeof needle === "string" ? r.includes(needle) : needle.test(r)));
    await this.until(has, timeout, `a message showing ${needle}`);
  }

  async file(rel: string, check: (text: string) => boolean, what = `${rel} to change`, timeout = 3000): Promise<void> {
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
