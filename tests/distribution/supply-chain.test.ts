import { UNIT_TIMEOUT_MS } from "../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ACCEPTED, type Accepted, acceptedProblems, ignoreArgs } from "../../scripts/audit.ts";
import {
  bunfigProblems,
  checkDeps,
  licenceProblems,
  licenceTaken,
  notices,
  type Package,
  productionPackages,
  purl,
  repoLink,
  type Sbom,
  sbom,
  siteProblems,
  specProblems,
  workflowProblems,
  workflowShapeProblems,
} from "../../scripts/check-deps.ts";
import { codeChanged, importGraph, isDocs, scope as reaches } from "../../scripts/ci-scope.ts";
import { VERSION } from "../../src/version.ts";

import { makeDistributionSandbox, ROOT } from "../support/distribution-sandbox.ts";

setDefaultTimeout(UNIT_TIMEOUT_MS);

const { sandbox, tree } = makeDistributionSandbox();

const pkg = (name: string, licence: string, extra: Partial<Package> = {}): Package => ({
  name,
  version: "1.0.0",
  licence,
  dir: sandbox,
  repository: "",
  author: "",
  ...extra,
});

describe("the supply chain's gates (14.10)", () => {
  test("this repository passes them all: exact versions, the install gates, licences, actions pinned", () => {
    expect(checkDeps(ROOT).problems).toEqual([]);
  });
  test("the docs' site holds to them too: its versions exact, its install gated (DS)", () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-site-"));
    expect(siteProblems(root)).toEqual([]); // no site: nothing to say
    mkdirSync(join(root, "site"));
    writeFileSync(join(root, "site", "package.json"), JSON.stringify({ dependencies: { astro: "^7.3.5" } }));
    writeFileSync(join(root, "site", "bunfig.toml"), "[install]\nignoreScripts = true\nexact = true\n");
    expect(siteProblems(root)).toEqual([
      'site/package.json: dependencies: astro is "^7.3.5", not an exact version',
      "site/bunfig.toml: [install] minimumReleaseAge = 604800 or more, a week",
    ]);
  });
  test("slipbox's own licence: LICENSE is Apache-2.0's text, and package.json says so", () => {
    const text = readFileSync(join(ROOT, "LICENSE"), "utf8");
    expect(text).toContain("Apache License\n                           Version 2.0, January 2004");
    expect(text).toContain("END OF TERMS AND CONDITIONS");
    expect(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).license).toBe("Apache-2.0");
  });

  test("a licence expression is taken when permissive: an OR by either side, an AND by both, WITH as its licence", () => {
    expect(licenceTaken("MIT")).toBe(true);
    expect(licenceTaken("GPL-3.0-only")).toBe(false);
    expect(licenceTaken("(MIT OR GPL-3.0-or-later)")).toBe(true);
    expect(licenceTaken("GPL-3.0-or-later OR MIT")).toBe(true);
    expect(licenceTaken("(MIT AND Zlib)")).toBe(true);
    expect(licenceTaken("MIT AND GPL-2.0-only")).toBe(false);
    expect(licenceTaken("Apache-2.0 WITH LLVM-exception")).toBe(true);
    expect(licenceTaken("(MIT OR Apache-2.0) AND GPL-2.0-only")).toBe(false);
    // Not an expression: not taken.
    expect(licenceTaken("")).toBe(false);
    expect(licenceTaken("MIT OR")).toBe(false);
    expect(licenceTaken("(MIT")).toBe(false);
    expect(licenceTaken("MIT Apache-2.0")).toBe(false);
  });

  test("a package's licence: one not taken, or none, is a problem; a weak copyleft one is taken only by name", () => {
    expect(licenceProblems([pkg("a", "MIT"), pkg("b", "ISC")])).toEqual([]);
    expect(licenceProblems([pkg("c", "GPL-3.0-only")])).toEqual([
      "c@1.0.0: GPL-3.0-only — not a licence slipbox takes (plan 14.6, 14.10)",
    ]);
    expect(licenceProblems([pkg("d", "")])).toEqual(["d@1.0.0: names no licence"]);
    expect(licenceProblems([pkg("elkjs", "EPL-2.0"), pkg("@resvg/resvg-wasm", "MPL-2.0")])).toEqual([]);
    // Taken by name for its licence, not any: a new copyleft one, or a named package's licence changing, is asked about.
    expect(licenceProblems([pkg("elkjs", "GPL-3.0-only")])).toHaveLength(1);
    expect(licenceProblems([pkg("other", "MPL-2.0")])).toHaveLength(1);
  });

  test("package.json's versions exact: a range, a tag or a partial version is a problem", () => {
    const deps = {
      a: "1.2.3",
      b: "1.0.0-beta.1",
      c: "^1.2.3",
      d: "~1.2.3",
      e: "*",
      f: "latest",
      g: "1.2",
      h: ">=1.0.0",
    };
    expect(specProblems({ dependencies: deps, devDependencies: { t: "^5.0.0" } }).map((p) => p.split(" ")[1])).toEqual([
      "c",
      "d",
      "e",
      "f",
      "g",
      "h",
      "t",
    ]);
  });

  test("bunfig.toml's install gates: each one off is said; a key in another section doesn't count", () => {
    const good = "[install]\nignoreScripts = true\nminimumReleaseAge = 604800\nexact = true\n\n[test]\npreload = []\n";
    expect(bunfigProblems(good)).toEqual([]);
    expect(bunfigProblems(good.replace("ignoreScripts = true", "ignoreScripts = false"))).toEqual([
      "bunfig.toml: [install] ignoreScripts = true, so no install script runs",
    ]);
    expect(bunfigProblems(good.replace("604800", "86400"))).toHaveLength(1);
    expect(bunfigProblems(good.replace("exact = true\n", ""))).toHaveLength(1);
    expect(bunfigProblems("[test]\nignoreScripts = true\nminimumReleaseAge = 604800\nexact = true\n")).toHaveLength(3);
  });

  test("a workflow's actions pinned by a full commit hash; a tag, a branch or a short hash is a problem", () => {
    const sha = "3d3c42e5aac5ba805825da76410c181273ba90b1";
    const yaml = `steps:\n  - uses: actions/checkout@${sha} # v7.0.1\n  - uses: ./local/action\n  - uses: a/b@v4\n  - name: x\n    uses: "c/d@main"\n  - uses: e/f@3d3c42e\n`;
    expect(workflowProblems("w.yml", yaml).map((p) => p.split(" ")[1])).toEqual(["a/b@v4", "c/d@main", "e/f@3d3c42e"]);
  });

  test("a workflow starts from no permission, and gives every job a timeout (GR-D9)", () => {
    const job = (extra = "") => `    runs-on: ubuntu-24.04\n${extra}    steps:\n      - run: "true"\n`;
    const good =
      `on: push\npermissions: {}\njobs:\n  a:\n${job("    timeout-minutes: 5\n")}` +
      "  b:\n    uses: ./.github/workflows/x.yml\n";
    expect(workflowShapeProblems("w.yml", good)).toEqual([]);
    // Read-only by default is still a default: each job grants its own.
    expect(workflowShapeProblems("w.yml", good.replace("permissions: {}", "permissions:\n  contents: read"))).toEqual([
      "w.yml: `permissions: {}` at the top, so a job has only what it grants itself",
    ]);
    expect(workflowShapeProblems("w.yml", good.replace("permissions: {}\n", ""))).toHaveLength(1);
    expect(workflowShapeProblems("w.yml", good.replace("    timeout-minutes: 5\n", ""))).toEqual([
      "w.yml: job a has no timeout-minutes",
    ]);
    expect(workflowShapeProblems("w.yml", "jobs: [\n")[0]).toStartWith("w.yml: not YAML that parses");
  });

  test("the required check, `ci`, always runs and waits for every other job; run by hand, it's `full` (D251)", () => {
    const ci = Bun.YAML.parse(readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8")) as {
      on: Record<string, { branches?: string[] } | null>;
      jobs: Record<string, { needs?: string[]; if?: string; name?: string }>;
    };
    // `status` reports `full` again, after it (D257).
    const others = Object.keys(ci.jobs).filter((j) => j !== "ci" && j !== "status");
    expect(others.length).toBeGreaterThan(1);
    expect([...(ci.jobs.ci?.needs ?? [])].sort()).toEqual(others.sort());
    expect(ci.jobs.ci?.if).toBe("${{ always() }}");
    // `dev`'s ruleset requires `ci`; `main`'s requires `full`, which only a run by hand, of everything, reports.
    expect(ci.jobs.ci?.name).toBe("${{ github.event_name == 'workflow_dispatch' && 'full' || 'ci' }}");
    expect(ci.on.push?.branches).toEqual(["dev", "test"]);
    expect(Object.keys(ci.on)).toContain("workflow_dispatch");
    const ruleset = (name: string) =>
      JSON.parse(readFileSync(join(ROOT, ".github", "upkeep", "rulesets", `${name}.json`), "utf8")) as {
        rules: { type: string; parameters?: { required_status_checks?: { context: string }[] } }[];
      };
    const checks = (name: string) =>
      ruleset(name).rules.flatMap((r) => r.parameters?.required_status_checks?.map((c) => c.context) ?? []);
    expect([checks("dev"), checks("test"), checks("main")]).toEqual([["ci"], ["ci"], ["full"]]);
  });

  test("run by hand, `full` is reported again as a commit status once it passed, the one `main`'s ruleset sees (D257)", () => {
    // A ruleset counts no check a run by hand reports, so `main`'s refused 0.5.0's commit, which had passed `full`. It
    // counts a status the run's own token posts: GitHub Actions', the source it requires (integration 15368).
    const ci = Bun.YAML.parse(readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8")) as {
      jobs: Record<
        string,
        { needs?: string; if?: string; permissions?: Record<string, string>; steps?: { run?: string }[] }
      >;
    };
    const status = ci.jobs.status;
    expect(status?.if).toBe("${{ github.event_name == 'workflow_dispatch' }}");
    // After `ci`, which is `full` run by hand: skipped when it failed.
    expect(status?.needs).toBe("ci");
    expect(status?.permissions).toEqual({ statuses: "write" });
    const run = (status?.steps ?? []).map((s) => s.run ?? "").join("\n");
    expect(run).toContain('gh api "repos/$GITHUB_REPOSITORY/statuses/$GITHUB_SHA" -f state=success -f context=full');
    const main = JSON.parse(readFileSync(join(ROOT, ".github", "upkeep", "rulesets", "main.json"), "utf8")) as {
      rules: { type: string; parameters?: { required_status_checks?: unknown[] } }[];
    };
    expect(main.rules.find((r) => r.type === "required_status_checks")?.parameters?.required_status_checks).toEqual([
      { context: "full", integration_id: 15368 },
    ]);
  });

  test("a pull request of the docs alone skips the tests and the terminal tests; lint runs the docs' tests (D230)", () => {
    expect(codeChanged(["docs/guides/x.md", "docs/images/a.png", "blueprint/roadmap.md", "README.md"])).toBeNull();
    expect(codeChanged(["site/src/content/docs/index.mdx", "CHANGELOG.md"])).toBeNull();
    expect(codeChanged(["docs/a.md", "src/main.ts"])).toBe("src/main.ts");
    expect(codeChanged([])).toBe("no file changed");
    // What a test, a build or the supply chain's gates read is code: the site's packages, the samples, the skill.
    for (const f of [
      "site/package.json",
      "site/bun.lock",
      "site/scripts/gather.ts",
      "examples/home/CASES.md",
      "skills/slipbox/SKILL.md",
      ".github/workflows/ci.yml",
      "tests/docs.test.ts",
      "package.json",
    ])
      expect([f, isDocs(f)]).toEqual([f, false]);
    const ci = Bun.YAML.parse(readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8")) as {
      jobs: Record<string, { needs?: string; if?: string; steps?: { id?: string; run?: string }[] }>;
    };
    for (const [job, output] of [
      ["test", "code"],
      ["terminal", "checks"],
    ] as const)
      expect([job, ci.jobs[job]?.needs, ci.jobs[job]?.if]).toEqual([
        job,
        "changes",
        job === "terminal"
          ? "${{ github.event_name != 'pull_request' && needs.changes.outputs.checks == 'true' }}"
          : `\${{ needs.changes.outputs.${output} == 'true' }}`,
      ]);
    expect(ci.jobs.changes?.steps?.find((s) => s.id === "scope")?.run).toBe("bun run ci:scope");
    expect(ci.jobs.lint?.steps?.map((s) => s.run)).toContain("bun run test:docs");
  });

  test("ci:scope: code=false for a pull request's merge commit of the docs alone; true for code, an unread diff", () => {
    const repo = mkdtempSync(join(sandbox, "scope-"));
    const git = (...args: string[]) => Bun.spawnSync(["git", "-C", repo, ...args], { env: gitEnv });
    const gitEnv = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t" };
    let runs = 0;
    // What it writes for the jobs, less a pull request's record and a push's range (tests/ci-range.test.ts).
    const scope = (event: string) => {
      const out = join(sandbox, `scope-out-${++runs}`);
      Bun.spawnSync([process.execPath, join(ROOT, "scripts", "ci-scope.ts")], {
        cwd: repo,
        env: {
          ...gitEnv,
          GITHUB_EVENT_NAME: event,
          GITHUB_OUTPUT: out,
          GH_TOKEN: "",
          GITHUB_REF_NAME: "dev",
          RUNNER_TEMP: sandbox,
        },
      });
      return readFileSync(out, "utf8").replace(/^(record|range)=.*\n/gm, "");
    };
    const commit = (message: string) => {
      git("add", ".");
      git("-c", "user.email=t@t", "commit", "-qm", message);
    };
    git("init", "-q");
    writeFileSync(join(repo, "a.ts"), "1\n");
    commit("base");
    expect(scope("pull_request")).toBe("code=true\nchecks=true\n"); // no parent: the diff can't be read
    mkdirSync(join(repo, "docs"));
    writeFileSync(join(repo, "docs", "x.md"), "# x\n");
    commit("docs");
    expect(scope("pull_request")).toBe("code=false\nchecks=false\n");
    // A push with no run to read where its range starts, and no `test`: everything (CIW-D1; tests/ci-range.test.ts). A
    // run by hand is everything.
    expect(scope("push")).toBe("code=true\nchecks=true\n");
    expect(scope("workflow_dispatch")).toBe("code=true\nchecks=true\n");
    writeFileSync(join(repo, "a.ts"), "2\n");
    commit("code");
    expect(scope("pull_request")).toBe("code=true\nchecks=true\n"); // a file nothing names: everything
  });

  test("the import graph: what a file imports, a worker it starts, what it imports that isn't code, a path it names", () => {
    const g = importGraph();
    expect(g.get("src/core/workspace/walk/filtering/filter.ts")).toContain("src/core/foundation/platform/fsutil.ts");
    expect(g.get("src/core/documents/markdown/parse-pool.ts")).toContain("src/core/documents/markdown/parse-worker.ts");
    expect(g.get("src/core/rendering/export/jobs.ts")).toContain("src/core/rendering/export/export-worker.ts");
    expect(g.get("src/core/application/distribution/skill.ts")).toContain("skills/slipbox/SKILL.md");
    // Run by its path, from the file's folder or the top's name; a temporary folder's paths name nothing here.
    expect(g.get("tests/support/cli-process.ts")).toContain("src/main.ts");
    expect(g.get("tests/check-size.test.ts")).toContain("scripts/check-size.ts");
    expect(g.get("tests/check-size.test.ts")).not.toContain("scripts");
    expect(g.get("scripts/build-home.ts")).toContain("examples/home");
  });

  test("what a change reaches, in a repository made for it: each rule (D239)", () => {
    const top = mkdtempSync(join(sandbox, "reach-"));
    const files: Record<string, string> = {
      "package.json": JSON.stringify({ scripts: { "test:docs": "bun test ./tests/docs.test.ts" } }),
      "src/main.ts": 'export const tui = () => import("./tui/shell/terminal/run.ts");\n',
      "src/tui/shell/terminal/run.ts": 'import { a } from "../../../core/a";\nexport const run = a;\n',
      "src/core/a.ts":
        'import { workerUrl } from "./foundation/workers/url.ts";\nexport const a = workerUrl("w.ts");\n',
      "src/core/foundation/workers/url.ts": "export const workerUrl = (f: string) => f;\n",
      "src/core/w.ts": "export {};\n",
      "src/tui/documents/diagnostics/problems/rows.ts": "export const rows = [];\n",
      "tests/problems.test.ts": 'import "../src/tui/documents/diagnostics/problems/rows.ts";\n',
      "src/core/application/distribution/updates/discovery.ts": "export {};\n",
      "src/tui/documents/navigation/peek/presentation.ts": 'export const label = "peek";\n',
      "tests/peek.test.ts": 'import "../src/tui/documents/navigation/peek/presentation.ts";\n',
      "tests/a.test.ts": 'import { a } from "../src/core/a.ts";\nexport { a };\n',
      "tests/docs.test.ts": 'import { a } from "../src/core/a.ts";\nexport { a };\n',
      // Runs the app by its path; a temporary folder's paths name nothing in the repository.
      "tests/run.test.ts": [
        'const MAIN = join(import.meta.dir, "..", "src", "main.ts");',
        'const P = mkdtempSync("t");',
        'join(P, "src", "core");',
        'const FIX = join(import.meta.dir, "fixtures");',
        'const DEEP = join(FIX, "deep");',
        'join(DEEP, "d.md");',
      ].join("\n"),
      "tests/terminal/run.ts": 'import "./checks/index.ts";\nimport "./release-builds.ts";\n',
      "tests/terminal/worker.ts": 'import "./session.ts";\n',
      // The release builds: a file of the harness only the checks of upgrading use.
      "tests/terminal/release-builds.ts": 'import "../../scripts/release.ts";\n',
      "scripts/release.ts": "export {};\n",
      "tests/release.test.ts": 'import "../scripts/release.ts";\n',
      "tests/terminal/checks/index.ts": 'import "./one.ts";\n',
      "tests/terminal/checks/one.ts": 'import { REPO } from "../session.ts";\nexport { REPO };\n',
      "tests/terminal/session.ts":
        'export const REPO = join(import.meta.dir, "..", "..");\njoin(REPO, "src", "main.ts");\njoin(REPO, "examples", "home", "n.md");\n',
      "tests/fixtures/deep/d.md": "# d\n",
      "examples/home/n.md": "# n\n",
      "examples/home/m.md": "# m\n",
      "notes/x.txt": "x\n",
    };
    for (const [f, text] of Object.entries(files)) {
      mkdirSync(dirname(join(top, f)), { recursive: true });
      writeFileSync(join(top, f), text);
    }
    const g = importGraph(top);
    expect(g.get("src/main.ts")).toEqual(["src/tui/shell/terminal/run.ts"]); // imported when it's needed
    expect(g.get("src/tui/shell/terminal/run.ts")).toEqual(["src/core/a.ts"]); // without its extension
    expect(g.get("src/core/a.ts")?.sort()).toEqual(["src/core/foundation/workers/url.ts", "src/core/w.ts"]); // a worker it starts
    // By its path from the file's folder, or from a name set from it, at any depth; not from a temporary folder.
    expect(g.get("tests/run.test.ts")?.sort()).toEqual([
      "src/main.ts",
      "tests/fixtures",
      "tests/fixtures/deep",
      "tests/fixtures/deep/d.md",
    ]);
    expect(g.get("tests/terminal/session.ts")?.sort()).toEqual(["examples/home/n.md", "src/main.ts"]);
    const of = (...changed: string[]) => reaches(changed, g, top);
    // A file the app loads, under no feature: the tests that use it, the docs' aside, and every check.
    expect(
      reaches(
        ["src/tui/documents/diagnostics/problems/rows.ts"],
        new Map([...g, ["src/main.ts", ["src/tui/documents/diagnostics/problems/rows.ts"]]]),
        top,
      ),
    ).toMatchObject({
      tests: ["tests/problems.test.ts", "tests/run.test.ts"],
      checks: ["language servers", "lint", "problems"],
    });
    expect(
      reaches(
        ["src/tui/documents/navigation/peek/presentation.ts"],
        new Map([...g, ["src/main.ts", ["src/tui/documents/navigation/peek/presentation.ts"]]]),
        top,
      ),
    ).toMatchObject({ tests: ["tests/peek.test.ts", "tests/run.test.ts"], checks: ["peek"] });
    expect(
      reaches(
        ["src/core/application/distribution/updates/discovery.ts"],
        new Map([...g, ["src/main.ts", ["src/core/application/distribution/updates/discovery.ts"]]]),
        top,
      ),
    ).toMatchObject({ tests: ["tests/run.test.ts"], checks: ["updates"] });
    expect(of("src/core/w.ts")).toMatchObject({ tests: ["tests/a.test.ts", "tests/run.test.ts"], checks: "all" });
    expect(of("tests/terminal/checks/one.ts")).toMatchObject({ tests: [], checks: ["one"] });
    expect(of("examples/home/n.md")).toMatchObject({ checks: "all" }); // a sample the checks' harness names
    expect(of("examples/home/m.md").all).toEqual(expect.any(String)); // one nothing names: everything
    expect(of("notes/x.txt").all).toEqual(expect.any(String));
    expect(of("src/core/gone.ts")).toMatchObject({ all: null, tests: [], checks: [] }); // what used it changed too
    // What reaches the harness only through a file of it some checks use: those checks, not every one.
    expect(of("scripts/release.ts")).toMatchObject({ tests: ["tests/release.test.ts"], checks: ["updates"] });
    expect(of("tests/terminal/release-builds.ts")).toMatchObject({ tests: [], checks: ["updates"] });
  });

  test("a pull request runs the tests and the terminal checks its files reach (D239)", () => {
    const g = importGraph();
    const of = (...files: string[]) => reaches(files, g);
    // A feature's own file: the tests that use it, at any depth, and its checks.
    const git = of("src/tui/workspace/git/views/branches/gitbranchview.ts");
    expect(git.all).toBeNull();
    if (git.all === null) {
      expect(git.tests).toContain("tests/tui/workspace/git/panel/branches.test.ts");
      expect(git.tests).not.toContain("tests/release.test.ts");
      expect(git.checks).toEqual(["git"]);
    }
    // The release script: its tests, the runner's (which makes release builds of it), and the checks of upgrading, which
    // drive those builds, alone.
    expect(of("scripts/release.ts")).toMatchObject({
      tests: [
        "tests/distribution/channels.test.ts",
        "tests/distribution/release.test.ts",
        "tests/distribution/updates.test.ts",
        "tests/release.test.ts",
        "tests/skill-lifecycle.test.ts",
        "tests/terminal-runner.test.ts",
      ],
      checks: ["updates"],
    });
    expect(of("src/core/application/distribution/skill-lifecycle.ts")).toMatchObject({ checks: ["updates"] });
    // The builds' record, which every check's session reads: every check.
    expect(of("tests/terminal/releases.ts")).toMatchObject({ checks: "all" });
    // The explorer's listings, every folder a level at a time and the facts its rows' marks read: those features' checks.
    expect(of("src/core/workspace/walk/listing.ts")).toMatchObject({
      checks: expect.arrayContaining(["Elsewhere", "marks", "slow disk", "view"]),
    });
    // A command of the command line's: its tests, no check.
    expect(of("src/cli/git.ts")).toMatchObject({ checks: [] });
    // A check file: its checks. A file of the app's with no feature of its own, the harness, a sample: every check.
    expect(of("tests/terminal/checks/vaults.ts")).toMatchObject({ checks: ["vaults"] });
    for (const f of [
      "src/tui/app/runtime/app.ts",
      "tests/terminal/session.ts",
      "examples/home/hobbies/cooking/Pantry.md",
    ])
      expect([f, of(f)]).toMatchObject([f, { checks: "all" }]);
    expect(of("examples/home/hobbies/cooking/Pantry.md")).toMatchObject({
      tests: expect.arrayContaining(["tests/home.test.ts"]),
    });
    // The samples changed most: what reads them. A script a check preloads: that check's feature.
    expect(of("examples/home/CASES.md")).toMatchObject({
      tests: ["tests/home.test.ts", "tests/terminal-coverage.test.ts"],
      checks: [],
    });
    expect(of("tests/terminal/spell-hold.ts")).toMatchObject({ tests: [], checks: ["spelling"] });
    expect(of("tests/terminal/export-hold.ts")).toMatchObject({ tests: [], checks: ["export"] });
    // A snapshot: its test. The lint's config: the lint alone.
    expect(of("tests/__snapshots__/render.test.ts.snap")).toMatchObject({
      tests: ["tests/render.test.ts"],
      checks: [],
    });
    expect(of("_typos.toml")).toMatchObject({ tests: [], checks: [] });
    // The docs' tests are the lint job's, on every change: never among a change's.
    expect(of("src/tui/shell/input/mouse-help.ts")).not.toMatchObject({
      tests: expect.arrayContaining(["tests/docs.test.ts"]),
    });
    // Everything: the packages, the toolchain, a workflow, the tests' preload, a file nothing names, a diff unread.
    for (const f of ["package.json", "bun.lock", "mise.toml", ".github/workflows/ci.yml", "tests/setup.ts", "new.txt"])
      expect([f, of(f).all]).toEqual([f, expect.any(String)]);
    expect(reaches(null, g).all).toEqual(expect.any(String));
    expect(reaches([], g).all).toEqual(expect.any(String));
  });

  test("Dependabot: Bun's packages and the actions, grouped, monthly, a week's cooldown as bunfig's", () => {
    const config = Bun.YAML.parse(readFileSync(join(ROOT, ".github", "dependabot.yml"), "utf8")) as {
      updates: {
        "package-ecosystem": string;
        directory: string;
        schedule: { interval: string };
        cooldown: { "default-days": number };
        groups: Record<string, { patterns: string[] }>;
      }[];
    };
    const age = Number(/minimumReleaseAge\s*=\s*(\d+)/.exec(readFileSync(join(ROOT, "bunfig.toml"), "utf8"))?.[1]);
    // Bun's packages twice: slipbox's own, and the docs' site's (site/, DS).
    expect(config.updates.map((u) => u["package-ecosystem"]).sort()).toEqual(["bun", "bun", "github-actions"]);
    expect(config.updates.filter((u) => u["package-ecosystem"] === "bun").map((u) => u.directory)).toEqual([
      "/",
      "/site",
    ]);
    for (const u of config.updates) {
      expect(u.schedule.interval).toBe("monthly");
      expect(u.cooldown["default-days"] * 86400).toBe(age);
      expect(Object.values(u.groups).flatMap((g) => g.patterns)).toContain("*");
    }
  });

  test("a package's Package URL: its scope encoded", () => {
    expect(purl("@opentui/core", "0.5.12")).toBe("pkg:npm/%40opentui/core@0.5.12");
    expect(purl("yaml", "2.9.1")).toBe("pkg:npm/yaml@2.9.1");
    expect(purl("a", "1.0.0+build.1")).toBe("pkg:npm/a@1.0.0%2Bbuild.1");
  });

  test("the SBOM (CycloneDX): slipbox, each package with its licence and source, Bun, and who depends on whom", () => {
    const root = tree({ "package.json": JSON.stringify({ license: "Apache-2.0", description: "Notes." }) });
    const walk = {
      packages: [
        pkg("@s/a", "MIT", { repository: "https://github.com/s/a", dependsOn: ["b@1.0.0"] }),
        pkg("b", "(MIT AND Zlib)", { dependsOn: [] }),
      ],
      direct: ["@s/a@1.0.0"],
    };
    const bom = sbom(walk, { version: "1.2.3", target: "linux-x64", repo: "o/r" }, root, {
      serial: "urn:uuid:00000000-0000-4000-8000-000000000000",
      timestamp: "2026-10-12T00:00:00.000Z",
    });
    expect(bom).toMatchObject({
      bomFormat: "CycloneDX",
      specVersion: "1.6",
      serialNumber: "urn:uuid:00000000-0000-4000-8000-000000000000",
      version: 1,
      metadata: {
        timestamp: "2026-10-12T00:00:00.000Z",
        component: {
          type: "application",
          "bom-ref": "slipbox",
          name: "slipbox",
          version: "1.2.3",
          purl: "pkg:github/o/r@v1.2.3",
          licenses: [{ license: { id: "Apache-2.0" } }],
          externalReferences: [{ type: "vcs", url: "https://github.com/o/r" }],
          properties: [{ name: "slipbox:target", value: "linux-x64" }],
        },
      },
    });
    // A scoped package's scope is its group; a single licence an SPDX id, a compound one its expression.
    expect(bom.components[0]).toEqual({
      type: "library",
      "bom-ref": "pkg:npm/%40s/a@1.0.0",
      group: "@s",
      name: "a",
      version: "1.0.0",
      purl: "pkg:npm/%40s/a@1.0.0",
      licenses: [{ license: { id: "MIT" } }],
      externalReferences: [{ type: "vcs", url: "https://github.com/s/a" }],
    });
    expect(bom.components[1]).toMatchObject({ name: "b", licenses: [{ expression: "(MIT AND Zlib)" }] });
    const bun = bom.components.at(-1)!;
    expect(bun).toMatchObject({ type: "platform", name: "bun", version: Bun.version });
    // Nothing compiled in that the walk doesn't bundle: Hunspell comes with hunspell-asm only.
    expect(bom.components).toHaveLength(3);
    expect(bom.dependencies).toEqual([
      { ref: "slipbox", dependsOn: ["pkg:npm/%40s/a@1.0.0", bun["bom-ref"]] },
      { ref: "pkg:npm/%40s/a@1.0.0", dependsOn: ["pkg:npm/b@1.0.0"] },
      { ref: "pkg:npm/b@1.0.0", dependsOn: [] },
      { ref: bun["bom-ref"], dependsOn: [] },
    ]);
    // A new one each time: its own serial number and time.
    const again = sbom(walk, { version: "1.2.3" }, root);
    expect(again.serialNumber).toMatch(
      /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(again.serialNumber).not.toBe(bom.serialNumber);
    expect(again.metadata.component.properties).toBeUndefined();
  });

  test("this repository's SBOM: each package the walk finds, what's compiled in, Bun; every reference resolves", () => {
    const { packages, direct } = checkDeps(ROOT);
    const bom: Sbom = sbom({ packages, direct }, { version: VERSION, target: "linux-x64", repo: "o/r" });
    const refs = new Set(["slipbox", ...bom.components.map((c) => c["bom-ref"])]);
    expect(refs.size).toBe(bom.components.length + 1);
    for (const p of packages) expect(refs.has(purl(p.name, p.version))).toBe(true);
    expect(bom.components.filter((c) => c["bom-ref"].startsWith("embedded:")).map((c) => c.name)).toEqual([
      "Hunspell",
      "libwebp",
    ]);
    expect(bom.dependencies.find((d) => d.ref.startsWith("pkg:npm/hunspell-asm@"))?.dependsOn).toContain(
      "embedded:Hunspell",
    );
    expect(bom.dependencies.map((d) => d.ref).sort()).toEqual([...refs].sort());
    for (const d of bom.dependencies) for (const r of d.dependsOn) expect(refs.has(r)).toBe(true);
    for (const c of bom.components) expect(c.licenses?.length).toBe(1);
  });

  test("the packages bundled: found as Node finds them (a nested copy first), optional ones only where installed", () => {
    const root = tree({
      "package.json": JSON.stringify({ dependencies: { a: "1.0.0", gone: "1.0.0" } }),
      "node_modules/a/package.json": JSON.stringify({
        name: "a",
        version: "1.0.0",
        license: "MIT",
        dependencies: { b: "2.0.0" },
        optionalDependencies: { "a-native": "1.0.0", "a-other": "1.0.0" },
      }),
      "node_modules/a/node_modules/b/package.json": JSON.stringify({
        name: "b",
        version: "2.0.0",
        licenses: [{ type: "ISC" }],
      }),
      "node_modules/b/package.json": JSON.stringify({ name: "b", version: "1.0.0", license: "MIT" }),
      "node_modules/a-native/package.json": JSON.stringify({
        name: "a-native",
        version: "1.0.0",
        license: { type: "MIT" },
        repository: "git@github.com:x/a-native.git",
      }),
    });
    const { packages, missing, direct } = productionPackages(root);
    expect(packages.map((p) => `${p.name}@${p.version} ${p.licence}`)).toEqual([
      "a@1.0.0 MIT",
      "a-native@1.0.0 MIT",
      "b@2.0.0 ISC",
    ]);
    expect(packages.find((p) => p.name === "a-native")?.repository).toBe("https://github.com/x/a-native");
    expect(missing).toEqual(["gone (package.json's)"]);
    // Who depends on whom, as installed: the SBOM's graph.
    expect(direct).toEqual(["a@1.0.0"]);
    expect(packages.find((p) => p.name === "a")?.dependsOn).toEqual(["b@2.0.0", "a-native@1.0.0"]);
    expect(packages.find((p) => p.name === "b")?.dependsOn).toEqual([]);
  });

  test("a repository named any of package.json's ways is a link", () => {
    expect(repoLink("git@github.com:yisibl/resvg-js.git")).toBe("https://github.com/yisibl/resvg-js");
    expect(repoLink("git://github.com/shtylman/dom.git")).toBe("https://github.com/shtylman/dom");
    expect(repoLink("git+https://github.com/a/b.git")).toBe("https://github.com/a/b");
    expect(repoLink("git+ssh://git@github.com/a/b.git")).toBe("https://github.com/a/b");
    expect(repoLink("github:a/b")).toBe("https://github.com/a/b");
    expect(repoLink("a/b")).toBe("https://github.com/a/b");
    expect(repoLink("https://gitlab.com/a/b")).toBe("https://gitlab.com/a/b");
  });

  test("the notices: a package's own licence files; the standard text, its author put in, where it ships none", () => {
    const own = tree({
      LICENSE: "Copyright (c) 2020 Own Author\n\nPermission is granted.\n",
      "NOTICE.md": "A notice of its own.\n",
      "index.js": "",
    });
    const bare = tree({ "index.js": "" });
    const text = notices(
      [
        pkg("own", "MIT", { dir: own, repository: "https://github.com/x/own" }),
        pkg("bare", "MIT", { dir: bare, author: "Bare Author" }),
        pkg("mpl", "MPL-2.0", { dir: bare, repository: "https://github.com/x/mpl" }),
      ],
      "9.9.9",
      ROOT,
    );
    expect(text).toStartWith("slipbox 9.9.9: the third-party software in this program");
    const part = (title: string) =>
      text.split(/^={100}\n/m)[text.split(/^={100}\n/m).findIndex((s) => s.startsWith(title)) + 1] ?? "";
    expect(part("own 1.0.0 — MIT")).toContain("Copyright (c) 2020 Own Author");
    expect(part("own 1.0.0 — MIT")).toContain("A notice of its own.");
    expect(part("bare 1.0.0 — MIT")).toContain("Copyright (c) Bare Author");
    expect(part("bare 1.0.0 — MIT")).toContain("Permission is hereby granted, free of charge");
    // A licence that asks for the source: where it is, said.
    expect(part("mpl 1.0.0 — MPL-2.0")).toStartWith("\nIts source: https://github.com/x/mpl\n");
    expect(part("mpl 1.0.0 — MPL-2.0")).toContain("Mozilla Public License Version 2.0");
    // What's compiled into packages, and the runtime itself, are owed notices too.
    expect(part("Hunspell, compiled into hunspell-asm — MPL-1.1")).toContain(
      "Its source: https://github.com/hunspell/hunspell",
    );
    expect(part("libwebp, compiled into @jsquash/webp — BSD-3-Clause")).toContain(
      "Redistribution and use in source and binary forms",
    );
    expect(text).toContain(`Bun ${Bun.version}, the runtime the binary is built on`);
    expect(text).toContain("Bun statically links JavaScriptCore");
    expect(text).toContain("GNU LESSER GENERAL PUBLIC LICENSE");
  });
});

