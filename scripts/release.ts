#!/usr/bin/env bun
// A release (plan 14.2), in two steps:
//
//   bun scripts/release.ts build [--target <t>]… --repo <owner/name> [--tag v<version>] [--out <dir>]
//   bun scripts/release.ts finish --repo <owner/name> [--tag v<version>] [--out <dir>]
//
// build: each target — this machine's when none is named — compiled by package.json's own `build` (its autoload
// flags off: 14.1), with its release defined in it (`core/release.ts`), and packed with its third-party notices as
// `slipbox-<version>-<target>.tar.gz`. One built for this machine is run (`--version`) before it's packed. Another
// platform's needs that platform's OpenTUI package installed (`bun install --os <os> --cpu <cpu>`); CI builds each
// on its own platform instead (`.github/workflows/release.yml`), where it's there.
// finish: `SHA256SUMS` over the packs in `--out`; `install.sh` (14.7): `install.template.sh` with the version, the
// repository and each pack's sum written in; and `slipbox.rb` (14.3), the Homebrew formula, from
// `homebrew.template.rb` — macOS's and glibc Linux's packs, which are Homebrew's.
//
// The version is package.json's, which must be `src/version.ts`'s, and the tag's when one is given. `--out` is
// `dist/release` by default. Nothing is published here: CI drafts the release, and a person publishes it.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { checkDeps, notices } from "./check-deps.ts";

const ROOT = resolve(import.meta.dir, "..");

/** The platforms released, by their assets' names, and Bun's target for each. x64 is Bun's baseline build: it runs on
 *  any x64 processor (no AVX2 asked for), and a terminal program loses nothing by it. `-musl`: Linux whose C library
 *  is musl, Alpine's (14.5). */
export const TARGETS: Record<string, string> = {
  "darwin-arm64": "bun-darwin-arm64",
  "darwin-x64": "bun-darwin-x64-baseline",
  "linux-x64": "bun-linux-x64-baseline",
  "linux-arm64": "bun-linux-arm64",
  "linux-x64-musl": "bun-linux-x64-baseline-musl",
  "linux-arm64-musl": "bun-linux-arm64-musl",
};

/** Whether this Linux's C library is musl: its loader is there. */
export function onMusl(): boolean {
  return process.platform === "linux" && ["x86_64", "aarch64"].some((a) => existsSync(`/lib/ld-musl-${a}.so.1`));
}

/** This machine's target, when it's one released. */
export function hostTarget(
  platform: string = process.platform,
  arch: string = process.arch,
  musl = onMusl(),
): string | null {
  const t = `${platform}-${arch}${platform === "linux" && musl ? "-musl" : ""}`;
  return t in TARGETS ? t : null;
}

/** `owner/name` for a GitHub repository named as such, or by a remote's URL; null for anything else. Strict: it goes
 *  into addresses, and into the installer's shell script. */
export function repoOf(s: string): string | null {
  const m =
    /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)?([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(
      s.trim(),
    );
  return m && m[2] !== "." && m[2] !== ".." ? `${m[1]}/${m[2]}` : null;
}

/** The version released: package.json's, the same as `src/version.ts`'s and the tag's (`v<version>`), or why not. */
export function releaseVersion(root: string, tag?: string): string {
  const pkg = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string }).version;
  const src = /export const VERSION = "([^"]+)"/.exec(readFileSync(join(root, "src", "version.ts"), "utf8"))?.[1];
  if (src !== pkg) throw new Error(`package.json says ${pkg}, src/version.ts ${src ?? "nothing"}: make them one`);
  if (tag !== undefined && tag !== `v${pkg}`) throw new Error(`the tag is ${tag}, the version ${pkg}: tag v${pkg}`);
  return pkg;
}

/** package.json's build as arguments to Bun: its output where asked, built for a target, its release defined. */
export function buildArgs(script: string, outfile: string, target: string, repo: string): string[] {
  const argv = script.trim().split(/\s+/);
  if (argv[0] !== "bun" || argv[1] !== "build" || !argv.includes("--compile"))
    throw new Error(`package.json's build isn't a \`bun build --compile\`: ${script}`);
  const out = argv.indexOf("--outfile");
  if (out < 0 || !argv[out + 1]) throw new Error("package.json's build names no --outfile");
  argv[out + 1] = outfile;
  const release = JSON.stringify({ repo, target });
  // OpenTUI picks its musl library only when told at run time (OPENTUI_LIBC): a musl build is told when it's built.
  const musl = target.endsWith("-musl") ? ['--define=process.env.OPENTUI_LIBC="musl"'] : [];
  return [...argv.slice(1), `--target=${TARGETS[target]}`, `--define=SLIPBOX_RELEASE=${release}`, ...musl];
}

