#!/usr/bin/env bun
// D235: no source file grows past LIMIT lines. A class that does everything (App once reached 11,500 lines) is hard
// to read, to review and to change in parallel; a feature goes in a module of its own, the shared state and the
// wiring staying where they are.
//
// A file past it has an exact cap. Apart from the import-formatting reset below, it may only shrink; lower its cap
// to its measured size (the check fails until then); at or below LIMIT, drop it from the list (ORG-D2).
// A move may reset a cap to measured import-formatting growth, or give a file crossing LIMIT an exact cap;
// record the delta and extraction owner (ORG-D2 dated note).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

/** The most lines a source file may have. */
export const LIMIT = 600;

/** New/split tests aim for 1,000 lines, with their own ceiling (ORG-D2). */
export const TEST_LIMIT = 1500;

/** Legacy handwritten files: exact caps; only reviewed import-formatting growth may reset one (ORG-D2). */
export const CAPPED: Record<string, number> = {};

/** Generated data: separate measured cap; verify offline with `bun scripts/lock-servers.ts --check` (ORG-D2). */
export const GENERATED: Record<string, number> = { "src/core/documents/servers/locks.ts": 1239 };

/** Existing test owners only; exact caps ratchet down, never exempt new/split files (ORG-D2). */
export const TEST_CAPPED: Record<string, number> = {
  "tests/export.test.ts": 1624,
  "tests/render.test.ts": 1990,
  "tests/servers.test.ts": 2038,
  "tests/terminal/checks/links-and-files.ts": 3095,
  "tests/terminal/checks/navigating.ts": 1824,
  "tests/terminal/checks/outside-and-code.ts": 1900,
  "tests/terminal/checks/reading.ts": 1737,
  "tests/terminal/checks/vaults.ts": 2533,
};

export interface SizeVerdict {
  /** Files past their group limit or exact cap. */
  over: { path: string; lines: number; limit: number }[];
  /** Capped files below their exact cap: the cap to lower, or the entry to drop. */
  lower: { path: string; lines: number; cap: number }[];
}

/** What `sizes` (path → lines) say against their group limit and `capped`. */
export function judgeSizes(
  sizes: Map<string, number>,
  capped: Record<string, number> = { ...CAPPED, ...GENERATED },
  defaultLimit = LIMIT,
): SizeVerdict {
  const over: SizeVerdict["over"] = [];
  const lower: SizeVerdict["lower"] = [];
  for (const [path, lines] of [...sizes].sort(([a], [b]) => a.localeCompare(b))) {
    const cap = capped[path];
    const limit = cap ?? defaultLimit;
    if (lines > limit) over.push({ path, lines, limit });
    else if (cap !== undefined && (lines < cap || lines <= defaultLimit)) lower.push({ path, lines, cap });
  }
  return { over, lower };
}

/** The number of lines in `text`, as an editor counts them. */
export function lineCount(text: string): number {
  if (!text) return 0;
  return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...sources(p));
    // Fixture symlinks are data; never follow them into another tree or a cycle.
    else if (e.isFile() && /\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

if (import.meta.main) {
  const sizesOf = (dir: string) =>
    new Map(
      (dir === "tests" && !existsSync(join(ROOT, dir)) ? [] : sources(join(ROOT, dir))).map((f) => [
        relative(ROOT, f),
        lineCount(readFileSync(f, "utf8")),
      ]),
    );
  const sourceSizes = sizesOf("src");
  const testSizes = sizesOf("tests");
  const groups = [
    { sizes: sourceSizes, caps: { ...CAPPED, ...GENERATED }, limit: LIMIT, name: "CAPPED" },
    { sizes: testSizes, caps: TEST_CAPPED, limit: TEST_LIMIT, name: "TEST_CAPPED" },
  ];
  let failed = false;
  for (const group of groups) {
    const { over, lower } = judgeSizes(group.sizes, group.caps, group.limit);
    for (const o of over) {
      console.error(
        `check-size: ${o.path} has ${o.lines} lines, over ${o.limit}: split by responsibility (D235, ORG-D2)`,
      );
    }
    for (const l of lower) {
      const name = l.path in GENERATED ? "GENERATED" : group.name;
      console.log(
        l.lines <= group.limit
          ? `check-size: ${l.path} is ${l.lines} lines, under ${group.limit}: drop it from ${name} in scripts/check-size.ts`
          : `check-size: ${l.path} is ${l.lines} lines, its cap ${l.cap}: lower the cap to ${l.lines}`,
      );
    }
    failed ||= over.length > 0 || lower.length > 0;
  }
  if (failed) process.exit(1);
  console.log(
    `check-size: ${sourceSizes.size} source files, none over ${LIMIT} lines but the ${Object.keys(CAPPED).length} legacy and ${Object.keys(GENERATED).length} generated caps`,
  );
  console.log(
    `check-size: ${testSizes.size} test/fixture files, none over ${TEST_LIMIT} lines but the ${Object.keys(TEST_CAPPED).length} legacy caps`,
  );
}
