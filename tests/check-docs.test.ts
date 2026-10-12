// The docs' check (scripts/check-docs.ts, greenrepo DOC-05), run on a repository of the test's own with the project's
// configs: a clean one passes; a misspelling, a broken link, a heading a link names that isn't there and a long line
// each fail it alone; it reads only what git tracks, and leaves out what's wrong on purpose. typos and lychee are the
// toolchain's (mise.toml), on PATH as for `bun run check`.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { LEFT_OUT, lycheePath } from "../scripts/check-docs.ts";

// Processes started, repositories made: slow on a loaded or small machine (CI's Intel Mac), not stuck.
setDefaultTimeout(30_000);

const TOP = join(import.meta.dir, "..");
const CONFIGS = [".markdownlint-cli2.jsonc", "_typos.toml"];

/** A repository of its own, the project's configs in it: `files` tracked, `untracked` not. */
function repo(files: Record<string, string | Uint8Array>, untracked: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "slipbox-docs-"));
  for (const c of CONFIGS) copyFileSync(join(TOP, c), join(root, c));
  for (const [rel, text] of Object.entries({ ...files, ...untracked })) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  const git = (...args: string[]) => Bun.spawnSync(["git", "-c", "init.defaultBranch=main", "-C", root, ...args]);
  git("init", "-q");
  expect(git("add", "--", ...CONFIGS, ...Object.keys(files)).exitCode).toBe(0);
  return root;
}

function check(root: string) {
  const r = Bun.spawnSync([process.execPath, join(TOP, "scripts", "check-docs.ts"), "--root", root]);
  return { code: r.exitCode, out: r.stdout.toString() + r.stderr.toString() };
}

const CLEAN = {
  "README.md": "# Notes\n\nRead [the guide](docs/guide.md#getting-started), and [back to the top](#notes).\n",
  "docs/guide.md": "# Guide\n\n## Getting started\n\nOpen a folder of notes.\n",
  "src/main.ts": 'export const greeting = "hello";\n',
};
const LONG = `${"word ".repeat(24)}end`; // 123 columns

// typos: off — misspelt on purpose, for the check to find.
describe("the docs' check (scripts/check-docs.ts)", () => {
  test("a clean repository passes, its Markdown and its code counted", () => {
    const r = check(repo(CLEAN));
    // Spelt: the three files and the two configs.
    expect(r.out).toContain("check-docs: 2 Markdown files linted, their links followed; 5 files spelt");
    expect(r.code).toBe(0);
  });

  // Each alone, in a repository otherwise clean: the finding named, by the tool that found it.
  test.each([
    ["a misspelling in the docs", { "docs/guide.md": "# Guide\n\n## Getting started\n\nWe recieve notes.\n" }, "typos"],
    ["a misspelling in the code", { "src/main.ts": "// Notes we recieve.\nexport const x = 1;\n" }, "typos"],
    ["a link to a file that isn't there", { "README.md": "# Notes\n\nRead [the guide](docs/gone.md).\n" }, "lychee"],
    [
      "a link to a heading that isn't there",
      { "README.md": "# Notes\n\nRead [it](docs/guide.md#nowhere).\n" },
      "lychee",
    ],
    ["a line past 120 columns", { "docs/guide.md": `# Guide\n\n## Getting started\n\n${LONG}\n` }, "markdownlint-cli2"],
    [
      "a code block's line past 120",
      { "docs/guide.md": `# Guide\n\n## Getting started\n\n\`\`\`text\n${LONG}\n\`\`\`\n` },
      "markdownlint-cli2",
    ],
  ])("%s fails it", (_, fault, tool) => {
    const r = check(repo({ ...CLEAN, ...fault }));
    expect(r.code).toBe(1);
    expect(r.out).toContain(`check-docs: ${tool} found something`);
    expect(r.out.match(/check-docs: \S+ found something/g)).toHaveLength(1);
  });

  test("the findings named: the word, the link, the line", () => {
    const r = check(
      repo({
        ...CLEAN,
        "README.md": "# Notes\n\nWe recieve [it](docs/guide.md#nowhere) and [that](docs/gone.md).\n",
        "docs/guide.md": `# Guide\n\n## Getting started\n\n${LONG}\n`,
      }),
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain("README.md:3:4: error: `recieve` should be `receive`");
    expect(r.out).toContain("docs/guide.md#nowhere");
    expect(r.out).toContain("docs/gone.md");
    expect(r.out).toContain("docs/guide.md:5:121 error MD013/line-length");
  });

  test("only what git tracks: a file it doesn't know, a binary one and a symlink aren't read", () => {
    const root = repo(
      { ...CLEAN, "docs/shot.png": new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, ...Buffer.from(" recieve ")]) },
      { "scratch.md": `# Scratch\n\nWe recieve [it](gone.md).\n\n${LONG}\n` },
    );
    Bun.spawnSync(["ln", "-s", "/nowhere/at/all.md", join(root, "docs", "link.md")]);
    Bun.spawnSync(["git", "-C", root, "add", "docs/link.md"]);
    const r = check(root);
    // As many as the clean repository's: the picture and the symlink, tracked, aren't among them.
    expect(r.out).toContain("2 Markdown files linted, their links followed; 5 files spelt");
    expect(r.code).toBe(0);
  });

  test("what's wrong on purpose is left out: the examples' sets, the tests' fixtures, licence texts, snapshots", () => {
    const wrong = `# Wrong\n\nWe recieve [it](gone.md).\n\n${LONG}\n`;
    const r = check(
      repo({
        ...CLEAN,
        "examples/home/notes/a.md": wrong,
        "examples/vault/b.md": wrong,
        "tests/fixtures/c.md": wrong,
        "notices/licenses/X.txt": "a declatory judgment\n",
        "tests/__snapshots__/x.test.ts.snap": "exports[`a`] = `anually`;\n",
      }),
    );
    expect(r.code).toBe(0);
    expect(Object.keys(LEFT_OUT).sort()).toEqual(["examples/home/", "examples/vault/", "tests/fixtures/"]);
    // Beside them, not in them: checked.
    expect(check(repo({ ...CLEAN, "examples/README.md": wrong })).code).toBe(1);
  });

  // markdownlint-cli2 and lychee read a path as a glob: `plan (v2).md` and `plan [x].md` matched nothing, silently.
  test("a file named like a glob is read like any other", () => {
    expect(lycheePath("docs/plan [x] *?.md")).toBe("docs/plan [[]x] [*][?].md");
    for (const name of ["docs/plan (v2).md", "docs/plan [x].md", "docs/a*b?.md"]) {
      const lint = check(repo({ ...CLEAN, [name]: `# Plan\n\n${LONG}\n` }));
      expect([name, lint.code, lint.out.includes(`${name}:3:121 error MD013`)]).toEqual([name, 1, true]);
      const link = check(repo({ ...CLEAN, [name]: "# Plan\n\n[gone](gone.md)\n" }));
      expect([name, link.code, link.out.includes("check-docs: lychee found something")]).toEqual([name, 1, true]);
    }
  });
});
// typos: on
