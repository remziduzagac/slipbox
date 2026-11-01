import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pinned } from "../../../../scripts/lock-servers.ts";
import { loadConfig } from "../../../../src/core/application/config/config.ts";
import { lintCommand, MARKDOWNLINT } from "../../../../src/core/documents/diagnostics/lint.ts";
import { doctor, doctorFile } from "../../../../src/core/documents/servers/doctor.ts";
import {
  chooseServers,
  findServer,
  ownInstall,
  rootFor,
  toolsDir,
} from "../../../../src/core/documents/servers/find.ts";
import {
  INSTALL_ARGS,
  installTool,
  lockKey,
  toolFolder,
  toolManifest,
  toolSlug,
} from "../../../../src/core/documents/servers/install.ts";
import {
  languageOf,
  projectAsks,
  SERVERS,
  type ServerDef,
  serverTable,
  type ServerTable,
} from "../../../../src/core/documents/servers/languages.ts";
import { linterTable } from "../../../../src/core/documents/servers/linters.ts";
import { LOCKS } from "../../../../src/core/documents/servers/locks.ts";
import { ServerManager } from "../../../../src/core/documents/servers/manager.ts";
import { setTrustedRoots } from "../../../../src/core/workspace/vaults/trust.ts";
import { makeServerSandbox } from "../../../support/server-sandbox.ts";
import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";

setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, lockFor, serverPackage } = makeServerSandbox();

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
