// The reference sample set's build (scripts/build-home.ts): histories replayed with git, files that
// can't be committed made, the committed folder checked against main's last commit.

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parse } from "smol-toml";
import { BuildError, buildHome, SOURCE } from "../scripts/build-home.ts";
import { COMMAND_SPECS } from "../src/core/command-specs.ts";
import { parseData } from "../src/core/data.ts";
import { classify } from "../src/core/filetypes.ts";

const hasGit = spawnSync("git", ["--version"]).status === 0;

/** A source set: `home/` with one repository and its history, and a halden beside it. */
function source(history: string, files: Record<string, string>, extras = "") {
  const base = mkdtempSync(join(tmpdir(), "slipbox-homesrc-"));
  const home = join(base, "home");
  const put = (rel: string, text: string) => {
    mkdirSync(dirname(join(home, rel)), { recursive: true });
    writeFileSync(join(home, rel), text);
  };
  for (const [rel, text] of Object.entries(files)) put(rel, text);
  if (history) put(".build/app.toml", history);
  if (extras) put(".build/extras.toml", extras);
  const halden = join(base, "halden");
  mkdirSync(join(halden, ".slipbox"), { recursive: true });
  writeFileSync(join(halden, "home.md"), "# Halden\n");
  return { home, halden, out: join(base, "built") };
}
const git = (cwd: string, ...args: string[]) => spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).stdout.trim();

const HISTORY = `remote = "git@github.com:kestrel-labs/app.git"

[[commit]]
date = "2026-08-17T10:00:00+02:00"
author = "Sam Rivera <sam@kestrel.dev>"
message = "Start"
add = ["README.md"]
write = { "docs/routing.md" = "# Routing\\n\\nHow a route is planned: the graph, the costs, the search.\\n\\nFirst draft.\\n" }

[[commit]]
branch = "feature/routing-docs"
date = "2026-08-20T11:00:00+02:00"
author = "Aiko Tanaka <aiko@kestrel.dev>"
message = "Move the routing doc"
rename = { "docs/routing.md" = "docs/routing/overview.md" }
add = ["docs/routing/overview.md"]

[[commit]]
branch = "main"
date = "2026-08-21T09:00:00+02:00"
author = "Priya Nair <priya@kestrel.dev>"
message = "Merge branch 'feature/routing-docs'"
merge = "feature/routing-docs"

[[commit]]
branch = "agent/sync-retry"
date = "2026-08-22T09:00:00+02:00"
message = "Retry the sync queue"
write = { "docs/sync.md" = "# Sync\\n" }

[[worktree]]
branch = "agent/sync-retry"
path = "../app-agent"
`;

