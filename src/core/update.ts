// Updates (plan 14.4). The latest release is found from its `SHA256SUMS` — one small file; its packs' names carry the
// version, and its lines the sum each download is checked against. `slipbox upgrade` installs the latest as
// install.sh would (`core/install.ts`): a folder of its own in `versions/`, checked and run before `current` moves to
// it; the version it replaced is kept until the next. The TUI asks once a day, and says when there's a newer one —
// never the CLI, which agents call; never with DO_NOT_TRACK set, or `[update] check = false` in your own config.
//
// Nothing identifying is sent: a plain GET of a public file. `SLIPBOX_RELEASES_URL` names another place laid out as
// GitHub's releases are (`<base>/latest/download/…`, `<base>/download/v<version>/…`): a mirror, the tests' folder.

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { ReleaseBuild } from "./release.ts";
import { howToUpgrade, type InstalledBy, installedBy } from "./install.ts";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** Where a repository's releases are: GitHub's, or `SLIPBOX_RELEASES_URL`'s. */
export function releasesBase(repo: string, env: Record<string, string | undefined> = process.env): string {
  return (env.SLIPBOX_RELEASES_URL || `https://github.com/${repo}/releases`).replace(/\/+$/, "");
}

export interface Latest {
  version: string;
  /** The pack for this platform, and its SHA-256. */
  asset: string;
  sha256: string;
}

/** The release a `SHA256SUMS` is of, and its pack for a target; null when it has none. */
export function latestIn(sums: string, target: string): Latest | null {
  for (const line of sums.split("\n")) {
    // The target matched at the name's end: a version's own `-rc.1` can't take a target's `-linux` then.
    const m = /^([0-9a-f]{64}) [ *](slipbox-(.+)\.tar\.gz)$/.exec(line.trim());
    const rest = m?.[3] ?? "";
    if (!m || !rest.endsWith(`-${target}`)) continue;
    const version = rest.slice(0, -(target.length + 1));
    if (/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version)) return { version, asset: m[2]!, sha256: m[1]! };
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
): Promise<Latest | null> {
  try {
    const res = await fetcher(`${base}/latest/download/SHA256SUMS`, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    if (!res.ok) return null;
    return latestIn(await res.text(), target);
  } catch {
    return null;
  }
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
}

/**
 * The TUI's daily check: when it's due — a release build, `[update] check` on in your config, no DO_NOT_TRACK, a day
 * since the last — the latest asked for, and what to say when it's newer than this one; null otherwise. The time is
 * kept before asking, so a failure waits a day too.
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
}): Promise<string | null> {
  if (!opts.release || !opts.enabled || doNotTrack(opts.env)) return null;
  const now = opts.now ?? Date.now();
  let state: CheckState = {};
  try {
    state = JSON.parse(readFileSync(opts.stateFile, "utf8")) as CheckState;
  } catch {}
  if (typeof state.checked === "number" && now - state.checked < CHECK_EVERY_MS && now >= state.checked) return null;
  const save = (s: CheckState) => {
    try {
      mkdirSync(dirname(opts.stateFile), { recursive: true });
      writeFileSync(opts.stateFile, `${JSON.stringify(s)}\n`);
    } catch {}
  };
  save({ ...state, checked: now });
  const latest = await fetchLatest(releasesBase(opts.release.repo, opts.env), opts.release.target, opts.fetcher);
  if (!latest) return null;
  save({ checked: now, latest: latest.version });
  return isNewer(latest.version, opts.version)
    ? `slipbox ${latest.version} is out (this is ${opts.version}): ${howToUpgrade(opts.by ?? "installer", opts.release.repo)}`
    : null;
}

export class UpgradeError extends Error {}

export interface UpgradeResult {
  status: "upgraded" | "current" | "available";
  from: string;
  /** The latest release's version. */
  latest: string;
  /** Versions removed, beyond the one replaced (kept). */
  removed: string[];
}

