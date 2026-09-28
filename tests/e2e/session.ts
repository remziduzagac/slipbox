// One scenario's slipbox: a fresh copy of the demo vault, its own config, state and cache, the app
// started in the pane, and ways to drive and check it. Every check waits for the screen to agree
// (up to a timeout) rather than sleeping a fixed time.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Pane, sleep } from "./herdr.ts";

export const REPO = join(import.meta.dir, "..", "..");
export const DEMO = join(REPO, "examples", "vault");

export interface SessionOptions {
  /** The note opened, relative to the vault (default: home.md). */
  open?: string;
  /** Extra user config, as TOML; `{vault}` is the scenario's copy of the vault. */
  config?: string;
  /** More files in the vault before it starts: path → content. */
  files?: Record<string, string>;
}

export class CheckFailed extends Error {}

/** The pane isn't back at a shell: nothing after this can run in it. */
export class Stuck extends Error {}

export class Session {
  readonly dir: string;
  readonly vault: string;
  readonly trace: string;
  private readonly marker: string;

  constructor(
    readonly pane: Pane,
    readonly opts: SessionOptions = {},
  ) {
    this.dir = mkdtempSync(join(tmpdir(), "slipbox-e2e-"));
    this.vault = join(this.dir, "vault");
    cpSync(DEMO, this.vault, { recursive: true });
    for (const [rel, text] of Object.entries(opts.files ?? {})) this.write(rel, text);
    for (const d of ["config/slipbox", "state", "cache"]) mkdirSync(join(this.dir, d), { recursive: true });
    // {vault} in a scenario's config is this scenario's own copy of the vault.
    writeFileSync(join(this.dir, "config", "slipbox", "config.toml"), (opts.config ?? "").replaceAll("{vault}", this.vault));
    this.trace = join(this.dir, "trace");
    writeFileSync(this.trace, "");
    this.marker = `__slipbox_e2e_exit_${Math.random().toString(36).slice(2, 8)}__`;
  }

  /** Start slipbox and wait for its first frame. */
  async start(): Promise<void> {
    const env = [
      `XDG_CONFIG_HOME=${this.dir}/config`,
      `XDG_STATE_HOME=${this.dir}/state`,
      `XDG_CACHE_HOME=${this.dir}/cache`,
      `SLIPBOX_TRACE=${this.trace}`,
      "SLIPBOX_CLIPBOARD=file", // copies land in the state dir, not on your clipboard
    ].join(" ");
    const file = join(this.vault, this.opts.open ?? "home.md");
    this.pane.run(`clear; cd ${REPO} && ${env} bun src/main.ts '${file}'; echo ${this.marker} $?`);
    await this.until(() => this.statusLine().includes("READ") || this.statusLine().includes("SOURCE"), 10000, "slipbox to start");
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
      // Its command line names this scenario's own vault, so this kills nothing else.
      spawnSync("pkill", ["-f", this.vault]);
      await this.until(() => this.exited(), 5000, "slipbox to be killed").catch(() => undefined);
      if (!this.exited()) throw new Stuck(`slipbox in pane ${this.pane.id} would not quit or die; stopping`);
      return false;
    }
    return this.exitCode() === 0;
  }

  cleanup(): void {
    rmSync(this.dir, { recursive: true, force: true });
  }

  /** The commands run so far (SLIPBOX_TRACE). */
  commands(): string[] {
    return readFileSync(this.trace, "utf8").split("\n").filter(Boolean);
  }

  // -------------------------------------------------------------------------------------------
  // Driving.

  async keys(...keys: string[]): Promise<void> {
    await this.pane.keys(...keys);
    await this.settle();
  }

  async type(text: string): Promise<void> {
    this.pane.text(text);
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

  read(rel: string): string {
    return readFileSync(join(this.vault, rel), "utf8");
  }

  exists(rel: string): boolean {
    return existsSync(join(this.vault, rel));
  }

  /** The slipbox CLI, as an agent runs it beside the TUI: the same vault, config and state. */
  cli(...args: string[]): { code: number; out: string } {
    const r = spawnSync("bun", [join(REPO, "src", "main.ts"), ...args], {
      cwd: this.vault,
      encoding: "utf8",
      env: { ...process.env, XDG_CONFIG_HOME: `${this.dir}/config`, XDG_STATE_HOME: `${this.dir}/state`, XDG_CACHE_HOME: `${this.dir}/cache`, NO_COLOR: "1" },
    });
    return { code: r.status ?? -1, out: r.stdout };
  }

  /** Write a file in the vault from outside the app (an agent's edit). */
  write(rel: string, text: string): void {
    const p = join(this.vault, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, text);
  }

  /** The shell printed the marker with an exit code (the command line itself has `$?` there). */
  exited(): boolean {
    return this.exitCode() !== null;
  }

  private exitCode(): number | null {
    const m = new RegExp(`${this.marker} (\\d+)`).exec(this.pane.recent(15));
    return m ? Number(m[1]) : null;
  }

  // -------------------------------------------------------------------------------------------
  // Checks: each waits up to `timeout` for the screen to agree.

  async until(ok: () => boolean, timeout = 3000, what = "the condition"): Promise<void> {
    const end = Date.now() + timeout;
    for (;;) {
      if (ok()) return;
      if (Date.now() > end) throw new CheckFailed(`timed out waiting for ${what}\n${this.dump()}`);
      if (this.exited()) throw new CheckFailed(`slipbox exited while waiting for ${what}\n${this.pane.recent(40)}`);
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
    const has = () => (typeof needle === "string" ? this.statusLine().includes(needle) : needle.test(this.statusLine()));
    await this.until(has, timeout, `the status line to show ${needle}`);
  }

  async top(needle: string | RegExp, timeout = 3000): Promise<void> {
    const has = () => (typeof needle === "string" ? this.topBar().includes(needle) : needle.test(this.topBar()));
    await this.until(has, timeout, `the top bar to show ${needle}`);
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