describe("the reference set's build (scripts/build-home.ts)", () => {
  test("a history replayed: commits, a branch's rename, a merge, a worktree; main ends at the committed folder", () => {
    if (!hasGit) return;
    const s = source(HISTORY, { "work/app/README.md": "# App\n", "work/app/docs/routing/overview.md": "# Routing\n\nHow a route is planned: the graph, the costs, the search.\n\nNow in its own folder.\n", "work/app/.env": "TOKEN=local\n", "notes/a.md": "# A\n" });
    const r = buildHome(s.out, s.home, s.halden);
    expect(r.repos.app).toEqual({ commits: 4, untracked: [".env"] });
    const repo = join(r.home, "work", "app");
    expect(git(repo, "branch", "--show-current")).toBe("main");
    expect(git(repo, "log", "--format=%an|%s|%aI", "main").split("\n")).toEqual([
      "Priya Nair|Merge branch 'feature/routing-docs'|2026-08-21T09:00:00+02:00",
      "Aiko Tanaka|Move the routing doc|2026-08-20T11:00:00+02:00",
      "Sam Rivera|Start|2026-08-17T10:00:00+02:00",
    ]);
    expect(git(repo, "diff", "--name-status", "-M", "HEAD^1", "HEAD")).toMatch(/^R\d+\tdocs\/routing.md\tdocs\/routing\/overview.md$/m);
    expect(git(repo, "remote", "get-url", "origin")).toBe("git@github.com:kestrel-labs/app.git");
    expect(readFileSync(join(repo, ".env"), "utf8")).toBe("TOKEN=local\n"); // untracked, as a local file is
    expect(existsSync(join(r.home, "work", "app-agent", "docs", "sync.md"))).toBe(true); // the worktree
    // The rest copied as is, .build left out; halden beside home.
    expect(readFileSync(join(r.home, "notes", "a.md"), "utf8")).toBe("# A\n");
    expect(existsSync(join(r.home, ".build"))).toBe(false);
    expect(readFileSync(join(r.vault, "home.md"), "utf8")).toBe("# Halden\n");
  });

  test("main's last commit must be the committed folder: a difference is an error", () => {
    if (!hasGit) return;
    // The branch moves the doc but never gives it its final text: main ends with the draft.
    const s = source(HISTORY.replace('add = ["docs/routing/overview.md"]\n', ""), { "work/app/README.md": "# App\n", "work/app/docs/routing/overview.md": "# Routing\n\nNow in its own folder.\n" });
    expect(() => buildHome(s.out, s.home, s.halden)).toThrow(BuildError);
    expect(() => buildHome(join(s.out, "again"), s.home, s.halden)).toThrow("differs from the committed folder in docs/routing/overview.md");
  });

  test("a history that adds a file the folder hasn't, or renames one that isn't there: said, with the commit", () => {
    if (!hasGit) return;
    const missing = source('[[commit]]\nmessage = "Start"\nadd = ["nope.md"]\n', { "work/app/README.md": "# App\n" });
    expect(() => buildHome(missing.out, missing.home, missing.halden)).toThrow('nope.md: added by "Start"');
    const gone = source('[[commit]]\nmessage = "Move"\nrename = { "a.md" = "b.md" }\n', { "work/app/README.md": "# App\n" });
    expect(() => buildHome(gone.out, gone.home, gone.halden)).toThrow('a.md: renamed by "Move", but not there');
  });

  test("files that can't be committed: a hostile name, a symlink, one too big, one unreadable", () => {
    const extras = `[[file]]
path = "Downloads/invoice\\u202Efdp.md"
content = "# Invoice\\n"

[[file]]
path = "notes/current.md"
kind = "symlink"
target = "a.md"

[[file]]
path = "notes/big.md"
kind = "big"
size = 5000000

[[file]]
path = "notes/locked.md"
kind = "unreadable"
`;
    const s = source("", { "notes/a.md": "# A\n" }, extras);
    const r = buildHome(s.out, s.home, s.halden);
    expect(r.extras).toEqual(["Downloads/invoice‮fdp.md", "notes/current.md", "notes/big.md", "notes/locked.md"]);
    expect(readFileSync(join(r.home, "Downloads", "invoice‮fdp.md"), "utf8")).toBe("# Invoice\n");
    expect(lstatSync(join(r.home, "notes", "current.md")).isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(r.home, "notes", "current.md"))).toBe("a.md");
    expect(statSync(join(r.home, "notes", "big.md")).size).toBeGreaterThan(5000000);
    expect(statSync(join(r.home, "notes", "locked.md")).mode & 0o777).toBe(0);
  });

  test("a folder that already holds a build is refused", () => {
    const s = source("", { "notes/a.md": "# A\n" });
    buildHome(s.out, s.home, s.halden);
    expect(() => buildHome(s.out, s.home, s.halden)).toThrow("already holds home/ or vault/");
  });
});

