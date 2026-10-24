// Two release builds of this checkout, for the checks of upgrading and restarting (UPG): the first as it is, the second
// from a copy of the sources whose `version.ts` says a newer version — so the slipbox a restart starts is the new one,
// not the old one under a new name. Built for this machine (no `--target`: it would download Bun's runtime), with
// `SLIPBOX_RELEASE` defined as `scripts/release.ts` defines it; the second packed as a release is, and laid out as
// GitHub's releases are, for `SLIPBOX_RELEASES_URL=file://…`. Built once a run (run.ts), before the workers start.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assetName, hostTarget, sha256sums } from "../../scripts/release.ts";

const REPO = join(import.meta.dir, "..", "..");

/** The release builds, where `SLIPBOX_TERMINAL_RELEASES` says. */
export interface Releases {
  /** The folder they're in. */
  dir: string;
  target: string;
  /** This checkout's version, and its binary. */
  old: string;
  oldBin: string;
  /** The newer one's version, its binary unpacked, and the releases' folder serving its pack. */
  new: string;
  newBin: string;
  releases: string;
}

/** The repository the builds say they're released from. */
export const REPO_NAME = "o/r";

/** The version after `v`: its patch one more. */
export function nextVersion(v: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!m) throw new Error(`not a version: ${v}`);
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

function run(argv: string[], cwd: string): void {
  const r = Bun.spawnSync(argv, { cwd, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`${argv.slice(0, 3).join(" ")} failed:\n${r.stderr.toString()}`);
}

/** package.json's build of the sources in `root` to `outfile`, a release of `target`. */
function build(root: string, outfile: string, target: string): void {
  const script = (JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as { scripts: { build: string } })
    .scripts.build;
  const argv = script.trim().split(/\s+/);
  argv[argv.indexOf("--outfile") + 1] = outfile;
  const musl = target.endsWith("-musl") ? ['--define=process.env.OPENTUI_LIBC="musl"'] : [];
  const release = JSON.stringify({ repo: REPO_NAME, target });
  run([process.execPath, ...argv.slice(1), `--define=SLIPBOX_RELEASE=${release}`, ...musl], root);
}

/** The two builds made in `dir`. */
export function buildReleases(dir: string): Releases {
  const target = hostTarget();
  if (!target) throw new Error(`no release is built for ${process.platform}-${process.arch}`);
  const old = /export const VERSION = "([^"]+)"/.exec(readFileSync(join(REPO, "src", "version.ts"), "utf8"))![1]!;
  const next = nextVersion(old);
  mkdirSync(dir, { recursive: true });
  const oldBin = join(dir, `slipbox-${old}`);
  build(REPO, oldBin, target);
  // The newer one: the sources copied, their version moved on; the packages are the checkout's.
  const copy = join(dir, "src-next");
  rmSync(copy, { recursive: true, force: true });
  mkdirSync(copy);
  cpSync(join(REPO, "src"), join(copy, "src"), { recursive: true });
  for (const f of ["package.json", "tsconfig.json"])
    if (existsSync(join(REPO, f))) cpSync(join(REPO, f), join(copy, f));
  // What the sources import from beside them: the packages, the grammars, the skill.
  for (const d of ["node_modules", "grammars", "skills"]) symlinkSync(join(REPO, d), join(copy, d));
  const versionFile = join(copy, "src", "version.ts");
  writeFileSync(versionFile, readFileSync(versionFile, "utf8").replace(`"${old}"`, `"${next}"`));
  const name = `slipbox-${next}-${target}`;
  const stage = join(dir, name);
  mkdirSync(stage, { recursive: true });
  build(copy, join(stage, "slipbox"), target);
  rmSync(copy, { recursive: true, force: true });
  // Its pack, and the releases laid out as GitHub's: `latest/download/SHA256SUMS`, `download/v<version>/<pack>`.
  const releases = join(dir, "releases");
  const pack = join(releases, "download", `v${next}`, assetName(next, target));
  mkdirSync(join(releases, "download", `v${next}`), { recursive: true });
  run(["tar", "-czf", pack, "-C", dir, name], dir);
  mkdirSync(join(releases, "latest", "download"), { recursive: true });
  writeFileSync(join(releases, "latest", "download", "SHA256SUMS"), sha256sums([pack]));
  return { dir, target, old, oldBin, new: next, newBin: join(stage, "slipbox"), releases };
}

/** The builds a run made, as its workers find them; null when none were. */
export function releasesBuilt(): Releases | null {
  const dir = process.env.SLIPBOX_TERMINAL_RELEASES;
  if (!dir) return null;
  try {
    return JSON.parse(readFileSync(join(dir, "releases.json"), "utf8")) as Releases;
  } catch {
    return null;
  }
}

/** The builds made in `dir`, and said where its workers read them. */
export function buildAndRecord(dir: string): Releases {
  const r = buildReleases(dir);
  writeFileSync(join(dir, "releases.json"), JSON.stringify(r));
  return r;
}
