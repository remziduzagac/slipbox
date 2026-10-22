// What a change reaches, and what CI runs for it. A pull request of the docs alone — docs/, the blueprint, the site's
// pages, a Markdown file at the top — runs only the docs' own tests, in the lint job (D230). Any other runs the tests
// and the terminal checks its files reach (D239): a test that uses a changed file — imports it, at any depth, or names
// it by its path — and, of the terminal checks, a changed check file's, or those `CHECKS_FOR` names for a changed
// file of the app's; all of them for a file of the app's it doesn't list, or for the checks' harness and samples. The
// packages, the toolchain, the workflows, and a file nothing names run everything; so do a merge group, a run by hand
// (the `full` run `main` requires, D251) and a diff that can't be read; the lint's own configs, only the lint. A push
// to `dev` or `test` is scoped as a pull request is, by its commits since the branch's last head.
//
// `bun run ci:scope` writes what CI's jobs need to $GITHUB_OUTPUT (`code`, `checks`), and says it either way.
// `bun run test:changed` and `bun run test:terminal:changed [runner's flags…]` run what a change reaches: a pull
// request's merge commit against its base in CI, a push's commits; here, your branch, committed or not, against where
// it left `origin/dev` (or `--base <ref>`).

import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

const ROOT = join(import.meta.dir, "..");

/** A file only the docs' checks read: the docs, the blueprint, the site's pages (not its packages), a top-level `.md`. */
export const isDocs = (path: string): boolean =>
  /^(?:docs|blueprint|site\/src)\//.test(path) || /^[^/]+\.md$/.test(path);

/** Why everything runs: the first of `files` that isn't the docs', or none changed; null when all are the docs'. */
export function codeChanged(files: string[]): string | null {
  if (files.length === 0) return "no file changed";
  return files.find((f) => !isDocs(f)) ?? null;
}

/**
 * The terminal checks a changed file of the app's runs, by a piece of their names (`bun run test:terminal <piece>…`
 * runs every check whose name holds it): a feature's own files, which only its checks drive. A file of the app's none
 * of these matches runs every check — the shared ones (the app, drawing, the parser, the index, the config) and those
 * not sorted yet. An empty list: no check runs it (the command line's commands, which the TUI never calls).
 */
