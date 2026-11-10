// Each test's time in CI, and a budget for a test file's (CIW-T9, D276, scripts/test-times.ts): the JUnit report read,
// the slowest files and tests said, a file over its budget failing the job, a report missing failing it too, and
// `SLOW_TESTS` rewritten from the reports.
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SLOW, SLOW_TESTS, TEST_FILE } from "../scripts/ci-shard.ts";
import {
  BUDGET,
  BUDGETS,
  budgetOf,
  check,
  EMPTY_REPORT,
  factorFor,
  failsOn,
  HEADROOM,
  judge,
  longest,
  MACOS_FACTOR,
  MARGIN,
  type Report,
  readReport,
  reportFlags,
  rewriteSlowTests,
  slowTests,
  summary,
  systemOf,
} from "../scripts/test-times.ts";

const ROOT = join(import.meta.dir, "..");
const sandbox = mkdtempSync(join(tmpdir(), "slipbox-test-times-"));
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));
let made = 0;
/** A file in the sandbox with `text`, its path. */
const file = (name: string, text: string): string => {
  const dir = join(sandbox, String(++made));
  mkdirSync(dir);
  writeFileSync(join(dir, name), text);
  return join(dir, name);
};

/**
 * A report as `bun test --reporter=junit` wrote it for two files: nested describes, a skip, a failure, the escapes; and
 * a describe with nothing in it, closed where it opens, which Bun leaves out but another writer mightn't.
 */
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="5" assertions="1" failures="1" skipped="1" time="1.514345567">
  <testsuite name="tests/a.test.ts" file="tests/a.test.ts" tests="4" assertions="1" failures="1" skipped="1" time="1.41074517" hostname="h">
    <testsuite name="outer" file="tests/a.test.ts" line="4" tests="3" assertions="1" failures="1" skipped="1" time="0" hostname="h">
      <testsuite name="inner &lt;x&gt; &amp; &quot;q&quot; | &#233;" file="tests/a.test.ts" line="4" tests="3" assertions="1" failures="1" skipped="1" time="0.301" hostname="h">
        <testcase name="slow one" classname="inner" time="0.30127" file="tests/a.test.ts" line="4" assertions="0" />
        <testcase name="skipped" classname="inner" time="0" file="tests/a.test.ts" line="4" assertions="0">
          <skipped />
        </testcase>
        <testcase name="fails" classname="inner" time="0.000762" file="tests/a.test.ts" line="4" assertions="1">
          <failure type="AssertionError" message="expect(received).toBe(expected)&#10;">AssertionError: &lt;testcase name="no"&gt;&#10;</failure>
        </testcase>
      </testsuite>
    </testsuite>
    <testsuite name="empty" file="tests/a.test.ts" line="5" tests="0" time="0" hostname="h" />
    <testcase name="top" classname="" time="0.00003" file="tests/a.test.ts" line="5" assertions="0" />
  </testsuite>
  <testsuite name="tests/b.test.ts" file="tests/b.test.ts" tests="1" assertions="0" failures="0" skipped="0" time="0.101257845" hostname="h">
    <testcase name="b" classname="" time="0.100578" file="tests/b.test.ts" line="2" assertions="0" />
  </testsuite>
