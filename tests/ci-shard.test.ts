// CI's Linux jobs in parts (D275, scripts/ci-shard.ts): every test file and every terminal check a run takes lands in
// exactly one part, none left out and none twice, for the whole suite and for what a change reaches; the same files make
// the same parts; and `ci` fails when a part does.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { importGraph, type Scope, scope, scriptFor } from "../scripts/ci-scope.ts";
import {
  allTests,
  checkWeight,
  parseShard,
  SHARDS,
  SLOW_TESTS,
  type Shard,
  shardChecks,
  shardTests,
  split,
  TEST_FILE,
  testWeight,
} from "../scripts/ci-shard.ts";
import type { Check } from "./terminal/check.ts";
import { CHECK_FILES, CHECKS } from "./terminal/checks/index.ts";

const ROOT = join(import.meta.dir, "..");

/** Every part of `count`. */
const parts = (count: number): Shard[] => Array.from({ length: count }, (_, i) => ({ index: i + 1, count }));

/** What's wrong with `pieces` as parts of `whole`: an item left out, one twice, one not of it. Empty when none. */
function partition<T>(whole: readonly T[], pieces: readonly (readonly T[])[]): string[] {
  const seen = new Map<T, number>();
  for (const p of pieces) for (const x of p) seen.set(x, (seen.get(x) ?? 0) + 1);
  return [
    ...whole.filter((x) => !seen.has(x)).map((x) => `left out: ${String(x)}`),
    ...[...seen].filter(([, n]) => n > 1).map(([x]) => `twice: ${String(x)}`),
    ...[...seen.keys()].filter((x) => !whole.includes(x)).map((x) => `not of it: ${String(x)}`),
  ];
}

describe("a part, as a job's matrix names it", () => {
  test("i/n, 1 ≤ i ≤ n; none given, the job runs whole; anything else refused, so it never runs all or none", () => {
    expect(parseShard(undefined)).toBeNull();
    expect(parseShard("1/3")).toEqual({ index: 1, count: 3 });
    expect(parseShard("3/3")).toEqual({ index: 3, count: 3 });
    expect(parseShard("1/1")).toEqual({ index: 1, count: 1 });
    expect(parseShard("12/20")).toEqual({ index: 12, count: 20 });
    for (const bad of ["", "0/3", "4/3", "1/0", "3", "/3", "1/", "a/b", "1/3 ", " 1/3", "1-3", "01/3", "-1/3", "1.5/3"])
      expect(() => parseShard(bad)).toThrow("a part is i/n");
    expect(() => split([1], 0, String, () => 1)).toThrow();
  });
});

describe("the split: the longest first, each into the part with the least so far", () => {
  const files = Array.from({ length: 23 }, (_, i) => `tests/f${String(i).padStart(2, "0")}.test.ts`);
  const weight = (f: string) => (Number(f.slice(7, 9)) % 7) + 1;

  test("every item in exactly one part, for any count and any number of items, none among them", () => {
    for (let count = 1; count <= 5; count++)
      for (let n = 0; n <= files.length; n++) {
        const items = files.slice(0, n);
        const split_ = split(items, count, (f) => f, weight);
        expect([count, n, split_.length]).toEqual([count, n, count]);
        expect([count, n, partition(items, split_)]).toEqual([count, n, []]);
      }
  });

  test("fewer items than parts: the rest are empty, and nothing is run twice to fill them", () => {
    expect(split([], 3, String, () => 1)).toEqual([[], [], []]);
    expect(split(["a"], 3, String, () => 1)).toEqual([["a"], [], []]);
    expect(split(["b", "a"], 3, String, () => 1)).toEqual([["a"], ["b"], []]);
  });

  test("the same items make the same parts, whatever order they come in; each part in its paths' order", () => {
    const once = split(files, 3, (f) => f, weight);
    for (const order of [[...files].reverse(), [...files].sort((a, b) => weight(a) - weight(b))])
      expect(split(order, 3, (f) => f, weight)).toEqual(once);
    for (const p of once) expect(p).toEqual([...p].sort());
  });

  test("balanced: no part's weight is more than the heaviest item past another's", () => {
    for (let count = 2; count <= 4; count++) {
      const loads = split(files, count, (f) => f, weight).map((p) => p.reduce((w, f) => w + weight(f), 0));
      expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(7);
    }
  });
});

