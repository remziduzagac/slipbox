#!/usr/bin/env bun
// A release (plan 14.2), in two steps, and its notes:
//
//   bun scripts/release.ts build [--target <t>]… --repo <owner/name> [--tag v<version>] [--out <dir>]
//   bun scripts/release.ts finish --repo <owner/name> [--tag v<version>] [--out <dir>]
//   bun scripts/release.ts notes [--tag v<version>]
//
// build: each target — this machine's when none is named — compiled by package.json's own `build` (its autoload
// flags off: 14.1), with its release defined in it (`core/release.ts`), and packed with slipbox's licence and the
// third-party notices as `slipbox-<version>-<target>.tar.gz`, its SBOM beside it as
// `slipbox-<version>-<target>.cdx.json`, from the same walk as the notices. One built for this machine is run
// (`--version`) before it's packed. Another platform's needs that platform's OpenTUI package installed (`bun install
// --os <os> --cpu <cpu>`); CI builds each on its own platform instead (`.github/workflows/build.yml`), where it's
// there.
// finish: `SHA256SUMS` over the packs in `--out`; `install.sh` (14.7): `install.template.sh` with the version, its
// tag, the repository and each pack's sum written in; and, but for a preview, `slipbox.rb` (14.3), the Homebrew
// formula, from `homebrew.template.rb` — macOS's and glibc Linux's packs, which are Homebrew's.
// notes: the release's notes on stdout, its version's section of CHANGELOG.md; none there fails.
//
// The version is package.json's, which must be `src/version.ts`'s, and the tag's when one is given. `--out` is
// `dist/release` by default. Nothing is published here: CI drafts the release, and a person publishes it.
//
// A preview (GR-D13), made by `.github/workflows/preview.yml` from the `test` branch, is built the same way under a
// version of its own, `<package.json's>-preview.<UTC commit time>.g<hash>`, and the tag `preview-<time>-<hash>`:
//
//   bun scripts/release.ts preview [--remote <name|url>]
//   bun scripts/release.ts stamp --version <version>
//   bun scripts/release.ts notes --tag preview-<time>-<hash> [--repo <owner/name>]
//
// preview: the commit checked out's preview, as `version=…` and `tag=…` lines (a workflow's outputs); refused when
// `v<package.json's version>` is tagged on the remote (origin by default) — that version is released: bump it first.
// stamp: package.json and src/version.ts made to say a preview's version, in this checkout, so the binary, its pack,
// notices and SBOM all do; never committed. notes, for a preview: what it is, how to install it, and the changelog's
// Unreleased section.
//
// And for the Pages site (GR-D14) and the previews kept:
//
//   bun scripts/release.ts site --repo <owner/name> --out <dir>
//   bun scripts/release.ts stale --repo <owner/name> [--keep 10]
//
// site: the channel files, `stable` and `preview`, each `<tag> <SHA-256 of that release's install.sh>`, from the
// repository's releases (`gh api`): the highest stable release, the newest preview; a channel with none has no file.
// stale: the published previews beyond the newest `--keep`, a tag a line, for the workflow to delete.

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { checkDeps, notices, sbom } from "./check-deps.ts";

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

/** A preview's tag (GR-D13): `preview-<its commit's UTC committer time, YYYYMMDDHHMM>-<the commit's 7 first hex>`. */
export const PREVIEW_TAG = /^preview-(\d{12})-([0-9a-f]{7})$/;

/** A preview's version: `<the release to come's x.y.z>-preview.<time>.g<hash>`, a pre-release of that version, so it
 *  sorts after the previews before it and before the release. */
export const PREVIEW_VERSION = /^(\d+\.\d+\.\d+)-preview\.(\d{12})\.g([0-9a-f]{7})$/;

/** The tag a version is published under: a preview's `preview-<time>-<hash>`, else `v<version>`. */
export function tagOf(version: string): string {
  const p = PREVIEW_VERSION.exec(version);
  return p ? `preview-${p[2]}-${p[3]}` : `v${version}`;
}

