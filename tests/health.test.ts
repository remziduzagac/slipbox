// The repository's health check (scripts/health.ts, GR-T11): the upkeep files, the comparisons, the dates, the issue
// rendered and planned. Only the pure parts: nothing here calls GitHub.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  CAP,
  chooseIssue,
  codeScanningCounts,
  comparable,
  compare,
  compareRulesets,
  credentials,
  dateOf,
  daysFrom,
  dependabotCounts,
  failingOnMain,
  type IssueRef,
  issuesOf,
  LABEL,
  linkReport,
  MARKER,
  parseDeviations,
  parseRenewals,
  parseSettings,
  planIssue,
  pullsOf,
  quote,
  type Report,
  type Ruleset,
  readState,
  render,
  renewalsDue,
  reviewsDue,
  type Signals,
  signalsOf,
  workflowsOff,
} from "../scripts/health.ts";

const ROOT = resolve(import.meta.dir, "..");
const UPKEEP = join(ROOT, ".github", "upkeep");
const upkeep = (f: string) => readFileSync(join(UPKEEP, f), "utf8");
const RUN = "https://github.com/o/r/actions/runs/42";

describe("dates", () => {
  test("a TOML date as Bun parses it, a string, a Date; not a date and time, nor a day that doesn't exist", () => {
    const parsed = Bun.TOML.parse("d = 2027-01-12\nt = 2027-01-12T10:00:00Z") as Record<string, unknown>;
    expect(dateOf(parsed.d)).toBe("2027-01-12");
    expect(dateOf(parsed.t)).toBeNull();
    expect(dateOf("2027-01-12")).toBe("2027-01-12");
    expect(dateOf(new Date("2027-01-12T00:00:00Z"))).toBe("2027-01-12");
    expect(dateOf("2027-02-30")).toBeNull();
    expect(dateOf("12/01/2027")).toBeNull();
    expect(dateOf(20270112)).toBeNull();
  });

  test("days between two dates, negative backwards", () => {
    expect(daysFrom("2026-10-12", "2026-10-19")).toBe(7);
    expect(daysFrom("2026-10-19", "2026-10-12")).toBe(-7);
    expect(daysFrom("2026-12-31", "2027-01-01")).toBe(1);
  });
});