describe("the tests in parts", () => {
  const tracked = Bun.spawnSync(["git", "-C", ROOT, "ls-files"]).stdout.toString().split("\n").filter(Boolean);

  test("every test file `bun test` would run is under tests/, where a part of everything takes its own from", () => {
    const tests = tracked.filter((f) => TEST_FILE.test(f));
    expect(tests.length).toBeGreaterThan(100);
    expect(tests.filter((f) => !f.startsWith("tests/"))).toEqual([]);
    const all = allTests(ROOT);
    expect(tests.filter((f) => !all.includes(f))).toEqual([]);
    expect(all.filter((f) => !existsSync(join(ROOT, f)))).toEqual([]);
    expect(all).toEqual([...all].sort());
  });

  test("the whole suite: every test file in exactly one part, for two, three or four parts", () => {
    const all = allTests(ROOT);
    for (const count of [1, 2, 3, 4])
      expect([
        count,
        partition(
          all,
          parts(count).map((s) => shardTests(all, s)),
        ),
      ]).toEqual([count, []]);
  });

  test("the whole suite in CI's parts: each about a third, none past another by more than its slowest file", () => {
    const all = allTests(ROOT);
    const loads = parts(SHARDS).map((s) => shardTests(all, s).reduce((w, f) => w + testWeight(f), 0));
    const total = all.reduce((w, f) => w + testWeight(f), 0);
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(Math.max(...Object.values(SLOW_TESTS)));
    for (const load of loads) expect(load).toBeLessThan(total / 2);
  });

  test("each slow file named is a test file there is: one moved is renamed in the list", () => {
    for (const f of Object.keys(SLOW_TESTS))
      expect([f, TEST_FILE.test(f), existsSync(join(ROOT, f))]).toEqual([f, true, true]);
    expect(testWeight("tests/organization/timeouts.test.ts")).toBe(1);
    expect(testWeight("tests/distribution/release.test.ts")).toBe(SLOW_TESTS["tests/distribution/release.test.ts"]!);
  });

  test("what a change reaches, in parts: the scope's own files, none left out, none twice, an empty part run as none", () => {
    const graph = importGraph(ROOT);
    const scopes: [string, Scope][] = [
      ["a script and its tests", scope(["scripts/ci-range.ts"], graph, ROOT)],
      ["a file of the app's", scope(["src/core/foundation/text/width.ts"], graph, ROOT)],
      ["one test file", scope(["tests/organization/timeouts.test.ts"], graph, ROOT)],
      ["nothing a test reads", scope(["_typos.toml"], graph, ROOT)],
    ];
    for (const [what, s] of scopes) {
      if (s.all !== null) throw new Error(`${what}: everything runs (${s.all})`);
      const whole = scriptFor("test", s)?.slice(1) ?? [];
      const ran = parts(SHARDS).map((shard) => scriptFor("test", s, shard, ROOT));
      for (const cmd of ran) if (cmd) expect([what, cmd[0], cmd.length]).toEqual([what, "test", cmd.length]);
      expect([
        what,
        partition(
          whole,
          ran.map((cmd) => cmd?.slice(1) ?? []),
        ),
      ]).toEqual([what, []]);
      // A part with no test runs none, rather than `bun run test` alone, which would run every one.
      expect([what, ran.filter((cmd) => cmd?.length === 1)]).toEqual([what, []]);
    }
    const one = scopes[2]![1] as Extract<Scope, { all: null }>;
    expect(one.tests).toEqual(["tests/organization/timeouts.test.ts"]);
    expect(parts(SHARDS).map((shard) => scriptFor("test", one, shard, ROOT))).toEqual([
      ["test", "./tests/organization/timeouts.test.ts"],
      null,
      null,
    ]);
    expect(parts(SHARDS).map((shard) => scriptFor("test", scopes[3]![1], shard, ROOT))).toEqual([null, null, null]);
  });

  test("everything, in parts: every test file there is, each in one part; whole, `bun run test` finds them itself", () => {
    const everything: Scope = { all: "a run by hand" };
    expect(scriptFor("test", everything)).toEqual(["test"]);
    const ran = parts(SHARDS).map((shard) => scriptFor("test", everything, shard, ROOT)?.slice(1) ?? []);
    expect(
      partition(
        allTests(ROOT).map((f) => `./${f}`),
        ran,
      ),
    ).toEqual([]);
  });
});

