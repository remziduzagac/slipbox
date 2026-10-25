// Updates (plan 14.4). The latest release is found from its `SHA256SUMS` — one small file; its packs' names carry the
// version, and its lines the sum each download is checked against. `slipbox upgrade` installs the latest as
// install.sh would (`core/install.ts`): a folder of its own in `versions/`, checked and run before `current` moves to
// it; the version it replaced is kept until the next. An install's upgrades take turns (`<data>/upgrade.lock`), never
// move `current` back to an older version, and can be cancelled until `current` moves (UPG). The TUI asks once a day,
// and says when there's a newer one — never the CLI, which agents call; never with DO_NOT_TRACK set, or
// `[update] check = false` in your own config.
//
// An install follows a channel (GR-D15, `<data>/channel`): `stable`, the latest release as above; `preview`, the
// newest of that and the newest preview, which the Pages site's `preview` file names (`<tag> <sha256 of its
// install.sh>`), its packs summed in its own `SHA256SUMS` (`<base>/download/<tag>/SHA256SUMS`).
//
// Nothing identifying is sent: a plain GET of a public file. `SLIPBOX_RELEASES_URL` names another place laid out as
// GitHub's releases are (`<base>/latest/download/…`, `<base>/download/<tag>/…`), and `SLIPBOX_CHANNELS_URL` another
// for the Pages site's channel files: a mirror, the tests' folder.

import { createHash } from "node:crypto";
import {
  existsSync,
  linkSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { PREVIEW_TAG, pagesBase, type ReleaseBuild, retired, tagOf } from "./release.ts";
import { type Channel, currentVersion, howToUpgrade, type InstalledBy, installedBy, readChannel } from "./install.ts";
import { readJson, writeJson } from "./fsutil.ts";
import { alive } from "./processes.ts";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** Where a repository's releases are: GitHub's, or `SLIPBOX_RELEASES_URL`'s. */
export function releasesBase(repo: string, env: Record<string, string | undefined> = process.env): string {
  return (env.SLIPBOX_RELEASES_URL || `https://github.com/${repo}/releases`).replace(/\/+$/, "");
}

/** Where a repository's channel files are: its Pages site, or `SLIPBOX_CHANNELS_URL`'s. */
export function channelsBase(repo: string, env: Record<string, string | undefined> = process.env): string {
  return (env.SLIPBOX_CHANNELS_URL || pagesBase(repo)).replace(/\/+$/, "");
}

export interface Latest {
  version: string;
  /** The pack for this platform, and its SHA-256. */
  asset: string;
  sha256: string;
}

/** A version as releases are named: `1.2.3`, `1.2.3-preview.…`. */
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;

/** Whether `s` is a version as releases are named. */
export const isVersion = (s: string): boolean => SEMVER.test(s);

/** A request's limit, and the cancel asked for (the hand-over's `ctrl+c`) when there is one. */
const limited = (timeoutMs: number, signal?: AbortSignal): AbortSignal =>
  signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);

/** The release a `SHA256SUMS` is of, and its pack for a target; null when it has none. */
export function latestIn(sums: string, target: string): Latest | null {
  for (const line of sums.split("\n")) {
    // The target matched at the name's end: a version's own `-rc.1` can't take a target's `-linux` then.
    const m = /^([0-9a-f]{64}) [ *](slipbox-(.+)\.tar\.gz)$/.exec(line.trim());
    const rest = m?.[3] ?? "";
    if (!m || !rest.endsWith(`-${target}`)) continue;
    const version = rest.slice(0, -(target.length + 1));
    if (SEMVER.test(version)) return { version, asset: m[2]!, sha256: m[1]! };
  }
  return null;
}

/** Whether version `a` is later than `b`. */
export function isNewer(a: string, b: string): boolean {
  return Bun.semver.order(a, b) > 0;
}

/** The latest release's pack for a target, asked for once; null when it can't be said (offline, none for it). */
export async function fetchLatest(
  base: string,
  target: string,
  fetcher: Fetcher = fetch,
  timeoutMs = 10_000,
  signal?: AbortSignal,
): Promise<Latest | null> {
  try {
    const res = await fetcher(`${base}/latest/download/SHA256SUMS`, {
      signal: limited(timeoutMs, signal),
      redirect: "follow",
    });
    if (!res.ok) return null;
    return latestIn(await res.text(), target);
  } catch {
    return null;
  }
}