describe("the dependencies' advisories (GR-D9)", () => {
  const entry = (until: string, advisories = ["GHSA-2222-3333-4444"]): Accepted => ({
    package: "p@1.0.0",
    advisories,
    why: "not reached",
    until,
  });

  test("an advisory accepted counts again after its date: its --ignore dropped, and said", () => {
    const list = [entry("2027-01-12"), entry("2026-10-11", ["GHSA-5555-6666-7777", "GHSA-8888-9999-cccc"])];
    expect(ignoreArgs(list, "2026-10-12")).toEqual({ args: ["--ignore=GHSA-2222-3333-4444"], expired: [list[1]!] });
    // On its date it still holds.
    expect(ignoreArgs(list, "2026-10-11").args).toHaveLength(3);
    expect(ignoreArgs(list, "2027-01-13")).toEqual({ args: [], expired: list });
  });

  test("the list itself: every entry a reason, a date and GHSA ids, none twice — this repository's included", () => {
    expect(acceptedProblems(ACCEPTED)).toEqual([]);
    expect(ACCEPTED.length).toBeGreaterThan(0);
    expect(
      acceptedProblems([
        { ...entry("2027-13-45"), why: " " },
        entry("2027-01-12", ["CVE-2026-1", "GHSA-2222-3333-4444"]),
      ]),
    ).toEqual([
      'p@1.0.0: "2027-13-45" isn\'t a date (YYYY-MM-DD)',
      "p@1.0.0: no reason given",
      "p@1.0.0: CVE-2026-1 isn't a GHSA id",
      "p@1.0.0: GHSA-2222-3333-4444 is listed twice",
    ]);
  });
});
