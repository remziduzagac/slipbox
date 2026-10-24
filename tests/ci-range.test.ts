// Where a push's range starts (CIW-D1, CIW-D2, CIW-D3, scripts/ci-range.ts), and the workflow that hands it on: in
// repositories made for each case, GitHub's API faked.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type Api, githubApi, pushRange, recordName, versionAt } from "../scripts/ci-range.ts";
import { changedFiles, SCOPE_VERSION } from "../scripts/ci-scope.ts";

const ROOT = join(import.meta.dir, "..");
const sandbox = mkdtempSync(join(tmpdir(), "slipbox-ci-range-"));
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@t",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@t",
};

/** A repository whose commits each declare a scope's version, as `scripts/ci-scope.ts` does. */
function repo() {
  const dir = mkdtempSync(join(sandbox, "r-"));
  const git = (...args: string[]) => {
    const r = Bun.spawnSync(["git", "-C", dir, "-c", "commit.gpgsign=false", ...args], { env: gitEnv });
    if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
    return r.stdout.toString().trim();
  };
  git("init", "-q", "-b", "dev");
  const write = (files: Record<string, string>) => {
    for (const [f, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, f)), { recursive: true });
      writeFileSync(join(dir, f), text);
    }
  };
  /** A commit of `files`, its scope `version`. */
  const commit = (files: Record<string, string> = {}, version = 2) => {
    write({ "scripts/ci-scope.ts": `// the scope\nexport const SCOPE_VERSION = ${version};\n`, ...files });
    git("add", "-A");
    git("commit", "-qm", "c", "--allow-empty");
    return git("rev-parse", "HEAD");
  };
  return { dir, git, write, commit, tree: (rev = "HEAD") => git("rev-parse", `${rev}^{tree}`) };
}

type FakeRun = Partial<Record<"event" | "path" | "status" | "conclusion", string>>;

/**
 * GitHub's API, faked: the push runs that passed (by their commits; null, unreadable), the records by name, and each
 * record's run. Every path asked is kept.
 */
function fakeApi(o: {
  passes?: string[] | null;
  failed?: string[];
  records?: Record<string, { id: number; head: string; expired?: boolean }[]> | null;
  runs?: Record<number, FakeRun>;
}) {
  const asked: string[] = [];
  const api: Api = async (path) => {
    asked.push(path);
    if (path.startsWith("actions/workflows/ci.yml/runs?")) {
      if (o.passes === null) return null;
      const runs = [
        ...(o.passes ?? []).map((sha) => ({ head_sha: sha, conclusion: "success" })),
        // The list asks for runs that passed; one that didn't, listed anyway, counts for nothing.
        ...(o.failed ?? []).map((sha) => ({ head_sha: sha, conclusion: "failure" })),
      ];
      return { workflow_runs: runs.map((r, i) => ({ ...r, html_url: `run/${i}` })) };
    }
    const name = /^actions\/artifacts\?name=([^&]+)/.exec(path)?.[1];
    if (name !== undefined) {
      if (o.records === null) return null;
      const page = Number(/[?&]page=(\d+)/.exec(path)?.[1] ?? 1);
      const all = (o.records?.[name] ?? []).map((r) => ({
        expired: r.expired ?? false,
        workflow_run: { id: r.id, head_sha: r.head },
      }));
      return { artifacts: all.slice((page - 1) * 100, page * 100) };
    }
    const id = /^actions\/runs\/(\d+)$/.exec(path)?.[1];
    if (id !== undefined && o.runs?.[Number(id)]) {
      return {
        event: "pull_request",
        path: ".github/workflows/ci.yml",
        status: "completed",
        conclusion: "success",
        html_url: `pr-run/${id}`,
        ...o.runs[Number(id)],
      };
    }
    return null;
  };
  return { api, asked };
}

const range = (r: Awaited<ReturnType<typeof pushRange>>) => ("all" in r ? { all: true } : { from: r.from, to: r.to });

