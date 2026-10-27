// The TUI's side of upgrading and restarting (UPG). What the daily check found, or `:upgrade` asked for, is offered
// in the dialog once the TUI is quiet, by how slipbox was installed: the installer's upgrades and restarts, or
// upgrades beside the TUI (`slipbox upgrade --json`, a process of its own) for `:restart` to start later;
// Homebrew's and one put by hand are given the command or the address to copy. `:restart` asks first about notes
// unsaved, leaves its note (`core/application/distribution/restart.ts`) and quits; `tui/shell/terminal/run.ts`
// hands over once the screen is given back, and the slipbox that starts takes the note and comes back where you
// were.

import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { VERSION } from "../version.ts";
import { sanitize } from "../core/foundation/text/sanitize.ts";
import { tagOf } from "../core/application/distribution/release.ts";
import { readJson } from "../core/foundation/platform/fsutil.ts";
import { removeOlderThan } from "../core/foundation/platform/fsutil.ts";
import {
  type Channel,
  currentVersion,
  homebrewPrefix,
  type InstalledBy,
  howToUpgrade,
} from "../core/application/distribution/install.ts";
import { type SessionState, sessionFrom } from "../core/workspace/session/position.ts";
import type { ReleaseBuild } from "../core/application/distribution/release.ts";
import { type RestartNote, writeNote } from "../core/application/distribution/restart.ts";
import {
  askNewest,
  dailyUpdateCheck,
  doNotTrack,
  FROM_SOURCE,
  type Found,
  isNewer,
  isVersion,
  releasesBase,
  skipVersion,
  type UpgradeResult,
  upgradeSaid,
  versionOf,
} from "../core/application/distribution/update.ts";
import type { VaultMode } from "../core/workspace/vaults/vault.ts";
import type { App, Level } from "./app/runtime/app.ts";
import { openDialog } from "./dialog.ts";
import { stopInsert } from "./editing.ts";

/** What slipbox knows of itself and where it keeps things: `tui/shell/terminal/run.ts`'s, a test's own. */
export interface UpdateEnv {
  release: ReleaseBuild | null;
  version: string;
  by: InstalledBy;
  /** The installer's install's channel; any other follows stable releases. */
  channel: Channel;
  /** The installer's data folder. */
  data: string;
  /** This binary: `slipbox upgrade --json` is run with it. */
  execPath: string;
  /** The file it was started by, as the shell found it (`startedPath`): one put by hand is watched there. */
  startedBy: string | null;
  /** slipbox's state folder: `update.json`, a background upgrade's answer. */
  stateDir: string;
  env: Record<string, string | undefined>;
  /** Your own config's `[update] check`, read again. */
  checkOn: () => boolean;
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}

/** Where a restart comes back to (UPG-D4): the vault, home or Elsewhere's folder, and home's folder opened by name. */
export interface Place {
  mode: VaultMode;
  root: string;
  homeFolder: string | null;
}

/** The input quiet this long before an offer opens on its own. */
export const QUIET_MS = 2000;

/** The update offer, `:upgrade`, `:restart`. */
export class Updates {
  constructor(readonly app: App) {}

  /** `tui/shell/terminal/run.ts` sets it; without it (a test's App, unless it sets one) nothing is checked or offered. */
  env: UpdateEnv | null = null;
  /** Latest available release, kept on the bar after its offer closes. */
  available: string | null = null;
  /** What waits for a quiet moment to be shown, in turn, each once (by its key): an offer, a restart's, the restart's
   *  question after waiting for an upgrade. */
  private queue: { key: string; show: () => void }[] = [];
  /** The installer's `current` at start: what was installed then is no upgrade underneath — a version you went back to
   *  on purpose isn't offered to leave again. */
  private startedWith: string | null = null;
  /** The upgrade running beside the TUI (Upgrade, restart later). */
  background: { version: string; done: Promise<void> } | null = null;
  /** The versions this window's own background upgrade installed: said already, never offered again underneath. */
  readonly mine = new Set<string>();
  /** The restart asked for, its note written: `tui/shell/terminal/run.ts` hands over to it once the TUI has quit. */
  restartNote: RestartNote | null = null;
  /** `:upgrade` asking, or a restart waiting for an upgrade beside the TUI: asked again meanwhile, nothing more. */
  private checking = false;
  private restarting = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticks = 0;
  /** What was last seen where the next version would be (UPG-T6): the file's stamp, and the version it said. */
  private underneath: { stamp: string; version: string | null } | null = null;
  private looking = false;
  /** The versions installed underneath offered already: each once. */
  private readonly offeredUnderneath = new Set<string>();

