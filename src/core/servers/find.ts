// Where a file's project starts, and where a server's program is (plans 19.3, 19.4). A program is
// found, in order: the path the user's config gives; the project's own (`node_modules/.bin`,
// `.venv/bin`, `vendor/bin`, up to the checkout's top), in a root you trust (23.2); PATH; places tools
// are installed by the user (Mason's, cargo's, go's); slipbox's own installs (19.5) — the one under the lock slipbox
// ships now, else, behind, an older one (14.11). A launcher written for Node runs on slipbox's own Bun, so no Node is
// needed.

import { existsSync, openSync, readdirSync, readFileSync, readSync, closeSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { checkoutOf } from "../git.ts";
import { isTrusted } from "../trust.ts";
import type { LanguageDef, ServerDef } from "./languages.ts";

/**
 * A file's project: the nearest folder above it holding the first of the language's root markers
 * found, then the next marker's — never `~` or `/` — else the file's own folder.
 */
export function rootFor(file: string, markers: string[]): string {
  const start = dirname(file);
  const home = homedir();
  for (const marker of markers) {
    for (let dir = start; dir !== home && dirname(dir) !== dir; dir = dirname(dir)) {
      if (existsSync(join(dir, marker))) return dir;
    }
  }
  return start;
}

/** Where a found program came from, as `slipbox doctor` says it. */
export type Where = "config" | "project" | "path" | "user-install" | "slipbox";

export interface Found {
  /** What to run: the program (or Bun and its script) and the server's arguments. */
  argv: string[];
  env: Record<string, string>;
  where: Where;
  /** The program's file. */
  path: string;
  /** slipbox's own install, under an older lock than the one it ships (14.11): run only until it's installed again —
   *  at once when installing is on. `installed`: its version, when it can be read. */
  behind?: { installed: string | null };
}

/** The folders of a project's own programs, nearest first: from its top folder up to its checkout's. */
function projectBins(root: string): string[] {
  const top = checkoutOf(root)?.root ?? root;
  const out: string[] = [];
  for (let dir = root; ; dir = dirname(dir)) {
    for (const bin of ["node_modules/.bin", ".venv/bin", "venv/bin", "vendor/bin"]) out.push(join(dir, bin));
    if (dir === top || dirname(dir) === dir || !dir.startsWith(top)) break;
  }
  return out;
}

/** Where the user installs tools themselves, beside PATH. */
function userInstalls(): string[] {
  const home = homedir();
  return [join(process.env.XDG_DATA_HOME ?? join(home, ".local", "share"), "nvim", "mason", "bin"), join(home, ".cargo", "bin"), join(home, "go", "bin"), join(home, ".local", "bin")];
}

import { type NpmSpec, toolFolder, toolSlug, toolsDir } from "./install.ts";
export { toolsDir } from "./install.ts";

/**
 * slipbox's install of a package (14.11): the one under the lock it ships now — else, behind, the newest under an
 * older lock, or in the one folder it installed into before (`tools/node_modules`), with the version it has.
 */
export function ownInstall(npm: NpmSpec, base = toolsDir()): { path: string; behind: { installed: string | null } | null } | null {
  const current = toolFolder(npm, base);
  const binIn = (dir: string) => join(dir, "node_modules", ".bin", npm.bin);
  if (current && isFile(binIn(current))) return { path: binIn(current), behind: null };
  const parent = join(base, toolSlug(npm.package));
  let older: { dir: string; at: number }[] = [];
  try {
    older = readdirSync(parent)
      .filter((d) => !d.includes(".new-"))
      .map((d) => ({ dir: join(parent, d), at: statSync(join(parent, d)).mtimeMs }))
      .sort((a, b) => b.at - a.at);
  } catch {}
  for (const dir of [...older.map((o) => o.dir), base]) {
    if (dir === current || !isFile(binIn(dir))) continue;
    let installed: string | null = null;
    try {
      installed = (JSON.parse(readFileSync(join(dir, "node_modules", npm.package, "package.json"), "utf8")) as { version?: string }).version ?? null;
    } catch {}
    return { path: binIn(dir), behind: { installed } };
  }
  return null;
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** Whether a program is a script written for Node (`#!/usr/bin/env node`): run on Bun instead. */
function nodeScript(path: string): boolean {
  let fd: number | null = null;
  try {
    fd = openSync(path, "r");
    const buf = Buffer.alloc(128);
    const n = readSync(fd, buf, 0, 128, 0);
    const head = buf.subarray(0, n).toString("utf8");
    return head.startsWith("#!") && /\bnode\b/.test(head.split("\n")[0]!);
  } catch {
    return false;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

/**
 * How to run a program found at `path` with the server's arguments: a Node script on slipbox's own Bun.
 * That Bun starts in the root, and would read the root's bunfig.toml (running its preload) and .env:
 * a repository's own code, run by opening a file. No config and no .env, then.
 */
export function runnable(path: string, args: string[], where: Where): Found {
  if (!nodeScript(path)) return { argv: [path, ...args], env: {}, where, path };
  // Compiled, slipbox's binary is Bun when told to be (decisions, 11.1).
  return { argv: [process.execPath, "--config=/dev/null", "--no-env-file", realpathSync(path), ...args], env: { BUN_BE_BUN: "1" }, where, path };
}

/** A server's program, wherever it is; null when it's nowhere (installable or not). A project's own
 *  programs only in a root you trust (23.2): elsewhere they're the project's code. */
export function findServer(def: ServerDef, root: string): Found | null {
  if (isAbsolute(def.command)) return isFile(def.command) ? runnable(def.command, def.args, "config") : null;
  for (const dir of isTrusted(root) ? projectBins(root) : []) {
    const p = join(dir, def.command);
    if (isFile(p)) return runnable(p, def.args, "project");
  }
  if (!def.ownOnly) {
    const onPath = Bun.which(def.command, { PATH: process.env.PATH ?? "" });
    if (onPath) return runnable(onPath, def.args, "path");
    for (const dir of userInstalls()) {
      const p = join(dir, def.command);
      if (isFile(p)) return runnable(p, def.args, "user-install");
    }
  }
  if (def.npm) {
    const own = ownInstall(def.npm);
    if (own) return { ...runnable(own.path, def.args, "slipbox"), ...(own.behind ? { behind: own.behind } : {}) };
  }
  return null;
}

/** What serves a file of a language in a project: its main server and the add-ons the project asks for. */
export interface Choice {
  /** Each server to run, found, or to install first (`install`: npm, not found yet). */
  run: { def: ServerDef; found: Found | null }[];
  /** Servers it would have had, not found and not installable: what `doctor` says to install. */
  missing: ServerDef[];
  /** Servers that would run the project's code, left out in a root you don't trust (23.4), and why. */
  skipped: { def: ServerDef; why: string }[];
}

/**
 * The servers for a language in a project: the first main server that applies and is found — or,
 * when none is, the first that slipbox can install — then each add-on whose config the project has.
 */
export function chooseServers(lang: LanguageDef, servers: Record<string, ServerDef>, root: string, asks: (requires: string[]) => boolean): Choice {
  const skipped: Choice["skipped"] = [];
  const trusted = isTrusted(root);
  // In a root not trusted, a server that would run the project's code isn't run (23.4).
  const runs = (d: ServerDef) => {
    const why = trusted ? null : (d.untrusted?.skip?.(root) ?? null);
    if (why && (!d.requires || asks(d.requires))) skipped.push({ def: d, why });
    return !why;
  };
  // Its own names only: `toString` is a name slipbox doesn't know, not Object's method.
  const defs = lang.servers.map((n) => (Object.hasOwn(servers, n) ? servers[n] : undefined)).filter((d): d is ServerDef => !!d);
  const mains = defs.filter((d) => !d.requires && (!d.when || d.when(root)) && runs(d));
  const run: Choice["run"] = [];
  const missing: ServerDef[] = [];
  const found = mains.map((d) => ({ def: d, found: findServer(d, root) }));
  const main = found.find((m) => m.found) ?? found.find((m) => m.def.npm);
  if (main) run.push(main);
  else missing.push(...mains);
  for (const d of defs) {
    if (!d.requires || !asks(d.requires) || !runs(d)) continue;
    const f = findServer(d, root);
    if (f || d.npm) run.push({ def: d, found: f });
    else missing.push(d);
  }
  return { run, missing, skipped };
}
