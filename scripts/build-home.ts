// Builds the reference sample set (examples/home) into a folder: bun scripts/build-home.ts <dir>
//
// examples/home is committed as plain folders: a `.git` folder can't be committed inside this
// repository. The build copies it to <dir>/home — the `$HOME` tests and e2e use — and halden, the
// demo vault, to <dir>/vault beside it, then gives each mock repository its history: the commits,
// branches, merges and worktrees `.build/<repo>.toml` describes, replayed with git in order (the
// format is in examples/home/README.md). Each repository's `main` ends at the folder as committed,
// checked. Files that can't be committed — hostile names, symlinks, a file too big, an unreadable
// one — come from `.build/extras.toml`.

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parse as parseToml } from "smol-toml";

export const SOURCE = resolve(import.meta.dir, "..", "examples", "home");
export const HALDEN = resolve(import.meta.dir, "..", "examples", "vault");

interface Commit {
  branch?: string;
  from?: string;
  date?: string;
  author?: string;
  message: string;
  add?: string[];
  write?: Record<string, string>;
  rename?: Record<string, string>;
  delete?: string[];
  merge?: string;
}

interface History {
  remote?: string;
  commit?: Commit[];
  worktree?: { branch: string; path: string }[];
}

export class BuildError extends Error {}

/** Every file under `dir`, as `/`-separated paths relative to it (symlinks as they are, not followed). */
function filesUnder(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) out.push(...filesUnder(abs, base));
    else out.push(relative(base, abs).split("\\").join("/"));
  }
  return out.sort();
}

function git(cwd: string, args: string[], env: Record<string, string> = {}): string {
  const r = spawnSync("git", ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) throw new BuildError(`git ${args.join(" ")} (in ${cwd}): ${(r.stderr || r.stdout).trim()}`);
  return r.stdout;
}

/** `Name <email>` as git's author and committer, and the date, for a commit made now. */
function who(c: Commit): Record<string, string> {
  const m = /^(.*?)\s*<([^>]+)>$/.exec(c.author ?? "Sam Rivera <sam@kestrel.dev>");
  const name = m?.[1] || "Sam Rivera";
  const email = m?.[2] || "sam@kestrel.dev";
  const date = c.date ?? "2026-08-15T09:00:00+02:00";
  return {
    GIT_AUTHOR_NAME: name,
    GIT_AUTHOR_EMAIL: email,
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: name,
    GIT_COMMITTER_EMAIL: email,
    GIT_COMMITTER_DATE: date,
  };
}

/**
 * Replay a history in `repo`, an empty folder: `final` holds the committed files of `main`'s last
 * state (`add` copies from it). After the replay `main` is checked out; files of `final` no commit
 * added are put back untracked (a `.env`, an ignored folder); a tracked file differing from `final`
 * is an error.
 */
export function replay(repo: string, final: string, h: History): { commits: number; untracked: string[] } {
  git(repo, ["init", "-q", "-b", "main"]);
  if (h.remote) git(repo, ["remote", "add", "origin", h.remote]);
  // `main` is there from the start (unborn until its first commit); any other branch begins at its `from`.
  const branches = new Set<string>(["main"]);
  let current = "main";
  let commits = 0;
  for (const c of h.commit ?? []) {
    const branch = c.branch ?? "main";
    if (branch !== current) {
      if (branches.has(branch)) git(repo, ["checkout", "-q", branch]);
      else {
        git(repo, ["checkout", "-q", "-b", branch, c.from ?? "main"]);
        branches.add(branch);
      }
      current = branch;
    }
    const env = who(c);
    if (c.merge) {
      git(repo, ["merge", "-q", "--no-ff", "--no-edit", "-m", c.message, c.merge], env);
      commits++;
      continue;
    }
    // In this order: a rename moves the file as it was; then what the commit writes or adds over it.
    for (const [from, to] of Object.entries(c.rename ?? {})) {
      if (!existsSync(join(repo, from))) throw new BuildError(`${from}: renamed by "${c.message}", but not there`);
      mkdirSync(dirname(join(repo, to)), { recursive: true });
      renameSync(join(repo, from), join(repo, to));
    }
    for (const [rel, text] of Object.entries(c.write ?? {})) {
      mkdirSync(dirname(join(repo, rel)), { recursive: true });
      writeFileSync(join(repo, rel), text);
    }
    for (const rel of c.add ?? []) {
      const from = join(final, rel);
      if (!existsSync(from)) throw new BuildError(`${rel}: added by "${c.message}", but not in ${final}`);
      mkdirSync(dirname(join(repo, rel)), { recursive: true });
      cpSync(from, join(repo, rel));
    }
    for (const rel of c.delete ?? []) rmSync(join(repo, rel), { recursive: true, force: true });
    // A file a commit lists in `add` is tracked even if a .gitignore matches it (generated docs, say).
    if (c.add?.length) git(repo, ["add", "-f", "--", ...c.add]);
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "--allow-empty", "-m", c.message], env);
    commits++;
  }
  git(repo, ["checkout", "-q", "main"]);
  const tracked = new Set(git(repo, ["ls-files", "-z"]).split("\0").filter(Boolean));
  const untracked: string[] = [];
  const differs: string[] = [];
  for (const rel of filesUnder(final)) {
    if (tracked.has(rel)) {
      if (!readFileSync(join(repo, rel)).equals(readFileSync(join(final, rel)))) differs.push(rel);
      continue;
    }
    mkdirSync(dirname(join(repo, rel)), { recursive: true });
    cpSync(join(final, rel), join(repo, rel));
    untracked.push(rel);
  }
  if (differs.length)
    throw new BuildError(`main's last commit differs from the committed folder in ${differs.join(", ")}`);
  for (const w of h.worktree ?? []) git(repo, ["worktree", "add", "-q", w.path, w.branch]);
  return { commits, untracked };
}

