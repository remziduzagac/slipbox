// slipbox as a client of language servers (plan 19.x): a server started, told about a file, its
// diagnostics heard — sent or asked for — its settings answered, stopped, and a crash noticed. A fake
// server (tests/fixtures/fake-lsp.ts) stands in for a real one.

import { afterAll, afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Diagnostic } from "vscode-languageserver-protocol";
import { loadConfig } from "../src/core/config.ts";
import { LanguageClient, type ServerSpec, settingAt } from "../src/core/servers/client.ts";
import { chooseServers, findServer, ownInstall, rootFor, toolsDir } from "../src/core/servers/find.ts";
import {
  INSTALL_ARGS,
  installTool,
  lockKey,
  type NpmSpec,
  toolFolder,
  toolManifest,
  toolSlug,
} from "../src/core/servers/install.ts";
import { LOCKS } from "../src/core/servers/locks.ts";
import { lintCommand, MARKDOWNLINT } from "../src/core/lint.ts";
import { pinned } from "../scripts/lock-servers.ts";
import {
  languageOf,
  projectAsks,
  SERVERS,
  type ServerDef,
  serverTable,
  type ServerTable,
} from "../src/core/servers/languages.ts";
import {
  commandFor,
  compileFormat,
  type Format,
  type LinterConfig,
  linterRoot,
  LINTERS,
  linterTable,
  parseFindings,
  projectPath,
  runLinter,
} from "../src/core/servers/linters.ts";
import { doctor, doctorFile } from "../src/core/servers/doctor.ts";
import { ServerManager, startOf } from "../src/core/servers/manager.ts";
import { vscodeSettings } from "../src/core/servers/vscode.ts";
import type { Problem } from "../src/core/diagnostics.ts";
import { setTrust, setTrustedRoots } from "../src/core/trust.ts";

setDefaultTimeout(30_000);
const FAKE = join(import.meta.dir, "fixtures", "fake-lsp.ts");
const sandbox = mkdtempSync(join(tmpdir(), "slipbox-servers-"));
process.env.XDG_DATA_HOME = join(sandbox, "data"); // slipbox's installs, and Mason's, are the sandbox's
// Isolation (testing.md): never the real config, cache or state — the roots trusted here (trust.json) were the
// developer's own, and runs at once wrote over each other's.
process.env.XDG_STATE_HOME = join(sandbox, "state");
process.env.XDG_CACHE_HOME = join(sandbox, "cache");
process.env.XDG_CONFIG_HOME = join(sandbox, "config");
delete process.env.SLIPBOX_CONFIG;
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

/** A lock for a package on disk (`file:`), made by Bun as scripts/lock-servers.ts makes them — no network. */
function lockFor(npm: NpmSpec): string {
  const d = mkdtempSync(join(sandbox, "lock-"));
  writeFileSync(join(d, "package.json"), toolManifest(npm));
  const r = Bun.spawnSync([process.execPath, "install", "--lockfile-only", "--ignore-scripts"], {
    cwd: d,
    env: { ...process.env, BUN_BE_BUN: "1" },
  });
  if (r.exitCode !== 0) throw new Error(r.stderr.toString());
  // A `file:` package is kept by its path from the lock's folder: made absolute, as the lock is installed elsewhere.
  // (A registry package, as slipbox's pins are, has no path.)
  return readFileSync(join(d, "bun.lock"), "utf8").replace(
    /@file:([^"/][^"]*)"/g,
    (_, rel: string) => `@file:${resolve(d, rel)}"`,
  );
}

/** A package of a server, as a folder (`file:` installs it with no network): its version, a postinstall that marks. */
function serverPackage(name: string, version: string, body = "console.log('ok')"): string {
  const d = mkdtempSync(join(sandbox, `pkg-${name}-`));
  writeFileSync(
    join(d, "package.json"),
    JSON.stringify({ name, version, bin: { [name]: "bin.js" }, scripts: { postinstall: "touch POSTINSTALL_RAN" } }),
  );
  writeFileSync(join(d, "bin.js"), `#!/usr/bin/env node\n${body}\n`);
  return d;
}
// A root is trusted only where a test says so (23.x): none by default, as in use.
afterEach(() => setTrustedRoots([]));

const until = async (ok: () => boolean, ms = 25_000) => {
  for (const t = Date.now(); !ok() && Date.now() - t < ms; ) await Bun.sleep(20);
  return ok();
};

/**
 * Waiting on what a server says, not on a clock: `when(ok)` settles as soon as `ok` holds, checked each time `heard()`
 * says something came in — however long that takes on a loaded machine (the test's own timeout is the only limit).
 */
function events() {
  const waiting: { ok: () => boolean; go: () => void }[] = [];
  return {
    heard(): void {
      for (const w of [...waiting])
        if (w.ok()) {
          waiting.splice(waiting.indexOf(w), 1);
          w.go();
        }
    },
    when(ok: () => boolean): Promise<void> {
      return ok() ? Promise.resolve() : new Promise((go) => waiting.push({ ok, go }));
    },
  };
}

/** The fake server as a client starts it, and what it hears. */
function fake(opts: { pull?: boolean; settings?: Record<string, unknown>; timeoutMs?: number } = {}) {
  const heard = new Map<string, { diagnostics: Diagnostic[]; version: number | null }>();
  const logs: string[] = [];
  const notices: string[] = [];
  const exits: { expected: boolean; why: string; byClient?: boolean }[] = [];
  const e = events();
  const spec: ServerSpec = {
    name: "fake",
    argv: ["bun", FAKE, "--stdio"],
    env: opts.pull ? { FAKE_PULL: "1" } : {},
    settings: opts.settings,
    root: sandbox,
    timeoutMs: opts.timeoutMs,
  };
  const client = new LanguageClient(spec, {
    diagnostics: (uri, diagnostics, version) => (heard.set(uri, { diagnostics, version }), e.heard()),
    log: (m) => (logs.push(m), e.heard()),
    notice: (m) => (notices.push(m), e.heard()),
    exited: (expected, why, byClient) => (exits.push({ expected, why, byClient }), e.heard()),
  });
  return { client, heard, logs, notices, exits, when: e.when };
}

const uri = pathToFileURL(join(sandbox, "a.ts")).href;

describe("the client's limits (19.1): they keep a broken server from costing slipbox, never stop a working one", () => {
  const hover = (f: ReturnType<typeof fake>, line: number, at = uri) =>
    f.client.request<{ contents: { value: string } }>("textDocument/hover", {
      textDocument: { uri: at },
      position: { line, character: 0 },
    });
  const pulls = (f: ReturnType<typeof fake>) => f.client.request<number>("fake/pullCount", {});
  /** Until `ok` holds, asked again and again (what the server counts): false when it never does in `ms`. */
  const eventually = async (ok: () => Promise<boolean>, ms = 25_000) => {
    for (const t = Date.now(); Date.now() - t < ms; await Bun.sleep(20)) if (await ok()) return true;
    return false;
  };

  test.skipIf(process.platform === "win32")(
    "initialize timeout disposes a helper that ignores graceful termination",
    async () => {
      const pidFile = join(sandbox, `starting-server-${Date.now()}.pid`);
      const program =
        'process.on("SIGTERM", () => {}); require("node:fs").writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000);';
      const client = new LanguageClient({
        name: "unready",
        argv: [process.execPath, "-e", program, pidFile],
        root: sandbox,
      });
      let pid = 0;
      try {
        const failed = client.start(2000).catch((error) => error.message);
        expect(await until(() => existsSync(pidFile))).toBe(true);
        pid = Number(readFileSync(pidFile, "utf8"));
        expect(await failed).toContain("initialize");
        const alive = () => {
          try {
            process.kill(pid, 0);
            return true;
          } catch {
            return false;
          }
        };
        expect(await until(() => !alive())).toBe(true);
        expect(client.state).toBe("failed");
      } finally {
        if (pid) {
          try {
            process.kill(pid, "SIGKILL");
          } catch {}
        }
        client.kill();
      }
    },
  );

  test("given up on — the caller's signal, the deadline — a request is cancelled alone: the server runs on", async () => {
    const f = fake({ timeoutMs: 300 });
    await f.client.start();
    try {
      const cancelled = new AbortController();
      const request = f.client.request("fake/awaitCancellation", {}, { signal: cancelled.signal });
      cancelled.abort();
      expect(await Promise.race([request, Bun.sleep(300).then(() => "not cancelled")])).toBeNull();
      // Answered at 800 ms, past its 300: null, said once; the server told, still running, answering the next.
      await f.client.didOpen(uri, "typescript", 1, "LATEHOVER here\nsecond\n");
      expect(await hover(f, 0)).toBeNull();
      expect(f.notices).toEqual(["fake: no answer to textDocument/hover in 0.3 s: it was cancelled"]);
      expect((await hover(f, 1))?.contents.value).toBe("line 1: second");
      expect(await f.client.request("fake/awaitCancellation", {})).toBeNull();
      expect(await f.client.request<number>("fake/cancellations", {})).toBe(2); // `$/cancelRequest`, both times
      expect(f.client.state).toBe("running");
      expect(f.exits).toEqual([]);
    } finally {
      await f.client.stop();
    }
  });

  test("past its deadline while a change is still being written: no error, the server runs on and gets it", async () => {
    const f = fake();
    await f.client.start();
    try {
      await f.client.didOpen(uri, "typescript", 1, "x\n");
      await f.client.request("fake/stall", { ms: 1000, after: "resume" }); // it reads nothing for a second
      // Not waited on, as the manager sends it: a rejection here would end slipbox (an unhandled one).
      void f.client.didChange(uri, 2, `${"y".repeat(4_000_000)}\nsecond\n`);
      expect(await f.client.request("fake/awaitCancellation", {}, { timeoutMs: 300 })).toBeNull();
      expect(f.client.state).toBe("running");
      expect((await hover(f, 1))?.contents.value).toBe("line 1: second"); // the change arrived
      expect(f.exits).toEqual([]);
    } finally {
      await f.client.stop();
    }
  });

  test("past 64 unanswered, requests wait their turn; a cancelled one never answered stops counting", async () => {
    const f = fake();
    await f.client.start();
    try {
      await f.client.didOpen(uri, "typescript", 1, "DROP here\n");
      // Each hover supersedes the one before: cancelled, and this server never answers a cancelled one (DROP).
      const asked = Array.from({ length: 70 }, () => hover(f, 0));
      const answers = await Promise.all(asked);
      expect(answers.slice(0, -1).every((a) => a === null)).toBe(true);
      expect(answers.at(-1)?.contents.value).toBe("line 0: DROP here"); // its turn came, after the grace period
      expect(f.notices).toContain("fake: 64 requests unanswered: the next ones wait their turn");
      expect(f.client.state).toBe("running");
      expect(f.exits).toEqual([]);
    } finally {
      await f.client.stop();
    }
  });

  test("a refresh with 70 files open: each asked again, a few at a time — the server runs on", async () => {
    const f = fake({ pull: true });
    await f.client.start();
    const files = Array.from({ length: 70 }, (_, i) => pathToFileURL(join(sandbox, `many-${i}.ts`)).href);
    try {
      for (const file of files) {
        await f.client.didOpen(file, "typescript", 1, "ok\n");
        await f.when(() => f.heard.has(file)); // answered: none on its way when the refresh comes
      }
      await f.client.didChange(files[0]!, 2, "REFRESH\n"); // it asks for a refresh 300 ms later
      const refreshed = () => f.heard.get(files[0]!)?.diagnostics.some((d) => d.message === "after a refresh");
      await f.when(() => f.exits.length > 0 || refreshed() === true);
      expect(f.exits).toEqual([]);
      expect(await eventually(async () => ((await pulls(f)) ?? 0) >= 70 + 1 + 70)).toBe(true); // all asked again
      expect(f.client.state).toBe("running");
      expect(f.notices).toEqual([]); // a few at a time: none waited for the 64 unanswered to go down
    } finally {
      await f.client.stop();
    }
  });

  // The server's state changed, not the text: a pull already on its way answers for the state before. Its HELD answers
  // (given on fake/release) are computed when asked, so the first is the old state's.
  for (const [what, text, why, act] of [
    ["its work done ($/progress end)", "LOADING HELD BAD\n", "bad, with null", () => {}],
    ["its refresh", "REFRESH HELD\n", "after a refresh", () => {}],
    ["a save", "ONSAVE HELD\n", "after a save", (f: ReturnType<typeof fake>) => f.client.didSave(uri)],
  ] as const)
    test(`a pull on its way for the same text is asked again after ${what}: the newest state's answer stands`, async () => {
      const f = fake({ pull: true });
      await f.client.start();
      try {
        await f.client.didOpen(uri, "typescript", 1, text);
        await eventually(async () => (await pulls(f)) === 1);
        await act(f);
        expect(await eventually(async () => (await pulls(f)) === 2, 5000)).toBe(true);
        await f.client.request("fake/release", {});
        await f.when(() => f.heard.get(uri)?.diagnostics.some((d) => d.message.toString().startsWith(why)) === true);
        await f.client.request("fake/release", {}); // anything still held, then nothing newer comes
        expect(f.heard.get(uri)?.diagnostics.some((d) => d.message.toString().startsWith(why))).toBe(true);
      } finally {
        await f.client.stop();
      }
    });

  test("an answer's malformed diagnostics are left out and said once; markup messages and the rest kept", async () => {
    const f = fake();
    await f.client.start();
    const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } };
    try {
      await f.client.request("fake/publish", {
        uri,
        diagnostics: [
          { range, message: "plain" },
          { message: "no range" },
          { range, message: { kind: "markdown", value: "**markup**" } },
          { range },
        ],
      });
      expect(f.heard.get(uri)?.diagnostics.map((d) => d.message)).toEqual([
        "plain",
        { kind: "markdown", value: "**markup**" },
      ]);
      await f.client.request("fake/publish", { uri, diagnostics: [{ range: { start: 1 }, message: "bad range" }] });
      expect(f.heard.get(uri)?.diagnostics).toEqual([]);
      await f.client.request("fake/publish", {
        uri: `${uri}.many`,
        diagnostics: Array(10_001).fill({ range, message: "x" }),
      });
      expect(f.heard.get(`${uri}.many`)?.diagnostics).toHaveLength(10_000);
      expect(f.notices).toEqual([
        `fake: left out diagnostics it sent malformed (${uri})`,
        `fake: kept the first 10000 of 10001 diagnostics for ${uri}.many (the count slipbox keeps)`,
      ]);
      expect(f.client.state).toBe("running");
    } finally {
      await f.client.stop();
    }
  });

  test("what it sends can't be read: stopped, said as a protocol error — a change being written settles quietly", async () => {
    const f = fake();
    await f.client.start();
    try {
      await f.client.didOpen(uri, "typescript", 1, "x\n");
      await f.client.request("fake/stall", { ms: 300, after: "junk" });
      // Still being written (it reads nothing) when the client stops it.
      await f.client.didChange(uri, 2, "y".repeat(8_000_000));
      await f.when(() => f.exits.length > 0);
      expect(f.client.state).toBe("stopped");
      expect(f.exits).toEqual([
        { expected: false, why: "protocol error (server response message limit exceeded)", byClient: true },
      ]);
    } finally {
      f.client.kill();
    }
  });

  test("its output cut off mid-message as it exits: a crash, said with its exit code, not a protocol error", async () => {
    const f = fake();
    await f.client.start();
    await f.client.request("fake/stall", { ms: 50, after: "partial" });
    await f.when(() => f.exits.length > 0);
    expect(f.exits).toEqual([{ expected: false, why: "it exited (code 9)", byClient: undefined }]);
  });

  test("stopped for a protocol error, it doesn't wait for a helper holding its pipes", async () => {
    const f = fake();
    await f.client.start();
    const helper = await f.client.request<number>("fake/holdPipes", {});
    try {
      await f.client.request("fake/stall", { ms: 50, after: "junk" });
      await f.when(() => f.exits.length > 0);
      expect(f.client.state).toBe("stopped");
    } finally {
      if (helper)
        try {
          process.kill(helper, "SIGKILL");
        } catch {}
      f.client.kill();
    }
  });

  test("pulls coalesce for the same text; a newer hover supersedes an older one", async () => {
    const f = fake({ pull: true });
    await f.client.start();
    try {
      await f.client.didOpen(uri, "typescript", 1, "HELD BAD\nsecond\n");
      const asked = Array.from({ length: 20 }, () => f.client.pull(uri));
      expect(await pulls(f)).toBe(1);
      await f.client.request("fake/release", {});
      await Promise.all(asked);
      const older = hover(f, 0);
      const newer = hover(f, 1);
      expect(await older).toBeNull();
      expect(await newer).toHaveProperty("contents");
    } finally {
      await f.client.stop();
    }
  });

  test("a large answer is kept whole", async () => {
    const f = fake();
    await f.client.start();
    try {
      expect(await f.client.request<unknown[]>("fake/bulk", {})).toHaveLength(5000);
    } finally {
      await f.client.stop();
    }
  });

  test("a closed file's diagnostics are dropped, another file's kept; an older text's are ignored", async () => {
    const f = fake();
    const other = `${uri}.workspace`;
    await f.client.start();
    try {
      await f.client.request("fake/publish", { uri: other, version: 1, diagnostics: [] });
      expect(f.heard.has(other)).toBe(true);
      await f.client.didOpen(uri, "typescript", 4, "ok");
      await f.client.request("fake/publish", { uri, version: 3, diagnostics: [] });
      expect(f.heard.get(uri)?.version).not.toBe(3);
      await f.client.didClose(uri);
      f.heard.delete(uri);
      await f.client.request("fake/publish", { uri, version: 4, diagnostics: [] });
      expect(f.heard.has(uri)).toBe(false);
    } finally {
      await f.client.stop();
    }
  });
});

