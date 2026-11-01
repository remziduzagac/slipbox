// slipbox as a client of language servers (plan 19.x): a server started, told about a file, its
// diagnostics heard — sent or asked for — its settings answered, stopped, and a crash noticed. A fake
// server (tests/fixtures/fake-lsp.ts) stands in for a real one.

import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Diagnostic } from "vscode-languageserver-protocol";
import { LanguageClient, type ServerSpec, settingAt } from "../../../../src/core/documents/servers/client.ts";
import { events, FAKE, until } from "../../../support/server-process.ts";
import { makeServerSandbox } from "../../../support/server-sandbox.ts";
import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";

setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox } = makeServerSandbox();

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
