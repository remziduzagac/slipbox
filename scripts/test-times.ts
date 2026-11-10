// Each test's time in CI, and a budget for a test file's (CIW-T9, D276). `bun test`'s JUnit report, which `ci:scope`
// asks for when `SCOPE_REPORT` names a file, has every test file's time, from loading it to its last hook, and every
// test's. Each `test` job reads it with `bun run test:times <report>`: the slowest files and tests, in the job's log
// and its step summary, and a failure for each test file over its budget, naming the file, its time and the budget.
// The job uploads the report as `test-times-<system>-<part>`.
//
// A test file's budget is BUDGET seconds on a GitHub Linux runner, or its own in BUDGETS: a file known to be slow, with
// why, so it doesn't fail, and can't grow unnoticed past its own. On macOS, each is MACOS_FACTOR times that. Each
// budget is MARGIN times the longest the file was seen to take, or more, so a runner slower than usual doesn't fail it.
// A file within its budget but not by MARGIN is said in the log, not failed. Whether a file still needs a budget of its
// own is a question for both systems' times, a run's of one can't answer it.
//
// `bun scripts/test-times.ts slow <run>…` rewrites `SLOW_TESTS` (scripts/ci-shard.ts), which weighs the Linux parts,
// from those runs' Linux reports: by hand, so the parts stay the tree's, the same from one run of it to the next.

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { SLOW, SLOW_TESTS } from "./ci-shard.ts";

const ROOT = join(import.meta.dir, "..");

/**
 * The seconds a test file may take on a GitHub Linux runner (`ubuntu-24.04`): as long as one test may (the tests'
 * timeout). Every file without a budget of its own took 19.9 s or less in the runs it was chosen from (D276).
 */
export const BUDGET = 30;

/**
 * A budget on macOS (`macos-15`) is this many times Linux's. Its runner is slower, and moves far more from one run to the
 * next: a file took from 15 to 121 seconds there (the samples' rows), another from 6 to 36 (the header's), up to five
 * times its longest on Linux.
 */
export const MACOS_FACTOR = 4;

/** How much longer than the longest a file was seen to take its budget is, at least. */
export const MARGIN = 1.5;

/**
 * The test files that took more than BUDGET over MARGIN on Linux, each with its own budget and why it's slow: its
 * longest on Linux times MARGIN, or on macOS times MARGIN over MACOS_FACTOR, whichever is more, up to the next five
 * seconds. Their longest, on Linux and on macOS, in the runs of 2026-11-09 and 2026-11-10 (D276).
 */
export const BUDGETS: Record<string, { seconds: number; why: string }> = {
  "tests/tui/workspace/explorer/walk-thread.test.ts": {
    seconds: 50,
    why: "44 tests, each starting the walks' and the listings' threads and waiting on them (32.8 s; 50.5 on macOS)",
  },
  "tests/distribution/release.test.ts": {
    seconds: 50,
    why: "builds this machine's release once, compiled, for its tests to read (31.4 s; 35.6 on macOS)",
  },
  "tests/cli/agents/skill.test.ts": {
    seconds: 50,
    why: "runs every command the agents' skill shows, each a process of its own (31.4 s; 32.5 on macOS)",
  },
  "tests/worker-requests.test.ts": {
    seconds: 45,
    why: "parses the biggest note a vault takes, and bursts of big ones, on the parse workers (29.2 s; 35.1 on macOS)",
  },
  "tests/core/rendering/layout/markdown/samples.test.ts": {
    seconds: 50,
    why: "renders every sample and reference-set note at several widths and glyphs (28.5 s; 121.4 on macOS)",
  },
};

/** One test file's time in a report, and how many tests it ran. */
export type FileTime = { file: string; seconds: number; tests: number };
/** One test's: its file, and its name as `bun test` prints it (`describe > test`). */
export type TestTime = { file: string; name: string; seconds: number };
/** What a report says, in its order. */
export type Report = { files: FileTime[]; tests: TestTime[] };

/** A report of no test file, which `ci:scope` writes for a part with nothing to run. */
export const EMPTY_REPORT =
  '<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="bun test" tests="0">\n</testsuites>\n';

/**
 * What `ci:scope` hands `bun test` for its report to be written at `path` (`SCOPE_REPORT`), whose folder it makes, as
 * Bun doesn't; or, with no test to run (`none`), the empty report written there, so a report missing means the tests
 * wrote none. Nothing without a path.
 */
