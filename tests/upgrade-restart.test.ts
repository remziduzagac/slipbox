// Upgrading and restarting from the TUI (UPG): `upgrade` one at a time, never back, cancellable before its commit.
import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LOCK_STALE_MS,
  lockUpgrades,
  UpgradeCancelled,
  UpgradeError,
  upgrade,
  upgradeSaid,
} from "../src/core/update.ts";

setDefaultTimeout(30_000);

const sandbox = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-upg-")));
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

const target = "linux-x64";
const release = { repo: "o/r", target };

/** A binary that answers `--version` with `says`, after `sleep` seconds. */
function fakeBinary(file: string, says: string, sleep = 0): void {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, `#!/bin/sh\n${sleep ? `sleep ${sleep}\n` : ""}echo '${says}'\n`);
  chmodSync(file, 0o755);
}

/** A release's pack: `slipbox-<version>-<target>/slipbox` saying `says`. */
function fakePack(version: string, says = `slipbox ${version}`, sleep = 0) {
  const dir = mkdtempSync(join(sandbox, "p-"));
  const name = `slipbox-${version}-${target}`;
  fakeBinary(join(dir, name, "slipbox"), says, sleep);
  const file = join(dir, `${name}.tar.gz`);
  expect(Bun.spawnSync(["tar", "-czf", file, "-C", dir, name]).exitCode).toBe(0);
  const sha = createHash("sha256").update(readFileSync(file)).digest("hex");
  return { file, sha, asset: `${name}.tar.gz` };
}

/** The installer's layout: each version's binary in `versions/`, `current` naming one. */
function layout(versions: string[], current: string): string {
  const data = join(mkdtempSync(join(sandbox, "data-")), "slipbox");
  for (const v of versions) fakeBinary(join(data, "versions", v, "slipbox"), `slipbox ${v}`);
  symlinkSync(`versions/${current}`, join(data, "current"));
  return data;
}

/** Releases answering with one pack; every address asked for kept in `asked`. `hold` keeps the pack's download
 *  waiting until it's cancelled. */
function releases(pack: ReturnType<typeof fakePack>, opts: { hold?: boolean } = {}) {
  const asked: string[] = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    asked.push(url);
    if (url.endsWith("SHA256SUMS")) return new Response(`${pack.sha}  ${pack.asset}\n`);
    if (opts.hold)
      await new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    return new Response(readFileSync(pack.file));
  };
  return { asked, fetcher };
}

const ls = (dir: string) => readdirSync(dir).sort();

/** A pid no process has: one that ran and ended. */
async function deadPid(): Promise<number> {
  const child = Bun.spawn(["true"]);
  await child.exited;
  return child.pid;
}