  private get stateFile(): string {
    return join(this.env!.stateDir, "update.json");
  }

  releaseNotes(): string | null {
    const env = this.env;
    return this.available && env?.release
      ? `${releasesBase(env.release.repo, env.env)}/tag/${tagOf(this.available)}`
      : null;
  }

  copyReleaseNotes(): void {
    const url = this.releaseNotes();
    if (url) void this.app.copy(url, true, url);
  }

  about(): void {
    const env = this.env;
    const version = env?.version ?? VERSION;
    const current = env?.by === "installer" ? currentVersion(env.data) : null;
    const previous =
      env && current
        ? readJson<{ version?: unknown }>(join(env.data, "versions", current, "previous.json"), {}).version
        : null;
    const rows = [
      { label: `slipbox ${sanitize(version)}`, header: true, data: "version" },
      { label: `Channel: ${env?.channel ?? "stable"}`, header: true, data: "channel" },
      {
        label: `Previous version: ${typeof previous === "string" ? sanitize(previous) : "not recorded"}`,
        header: true,
        data: "previous",
      },
    ];
    if (this.available) rows.push({ label: `Available: ${sanitize(this.available)}`, header: true, data: "available" });
    const url = this.releaseNotes();
    if (url) rows.push({ label: `Release notes: ${sanitize(url)}`, header: false, data: "app.release_notes" });
    if (env?.release && env.by !== "installer")
      rows.push({ label: sanitize(howToUpgrade(env.by, env.release.repo)), header: true, data: "method" });
    else if (this.available && env?.by === "installer")
      rows.push({ label: "Upgrade", header: false, data: "app.upgrade" });
    this.app.overlays.openList({
      title: "About slipbox",
      items: rows.map((row) => (row.header ? { ...row, informational: true } : row)),
      filterable: false,
      accept: (item) => {
        if (String(item.data).startsWith("app.")) return this.app.run(String(item.data));
      },
    });
  }

  /** A release build's: the daily check started, and every second what waits looked at, every ten what's underneath. */
  start(): void {
    const env = this.env;
    if (!env?.release) return;
    // Background upgrades' answers left by a TUI that quit before they came, a day old.
    removeOlderThan(env.stateDir, 24 * 60 * 60 * 1000, /^upgrade-\d+\.json$/);
    void dailyUpdateCheck({
      release: env.release,
      version: env.version,
      enabled: env.checkOn(),
      env: env.env,
      stateFile: this.stateFile,
      by: env.by,
      channel: env.channel,
      fetcher: env.fetcher,
    }).then((f) => {
      if (f) this.found(f);
    });
    // What's there now is this one: never started to ask it.
    const where = this.watched(env);
    if (where && sameFile(where, env.execPath)) this.underneath = { stamp: stampOf(where) ?? "", version: env.version };
    if (env.by === "installer") this.startedWith = currentVersion(env.data);
    this.timer = setInterval(() => this.tick(), 1000);
    (this.timer as { unref?: () => void }).unref?.();
  }

  tick(): void {
    if (this.app.quitting) {
      if (this.timer) clearInterval(this.timer);
      return;
    }
    if (++this.ticks % 10 === 0) void this.lookUnderneath();
    this.tryOffer();
  }

  /** Where Homebrew's or a hand-put slipbox's next version would be: `opt`'s binary, or the path it was started by. */
  private watched(env: UpdateEnv): string | null {
    if (env.by === "homebrew") {
      const prefix = homebrewPrefix(env.execPath);
      return prefix ? join(prefix, "opt", "slipbox", "bin", "slipbox") : null;
    }
    return env.by === "other" ? env.startedBy : null;
  }

  /**
   * An upgrade underneath (UPG-T6), looked at every ten seconds — this machine's files only, so whatever the check's
   * switches say (UPG-D5): the version the installer's `current` names; Homebrew's `opt` binary, or the path a hand-put
   * one was started by, asked its version once its link or file changed. One newer than this is offered as the restart
   * alone, once; this window's own background upgrade is said already.
   */
  async lookUnderneath(): Promise<void> {
    const env = this.env;
    if (!env?.release || this.looking) return;
    this.looking = true;
    try {
      const seen = await this.versionUnderneath(env);
      if (!seen || !isNewer(seen, env.version) || seen === this.startedWith || this.offeredUnderneath.has(seen)) return;
      // This window's own upgrade, running or done, is said by its message: whatever version it installs.
      if (this.mine.has(seen) || this.background) return;
      // An offer waiting of this version, or an older one, is out of date: it's installed; the restart starts it.
      this.queue = this.queue.filter((q) => !q.key.startsWith("offer:") || isNewer(q.key.slice(6), seen));
      this.clearInstalled(seen);
      this.whenQuiet(`restart:${seen}`, () => this.offerRestart(seen));
    } finally {
      this.looking = false;
    }
  }