describe("the committed upkeep files", () => {
  test("renewals.toml: clean; the tap's deploy key active, with its rotation date, in the release environment", () => {
    const { renewals, problems } = parseRenewals(upkeep("renewals.toml"));
    expect(problems).toEqual([]);
    const tap = renewals.find((r) => r.name === "HOMEBREW_TAP_DEPLOY_KEY");
    expect(tap).toMatchObject({ kind: "deploy-key", status: "active", secret: { environment: "release" } });
    expect(dateOf(tap?.rotate_by ?? null)).toBe(tap?.rotate_by ?? "a date");
    // On the tap, not this repository: the monthly comparison, which reads this repository's keys, mustn't look for it.
    expect(tap?.deploy_key).toBeUndefined();
  });

  test("deviations.toml: clean, each with a review date; DOC-06 and a solo project's criteria among them", () => {
    const { deviations, problems } = parseDeviations(upkeep("deviations.toml"));
    expect(problems).toEqual([]);
    for (const d of deviations) expect(dateOf(d.review)).toBe(d.review);
    const rules = deviations.map((d) => d.rule);
    for (const r of ["DOC-06", "Code-Review", "Contributors", "Branch-Protection", "Gold", "OSPS-QA-07.01"])
      expect(rules).toContain(r);
    expect(deviations.find((d) => d.rule === "DOC-06")?.decision).toBe("GR-D8");
  });

  test("settings.json: clean; the repository; each group read by the workflow's token or an admin", () => {
    const { repository, groups, problems } = parseSettings(upkeep("settings.json"));
    expect(problems).toEqual([]);
    expect(repository).toBe("remziduzagac/slipbox");
    const workflow = groups.filter((g) => g.reader === "workflow").map((g) => g.endpoint);
    expect(workflow).toContain("repos/{repo}/private-vulnerability-reporting");
    const admin = groups.filter((g) => g.reader === "admin").map((g) => g.endpoint);
    for (const e of ["repos/{repo}/actions/permissions", "repos/{repo}/actions/permissions/workflow"])
      expect(admin).toContain(e);
    const merging = groups.find((g) => g.reader === "admin" && g.endpoint === "repos/{repo}")?.expect;
    expect(merging).toMatchObject({
      allow_squash_merge: true,
      allow_merge_commit: false,
      delete_branch_on_merge: true,
    });
    // GR-D14: Pages built by its workflow, deployed through `github-pages` from main, test and v* tags only; read
    // weekly, so the health workflow's token may read Pages.
    expect(groups.find((g) => g.endpoint === "repos/{repo}/pages")).toMatchObject({
      reader: "workflow",
      expect: { build_type: "workflow", html_url: "https://remziduzagac.github.io/slipbox/" },
    });
    const policies = groups.find(
      (g) => g.endpoint === "repos/{repo}/environments/github-pages/deployment-branch-policies",
    );
    expect(policies).toMatchObject({
      reader: "workflow",
      expect: {
        branch_policies: [
          { name: "main", type: "branch" },
          { name: "test", type: "branch" },
          { name: "v*", type: "tag" },
        ],
      },
    });
    const health = Bun.YAML.parse(readFileSync(join(ROOT, ".github", "workflows", "health.yml"), "utf8")) as {
      jobs: { collect: { permissions: Record<string, string> } };
    };
    expect(health.jobs.collect.permissions.pages).toBe("read");
  });

  test("the rulesets, as GitHub exports them: main through a pull request and the ci check; v* tags admins only; test kept", () => {
    const files = readdirSync(join(UPKEEP, "rulesets")).sort();
    expect(files).toEqual(["main.json", "tags.json", "test.json"]);
    // GR-D13: `test`, which previews are made from, is never deleted or forced back, and takes only a commit whose
    // ci check passed.
    const kept = JSON.parse(readFileSync(join(UPKEEP, "rulesets", "test.json"), "utf8")) as Ruleset;
    expect(kept).toMatchObject({ name: "test", target: "branch", enforcement: "active" });
    expect(kept.conditions).toEqual({ ref_name: { include: ["refs/heads/test"], exclude: [] } });
    expect(kept.rules?.map((r) => r.type)).toEqual(["deletion", "non_fast_forward", "required_status_checks"]);
    expect(JSON.stringify(kept)).toContain('"context":"ci","integration_id":15368');
    expect(kept.bypass_actors).toEqual([]);
    const main = JSON.parse(readFileSync(join(UPKEEP, "rulesets", "main.json"), "utf8")) as Ruleset;
    expect(main.rules?.map((r) => r.type)).toEqual([
      "deletion",
      "non_fast_forward",
      "pull_request",
      "required_status_checks",
    ]);
    expect(JSON.stringify(main)).toContain('"context":"ci","integration_id":15368');
    expect(main.bypass_actors).toEqual([]);
    const tags = JSON.parse(readFileSync(join(UPKEEP, "rulesets", "tags.json"), "utf8")) as Ruleset;
    expect(tags.conditions).toEqual({ ref_name: { include: ["refs/tags/v*"], exclude: [] } });
    expect(tags.bypass_actors).toEqual([{ actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "always" }]);
  });
});

describe("the upkeep files' mistakes", () => {
  test("renewals: a field it doesn't read, a missing one, an active one without a date, a date that isn't one", () => {
    const { problems } = parseRenewals(`
[[renewal]]
name = "A"
kind = "token"
what = "w"
purpose = "p"
lives = "l"
due = "d"
status = "active"
expiry = 2027-01-01

[[renewal]]
name = "B"
kind = "password"
what = "w"
lives = "l"
due = "d"
status = "active"
expires = "soon"
`);
    expect(problems).toEqual([
      "renewals.toml, A: `expiry` isn't a field it reads",
      "renewals.toml, A: an active one has a date: `expires`, or a deploy key's `rotate_by`",
      "renewals.toml, B: `purpose` is missing",
      "renewals.toml, B: `kind` is one of token, deploy-key, domain, certificate, account",
      "renewals.toml, B: `expires` is a date, YYYY-MM-DD",
      "renewals.toml, B: an active one has a date: `expires`, or a deploy key's `rotate_by`",
    ]);
  });

  test("a file that isn't TOML, and a deviation without its review date", () => {
    expect(parseRenewals("[[renewal]\n").problems[0]).toStartWith("renewals.toml: ");
    expect(parseDeviations('[[deviation]]\nrule = "X"\nstandard = "s"\nwhat = "w"\nreason = "r"\n').problems).toEqual([
      "deviations.toml, X: `review` is a date, YYYY-MM-DD",
    ]);
  });

  test("settings: a group without its reader or expectation", () => {
    expect(parseSettings('{"settings": [{"endpoint": "repos/{repo}", "reader": "anyone"}]}').problems).toEqual([
      "settings.json, repos/{repo}: `reader` is workflow or admin",
      "settings.json, repos/{repo}: `expect` is missing",
    ]);
  });
});

