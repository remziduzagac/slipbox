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
// finish: `SHA256SUMS` over the packs in `--out`.
//
// The version is package.json's, which must be `src/version.ts`'s, and the tag's when one is given. `--out` is
// `dist/release` by default. Nothing is published here: CI drafts the release, and a person publishes it.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { checkDeps, notices } from "./check-deps.ts";

const ROOT = resolve(import.meta.dir, "..");

/** The platforms released, by their assets' names, and Bun's target for each. x64 is Bun's baseline build: it runs on
 *  any x64 processor (no AVX2 asked for), and a terminal program loses nothing by it. */
export const TARGETS: Record<string, string> = {
  "darwin-arm64": "bun-darwin-arm64",
  "darwin-x64": "bun-darwin-x64-baseline",
  "linux-x64": "bun-linux-x64-baseline",
  "linux-arm64": "bun-linux-arm64",
};

/** This machine's target, when it's one released. */
export function hostTarget(platform: string = process.platform, arch: string = process.arch): string | null {
  const t = `${platform}-${arch}`;
  return t in TARGETS ? t : null;
}

/** `owner/name` for a GitHub repository named as such, or by a remote's URL; null for anything else. Strict: it goes
 *  into addresses, and into the installer's shell script. */
export function repoOf(s: string): string | null {
  const m = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)?([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(s.trim());
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
  if (argv[0] !== "bun" || argv[1] !== "build" || !argv.includes("--compile")) throw new Error(`package.json's build isn't a \`bun build --compile\`: ${script}`);
  const out = argv.indexOf("--outfile");
  if (out < 0 || !argv[out + 1]) throw new Error("package.json's build names no --outfile");
  argv[out + 1] = outfile;
  const release = JSON.stringify({ repo, target });
  return [...argv.slice(1), `--target=${TARGETS[target]}`, `--define=SLIPBOX_RELEASE=${release}`];
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
  if (r.exitCode !== 0) throw new Error(`${basename(argv[0]!)} ${argv[1] ?? ""} failed (${r.exitCode}):\n${r.stderr.toString()}${r.stdout.toString()}`);
  return r.stdout.toString();
}

/** Each target built and packed into `out`; the packs' paths. */
export function buildRelease(opts: { targets: string[]; repo: string; tag?: string; out: string; root?: string }): string[] {
  const root = opts.root ?? ROOT;
  const version = releaseVersion(root, opts.tag);
  const { problems, packages } = checkDeps(root);
  if (problems.length) throw new Error(`the supply chain's gates fail (bun run check:deps):\n  ${problems.join("\n  ")}`);
  const script = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: { build: string } }).scripts.build;
  mkdirSync(opts.out, { recursive: true });
  const packs: string[] = [];
  for (const target of opts.targets) {
    if (!(target in TARGETS)) throw new Error(`no such target: ${target} (${Object.keys(TARGETS).join(", ")})`);
    const native = join(root, "node_modules", "@opentui", `core-${target}`);
    if (!existsSync(native)) throw new Error(`${target}: OpenTUI's package for it isn't installed — bun install --os ${target.split("-")[0]} --cpu ${target.split("-")[1]}, or build it on that platform`);
    const name = `slipbox-${version}-${target}`;
    const stage = join(opts.out, name);
    rmSync(stage, { recursive: true, force: true });
    mkdirSync(stage);
    const bin = join(stage, "slipbox");
    run([process.execPath, ...buildArgs(script, bin, target, opts.repo)], root);
    if (target === hostTarget()) {
      const said = run([bin, "--version"], stage).trim();
      if (said !== `slipbox ${version}`) throw new Error(`${target}: the binary says "${said}", not "slipbox ${version}"`);
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

/** The release's packs in `out` summed: `SHA256SUMS` written; its path. */
export function finishRelease(opts: { repo: string; tag?: string; out: string; root?: string }): string {
  const version = releaseVersion(opts.root ?? ROOT, opts.tag);
  const packs = Object.keys(TARGETS)
    .map((t) => join(opts.out, assetName(version, t)))
    .filter((f) => existsSync(f));
  if (!packs.length) throw new Error(`no packs of ${version} in ${opts.out}: build them first`);
  const stray = readdirSync(opts.out).filter((f) => f.endsWith(".tar.gz") && !packs.some((p) => basename(p) === f));
  if (stray.length) throw new Error(`packs of another version in ${opts.out}: ${stray.join(", ")}`);
  const sums = join(opts.out, "SHA256SUMS");
  writeFileSync(sums, sha256sums(packs));
  return sums;
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
      if (!targets.length) throw new Error(`this machine (${process.platform}-${process.arch}) isn't a platform released: name a --target`);
      for (const p of buildRelease({ targets, repo: repoFrom(one("repo")), tag: one("tag"), out })) process.stdout.write(`${p}\n`);
    } else if (step === "finish") {
      process.stdout.write(`${finishRelease({ repo: repoFrom(one("repo")), tag: one("tag"), out })}\n`);
    } else {
      process.stderr.write("release: build [--target <t>]… [--repo owner/name] [--tag v<version>] [--out <dir>] | finish …\n");
      process.exit(2);
    }
  } catch (err) {
    process.stderr.write(`release: ${(err as Error).message}\n`);
    process.exit(1);
  }
}
