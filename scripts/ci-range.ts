// Where a push's range starts (CIW-D1). A push to `dev` or `test` tests what changed since the nearest commit, back from
// the one pushed, whose push run passed under the same scope (`SCOPE_VERSION` in that commit's `scripts/ci-scope.ts`):
// a run cancelled or failed leaves its commits to the next. With none, from `test`'s head before the push when it's of
// that version (`test` takes only a commit whose `ci` passed), else everything. And it ends at the commit's parent when
// a pull request's run passed the commit's own tree on that parent (CIW-D2): what the pull request changed was tested
// there, on the same tree, by the same workflow. Whatever can't be read tests more, never less.

/** A GET of GitHub's REST API under the repository (`actions/runs/1`): its JSON, or null when it can't be read. */
export type Api = (path: string) => Promise<unknown>;

/** What a push tests: the commits `from..to`, and why; or everything, and why. */
export type Range = { from: string; to: string; why: string[] } | { all: string; why: string[] };

const HASH = /^[0-9a-f]{40}$/;
const isHash = (s: unknown): s is string => typeof s === "string" && HASH.test(s);

/** The API with the job's token (`GH_TOKEN`), for the repository the run is in; none without them. */
export function githubApi(env: Record<string, string | undefined> = process.env): Api | null {
  const { GITHUB_REPOSITORY: repo, GH_TOKEN: token } = env;
  if (!repo || !token) return null;
  const base = env.GITHUB_API_URL ?? "https://api.github.com";
  return async (path) => {
    try {
      const r = await fetch(`${base}/repos/${repo}/${path}`, {
        headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
      });
      return r.ok ? await r.json() : null;
    } catch {
      return null;
    }
  };
}

/** A git command's output in `root`, trimmed, or null when it fails. */
export function gitOut(root: string, ...args: string[]): string | null {
  const r = Bun.spawnSync(["git", "-C", root, ...args], { stderr: "ignore" });
  return r.exitCode === 0 ? r.stdout.toString().trim() : null;
}

/** The commit `rev` names, in full, or null. */
export const commit = (root: string, rev: string) =>
  gitOut(root, "rev-parse", "--verify", "--quiet", `${rev}^{commit}`);

/** The scope's version a commit declares in its `scripts/ci-scope.ts`, or null. */
export function versionAt(root: string, rev: string): number | null {
  const text = gitOut(root, "show", `${rev}:scripts/ci-scope.ts`);
  const m = text && /^export const SCOPE_VERSION = (\d+);$/m.exec(text);
  return m ? Number(m[1]) : null;
}

/** The commits of push runs of `ci.yml` that passed, newest first, with their runs' addresses; null unread. */
async function passes(api: Api): Promise<Map<string, string> | null> {
  const res = (await api(
    "actions/workflows/ci.yml/runs?event=push&status=success&exclude_pull_requests=true&per_page=100",
  )) as {
    workflow_runs?: ({ head_sha?: unknown; conclusion?: unknown; html_url?: unknown } | null)[];
  } | null;
  if (!Array.isArray(res?.workflow_runs)) return null;
  const out = new Map<string, string>();
  for (const r of res.workflow_runs)
    if (r?.conclusion === "success" && isHash(r.head_sha) && !out.has(r.head_sha))
      out.set(r.head_sha, String(r.html_url));
  return out;
}

/**
 * The run of a pull request whose record (CIW-D2) says it passed `tree` on `parent`, and whose head merged onto `parent`
 * makes `tree`: its address, or null. Every record of the name is read; one whose run is going, failed or isn't a pull
 * request's run of `ci.yml`, or whose head makes another tree, is passed over. Past `deadline` it stops, finding none,
 * so a slow API or fetch tests more, never ends `changes` at its timeout.
 */
