import { UNIT_TIMEOUT_MS, TEST_BUDGETS } from "../support/timeouts.ts";
// Distribution (plan 14.x): the supply chain's gates and the notices a release ships (14.10); a release built (14.2).
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { checkDeps, purl, type Sbom } from "../../scripts/check-deps.ts";
import {
  assetName,
  buildArgs,
  buildRelease,
  changelogNotes,
  channelFiles,
  finishRelease,
  homebrewFormula,
  hostTarget,
  installScript,
  releaseNotes,
  releaseVersion,
  repoOf,
  sbomName,
  sha256sums,
  TARGETS,
  writeSite,
} from "../../scripts/release.ts";
import { bootstrapScript } from "../../scripts/bootstrap.ts";
import { RELEASE, RETIRED, retired, tagOf } from "../../src/core/application/distribution/release.ts";
import { VERSION } from "../../src/version.ts";

import { makeDistributionSandbox, ROOT } from "../support/distribution-sandbox.ts";
import { makeDistributionPacks } from "../support/distribution-packs.ts";

// Processes started, repositories made: slow on a loaded or small machine (a small CI runner), not stuck.
setDefaultTimeout(UNIT_TIMEOUT_MS);

const { sandbox, tree } = makeDistributionSandbox();
const { fakePack, fakeReleases } = makeDistributionPacks(sandbox);

