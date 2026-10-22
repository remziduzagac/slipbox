// The lint surface (3.21): run the linter you already use — markdownlint-cli2, with your own
// configuration — and show what it finds where it is. slipbox ships no linter of its own: a
// built-in one would fight the rules you've written (D160).
// markdownlint-cli2 is found as a server is (the vault's own copy, PATH, your installs), else
// installed into slipbox's own folder when first needed (19.21), and run on slipbox's Bun.

import { LINT_OUTPUT_BYTES, runTool, toolFailure } from "./tool-process.ts";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { Config } from "./config.ts";
import { isTrusted } from "./trust.ts";
import { findServer } from "./servers/find.ts";
import { installTool, lockKey, type NpmSpec } from "./servers/install.ts";
import type { ServerDef } from "./servers/languages.ts";

export interface LintIssue {
  /** Absolute. */
  file: string;
  line: number;
  column: number | null;
  /** `MD013`, and its name: `line-length`. */
  rule: string;
  name: string;
  description: string;
}

/** The config files markdownlint-cli2 reads by itself, from where it runs. */
const VAULT_CONFIGS = [
  ".markdownlint-cli2.jsonc",
  ".markdownlint-cli2.yaml",
  ".markdownlint-cli2.cjs",
  ".markdownlint-cli2.mjs",
  ".markdownlint.jsonc",
  ".markdownlint.json",
  ".markdownlint.yaml",
  ".markdownlint.yml",
  ".markdownlint.cjs",
  ".markdownlint.mjs",
];

