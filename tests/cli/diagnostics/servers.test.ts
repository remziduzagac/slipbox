import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Run, makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, vault, slipbox } = makeCliProcessSandbox();

describe("the vault and the tool", () => {
  test("doctor: each language's servers and where each is; a file's, in its project (19.7)", () => {
    const groups = slipbox(["doctor", "--json"]).json.data as {
      languages: string[];
      servers: { name: string; role: string; package: string | null; hint: string | null }[];
    }[];
    const ts = groups.find((g) => g.languages.includes("typescript"))!;
    expect(ts.languages).toEqual(["typescript", "tsx", "javascript", "jsx"]);
    expect(ts.servers.map((x) => [x.name, x.role])).toEqual([
      ["typescript", "main"],
      ["vtsls", "main"],
      ["eslint", "add-on"],
      ["biome", "add-on"],
    ]);
    expect(ts.servers[0]!.package).toBe("typescript@7.0.2");
    expect(groups.find((g) => g.languages.includes("rust"))!.servers[0]!.hint).toBe(
      "rustup component add rust-analyzer",
    );
    expect(slipbox(["doctor"]).out).toMatch(/^rust\n {2}rust-analyzer +/m);
    writeFileSync(join(vault, "tool.ts"), "export const x = 1;\n");
    const file = slipbox(["doctor", "tool.ts", "--json"]).json.data;
    expect(file).toMatchObject({ language: "typescript", languageId: "typescript" });
    expect(file.run[0].name).toBe("typescript");
    expect(slipbox(["doctor", "home.md"]).code).toBe(3); // a note: slipbox itself serves it
    // Linters without a server (19.19): a language's, and for a file whether its project asks for one.
    const yaml = groups.find((g) => g.languages.includes("yaml")) as unknown as {
      linters: { name: string; required: boolean; markers: string[] }[];
    };
    expect(yaml.linters).toMatchObject([
      { name: "yamllint", required: true, markers: [".yamllint", ".yamllint.yaml", ".yamllint.yml"] },
    ]);
    expect(slipbox(["doctor"]).out).toMatch(
      /^ {2}yamllint \(linter\) +.*\(where the project has \.yamllint or \.yamllint\.yaml…\)$/m,
    );
    mkdirSync(join(vault, "ops"), { recursive: true });
    writeFileSync(join(vault, "ops", "Dockerfile"), "FROM x\n");
    expect(slipbox(["doctor", "ops/Dockerfile", "--json"]).json.data.linters).toMatchObject([
      { name: "hadolint", root: null },
    ]);
    writeFileSync(join(vault, "ops", ".hadolint.yaml"), "ignored: []\n");
    expect(slipbox(["doctor", "ops/Dockerfile", "--json"]).json.data.linters).toMatchObject([
      { name: "hadolint", root: join(vault, "ops") },
    ]);
    expect(slipbox(["doctor", "ops/Dockerfile"]).out).toMatch(/hadolint \(linter\) .*\(runs in .*ops\)/);
  });
  test("diagnostics: a server still at its work when it first answers (rust-analyzer loading) is waited for until it says it's done", () => {
    const dir = join(sandbox, "diag-loading");
    mkdirSync(join(dir, ".git"), { recursive: true });
    const launcher = join(dir, "fake-ls");
    writeFileSync(
      launcher,
      `#!/usr/bin/env node\nawait import(${JSON.stringify(join(import.meta.dir, "../../fixtures", "fake-lsp.ts"))});\n`,
    );
    chmodSync(launcher, 0o755);
    const cfg = join(dir, "config.toml");
    writeFileSync(
      cfg,
      `[language-server.fake]\ncommand = ${JSON.stringify(launcher)}\nargs = ["--stdio"]\nenvironment = { FAKE_PULL = "1" }\n\n[[language]]\nname = "fake"\nfile-types = ["fk"]\nlanguage-servers = ["fake"]\n`,
    );
    // Asked at once, it has nothing; its loading, begun at once, ends after more than a pause in what it says.
    writeFileSync(join(dir, "a.fk"), "LOADING\nBAD here\n");
    const r = slipbox(["diagnostics", "a.fk", "--config", cfg, "--json"], { cwd: dir });
    expect(r.json.data.problems.map((p: { line: number }) => p.line)).toEqual([2]);
  });

  test("diagnostics: a file's problems from its servers (waited for) and linters; a note's links and lint; exit 1 on an error (19.22)", () => {
    const dir = join(sandbox, "diag");
    mkdirSync(join(dir, ".git"), { recursive: true });
    const launcher = join(dir, "fake-ls");
    writeFileSync(
      launcher,
      `#!/usr/bin/env node\nawait import(${JSON.stringify(join(import.meta.dir, "../../fixtures", "fake-lsp.ts"))});\n`,
    );
    chmodSync(launcher, 0o755);
    const cfg = join(dir, "config.toml");
    writeFileSync(
      cfg,
      [
        `[language-server.fake]\ncommand = ${JSON.stringify(launcher)}\nargs = ["--stdio"]\n`,
        `[linter.todo]\nlint-command = "grep -n TODO | sed 's/^\\\\([0-9]*\\\\):.*/stdin:\\\\1:1: [error] a TODO/'; exit 1"\nlint-formats = ["%f:%l:%c: [%trror] %m"]\n`,
        `[[language]]\nname = "fake"\nfile-types = ["fk"]\nlanguage-servers = ["fake"]\nlinters = ["todo"]\n`,
        `[lint]\nenabled = "on"\ncommand = ["sh", "-c", "for f; do printf '%s:2 error MD041/first-line-heading First line\\\\n' \\"$f\\"; done; exit 1", "lint"]\n`,
      ].join("\n"),
    );
    writeFileSync(join(dir, "a.fk"), "fine\nBAD here\nTODO later\n");
    const r = slipbox(["diagnostics", "a.fk", "--config", cfg, "--json"], { cwd: dir });
    expect(r.code).toBe(1); // the linter's error
    expect(r.json.ok).toBe(true); // it ran: the exit says what it found
    expect(
      r.json.data.problems.map((p: { line: number; severity: string; source: string; message: string }) => [
        p.line,
        p.severity,
        p.source,
        p.message.split(",")[0],
      ]),
    ).toEqual([
      [2, "warning", "fake", "bad"],
      [3, "error", "todo", "a TODO"],
    ]);
    expect(r.json.data.sources).toEqual([
      { name: "fake", kind: "server", status: "answered" },
      { name: "todo", kind: "linter", status: "ran" },
    ]);
    expect(slipbox(["diagnostics", "a.fk", "--config", cfg], { cwd: dir }).out).toMatch(
      /^a\.fk:2:1: warning fake: bad.*\na\.fk:3:1: error todo: a TODO\n$/,
    );
    // The least severity shown; a clean file is exit 0, nothing printed.
    expect(
      slipbox(["diagnostics", "a.fk", "--config", cfg, "--severity", "error", "--json"], { cwd: dir }).json.data
        .problems,
    ).toHaveLength(1);
    writeFileSync(join(dir, "b.fk"), "fine\n");
    expect(slipbox(["diagnostics", "b.fk", "--config", cfg], { cwd: dir })).toMatchObject({ code: 0, out: "" });
    expect(slipbox(["diagnostics", "a.fk", "--severity", "bad"], { cwd: dir }).code).toBe(2);
    expect(slipbox(["diagnostics", "nope.fk"], { cwd: dir }).code).toBe(3);
    // A vault note: its links, and the lint surface's findings.
    writeFileSync(join(vault, "diag-note.md"), "# Diag\n\nSee [the note](no-such-note-anywhere.md).\n");
    const n = slipbox(["diagnostics", "diag-note.md", "--config", cfg, "--severity", "info", "--json"]);
    expect(n.json.data.problems.map((p: { line: number; source: string }) => [p.line, p.source])).toEqual([
      [2, "markdownlint"],
      [3, "slipbox"],
    ]);
    expect(n.code).toBe(0); // warnings: no error among them
  });
  test("problems --lint: your linter's findings on every note (3.21); a vault's config never picks the linter", () => {
    const cfg = join(sandbox, "lint.toml");
    const fake = `for f; do case "$f" in *home.md) printf '%s:4:2 error MD013/line-length Line length\\n' "$f";; esac; done; exit 1`;
    writeFileSync(cfg, `[lint]\nenabled = "on"\ncommand = ["sh", "-c", ${JSON.stringify(fake)}, "lint"]\n`);
    const r = slipbox(["problems", "--lint", "--json", "--config", cfg]).json;
    expect(r.data.lint).toEqual([
      { file: "home.md", line: 4, column: 2, rule: "MD013", name: "line-length", description: "Line length" },
    ]);
    expect(slipbox(["problems", "--lint", "--config", cfg]).out).toContain(
      "lint (1)\n  home.md:4:2  MD013 line-length  Line length\n",
    );
    expect(slipbox(["problems", "--json", "--config", cfg]).json.data.lint).toBeUndefined(); // only when asked
    writeFileSync(cfg, `[lint]\nenabled = "on"\ncommand = ["no-such-linter-slipbox-test"]\n`);
    expect(slipbox(["problems", "--lint", "--json", "--config", cfg]).json.warnings).toContain(
      "lint: [lint] command couldn't run",
    );
    // Its output past 16 MiB: no findings, since some would be missing, and why — not that it couldn't run.
    const flood = `yes x | head -c 17000000; ${fake}`;
    writeFileSync(cfg, `[lint]\nenabled = "on"\ncommand = ["sh", "-c", ${JSON.stringify(flood)}, "lint"]\n`);
    const over = slipbox(["problems", "--lint", "--json", "--config", cfg]).json;
    expect(over.data.lint).toBeUndefined();
    expect(over.warnings).toContain(
      "lint: stdout output limit (16 MiB) exceeded; partial output discarded — its findings aren't shown",
    );
    writeFileSync(cfg, `[lint]\nenabled = "off"\n`);
    expect(slipbox(["problems", "--lint", "--json", "--config", cfg]).json.warnings).toContain(
      'lint is off: [lint] enabled = "off"',
    );
    // A vault's committed config can't name the program: its [lint] command is dropped, said so.
    mkdirSync(join(vault, ".slipbox"), { recursive: true });
    writeFileSync(
      join(vault, ".slipbox", "config.toml"),
      '[lint]\nenabled = "on"\ncommand = ["touch", "/tmp/slipbox-evil-lint"]\n',
    );
    writeFileSync(cfg, "");
    const v = slipbox(["problems", "--json", "--config", cfg]).json;
    expect(v.warnings.some((w: string) => w.includes("lint.command") && w.includes("only your own config"))).toBe(true);
    rmSync(join(vault, ".slipbox", "config.toml"));
    rmSync(cfg);
  });
});

