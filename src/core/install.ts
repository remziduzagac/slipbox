// The installer's layout (plans 14.7, 14.8): in slipbox's data folder, `versions/<version>/` — each one installed,
// the binary and its notices — and `current`, a link to the one in use; `<bin>/slipbox`, a link to
// `<data>/current/slipbox`; `bin-link`, where that link is; and `channel`, the releases it follows (GR-D15).
// `install.sh` lays it out, `upgrade` adds a version and moves `current`, `slipbox channel set` changes the channel,
// and `uninstall` takes it away — with `--purge`, everything slipbox keeps, too.

import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync } from "node:fs";
import { join, sep } from "node:path";
import { atomicWrite } from "./fsutil.ts";
import { type StoreKind, storeDir } from "./paths.ts";

export type Stores = Record<StoreKind, string>;

/** How this slipbox was put here: by its installer (in `versions/`), by Homebrew (in its Cellar, 14.3), or another
 *  way — from source, or a binary put somewhere by hand. */
export type InstalledBy = "installer" | "homebrew" | "other";

export function installedBy(execPath: string, data: string, version: string): InstalledBy {
  let real = execPath;
  try {
    real = realpathSync(execPath);
  } catch {}
  try {
    if (real === realpathSync(join(data, "versions", version, "slipbox"))) return "installer";
  } catch {}
  return /\/Cellar\/slipbox\/[^/]+\/bin\/slipbox$/.test(real) ? "homebrew" : "other";
}

/** How to get a newer one, by how this one was put here. */
export function howToUpgrade(by: InstalledBy, repo: string): string {
  return by === "installer"
    ? "slipbox upgrade installs it"
    : by === "homebrew"
      ? "brew upgrade slipbox installs it"
      : `it's at https://github.com/${repo}/releases`;
}

/** Which releases an install follows (GR-D15): `stable`, the releases; `preview`, the newest of the stable release
 *  and the previews. The installer's install keeps it in `<data>/channel`; Homebrew's, and slipbox run from source,
 *  have none. */
export type Channel = "stable" | "preview";
export const CHANNELS: readonly Channel[] = ["stable", "preview"];

export function isChannel(s: string): s is Channel {
  return (CHANNELS as readonly string[]).includes(s);
}

/** The channel an install follows, from `<data>/channel`: stable when there's none, or it says anything else. */
export function readChannel(data: string): Channel {
  try {
    return readFileSync(join(data, "channel"), "utf8").trim() === "preview" ? "preview" : "stable";
  } catch {
    return "stable";
  }
}

/** The channel kept, in one step: a file written beside it and renamed over it. */
export function writeChannel(data: string, channel: Channel): void {
  atomicWrite(join(data, "channel"), `${channel}\n`);
}

/** Why this slipbox has no channel, with how it updates instead; null when it has one, as the installer's does. */
export function noChannel(release: { repo: string } | null, by: InstalledBy, execPath: string): string | null {
  if (!release) return "this slipbox runs from source (or was built by hand): it has no channel — update its checkout";
  if (by === "homebrew")
    return "this slipbox is Homebrew's: it has no channel — brew upgrade slipbox updates it, to stable releases";
  if (by === "other")
    return `this slipbox (${execPath}) wasn't installed by its installer: it has no channel — releases are at https://github.com/${release.repo}/releases`;
  return null;
}

/** slipbox's four folders, where they are here (14.9). */
export function stores(): Stores {
  return { config: storeDir("config"), state: storeDir("state"), data: storeDir("data"), cache: storeDir("cache") };
}