describe("what's due", () => {
  const base = { kind: "token", what: "w", purpose: "p", lives: "l", due: "Renew it." };
  const renewals = [
    { ...base, name: "SOON", status: "active" as const, expires: "2026-10-20" },
    { ...base, name: "PAST", status: "active" as const, expires: "2026-10-01" },
    { ...base, name: "LATER", status: "active" as const, expires: "2027-06-01" },
    { ...base, name: "KEY", kind: "deploy-key", status: "active" as const, rotate_by: "2026-11-10" },
    { ...base, name: "OLD", status: "retired" as const, expires: "2026-10-13" },
    { ...base, name: "NEXT", status: "planned" as const },
  ];

  test("renewals within 30 days, the overdue first; the far one and the retired one left out; the planned apart", () => {
    const { due, planned } = renewalsDue(renewals, "2026-10-12");
    expect(due.map((d) => [d.name, d.days])).toEqual([
      ["PAST", -11],
      ["SOON", 8],
      ["KEY", 29],
    ]);
    expect(due[2]?.field).toBe("rotate_by");
    expect(planned.map((p) => p.name)).toEqual(["NEXT"]);
  });

  test("deviations whose review date has come", () => {
    const d = { standard: "s", what: "w", reason: "r" };
    const due = reviewsDue(
      [
        { ...d, rule: "A", review: "2026-10-12" },
        { ...d, rule: "B", review: "2026-10-13" },
        { ...d, rule: "C", review: "2026-01-01" },
      ],
      "2026-10-12",
    );
    expect(due.map((x) => x.rule)).toEqual(["A", "C"]);
  });
});

describe("comparing", () => {
  test("only the fields expected; arrays in any order, their objects by the fields named", () => {
    expect(compare("g", { a: 1, b: { c: true } }, { a: 1, b: { c: true, d: 2 }, e: 3 })).toEqual([]);
    expect(compare("g", { l: ["x", "y"] }, { l: ["y", "x"] })).toEqual([]);
    expect(compare("g", { p: [{ name: "v*", type: "tag" }] }, { p: [{ id: 1, name: "v*", type: "tag" }] })).toEqual([]);
  });

  test("a value that differs, an array with one more, a field not shown", () => {
    expect(compare("g", { a: 1, b: { c: true } }, { a: 2, b: {} })).toEqual([
      { where: "g", path: "a", kind: "differs", expected: 1, actual: 2 },
      { where: "g", path: "b.c", kind: "unreadable", expected: true },
    ]);
    expect(compare("g", ["x"], ["x", "y"])).toEqual([
      { where: "g", path: "", kind: "differs", expected: ["x"], actual: ["x", "y"] },
    ]);
  });

  const expected = JSON.parse(readFileSync(join(UPKEEP, "rulesets", "tags.json"), "utf8")) as Ruleset;
  const main = JSON.parse(readFileSync(join(UPKEEP, "rulesets", "main.json"), "utf8")) as Ruleset;
  /** A ruleset as GitHub answers: its id and source added, a rule's defaults filled in. */
  const live = (r: Ruleset): Ruleset =>
    structuredClone({
      ...r,
      id: 7,
      source_type: "Repository",
      source: "o/r",
      rules: r.rules?.map((x) =>
        x.type === "pull_request" ? { ...x, parameters: { ...(x.parameters as object), required_reviewers: [] } } : x,
      ),
    }) as Ruleset;

  test("the rulesets as GitHub answers them: no drift", () => {
    expect(compareRulesets([main, expected], [live(expected), live(main)])).toEqual([]);
  });

  test("a rule's parameter changed, a rule gone, one added, a ruleset missing and one unexpected", () => {
    const changed = live(main);
    const pr = changed.rules?.find((r) => r.type === "pull_request");
    (pr?.parameters as Record<string, unknown>).required_approving_review_count = 1;
    changed.rules = changed.rules?.filter((r) => r.type !== "deletion");
    changed.rules?.push({ type: "required_signatures" });
    expect(compareRulesets([main, expected], [changed, { ...live(expected), name: "old" }])).toEqual([
      { where: "ruleset main", path: "rules.deletion", kind: "missing" },
      {
        where: "ruleset main",
        path: "rules.pull_request.parameters.required_approving_review_count",
        kind: "differs",
        expected: 0,
        actual: 1,
      },
      { where: "ruleset main", path: "rules.required_signatures", kind: "unexpected" },
      { where: "ruleset tags", path: "", kind: "missing" },
      { where: "ruleset old", path: "", kind: "unexpected" },
    ]);
  });

  test("bypass actors not shown to the workflow's token: unreadable, not drift", () => {
    const { bypass_actors: _, ...hidden } = live(expected);
    expect(compareRulesets([expected], [hidden as Ruleset])).toEqual([
      { where: "ruleset tags", path: "bypass_actors", kind: "unreadable", expected: expected.bypass_actors },
    ]);
  });
});

