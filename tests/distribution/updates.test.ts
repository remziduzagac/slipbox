import { UNIT_TIMEOUT_MS } from "../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { installation } from "../../src/core/application/distribution/install.ts";
import { libcCandidates } from "../../src/core/foundation/platform/libc.ts";
import {
  CHECK_EVERY_MS,
  dailyUpdateCheck,
  doNotTrack,
  fetchLatest,
  isNewer,
  latestIn,
  releasesBase,
  upgrade,
  UpgradeError,
} from "../../src/core/application/distribution/update.ts";

import { makeDistributionSandbox, ROOT } from "../support/distribution-sandbox.ts";
import { makeDistributionPacks } from "../support/distribution-packs.ts";

setDefaultTimeout(UNIT_TIMEOUT_MS);

const { sandbox } = makeDistributionSandbox();
const { fakePack } = makeDistributionPacks(sandbox);

describe("updates (14.4)", () => {
  const sum = "a".repeat(64);
  const release = { repo: "o/r", target: "linux-x64" };

  test("the latest release, from its SHA256SUMS: its version in the pack's name, the sum beside it", () => {
    const sums = `${"b".repeat(64)}  slipbox-1.4.0-darwin-arm64.tar.gz\n${sum}  slipbox-1.4.0-linux-x64.tar.gz\n${"c".repeat(64)} *slipbox-1.4.0-linux-arm64.tar.gz\n`;
    expect(latestIn(sums, "linux-x64")).toEqual({
      version: "1.4.0",
      asset: "slipbox-1.4.0-linux-x64.tar.gz",
      sha256: sum,
    });
    expect(latestIn(sums, "linux-arm64")?.sha256).toBe("c".repeat(64));
    expect(latestIn(sums, "linux-x64-musl")).toBeNull();
    // A glibc and a musl pack side by side: each its own.
    const both = `${"d".repeat(64)}  slipbox-1.4.0-linux-x64-musl.tar.gz\n${sum}  slipbox-1.4.0-linux-x64.tar.gz\n`;
    expect(latestIn(both, "linux-x64")?.sha256).toBe(sum);
    expect(latestIn(both, "linux-x64-musl")).toEqual({
      version: "1.4.0",
      asset: "slipbox-1.4.0-linux-x64-musl.tar.gz",
      sha256: "d".repeat(64),
    });
    expect(latestIn("<html>not found</html>", "linux-x64")).toBeNull();
    expect(latestIn(`${sum}  slipbox-1.4-linux-x64.tar.gz\n`, "linux-x64")).toBeNull();
    expect(latestIn(`${sum}  slipbox-2.0.0-rc.1-linux-x64.tar.gz\n`, "linux-x64")?.version).toBe("2.0.0-rc.1");
  });

  test("newer by semver; DO_NOT_TRACK set unless 0 or false; GitHub's releases unless SLIPBOX_RELEASES_URL says", () => {
    expect([
      isNewer("0.10.0", "0.9.0"),
      isNewer("0.2.0", "0.2.0"),
      isNewer("0.1.9", "0.2.0"),
      isNewer("1.0.0", "1.0.0-rc.1"),
    ]).toEqual([true, false, false, true]);
    expect([
      doNotTrack({}),
      doNotTrack({ DO_NOT_TRACK: "1" }),
      doNotTrack({ DO_NOT_TRACK: "true" }),
      doNotTrack({ DO_NOT_TRACK: "0" }),
      doNotTrack({ DO_NOT_TRACK: "FALSE" }),
      doNotTrack({ DO_NOT_TRACK: "" }),
    ]).toEqual([false, true, true, false, false, false]);
    expect(releasesBase("o/r", {})).toBe("https://github.com/o/r/releases");
    expect(releasesBase("o/r", { SLIPBOX_RELEASES_URL: "file:///m/" })).toBe("file:///m");
  });

  test("Bun's crash reports off at start, in the C environment, read back through libc: unless you set either switch (D221)", () => {
    const mod = join(ROOT, "src", "core", "application", "distribution", "crash-reports.ts");
    const libcMod = join(ROOT, "src", "core", "foundation", "platform", "libc.ts");
    // A process of its own, its environment as given; what libc's getenv says after, on its last line.
    const after = (env: Record<string, string>, first: string): string | null => {
      const base = Object.fromEntries(
        Object.entries(process.env).filter(
          ([k]) => !k.startsWith("BUN_CRASH_REPORT") && !k.startsWith("BUN_ENABLE_CRASH"),
        ),
      );
      const script = `${first}\nconst { libc } = await import(${JSON.stringify(libcMod)});\nconsole.log(JSON.stringify(libc()?.getenv("BUN_ENABLE_CRASH_REPORTING") ?? null));`;
      const run = Bun.spawnSync([process.execPath, "-e", script], { env: { ...base, ...env }, cwd: ROOT });
      expect(run.stderr.toString()).toBe("");
      return JSON.parse(run.stdout.toString().trim().split("\n").at(-1)!);
    };
    const call = `const { crashReportsOff } = await import(${JSON.stringify(mod)}); crashReportsOff();`;
    expect(after({}, "")).toBeNull(); // libc reached, nothing set by itself
    expect(after({}, call)).toBe("0");
    expect(after({ BUN_ENABLE_CRASH_REPORTING: "1" }, call)).toBe("1");
    expect(after({ BUN_CRASH_REPORT_URL: "http://127.0.0.1:9/" }, call)).toBeNull();
    // slipbox's own start does it, before any command runs.
    const start = `process.argv = [process.argv[0], "slipbox", "--version"]; await import(${JSON.stringify(join(ROOT, "src", "main.ts"))});`;
    expect(after({}, start)).toBe("0");
    expect(libcCandidates("linux", "x64")).toEqual(["libc.so.6", "/lib/ld-musl-x86_64.so.1", "libc.so"]);
    expect(libcCandidates("linux", "arm64")[1]).toBe("/lib/ld-musl-aarch64.so.1");
    expect(libcCandidates("darwin", "arm64")[0]).toBe("/usr/lib/libSystem.B.dylib");
  });

  test("fetchLatest asks for latest/download/SHA256SUMS once; offline, an error page, nothing for it: null", async () => {
    const asked: string[] = [];
    const answer = (status: number, body: string) => async (url: string) => (
      asked.push(url), new Response(body, { status })
    );
    expect(
      await fetchLatest("https://x/o/r/releases", "linux-x64", answer(200, `${sum}  slipbox-3.0.0-linux-x64.tar.gz\n`)),
    ).toEqual({ version: "3.0.0", asset: "slipbox-3.0.0-linux-x64.tar.gz", sha256: sum });
    expect(asked).toEqual(["https://x/o/r/releases/latest/download/SHA256SUMS"]);
    expect(await fetchLatest("b", "linux-x64", answer(404, `${sum}  slipbox-3.0.0-linux-x64.tar.gz\n`))).toBeNull();
    expect(await fetchLatest("b", "linux-x64", async () => Promise.reject(new Error("offline")))).toBeNull();
  });

  test("the daily check: a release build, on, no DO_NOT_TRACK, a day since the last — then said when there's a newer one", async () => {
    const stateFile = join(mkdtempSync(join(sandbox, "upd-")), "state", "update.json");
    let asked = 0;
    const fetcher = async () => (asked++, new Response(`${sum}  slipbox-0.3.0-linux-x64.tar.gz\n`));
    const base = { release, version: "0.2.0", enabled: true, env: {}, stateFile, fetcher };
    // Never asked: from source, turned off, DO_NOT_TRACK.
    expect(await dailyUpdateCheck({ ...base, release: null })).toBeNull();
    expect(await dailyUpdateCheck({ ...base, enabled: false })).toBeNull();
    expect(await dailyUpdateCheck({ ...base, env: { DO_NOT_TRACK: "1" } })).toBeNull();
    expect(asked).toBe(0);
    expect(existsSync(stateFile)).toBe(false);
    const now = 1_800_000_000_000;
    expect(await dailyUpdateCheck({ ...base, now })).toEqual({
      version: "0.3.0",
      said: "slipbox 0.3.0 is out (this is 0.2.0): slipbox upgrade installs it",
    });
    expect(JSON.parse(readFileSync(stateFile, "utf8"))).toEqual({ checked: now, latest: "0.3.0" });
    // Within the day: not asked again.
    expect(await dailyUpdateCheck({ ...base, now: now + CHECK_EVERY_MS - 1 })).toBeNull();
    expect(asked).toBe(1);
    // A day on: asked; the latest is this one, so nothing said.
    expect(await dailyUpdateCheck({ ...base, version: "0.3.0", now: now + CHECK_EVERY_MS })).toBeNull();
    expect(asked).toBe(2);
    // A clock gone back: asked, not waited out.
    expect(await dailyUpdateCheck({ ...base, now: now - 1000 })).not.toBeNull();
    // Offline: the time kept all the same — the next try is a day off.
    const failing = async () => (asked++, Promise.reject(new Error("offline")));
    const later = now + 10 * CHECK_EVERY_MS;
    expect(await dailyUpdateCheck({ ...base, fetcher: failing, now: later })).toBeNull();
    expect(JSON.parse(readFileSync(stateFile, "utf8")).checked).toBe(later);
    const before = asked;
    expect(await dailyUpdateCheck({ ...base, now: later + 1 })).toBeNull();
    expect(asked).toBe(before);
  });

  test("upgrade, in the installer's layout: the new version added, current moved, the one replaced kept, older removed", async () => {
    const data = join(mkdtempSync(join(sandbox, "upg-")), "slipbox");
    for (const v of ["0.8.0", "0.9.0", "1.0.0"]) {
      mkdirSync(join(data, "versions", v), { recursive: true });
      writeFileSync(join(data, "versions", v, "slipbox"), "");
    }
    symlinkSync("versions/1.0.0", join(data, "current"));
    const target = "linux-x64";
    const pack = fakePack(mkdtempSync(join(sandbox, "p-")), "2.0.0", target);
    const asked: string[] = [];
    const fetcher = async (url: string) => {
      asked.push(url);
      return url.endsWith("SHA256SUMS")
        ? new Response(`${pack.sha}  ${pack.asset}\n`)
        : new Response(readFileSync(pack.file));
    };
    const opts = {
      release: { repo: "o/r", target },
      version: "1.0.0",
      data,
      execPath: join(data, "versions", "1.0.0", "slipbox"),
      env: {},
      fetcher,
    };
    expect(await upgrade(opts)).toMatchObject({
      status: "upgraded",
      from: "1.0.0",
      latest: "2.0.0",
      removed: ["0.8.0", "0.9.0"],
    });
    expect(asked).toEqual([
      "https://github.com/o/r/releases/latest/download/SHA256SUMS",
      `https://github.com/o/r/releases/download/v2.0.0/${pack.asset}`,
    ]);
    expect(readlinkSync(join(data, "current"))).toBe("versions/2.0.0");
    expect(Bun.spawnSync(["ls", "-A", join(data, "versions")]).stdout.toString()).toBe("1.0.0\n2.0.0\n");
    expect(Bun.spawnSync(["ls", "-A", data]).stdout.toString()).toBe("current\nversions\n");
    expect(installation(data)).toMatchObject({ versions: ["1.0.0", "2.0.0"], current: "2.0.0" });
  });

  test("upgrade refuses, changing nothing: a binary that says another version, one that doesn't run, a binary not in the layout", async () => {
    const data = join(mkdtempSync(join(sandbox, "upg-")), "slipbox");
    mkdirSync(join(data, "versions", "1.0.0"), { recursive: true });
    writeFileSync(join(data, "versions", "1.0.0", "slipbox"), "");
    symlinkSync("versions/1.0.0", join(data, "current"));
    const target = "linux-x64";
    const attempt = async (says: string, execPath = join(data, "versions", "1.0.0", "slipbox")) => {
      const pack = fakePack(mkdtempSync(join(sandbox, "p-")), "2.0.0", target, says);
      const fetcher = async (url: string) =>
        url.endsWith("SHA256SUMS")
          ? new Response(`${pack.sha}  ${pack.asset}\n`)
          : new Response(readFileSync(pack.file));
      try {
        await upgrade({ release: { repo: "o/r", target }, version: "1.0.0", data, execPath, env: {}, fetcher });
        return "upgraded";
      } catch (err) {
        expect(err).toBeInstanceOf(UpgradeError);
        return (err as Error).message;
      }
    };
    expect(await attempt("slipbox 1.9.9")).toBe(
      'the new binary says "slipbox 1.9.9", not "slipbox 2.0.0": nothing changed',
    );
    expect(readlinkSync(join(data, "current"))).toBe("versions/1.0.0");
    expect(Bun.spawnSync(["ls", "-A", join(data, "versions")]).stdout.toString()).toBe("1.0.0\n");
    const elsewhere = join(mkdtempSync(join(sandbox, "else-")), "slipbox");
    writeFileSync(elsewhere, "");
    expect(await attempt("slipbox 2.0.0", elsewhere)).toBe(
      `this slipbox (${elsewhere}) wasn't installed by its installer: upgrade it the way it was installed`,
    );
  });

  test("upgrade on an Intel Mac: told no release is built for it now, and the last that was; nothing asked for", async () => {
    const data = join(mkdtempSync(join(sandbox, "upg-")), "slipbox");
    mkdirSync(join(data, "versions", "0.3.0"), { recursive: true });
    writeFileSync(join(data, "versions", "0.3.0", "slipbox"), "");
    symlinkSync("versions/0.3.0", join(data, "current"));
    const asked: string[] = [];
    // A release that had an Intel Mac's pack, were it asked: still never downloaded.
    const fetcher = async (url: string) => (asked.push(url), new Response(`${sum}  slipbox-0.4.0-darwin-x64.tar.gz\n`));
    for (const check of [false, true]) {
      const tried = upgrade({
        release: { repo: "o/r", target: "darwin-x64" },
        version: "0.3.0",
        data,
        execPath: join(data, "versions", "0.3.0", "slipbox"),
        env: {},
        check,
        fetcher,
      });
      await expect(tried).rejects.toBeInstanceOf(UpgradeError);
      await expect(tried).rejects.toThrow(
        "Intel Macs aren't supported any more: 0.3.0 was the last release built for them",
      );
    }
    expect(asked).toEqual([]);
    expect(readlinkSync(join(data, "current"))).toBe("versions/0.3.0");
    expect(readdirSync(join(data, "versions"))).toEqual(["0.3.0"]);
  });
});
