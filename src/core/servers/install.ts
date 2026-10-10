// slipbox's own installs of servers published on npm (plans 19.5, 14.11). Each package goes in a folder of its own —
// `tools/<package>/<lock>/` — from the lockfile slipbox ships for it (`locks.ts`, made by scripts/lock-servers.ts):
// that lock put beside its package.json and installed frozen, so every package under it is the version, and the
// content (its integrity hash), the lockfile says. Install scripts never run, nothing is global, and slipbox's own
// Bun does it (the compiled binary is Bun when told to be). A pin or a lock that changes is a new folder: what an older
// one installed is behind, used only until it's installed again (`find.ts`, `ownInstall`). Native servers are never
// installed: the system is the user's.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { dataHome } from "../paths.ts";
import type { ServerDef } from "./languages.ts";
import { LOCKS } from "./locks.ts";

export type NpmSpec = NonNullable<ServerDef["npm"]>;

export interface InstallResult {
  ok: boolean;
  /** What Bun said: why it failed, when it did. */
  output: string;
}

/** slipbox's own installs (19.5): a folder of its own, never global. */
export function toolsDir(): string {
  return join(dataHome(), "tools");
}

/** A package's lock, by what's installed: the package at its pin, and anything installed beside it. */
export function lockKey(npm: NpmSpec): string {
  return [`${npm.package}@${npm.version}`, ...(npm.with ?? [])].join(" ");
}

/** `name@spec` as a dependency: the last `@` that isn't a scope's. */
function dependency(spec: string): [string, string] {
  const at = spec.indexOf("@", 1);
  if (at < 1) throw new Error(`not a package and its version: ${spec}`);
  return [spec.slice(0, at), spec.slice(at + 1)];
}

/** The package.json a tool's folder gets — the same here and where its lock is made, so the lock fits it. */
export function toolManifest(npm: NpmSpec): string {
  const deps = [[npm.package, npm.version] as [string, string], ...(npm.with ?? []).map(dependency)].sort(([a], [b]) => a.localeCompare(b));
  return `${JSON.stringify({ name: "slipbox-tool", private: true, dependencies: Object.fromEntries(deps) }, null, 2)}\n`;
}

/** A package's folder name: `@scope/name` as `scope+name`. */
export const toolSlug = (pkg: string) => pkg.replace(/^@/, "").replaceAll("/", "+");

/** Where a package is installed under the lock slipbox ships for it; null when it ships none. */
export function toolFolder(npm: NpmSpec, base = toolsDir(), locks: Record<string, string> = LOCKS): string | null {
  const lock = locks[lockKey(npm)];
  return lock === undefined ? null : join(base, toolSlug(npm.package), createHash("sha256").update(lock).digest("hex").slice(0, 12));
}

/** How a tool's folder is installed: exactly its lock, and no package's install script — Bun runs those of packages on
 *  its own trusted list from npm (Biome's among them), so it's said here too. */
export const INSTALL_ARGS = ["install", "--frozen-lockfile", "--ignore-scripts"] as const;

let queue: Promise<unknown> = Promise.resolve();

/**
 * A package installed from its lock, one install at a time: into a folder of its own beside the final one, renamed
 * into place once Bun's done — so a half-done install is never found — and the package's older folders removed.
 */
export function installTool(npm: NpmSpec, opts: { base?: string; locks?: Record<string, string>; timeoutMs?: number } = {}): Promise<InstallResult> {
  const run = async (): Promise<InstallResult> => {
    const base = opts.base ?? toolsDir();
    const locks = opts.locks ?? LOCKS;
    const dir = toolFolder(npm, base, locks);
    if (dir === null) return { ok: false, output: `slipbox ships no lockfile for ${lockKey(npm)}, so it doesn't install it` };
    if (existsSync(join(dir, "node_modules", ".bin", npm.bin))) return { ok: true, output: "" };
    const work = `${dir}.new-${process.pid}`;
    rmSync(work, { recursive: true, force: true });
    mkdirSync(work, { recursive: true });
    writeFileSync(join(work, "package.json"), toolManifest(npm));
    writeFileSync(join(work, "bun.lock"), locks[lockKey(npm)]!);
    const p = Bun.spawn([process.execPath, ...INSTALL_ARGS], {
      cwd: work,
      env: { ...process.env, BUN_BE_BUN: "1" },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const timer = setTimeout(() => p.kill(), opts.timeoutMs ?? 180_000);
    const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    clearTimeout(timer);
    if (code !== 0 || !existsSync(join(work, "node_modules", ".bin", npm.bin))) {
      rmSync(work, { recursive: true, force: true });
      return { ok: false, output: `${out}${err}`.trim() || `${npm.bin} isn't in it` };
    }
    rmSync(dir, { recursive: true, force: true });
    renameSync(work, dir);
    // What older locks installed of it goes; another install under way (`.new-<pid>`) is left to finish.
    const parent = join(base, toolSlug(npm.package));
    for (const other of readdirSync(parent)) if (other !== basename(dir) && !other.includes(".new-")) rmSync(join(parent, other), { recursive: true, force: true });
    return { ok: true, output: `${out}${err}`.trim() };
  };
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}