describe("the signals, from GitHub's answers", () => {
  test("alerts counted by severity, the critical ones' numbers kept, nothing of the package", () => {
    const dependabot = dependabotCounts([
      { number: 3, security_advisory: { severity: "critical" }, dependency: { package: { name: "left-pad" } } },
      { number: 1, security_advisory: { severity: "high" } },
      { number: 2, security_vulnerability: { severity: "high" } },
    ]);
    expect(dependabot).toEqual({ open: 3, bySeverity: { critical: 1, high: 2 }, critical: [3] });
    expect(JSON.stringify(dependabot)).not.toContain("left-pad");
    // The example projects' manifests: fixtures, counted apart, never a critical of slipbox's.
    const withFixtures = dependabotCounts([
      { number: 1, security_advisory: { severity: "high" }, dependency: { manifest_path: "bun.lock" } },
      {
        number: 7,
        security_advisory: { severity: "critical" },
        dependency: { manifest_path: "examples/a/package-lock.json" },
      },
      { number: 8, security_advisory: { severity: "low" }, dependency: { manifest_path: "examples/b/Cargo.lock" } },
    ]);
    expect(withFixtures).toEqual({ open: 1, bySeverity: { high: 1 }, critical: [], fixtures: 2 });
    const scanning = codeScanningCounts([
      { number: 9, rule: { severity: "error", security_severity_level: "critical" } },
      { number: 8, rule: { severity: "warning", security_severity_level: null } },
    ]);
    expect(scanning).toEqual({ open: 2, bySeverity: { critical: 1, warning: 1 }, critical: [9] });
  });

  test("pull requests oldest first; workflows switched off, by GitHub or by hand; the last run on main failing", () => {
    expect(
      pullsOf([
        {
          number: 5,
          title: "b",
          user: { login: "dependabot[bot]" },
          created_at: "2026-10-10T08:00:00Z",
          html_url: "u5",
        },
        {
          number: 4,
          title: "a",
          user: { login: "x" },
          created_at: "2026-10-01T08:00:00Z",
          draft: true,
          html_url: "u4",
        },
      ]).map((p) => [p.number, p.created, p.draft]),
    ).toEqual([
      [4, "2026-10-01", true],
      [5, "2026-10-10", false],
    ]);
    const workflows = [
      { id: 1, name: "ci", path: ".github/workflows/ci.yml", state: "active" },
      { id: 2, name: "scan", path: ".github/workflows/scan.yml", state: "disabled_inactivity" },
      { id: 3, name: "old", path: ".github/workflows/old.yml", state: "disabled_manually" },
      { id: 4, name: "gone", path: ".github/workflows/gone.yml", state: "deleted" },
      { id: 5, name: "health", path: ".github/workflows/health.yml", state: "active" },
    ];
    expect(workflowsOff(workflows).map((w) => w.state)).toEqual(["disabled_manually", "disabled_inactivity"]);
    const runs = [
      { workflow_id: 1, conclusion: "failure", html_url: "r3" },
      { workflow_id: 5, conclusion: "success", html_url: "r2" },
      { workflow_id: 1, conclusion: "success", html_url: "r1" },
      { workflow_id: 5, conclusion: "failure", html_url: "r0" },
    ];
    expect(failingOnMain(workflows, runs)).toEqual([
      { name: "ci", path: ".github/workflows/ci.yml", conclusion: "failure", url: "r3" },
    ]);
  });

  test("lychee's report, as the links job reduces it: the broken links and the timeouts", () => {
    const report = linkReport({
      status: 2,
      error_map: {
        "docs/b.md": [{ url: "https://x.test/b", status: { text: "404 Not Found" }, span: { line: 9, column: 1 } }],
        "README.md": [{ url: "https://x.test/a", status: { text: "", details: "Network error" }, span: { line: 2 } }],
      },
      timeout_map: { "docs/b.md": [{ url: "https://slow.test", status: {}, span: { line: 3 } }] },
    });
    expect(report).toEqual({
      status: 2,
      broken: [
        { file: "README.md", line: 2, url: "https://x.test/a", status: "Network error" },
        { file: "docs/b.md", line: 3, url: "https://slow.test", status: "timeout" },
        { file: "docs/b.md", line: 9, url: "https://x.test/b", status: "404 Not Found" },
      ],
    });
    expect(linkReport({ status: 1 })).toEqual({ status: 1, broken: [] });
  });

  test("a link to a file shown from the checkout's root, not the runner's absolute address", () => {
    const missing = { url: "file:///home/runner/work/r/r/docs/gone.md", status: { text: "File not found" } };
    const elsewhere = { url: "file:///etc/passwd", status: { text: "File not found" } };
    const report = linkReport({
      status: 2,
      root: "/home/runner/work/r/r",
      error_map: { "a.md": [missing, elsewhere] },
    });
    expect(report.broken.map((b) => b.url)).toEqual(["docs/gone.md", "file:///etc/passwd"]);
  });

  test("the collect job's output: taken when it has the shape, else none", () => {
    expect(signalsOf(signals())).not.toBeNull();
    expect(signalsOf({ ...signals(), pulls: { ok: true } })).toBeNull();
    expect(signalsOf({ ...signals(), dependabot: { ok: false } })).toBeNull();
    expect(signalsOf("{}")).toBeNull();
  });
});