interface Extra {
  path: string;
  kind?: "file" | "symlink" | "big" | "unreadable";
  content?: string;
  target?: string;
  size?: number;
  /** For a `big` file: written once at the top, before the repeated `content`. */
  head?: string;
  why?: string;
}

/** The files that can't be committed (`.build/extras.toml`), made in `home`. */
export function makeExtras(home: string, extras: Extra[]): string[] {
  const made: string[] = [];
  for (const x of extras) {
    const abs = join(home, x.path);
    mkdirSync(dirname(abs), { recursive: true });
    switch (x.kind ?? "file") {
      case "symlink":
        if (!x.target) throw new BuildError(`${x.path}: a symlink needs a target`);
        symlinkSync(x.target, abs);
        break;
      case "big": {
        const size = x.size ?? 8 * 1024 * 1024;
        if (x.content) {
          // Real text, repeated up to `size`: the explanation stays in `why`.
          const seed = x.content.endsWith("\n") ? x.content : `${x.content}\n`;
          writeFileSync(abs, `${x.head ?? ""}${seed.repeat(Math.ceil(size / seed.length))}`);
        } else {
          const line = "Big enough that slipbox lists it as skipped, never parses it.\n";
          writeFileSync(abs, `# ${x.why ?? "A big file"}\n\n${line.repeat(Math.ceil(size / line.length))}`);
        }
        break;
      }
      case "unreadable":
        writeFileSync(abs, x.content ?? "# Unreadable\n");
        chmodSync(abs, 0o000);
        break;
      default:
        writeFileSync(abs, x.content ?? "");
    }
    made.push(x.path);
  }
  return made;
}

/** Build the set into `out`: `out/home` (with its repositories' histories) and `out/vault` (halden). */
export function buildHome(
  out: string,
  source = SOURCE,
  halden = HALDEN,
): { home: string; vault: string; repos: Record<string, { commits: number; untracked: string[] }>; extras: string[] } {
  const home = join(out, "home");
  const vault = join(out, "vault");
  if (existsSync(home) || existsSync(vault))
    throw new BuildError(`${out} already holds home/ or vault/: build into an empty folder`);
  mkdirSync(out, { recursive: true });
  cpSync(source, home, { recursive: true, filter: (src) => relative(source, src) !== ".build" });
  cpSync(halden, vault, { recursive: true });
  const repos: Record<string, { commits: number; untracked: string[] }> = {};
  const build = join(source, ".build");
  for (const name of existsSync(build)
    ? readdirSync(build)
        .filter((n) => n.endsWith(".toml") && n !== "extras.toml")
        .sort()
    : []) {
    const repoName = name.replace(/\.toml$/, "");
    const repo = join(home, "work", repoName);
    if (!existsSync(repo)) throw new BuildError(`.build/${name}: no work/${repoName} to give a history`);
    const final = join(out, `.final-${repoName}`);
    renameSync(repo, final);
    mkdirSync(repo);
    try {
      repos[repoName] = replay(repo, final, parseToml(readFileSync(join(build, name), "utf8")) as History);
    } finally {
      rmSync(final, { recursive: true, force: true });
    }
  }
  const extrasFile = join(build, "extras.toml");
  const extras = existsSync(extrasFile)
    ? makeExtras(home, (parseToml(readFileSync(extrasFile, "utf8")) as { file?: Extra[] }).file ?? [])
    : [];
  return { home, vault, repos, extras };
}

if (import.meta.main) {
  const out = process.argv[2];
  if (!out) {
    console.error("usage: bun scripts/build-home.ts <dir>   (builds <dir>/home and <dir>/vault)");
    process.exit(2);
  }
  try {
    const r = buildHome(resolve(out));
    for (const [name, x] of Object.entries(r.repos))
      console.log(`work/${name}: ${x.commits} commits${x.untracked.length ? `, ${x.untracked.length} untracked` : ""}`);
    if (r.extras.length) console.log(`extras: ${r.extras.length}`);
    console.log(`built ${r.home} and ${r.vault}`);
  } catch (err) {
    console.error(`build-home: ${(err as Error).message}`);
    process.exit(1);
  }
}