  private async versionUnderneath(env: UpdateEnv): Promise<string | null> {
    if (env.by === "installer") {
      const current = currentVersion(env.data);
      return current && isVersion(current) ? current : null;
    }
    const where = this.watched(env);
    const stamp = where ? stampOf(where) : null;
    if (!where || !stamp) return null;
    if (this.underneath?.stamp === stamp) return this.underneath.version;
    const said = await versionOf(where, 10_000);
    const version = /^slipbox (\S+)$/.exec(said ?? "")?.[1] ?? null;
    this.underneath = { stamp, version: version && isVersion(version) ? version : null };
    return this.underneath.version;
  }

  /** What the daily check found: its line kept in the messages list, and the offer opened once the TUI is quiet. */
  found(f: Found): void {
    if ([...this.mine].some((version) => !isNewer(f.version, version))) return;
    if (this.queue.some((q) => q.key.startsWith("restart:") && !isNewer(f.version, q.key.slice(8)))) return;
    this.available = f.version;
    this.app.host.requestRender();
    this.app.listMessage("info", f.said);
    // Dropped when your config or DO_NOT_TRACK turned the check off meanwhile.
    this.whenQuiet(`offer:${f.version}`, () => {
      if (this.env?.checkOn() && !doNotTrack(this.env.env)) this.offer(f.version);
    });
  }

  /**
   * Nothing going on that a dialog would cut into: nothing pending — a key sequence, the which-key popup, an operator,
   * a count or a character awaited — nothing being typed into — not inserting, no visual selection, no panel's filter,
   * not the git panel's message — and nothing open over the windows.
   */
  private calm(): boolean {
    const a = this.app;
    if (a.quitting || a.overlay || a.floating) return false;
    if (a.pending.length || a.input.whichKey || a.panels.resizeMode) return false;
    if (a.vim.count || a.vim.op || a.vim.awaitChar) return false;
    if (a.allViews().some((v) => v.insert || v.visual !== null)) return false;
    return !(a.sidebar.filtering || a.outline.filtering || a.problems.list().filtering || a.gitPanel.typing);
  }

  /** Quiet (UPG): calm, no key in flight or waiting its turn, and none for two seconds. */
  quiet(now = this.app.now()): boolean {
    return this.calm() && !this.app.input.busy && now - this.app.lastInputAt >= QUIET_MS;
  }

  /** `show` once the TUI is quiet, in turn after what waits already; one of the same key waiting already takes this
   *  `show` in its place, the later asking's (`:upgrade`'s, which offers whatever the check's switches say). */
  private whenQuiet(key: string, show: () => void): void {
    const waiting = this.queue.find((q) => q.key === key);
    if (waiting) waiting.show = show;
    else this.queue.push({ key, show });
    this.tryOffer();
  }

  /**
   * What a command asked for, shown when its answer came after a wait (`:upgrade`'s request, a restart waiting for an
   * upgrade): at once when nothing was typed or clicked since it was asked, else once the TUI is quiet — keys typed
   * meanwhile never answer it.
   */
  private whenAnswered(askedAt: number, key: string, show: () => void): void {
    if (this.app.lastInputAt > askedAt || !this.calm()) return this.whenQuiet(key, show);
    this.forget(key);
    show();
    this.app.host.requestRender();
  }

  private forget(key: string): void {
    this.queue = this.queue.filter((q) => q.key !== key);
  }

  /** The first that waits, shown once the TUI is quiet. */
  tryOffer(now = this.app.now()): void {
    const next = this.queue[0];
    if (!next || !this.quiet(now)) return;
    this.queue.shift();
    next.show();
    this.app.host.requestRender();
  }