describe("the client (19.1)", () => {
  test("started in the project's folder, a file opened and changed: the diagnostics it sends, with the settings it asked for", async () => {
    const f = fake({ settings: { fake: { level: 2 } } });
    await f.client.start();
    expect(f.client.state).toBe("running");
    expect(f.client.serverInfo?.name).toBe(`fake (root ${pathToFileURL(sandbox).href})`);
    await f.client.didOpen(uri, "typescript", 1, "fine\nBAD here\n");
    expect(await until(() => f.heard.get(uri)?.diagnostics.length === 1)).toBe(true);
    const d = f.heard.get(uri)!.diagnostics[0]!;
    expect(d.range).toEqual({ start: { line: 1, character: 0 }, end: { line: 1, character: 3 } });
    await f.client.didChange(uri, 2, "fine\nfine\nBAD BAD\n");
    expect(await until(() => f.heard.get(uri)?.version === 2)).toBe(true);
    expect(f.heard.get(uri)!.diagnostics[0]!.message).toBe('bad, with {"level":2}'); // its section of the settings
    const hover = await f.client.request<{ contents: { value: string } }>("textDocument/hover", {
      textDocument: { uri },
      position: { line: 2, character: 0 },
    });
    expect(hover!.contents.value).toBe("line 2: BAD BAD");
    await f.client.stop();
    expect(f.client.state).toBe("stopped");
    expect(f.exits).toEqual([{ expected: true, why: "stopped" }]);
  });

  test("a server that waits to be asked, its first answer empty while it loads: asked again once it says its work is done", async () => {
    const f = fake({ pull: true });
    await f.client.start();
    // As rust-analyzer without cargo check: nothing until its workspace loads, then no refresh asked — a `$/progress` end.
    await f.client.didOpen(uri, "typescript", 1, "WORKING\nBAD here\n");
    await f.when(() => f.heard.get(uri)?.diagnostics.length === 0); // asked at once: nothing yet
    await f.client.request("fake/release", {}); // its work done, said, and nothing more
    await f.when(() => f.heard.get(uri)?.diagnostics.length === 1);
    expect(f.heard.get(uri)!.version).toBe(1);
    await f.client.stop();
  });

  test("a server that waits to be asked (3.17): its diagnostics asked for on open, change and save", async () => {
    const f = fake({ pull: true });
    await f.client.start();
    expect(f.client.pullsDiagnostics).toBe(true);
    await f.client.didOpen(uri, "typescript", 1, "BAD\n");
    await f.when(() => f.heard.get(uri)?.diagnostics.length === 1);
    await f.client.didChange(uri, 2, "fine\n");
    await f.when(() => f.heard.get(uri)?.version === 2 && f.heard.get(uri)!.diagnostics.length === 0);
    // Asked to ask again (pyright does), it asks again — the server, answered, lives on.
    await f.client.didChange(uri, 3, "REFRESH BAD\n");
    await f.when(() => f.heard.get(uri)?.version === 3 && f.heard.get(uri)!.diagnostics.length === 2); // asked again
    // A method slipbox doesn't know: answered, not refused — the server, which dies of a refusal, answers after it.
    await f.client.didChange(uri, 4, "ASK\n");
    await f.when(() => f.logs.some((l) => l.includes("asked custom/ask")));
    const after = await f.client.request("textDocument/hover", {
      textDocument: { uri },
      position: { line: 0, character: 0 },
    });
    expect([after, f.client.state]).toEqual([{ contents: { kind: "markdown", value: "line 0: ASK" } }, "running"]);
    // An answer about an older text, arriving after the newer one's, is dropped: the older one's held until the newer
    // one's is in, then given.
    await f.client.didChange(uri, 5, "HELD BAD\n");
    await f.client.didChange(uri, 6, "fine\n");
    await f.when(() => f.heard.get(uri)?.version === 6);
    await f.client.request("fake/release", {});
    expect(f.heard.get(uri)).toEqual({ diagnostics: [], version: 6 });
    await f.client.stop();
  });

  test("a crash is noticed, with what it said last; a server that can't start says why", async () => {
    const f = fake();
    await f.client.start();
    await f.client.didOpen(uri, "typescript", 1, "CRASH\n");
    expect(await until(() => f.exits.length === 1)).toBe(true);
    expect(f.exits[0]).toEqual({ expected: false, why: "it exited (code 3)" });
    expect(f.client.state).toBe("stopped");
    const missing = new LanguageClient({ name: "nowhere", argv: ["slipbox-no-such-server"], root: sandbox });
    expect(missing.start()).rejects.toThrow("nowhere can't start");
    const quick = new LanguageClient({
      name: "quick",
      argv: ["sh", "-c", "echo 'no such option' >&2; exit 2"],
      root: sandbox,
    });
    expect(quick.start()).rejects.toThrow("quick exited before it was ready (code 2): no such option");
  });

  test("a server that exits before it is ready: start() rejects, and the exit isn't reported as a crash", async () => {
    const exits: boolean[] = [];
    const quick = new LanguageClient(
      { name: "quick", argv: ["sh", "-c", "exit 2"], root: sandbox },
      { exited: (expected) => exits.push(expected) },
    );
    await expect(quick.start()).rejects.toThrow("quick exited before it was ready (code 2)");
    await Bun.sleep(100);
    expect(exits).toEqual([]);
    expect(quick.state).toBe("failed");
  });

  test("settings looked up by section", () => {
    const s = { python: { analysis: { typeCheckingMode: "strict" } }, css: { validate: true } };
    expect(settingAt(s, "python.analysis")).toEqual({ typeCheckingMode: "strict" });
    expect(settingAt(s, "css")).toEqual({ validate: true });
    expect(settingAt(s, "html")).toBeNull();
    expect(settingAt(s, undefined)).toEqual(s);
  });
});

