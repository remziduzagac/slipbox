// The tree-sitter grammars npm has no WebAssembly for (plan 16.18–16.22), built from their sources at
// pinned commits into `grammars/` — committed there, as a package's own `.wasm` would be, with each
// grammar's licence beside it. To rebuild one, or move it to a newer commit (change `rev` first):
//
//   bun scripts/build-grammars.ts [name…]
//
// Needs git and the network. tree-sitter-cli builds the WebAssembly with wasi-sdk, which it downloads
// into its cache the first time; what it builds loads in web-tree-sitter 0.25, the runtime slipbox
// uses (the npm grammars' own builds are emscripten's; both work). Each grammar's `patch` is said
// in grammars/README.md.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = "tree-sitter-cli@0.27.0";
const OUT = join(import.meta.dir, "..", "grammars");

interface Source {
  name: string;
  repo: string;
  /** The commit built. */
  rev: string;
  /** Text replaced in a source file before building: [file, from, to]. */
  patch?: [string, string, string][];
}

export const SOURCES: Source[] = [
  {
    name: "swift",
    repo: "https://github.com/alex-pinkus/tree-sitter-swift",
    rev: "82bb3a533e0801fd2bbaa11dc49676e10bf41948", // its with-generated-files branch: parser.c committed
    // The scanner prints to stderr when it can't allocate its state; the runtime has no stderr.
    patch: [["src/scanner.c", 'fprintf(stderr, "tree-sitter-swift: out of memory allocating scanner state\\n");', "/* slipbox: no stderr in the wasm runtime */"]],
  },
  { name: "scss", repo: "https://github.com/serenadeai/tree-sitter-scss", rev: "c478c6868648eff49eb04a4df90d703dc45b312a" },
  { name: "vue", repo: "https://github.com/tree-sitter-grammars/tree-sitter-vue", rev: "ce8011a414fdf8091f4e4071752efc376f4afb08" },
  { name: "astro", repo: "https://github.com/virchau13/tree-sitter-astro", rev: "213f6e6973d9b456c6e50e86f19f66877e7ef0ee" },
  { name: "dockerfile", repo: "https://github.com/camdencheek/tree-sitter-dockerfile", rev: "971acdd908568b4531b0ba28a445bf0bb720aba5" },
];

function run(cmd: string, args: string[], cwd: string): void {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed in ${cwd}`);
}

/**
 * The build: tree-sitter-cli refuses a scanner calling a C function its own (newer) runtime lacks,
 * though it writes the module — Swift's calls `strncpy`, `towlower` and `towupper`, which
 * web-tree-sitter 0.25 has. That refusal is said and let through; slipbox's tests load and parse
 * every grammar, which is the check that counts.
 */
function buildWasm(dir: string, out: string): void {
  const before = Date.now();
  const r = spawnSync("npx", ["--yes", CLI, "build", "--wasm", "-o", out], { cwd: dir, stdio: ["ignore", "inherit", "pipe"] });
  const err = r.stderr?.toString() ?? "";
  process.stderr.write(err);
  if (r.status === 0) return;
  const written = existsSync(out) && statSync(out).mtimeMs >= before - 1000;
  if (written && /isn't available to Wasm parsers/.test(err)) {
    console.warn(`${out}: built; the CLI's runtime lacks a C function its scanner calls — slipbox's tests say whether ours has it`);
    return;
  }
  throw new Error(`tree-sitter build --wasm failed in ${dir}`);
}

function build(src: Source): void {
  const dir = mkdtempSync(join(tmpdir(), `grammar-${src.name}-`));
  try {
    run("git", ["init", "-q"], dir);
    run("git", ["fetch", "-q", "--depth", "1", src.repo, src.rev], dir);
    run("git", ["checkout", "-q", "FETCH_HEAD"], dir);
    for (const [file, from, to] of src.patch ?? []) {
      const text = readFileSync(join(dir, file), "utf8");
      if (!text.includes(from)) throw new Error(`${src.name}: the patch to ${file} no longer applies`);
      writeFileSync(join(dir, file), text.replace(from, to));
    }
    buildWasm(dir, join(OUT, `tree-sitter-${src.name}.wasm`));
    mkdirSync(join(OUT, "licenses"), { recursive: true });
    copyFileSync(join(dir, "LICENSE"), join(OUT, "licenses", `${src.name}.LICENSE`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const wanted = process.argv.slice(2);
  mkdirSync(OUT, { recursive: true });
  for (const src of SOURCES) if (!wanted.length || wanted.includes(src.name)) build(src);
}
