// Which roots may run their own code (plan 23.x, blueprint/design/trust.md): those you trusted when the TUI asked
// (kept in slipbox's state, `trust.json`), and those your config's `[trust] roots` lists. Elsewhere
// slipbox runs nothing a folder brings — not its programs, not the settings that name one, not the
// code a server or git would run of it by default. A root's own config can't list itself
// (config.ts), and the CLI never asks, nor trusts: an agent could be talked into it.

import { realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ensureDir, readJson, writeJson } from "./fsutil.ts";
import { stateHome } from "./paths.ts";

let roots: string[] = [];

/** What you answered, root by root: trusted, or kept restricted (not asked again). */
interface Decisions {
  trusted: string[];
  restricted: string[];
}

export function trustFile(): string {
  return join(stateHome(), "trust.json");
}

let cache: { file: string; mtime: number; d: Decisions } | null = null;

/** Your answers, read again when the file changed (another slipbox answered). */
function decisions(): Decisions {
  const file = trustFile();
  let mtime = -1;
  try {
    mtime = statSync(file).mtimeMs;
  } catch {}
  if (cache?.file === file && cache.mtime === mtime) return cache.d;
  const raw = readJson<Partial<Decisions> | null>(file, null);
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((p): p is string => typeof p === "string") : []);
  const d = { trusted: list(raw?.trusted), restricted: list(raw?.restricted) };
  cache = { file, mtime, d };
  return d;
}

/** A root trusted, or kept restricted, from now on — or, null, back to asking. Written to your state. */
export function setTrust(root: string, answer: "trusted" | "restricted" | null): void {
  const at = real(root);
  const d = decisions();
  const next: Decisions = { trusted: d.trusted.filter((p) => p !== at), restricted: d.restricted.filter((p) => p !== at) };
  if (answer) next[answer].push(at);
  ensureDir(stateHome());
  writeJson(trustFile(), next);
  cache = null;
}

function real(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

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

/**
 * What `path` — a root, a project, a file — is: in a root you trusted (your answer, or your config's
 * list), in one you kept restricted, or neither yet (null: the TUI may ask). The nearest answer counts;
 * your config's list trusts whatever it names.
 */
export function trustOf(path: string, patterns = roots): "trusted" | "restricted" | null {
  const d = decisions();
  const seen = new Set<string>();
  let nearest: "trusted" | "restricted" | null = null;
  for (const start of [resolve(path), real(path)]) {
    for (let dir = start; ; dir = dirname(dir)) {
      if (seen.has(dir)) break;
      seen.add(dir);
      if (patterns.length && listed(dir, patterns)) return "trusted";
      if (!nearest) nearest = d.trusted.includes(dir) ? "trusted" : d.restricted.includes(dir) ? "restricted" : null;
      if (dirname(dir) === dir) break;
    }
  }
  return nearest;
}

/** Whether `path` is in a root you trust: its own code may run there. */
export function isTrusted(path: string, patterns = roots): boolean {
  return trustOf(path, patterns) === "trusted";
}