describe("the client (19.1): what a server says and asks besides diagnostics", () => {
  test("its log and shown messages reach the log; a save sends the text when it asked for it; a closed file's save isn't sent", async () => {
    const f = fake();
    await f.client.start();
    await f.client.didOpen(uri, "typescript", 1, "SAVED\n");
    await f.client.didSave(uri, "SAVED on disk\n");
    await f.client.didSave(uri);
    await f.client.didChange(uri, 2, "SAVED SHOW\n");
    expect(await until(() => f.logs.some((l) => l.startsWith("fake: shown")))).toBe(true);
    await f.client.didClose(uri);
    await f.client.didSave(uri, "after close");
    await f.client.didOpen(uri, "typescript", 3, "SAVED\n");
    await f.client.didSave(uri, "last");
    expect(await until(() => f.logs.some((l) => l.includes('"last"')))).toBe(true);
    expect(f.logs.filter((l) => l.startsWith("fake: saved") || l.startsWith("fake: shown"))).toEqual([
      `fake: saved ${uri} with "SAVED on disk\\n"`,
      `fake: saved ${uri}, no text`,
      `fake: shown for ${uri}`,
      `fake: saved ${uri} with "last"`,
    ]);
    await f.client.stop();
  });

  test("a server that registers diagnostics later is asked for them from then on, and no longer once it unregisters", async () => {
    const f = fake();
    await f.client.start();
    expect(f.client.pullsDiagnostics).toBe(false);
    await f.client.didOpen(uri, "typescript", 1, "REGISTER\n");
    expect(await until(() => f.client.pullsDiagnostics)).toBe(true);
    await f.client.didChange(uri, 2, "UNREGISTER\n");
    expect(await until(() => !f.client.pullsDiagnostics)).toBe(true);
    await f.client.stop();
  });

  test("killed (slipbox exiting): it goes at once, an expected end, not a crash; killing or stopping it again does nothing", async () => {
    const f = fake();
    f.client.kill(); // never started: nothing to kill
    expect(f.client.state).not.toBe("stopping");
    await f.client.start();
    await f.client.didOpen(uri, "typescript", 1, "fine\n");
    f.client.kill();
    expect(f.client.state).toBe("stopping");
    expect(await until(() => f.exits.length === 1)).toBe(true);
    expect(f.exits).toEqual([{ expected: true, why: "stopped" }]);
    expect(f.client.state).toBe("stopped");
    expect(f.client.isOpen(uri)).toBe(false);
    f.client.kill();
    await f.client.stop();
    expect(f.client.state).toBe("stopped");
    expect(f.exits.length).toBe(1);
    expect(
      await f.client.request("textDocument/hover", { textDocument: { uri }, position: { line: 0, character: 0 } }),
    ).toBeNull();
  });
});