describe("the reference set is complete (examples/home)", () => {
  /** Every file of the set as committed (`.build/` aside), `/`-separated, relative to it. */
  const all = (dir: string, base = dir): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const abs = join(dir, e.name);
      const rel = abs.slice(base.length + 1);
      if (rel === ".build") return [];
      return e.isDirectory() ? [`${rel}/`, ...all(abs, base)] : [rel];
    });
  const files = all(SOURCE);
  const build = join(SOURCE, ".build");
  /** What the build makes: the extras, and every file a history writes or renames to. */
  const made = new Set<string>();
  for (const name of readdirSync(build).filter((n) => n.endsWith(".toml"))) {
    const t = parse(readFileSync(join(build, name), "utf8")) as { file?: { path: string }[]; commit?: { write?: Record<string, string>; rename?: Record<string, string> }[] };
    for (const f of t.file ?? []) made.add(f.path);
    const repo = `work/${name.replace(/\.toml$/, "")}`;
    for (const c of t.commit ?? []) for (const p of [...Object.keys(c.write ?? {}), ...Object.values(c.rename ?? {})]) made.add(`${repo}/${p}`);
  }
  const there = (p: string) => p.startsWith(".build/") || made.has(p) || made.has(p.replace(/\/$/, "")) || existsSync(join(SOURCE, p));
  const cases = readFileSync(join(SOURCE, "CASES.md"), "utf8");
  /** Each case of CASES.md: its bullet, joined, and the files after its last " — ". */
  const bullets = cases
    .split(/\n(?=- )/)
    .filter((b) => b.startsWith("- "))
    .map((b) => b.replace(/\n {2}/g, " ").split("\n")[0]!);
  /** A case's files: the backticked paths after its last " — `", each under one of the set's folders. */
  const filesOf = (b: string) =>
    [...b.slice(b.lastIndexOf(" — `") + 3).matchAll(/`([^`]+)`/g)].map((m) => m[1]!).filter((p) => /^(notes|work|hobbies|Downloads|\.build)\/|^(README|CASES)\.md$/.test(p));

  test("every file CASES.md names is there, or made by the build; every case names one", () => {
    expect(bullets.length).toBeGreaterThan(700);
    const missing = bullets.flatMap((b) => filesOf(b).filter((p) => !there(p)).map((p) => `${p} (for: ${b.slice(2, 60)}…)`));
    expect(missing).toEqual([]);
    expect(bullets.filter((b) => filesOf(b).length === 0).map((b) => b.slice(0, 80))).toEqual([]);
  });

  test("every command has a case", () => {
    const named = COMMAND_SPECS.map((c) => c.id).filter((id) => !cases.includes(`\`${id}\``));
    expect(named).toEqual([]);
  });

  test("a command's case calls it by its title as the palette shows it", () => {
    const stale = COMMAND_SPECS.flatMap((c) => {
      const m = new RegExp(`^- \`${c.id.replace(/\./g, "\\.")}\` — (.+?) — \``, "m").exec(cases);
      return m && m[1] !== c.title ? [`${c.id}: "${m[1]}", now "${c.title}"`] : [];
    });
    expect(stale).toEqual([]);
  });

  test("the team's kitchen-sink config says every key once, none unknown or retired", async () => {
    const { loadConfig } = await import("../src/core/config.ts");
    expect(loadConfig({ configFile: join(SOURCE, "work/infra/dotfiles/slipbox/config.toml") }).warnings).toEqual([]);
  });

  test("the kitchen-sink config has every key of slipbox's defaults, the free-form tables aside", async () => {
    const { DEFAULT_CONFIG } = await import("../src/core/config.ts");
    const file = parse(readFileSync(join(SOURCE, "work/infra/dotfiles/slipbox/config.toml"), "utf8")) as Record<string, unknown>;
    const freeForm = new Set(["colors", "keys", "aliases", "groups", "language-server", "language", "linter"]);
    const missing = Object.entries(DEFAULT_CONFIG as unknown as Record<string, unknown>).flatMap(([section, value]) => {
      if (freeForm.has(section)) return [];
      if (!(section in file)) return [section];
      if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
      const had = file[section] as Record<string, unknown>;
      return Object.keys(value).flatMap((k) => (k in had ? [] : [`${section}.${k}`]));
    });
    expect(missing).toEqual([]);
  });

  test("the kitchen-sink config binds every command id under `leader ;`, none unknown", () => {
    const keys = (parse(readFileSync(join(SOURCE, "work/infra/dotfiles/slipbox/config.toml"), "utf8")) as { keys: Record<string, unknown> }).keys;
    const bound = Object.entries(keys).flatMap(([k, v]) => (k.startsWith("leader ; ") && typeof v === "string" ? [v] : []));
    expect([...new Set(bound)].sort()).toEqual(COMMAND_SPECS.map((c) => c.id).sort());
  });

  test("every grammar, data format and highlighted language has files: more than one where it can", async () => {
    const { GRAMMARS, grammarFor } = await import("../src/core/syntax.ts");
    const { DATA_FORMATS, LANGUAGES, NAMED, classify, extensionOf } = await import("../src/core/filetypes.ts");
    const kinds = files.filter((f) => !f.endsWith("/")).map((f) => ({ f, ext: extensionOf(f), kind: classify(f, ["md", "markdown"]) }));
    const grammars = new Map<string, number>();
    for (const k of kinds) {
      const g = grammarFor(k.kind.format, k.ext);
      if (g) grammars.set(g, (grammars.get(g) ?? 0) + 1);
    }
    expect(GRAMMARS.filter((g) => (grammars.get(g) ?? 0) < 2)).toEqual([]);
    const exts = new Set(kinds.map((k) => k.ext));
    expect(Object.keys(DATA_FORMATS).filter((e) => !exts.has(e))).toEqual([]);
    expect(Object.keys(LANGUAGES).filter((e) => !exts.has(e))).toEqual([]);
    // Committed, or made by the build: a .env can't be committed here (this repository ignores it).
    const names = new Set([...files, ...made].map((f) => f.split("/").pop()!.toLowerCase()));
    expect(Object.keys(NAMED).filter((n) => !names.has(n))).toEqual([]);
  });

  test("every kind of root: a repository (with a history), .slipbox/, .obsidian/, .zk/, and a folder with none", () => {
    for (const repo of ["kestrel", "product", "infra"]) expect(existsSync(join(build, `${repo}.toml`))).toBe(true);
    for (const marker of ["notes/.slipbox/", "hobbies/photography/.slipbox/", "hobbies/cooking/.obsidian/", "hobbies/cycling/.zk/"]) expect(files).toContain(marker);
    // The casual folder holds no marker of its own (one inside it, an exported vault, is a root nested in it).
    expect(files.filter((f) => /^Downloads\/\.(slipbox|obsidian|zk|git)\b/.test(f))).toEqual([]);
  });
});

