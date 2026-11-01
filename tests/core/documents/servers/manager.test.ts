import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Problem } from "../../../../src/core/documents/diagnostics/diagnostics.ts";
import { ownInstall, toolsDir } from "../../../../src/core/documents/servers/find.ts";
import { lockKey, toolFolder } from "../../../../src/core/documents/servers/install.ts";
import {
  languageOf,
  type ServerDef,
  serverTable,
  type ServerTable,
} from "../../../../src/core/documents/servers/languages.ts";
import { LOCKS } from "../../../../src/core/documents/servers/locks.ts";
import { ServerManager, startOf } from "../../../../src/core/documents/servers/manager.ts";
import { vscodeSettings } from "../../../../src/core/documents/servers/vscode.ts";
import { setTrust, setTrustedRoots } from "../../../../src/core/workspace/vaults/trust.ts";
import { events, FAKE, until } from "../../../support/server-process.ts";
import { makeServerSandbox } from "../../../support/server-sandbox.ts";
import { UNIT_TIMEOUT_MS, TEST_BUDGETS } from "../../../support/timeouts.ts";

setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, lockFor } = makeServerSandbox();

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

  test("startup work stops, restarts the same server and retains failures", async () => {
    const root = project("background-controls");
    const t = table({
      fake: { name: "fake", command: launcher("fake-background"), args: ["--stdio"] },
    });
    const controls: { cancel: () => void; restart: () => void }[] = [];
    const outcomes: { outcome?: string; error?: string }[] = [];
    const e = events();
    const m = new ServerManager({
      table: () => t,
      autoInstall: () => false,
      problems: () => {},
      message: () => {},
      starting: (_label, cancel, restart) => {
        controls.push({ cancel, restart });
        e.heard();
        return (outcome, error) => {
          outcomes.push({ outcome, error });
          e.heard();
        };
      },
    });
    try {
      m.open(join(root, "one.fk"), 1, "ok\n");
      await e.when(() => controls.length === 1);
      controls[0]!.cancel();
      controls[0]!.restart();
      await e.when(() => outcomes.length === 2);
      expect(controls).toHaveLength(2);
      expect(outcomes.map((result) => result.outcome)).toEqual(["stopped", "done"]);
      expect(m.list()[0]!.state).toBe("running");
    } finally {
      await m.stopAll();
    }
    const failed: { outcome?: string; error?: string }[] = [];
    const bad = new ServerManager({
      table: () =>
        table({ fake: { name: "fake", command: launcher("fake-background-bad", "process.exit(3);\n"), args: [] } }),
      autoInstall: () => false,
      problems: () => {},
      message: () => {},
      starting: () => (outcome, error) => {
        failed.push({ outcome, error });
        e.heard();
      },
    });
    try {
      bad.open(join(root, "two.fk"), 1, "ok\n");
      await e.when(() => failed.length > 0);
      expect(failed[0]!.outcome).toBe("failed");
      expect(failed[0]!.error).toBeTruthy();
    } finally {
      await bad.stopAll();
    }
  });

  describe("a server's limits as the manager has them: slipbox goes on, the server too, the user told", () => {
    const pulling = (name: string) =>
      table({ fake: { name: "fake", command: launcher(name, 'process.env.FAKE_PULL = "1";\n'), args: ["--stdio"] } });

    test(
      "crashed with 70 files open: started again, each file told again and answered — no burst stops it",
      async () => {
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
      },
      TEST_BUDGETS.serverRestart,
    );

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

  test(
    "the TUI's way (23.x): a root not answered for is asked about once, not told; kept restricted, neither; trusted, its servers started again as anywhere",
    async () => {
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
    },
    TEST_BUDGETS.serverTrust,
  ); // three servers started one after another: the time a loaded machine takes

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
  test(
    "a crash: started again, its files told again; one that keeps crashing is left stopped",
    async () => {
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
    },
    TEST_BUDGETS.serverCrashLoop,
  );

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
