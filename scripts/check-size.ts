#!/usr/bin/env bun
// D235: no source file grows past LIMIT lines. A class that does everything (App once reached 11,500 lines) is hard
// to read, to review and to change in parallel; a feature goes in a module of its own, the shared state and the
// wiring staying where they are.
//
// A file past it has an exact cap. Apart from the import-formatting reset below, it may only shrink; lower its cap
// to its measured size (the check fails until then); at or below LIMIT, drop it from the list (ORG-D2).
// A move may reset a cap to measured import-formatting growth, or give a file crossing LIMIT an exact cap;
// record the delta and extraction owner (ORG-D2 dated note).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

/** The most lines a source file may have. */
export const LIMIT = 1000;

/** Legacy handwritten files: exact caps; only reviewed import-formatting growth may reset one (ORG-D2). */
export const CAPPED: Record<string, number> = {
  "src/tui/app/runtime/app.ts": 1366,
  "src/tui/shell/input/keys.ts": 1166,
  "src/tui/workspace/git/views/branches/gitbranchview.ts": 1005,
};

/** Generated data: separate measured cap; verify offline with `bun scripts/lock-servers.ts --check` (ORG-D2). */
export const GENERATED: Record<string, number> = { "src/core/documents/servers/locks.ts": 1239 };

export interface SizeVerdict {
  /** Files past their limit: LIMIT, or their cap. */
  over: { path: string; lines: number; limit: number }[];
  /** Capped files below their exact cap: the cap to lower, or the entry to drop. */
  lower: { path: string; lines: number; cap: number }[];
}

/** What `sizes` (path → lines) say against LIMIT and `capped`. */
export function judgeSizes(
  sizes: Map<string, number>,
  capped: Record<string, number> = { ...CAPPED, ...GENERATED },
): SizeVerdict {
  const over: SizeVerdict["over"] = [];
  const lower: SizeVerdict["lower"] = [];
  for (const [path, lines] of [...sizes].sort(([a], [b]) => a.localeCompare(b))) {
    const cap = capped[path];
    const limit = cap ?? LIMIT;
    if (lines > limit) over.push({ path, lines, limit });
    else if (cap !== undefined && (lines < cap || lines <= LIMIT)) lower.push({ path, lines, cap });
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
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

if (import.meta.main) {
  const sizes = new Map<string, number>();
  for (const f of sources(join(ROOT, "src"))) sizes.set(relative(ROOT, f), lineCount(readFileSync(f, "utf8")));
  const { over, lower } = judgeSizes(sizes);
  for (const o of over) {
    console.error(
      `check-size: ${o.path} has ${o.lines} lines, over ${o.limit}: move a feature into a module of its own (D235)`,
    );
  }
  for (const l of lower) {
    console.log(
      l.lines <= LIMIT
        ? `check-size: ${l.path} is ${l.lines} lines, under ${LIMIT}: drop it from CAPPED in scripts/check-size.ts`
        : `check-size: ${l.path} is ${l.lines} lines, its cap ${l.cap}: lower the cap to ${l.lines}`,
    );
  }
  if (over.length || lower.length) process.exit(1);
  console.log(
    `check-size: ${sizes.size} source files, none over ${LIMIT} lines but the ${Object.keys(CAPPED).length} legacy and ${Object.keys(GENERATED).length} generated caps`,
  );
}
