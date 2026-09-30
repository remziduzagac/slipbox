// The lint surface (3.21): run the linter you already use — markdownlint-cli2, with your own
// configuration — and show what it finds where it is. slipbox ships no linter of its own: a
// built-in one would fight the rules you've written (docs/idea.md, "Run this repo's linter").

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { Config } from "./config.ts";

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

/**
 * The linter to run in a vault, its files to be appended, or null when lint is off: `[lint]
 * command` as given; else markdownlint-cli2 through npx — with ~/.markdownlint-cli2.jsonc, unless
 * the vault has a markdownlint config of its own (the linter finds that by itself). "auto" lints
 * only where one of those configs is: markdownlint's defaults are no one's rules for notes.
 */
export function lintCommand(lint: Config["lint"], vaultRoot: string, home = homedir()): { argv: string[]; literal: boolean } | null {
  if (lint.enabled === "off") return null;
  if (lint.command.length) return { argv: lint.command.map((a) => (a.startsWith("~/") ? join(home, a.slice(2)) : a)), literal: false };
  const own = VAULT_CONFIGS.some((f) => existsSync(join(vaultRoot, f)));
  const user = join(home, ".markdownlint-cli2.jsonc");
  const mine = existsSync(user);
  if (lint.enabled === "auto" && !own && !mine) return null;
  return { argv: ["npx", "--yes", "markdownlint-cli2", ...(!own && mine ? ["--config", user] : [])], literal: true };
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
 * command gets each path as a literal (`:path`).
 */
export function runLint(cmd: { argv: string[]; literal: boolean }, files: string[], cwd: string, timeoutMs = 60_000): Promise<LintIssue[] | null> {
  return new Promise((done) => {
    let out = "";
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd.argv[0]!, [...cmd.argv.slice(1), ...files.map((f) => (cmd.literal ? `:${f}` : f))], { cwd, stdio: ["ignore", "pipe", "pipe"] });
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
