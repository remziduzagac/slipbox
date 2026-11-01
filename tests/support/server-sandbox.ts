import { afterAll, afterEach } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type NpmSpec, toolManifest } from "../../src/core/documents/servers/install.ts";
import { setTrustedRoots } from "../../src/core/workspace/vaults/trust.ts";

/** Each server-test owner registers its own environment, trust reset and filesystem cleanup. */
export function makeServerSandbox() {
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

  return { sandbox, lockFor, serverPackage };
}
