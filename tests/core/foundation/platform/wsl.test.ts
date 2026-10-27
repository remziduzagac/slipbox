import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const sandbox = makeCoreSandbox();

describe("WSL (14.12)", () => {
  const MOUNTS = [
    "none /usr/lib/wsl/drivers 9p ro,nosuid,nodev,noatime,dirsync,aname=drivers;fmask=222;dmask=222 0 0",
    "C:\\134 /mnt/c 9p rw,noatime,dirsync,aname=drvfs;path=C:\\;uid=1000;gid=1000 0 0",
    "D:\\134 /mnt/my\\040drive 9p rw,noatime,aname=drvfs;path=D:\\ 0 0",
    "e: /mnt/e drvfs rw,noatime 0 0",
    "/dev/sdc / ext4 rw,relatime 0 0",
  ].join("\n");

  test("WSL known by its environment or its kernel; Windows' drives read from its mounts — drvfs, or 9p naming it", async () => {
    const { isWsl, windowsDrives } = await import("../../../../src/core/foundation/platform/wsl.ts");
    expect(isWsl({ WSL_DISTRO_NAME: "Ubuntu" }, "6.1.0")).toBe(true);
    expect(isWsl({}, "5.15.153.1-microsoft-standard-WSL2")).toBe(true);
    expect(isWsl({}, "4.4.0-19041-Microsoft")).toBe(true);
    expect(isWsl({}, "7.0.14-orbstack")).toBe(false);
    expect(windowsDrives(MOUNTS)).toEqual([
      { drive: "C:", at: "/mnt/c" },
      { drive: "D:", at: "/mnt/my drive" },
      { drive: "E:", at: "/mnt/e" },
    ]);
    expect(windowsDrives("")).toEqual([]);
  });

  test("a path on a Windows drive, through a link too; Windows' fonts on C:; what's said opening notes there — in WSL only", async () => {
    const { windowsDriveNote, windowsDriveOf, windowsFontsDir } = await import(
      "../../../../src/core/foundation/platform/wsl.ts"
    );
    const { fontDirs } = await import("../../../../src/core/rendering/export/assets/fonts.ts");
    const base = mkdtempSync(join(sandbox, "wsl-"));
    const c = join(base, "mnt", "c");
    mkdirSync(join(c, "Users", "u", "notes"), { recursive: true });
    mkdirSync(join(c, "Windows", "Fonts"), { recursive: true });
    mkdirSync(join(base, "home"));
    symlinkSync(join(c, "Users", "u", "notes"), join(base, "home", "notes"));
    const drives = [{ drive: "C:", at: c }];
    expect(windowsDriveOf(join(c, "Users", "u", "notes"), drives)).toBe("C:");
    expect(windowsDriveOf(join(base, "home", "notes"), drives)).toBe("C:");
    expect(windowsDriveOf(join(base, "home"), drives)).toBeNull();
    expect(windowsDriveOf(`${c}-other`, drives)).toBeNull();
    expect(windowsFontsDir(drives)).toBe(join(c, "Windows", "Fonts"));
    expect(windowsFontsDir([{ drive: "D:", at: c }])).toBeNull();
    expect(fontDirs(join(c, "Windows", "Fonts"))[0]).toBe(join(c, "Windows", "Fonts"));
    expect(fontDirs(null)).not.toContain(join(c, "Windows", "Fonts"));
    expect(windowsDriveNote(join(base, "home", "notes"), true, drives)).toStartWith(
      "these notes are on Windows' C: drive: a change a Windows program makes there reaches slipbox only in the files it has open",
    );
    expect(windowsDriveNote(join(base, "home", "notes"), false, drives)).toBeNull();
    expect(windowsDriveNote(join(base, "home"), true, drives)).toBeNull();
  });
});