describe("the reference set's data files read as they mean to", () => {
  // The ones that don't parse, on purpose, and what each is told (a reader that starts failing a
  // realistic file, or stops failing a broken one, shows here).
  const BROKEN: Record<string, string> = {
    "work/infra/config/broken.ini": "line 7: neither a section, a key nor a comment",
    "work/infra/config/broken/bad-date.toml": "invalid date",
    "work/infra/config/broken/duplicate-key.toml": "redefine",
    "work/infra/config/broken/unclosed-string.toml": "unfinished string",
    "work/infra/config/local/empty.json": "Unexpected EOF",
    "work/infra/config/nginx.conf": "line 2: neither a section, a key nor a comment",
    "work/infra/dotfiles/slipbox/typo.toml": "invalid value",
    "work/infra/k8s/broken-ingress.yaml": "line 27:",
    "work/infra/k8s/tabs.yaml": "Tabs are not allowed",
    "work/kestrel/api/settings.json5": "Expected '}'", // JSON5's unquoted keys: read as JSON
    "work/kestrel/config/legacy-flags.json": "Single quotes",
    "work/kestrel/data/import-2026-09.csv": "a quoted field never closes",
  };
  const data = (readdirSync(SOURCE, { recursive: true }) as string[])
    .filter((f) => !f.startsWith(".build") && lstatSync(join(SOURCE, f)).isFile() && classify(f.split("/").pop()!, ["md"]).group === "data")
    .sort();
  test("there are plenty", () => expect(data.length).toBeGreaterThan(60));
  test("each parses, or fails as it means to", () => {
    const got: Record<string, string> = {};
    for (const f of data) {
      const r = parseData(classify(f.split("/").pop()!, ["md"]).format, readFileSync(join(SOURCE, f), "utf8"));
      if (r.error) got[f] = r.error;
    }
    expect(Object.keys(got).sort()).toEqual(Object.keys(BROKEN).sort());
    for (const [f, error] of Object.entries(BROKEN)) expect(got[f]).toContain(error);
  });
});

describe("the reference set is as written, never opened in place", () => {
  // Opened inside this repository, slipbox gives an unnamed .slipbox/ an id and a name — the
  // repository's own (slipbox-kestrel): the set's folders would carry this machine's identity.
  test("no .slipbox/ config was given an identity by an open", () => {
    const configs = (readdirSync(SOURCE, { recursive: true }) as string[]).filter((f) => f.endsWith(".slipbox/config.toml"));
    expect(configs.length).toBeGreaterThan(4);
    for (const f of configs) expect(`${f}: ${readFileSync(join(SOURCE, f), "utf8")}`).not.toMatch(/^name = "slipbox-/m);
  });
});