describe("review cycle 6 (cli)", () => {
  /** A folder of its own and a state only it knows: what one test names, no other sees. */
  function own(prefix: string): { dir: string; env: Record<string, string> } {
    const dir = mkdtempSync(join(sandbox, prefix));
    return {
      dir,
      env: { XDG_STATE_HOME: join(dir, "state"), XDG_CACHE_HOME: join(dir, "cache"), XDG_DATA_HOME: join(dir, "data") },
    };
  }
  test("review cycle 2: diagnostics takes the root from its file — from above it, by --root, nested, hidden", () => {
    const { dir, env } = own("diag-root-");
    // Neither servers nor the lint surface: slipbox's own checks only.
    const cfg = join(dir, "quiet.toml");
    writeFileSync(cfg, '[lsp]\nenabled = false\n\n[lint]\nenabled = "off"\n');
    const root = join(dir, "root");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    mkdirSync(join(root, "nest", ".slipbox"), { recursive: true });
    mkdirSync(join(root, ".hidden"));
    writeFileSync(join(root, "d.md"), "[b](sub/nothere.md)\n");
    writeFileSync(join(root, "nest", "n.md"), "[c](gone.md)\n");
    writeFileSync(join(root, ".hidden", "h.md"), "[e](elsewhere.md)\n");
    const run = (args: string[], cwd: string) =>
      slipbox(["diagnostics", ...args, "--severity", "hint", "--config", cfg, "--json"], { cwd, env });
    const said = (r: Run, target: string) => {
      expect(r.code).toBe(0);
      expect(r.json.data.sources).toContainEqual({ name: "slipbox", kind: "slipbox", status: "ran" });
      expect(
        r.json.data.problems.some(
          (p: { source: string; message: string }) => p.source === "slipbox" && p.message.includes(target),
        ),
      ).toBe(true);
    };
    said(run(["root/d.md"], dir), "sub/nothere.md");
    said(run(["d.md", "--root", "root"], dir), "sub/nothere.md");
    said(run(["nest/n.md"], root), "gone.md");
    said(run([".hidden/h.md"], root), "elsewhere.md");
  });
  test("review cycle 3: diagnostics runs slipbox's checks on a root note whose name starts with ..", () => {
    const { dir, env } = own("diag-dots-");
    const cfg = join(dir, "quiet.toml");
    writeFileSync(cfg, '[lsp]\nenabled = false\n\n[lint]\nenabled = "off"\n');
    const root = join(dir, "root");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    writeFileSync(join(root, "..draft.md"), "[x](missing.md)\n");
    const r = slipbox(["diagnostics", "..draft.md", "--severity", "hint", "--config", cfg, "--json"], {
      cwd: root,
      env,
    });
    expect(r.code).toBe(0);
    expect(r.json.data.sources).toContainEqual({ name: "slipbox", kind: "slipbox", status: "ran" });
    expect(
      r.json.data.problems.some(
        (p: { source: string; message: string }) => p.source === "slipbox" && p.message.includes("missing.md"),
      ),
    ).toBe(true);
  });
});

