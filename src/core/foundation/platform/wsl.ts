// slipbox in WSL (plan 14.12): Windows' own Linux, where the Linux release and its installer run as they are — the
// way slipbox runs on Windows for now; native Windows is staged (14.14–14.17). What differs from other Linux: no X or
// Wayland clipboard tool, but Windows' clip.exe and PowerShell (`core/foundation/platform/clipboard.ts`); Windows'
// drives mounted under
// /mnt (9p, drvfs), where a change a Windows program makes raises no event; and Windows' fonts on its C: drive.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { parseProcMounts } from "../../mounts.ts";

function read(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

/** Whether this is WSL: its environment says so, or its kernel does. */
export function isWsl(
  env: Record<string, string | undefined> = process.env,
  osrelease = read("/proc/sys/kernel/osrelease"),
): boolean {
  return !!env.WSL_DISTRO_NAME || /microsoft/i.test(osrelease);
}

/** Windows' drives as WSL mounts them — `C:` at `/mnt/c` — from /proc/mounts: drvfs, or 9p naming it. */
export function windowsDrives(mounts = read("/proc/mounts")): { drive: string; at: string }[] {
  const out: { drive: string; at: string }[] = [];
  for (const { device, at, type, options } of parseProcMounts(mounts)) {
    if (type !== "drvfs" && !(type === "9p" && /\baname=drvfs\b/.test(options))) continue;
    const drive = /^([A-Za-z]):/.exec(device)?.[1];
    if (drive) out.push({ drive: `${drive.toUpperCase()}:`, at });
  }
  return out;
}

/** The Windows drive a path is on (`C:`), or null — its real path, so a link into a drive counts. */
export function windowsDriveOf(path: string, drives = windowsDrives()): string | null {
  let real = path;
  try {
    real = realpathSync(path);
  } catch {}
  return drives.find((d) => real === d.at || real.startsWith(`${d.at}/`))?.drive ?? null;
}

/** Windows' fonts, as WSL sees its C: drive; null when it isn't mounted. */
export function windowsFontsDir(drives = windowsDrives()): string | null {
  const c = drives.find((d) => d.drive === "C:");
  const dir = c ? join(c.at, "Windows", "Fonts") : null;
  return dir && existsSync(dir) ? dir : null;
}

/** What to say, opening notes on a Windows drive from WSL: what's noticed there, and what isn't. */
export function windowsDriveNote(root: string, wsl = isWsl(), drives = wsl ? windowsDrives() : []): string | null {
  const drive = wsl ? windowsDriveOf(root, drives) : null;
  return drive
    ? `these notes are on Windows' ${drive} drive: a change a Windows program makes there reaches slipbox only in the files it has open (polled), and reading is slower — notes in WSL's own folders are watched in full`
    : null;
}