describe("a push's range: since the last run that passed (CIW-D1)", () => {
  test("from the nearest commit back from the one pushed whose run passed; failed and cancelled runs don't count", async () => {
    const r = repo();
    const a = r.commit({ "a.ts": "1" });
    const b = r.commit({ "a.ts": "2" });
    const c = r.commit({ "a.ts": "3" });
    const d = r.commit({ "a.ts": "4" });
    // b and c's runs were cancelled or failed: only a's passed, so d's range holds b's and c's changes.
    expect(range(await pushRange(r.dir, fakeApi({ passes: [a], failed: [c] }).api, null))).toEqual({ from: a, to: d });
    // The nearest of several; one newer than the commit, off its line, is nothing to it.
    r.git("checkout", "-q", "-b", "elsewhere");
    const e = r.commit({ "e.ts": "1" });
    r.git("checkout", "-q", "dev");
    const got = await pushRange(r.dir, fakeApi({ passes: [e, a, b] }).api, null);
    expect(range(got)).toEqual({ from: b, to: d });
    expect(got.why.join("\n")).toContain(`since ${b.slice(0, 7)}: run run/2 passed`);
    // The commit pushed passed already (dev moved to test, CIW-D3): an empty range.
    expect(range(await pushRange(r.dir, fakeApi({ passes: [d, a] }).api, null))).toEqual({ from: d, to: d });
  });

  test("a pass of another version of the scope doesn't count; neither does a hash that isn't one", async () => {
    const r = repo();
    const old = r.commit({ "a.ts": "1" }, 1);
    const mid = r.commit({ "a.ts": "2" }, 2);
    r.commit({ "a.ts": "3" }, 2);
    expect(range(await pushRange(r.dir, fakeApi({ passes: [old] }).api, null))).toEqual({ all: true });
    expect(range(await pushRange(r.dir, fakeApi({ passes: [old, mid] }).api, null))).toMatchObject({ from: mid });
    // The version raised: the passes of the one before stop counting.
    r.commit({ "a.ts": "4" }, 3);
    expect(range(await pushRange(r.dir, fakeApi({ passes: [mid] }).api, null))).toEqual({ all: true });
    const short = mid.slice(0, 7);
    expect(range(await pushRange(r.dir, fakeApi({ passes: [short, "HEAD", `${mid}x`] }).api, null))).toEqual({
      all: true,
    });
  });

  test("with none, from test's head when it's of the version; else everything; what can't be read tests more", async () => {
    const r = repo();
    const old = r.commit({ "a.ts": "1" }, 1);
    const t = r.commit({ "a.ts": "2" });
    const head = r.commit({ "a.ts": "3" });
    const none = fakeApi({ passes: [] }).api;
    expect(range(await pushRange(r.dir, none, t))).toEqual({ from: t, to: head });
    // test moved to a pass of the scope before, which may have left merges untested: everything.
    expect(range(await pushRange(r.dir, none, old))).toEqual({ all: true });
    // A branch just made (`before` all zeros), test's head unknown, or not behind the commit pushed.
    expect(range(await pushRange(r.dir, none, "0".repeat(40)))).toEqual({ all: true });
    expect(range(await pushRange(r.dir, none, null))).toEqual({ all: true });
    r.git("checkout", "-q", "-b", "ahead");
    const off = r.commit({ "b.ts": "1" });
    r.git("checkout", "-q", "dev");
    expect(range(await pushRange(r.dir, none, off))).toEqual({ all: true });
    // The runs unreadable, or no token to read them: test's head, said so.
    const unread = await pushRange(r.dir, fakeApi({ passes: null }).api, t);
    expect(range(unread)).toEqual({ from: t, to: head });
    expect(unread.why[0]).toBe("the runs that passed can't be read");
    expect((await pushRange(r.dir, null, t)).why[0]).toBe("no token to read the runs that passed");
    // A commit whose scope says no version: nothing it says can be trusted.
    r.write({ "scripts/ci-scope.ts": "// gone\n" });
    r.git("commit", "-qam", "no version");
    expect(range(await pushRange(r.dir, fakeApi({ passes: [t] }).api, t))).toEqual({ all: true });
  });
});