describe("which servers, where (19.2–19.5)", () => {
  const dir = (name: string, files: Record<string, string>) => {
    const root = join(sandbox, name);
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(root, rel, ".."), { recursive: true });
      writeFileSync(join(root, rel), text);
    }
    return root;
  };
  const exe = (path: string, text: string) => {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, text);
    chmodSync(path, 0o755);
  };

  test("a file's language by its name or extension; the user's config over the built-in table, Helix's shape", () => {
    const t = serverTable();
    expect(languageOf(t, "/p/a.ts")!.languageId).toBe("typescript");
    expect(languageOf(t, "/p/a.tsx")!.languageId).toBe("typescriptreact");
    expect(languageOf(t, "/p/Dockerfile")!.name).toBe("dockerfile");
    expect(languageOf(t, "/p/README")).toBeNull();
    const mine = serverTable(
      {
        pyright: { config: { python: { analysis: { typeCheckingMode: "strict" } } } },
        mylsp: { command: "/opt/mylsp", args: ["--stdio"] },
      },
      [
        { name: "python", "language-servers": ["basedpyright", "ruff"] },
        { name: "nix", "file-types": ["nix"], "language-servers": ["mylsp"] },
      ],
    );
    expect(mine.servers.pyright!.config).toEqual({
      python: {
        analysis: {
          autoSearchPaths: true,
          useLibraryCodeForTypes: true,
          diagnosticMode: "openFilesOnly",
          typeCheckingMode: "strict",
        },
      },
    });
    expect(mine.servers.mylsp).toMatchObject({ command: "/opt/mylsp", args: ["--stdio"] });
    expect(languageOf(mine, "/p/a.py")!.servers).toEqual(["basedpyright", "ruff"]);
    expect(languageOf(mine, "/p/flake.nix")!.servers).toEqual(["mylsp"]);
    // A command of the user's own is never slipbox's install.
    expect(serverTable({ pyright: { command: "/opt/pyright-langserver" } }).servers.pyright!.npm).toBeUndefined();
  });

  test("a vault's config tunes known servers' settings, never names a program", () => {
    const root = dir("cfg", {
      "user.toml":
        '[language-server.mylsp]\ncommand = "/opt/mylsp"\n\n[[language]]\nname = "python"\nlanguage-servers = ["pyright"]\n',
      "vault.toml":
        '[language-server.pyright]\ncommand = "/tmp/evil"\nconfig = { python = { analysis = { typeCheckingMode = "strict" } } }\n\n[language-server.evil]\nconfig = {}\n',
    });
    const { config, warnings } = loadConfig({
      configFile: join(root, "user.toml"),
      vaultFile: join(root, "vault.toml"),
    });
    expect(config["language-server"]).toEqual({
      mylsp: { command: "/opt/mylsp" },
      pyright: { config: { python: { analysis: { typeCheckingMode: "strict" } } } },
    });
    expect(config.language).toEqual([{ name: "python", "language-servers": ["pyright"] }]);
    expect(
      warnings.some((w) => w.includes("sets language-server.pyright.command, which only your own config may set")),
    ).toBe(true);
    expect(warnings.some((w) => w.includes("adds the language server evil, which only your own config may"))).toBe(
      true,
    );
  });

  test("a folder's server config merges over yours all the way down: your nested settings stay", () => {
    const root = dir("cfgdeep", {
      "user.toml": '[language-server.pyright]\nconfig = { python = { analysis = { extraPaths = ["src"] } } }\n',
      "vault.toml":
        '[language-server.pyright]\nconfig = { python = { analysis = { diagnosticMode = "workspace" } } }\n',
    });
    const { config, warnings } = loadConfig({
      configFile: join(root, "user.toml"),
      vaultFile: join(root, "vault.toml"),
    });
    expect(config["language-server"].pyright!.config).toEqual({
      python: { analysis: { extraPaths: ["src"], diagnosticMode: "workspace" } },
    });
    expect(warnings).toEqual([]);
  });

  test("a server's, a language's or a linter's field of the wrong type is a warning, never a crash", () => {
    const root = dir("cfgtypes", {
      "user.toml": [
        "[language-server.mylsp]",
        'command = "mylsp"',
        'args = "--stdio"',
        "environment = { DEBUG = 1 }",
        "",
        "[[language]]",
        'name = "python"',
        'language-servers = "pyright"',
        'roots = "x"',
        'file-types = "py"',
        'linters = "mypy"',
        "language-id = 3",
        "",
        "[[language]]",
        'name = "go"',
        'language-servers = [{ name = "gopls", only-features = "diagnostics" }]',
        "",
        "[linter.mine]",
        'lint-command = "mine -"',
        'lint-formats = "%f:%l: %m"',
        'root-markers = "mine.toml"',
        'lint-stdin = "no"',
        "lint-severity = 9",
        "",
      ].join("\n"),
    });
    const { config, warnings } = loadConfig({ configFile: join(root, "user.toml") });
    const w = warnings.join("\n");
    for (const field of [
      "language-server.mylsp.args",
      "language-server.mylsp.environment",
      "language.python.language-servers",
      "language.python.roots",
      "language.python.file-types",
      "language.python.linters",
      "language.python.language-id",
      "language.go.language-servers",
      "linter.mine.lint-formats",
      "linter.mine.root-markers",
      "linter.mine.lint-stdin",
      "linter.mine.lint-severity",
    ])
      expect(w).toContain(`${field} must be`);
    // The rest of each entry stays.
    expect(config["language-server"].mylsp).toEqual({ command: "mylsp" });
    expect(config.language).toEqual([{ name: "python" }, { name: "go" }]);
    expect(config.linter.mine).toEqual({ "lint-command": "mine -" });
    const t = serverTable(config["language-server"], config.language);
    expect(languageOf(t, "a.py")!.servers).toEqual(["pyright", "ruff"]);
    expect(t.servers.mylsp!.args).toEqual([]);
  });

  // typos: off — `comand`, a field misspelt on purpose.
  test("a known field spelled with underscores is a warning; a Helix field slipbox doesn't read is kept, unsaid", () => {
    const root = dir("cfgspell", {
      "user.toml": [
        "[language-server.pyright]",
        'comand = "/opt/pyright"',
        'required_root_patterns = ["x"]',
        "",
        "[[language]]",
        'name = "python"',
        'file_types = ["py"]',
        'language_servers = ["pyright"]',
        'scope = "source.python"',
        'comment-token = "#"',
        "",
        "[linter.mypy]",
        'lint_command = "mypy"',
        "",
      ].join("\n"),
    });
    const { config, warnings } = loadConfig({ configFile: join(root, "user.toml") });
    expect(warnings.filter((w) => w.includes("is spelled")).map((w) => w.split(": ").at(-1))).toEqual([
      "language-server.pyright.required_root_patterns is spelled required-root-patterns; ignored",
      "language.python.file_types is spelled file-types; ignored",
      "language.python.language_servers is spelled language-servers; ignored",
      "linter.mypy.lint_command is spelled lint-command; ignored",
    ]);
    expect(warnings.join("\n")).not.toContain("scope");
    expect(warnings.join("\n")).not.toContain("comment-token");
    expect(warnings.join("\n")).not.toContain("comand"); // not a known field's underscored spelling: kept
    expect(config.language).toEqual([{ name: "python", scope: "source.python", "comment-token": "#" }] as never);
    expect(config.linter.mypy).toEqual({});
  });
  // typos: on

  test("a server or linter named as Object's own keys (toString, constructor) is an unknown name, never a crash", () => {
    const root = dir("cfgproto", {
      "user.toml": '[language-server.mylsp]\nconstructor = 1\ncommand = "mylsp"\n',
      "vault.toml": '[language-server.constructor]\nconfig = {}\n\n[linter.toString]\nlint-source = "x"\n',
    });
    const { config, warnings } = loadConfig({
      configFile: join(root, "user.toml"),
      vaultFile: join(root, "vault.toml"),
    });
    expect(Object.hasOwn(config["language-server"], "constructor")).toBe(false);
    expect(Object.hasOwn(config.linter, "toString")).toBe(false);
    expect(
      warnings.some((w) => w.includes("adds the language server constructor, which only your own config may")),
    ).toBe(true);
    expect(warnings.some((w) => w.includes("adds the linter toString, which only your own config may"))).toBe(true);
    // In a language's lists, and named in your own config: unknown, or a new one of that name.
    const t = serverTable({ toString: { args: [] } }, [
      { name: "python", "language-servers": ["constructor", "toString"], linters: ["constructor"] },
    ]);
    expect(t.servers.toString).toMatchObject({ name: "toString", command: "toString" });
    expect(linterTable({ toString: {} }).toString).toMatchObject({ name: "toString", command: "" });
    const file = join(dir("proto", { "a.py": "" }), "a.py");
    const f = doctorFile(t, linterTable(), file, false)!;
    expect(f.run).toEqual([]);
    expect(f.missing.map((d) => d.name)).toEqual(["toString"]);
    expect(f.linters).toEqual([]);
    expect(
      doctor(t, linterTable(), join(file, ".."), false)
        .find((g) => g.languages.includes("python"))!
        .servers.map((s) => s.name),
    ).toEqual(["toString"]);
    const m = new ServerManager({ table: () => t, autoInstall: () => false, problems: () => {}, message: () => {} });
    expect(() => m.open(file, 1, "")).not.toThrow();
    void m.stopAll();
  });

  test("a project's root: the first marker's nearest folder, then the next's; never above the home folder", () => {
    const root = dir("mono", {
      ".git/HEAD": "ref: refs/heads/main\n",
      "package.json": "{}",
      "packages/a/tsconfig.json": "{}",
      "packages/a/src/x.ts": "",
      "packages/b/y.ts": "",
    });
    const ts = languageOf(serverTable(), "x.ts")!.roots;
    expect(rootFor(join(root, "packages/a/src/x.ts"), ts)).toBe(join(root, "packages/a"));
    expect(rootFor(join(root, "packages/b/y.ts"), ts)).toBe(root); // no tsconfig: the package.json's
    // An earlier marker further up beats a later one nearer, as nvim's root_markers have it.
    const ordered = dir("ordered", { "tsconfig.json": "{}", "packages/c/package.json": "{}", "packages/c/z.ts": "" });
    expect(rootFor(join(ordered, "packages/c/z.ts"), ts)).toBe(ordered);
    expect(rootFor(join(sandbox, "loose/z.ts"), ["no-such-marker"])).toBe(join(sandbox, "loose"));
  });

  test("a program found in the project first, then PATH, then slipbox's installs; a Node launcher runs on Bun", () => {
    setTrustedRoots([sandbox]); // a root you trust (23.x): the project's own programs and settings count
    const root = dir("found", { ".git/HEAD": "ref: refs/heads/main\n" });
    const def = {
      name: "x",
      command: "slipbox-test-ls",
      args: ["--stdio"],
      npm: { package: "slipbox-test-ls", version: "1.0.0", bin: "slipbox-test-ls" },
    };
    expect(findServer(def, root)).toBeNull();
    LOCKS[lockKey(def.npm)] = "the lock slipbox ships";
    const own = join(toolFolder(def.npm)!, "node_modules/.bin/slipbox-test-ls");
    exe(own, "#!/bin/sh\necho hi\n");
    expect(findServer(def, root)).toMatchObject({ where: "slipbox", argv: [own, "--stdio"] });
    expect(findServer(def, root)!.behind).toBeUndefined();
    exe(join(root, "node_modules/.bin/slipbox-test-ls"), "#!/usr/bin/env node\nconsole.log(1)\n");
    const f = findServer(def, join(root, "sub"))!;
    expect(f.where).toBe("project");
    expect(f.argv).toEqual([
      process.execPath,
      "--config=/dev/null",
      "--no-env-file",
      join(root, "node_modules/.bin/slipbox-test-ls"),
      "--stdio",
    ]);
    expect(f.env).toEqual({ BUN_BE_BUN: "1" });
  });

  test("a Node server run on slipbox's Bun in a repository never runs the repository's bunfig.toml preload, nor reads its .env", () => {
    setTrustedRoots([sandbox]); // a root you trust (23.x): the project's own programs and settings count
    // The root a server starts in is a cloned repository's: its bunfig.toml would have Bun run its own code first.
    const root = dir("hostile-bun", { ".git/HEAD": "ref: refs/heads/main\n", ".env": "SLIPBOX_TEST_DOTENV=read\n" });
    const ran = join(root, "preload-ran");
    writeFileSync(join(root, "evil.ts"), `require("node:fs").writeFileSync(${JSON.stringify(ran)}, "yes");\n`);
    writeFileSync(join(root, "bunfig.toml"), 'preload = ["./evil.ts"]\n');
    exe(
      join(root, "node_modules/.bin/slipbox-test-env"),
      "#!/usr/bin/env node\nconsole.log(process.env.SLIPBOX_TEST_DOTENV ?? 'none')\n",
    );
    const f = findServer({ name: "e", command: "slipbox-test-env", args: [] }, root)!;
    expect(f.where).toBe("project");
    const r = Bun.spawnSync(f.argv, { cwd: root, env: { ...process.env, ...f.env } });
    expect(r.stdout.toString().trim()).toBe("none");
    expect(existsSync(ran)).toBe(false);
  });

  test("a root you don't trust (23.2, 23.4): its own copy of a program never run; servers that would run its code left out, said why", () => {
    const root = dir("untrusted-choice", {
      ".git/HEAD": "ref: refs/heads/main\n",
      "eslint.config.js": "export default [];\n",
      Gemfile: "source 'https://rubygems.org'\n",
      "Package.swift": "// swift-tools-version:5.9\n",
      ".luarc.json": '{ "runtime.plugin": "plugin.lua" }\n',
    });
    exe(join(root, "node_modules/.bin/slipbox-test-own"), "#!/bin/sh\n");
    const own: ServerDef = { name: "own", command: "slipbox-test-own", args: [] };
    expect(findServer(own, root)).toBeNull(); // the project's: its code
    const t = serverTable();
    const skipped = (file: string) => {
      const lang = languageOf(t, join(root, file))!;
      return chooseServers(lang, t.servers, root, (r) => projectAsks(root, r)).skipped.map(
        (k) => `${k.def.name}: ${k.why}`,
      );
    };
    expect(skipped("a.ts")).toEqual(["eslint: its config is code"]);
    expect(skipped("a.rb")).toEqual(["ruby-lsp: it runs the project's Gemfile (Bundler)"]);
    expect(skipped("a.swift")).toEqual(["sourcekit-lsp: it builds the package's manifest, Package.swift"]);
    expect(skipped("a.lua")).toEqual(["lua-language-server: its .luarc names a plugin, which runs as code"]);
    expect(skipped("a.rs")).toEqual([]); // run, without the project's code
    // Trusted: each as it would run anywhere, the project's own copy first.
    setTrustedRoots([root]);
    expect(findServer(own, root)?.where).toBe("project");
    for (const f of ["a.ts", "a.rb", "a.swift", "a.lua"]) expect(skipped(f)).toEqual([]);
  });

  test("the built-in servers' safe modes (23.4): rust-analyzer without build scripts or macros, gopls with no toolchain or cgo, pyright the venv's packages from disk", () => {
    const root = dir("untrusted-modes", { ".venv/lib/python3.12/site-packages/x.py": "" });
    const ra = SERVERS["rust-analyzer"]!.untrusted!;
    expect(ra.settings!(root)).toEqual({
      "rust-analyzer": { cargo: { buildScripts: { enable: false } }, procMacro: { enable: false }, checkOnSave: false },
    });
    expect(ra.initOptions).toEqual({
      cargo: { buildScripts: { enable: false } },
      procMacro: { enable: false },
      checkOnSave: false,
    });
    expect(SERVERS.gopls!.untrusted!.environment).toEqual({ GOTOOLCHAIN: "local", CGO_ENABLED: "0" });
    expect(SERVERS.pyright!.untrusted!.settings!(root)).toEqual({
      python: { analysis: { extraPaths: [join(root, ".venv/lib/python3.12/site-packages")] } },
    });
    expect(SERVERS.vtsls!.untrusted!.settings!(root)).toEqual({ vtsls: { autoUseWorkspaceTsdk: false } });
  });

  test("TypeScript's own server where the project's TypeScript is 7 or none, vtsls for an older one; add-ons where asked", () => {
    setTrustedRoots([sandbox]); // a root you trust (23.x): the project's own programs and settings count
    const t = serverTable();
    const lang = languageOf(t, "a.ts")!;
    const names = (root: string) =>
      chooseServers(lang, t.servers, root, (r) => projectAsks(root, r)).run.map((r) => r.def.name);
    const old = dir("ts5", { "package.json": "{}", "node_modules/typescript/package.json": '{"version": "5.9.2"}' });
    const now = dir("ts7", {
      "package.json": "{}",
      "node_modules/typescript/package.json": '{"version": "7.0.2"}',
      "eslint.config.js": "export default [];",
    });
    expect(names(old)).toEqual(["vtsls"]);
    expect(names(now)).toEqual(["typescript", "eslint"]);
    const py = dir("py", { "pyproject.toml": "[project]\nname='p'\n\n[tool.ruff]\nline-length = 100\n" });
    expect(projectAsks(py, ["ruff.toml", "pyproject.toml:[tool.ruff"])).toBe(true);
    expect(projectAsks(old, ["ruff.toml", "pyproject.toml:[tool.ruff"])).toBe(false);
    // A native server nowhere to be found: missing, never installed.
    const native = { name: "slipbox-no-native", command: "slipbox-no-native", args: [] };
    const c = chooseServers(
      { ...lang, servers: ["slipbox-no-native"] },
      { "slipbox-no-native": native },
      old,
      () => false,
    );
    expect(c).toEqual({ run: [], missing: [native], skipped: [] });
  });

  test("installing (14.11): from the lock slipbox ships, frozen, into a folder of its own; its install script not run", async () => {
    const npm = {
      package: "slipbox-fake-server",
      version: `file:${serverPackage("slipbox-fake-server", "1.2.3")}`,
      bin: "slipbox-fake-server",
    };
    const locks = { [lockKey(npm)]: lockFor(npm) };
    const base = join(sandbox, "tools-test");
    const r = await installTool(npm, { base, locks });
    expect(r.ok).toBe(true);
    const at = toolFolder(npm, base, locks)!;
    expect(at.startsWith(join(base, "slipbox-fake-server") + "/")).toBe(true);
    expect(existsSync(join(at, "node_modules/.bin/slipbox-fake-server"))).toBe(true);
    expect(existsSync(join(at, "node_modules/slipbox-fake-server/POSTINSTALL_RAN"))).toBe(false);
    // Bun skips a local package's scripts by itself; one on its trusted list from npm (Biome) it would run, but for
    // --ignore-scripts — which no install here can show without the network, so it's checked as said.
    expect(INSTALL_ARGS).toEqual(["install", "--frozen-lockfile", "--ignore-scripts"]);
    expect(readFileSync(join(at, "package.json"), "utf8")).toBe(toolManifest(npm));
    expect(readFileSync(join(at, "bun.lock"), "utf8")).toBe(locks[lockKey(npm)]!);
    // Done already: nothing run again.
    expect(await installTool(npm, { base, locks })).toEqual({ ok: true, output: "" });
    // Its pin moved: a folder of the new lock's, the old one removed.
    const next = { ...npm, version: `file:${serverPackage("slipbox-fake-server", "1.3.0")}` };
    const nextLocks = { [lockKey(next)]: lockFor(next) };
    expect((await installTool(next, { base, locks: nextLocks })).ok).toBe(true);
    const nextAt = toolFolder(next, base, nextLocks)!;
    expect(nextAt).not.toBe(at);
    expect(Bun.spawnSync(["ls", "-A", join(base, "slipbox-fake-server")]).stdout.toString()).toBe(
      `${nextAt.split("/").at(-1)}\n`,
    );
  });

  test("installing refuses: a pin slipbox ships no lock for; a lock that isn't the pin's — nothing left behind either way", async () => {
    const npm = {
      package: "slipbox-unlocked",
      version: `file:${serverPackage("slipbox-unlocked", "1.0.0")}`,
      bin: "slipbox-unlocked",
    };
    const base = join(sandbox, "tools-refuse");
    expect(await installTool(npm, { base, locks: {} })).toEqual({
      ok: false,
      output: `slipbox ships no lockfile for ${lockKey(npm)}, so it doesn't install it`,
    });
    expect(existsSync(base)).toBe(false);
    // The lock of another version under this pin's name: Bun's frozen install says no.
    const other = { ...npm, version: `file:${serverPackage("slipbox-unlocked", "2.0.0")}` };
    const wrong = { [lockKey(npm)]: lockFor(other) };
    const r = await installTool(npm, { base, locks: wrong });
    expect(r.ok).toBe(false);
    expect(Bun.spawnSync(["ls", "-A", join(base, "slipbox-unlocked")]).stdout.toString()).toBe("");
  });

  test("slipbox's install found by the lock it ships now; else, behind, the newest under an older one, else the old shared folder", () => {
    const base = join(sandbox, "tools-find");
    const npm = { package: "@scope/slipbox-find", version: "2.0.0", bin: "slipbox-find" };
    LOCKS[lockKey(npm)] = "the lock of 2.0.0";
    const installAt = (folder: string, version: string) => {
      exe(join(folder, "node_modules/.bin/slipbox-find"), "#!/bin/sh\n");
      mkdirSync(join(folder, "node_modules/@scope/slipbox-find"), { recursive: true });
      writeFileSync(join(folder, "node_modules/@scope/slipbox-find/package.json"), JSON.stringify({ version }));
    };
    expect(ownInstall(npm, base)).toBeNull();
    // The folder is the lock's: the same pin with its lock made again (a dependency moved) is another.
    expect(toolFolder(npm, base, { [lockKey(npm)]: "one lock" })).not.toBe(
      toolFolder(npm, base, { [lockKey(npm)]: "another" }),
    );
    // Before 14.11, one shared folder: behind.
    installAt(base, "1.0.0");
    expect(ownInstall(npm, base)).toEqual({
      path: join(base, "node_modules/.bin/slipbox-find"),
      behind: { installed: "1.0.0" },
    });
    // Under older locks: the newest of them first; one still being installed never.
    const parent = join(base, toolSlug(npm.package));
    expect(parent).toBe(join(base, "scope+slipbox-find"));
    installAt(join(parent, "aaaaaaaaaaaa"), "1.1.0");
    Bun.spawnSync(["touch", "-d", "2026-01-01", join(parent, "aaaaaaaaaaaa")]);
    installAt(join(parent, "bbbbbbbbbbbb"), "1.2.0");
    installAt(join(parent, `cccccccccccc.new-${process.pid}`), "9.9.9");
    expect(ownInstall(npm, base)).toEqual({
      path: join(parent, "bbbbbbbbbbbb/node_modules/.bin/slipbox-find"),
      behind: { installed: "1.2.0" },
    });
    // The one the lock it ships now names: current.
    installAt(toolFolder(npm, base)!, "2.0.0");
    expect(ownInstall(npm, base)).toEqual({
      path: join(toolFolder(npm, base)!, "node_modules/.bin/slipbox-find"),
      behind: null,
    });
  });

  test("every package slipbox pins has the lock it ships, made for its manifest; no lock for a pin that's gone", () => {
    const keys = pinned().map(lockKey);
    expect(keys.length).toBeGreaterThan(8);
    expect(
      Object.keys(LOCKS)
        .filter((k) => !k.startsWith("slipbox-") && !k.startsWith("@scope/"))
        .sort(),
    ).toEqual([...keys].sort());
    for (const npm of pinned()) {
      const lock = JSON.parse(LOCKS[lockKey(npm)]!.replace(/,(\s*[}\]])/g, "$1")) as {
        workspaces: Record<string, { dependencies: Record<string, string> }>;
        packages: Record<string, unknown[]>;
      };
      expect(lock.workspaces[""]!.dependencies).toEqual(JSON.parse(toolManifest(npm)).dependencies);
      // Each package in it pinned by its content, not only its version.
      for (const [name, entry] of Object.entries(lock.packages))
        expect([name, String(entry.at(-1)).startsWith("sha512-")]).toEqual([name, true]);
    }
  });
});

