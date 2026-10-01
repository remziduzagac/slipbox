// slipbox's own installs of servers published on npm (plan 19.5): into a package folder in its data
// folder (`core/servers/find.ts`, `toolsDir`), each at the version slipbox pins, their install scripts
// never run, nothing global — with slipbox's own Bun (the compiled binary is Bun when told to be).
// Native servers are never installed: the system is the user's.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { toolsDir } from "./find.ts";

export interface InstallResult {
  ok: boolean;
  /** What Bun said: why it failed, when it did. */
  output: string;
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Install packages (`name@version`, or any spec Bun takes) into slipbox's tools folder, one install
 * at a time (two at once would race over its package.json).
 */
export function installPackages(specs: string[], dir = toolsDir(), timeoutMs = 180_000): Promise<InstallResult> {
  const run = async (): Promise<InstallResult> => {
    mkdirSync(dir, { recursive: true });
    const manifest = join(dir, "package.json");
    if (!existsSync(manifest)) writeFileSync(manifest, `${JSON.stringify({ name: "slipbox-tools", private: true }, null, 2)}\n`);
    const p = Bun.spawn([process.execPath, "add", "--exact", "--ignore-scripts", ...specs], {
      cwd: dir,
      env: { ...process.env, BUN_BE_BUN: "1" },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const timer = setTimeout(() => p.kill(), timeoutMs);
    const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    clearTimeout(timer);
    return { ok: code === 0, output: `${out}${err}`.trim() };
  };
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}