  /** The offer of a newer version, by how this slipbox was installed. */
  offer(version: string): void {
    this.available = version;
    const env = this.env!;
    this.forget(`offer:${version}`);
    const title = `slipbox ${version} is out${env.channel === "preview" ? " on the preview channel" : ""}`;
    const not = { id: "not", label: "Not now", help: "Asked again at the next check, a day on." };
    const skip = {
      id: "skip",
      label: "Skip this version",
      help: `${version} isn't offered again; a newer one is.`,
      ticked: false,
      with: ["not"],
    };
    const releases = env.release ? releasesBase(env.release.repo, env.env) : "";
    const done = (choice: string, ticked: Set<string>) => {
      if (ticked.has("skip")) {
        skipVersion(this.stateFile, version);
        if (this.available === version) this.available = null;
        this.app.message("info", `slipbox ${version} skipped: the next newer one is offered`);
      }
      if (choice === "now") void this.restart(version);
      else if (choice === "later") this.upgradeBeside(version);
      else if (choice === "brew") void this.app.copy("brew upgrade slipbox", true, "brew upgrade slipbox");
      else if (choice === "address") void this.app.copy(releases, true, releases);
    };
    const base = { title, checkboxes: [skip], escape: "not now", done };
    if (env.by === "installer")
      openDialog(this.app, {
        ...base,
        text: `This is ${env.version}.`,
        choices: [
          {
            id: "now",
            label: "Upgrade and restart",
            help: `Quits, upgrades and starts slipbox ${version} where you were; notes unsaved are asked about first.`,
          },
          {
            id: "later",
            label: "Upgrade, restart later",
            help: `Upgrades now, beside slipbox; :restart starts ${version} when you choose.`,
          },
          not,
        ],
      });
    else if (env.by === "homebrew")
      openDialog(this.app, {
        ...base,
        text: `This is ${env.version}. Homebrew's: brew upgrade slipbox upgrades it, and slipbox offers to restart once it has.`,
        choices: [
          { id: "brew", label: "Copy brew upgrade slipbox", help: "Copies the command, to run in a shell." },
          not,
        ],
      });
    else
      openDialog(this.app, {
        ...base,
        text: `This is ${env.version}. Put here by hand: the releases are at ${releases}, and slipbox offers to restart once this file has changed.`,
        choices: [
          { id: "address", label: "Copy the releases' address", help: `Copies ${releases}; slipbox opens no browser.` },
          not,
        ],
      });
  }

  /** A newer version installed underneath this one, offered as the restart alone: once, however it came. */
  offerRestart(version: string): void {
    const env = this.env!;
    this.clearInstalled(version);
    this.forget(`restart:${version}`);
    this.offeredUnderneath.add(version);
    const later = () => this.app.message("info", `slipbox ${version} is installed: :restart starts it`);
    openDialog(this.app, {
      title: `slipbox ${version} is installed`,
      text: `This is ${env.version}.`,
      choices: [
        {
          id: "restart",
          label: "Restart now",
          help: `Starts slipbox ${version} where you were; notes unsaved are asked about first.`,
        },
        { id: "not", label: "Not now", help: ":restart starts it when you choose." },
      ],
      escape: "not now",
      done: (choice) => (choice === "restart" ? void this.restart(null) : later()),
      cancel: later,
    });
  }

  /** The newest version installed underneath this one, when it's newer: the installer's `current`, or what was last
   *  seen of Homebrew's or a hand-put one. */
  installedNewer(): string | null {
    const env = this.env;
    if (!env) return null;
    const v = env.by === "installer" ? currentVersion(env.data) : (this.underneath?.version ?? null);
    return v && isVersion(v) && isNewer(v, env.version) ? v : null;
  }

  /**
   * `:upgrade` (UPG-D6): the newest asked for now, whatever the check's switches say, and offered — a version you
   * skipped too; the restart when it's installed already underneath; nothing newer, said. From source, nothing asked.
   */
  async check(): Promise<void> {
    const env = this.env;
    if (!env?.release) return this.app.message("info", FROM_SOURCE);
    if (this.checking) return this.app.message("info", "asking for the newest version already");
    const askedAt = this.app.lastInputAt;
    this.app.message("info", "asking for the newest version…");
    this.checking = true;
    const latest = await askNewest({
      release: env.release,
      env: env.env,
      stateFile: this.stateFile,
      channel: env.channel,
      fetcher: env.fetcher,
    }).finally(() => {
      this.checking = false;
    });
    if (this.app.quitting) return;
    this.app.host.requestRender();
    if (!latest)
      return this.app.message(
        "error",
        `couldn't find the newest version at ${releasesBase(env.release.repo, env.env)}`,
      );
    const underneath = this.installedNewer();
    if (underneath && !isNewer(latest, underneath))
      return this.whenAnswered(askedAt, `restart:${underneath}`, () => this.offerRestart(underneath));
    if (!isNewer(latest, env.version)) {
      this.available = null;
      return this.app.message(
        "info",
        `slipbox ${env.version} is the newest${env.channel === "preview" ? " release or preview" : ""}`,
      );
    }
    this.available = latest;
    this.whenAnswered(askedAt, `offer:${latest}`, () => this.offer(latest));
  }