/** A release to install: its pack for this platform, and the tag it's released under. */
export interface Candidate extends Latest {
  tag: string;
}

/** The preview a channel file names — its line `<tag> <sha256 of the release's install.sh>` — or null. */
export function previewIn(text: string): string | null {
  const m = /^(\S+) [0-9a-f]{64}$/.exec(text.trim());
  return m && PREVIEW_TAG.test(m[1]!) ? m[1]! : null;
}

/** The newest preview's pack for a target: the release the Pages site's `preview` file names, found from its own
 *  `SHA256SUMS`; null when it can't be said (no preview yet, offline, none for this platform). */
export async function fetchPreview(
  channels: string,
  releases: string,
  target: string,
  fetcher: Fetcher = fetch,
  timeoutMs = 10_000,
  signal?: AbortSignal,
): Promise<Candidate | null> {
  try {
    const get = (url: string) => fetcher(url, { signal: limited(timeoutMs, signal), redirect: "follow" });
    const named = await get(`${channels}/preview`);
    if (!named.ok) return null;
    const tag = previewIn(await named.text());
    if (!tag) return null;
    const sums = await get(`${releases}/download/${tag}/SHA256SUMS`);
    if (!sums.ok) return null;
    const found = latestIn(await sums.text(), target);
    // Its packs are that preview's: the version they carry is the one its tag says.
    return found && tagOf(found.version) === tag ? { ...found, tag } : null;
  } catch {
    return null;
  }
}

/** The newest a channel offers for a target: `stable`'s, the latest release; `preview`'s, the newer of that and the
 *  newest preview, by semver — a preview comes after the previews before it, and before its version's release. Null
 *  when neither can be said. */
