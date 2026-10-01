// slipbox as a client of language servers (plan 19.x): a server started, told about a file, its
// diagnostics heard — sent or asked for — its settings answered, stopped, and a crash noticed. A fake
// server (tests/fixtures/fake-lsp.ts) stands in for a real one.

import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Diagnostic } from "vscode-languageserver-protocol";
import { loadConfig } from "../src/core/config.ts";
import { LanguageClient, type ServerSpec, settingAt } from "../src/core/servers/client.ts";
import { chooseServers, findServer, rootFor, toolsDir } from "../src/core/servers/find.ts";
import { installPackages } from "../src/core/servers/install.ts";
import { languageOf, projectAsks, serverTable } from "../src/core/servers/languages.ts";

setDefaultTimeout(30_000);
const FAKE = join(import.meta.dir, "fixtures", "fake-lsp.ts");
const sandbox = mkdtempSync(join(tmpdir(), "slipbox-servers-"));
process.env.XDG_DATA_HOME = join(sandbox, "data"); // slipbox's installs, and Mason's, are the sandbox's
delete process.env.SLIPBOX_CONFIG;
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
      { pyright: { config: { python: { analysis: { typeCheckingMode: "strict" } } } }, mylsp: { command: "/opt/mylsp", args: ["--stdio"] } },
      [{ name: "python", "language-servers": ["basedpyright", "ruff"] }, { name: "nix", "file-types": ["nix"], "language-servers": ["mylsp"] }],
    );
    expect(mine.servers.pyright!.config).toEqual({ python: { analysis: { autoSearchPaths: true, useLibraryCodeForTypes: true, diagnosticMode: "openFilesOnly", typeCheckingMode: "strict" } } });
    expect(mine.servers.mylsp).toMatchObject({ command: "/opt/mylsp", args: ["--stdio"] });
    expect(languageOf(mine, "/p/a.py")!.servers).toEqual(["basedpyright", "ruff"]);
    expect(languageOf(mine, "/p/flake.nix")!.servers).toEqual(["mylsp"]);
    // A command of the user's own is never slipbox's install.
    expect(serverTable({ pyright: { command: "/opt/pyright-langserver" } }).servers.pyright!.npm).toBeUndefined();
  });

  test("a vault's config tunes known servers' settings, never names a program", () => {
    const root = dir("cfg", {
      "user.toml": '[language-server.mylsp]\ncommand = "/opt/mylsp"\n\n[[language]]\nname = "python"\nlanguage-servers = ["pyright"]\n',
      "vault.toml": '[language-server.pyright]\ncommand = "/tmp/evil"\nconfig = { python = { analysis = { typeCheckingMode = "strict" } } }\n\n[language-server.evil]\nconfig = {}\n',
    });
    const { config, warnings } = loadConfig({ configFile: join(root, "user.toml"), vaultFile: join(root, "vault.toml") });
    expect(config["language-server"]).toEqual({ mylsp: { command: "/opt/mylsp" }, pyright: { config: { python: { analysis: { typeCheckingMode: "strict" } } } } });
    expect(config.language).toEqual([{ name: "python", "language-servers": ["pyright"] }]);
    expect(warnings.some((w) => w.includes("sets language-server.pyright.command, which only your own config may set"))).toBe(true);
    expect(warnings.some((w) => w.includes("adds the language server evil, which only your own config may"))).toBe(true);
  });

  test("a project's root: the first marker's nearest folder, then the next's; never above the home folder", () => {
    const root = dir("mono", { ".git/HEAD": "ref: refs/heads/main\n", "package.json": "{}", "packages/a/tsconfig.json": "{}", "packages/a/src/x.ts": "", "packages/b/y.ts": "" });
    const ts = languageOf(serverTable(), "x.ts")!.roots;
    expect(rootFor(join(root, "packages/a/src/x.ts"), ts)).toBe(join(root, "packages/a"));
    expect(rootFor(join(root, "packages/b/y.ts"), ts)).toBe(root); // no tsconfig: the package.json's
    // An earlier marker further up beats a later one nearer, as nvim's root_markers have it.
    const ordered = dir("ordered", { "tsconfig.json": "{}", "packages/c/package.json": "{}", "packages/c/z.ts": "" });
    expect(rootFor(join(ordered, "packages/c/z.ts"), ts)).toBe(ordered);
    expect(rootFor(join(sandbox, "loose/z.ts"), ["no-such-marker"])).toBe(join(sandbox, "loose"));
  });

  test("a program found in the project first, then PATH, then slipbox's installs; a Node launcher runs on Bun", () => {
    const root = dir("found", { ".git/HEAD": "ref: refs/heads/main\n" });
    const def = { name: "x", command: "slipbox-test-ls", args: ["--stdio"], npm: { package: "slipbox-test-ls", version: "1.0.0", bin: "slipbox-test-ls" } };
    expect(findServer(def, root)).toBeNull();
    exe(join(toolsDir(), "node_modules/.bin/slipbox-test-ls"), "#!/bin/sh\necho hi\n");
    expect(findServer(def, root)).toMatchObject({ where: "slipbox", argv: [join(toolsDir(), "node_modules/.bin/slipbox-test-ls"), "--stdio"] });
    exe(join(root, "node_modules/.bin/slipbox-test-ls"), "#!/usr/bin/env node\nconsole.log(1)\n");
    const f = findServer(def, join(root, "sub"))!;
    expect(f.where).toBe("project");
    expect(f.argv).toEqual([process.execPath, join(root, "node_modules/.bin/slipbox-test-ls"), "--stdio"]);
    expect(f.env).toEqual({ BUN_BE_BUN: "1" });
  });

  test("TypeScript's own server where the project's TypeScript is 7 or none, vtsls for an older one; add-ons where asked", () => {
    const t = serverTable();
    const lang = languageOf(t, "a.ts")!;
    const names = (root: string) => chooseServers(lang, t.servers, root, (r) => projectAsks(root, r)).run.map((r) => r.def.name);
    const old = dir("ts5", { "package.json": "{}", "node_modules/typescript/package.json": '{"version": "5.9.2"}' });
    const now = dir("ts7", { "package.json": "{}", "node_modules/typescript/package.json": '{"version": "7.0.2"}', "eslint.config.js": "export default [];" });
    expect(names(old)).toEqual(["vtsls"]);
    expect(names(now)).toEqual(["typescript", "eslint"]);
    const py = dir("py", { "pyproject.toml": "[project]\nname='p'\n\n[tool.ruff]\nline-length = 100\n" });
    expect(projectAsks(py, ["ruff.toml", "pyproject.toml:[tool.ruff"])).toBe(true);
    expect(projectAsks(old, ["ruff.toml", "pyproject.toml:[tool.ruff"])).toBe(false);
    // A native server nowhere to be found: missing, never installed.
    const native = { name: "slipbox-no-native", command: "slipbox-no-native", args: [] };
    const c = chooseServers({ ...lang, servers: ["slipbox-no-native"] }, { "slipbox-no-native": native }, old, () => false);
    expect(c).toEqual({ run: [], missing: [native] });
  });

  test("installing: into slipbox's tools folder, pinned, its install script not run", async () => {
    const pkg = dir("pkg", {
      "package.json": JSON.stringify({ name: "slipbox-fake-server", version: "1.2.3", bin: { "slipbox-fake-server": "bin.js" }, scripts: { postinstall: "touch POSTINSTALL_RAN" } }),
      "bin.js": "#!/usr/bin/env node\nconsole.log('ok')\n",
    });
    const into = join(sandbox, "tools-test");
    const r = await installPackages([`file:${pkg}`], into);
    expect(r.ok).toBe(true);
    expect(existsSync(join(into, "node_modules/.bin/slipbox-fake-server"))).toBe(true);
    expect(existsSync(join(into, "node_modules/slipbox-fake-server/POSTINSTALL_RAN"))).toBe(false);
    expect(JSON.parse(readFileSync(join(into, "package.json"), "utf8")).dependencies["slipbox-fake-server"]).toBe(`file:${pkg}`);
  });
});
