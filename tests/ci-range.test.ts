// Where a push's range starts (CIW-D1, CIW-D2, CIW-D3, scripts/ci-range.ts), and the workflow that hands it on: in
// repositories made for each case, GitHub's API faked. And where macOS runs (D273): after Linux, and on a pull request
// only for what differs there.
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type Api, githubApi, pushRange, recordName, recordRun, versionAt } from "../scripts/ci-range.ts";
import { changedFiles, eventLabels, importGraph, MACOS, macosFor, SCOPE_VERSION } from "../scripts/ci-scope.ts";

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
    // An element that isn't a run is passed over, not a crash that fails the run.
    const odd: Api = async () => ({
      workflow_runs: [null, 3, { head_sha: mid, conclusion: "success", html_url: "u" }],
    });
    expect(range(await pushRange(r.dir, odd, null))).toMatchObject({ from: mid });
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
    expect(unread.why).toEqual([
      "the runs that passed can't be read",
      `since test's head ${t.slice(0, 7)}: which runs passed is unknown`,
    ]);
    expect((await pushRange(r.dir, null, t)).why[0]).toBe("no token to read the runs that passed");
    expect(await pushRange(r.dir, null, old)).toEqual({
      all: "which runs passed is unknown, and test's head is of another, or not behind it",
      why: ["no token to read the runs that passed"],
    });
    expect(await pushRange(r.dir, none, old)).toMatchObject({ all: expect.stringMatching(/^no run of this scope/) });
    // A commit whose scope says no version: nothing it says can be trusted.
    r.write({ "scripts/ci-scope.ts": "// gone\n" });
    r.git("commit", "-qam", "no version");
    expect(range(await pushRange(r.dir, fakeApi({ passes: [t] }).api, t))).toEqual({ all: true });
  });
});

describe("a merge doesn't test again what its pull request's run passed (CIW-D2)", () => {
  /** dev at `p`, a pull request's branch `h` off it, squashed onto it as `s`; a stranger's branch `x` off `p`. */
  function merged(version = 2) {
    const r = repo();
    const o = r.commit({ "a.ts": "0" }, version);
    const p = r.commit({ "a.ts": "1" }, version);
    r.git("checkout", "-q", "-b", "feature");
    const h = r.commit({ "b.ts": "1" }, version);
    r.git("checkout", "-q", "-b", "stranger", p);
    const x = r.commit({ "c.ts": "1" }, version);
    r.git("checkout", "-q", "dev");
    r.git("merge", "--squash", "-q", "feature");
    r.git("commit", "-qm", "feat: b (#1)");
    const s = r.git("rev-parse", "HEAD");
    return { r, o, p, h, x, s, name: recordName(version, p, r.tree(s)) };
  }

  test("PR coverage without terminal checks never shortens their push scope (D266)", async () => {
    const { r, o, p, h, s, name } = merged(SCOPE_VERSION);
    expect(SCOPE_VERSION).toBeGreaterThanOrEqual(3);
    for (const last of [p, o]) {
      const f = fakeApi({ passes: [last], records: { [name]: [{ id: 7, head: h }] }, runs: { 7: {} } });
      expect(range(await pushRange(r.dir, f.api, null))).toEqual({ from: last, to: s });
      expect(f.asked.some((a) => a.startsWith("actions/artifacts"))).toBe(false);
    }
    // A full-platform push pass still covers promotion to the same tested tree (CIW-D3).
    expect(range(await pushRange(r.dir, fakeApi({ passes: [s] }).api, null))).toEqual({ from: s, to: s });
  });

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
    // An element that isn't a record is passed over.
    const runs = { 7: {}, 8: {} };
    const f = fakeApi({ passes: [p], records: both, runs });
    const odd: Api = async (path) => {
      const got = (await f.api(path)) as { artifacts?: unknown[] } | null;
      return path.startsWith("actions/artifacts") ? { artifacts: [null, 3, ...(got?.artifacts ?? [])] } : got;
    };
    expect(await recordRun(odd, r.dir, name, p, r.tree(s))).toBe("pr-run/7");
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

  test("past its time the lookup gives up, finding none: a slow API, or a fetch that doesn't answer", async () => {
    const { r, p, h, s, name } = merged();
    const f = fakeApi({ passes: [p], records: { [name]: [{ id: 7, head: h }] }, runs: { 7: {} } });
    expect(await recordRun(f.api, r.dir, name, p, r.tree(s))).toBe("pr-run/7");
    const late = fakeApi({ passes: [p], records: { [name]: [{ id: 7, head: h }] }, runs: { 7: {} } });
    expect(await recordRun(late.api, r.dir, name, p, r.tree(s), Date.now() - 1)).toBeNull();
    expect(late.asked).toEqual([]);
    // The head missing, and an origin that never answers: the fetch is stopped when the time's up.
    const ci = join(sandbox, `hung-${Date.now()}`);
    expect(
      Bun.spawnSync(["git", "clone", "-q", "--no-local", "--single-branch", "--branch", "dev", r.dir, ci]).success,
    ).toBe(true);
    Bun.spawnSync(["git", "-C", ci, "config", "protocol.ext.allow", "always"]);
    Bun.spawnSync(["git", "-C", ci, "remote", "set-url", "origin", "ext::sleep 30"]);
    const start = Date.now();
    expect(await recordRun(f.api, ci, name, p, r.tree(s), Date.now() + 500)).toBeNull();
    expect(Date.now() - start).toBeLessThan(4000);
  });
});