export async function fetchNewest(opts: {
  channel: Channel;
  releases: string;
  channels: string;
  target: string;
  fetcher?: Fetcher;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<Candidate | null> {
  const stable = fetchLatest(opts.releases, opts.target, opts.fetcher, opts.timeoutMs, opts.signal).then((l) =>
    l ? { ...l, tag: tagOf(l.version) } : null,
  );
  if (opts.channel !== "preview") return stable;
  const [s, p] = await Promise.all([
    stable,
    fetchPreview(opts.channels, opts.releases, opts.target, opts.fetcher, opts.timeoutMs, opts.signal),
  ]);
  if (!s || !p) return s ?? p;
  return isNewer(p.version, s.version) ? p : s;
}

/** Whether DO_NOT_TRACK asks for nothing to be sent (consoledonottrack.com): set, and not 0 or false. */
export function doNotTrack(env: Record<string, string | undefined>): boolean {
  const v = (env.DO_NOT_TRACK ?? "").trim().toLowerCase();
  return v !== "" && v !== "0" && v !== "false";
}

/** A day between checks. */
export const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

interface CheckState {
  /** When it last asked, in ms. */
  checked?: number;
  /** What it found then. */
  latest?: string;
  /** A version you skipped (UPG): neither it nor any not newer is offered. */
  skipped?: string;
}

function readState(stateFile: string): CheckState {
  return readJson<CheckState>(stateFile, {});
}

/** Replaced whole, never written in place: another window reading it meanwhile sees it before or after, never torn. */
function writeState(stateFile: string, s: CheckState): void {
  try {
    writeJson(stateFile, s);
  } catch {}
}

/** What's said of a newer one: the channel named when it's `preview`, then how to get it. */
export function sayOut(newest: string, current: string, channel: Channel, how: string): string {
  return `slipbox ${newest} is out${channel === "preview" ? " on the preview channel" : ""} (this is ${current}): ${how}`;
}

/** A newer version found: it, and what's said of it. */
export interface Found {
  version: string;
  said: string;
}

/** The version you skipped (Skip this version, UPG), or null. */
export function skippedVersion(stateFile: string): string | null {
  return readState(stateFile).skipped ?? null;
}

/** A version skipped: neither it nor any not newer is offered by the daily check. */
export function skipVersion(stateFile: string, version: string): void {
  writeState(stateFile, { ...readState(stateFile), skipped: version });
}

/**
 * The newest its channel offers, asked for now, whatever the check's switches say — the daily check's request, and
 * `:upgrade`'s (UPG-D6) — the time kept before asking, so a failure waits a day too; null when it can't be said.
 */
export async function askNewest(opts: {
  release: ReleaseBuild;
  env: Record<string, string | undefined>;
  stateFile: string;
  now?: number;
  fetcher?: Fetcher;
  channel?: Channel;
}): Promise<string | null> {
  const now = opts.now ?? Date.now();
  writeState(opts.stateFile, { ...readState(opts.stateFile), checked: now });
  const latest = await fetchNewest({
    channel: opts.channel ?? "stable",
    releases: releasesBase(opts.release.repo, opts.env),
    channels: channelsBase(opts.release.repo, opts.env),
    target: opts.release.target,
    fetcher: opts.fetcher,
  });
  if (latest) writeState(opts.stateFile, { ...readState(opts.stateFile), checked: now, latest: latest.version });
  return latest?.version ?? null;
}

/**
 * The TUI's daily check: when it's due — a release build, `[update] check` on in your config, no DO_NOT_TRACK, a day
 * since the last — the newest its channel offers asked for, and what's found when it's newer than this one, and newer
 * than a version you skipped; null otherwise. `channel`: the installer's install's; any other follows stable releases.
 */
export async function dailyUpdateCheck(opts: {
  release: ReleaseBuild | null;
  version: string;
  enabled: boolean;
  env: Record<string, string | undefined>;
  stateFile: string;
  now?: number;
  fetcher?: Fetcher;
  by?: InstalledBy;
  channel?: Channel;
}): Promise<Found | null> {
  if (!opts.release || !opts.enabled || doNotTrack(opts.env)) return null;
  const now = opts.now ?? Date.now();
  const state = readState(opts.stateFile);
  if (typeof state.checked === "number" && now - state.checked < CHECK_EVERY_MS && now >= state.checked) return null;
  const channel = opts.channel ?? "stable";
  const latest = await askNewest({ ...opts, release: opts.release, now, channel });
  if (!latest || !isNewer(latest, opts.version)) return null;
  const skipped = skippedVersion(opts.stateFile);
  if (skipped && !isNewer(latest, skipped)) return null;
  return {
    version: latest,
    said: sayOut(latest, opts.version, channel, howToUpgrade(opts.by ?? "installer", opts.release.repo)),
  };
}

export class UpgradeError extends Error {}

/** An upgrade cancelled before `current` moved: nothing in use changed. */
export class UpgradeCancelled extends UpgradeError {
  constructor() {
    super("cancelled");
  }
}

export interface UpgradeResult {
  /** `installed`: the newest is installed already, `current` naming it, but this slipbox is older (a window not
   *  restarted yet); nothing done. */
  status: "upgraded" | "current" | "installed" | "available";
  from: string;
  /** The latest release's version. */
  latest: string;
  /** For `installed`: the version `current` names. */
  installed?: string;
  /** For `upgraded`: the version `current` named before, kept to go back to (this one's, or a newer one installed). */
  replaced?: string;
  /** Versions removed, beyond the one replaced (kept). */
  removed: string[];
  /** New binary's automatic skill report, separate from the binary upgrade result. */
  skills?: string;
}

/** What's said when slipbox runs from source, where there are no releases: by `slipbox upgrade`, and `:upgrade`. */
export const FROM_SOURCE =
  "this slipbox runs from source (or was built by hand): it has no releases to follow — update its checkout";

/** What `slipbox upgrade` says of what it did, and the restart's hand-over after it. */
export function upgradeSaid(r: UpgradeResult, channel: Channel): string {
  switch (r.status) {
    case "current":
      return r.latest === r.from
        ? `slipbox ${r.from} is the latest`
        : `slipbox ${r.from} is newer than the latest ${channel === "preview" ? "release or preview" : "release"}, ${r.latest}: it stays until a newer one`;
    case "installed":
      return `slipbox ${r.installed} is installed already (this is ${r.from})`;
    case "available":
      return sayOut(r.latest, r.from, channel, "slipbox upgrade installs it");
    case "upgraded":
      return `slipbox ${r.from} → ${r.latest}; ${r.replaced ?? r.from} is kept, to go back to${r.removed.length ? ` (${r.removed.join(", ")} removed)` : ""}`;
  }
}

/** What a binary says to `--version`, asked in a child; null when it couldn't run, or took longer than `timeoutMs`. */
export async function versionOf(bin: string, timeoutMs = 30_000, signal?: AbortSignal): Promise<string | null> {
  try {
    // With a cancel, a session of its own: the terminal's ctrl+c reaches only the hand-over, which cancels it. Without
    // one (the command line's `slipbox upgrade`), in the terminal's group, which ctrl+c ends with it.
    const child = Bun.spawn([bin, "--version"], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "ignore",
      timeout: timeoutMs,
      signal,
      detached: !!signal,
    });
    // Its exit waited for, then its output a second at most: what it started may hold that open.
    const out = new Response(child.stdout).text();
    if ((await child.exited) !== 0 || signal?.aborted) return null;
    const said = await Promise.race([out, Bun.sleep(1000).then(() => null)]);
    return said === null ? null : said.trim();
  } catch {
    return null;
  }
}

/** A lock older than this is taken over whoever holds it: an upgrade's download gives up after five minutes. */
export const LOCK_STALE_MS = 15 * 60 * 1000;

/** The pid holding an install's upgrade lock — `held`, as read — when it's still running; null when the lock is
 *  stale. A lock that can't be read yet is held for a few seconds: it's being written. */
function lockHolder(held: string, lock: string, now: number): number | null {
  try {
    const h = JSON.parse(held) as { pid?: unknown; at?: unknown };
    if (typeof h.pid !== "number" || typeof h.at !== "number") return null;
    return now - h.at < LOCK_STALE_MS && alive(h.pid) ? h.pid : null;
  } catch {
    try {
      return now - statSync(lock).mtimeMs < 5000 ? -1 : null;
    } catch {
      return null;
    }
  }
}

/**
 * A stale lock taken out of the way — that one alone: moved aside, then removed when it's still what was read as stale;
 * one another upgrade has just made in its place is put back. Two taking over at once can't both go on.
 */
export function takeOver(lock: string, stale: string, pid = process.pid): void {
  const aside = `${lock}.${pid}`;
  try {
    renameSync(lock, aside);
  } catch {
    return;
  }
  let moved = "";
  try {
    moved = readFileSync(aside, "utf8");
  } catch {}
  if (moved !== stale)
    try {
      linkSync(aside, lock);
    } catch {}
  rmSync(aside, { force: true });
}

/**
 * An install's upgrades take turns: `<data>/upgrade.lock`, made only when there's none, holds the pid of the one
 * running. Another finding it is refused; one left by a process that's gone is taken over (`takeOver`), and what
 * upgrades cut short left — their work folders, `current`'s link half made — removed. Returns the lock's release.
 */
export function lockUpgrades(data: string, pid = process.pid): () => void {
  const lock = join(data, "upgrade.lock");
  for (let tries = 0; ; tries++) {
    try {
      writeFileSync(lock, `${JSON.stringify({ pid, at: Date.now() })}\n`, { flag: "wx" });
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST")
        throw new UpgradeError(`couldn't lock ${lock}: ${(err as Error).message}`);
    }
    let held: string;
    try {
      held = readFileSync(lock, "utf8");
    } catch {
      continue; // gone meanwhile: made again
    }
    const other = lockHolder(held, lock, Date.now());
    if (other !== null || tries >= 3)
      throw new UpgradeError(`another upgrade is running${other !== null && other > 0 ? ` (pid ${other})` : ""}`);
    takeOver(lock, held, pid);
  }
  // What upgrades cut short left: what can't be removed now is left, never the lock held for good.
  const versions = join(data, "versions");
  try {
    for (const e of existsSync(versions) ? readdirSync(versions) : [])
      if (e.startsWith(".upgrade-")) rmSync(join(versions, e), { recursive: true, force: true });
    for (const e of readdirSync(data)) if (/^current\.\d+$/.test(e)) rmSync(join(data, e), { force: true });
  } catch {}
  return () => {
    try {
      if ((JSON.parse(readFileSync(lock, "utf8")) as { pid?: unknown }).pid === pid) rmSync(lock, { force: true });
    } catch {}
  };
}

/** Whether `execPath` is the installer's binary of `version` in `versions` — by its path when the file's gone (another
 *  window's upgrade removed the version it's running; Linux then names it `… (deleted)`). */
function inLayout(execPath: string, versions: string, version: string): boolean {
  try {
    return realpathSync(execPath) === realpathSync(join(versions, version, "slipbox"));
  } catch {}
  try {
    return execPath.replace(/ \(deleted\)$/, "") === join(realpathSync(versions), version, "slipbox");
  } catch {
    return false;
  }
}

/**
 * `slipbox upgrade`: this install — the installer's, in `data` — moved to the newest its channel offers (`<data>/
 * channel`: the latest release, or on `preview` the newer of that and the newest preview), or, with `check`, only
 * told of it. The pack's SHA-256 must be its SHA256SUMS line's and its binary must say its version before `current`
 * moves; the version replaced is kept, any older removed. A platform no longer released for (an Intel Mac, D238) is
 * told so, and the last release built for it, before anything is asked for.
 *
 * Against what's installed, not only what's running (UPG): it holds the install's lock, never moves `current` to a
 * version older than the one it names (a window still running an older one), takes the channel's newest from
 * `versions/` when it's there, and keeps the new version, the one `current` named, and the one running. `signal`
 * cancels it until `current` moves: its commit.
 */
export async function upgrade(opts: {
  release: ReleaseBuild;
  version: string;
  data: string;
  execPath: string;
  env?: Record<string, string | undefined>;
  check?: boolean;
  fetcher?: Fetcher;
  signal?: AbortSignal;
}): Promise<UpgradeResult> {
  const gone = retired(opts.release.target);
  if (gone) throw new UpgradeError(gone);
  const fetcher = opts.fetcher ?? fetch;
  const versions = join(opts.data, "versions");
  if (!inLayout(opts.execPath, versions, opts.version)) {
    if (installedBy(opts.execPath, opts.data, opts.version) === "homebrew")
      throw new UpgradeError("this slipbox is Homebrew's: brew upgrade slipbox");
    throw new UpgradeError(
      `this slipbox (${opts.execPath}) wasn't installed by its installer: upgrade it the way it was installed`,
    );
  }
  const signal = opts.signal;
  const unlock = opts.check ? () => {} : lockUpgrades(opts.data);
  try {
    const base = releasesBase(opts.release.repo, opts.env);
    const channel = readChannel(opts.data);
    const channels = channelsBase(opts.release.repo, opts.env);
    const latest = await fetchNewest({
      channel,
      releases: base,
      channels,
      target: opts.release.target,
      fetcher,
      timeoutMs: 30_000,
      signal,
    });
    if (signal?.aborted) throw new UpgradeCancelled();
    if (!latest)
      throw new UpgradeError(
        channel === "preview"
          ? `couldn't find the latest release's ${opts.release.target} build at ${base}, nor the newest preview's (${channels}/preview)`
          : `couldn't find the latest release's ${opts.release.target} build at ${base}`,
      );
    const result = { from: opts.version, latest: latest.version, removed: [] as string[] };
    if (!isNewer(latest.version, opts.version)) return { status: "current", ...result };
    // What `current` names, newer than this one: a newest no newer than it installs nothing.
    const before = currentVersion(opts.data);
    const named = before && SEMVER.test(before) ? before : null;
    if (named && named !== opts.version && !isNewer(latest.version, named))
      return { status: "installed", ...result, installed: named };
    if (opts.check) return { status: "available", ...result };

    const v = latest.version;
    // The channel's newest already here — another window's upgrade, or one cancelled after its folder was in place:
    // taken as it is once its binary says its version.
    const here = join(versions, v, "slipbox");
    if (!(existsSync(here) && (await versionOf(here, 30_000, signal)) === `slipbox ${v}`))
      await download(latest, `${base}/download/${latest.tag}/${latest.asset}`, versions, fetcher, signal);
    // The last look for a cancel: after it, `current` moves and the upgrade is done.
    if (signal?.aborted) throw new UpgradeCancelled();
    // `current` moved in one step: a link made beside it, renamed over it.
    writeJson(join(versions, v, "previous.json"), { version: before });
    const next = join(opts.data, `current.${process.pid}`);
    rmSync(next, { force: true });
    symlinkSync(`versions/${v}`, next);
    renameSync(next, join(opts.data, "current"));
    // Kept: the new one, the one replaced (to go back to), the one running; any other goes. The upgrade is done:
    // one that can't be removed (still running somewhere, read-only) is left, not a failure.
    const keep = new Set([v, opts.version, ...(before ? [before] : [])]);
    for (const old of readdirSync(versions).sort()) {
      if (keep.has(old) || old.startsWith(".")) continue;
      try {
        rmSync(join(versions, old), { recursive: true, force: true });
        result.removed.push(old);
      } catch {}
    }
    let skills: string;
    try {
      const child = Bun.spawn([here, "skill", "--auto"], {
        env: opts.env ?? process.env,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        timeout: 30_000,
      });
      const output = new Response(child.stdout).text();
      const errors = new Response(child.stderr).text();
      const code = await child.exited;
      skills = code === 0 ? (await output).trim() : `agent skill refresh failed: ${(await errors).trim()}`;
    } catch (err) {
      skills = `agent skill refresh failed: ${(err as Error).message}`;
    }
    return {
      status: "upgraded",
      ...result,
      ...(skills ? { skills } : {}),
      ...(named && named !== opts.version ? { replaced: named } : {}),
    };
  } finally {
    unlock();
  }
}

/** A release's pack downloaded, its sum checked, unpacked and its binary run, then moved into `versions/<version>`
 *  complete; a work folder of its own meanwhile, removed whatever happens. */
async function download(
  latest: Candidate,
  url: string,
  versions: string,
  fetcher: Fetcher,
  signal: AbortSignal | undefined,
): Promise<void> {
  const v = latest.version;
  const work = join(versions, `.upgrade-${process.pid}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  try {
    let bytes: Uint8Array;
    try {
      const limit = AbortSignal.timeout(300_000);
      const res = await fetcher(url, { signal: signal ? AbortSignal.any([signal, limit]) : limit, redirect: "follow" });
      if (!res.ok) throw new Error(`answered ${res.status}`);
      bytes = new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      if (signal?.aborted) throw new UpgradeCancelled();
      throw new UpgradeError(`couldn't download ${url}: ${(err as Error).message}`);
    }
    const got = createHash("sha256").update(bytes).digest("hex");
    if (got !== latest.sha256)
      throw new UpgradeError(`the download's SHA-256 is ${got}, not the release's ${latest.sha256}: nothing changed`);
    const pack = join(work, latest.asset);
    writeFileSync(pack, bytes);
    const tar = Bun.spawn(["tar", "-xzf", pack, "-C", work], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "pipe",
      signal,
      detached: !!signal,
    });
    const tarSaid = new Response(tar.stderr).text();
    const tarCode = await tar.exited;
    if (signal?.aborted) throw new UpgradeCancelled();
    if (tarCode !== 0) throw new UpgradeError(`couldn't unpack ${latest.asset}: ${(await tarSaid).trim()}`);
    const unpacked = join(work, latest.asset.replace(/\.tar\.gz$/, ""));
    const said = existsSync(join(unpacked, "slipbox"))
      ? await versionOf(join(unpacked, "slipbox"), 30_000, signal)
      : null;
    if (signal?.aborted) throw new UpgradeCancelled();
    if (said !== `slipbox ${v}`)
      throw new UpgradeError(
        said === null
          ? "the new binary doesn't run here: nothing changed"
          : `the new binary says "${said}", not "slipbox ${v}": nothing changed`,
      );
    rmSync(join(versions, v), { recursive: true, force: true });
    renameSync(unpacked, join(versions, v));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
