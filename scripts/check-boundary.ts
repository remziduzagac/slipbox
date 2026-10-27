#!/usr/bin/env bun
// Plan 0.3: the core must never import the TUI (or OpenTUI). The CLI face must run without a
// terminal renderer, and this check is the only thing that keeps that true.
//
// Rules, by directory:
//   src/core/  may not import src/tui/, src/cli/, or @opentui/*
//   src/cli/   may not import src/tui/ or @opentui/*
// src/main.ts may import src/tui/ lazily — the dynamic import is how the CLI avoids loading it.
// And by module: what runs only in a worker is imported, for more than its types, by that worker alone.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const RULES: Record<string, string[]> = {
  "src/core": ["src/tui", "src/cli", "@opentui"],
  "src/cli": ["src/tui", "@opentui"],
};

/** Modules only some files may import, but for types: the diagram library draws in its worker alone (#164), since a
 *  diagram it never finished, drawn on the screen's thread, froze slipbox. */
export const OWNERS: Record<string, string[]> = {
  "src/core/diagram-render.ts": ["src/core/diagram-worker.ts"],
};

// `… from "x"`, `import("x")`, `require("x")`, and a side-effect `import "x"`.
const IMPORT =
  /(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)|import\s*["']([^"']+)["']/g;

/** What a file's text imports, by the specifiers as written. */
export function importsOf(text: string): string[] {
  return [...text.matchAll(IMPORT)].map((m) => (m[1] ?? m[2] ?? m[3] ?? m[4])!);
}

/** What a file's text imports for what runs: `importsOf`, less `import type` and `export type`, which load nothing. */
export function valueImportsOf(text: string): string[] {
  return [...text.matchAll(IMPORT)]
    .filter((m) => !/^(?:import|export)\s+type\s/.test(m[0]))
    .map((m) => (m[1] ?? m[2] ?? m[3] ?? m[4])!);
}

/** Area catalogs may depend on contracts, never on the list that composes them, even for types (ORG-T1). */
export function commandViolations(from: string, text: string): string[] {
  const root = "src/core/application/commands/";
  const contract = from === `${root}contracts.ts`;
  if (!contract && !from.startsWith(`${root}areas/`)) return [];
  return importsOf(text).flatMap((spec) => {
    const target = spec.startsWith(".") ? relative(ROOT, resolve(ROOT, dirname(from), spec)) : spec;
    const composer = target === `${root}catalog` || target === `${root}catalog.ts`;
    return composer || contract
      ? [
          `${from}: imports ${spec} (${contract ? "contract must be independent" : "catalog must not import its composer"})`,
        ]
      : [];
  });
}

/** Shared trash/marker storage must not depend on the mutation orchestration that calls it (ORG-T13). */
export function mutationViolations(from: string, text: string): string[] {
  const root = "src/core/workspace/mutations";
  if (from !== `${root}/trash.ts`) return [];
  return importsOf(text).flatMap((spec) => {
    const target = spec.startsWith(".") ? relative(ROOT, resolve(ROOT, dirname(from), spec)) : spec;
    return target === root || target.startsWith(`${root}/`)
      ? [`${from}: imports ${spec} (shared trash/marker storage must not import mutation orchestration)`]
      : [];
  });
}

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

// Run as a script (`bun run check:boundary`); a test imports importsOf alone.
if (import.meta.main) {
  const violations: string[] = [];
  for (const [dir, banned] of Object.entries(RULES)) {
    for (const file of files(join(ROOT, dir))) {
      for (const spec of importsOf(readFileSync(file, "utf8"))) {
        const target = spec.startsWith(".") ? relative(ROOT, resolve(dirname(file), spec)) : spec;
        for (const b of banned) {
          if (target === b || target.startsWith(`${b}/`)) {
            violations.push(`${relative(ROOT, file)}: imports ${spec} (${dir} must not import ${b})`);
          }
        }
      }
    }
  }

  for (const file of files(join(ROOT, "src"))) {
    const from = relative(ROOT, file);
    violations.push(...commandViolations(from, readFileSync(file, "utf8")));
    violations.push(...mutationViolations(from, readFileSync(file, "utf8")));
    for (const spec of valueImportsOf(readFileSync(file, "utf8"))) {
      if (!spec.startsWith(".")) continue;
      const target = relative(ROOT, resolve(dirname(file), spec));
      const owners = OWNERS[target];
      if (owners && !owners.includes(from))
        violations.push(`${from}: imports ${spec} (only ${owners.join(", ")} may: it runs there alone)`);
    }
  }

  if (violations.length) {
    console.error(`boundary check failed:\n  ${violations.join("\n  ")}`);
    process.exit(1);
  }
  console.log("boundary check ok: core and cli import nothing from the TUI; workers' modules stay in their workers");
}