/** `SHA256SUMS`'s text for files: `<hash>  <name>` a line, by name — what `sha256sum -c` and `shasum -c` read. */
export function sha256sums(files: string[]): string {
  return files
    .map((f) => ({ name: basename(f), hash: createHash("sha256").update(readFileSync(f)).digest("hex") }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((x) => `${x.hash}  ${x.name}\n`)
    .join("");
}

/** A release asset's name. */
export const assetName = (version: string, target: string) => `slipbox-${version}-${target}.tar.gz`;

function run(argv: string[], cwd = ROOT): string {
  const r = Bun.spawnSync(argv, { cwd, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0)
    throw new Error(
      `${basename(argv[0]!)} ${argv[1] ?? ""} failed (${r.exitCode}):\n${r.stderr.toString()}${r.stdout.toString()}`,
    );
  return r.stdout.toString();
}

/** Each target built and packed into `out`; the packs' paths. */
export function buildRelease(opts: {
  targets: string[];
  repo: string;
  tag?: string;
  out: string;
  root?: string;
}): string[] {
  const root = opts.root ?? ROOT;
  const version = releaseVersion(root, opts.tag);
  const { problems, packages } = checkDeps(root);
  if (problems.length)
    throw new Error(`the supply chain's gates fail (bun run check:deps):\n  ${problems.join("\n  ")}`);
  const script = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: { build: string } })
    .scripts.build;
  mkdirSync(opts.out, { recursive: true });
  const packs: string[] = [];
  for (const target of opts.targets) {
    if (!(target in TARGETS)) throw new Error(`no such target: ${target} (${Object.keys(TARGETS).join(", ")})`);
    const native = join(root, "node_modules", "@opentui", `core-${target}`);
    if (!existsSync(native))
      throw new Error(
        `${target}: OpenTUI's package for it isn't installed — bun install --os ${target.split("-")[0]} --cpu ${target.split("-")[1]}, or build it on its platform`,
      );
    const name = `slipbox-${version}-${target}`;
    const stage = join(opts.out, name);
    rmSync(stage, { recursive: true, force: true });
    mkdirSync(stage);
    const bin = join(stage, "slipbox");
    run([process.execPath, ...buildArgs(script, bin, target, opts.repo)], root);
    if (target === hostTarget()) {
      const said = run([bin, "--version"], stage).trim();
      if (said !== `slipbox ${version}`)
        throw new Error(`${target}: the binary says "${said}", not "slipbox ${version}"`);
    }
    writeFileSync(join(stage, "NOTICES.txt"), notices(packages, version, root));
    const pack = join(opts.out, assetName(version, target));
    rmSync(pack, { force: true });
    run(["tar", "-czf", pack, "-C", opts.out, name]);
    rmSync(stage, { recursive: true, force: true });
    packs.push(pack);
  }
  return packs;
}

/** The installer for a release: the template with its version, repository and each pack's sum written in. */
export function installScript(template: string, version: string, repo: string, sums: Record<string, string>): string {
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version)) throw new Error(`not a version: ${version}`);
  if (repoOf(repo) !== repo) throw new Error(`not a repository: ${repo}`);
  const cases = Object.entries(sums)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([target, hash]) => {
      if (!(target in TARGETS) || !/^[0-9a-f]{64}$/.test(hash))
        throw new Error(`not a target and its sum: ${target} ${hash}`);
      return `    ${target}) echo ${hash} ;;`;
    });
  const out = template.replaceAll("@VERSION@", version).replaceAll("@REPO@", repo).replace("@SUMS@", cases.join("\n"));
  const left = /@[A-Z]+@/.exec(out);
  if (left) throw new Error(`the installer's template has ${left[0]} left`);
  return out;
}

/** The platforms Homebrew installs on, by its own blocks: macOS, and Linux (glibc's: Homebrew's own needs it). */
const HOMEBREW: Record<string, [string, string]> = {
  "darwin-arm64": ["on_macos", "on_arm"],
  "darwin-x64": ["on_macos", "on_intel"],
  "linux-arm64": ["on_linux", "on_arm"],
  "linux-x64": ["on_linux", "on_intel"],
};

/** The Homebrew formula for a release: a block per platform it has a pack for, its address and its sum. */
export function homebrewFormula(template: string, version: string, repo: string, sums: Record<string, string>): string {
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version)) throw new Error(`not a version: ${version}`);
  if (repoOf(repo) !== repo) throw new Error(`not a repository: ${repo}`);
  const blocks: string[] = [];
  for (const os of ["on_macos", "on_linux"]) {
    const inner = Object.entries(HOMEBREW)
      .filter(([target, [o]]) => o === os && sums[target] !== undefined)
      .map(([target, [, cpu]]) => {
        if (!/^[0-9a-f]{64}$/.test(sums[target]!)) throw new Error(`not a sum: ${sums[target]}`);
        return `    ${cpu} do\n      url "https://github.com/${repo}/releases/download/v${version}/${assetName(version, target)}"\n      sha256 "${sums[target]}"\n    end`;
      });
    if (inner.length) blocks.push(`  ${os} do\n${inner.join("\n")}\n  end`);
  }
  if (!blocks.length) throw new Error("no pack Homebrew installs: macOS's or glibc Linux's");
  const out = template
    .replaceAll("@VERSION@", version)
    .replaceAll("@REPO@", repo)
    .replace("@PLATFORMS@", blocks.join("\n"));
  const left = /@[A-Z]+@/.exec(out);
  if (left) throw new Error(`the formula's template has ${left[0]} left`);
  return out;
}