describe("the servers of open files (19.1)", () => {
  /** A Node-style launcher for the fake server: slipbox runs it on its own Bun. */
  const launcher = (name: string, env = "") => {
    const p = join(sandbox, "bin", name);
    mkdirSync(join(sandbox, "bin"), { recursive: true });
    writeFileSync(p, `#!/usr/bin/env node\n${env}await import(${JSON.stringify(FAKE)});\n`);
    chmodSync(p, 0o755);
    return p;
  };
  const table = (servers: Record<string, ServerDef>, names = Object.keys(servers)): ServerTable => ({
    servers,
    languages: [{ name: "fake", languageId: "fake", fileTypes: ["fk"], roots: [".git"], servers: names }],
  });
  const managed = (t: ServerTable, autoInstall = false, requestTimeoutMs?: number) => {
    const problems = new Map<string, { version: number | null; list: Problem[] }>();
    const messages: string[] = [];
    const e = events();
    const m = new ServerManager({
      table: () => t,
      autoInstall: () => autoInstall,
      problems: (path, _s, version, list) => (problems.set(path, { version, list }), e.heard()),
      message: (_l, text) => (messages.push(text), e.heard()),
      requestTimeoutMs,
    });
    return { m, problems, messages, when: e.when };
  };
  const project = (name: string) => {
    const root = join(sandbox, name);
    mkdirSync(join(root, ".git"), { recursive: true });
    return root;
  };

  describe("a server's limits as the manager has them: slipbox goes on, the server too, the user told", () => {
    const pulling = (name: string) =>
      table({ fake: { name: "fake", command: launcher(name, 'process.env.FAKE_PULL = "1";\n'), args: ["--stdio"] } });

    test("crashed with 70 files open: started again, each file told again and answered — no burst stops it", async () => {
      const { m, problems, messages, when } = managed(pulling("fake-reopen"));
      const root = project("reopen");
      const files = Array.from({ length: 70 }, (_, i) => join(root, `f${i}.fk`));
      for (const file of files) {
        m.open(file, 1, "ok\n");
        await when(() => problems.has(file));
      }
      m.change(files[0]!, 2, "CRASH\n");
      await when(() => messages.some((x) => x.startsWith("fake crashed")));
      m.change(files[0]!, 3, "ok\n"); // as it is when the new one is told
      problems.clear();
      await when(() => files.every((file) => problems.has(file)));
      expect(m.list()[0]?.state).toBe("running");
      expect(messages.filter((x) => x.startsWith("fake"))).toEqual([
        expect.stringMatching(/^fake crashed \(it exited \(code 3\)\); starting it again$/),
      ]);
      await m.stopAll();
    }, 60_000);

    test("gone while a change is still being written to it: the write's failure is no error of slipbox's", async () => {
      const { m, messages, when } = managed(
        table({ fake: { name: "fake", command: launcher("fake-gone-writing"), args: ["--stdio"] } }),
      );
      const file = join(project("gone-writing"), "a.fk");
      m.open(file, 1, "x\n");
      await m.requestOf(file, "fake", "fake/stall", { ms: 300, after: "exit" }); // it reads nothing, then exits
      m.change(file, 2, "y".repeat(8_000_000));
      await when(() => messages.some((x) => x.startsWith("fake crashed")));
      await m.stopAll();
    });

    test("a request not answered in time (requestTimeoutMs): cancelled and said; the server runs on", async () => {
      const { m, messages } = managed(
        table({ fake: { name: "fake", command: launcher("fake-deadline"), args: ["--stdio"] } }),
        false,
        300,
      );
      const file = join(project("deadline"), "a.fk");
      m.open(file, 1, "x\n");
      expect(await m.requestOf(file, "fake", "fake/awaitCancellation", {})).toBeNull();
      expect(messages).toEqual(["fake: no answer to fake/awaitCancellation in 0.3 s: it was cancelled"]);
      expect(m.list()[0]?.state).toBe("running");
      await m.stopAll();
    });

    test("what it sends can't be read: said as stopped by slipbox for a protocol error, not a crash; started again", async () => {
      const { m, messages, when } = managed(
        table({ fake: { name: "fake", command: launcher("fake-junk"), args: ["--stdio"] } }),
      );
      const file = join(project("junk"), "a.fk");
      m.open(file, 1, "x\n");
      await m.requestOf(file, "fake", "fake/stall", { ms: 50, after: "junk" });
      await when(() => messages.length > 0);
      expect(messages).toEqual([
        "fake was stopped: protocol error (server response message limit exceeded); starting it again",
      ]);
      expect(await until(() => m.list()[0]?.state === "running")).toBe(true);
      await m.stopAll();
    });
  });

  test("one server per project, its files sharing it; their problems as the core's; a request answered", async () => {
    const fakeDef = { name: "fake", command: launcher("fake-ls"), args: ["--stdio"] };
    const { m, problems } = managed(table({ fake: fakeDef }));
    const a = project("pa");
    const b = project("pb");
    m.open(join(a, "one.fk"), 1, "BAD\n");
    m.open(join(a, "two.fk"), 1, "fine\n");
    m.open(join(b, "three.fk"), 1, "x BAD\n");
    expect(
      await until(
        () =>
          problems.get(join(a, "one.fk"))?.list.length === 1 && problems.get(join(b, "three.fk"))?.list.length === 1,
      ),
    ).toBe(true);
    expect(problems.get(join(a, "one.fk"))!.list[0]).toMatchObject({
      start: { line: 1, column: 1 },
      end: { line: 1, column: 4 },
      severity: "warning",
      source: "fake",
    });
    expect(
      m
        .list()
        .map((s) => [s.root, s.files])
        .sort(),
    ).toEqual([
      [a, 2],
      [b, 1],
    ]);
    m.change(join(a, "one.fk"), 2, "fine\nBAD BAD\n");
    expect(await until(() => problems.get(join(a, "one.fk"))?.version === 2)).toBe(true);
    const hover = await m.request<{ contents: { kind: string; value: string } }>(
      join(a, "one.fk"),
      "textDocument/hover",
      { textDocument: { uri: pathToFileURL(join(a, "one.fk")).href }, position: { line: 1, character: 0 } },
      "hoverProvider",
      "hover",
    );
    expect(hover).toEqual({ server: "fake", result: { contents: { kind: "markdown", value: "line 1: BAD BAD" } } });
    await m.stopAll();
    expect(m.list().map((s) => s.state)).toEqual(["stopped", "stopped"]);
  });

  test("a server gets Mason's bin on its PATH, after yours, when it's there and not on it already (D222)", async () => {
    const said = join(sandbox, "server-path.txt");
    const fakeDef = {
      name: "fake",
      command: launcher(
        "fake-path",
        `require("node:fs").writeFileSync(${JSON.stringify(said)}, process.env.PATH ?? "");\n`,
      ),
      args: ["--stdio"],
    };
    /** The PATH the server started with, in a project of its own. */
    const pathOf = async (name: string) => {
      rmSync(said, { force: true });
      const { m } = managed(table({ fake: fakeDef }));
      m.open(join(project(name), "one.fk"), 1, "fine\n");
      expect(await until(() => existsSync(said) && readFileSync(said, "utf8") !== "")).toBe(true);
      await m.stopAll();
      return readFileSync(said, "utf8");
    };
    const mason = join(process.env.XDG_DATA_HOME!, "nvim", "mason", "bin");
    const yours = process.env.PATH!;
    expect(await pathOf("mason-absent")).toBe(yours);
    mkdirSync(mason, { recursive: true });
    try {
      expect(await pathOf("mason-present")).toBe(`${yours}:${mason}`);
      process.env.PATH = `${mason}/:${yours}`; // yours has it already, first: left as it is
      expect(await pathOf("mason-on-path")).toBe(`${mason}/:${yours}`);
    } finally {
      process.env.PATH = yours;
      rmSync(join(process.env.XDG_DATA_HOME!, "nvim"), { recursive: true, force: true });
    }
  });

  test("a project's .vscode/settings.json answers its servers' settings, over the config's, as VS Code's workspace does (19.20)", async () => {
    setTrustedRoots([sandbox]); // a root you trust (23.x): the project's own programs and settings count
    const fakeDef = {
      name: "fake",
      command: launcher("fake-vsc"),
      args: ["--stdio"],
      config: { fake: { level: 1, keep: "x", deep: { a: 1, b: 1 } } },
    };
    const { m, problems } = managed(table({ fake: fakeDef }));
    const top = project("vsc");
    const pkg = join(top, "packages", "app");
    mkdirSync(join(top, ".vscode"), { recursive: true });
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, "package.json"), "{}");
    // JSON with comments and trailing commas; dotted keys and nested ones; a language's own left out.
    writeFileSync(
      join(top, ".vscode", "settings.json"),
      '{\n  // the workspace\'s\n  "fake.level": 3,\n  "fake.deep": { "b": 2, },\n  "fake.deep.c": 3,\n  "[fake]": { "fake.level": 9 },\n  "editor.tabSize": 2,\n}\n',
    );
    const file = join(pkg, "a.fk");
    m.open(file, 1, "BAD\n");
    expect(await until(() => (problems.get(file)?.list.length ?? 0) > 0)).toBe(true);
    m.change(file, 2, "BAD\n"); // told again once it has asked for its settings
    expect(await until(() => problems.get(file)?.version === 2)).toBe(true);
    expect(JSON.parse(problems.get(file)!.list[0]!.message.replace(/^bad, with /, ""))).toEqual({
      level: 3,
      keep: "x",
      deep: { a: 1, b: 2, c: 3 },
    });
    await m.stopAll();
    expect(vscodeSettings(join(sandbox, "pa"))).toBeNull(); // none
    // Found from a package below; VS Code's per-language overrides left out.
    expect(vscodeSettings(pkg)).toEqual({ fake: { level: 3, deep: { b: 2, c: 3 } }, editor: { tabSize: 2 } });
  });

  test("a root you don't trust (23.3): a server's settings yours and its safe ones — none of the folder's config or .vscode; said once", async () => {
    // As the table in effect has it, the folder's config is in its settings; yours alone has it without.
    const folder = {
      name: "fake",
      command: launcher("fake-untrusted"),
      args: ["--stdio"],
      config: { fake: { level: 2, fromFolder: true } },
      untrusted: { settings: () => ({ fake: { safe: true } }) },
    };
    const yours = { ...folder, config: { fake: { level: 1 } } };
    const problems = new Map<string, { version: number | null; list: Problem[] }>();
    const messages: string[] = [];
    const m = new ServerManager({
      table: () => table({ fake: folder }),
      userTable: () => table({ fake: yours }),
      autoInstall: () => false,
      problems: (path, _s, version, list) => problems.set(path, { version, list }),
      message: (_l, text) => messages.push(text),
    });
    const top = project("untrusted-settings");
    mkdirSync(join(top, ".vscode"), { recursive: true });
    writeFileSync(join(top, ".vscode", "settings.json"), '{ "fake.level": 3, "fake.fromVscode": true }');
    const file = join(top, "a.fk");
    m.open(file, 1, "BAD\n");
    expect(await until(() => (problems.get(file)?.list.length ?? 0) > 0)).toBe(true);
    m.change(file, 2, "BAD\n"); // told again once it has asked for its settings
    expect(await until(() => problems.get(file)?.version === 2)).toBe(true);
    expect(JSON.parse(problems.get(file)!.list[0]!.message.replace(/^bad, with /, ""))).toEqual({
      level: 1,
      safe: true,
    });
    m.open(join(top, "b.fk"), 1, "fine\n");
    await m.stopAll();
    const said = messages.filter((t) => t.includes("isn't a vault you trust"));
    expect(said).toEqual([
      `${top} isn't a vault you trust: fake without the project's code; .vscode/settings.json not read — trust it in slipbox (it asks), or [trust] roots in your config; slipbox doctor says more`,
    ]);
  });

  test("the TUI's way (23.x): a root not answered for is asked about once, not told; kept restricted, neither; trusted, its servers started again as anywhere", async () => {
    const folder = {
      name: "fake",
      command: launcher("fake-ask"),
      args: ["--stdio"],
      config: { fake: { level: 2 } },
      untrusted: { settings: () => ({ fake: { safe: true } }) },
    };
    const problems = new Map<string, { version: number | null; list: Problem[] }>();
    const messages: string[] = [];
    const asked: string[] = [];
    const e = events();
    const m = new ServerManager({
      table: () => table({ fake: folder }),
      userTable: () => table({ fake: { ...folder, config: { fake: { level: 1 } } } }),
      autoInstall: () => false,
      problems: (path, _s, version, list) => (problems.set(path, { version, list }), e.heard()),
      message: (_l, text) => messages.push(text),
      ask: (root, limits) => asked.push(`${root}: ${limits.join("; ")}`),
    });
    const top = project("ask-trust");
    const file = join(top, "a.fk");
    m.open(file, 1, "BAD\n");
    m.open(join(top, "b.fk"), 1, "fine\n");
    expect(asked).toEqual([`${top}: fake without the project's code`]); // once
    expect(messages.filter((t) => t.includes("trust"))).toEqual([]);
    // The settings the file's server reports (it says nothing before it has them), once it's running: a change, and
    // what it says of it.
    let version = 1;
    const settings = async () => {
      expect(await m.started(file, "diagnostics")).toEqual(["fake"]);
      m.change(file, ++version, "BAD\n");
      await e.when(() => problems.get(file)?.version === version);
      return JSON.parse(problems.get(file)!.list[0]!.message.replace(/^bad, with /, ""));
    };
    expect(await settings()).toEqual({ level: 1, safe: true });
    // Trusted: started again with the folder's own settings, nothing more asked.
    setTrust(top, "trusted");
    m.restartUnder(top);
    expect(await settings()).toEqual({ level: 2 });
    expect(asked.length).toBe(1);
    await m.stopAll();
    // Another root, kept restricted: neither asked nor told.
    const other = project("kept-safe");
    setTrust(other, "restricted");
    const m2 = new ServerManager({
      table: () => table({ fake: folder }),
      autoInstall: () => false,
      problems: () => {},
      message: (_l, text) => messages.push(text),
      ask: (root) => asked.push(root),
    });
    m2.open(join(other, "a.fk"), 1, "fine\n");
    expect(asked.length).toBe(1);
    expect(messages.filter((t) => t.includes("trust"))).toEqual([]);
    await m2.stopAll();
  }, 90_000); // three servers started one after another: the time a loaded machine takes

  test("a server's start in a root you don't trust (23.4): its safe environment and initialize options; in one you trust, its own", () => {
    const top = project("untrusted-start");
    const def: ServerDef = {
      name: "g",
      command: "g",
      args: [],
      environment: { KEEP: "1" },
      initOptions: { own: true },
      untrusted: { environment: { GOTOOLCHAIN: "local" }, initOptions: { safe: true } },
    };
    expect(startOf(def, top)).toEqual({
      environment: { KEEP: "1", GOTOOLCHAIN: "local" },
      initOptions: { safe: true },
    });
    setTrustedRoots([top]);
    expect(startOf(def, top)).toEqual({ environment: { KEEP: "1" }, initOptions: { own: true } });
  });

  test(".vscode/settings.json: the nearest at or above the project's folder, never merged with one further up; one that doesn't parse is none", () => {
    const top = project("vsc-nearest");
    const pkg = join(top, "packages", "app");
    mkdirSync(join(top, ".vscode"), { recursive: true });
    mkdirSync(join(pkg, ".vscode"), { recursive: true });
    mkdirSync(join(pkg, "src"), { recursive: true });
    writeFileSync(join(top, ".vscode", "settings.json"), '{ "fake.level": 1, "fake.top": true }');
    writeFileSync(join(pkg, ".vscode", "settings.json"), '{ "fake.level": 2 }');
    expect(vscodeSettings(pkg)).toEqual({ fake: { level: 2 } }); // its own: the top's is further
    expect(vscodeSettings(join(pkg, "src"))).toEqual({ fake: { level: 2 } }); // from below, the nearest above
    expect(vscodeSettings(join(top, "packages"))).toEqual({ fake: { level: 1, top: true } });
    writeFileSync(join(pkg, ".vscode", "settings.json"), '{ "fake.level": ');
    expect(vscodeSettings(pkg)).toBeNull();
  });

  test("several servers on a file: each does its features — an add-on a linter's; the config limits them, Helix's way", async () => {
    const main = { name: "fake", command: launcher("fake-main"), args: ["--stdio"] };
    const addon = { name: "fake-lint", command: launcher("fake-addon"), args: ["--stdio"], requires: ["lint.cfg"] };
    const root = project("pg");
    writeFileSync(join(root, "lint.cfg"), "");
    const file = join(root, "a.fk");
    const uri = pathToFileURL(file).href;
    const heard: string[] = [];
    const t = table({ fake: main, "fake-lint": addon });
    const m = new ServerManager({
      table: () => t,
      autoInstall: () => false,
      problems: (_p, server, _v, list) => list.length && heard.push(server),
      message: () => {},
    });
    m.open(file, 1, "BAD\nREF a\n");
    expect(await until(() => heard.includes("fake") && heard.includes("fake-lint"))).toBe(true); // both its diagnostics
    const hover = await m.requestAll(
      file,
      "textDocument/hover",
      { textDocument: { uri }, position: { line: 0, character: 0 } },
      "hoverProvider",
      "hover",
    );
    expect(hover.map((h) => h.server)).toEqual(["fake"]); // an add-on doesn't hover
    const refs = await m.requestAll(
      file,
      "textDocument/references",
      { textDocument: { uri }, position: { line: 0, character: 0 }, context: { includeDeclaration: false } },
      "referencesProvider",
      "goto-reference",
    );
    expect(refs.map((r) => r.server)).toEqual(["fake"]); // nor find references
    await m.stopAll();
    // The config limits it: the main server for hover only — its diagnostics unheard.
    const limited: ServerTable = {
      ...t,
      languages: [
        { ...t.languages[0]!, features: { fake: { only: ["hover"] }, "fake-lint": { except: ["diagnostics"] } } },
      ],
    };
    const quiet: string[] = [];
    const m2 = new ServerManager({
      table: () => limited,
      autoInstall: () => false,
      problems: (_p, server, _v, list) => list.length && quiet.push(server),
      message: () => {},
    });
    m2.open(file, 1, "BAD\n");
    const h2 = await m2.request(
      file,
      "textDocument/hover",
      { textDocument: { uri }, position: { line: 0, character: 0 } },
      "hoverProvider",
      "hover",
    );
    expect(h2?.server).toBe("fake");
    await Bun.sleep(400);
    expect(quiet).toEqual([]);
    await m2.stopAll();
    // Helix's shape in the config: an entry with only-features.
    const helix = serverTable({}, [
      { name: "python", "language-servers": ["pyright", { name: "ruff", "only-features": ["diagnostics", "format"] }] },
    ]);
    expect(languageOf(helix, "a.py")!.features).toEqual({
      ruff: { only: ["diagnostics", "format"], except: undefined },
    });
  });

  // Four servers started one after another: on a loaded machine each start can take seconds, so the test is given the
  // time they take, and waits for what they say rather than for a while.
  test("a crash: started again, its files told again; one that keeps crashing is left stopped", async () => {
    const { m, problems, messages, when } = managed(
      table({ fake: { name: "fake", command: launcher("fake-crash"), args: ["--stdio"] } }),
    );
    const root = project("pc");
    const file = join(root, "a.fk");
    m.open(file, 1, "BAD\n");
    await when(() => problems.get(file)?.list.length === 1);
    problems.clear();
    m.change(file, 2, "CRASH\n"); // it dies on this text, every time it's told it
    await when(() => messages.some((x) => x.includes("keeps crashing")));
    expect(messages.filter((x) => x.startsWith("fake crashed")).length).toBe(3);
    await m.stopAll();
  }, 120_000);

  test("a crash whose program has gone: left stopped and said so — never installed, native or npm with auto_install off", async () => {
    setTrustedRoots([sandbox]); // a root you trust (23.x): the project's own programs and settings count
    // Native (its command the user's, an absolute path): no npm to install it from.
    const program = launcher("fake-gone");
    const native = managed(table({ fake: { name: "fake", command: program, args: ["--stdio"] } }));
    const file = join(project("pgone"), "a.fk");
    native.m.open(file, 1, "BAD\n");
    expect(await until(() => native.problems.get(file)?.list.length === 1)).toBe(true);
    rmSync(program);
    native.m.change(file, 2, "CRASH\n");
    expect(await until(() => native.messages.some((x) => x.includes("program is gone")))).toBe(true);
    expect(native.messages.filter((x) => x.startsWith("fake crashed"))).toEqual([
      expect.stringMatching(/^fake crashed \(.*\) and its program is gone; not started again$/),
    ]);
    expect(
      await native.m.request(
        file,
        "textDocument/hover",
        { textDocument: { uri: pathToFileURL(file).href }, position: { line: 0, character: 0 } },
        "hoverProvider",
        "hover",
      ),
    ).toBeNull();
    await native.m.stopAll(); // resolves: no restart that rejected
    // npm, found in the project, then gone: with auto_install off, not installed.
    const root = project("pgone-npm");
    const bins = join(root, "node_modules", ".bin");
    mkdirSync(bins, { recursive: true });
    const local = join(bins, "slipbox-gone-ls");
    writeFileSync(local, `#!/usr/bin/env node\nawait import(${JSON.stringify(FAKE)});\n`);
    chmodSync(local, 0o755);
    const npmDef = {
      name: "fake-npm",
      command: "slipbox-gone-ls",
      args: ["--stdio"],
      npm: { package: "slipbox-gone-ls", version: "1.0.0", bin: "slipbox-gone-ls" },
    };
    const npm = managed(table({ "fake-npm": npmDef }));
    const f2 = join(root, "a.fk");
    npm.m.open(f2, 1, "BAD\n");
    expect(await until(() => npm.problems.get(f2)?.list.length === 1)).toBe(true);
    rmSync(local);
    npm.m.change(f2, 2, "CRASH\n");
    expect(await until(() => npm.messages.some((x) => x.includes("program is gone")))).toBe(true);
    expect(npm.messages.some((x) => x.startsWith("installing"))).toBe(false);
    await npm.m.stopAll();
  });

  test("a server that can't start is said once, not counted as a crash and started again", async () => {
    const { m, messages } = managed(
      table({ fake: { name: "fake", command: "sh", args: ["-c", "echo 'fatal: bad flag' >&2; exit 2"] } }),
    );
    m.open(join(project("pq"), "a.fk"), 1, "");
    await Bun.sleep(1000);
    expect(messages).toEqual(["fake: fake exited before it was ready (code 2): fatal: bad flag"]);
    await m.stopAll();
  });

  test("a native server nowhere: said once; an npm one with auto_install off: said; on: installed, then started", async () => {
    const native = { name: "slipbox-native-ls", command: "slipbox-native-ls", args: [] };
    const off = managed(table({ "slipbox-native-ls": native }));
    off.m.open(join(project("pd"), "a.fk"), 1, "");
    off.m.open(join(project("pd"), "b.fk"), 1, "");
    expect(off.messages).toEqual([
      "fake: slipbox-native-ls isn't installed (slipbox finds it on PATH; it doesn't install native servers) — slipbox doctor says more",
    ]);
    // An npm package of the fake server, installed from a folder (no network).
    const pkg = join(sandbox, "fake-pkg");
    mkdirSync(pkg, { recursive: true });
    writeFileSync(
      join(pkg, "package.json"),
      JSON.stringify({ name: "slipbox-fake-ls", version: "1.0.0", bin: { "slipbox-fake-ls": "ls.js" } }),
    );
    writeFileSync(join(pkg, "ls.js"), `#!/usr/bin/env node\nawait import(${JSON.stringify(FAKE)});\n`);
    const npmDef = {
      name: "fake-npm",
      command: "slipbox-fake-ls",
      args: ["--stdio"],
      npm: { package: "slipbox-fake-ls", version: `file:${pkg}`, bin: "slipbox-fake-ls" },
    };
    LOCKS[lockKey(npmDef.npm)] = lockFor(npmDef.npm);
    const noInstall = managed(table({ "fake-npm": npmDef }));
    noInstall.m.open(join(project("pe"), "a.fk"), 1, "");
    expect(noInstall.messages).toEqual(["fake: fake-npm isn't installed — slipbox doctor says more"]);
    const install = managed(table({ "fake-npm": npmDef }), true);
    const file = join(project("pf"), "a.fk");
    install.m.open(file, 1, "BAD\n");
    expect(await until(() => install.problems.get(file)?.list.length === 1, 20_000)).toBe(true);
    expect(install.messages).toEqual([
      `installing fake-npm (slipbox-fake-ls@file:${pkg}) into slipbox's own folder…`,
      "installed fake-npm",
    ]);
    expect(existsSync(join(toolFolder(npmDef.npm)!, "node_modules/.bin/slipbox-fake-ls"))).toBe(true);
    await install.m.stopAll();
  });

  test("slipbox's install of a server behind its lock (14.11): installed again before it starts — or, installing off, run as it is", async () => {
    const pkg = join(sandbox, "fake-pkg-behind");
    mkdirSync(pkg, { recursive: true });
    writeFileSync(
      join(pkg, "package.json"),
      JSON.stringify({ name: "slipbox-behind-ls", version: "1.0.0", bin: { "slipbox-behind-ls": "ls.js" } }),
    );
    writeFileSync(join(pkg, "ls.js"), `#!/usr/bin/env node\nawait import(${JSON.stringify(FAKE)});\n`);
    const def = {
      name: "behind-npm",
      command: "slipbox-behind-ls",
      args: ["--stdio"],
      npm: { package: "slipbox-behind-ls", version: `file:${pkg}`, bin: "slipbox-behind-ls" },
    };
    LOCKS[lockKey(def.npm)] = lockFor(def.npm);
    // What an older slipbox installed: the shared folder of before, the fake server under its name.
    const old = join(toolsDir(), "node_modules");
    mkdirSync(join(old, ".bin"), { recursive: true });
    mkdirSync(join(old, "slipbox-behind-ls"), { recursive: true });
    writeFileSync(
      join(old, "slipbox-behind-ls", "package.json"),
      JSON.stringify({ name: "slipbox-behind-ls", version: "0.9.0" }),
    );
    writeFileSync(
      join(old, ".bin", "slipbox-behind-ls"),
      `#!/usr/bin/env node\nawait import(${JSON.stringify(FAKE)});\n`,
    );
    chmodSync(join(old, ".bin", "slipbox-behind-ls"), 0o755);
    // Installing off: the old one runs, nothing installed.
    const off = managed(table({ "behind-npm": def }));
    const a = join(project("pbehind-off"), "a.fk");
    off.m.open(a, 1, "BAD\n");
    expect(await until(() => off.problems.get(a)?.list.length === 1, 20_000)).toBe(true);
    expect(off.messages).toEqual([]);
    expect(existsSync(toolFolder(def.npm)!)).toBe(false);
    await off.m.stopAll();
    // Installing on: updated first, then started from the new folder.
    const on = managed(table({ "behind-npm": def }), true);
    const b = join(project("pbehind-on"), "b.fk");
    on.m.open(b, 1, "BAD\n");
    expect(await until(() => on.problems.get(b)?.list.length === 1, 20_000)).toBe(true);
    expect(on.messages).toEqual([
      `updating behind-npm (0.9.0 → file:${pkg}) in slipbox's own folder…`,
      "updated behind-npm",
    ]);
    expect(ownInstall(def.npm)).toEqual({
      path: join(toolFolder(def.npm)!, "node_modules/.bin/slipbox-behind-ls"),
      behind: null,
    });
    await on.m.stopAll();
    // Installed before at the version pinned, not from the lock: installed again, said so.
    rmSync(toolFolder(def.npm)!, { recursive: true });
    writeFileSync(
      join(old, "slipbox-behind-ls", "package.json"),
      JSON.stringify({ name: "slipbox-behind-ls", version: `file:${pkg}` }),
    );
    const same = managed(table({ "behind-npm": def }), true);
    const c = join(project("pbehind-same"), "c.fk");
    same.m.open(c, 1, "BAD\n");
    expect(await until(() => same.problems.get(c)?.list.length === 1, 20_000)).toBe(true);
    expect(same.messages).toEqual([
      `installing behind-npm again from slipbox's lockfile (slipbox-behind-ls@file:${pkg})…`,
      "updated behind-npm",
    ]);
    await same.m.stopAll();
  });
  test("a file's servers, once each has started: the running ones; a save reaches them; closed, they're told, and it opens afresh", async () => {
    const fakeDef = { name: "fake", command: launcher("fake-started"), args: ["--stdio"] };
    const logs: string[] = [];
    const problems = new Map<string, { version: number | null; list: Problem[] }>();
    const t = table({ fake: fakeDef });
    const m = new ServerManager({
      table: () => t,
      autoInstall: () => false,
      problems: (path, _s, version, list) => problems.set(path, { version, list }),
      message: () => {},
      log: (l) => logs.push(l),
    });
    const file = join(project("pstarted"), "a.fk");
    const fileUri = pathToFileURL(file).href;
    expect(await m.started(file, "diagnostics")).toEqual([]); // not open
    m.open(file, 1, "SAVED\n");
    expect(await m.started(file, "diagnostics")).toEqual(["fake"]);
    m.save(file, "SAVED as written\n");
    expect(await until(() => logs.includes(`fake: saved ${fileUri} with "SAVED as written\\n"`))).toBe(true);
    m.close(file);
    expect(m.isOpen(file)).toBe(false);
    expect(await m.started(file, "diagnostics")).toEqual([]);
    m.save(file, "SAVED after close\n"); // not theirs any more
    // Opened again with another text: told afresh, so its problems are the new text's.
    m.open(file, 1, "BAD\nBAD\n");
    expect(await until(() => problems.get(file)?.list.length === 2)).toBe(true);
    expect(logs.some((l) => l.includes("after close"))).toBe(false);
    await m.stopAll();
    // A server that couldn't start isn't among them.
    const broken = managed(table({ fake: { name: "fake", command: "sh", args: ["-c", "exit 2"] } }));
    const other = join(project("pstarted-broken"), "a.fk");
    broken.m.open(other, 1, "");
    expect(await broken.m.started(other, "diagnostics")).toEqual([]);
    await broken.m.stopAll();
  });
});