/** Runs a binary and says what it printed; null when it couldn't run. */
function versionOf(bin: string): string | null {
  try {
    const r = Bun.spawnSync([bin, "--version"], { stdout: "pipe", stderr: "pipe", timeout: 30_000 });
    return r.exitCode === 0 ? r.stdout.toString().trim() : null;
  } catch {
    return null;
  }
}

/**
 * `slipbox upgrade`: this install — the installer's, in `data` — moved to the latest release, or, with `check`, only
 * told of it. The pack's SHA-256 must be its SHA256SUMS line's and its binary must say its version before `current`
 * moves; the version replaced is kept, any older removed.
 */
export async function upgrade(opts: {
  release: ReleaseBuild;
  version: string;
  data: string;
  execPath: string;
  env?: Record<string, string | undefined>;
  check?: boolean;
  fetcher?: Fetcher;
}): Promise<UpgradeResult> {
  const fetcher = opts.fetcher ?? fetch;
  const versions = join(opts.data, "versions");
  let installed = false;
  try {
    installed = realpathSync(opts.execPath) === realpathSync(join(versions, opts.version, "slipbox"));
  } catch {}
  if (!installed) {
    if (installedBy(opts.execPath, opts.data, opts.version) === "homebrew")
      throw new UpgradeError("this slipbox is Homebrew's: brew upgrade slipbox");
    throw new UpgradeError(
      `this slipbox (${opts.execPath}) wasn't installed by its installer: upgrade it the way it was installed`,
    );
  }
  const base = releasesBase(opts.release.repo, opts.env);
  const latest = await fetchLatest(base, opts.release.target, fetcher, 30_000);
  if (!latest) throw new UpgradeError(`couldn't find the latest release's ${opts.release.target} build at ${base}`);
  const result = { from: opts.version, latest: latest.version, removed: [] as string[] };
  if (!isNewer(latest.version, opts.version)) return { status: "current", ...result };
  if (opts.check) return { status: "available", ...result };

  const v = latest.version;
  const work = join(versions, `.upgrade-${process.pid}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  try {
    const url = `${base}/download/v${v}/${latest.asset}`;
    let bytes: Uint8Array;
    try {
      const res = await fetcher(url, { signal: AbortSignal.timeout(300_000), redirect: "follow" });
      if (!res.ok) throw new Error(`answered ${res.status}`);
      bytes = new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      throw new UpgradeError(`couldn't download ${url}: ${(err as Error).message}`);
    }
    const got = createHash("sha256").update(bytes).digest("hex");
    if (got !== latest.sha256)
      throw new UpgradeError(`the download's SHA-256 is ${got}, not the release's ${latest.sha256}: nothing changed`);
    const pack = join(work, latest.asset);
    writeFileSync(pack, bytes);
    const tar = Bun.spawnSync(["tar", "-xzf", pack, "-C", work], { stdout: "ignore", stderr: "pipe" });
    if (tar.exitCode !== 0) throw new UpgradeError(`couldn't unpack ${latest.asset}: ${tar.stderr.toString().trim()}`);
    const unpacked = join(work, latest.asset.replace(/\.tar\.gz$/, ""));
    const said = existsSync(join(unpacked, "slipbox")) ? versionOf(join(unpacked, "slipbox")) : null;
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
  // `current` moved in one step: a link made beside it, renamed over it.
  const next = join(opts.data, `current.${process.pid}`);
  rmSync(next, { force: true });
  symlinkSync(`versions/${v}`, next);
  renameSync(next, join(opts.data, "current"));
  // The one replaced is kept, to go back to; any older goes.
  for (const old of readdirSync(versions).sort()) {
    if (old === v || old === opts.version || old.startsWith(".")) continue;
    rmSync(join(versions, old), { recursive: true, force: true });
    result.removed.push(old);
  }
  return { status: "upgraded", ...result };
}