describe("a merge doesn't test again what its pull request's run passed (CIW-D2)", () => {
  /** dev at `p`, a pull request's branch `h` off it, squashed onto it as `s`; a stranger's branch `x` off `p`. */
  function merged() {
    const r = repo();
    const o = r.commit({ "a.ts": "0" });
    const p = r.commit({ "a.ts": "1" });
    r.git("checkout", "-q", "-b", "feature");
    const h = r.commit({ "b.ts": "1" });
    r.git("checkout", "-q", "-b", "stranger", p);
    const x = r.commit({ "c.ts": "1" });
    r.git("checkout", "-q", "dev");
    r.git("merge", "--squash", "-q", "feature");
    r.git("commit", "-qm", "feat: b (#1)");
    const s = r.git("rev-parse", "HEAD");
    return { r, o, p, h, x, s, name: recordName(2, p, r.tree(s)) };
  }

  test("a record of its parent and tree, from a pull request's run that passed and whose head makes it", async () => {
    const { r, o, p, h, s, name } = merged();
    // dev's last pass is its parent: nothing to test.
    const got = await pushRange(
      r.dir,
      fakeApi({ passes: [p], records: { [name]: [{ id: 7, head: h }] }, runs: { 7: {} } }).api,
      null,
    );
    expect(range(got)).toEqual({ from: p, to: p });
    expect(got.why.at(-1)).toContain("passed in pull request run pr-run/7 on its parent");
    // An older last pass: what landed before the parent still runs, on the squash's tree.
    expect(
      range(
        await pushRange(
          r.dir,
          fakeApi({ passes: [o], records: { [name]: [{ id: 7, head: h }] }, runs: { 7: {} } }).api,
          null,
        ),
      ),
    ).toEqual({ from: o, to: p });
    // The commit pushed passed already: no record asked for.
    const f = fakeApi({ passes: [s], records: { [name]: [{ id: 7, head: h }] }, runs: { 7: {} } });
    expect(range(await pushRange(r.dir, f.api, null))).toEqual({ from: s, to: s });
    expect(f.asked.some((a) => a.startsWith("actions/artifacts"))).toBe(false);
  });

  test("a record whose run is going, failed, isn't a pull request's or isn't ci.yml's, counts for nothing", async () => {
    const { r, p, h, s, name } = merged();
    for (const run of [
      { status: "in_progress", conclusion: "" },
      // Re-run, and going again: the attempt before's conclusion is no word on this one's.
      { status: "in_progress", conclusion: "success" },
      { conclusion: "failure" },
      { conclusion: "cancelled" },
      { event: "push" },
      { path: ".github/workflows/pages.yml" },
    ] as FakeRun[]) {
      const f = fakeApi({ passes: [p], records: { [name]: [{ id: 7, head: h }] }, runs: { 7: run } });
      expect([run, range(await pushRange(r.dir, f.api, null))]).toEqual([run, { from: p, to: s }]);
    }
    // Expired, or the records unreadable.
    for (const records of [{ [name]: [{ id: 7, head: h, expired: true }] }, null])
      expect(range(await pushRange(r.dir, fakeApi({ passes: [p], records, runs: { 7: {} } }).api, null))).toEqual({
        from: p,
        to: s,
      });
  });

  test("a record another branch's run wrote doesn't make the tree, and is passed over; a good one after it is taken", async () => {
    const { r, p, h, x, s, name } = merged();
    // The stranger's run passed (its own trivial workflow), its record naming the squash's parent and tree.
    const forged = { [name]: [{ id: 8, head: x }] };
    expect(range(await pushRange(r.dir, fakeApi({ passes: [p], records: forged, runs: { 8: {} } }).api, null))).toEqual(
      {
        from: p,
        to: s,
      },
    );
    const both = {
      [name]: [
        { id: 8, head: x },
        { id: 7, head: h },
      ],
    };
    expect(
      range(await pushRange(r.dir, fakeApi({ passes: [p], records: both, runs: { 7: {}, 8: {} } }).api, null)),
    ).toEqual({ from: p, to: p });
    // Past the first page.
    const many = { [name]: [...Array.from({ length: 100 }, () => ({ id: 8, head: x })), { id: 7, head: h }] };
    expect(
      range(await pushRange(r.dir, fakeApi({ passes: [p], records: many, runs: { 7: {}, 8: {} } }).api, null)),
    ).toEqual({ from: p, to: p });
  });

  test("the pull request's head, which its merged branch no longer holds, fetched by its hash", async () => {
    const { r, p, h, name } = merged();
    // CI's checkout: dev's history alone; the head kept only under the pull request's ref, as GitHub keeps it.
    const origin = join(sandbox, `origin-${Date.now()}.git`);
    expect(Bun.spawnSync(["git", "clone", "-q", "--bare", "--no-local", r.dir, origin]).success).toBe(true);
    Bun.spawnSync(["git", "-C", origin, "update-ref", "refs/pull/1/head", h]);
    Bun.spawnSync(["git", "-C", origin, "branch", "-q", "-D", "feature", "stranger"]);
    const ci = join(sandbox, `ci-${Date.now()}`);
    expect(
      Bun.spawnSync(["git", "clone", "-q", "--no-local", "--single-branch", "--branch", "dev", origin, ci]).success,
    ).toBe(true);
    expect(Bun.spawnSync(["git", "-C", ci, "cat-file", "-e", `${h}^{commit}`], { stderr: "ignore" }).success).toBe(
      false,
    );
    const f = fakeApi({ passes: [p], records: { [name]: [{ id: 7, head: h }] }, runs: { 7: {} } });
    expect(range(await pushRange(ci, f.api, null))).toEqual({ from: p, to: p });
  });
});