describe("found only where it's surely the one (19.4)", () => {
  test("a server whose name is common elsewhere (tsc) is taken only from the project or slipbox's installs", () => {
    const bin = join(sandbox, "pathbin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "slipbox-common-ls"), "#!/bin/sh\n");
    chmodSync(join(bin, "slipbox-common-ls"), 0o755);
    const was = process.env.PATH;
    process.env.PATH = `${bin}:${was}`;
    try {
      const def = { name: "c", command: "slipbox-common-ls", args: [] };
      expect(findServer(def, sandbox)?.where).toBe("path");
      expect(findServer({ ...def, ownOnly: true }, sandbox)).toBeNull();
    } finally {
      process.env.PATH = was;
    }
  });
});

describe("linters without a server (19.19)", () => {
  const dir = (name: string, files: Record<string, string>) => {
    const root = join(sandbox, name);
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(root, rel, ".."), { recursive: true });
      writeFileSync(join(root, rel), text);
    }
    return root;
  };
  /** A linter as a config would write it, over efm's defaults. */
  const linter = (c: LinterConfig) => linterTable({ t: c }).t!;
  const formats = (...fs: string[]) => fs.map((f) => compileFormat(f) as Format);

  test("vim's errorformat, the part linters use: fields, patterns, lines passed over; multi-line ones refused", () => {
    const f = compileFormat("%f:%l:%c: %*[^:]: %m") as Format;
    expect(f.fields).toEqual(["f", "l", "c", "m"]);
    expect(f.re.exec("a.sh:3:7: SC2086: Double quote")?.slice(1)).toEqual(["a.sh", "3", "7", "Double quote"]);
    expect((compileFormat("%f:%l%\\s%#%m") as Format).re.exec("x:2   hi")?.slice(1)).toEqual(["x", "2", "hi"]);
    expect((compileFormat("%f(%l): %*\\d %m") as Format).re.source).toBe("^(.+?)\\((\\d+)\\): \\d+ (.*)$");
    expect((compileFormat("%-G%.%#warning%.%#") as Format).ignore).toBe(true);
    expect((compileFormat("%Wwarn %f:%l %m") as Format).type).toBe("w");
    expect(compileFormat("%C%m")).toContain("multi-line");
    expect(compileFormat("%f:%l %q")).toContain("%q isn't read");
  });

  test("findings: severity by %t, else the linter's; this file's only; columns, ends, codes, pointers", () => {
    const file = join(sandbox, "lint", "a.yaml");
    const def = { source: "yl", severity: "warning" as const };
    const fs = formats(
      "%-G%.%#ignored%.%#",
      "%f:%l:%c: [%trror] %m",
      "%f:%l:%c: [%tarning] %m",
      "%f:%l:%c-%e:%k E%n %m",
      "%f:%l %m",
      "%p^ %m",
    );
    const out = parseFindings(
      [
        "stdin:1:1: [warning] missing start",
        "-:2:5: [error] too many spaces",
        "other.yaml:3:1: [error] not this file",
        "a.yaml:4:2-5:9 E42 spans",
        "<stdin>:6 bare",
        "this is ignored here",
        "    ^ pointed",
        "noise",
      ].join("\n"),
      fs,
      def,
      file,
      join(sandbox, "lint"),
    );
    expect(
      out.map((p) => [p.start.line, p.start.column, p.end.line, p.end.column, p.severity, p.code, p.message]),
    ).toEqual([
      [1, 1, 1, 2, "warning", null, "missing start"],
      [2, 5, 2, 6, "error", null, "too many spaces"],
      [4, 2, 5, 9, "warning", "42", "spans"],
      [6, 1, 6, 1, "warning", null, "bare"],
      [1, 5, 1, 6, "warning", null, "pointed"],
    ]);
    expect(out.every((p) => p.source === "yl")).toBe(true);
  });

  test("run as efm runs it: its input the text, from its project, the project's own copy first; exit 0 is nothing found", async () => {
    setTrustedRoots([sandbox]); // a root you trust (23.x): the project's own programs and settings count
    const root = dir("efm", {
      ".fakelintrc": "",
      "src/a b's.txt": "on disk\n",
      "node_modules/.bin/fakelint": '#!/bin/sh\necho "-:1:2: [error] own copy, in $(basename "$PWD")"\nexit 1\n',
    });
    chmodSync(join(root, "node_modules/.bin/fakelint"), 0o755);
    const file = join(root, "src/a b's.txt");
    // Its input, read: a finding per line holding BAD.
    const reads = linter({
      "lint-command": "grep -n BAD | sed 's/^\\([0-9]*\\):.*/stdin:\\1:1: [error] found BAD/'; exit 1",
      "lint-formats": ["%f:%l:%c: [%trror] %m"],
    });
    expect(await runLinter(reads, file, "ok\nBAD here\n", root)).toEqual({
      problems: [
        {
          start: { line: 2, column: 1 },
          end: { line: 2, column: 2 },
          severity: "error",
          source: "t",
          code: null,
          message: "found BAD",
        },
      ],
    });
    // An exit of 0 is efm's "nothing found", whatever it printed — unless told to ignore it.
    const zero = linter({
      "lint-command": "echo 'stdin:1:1: [error] said, but exit 0'",
      "lint-formats": ["%f:%l:%c: [%trror] %m"],
    });
    expect(await runLinter(zero, file, "", root)).toEqual({ problems: [] });
    expect(await runLinter({ ...zero, ignoreExitCode: true }, file, "", root)).toMatchObject({
      problems: [{ message: "said, but exit 0" }],
    });
    // The file as saved: its path in place of ${INPUT}, quoted; appended when there's none.
    const onDisk = linter({
      "lint-command": "sed -n 's/^\\(.*\\)$/1: \\1/p' ${INPUT}; exit 1",
      "lint-stdin": false,
      "lint-formats": ["%l: %m"],
    });
    expect(await runLinter(onDisk, file, "typed, unsaved", root)).toMatchObject({
      problems: [{ start: { line: 1 }, message: "on disk" }],
    });
    expect(commandFor(linter({ "lint-command": "cat", "lint-stdin": false }), file)).toBe(
      `cat '${root}/src/a b'\\''s.txt'`,
    );
    // The project's copy, before PATH's, run from the project's top folder.
    expect(
      await runLinter(
        linter({ "lint-command": "fakelint", "lint-formats": ["%f:%l:%c: [%trror] %m"] }),
        file,
        "",
        root,
      ),
    ).toMatchObject({ problems: [{ message: "own copy, in efm" }] });
    // Not there: the shell's 127, said as missing.
    expect(await runLinter(linter({ "lint-command": "slipbox-no-such-linter" }), file, "", root)).toMatchObject({
      failed: "missing",
    });
    expect(await runLinter(linter({ "lint-command": "cat", "lint-formats": ["%C%m"] }), file, "", root)).toMatchObject({
      failed: "error",
    });
  });

  test("where it runs: the folder with its config; one needing it doesn't run without; built in by language", () => {
    const root = dir("marks", {
      ".git/HEAD": "",
      "svc/.hadolint.yaml": "",
      "svc/api/Dockerfile": "",
      "web/Dockerfile": "",
    });
    const hadolint = linterTable().hadolint!;
    expect(linterRoot(hadolint, join(root, "svc/api/Dockerfile"), root)).toBe(join(root, "svc"));
    expect(linterRoot(hadolint, join(root, "web/Dockerfile"), root)).toBeNull(); // the project doesn't ask
    expect(linterRoot({ ...hadolint, requireMarker: false }, join(root, "web/Dockerfile"), root)).toBe(root);
    expect(languageOf(serverTable(), "Dockerfile")!.linters).toEqual(["hadolint"]);
    expect(languageOf(serverTable({}, [{ name: "yaml", linters: ["mine"] }]), "a.yml")!.linters).toEqual(["mine"]);
    // A config's keys over the built-in's.
    expect(linterTable({ yamllint: { "lint-command": "yamllint --strict -f parsable -" } }).yamllint).toMatchObject({
      command: "yamllint --strict -f parsable -",
      formats: LINTERS.yamllint!.formats,
      requireMarker: true,
    });
  });

  test("a vault's config tunes known linters, never names a program", () => {
    const root = dir("lintcfg", {
      "user.toml":
        '[linter.mine]\nlint-command = "mine -"\n\n[[language]]\nname = "yaml"\nlinters = ["yamllint", "mine"]\n',
      "vault.toml":
        '[linter.yamllint]\nlint-command = "/tmp/evil"\nrequire-marker = false\n\n[linter.evil]\nlint-command = "/tmp/evil"\n',
    });
    const { config, warnings } = loadConfig({
      configFile: join(root, "user.toml"),
      vaultFile: join(root, "vault.toml"),
    });
    expect(config.linter).toEqual({ mine: { "lint-command": "mine -" }, yamllint: { "require-marker": false } });
    expect(config.language).toEqual([{ name: "yaml", linters: ["yamllint", "mine"] }]);
    expect(
      warnings.some((w) => w.includes("sets linter.yamllint.lint-command, which only your own config may set")),
    ).toBe(true);
    expect(warnings.some((w) => w.includes("adds the linter evil, which only your own config may"))).toBe(true);
  });
  test("errorformat's regex items and ranges: %\\+ %\\? %\\= and a plain backslash; %[…]; what's malformed is said", () => {
    const f = (s: string) => compileFormat(s) as Format;
    expect(f("%f:%l:%\\s%\\+%m").re.exec("x:2:   hi")?.slice(1)).toEqual(["x", "2", "hi"]);
    expect(f("%f:%l:%\\s%\\+%m").re.exec("x:2:hi")).toBeNull(); // one at least
    expect(f("%f:%l:%\\s%\\?%m").re.exec("x:2:hi")?.slice(1)).toEqual(["x", "2", "hi"]);
    expect(f("%f:%l:%\\s%\\=%m").re.exec("x:2: hi")?.slice(1)).toEqual(["x", "2", "hi"]);
    expect(f("%f:%l:%\\s%\\?%m").re.exec("x:2:  hi")?.slice(1)).toEqual(["x", "2", " hi"]); // one at most
    expect(f("%f %\\| %m").re.exec("a \\| m")?.slice(1)).toEqual(["a", "m"]); // a backslash as itself
    const range = f("%f:%l:%[A-Z] %m");
    expect(range.fields).toEqual(["f", "l", "m"]); // a range isn't captured
    expect(range.re.exec("a.sh:3:W text")?.slice(1)).toEqual(["a.sh", "3", "text"]);
    expect(range.re.exec("a.sh:3:w text")).toBeNull();
    expect(f("%f:%[^0-9]%m").re.exec("x:yes")?.slice(1)).toEqual(["x", "es"]);
    expect(f("%f:%[^0-9]%m").re.exec("x:9no")).toBeNull();
    expect(compileFormat("%f:%[A-Z")).toContain("an unclosed %[");
    expect(compileFormat("%f:%l %")).toContain("ends in a lone %");
  });

  test("a linter that takes too long is stopped, and said so; one that can't start at all says why", async () => {
    const root = dir("slowlint", { "a.txt": "" });
    const t = Date.now();
    expect(await runLinter(linter({ "lint-command": "sleep 5" }), join(root, "a.txt"), "", root, 200)).toEqual({
      failed: "timeout",
      detail: "t took longer than 0.2 s",
    });
    expect(Date.now() - t).toBeLessThan(3000);
    // Its project's folder gone (deleted while open): the shell itself can't start there.
    const gone = join(sandbox, "slowlint-gone");
    expect(await runLinter(linter({ "lint-command": "true" }), join(gone, "a.txt"), "", gone)).toMatchObject({
      failed: "error",
      detail: expect.stringMatching(/^t: .*ENOENT/),
    });
  });

  test("a linter in a root you don't trust (23.2): the project's own copy isn't on its PATH; in one you trust, first", () => {
    const root = dir("untrusted-lint", { "node_modules/.bin/x": "" });
    expect(projectPath(root, "/usr/bin")).toBe("/usr/bin");
    setTrustedRoots([root]);
    expect(projectPath(root, "/usr/bin")).toBe(`${join(root, "node_modules/.bin")}:/usr/bin`);
  });

  test("doctor for a file: each linter's own folder, its program found from there; null where the project doesn't ask", () => {
    setTrustedRoots([sandbox]); // a root you trust (23.x): the project's own programs and settings count
    const root = dir("doclint", {
      ".git/HEAD": "",
      "svc/.hadolint.yaml": "",
      "svc/api/Dockerfile": "",
      "svc/node_modules/.bin/hadolint": "#!/bin/sh\n",
      "web/Dockerfile": "",
    });
    chmodSync(join(root, "svc/node_modules/.bin/hadolint"), 0o755);
    const svc = doctorFile(serverTable(), linterTable(), join(root, "svc/api/Dockerfile"), false)!;
    expect(svc.root).toBe(root);
    expect(svc.linters).toEqual([
      expect.objectContaining({
        name: "hadolint",
        root: join(root, "svc"),
        where: "project",
        path: join(root, "svc/node_modules/.bin/hadolint"),
      }),
    ]);
    const web = doctorFile(serverTable(), linterTable(), join(root, "web/Dockerfile"), false)!;
    expect(web.linters).toEqual([expect.objectContaining({ name: "hadolint", root: null })]);
    expect(web.linters[0]!.where).not.toBe("project");
  });
});