</testsuites>
`;

/** A report of these files, each taking its seconds, one test each. */
const report = (times: Record<string, number>): Report => ({
  files: Object.entries(times).map(([f, seconds]) => ({ file: f, seconds, tests: 1 })),
  tests: Object.entries(times).map(([f, seconds]) => ({ file: f, name: "it", seconds })),
});

/** The report `bun test` would write for `times`, as a file in the sandbox. */
const reportFile = (times: Record<string, number>): string =>
  file(
    "test-times.xml",
    `<testsuites name="bun test">\n${Object.entries(times)
      .map(
        ([f, s]) =>
          `  <testsuite name="${f}" file="${f}" time="${s}">\n    <testcase name="it" time="${s}" />\n  </testsuite>`,
      )
      .join("\n")}\n</testsuites>\n`,
  );

describe("the report: each test file's time and each test's, as bun test's JUnit reporter writes them", () => {
  test("a file's time is its own suite's, from loading it to its last hook; a test's name, its describes' and its own", () => {
    const r = readReport(XML);
    expect(r.files).toEqual([
      { file: "tests/a.test.ts", seconds: 1.41074517, tests: 4 },
      { file: "tests/b.test.ts", seconds: 0.101257845, tests: 1 },
    ]);
    expect(r.tests).toEqual([
      { file: "tests/a.test.ts", name: 'outer > inner <x> & "q" | é > slow one', seconds: 0.30127 },
      { file: "tests/a.test.ts", name: 'outer > inner <x> & "q" | é > skipped', seconds: 0 },
      { file: "tests/a.test.ts", name: 'outer > inner <x> & "q" | é > fails', seconds: 0.000762 },
      { file: "tests/a.test.ts", name: "top", seconds: 0.00003 },
      { file: "tests/b.test.ts", name: "b", seconds: 0.100578 },
    ]);
  });

  test("the empty report, a part's with nothing to run, has no file; anything else isn't one", () => {
    expect(readReport(EMPTY_REPORT)).toEqual({ files: [], tests: [] });
    for (const bad of ["", "<testsuite name='x'/>", "{}", "<testsuitesx/>"])
      expect(() => readReport(bad)).toThrow("not a JUnit report");
  });

  test("what ci:scope hands bun test: the reporter and the file, its folder made; with no test to run, the empty report", () => {
    expect(reportFlags(undefined, false)).toEqual([]);
    expect(reportFlags("", true)).toEqual([]);
    const at = join(sandbox, "flags", "deep", "r.xml");
    expect(reportFlags(at, false)).toEqual(["--reporter=junit", `--reporter-outfile=${at}`]);
    expect([existsSync(join(sandbox, "flags", "deep")), existsSync(at)]).toEqual([true, false]);
    expect(reportFlags(at, true)).toEqual([]);
    expect(readFileSync(at, "utf8")).toBe(EMPTY_REPORT);
  });
});

describe("the budget: a test file over its own fails a Linux job, and is a warning on macOS", () => {
  const own = { "tests/slow.test.ts": { seconds: 50, why: "slow on purpose" } };

  test("over: a file past BUDGET fails, the message naming it, its time and the budget; at it, it passes", () => {
    const r = check(reportFile({ "tests/a.test.ts": BUDGET + 0.1, "tests/b.test.ts": BUDGET }), "linux", own);
    expect(r.errors).toEqual([
      `test-times: tests/a.test.ts took ${(BUDGET + 0.1).toFixed(1)} s, over its budget of ${BUDGET} s (BUDGET, ` +
        "scripts/test-times.ts): make it faster or split it; or, slow for a reason, give it a budget of its own, with why",
    ]);
    expect([r.warnings, r.summary.includes("Over budget")]).toEqual([[], false]);
  });

  test("under: files within their budgets pass; one past it over MARGIN is said, not failed", () => {
    const near = (BUDGET / MARGIN) * 1.1;
    const r = check(reportFile({ "tests/a.test.ts": 1, "tests/b.test.ts": near }), "linux", own);
    expect(r.errors).toEqual([]);
    expect(r.notes).toEqual([
      `test-times: tests/b.test.ts took ${near.toFixed(1)} s, within its budget of ${BUDGET} s, but not by ${MARGIN}`,
    ]);
  });

  test("an exception: a file with a budget of its own passes past BUDGET, and fails past its own, which it names", () => {
    expect(check(reportFile({ "tests/slow.test.ts": 40 }), "linux", own).errors).toEqual([]);
    expect(check(reportFile({ "tests/slow.test.ts": 50.5 }), "linux", own).errors).toEqual([
      "test-times: tests/slow.test.ts took 50.5 s, over its budget of 50 s (its own in BUDGETS, scripts/test-times.ts): " +
        "make it faster or split it; or, slow for a reason, give it a budget of its own, with why",
    ]);
    // Near its own, said; within its own by the margin, nothing, though past BUDGET's; fast, nothing: whether it still
    // needs its own is for both systems' times, not one run's.
    expect(check(reportFile({ "tests/slow.test.ts": 40 }), "linux", own).notes).toEqual([
      "test-times: tests/slow.test.ts took 40.0 s, within its budget of 50 s, but not by 1.5",
    ]);
    for (const seconds of [25, 5]) {
      const r = check(reportFile({ "tests/slow.test.ts": seconds }), "linux", own);
      expect([seconds, r.errors, r.notes]).toEqual([seconds, [], []]);
    }
  });

  test("on macOS each budget is MACOS_FACTOR times Linux's, and a file past it a warning, in the summary too: it passes", () => {
    expect([factorFor("darwin"), factorFor("linux")]).toEqual([MACOS_FACTOR, 1]);
    expect([failsOn("darwin"), failsOn("linux")]).toEqual([false, true]);
    const times = { "tests/a.test.ts": BUDGET * 2, "tests/slow.test.ts": 5 };
    expect(check(reportFile(times), "linux", own).errors).toHaveLength(1);
    const mac = check(reportFile(times), "darwin", own);
    expect([mac.errors, mac.warnings, mac.notes]).toEqual([[], [], []]);
    const seconds = BUDGET * MACOS_FACTOR + 1;
    const over = check(reportFile({ "tests/a.test.ts": seconds }), "darwin", own);
    const warning =
      `test-times: tests/a.test.ts took ${seconds.toFixed(1)} s, over its budget of ${BUDGET * MACOS_FACTOR} s (BUDGET, ` +
      "scripts/test-times.ts): a warning, as a file's time on macOS moves too much to fail on; if Linux's grew too, " +
      "make it faster or split it";
    expect([over.errors, over.warnings]).toEqual([[], [warning]]);
    expect(over.summary).toEndWith(`|\n\nOver budget, a warning on macOS, not a failure:\n\n- ${warning}\n`);
    // The same time on Linux fails, with no warning; on macOS, a report missing still fails.
    const linux = check(reportFile({ "tests/a.test.ts": seconds }), "linux", own);
    expect([linux.errors.length, linux.warnings, linux.summary.includes("Over budget")]).toEqual([1, [], false]);
    expect(check(join(sandbox, "none.xml"), "darwin").errors).toEqual([expect.stringContaining("no report at")]);
    expect(budgetOf("tests/slow.test.ts", MACOS_FACTOR, own)).toBe(50 * MACOS_FACTOR);
  });

  test("the system judged is the runner's, as GitHub names it (RUNNER_OS), or else this machine's", () => {
    expect(systemOf({ RUNNER_OS: "macOS" }, "linux")).toBe("darwin");
    expect(systemOf({ RUNNER_OS: "Linux" }, "darwin")).toBe("linux");
    expect([systemOf({}, "darwin"), systemOf({ RUNNER_OS: "Windows" }, "linux")]).toEqual(["darwin", "linux"]);
  });

  test("a missing report fails, as does a file that isn't one, or none named; the empty one passes", () => {
    const missing = join(sandbox, "none", "test-times.xml");
    expect(check(missing, "linux").errors).toEqual([
      `test-times: no report at ${missing}: the tests wrote none (SCOPE_REPORT, D276)`,
    ]);
    expect(check(file("x.xml", "not xml"), "linux").errors).toEqual([
      expect.stringMatching(/x\.xml: not a JUnit report: no <testsuites>$/),
    ]);
    expect(check(undefined, "linux").errors).toEqual(["test-times: which report? bun run test:times <report.xml>"]);
    const empty = check(file("e.xml", EMPTY_REPORT), "linux");
    expect([empty.errors, empty.summary]).toEqual([[], "### Test times\n\nNo test file ran.\n"]);
  });

  test("each file in the report judged once, in its order: over, near, or neither", () => {
    const r = report({ "tests/a.test.ts": 31, "tests/slow.test.ts": 1, "tests/b.test.ts": 25, "tests/c.test.ts": 40 });
    expect(judge(r, 1, own)).toEqual({
      over: [
        { file: "tests/a.test.ts", seconds: 31, budget: 30 },
        { file: "tests/c.test.ts", seconds: 40, budget: 30 },
      ],
      near: [{ file: "tests/b.test.ts", seconds: 25, budget: 30 }],
    });
  });

  test("the budgets kept: each a test file there is, past BUDGET, a whole five seconds, with why; macOS's above Linux's", () => {
    expect([BUDGET, HEADROOM, MACOS_FACTOR, MARGIN]).toEqual([30, 2, 4, 1.5]);
    for (const [f, { seconds, why }] of Object.entries(BUDGETS))
      expect([f, TEST_FILE.test(f), existsSync(join(ROOT, f)), seconds > BUDGET, seconds % 5, why.length > 20]).toEqual(
        [f, true, true, true, 0, true],
      );
  });

  test("each budget of its own HEADROOM times the file's longest on Linux, its why's, up to the next five seconds", () => {
    for (const [f, { seconds, why }] of Object.entries(BUDGETS)) {
      const longest = Number(/\((\d+\.\d) s; [\d.]+ on macOS\)$/.exec(why)?.[1]);
      // Over BUDGET's share: a file that would fit BUDGET has no budget of its own.
      expect([f, longest > BUDGET / HEADROOM, seconds >= longest * HEADROOM, seconds - longest * HEADROOM < 5]).toEqual(
        [f, true, true, true],
      );
    }
  });
});

describe("the summary: the slowest files and tests, in the log and the step summary", () => {
  test("the slowest n of each, the slowest first, each file with its budget; a cell never broken nor a tag opened", () => {
    const r = readReport(XML);
    const s = summary(r, 1, 1);
    expect(s).toBe(
      [
        "### Test times",
        "",
        `2 test files, 5 tests, 1.5 s. A file's budget: ${BUDGET} s, or its own (scripts/test-times.ts).`,
        "",
        "| Slowest files | Tests | Seconds | Budget |",
        "| --- | ---: | ---: | ---: |",
        `| tests/a.test.ts | 4 | 1.4 | ${BUDGET} |`,
        "",
        "| Slowest tests | Seconds |",
        "| --- | ---: |",
        '| tests/a.test.ts: outer > inner &lt;x> & "q" \\| é > slow one | 0.3 |',
        "",
      ].join("\n"),
    );
    expect(
      summary(r)
        .split("\n")
        .filter((l) => l.startsWith("| tests/")),
    ).toHaveLength(2 + 5);
    const mac = summary(report({ "tests/slow.test.ts": 3 }), MACOS_FACTOR, 10, {
      "tests/slow.test.ts": { seconds: 50, why: "" },
    });
    expect(mac).toContain(`1 test file, 1 test, 3.0 s. A file's budget: ${BUDGET * MACOS_FACTOR} s, or its own`);
    expect(mac).toContain(`| tests/slow.test.ts | 1 | 3.0 | ${50 * MACOS_FACTOR} |`);
  });

  test("bun run test:times: the summary in the log and the step summary; a file over, on Linux an error GitHub shows and exit 1, on macOS a warning and exit 0", () => {
    const out = file("summary.md", "before\n");
    // The runner's system as GitHub names it, whichever this runs on.
    const run = (times: Record<string, number>, system: "Linux" | "macOS") => {
      const p = Bun.spawnSync([process.execPath, join(ROOT, "scripts", "test-times.ts"), reportFile(times)], {
        env: { ...process.env, GITHUB_STEP_SUMMARY: out, GITHUB_ACTIONS: "true", RUNNER_OS: system },
      });
      return { code: p.exitCode, stdout: p.stdout.toString(), stderr: p.stderr.toString() };
    };
    const fine = run({ "tests/a.test.ts": 2 }, "Linux");
    expect([fine.code, fine.stderr]).toEqual([0, ""]);
    expect(fine.stdout).toContain(`| tests/a.test.ts | 1 | 2.0 | ${BUDGET} |`);
    expect(readFileSync(out, "utf8")).toStartWith("before\n### Test times\n");
    const slow = run({ "tests/a.test.ts": 99 }, "Linux");
    expect(slow.code).toBe(1);
    expect(slow.stderr).toStartWith(`::error::test-times: tests/a.test.ts took 99.0 s, over its budget of ${BUDGET} s`);
    expect(readFileSync(out, "utf8").match(/### Test times/g)).toHaveLength(2);
    // On macOS, the same time within its budget; past it, a warning, in the step summary too, and the job passes.
    const mac = run({ "tests/a.test.ts": 99 }, "macOS");
    expect([mac.code, mac.stderr]).toEqual([0, ""]);
    const past = run({ "tests/a.test.ts": 999 }, "macOS");
    expect(past.code).toBe(0);
    expect(past.stderr).toStartWith(
      `::warning::test-times: tests/a.test.ts took 999.0 s, over its budget of ${BUDGET * MACOS_FACTOR} s`,
    );
    const written = readFileSync(out, "utf8");
    expect(written.match(/### Test times/g)).toHaveLength(4);
    expect(written).toContain(
      "Over budget, a warning on macOS, not a failure:\n\n- test-times: tests/a.test.ts took 999.0",
    );
    for (const system of ["Linux", "macOS"]) {
      const none = Bun.spawnSync([process.execPath, join(ROOT, "scripts", "test-times.ts"), join(sandbox, "no.xml")], {
        env: { ...process.env, RUNNER_OS: system },
      });
      expect([system, none.exitCode]).toEqual([system, 1]);
    }
  });
});

describe("ci:scope writes the report where SCOPE_REPORT says, and the job reads it", () => {
  test("each part's report its own files'; an empty part's, the empty report; without SCOPE_REPORT, none", () => {
    const repo = mkdtempSync(join(sandbox, "repo-"));
    mkdirSync(join(repo, "tests"));
    writeFileSync(join(repo, "package.json"), JSON.stringify({ scripts: { test: "bun test" } }));
    for (const name of ["a", "b"])
      writeFileSync(
        join(repo, "tests", `${name}.test.ts`),
        `import { test } from "bun:test";\ntest("${name}", () => {});\n`,
      );
    const part = (shard: string, report?: string) => {
      // A run by hand: every test, no diff read. The job's own SCOPE_REPORT, when this runs in CI, not handed on.
      const { SCOPE_REPORT: _, ...env } = process.env;
      return Bun.spawnSync([process.execPath, join(ROOT, "scripts", "ci-scope.ts"), "test"], {
        cwd: repo,
        env: {
          ...env,
          GITHUB_EVENT_NAME: "workflow_dispatch",
          SCOPE_SHARD: shard,
          ...(report && { SCOPE_REPORT: report }),
        },
      }).exitCode;
    };
    const at = (i: number) => join(repo, "out", `part-${i}`, "test-times.xml");
    for (const i of [1, 2, 3]) expect(part(`${i}/3`, at(i))).toBe(0);
    expect([1, 2, 3].map((i) => readReport(readFileSync(at(i), "utf8")).files.map((f) => f.file))).toEqual([
      ["tests/a.test.ts"],
      ["tests/b.test.ts"],
      [],
    ]);
    for (const i of [1, 2, 3]) expect(check(at(i), "linux").errors).toEqual([]);
    rmSync(join(repo, "out"), { recursive: true });
    expect(part("1/3")).toBe(0);
    expect(readdirSync(repo).sort()).toEqual(["package.json", "tests"]);
  });

  test("each test job, Linux's parts and macOS's: the report asked for, read once the tests ran, and uploaded", () => {
    type Step = { id?: string; name?: string; if?: string; run?: string; uses?: string; env?: Record<string, string> };
    type Job = { steps?: (Step & { with?: Record<string, string | number | boolean> })[] };
    const ci = Bun.YAML.parse(readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8")) as {
      jobs: Record<string, Job>;
    };
    const ran = "${{ !cancelled() && steps.tests.outcome != 'skipped' }}";
    const source = readFileSync(join(ROOT, "scripts", "test-times.ts"), "utf8");
    for (const job of ["test", "test-macos"]) {
      const steps = ci.jobs[job]?.steps ?? [];
      const at = (name: string) => steps.findIndex((s) => s.name === name);
      const [tests, times, upload] = [steps[at("tests")], steps[at("test times")], steps[at("upload test times")]];
      expect([job, tests?.id, tests?.run, tests?.env?.SCOPE_REPORT]).toEqual([
        job,
        "tests",
        "bun run test:changed",
        "${{ runner.temp }}/test-times.xml",
      ]);
      expect([job, times?.run, times?.if]).toEqual([job, 'bun run test:times "$RUNNER_TEMP/test-times.xml"', ran]);
      expect([job, upload?.if, upload?.uses?.split("@")[0], upload?.with?.path]).toEqual([
        job,
        ran,
        "actions/upload-artifact",
        "${{ runner.temp }}/test-times.xml",
      ]);
      expect([job, at("tests") < at("test times"), at("test times") < at("upload test times")]).toEqual([
        job,
        true,
        true,
      ]);
      // Named by the system and the part, as `slow` downloads Linux's: `test-times-Linux-*`. A job run again replaces
      // its own, as upload-artifact refuses a second under a name the run has: re-running a failed job passes.
      expect([job, upload?.with?.name, upload?.with?.overwrite]).toEqual([
        job,
        "test-times-${{ runner.os }}-${{ strategy.job-index }}",
        true,
      ]);
    }
    expect(source).toContain('"--pattern", "test-times-Linux-*"');
  });
});

describe("SLOW_TESTS from the reports, which weighs the Linux parts", () => {
  test("a file measured slow, its longest, rounded; one measured fast, out; one not measured, kept; one gone, out", () => {
    const current = {
      "tests/kept.test.ts": 12,
      "tests/faster.test.ts": 20,
      "tests/gone.test.ts": 9,
      "tests/b.test.ts": 9,
    };
    const measured = new Map([
      ["tests/faster.test.ts", SLOW - 0.1],
      ["tests/new.test.ts", 30.4],
      ["tests/a.test.ts", SLOW],
      ["tests/b.test.ts", 10.6],
      ["tests/fast.test.ts", 1],
    ]);
    const slow = slowTests(current, measured, (f) => f !== "tests/gone.test.ts");
    expect(Object.entries(slow)).toEqual([
      ["tests/new.test.ts", 30],
      ["tests/kept.test.ts", 12],
      ["tests/b.test.ts", 11],
      ["tests/a.test.ts", SLOW],
    ]);
  });

  test("ci-shard.ts rewritten: SLOW_TESTS's entries and the line saying where they're from, nothing else", () => {
    const path = join(ROOT, "scripts", "ci-shard.ts");
    const source = readFileSync(path, "utf8");
    const out = rewriteSlowTests(source, { "tests/x.test.ts": 40, "tests/y.test.ts": 9 }, "runs 1, 2 (2026-11-10)");
    const block = (text: string) => /export const SLOW_TESTS[^\n]*\{\n([\s\S]*?)\n\};/.exec(text)?.[1];
    expect(block(out)).toBe('  // runs 1, 2 (2026-11-10)\n  "tests/x.test.ts": 40,\n  "tests/y.test.ts": 9,');
    expect(out.replace(block(out) ?? "", "")).toBe(source.replace(block(source) ?? "", ""));
    // The file as it is: its own entries written back, in its own form, give the same file.
    const note = /^ {2}\/\/ (.*)$/m.exec(block(source) ?? "")?.[1] ?? "";
    expect(rewriteSlowTests(source, SLOW_TESTS, note)).toBe(source);
    expect(() => rewriteSlowTests("export const X = {};\n", {}, "")).toThrow("no `export const SLOW_TESTS");
  });

  test("each file's longest over the reports downloaded, in a folder each", () => {
    const dir = mkdtempSync(join(sandbox, "runs-"));
    for (const [run, times] of [
      ["1/test-times-Linux-0", { "tests/a.test.ts": 3, "tests/b.test.ts": 9 }],
      ["1/test-times-Linux-1", { "tests/c.test.ts": 1 }],
      ["2/test-times-Linux-0", { "tests/a.test.ts": 12, "tests/b.test.ts": 4 }],
    ] as const) {
      mkdirSync(join(dir, run), { recursive: true });
      writeFileSync(join(dir, run, "test-times.xml"), readFileSync(reportFile(times), "utf8"));
    }
    writeFileSync(join(dir, "1", "notes.txt"), "not a report");
    expect(Object.fromEntries(longest(dir))).toEqual({
      "tests/a.test.ts": 12,
      "tests/b.test.ts": 9,
      "tests/c.test.ts": 1,
    });
  });
});