export async function recordRun(
  api: Api,
  root: string,
  name: string,
  parent: string,
  tree: string,
  deadline = Date.now() + 90_000,
): Promise<string | null> {
  for (let page = 1; page <= 10; page++) {
    if (Date.now() >= deadline) return null;
    const res = (await api(`actions/artifacts?name=${name}&per_page=100&page=${page}`)) as {
      artifacts?: ({ expired?: unknown; workflow_run?: { id?: unknown; head_sha?: unknown } } | null)[];
    } | null;
    if (!Array.isArray(res?.artifacts)) return null;
    for (const a of res.artifacts) {
      const id = a?.workflow_run?.id;
      const head = a?.workflow_run?.head_sha;
      if (a?.expired !== false || typeof id !== "number" || !isHash(head)) continue;
      if (Date.now() >= deadline) return null;
      const run = (await api(`actions/runs/${id}`)) as Record<string, unknown> | null;
      if (
        run?.event !== "pull_request" ||
        run.path !== ".github/workflows/ci.yml" ||
        run.status !== "completed" ||
        run.conclusion !== "success"
      )
        continue;
      // Its head, which a merged pull request's branch no longer holds: fetched by its hash, in the time left.
      if (!commit(root, head))
        Bun.spawnSync(["git", "-C", root, "fetch", "--quiet", "--no-tags", "origin", head], {
          stdout: "ignore",
          stderr: "ignore",
          timeout: Math.max(1, deadline - Date.now()),
        });
      if (commit(root, head) && gitOut(root, "merge-tree", "--write-tree", parent, head)?.split("\n")[0] === tree)
        return String(run.html_url);
    }
    if (res.artifacts.length < 100) break;
  }
  return null;
}

/** The record's name for a run that tests `tree` on `base` under `version`. */
export const recordName = (version: number, base: string, tree: string) => `ci-tested-v${version}-${base}-${tree}`;

/**
 * What a push of `HEAD` in `root` tests: the passes read through `api`, then `test`'s head before the push
 * (`testHead`), then everything; less what a pull request's run passed.
 */
export async function pushRange(root: string, api: Api | null, testHead: string | null): Promise<Range> {
  const head = commit(root, "HEAD");
  const version = versionAt(root, "HEAD");
  if (!head || version === null) return { all: "the commit pushed, or its scope's version, can't be read", why: [] };
  const why: string[] = [];
  let from: string | null = null;
  const passed = api ? await passes(api) : null;
  if (!passed) why.push(api ? "the runs that passed can't be read" : "no token to read the runs that passed");
  else
    for (const c of gitOut(root, "rev-list", "--first-parent", "--max-count=5000", "HEAD")?.split("\n") ?? []) {
      const url = passed.get(c);
      if (url && versionAt(root, c) === version) {
        from = c;
        why.push(`since ${c.slice(0, 7)}: run ${url} passed`);
        break;
      }
    }
  if (passed && !from) why.push(`none of the ${passed.size} commits whose runs passed is behind it with this scope`);
  if (!from) {
    const t = isHash(testHead) ? commit(root, testHead) : null;
    const none = passed ? "no run of this scope has passed" : "which runs passed is unknown";
    if (!t || gitOut(root, "merge-base", "--is-ancestor", t, head) === null || versionAt(root, t) !== version)
      return { all: `${none}, and test's head is of another, or not behind it`, why };
    from = t;
    why.push(`since test's head ${t.slice(0, 7)}: ${none}${passed ? " yet" : ""}`);
  }
  let to = head;
  const parent = commit(root, "HEAD^1");
  const tree = gitOut(root, "rev-parse", "HEAD^{tree}");
  if (api && from !== head && parent && tree) {
    const run = await recordRun(api, root, recordName(version, parent, tree), parent, tree);
    if (run) {
      to = parent;
      why.push(
        `${head.slice(0, 7)}'s tree passed in pull request run ${run} on its parent: only ${from.slice(0, 7)}..${parent.slice(0, 7)}`,
      );
    }
  }
  return { from, to, why };
}