describe("a pull request's run names its record (CIW-D2)", () => {
  test("ci:scope for a pull request: its merge commit's parent and tree, and what the scope said, for the upload", () => {
    const r = repo();
    const base = r.commit({ "src/a.ts": "1" });
    r.commit({ "docs/x.md": "# x\n" });
    const temp = mkdtempSync(join(sandbox, "temp-"));
    const out = join(temp, "out");
    writeFileSync(out, "");
    Bun.spawnSync([process.execPath, join(ROOT, "scripts", "ci-scope.ts")], {
      cwd: r.dir,
      env: { ...gitEnv, GITHUB_EVENT_NAME: "pull_request", GITHUB_OUTPUT: out, RUNNER_TEMP: temp, GH_TOKEN: "" },
    });
    expect(readFileSync(out, "utf8")).toBe(
      `record=${recordName(SCOPE_VERSION, base, r.tree())}\ncode=false\nchecks=false\n`,
    );
    expect(readFileSync(join(temp, "ci-tested.txt"), "utf8")).toContain("the docs only");
  });
});

describe("a job after `changes` reads the range it was given", () => {
  test("a push's files: the range's; `all`, nothing, or anything else, everything", () => {
    const r = repo();
    const a = r.commit({ "src/a.ts": "1" });
    const b = r.commit({ "src/b.ts": "1", "docs/x.md": "# x\n" });
    const saved = { event: process.env.GITHUB_EVENT_NAME, range: process.env.SCOPE_RANGE };
    const files = (range?: string) => {
      process.env.GITHUB_EVENT_NAME = "push";
      if (range === undefined) delete process.env.SCOPE_RANGE;
      else process.env.SCOPE_RANGE = range;
      return changedFiles(r.dir);
    };
    try {
      expect(files(`${a}..${b}`)?.sort()).toEqual(["docs/x.md", "src/b.ts"]);
      expect(files(`${b}..${b}`)).toEqual([]);
      for (const range of ["all", "", undefined, `${a.slice(0, 7)}..${b}`, `${a}..${b};rm`])
        expect([range, files(range)]).toEqual([range, null]);
    } finally {
      for (const [k, v] of [
        ["GITHUB_EVENT_NAME", saved.event],
        ["SCOPE_RANGE", saved.range],
      ] as const)
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
  });
});

describe("the API and the scope's version", () => {
  test("SCOPE_VERSION, read from a commit as the range reads it", () => {
    // The scope as it is, committed: its declaration is one the reader finds.
    const r = repo();
    r.write({ "scripts/ci-scope.ts": readFileSync(join(ROOT, "scripts", "ci-scope.ts"), "utf8") });
    r.git("add", "-A");
    r.git("commit", "-qm", "the scope");
    expect(versionAt(r.dir, "HEAD")).toBe(SCOPE_VERSION);
    expect(versionAt(r.dir, "HEAD~1")).toBeNull();
    expect(recordName(SCOPE_VERSION, "a".repeat(40), "b".repeat(40))).toBe(
      `ci-tested-v${SCOPE_VERSION}-${"a".repeat(40)}-${"b".repeat(40)}`,
    );
  });

  test("GitHub's API with the job's token, under its repository; none without one; null when it fails", async () => {
    const seen: { url: string; auth: string | null }[] = [];
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        seen.push({ url: new URL(req.url).pathname + new URL(req.url).search, auth: req.headers.get("authorization") });
        return req.url.includes("missing") ? new Response("no", { status: 404 }) : Response.json({ ok: 1 });
      },
    });
    try {
      const env = { GITHUB_REPOSITORY: "o/r", GH_TOKEN: "tok", GITHUB_API_URL: `http://localhost:${server.port}` };
      expect(githubApi({ ...env, GH_TOKEN: "" })).toBeNull();
      expect(githubApi({ ...env, GITHUB_REPOSITORY: undefined })).toBeNull();
      const api = githubApi(env);
      expect(await api?.("actions/runs/1")).toEqual({ ok: 1 });
      expect(await api?.("missing")).toBeNull();
      expect(seen[0]).toEqual({ url: "/repos/o/r/actions/runs/1", auth: "Bearer tok" });
      expect(await githubApi({ ...env, GITHUB_API_URL: "http://localhost:1" })?.("x")).toBeNull();
    } finally {
      server.stop(true);
    }
  });
});

