import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, mkdtempSync, mkdirSync, realpathSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { DEFAULT_CONFIG } from "../../../../../src/core/application/config/config.ts";

import { homeAt } from "../../../../../src/core/workspace/vaults/vault.ts";
import { walkHomeNow } from "../../../../../src/core/workspace/vaults/home.ts";

import { makeVaultSandbox } from "../../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("home, a vault without a marker (VV-D2)", () => {
  /** A home folder of its own: `files` in it, `$HOME` while `f` runs. */
  const withHome = async <T>(files: Record<string, string>, f: (home: string) => T | Promise<T>): Promise<T> => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-vhome-")));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(home, rel)), { recursive: true });
      writeFileSync(join(home, rel), text);
    }
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      return await f(home);
    } finally {
      process.env.HOME = before;
    }
  };

  test("the mount table read without going near the mounts: /proc/mounts' escapes, macOS's `mount`, a folder of home by either of its paths", async () => {
    const { mountsIn, parseMountOutput, parseProcMounts } = await import(
      "../../../../../src/core/workspace/vaults/mounts.ts"
    );
    const linux = parseProcMounts("server:/x /home/me/my\\040share nfs4 rw,relatime 0 0\n/dev/sda1 / ext4 rw 0 0\n");
    expect(linux.map((m) => [m.at, m.type])).toEqual([
      ["/home/me/my share", "nfs4"],
      ["/", "ext4"],
    ]);
    const mac = parseMountOutput(
      [
        "/dev/disk3s1s1 on / (apfs, sealed, local, read-only, journaled)",
        "/dev/disk3s5 on /System/Volumes/Data (apfs, local, journaled, nobrowse)",
        "//me@nas/notes on /Users/me/nas notes (smbfs, nodev, nosuid, mounted by me)",
        "me@host:/srv on /System/Volumes/Data/Users/me/remote (macfuse, nodev, nosuid, mounted by me)",
      ].join("\n"),
    );
    expect(mac.map((m) => [m.at, m.type])).toEqual([
      ["/", "apfs"],
      ["/System/Volumes/Data", "apfs"],
      ["/Users/me/nas notes", "smbfs"],
      ["/System/Volumes/Data/Users/me/remote", "macfuse"],
    ]);
    // Inside home only, by home's paths: the data volume's name for a folder of /Users too.
    expect([...mountsIn("/Users/me", "/Users/me", mac)].sort()).toEqual(["nas notes", "remote"]);
    expect([...mountsIn("/home/me", "/home/me", linux)]).toEqual(["my share"]);
    // Home reached through a link: the table names its real path.
    const linked = parseProcMounts("s:/x /data/home/me/mnt nfs rw 0 0\n/dev/sdb /data nfs rw 0 0\n");
    expect([...mountsIn("/home/me", "/data/home/me", linked)]).toEqual(["mnt"]);
  });

  test("a folder where another disk is mounted is never walked: known from the mount table alone, left out as another disk — dropped from a walk kept, walked again once the disk is gone", async () => {
    const { setMountTable } = await import("../../../../../src/core/workspace/vaults/mounts.ts");
    const { homeFilter, homeWalk, leftOutOfHome } = await import("../../../../../src/core/workspace/vaults/home.ts");
    const { ANOTHER_DISK, SlicedWalk, walkTop } = await import("../../../../../src/core/workspace/walk/walk.ts");
    await withHome({ "a.md": "# A\n", "mnt/m.md": "# M\n", "notes/n.md": "# N\n" }, (home) => {
      const loc = homeAt(home);
      const mounts: { device: string; at: string; type: string; options: string }[] = [];
      setMountTable(() => mounts);
      try {
        // Walked and kept before the disk came: a folder like any. Its folders' times an hour back: unchanged since.
        const hour = new Date(Date.now() - 3_600_000);
        for (const d of ["", "mnt", "notes"]) utimesSync(join(home, d), hour, hour);
        walkHomeNow(loc, DEFAULT_CONFIG);
        // A disk mounted on it — one you may not read stands in for it, so a walk going into it would say so.
        mounts.push({ device: "server:/share", at: join(home, "mnt"), type: "nfs", options: "rw" });
        chmodSync(join(home, "mnt"), 0o000);
        const filter = homeFilter(loc, DEFAULT_CONFIG);
        const kept = homeWalk(loc, filter);
        expect(kept.walk.files.map((f) => f.rel)).toEqual(["a.md", "notes/n.md"]);
        expect(kept.walk.dirs).not.toContain("mnt");
        expect(kept.walk.skipped).toContainEqual({ rel: "mnt", reason: ANOTHER_DISK });
        expect(kept.walk.errors).toEqual([]);
        // Walked anew, a slice at a time, or its top alone: left out the same, never read.
        const w = new SlicedWalk(home, filter);
        while (w.step(50)) {}
        expect(w.result!.skipped).toContainEqual({ rel: "mnt", reason: ANOTHER_DISK });
        expect(w.result!.errors).toEqual([]);
        expect(walkTop(home, filter).dirs).toEqual(["", "notes"]);
        // Asked for by name, it isn't walked either: home's index leaves it out, and says why.
        expect(leftOutOfHome(home, filter, "mnt")).toBe(ANOTHER_DISK);
        expect(leftOutOfHome(home, filter, "mnt/sub")).toBe(ANOTHER_DISK);
        expect(homeWalk(loc, filter, ["mnt"]).walk.errors).toEqual([]);
        // The disk taken away: home's folder again, walked.
        chmodSync(join(home, "mnt"), 0o755);
        mounts.length = 0;
        expect(homeWalk(loc, homeFilter(loc, DEFAULT_CONFIG)).walk.files.map((f) => f.rel)).toEqual([
          "a.md",
          "mnt/m.md",
          "notes/n.md",
        ]);
      } finally {
        chmodSync(join(home, "mnt"), 0o755);
        setMountTable(null);
      }
    });
  });
});