describe("quoting others' text", () => {
  test("a code span, mentions and comment openers defused, one line, cut", () => {
    expect(quote("chore(deps): bump x from 1 to 2")).toBe("`chore(deps): bump x from 1 to 2`");
    expect(quote("ping @remzi and @org/team")).toBe("`ping @​remzi and @​org/team`");
    expect(quote("a `b` c")).toBe("`` a `b` c ``");
    expect(quote("line\nbreak‮evil\u0007")).toBe("`line break evil`");
    expect(quote("<!-- repository-health -->")).toBe("`<!​-- repository-health -->`");
    expect(quote("x".repeat(100), 10)).toBe(`\`${"x".repeat(9)}…\``);
    expect(quote("   ")).toBe("`(empty)`");
  });
});

/** Signals with something in each: the fixture the issue is rendered from. */
function signals(over: Partial<Signals> = {}): Signals {
  return {
    repo: "o/r",
    dependabot: { ok: true, value: { open: 2, bySeverity: { critical: 1, high: 1 }, critical: [7] } },
    codeScanning: { ok: false, reason: "HTTP 403: Resource not accessible by integration" },
    pulls: {
      ok: true,
      value: [
        {
          number: 12,
          title: "chore(deps): bump `x` @evil",
          author: "dependabot[bot]",
          created: "2026-10-03",
          draft: false,
          url: "https://github.com/o/r/pull/12",
        },
      ],
    },
    workflows: {
      ok: true,
      value: [{ name: "scan", path: ".github/workflows/scan.yml", state: "disabled_inactivity" }],
    },
    failing: { ok: true, value: [] },
    rulesets: {
      ok: true,
      value: [
        { where: "ruleset tags", path: "bypass_actors", kind: "unreadable", expected: [] },
        { where: "ruleset main", path: "enforcement", kind: "differs", expected: "active", actual: "evaluate" },
      ],
    },
    settings: { ok: true, value: [] },
    problems: [],
    ...over,
  };
}

function report(over: Partial<Report> = {}): Report {
  return {
    repo: "o/r",
    date: "2026-10-12",
    runUrl: RUN,
    signals: signals(),
    collect: "success",
    links: { status: 0, broken: [] },
    linksResult: "success",
    renewals: [
      {
        name: "TAP",
        kind: "token",
        what: "w",
        purpose: "p",
        lives: "l",
        status: "active",
        expires: "2026-10-17",
        due: "Renew it.",
      },
    ],
    deviations: [{ rule: "DOC-06", standard: "greenrepo", what: "A site.", reason: "Not yet.", review: "2027-01-12" }],
    problems: [],
    ...over,
  };
}

