// Previews and the Pages site (GR-T15; GR-D13, GR-D14): a preview's version and tag, stamped into a checkout and
// refused once its version is released; a preview's installer, notes and SBOM; the channel files made from the
// releases; the previews kept; and the workflows that build, publish and deploy them.
import { afterAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sbom } from "../scripts/check-deps.ts";
import { scriptFor } from "../scripts/ci-scope.ts";
import {
  assetName,
  changelogNotes,
  channelFiles,
  channelReleases,
  finishRelease,
  type GhRelease,
  homebrewFormula,
  hostTarget,
  installScript,
  PREVIEW_TAG,
  PREVIEW_VERSION,
  pagesUrl,
  previewNotes,
  previewOf,
  previewPlan,
  releaseVersion,
  sha256sums,
  signArgs,
  stalePreviews,
  stampVersion,
  TARGETS,
  tagOf,
  utcMinute,
  writeSite,
} from "../scripts/release.ts";

const ROOT = resolve(import.meta.dir, "..");
const sandbox = mkdtempSync(join(tmpdir(), "slipbox-release-"));
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

/** A checkout's version files, at `version`, in a folder of their own; more files beside them where given. */
function checkout(version: string, more: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(sandbox, "co-"));
  const files: Record<string, string> = {
    "package.json": `{\n  "name": "slipbox",\n  "version": "${version}",\n  "dependencies": { "a": "1.0.0" }\n}\n`,
    "src/version.ts": `// The version.\nexport const VERSION = "${version}";\n`,
    ...more,
  };
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

/** 2026-10-12 15:30:59 UTC, in seconds. */
const AT = Date.UTC(2026, 9, 12, 15, 30, 59) / 1000;
const HASH = "1a2b3c4d5e6f708192a3b4c5d6e7f80912345678";
const PREVIEW = "1.2.3-preview.202610121530.g1a2b3c4";
const PREVIEW_TAG_OF = "preview-202610121530-1a2b3c4";