describe("the terminal checks in parts", () => {
  /** Each check's file, by the check. */
  const fileOf = new Map(Object.entries(CHECK_FILES).flatMap(([f, cs]) => cs.map((c): [Check, string] => [c, f])));
  /** The sets a run takes: all, an area, a feature's check files, a piece of a name, one check, none. */
  const sets: [string, Check[]][] = [
    ["every check", CHECKS],
    ["an area", CHECKS.filter((c) => c.area === "links-and-files")],
    [
      "git's files",
      [...(CHECK_FILES.git ?? []), ...(CHECK_FILES["git-diff"] ?? []), ...(CHECK_FILES["git-keys"] ?? [])],
    ],
    ["a piece of names", CHECKS.filter((c) => c.name.toLowerCase().includes("export"))],
    ["one check", CHECKS.slice(7, 8)],
    ["none", []],
  ];

  test("every check chosen in exactly one part, in the order chosen; each check file whole, in one part", () => {
    for (const [what, chosen] of sets)
      for (const count of [1, 2, 3, 4]) {
        const ran = parts(count).map((s) => shardChecks(chosen, CHECK_FILES, s));
        expect([what, count, partition(chosen, ran)]).toEqual([what, count, []]);
        for (const p of ran) expect(p).toEqual(chosen.filter((c) => p.includes(c)));
        const homes = new Map<string, Set<number>>();
        ran.forEach((p, i) => {
          for (const c of p) homes.set(fileOf.get(c)!, (homes.get(fileOf.get(c)!) ?? new Set()).add(i));
        });
        expect([what, count, [...homes].filter(([, at]) => at.size > 1).map(([f]) => f)]).toEqual([what, count, []]);
      }
    expect(parts(SHARDS).map((s) => shardChecks([], CHECK_FILES, s))).toEqual([[], [], []]);
  });

  test("every check in a check file, so none is left without a part; one in none is refused", () => {
    expect(CHECKS.filter((c) => !fileOf.has(c)).map((c) => c.name)).toEqual([]);
    const stray = { ...CHECKS[0]!, name: "a check of no file" } as Check;
    expect(() => shardChecks([...CHECKS, stray], CHECK_FILES, { index: 1, count: 3 })).toThrow("in no check file");
  });

  test("the suite in CI's parts: balanced by checks, one run alone counting as a runner's cores", () => {
    expect(checkWeight({})).toBe(1);
    expect(checkWeight({ alone: true })).toBe(4);
    const weigh = (cs: Check[]) => cs.reduce((w, c) => w + checkWeight(c), 0);
    const loads = parts(SHARDS).map((s) => weigh(shardChecks(CHECKS, CHECK_FILES, s)));
    const heaviest = Math.max(...Object.values(CHECK_FILES).map((cs) => weigh(cs)));
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(heaviest);
  });

  test("the runner's --shard: its parts' lists are its list, each check once; a part misspelt or left out refused", () => {
    const run = (...args: string[]) =>
      Bun.spawnSync([process.execPath, join(ROOT, "tests", "terminal", "run.ts"), "--list", ...args], {
        cwd: ROOT,
        env: { ...process.env, SLIPBOX_TERMINAL_JOBS: "1" },
      });
    const lines = (...args: string[]) => {
      const r = run(...args);
      expect([args, r.exitCode]).toEqual([args, 0]);
      return r.stdout.toString().split("\n").filter(Boolean);
    };
    for (const filters of [[], ["git", "export"]]) {
      const whole = lines(...filters);
      expect(whole.length).toBeGreaterThan(filters.length ? 10 : 300);
      expect(
        partition(
          whole,
          parts(SHARDS).map((s) => lines(...filters, "--shard", `${s.index}/${s.count}`)),
        ),
      ).toEqual([]);
    }
    for (const bad of [["--shard", "4/3"], ["--shard"], ["--shard", "git"]])
      expect([bad, run(...bad).exitCode]).toEqual([bad, 1]);
  });

  test("ci:scope hands a part to the runner: its filters, then `--shard i/n`; none when no check reaches the change", () => {
    const shard = { index: 2, count: 3 };
    expect(scriptFor("terminal", { all: "a run by hand" }, shard)).toEqual(["test:terminal", "--shard", "2/3"]);
    expect(scriptFor("terminal", { all: null, tests: [], checks: "all", why: [] }, shard)).toEqual([
      "test:terminal",
      "--shard",
      "2/3",
    ]);
    expect(scriptFor("terminal", { all: null, tests: [], checks: ["git", "export"], why: [] }, shard)).toEqual([
      "test:terminal",
      "git",
      "export",
      "--shard",
      "2/3",
    ]);
    expect(scriptFor("terminal", { all: null, tests: [], checks: [], why: [] }, shard)).toBeNull();
    expect(scriptFor("terminal", { all: null, tests: [], checks: ["git"], why: [] })).toEqual(["test:terminal", "git"]);
  });
});