describe("upgrade, against what's installed (UPG-T1)", () => {
  test("upgrades take turns: one running refuses another; a lock left by a process gone is taken over, its leftovers removed", async () => {
    const data = layout(["1.0.0"], "1.0.0");
    const execPath = join(data, "versions", "1.0.0", "slipbox");
    const { asked, fetcher } = releases(fakePack("2.0.0"));
    const opts = { release, version: "1.0.0", data, execPath, env: {}, fetcher };
    // Held by a process still running (this one's parent): refused before anything is asked for.
    writeFileSync(join(data, "upgrade.lock"), JSON.stringify({ pid: process.ppid, at: Date.now() }));
    await expect(upgrade(opts)).rejects.toThrow(`another upgrade is running (pid ${process.ppid})`);
    expect(asked).toEqual([]);
    expect(readlinkSync(join(data, "current"))).toBe("versions/1.0.0");
    // Left by a process that's gone, with what it cut short: taken over, and cleared.
    writeFileSync(join(data, "upgrade.lock"), JSON.stringify({ pid: await deadPid(), at: Date.now() }));
    mkdirSync(join(data, "versions", ".upgrade-4242"));
    writeFileSync(join(data, "versions", ".upgrade-4242", "slipbox-2.0.0-linux-x64.tar.gz"), "half");
    symlinkSync("versions/2.0.0", join(data, "current.4242"));
    expect((await upgrade(opts)).status).toBe("upgraded");
    expect(readlinkSync(join(data, "current"))).toBe("versions/2.0.0");
    expect(ls(data)).toEqual(["current", "versions"]);
    expect(ls(join(data, "versions"))).toEqual(["1.0.0", "2.0.0"]);
  });

  test("a lock older than an upgrade can take is taken over, whoever holds it; one being written is waited for", () => {
    const data = layout(["1.0.0"], "1.0.0");
    const lock = join(data, "upgrade.lock");
    writeFileSync(lock, JSON.stringify({ pid: process.ppid, at: Date.now() - LOCK_STALE_MS - 1 }));
    const release = lockUpgrades(data);
    expect(JSON.parse(readFileSync(lock, "utf8")).pid).toBe(process.pid);
    // Held: a second is refused, until the first lets go.
    expect(() => lockUpgrades(data, 4242)).toThrow(`another upgrade is running (pid ${process.pid})`);
    release();
    expect(existsSync(lock)).toBe(false);
    lockUpgrades(data, 4242);
    // Let go only by its holder: another's release leaves it.
    release();
    expect(JSON.parse(readFileSync(lock, "utf8")).pid).toBe(4242);
    // Empty — its holder still writing it — and fresh: held.
    writeFileSync(lock, "");
    expect(() => lockUpgrades(data)).toThrow(UpgradeError);
  });

  test("never back: a window running an older version finds the newest installed already, and changes nothing", async () => {
    const data = layout(["1.0.0", "2.0.0"], "2.0.0");
    const execPath = join(data, "versions", "1.0.0", "slipbox");
    for (const [latest, check] of [
      ["2.0.0", false],
      ["1.5.0", false],
      ["2.0.0", true],
    ] as const) {
      const { asked, fetcher } = releases(fakePack(latest));
      const r = await upgrade({ release, version: "1.0.0", data, execPath, env: {}, fetcher, check });
      expect(r).toEqual({ status: "installed", from: "1.0.0", latest, installed: "2.0.0", removed: [] });
      expect(asked).toEqual(["https://github.com/o/r/releases/latest/download/SHA256SUMS"]);
      expect(readlinkSync(join(data, "current"))).toBe("versions/2.0.0");
      expect(ls(join(data, "versions"))).toEqual(["1.0.0", "2.0.0"]);
    }
  });

  test("the channel's newest already in versions/ is taken without a download; one that doesn't say its version is fetched again", async () => {
    const data = layout(["1.0.0", "2.0.0"], "1.0.0");
    const execPath = join(data, "versions", "1.0.0", "slipbox");
    const pack = fakePack("2.0.0");
    const first = releases(pack);
    expect((await upgrade({ release, version: "1.0.0", data, execPath, env: {}, fetcher: first.fetcher })).status).toBe(
      "upgraded",
    );
    expect(first.asked).toEqual(["https://github.com/o/r/releases/latest/download/SHA256SUMS"]);
    expect(readlinkSync(join(data, "current"))).toBe("versions/2.0.0");

    const broken = layout(["1.0.0", "2.0.0"], "1.0.0");
    fakeBinary(join(broken, "versions", "2.0.0", "slipbox"), "slipbox 1.9.9");
    const again = releases(pack);
    const opts = { release, version: "1.0.0", data: broken, env: {}, fetcher: again.fetcher };
    expect((await upgrade({ ...opts, execPath: join(broken, "versions", "1.0.0", "slipbox") })).status).toBe(
      "upgraded",
    );
    expect(again.asked).toHaveLength(2);
    expect(readFileSync(join(broken, "versions", "2.0.0", "slipbox"), "utf8")).toContain("slipbox 2.0.0");
  });

  test("kept: the new version, the one current named, the one running; any other removed", async () => {
    const data = layout(["0.8.0", "0.9.0", "1.0.0", "1.5.0"], "1.5.0");
    const { fetcher } = releases(fakePack("2.0.0"));
    const execPath = join(data, "versions", "1.0.0", "slipbox");
    const r = await upgrade({ release, version: "1.0.0", data, execPath, env: {}, fetcher });
    expect(r).toEqual({ status: "upgraded", from: "1.0.0", latest: "2.0.0", removed: ["0.8.0", "0.9.0"] });
    expect(ls(join(data, "versions"))).toEqual(["1.0.0", "1.5.0", "2.0.0"]);
  });

  test("the version running removed by another window's upgrade: still the installer's, by its path", async () => {
    const data = layout(["1.5.0", "2.0.0"], "2.0.0");
    const gone = join(data, "versions", "1.0.0", "slipbox");
    for (const execPath of [gone, `${gone} (deleted)`]) {
      const { fetcher } = releases(fakePack("2.0.0"));
      const r = await upgrade({ release, version: "1.0.0", data, execPath, env: {}, fetcher });
      expect(r.status).toBe("installed");
    }
  });

  test("what's said of it: installed already names the version current names", () => {
    const r = { from: "1.0.0", latest: "2.0.0", removed: [] };
    expect(upgradeSaid({ ...r, status: "installed", installed: "2.1.0" }, "stable")).toBe(
      "slipbox 2.1.0 is installed already (this is 1.0.0)",
    );
    expect(upgradeSaid({ ...r, status: "upgraded", removed: ["0.9.0"] }, "stable")).toBe(
      "slipbox 1.0.0 → 2.0.0; 1.0.0 is kept, to go back to (0.9.0 removed)",
    );
    expect(upgradeSaid({ ...r, status: "available" }, "preview")).toBe(
      "slipbox 2.0.0 is out on the preview channel (this is 1.0.0): slipbox upgrade installs it",
    );
  });

  test("cancelled before current moves — while downloading, while the new binary runs — nothing in use changes", async () => {
    const data = layout(["1.0.0"], "1.0.0");
    const execPath = join(data, "versions", "1.0.0", "slipbox");
    const base = { release, version: "1.0.0", data, execPath, env: {} };
    const unchanged = () => {
      expect(readlinkSync(join(data, "current"))).toBe("versions/1.0.0");
      expect(ls(join(data, "versions"))).toEqual(["1.0.0"]);
      expect(ls(data)).toEqual(["current", "versions"]);
    };
    // Cancelled before it began: asks for the newest, downloads nothing.
    const before = releases(fakePack("2.0.0"));
    await expect(upgrade({ ...base, fetcher: before.fetcher, signal: AbortSignal.abort() })).rejects.toBeInstanceOf(
      UpgradeCancelled,
    );
    expect(before.asked).toHaveLength(1);
    unchanged();
    // While downloading.
    const held = releases(fakePack("2.0.0"), { hold: true });
    const cancel = new AbortController();
    const downloading = upgrade({ ...base, fetcher: held.fetcher, signal: cancel.signal });
    while (held.asked.length < 2) await Bun.sleep(10);
    cancel.abort();
    await expect(downloading).rejects.toThrow("cancelled");
    unchanged();
    // While the new binary is asked its version: a child awaited, so the cancel is seen at once.
    const slow = releases(fakePack("2.0.0", "slipbox 2.0.0", 20));
    const stop = new AbortController();
    const started = Date.now();
    const running = upgrade({ ...base, fetcher: slow.fetcher, signal: stop.signal });
    setTimeout(() => stop.abort(), 500);
    await expect(running).rejects.toBeInstanceOf(UpgradeCancelled);
    expect(Date.now() - started).toBeLessThan(10_000);
    unchanged();
  });
});