describe("the issue's body", () => {
  test("the run first; the sections by who acts; others' text quoted; alert counts, never packages", () => {
    const { body } = render(report(), null);
    const lines = body.split("\n");
    expect(lines[0]).toBe(
      `Last run: 2026-10-12, [run 42](${RUN}). A last run more than eight days old means the check has stopped: ` +
        "treat it as red.",
    );
    const headings = lines.filter((l) => l.startsWith("## "));
    expect(headings).toEqual([
      "## Needs the maintainer",
      "## An agent can propose",
      "## Accepted deviations",
      "## Not available here",
    ]);
    const section = (h: string) => body.split(`## ${h}\n`)[1]?.split("\n## ")[0] ?? "";
    const maintainer = section("Needs the maintainer");
    expect(maintainer).toContain("- Renewal: `TAP` (token) expires on 2026-10-17, in 5 days. Renew it.");
    expect(maintainer).toContain('- Settings: ruleset main: `enforcement` is `"evaluate"`, expected `"active"`.');
    expect(maintainer).toContain("this run switched it on again");
    expect(maintainer).toContain(
      "- Pull request [#12](https://github.com/o/r/pull/12) `` chore(deps): bump `x` @​evil `` by " +
        "`dependabot[bot]`, open 9 days.",
    );
    expect(section("An agent can propose")).toContain(
      "- Dependabot alerts: 2 open (1 critical, 1 high): [the Security tab](https://github.com/o/r/security/dependabot).",
    );
    expect(section("Accepted deviations")).toContain(
      "**DOC-06** (greenrepo): A site. Accepted: Not yet. Review on 2027-01-12.",
    );
    const unavailable = section("Not available here");
    expect(unavailable).toContain("only an admin reads them");
    expect(unavailable).toContain("ruleset tags: `bypass_actors` isn't shown to this login.");
    expect(unavailable).toContain("Code scanning alerts: `HTTP 403: Resource not accessible by integration`");
    expect(body).toContain(MARKER);
  });

  test("an empty section says so; a collection that failed is reported, not mistaken for a clean week", () => {
    const { body } = render(
      report({ signals: null, collect: "failure", links: null, linksResult: "failure", renewals: [], deviations: [] }),
      null,
    );
    expect(body).toContain("## Needs the maintainer\n\n- Nothing.\n");
    expect(body).toContain(`- The signals weren't collected (the collect job: failure): [the run](${RUN}).`);
    expect(body).toContain(`- The links weren't checked (the links job: failure): [the run](${RUN}).`);
    expect(body).toContain("## Accepted deviations\n\n- Nothing.\n");
  });

  test("the example projects' Dependabot alerts: a line of their own, to dismiss; never counted as slipbox's", () => {
    const dependabot = { ok: true as const, value: { open: 0, bySeverity: {}, critical: [], fixtures: 45 } };
    const { body } = render(report({ signals: signals({ dependabot }) }), null);
    expect(body).toContain("Dependabot alerts in the example projects (`examples/`): 45 open");
    expect(body).toContain("dismiss them as not used");
    expect(body).not.toContain("Dependabot alerts: 0 open");
  });

  test("long lists capped, the rest linked", () => {
    const many = Array.from({ length: CAP + 3 }, (_, i) => ({
      number: i + 1,
      title: `t${i}`,
      author: "a",
      created: "2026-10-01",
      draft: false,
      url: `u${i}`,
    }));
    const { body } = render(report({ signals: signals({ pulls: { ok: true, value: many } }) }), null);
    expect(body.match(/^- Pull request /gm)?.length).toBe(CAP);
    expect(body).toContain("- And 3 more: [the open pull requests](https://github.com/o/r/pulls).");
  });

  test("the hidden state: read back, the last block taken; none that's malformed", () => {
    const { body, state } = render(report(), null);
    expect(readState(body)).toEqual(state);
    expect(Object.keys(state.seen)).toContain("pull:12");
    expect(Object.keys(state.seen)).toContain("dependabot-critical:7");
    const forged = `\`<!-- repository-health:state {"v":1,"seen":{"x":"2020-01-01"}} -->\`\n${body}`;
    expect(readState(forged)).toEqual(state);
    expect(readState("<!-- repository-health:state {nope} -->")).toBeNull();
    expect(readState("no state")).toBeNull();
  });

  test("nothing in the state can close its comment early", () => {
    const { body } = render(
      report({ links: { status: 2, broken: [{ file: "a.md", line: 1, url: "https://x.test/-->", status: "404" }] } }),
      null,
    );
    const state = body.slice(body.lastIndexOf("<!-- repository-health:state "));
    expect(state.indexOf("-->")).toBe(state.length - "-->".length - 1);
    expect(Object.keys(readState(body)?.seen ?? {})).toContain("link:a.md:https://x.test/-->");
  });

  test("new items marked for a week; nothing marked new, and nothing commented, on the first run", () => {
    const first = render(report(), null);
    expect(first.body).not.toContain("(new)");
    expect(first.fresh).toEqual([]);
    // A second run the same day: what was there at the first isn't new either.
    expect(render(report(), first.state).body).toBe(first.body);
    const later = render(report({ date: "2026-10-19" }), {
      ...first.state,
      seen: { ...first.state.seen, "pull:12": "2026-10-15", dependabot: "2026-10-18" },
    });
    expect(later.body).toContain("open 16 days. **(new)**");
    expect(later.body).toContain("[the Security tab](https://github.com/o/r/security/dependabot). **(new)**");
    // There since the first run: never new.
    expect(later.body).toContain("- Renewal: `TAP` (token) expired on 2026-10-17, 2 days ago. Renew it.\n");
    const after = render(report({ date: "2026-10-22" }), later.state);
    expect(after.body).toContain("open 19 days.\n");
  });

  test("a critical thing commented on the run it first appears, and not again", () => {
    const quiet = report({ renewals: [] });
    const first = render(quiet, { start: "2026-10-05", seen: {} });
    expect(first.fresh.map((w) => w.key)).toEqual(["workflow-off:.github/workflows/scan.yml", "dependabot-critical:7"]);
    const again = render(quiet, first.state);
    expect(again.fresh).toEqual([]);
    const worse = report({
      signals: signals({ dependabot: { ok: true, value: { open: 3, bySeverity: { critical: 2 }, critical: [7, 8] } } }),
    });
    expect(render(worse, render(worse, first.state).state).fresh).toEqual([]);
    expect(render(worse, first.state).fresh.map((w) => w.key)).toEqual([
      "renewal-urgent:TAP:expires",
      "dependabot-critical:8",
    ]);
  });
});

