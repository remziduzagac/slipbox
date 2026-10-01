// The lint surface (3.21): run the linter you already use — markdownlint-cli2, with your own
// configuration — and show what it finds where it is. slipbox ships no linter of its own: a
// built-in one would fight the rules you've written (docs/idea.md, "Run this repo's linter").
// markdownlint-cli2 is found as a server is (the vault's own copy, PATH, your installs), else
// installed into slipbox's own folder when first needed (19.21), and run on slipbox's Bun.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { Config } from "./config.ts";
import { findServer } from "./servers/find.ts";
import { installPackages } from "./servers/install.ts";
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

/** markdownlint-cli2 as slipbox finds and installs it: pinned, its bin a Node script run on slipbox's Bun. */
export const MARKDOWNLINT: ServerDef = { name: "markdownlint-cli2", command: "markdownlint-cli2", args: [], npm: { package: "markdownlint-cli2", version: "0.23.3", bin: "markdownlint-cli2" } };

export interface LintCmd {
  argv: string[];
  /** markdownlint-cli2's paths taken as they are, never as globs (`:path`). */
  literal: boolean;
  env?: Record<string, string>;
  /** Not found: installed first (the npm spec), then found again, its arguments after it. */
  install?: string;
}

/**
 * The linter to run in a vault, its files to be appended, or null when lint is off: `[lint]
 * command` as given; else markdownlint-cli2 — with ~/.markdownlint-cli2.jsonc, unless the vault has a
 * markdownlint config of its own (the linter finds that by itself) — wherever it's found, else
 * installed first when installing is on (`[lsp] auto_install`). "auto" lints only where one of those
 * configs is: markdownlint's defaults are no one's rules for notes.
 */
export function lintCommand(lint: Config["lint"], vaultRoot: string, home = homedir(), autoInstall = true): LintCmd | null {
  if (lint.enabled === "off") return null;
  if (lint.command.length) return { argv: lint.command.map((a) => (a.startsWith("~/") ? join(home, a.slice(2)) : a)), literal: false };
  const own = VAULT_CONFIGS.some((f) => existsSync(join(vaultRoot, f)));
  const user = join(home, ".markdownlint-cli2.jsonc");
  const mine = existsSync(user);
  if (lint.enabled === "auto" && !own && !mine) return null;
  const args = !own && mine ? ["--config", user] : [];
  const found = findServer({ ...MARKDOWNLINT, args }, vaultRoot);
  if (found) return { argv: found.argv, literal: true, env: found.env };
  const { package: name, version } = MARKDOWNLINT.npm!;
  // Installing off: run by its name, which fails, and the linter is said not to run.
  return autoInstall ? { argv: args, literal: true, install: `${name}@${version}` } : { argv: [MARKDOWNLINT.command, ...args], literal: true };
}

/** What a linter that couldn't run was: yours, or markdownlint-cli2 — not found, or not installed. */
export function lintFailure(config: Pick<Config, "lint" | "lsp">): string {
  if (config.lint.command.length) return "[lint] command couldn't run";
  return config.lsp.auto_install ? "markdownlint-cli2 couldn't run (or be installed)" : "markdownlint-cli2 isn't installed, and installing is off ([lsp] auto_install)";
}

/** Each install asked for, by its spec: one at a time, shared by every run waiting for it. */
const installs = new Map<string, Promise<boolean>>();

/** A command ready to run: markdownlint-cli2 installed first, once however many ask; null when that failed. */
async function ready(cmd: LintCmd, cwd: string, say?: (text: string) => void): Promise<LintCmd | null> {
  const spec = cmd.install;
  if (!spec) return cmd;
  let installing = installs.get(spec);
  if (!installing) {
    say?.(`installing ${spec} into slipbox's own folder…`);
    installing = installPackages([spec]).then((r) => {
      if (!r.ok) installs.delete(spec); // tried again next time
      return r.ok;
    });
    installs.set(spec, installing);
  }
  if (!(await installing)) return null;
  const found = findServer({ ...MARKDOWNLINT, args: cmd.argv }, cwd);
  return found ? { argv: found.argv, literal: true, env: found.env } : null;
}

const LINE = /^(.+?):(\d+)(?::(\d+))?\s+(?:(?:error|warning)\s+)?(MD\d+)((?:\/[\w-]+)*)\s+(.*)$/;

/** markdownlint-cli2's findings, one a line — `path:line[:col] error MD013/line-length What [Context]`; the rest ignored. */
export function parseLint(output: string, cwd: string): LintIssue[] {
  const out: LintIssue[] = [];
  for (const raw of output.split(/\r?\n/)) {
    const m = LINE.exec(raw.trim());
    if (!m) continue;
    out.push({ file: resolve(cwd, m[1]!), line: Number(m[2]), column: m[3] ? Number(m[3]) : null, rule: m[4]!, name: m[5]!.split("/")[1] ?? "", description: m[6]!.trim() });
  }
  return out.sort((a, b) => (a.file === b.file ? a.line - b.line || (a.column ?? 0) - (b.column ?? 0) : a.file < b.file ? -1 : 1));
}

/**
 * Lint `files` (absolute) with `cmd`, from `cwd`: the findings, or null when the linter couldn't
 * run (not installed, or it failed on its own). markdownlint-cli2 takes globs, so the default
 * command gets each path as a literal (`:path`). `say`: told when it's installed first.
 */
export async function runLint(given: LintCmd, files: string[], cwd: string, timeoutMs = 60_000, say?: (text: string) => void): Promise<LintIssue[] | null> {
  const cmd = await ready(given, cwd, say);
  if (!cmd) return null;
  return new Promise((done) => {
    let out = "";
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd.argv[0]!, [...cmd.argv.slice(1), ...files.map((f) => (cmd.literal ? `:${f}` : f))], { cwd, env: { ...process.env, ...cmd.env }, stdio: ["ignore", "pipe", "pipe"] });
    } catch {
      return done(null);
    }
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout?.on("data", (d) => (out += d));
    child.stderr?.on("data", (d) => (out += d));
    child.on("error", () => {
      clearTimeout(timer);
      done(null);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      // 0: clean, 1: findings; anything else is the linter's own failure — unless it said what it found.
      const issues = parseLint(out, cwd);
      done(code === 0 || code === 1 || issues.length ? issues : null);
    });
  });
}