describe("the workflow runs Linux's jobs in CI's parts, macOS's whole", () => {
  type Step = { name?: string; run?: string; env?: Record<string, string> };
  type Job = {
    needs?: string | string[];
    steps?: Step[];
    strategy?: { "fail-fast"?: boolean; matrix: { os: string[]; shard?: string[] } };
  };
  const ci = Bun.YAML.parse(readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8")) as {
    jobs: Record<string, Job>;
  };
  const wanted = parts(SHARDS).map((s) => `${s.index}/${s.count}`);

  test("`test` and `terminal` each in SHARDS parts on each Linux runner, every part to its end; macOS's in none", () => {
    for (const job of ["test", "terminal"]) {
      expect([job, ci.jobs[job]?.strategy?.matrix.shard]).toEqual([job, wanted]);
      expect([job, ci.jobs[job]?.strategy?.["fail-fast"]]).toEqual([job, false]);
      const step = ci.jobs[job]?.steps?.find((s) => s.run?.startsWith("bun run test:"));
      expect([job, step?.env?.SCOPE_SHARD]).toEqual([job, "${{ matrix.shard }}"]);
      for (const s of wanted) expect(parseShard(s)?.count).toBe(SHARDS);
    }
    for (const job of ["test-macos", "terminal-macos"]) {
      expect([job, ci.jobs[job]?.strategy]).toEqual([job, undefined]);
      expect([job, JSON.stringify(ci.jobs[job]?.steps).includes("SCOPE_SHARD")]).toEqual([job, false]);
    }
    // Every other job runs once.
    for (const [name, job] of Object.entries(ci.jobs))
      if (name !== "test" && name !== "terminal") expect([name, job.strategy?.matrix.shard]).toEqual([name, undefined]);
  });

  test("`ci` fails when any part fails or is cancelled: GitHub gives a job in parts one result for them all", () => {
    // `needs.<job>.result` for a job of several parts is a success only when every part passed; a part failed makes it a
    // failure, one cancelled (a timeout among them) a failure or cancelled. `ci`'s own script, with those results.
    const ciJob = ci.jobs.ci as Job;
    const script = ciJob.steps?.[0]?.run ?? "";
    const jobs = [ciJob.needs ?? []].flat();
    const passes = (results: Record<string, string>) => {
      const needs = Object.fromEntries(jobs.map((j) => [j, { result: results[j] ?? "success", outputs: {} }]));
      return Bun.spawnSync(["bash", "-e", "-c", script], {
        env: { ...process.env, NEEDS: JSON.stringify(needs) },
        stdout: "ignore",
      }).success;
    };
    expect(passes({})).toBe(true);
    for (const job of ["test", "terminal"]) {
      for (const result of ["failure", "cancelled"])
        expect([job, result, passes({ [job]: result, [`${job}-macos`]: "skipped" })]).toEqual([job, result, false]);
      // Skipped whole, by its `if:` (a pull request's terminal checks, the docs alone): passed.
      expect([job, passes({ [job]: "skipped", [`${job}-macos`]: "skipped" })]).toEqual([job, true]);
    }
  });
});