describe("the issue found, and what's done to it", () => {
  const ref = (number: number, over: Partial<IssueRef> = {}): IssueRef => ({
    number,
    id: number * 100,
    state: "open",
    body: "",
    locked: true,
    labels: [LABEL],
    ...over,
  });

  test("by the marker, among what GitHub listed: never a pull request, never one without it", () => {
    const found = issuesOf([
      { number: 3, id: 30, state: "open", body: `x\n${MARKER}`, locked: false, labels: [{ name: LABEL }] },
      { number: 4, id: 40, state: "open", body: "Repository health", labels: [{ name: LABEL }] },
      { number: 5, id: 50, state: "open", body: MARKER, pull_request: {}, labels: [] },
      { number: 3, id: 30, state: "open", body: `x\n${MARKER}`, locked: false, labels: [{ name: LABEL }] },
    ]);
    expect(found).toEqual([{ number: 3, id: 30, state: "open", body: `x\n${MARKER}`, locked: false, labels: [LABEL] }]);
  });

  test("the oldest open one kept, the others duplicates; a closed one only when none is open", () => {
    const { issue, duplicates } = chooseIssue([ref(9), ref(2, { state: "closed" }), ref(5)]);
    expect(issue?.number).toBe(5);
    expect(duplicates.map((d) => d.number)).toEqual([9, 2]);
    expect(chooseIssue([ref(4, { state: "closed" }), ref(2, { state: "closed" })]).issue?.number).toBe(2);
    expect(chooseIssue([]).issue).toBeNull();
  });

  test("none yet: created, then locked", () => {
    expect(planIssue(null, [], "body", [], RUN)).toEqual([
      { op: "create", body: "body" },
      { op: "lock", number: null },
    ]);
  });

  test("a second run the same day with nothing changed does nothing; the next day it moves the date", () => {
    const first = render(report(), null);
    const { body } = first;
    const sameDay = render(report({ runUrl: RUN.replace("42", "43") }), first.state).body;
    expect(sameDay).toContain("[run 43]");
    expect(comparable(sameDay)).toBe(comparable(body));
    expect(planIssue(ref(5, { body }), [], sameDay, [], RUN)).toEqual([]);
    const nextDay = render(report({ date: "2026-10-13" }), readState(body)).body;
    expect(planIssue(ref(5, { body }), [], nextDay, [], RUN)).toEqual([{ op: "edit", number: 5, body: nextDay }]);
  });

  test("closed: reopened; unlabelled: labelled; unlocked: locked; something critical: one comment; duplicates closed", () => {
    const issue = ref(5, { state: "closed", body: "old", locked: false, labels: [] });
    const fresh = [{ key: "k", text: "`TAP` expires on 2026-10-17, in 5 days." }];
    expect(planIssue(issue, [ref(9), ref(3, { state: "closed" })], "new", fresh, RUN)).toEqual([
      { op: "reopen", number: 5 },
      { op: "edit", number: 5, body: "new" },
      { op: "label", number: 5 },
      { op: "lock", number: 5 },
      {
        op: "comment",
        number: 5,
        body: `New since the last run ([this run](${RUN})):\n\n- \`TAP\` expires on 2026-10-17, in 5 days.\n\nThe issue above has the rest.`,
      },
      { op: "close", number: 9, duplicateOf: 500 },
    ]);
  });
});