/** markdownlint-cli2's configs that are code, and the keys by which one names code it loads. */
const CODE_CONFIGS = [".markdownlint-cli2.cjs", ".markdownlint-cli2.mjs", ".markdownlint.cjs", ".markdownlint.mjs"];
const LOADS_CODE = /["']?(customRules|markdownItPlugins|outputFormatters)["']?\s*:/;

/**
 * Whether markdownlint-cli2 would load code to lint `file`: a config in its folder, or one above it in
 * `root`, that is code (`.cjs`, `.mjs`) or names code to load (`customRules`…). In a root you don't
 * trust, such a file isn't linted (23.5). `seen` keeps each folder's answer for a run.
 */
export function lintLoadsCode(file: string, root: string, seen = new Map<string, boolean>()): boolean {
  for (let dir = dirname(file); ; dir = dirname(dir)) {
    let hit = seen.get(dir);
    if (hit === undefined) {
      hit =
        CODE_CONFIGS.some((f) => existsSync(join(dir, f))) ||
        VAULT_CONFIGS.filter((f) => !CODE_CONFIGS.includes(f)).some((f) => {
          try {
            return LOADS_CODE.test(readFileSync(join(dir, f), "utf8"));
          } catch {
            return false;
          }
        });
      seen.set(dir, hit);
    }
    if (hit) return true;
    if (dir === root || dirname(dir) === dir || !dir.startsWith(`${root}/`)) return false;
  }
}

/** Roots already told their markdownlint config loads code (said once). */
const codeSaid = new Set<string>();

/** markdownlint-cli2 as slipbox finds and installs it: pinned, its bin a Node script run on slipbox's Bun. */
export const MARKDOWNLINT: ServerDef = {
  name: "markdownlint-cli2",
  command: "markdownlint-cli2",
  args: [],
  npm: { package: "markdownlint-cli2", version: "0.23.3", bin: "markdownlint-cli2" },
};

export interface LintCmd {
  argv: string[];
  /** markdownlint-cli2's paths taken as they are, never as globs (`:path`). */
  literal: boolean;
  env?: Record<string, string>;
  /** Not found, or slipbox's own behind its lock: installed first (14.11), then found again, its arguments after it. */
  install?: NpmSpec;
}

/**
 * The linter to run in a vault, its files to be appended, or null when lint is off: `[lint]
 * command` as given; else markdownlint-cli2 — with ~/.markdownlint-cli2.jsonc, unless the vault has a
 * markdownlint config of its own (the linter finds that by itself) — wherever it's found, else
 * installed first when installing is on (`[lsp] auto_install`). "auto" lints only where one of those
 * configs is: markdownlint's defaults are no one's rules for notes.
 */
export function lintCommand(
  lint: Config["lint"],
  vaultRoot: string,
  home = homedir(),
  autoInstall = true,
): LintCmd | null {
  if (lint.enabled === "off") return null;
  if (lint.command.length)
    return { argv: lint.command.map((a) => (a.startsWith("~/") ? join(home, a.slice(2)) : a)), literal: false };
  const own = VAULT_CONFIGS.some((f) => existsSync(join(vaultRoot, f)));
  const user = join(home, ".markdownlint-cli2.jsonc");
  const mine = existsSync(user);
  if (lint.enabled === "auto" && !own && !mine) return null;
  const args = !own && mine ? ["--config", user] : [];
  const found = findServer({ ...MARKDOWNLINT, args }, vaultRoot);
  // slipbox's own, under an older lock (14.11): installed again first, when installing is on.
  if (found && !(found.behind && autoInstall)) return { argv: found.argv, literal: true, env: found.env };
  // Installing off: run by its name, which fails, and the linter is said not to run.
  return autoInstall
    ? { argv: args, literal: true, install: MARKDOWNLINT.npm! }
    : { argv: [MARKDOWNLINT.command, ...args], literal: true };
}

/** What a linter that couldn't run was: yours, or markdownlint-cli2 — not found, or not installed. */
export function lintFailure(config: Pick<Config, "lint" | "lsp">): string {
  if (config.lint.command.length) return "[lint] command couldn't run";
  return config.lsp.auto_install
    ? "markdownlint-cli2 couldn't run (or be installed)"
    : "markdownlint-cli2 isn't installed, and installing is off ([lsp] auto_install)";
}

/** Each install asked for, by its spec: one at a time, shared by every run waiting for it. */
const installs = new Map<string, Promise<boolean>>();

/** `p`'s answer, or false as soon as `signal` aborts: a run cancelled doesn't wait on an install another started. */
function unlessAborted(p: Promise<boolean>, signal?: AbortSignal): Promise<boolean> {
  if (!signal) return p;
  return new Promise((resolve, reject) => {
    const abort = () => resolve(false);
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

/**
 * A command ready to run: markdownlint-cli2 installed first, once however many ask; null when that failed. `signal`
 * cancels an install this run started, and this run's wait for one.
 */
async function ready(
  cmd: LintCmd,
  cwd: string,
  say?: (text: string) => void,
  signal?: AbortSignal,
): Promise<LintCmd | null> {
  const npm = cmd.install;
  if (!npm) return cmd;
  const key = lockKey(npm);
  let installing = installs.get(key);
  if (!installing) {
    say?.(`installing ${npm.package}@${npm.version} into slipbox's own folder…`);
    installing = installTool(npm, { signal }).then((r) => {
      if (!r.ok) installs.delete(key); // tried again next time
      return r.ok;
    });
    installs.set(key, installing);
  }
  if (!(await unlessAborted(installing, signal))) return null;
  const found = findServer({ ...MARKDOWNLINT, npm, args: cmd.argv }, cwd);
  return found ? { argv: found.argv, literal: true, env: found.env } : null;
}

const LINE = /^(.+?):(\d+)(?::(\d+))?\s+(?:(?:error|warning)\s+)?(MD\d+)((?:\/[\w-]+)*)\s+(.*)$/;

/** markdownlint-cli2's findings, one a line — `path:line[:col] error MD013/line-length What [Context]`; the rest ignored. */
export function parseLint(output: string, cwd: string): LintIssue[] {
  const out: LintIssue[] = [];
  for (const raw of output.split(/\r?\n/)) {
    const m = LINE.exec(raw.trim());
    if (!m) continue;
    out.push({
      file: resolve(cwd, m[1]!),
      line: Number(m[2]),
      column: m[3] ? Number(m[3]) : null,
      rule: m[4]!,
      name: m[5]!.split("/")[1] ?? "",
      description: m[6]!.trim(),
    });
  }
  return out.sort((a, b) =>
    a.file === b.file ? a.line - b.line || (a.column ?? 0) - (b.column ?? 0) : a.file < b.file ? -1 : 1,
  );
}

/** A run whose findings aren't shown though the linter works: its output past slipbox's limit, or cancelled. */
export type LintSkipped = { skipped: string };

/**
 * Lint `files` (absolute) with `cmd`, from `cwd`: the findings; null when the linter couldn't run
 * (not installed, or it failed on its own); `skipped`, saying why, when this run's output can't be
 * read whole but the linter works. markdownlint-cli2 takes globs, so the default command gets each
 * path as a literal (`:path`). `say`: told when it's installed first, and why a run failed.
 */
export async function runLint(
  given: LintCmd,
  files: string[],
  cwd: string,
  timeoutMs = 60_000,
  say?: (text: string) => void,
  signal?: AbortSignal,
): Promise<LintIssue[] | LintSkipped | null> {
  // markdownlint-cli2's own configs, in a root you don't trust: none of them run as code (23.5).
  if (given.literal && !isTrusted(cwd)) {
    const seen = new Map<string, boolean>();
    const kept = files.filter((f) => !lintLoadsCode(f, cwd, seen));
    if (kept.length < files.length && !codeSaid.has(cwd)) {
      codeSaid.add(cwd);
      say?.(
        `markdownlint-cli2 not run on ${files.length - kept.length} file(s): a markdownlint config there is code, or names code to load, and ${cwd} isn't a vault you trust — [trust] roots in your config`,
      );
    }
    if (!kept.length) return [];
    files = kept;
  }
  const cmd = await ready(given, cwd, say, signal);
  if (signal?.aborted) return { skipped: "tool cancelled" };
  if (!cmd) return null;
  const result = await runTool([...cmd.argv, ...files.map((f) => (cmd.literal ? `:${f}` : f))], {
    cwd,
    env: { ...process.env, ...cmd.env },
    timeoutMs,
    signal,
    outputBytes: LINT_OUTPUT_BYTES,
  });
  // Past the limit, or cancelled: this run's findings aren't shown, and the linter is still there for the next.
  if (result.failure === "overflow" || result.failure === "cancelled") return { skipped: toolFailure(result)! };
  if (result.failure === "spawn") return null; // not there: the caller says the linter couldn't run
  // Too slow, its pipes failed, or a signal ended it: what it printed is never a whole run.
  const failed = toolFailure(result);
  if (failed) {
    say?.(`linter: ${failed}`);
    return null;
  }
  const issues = parseLint(result.stdout + result.stderr, cwd);
  return result.code === 0 || result.code === 1 || issues.length ? issues : null;
}