describe("a PR without terminal coverage does not certify complete checks (D266)", () => {
  test("ci:scope reports the PR scope without creating a full-platform record", () => {
    const r = repo();
    r.commit({ "src/a.ts": "1" });
    r.commit({ "docs/x.md": "# x\n" });
    const temp = mkdtempSync(join(sandbox, "temp-"));
    const out = join(temp, "out");
    writeFileSync(out, "");
    const event = join(temp, "event.json");
    writeFileSync(event, JSON.stringify({ pull_request: { labels: [] } }));
    Bun.spawnSync([process.execPath, join(ROOT, "scripts", "ci-scope.ts")], {
      cwd: r.dir,
      env: {
        ...gitEnv,
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_EVENT_PATH: event,
        GITHUB_OUTPUT: out,
        RUNNER_TEMP: temp,
        GH_TOKEN: "",
      },
    });
    expect(readFileSync(out, "utf8")).toBe("code=false\nchecks=false\nmacos=false\n");
    expect(existsSync(join(temp, "ci-tested.txt"))).toBe(false);
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
  type Job = {
    name?: string;
    needs?: string | string[];
    "runs-on"?: string;
    permissions?: Record<string, string>;
    outputs?: Record<string, string>;
    steps?: Step[];
    if?: string;
    strategy?: { matrix: { os: string | string[] } };
  };
  const ci = Bun.YAML.parse(readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8")) as {
    on: { pull_request?: { types?: string[] } | null };
    concurrency: { group: string; "cancel-in-progress": string };
    jobs: Record<string, Job>;
  };

  test("PRs retain both unit platforms and the site; only non-PR events run terminal checks (D266)", () => {
    const expression = (text: string) => text.replace(/^\$\{\{(.*)\}\}$/s, "$1");
    for (const event_name of ["pull_request", "push", "merge_group", "workflow_dispatch"]) {
      const github = { event_name };
      // Linux in the matrices; macOS in jobs of their own, after them (D273).
      expect(ci.jobs.test?.strategy?.matrix.os).toEqual(["ubuntu-24.04"]);
      expect(ci.jobs["test-macos"]?.["runs-on"]).toBe("macos-15");
      expect(ci.jobs.terminal?.strategy?.matrix.os).toEqual(["ubuntu-24.04", "ubuntu-24.04-arm"]);
      expect(ci.jobs["terminal-macos"]?.["runs-on"]).toBe("macos-15");
      expect(ci.jobs.site?.if).toBeUndefined();
      for (const checks of ["true", "false"]) {
        const run = new Function("github", "needs", `return ${expression(ci.jobs.terminal!.if!)}`)(github, {
          changes: { outputs: { checks } },
        });
        expect(run).toBe(event_name !== "pull_request" && checks === "true");
      }
    }
  });

  test("only `changes` reads the runs, its token given only for a push; no incomplete PR record is uploaded", () => {
    const changes = ci.jobs.changes as Job;
    expect(Object.keys(changes.permissions ?? {}).sort()).toEqual(["actions", "contents"]);
    expect(changes.permissions).toEqual({ contents: "read", actions: "read" });
    for (const [name, job] of Object.entries(ci.jobs))
      if (name !== "changes") expect([name, job.permissions?.actions]).toEqual([name, undefined]);
    const scope = changes.steps?.find((s) => s.id === "scope");
    expect(scope?.run).toBe("bun run ci:scope");
    expect(scope?.env?.GH_TOKEN).toBe("${{ github.event_name == 'push' && github.token || '' }}");
    expect(changes.outputs?.range).toBe("${{ steps.scope.outputs.range }}");
    expect(changes.steps?.some((s) => s.uses?.startsWith("actions/upload-artifact@"))).toBe(false);
  });

  test("`test` and `terminal` read the range `changes` worked out, never the event's `before`", () => {
    for (const job of ["test", "test-macos", "terminal", "terminal-macos"]) {
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
      const github = { event_name, ref: "refs/heads/dev", run_id: 99, run_attempt: "1", event: {}, ...more };
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
    // A push's run re-run, an older commit's say, in a group of its own: it can't cancel the branch's newest run.
    expect(of("push", { run_attempt: "2" })).toEqual({ group: "ci-99", cancel: true });
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
      // Since a: the docs alone. A push runs macOS whatever changed (D273).
      passes = [a];
      expect(await run({})).toMatchObject({ range: `${a}..${b}`, code: "false", checks: "false", macos: "true" });
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

describe("macOS after Linux, and on a pull request only for what differs there (D273)", () => {
  test("each of MACOS's patterns names a file there is: one stale would leave its part to the push", () => {
    const tracked = Bun.spawnSync(["git", "-C", ROOT, "ls-files"]).stdout.toString().split("\n").filter(Boolean);
    expect(tracked).toContain("scripts/ci-scope.ts");
    expect(MACOS.filter((re) => !tracked.some((f) => re.test(f))).map(String)).toEqual([]);
  });

  test("a pull request runs macOS for a file of what differs there, its tests among them", () => {
    for (const f of [
      // The terminal's input and output.
      "src/tui/shell/terminal/opentui.ts",
      "src/tui/documents/saving/handoff.ts",
      "src/core/documents/external-editors/nvim.ts",
      "tests/terminal/terminal.ts",
      // Spawning processes and the system's tools, Apple's SQLite among them.
      "src/core/foundation/platform/tool-process.ts",
      "src/core/foundation/platform/clipboard.ts",
      "src/core/documents/servers/locks.ts",
      "tests/core/documents/servers/discovery.test.ts",
      "tests/core/documents/servers/manager.test.ts",
      // Apple's SQLite: every file that opens a database, and their tests.
      "tests/core/foundation/platform/sqlite.test.ts",
      "src/core/workspace/search/search-index.ts",
      "tests/core/workspace/search/index.test.ts",
      "src/core/documents/markdown/parsecache.ts",
      "tests/core/documents/markdown/content-cache.test.ts",
      "src/core/rendering/media/diagrams/diagram-cache.ts",
      "tests/diagram-cache.test.ts",
      // The file system's paths, times and watchers.
      "src/core/workspace/graph/watch.ts",
      "src/core/workspace/graph/watch/directories.ts",
      "tests/core/workspace/graph/watch-mechanisms.test.ts",
      "src/core/workspace/walk/io/stamps.ts",
      "src/core/workspace/walk/filtering/policy.ts",
      "tests/core/workspace/walk/walk.test.ts",
      "tests/core/workspace/walk/mechanisms.test.ts",
      "tests/core/workspace/walk/hostile.test.ts",
      "src/core/workspace/vaults/mounts.ts",
      "tests/core/workspace/vaults/symlinks/following.test.ts",
      "src/core/workspace/links/links.ts",
      "tests/setup.ts",
      // Fonts and pictures.
      "src/core/rendering/export/assets/fonts.ts",
      "src/core/rendering/export/formats/pdf/fonts/adapter.ts",
      "tests/core/rendering/export/pdf/fonts.test.ts",
      "src/core/rendering/media/images/svg.ts",
      "src/tui/documents/media/pictures.ts",
      // The installer.
      "scripts/install.template.sh",
      "scripts/homebrew.template.rb",
      "scripts/release.ts",
      "src/core/application/distribution/restart.ts",
      "src/tui/app/distribution/updates.ts",
      "src/cli/install.ts",
      "tests/terminal/release-builds.ts",
      "tests/distribution/installation.test.ts",
      // The workflows and what decides what they run; the packages and the toolchain.
      ".github/workflows/ci.yml",
      "scripts/ci-scope.ts",
      "package.json",
      "bun.lock",
      "mise.toml",
    ])
      expect([f, macosFor([f], [])]).toEqual([f, `${f} differs there`]);
  });

  test("…and not for a file that only uses them, nor the docs; the first that differs is the reason", () => {
    for (const f of [
      "src/tui/app/runtime/app.ts",
      "src/tui/shell/terminal/canvas.ts",
      "src/core/foundation/platform/lazy.ts",
      "src/core/foundation/platform/wsl.ts",
      "src/core/workspace/graph/graph.ts",
      "src/core/documents/markdown/parse/headings.ts",
      "src/core/documents/servers/transport.ts",
      "src/core/application/distribution/skill.ts",
      "src/core/application/distribution/skill-lifecycle.ts",
      "src/tui/workspace/git/views/branches/gitbranchview.ts",
      "tests/tui/workspace/git/panel/branches.test.ts",
      "tests/terminal/checks/vaults.ts",
      "examples/home/CASES.md",
      "scripts/check-docs.ts",
      "docs/guides/getting-started.md",
    ])
      expect([f, macosFor([f], [])]).toEqual([f, null]);
    expect(macosFor(["src/tui/app/runtime/app.ts", "bun.lock", ".github/workflows/ci.yml"], [])).toBe(
      "bun.lock differs there",
    );
  });

  test("a test of a file of `src/` that differs there runs it too, wherever it sits; a file that uses one doesn't", () => {
    const sqlite = "src/core/foundation/platform/sqlite.ts";
    const graph = new Map([
      ["tests/elsewhere/cache.test.ts", ["src/core/foundation/text/width.ts", sqlite]],
      ["tests/elsewhere/cache.test.tsx", [sqlite]],
      ["tests/elsewhere/width.test.ts", ["src/core/foundation/text/width.ts"]],
      ["tests/elsewhere/helper.ts", [sqlite]],
      ["tests/elsewhere/setup.test.ts", ["tests/setup.ts"]],
      ["src/tui/app/runtime/app.ts", ["src/tui/shell/terminal/opentui.ts"]],
    ]);
    for (const f of ["tests/elsewhere/cache.test.ts", "tests/elsewhere/cache.test.tsx"])
      expect([f, macosFor([f], [], graph)]).toEqual([f, `${f} tests ${sqlite}, which differs there`]);
    for (const f of [
      "tests/elsewhere/width.test.ts",
      "tests/elsewhere/helper.ts",
      "tests/elsewhere/setup.test.ts",
      "src/tui/app/runtime/app.ts",
    ])
      expect([f, macosFor([f], [], graph)]).toEqual([f, null]);
    // A file listed is the reason before a test's imports; without the graph, a test is only its path.
    expect(macosFor(["tests/elsewhere/cache.test.ts", "bun.lock"], [], graph)).toBe("bun.lock differs there");
    expect(macosFor(["tests/elsewhere/cache.test.ts"], [])).toBeNull();
    // Here: a cache's test, and a search's, that no folder of the list holds.
    const real = importGraph(ROOT);
    for (const f of ["tests/html-cache.test.ts", "tests/core/workspace/search/mechanisms.test.ts"]) {
      expect([f, macosFor([f], [])]).toEqual([f, null]);
      expect(macosFor([f], [], real)).toMatch(/^\S+ tests src\/\S+, which differs there$/);
    }
  });

  test("every file of `src/` that opens a database through `sqlite.ts` is listed: Apple's SQLite is older (14.13)", () => {
    const users = [...importGraph(ROOT)]
      .filter(([f, uses]) => f.startsWith("src/") && uses.includes("src/core/foundation/platform/sqlite.ts"))
      .map(([f]) => f);
    expect(users).toContain("src/core/workspace/search/search-index.ts");
    expect(users).toContain("src/core/documents/markdown/parsecache.ts");
    expect(users.filter((f) => macosFor([f], []) === null)).toEqual([]);
  });

  test("a file moved out of what differs there still runs it: both its paths count, as a push's do", () => {
    const r = repo();
    const text = Array.from({ length: 40 }, (_, i) => `export const line${i} = ${i};`).join("\n");
    r.commit({ "src/core/foundation/platform/x.ts": text });
    const before = r.git("rev-parse", "HEAD");
    r.git("mv", "src/core/foundation/platform/x.ts", "src/x.ts");
    const after = r.commit();
    // Git's own diff takes it for a move and names only where it went.
    expect(r.git("diff", "--name-only", before, after)).toBe("src/x.ts");
    const saved = { event: process.env.GITHUB_EVENT_NAME, range: process.env.SCOPE_RANGE };
    try {
      process.env.GITHUB_EVENT_NAME = "pull_request";
      expect(changedFiles(r.dir)?.sort()).toEqual(["src/core/foundation/platform/x.ts", "src/x.ts"]);
      process.env.GITHUB_EVENT_NAME = "push";
      process.env.SCOPE_RANGE = `${before}..${after}`;
      expect(changedFiles(r.dir)?.sort()).toEqual(["src/core/foundation/platform/x.ts", "src/x.ts"]);
    } finally {
      for (const [k, v] of [
        ["GITHUB_EVENT_NAME", saved.event],
        ["SCOPE_RANGE", saved.range],
      ] as const)
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
    const dir = mkdtempSync(join(sandbox, "moved-"));
    const [out, event] = [join(dir, "out"), join(dir, "event.json")];
    writeFileSync(out, "");
    writeFileSync(event, JSON.stringify({ pull_request: { labels: [] } }));
    const p = Bun.spawnSync([process.execPath, join(ROOT, "scripts", "ci-scope.ts")], {
      cwd: r.dir,
      env: { ...gitEnv, GITHUB_EVENT_NAME: "pull_request", GITHUB_EVENT_PATH: event, GITHUB_OUTPUT: out, GH_TOKEN: "" },
    });
    expect(readFileSync(out, "utf8")).toEndWith("macos=true\n");
    expect(p.stdout.toString()).toContain("macOS: runs, src/core/foundation/platform/x.ts differs there");
  });

  test("the `macos` label runs it whatever changed; another label, or one like it, doesn't; unread, it runs", () => {
    const app = ["src/tui/app/runtime/app.ts"];
    expect(macosFor(app, ["enhancement", "macos"])).toBe("the `macos` label");
    for (const labels of [[], ["enhancement"], ["macOS"], ["macos "], ["no-macos"]])
      expect([labels, macosFor(app, labels)]).toEqual([labels, null]);
    expect(macosFor(app, null)).toBe("its labels can't be read");
    expect(macosFor(null, [])).toBe("the diff can't be read");
    // A file that differs is the reason before the labels are looked at.
    expect(macosFor(["bun.lock"], null)).toBe("bun.lock differs there");
  });

  test("a pull request's labels, from the event's file: their names as strings; anything else unread", () => {
    const dir = mkdtempSync(join(sandbox, "event-"));
    const file = (name: string, text: string) => {
      writeFileSync(join(dir, name), text);
      return join(dir, name);
    };
    const labels = [{ name: "macos" }, { name: "$(touch x) `y`" }, null, { name: 5 }, "macos", { color: "fff" }];
    expect(eventLabels(file("a.json", JSON.stringify({ pull_request: { labels } })))).toEqual([
      "macos",
      "$(touch x) `y`",
    ]);
    expect(eventLabels(file("b.json", JSON.stringify({ pull_request: { labels: [] } })))).toEqual([]);
    expect(eventLabels(file("c.json", JSON.stringify({ pull_request: {} })))).toBeNull();
    expect(eventLabels(file("d.json", JSON.stringify({ labels: [{ name: "macos" }] })))).toBeNull();
    expect(eventLabels(file("e.json", "{"))).toBeNull();
    expect(eventLabels(join(dir, "missing.json"))).toBeNull();
    expect(eventLabels("")).toBeNull();
  });

  test("ci:scope writes `macos`: a pull request's by its files and labels, every other run's true", () => {
    const r = repo();
    r.commit({ "src/a.ts": "1" });
    r.commit({ "src/a.ts": "2" });
    const dir = mkdtempSync(join(sandbox, "macos-"));
    let n = 0;
    /** The run's outputs and log, for `event`; a pull request's labels in its event's file, none: no file. */
    const run = (event: string, labels?: unknown[]) => {
      const out = join(dir, `out-${++n}`);
      const path = join(dir, `event-${n}.json`);
      writeFileSync(out, "");
      if (labels) writeFileSync(path, JSON.stringify({ pull_request: { labels } }));
      const p = Bun.spawnSync([process.execPath, join(ROOT, "scripts", "ci-scope.ts")], {
        cwd: r.dir,
        env: { ...gitEnv, GITHUB_EVENT_NAME: event, GITHUB_EVENT_PATH: path, GITHUB_OUTPUT: out, GH_TOKEN: "" },
      });
      return { out: readFileSync(out, "utf8"), log: p.stdout.toString() };
    };
    const unlabelled = run("pull_request", []);
    expect(unlabelled.out).toBe("code=true\nchecks=false\nmacos=false\n");
    expect(unlabelled.log).toContain("macOS: skipped, nothing that differs there changed (the `macos` label runs it)");
    expect(run("pull_request", [{ name: "bug" }]).out).toEndWith("macos=false\n");
    const labelled = run("pull_request", [{ name: "bug" }, { name: "macos" }]);
    expect(labelled.out).toEndWith("macos=true\n");
    expect(labelled.log).toContain("macOS: runs, the `macos` label");
    expect(run("pull_request").out).toEndWith("macos=true\n"); // no event's file: its labels unread
    for (const event of ["push", "merge_group", "workflow_dispatch"])
      expect([event, run(event).out]).toEqual([event, expect.stringContaining("macos=true\n")]);
    // A file of what differs there, unlabelled.
    r.commit({ "src/core/foundation/platform/x.ts": "1" });
    const differs = run("pull_request", []);
    expect(differs.out).toEndWith("macos=true\n");
    expect(differs.log).toContain("macOS: runs, src/core/foundation/platform/x.ts differs there");
  });

  type Job = {
    name?: string;
    needs?: string | string[];
    if?: string;
    "runs-on"?: string;
    "timeout-minutes"?: number;
    permissions?: Record<string, string>;
    steps?: { run?: string }[];
    strategy?: { matrix: { os: string[] } };
  };
  const ci = Bun.YAML.parse(readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8")) as {
    on: { pull_request?: { types?: string[] } | null };
    jobs: Record<string, Job>;
  };
  /** Each macOS job, and the Linux job it waits for. */
  const PAIRS = [
    ["test-macos", "test"],
    ["terminal-macos", "terminal"],
  ] as const;
  /** A job's `if:` as JavaScript: `&&`, `!=`, `==` and the operands as GitHub has them. */
  const runs = (job: string, github: object, needs: object): boolean =>
    new Function("github", "needs", `return ${(ci.jobs[job]?.if ?? "").replace(/^\$\{\{(.*)\}\}$/s, "$1")};`)(
      github,
      needs,
    );

  test("each macOS job waits for its Linux job, with its steps and its check's name; no other job runs on macOS", () => {
    const onMac = Object.entries(ci.jobs)
      .filter(([, j]) => JSON.stringify([j["runs-on"], j.strategy?.matrix.os]).includes("macos"))
      .map(([name]) => name);
    expect(onMac.sort()).toEqual(["terminal-macos", "test-macos"]);
    for (const [mac, linux] of PAIRS) {
      const [m, l] = [ci.jobs[mac]!, ci.jobs[linux]!];
      expect([mac, m.needs, m.name, m["runs-on"]]).toEqual([
        mac,
        ["changes", linux],
        `${linux} (macos-15)`,
        "macos-15",
      ]);
      expect(m.steps).toEqual(l.steps!);
      expect([m.permissions, m["timeout-minutes"]]).toEqual([l.permissions, l["timeout-minutes"]]);
      // No status function: GitHub's own `success()`, so a Linux job failed, cancelled or skipped skips it.
      expect(m.if).not.toMatch(/always\(\)|cancelled\(\)|failure\(\)|success\(\)/);
    }
  });

  test("a macOS job runs when its Linux job would and `changes` says `macos`", () => {
    for (const event_name of ["pull_request", "push", "merge_group", "workflow_dispatch"])
      for (const code of ["true", "false"])
        for (const checks of ["true", "false"])
          for (const macos of ["true", "false"]) {
            const [github, needs] = [{ event_name }, { changes: { outputs: { code, checks, macos } } }];
            const at = `${event_name} code=${code} checks=${checks} macos=${macos}`;
            for (const [mac, linux] of PAIRS)
              expect([mac, at, runs(mac, github, needs)]).toEqual([
                mac,
                at,
                runs(linux, github, needs) && macos === "true",
              ]);
          }
  });

  test("adding a label runs a pull request's checks again: the `macos` label's way in", () => {
    expect(ci.on.pull_request?.types).toEqual(["opened", "synchronize", "reopened", "labeled"]);
  });

  test("`ci` counts a macOS job skipped as passed, and one failed or cancelled, or its Linux job failed, as failed", () => {
    const script = ci.jobs.ci?.steps?.[0]?.run ?? "";
    const jobs = [ci.jobs.ci?.needs ?? []].flat();
    expect(jobs).toEqual(expect.arrayContaining(["test", "test-macos", "terminal", "terminal-macos"]));
    const passes = (results: Record<string, string>) => {
      const needs = Object.fromEntries(jobs.map((j) => [j, { result: results[j] ?? "success", outputs: {} }]));
      return Bun.spawnSync(["bash", "-e", "-c", script], {
        env: { ...process.env, NEEDS: JSON.stringify(needs) },
        stdout: "ignore",
      }).success;
    };
    expect(passes({})).toBe(true);
    expect(passes({ "test-macos": "skipped", "terminal-macos": "skipped", terminal: "skipped" })).toBe(true);
    expect(passes({ test: "failure", "test-macos": "skipped" })).toBe(false);
    expect(passes({ terminal: "failure", "terminal-macos": "skipped" })).toBe(false);
    expect(passes({ "test-macos": "failure" })).toBe(false);
    expect(passes({ "terminal-macos": "cancelled" })).toBe(false);
  });
});