describe("the workflow hands the range on (CIW-D1–CIW-D4)", () => {
  type Step = { id?: string; if?: string; uses?: string; run?: string; env?: Record<string, string> } & Record<
    string,
    unknown
  >;
  type Job = { permissions?: Record<string, string>; outputs?: Record<string, string>; steps?: Step[] };
  const ci = Bun.YAML.parse(readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8")) as {
    concurrency: { group: string; "cancel-in-progress": string };
    jobs: Record<string, Job>;
  };

  test("only `changes` reads the runs, its token given only for a push; the record uploaded for a pull request", () => {
    const changes = ci.jobs.changes as Job;
    expect(Object.keys(changes.permissions ?? {}).sort()).toEqual(["actions", "contents"]);
    expect(changes.permissions).toEqual({ contents: "read", actions: "read" });
    for (const [name, job] of Object.entries(ci.jobs))
      if (name !== "changes") expect([name, job.permissions?.actions]).toEqual([name, undefined]);
    const scope = changes.steps?.find((s) => s.id === "scope");
    expect(scope?.run).toBe("bun run ci:scope");
    expect(scope?.env?.GH_TOKEN).toBe("${{ github.event_name == 'push' && github.token || '' }}");
    expect(changes.outputs?.range).toBe("${{ steps.scope.outputs.range }}");
    // The upload: only when there's a record (a pull request's run), from the runner's temporary folder, pinned as
    // build.yml pins it, never failing the run.
    const upload = changes.steps?.find((s) => s.uses?.startsWith("actions/upload-artifact@"));
    const build = readFileSync(join(ROOT, ".github", "workflows", "build.yml"), "utf8");
    expect(build).toContain(`uses: ${upload?.uses}`);
    expect(upload?.if).toBe("${{ steps.scope.outputs.record != '' }}");
    expect(upload?.["continue-on-error"]).toBe(true);
    expect(upload?.with).toMatchObject({
      name: "${{ steps.scope.outputs.record }}",
      path: "${{ runner.temp }}/ci-tested.txt",
      "retention-days": 7,
    });
  });

  test("`test` and `terminal` read the range `changes` worked out, never the event's `before`", () => {
    for (const job of ["test", "terminal"]) {
      const steps = ci.jobs[job]?.steps ?? [];
      const runs = steps.find((s) => s.run === "bun run test:changed" || s.run === "bun run test:terminal:changed");
      expect([job, runs?.env?.SCOPE_RANGE]).toEqual([job, "${{ needs.changes.outputs.range }}"]);
      expect([job, JSON.stringify(steps).includes("github.event.before")]).toEqual([job, false]);
    }
  });

  test("a push's superseded run gives way, as a pull request's; a run by hand and a merge group's never do", () => {
    // GitHub's expressions as JavaScript: `||` and `&&` give an operand, as there; `==` compares; a property of nothing
    // is nothing.
    const evaluate = (expr: string, github: object) =>
      new Function(
        "github",
        `return ${expr
          .replace(/^\$\{\{(.*)\}\}$/s, "$1")
          .replace(/==/g, "===")
          .replace(/\b(\w+)\./g, "$1?.")};`,
      )(github);
    const of = (event_name: string, more: object = {}) => {
      const github = { event_name, ref: "refs/heads/dev", run_id: 99, event: {}, ...more };
      return {
        group: String(ci.concurrency.group).replace(/\$\{\{.*\}\}/s, (e) => String(evaluate(e, github))),
        cancel: evaluate(ci.concurrency["cancel-in-progress"], github),
      };
    };
    expect(of("pull_request", { event: { pull_request: { number: 12 } }, ref: "refs/pull/12/merge" })).toEqual({
      group: "ci-12",
      cancel: true,
    });
    expect(of("push")).toEqual({ group: "ci-refs/heads/dev", cancel: true });
    // A run by hand, the full run on `test` among them, in a group of its own: a push to `test` can't cancel it.
    expect(of("workflow_dispatch", { ref: "refs/heads/test" })).toEqual({ group: "ci-99", cancel: false });
    expect(of("merge_group", { ref: "refs/heads/gh-readonly-queue/dev/x" })).toEqual({ group: "ci-99", cancel: false });
  });

  test("ci:scope as `changes` runs it for a push: the range found, handed on, and nothing run when it's empty", async () => {
    const r = repo();
    const a = r.commit({ "src/a.ts": "1" });
    const b = r.commit({ "docs/x.md": "# x\n" });
    let passes: string[] = [];
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname.endsWith("/actions/workflows/ci.yml/runs"))
          return Response.json({ workflow_runs: passes.map((s) => ({ head_sha: s, conclusion: "success" })) });
        return Response.json({ artifacts: [] });
      },
    });
    let n = 0;
    // Spawned and awaited, never blocking: the fake API answers from this process.
    const run = async (env: Record<string, string>) => {
      const out = join(sandbox, `out-${++n}`);
      writeFileSync(out, "");
      const p = Bun.spawn([process.execPath, join(ROOT, "scripts", "ci-scope.ts")], {
        stdout: "pipe",
        cwd: r.dir,
        env: {
          ...gitEnv,
          GITHUB_EVENT_NAME: "push",
          GITHUB_REF_NAME: "dev",
          GITHUB_REPOSITORY: "o/r",
          GITHUB_API_URL: `http://localhost:${server.port}`,
          GH_TOKEN: "tok",
          GITHUB_OUTPUT: out,
          ...env,
        },
      });
      const log = await new Response(p.stdout).text();
      await p.exited;
      const said = Object.fromEntries(
        readFileSync(out, "utf8")
          .split("\n")
          .filter(Boolean)
          .map((l) => l.split("=") as [string, string]),
      );
      return { ...said, log };
    };
    try {
      // Since a: the docs alone.
      passes = [a];
      expect(await run({})).toMatchObject({ range: `${a}..${b}`, code: "false", checks: "false" });
      // b itself passed (dev moved to test): nothing runs, and the log says so.
      passes = [b];
      const same = await run({ GITHUB_REF_NAME: "test", SCOPE_BEFORE: a });
      expect(same).toMatchObject({ range: `${b}..${b}`, code: "false", checks: "false" });
      expect(same.log).toContain("no test runs");
      // None passed, no test branch: everything.
      passes = [];
      expect(await run({})).toMatchObject({ range: "all", code: "true", checks: "true" });
    } finally {
      server.stop(true);
    }
  });
});