describe("slipbox's installs behind their locks, said and acted on (14.11)", () => {
  test("doctor says a server is behind: the version it has, the one slipbox pins", () => {
    const npm = { package: "slipbox-doc-ls", version: "2.0.0", bin: "slipbox-doc-ls" };
    LOCKS[lockKey(npm)] = "the lock of 2.0.0";
    const old = join(toolsDir(), "slipbox-doc-ls", "000000000000");
    mkdirSync(join(old, "node_modules/.bin"), { recursive: true });
    mkdirSync(join(old, "node_modules/slipbox-doc-ls"), { recursive: true });
    writeFileSync(join(old, "node_modules/slipbox-doc-ls/package.json"), JSON.stringify({ version: "1.5.0" }));
    writeFileSync(join(old, "node_modules/.bin/slipbox-doc-ls"), "#!/bin/sh\n");
    chmodSync(join(old, "node_modules/.bin/slipbox-doc-ls"), 0o755);
    const def: ServerDef = { name: "doc-ls", command: "slipbox-doc-ls", args: [], npm };
    const t: ServerTable = {
      servers: { "doc-ls": def },
      languages: [{ name: "doc", languageId: "doc", fileTypes: ["doc"], roots: [], servers: ["doc-ls"] }],
    };
    const [g] = doctor(t, {}, sandbox, true);
    expect(g!.servers[0]).toMatchObject({
      name: "doc-ls",
      status: "found",
      where: "slipbox",
      behind: "1.5.0",
      package: "slipbox-doc-ls@2.0.0",
    });
  });

  test("lint's markdownlint-cli2 behind: installed again first when installing is on; run as it is when off", () => {
    const vault = mkdtempSync(join(sandbox, "lintv-"));
    writeFileSync(join(vault, ".markdownlint-cli2.jsonc"), "{}\n");
    const parent = join(toolsDir(), toolSlug(MARKDOWNLINT.npm!.package), "000000000000");
    mkdirSync(join(parent, "node_modules/.bin"), { recursive: true });
    writeFileSync(join(parent, "node_modules/.bin/markdownlint-cli2"), "#!/bin/sh\n");
    chmodSync(join(parent, "node_modules/.bin/markdownlint-cli2"), 0o755);
    const lint = { enabled: "auto" as const, command: [] };
    const home = mkdtempSync(join(sandbox, "linth-"));
    const was = process.env.PATH;
    // Never the machine's own: one on PATH is found before slipbox's, and `bun run` puts the repository's there.
    process.env.PATH = "/usr/bin:/bin";
    try {
      expect(lintCommand(lint, vault, home, true)).toEqual({ argv: [], literal: true, install: MARKDOWNLINT.npm });
      expect(lintCommand(lint, vault, home, false)?.argv).toEqual([
        join(parent, "node_modules/.bin/markdownlint-cli2"),
      ]);
    } finally {
      process.env.PATH = was;
    }
  });
});