describe("the monthly comparison's credentials", () => {
  const base = { kind: "token", what: "w", purpose: "p", lives: "l", due: "d" };

  test("each secret and deploy key listed, with its age; what renewals.toml doesn't match", () => {
    const { lines, problems } = credentials(
      [
        {
          ...base,
          name: "TAP",
          status: "active",
          expires: "2027-01-01",
          secret: { name: "TAP", environment: "release" },
        },
        { ...base, name: "GONE", status: "active", expires: "2027-01-01", secret: { name: "GONE" } },
        { ...base, name: "NEW", status: "planned", secret: { name: "NEW", environment: "release" } },
      ],
      [
        { name: "TAP", store: "environment release", updated: "2026-10-02T10:00:00Z" },
        { name: "NEW", store: "environment release", updated: "2026-10-11T10:00:00Z" },
        { name: "STRAY", store: "repository", updated: "2026-01-01T00:00:00Z" },
      ],
      [{ title: "deploy", created: "2026-09-01T00:00:00Z", lastUsed: "" }],
      "2026-10-12",
    );
    expect(lines).toEqual([
      "environment release secret TAP: updated 2026-10-02, 10 days ago; renewals.toml: active",
      "environment release secret NEW: updated 2026-10-11, 1 day ago; renewals.toml: planned",
      "repository secret STRAY: updated 2026-01-01, 284 days ago",
      "deploy key deploy: created 2026-09-01, 41 days ago, last used never",
    ]);
    expect(problems).toEqual([
      "NEW exists: renewals.toml still says planned; give it its date",
      "repository secret STRAY isn't in renewals.toml (SET-08: every credential listed)",
      "deploy key deploy isn't in renewals.toml (SET-08: every credential listed)",
      "renewals.toml lists GONE as active, but there's no repository secret GONE",
    ]);
  });
});

describe("the health workflow (.github/workflows/health.yml)", () => {
  const text = readFileSync(join(ROOT, ".github", "workflows", "health.yml"), "utf8");
  const wf = parseYaml(text) as {
    on: Record<string, unknown>;
    permissions: unknown;
    concurrency: { "cancel-in-progress": boolean };
    jobs: Record<
      string,
      {
        permissions?: Record<string, string>;
        "timeout-minutes"?: number;
        if?: string;
        steps: { uses?: string; with?: Record<string, unknown> }[];
      }
    >;
  };

  test("on its schedule and by hand only; no permission by default; one run at a time, never cancelled", () => {
    expect(Object.keys(wf.on).sort()).toEqual(["schedule", "workflow_dispatch"]);
    expect(wf.permissions).toEqual({});
    expect(wf.concurrency["cancel-in-progress"]).toBe(false);
  });

  test("every job with a timeout and its own grants, each explained; one job writes the issue", () => {
    for (const [name, job] of Object.entries(wf.jobs)) {
      expect(job["timeout-minutes"], name).toBeGreaterThan(0);
      expect(Object.keys(job.permissions ?? {}).length, name).toBeGreaterThan(0);
    }
    for (const m of text.matchAll(/^ {6}([a-z-]+): (read|write)(.*)$/gm)) expect(m[3], m[1]).toMatch(/^ # \S/);
    const writers = Object.entries(wf.jobs).flatMap(([name, job]) =>
      Object.entries(job.permissions ?? {})
        .filter(([, v]) => v === "write")
        .map(([k]) => `${name}: ${k}`),
    );
    expect(writers).toEqual(["issue: issues", "keepalive: actions"]);
  });

  test("the keepalive job runs whatever came before; the issue job unless the run was cancelled", () => {
    expect(wf.jobs.keepalive?.if).toBe("${{ always() }}");
    expect(wf.jobs.issue?.if).toBe("${{ !cancelled() }}");
  });

  test("the toolchain from mise.toml, no cache; checkouts keep no credentials", () => {
    for (const job of Object.values(wf.jobs))
      for (const step of job.steps) {
        if (step.uses?.startsWith("jdx/mise-action@")) expect(step.with?.cache).toBe(false);
        if (step.uses?.startsWith("actions/checkout@")) expect(step.with?.["persist-credentials"]).toBe(false);
      }
    expect(text).not.toContain("actions/cache");
  });
});