/** The release's packs in `out` summed: `SHA256SUMS`, `install.sh` and `slipbox.rb` written; their paths. */
export function finishRelease(opts: { repo: string; tag?: string; out: string; root?: string }): string[] {
  const root = opts.root ?? ROOT;
  const version = releaseVersion(root, opts.tag);
  const packs = Object.keys(TARGETS)
    .map((t) => join(opts.out, assetName(version, t)))
    .filter((f) => existsSync(f));
  if (!packs.length) throw new Error(`no packs of ${version} in ${opts.out}: build them first`);
  const stray = readdirSync(opts.out).filter((f) => f.endsWith(".tar.gz") && !packs.some((p) => basename(p) === f));
  if (stray.length) throw new Error(`packs of another version in ${opts.out}: ${stray.join(", ")}`);
  const sums = join(opts.out, "SHA256SUMS");
  const text = sha256sums(packs);
  writeFileSync(sums, text);
  const byTarget = Object.fromEntries(
    text
      .trim()
      .split("\n")
      .map((line) => {
        const [hash, file] = line.split("  ") as [string, string];
        return [file.slice(`slipbox-${version}-`.length, -".tar.gz".length), hash];
      }),
  );
  const installer = join(opts.out, "install.sh");
  writeFileSync(
    installer,
    installScript(readFileSync(join(root, "scripts", "install.template.sh"), "utf8"), version, opts.repo, byTarget),
    { mode: 0o755 },
  );
  const out = [sums, installer];
  // Homebrew's, when the release has a pack it installs (a musl-only one hasn't).
  if (Object.keys(HOMEBREW).some((t) => byTarget[t] !== undefined)) {
    const formula = join(opts.out, "slipbox.rb");
    writeFileSync(
      formula,
      homebrewFormula(
        readFileSync(join(root, "scripts", "homebrew.template.rb"), "utf8"),
        version,
        opts.repo,
        byTarget,
      ),
    );
    out.push(formula);
  }
  return out;
}

/** The repository asked for, or origin's on GitHub. */
function repoFrom(flag: string | undefined): string {
  if (flag) {
    const r = repoOf(flag);
    if (!r) throw new Error(`--repo ${flag}: name it owner/name`);
    return r;
  }
  const origin = Bun.spawnSync(["git", "remote", "get-url", "origin"], { cwd: ROOT, stdout: "pipe", stderr: "ignore" });
  const r = origin.exitCode === 0 ? repoOf(origin.stdout.toString()) : null;
  if (!r) throw new Error("which repository are releases published from? --repo owner/name (there's no GitHub origin)");
  return r;
}

if (import.meta.main) {
  const [step, ...rest] = process.argv.slice(2);
  const flags = new Map<string, string[]>();
  for (let i = 0; i < rest.length; i++) {
    const f = rest[i]!;
    if (!f.startsWith("--") || rest[i + 1] === undefined) {
      process.stderr.write(`release: what's ${f}?\n`);
      process.exit(2);
    }
    flags.set(f.slice(2), [...(flags.get(f.slice(2)) ?? []), rest[++i]!]);
  }
  const one = (k: string) => flags.get(k)?.at(-1);
  try {
    const out = resolve(one("out") ?? join(ROOT, "dist", "release"));
    if (step === "build") {
      const host = hostTarget();
      const targets = flags.get("target") ?? (host ? [host] : []);
      if (!targets.length)
        throw new Error(
          `this machine (${process.platform}-${process.arch}) isn't a platform released: name a --target`,
        );
      for (const p of buildRelease({ targets, repo: repoFrom(one("repo")), tag: one("tag"), out }))
        process.stdout.write(`${p}\n`);
    } else if (step === "finish") {
      for (const p of finishRelease({ repo: repoFrom(one("repo")), tag: one("tag"), out }))
        process.stdout.write(`${p}\n`);
    } else {
      process.stderr.write(
        "release: build [--target <t>]… [--repo owner/name] [--tag v<version>] [--out <dir>] | finish …\n",
      );
      process.exit(2);
    }
  } catch (err) {
    process.stderr.write(`release: ${(err as Error).message}\n`);
    process.exit(1);
  }
}