  /**
   * Upgrade, restart later: `slipbox upgrade --json` beside the TUI, a process of its own — its own session, so the
   * terminal's signals never reach it, and not waited for when the TUI quits (UPG-D7) — its answer written to a file,
   * read and removed when it exits.
   */
  upgradeBeside(version: string): void {
    const env = this.env!;
    if (this.background) return this.app.message("info", `upgrading to ${this.background.version} already`);
    const file = join(env.stateDir, `upgrade-${process.pid}.json`);
    // This binary, unless another window's upgrade removed it: then the one installed.
    const bin = existsSync(env.execPath) ? env.execPath : join(env.data, "current", "slipbox");
    let child: ReturnType<typeof Bun.spawn>;
    try {
      mkdirSync(env.stateDir, { recursive: true });
      const fd = openSync(file, "w");
      try {
        child = Bun.spawn([bin, "upgrade", "--json"], {
          stdin: "ignore",
          stdout: fd,
          stderr: "ignore",
          detached: true,
          env: env.env,
        });
      } finally {
        closeSync(fd);
      }
    } catch (err) {
      return this.app.message("error", `the upgrade to ${version} couldn't start: ${(err as Error).message}`);
    }
    child.unref();
    const before = currentVersion(env.data);
    const finished = this.app.background.begin(`Downloading slipbox ${version}`, () => child.kill("SIGTERM"), {
      canStop: () => currentVersion(env.data) === before,
    });
    this.app.message("info", `upgrading to ${version}…`);
    const done = child.exited.then(
      () => {
        const error = this.upgraded(version, file);
        finished(error ? "failed" : "done", error);
      },
      () => {
        const error = this.upgraded(version, file);
        finished("failed", error ?? "upgrade process failed");
      },
    );
    this.background = { version, done };
  }

  private upgraded(version: string, file: string): string | undefined {
    this.background = null;
    let said: { ok?: boolean; data?: UpgradeResult; error?: { message?: string } } = {};
    try {
      said = JSON.parse(readFileSync(file, "utf8"));
    } catch {}
    rmSync(file, { force: true });
    if (this.app.quitting) return;
    const env = this.env!;
    const r = said.ok ? said.data : undefined;
    if (r && (r.status === "upgraded" || r.status === "installed")) {
      const v = r.status === "installed" ? (r.installed ?? r.latest) : r.latest;
      this.clearInstalled(v);
      this.mine.add(v);
      this.app.message(
        "info",
        `slipbox ${v} is installed (this is ${env.version}): :restart starts it${r.skills ? `\n${r.skills}` : ""}`,
      );
    } else if (r) this.app.message("info", upgradeSaid(r, env.channel));
    else this.app.message("error", `the upgrade to ${version} failed: ${said.error?.message ?? "it said nothing"}`);
    this.app.host.requestRender();
    return r ? undefined : (said.error?.message ?? "upgrade process failed");
  }

  private clearInstalled(version: string): void {
    this.queue = this.queue.filter((item) => !item.key.startsWith("offer:") || isNewer(item.key.slice(6), version));
    if (this.available && !isNewer(this.available, version)) this.available = null;
  }

  /** The notes unsaved here, by name; the properties being edited count. */
  unsaved(): string[] {
    const names = this.app.dirtyBuffers().map((b) => this.app.displayName(b));
    const f = this.app.floating;
    if (f?.kind === "properties" && f.view.buf.dirty) names.push("the properties being edited");
    return names;
  }

  /**
   * `:restart`, Upgrade and restart, Restart now: once a background upgrade is done, notes unsaved asked about first
   * (UPG-D3) — Save and restart saves them as `:wqa` does — then the note left and slipbox quit, for the hand-over.
   */
  async restart(upgrade: string | null = null): Promise<void> {
    if (!this.env) return this.app.message("error", "slipbox can restart only in the terminal it runs in");
    if (this.app.quitting || this.restartNote) return;
    if (this.background) {
      if (this.restarting) return;
      const askedAt = this.app.lastInputAt;
      this.app.message("info", `waiting for the upgrade to ${this.background.version} to finish…`);
      this.app.host.requestRender();
      this.restarting = true;
      await this.background.done.finally(() => {
        this.restarting = false;
      });
      if (this.app.quitting || this.restartNote) return;
      // Through `restart` again when it's shown: an upgrade started meanwhile is waited for too.
      return this.whenAnswered(askedAt, "restart", () => void this.restart(upgrade));
    }
    this.ask(upgrade);
  }

