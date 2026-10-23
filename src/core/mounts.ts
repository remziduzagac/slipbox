// The machine's mount table (VV-D2): where other filesystems are mounted — a share, a USB disk, an sshfs or NFS
// mount — read without going near them, since a mount that stops answering blocks whatever looks into it. Home's walk
// never goes into one (`WalkFilter.exclusion`: "another disk"). Read from /proc/self/mounts on Linux (WSL too), and from
// one run of `mount` on macOS, which asks the kernel without waiting on any disk; elsewhere, none is known.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** A line of the mount table. */
export interface Mount {
  device: string;
  /** Where it's mounted: an absolute path. */
  at: string;
  type: string;
  options: string;
}

/** A path as /proc/mounts writes it: a space, a tab, a backslash as octal escapes. */
const unescape = (s: string) =>
  s.replace(/\\([0-7]{3})/g, (_, o: string) => String.fromCharCode(Number.parseInt(o, 8)));

/** /proc/mounts' lines (Linux): `device at type options 0 0`. */
export function parseProcMounts(text: string): Mount[] {
  const out: Mount[] = [];
  for (const line of text.split("\n")) {
    const [device = "", at = "", type = "", options = ""] = line.split(" ");
    if (at.startsWith("/")) out.push({ device: unescape(device), at: unescape(at), type, options });
  }
  return out;
}

/** `mount`'s lines as macOS prints them: `device on /at (type, option, …)`. */
export function parseMountOutput(text: string): Mount[] {
  const out: Mount[] = [];
  for (const line of text.split("\n")) {
    const m = /^(.*?) on (\/.*) \(([^,()]*)(?:, ([^()]*))?\)$/.exec(line);
    if (m) out.push({ device: m[1]!, at: m[2]!, type: m[3]!.trim(), options: m[4] ?? "" });
  }
  return out;
}

/** The mount table from elsewhere (a test's), in place of the machine's. */
let given: (() => Mount[]) | null = null;

/** Read the mount table from `read` instead of the machine (a test's fake one: tests can't mount); null, the machine's
 *  again. */
export function setMountTable(read: (() => Mount[]) | null): void {
  given = read;
}

/** The mount table as read lately: read again when it's `maxAgeMs` old (on macOS, reading it runs `mount`). */
let recent: { at: number; table: Mount[] } | null = null;

/** The machine's mount table read at most `maxAgeMs` ago (T12: the explorer's listings, many a second); a test's at once. */
export function recentMountTable(maxAgeMs: number): Mount[] {
  if (given) return given();
  if (!recent || Date.now() - recent.at > maxAgeMs) recent = { at: Date.now(), table: mountTable() };
  return recent.table;
}

/** The machine's mount table, as far as it can be read: none when it can't (or the platform has none to read). */
export function mountTable(platform = process.platform): Mount[] {
  if (given) return given();
  try {
    if (platform === "linux") return parseProcMounts(readFileSync("/proc/self/mounts", "utf8"));
    if (platform === "darwin") {
      const r = spawnSync("/sbin/mount", [], { encoding: "utf8", timeout: 3000 });
      return r.status === 0 ? parseMountOutput(r.stdout) : [];
    }
  } catch {}
  return [];
}

/** macOS's data volume, under which its mount table may name a folder of `/Users`. */
const DATA_VOLUME = "/System/Volumes/Data";

/**
 * The folders inside `root` where another filesystem is mounted, as `root`'s paths for them (`/`-separated) — by the
 * mount table alone, never by looking at them. `realRoot`, `root`'s real path, when it differs (a home reached through a
 * link), is matched too.
 */
export function mountsIn(root: string, realRoot = root, table: Mount[] = mountTable()): Set<string> {
  const out = new Set<string>();
  const bases = [...new Set([root, realRoot])].map((b) => (b.endsWith("/") ? b : `${b}/`));
  for (const { at } of table) {
    const ats = at.startsWith(`${DATA_VOLUME}/`) ? [at, at.slice(DATA_VOLUME.length)] : [at];
    for (const a of ats)
      for (const b of bases) if (a.startsWith(b) && a.length > b.length) out.add(a.slice(b.length).replace(/\/+$/, ""));
  }
  return out;
}