export function reportFlags(path: string | undefined, none: boolean): string[] {
  if (!path) return [];
  mkdirSync(dirname(path), { recursive: true });
  if (!none) return ["--reporter=junit", `--reporter-outfile=${path}`];
  writeFileSync(path, EMPTY_REPORT);
  return [];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescapeXml = (text: string): string =>
  text.replace(/&(?:#x([0-9a-f]+)|#(\d+)|(\w+));/gi, (m, hex?: string, dec?: string, name?: string) =>
    hex
      ? String.fromCodePoint(Number.parseInt(hex, 16))
      : dec
        ? String.fromCodePoint(Number(dec))
        : (ENTITIES[name ?? ""] ?? m),
  );

/**
 * A JUnit report as `bun test` writes it: a `<testsuite>` for each file, at the top, holding one for each `describe`
 * and a `<testcase>` for each test. Throws when it isn't one.
 */
export function readReport(xml: string): Report {
  if (!/<testsuites\b/.test(xml)) throw new Error("not a JUnit report: no <testsuites>");
  const files: FileTime[] = [];
  const tests: TestTime[] = [];
  const open: string[] = [];
  let file: FileTime | undefined;
  for (const [, close, tag, text, empty] of xml.matchAll(/<(\/?)(testsuite|testcase)\b([^>]*?)(\/?)>/g)) {
    if (close) {
      if (tag === "testsuite") open.pop();
      continue;
    }
    const attr = (name: string) => unescapeXml(new RegExp(`\\s${name}="([^"]*)"`).exec(text ?? "")?.[1] ?? "");
    const seconds = Number(attr("time")) || 0;
    if (tag === "testsuite") {
      if (open.length === 0) {
        file = { file: attr("file") || attr("name"), seconds, tests: 0 };
        files.push(file);
      }
      if (!empty) open.push(attr("name"));
    } else if (file) {
      tests.push({ file: file.file, name: [...open.slice(1), attr("name")].join(" > "), seconds });
      file.tests++;
    }
  }
  return { files, tests };
}

/** How many times Linux's a system's budgets are: `darwin`'s MACOS_FACTOR. */
export const factorFor = (platform: string): number => (platform === "darwin" ? MACOS_FACTOR : 1);

/** A test file's budget, in seconds, on a runner whose budgets are `factor` times Linux's. */
export const budgetOf = (file: string, factor = 1, budgets = BUDGETS, budget = BUDGET): number =>
  (budgets[file]?.seconds ?? budget) * factor;

/** A test file against its budget. */
export type Judged = { file: string; seconds: number; budget: number };

/**
 * A report's files against their budgets, each list in the report's order: those over (`over`), and those within it
 * but not by MARGIN (`near`).
 */
export function judge(
  report: Report,
  factor = 1,
  budgets = BUDGETS,
  budget = BUDGET,
): { over: Judged[]; near: Judged[] } {
  const out = { over: [] as Judged[], near: [] as Judged[] };
  for (const { file, seconds } of report.files) {
    const own = budgetOf(file, factor, budgets, budget);
    const judged = { file, seconds, budget: own };
    if (seconds > own) out.over.push(judged);
    else if (seconds * MARGIN > own) out.near.push(judged);
  }
  return out;
}

/** Text from the tests (a file's path, a test's name) in a table's cell: on one line, no cell broken, no tag opened. */
const cell = (text: string): string =>
  text.replace(/\s+/g, " ").replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/</g, "&lt;");

const sec = (seconds: number): string => seconds.toFixed(1);
const count = (n: number, what: string): string => `${n} ${what}${n === 1 ? "" : "s"}`;

/** The slowest `n` files and tests of a report, in Markdown: the job's step summary, and its log. */
export function summary(report: Report, factor = 1, n = 10, budgets = BUDGETS, budget = BUDGET): string {
  if (report.files.length === 0) return "### Test times\n\nNo test file ran.\n";
  const total = report.files.reduce((t, f) => t + f.seconds, 0);
  const files = [...report.files].sort((a, b) => b.seconds - a.seconds).slice(0, n);
  const tests = [...report.tests].sort((a, b) => b.seconds - a.seconds).slice(0, n);
  const here = factor === 1 ? "" : `, ${factor} times Linux's here`;
  return [
    "### Test times",
    "",
    `${count(report.files.length, "test file")}, ${count(report.tests.length, "test")}, ${sec(total)} s. A file's budget: ` +
      `${budget * factor} s, or its own (scripts/test-times.ts${here}).`,
    "",
    "| Slowest files | Tests | Seconds | Budget |",
    "| --- | ---: | ---: | ---: |",
    ...files.map(
      (f) => `| ${cell(f.file)} | ${f.tests} | ${sec(f.seconds)} | ${budgetOf(f.file, factor, budgets, budget)} |`,
    ),
    "",
    "| Slowest tests | Seconds |",
    "| --- | ---: |",
    ...tests.map((t) => `| ${cell(t.file)}: ${cell(t.name)} | ${sec(t.seconds)} |`),
    "",
  ].join("\n");
}

/**
 * What `bun run test:times <report>` says of the report at `path`: its summary, a failure for each file over its
 * budget (and for a report missing, or not one), and a note for each within it but not by MARGIN.
 */
export function check(
  path: string | undefined,
  platform: string = process.platform,
  budgets = BUDGETS,
  budget = BUDGET,
): { summary: string; errors: string[]; notes: string[] } {
  const none = { summary: "", notes: [] };
  if (!path) return { ...none, errors: ["test-times: which report? bun run test:times <report.xml>"] };
  if (!existsSync(path))
    return { ...none, errors: [`test-times: no report at ${path}: the tests wrote none (SCOPE_REPORT, D276)`] };
  let report: Report;
  try {
    report = readReport(readFileSync(path, "utf8"));
  } catch (e) {
    return { ...none, errors: [`test-times: ${path}: ${(e as Error).message}`] };
  }
  const factor = factorFor(platform);
  const { over, near } = judge(report, factor, budgets, budget);
  const whose = (file: string) => (file in budgets ? "its own in BUDGETS" : "BUDGET");
  return {
    summary: summary(report, factor, 10, budgets, budget),
    errors: over.map(
      (o) =>
        `test-times: ${o.file} took ${sec(o.seconds)} s, over its budget of ${o.budget} s (${whose(o.file)}, ` +
        "scripts/test-times.ts): make it faster or split it; or, slow for a reason, give it a budget of its own, with why",
    ),
    notes: near.map(
      (n) => `test-times: ${n.file} took ${sec(n.seconds)} s, within its budget of ${n.budget} s, but not by ${MARGIN}`,
    ),
  };
}

/**
 * `SLOW_TESTS` from runs' times (`measured`, each file's longest): a file measured at SLOW seconds or more, its seconds,
 * rounded; one measured under it, out; one not measured, as it was. Only files there are (`exists`); the longest first.
 */
export function slowTests(
  current: Record<string, number>,
  measured: Map<string, number>,
  exists: (file: string) => boolean,
): Record<string, number> {
  const out = new Map<string, number>();
  for (const [file, seconds] of Object.entries(current))
    if (!measured.has(file) && exists(file)) out.set(file, seconds);
  for (const [file, seconds] of measured) if (seconds >= SLOW && exists(file)) out.set(file, Math.round(seconds));
  return Object.fromEntries([...out].sort(([a, x], [b, y]) => y - x || (a < b ? -1 : a > b ? 1 : 0)));
}

/** `source` (scripts/ci-shard.ts) with `SLOW_TESTS` holding `slow`, and `note` the line saying where they're from. */
export function rewriteSlowTests(source: string, slow: Record<string, number>, note: string): string {
  const block = /(export const SLOW_TESTS: Record<string, number> = \{\n)[\s\S]*?(\n\};)/;
  if (!block.test(source)) throw new Error("no `export const SLOW_TESTS: Record<string, number> = {` to rewrite");
  const lines = [`  // ${note}`, ...Object.entries(slow).map(([f, s]) => `  ${JSON.stringify(f)}: ${s},`)];
  return source.replace(block, (_, start: string, end: string) => `${start}${lines.join("\n")}${end}`);
}

/** Each test file's longest time in the reports under `dir`, at any depth. */
export function longest(dir: string): Map<string, number> {
  const times = new Map<string, number>();
  for (const name of readdirSync(dir, { recursive: true }) as string[])
    if (name.endsWith(".xml"))
      for (const f of readReport(readFileSync(join(dir, name), "utf8")).files)
        times.set(f.file, Math.max(times.get(f.file) ?? 0, f.seconds));
  return times;
}

/** `slow <run>…`: the runs' Linux reports downloaded (`gh run download`), and `SLOW_TESTS` rewritten from them. */
function slow(runs: string[]): number {
  if (runs.length === 0 || runs.some((r) => !/^\d+$/.test(r))) {
    console.error("test-times: bun scripts/test-times.ts slow <run id>…, runs of every test on Linux (a full run's)");
    return 2;
  }
  const dir = mkdtempSync(join(tmpdir(), "slipbox-test-times-"));
  try {
    for (const run of runs) {
      const args = ["gh", "run", "download", run, "--pattern", "test-times-Linux-*", "--dir", join(dir, run)];
      const got = Bun.spawnSync(args, { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] });
      if (got.exitCode !== 0) return got.exitCode || 1;
    }
    const measured = longest(dir);
    const date = new Date().toISOString().slice(0, 10);
    const note = `runs ${runs.join(", ")} (${date}): ${measured.size} files measured, each its longest`;
    const slowest = slowTests(SLOW_TESTS, measured, (f) => existsSync(join(ROOT, f)));
    const file = join(ROOT, "scripts", "ci-shard.ts");
    writeFileSync(file, rewriteSlowTests(readFileSync(file, "utf8"), slowest, note));
    console.log(`test-times: SLOW_TESTS rewritten, ${Object.keys(slowest).length} files; ${note}`);
    return 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A message as GitHub's workflow commands take it: on one line, escaped. */
const command = (text: string): string => text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

if (import.meta.main) {
  const [first, ...rest] = process.argv.slice(2);
  if (first === "slow") process.exit(slow(rest));
  const r = check(first);
  if (r.summary) {
    console.log(r.summary);
    const out = process.env.GITHUB_STEP_SUMMARY;
    if (out) appendFileSync(out, `${r.summary}\n`);
  }
  for (const n of r.notes) console.log(n);
  for (const e of r.errors) console.error(process.env.GITHUB_ACTIONS ? `::error::${command(e)}` : e);
  process.exit(r.errors.length ? 1 : 0);
}