describe("a preview's version and tag (GR-D13)", () => {
  test("the release to come's version, the commit's UTC time to the minute and its hash", () => {
    expect(utcMinute(AT)).toBe("202610121530");
    expect(utcMinute(Date.UTC(2027, 0, 2, 3, 4) / 1000)).toBe("202701020304");
    // UTC whatever this machine's zone: a runner's, a laptop's 14 hours ahead.
    const zone = process.env.TZ;
    process.env.TZ = "Pacific/Kiritimati";
    try {
      expect(new Date(AT * 1000).getHours()).not.toBe(15);
      expect(utcMinute(AT)).toBe("202610121530");
    } finally {
      if (zone === undefined) delete process.env.TZ;
      else process.env.TZ = zone;
    }
    expect(previewOf("1.2.3", AT, HASH)).toEqual({ version: PREVIEW, tag: PREVIEW_TAG_OF });
    expect(PREVIEW_VERSION.test(PREVIEW)).toBe(true);
    expect(PREVIEW_TAG.test(PREVIEW_TAG_OF)).toBe(true);
    // Each version's tag: a preview's own, a release's v<version>.
    expect(tagOf(PREVIEW)).toBe(PREVIEW_TAG_OF);
    expect(tagOf("1.2.3")).toBe("v1.2.3");
    expect(tagOf("1.2.3-rc.1")).toBe("v1.2.3-rc.1");
    // A preview of a version that is itself a pre-release, or of no commit, is refused.
    expect(() => previewOf("1.2.3-rc.1", AT, HASH)).toThrow("a preview is of the release to come, x.y.z");
    expect(() => previewOf("1.2.3", AT, "main")).toThrow("not a commit's hash: main");
    expect(() => previewOf("1.2.3", Number.NaN, HASH)).toThrow("not a time");
  });

  test("a preview sorts after the previews before it, and before the release of its version", () => {
    const earlier = previewOf("1.2.3", AT - 3600, "ffffffff").version;
    const later = previewOf("1.2.3", AT + 60, "00000000").version;
    expect(Bun.semver.order(earlier, PREVIEW)).toBe(-1);
    expect(Bun.semver.order(PREVIEW, later)).toBe(-1);
    expect(Bun.semver.order(later, "1.2.3")).toBe(-1);
    expect(Bun.semver.order("1.2.2", earlier)).toBe(-1);
  });

  test("the version and the tag agree: a release's v<version>, a preview's stamped version and its tag", () => {
    const stamped = checkout(PREVIEW);
    expect(releaseVersion(stamped, PREVIEW_TAG_OF)).toBe(PREVIEW);
    expect(() => releaseVersion(stamped, "v1.2.3")).toThrow(
      `the tag is v1.2.3, the version ${PREVIEW}: tag ${PREVIEW_TAG_OF}`,
    );
    expect(() => releaseVersion(stamped, "preview-202610121531-1a2b3c4")).toThrow("the tag is preview-202610121531");
    // Unstamped, a preview's tag says what's missing.
    const plain = checkout("1.2.3");
    expect(() => releaseVersion(plain, PREVIEW_TAG_OF)).toThrow("stamp the preview's version first");
    expect(releaseVersion(plain, "v1.2.3")).toBe("1.2.3");
  });

  test("stamped into a checkout: package.json and src/version.ts say the preview, the rest of them as they were", () => {
    const dir = checkout("1.2.3");
    const before = readFileSync(join(dir, "package.json"), "utf8");
    stampVersion(dir, PREVIEW, HASH);
    expect(readFileSync(join(dir, "package.json"), "utf8")).toBe(before.replace('"1.2.3"', `"${PREVIEW}"`));
    expect(readFileSync(join(dir, "src/version.ts"), "utf8")).toBe(
      `// The version.\nexport const VERSION = "${PREVIEW}";\n`,
    );
    expect(releaseVersion(dir, PREVIEW_TAG_OF)).toBe(PREVIEW);
    // Again, the same: nothing changes. A release's own version changes nothing either.
    stampVersion(dir, PREVIEW, HASH);
    expect(releaseVersion(dir)).toBe(PREVIEW);
    const release = checkout("1.2.3");
    stampVersion(release, "1.2.3", HASH);
    expect(releaseVersion(release)).toBe("1.2.3");
  });

  test("a stamp refused: not a preview's version, a preview of another version, of another commit", () => {
    const dir = checkout("1.2.3");
    expect(() => stampVersion(dir, "1.2.4", HASH)).toThrow("is neither package.json's version (1.2.3) nor a preview's");
    expect(() => stampVersion(dir, "1.2.4-preview.202610121530.g1a2b3c4", HASH)).toThrow(
      "is a preview of 1.2.4, and package.json's version is 1.2.3",
    );
    expect(() => stampVersion(dir, PREVIEW, "abcdef0123")).toThrow(
      "is a preview of commit 1a2b3c4, and this checkout is at abcdef0",
    );
    expect(releaseVersion(dir)).toBe("1.2.3");
  });

  describe("made from the commit checked out, refused once its version is released", () => {
    /** A repository whose commit is `checkout`'s files, made at a given committer time, its origin a bare one. */
    function repo(date: string): { dir: string; origin: string; git: (...a: string[]) => string } {
      const dir = checkout("1.2.3");
      const origin = mkdtempSync(join(sandbox, "origin-"));
      const env = {
        ...process.env,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_AUTHOR_NAME: "a",
        GIT_AUTHOR_EMAIL: "a@example.com",
        GIT_COMMITTER_NAME: "a",
        GIT_COMMITTER_EMAIL: "a@example.com",
        GIT_COMMITTER_DATE: date,
        // Written years before it was committed: the committer's time is the one a preview takes.
        GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z",
      };
      const git = (cwd: string, ...args: string[]) => {
        const r = Bun.spawnSync(["git", ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
        if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString()}`);
        return r.stdout.toString().trim();
      };
      git(origin, "init", "-q", "--bare");
      git(dir, "init", "-q");
      git(dir, "add", ".");
      git(dir, "commit", "-q", "-m", "x");
      git(dir, "remote", "add", "origin", origin);
      git(dir, "push", "-q", "origin", "HEAD:refs/heads/main");
      return { dir, origin, git: (...a: string[]) => git(dir, ...a) };
    }

    test("its version and tag from package.json's and the commit's committer time, in UTC, and hash", () => {
      // Committed at 18:30 in UTC+3: 15:30 UTC.
      const { dir, git } = repo("2026-10-12T18:30:59+03:00");
      const head = git("rev-parse", "HEAD");
      expect(previewPlan(dir)).toEqual({
        version: `1.2.3-preview.202610121530.g${head.slice(0, 7)}`,
        tag: `preview-202610121530-${head.slice(0, 7)}`,
      });
    }, 30_000);

    test("refused when v<version> is tagged on the remote, lightweight or annotated: bump the version first", () => {
      const { dir, git } = repo("2026-10-12T15:30:00Z");
      git("tag", "v1.2.30");
      git("push", "-q", "origin", "v1.2.30");
      expect(previewPlan(dir).tag).toStartWith("preview-202610121530-");
      git("tag", "v1.2.3");
      // Tagged here only, not on the remote: the remote's tags are what count.
      expect(previewPlan(dir).version).toStartWith("1.2.3-preview.");
      git("push", "-q", "origin", "v1.2.3");
      expect(() => previewPlan(dir)).toThrow("v1.2.3 is released already: bump the version");
      const annotated = repo("2026-10-12T15:30:00Z");
      annotated.git("tag", "-a", "-m", "slipbox 1.2.3", "v1.2.3");
      annotated.git("push", "-q", "origin", "v1.2.3");
      expect(() => previewPlan(annotated.dir)).toThrow("v1.2.3 is released already");
    }, 30_000);

    test("refused when the preview is published already; a remote that can't be read fails", () => {
      const { dir, git } = repo("2026-10-12T15:30:00Z");
      const { tag } = previewPlan(dir);
      git("tag", tag);
      git("push", "-q", "origin", tag);
      expect(() => previewPlan(dir)).toThrow(`${tag} is published already`);
      expect(() => previewPlan(dir, join(sandbox, "no-such-remote"))).toThrow("git ls-remote failed");
    }, 30_000);
  });
});

describe("what a preview carries (GR-D13)", () => {
  test("its installer downloads from its own tag; a release's from v<version>", () => {
    const template = readFileSync(join(ROOT, "scripts", "install.template.sh"), "utf8");
    const sums = { "linux-x64": "a".repeat(64) };
    expect(installScript(template, PREVIEW, "o/r", sums)).toContain(
      `VERSION="${PREVIEW}"\nREPO="o/r"\n# The release's tag, where its packs are: v<version>, or a preview's preview-<time>-<hash>.\nTAG="${PREVIEW_TAG_OF}"\n`,
    );
    expect(installScript(template, "1.2.3", "o/r", sums)).toContain('\nTAG="v1.2.3"\n');
    expect(template).toContain('fetch "$base/$TAG/$name.tar.gz"');
  });

  test.if(hostTarget() !== null)(
    "its installer installs it, fetched from download/<its tag>/: the preview's version, as a release's",
    () => {
      const host = hostTarget()!;
      const work = mkdtempSync(join(sandbox, "inst-"));
      const name = `slipbox-${PREVIEW}-${host}`;
      mkdirSync(join(work, name));
      writeFileSync(join(work, name, "slipbox"), `#!/bin/sh\necho 'slipbox ${PREVIEW}'\n`);
      chmodSync(join(work, name, "slipbox"), 0o755);
      const releases = join(work, "releases");
      mkdirSync(join(releases, "download", PREVIEW_TAG_OF), { recursive: true });
      const pack = join(releases, "download", PREVIEW_TAG_OF, `${name}.tar.gz`);
      expect(Bun.spawnSync(["tar", "-czf", pack, "-C", work, name]).exitCode).toBe(0);
      const installer = join(work, "install.sh");
      const template = readFileSync(join(ROOT, "scripts", "install.template.sh"), "utf8");
      writeFileSync(installer, installScript(template, PREVIEW, "o/r", { [host]: sha256sums([pack]).split(" ")[0]! }));
      const home = join(work, "home");
      mkdirSync(home);
      const env = {
        HOME: home,
        PATH: "/usr/local/bin:/usr/bin:/bin",
        TMPDIR: home,
        SLIPBOX_RELEASES_URL: `file://${releases}`,
      };
      const r = Bun.spawnSync(["sh", installer], { env, cwd: home, timeout: 60_000 });
      expect(r.stderr.toString()).toBe("");
      expect(r.exitCode).toBe(0);
      expect(r.stdout.toString()).toContain(`slipbox: ${PREVIEW} installed:`);
      expect(existsSync(join(home, ".local", "share", "slipbox", "versions", PREVIEW, "slipbox"))).toBe(true);
    },
    60_000,
  );

  test("finished: its sums and installer, and no Homebrew formula — a release's has one", () => {
    const templates = {
      "scripts/install.template.sh": readFileSync(join(ROOT, "scripts", "install.template.sh"), "utf8"),
      "scripts/homebrew.template.rb": readFileSync(join(ROOT, "scripts", "homebrew.template.rb"), "utf8"),
    };
    const preview = checkout(PREVIEW, templates);
    const out = join(preview, "dist");
    mkdirSync(out);
    writeFileSync(join(out, assetName(PREVIEW, "linux-x64")), "x");
    writeFileSync(join(out, assetName(PREVIEW, "darwin-arm64")), "y");
    expect(finishRelease({ repo: "o/r", tag: PREVIEW_TAG_OF, out, root: preview })).toEqual([
      join(out, "SHA256SUMS"),
      join(out, "install.sh"),
    ]);
    expect(existsSync(join(out, "slipbox.rb"))).toBe(false);
    expect(readFileSync(join(out, "install.sh"), "utf8")).toContain(`TAG="${PREVIEW_TAG_OF}"`);
    expect(() => finishRelease({ repo: "o/r", tag: "v1.2.3", out, root: preview })).toThrow("the tag is v1.2.3");
    const release = checkout("1.2.3", templates);
    const rout = join(release, "dist");
    mkdirSync(rout);
    writeFileSync(join(rout, assetName("1.2.3", "linux-x64")), "x");
    expect(finishRelease({ repo: "o/r", tag: "v1.2.3", out: rout, root: release })).toContain(join(rout, "slipbox.rb"));
    expect(() => homebrewFormula(templates["scripts/homebrew.template.rb"], PREVIEW, "o/r", {})).toThrow(
      "a preview's: Homebrew never gets one",
    );
  });

  test("its SBOM names it by its tag", () => {
    const dir = checkout("1.2.3");
    const walk = { packages: [], direct: [] };
    expect(sbom(walk, { version: PREVIEW, repo: "o/r", tag: PREVIEW_TAG_OF }, dir).metadata.component.purl).toBe(
      `pkg:github/o/r@${PREVIEW_TAG_OF}`,
    );
    expect(sbom(walk, { version: "1.2.3", repo: "o/r" }, dir).metadata.component.purl).toBe("pkg:github/o/r@v1.2.3");
  });

  test("its notes: what it is, how to install it from Pages, and the changelog's Unreleased section", () => {
    const changelog =
      "# Changelog\n\n## [Unreleased]\n\n### Added\n\n- A thing.\n\n## [1.2.2] - 2026-10-01\n\n- Old.\n";
    const notes = previewNotes(changelog, PREVIEW, "o/r");
    expect(notes).toStartWith("A preview of slipbox 1.2.3, built from the `test` branch");
    expect(notes).toContain("`curl -fsSL https://o.github.io/r/install.sh | sh -s -- --preview`");
    expect(notes).toEndWith("What's changed since the last release, so far:\n\n### Added\n\n- A thing.\n");
    expect(notes).not.toContain("Old.");
    // Nothing unreleased written, or no changelog: the notes without that part.
    const bare = previewNotes("# Changelog\n\n## [Unreleased]\n\n## [1.2.2] - 2026-10-01\n\n- Old.\n", PREVIEW, "o/r");
    expect(bare).not.toContain("What's changed");
    expect(previewNotes(null, PREVIEW, "o/r")).toBe(bare);
    expect(() => previewNotes(changelog, "1.2.3", "o/r")).toThrow("not a preview's version");
  });

  test("its notes from a checkout, stamped or not; a release's are still its changelog section", () => {
    const changelog = "# Changelog\n\n## [Unreleased]\n\n- Next.\n\n## [1.2.3] - 2026-10-12\n\n- New.\n";
    const plain = checkout("1.2.3", { "CHANGELOG.md": changelog });
    const want = previewNotes(changelog, PREVIEW, "o/r");
    expect(changelogNotes(plain, PREVIEW_TAG_OF, "o/r")).toBe(want);
    expect(changelogNotes(checkout(PREVIEW, { "CHANGELOG.md": changelog }), PREVIEW_TAG_OF, "o/r")).toBe(want);
    expect(() => changelogNotes(checkout(PREVIEW), "preview-202610121531-1a2b3c4", "o/r")).toThrow("the tag is");
    expect(() => changelogNotes(plain, PREVIEW_TAG_OF)).toThrow("--repo owner/name");
    expect(changelogNotes(plain, "v1.2.3")).toBe("- New.\n");
  });

  test("the Pages site's address, from the repository", () => {
    expect(pagesUrl("remziduzagac/slipbox")).toBe("https://remziduzagac.github.io/slipbox");
    expect(pagesUrl("Some-One/Name")).toBe("https://some-one.github.io/Name");
    expect(() => pagesUrl("o/$(x)")).toThrow("not a repository");
  });
});

/** A release as GitHub lists it, its installer an asset unless `assets` says otherwise. */
function rel(tag: string, extra: Partial<GhRelease> = {}): GhRelease {
  return {
    tag_name: tag,
    draft: false,
    prerelease: tag.startsWith("preview-"),
    published_at: "2026-10-12T00:00:00Z",
    assets: [
      { name: "SHA256SUMS", browser_download_url: `https://x/${tag}/SHA256SUMS` },
      { name: "install.sh", browser_download_url: `https://x/${tag}/install.sh` },
    ],
    ...extra,
  };
}

const sha = (s: string) => new Bun.CryptoHasher("sha256").update(s).digest("hex");

/** A download that serves `<url>`'s own text, and records what it was asked. */
function fakeDownload() {
  const asked: string[] = [];
  return {
    asked,
    download: async (url: string) => {
      asked.push(url);
      return new TextEncoder().encode(`installer at ${url}`);
    },
  };
}

describe("the channels (GR-D14)", () => {
  const releases: GhRelease[] = [
    rel("v0.9.0"),
    rel("v0.10.0"), // the highest: 10 > 9, not as text
    rel("v0.11.0", { draft: true }),
    rel("v1.0.0", { prerelease: true }),
    rel("v0.12.0-rc.1"), // not x.y.z: never stable
    rel("nightly"),
    rel("preview-202610121530-1a2b3c4"),
    rel("preview-202610121600-aaaaaaa", { published_at: "2026-10-12T16:10:00Z" }),
    rel("preview-202610121600-bbbbbbb", { published_at: "2026-10-12T16:20:00Z" }), // the same minute, later
    rel("preview-202610130900-ccccccc", { draft: true }), // a draft: not published
    rel("preview-202610130901-ddddddd", { prerelease: false }), // not a pre-release: neither channel
  ];

  test("stable: the highest release tagged v<x.y.z>; preview: the newest published preview — drafts never", () => {
    const { stable, preview } = channelReleases(releases);
    expect(stable?.tag_name).toBe("v0.10.0");
    expect(preview?.tag_name).toBe("preview-202610121600-bbbbbbb");
    expect(channelReleases([])).toEqual({ stable: null, preview: null });
    expect(channelReleases([rel("v1.0.0")]).preview).toBeNull();
    expect(channelReleases([rel("preview-202610121530-1a2b3c4")]).stable).toBeNull();
  });

  test("each channel's file: the release's tag and the SHA-256 of its install.sh, downloaded", async () => {
    const { asked, download } = fakeDownload();
    const files = await channelFiles(releases, download);
    const stableUrl = "https://x/v0.10.0/install.sh";
    const previewUrl = "https://x/preview-202610121600-bbbbbbb/install.sh";
    expect(files).toEqual({
      stable: `v0.10.0 ${sha(`installer at ${stableUrl}`)}\n`,
      preview: `preview-202610121600-bbbbbbb ${sha(`installer at ${previewUrl}`)}\n`,
    });
    expect(asked).toEqual([stableUrl, previewUrl]);
    // A channel with no release has no file.
    expect(await channelFiles([rel("v1.0.0")], download)).toMatchObject({ preview: null });
    expect(await channelFiles([], download)).toEqual({ stable: null, preview: null });
  });

  test("GitHub's digest of the installer, where it gives one, agrees with the download's, or nothing is written", async () => {
    const { download } = fakeDownload();
    const url = "https://x/v1.0.0/install.sh";
    const good = rel("v1.0.0", {
      assets: [{ name: "install.sh", browser_download_url: url, digest: `sha256:${sha(`installer at ${url}`)}` }],
    });
    expect((await channelFiles([good], download)).stable).toBe(`v1.0.0 ${sha(`installer at ${url}`)}\n`);
    const bad = rel("v1.0.0", {
      assets: [{ name: "install.sh", browser_download_url: url, digest: `sha256:${"0".repeat(64)}` }],
    });
    await expect(channelFiles([bad], download)).rejects.toThrow(`and sha256:${"0".repeat(64)} on GitHub`);
    // A release without its installer can't be a channel's.
    await expect(channelFiles([rel("v1.0.0", { assets: [] })], download)).rejects.toThrow("v1.0.0 has no install.sh");
  });

  test("the site's files: the channels a release has, and an index sending visitors to the docs", () => {
    const out = mkdtempSync(join(sandbox, "site-"));
    writeFileSync(join(out, "preview"), "stale\n");
    writeFileSync(join(out, "install.sh"), "#!/bin/sh\n");
    const written = writeSite(out, "o/r", { stable: `v1.0.0 ${"a".repeat(64)}\n`, preview: null });
    expect(written).toEqual([join(out, "stable"), join(out, "index.html")]);
    expect(readFileSync(join(out, "stable"), "utf8")).toBe(`v1.0.0 ${"a".repeat(64)}\n`);
    // No preview: its file goes, not left naming an old one. The bootstrap beside them is left alone.
    expect(existsSync(join(out, "preview"))).toBe(false);
    expect(readFileSync(join(out, "install.sh"), "utf8")).toBe("#!/bin/sh\n");
    expect(readFileSync(join(out, "index.html"), "utf8")).toContain('url=docs/">'); // the docs, beside it
    expect(readFileSync(join(out, "index.html"), "utf8")).toContain('href="https://github.com/o/r"');
    expect(() => writeSite(out, "o/$(r)", { stable: null, preview: null })).toThrow("not a repository");
  });

  test("the previews kept: the newest ten published; the older ones are the ones to delete", () => {
    const list = Array.from({ length: 12 }, (_, i) =>
      rel(`preview-2026101215${String(i).padStart(2, "0")}-${String(i).padStart(7, "0")}`),
    );
    const shuffled = [
      list[3]!,
      rel("v1.0.0"),
      ...list.slice(4),
      list[0]!,
      list[2]!,
      list[1]!,
      rel("preview-202601010000-dddddd0", { draft: true }),
    ];
    expect(stalePreviews(shuffled, 10)).toEqual([list[1]!.tag_name, list[0]!.tag_name]);
    expect(stalePreviews(shuffled)).toEqual(stalePreviews(shuffled, 10));
    expect(stalePreviews(list.slice(0, 10), 10)).toEqual([]);
    expect(() => stalePreviews(list, 0)).toThrow("keep at least the newest preview");
  });
});

// ------------------------------------------------------------------------------------------------------------------
// The workflows

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
}
interface Job {
  uses?: string;
  needs?: string | string[];
  if?: string;
  permissions?: Record<string, string>;
  environment?: { name: string } | string;
  strategy?: { matrix: { include?: { target: string }[]; target?: string[] } };
  with?: Record<string, string | boolean>;
  outputs?: Record<string, string>;
  steps?: Step[];
}
interface Workflow {
  on: Record<string, unknown>;
  permissions?: Record<string, string>;
  concurrency?: { group: string; "cancel-in-progress": boolean };
  jobs: Record<string, Job>;
}

const workflow = (name: string) =>
  Bun.YAML.parse(readFileSync(join(ROOT, ".github", "workflows", name), "utf8")) as Workflow;
const needs = (j: Job) => [j.needs ?? []].flat().sort();
const runs = (j: Job) => (j.steps ?? []).map((s) => s.run ?? "").join("\n");

describe("a Mac's binary signed again (14.13)", () => {
  test("ad hoc, by codesign, when built on a Mac; never elsewhere, nor another platform's", () => {
    expect(signArgs("/x/slipbox", "darwin-arm64", "darwin")).toEqual([
      "codesign",
      "--force",
      "--sign",
      "-",
      "/x/slipbox",
    ]);
    expect(signArgs("/x/slipbox", "darwin-arm64", "linux")).toBeNull();
    expect(signArgs("/x/slipbox", "linux-x64", "darwin")).toBeNull();
    expect(signArgs("/x/slipbox", "linux-arm64-musl", "linux")).toBeNull();
  });
});

describe("the workflows: one build for releases and previews, previews from test, Pages deployed", () => {
  test("every test file bounded at 30 s by `bun run test`, which the check and CI run (a preload's bound reaches one)", () => {
    const scripts = (
      JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> }
    ).scripts;
    expect(scripts.test).toBe("bun test --timeout 30000");
    // The check and CI run the tests a change reaches (D239), each through `bun run test`.
    expect(scripts.check).toEndWith("&& bun run test:changed");
    expect(scripts["test:changed"]).toBe("bun scripts/ci-scope.ts test");
    expect(scriptFor("test", { all: "everything" })).toEqual(["test"]);
    expect(scriptFor("test", { all: null, tests: ["tests/a.test.ts"], checks: [], why: [] })).toEqual([
      "test",
      "./tests/a.test.ts",
    ]);
    for (const name of ["build.yml", "ci.yml"])
      for (const job of Object.values(workflow(name).jobs))
        for (const step of job.steps ?? []) expect(step.run ?? "").not.toMatch(/(^|[^-])\bbun test\b/);
  });
  test("a job that runs the tests installs the whole toolchain: the docs check's tests run typos and lychee", () => {
    for (const name of ["build.yml", "ci.yml"]) {
      for (const [id, job] of Object.entries(workflow(name).jobs)) {
        const steps = job.steps ?? [];
        if (!steps.some((s) => /\bbun (run )?test\b|bun run check\b/.test(s.run ?? ""))) continue;
        const mise = steps.find((s) => s.uses?.startsWith("jdx/mise-action@"));
        expect([name, id, mise?.with?.install_args]).toEqual([name, id, undefined]);
      }
    }
  });
  test("no job runs on an Intel Mac: 0.3.0 was the last release built for one, and CI tests on none", () => {
    const dir = join(ROOT, ".github", "workflows");
    const files = readdirSync(dir).filter((f) => f.endsWith(".yml"));
    expect(files).toContain("ci.yml");
    for (const f of files) {
      // GitHub's Intel Mac runners: macos-13, macos-<n>-intel, macos-<n>-large.
      const intel = readFileSync(join(dir, f), "utf8").match(/\bmacos-(?:13\b|\d+-(?:intel|large)\b)/g);
      expect({ f, intel }).toEqual({ f, intel: null });
    }
  });

  test("build.yml, called with a tag and a version, builds every platform, attests each SBOM, then finishes", () => {
    const build = workflow("build.yml");
    expect(Object.keys(build.on)).toEqual(["workflow_call"]);
    const inputs = (build.on.workflow_call as { inputs: Record<string, { required: boolean; type: string }> }).inputs;
    expect(inputs).toMatchObject({
      tag: { required: true, type: "string" },
      version: { required: true, type: "string" },
    });
    const released = Object.keys(TARGETS).sort();
    expect(build.jobs.build?.strategy?.matrix.include?.map((m) => m.target).sort()).toEqual(released);
    expect([...(build.jobs.sbom?.strategy?.matrix.target ?? [])].sort()).toEqual(released);
    expect(needs(build.jobs.sbom!)).toEqual(["build"]);
    // Nothing is finished until every SBOM is attested; the version is stamped before anything is built or summed.
    expect(needs(build.jobs.finish!)).toEqual(["build", "sbom"]);
    for (const job of [build.jobs.build!, build.jobs.finish!]) {
      const r = runs(job);
      expect(r.indexOf("release.ts stamp --version")).toBeGreaterThanOrEqual(0);
      expect(r.indexOf("release.ts stamp")).toBeLessThan(
        Math.max(r.indexOf("release.ts build"), r.indexOf("release.ts finish")),
      );
    }
    // The tests, when asked, run on the code as committed, before the stamp. Neither caller asks: a preview's commit
    // passed CI before `test` took it, a release's passed `full`, the whole suite, before `main` did (D251) — which the
    // release checks before anything is built.
    const tests = runs(build.jobs.build!).indexOf("bun run test");
    expect(tests).toBeGreaterThanOrEqual(0);
    expect(tests).toBeLessThan(runs(build.jobs.build!).indexOf("release.ts stamp"));
    expect(build.jobs.build!.steps?.find((s) => s.name === "tests")?.if).toContain("inputs.suite");
    const suiteOf = (file: string) =>
      Object.values(workflow(file).jobs).find((j) => j.uses === "./.github/workflows/build.yml")?.with?.suite;
    expect([suiteOf("release.yml"), suiteOf("preview.yml")]).toEqual([false, false]);
    const plan = workflow("release.yml").jobs.plan;
    expect(plan?.steps?.find((s) => s.name === "passed in full")?.run).toContain("check_name=full");
    expect(plan?.permissions?.checks).toBe("read");
    const upload = build.jobs.finish?.steps?.find((s) => s.uses?.startsWith("actions/upload-artifact@"));
    expect(upload?.with?.name).toBe("release");
    // It can't write to the repository: the callers publish.
    for (const job of Object.values(build.jobs)) expect(job.permissions?.contents ?? "none").not.toBe("write");
  });

  test("a release and a preview both build through build.yml, and publish what it made", () => {
    for (const [file, caller] of [
      ["release.yml", workflow("release.yml")],
      ["preview.yml", workflow("preview.yml")],
    ] as const) {
      const build = Object.values(caller.jobs).find((j) => j.uses === "./.github/workflows/build.yml");
      expect(build, file).toBeDefined();
      expect(Object.keys(build?.with ?? {}).sort()).toEqual(["suite", "tag", "version"]);
      expect(needs(caller.jobs.publish!), file).toContain("build");
      const download = caller.jobs.publish?.steps?.find((s) => s.uses?.startsWith("actions/download-artifact@"));
      expect(download?.with?.name, file).toBe("release");
      // The build itself happens only in build.yml.
      expect(runs(caller.jobs.publish!)).not.toContain("release.ts build");
    }
    const release = workflow("release.yml");
    expect(release.on).toEqual({ push: { tags: ["v*"] } });
    expect(runs(release.jobs.publish!)).toContain("--draft --verify-tag");
  });

  test("a preview: on a push to test alone, never a fork's; drafted, its assets uploaded, then published", () => {
    const preview = workflow("preview.yml");
    expect(preview.on).toEqual({ push: { branches: ["test"] } });
    expect(preview.jobs.plan?.if).toContain("!github.event.repository.fork");
    expect(runs(preview.jobs.plan!)).toContain("release.ts preview");
    expect(preview.jobs.build?.with).toEqual({
      suite: false,
      tag: "${{ needs.plan.outputs.tag }}",
      version: "${{ needs.plan.outputs.version }}",
    });
    const steps = preview.jobs.publish?.steps ?? [];
    const draft = steps.findIndex((s) => /gh release create "\$TAG" .*--draft --prerelease/.test(s.run ?? ""));
    const publish = steps.findIndex((s) => /gh release edit "\$TAG" .*--draft=false --prerelease/.test(s.run ?? ""));
    expect(draft).toBeGreaterThan(0);
    expect(publish).toBeGreaterThan(draft);
    expect(steps[draft]?.run).toContain("dist/release/*");
    // Never a whole run cancelled half-made.
    expect(preview.concurrency).toEqual({ group: "preview", "cancel-in-progress": false });
    // The older previews pruned, and Pages deployed once it's published.
    expect(runs(preview.jobs.prune!)).toContain("release.ts stale --repo");
    expect(runs(preview.jobs.prune!)).toContain("--cleanup-tag");
    expect(preview.jobs.pages?.uses).toBe("./.github/workflows/pages.yml");
    expect(needs(preview.jobs.pages!)).toEqual(["publish"]);
    // Only the jobs that publish or delete may write.
    const writers = Object.entries(preview.jobs).filter(([, j]) => j.permissions?.contents === "write");
    expect(writers.map(([id]) => id).sort()).toEqual(["prune", "publish"]);
  });

  test("pages.yml: called, on a release published, on the bootstrap, the docs or the site changed on main, by hand; Pages' grants only in its deploy", () => {
    const pages = workflow("pages.yml");
    expect(Object.keys(pages.on).sort()).toEqual(["push", "release", "workflow_call", "workflow_dispatch"]);
    expect(pages.on.release).toEqual({ types: ["published"] });
    expect(pages.on.push).toEqual({
      branches: ["main"],
      paths: ["scripts/bootstrap*", "docs/**", "site/**", ".github/workflows/pages.yml"],
    });
    expect(pages.concurrency).toEqual({ group: "pages", "cancel-in-progress": false });
    for (const [id, job] of Object.entries(pages.jobs)) {
      const grants = Object.keys(job.permissions ?? {}).filter((p) => p === "pages" || p === "id-token");
      expect(grants, id).toEqual(id === "deploy" ? ["pages", "id-token"] : []);
    }
    expect(pages.jobs.deploy?.permissions).toEqual({ pages: "write", "id-token": "write" });
    expect(pages.jobs.deploy?.environment).toMatchObject({ name: "github-pages" });
    expect(needs(pages.jobs.deploy!)).toEqual(["site"]);
    // The site: the bootstrap (GR-T16's) and the channels, from main, uploaded as Pages' artifact.
    const site = pages.jobs.site!;
    expect(site.if).toContain("!github.event.repository.fork");
    expect(site.steps?.find((s) => s.uses?.startsWith("actions/checkout@"))?.with?.ref).toBe("main");
    expect(runs(site)).toContain('scripts/bootstrap.ts "$GITHUB_REPOSITORY" _site/install.sh');
    expect(runs(site)).toContain('scripts/release.ts site --repo "$GITHUB_REPOSITORY" --out _site');
    // The docs (DS): the site built from docs/ by package.json's script, at docs/ beside the installer.
    expect(runs(site)).toContain("bun run site");
    expect(runs(site)).toContain("cp -R site/dist _site/docs");
    expect(site.steps?.find((s) => s.uses?.startsWith("actions/upload-pages-artifact@"))?.with?.path).toBe("_site");
  });

  test("a release's site deployed by a run by hand on main; every deployment reads its channels back (D258)", () => {
    // Under a `release` event, a deployment of a commit deployed before is reported a success and never served
    // (actions/deploy-pages#383): 0.5.0's `stable` channel wasn't, its commit deployed already by its preview.
    const pages = workflow("pages.yml");
    const redeploy = pages.jobs.redeploy!;
    expect(redeploy.if).toBe("${{ github.event_name == 'release' && !github.event.repository.fork }}");
    expect(redeploy.permissions).toEqual({ actions: "write" });
    expect(runs(redeploy)).toBe('gh workflow run pages.yml --repo "$GITHUB_REPOSITORY" --ref main');
    // Nothing built or deployed under the release's own run: `deploy` waits for `site`, skipped there.
    expect(pages.jobs.site?.if).toBe("${{ !github.event.repository.fork && github.event_name != 'release' }}");
    expect(needs(pages.jobs.deploy!)).toEqual(["site"]);
    // The channels as built, read back from the site, once deployed, until it serves them.
    expect(pages.jobs.site?.outputs).toEqual({
      stable: "${{ steps.site.outputs.stable }}",
      preview: "${{ steps.site.outputs.preview }}",
    });
    expect(runs(pages.jobs.site!)).toContain('echo "$channel=$(cat "_site/$channel" 2>/dev/null || true)"');
    const steps = pages.jobs.deploy?.steps ?? [];
    const deploy = steps.findIndex((s) => s.uses?.startsWith("actions/deploy-pages@"));
    const served = steps.findIndex((s) => s.name === "served");
    expect(deploy).toBeGreaterThanOrEqual(0);
    expect(served).toBeGreaterThan(deploy);
    expect(steps[served]?.env).toEqual({
      SITE: "${{ steps.deploy.outputs.page_url }}",
      STABLE: "${{ needs.site.outputs.stable }}",
      PREVIEW: "${{ needs.site.outputs.preview }}",
    });
    expect(steps[served]?.run).toContain('[ "$(served stable)" = "$STABLE" ] && [ "$(served preview)" = "$PREVIEW" ]');
  });

  test("a job calling a workflow grants it at least what its jobs ask: GitHub won't start it otherwise", () => {
    const level = { none: 0, read: 1, write: 2 } as Record<string, number>;
    let calls = 0;
    for (const file of ["release.yml", "preview.yml"]) {
      for (const [id, job] of Object.entries(workflow(file).jobs)) {
        if (!job.uses?.startsWith("./.github/workflows/")) continue;
        calls++;
        const called = workflow(job.uses.slice("./.github/workflows/".length));
        for (const [cid, cjob] of Object.entries(called.jobs))
          for (const [scope, want] of Object.entries(cjob.permissions ?? {}))
            expect(
              level[job.permissions?.[scope] ?? "none"]!,
              `${file} ${id} → ${cid}: ${scope}`,
            ).toBeGreaterThanOrEqual(level[want]!);
      }
    }
    expect(calls).toBe(3);
  });

  test("Homebrew never gets a pre-release, so never a preview", () => {
    expect(workflow("homebrew.yml").jobs.tap?.if).toContain("!github.event.release.prerelease");
  });

  test("the tap is pushed to with its deploy key, the release environment's secret, never a token", () => {
    const tap = workflow("homebrew.yml").jobs.tap!;
    expect(tap.environment).toBe("release");
    const checkout = tap.steps!.find((s) => s.with?.repository === "${{ vars.HOMEBREW_TAP }}");
    expect(checkout?.with).toMatchObject({ "ssh-key": "${{ secrets.HOMEBREW_TAP_DEPLOY_KEY }}" });
    expect(checkout?.with?.token).toBeUndefined();
  });
});
