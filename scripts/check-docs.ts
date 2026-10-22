#!/usr/bin/env bun
// The docs checked (greenrepo DOC-05, its Markdown profile), run by `bun run check:docs`:
//
//   - markdownlint-cli2 lints the Markdown by .markdownlint-cli2.jsonc: 120 columns, tables and code included;
//   - typos spells the code and the docs alike by _typos.toml: the project's own words, and what it can't judge;
//   - lychee follows the links between files, and into their headings, offline. The web's links are the weekly health
//     check's: they break with nothing changed here.
//
// Over the files git tracks, the text ones, less what is wrong on purpose (LEFT_OUT): a file the working tree holds and
// git doesn't isn't the project's. Any finding fails the check, after all three have said theirs. typos and lychee are
// the toolchain's, pinned in mise.toml; markdownlint-cli2 is a dev dependency, run by Bun.
//
// `--root <dir>` checks another repository's tracked files by that root's own configs: the tests run it on theirs.

import { resolve } from "node:path";

/** Left out of all three, each for its reason: files wrong on purpose. */
export const LEFT_OUT: Record<string, string> = {
  "examples/home/":
    "the reference set: notes as people write them, for every feature to meet, with long lines, broken links, " +
    "misspellings and other languages on purpose; its CASES.md and README are among them",
  "examples/vault/":
    "the demo vault: the rendering's fixtures (long lines, wide tables, broken front matter), its about-this-vault.md " +
    "a note in it",
  "tests/fixtures/": "the tests' inputs: Latin-1 and CRLF text, links out of the vault, broken on purpose",
};

/** The files git tracks under `root`, the text ones only: not a picture, a grammar's wasm, a symlink, a deleted one. */
export function trackedText(root: string): string[] {
  const ls = Bun.spawnSync(["git", "-C", root, "ls-files", "-z", "--eol"]);
  if (ls.exitCode !== 0) throw new Error(`git ls-files failed in ${root}: ${ls.stderr.toString().trim()}`);
  // Each entry is `i/<index> w/<working tree> attr/<attributes>\t<path>`; the working tree's is `-text` for a binary
  // file, and empty for a symlink or a file gone from it.
  return ls.stdout
    .toString()
    .split("\0")
    .filter(Boolean)
    .flatMap((entry) => {
      const tab = entry.indexOf("\t");
      const tree = /\bw\/(\S*)/.exec(entry.slice(0, tab))?.[1] ?? "";
      return tree && tree !== "-text" ? [entry.slice(tab + 1)] : [];
    });
}

/** What the check reads: the tracked text files less LEFT_OUT, and the Markdown among them. */
export function checked(root: string): { all: string[]; markdown: string[] } {
  const all = trackedText(root).filter((f) => !Object.keys(LEFT_OUT).some((dir) => f.startsWith(dir)));
  return { all, markdown: all.filter((f) => f.endsWith(".md")) };
}

/** A path as lychee takes it: it reads `[`, `*` and `?` as a glob's and skips a name that matches nothing, silently. */
export const lycheePath = (path: string) => path.replace(/[[*?]/g, (c) => `[${c}]`);

/** A tool's run: what failed, if anything. Its findings go straight to the terminal. */
function run(name: string, cmd: string[], root: string, quiet = false): string | null {
  const r = Bun.spawnSync(cmd, { cwd: root, stdout: quiet ? "ignore" : "inherit", stderr: "inherit" });
  return r.exitCode === 0 ? null : `${name} found something (exit ${r.exitCode})`;
}

/** The three tools over these files of `root`'s; the failures, none when it's clean. */
export function checkDocs(root: string, { all, markdown }: { all: string[]; markdown: string[] }): string[] {
  const missing = ["typos", "lychee"].filter((tool) => !Bun.which(tool));
  if (missing.length) {
    return [
      `${missing.join(" and ")} not on PATH: \`mise install\` puts the toolchain mise.toml pins there where mise is ` +
        "active; elsewhere, `mise x -- bun run check`",
    ];
  }
  const markdownlint = resolve(import.meta.dir, "..", "node_modules", "markdownlint-cli2", "markdownlint-cli2-bin.mjs");
  const failed: (string | null)[] = [];
  if (markdown.length) {
    // `:` marks each a path, not a glob: `plan (v2).md` would match nothing, and pass. Its banner and progress go
    // unprinted; its findings are on stderr.
    failed.push(
      run("markdownlint-cli2", [process.execPath, markdownlint, ...markdown.map((f) => `:${f}`)], root, true),
    );
    failed.push(
      run(
        "lychee",
        [
          "lychee",
          "--offline",
          "--include-fragments",
          "--no-progress",
          // A link starting `/` is from the repository's top, as GitHub reads it.
          "--root-dir",
          resolve(root),
          "--",
          ...markdown.map(lycheePath),
        ],
        root,
      ),
    );
  }
  // --force-exclude: what _typos.toml leaves out stays out, though named here.
  if (all.length) failed.push(run("typos", ["typos", "--format", "brief", "--force-exclude", ...all], root));
  return failed.filter((f) => f !== null);
}

if (import.meta.main) {
  const at = process.argv.indexOf("--root");
  const root = at > 0 ? resolve(process.argv[at + 1] ?? ".") : resolve(import.meta.dir, "..");
  const files = checked(root);
  const failed = checkDocs(root, files);
  if (failed.length) {
    for (const f of failed) console.error(`check-docs: ${f}`);
    process.exit(1);
  }
  console.log(
    `check-docs: ${files.markdown.length} Markdown files linted, their links followed; ${files.all.length} files spelt`,
  );
}