export const CHECKS_FOR: [RegExp, string[]][] = [
  // Source control: the panel and its views, the diff, the merge screen, the review, the rebase (GIT). Not git.ts,
  // gitbase.ts nor gitsigns.ts: every vault's checkout and every note's gutter read them.
  [
    /^src\/core\/(gitbranches|gitlog|gitops|gitrebase|gitremote|gitrepos|gitreview|gitstage|mergereview|conflicts|blockdiff)\.ts$/,
    ["git"],
  ],
  [/^src\/core\/layout\/(diff|splitdiff|blockdiff)\.ts$/, ["git", "conflict"]],
  [/^src\/tui\/(gitview|gitpanel|gitchanges|githistory|gitmouse|gitremote|gitreposview|gitbranchview)\.ts$/, ["git"]],
  [/^src\/tui\/(draw-git|mergescreen|rebase|review)\.ts$/, ["git"]],
  [/^src\/tui\/diffview\.ts$/, ["git", "conflict"]],
  // Export.
  [/^src\/core\/export\//, ["export"]],
  [/^src\/tui\/exporter\.ts$/, ["export"]],
  // Language servers, the linter, the Problems panel.
  [/^src\/core\/servers\//, ["language servers", "lint", "problems"]],
  [/^src\/core\/lint\.ts$/, ["lint", "problems"]],
  [/^src\/tui\/(actions-lsp|problems|draw-problems)\.ts$/, ["language servers", "lint", "problems"]],
  // Spelling, off unless asked for.
  [/^src\/core\/(spell|spell-thread|spell-worker|hunspell)\.ts$/, ["spelling"]],
  [/^src\/tui\/spelling\.ts$/, ["spelling"]],
  // Vaults, home and Elsewhere; a link followed out; the peek (VV).
  [/^src\/core\/(home|mounts)\.ts$/, ["home", "Elsewhere"]],
  [/^src\/tui\/vaults\.ts$/, ["vaults", "home", "Elsewhere", "roots", "named folders"]],
  [/^src\/core\/symlinks\.ts$/, ["links"]],
  [/^src\/tui\/peek\.ts$/, ["peek"]],
  // Replace, and renames with the links they rewrite.
  [/^src\/core\/(replace|replace-files)\.ts$/, ["replace", "find"]],
  [/^src\/tui\/replacing\.ts$/, ["replace"]],
  [/^src\/core\/rename[\w-]*\.ts$/, ["rename", "naming", "vaults"]],
  [/^src\/tui\/renaming\.ts$/, ["rename", "naming"]],
  // Features of a window or a command of their own.
  [/^src\/tui\/palette\.ts$/, ["palette", "help", "which-key"]],
  [/^src\/tui\/outline\.ts$/, ["outline"]],
  [/^src\/tui\/scratch\.ts$/, ["scratch"]],
  [/^src\/tui\/info\.ts$/, ["info"]],
  [/^src\/tui\/properties\.ts$/, ["properties"]],
  [/^src\/tui\/handoff\.ts$/, ["hand-off"]],
  [/^src\/(core\/shell|tui\/shellrun)\.ts$/, ["shell"]],
  [/^src\/core\/tasks\.ts$/, ["tasks"]],
  [/^src\/core\/comments\.ts$/, ["comments"]],
  [/^src\/core\/data\.ts$/, ["data"]],
  // The command line's commands, and the agents' skill it installs: main.ts loads them with the TUI, which never calls
  // them.
  [/^src\/cli\/(agents|files|git|info|install|links|reading|render|search|servers|vaults|writing)\.ts$/, []],
  [/^(src\/core\/skill\.ts|skills\/slipbox\/SKILL\.md)$/, []],
];

/**
 * The samples changed most often, and what reads them; any other sample runs what names it, through the import
 * graph (the home the checks run in is built from `examples/home`: all of them).
 */
export const SAMPLES_FOR: Record<string, { tests: string[]; checks: string[] }> = {
  // The reference set's cases: every command's and every area's, held to the checks and the home. Its words could
  // turn up in a check's search of the home: main's run would say.
  "examples/home/CASES.md": { tests: ["tests/terminal-coverage.test.ts", "tests/home.test.ts"], checks: [] },
  // The kitchen-sink config: every key once, every command bound.
  "examples/home/work/infra/dotfiles/slipbox/config.toml": { tests: ["tests/home.test.ts"], checks: ["kitchen-sink"] },
};

/** The terminal checks' files, by name: `bun run test:terminal <name>` runs one's checks. */
const CHECK_FILE = /^tests\/terminal\/checks\/(?!index\.ts$)([\w-]+)\.ts$/;
/** Where the terminal checks start: the runner and its workers. */
const HARNESS = ["tests/terminal/run.ts", "tests/terminal/worker.ts"];
/** What every test and check depends on: the packages, the toolchain, the workflows. */
const EVERYTHING = /^(package\.json|bun\.lock|bunfig\.toml|tsconfig\.json|mise\.toml|mise\.lock|\.github\/)/;
/** What only the lint job reads, which runs on every change. */
const LINT = ["_typos.toml", ".markdownlint-cli2.jsonc", "biome.jsonc", ".editorconfig", ".git-blame-ignore-revs"];
/** What `bun test` loads before every test file (bunfig.toml). */
const PRELOAD = "tests/setup.ts";

/**
 * Each TypeScript file of src/, scripts/ and tests/ (less the tests' fixtures), and what it uses: the files it imports,
 * statically or not, code or not (a dictionary, the skill's text); a worker it starts (`workerUrl("…")`); a file or
 * folder it names by its path from the top (`join(ROOT, "examples", "home")`, `"..", "src", "main.ts"`).
 */
export function importGraph(root = ROOT): Map<string, string[]> {
  const code: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name !== "node_modules" && rel !== "tests/fixtures") walk(rel);
      } else if (/\.tsx?$/.test(e.name) && !e.name.endsWith(".d.ts")) code.push(rel);
    }
  };
  for (const dir of ["src", "scripts", "tests"]) if (existsSync(join(root, dir))) walk(dir);
  const known = new Set(code);
  const exists = (rel: string) => rel !== "" && rel !== "." && !rel.startsWith("..") && existsSync(join(root, rel));
  /** A relative import, as Bun resolves it: the file, or with `.ts`, or a folder's index. */
  const resolve = (from: string, spec: string): string | null => {
    const p = normalize(join(dirname(from), spec));
    for (const c of [p, `${p}.ts`, `${p}.tsx`, `${p}/index.ts`]) if (known.has(c) || (c === p && exists(c))) return c;
    return null;
  };
  const ts = new Bun.Transpiler({ loader: "ts" });
  const tsx = new Bun.Transpiler({ loader: "tsx" });
  const graph = new Map<string, string[]>();
  for (const file of code) {
    const text = readFileSync(join(root, file), "utf8").replace(/^#!.*/, "");
    const uses = new Set<string>();
    for (const i of (file.endsWith(".tsx") ? tsx : ts).scanImports(text)) {
      const r = i.path.startsWith(".") ? resolve(file, i.path) : null;
      if (r) uses.add(r);
    }
    for (const m of text.matchAll(/workerUrl\("([^"]+)"/g)) {
      const r = resolve(file, `./${m[1]}`);
      if (r) uses.add(r);
    }
    // A path in the repository: `join` or `resolve` from the file's folder (`import.meta.dir`) or a name for one —
    // `ROOT`, `TOP` and `REPO` the top, or one the file sets from these — and the strings that follow it. A temporary
    // folder's paths start elsewhere.
    const strings = (args: string) => [...args.matchAll(/"([^"]*)"/g)].map((p) => p[1] ?? "");
    const bases = new Map([...["ROOT", "TOP", "REPO"].map((n): [string, string] => [n, "."])]);
    for (const m of text.matchAll(
      /\bconst ([A-Z_]+) = (?:join|resolve)\((import\.meta\.dir|[A-Z_]+)((?:\s*,\s*"[^"]*")*)\)/g,
    )) {
      const from = m[2] === "import.meta.dir" ? dirname(file) : bases.get(m[2] ?? "");
      if (from !== undefined) bases.set(m[1] ?? "", normalize(join(from, ...strings(m[3] ?? ""))));
    }
    for (const m of text.matchAll(/\b(?:join|resolve)\((import\.meta\.dir|[A-Z_]+)((?:\s*,\s*"[^"]*")+)/g)) {
      const base = m[1] === "import.meta.dir" ? dirname(file) : bases.get(m[1] ?? "");
      const rel = base === undefined ? "" : normalize(join(base, ...strings(m[2] ?? "")));
      if (exists(rel)) uses.add(rel);
    }
    uses.delete(file);
    graph.set(file, [...uses]);
  }
  return graph;
}

/** Everything `from` uses, itself included, at any depth. */
export function reach(graph: Map<string, string[]>, from: string[]): Set<string> {
  const seen = new Set<string>();
  const todo = [...from];
  for (let f = todo.pop(); f !== undefined; f = todo.pop()) {
    if (seen.has(f)) continue;
    seen.add(f);
    todo.push(...(graph.get(f) ?? []));
  }
  return seen;
}

/** What a change runs: every test and check (`all`, and why), or the test files and the checks' filters it reaches. */
export type Scope = { all: string } | { all: null; tests: string[]; checks: string[] | "all"; why: string[] };

/** The tests `bun run test:docs` runs, which the lint job runs on every change: never among a change's. */
function docsTests(root: string): string[] {
  const file = join(root, "package.json");
  if (!existsSync(file)) return [];
  const { scripts } = JSON.parse(readFileSync(file, "utf8")) as { scripts?: Record<string, string> };
  return [...(scripts?.["test:docs"] ?? "").matchAll(/\.\/(tests\/\S+\.test\.ts)/g)].map((m) => m[1] ?? "");
}

/** What `files` (a change's, from the top) reach; `null` (a diff unread, a run of everything) runs everything. */
export function scope(files: string[] | null, graph = importGraph(), root = ROOT): Scope {
  if (files === null) return { all: "a push, a merge group, a run by hand, or a diff unread" };
  if (files.length === 0) return { all: "no file changed" };
  // Who uses each file: the graph turned round.
  const users = new Map<string, string[]>();
  for (const [f, uses] of graph) for (const u of uses) users.set(u, [...(users.get(u) ?? []), f]);
  const usedBy = (from: string[]) => reach(users, from);
  const app = reach(graph, ["src/main.ts"]);
  const harness = [...reach(graph, HARNESS)].filter((f) => !f.startsWith("src/") && !CHECK_FILE.test(f));
  const skipped = new Set(docsTests(root));

  const tests = new Set<string>();
  const checks = new Set<string>();
  let allChecks = false;
  const why: string[] = [];
  for (const f of files) {
    if (isDocs(f)) continue;
    if (EVERYTHING.test(f)) return { all: `${f}: the packages, the toolchain or the workflows` };
    if (LINT.includes(f)) continue;
    if (f === PRELOAD) return { all: `${f}: loaded before every test` };
    const sample = SAMPLES_FOR[f];
    if (sample) {
      for (const t of sample.tests) tests.add(t);
      for (const c of sample.checks) checks.add(c);
      why.push(`${f}: ${[...sample.tests, ...sample.checks].join(", ") || "nothing"}`);
      continue;
    }
    const snapshot = /^tests\/__snapshots__\/(.+)\.snap$/.exec(f);
    if (snapshot) {
      tests.add(`tests/${snapshot[1]}`);
      continue;
    }
    // The file, or a folder holding it, as something uses it.
    const nodes = [f, ...f.split("/").map((_, i, s) => s.slice(0, i).join("/"))].filter(
      (n) => n && (graph.has(n) || users.has(n)),
    );
    if (nodes.length === 0) {
      if (/\.tsx?$/.test(f) && !existsSync(join(root, f))) continue; // gone: whatever used it changed too
      return { all: `${f}: nothing names it` };
    }
    const reached = usedBy(nodes);
    for (const t of reached) if (t.endsWith(".test.ts") && !skipped.has(t)) tests.add(t);
    // The terminal checks: a check file's own; a file of the app's, its features'; the harness's, or a sample's, all.
    const own = CHECK_FILE.exec(f);
    if (own) {
      checks.add(own[1] ?? "");
      continue;
    }
    if (app.has(f)) {
      const named = CHECKS_FOR.filter(([re]) => re.test(f));
      if (named.length === 0) {
        allChecks = true;
        why.push(`${f}: every check (no feature of its own)`);
      } else for (const [, pieces] of named) for (const p of pieces) checks.add(p);
      continue;
    }
    if (harness.some((h) => reached.has(h))) {
      allChecks = true;
      why.push(`${f}: every check (the checks' harness, or their samples)`);
    }
  }
  return {
    all: null,
    tests: [...tests].filter((t) => existsSync(join(root, t))).sort(),
    checks: allChecks ? "all" : [...checks].sort(),
    why,
  };
}

/**
 * The package.json script, and its arguments, that runs a scope's tests or terminal checks: everything's, the change's
 * own, or none. The tests always through `bun run test`, which bounds each at 30 s.
 */
export function scriptFor(what: "test" | "terminal", s: Scope): string[] | null {
  if (what === "test") {
    if (s.all !== null) return ["test"];
    return s.tests.length ? ["test", ...s.tests.map((t) => `./${t}`)] : null;
  }
  if (s.all !== null || s.checks === "all") return ["test:terminal"];
  return s.checks.length ? ["test:terminal", ...s.checks] : null;
}

/**
 * A change's files. In CI: a pull request's merge commit against its base; a push's commits against the branch's head
 * before it (`SCOPE_BEFORE`, the event's `before`: none, or a branch just made, and it's everything). Here: the branch
 * against `base`'s fork point.
 */
export function changedFiles(root = ROOT, base = "origin/dev"): string[] | null {
  const git = (...args: string[]) => {
    const r = Bun.spawnSync(["git", "-C", root, ...args]);
    return r.exitCode === 0 ? r.stdout.toString().split("\n").filter(Boolean) : null;
  };
  const event = process.env.GITHUB_EVENT_NAME;
  if (event === "pull_request") return git("diff", "--name-only", "HEAD^1", "HEAD");
  if (event === "push") {
    const before = process.env.SCOPE_BEFORE ?? "";
    return /^[0-9a-f]{7,40}$/.test(before) && !/^0+$/.test(before) ? git("diff", "--name-only", before, "HEAD") : null;
  }
  if (event !== undefined) return null;
  const fork = git("merge-base", base, "HEAD")?.[0];
  if (!fork) return null;
  const changed = git("diff", "--name-only", fork);
  const added = git("ls-files", "--others", "--exclude-standard");
  return changed && added ? [...new Set([...changed, ...added])] : null;
}

/** What a scope runs, said in a line or two. */
function say(s: Scope, files: string[] | null): string {
  if (s.all !== null) return `everything runs: ${s.all}`;
  const checks = s.checks === "all" ? "every check" : s.checks.length ? s.checks.join(", ") : "none";
  return [
    `${files?.length} files changed`,
    `tests: ${s.tests.length ? s.tests.join(" ") : "none"}`,
    `terminal checks: ${checks}`,
    ...s.why.map((w) => `  ${w}`),
  ].join("\n");
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--base");
  const base = at >= 0 ? args.splice(at, 2)[1] : undefined;
  const [what, ...rest] = args;
  const here = process.cwd();
  const files = changedFiles(here, base);
  const docsOnly = files !== null && codeChanged(files) === null;
  const s: Scope = docsOnly ? { all: null, tests: [], checks: [], why: [] } : scope(files, importGraph(here), here);
  console.log(docsOnly ? `the docs only (${files?.length} files): the tests are skipped` : say(s, files));
  if (what === "test" || what === "terminal") {
    const cmd = scriptFor(what, s);
    if (!cmd) console.log(`no ${what === "test" ? "test" : "terminal check"} reaches this change`);
    else
      process.exit(
        Bun.spawnSync([process.execPath, "run", ...cmd, ...rest], { stdio: ["inherit", "inherit", "inherit"] })
          .exitCode,
      );
  } else {
    const out = process.env.GITHUB_OUTPUT;
    const checks = s.all !== null || s.checks === "all" || s.checks.length > 0;
    if (out) appendFileSync(out, `code=${docsOnly ? "false" : "true"}\nchecks=${checks}\n`);
  }
}