  /** Notes unsaved asked about first (UPG-D3), then the note left and slipbox quit. */
  private ask(upgrade: string | null): void {
    // A restart waiting for quiet is this one, answered now: it never comes back by itself.
    this.forget("restart");
    for (const v of this.app.allViews()) if (v.insert) stopInsert(this.app, v);
    const unsaved = this.unsaved();
    if (!unsaved.length) return this.leave(upgrade);
    const named = unsaved.slice(0, 3).join(", ") + (unsaved.length > 3 ? ` and ${unsaved.length - 3} more` : "");
    openDialog(this.app, {
      title: "Restart",
      text: `${unsaved.length === 1 ? "1 note is" : `${unsaved.length} notes are`} unsaved: ${named}.`,
      choices: [
        { id: "save", label: "Save and restart", help: "Saves them as :wqa does, then restarts." },
        { id: "cancel", label: "Cancel", help: "Restarts nothing." },
      ],
      escape: "cancel",
      done: (choice) => {
        if (choice === "save" && this.saveAll()) this.leave(upgrade);
      },
    });
    this.app.host.requestRender();
  }

  /** Every note unsaved saved, as `:wqa` saves; false, said, at one that can't be. */
  private saveAll(): boolean {
    for (const b of this.app.dirtyBuffers())
      if (!this.app.saving.save(b)) {
        this.stopped(`${this.app.displayName(b)} isn't saved`);
        return false;
      }
    return true;
  }

  private stopped(why: string): void {
    this.app.message("warn", `the restart stopped: ${why}`);
  }

  /** The note written and read back, then slipbox quit as quitting does. */
  private leave(upgrade: string | null): void {
    const env = this.env!;
    if (!this.app.overlays.closeFloating()) return this.stopped("the window open over the notes isn't closed");
    const left = this.app.dirtyBuffers();
    if (left.length) return this.stopped(`${left.map((b) => this.app.displayName(b)).join(", ")} isn't saved`);
    const note: RestartNote = {
      pid: process.pid,
      at: Date.now(),
      from: env.version,
      upgrade,
      outcome: null,
      place: this.place(),
      session: this.app.session.snapshot(),
    };
    try {
      writeNote(note);
    } catch (err) {
      return this.stopped(`its note couldn't be written (${(err as Error).message})`);
    }
    this.restartNote = note;
    this.app.quit();
  }

  /** Where this window is: the vault, home's folder by name, or Elsewhere's folder. */
  place(): Place {
    return { mode: this.app.loc.mode, root: this.app.loc.root, homeFolder: this.app.homeFolder };
  }
}

/** A file as it is now — where its links lead, its size, time and inode — or null when it isn't there. */
function stampOf(file: string): string | null {
  try {
    const real = realpathSync(file);
    const st = statSync(real);
    return `${real}:${st.size}:${st.mtimeMs}:${st.ino}`;
  } catch {
    return null;
  }
}

function sameFile(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
}

/** What a start makes of the note its restart left: where to come back to, the session, and what's said. */
export interface CameBack {
  place: Place | null;
  session: SessionState | null;
  said: { level: Level; text: string };
}

/** The note a restart left, read: its place and session when they're whole, and what's said of how it went. */
export function cameBack(note: RestartNote, version: string): CameBack {
  const p = note.place as Partial<Place> | null;
  const place =
    p && typeof p.root === "string" && (p.mode === "vault" || p.mode === "home" || p.mode === "folder")
      ? { mode: p.mode, root: p.root, homeFolder: typeof p.homeFolder === "string" ? p.homeFolder : null }
      : null;
  // Read as the session file is: another version wrote it.
  const session = sessionFrom(note.session);
  const failed = note.outcome && !note.outcome.ok ? note.outcome.why : null;
  return {
    place,
    session,
    said:
      failed !== null
        ? { level: "error", text: `the upgrade to ${note.upgrade} failed: ${failed} — this is ${version}` }
        : {
            level: "info",
            text: `restarted: slipbox ${version} (was ${note.from})${note.outcome?.ok ? `\n${note.outcome.said}` : ""}`,
          },
  };
}