function lexists(p: string): boolean {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

export interface Installation {
  /** The versions installed, by folder name. */
  versions: string[];
  /** The version `current` points at, or null. */
  current: string | null;
  /** The link that runs slipbox, where `bin-link` says — when it's still the installer's link to `current`. */
  link: string | null;
  /** Where `bin-link` says the link is, when what's there now isn't the installer's (left alone). */
  foreignLink: string | null;
}

/** What the installer has put in a data folder. */
export function installation(data: string): Installation {
  const versionsDir = join(data, "versions");
  const versions = existsSync(versionsDir)
    ? readdirSync(versionsDir)
        .filter((v) => !v.endsWith(".new") && !v.startsWith("."))
        .sort()
    : [];
  let current: string | null = null;
  try {
    current = /^versions\/([^/]+)$/.exec(readlinkSync(join(data, "current")))?.[1] ?? null;
  } catch {}
  let link: string | null = null;
  let foreignLink: string | null = null;
  try {
    const at = readFileSync(join(data, "bin-link"), "utf8").trim();
    if (at) {
      let ours = false;
      try {
        ours = lstatSync(at).isSymbolicLink() && readlinkSync(at) === join(data, "current", "slipbox");
      } catch {}
      if (ours) link = at;
      else if (lexists(at)) foreignLink = at;
    }
  } catch {}
  return { versions, current, link, foreignLink };
}

export interface Item {
  path: string;
  /** What it holds, said to the person deciding. */
  what: string;
}

export interface UninstallPlan {
  remove: Item[];
  /** What stays: slipbox's folders, without `--purge`. */
  keep: Item[];
  /** Things said: a link that isn't slipbox's any more, left alone. */
  notes: string[];
}

const KEPT: Record<StoreKind, string> = {
  config: "your settings and themes",
  state: "your workspaces, the scratch, the trash, undo, reading positions, named folders",
  data: "your own words (spelling), language servers installed for you",
  cache: "indexes and pictures, all made again when missing",
};

/** What `uninstall` takes away — the installer's files; with `purge`, slipbox's four folders too — and what stays.
 *  `by`: how the slipbox running was put here — Homebrew's is Homebrew's to remove, and said so. */
export function uninstallPlan(purge: boolean, dirs: Stores = stores(), by: InstalledBy = "other"): UninstallPlan {
  const inst = installation(dirs.data);
  const remove: Item[] = [];
  const notes: string[] = [];
  if (by === "homebrew") notes.push("this slipbox is Homebrew's: brew uninstall slipbox removes it");
  if (inst.link) remove.push({ path: inst.link, what: "the link that runs slipbox" });
  if (inst.foreignLink) notes.push(`${inst.foreignLink} isn't slipbox's link any more: left as it is`);
  if (inst.versions.length)
    remove.push({ path: join(dirs.data, "versions"), what: `slipbox ${inst.versions.join(", ")}` });
  if (lexists(join(dirs.data, "current")))
    remove.push({ path: join(dirs.data, "current"), what: "which version is in use" });
  if (lexists(join(dirs.data, "bin-link")))
    remove.push({ path: join(dirs.data, "bin-link"), what: "where the link is" });
  if (lexists(join(dirs.data, "channel")))
    remove.push({ path: join(dirs.data, "channel"), what: "which releases it follows" });
  const keep: Item[] = [];
  for (const kind of ["config", "state", "data", "cache"] as const) {
    if (!existsSync(dirs[kind])) continue;
    (purge ? remove : keep).push({ path: dirs[kind], what: KEPT[kind] });
  }
  return { remove, keep, notes };
}

/** Whether a path is one `uninstall` may remove: the installer's link, or in one of slipbox's own folders. */
export function removable(path: string, dirs: Stores, link: string | null): boolean {
  if (link !== null && path === link) return true;
  return Object.values(dirs).some(
    (d) => d.split(/[\\/]/).includes("slipbox") && (path === d || path.startsWith(d + sep)),
  );
}

/** The plan carried out, a link removed as itself (never what it points at); what couldn't be, and why. */
export function uninstall(plan: UninstallPlan, dirs: Stores = stores()): string[] {
  const link = plan.remove.find((i) => i.what === "the link that runs slipbox")?.path ?? null;
  const failed: string[] = [];
  for (const { path } of plan.remove) {
    if (!removable(path, dirs, link)) {
      failed.push(`${path}: not slipbox's to remove`);
      continue;
    }
    try {
      rmSync(path, { recursive: true, force: true });
    } catch (err) {
      failed.push(`${path}: ${(err as Error).message}`);
    }
  }
  return failed;
}