/** A time, in seconds since the epoch, as a preview names it: UTC, `YYYYMMDDHHMM`. */
export function utcMinute(seconds: number): string {
  const d = new Date(seconds * 1000);
  if (!Number.isFinite(seconds) || Number.isNaN(d.getTime())) throw new Error(`not a time: ${seconds}`);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${String(d.getUTCFullYear()).padStart(4, "0")}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}${two(d.getUTCHours())}${two(d.getUTCMinutes())}`;
}

/** The preview of the release to come, `base` (package.json's version), made from a commit — its UTC committer time
 *  in seconds and its hash: the version its binaries say, and its tag. */
export function previewOf(base: string, committed: number, commit: string): { version: string; tag: string } {
  if (!/^\d+\.\d+\.\d+$/.test(base))
    throw new Error(`package.json's version is ${base}: a preview is of the release to come, x.y.z`);
  if (!/^[0-9a-f]{7,64}$/.test(commit)) throw new Error(`not a commit's hash: ${commit}`);
  const time = utcMinute(committed);
  const hash = commit.slice(0, 7);
  return { version: `${base}-preview.${time}.g${hash}`, tag: `preview-${time}-${hash}` };
}

/** The version released: package.json's, the same as `src/version.ts`'s and the tag's (`v<version>`, or a preview's
 *  `preview-<time>-<hash>` for its stamped version), or why not. */
export function releaseVersion(root: string, tag?: string): string {
  const pkg = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string }).version;
  const src = /export const VERSION = "([^"]+)"/.exec(readFileSync(join(root, "src", "version.ts"), "utf8"))?.[1];
  if (src !== pkg) throw new Error(`package.json says ${pkg}, src/version.ts ${src ?? "nothing"}: make them one`);
  if (tag !== undefined && tag !== tagOf(pkg)) {
    if (PREVIEW_TAG.test(tag) && !PREVIEW_VERSION.test(pkg))
      throw new Error(`the tag is ${tag}, a preview's, the version ${pkg}: stamp the preview's version first`);
    throw new Error(`the tag is ${tag}, the version ${pkg}: tag ${tagOf(pkg)}`);
  }
  return pkg;
}

/** A checkout made to say a preview's `version`: package.json's and `src/version.ts`'s rewritten in place — what CI
 *  does in its own checkout before building a preview, never committed. The version must be a preview of
 *  package.json's, and of `head`, the commit checked out, when given. package.json's own version changes nothing. */