describe("the CLI's edges: help flags, error paths, empty states", () => {
  /** A root of its own, with a state, cache and config only it knows. */
  function fresh(prefix: string): { root: string; dir: string; env: Record<string, string> } {
    const dir = mkdtempSync(join(sandbox, prefix));
    const root = join(dir, "root");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    const env = {
      XDG_STATE_HOME: join(dir, "state"),
      XDG_CACHE_HOME: join(dir, "cache"),
      XDG_DATA_HOME: join(dir, "data"),
      XDG_CONFIG_HOME: join(dir, "config"),
      SLIPBOX_CONFIG: join(dir, "config", "slipbox", "config.toml"),
    };
    return { root, dir, env };
  }
  test("doctor in a root you don't trust (23.8): what it leaves out, said; in one your config trusts, nothing to say", () => {
    const { root, dir, env } = fresh("doctor-trust-");
    writeFileSync(join(root, "Gemfile"), "source 'https://rubygems.org'\n");
    writeFileSync(join(root, "app.rb"), "puts 1\n");
    const j = slipbox(["doctor", "app.rb", "--json"], { cwd: root, env }).json;
    expect(j.data).toMatchObject({
      trusted: false,
      skipped: [{ name: "ruby-lsp", why: "it runs the project's Gemfile (Bundler)" }],
    });
    expect(
      j.warnings.some(
        (w: string) =>
          w.includes("isn't a vault you trust") &&
          w.includes("ruby-lsp not run (it runs the project's Gemfile (Bundler))"),
      ),
    ).toBe(true);
    const human = slipbox(["doctor", "app.rb"], { cwd: root, env });
    expect(human.out).toContain(`  ${"ruby-lsp".padEnd(28)} not run here: it runs the project's Gemfile (Bundler)\n`);
    // Trusted in your config: run as anywhere, nothing said.
    const cfg = join(dir, "trusting.toml");
    writeFileSync(cfg, `[trust]\nroots = [${JSON.stringify(root)}]\n`);
    const t = slipbox(["doctor", "app.rb", "--config", cfg, "--json"], { cwd: root, env }).json;
    expect(t.data).toMatchObject({ trusted: true, skipped: [], limits: [] });
    expect(t.warnings.filter((w: string) => w.includes("isn't a vault you trust"))).toEqual([]);
  });

  test("doctor: language servers off is a warning; with installing off, a server not found says so, never 'installs when needed'", () => {
    const { root, dir, env } = fresh("doctor-off-");
    const cfg = join(dir, "off.toml");
    writeFileSync(cfg, "[lsp]\nenabled = false\nauto_install = false\n");
    const j = slipbox(["doctor", "--config", cfg, "--json"], { cwd: root, env }).json;
    expect(j.warnings).toContain("language servers are off: [lsp] enabled = false");
    type Server = { name: string; status: string; package: string | null };
    const servers = (j.data as { servers: Server[] }[]).flatMap((g) => g.servers);
    expect(servers.some((s) => s.status === "installable")).toBe(false);
    const off = servers.filter((s) => s.status !== "found" && s.package);
    expect(off.length).toBeGreaterThan(0);
    const r = slipbox(["doctor", "--config", cfg], { cwd: root, env });
    expect(r.err).toContain("slipbox: warning: language servers are off: [lsp] enabled = false\n");
    expect(r.out).not.toContain("slipbox installs");
    for (const s of off)
      expect(r.out).toContain(
        `  ${s.name.padEnd(28)} not found, and installing is off ([lsp] auto_install): ${s.package}`,
      );
    // On, nothing to warn of here but the root's trust (said for every root you don't trust, 23.8).
    expect(
      slipbox(["doctor", "--json"], { cwd: root, env }).json.warnings.filter(
        (w: string) => !w.includes("isn't a vault you trust"),
      ),
    ).toEqual([]);
  });
});
