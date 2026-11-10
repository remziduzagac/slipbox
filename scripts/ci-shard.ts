// CI's Linux jobs, each split across runners (D275): `test` by test file, `terminal` by check file, each in `SHARDS`
// parts, so a scoped pull request's tests on Linux take about five minutes. A job's part is `i/n` (`SCOPE_SHARD`, from
// its matrix), which `scripts/ci-scope.ts` takes: the tests it runs of what a change reaches, or of every test file, and
// the runner's `--shard` (`tests/terminal/run.ts`), which takes its checks of those its filters chose. macOS runs each
// whole, unsplit: the account has five macOS runners, and a job split would only wait longer for them (D273).
//
// The rule is stable, so the same files make the same parts: the longest first, each into the part with the least so far
// (the lowest part on a tie), files of the same length in their paths' order. A test file's length is its seconds on a
// runner where a run measured it as slow (`SLOW_TESTS`), else one second; a check file's, its checks, each run alone
// counting as a runner's cores, since it runs while nothing else does. Every item lands in exactly one part.

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

/** How many parts each Linux job is split in: the matrix's `shard` list in `.github/workflows/ci.yml`. */
export const SHARDS = 3;

/** One part of a job: the `index`th, from 1, of `count`. */
export type Shard = { index: number; count: number };

/**
 * `i/n` (1 ≤ i ≤ n): a job's part. Null when none is given, and the job runs whole; anything else throws, an empty
 * string too, so a part misspelt or left out never runs everything, or nothing.
 */
export function parseShard(text: string | undefined): Shard | null {
  if (text === undefined) return null;
  const m = /^([1-9]\d*)\/([1-9]\d*)$/.exec(text);
  const [index, count] = [Number(m?.[1]), Number(m?.[2])];
  if (!m || index > count) throw new Error(`a part is i/n, 1 ≤ i ≤ n: not ${JSON.stringify(text)}`);
  return { index, count };
}

/**
 * `items` in `count` parts, each item in exactly one: the heaviest first (by `weight`; on a tie, by `key`, in its
 * code units' order), each into the lightest part so far, the lowest on a tie. Each part in `key`'s order.
 */
export function split<T>(items: readonly T[], count: number, key: (t: T) => string, weight: (t: T) => number): T[][] {
  if (!Number.isInteger(count) || count < 1) throw new Error(`no way to split in ${count} parts`);
  const order = (a: T, b: T) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
  const parts: T[][] = Array.from({ length: count }, () => []);
  const loads: number[] = Array.from({ length: count }, () => 0);
  for (const item of [...items].sort((a, b) => weight(b) - weight(a) || order(a, b))) {
    const lightest = loads.indexOf(Math.min(...loads));
    parts[lightest]?.push(item);
    loads[lightest] = (loads[lightest] ?? 0) + weight(item);
  }
  return parts.map((p) => p.sort(order));
}

/**
 * The test files that took eight seconds or more on a GitHub Linux runner (`ubuntu-24.04`), by their seconds there: a
 * pull request's run and a push's, 2026-11-10 (runs 42726853524 and 42762627359), the longer of the two. Any other file
 * counts one second (the rest took 0.7 on average). A test holds each to a file there is: one moved is renamed here.
 */
export const SLOW_TESTS: Record<string, number> = {
  "tests/tui/workspace/explorer/walk-thread.test.ts": 31,
  "tests/distribution/release.test.ts": 26,
  "tests/cli/agents/skill.test.ts": 24,
  "tests/worker-requests.test.ts": 24,
  "tests/core/rendering/layout/markdown/samples.test.ts": 21,
  "tests/terminal-harness.test.ts": 20,
  "tests/tui/documents/views/parse-threads.test.ts": 15,
  "tests/cli/diagnostics/servers.test.ts": 14,
  "tests/cli/editing/writing.test.ts": 14,
  "tests/cli/files/operations.test.ts": 12,
  "tests/tui/shell/updates/updates.test.ts": 11,
  "tests/core/documents/servers/client.test.ts": 10,
  "tests/tui/documents/editing/server-completion.test.ts": 9,
  "tests/tui/documents/views/header.test.ts": 9,
  "tests/cli/reading/metadata.test.ts": 8,
  "tests/cli/reading/render.test.ts": 8,
};

/** A test file's seconds, for the split: its own if it's slow, else one. */
export const testWeight = (file: string): number => SLOW_TESTS[file] ?? 1;

/** What a check run alone counts for: the cores of a GitHub Linux runner, which run as many other checks meanwhile. */
const ALONE = 4;

/** A check's weight, for the split: one, or a runner's cores for one run alone (`alone`, after the others). */
export const checkWeight = (check: { alone?: boolean }): number => (check.alone ? ALONE : 1);

/** A file `bun test` takes for a test file: `*.test.*`, `*_test.*`, `*.spec.*` or `*_spec.*`, in JavaScript or TypeScript. */
export const TEST_FILE = /[._](?:test|spec)\.[jt]sx?$/;

/**
 * Every test file, as `bun test` with no path finds them, under `tests/` (where a test holds every one to be): what a
 * part of a run of everything takes its part of. In their paths' order.
 */
export function allTests(root = ROOT): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name !== "node_modules") walk(rel);
      } else if (TEST_FILE.test(e.name)) found.push(rel);
    }
  };
  if (existsSync(join(root, "tests"))) walk("tests");
  return found.sort();
}

/** The test files of `files` a part runs. */
export function shardTests(files: readonly string[], shard: Shard): string[] {
  return split([...new Set(files)], shard.count, (f) => f, testWeight)[shard.index - 1] ?? [];
}

/**
 * The checks of `chosen` a part runs, in `chosen`'s order: whole check files (`files`, the runner's `CHECK_FILES`), so
 * a feature's checks, and the release builds the checks of upgrading share, stay on one runner. A check in two files
 * goes with the first; one in none throws, as it would have no part to run in.
 */
export function shardChecks<C extends { alone?: boolean }>(
  chosen: readonly C[],
  files: Record<string, readonly C[]>,
  shard: Shard,
): C[] {
  const left = new Set(chosen);
  const groups: { file: string; checks: C[] }[] = [];
  for (const [file, checks] of Object.entries(files)) {
    const mine = checks.filter((c) => left.delete(c));
    if (mine.length) groups.push({ file, checks: mine });
  }
  if (left.size) throw new Error(`${left.size} chosen checks are in no check file`);
  const weight = (g: { checks: C[] }) => g.checks.reduce((w, c) => w + checkWeight(c), 0);
  const kept = new Set(split(groups, shard.count, (g) => g.file, weight)[shard.index - 1]?.flatMap((g) => g.checks));
  return chosen.filter((c) => kept.has(c));
}
