// ORG-T1: capture before a mechanical move, compare after it using the PR's reviewed path manifest.
// This is a structural gate, not a substitute for typechecking or source/compiled worker execution.
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { importsOf } from "../check-boundary.ts";

export interface Snapshot {
  edges: string[];
  runtime: string[];
  tests: string[];
  entries: string[];
  unresolved: string[];
}

export interface Manifest {
  moves: Record<string, string>;
  /** Exact old-path text retained in a particular file, with a reviewable reason. */
  retained: { file: string; text: string; reason: string }[];
}

const codeFiles = (root: string, area: string) =>
  [...new Bun.Glob(`${area}/**/*.{ts,tsx}`).scanSync(root)]
    .filter((f) => !f.includes("/fixtures/") && !f.endsWith(".d.ts"))
    .sort();

/** Bun's relative source resolution, including explicit assets and directory indexes. */
export function resolveLocal(root: string, file: string, spec: string): string | null {
  const path = normalize(join(dirname(file), spec));
  if (path.startsWith("../") || path.startsWith("/")) return null;
  for (const candidate of [path, `${path}.ts`, `${path}.tsx`, `${path}/index.ts`, `${path}/index.tsx`]) {
    if (existsSync(join(root, candidate)) && statSync(join(root, candidate)).isFile()) return candidate;
  }
  return null;
}

export function capture(root: string): Snapshot {
  const edges = new Set<string>();
  const runtime = new Set<string>();
  const unresolved: string[] = [];
  for (const file of codeFiles(root, "src")) {
    const text = readFileSync(join(root, file), "utf8");
    const values = new Bun.Transpiler({ loader: file.endsWith(".tsx") ? "tsx" : "ts" })
      .scanImports(text.replace(/^#!.*/, ""))
      .map((i) => i.path);
    // Literal URL and worker references are checked as paths, as well as imports and type imports.
    const workerPaths = [...text.matchAll(/workerUrl\(\s*["']([^"']+)["']/g)].map((m) => m[1]!);
    const helperSpec = /import\s*\{[^}]*\bworkerUrl\b[^}]*\}\s*from\s*["']([^"']+)["']/.exec(text)?.[1];
    const helper = helperSpec ? resolveLocal(root, file, helperSpec) : null;
    const paths = [...text.matchAll(/new URL\(\s*["']([^"']+)["']/g)]
      .map((m) => m[1]!)
      .filter((p) => !/^[a-z]+:/i.test(p));
    for (const spec of new Set([...importsOf(text), ...values, ...paths, ...workerPaths])) {
      if (!spec.startsWith(".") && !paths.includes(spec) && !workerPaths.includes(spec)) continue;
      const target = workerPaths.includes(spec)
        ? helper && resolveLocal(root, helper, spec)
        : resolveLocal(root, file, spec);
      if (!target) unresolved.push(`${file}: ${spec}`);
      else {
        const edge = `${file} -> ${target}`;
        edges.add(edge);
        if (values.includes(spec)) runtime.add(edge);
      }
    }
  }
  // Preserve the multiset of literal suite/test declarations when splitting tests. Dynamic cases still need review.
  const tests = codeFiles(root, "tests")
    .flatMap((file) =>
      [
        ...readFileSync(join(root, file), "utf8").matchAll(
          /\b(test|it|describe)((?:\.(?:skip|todo|only))?)\(\s*(["'`])((?:\\.|(?!\3)[^\\])*)\3/g,
        ),
      ].map((m) => `${m[1]}${m[2]}: ${m[4]}`),
    )
    .sort();
  const build = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts.build as string;
  const entries = [...build.matchAll(/\bsrc\/[^\s]+\.tsx?\b/g)].map((m) => m[0]).sort();
  for (const entry of entries) {
    if (!existsSync(join(root, entry))) unresolved.push(`build entry: ${entry}`);
  }
  return { edges: [...edges].sort(), runtime: [...runtime].sort(), tests, entries, unresolved: unresolved.sort() };
}

/** Exact edge and test multisets: a lost dependency or test cannot hide behind unchanged counts. */
export function compare(before: Snapshot, after: Snapshot, manifest: Manifest): string[] {
  const failures = after.unresolved.map((p) => `unresolved: ${p}`);
  const moved = (path: string) => manifest.moves[path] ?? path;
  for (const key of ["edges", "runtime", "tests", "entries"] as const) {
    const expected = before[key]
      .map((item) =>
        key === "tests" ? item : key === "entries" ? moved(item) : item.split(" -> ").map(moved).join(" -> "),
      )
      .sort();
    const actual = [...after[key]].sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      const missing = expected.filter((v) => !actual.includes(v));
      const added = actual.filter((v) => !expected.includes(v));
      failures.push(
        `${key} changed (including multiplicity): missing ${JSON.stringify(missing)}, added ${JSON.stringify(added)}`,
      );
    }
  }
  return failures;
}

/** Search reviewed text files for old full paths and their extensionless forms; no broad folder exemptions. */
export function stalePaths(root: string, files: string[], manifest: Manifest): string[] {
  const failures: string[] = [];
  for (const [old, next] of Object.entries(manifest.moves)) {
    if (existsSync(join(root, old))) failures.push(`old path still exists: ${old}`);
    if (!existsSync(join(root, next))) failures.push(`new path missing: ${next}`);
    for (const file of files) {
      if (!existsSync(join(root, file)) || !statSync(join(root, file)).isFile()) continue;
      const text = readFileSync(join(root, file), "utf8");
      const needle = old.replace(/\.tsx?$/, "");
      if (
        text.includes(needle) &&
        !manifest.retained.some((r) => r.file === file && r.text === needle && r.reason.trim().length > 0)
      )
        failures.push(`${file}: stale ${needle}`);
    }
  }
  return failures;
}

if (import.meta.main) {
  const [mode, snapshotFile, manifestFile] = process.argv.slice(2);
  const root = process.cwd();
  if (!snapshotFile || !["capture", "check"].includes(mode ?? "") || (mode === "check" && !manifestFile)) {
    console.error(
      "usage: bun scripts/organization/migration.ts capture snapshot.json | check snapshot.json manifest.json",
    );
    process.exit(2);
  }
  const current = capture(root);
  if (mode === "capture") {
    if (current.unresolved.length) throw new Error(current.unresolved.join("\n"));
    if (existsSync(resolve(snapshotFile))) throw new Error("snapshot already exists; keep the pre-move evidence");
    writeFileSync(snapshotFile, `${JSON.stringify(current, null, 2)}\n`);
    console.log(`captured ${current.edges.length} edges, ${current.tests.length} test declarations`);
  } else {
    const manifest = JSON.parse(readFileSync(manifestFile!, "utf8")) as Manifest;
    const tracked = Bun.spawnSync(["git", "ls-files", "-z"], { cwd: root });
    if (tracked.exitCode !== 0) throw new Error(tracked.stderr.toString());
    const failures = [
      ...compare(JSON.parse(readFileSync(snapshotFile, "utf8")) as Snapshot, current, manifest),
      ...stalePaths(root, tracked.stdout.toString().split("\0").filter(Boolean), manifest),
    ];
    if (failures.length) {
      console.error(failures.join("\n"));
      process.exit(1);
    }
    console.log("migration check: resolved graph, build entries, test declarations and old paths agree");
  }
}
