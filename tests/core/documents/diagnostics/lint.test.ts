import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type LintIssue,
  lintCommand,
  MARKDOWNLINT,
  parseLint,
  runLint,
} from "../../../../src/core/documents/diagnostics/lint.ts";
import { installTool, lockKey, toolFolder, toolManifest } from "../../../../src/core/documents/servers/install.ts";
import { LOCKS } from "../../../../src/core/documents/servers/locks.ts";
import { setTrustedRoots } from "../../../../src/core/workspace/vaults/trust.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const sandbox = makeCoreSandbox();

describe("the lint surface (3.21)", () => {
  test("markdownlint-cli2's lines read: path, line, column, rule and its name, what's wrong; the rest ignored", () => {
    const out = [
      "markdownlint-cli2 v0.23.3 (markdownlint v0.41.1)",
      "Summary: 3 issues in 2 files",
      'notes/a.md:14 error MD025/single-title/single-h1 Multiple top-level headings [Context: "T"]',
      "notes/a.md:3:121 error MD013/line-length Line length [Expected: 120; Actual: 138]",
      "/abs/b.md:7:1 warning MD029/ol-prefix Ordered list item prefix",
    ].join("\n");
    expect(parseLint(out, "/v")).toEqual([
      {
        file: "/abs/b.md",
        line: 7,
        column: 1,
        rule: "MD029",
        name: "ol-prefix",
        description: "Ordered list item prefix",
      },
      {
        file: "/v/notes/a.md",
        line: 3,
        column: 121,
        rule: "MD013",
        name: "line-length",
        description: "Line length [Expected: 120; Actual: 138]",
      },
      {
        file: "/v/notes/a.md",
        line: 14,
        column: null,
        rule: "MD025",
        name: "single-title",
        description: 'Multiple top-level headings [Context: "T"]',
      },
    ]);
  });

  test("which linter: off; auto only with a markdownlint config (yours, or the vault's); markdownlint-cli2 with yours unless the vault has its own — found as a server is, the vault's own first, else installed first (19.21); [lint] command as given", () => {
    setTrustedRoots([sandbox]); // a root you trust (23.x): the vault's own markdownlint-cli2 counts
    const home = mkdtempSync(join(sandbox, "home-"));
    const vault = mkdtempSync(join(sandbox, "vault-"));
    const cfg = (enabled: "auto" | "on" | "off", command: string[] = []) => ({ enabled, command });
    const install = MARKDOWNLINT.npm;
    const was = process.env.PATH;
    process.env.PATH = "/usr/bin:/bin"; // never the machine's own
    try {
      expect(lintCommand(cfg("off"), vault, home)).toBeNull();
      expect(lintCommand(cfg("auto"), vault, home)).toBeNull(); // no config anywhere: markdownlint's defaults are no one's rules
      expect(lintCommand(cfg("on"), vault, home)).toEqual({ argv: [], literal: true, install });
      expect(lintCommand(cfg("on"), vault, home, false)).toEqual({ argv: ["markdownlint-cli2"], literal: true }); // installing off: it won't run, and says so
      const user = join(home, ".markdownlint-cli2.jsonc");
      writeFileSync(user, "{}");
      expect(lintCommand(cfg("auto"), vault, home)).toEqual({ argv: ["--config", user], literal: true, install });
      // The vault's own copy, a Node script: run on slipbox's Bun.
      const own = join(vault, "node_modules", ".bin", "markdownlint-cli2");
      mkdirSync(join(own, ".."), { recursive: true });
      writeFileSync(own, "#!/usr/bin/env node\n");
      chmodSync(own, 0o755);
      expect(lintCommand(cfg("auto"), vault, home)).toEqual({
        argv: [process.execPath, "--config=/dev/null", "--no-env-file", own, "--config", user],
        literal: true,
        env: { BUN_BE_BUN: "1" },
      });
      writeFileSync(join(vault, ".markdownlint.json"), "{}");
      expect(lintCommand(cfg("auto"), vault, home)!.argv).toEqual([
        process.execPath,
        "--config=/dev/null",
        "--no-env-file",
        own,
      ]); // the vault's own config
      expect(lintCommand(cfg("auto", ["mdl", "--config", "~/mdl.json"]), vault, home)).toEqual({
        argv: ["mdl", "--config", join(home, "mdl.json")],
        literal: false,
      });
    } finally {
      process.env.PATH = was;
    }
  });

  test("markdownlint-cli2 installed into slipbox's own folder when first needed — once, however many runs ask — then run (19.21)", async () => {
    const pkg = mkdtempSync(join(sandbox, "fake-mdl-"));
    writeFileSync(
      join(pkg, "package.json"),
      JSON.stringify({ name: "fake-mdl", version: "1.0.0", bin: { "markdownlint-cli2": "bin.mjs" } }),
    );
    writeFileSync(
      join(pkg, "bin.mjs"),
      "#!/usr/bin/env node\nfor (const f of process.argv.slice(2)) console.log(`${f.slice(1)}:1 error MD001/heading-increment Heard`);\nprocess.exit(1);\n",
    );
    const npm = { package: "fake-mdl", version: `file:${pkg}`, bin: "markdownlint-cli2" };
    // Its lock, as scripts/lock-servers.ts makes one (14.11) — a local package's path made absolute: no network.
    const lockDir = mkdtempSync(join(sandbox, "mdl-lock-"));
    writeFileSync(join(lockDir, "package.json"), toolManifest(npm));
    expect(
      Bun.spawnSync([process.execPath, "install", "--lockfile-only", "--ignore-scripts"], {
        cwd: lockDir,
        env: { ...process.env, BUN_BE_BUN: "1" },
      }).exitCode,
    ).toBe(0);
    LOCKS[lockKey(npm)] = readFileSync(join(lockDir, "bun.lock"), "utf8").replace(
      /@file:([^"/][^"]*)"/g,
      (_, rel: string) => `@file:${resolve(lockDir, rel)}"`,
    );
    const v = mkdtempSync(join(sandbox, "lint-"));
    const said: string[] = [];
    const cmd = { argv: [], literal: true, install: npm };
    const was = process.env.PATH;
    process.env.PATH = "/usr/bin:/bin";
    try {
      const [a, b] = await Promise.all([
        runLint(cmd, ["/v/a.md"], v, undefined, (t) => said.push(t)),
        runLint(cmd, ["/v/b.md"], v, undefined, (t) => said.push(t)),
      ]);
      expect(a).toMatchObject([{ file: "/v/a.md", line: 1, rule: "MD001", description: "Heard" }]);
      expect(b).toMatchObject([{ file: "/v/b.md" }]);
      expect(said).toEqual([`installing fake-mdl@file:${pkg} into slipbox's own folder…`]);
      expect(existsSync(join(toolFolder(npm)!, "node_modules", ".bin", "markdownlint-cli2"))).toBe(true);
      // Installed: never installed again.
      expect(await runLint(cmd, ["/v/c.md"], v, undefined, (t) => said.push(t))).toMatchObject([{ file: "/v/c.md" }]);
      expect(said).toHaveLength(1);
      // An install that fails (no lock for it): the linter doesn't run, and the next run tries again.
      const broken = {
        argv: [],
        literal: true,
        install: {
          package: "no-such-mdl",
          version: `file:${join(sandbox, "no-such-package")}`,
          bin: "markdownlint-cli2",
        },
      };
      expect(await runLint(broken, ["/v/a.md"], v, undefined, (t) => said.push(t))).toBeNull();
      expect(await runLint(broken, ["/v/a.md"], v, undefined, (t) => said.push(t))).toBeNull();
      expect(said.filter((t) => t.includes("no-such-package"))).toHaveLength(2);
    } finally {
      process.env.PATH = was;
      // The fake's lock out again: LOCKS is the module's, which a later test file reads whole.
      delete LOCKS[lockKey(npm)];
    }
  });

  test("a lint run cancelled while markdownlint-cli2 waits to be installed: the install stops too, and the next run installs it", async () => {
    const pkg = mkdtempSync(join(sandbox, "fake-mdl-cancel-"));
    writeFileSync(
      join(pkg, "package.json"),
      JSON.stringify({ name: "fake-mdl-cancel", version: "1.0.0", bin: { "markdownlint-cli2": "bin.mjs" } }),
    );
    writeFileSync(
      join(pkg, "bin.mjs"),
      "#!/usr/bin/env node\nfor (const f of process.argv.slice(2)) console.log(`${f.slice(1)}:1 error MD001/heading-increment Heard`);\nprocess.exit(1);\n",
    );
    const npm = { package: "fake-mdl-cancel", version: `file:${pkg}`, bin: "markdownlint-cli2" };
    const lockDir = mkdtempSync(join(sandbox, "mdl-cancel-lock-"));
    writeFileSync(join(lockDir, "package.json"), toolManifest(npm));
    expect(
      Bun.spawnSync([process.execPath, "install", "--lockfile-only", "--ignore-scripts"], {
        cwd: lockDir,
        env: { ...process.env, BUN_BE_BUN: "1" },
      }).exitCode,
    ).toBe(0);
    LOCKS[lockKey(npm)] = readFileSync(join(lockDir, "bun.lock"), "utf8").replace(
      /@file:([^"/][^"]*)"/g,
      (_, rel: string) => `@file:${resolve(lockDir, rel)}"`,
    );
    const v = mkdtempSync(join(sandbox, "lint-"));
    const cmd = { argv: [], literal: true, install: npm };
    const was = process.env.PATH;
    process.env.PATH = "/usr/bin:/bin";
    try {
      const controller = new AbortController();
      const run = runLint(cmd, ["/v/a.md"], v, undefined, undefined, controller.signal);
      controller.abort();
      expect(await run).toEqual({ skipped: "tool cancelled" });
      // Once the installs queued before it are done, nothing of this one is there.
      await installTool({ package: "none", version: "0", bin: "none" }, { locks: {} });
      expect(existsSync(toolFolder(npm)!)).toBe(false);
      // The next run installs it. One cancelled while waiting on that install stops waiting at once.
      const next = runLint(cmd, ["/v/a.md"], v);
      const waiting = runLint(cmd, ["/v/b.md"], v, undefined, undefined, AbortSignal.abort());
      expect(await waiting).toEqual({ skipped: "tool cancelled" });
      expect(existsSync(toolFolder(npm)!)).toBe(false); // the install it waited on not done yet
      expect(await next).toMatchObject([{ file: "/v/a.md", rule: "MD001" }]);
    } finally {
      process.env.PATH = was;
      delete LOCKS[lockKey(npm)];
    }
  });

  test("run: the files given (literal paths for markdownlint-cli2), the findings read; a linter that isn't there, or fails saying nothing, is null", async () => {
    const v = mkdtempSync(join(sandbox, "lint-"));
    const echo = {
      argv: [
        "sh",
        "-c",
        'for f; do printf "%s:2 error MD001/heading-increment Heading levels\\n" "$f"; done; exit 1',
        "lint",
      ],
      literal: false,
    };
    expect(await runLint(echo, ["/v/a.md", "/v/b [x].md"], v)).toMatchObject([
      { file: "/v/a.md", line: 2, rule: "MD001" },
      { file: "/v/b [x].md", line: 2, rule: "MD001" },
    ]);
    const said = { argv: ["sh", "-c", 'printf "x.md:1 error MD001/said %s\\n" "$1"', "lint"], literal: true };
    expect(((await runLint(said, ["/v/a[1].md"], v)) as LintIssue[])[0]!.description).toBe(":/v/a[1].md"); // a literal path, never a glob
    expect(await runLint({ argv: ["no-such-linter-slipbox-test"], literal: false }, ["/v/a.md"], v)).toBeNull();
    expect(await runLint({ argv: ["sh", "-c", "exit 2"], literal: false }, ["/v/a.md"], v)).toBeNull();
  });
});
