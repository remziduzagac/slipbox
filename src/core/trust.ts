// Which roots may run their own code (plan 23.x, decisions.md): those your config's `[trust] roots`
// lists. Elsewhere slipbox runs nothing a folder brings — not its programs, not the settings that
// name one, not the code a server or git would run of it by default. A root's own config can't list
// itself (config.ts), and the CLI never asks.

import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

let roots: string[] = [];

/** Your config's trusted roots, as the CLI or the TUI loaded it (on each config reload too). */
export function setTrustedRoots(list: string[]): void {
  roots = list;
}

/** A pattern as a path: `~` your home, the rest as written, never ending in `/`. */
function expand(pattern: string, home = homedir()): string {
  const p = pattern === "~" ? home : pattern.startsWith("~/") ? join(home, pattern.slice(2)) : resolve(pattern);
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

/** Whether `dir` is a listed root: the same path, or one a glob (`*`, `?`, `[…]`, `**`) matches. */
function listed(dir: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    const p = expand(pattern);
    return /[*?[]/.test(p) ? new Bun.Glob(p).match(dir) : p === dir;
  });
}

/** Whether `path` — a root, a project, a file — is in a trusted root: it or a folder above it listed. */
export function isTrusted(path: string, patterns = roots): boolean {
  if (!patterns.length) return false;
  const seen = new Set<string>();
  let real = path;
  try {
    real = realpathSync(path);
  } catch {}
  for (const start of [resolve(path), real]) {
    for (let dir = start; ; dir = dirname(dir)) {
      if (seen.has(dir)) break;
      seen.add(dir);
      if (listed(dir, patterns)) return true;
      if (dirname(dir) === dir) break;
    }
  }
  return false;
}