describe("a release (14.2)", () => {
  test("the platforms released, by name; this machine's when it's one of them", () => {
    expect(hostTarget("linux", "arm64", false)).toBe("linux-arm64");
    expect(hostTarget("darwin", "arm64", false)).toBe("darwin-arm64");
    // An Intel Mac: none after 0.3.0.
    expect(hostTarget("darwin", "x64", false)).toBeNull();
    // musl's Linux, Alpine's (14.5): its own build; a Mac has no such thing.
    expect(hostTarget("linux", "x64", true)).toBe("linux-x64-musl");
    expect(hostTarget("linux", "arm64", true)).toBe("linux-arm64-musl");
    expect(hostTarget("darwin", "arm64", true)).toBe("darwin-arm64");
    expect(hostTarget("freebsd", "x64")).toBeNull();
    expect(hostTarget("win32", "x64")).toBeNull(); // 14.12, when it's done
  });

  test("a platform released once and no longer: said, with the last release built for it — never one still released", () => {
    expect(retired("darwin-x64")).toBe(
      "Intel Macs aren't supported any more: 0.3.0 was the last release built for them",
    );
    for (const t of ["darwin-arm64", "linux-x64", "linux-arm64-musl", "constructor", "win32-x64"])
      expect(retired(t)).toBeNull();
    for (const t of Object.keys(RETIRED)) expect(TARGETS[t]).toBeUndefined();
    // The last release built for one is a release: x.y.z.
    for (const { last } of Object.values(RETIRED)) expect(last).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("an Intel Mac is told the installer has nothing for it, and the last release that had; nothing downloaded", () => {
    const dir = mkdtempSync(join(sandbox, "intel-"));
    const template = readFileSync(join(ROOT, "scripts", "install.template.sh"), "utf8");
    const sums = Object.fromEntries(Object.keys(TARGETS).map((t, i) => [t, String(i).repeat(64)]));
    writeFileSync(join(dir, "install.sh"), installScript(template, "1.2.3", "example/slipbox", sums));
    const run = (sysctl: string | null) => {
      const fakes = mkdtempSync(join(dir, "fakes-"));
      writeFileSync(join(fakes, "uname"), '#!/bin/sh\ncase "$1" in -s) echo Darwin ;; -m) echo x86_64 ;; esac\n');
      chmodSync(join(fakes, "uname"), 0o755);
      // An Intel Mac's sysctl says 0 of Rosetta, or knows no such name (an older macOS): either way, not translated.
      if (sysctl !== null) {
        writeFileSync(join(fakes, "sysctl"), `#!/bin/sh\n${sysctl}\n`);
        chmodSync(join(fakes, "sysctl"), 0o755);
      }
      const home = mkdtempSync(join(dir, "home-"));
      const r = Bun.spawnSync(["sh", join(dir, "install.sh")], {
        env: {
          HOME: home,
          PATH: `${fakes}:/usr/bin:/bin`,
          TMPDIR: home,
          SLIPBOX_RELEASES_URL: `file://${join(dir, "nowhere")}`,
        },
        cwd: home,
      });
      return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString(), home };
    };
    for (const sysctl of ["echo 0", "echo 'unknown oid' >&2; exit 1", null]) {
      const r = run(sysctl);
      expect(r.code).toBe(1);
      expect(r.err).toBe(`slipbox: ${retired("darwin-x64")}\n`);
      expect(r.out).not.toContain("downloading");
      expect(readdirSync(r.home)).toEqual([]);
    }
  });

  test("the repository released from: owner/name, or a GitHub remote's URL — nothing else", () => {
    for (const s of [
      "o/r",
      "https://github.com/o/r",
      "https://github.com/o/r.git",
      "git@github.com:o/r.git",
      "ssh://git@github.com/o/r.git\n",
    ])
      expect(repoOf(s)).toBe("o/r");
    for (const s of ["https://gitlab.com/o/r", "o", "o/r/x", "", "../r", "o/..", "-o/r", "o/r;x", "o/$(x)"])
      expect(repoOf(s)).toBeNull();
  });

  test("the version: package.json's, the same as src/version.ts's, and the tag's when there is one", () => {
    expect(releaseVersion(ROOT)).toBe(VERSION);
    const root = tree({
      "package.json": JSON.stringify({ version: "1.2.3" }),
      "src/version.ts": 'export const VERSION = "1.2.3";\n',
    });
    expect(releaseVersion(root, "v1.2.3")).toBe("1.2.3");
    expect(() => releaseVersion(root, "v1.2.4")).toThrow("the tag is v1.2.4, the version 1.2.3");
    expect(() => releaseVersion(root, "1.2.3")).toThrow();
    writeFileSync(join(root, "src/version.ts"), 'export const VERSION = "1.2.2";\n');
    expect(() => releaseVersion(root)).toThrow("package.json says 1.2.3, src/version.ts 1.2.2");
  });

  test("built by package.json's own build — its autoload flags kept — for the target, its release defined in it", () => {
    const script = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: { build: string } })
      .scripts.build;
    const args = buildArgs(script, "/out/slipbox", "linux-x64", "o/r");
    expect(args[0]).toBe("build");
    for (const f of [
      "--compile",
      "--no-compile-autoload-bunfig",
      "--no-compile-autoload-dotenv",
      "--no-compile-autoload-tsconfig",
      "--no-compile-autoload-package-json",
    ])
      expect(args).toContain(f);
    expect(args[args.indexOf("--outfile") + 1]).toBe("/out/slipbox");
    expect(args).toContain("--target=bun-linux-x64-baseline");
    expect(args).toContain('--define=SLIPBOX_RELEASE={"repo":"o/r","target":"linux-x64"}');
    expect(args.filter((a) => a.includes("OPENTUI_LIBC"))).toEqual([]);
    // A musl build: Bun's musl target, and OpenTUI told its library is musl's — which it otherwise reads at run time.
    const musl = buildArgs(script, "/out/slipbox", "linux-x64-musl", "o/r");
    expect(musl).toContain("--target=bun-linux-x64-baseline-musl");
    expect(musl).toContain('--define=process.env.OPENTUI_LIBC="musl"');
    expect(buildArgs(script, "/o", "linux-arm64-musl", "o/r")).toContain("--target=bun-linux-arm64-musl");
    expect(() => buildArgs("bun build src/main.ts --outfile x", "/o", "linux-x64", "o/r")).toThrow(
      "isn't a `bun build --compile`",
    );
  });

  test("each worker's script is an entry point of the build, so the compiled binary has it; each started by workerUrl (D232)", () => {
    const script = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: { build: string } })
      .scripts.build;
    const entries = script.split(/\s+/).filter((a) => a.startsWith("src/"));
    const started = new Set<string>();
    for (const f of new Bun.Glob("src/**/*.ts").scanSync(ROOT)) {
      const text = readFileSync(join(ROOT, f), "utf8");
      // A worker started otherwise would be looked for where a compiled binary hasn't got it.
      for (const m of text.matchAll(/new Worker\(([^)]*)/g)) expect(`${f}: ${m[1]}`).toMatch(/: workerUrl\("/);
      for (const m of text.matchAll(/workerUrl\("([^"]+)"\)/g)) started.add(join("src/core", m[1]!));
    }
    expect(started.size).toBeGreaterThan(0);
    expect(entries).toEqual(["src/main.ts", ...[...started].sort()]);
    // Laid out from src/ whatever their number: past eight, Bun kept src/ in their paths, and workerUrl found none.
    expect(script).toContain(" --root=src ");
    for (const e of entries) expect(existsSync(join(ROOT, e))).toBe(true);
  });

  test("SHA256SUMS: a line a file, by name, as sha256sum -c reads it", () => {
    const dir = tree({ "b.tar.gz": "b", "a.tar.gz": "a" });
    expect(sha256sums([join(dir, "b.tar.gz"), join(dir, "a.tar.gz")])).toBe(
      "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb  a.tar.gz\n3e23e8160039594a33894f6564e1b1348bbd7a0088d42c4acb73eeaed59c009d  b.tar.gz\n",
    );
  });

  test("finished only with this version's packs: none, or another version's beside them, is refused", () => {
    expect(() => finishRelease({ repo: "o/r", out: tree({ "x.txt": "" }) })).toThrow(`no packs of ${VERSION}`);
    const out = tree({ [assetName(VERSION, "linux-x64")]: "x", [assetName("0.0.1", "linux-x64")]: "old" });
    expect(() => finishRelease({ repo: "o/r", out })).toThrow("packs of another version");
    // Another version's SBOM too: the release would carry it.
    const sboms = tree({ [assetName(VERSION, "linux-x64")]: "x", [sbomName("0.0.1", "linux-x64")]: "{}" });
    expect(() => finishRelease({ repo: "o/r", out: sboms })).toThrow(sbomName("0.0.1", "linux-x64"));
  });

  test("the release's notes: its version's section of the changelog, without its heading", () => {
    const changelog = [
      "# Changelog",
      "",
      "## [Unreleased]",
      "",
      "### Added",
      "",
      "- Not yet.",
      "",
      "## [1.2.3] - 2026-10-12",
      "",
      "### Added",
      "",
      "- A thing.",
      "",
      "### Fixed",
      "",
      "- Another.",
      "",
      "## [1.2.3-rc.1] - 2026-10-01",
      "",
      "- The candidate.",
      "",
      "## [0.2.3] - 2026-09-01",
      "",
      "- The oldest.",
      "",
      "[unreleased]: https://github.com/o/r/compare/v1.2.3...HEAD",
      "[1.2.3]: https://github.com/o/r/compare/v0.2.3...v1.2.3",
      "",
    ].join("\r\n");
    expect(releaseNotes(changelog, "1.2.3")).toBe("### Added\n\n- A thing.\n\n### Fixed\n\n- Another.\n");
    expect(releaseNotes(changelog, "1.2.3-rc.1")).toBe("- The candidate.\n");
    // The last section ends where the link definitions begin.
    expect(releaseNotes(changelog, "0.2.3")).toBe("- The oldest.\n");
    expect(releaseNotes("## 2.0.0\n\nPlain.\n", "2.0.0")).toBe("Plain.\n");
    expect(releaseNotes("## [v2.0.0] - 2027-01-01\n\nPrefixed.\n", "2.0.0")).toBe("Prefixed.\n");
    // None for the version: refused — a version's digits elsewhere aren't its section.
    expect(() => releaseNotes(changelog, "2.3")).toThrow('no section for 2.3: a "## [2.3] - <date>" heading');
    expect(() => releaseNotes(changelog, "1.2")).toThrow("no section for 1.2");
    expect(() => releaseNotes("## [12.2.3]\n\nx\n", "2.2.3")).toThrow("no section for 2.2.3");
    expect(() => releaseNotes("## [1.0.0] - 2026-10-12\n\n## [0.9.0]\n\n- x\n", "1.0.0")).toThrow(
      "section for 1.0.0 is empty",
    );
  });

  test("the notes made from CHANGELOG.md for the version released; none there, or no changelog, refused", () => {
    const root = tree({
      "package.json": JSON.stringify({ version: "1.2.3" }),
      "src/version.ts": 'export const VERSION = "1.2.3";\n',
    });
    expect(() => changelogNotes(root, "v1.2.3")).toThrow("there's no CHANGELOG.md");
    writeFileSync(join(root, "CHANGELOG.md"), "# Changelog\n\n## [Unreleased]\n\n## [1.2.3] - 2026-10-12\n\n- New.\n");
    expect(changelogNotes(root, "v1.2.3")).toBe("- New.\n");
    expect(() => changelogNotes(root, "v1.2.4")).toThrow("the tag is v1.2.4");
    writeFileSync(join(root, "CHANGELOG.md"), "# Changelog\n\n## [Unreleased]\n\n- New.\n");
    expect(() => changelogNotes(root)).toThrow("no section for 1.2.3");
    // The command the release workflow runs: this repository's notes on stdout, or why there are none, failing.
    let want: { code: number; text: string };
    try {
      want = { code: 0, text: changelogNotes(ROOT, `v${VERSION}`) };
    } catch (err) {
      want = { code: 1, text: `release: ${(err as Error).message}\n` };
    }
    const r = Bun.spawnSync([process.execPath, join(ROOT, "scripts", "release.ts"), "notes", "--tag", `v${VERSION}`]);
    expect({ code: r.exitCode, text: (r.exitCode === 0 ? r.stdout : r.stderr).toString() }).toEqual(want);
  });

  // The release workflow's build, shared with previews (build.yml): tests/release.test.ts.

  test("run from source, slipbox has no release: upgrade and the update check leave it alone", () => {
    expect(RELEASE).toBeNull();
  });

  test("the installer made for a release: its version, repository and sums written in; anything odd refused", () => {
    const template = readFileSync(join(ROOT, "scripts", "install.template.sh"), "utf8");
    const sum = "a".repeat(64);
    const made = installScript(template, "1.2.3", "o/r", { "linux-x64": sum, "darwin-arm64": "b".repeat(64) });
    expect(made).toContain('VERSION="1.2.3"\nREPO="o/r"\n');
    expect(made).toContain(
      `    darwin-arm64) echo ${"b".repeat(64)} ;;\n    linux-x64) echo ${sum} ;;\n    *) return 1 ;;`,
    );
    expect(made).not.toMatch(/@[A-Z]+@/);
    expect(() => installScript(template, "1.2.3;x", "o/r", {})).toThrow("not a version");
    expect(() => installScript(template, "1.2.3", "o/$(r)", {})).toThrow("not a repository");
    expect(() => installScript(template, "1.2.3", "o/r", { "linux-x64": "zz" })).toThrow("not a target and its sum");
    expect(() => installScript(template, "1.2.3", "o/r", { "beos-x64": sum })).toThrow("not a target and its sum");
    expect(() => installScript(`${template}@MORE@`, "1.2.3", "o/r", {})).toThrow("@MORE@ left");
  });

  test("the Homebrew formula (14.3): a block per platform it installs on — macOS, glibc Linux — each pack's address and sum", () => {
    const template = readFileSync(join(ROOT, "scripts", "homebrew.template.rb"), "utf8");
    const sums = {
      "darwin-arm64": "a".repeat(64),
      "darwin-x64": "b".repeat(64),
      "linux-arm64": "c".repeat(64),
      "linux-x64": "d".repeat(64),
      "linux-x64-musl": "e".repeat(64),
    };
    const f = homebrewFormula(template, "1.2.3", "o/r", sums);
    const url = (target: string) =>
      `url "https://github.com/o/r/releases/download/v1.2.3/slipbox-1.2.3-${target}.tar.gz"`;
    const block = (cpu: string, target: string, sum: string) =>
      `    ${cpu} do\n      ${url(target)}\n      sha256 "${sum}"\n    end`;
    // macOS is Apple silicon's alone: arm64 asked for, so an Intel Mac is refused saying so, then its one pack.
    expect(f).toContain(
      `  on_macos do\n    depends_on arch: :arm64\n    ${url("darwin-arm64")}\n    sha256 "${"a".repeat(64)}"\n  end\n  on_linux do\n${block("on_arm", "linux-arm64", "c".repeat(64))}\n${block("on_intel", "linux-x64", "d".repeat(64))}\n  end`,
    );
    // An Intel Mac's pack, were there one, isn't Homebrew's: 0.3.0 was the last release built for them.
    expect(f).not.toContain("darwin-x64");
    expect(f.match(/depends_on/g)).toHaveLength(1);
    expect(f).toContain('  version "1.2.3"\n');
    expect(f).toContain('  license "Apache-2.0"\n');
    expect(f).toContain('  homepage "https://github.com/o/r"\n');
    // musl's isn't Homebrew's: Homebrew on Linux needs glibc.
    expect(f).not.toContain("musl");
    expect(f).not.toMatch(/@[A-Z]+@/);
    // A platform the release hasn't: no block for it.
    const macOnly = homebrewFormula(template, "1.2.3", "o/r", { "darwin-arm64": "a".repeat(64) });
    expect(macOnly).not.toContain("on_linux");
    expect(macOnly).not.toContain("on_intel");
    const linuxOnly = homebrewFormula(template, "1.2.3", "o/r", { "linux-x64": "d".repeat(64) });
    expect(linuxOnly).not.toContain("on_macos");
    expect(linuxOnly).not.toContain("depends_on");
    expect(() => homebrewFormula(template, "1.2.3", "o/r", { "linux-x64-musl": "e".repeat(64) })).toThrow(
      "no pack Homebrew installs",
    );
    expect(() => homebrewFormula(template, "1.2.3", "o/$(r)", sums)).toThrow("not a repository");
    expect(() => homebrewFormula(template, "1.2", "o/r", sums)).toThrow("not a version");
    expect(() => homebrewFormula(template, "1.2.3", "o/r", { "linux-x64": "z" })).toThrow("not a sum");
    // Ruby reads it, where there's a Ruby to ask.
    if (Bun.which("ruby")) {
      const file = join(mkdtempSync(join(sandbox, "rb-")), "slipbox.rb");
      writeFileSync(file, f);
      expect(Bun.spawnSync(["ruby", "-c", file]).stdout.toString()).toBe("Syntax OK\n");
    }
  });

  describe("built for this machine", () => {
    const host = hostTarget();
    let out = "";
    let pack = "";
    /** Where the installer fetches from: a folder laid out as GitHub's releases are, `download/v<version>/<pack>`. */
    let releases = "";
    beforeAll(() => {
      if (!host) return;
      out = mkdtempSync(join(sandbox, "release-"));
      pack = buildRelease({ targets: [host], repo: "example/slipbox", tag: `v${VERSION}`, out })[0]!;
      finishRelease({ repo: "example/slipbox", out });
      releases = mkdtempSync(join(sandbox, "releases-"));
      mkdirSync(join(releases, "download", `v${VERSION}`), { recursive: true });
      symlinkSync(pack, join(releases, "download", `v${VERSION}`, assetName(VERSION, host)));
    }, TEST_BUDGETS.releaseBuild);

    /** The installer run in a home of its own: an environment made from nothing, so it can't reach the real one. */
    function install(
      home: string,
      extra: Record<string, string> = {},
      opts: { fake?: Record<string, string>; from?: string } = {},
    ) {
      let path = "/usr/local/bin:/usr/bin:/bin";
      if (opts.fake) {
        const fake = mkdtempSync(join(sandbox, "fakebin-"));
        for (const [name, body] of Object.entries(opts.fake)) {
          writeFileSync(join(fake, name), `#!/bin/sh\n${body}\n`);
          chmodSync(join(fake, name), 0o755);
        }
        path = `${fake}:${path}`;
      }
      const env = {
        HOME: home,
        PATH: path,
        TMPDIR: home,
        SLIPBOX_RELEASES_URL: `file://${opts.from ?? releases}`,
        ...extra,
      };
      const r = Bun.spawnSync(["sh", join(out, "install.sh")], { env, cwd: home, timeout: 60_000 });
      return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
    }

    test.if(host !== null)(
      "a pack holding the binary, its licence and its notices, in a folder of its name; summed",
      () => {
        expect(pack).toBe(join(out, assetName(VERSION, host!)));
        const listed = Bun.spawnSync(["tar", "-tzf", pack]).stdout.toString().trim().split("\n").sort();
        const dir = `slipbox-${VERSION}-${host}/`;
        expect(listed).toEqual([dir, `${dir}LICENSE`, `${dir}NOTICES.txt`, `${dir}slipbox`]);
        expect(readFileSync(join(out, "SHA256SUMS"), "utf8")).toBe(sha256sums([pack]));
        // Its SBOM beside it, from the walk its notices came from: its version, platform and repository, each package.
        const bom = JSON.parse(readFileSync(join(out, sbomName(VERSION, host!)), "utf8")) as Sbom;
        expect(bom.metadata.component).toMatchObject({
          name: "slipbox",
          version: VERSION,
          purl: `pkg:github/example/slipbox@v${VERSION}`,
          properties: [{ name: "slipbox:target", value: host }],
        });
        const { packages } = checkDeps(ROOT);
        expect(bom.components.filter((c) => c.purl?.startsWith("pkg:npm/")).map((c) => c.purl)).toEqual(
          packages.map((p) => purl(p.name, p.version)),
        );
        // Homebrew's formula beside it, for a platform Homebrew installs on: the pack's address, its sum on the next
        // line (nested as deep as its platform's block is: macOS has one, Linux one per architecture).
        if (!host!.endsWith("-musl")) {
          const lines = readFileSync(join(out, "slipbox.rb"), "utf8")
            .split("\n")
            .map((l) => l.trim());
          const url = `url "https://github.com/example/slipbox/releases/download/v${VERSION}/${assetName(VERSION, host!)}"`;
          expect(lines).toContain(url);
          expect(lines[lines.indexOf(url) + 1]).toBe(`sha256 "${sha256sums([pack]).split(" ")[0]}"`);
        }
      },
      TEST_BUDGETS.releaseIntegration,
    );

    test.if(host !== null)(
      "the binary knows its release — its repository and platform — its notices are there, and it carries the skill",
      () => {
        const x = mkdtempSync(join(sandbox, "unpacked-"));
        expect(Bun.spawnSync(["tar", "-xzf", pack, "-C", x]).exitCode).toBe(0);
        const dir = join(x, `slipbox-${VERSION}-${host}`);
        const notes = join(x, "notes");
        mkdirSync(notes);
        writeFileSync(join(notes, "a.md"), "# A\n");
        const env = {
          ...process.env,
          XDG_STATE_HOME: join(x, "state"),
          XDG_CACHE_HOME: join(x, "cache"),
          XDG_DATA_HOME: join(x, "data"),
        };
        const info = Bun.spawnSync([join(dir, "slipbox"), "info", "--json"], { cwd: notes, env, timeout: 30_000 });
        expect(info.exitCode).toBe(0);
        expect(JSON.parse(info.stdout.toString()).data.release).toEqual({ repo: "example/slipbox", target: host });
        // The skill for agents built in (GR-D10): the binary prints it, away from the source, as the source has it.
        const skill = Bun.spawnSync([join(dir, "slipbox"), "skill"], { cwd: notes, env, timeout: 30_000 });
        expect(skill.exitCode).toBe(0);
        expect(skill.stdout.toString()).toBe(readFileSync(join(ROOT, "skills", "slipbox", "SKILL.md"), "utf8"));
        expect(readFileSync(join(dir, "NOTICES.txt"), "utf8")).toStartWith(
          `slipbox ${VERSION}: the third-party software in this program`,
        );
      },
      TEST_BUDGETS.releaseIntegration,
    );

    test.if(host !== null)(
      "installed (14.7): a folder per version, current, a link in ~/.local/bin — it runs; again, the same",
      () => {
        const home = mkdtempSync(join(sandbox, "home-"));
        const r = install(home);
        expect(r.err).toBe("");
        expect(r.code).toBe(0);
        const data = join(home, ".local", "share", "slipbox");
        const link = join(home, ".local", "bin", "slipbox");
        expect(r.out).toContain(`slipbox: ${VERSION} installed: ${link} -> ${data}/versions/${VERSION}`);
        // Not on this PATH: said, with how.
        expect(r.out).toContain(`${join(home, ".local", "bin")} isn't on your PATH`);
        expect(readlinkSync(join(data, "current"))).toBe(`versions/${VERSION}`);
        expect(readlinkSync(link)).toBe(join(data, "current", "slipbox"));
        expect(existsSync(join(data, "versions", VERSION, "NOTICES.txt"))).toBe(true);
        expect(readFileSync(join(data, "bin-link"), "utf8")).toBe(`${link}\n`);
        expect(Bun.spawnSync([link, "--version"]).stdout.toString()).toBe(`slipbox ${VERSION}\n`);
        // Run again: the same, and nothing left behind.
        const again = install(home, { PATH: `${join(home, ".local", "bin")}:/usr/bin:/bin` });
        expect(again.code).toBe(0);
        expect(again.out).not.toContain("isn't on your PATH");
        expect(readlinkSync(link)).toBe(join(data, "current", "slipbox"));
        expect(Bun.spawnSync(["ls", join(data, "versions")]).stdout.toString()).toBe(`${VERSION}\n`);
        expect(Bun.spawnSync(["sh", "-c", `ls -d ${home}/slipbox-install.* 2>/dev/null`]).stdout.toString()).toBe("");
      },
      TEST_BUDGETS.releaseIntegration,
    );

    test.if(host !== null)(
      "uninstalled (14.8): listed first, nothing removed without --yes; --purge takes slipbox's folders too",
      () => {
        const home = mkdtempSync(join(sandbox, "home-"));
        expect(install(home).code).toBe(0);
        // Every folder of slipbox's in this home, said: nothing reaches the real ones.
        const env = {
          HOME: home,
          PATH: "/usr/bin:/bin",
          TMPDIR: home,
          XDG_CONFIG_HOME: join(home, ".config"),
          XDG_STATE_HOME: join(home, ".local", "state"),
          XDG_DATA_HOME: join(home, ".local", "share"),
          XDG_CACHE_HOME: join(home, ".cache"),
        };
        mkdirSync(join(home, ".config", "slipbox"), { recursive: true });
        writeFileSync(join(home, ".config", "slipbox", "config.toml"), 'theme = "nord"\n');
        const link = join(home, ".local", "bin", "slipbox");
        const data = join(home, ".local", "share", "slipbox");
        const listed = Bun.spawnSync([link, "uninstall", "--json"], { env, cwd: home });
        expect(listed.exitCode).toBe(0);
        const plan = JSON.parse(listed.stdout.toString()).data;
        expect(plan.removed).toBe(false);
        expect(plan.remove.map((i: { path: string }) => i.path)).toEqual([
          link,
          join(data, "versions"),
          join(data, "current"),
          join(data, "bin-link"),
          join(data, "channel"),
        ]);
        // The state folder too: the CLI marks when it was last used (20.9), this run included.
        expect(plan.keep.map((i: { path: string }) => i.path)).toEqual([
          join(home, ".config", "slipbox"),
          join(home, ".local", "state", "slipbox"),
          data,
        ]);
        expect(existsSync(link)).toBe(true);
        const human = Bun.spawnSync([link, "uninstall"], { env, cwd: home }).stdout.toString();
        expect(human).toContain(`~/.local/share/slipbox/versions  slipbox ${VERSION}`);
        expect(human).toContain("keeps (--purge removes them too):\n  ~/.config/slipbox");
        expect(human).toContain("nothing removed yet: again with --yes to remove these");
        // Removed: the running binary's own install, by itself.
        const done = Bun.spawnSync([link, "uninstall", "--yes"], { env, cwd: home });
        expect(done.exitCode).toBe(0);
        expect(done.stdout.toString()).toStartWith("removed:\n");
        for (const p of [
          link,
          join(data, "versions"),
          join(data, "current"),
          join(data, "bin-link"),
          join(data, "channel"),
        ])
          expect(existsSync(p)).toBe(false);
        expect(readFileSync(join(home, ".config", "slipbox", "config.toml"), "utf8")).toBe('theme = "nord"\n');
        // --purge: the folders too, from source now the binary's gone.
        const purged = Bun.spawnSync(
          [process.execPath, join(ROOT, "src", "main.ts"), "uninstall", "--purge", "--yes"],
          { env, cwd: home },
        );
        expect(purged.exitCode).toBe(0);
        // All gone, and the run that purged them wrote nothing back after.
        for (const p of [
          join(home, ".config", "slipbox"),
          join(home, ".local", "state", "slipbox"),
          data,
          join(home, ".cache", "slipbox"),
        ])
          expect(existsSync(p)).toBe(false);
        expect(existsSync(join(home, ".config"))).toBe(true);
      },
      TEST_BUDGETS.releaseIntegration,
    );

    test.if(host !== null)(
      "upgraded (14.4): the installed binary moves itself to the latest release — checked, the old one kept",
      () => {
        const home = mkdtempSync(join(sandbox, "home-"));
        expect(install(home).code).toBe(0);
        const link = join(home, ".local", "bin", "slipbox");
        const data = join(home, ".local", "share", "slipbox");
        const env = (base: string) => ({
          HOME: home,
          PATH: "/usr/bin:/bin",
          TMPDIR: home,
          XDG_CONFIG_HOME: join(home, ".config"),
          XDG_STATE_HOME: join(home, ".local", "state"),
          XDG_DATA_HOME: join(home, ".local", "share"),
          XDG_CACHE_HOME: join(home, ".cache"),
          SLIPBOX_RELEASES_URL: `file://${base}`,
        });
        const run = (base: string, ...args: string[]) => {
          const r = Bun.spawnSync([link, "upgrade", ...args, "--json"], { env: env(base), cwd: home, timeout: 60_000 });
          return { code: r.exitCode, json: JSON.parse(r.stdout.toString()) };
        };
        // The latest is this one: nothing to do.
        const same = fakeReleases(fakePack(mkdtempSync(join(sandbox, "p-")), VERSION, host!), VERSION);
        expect(run(same).json.data).toEqual({ status: "current", from: VERSION, latest: VERSION, removed: [] });
        const next = fakeReleases(fakePack(mkdtempSync(join(sandbox, "p-")), "9.9.9", host!), "9.9.9");
        // --check: said, nothing changed.
        expect(run(next, "--check").json.data).toEqual({
          status: "available",
          from: VERSION,
          latest: "9.9.9",
          removed: [],
        });
        expect(readlinkSync(join(data, "current"))).toBe(`versions/${VERSION}`);
        // A pack whose sum isn't its SHA256SUMS line: refused, nothing changed.
        const p = fakePack(mkdtempSync(join(sandbox, "p-")), "9.9.9", host!);
        const lying = fakeReleases(p, "9.9.9", `${"0".repeat(64)}  ${p.asset}\n`);
        const refused = run(lying);
        expect(refused.code).toBe(1);
        expect(refused.json.error.message).toContain("the download's SHA-256 is");
        expect(readlinkSync(join(data, "current"))).toBe(`versions/${VERSION}`);
        expect(Bun.spawnSync(["ls", "-A", join(data, "versions")]).stdout.toString()).toBe(`${VERSION}\n`);
        // Upgraded: current moved, the link runs the new one, the old one kept.
        const done = run(next, "--no-skill");
        expect(done.code).toBe(0);
        expect(done.json.data).toMatchObject({ status: "upgraded", from: VERSION, latest: "9.9.9", removed: [] });
        expect(readlinkSync(join(data, "current"))).toBe("versions/9.9.9");
        expect(Bun.spawnSync([link, "--version"]).stdout.toString()).toBe("slipbox 9.9.9\n");
        expect(existsSync(join(data, "versions", VERSION, "slipbox"))).toBe(true);
        // A copy not the installer's — the binary unpacked anywhere — isn't upgraded.
        const loose = mkdtempSync(join(sandbox, "loose-"));
        copyFileSync(join(data, "versions", VERSION, "slipbox"), join(loose, "slipbox"));
        chmodSync(join(loose, "slipbox"), 0o755);
        const r = Bun.spawnSync([join(loose, "slipbox"), "upgrade", "--json"], { env: env(next), cwd: home });
        expect(r.exitCode).toBe(1);
        expect(JSON.parse(r.stdout.toString()).error.message).toBe(
          `this slipbox (${join(loose, "slipbox")}) wasn't installed by its installer: upgrade it the way it was installed`,
        );
      },
      TEST_BUDGETS.releaseIntegration,
    );

    test.if(host !== null)(
      "installed through the Pages bootstrap: slipbox channel says the channel and sets it; upgrade follows it to a preview",
      async () => {
        // The releases: this one under its tag, with its installer; a preview after it, its pack a script saying its
        // version. The site names both, as the Pages workflow writes it.
        const releases = mkdtempSync(join(sandbox, "releases-"));
        const tagDir = join(releases, "download", `v${VERSION}`);
        mkdirSync(tagDir, { recursive: true });
        symlinkSync(pack, join(tagDir, assetName(VERSION, host!)));
        copyFileSync(join(out, "install.sh"), join(tagDir, "install.sh"));
        mkdirSync(join(releases, "latest", "download"), { recursive: true });
        copyFileSync(join(out, "SHA256SUMS"), join(releases, "latest", "download", "SHA256SUMS"));
        const pv = "9.9.9-preview.202610121530.g1a2b3c4";
        const pvDir = join(releases, "download", tagOf(pv));
        mkdirSync(pvDir, { recursive: true });
        const p = fakePack(mkdtempSync(join(sandbox, "p-")), pv, host!);
        copyFileSync(p.file, join(pvDir, p.asset));
        writeFileSync(join(pvDir, "SHA256SUMS"), `${p.sha}  ${p.asset}\n`);
        const template = readFileSync(join(ROOT, "scripts", "install.template.sh"), "utf8");
        writeFileSync(join(pvDir, "install.sh"), installScript(template, pv, "example/slipbox", { [host!]: p.sha }));
        const pages = mkdtempSync(join(sandbox, "pages-"));
        const installer = (tag: string) => [
          { name: "install.sh", browser_download_url: join(releases, "download", tag, "install.sh") },
        ];
        const files = await channelFiles(
          [
            { tag_name: `v${VERSION}`, draft: false, prerelease: false, assets: installer(`v${VERSION}`) },
            { tag_name: tagOf(pv), draft: false, prerelease: true, assets: installer(tagOf(pv)) },
          ],
          async (path) => readFileSync(path),
        );
        writeSite(pages, "example/slipbox", files);
        const boot = join(pages, "install.sh");
        writeFileSync(
          boot,
          bootstrapScript(readFileSync(join(ROOT, "scripts", "bootstrap.template.sh"), "utf8"), "example/slipbox"),
        );

        const home = mkdtempSync(join(sandbox, "home-"));
        const env = {
          HOME: home,
          PATH: "/usr/bin:/bin",
          TMPDIR: home,
          XDG_CONFIG_HOME: join(home, ".config"),
          XDG_STATE_HOME: join(home, ".local", "state"),
          XDG_DATA_HOME: join(home, ".local", "share"),
          XDG_CACHE_HOME: join(home, ".cache"),
          SLIPBOX_CHANNELS_URL: `file://${pages}`,
          SLIPBOX_RELEASES_URL: `file://${releases}`,
        };
        const installed = Bun.spawnSync(["sh", boot], { env, cwd: home, timeout: 60_000 });
        expect(installed.stderr.toString()).toBe("");
        expect(installed.exitCode).toBe(0);
        const link = join(home, ".local", "bin", "slipbox");
        const data = join(home, ".local", "share", "slipbox");
        const run = (...args: string[]) => {
          const r = Bun.spawnSync([link, ...args], { env, cwd: home, timeout: 60_000 });
          return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
        };
        expect(run("--version").out).toBe(`slipbox ${VERSION}\n`);
        expect(run("channel")).toEqual({ code: 0, out: "stable: this slipbox follows stable releases\n", err: "" });
        expect(JSON.parse(run("channel", "--json").out).data).toEqual({ channel: "stable" });
        // On stable, the preview isn't offered.
        expect(JSON.parse(run("upgrade", "--check", "--json").out).data).toEqual({
          status: "current",
          from: VERSION,
          latest: VERSION,
          removed: [],
        });
        expect(run("channel", "set", "preview")).toEqual({
          code: 0,
          out: "preview: this slipbox follows previews now, and the stable release when it's newer — slipbox upgrade installs the newest\n",
          err: "",
        });
        expect(readFileSync(join(data, "channel"), "utf8")).toBe("preview\n");
        expect(run("channel", "set", "preview").out).toBe(
          "preview already: this slipbox follows previews, and the stable release when it's newer\n",
        );
        expect(run("upgrade", "--check").out).toBe(
          `slipbox ${pv} is out on the preview channel (this is ${VERSION}): slipbox upgrade installs it\n`,
        );
        expect(JSON.parse(run("channel", "set", "stable", "--json").out).data).toEqual({
          channel: "stable",
          previous: "preview",
        });
        expect(readFileSync(join(data, "channel"), "utf8")).toBe("stable\n");
        expect(run("channel", "set", "beta").code).toBe(2);
        expect(readFileSync(join(data, "channel"), "utf8")).toBe("stable\n");
        // What's offered older than what's installed (a preview, back on stable): it stays, and said so.
        const older = fakeReleases(fakePack(mkdtempSync(join(sandbox, "p-")), "0.0.1", host!), "0.0.1");
        const kept = Bun.spawnSync([link, "upgrade", "--check"], {
          env: { ...env, SLIPBOX_RELEASES_URL: `file://${older}` },
          cwd: home,
        });
        expect(kept.stdout.toString()).toBe(
          `slipbox ${VERSION} is newer than the latest release, 0.0.1: it stays until a newer one\n`,
        );
        // Previews again, and upgraded to the newest.
        expect(run("channel", "set", "preview").code).toBe(0);
        expect(JSON.parse(run("upgrade", "--json").out).data).toMatchObject({
          status: "upgraded",
          from: VERSION,
          latest: pv,
          removed: [],
        });
        expect(run("--version").out).toBe(`slipbox ${pv}\n`);
        expect(readlinkSync(join(data, "current"))).toBe(`versions/${pv}`);
        expect(readFileSync(join(data, "channel"), "utf8")).toBe("preview\n");
        // A copy not the installer's has no channel: refused, saying how it updates.
        const loose = mkdtempSync(join(sandbox, "loose-"));
        copyFileSync(join(data, "versions", VERSION, "slipbox"), join(loose, "slipbox"));
        chmodSync(join(loose, "slipbox"), 0o755);
        const r = Bun.spawnSync([join(loose, "slipbox"), "channel", "set", "stable", "--json"], { env, cwd: home });
        expect(r.exitCode).toBe(5);
        expect(JSON.parse(r.stdout.toString()).error.message).toBe(
          `this slipbox (${join(loose, "slipbox")}) wasn't installed by its installer: it has no channel — releases are at https://github.com/example/slipbox/releases`,
        );
        expect(readFileSync(join(data, "channel"), "utf8")).toBe("preview\n");
      },
      TEST_BUDGETS.releaseIntegration,
    );

    test.if(host !== null)(
      "XDG_DATA_HOME and SLIPBOX_BIN_DIR followed when absolute; a relative one, as XDG says, not",
      () => {
        const home = mkdtempSync(join(sandbox, "home-"));
        const r = install(home, { XDG_DATA_HOME: join(home, "d"), SLIPBOX_BIN_DIR: join(home, "b") });
        expect(r.code).toBe(0);
        expect(readlinkSync(join(home, "b", "slipbox"))).toBe(join(home, "d", "slipbox", "current", "slipbox"));
        const other = mkdtempSync(join(sandbox, "home-"));
        expect(install(other, { XDG_DATA_HOME: "d", SLIPBOX_BIN_DIR: "b" }).code).toBe(0);
        expect(readlinkSync(join(other, ".local", "bin", "slipbox"))).toBe(
          join(other, ".local", "share", "slipbox", "current", "slipbox"),
        );
      },
      TEST_BUDGETS.releaseIntegration,
    );

    test.if(host !== null)(
      "a pack that isn't the release's — its SHA-256 another — is refused; nothing installed",
      () => {
        const home = mkdtempSync(join(sandbox, "home-"));
        const bad = mkdtempSync(join(sandbox, "releases-"));
        mkdirSync(join(bad, "download", `v${VERSION}`), { recursive: true });
        const tampered = join(bad, "download", `v${VERSION}`, assetName(VERSION, host!));
        copyFileSync(pack, tampered);
        writeFileSync(tampered, Buffer.concat([readFileSync(tampered), Buffer.from("x")]));
        const r = install(home, {}, { from: bad });
        expect(r.code).toBe(1);
        expect(r.err).toContain("the download's SHA-256 is");
        expect(r.err).toContain("nothing installed");
        expect(existsSync(join(home, ".local", "share", "slipbox"))).toBe(false);
        expect(existsSync(join(home, ".local", "bin", "slipbox"))).toBe(false);
      },
      TEST_BUDGETS.releaseIntegration,
    );

    test.if(host !== null)(
      "a slipbox there already that isn't the installer's is left as it is, and said — before any download",
      () => {
        const home = mkdtempSync(join(sandbox, "home-"));
        mkdirSync(join(home, ".local", "bin"), { recursive: true });
        writeFileSync(join(home, ".local", "bin", "slipbox"), "#!/bin/sh\n# a launcher\n");
        const r = install(home, {}, { from: join(sandbox, "nowhere") });
        expect(r.code).toBe(1);
        expect(r.err).toContain("isn't this installer's: remove it (or set SLIPBOX_BIN_DIR)");
        expect(r.out).not.toContain("downloading");
        expect(readFileSync(join(home, ".local", "bin", "slipbox"), "utf8")).toBe("#!/bin/sh\n# a launcher\n");
        // A link of its own, someone else's: the same.
        const linked = mkdtempSync(join(sandbox, "home-"));
        mkdirSync(join(linked, ".local", "bin"), { recursive: true });
        symlinkSync("/usr/bin/true", join(linked, ".local", "bin", "slipbox"));
        expect(install(linked).code).toBe(1);
        expect(readlinkSync(join(linked, ".local", "bin", "slipbox"))).toBe("/usr/bin/true");
      },
      TEST_BUDGETS.releaseIntegration,
    );

    test.if(host !== null)(
      "a pack whose binary isn't the release's — another version said, or none in it — is refused",
      () => {
        const fakeRelease = (files: Record<string, string>) => {
          const dir = mkdtempSync(join(sandbox, "fake-"));
          const name = `slipbox-${VERSION}-${host}`;
          for (const [f, body] of Object.entries(files)) {
            mkdirSync(join(dir, name), { recursive: true });
            writeFileSync(join(dir, name, f), body);
            chmodSync(join(dir, name, f), 0o755);
          }
          mkdirSync(join(dir, "r", "download", `v${VERSION}`), { recursive: true });
          const tar = join(dir, "r", "download", `v${VERSION}`, assetName(VERSION, host!));
          expect(Bun.spawnSync(["tar", "-czf", tar, "-C", dir, name]).exitCode).toBe(0);
          const sum = sha256sums([tar]).split(" ")[0]!;
          const script = join(dir, "install.sh");
          writeFileSync(
            script,
            installScript(
              readFileSync(join(ROOT, "scripts", "install.template.sh"), "utf8"),
              VERSION,
              "example/slipbox",
              { [host!]: sum },
            ),
          );
          return { from: join(dir, "r"), script };
        };
        const run = (f: { from: string; script: string }) => {
          const home = mkdtempSync(join(sandbox, "home-"));
          const r = Bun.spawnSync(["sh", f.script], {
            env: { HOME: home, PATH: "/usr/bin:/bin", TMPDIR: home, SLIPBOX_RELEASES_URL: `file://${f.from}` },
            cwd: home,
          });
          return {
            code: r.exitCode,
            err: r.stderr.toString(),
            installed: existsSync(join(home, ".local", "share", "slipbox")),
          };
        };
        const lying = run(fakeRelease({ slipbox: "#!/bin/sh\necho 'slipbox 0.0.1'\n" }));
        expect(lying).toEqual({
          code: 1,
          err: `slipbox: the binary says "slipbox 0.0.1", not "slipbox ${VERSION}": nothing installed\n`,
          installed: false,
        });
        const empty = run(fakeRelease({ "NOTICES.txt": "" }));
        expect(empty).toEqual({
          code: 1,
          err: "slipbox: the pack has no slipbox in it: nothing installed\n",
          installed: false,
        });
        const broken = run(fakeRelease({ slipbox: "#!/bin/sh\necho 'cannot execute' >&2\nexit 126\n" }));
        expect(broken).toEqual({
          code: 1,
          err: "slipbox: the binary doesn't run here: cannot execute\n",
          installed: false,
        });
      },
      TEST_BUDGETS.releaseIntegration,
    );

    test("on Alpine, a binary that won't load says what to add: libstdc++ and libgcc", () => {
      const dir = mkdtempSync(join(sandbox, "alpine-"));
      const target = "linux-x64-musl";
      const name = `slipbox-${VERSION}-${target}`;
      mkdirSync(join(dir, name));
      // What a bare Alpine's loader says of Bun's musl build: the C++ runtime missing, then a symbol per line.
      const loader =
        "Error loading shared library libstdc++.so.6: No such file or directory (needed by /w/slipbox)\n" +
        "Error relocating /w/slipbox: __cxa_pure_virtual: symbol not found\n";
      writeFileSync(join(dir, name, "slipbox"), `#!/bin/sh\nprintf '${loader}' >&2\nexit 127\n`);
      chmodSync(join(dir, name, "slipbox"), 0o755);
      mkdirSync(join(dir, "r", "download", `v${VERSION}`), { recursive: true });
      const tar = join(dir, "r", "download", `v${VERSION}`, assetName(VERSION, target));
      expect(Bun.spawnSync(["tar", "-czf", tar, "-C", dir, name]).exitCode).toBe(0);
      const template = readFileSync(join(ROOT, "scripts", "install.template.sh"), "utf8");
      const sums = { [target]: sha256sums([tar]).split(" ")[0]! };
      writeFileSync(join(dir, "install.sh"), installScript(template, VERSION, "example/slipbox", sums));
      // An x64 Linux whose C library is musl's, as Alpine's.
      const fakes = join(dir, "fakes");
      mkdirSync(fakes);
      writeFileSync(join(fakes, "uname"), '#!/bin/sh\ncase "$1" in -s) echo Linux ;; -m) echo x86_64 ;; esac\n');
      writeFileSync(join(fakes, "ldd"), "#!/bin/sh\necho 'musl libc (x86_64)'\n");
      for (const f of ["uname", "ldd"]) chmodSync(join(fakes, f), 0o755);
      const home = mkdtempSync(join(sandbox, "home-"));
      const r = Bun.spawnSync(["sh", join(dir, "install.sh")], {
        env: {
          HOME: home,
          PATH: `${fakes}:/usr/bin:/bin`,
          TMPDIR: home,
          SLIPBOX_RELEASES_URL: `file://${join(dir, "r")}`,
        },
        cwd: home,
      });
      expect(r.exitCode).toBe(1);
      expect(r.stderr.toString()).toBe(
        "slipbox: the binary doesn't run here: on Alpine, slipbox needs libstdc++ and libgcc (apk add libstdc++ libgcc). " +
          "It said: Error loading shared library libstdc++.so.6: No such file or directory (needed by /w/slipbox)\n",
      );
      expect(existsSync(join(home, ".local", "share", "slipbox"))).toBe(false);
    });

    test.if(host !== null)(
      "no build for the machine: another system, another processor, musl, one this release hasn't",
      () => {
        const home = mkdtempSync(join(sandbox, "home-"));
        const uname = (s: string, m: string) => `case "$1" in -s) echo ${s} ;; -m) echo ${m} ;; esac`;
        const glibc = "echo 'ldd (GNU libc) 2.39'";
        expect(install(home, {}, { fake: { uname: uname("FreeBSD", "amd64"), ldd: glibc } }).err).toContain(
          "no release for FreeBSD yet",
        );
        expect(install(home, {}, { fake: { uname: uname("Linux", "riscv64"), ldd: glibc } }).err).toContain(
          "no release for riscv64 processors",
        );
        // musl (Alpine): its own build, which this release, built for this machine only, hasn't.
        expect(
          install(home, {}, { fake: { uname: uname("Linux", "aarch64"), ldd: "echo 'musl libc (aarch64)'" } }).err,
        ).toContain(`this release (${VERSION}) has no linux-arm64-musl build`);
        const other = host === "linux-x64" ? ["aarch64", "linux-arm64"] : ["x86_64", "linux-x64"];
        expect(install(home, {}, { fake: { uname: uname("Linux", other[0]!), ldd: glibc } }).err).toContain(
          `this release (${VERSION}) has no ${other[1]} build`,
        );
        // A Mac's terminal under Rosetta says x64: the arm64 build is the one it gets — installed, on an arm64 Mac,
        // whose release has it.
        const mac = { uname: uname("Darwin", "x86_64"), sysctl: "echo 1" };
        if (host === "darwin-arm64")
          expect(install(mkdtempSync(join(sandbox, "home-")), {}, { fake: mac }).code).toBe(0);
        else expect(install(home, {}, { fake: mac }).err).toContain("has no darwin-arm64 build");
        // An Intel Mac: none built for it after 0.3.0, said before anything is downloaded.
        expect(install(home, {}, { fake: { ...mac, sysctl: "echo 0" } }).err).toBe(
          `slipbox: ${retired("darwin-x64")}\n`,
        );
        expect(existsSync(join(home, ".local"))).toBe(false);
      },
      TEST_BUDGETS.releaseIntegration,
    );
  });
});
