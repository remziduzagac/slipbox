#!/usr/bin/env bun
// Plan 0.3: the core must never import the TUI (or OpenTUI). The CLI face must run without a
// terminal renderer, and this check is the only thing that keeps that true.
//
// Rules, by directory:
//   src/core/  may not import src/tui/, src/cli/, or @opentui/*
//   src/cli/   may not import src/tui/ or @opentui/*
// src/main.ts may import src/tui/ lazily — the dynamic import is how the CLI avoids loading it.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const RULES: Record<string, string[]> = {
  "src/core": ["src/tui", "src/cli", "@opentui"],
  "src/cli": ["src/tui", "@opentui"],
};

const IMPORT = /(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/g;

function files(dir: string): string[] {
  const out: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx|js|mjs)$/.test(e)) out.push(p);
  }
  return out;
}

const violations: string[] = [];
for (const [dir, banned] of Object.entries(RULES)) {
  for (const file of files(join(ROOT, dir))) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(IMPORT)) {
      const spec = m[1] ?? m[2] ?? m[3]!;
      const target = spec.startsWith(".") ? relative(ROOT, resolve(dirname(file), spec)) : spec;
      for (const b of banned) {
        if (target === b || target.startsWith(`${b}/`)) {
          violations.push(`${relative(ROOT, file)}: imports ${spec} (${dir} must not import ${b})`);
        }
      }
    }
  }
}

if (violations.length) {
  console.error(`boundary check failed:\n  ${violations.join("\n  ")}`);
  process.exit(1);
}
console.log("boundary check ok: core and cli import nothing from the TUI");
