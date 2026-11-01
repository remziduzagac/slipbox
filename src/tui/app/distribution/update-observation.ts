import { realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { removeOlderThan } from "../../../core/foundation/platform/fsutil.ts";
import { currentVersion, homebrewPrefix } from "../../../core/application/distribution/install.ts";
import {
  dailyUpdateCheck,
  type Found,
  isNewer,
  isVersion,
  versionOf,
} from "../../../core/application/distribution/update.ts";
import type { UpdateEnv } from "./update-env.ts";

/** Live inputs and delivery effects for one window's version observation. */
interface ObservationContext {
  env(): UpdateEnv | null;
  quitting(): boolean;
  found(found: Found): void;
  installed(version: string): void;
  tryOffer(): void;
}

/** Daily release discovery and local installed-version polling; handover stays with Updates. */
export class UpdateObservation {
  constructor(private readonly context: ObservationContext) {}

  /** The installer's `current` at start: what was installed then is no upgrade underneath — a version you went back to
   *  on purpose isn't offered to leave again. */
  private startedWith: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticks = 0;
  /** What was last seen where the next version would be (UPG-T6): the file's stamp, and the version it said. */
  private underneath: { stamp: string; version: string | null } | null = null;
  private looking = false;

  private get stateFile(): string {
    return join(this.context.env()!.stateDir, "update.json");
  }

  /** A release build's: the daily check started, and every second what waits looked at, every ten what's underneath. */
  start(): void {
    const env = this.context.env();
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
      if (f) this.context.found(f);
    });
    // What's there now is this one: never started to ask it.
    const where = this.watched(env);
    if (where && sameFile(where, env.execPath)) this.underneath = { stamp: stampOf(where) ?? "", version: env.version };
    if (env.by === "installer") this.startedWith = currentVersion(env.data);
    this.timer = setInterval(() => this.tick(), 1000);
    (this.timer as { unref?: () => void }).unref?.();
  }

  tick(): void {
    if (this.context.quitting()) {
      if (this.timer) clearInterval(this.timer);
      return;
    }
    if (++this.ticks % 10 === 0) void this.lookUnderneath();
    this.context.tryOffer();
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
    const env = this.context.env();
    if (!env?.release || this.looking) return;
    this.looking = true;
    try {
      const seen = await this.versionUnderneath(env);
      if (!seen || !isNewer(seen, env.version) || seen === this.startedWith) return;
      this.context.installed(seen);
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

  /** The newest version installed underneath this one, when it's newer: the installer's `current`, or what was last
   *  seen of Homebrew's or a hand-put one. */
  installedNewer(): string | null {
    const env = this.context.env();
    if (!env) return null;
    const v = env.by === "installer" ? currentVersion(env.data) : (this.underneath?.version ?? null);
    return v && isVersion(v) && isNewer(v, env.version) ? v : null;
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
