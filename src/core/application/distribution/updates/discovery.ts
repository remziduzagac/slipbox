// Release/channel discovery below upgrade state, locking and installation.

import { PREVIEW_TAG, pagesBase, tagOf } from "../release.ts";
import type { Channel } from "../install.ts";

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

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
export const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;

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
