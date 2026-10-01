// slipbox as a client of language servers (plan 19.x): a server started, told about a file, its
// diagnostics heard — sent or asked for — its settings answered, stopped, and a crash noticed. A fake
// server (tests/fixtures/fake-lsp.ts) stands in for a real one.

import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Diagnostic } from "vscode-languageserver-protocol";
import { LanguageClient, type ServerSpec, settingAt } from "../src/core/servers/client.ts";

setDefaultTimeout(30_000);
const FAKE = join(import.meta.dir, "fixtures", "fake-lsp.ts");
const sandbox = mkdtempSync(join(tmpdir(), "slipbox-servers-"));
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

const until = async (ok: () => boolean, ms = 5000) => {
  for (const t = Date.now(); !ok() && Date.now() - t < ms; ) await Bun.sleep(20);
  return ok();
};

/** The fake server as a client starts it, and what it hears. */
function fake(opts: { pull?: boolean; settings?: Record<string, unknown> } = {}) {
  const heard = new Map<string, { diagnostics: Diagnostic[]; version: number | null }>();
  const logs: string[] = [];
  const exits: { expected: boolean; why: string }[] = [];
  const spec: ServerSpec = { name: "fake", argv: ["bun", FAKE, "--stdio"], env: opts.pull ? { FAKE_PULL: "1" } : {}, settings: opts.settings, root: sandbox };
  const client = new LanguageClient(spec, {
    diagnostics: (uri, diagnostics, version) => heard.set(uri, { diagnostics, version }),
    log: (m) => logs.push(m),
    exited: (expected, why) => exits.push({ expected, why }),
  });
  return { client, heard, logs, exits };
}

const uri = pathToFileURL(join(sandbox, "a.ts")).href;

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
    const hover = await f.client.request<{ contents: { value: string } }>("textDocument/hover", { textDocument: { uri }, position: { line: 2, character: 0 } });
    expect(hover!.contents.value).toBe("line 2: BAD BAD");
    await f.client.stop();
    expect(f.client.state).toBe("stopped");
    expect(f.exits).toEqual([{ expected: true, why: "stopped" }]);
  });

  test("a server that waits to be asked (3.17): its diagnostics asked for on open, change and save", async () => {
    const f = fake({ pull: true });
    await f.client.start();
    expect(f.client.pullsDiagnostics).toBe(true);
    await f.client.didOpen(uri, "typescript", 1, "BAD\n");
    expect(await until(() => f.heard.get(uri)?.diagnostics.length === 1)).toBe(true);
    await f.client.didChange(uri, 2, "fine\n");
    expect(await until(() => f.heard.get(uri)?.diagnostics.length === 0)).toBe(true);
    // An answer about an older text, arriving after the newer one's, is dropped.
    await f.client.didChange(uri, 3, "SLOW BAD\n");
    await f.client.didChange(uri, 4, "fine\n");
    await Bun.sleep(700);
    expect(f.heard.get(uri)).toEqual({ diagnostics: [], version: 4 });
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
    const quick = new LanguageClient({ name: "quick", argv: ["sh", "-c", "echo 'no such option' >&2; exit 2"], root: sandbox });
    expect(quick.start()).rejects.toThrow("quick exited before it was ready (code 2): no such option");
  });

  test("settings looked up by section", () => {
    const s = { python: { analysis: { typeCheckingMode: "strict" } }, css: { validate: true } };
    expect(settingAt(s, "python.analysis")).toEqual({ typeCheckingMode: "strict" });
    expect(settingAt(s, "css")).toEqual({ validate: true });
    expect(settingAt(s, "html")).toBeNull();
    expect(settingAt(s, undefined)).toEqual(s);
  });
});