export function stampVersion(root: string, version: string, head?: string): void {
  const now = releaseVersion(root);
  if (version === now) return;
  const p = PREVIEW_VERSION.exec(version);
  if (!p) throw new Error(`${version} is neither package.json's version (${now}) nor a preview's`);
  if (p[1] !== now) throw new Error(`${version} is a preview of ${p[1]}, and package.json's version is ${now}`);
  if (head !== undefined && !head.startsWith(p[3]!))
    throw new Error(`${version} is a preview of commit ${p[3]}, and this checkout is at ${head.slice(0, 7)}`);
  const pkgFile = join(root, "package.json");
  writeFileSync(pkgFile, readFileSync(pkgFile, "utf8").replace(/("version"\s*:\s*")[^"]*"/, `$1${version}"`));
  const srcFile = join(root, "src", "version.ts");
  writeFileSync(srcFile, readFileSync(srcFile, "utf8").replace(/(export const VERSION = ")[^"]+"/, `$1${version}"`));
  if (releaseVersion(root) !== version) throw new Error(`package.json and src/version.ts don't say ${version} now`);
}

/** The preview to make of the commit checked out in `root` (`previewOf`), refused when `v<package.json's version>`
 *  is tagged on `remote` — that version is released, and its previews would sort before it: bump the version first —
 *  or the preview's own tag is there already. */
export function previewPlan(root: string, remote = "origin"): { version: string; tag: string } {
  const base = releaseVersion(root);
  const [committed, commit] = run(["git", "show", "-s", "--format=%ct %H", "HEAD"], root).trim().split(" ");
  const plan = previewOf(base, Number(committed), commit ?? "");
  const tags = new Set(
    run(["git", "ls-remote", "--tags", remote, `refs/tags/v${base}`, `refs/tags/${plan.tag}`], root)
      .split("\n")
      .map((line) => line.split("\t")[1])
      .filter((ref): ref is string => !!ref),
  );
  if (tags.has(`refs/tags/v${base}`))
    throw new Error(
      `v${base} is released already: bump the version (package.json and src/version.ts) for the previews of the next`,
    );
  if (tags.has(`refs/tags/${plan.tag}`)) throw new Error(`${plan.tag} is published already: nothing to make`);
  return plan;
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

/** The name of a pack's SBOM, a release asset beside it. */
export const sbomName = (version: string, target: string) => `slipbox-${version}-${target}.cdx.json`;

/** A version's release notes: its section of a changelog in Keep a Changelog's shape (`## [<version>] - <date>`),
 *  without its heading, up to the next version's or the link definitions at the end. None, or an empty one, throws. */
export function releaseNotes(changelog: string, version: string): string {
  const lines = changelog.replace(/\r\n?/g, "\n").split("\n");
  const v = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const at = lines.findIndex((l) => new RegExp(`^##\\s+\\[?v?${v}\\]?(\\s|$)`).test(l));
  if (at < 0) throw new Error(`the changelog has no section for ${version}: a "## [${version}] - <date>" heading`);
  const end = lines.findIndex((l, i) => i > at && (/^##\s/.test(l) || /^\[[^\]]+\]:\s/.test(l)));
  const text = lines
    .slice(at + 1, end < 0 ? undefined : end)
    .join("\n")
    .trim();
  if (!text) throw new Error(`the changelog's section for ${version} is empty`);
  return `${text}\n`;
}

/** The GitHub Pages site of a repository, `https://<owner>.github.io/<name>`: where the installer and the channels
 *  are (GR-D14). */
export function pagesUrl(repo: string): string {
  if (repoOf(repo) !== repo) throw new Error(`not a repository: ${repo}`);
  const [owner, name] = repo.split("/") as [string, string];
  return `https://${owner.toLowerCase()}.github.io/${name}`;
}

/** A preview's notes: what it is, how to install it, and what's changed so far — the changelog's Unreleased section,
 *  when it has something in it. */
export function previewNotes(changelog: string | null, version: string, repo: string): string {
  const p = PREVIEW_VERSION.exec(version);
  if (!p) throw new Error(`not a preview's version: ${version}`);
  let unreleased = "";
  try {
    unreleased = changelog === null ? "" : releaseNotes(changelog, "Unreleased");
  } catch {
    // No Unreleased section, or an empty one: nothing to add.
  }
  return [
    `A preview of slipbox ${p[1]}, built from the \`test\` branch: what the next release will have, before it's`,
    "released, for trying it. Only the newest ten previews are kept.",
    "",
    `Install it with \`curl -fsSL ${pagesUrl(repo)}/install.sh | sh -s -- --preview\`, which keeps the install on`,
    "previews; `slipbox channel set stable` goes back to releases.",
    ...(unreleased ? ["", "What's changed since the last release, so far:", "", unreleased.trimEnd()] : []),
    "",
  ].join("\n");
}

/** The notes for the version released from `root`: its section of CHANGELOG.md; for a preview's tag, its notes
 *  (`previewNotes`), whether or not the checkout is stamped. */
export function changelogNotes(root: string, tag?: string, repo?: string): string {
  const file = join(root, "CHANGELOG.md");
  const preview = tag === undefined ? null : PREVIEW_TAG.exec(tag);
  if (preview) {
    const pkg = releaseVersion(root);
    const version = PREVIEW_VERSION.test(pkg)
      ? releaseVersion(root, tag)
      : `${pkg}-preview.${preview[1]}.g${preview[2]}`;
    if (!repo) throw new Error("a preview's notes say where to install it from: --repo owner/name");
    return previewNotes(existsSync(file) ? readFileSync(file, "utf8") : null, version, repo);
  }
  const version = releaseVersion(root, tag);
  if (!existsSync(file)) throw new Error("there's no CHANGELOG.md to take the release's notes from");
  return releaseNotes(readFileSync(file, "utf8"), version);
}

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
  const { problems, packages, direct } = checkDeps(root);
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
    copyFileSync(join(root, "LICENSE"), join(stage, "LICENSE"));
    const pack = join(opts.out, assetName(version, target));
    rmSync(pack, { force: true });
    run(["tar", "-czf", pack, "-C", opts.out, name]);
    rmSync(stage, { recursive: true, force: true });
    writeFileSync(
      join(opts.out, sbomName(version, target)),
      `${JSON.stringify(sbom({ packages, direct }, { version, target, repo: opts.repo, tag: tagOf(version) }, root), null, 2)}\n`,
    );
    packs.push(pack);
  }
  return packs;
}

/** The installer for a release: the template with its version, its tag (`v<version>`, or a preview's: the packs are
 *  downloaded from it), the repository and each pack's sum written in. */
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
  const out = template
    .replaceAll("@VERSION@", version)
    .replaceAll("@TAG@", tagOf(version))
    .replaceAll("@REPO@", repo)
    .replace("@SUMS@", cases.join("\n"));
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
  if (PREVIEW_VERSION.test(version)) throw new Error(`${version} is a preview's: Homebrew never gets one`);
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

/** The release's packs in `out` summed: `SHA256SUMS`, `install.sh` and `slipbox.rb` written; their paths. A preview
 *  has no formula: Homebrew never gets one (GR-D15). */
export function finishRelease(opts: { repo: string; tag?: string; out: string; root?: string }): string[] {
  const root = opts.root ?? ROOT;
  const version = releaseVersion(root, opts.tag);
  const packs = Object.keys(TARGETS)
    .map((t) => join(opts.out, assetName(version, t)))
    .filter((f) => existsSync(f));
  if (!packs.length) throw new Error(`no packs of ${version} in ${opts.out}: build them first`);
  const ours = new Set(Object.keys(TARGETS).flatMap((t) => [assetName(version, t), sbomName(version, t)]));
  const stray = readdirSync(opts.out).filter((f) => /\.(tar\.gz|cdx\.json)$/.test(f) && !ours.has(f));
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
  // Homebrew's, when the release has a pack it installs (a musl-only one hasn't), and isn't a preview.
  if (!PREVIEW_VERSION.test(version) && Object.keys(HOMEBREW).some((t) => byTarget[t] !== undefined)) {
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

// ------------------------------------------------------------------------------------------------------------------
// The channels (GR-D14) and the previews kept

/** A release as GitHub's API lists it (`GET /repos/{repo}/releases`): the fields read here. */
export interface GhRelease {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  published_at?: string | null;
  assets?: { name: string; browser_download_url: string; digest?: string | null }[];
}

/** A stable release's tag: `v<x.y.z>`, nothing after it. */
const STABLE_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;

/** The published previews, newest first: by their commits' time, which their tags carry, then by when published. */
export function previews(releases: GhRelease[]): GhRelease[] {
  const time = (r: GhRelease) => PREVIEW_TAG.exec(r.tag_name)?.[1] ?? "";
  return releases
    .filter((r) => !r.draft && r.prerelease && PREVIEW_TAG.test(r.tag_name))
    .sort((a, b) => time(b).localeCompare(time(a)) || (b.published_at ?? "").localeCompare(a.published_at ?? ""));
}

/** The release each channel installs: `stable`, the published release tagged `v<x.y.z>` of the highest version — the
 *  newest, unless an older line's fix is published after it — pre-releases aside; `preview`, the newest published
 *  preview. A draft is neither. A channel with no release is null. */
export function channelReleases(releases: GhRelease[]): { stable: GhRelease | null; preview: GhRelease | null } {
  const version = (r: GhRelease) => (STABLE_TAG.exec(r.tag_name) ?? []).slice(1).map(Number) as number[];
  const stable = releases
    .filter((r) => !r.draft && !r.prerelease && STABLE_TAG.test(r.tag_name))
    .sort((a, b) => {
      const [x, y] = [version(a), version(b)];
      return y[0]! - x[0]! || y[1]! - x[1]! || y[2]! - x[2]!;
    });
  return { stable: stable[0] ?? null, preview: previews(releases)[0] ?? null };
}

/** The channel files' text, `<tag> <SHA-256 of the release's install.sh>` a line, or null for a channel with no
 *  release. Each installer is downloaded and hashed here; where GitHub gives the asset's digest too, the two agree. */
export async function channelFiles(
  releases: GhRelease[],
  download: (url: string) => Promise<Uint8Array>,
): Promise<{ stable: string | null; preview: string | null }> {
  const line = async (r: GhRelease | null): Promise<string | null> => {
    if (!r) return null;
    const asset = r.assets?.find((a) => a.name === "install.sh");
    if (!asset) throw new Error(`${r.tag_name} has no install.sh: its channel can't name it`);
    const sha = createHash("sha256")
      .update(await download(asset.browser_download_url))
      .digest("hex");
    if (asset.digest && asset.digest !== `sha256:${sha}`)
      throw new Error(`${r.tag_name}'s install.sh has the SHA-256 ${sha} here, and ${asset.digest} on GitHub`);
    return `${r.tag_name} ${sha}\n`;
  };
  const { stable, preview } = channelReleases(releases);
  return { stable: await line(stable), preview: await line(preview) };
}

/** The Pages site's own files written into `out`, beside the bootstrap: the channel files — none for a channel with
 *  no release — and `index.html`, which sends a visitor to the repository. Their paths. */
export function writeSite(out: string, repo: string, channels: { stable: string | null; preview: string | null }) {
  if (repoOf(repo) !== repo) throw new Error(`not a repository: ${repo}`);
  mkdirSync(out, { recursive: true });
  const written: string[] = [];
  for (const [name, text] of Object.entries(channels)) {
    rmSync(join(out, name), { force: true });
    if (text === null) continue;
    writeFileSync(join(out, name), text);
    written.push(join(out, name));
  }
  const home = `https://github.com/${repo}`;
  writeFileSync(
    join(out, "index.html"),
    `<!doctype html>\n<meta charset="utf-8">\n<title>slipbox</title>\n<meta http-equiv="refresh" content="0; url=${home}">\n<p><a href="${home}">slipbox</a> is on GitHub.</p>\n`,
  );
  return [...written, join(out, "index.html")];
}

/** The published previews beyond the newest `keep`: the tags to delete. The newest is always kept. */
export function stalePreviews(releases: GhRelease[], keep = 10): string[] {
  if (!Number.isInteger(keep) || keep < 1) throw new Error(`keep at least the newest preview, not ${keep}`);
  return previews(releases)
    .slice(keep)
    .map((r) => r.tag_name);
}

/** The repository's releases, every page of them, through GitHub's CLI (GH_TOKEN in CI). */
function listReleases(repo: string): GhRelease[] {
  return run(["gh", "api", "--paginate", `repos/${repo}/releases?per_page=100`, "--jq", ".[]"])
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as GhRelease);
}

async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`couldn't download ${url}: ${res.status} ${res.statusText}`);
  return new Uint8Array(await res.arrayBuffer());
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
    } else if (step === "notes") {
      const tag = one("tag");
      const preview = tag !== undefined && PREVIEW_TAG.test(tag);
      process.stdout.write(changelogNotes(ROOT, tag, preview ? repoFrom(one("repo")) : undefined));
    } else if (step === "preview") {
      const { version, tag } = previewPlan(ROOT, one("remote"));
      process.stdout.write(`version=${version}\ntag=${tag}\n`);
    } else if (step === "stamp") {
      const version = one("version");
      if (!version) throw new Error("stamp which version? --version <version>");
      stampVersion(ROOT, version, run(["git", "rev-parse", "HEAD"]).trim());
      process.stdout.write(`${releaseVersion(ROOT)}\n`);
    } else if (step === "site") {
      const dir = one("out");
      if (!dir) throw new Error("write the site where? --out <dir>");
      const repo = repoFrom(one("repo"));
      const channels = await channelFiles(listReleases(repo), download);
      for (const p of writeSite(resolve(dir), repo, channels)) process.stdout.write(`${p}\n`);
    } else if (step === "stale") {
      const keep = Number(one("keep") ?? 10);
      for (const tag of stalePreviews(listReleases(repoFrom(one("repo"))), keep)) process.stdout.write(`${tag}\n`);
    } else {
      process.stderr.write(
        "release: build [--target <t>]… [--repo owner/name] [--tag <tag>] [--out <dir>] | finish … | notes … | " +
          "preview [--remote <r>] | stamp --version <v> | site --repo owner/name --out <dir> | stale [--keep <n>]\n",
      );
      process.exit(2);
    }
  } catch (err) {
    process.stderr.write(`release: ${(err as Error).message}\n`);
    process.exit(1);
  }
}
