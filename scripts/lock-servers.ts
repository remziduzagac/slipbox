#!/usr/bin/env bun
// The lockfiles slipbox installs language servers from (plan 14.11): one for each package slipbox pins — the
// servers in core/documents/servers/languages.ts, markdownlint-cli2 in core/documents/diagnostics/lint.ts —
// resolved by Bun from npm, a version taken only once it's a week old (as the repository's own are: 14.10), and
// written into src/core/documents/servers/locks.ts, which the binary carries. Run it when a pin changes, and read
// the diff: every package a server brings is in it.
//
//   bun scripts/lock-servers.ts             every pin's lock made again
//   bun scripts/lock-servers.ts --missing   only the pins without one, the rest kept as they are
//   bun scripts/lock-servers.ts --check     verify generation from stored locks, offline and without writing

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { MARKDOWNLINT } from "../src/core/documents/diagnostics/lint.ts";
import { lockKey, type NpmSpec, toolManifest } from "../src/core/documents/servers/install.ts";
import { SERVERS } from "../src/core/documents/servers/languages.ts";
import { LOCKS } from "../src/core/documents/servers/locks.ts";

const ROOT = resolve(import.meta.dir, "..");
const OUT = join(ROOT, "src", "core", "documents", "servers", "locks.ts");

/** Every package slipbox pins, once each (several servers share one), by its lock's key. */
export function pinned(): NpmSpec[] {
  const all = [...Object.values(SERVERS).flatMap((d) => (d.npm ? [d.npm] : [])), MARKDOWNLINT.npm!];
  const byKey = new Map(all.map((n) => [lockKey(n), n]));
  return [...byKey.keys()].sort().map((k) => byKey.get(k)!);
}

/** locks.ts's text: each lock a line of source per line of its own, so a change reads as a diff. */
export function locksModule(locks: Record<string, string>): string {
  const entries = Object.keys(locks)
    .sort()
    .map(
      (k) =>
        `  ${JSON.stringify(k)}: [\n${locks[k]!.split("\n")
          .map((l) => `    ${JSON.stringify(l)},`)
          .join("\n")}\n  ].join("\\n"),\n`,
    )
    .join("");
  return `// The lockfiles slipbox installs language servers from (plan 14.11), by package and pin: made by
// scripts/lock-servers.ts from npm — don't edit by hand; run it again when a pin changes.

export const LOCKS: Record<string, string> = {
${entries}};
`;
}

/** A pin's lock, resolved by Bun: nothing installed, no script run. */
function resolveLock(npm: NpmSpec): string {
  const dir = mkdtempSync(join(tmpdir(), "slipbox-lock-"));
  try {
    writeFileSync(join(dir, "package.json"), toolManifest(npm));
    const r = Bun.spawnSync(
      [process.execPath, "install", "--lockfile-only", "--ignore-scripts", "--minimum-release-age=604800"],
      { cwd: dir, stdout: "pipe", stderr: "pipe", env: { ...process.env, BUN_BE_BUN: "1" } },
    );
    if (r.exitCode !== 0)
      throw new Error(`${lockKey(npm)}: ${r.stderr.toString().trim() || r.stdout.toString().trim()}`);
    return readFileSync(join(dir, "bun.lock"), "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Regenerate from stored lock data, comparing emitted code so formatter-only quote changes are harmless. */
export function generatedLocksMatch(source: string, locks: Record<string, string> = LOCKS): boolean {
  const ts = new Bun.Transpiler({ loader: "ts" });
  return ts.transformSync(source) === ts.transformSync(locksModule(locks));
}

/** Stored data must cover exactly the current pins and describe the manifest each pin will install. */
export function locksMatchPins(locks: Record<string, string>, pins: NpmSpec[]): boolean {
  const keys = pins.map(lockKey).sort();
  if (JSON.stringify(Object.keys(locks).sort()) !== JSON.stringify(keys)) return false;
  for (const pin of pins) {
    try {
      const lock = JSON.parse(locks[lockKey(pin)]!.replace(/,(\s*[}\]])/g, "$1"));
      const actual = Object.entries(lock.workspaces[""].dependencies).sort(([a], [b]) => a.localeCompare(b));
      const expected = Object.entries(JSON.parse(toolManifest(pin)).dependencies).sort(([a], [b]) =>
        a.localeCompare(b),
      );
      if (JSON.stringify(actual) !== JSON.stringify(expected)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

if (import.meta.main) {
  if (process.argv.includes("--check")) {
    if (!locksMatchPins(LOCKS, pinned())) {
      console.error("lock-servers: stored locks do not match the current pin set and manifests");
      process.exit(1);
    }
    if (!generatedLocksMatch(readFileSync(OUT, "utf8"))) {
      console.error("lock-servers: generated module differs from its stored lock data");
      process.exit(1);
    }
    console.log("lock-servers: offline generator verification passed (stored resolutions, no npm refresh)");
    process.exit(0);
  }
  const onlyMissing = process.argv.includes("--missing");
  const out: Record<string, string> = {};
  for (const npm of pinned()) {
    const key = lockKey(npm);
    out[key] = onlyMissing && LOCKS[key] !== undefined ? LOCKS[key]! : resolveLock(npm);
    process.stdout.write(`${key}\n`);
  }
  writeFileSync(OUT, locksModule(out));
}
