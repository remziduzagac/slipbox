// Upgrading and restarting from the TUI (UPG): `upgrade` one at a time, never back, cancellable before its commit;
// the restart's note and its hand-over (`core/restart.ts`).
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
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  handOver,
  type Launch,
  nextLaunch,
  NOTE_FRESH_MS,
  type RestartNote,
  startedPath,
  takeNote,
  writeNote,
} from "../src/core/restart.ts";
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

describe("the restart's note and its hand-over (UPG-T2)", () => {
  const note = (over: Partial<RestartNote> = {}): RestartNote => ({
    pid: 4242,
    at: Date.now(),
    from: "1.0.0",
    upgrade: null,
    outcome: null,
    place: { mode: "vault", root: "/notes" },
    session: { tabs: [["a.md"]] },
    ...over,
  });

  test("the note: written and read back, taken once — by this pid, else the parent's — and ignored once stale", () => {
    const dir = mkdtempSync(join(sandbox, "notes-"));
    const n = note();
    writeNote(n, dir);
    expect(takeNote({ pid: 4242, ppid: 1, dir })).toEqual(n);
    expect(takeNote({ pid: 4242, ppid: 1, dir })).toBeNull();
    // Started and waited for: the note is its parent's.
    writeNote(n, dir);
    expect(takeNote({ pid: 5000, ppid: 4242, dir })).toEqual(n);
    expect(ls(dir)).toEqual([]);
    // Older than a restart takes: removed, and ignored.
    writeNote(note({ at: Date.now() - NOTE_FRESH_MS - 1 }), dir);
    expect(takeNote({ pid: 4242, ppid: 1, dir })).toBeNull();
    expect(ls(dir)).toEqual([]);
    // Unreadable: the same.
    writeFileSync(join(dir, "4242.json"), "{");
    expect(takeNote({ pid: 4242, ppid: 1, dir })).toBeNull();
    // Another's left behind for a day: cleared; a fresh one of another's left alone.
    writeNote(note({ pid: 7 }), dir);
    writeNote(note({ pid: 8 }), dir);
    const old = (Date.now() - 2 * 24 * 60 * 60 * 1000) / 1000;
    utimesSync(join(dir, "7.json"), old, old);
    takeNote({ pid: 4242, ppid: 1, dir });
    expect(ls(dir)).toEqual(["8.json"]);
  });

  test("the path slipbox was started by: its name with a slash, else the first on PATH that runs", () => {
    const dir = mkdtempSync(join(sandbox, "path-"));
    fakeBinary(join(dir, "b", "slipbox"), "slipbox 1.0.0");
    writeFileSync(join(dir, "a-slipbox"), "not executable");
    mkdirSync(join(dir, "a"));
    writeFileSync(join(dir, "a", "slipbox"), "");
    const path = [join(dir, "a"), "", join(dir, "b")].join(":");
    expect(startedPath("slipbox", path, "/")).toBe(join(dir, "b", "slipbox"));
    expect(startedPath("./bin/slipbox", path, "/home/u")).toBe("/home/u/bin/slipbox");
    expect(startedPath("nothing-here", path, "/")).toBeNull();
    expect(startedPath("", path, "/")).toBeNull();
  });

  test("the binary started: current, or the file that ran after a failed upgrade; Homebrew's opt link; the path started by; Bun and the script", () => {
    const data = layout(["1.0.0", "2.0.0"], "2.0.0");
    const running = join(data, "versions", "1.0.0", "slipbox");
    const base: Parameters<typeof nextLaunch>[0] = {
      by: "installer",
      data,
      execPath: running,
      argv0: "slipbox",
      startedBy: null,
      script: null,
      upgradeFailed: false,
      args: ["notes", "--root", "x"],
    };
    const file = (o: Partial<typeof base>) => nextLaunch({ ...base, ...o }).file;
    expect(nextLaunch(base)).toEqual({
      file: join(data, "current", "slipbox"),
      argv: ["slipbox", "notes", "--root", "x"],
    });
    expect(file({ upgradeFailed: true })).toBe(running);
    // The file that ran is gone: current.
    expect(file({ upgradeFailed: true, execPath: `${join(data, "versions", "0.9.0", "slipbox")} (deleted)` })).toBe(
      join(data, "current", "slipbox"),
    );
    // Homebrew's: its opt link, which outlives the keg running.
    const brew = mkdtempSync(join(sandbox, "brew-"));
    const keg = join(brew, "Cellar", "slipbox", "1.0.0_1", "bin", "slipbox");
    fakeBinary(keg, "slipbox 1.0.0");
    expect(file({ by: "homebrew", execPath: keg })).toBe(keg);
    fakeBinary(join(brew, "opt", "slipbox", "bin", "slipbox"), "slipbox 2.0.0");
    expect(file({ by: "homebrew", execPath: keg })).toBe(join(brew, "opt", "slipbox", "bin", "slipbox"));
    // Put here by hand: the path it was started by, when it's still there.
    const link = join(mkdtempSync(join(sandbox, "hand-")), "slipbox");
    expect(file({ by: "other", execPath: running, startedBy: link })).toBe(running);
    fakeBinary(link, "slipbox 2.0.0");
    expect(file({ by: "other", execPath: running, startedBy: link })).toBe(link);
    // From source: Bun, with the same script.
    expect(
      nextLaunch({ ...base, by: "other", execPath: "/usr/bin/bun", argv0: "bun", script: "/src/main.ts" }),
    ).toEqual({
      file: "/usr/bin/bun",
      argv: ["bun", "/src/main.ts", "notes", "--root", "x"],
    });
  });

  test("execve through libc: the same process, its exit code the shell's; on Linux, no descriptor carried over", () => {
    if (process.platform === "win32") return;
    const helper = join(mkdtempSync(join(sandbox, "exec-")), "helper.ts");
    const restart = resolve(import.meta.dir, "../src/core/restart.ts");
    writeFileSync(
      helper,
      `import { execInto } from ${JSON.stringify(restart)};
console.log("before " + process.pid);
const script = 'echo "after $$"; for f in /proc/$$/fd/*; do readlink "$f"; done 2>/dev/null; exit 7';
console.log("returned: " + execInto("/bin/sh", ["sh", "-c", script], { ...process.env, CARRIED: "yes" }));
`,
    );
    const r = Bun.spawnSync([process.execPath, helper], { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    const out = r.stdout.toString();
    const before = /^before (\d+)$/m.exec(out)?.[1];
    expect(before).toBeDefined();
    expect(out).toContain(`after ${before}`);
    expect(out).not.toContain("returned:");
    expect(r.exitCode).toBe(7);
    if (process.platform === "linux") expect(out).not.toContain("/dev/urandom");
  });

  test("the hand-over: the upgrade, its outcome in the note, then the next one — waited for where execve can't be", async () => {
    const dir = mkdtempSync(join(sandbox, "hand-"));
    const said: string[] = [];
    const launched: boolean[] = [];
    const launch =
      (code: number) =>
      (failed: boolean): Launch => {
        launched.push(failed);
        return { file: "/bin/sh", argv: ["sh", "-c", `exit ${code}`] };
      };
    const refused = () => "refused";
    const base = { env: process.env, say: (l: string) => said.push(l), dir, exec: refused };
    // Upgraded, then started and waited for: its exit code.
    const upgraded = note({ upgrade: "2.0.0" });
    const code = await handOver({
      ...base,
      note: upgraded,
      upgrade: async () => "slipbox 1.0.0 → 2.0.0; 1.0.0 is kept, to go back to",
      launch: launch(3),
    });
    expect(code).toBe(3);
    expect(launched).toEqual([false]);
    expect(said).toEqual([
      "slipbox: upgrading to 2.0.0… (ctrl+c cancels)",
      "slipbox: slipbox 1.0.0 → 2.0.0; 1.0.0 is kept, to go back to",
    ]);
    expect(takeNote({ pid: 4242, ppid: 1, dir })?.outcome).toEqual({
      ok: true,
      said: "slipbox 1.0.0 → 2.0.0; 1.0.0 is kept, to go back to",
    });
    // Failed: said, the note says why, and the one that ran is started.
    said.length = 0;
    await handOver({
      ...base,
      note: note({ upgrade: "2.0.0" }),
      upgrade: async () => {
        throw new Error("couldn't download it");
      },
      launch: launch(0),
    });
    expect(launched).toEqual([false, true]);
    expect(said[1]).toBe("slipbox: the upgrade to 2.0.0 failed: couldn't download it — starting slipbox again");
    expect(takeNote({ pid: 4242, ppid: 1, dir })?.outcome).toEqual({ ok: false, why: "couldn't download it" });
    // ctrl+c cancels the upgrade: the signal reaches it, and slipbox starts again.
    let ctrlC = () => {};
    let listening = false;
    const cancelled = handOver({
      ...base,
      note: note({ upgrade: "2.0.0" }),
      upgrade: (signal) =>
        new Promise((_, reject) => signal.addEventListener("abort", () => reject(new UpgradeCancelled()))),
      launch: launch(0),
      onCancel: (cancel) => {
        ctrlC = cancel;
        listening = true;
        return () => {
          listening = false;
        };
      },
    });
    expect(listening).toBe(true);
    ctrlC();
    expect(await cancelled).toBe(0);
    expect(listening).toBe(false);
    expect(takeNote({ pid: 4242, ppid: 1, dir })?.outcome).toEqual({ ok: false, why: "cancelled" });
    // Nothing to start: said, exit 1.
    said.length = 0;
    const none = await handOver({
      ...base,
      note: note(),
      upgrade: null,
      launch: () => ({ file: join(dir, "gone"), argv: ["slipbox"] }),
    });
    expect(none).toBe(1);
    expect(said[0]).toStartWith(`slipbox: couldn't start ${join(dir, "gone")}`);
    expect(said[1]).toBe("slipbox: nothing started (refused)");
  });
});
