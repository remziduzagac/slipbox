// The TUI's side of upgrading and restarting (UPG). What the daily check found, or `:upgrade` asked for, is offered in
// the dialog once the TUI is quiet, by how slipbox was installed: the installer's upgrades and restarts, or upgrades
// beside the TUI (`slipbox upgrade --json`, a process of its own) for `:restart` to start later; Homebrew's and one put
// by hand are given the command or the address to copy. `:restart` asks first about notes unsaved, leaves its note
// (`core/restart.ts`) and quits; `tui/run.ts` hands over once the screen is given back, and the slipbox that starts
// takes the note and comes back where you were.

import { closeSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { type Channel, type InstalledBy, installation } from "../core/install.ts";
import type { SessionState } from "../core/position.ts";
import type { ReleaseBuild } from "../core/release.ts";
import { type RestartNote, writeNote } from "../core/restart.ts";
import {
  askNewest,
  dailyUpdateCheck,
  doNotTrack,
  FROM_SOURCE,
  type Found,
  isNewer,
  releasesBase,
  skipVersion,
  type UpgradeResult,
  upgradeSaid,
} from "../core/update.ts";
import type { VaultMode } from "../core/vault.ts";
import type { App, Level } from "./app.ts";
import { openDialog } from "./dialog.ts";
import { stopInsert } from "./editing.ts";

/** What slipbox knows of itself and where it keeps things: `tui/run.ts`'s, a test's own. */
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

  /** `tui/run.ts` sets it; without it (a test's App, unless it sets one) nothing is checked or offered. */
  env: UpdateEnv | null = null;
  /** Found, waiting for a quiet moment to be offered. */
  private waiting: { version: string; restartOnly: boolean } | null = null;
  /** The upgrade running beside the TUI (Upgrade, restart later). */
  background: { version: string; done: Promise<void> } | null = null;
  /** The versions this window's own background upgrade installed: said already, never offered again underneath. */
  readonly mine = new Set<string>();
  /** The restart asked for, its note written: `tui/run.ts` hands over to it once the TUI has quit. */
  restartNote: RestartNote | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  private get stateFile(): string {
    return join(this.env!.stateDir, "update.json");
  }

  /** The daily check started, and the offer looked at every second while it waits for quiet. */
  start(): void {
    const env = this.env;
    if (!env) return;
    this.clearLeftovers(env.stateDir);
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
    this.timer = setInterval(() => this.tick(), 1000);
    (this.timer as { unref?: () => void }).unref?.();
  }

  /** Background upgrades' answers left by a TUI that quit before they came (a day old). */
  private clearLeftovers(dir: string): void {
    try {
      for (const e of readdirSync(dir)) {
        if (!/^upgrade-\d+\.json$/.test(e)) continue;
        const file = join(dir, e);
        if (Date.now() - statSync(file).mtimeMs > 24 * 60 * 60 * 1000) rmSync(file, { force: true });
      }
    } catch {}
  }

  tick(): void {
    if (this.app.quitting) {
      if (this.timer) clearInterval(this.timer);
      return;
    }
    this.tryOffer();
  }

  /** What the daily check found: its line kept in the messages list, and the offer opened once the TUI is quiet. */
  found(f: Found): void {
    this.app.listMessage("info", f.said);
    this.waiting = { version: f.version, restartOnly: false };
    this.tryOffer();
  }

  /**
   * Quiet (UPG): no key in flight or waiting its turn, none for two seconds, nothing pending, nothing being typed into
   * — not inserting, no visual selection, no panel's filter, not the git panel's message — and nothing open over the
   * windows.
   */
  quiet(now = this.app.now()): boolean {
    const a = this.app;
    if (a.quitting || a.overlay || a.floating) return false;
    if (a.input.busy || a.pending.length || a.input.whichKey || a.panels.resizeMode) return false;
    if (now - a.lastInputAt < QUIET_MS) return false;
    if (a.allViews().some((v) => v.insert || v.visual !== null)) return false;
    if (a.sidebar.filtering || a.outline.filtering || a.problems.list().filtering || a.gitPanel.typing) return false;
    return true;
  }

  /** The offer waiting, opened when the TUI is quiet; dropped when your config or DO_NOT_TRACK turned the check off
   *  meanwhile (the restart's alone sends nothing: UPG-D5). */
  tryOffer(now = this.app.now()): void {
    const w = this.waiting;
    const env = this.env;
    if (!w || !env || !this.quiet(now)) return;
    this.waiting = null;
    if (w.restartOnly) this.offerRestart(w.version, true);
    else if (env.checkOn() && !doNotTrack(env.env)) this.offer(w.version, true);
    this.app.host.requestRender();
  }

  /** The offer of a newer version, by how this slipbox was installed. */
  offer(version: string, unasked: boolean): void {
    const env = this.env!;
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
        this.app.message("info", `slipbox ${version} skipped: the next newer one is offered`);
      }
      if (choice === "now") void this.restart(version);
      else if (choice === "later") this.upgradeBeside(version);
      else if (choice === "brew") void this.app.copy("brew upgrade slipbox", true, "brew upgrade slipbox");
      else if (choice === "address") void this.app.copy(releases, true, releases);
    };
    const base = { title, checkboxes: [skip], escape: "not now", unasked, done };
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

  /** A newer version installed underneath this one, offered as the restart alone. */
  offerRestart(version: string, unasked: boolean): void {
    const env = this.env!;
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
      unasked,
      done: (choice) => (choice === "restart" ? void this.restart(null) : later()),
      cancel: later,
    });
  }

  /** The newest version installed underneath this one, when it's newer: the installer's `current`. */
  installedNewer(): string | null {
    const env = this.env;
    if (env?.by !== "installer") return null;
    const current = installation(env.data).current;
    return current && /^\d+\.\d+\.\d+/.test(current) && isNewer(current, env.version) ? current : null;
  }

  /**
   * `:upgrade` (UPG-D6): the newest asked for now, whatever the check's switches say, and offered — a version you
   * skipped too; the restart when it's installed already underneath; nothing newer, said. From source, nothing asked.
   */
  async check(): Promise<void> {
    const env = this.env;
    if (!env?.release) return this.app.message("info", FROM_SOURCE);
    this.app.message("info", "asking for the newest version…");
    const latest = await askNewest({
      release: env.release,
      env: env.env,
      stateFile: this.stateFile,
      channel: env.channel,
      fetcher: env.fetcher,
    });
    if (this.app.quitting) return;
    this.app.host.requestRender();
    if (!latest)
      return this.app.message(
        "error",
        `couldn't find the newest version at ${releasesBase(env.release.repo, env.env)}`,
      );
    const underneath = this.installedNewer();
    if (underneath && !isNewer(latest, underneath)) return this.offerRestart(underneath, false);
    if (!isNewer(latest, env.version))
      return this.app.message(
        "info",
        `slipbox ${env.version} is the newest${env.channel === "preview" ? " release or preview" : ""}`,
      );
    this.offer(latest, false);
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
    let child: ReturnType<typeof Bun.spawn>;
    try {
      mkdirSync(env.stateDir, { recursive: true });
      const fd = openSync(file, "w");
      try {
        child = Bun.spawn([env.execPath, "upgrade", "--json"], {
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
    this.app.message("info", `upgrading to ${version}…`);
    const done = child.exited.then(
      () => this.upgraded(version, file),
      () => this.upgraded(version, file),
    );
    this.background = { version, done };
  }

  private upgraded(version: string, file: string): void {
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
      this.mine.add(v);
      this.app.message("info", `slipbox ${v} is installed (this is ${env.version}): :restart starts it`);
    } else if (r) this.app.message("info", upgradeSaid(r, env.channel));
    else this.app.message("error", `the upgrade to ${version} failed: ${said.error?.message ?? "it said nothing"}`);
    this.app.host.requestRender();
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
      this.app.message("info", `waiting for the upgrade to ${this.background.version} to finish…`);
      this.app.host.requestRender();
      await this.background.done;
      if (this.app.quitting) return;
    }
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
  const s = note.session as Partial<SessionState> | null;
  const session = s && Array.isArray(s.tabs) ? (s as SessionState) : null;
  const failed = note.outcome && !note.outcome.ok ? note.outcome.why : null;
  return {
    place,
    session,
    said:
      failed !== null
        ? { level: "error", text: `the upgrade to ${note.upgrade} failed: ${failed} — this is ${version}` }
        : { level: "info", text: `restarted: slipbox ${version} (was ${note.from})` },
  };
}
