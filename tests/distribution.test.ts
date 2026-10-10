// Distribution (plan 14.x): the supply chain's gates and the notices a release ships (14.10); a release built (14.2).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { bunfigProblems, checkDeps, licenceProblems, licenceTaken, notices, type Package, productionPackages, repoLink, specProblems, workflowProblems } from "../scripts/check-deps.ts";
import { assetName, buildArgs, buildRelease, finishRelease, hostTarget, installScript, releaseVersion, repoOf, sha256sums } from "../scripts/release.ts";
import { RELEASE } from "../src/core/release.ts";
import { installation, removable, type Stores, uninstall, uninstallPlan } from "../src/core/install.ts";
import { VERSION } from "../src/version.ts";

const ROOT = resolve(import.meta.dir, "..");
const sandbox = mkdtempSync(join(tmpdir(), "slipbox-dist-"));
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

/** A folder of files, made. */
function tree(files: Record<string, string>): string {
  const dir = mkdtempSync(join(sandbox, "t-"));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

const pkg = (name: string, licence: string, extra: Partial<Package> = {}): Package => ({ name, version: "1.0.0", licence, dir: sandbox, repository: "", author: "", ...extra });

describe("the supply chain's gates (14.10)", () => {
  test("this repository passes them all: exact versions, the install gates, licences, actions pinned", () => {
    expect(checkDeps(ROOT).problems).toEqual([]);
  });

  test("a licence expression is taken when permissive: an OR by either side, an AND by both, WITH as its licence", () => {
    expect(licenceTaken("MIT")).toBe(true);
    expect(licenceTaken("GPL-3.0-only")).toBe(false);
    expect(licenceTaken("(MIT OR GPL-3.0-or-later)")).toBe(true);
    expect(licenceTaken("GPL-3.0-or-later OR MIT")).toBe(true);
    expect(licenceTaken("(MIT AND Zlib)")).toBe(true);
    expect(licenceTaken("MIT AND GPL-2.0-only")).toBe(false);
    expect(licenceTaken("Apache-2.0 WITH LLVM-exception")).toBe(true);
    expect(licenceTaken("(MIT OR Apache-2.0) AND GPL-2.0-only")).toBe(false);
    // Not an expression: not taken.
    expect(licenceTaken("")).toBe(false);
    expect(licenceTaken("MIT OR")).toBe(false);
    expect(licenceTaken("(MIT")).toBe(false);
    expect(licenceTaken("MIT Apache-2.0")).toBe(false);
  });

  test("a package's licence: one not taken, or none, is a problem; a weak copyleft one is taken only by name", () => {
    expect(licenceProblems([pkg("a", "MIT"), pkg("b", "ISC")])).toEqual([]);
    expect(licenceProblems([pkg("c", "GPL-3.0-only")])).toEqual(["c@1.0.0: GPL-3.0-only — not a licence slipbox takes (plan 14.6, 14.10)"]);
    expect(licenceProblems([pkg("d", "")])).toEqual(["d@1.0.0: names no licence"]);
    expect(licenceProblems([pkg("elkjs", "EPL-2.0"), pkg("@resvg/resvg-wasm", "MPL-2.0")])).toEqual([]);
    // Taken by name for its licence, not any: a new copyleft one, or a named package's licence changing, is asked about.
    expect(licenceProblems([pkg("elkjs", "GPL-3.0-only")])).toHaveLength(1);
    expect(licenceProblems([pkg("other", "MPL-2.0")])).toHaveLength(1);
  });

  test("package.json's versions exact: a range, a tag or a partial version is a problem", () => {
    const deps = { a: "1.2.3", b: "1.0.0-beta.1", c: "^1.2.3", d: "~1.2.3", e: "*", f: "latest", g: "1.2", h: ">=1.0.0" };
    expect(specProblems({ dependencies: deps, devDependencies: { t: "^5.0.0" } }).map((p) => p.split(" ")[1])).toEqual(["c", "d", "e", "f", "g", "h", "t"]);
  });

  test("bunfig.toml's install gates: each one off is said; a key in another section doesn't count", () => {
    const good = "[install]\nignoreScripts = true\nminimumReleaseAge = 604800\nexact = true\n\n[test]\npreload = []\n";
    expect(bunfigProblems(good)).toEqual([]);
    expect(bunfigProblems(good.replace("ignoreScripts = true", "ignoreScripts = false"))).toEqual(["bunfig.toml: [install] ignoreScripts = true, so no install script runs"]);
    expect(bunfigProblems(good.replace("604800", "86400"))).toHaveLength(1);
    expect(bunfigProblems(good.replace("exact = true\n", ""))).toHaveLength(1);
    expect(bunfigProblems("[test]\nignoreScripts = true\nminimumReleaseAge = 604800\nexact = true\n")).toHaveLength(3);
  });

  test("a workflow's actions pinned by a full commit hash; a tag, a branch or a short hash is a problem", () => {
    const sha = "3d3c42e5aac5ba805825da76410c181273ba90b1";
    const yaml = `steps:\n  - uses: actions/checkout@${sha} # v7.0.1\n  - uses: ./local/action\n  - uses: a/b@v4\n  - name: x\n    uses: "c/d@main"\n  - uses: e/f@3d3c42e\n`;
    expect(workflowProblems("w.yml", yaml).map((p) => p.split(" ")[1])).toEqual(["a/b@v4", "c/d@main", "e/f@3d3c42e"]);
  });

  test("the packages bundled: found as Node finds them (a nested copy first), optional ones only where installed", () => {
    const root = tree({
      "package.json": JSON.stringify({ dependencies: { a: "1.0.0", gone: "1.0.0" } }),
      "node_modules/a/package.json": JSON.stringify({ name: "a", version: "1.0.0", license: "MIT", dependencies: { b: "2.0.0" }, optionalDependencies: { "a-native": "1.0.0", "a-other": "1.0.0" } }),
      "node_modules/a/node_modules/b/package.json": JSON.stringify({ name: "b", version: "2.0.0", licenses: [{ type: "ISC" }] }),
      "node_modules/b/package.json": JSON.stringify({ name: "b", version: "1.0.0", license: "MIT" }),
      "node_modules/a-native/package.json": JSON.stringify({ name: "a-native", version: "1.0.0", license: { type: "MIT" }, repository: "git@github.com:x/a-native.git" }),
    });
    const { packages, missing } = productionPackages(root);
    expect(packages.map((p) => `${p.name}@${p.version} ${p.licence}`)).toEqual(["a@1.0.0 MIT", "a-native@1.0.0 MIT", "b@2.0.0 ISC"]);
    expect(packages.find((p) => p.name === "a-native")?.repository).toBe("https://github.com/x/a-native");
    expect(missing).toEqual(["gone (package.json's)"]);
  });

  test("a repository named any of package.json's ways is a link", () => {
    expect(repoLink("git@github.com:yisibl/resvg-js.git")).toBe("https://github.com/yisibl/resvg-js");
    expect(repoLink("git://github.com/shtylman/dom.git")).toBe("https://github.com/shtylman/dom");
    expect(repoLink("git+https://github.com/a/b.git")).toBe("https://github.com/a/b");
    expect(repoLink("git+ssh://git@github.com/a/b.git")).toBe("https://github.com/a/b");
    expect(repoLink("github:a/b")).toBe("https://github.com/a/b");
    expect(repoLink("a/b")).toBe("https://github.com/a/b");
    expect(repoLink("https://gitlab.com/a/b")).toBe("https://gitlab.com/a/b");
  });

  test("the notices: a package's own licence files; the standard text, its author put in, where it ships none", () => {
    const own = tree({ "LICENSE": "Copyright (c) 2020 Own Author\n\nPermission is granted.\n", "NOTICE.md": "A notice of its own.\n", "index.js": "" });
    const bare = tree({ "index.js": "" });
    const text = notices([pkg("own", "MIT", { dir: own, repository: "https://github.com/x/own" }), pkg("bare", "MIT", { dir: bare, author: "Bare Author" }), pkg("mpl", "MPL-2.0", { dir: bare, repository: "https://github.com/x/mpl" })], "9.9.9", ROOT);
    expect(text).toStartWith("slipbox 9.9.9: the third-party software in this program");
    const part = (title: string) => text.split(/^={100}\n/m)[text.split(/^={100}\n/m).findIndex((s) => s.startsWith(title)) + 1] ?? "";
    expect(part("own 1.0.0 — MIT")).toContain("Copyright (c) 2020 Own Author");
    expect(part("own 1.0.0 — MIT")).toContain("A notice of its own.");
    expect(part("bare 1.0.0 — MIT")).toContain("Copyright (c) Bare Author");
    expect(part("bare 1.0.0 — MIT")).toContain("Permission is hereby granted, free of charge");
    // A licence that asks for the source: where it is, said.
    expect(part("mpl 1.0.0 — MPL-2.0")).toStartWith("\nIts source: https://github.com/x/mpl\n");
    expect(part("mpl 1.0.0 — MPL-2.0")).toContain("Mozilla Public License Version 2.0");
    // What's compiled into packages, and the runtime itself, are owed notices too.
    expect(part("Hunspell, compiled into hunspell-asm — MPL-1.1")).toContain("Its source: https://github.com/hunspell/hunspell");
    expect(part("libwebp, compiled into @jsquash/webp — BSD-3-Clause")).toContain("Redistribution and use in source and binary forms");
    expect(text).toContain(`Bun ${Bun.version}, the runtime the binary is built on`);
    expect(text).toContain("Bun statically links JavaScriptCore");
    expect(text).toContain("GNU LESSER GENERAL PUBLIC LICENSE");
  });
});


describe("a release (14.2)", () => {
  test("the platforms released, by name; this machine's when it's one of them", () => {
    expect(hostTarget("linux", "arm64")).toBe("linux-arm64");
    expect(hostTarget("darwin", "x64")).toBe("darwin-x64");
    expect(hostTarget("freebsd", "x64")).toBeNull();
    expect(hostTarget("win32", "x64")).toBeNull(); // 14.12, when it's done
  });

  test("the repository released from: owner/name, or a GitHub remote's URL — nothing else", () => {
    for (const s of ["o/r", "https://github.com/o/r", "https://github.com/o/r.git", "git@github.com:o/r.git", "ssh://git@github.com/o/r.git\n"]) expect(repoOf(s)).toBe("o/r");
    for (const s of ["https://gitlab.com/o/r", "o", "o/r/x", "", "../r", "o/..", "-o/r", "o/r;x", "o/$(x)"]) expect(repoOf(s)).toBeNull();
  });

  test("the version: package.json's, the same as src/version.ts's, and the tag's when there is one", () => {
    expect(releaseVersion(ROOT)).toBe(VERSION);
    const root = tree({ "package.json": JSON.stringify({ version: "1.2.3" }), "src/version.ts": 'export const VERSION = "1.2.3";\n' });
    expect(releaseVersion(root, "v1.2.3")).toBe("1.2.3");
    expect(() => releaseVersion(root, "v1.2.4")).toThrow("the tag is v1.2.4, the version 1.2.3");
    expect(() => releaseVersion(root, "1.2.3")).toThrow();
    writeFileSync(join(root, "src/version.ts"), 'export const VERSION = "1.2.2";\n');
    expect(() => releaseVersion(root)).toThrow("package.json says 1.2.3, src/version.ts 1.2.2");
  });

  test("built by package.json's own build — its autoload flags kept — for the target, its release defined in it", () => {
    const script = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: { build: string } }).scripts.build;
    const args = buildArgs(script, "/out/slipbox", "linux-x64", "o/r");
    expect(args[0]).toBe("build");
    for (const f of ["--compile", "--no-compile-autoload-bunfig", "--no-compile-autoload-dotenv", "--no-compile-autoload-tsconfig", "--no-compile-autoload-package-json"]) expect(args).toContain(f);
    expect(args[args.indexOf("--outfile") + 1]).toBe("/out/slipbox");
    expect(args).toContain("--target=bun-linux-x64-baseline");
    expect(args).toContain('--define=SLIPBOX_RELEASE={"repo":"o/r","target":"linux-x64"}');
    expect(() => buildArgs("bun build src/main.ts --outfile x", "/o", "linux-x64", "o/r")).toThrow("isn't a `bun build --compile`");
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
  });

  test("run from source, slipbox has no release: upgrade and the update check leave it alone", () => {
    expect(RELEASE).toBeNull();
  });

  test("the installer made for a release: its version, repository and sums written in; anything odd refused", () => {
    const template = readFileSync(join(ROOT, "scripts", "install.template.sh"), "utf8");
    const sum = "a".repeat(64);
    const made = installScript(template, "1.2.3", "o/r", { "linux-x64": sum, "darwin-arm64": "b".repeat(64) });
    expect(made).toContain('VERSION="1.2.3"\nREPO="o/r"\n');
    expect(made).toContain(`    darwin-arm64) echo ${"b".repeat(64)} ;;\n    linux-x64) echo ${sum} ;;\n    *) return 1 ;;`);
    expect(made).not.toMatch(/@[A-Z]+@/);
    expect(() => installScript(template, "1.2.3;x", "o/r", {})).toThrow("not a version");
    expect(() => installScript(template, "1.2.3", "o/$(r)", {})).toThrow("not a repository");
    expect(() => installScript(template, "1.2.3", "o/r", { "linux-x64": "zz" })).toThrow("not a target and its sum");
    expect(() => installScript(template, "1.2.3", "o/r", { "beos-x64": sum })).toThrow("not a target and its sum");
    expect(() => installScript(`${template}@MORE@`, "1.2.3", "o/r", {})).toThrow("@MORE@ left");
  });

  describe("built for this machine", () => {
    const host = hostTarget();
    let out = "";
    let pack = "";
    /** Where the installer fetches from: a folder laid out as GitHub's downloads are, `v<version>/<pack>`. */
    let releases = "";
    beforeAll(() => {
      if (!host) return;
      out = mkdtempSync(join(sandbox, "release-"));
      pack = buildRelease({ targets: [host], repo: "example/slipbox", tag: `v${VERSION}`, out })[0]!;
      finishRelease({ repo: "example/slipbox", out });
      releases = mkdtempSync(join(sandbox, "releases-"));
      mkdirSync(join(releases, `v${VERSION}`));
      symlinkSync(pack, join(releases, `v${VERSION}`, assetName(VERSION, host)));
    }, 240_000);

    /** The installer run in a home of its own: an environment made from nothing, so it can't reach the real one. */
    function install(home: string, extra: Record<string, string> = {}, opts: { fake?: Record<string, string>; from?: string } = {}) {
      let path = "/usr/local/bin:/usr/bin:/bin";
      if (opts.fake) {
        const fake = mkdtempSync(join(sandbox, "fakebin-"));
        for (const [name, body] of Object.entries(opts.fake)) {
          writeFileSync(join(fake, name), `#!/bin/sh\n${body}\n`);
          chmodSync(join(fake, name), 0o755);
        }
        path = `${fake}:${path}`;
      }
      const env = { HOME: home, PATH: path, TMPDIR: home, SLIPBOX_RELEASES_URL: `file://${opts.from ?? releases}`, ...extra };
      const r = Bun.spawnSync(["sh", join(out, "install.sh")], { env, cwd: home, timeout: 60_000 });
      return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
    }

    test.if(host !== null)("a pack holding the binary and its notices, in a folder of its name; summed", () => {
      expect(pack).toBe(join(out, assetName(VERSION, host!)));
      const listed = Bun.spawnSync(["tar", "-tzf", pack]).stdout.toString().trim().split("\n").sort();
      const dir = `slipbox-${VERSION}-${host}/`;
      expect(listed).toEqual([dir, `${dir}NOTICES.txt`, `${dir}slipbox`]);
      expect(readFileSync(join(out, "SHA256SUMS"), "utf8")).toBe(sha256sums([pack]));
    });

    test.if(host !== null)("the binary knows its release — its repository and platform — and its notices are there", () => {
      const x = mkdtempSync(join(sandbox, "unpacked-"));
      expect(Bun.spawnSync(["tar", "-xzf", pack, "-C", x]).exitCode).toBe(0);
      const dir = join(x, `slipbox-${VERSION}-${host}`);
      const notes = join(x, "notes");
      mkdirSync(notes);
      writeFileSync(join(notes, "a.md"), "# A\n");
      const env = { ...process.env, XDG_STATE_HOME: join(x, "state"), XDG_CACHE_HOME: join(x, "cache"), XDG_DATA_HOME: join(x, "data") };
      const info = Bun.spawnSync([join(dir, "slipbox"), "info", "--json"], { cwd: notes, env, timeout: 30_000 });
      expect(info.exitCode).toBe(0);
      expect(JSON.parse(info.stdout.toString()).data.release).toEqual({ repo: "example/slipbox", target: host });
      expect(readFileSync(join(dir, "NOTICES.txt"), "utf8")).toStartWith(`slipbox ${VERSION}: the third-party software in this program`);
    });

    test.if(host !== null)("installed (14.7): a folder per version, current, a link in ~/.local/bin — it runs; again, the same", () => {
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
    });

    test.if(host !== null)("uninstalled (14.8): listed first, nothing removed without --yes; --purge takes slipbox's folders too", () => {
      const home = mkdtempSync(join(sandbox, "home-"));
      expect(install(home).code).toBe(0);
      // Every folder of slipbox's in this home, said: nothing reaches the real ones.
      const env = { HOME: home, PATH: "/usr/bin:/bin", TMPDIR: home, XDG_CONFIG_HOME: join(home, ".config"), XDG_STATE_HOME: join(home, ".local", "state"), XDG_DATA_HOME: join(home, ".local", "share"), XDG_CACHE_HOME: join(home, ".cache") };
      mkdirSync(join(home, ".config", "slipbox"), { recursive: true });
      writeFileSync(join(home, ".config", "slipbox", "config.toml"), 'theme = "nord"\n');
      const link = join(home, ".local", "bin", "slipbox");
      const data = join(home, ".local", "share", "slipbox");
      const listed = Bun.spawnSync([link, "uninstall", "--json"], { env, cwd: home });
      expect(listed.exitCode).toBe(0);
      const plan = JSON.parse(listed.stdout.toString()).data;
      expect(plan.removed).toBe(false);
      expect(plan.remove.map((i: { path: string }) => i.path)).toEqual([link, join(data, "versions"), join(data, "current"), join(data, "bin-link")]);
      // The state folder too: the CLI marks when it was last used (20.9), this run included.
      expect(plan.keep.map((i: { path: string }) => i.path)).toEqual([join(home, ".config", "slipbox"), join(home, ".local", "state", "slipbox"), data]);
      expect(existsSync(link)).toBe(true);
      const human = Bun.spawnSync([link, "uninstall"], { env, cwd: home }).stdout.toString();
      expect(human).toContain(`~/.local/share/slipbox/versions  slipbox ${VERSION}`);
      expect(human).toContain("keeps (--purge removes them too):\n  ~/.config/slipbox");
      expect(human).toContain("nothing removed yet: again with --yes to remove these");
      // Removed: the running binary's own install, by itself.
      const done = Bun.spawnSync([link, "uninstall", "--yes"], { env, cwd: home });
      expect(done.exitCode).toBe(0);
      expect(done.stdout.toString()).toStartWith("removed:\n");
      for (const p of [link, join(data, "versions"), join(data, "current"), join(data, "bin-link")]) expect(existsSync(p)).toBe(false);
      expect(readFileSync(join(home, ".config", "slipbox", "config.toml"), "utf8")).toBe('theme = "nord"\n');
      // --purge: the folders too, from source now the binary's gone.
      const purged = Bun.spawnSync([process.execPath, join(ROOT, "src", "main.ts"), "uninstall", "--purge", "--yes"], { env, cwd: home });
      expect(purged.exitCode).toBe(0);
      // All gone, and the run that purged them wrote nothing back after.
      for (const p of [join(home, ".config", "slipbox"), join(home, ".local", "state", "slipbox"), data, join(home, ".cache", "slipbox")]) expect(existsSync(p)).toBe(false);
      expect(existsSync(join(home, ".config"))).toBe(true);
    });

    test.if(host !== null)("XDG_DATA_HOME and SLIPBOX_BIN_DIR followed when absolute; a relative one, as XDG says, not", () => {
      const home = mkdtempSync(join(sandbox, "home-"));
      const r = install(home, { XDG_DATA_HOME: join(home, "d"), SLIPBOX_BIN_DIR: join(home, "b") });
      expect(r.code).toBe(0);
      expect(readlinkSync(join(home, "b", "slipbox"))).toBe(join(home, "d", "slipbox", "current", "slipbox"));
      const other = mkdtempSync(join(sandbox, "home-"));
      expect(install(other, { XDG_DATA_HOME: "d", SLIPBOX_BIN_DIR: "b" }).code).toBe(0);
      expect(readlinkSync(join(other, ".local", "bin", "slipbox"))).toBe(join(other, ".local", "share", "slipbox", "current", "slipbox"));
    });

    test.if(host !== null)("a pack that isn't the release's — its SHA-256 another — is refused; nothing installed", () => {
      const home = mkdtempSync(join(sandbox, "home-"));
      const bad = mkdtempSync(join(sandbox, "releases-"));
      mkdirSync(join(bad, `v${VERSION}`));
      const tampered = join(bad, `v${VERSION}`, assetName(VERSION, host!));
      copyFileSync(pack, tampered);
      writeFileSync(tampered, Buffer.concat([readFileSync(tampered), Buffer.from("x")]));
      const r = install(home, {}, { from: bad });
      expect(r.code).toBe(1);
      expect(r.err).toContain("the download's SHA-256 is");
      expect(r.err).toContain("nothing installed");
      expect(existsSync(join(home, ".local", "share", "slipbox"))).toBe(false);
      expect(existsSync(join(home, ".local", "bin", "slipbox"))).toBe(false);
    });

    test.if(host !== null)("a slipbox there already that isn't the installer's is left as it is, and said — before any download", () => {
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
    });

    test.if(host !== null)("a pack whose binary isn't the release's — another version said, or none in it — is refused", () => {
      const fakeRelease = (files: Record<string, string>) => {
        const dir = mkdtempSync(join(sandbox, "fake-"));
        const name = `slipbox-${VERSION}-${host}`;
        for (const [f, body] of Object.entries(files)) {
          mkdirSync(join(dir, name), { recursive: true });
          writeFileSync(join(dir, name, f), body);
          chmodSync(join(dir, name, f), 0o755);
        }
        mkdirSync(join(dir, "r", `v${VERSION}`), { recursive: true });
        const tar = join(dir, "r", `v${VERSION}`, assetName(VERSION, host!));
        expect(Bun.spawnSync(["tar", "-czf", tar, "-C", dir, name]).exitCode).toBe(0);
        const sum = sha256sums([tar]).split(" ")[0]!;
        const script = join(dir, "install.sh");
        writeFileSync(script, installScript(readFileSync(join(ROOT, "scripts", "install.template.sh"), "utf8"), VERSION, "example/slipbox", { [host!]: sum }));
        return { from: join(dir, "r"), script };
      };
      const run = (f: { from: string; script: string }) => {
        const home = mkdtempSync(join(sandbox, "home-"));
        const r = Bun.spawnSync(["sh", f.script], { env: { HOME: home, PATH: "/usr/bin:/bin", TMPDIR: home, SLIPBOX_RELEASES_URL: `file://${f.from}` }, cwd: home });
        return { code: r.exitCode, err: r.stderr.toString(), installed: existsSync(join(home, ".local", "share", "slipbox")) };
      };
      const lying = run(fakeRelease({ slipbox: "#!/bin/sh\necho 'slipbox 0.0.1'\n" }));
      expect(lying).toEqual({ code: 1, err: `slipbox: the binary says "slipbox 0.0.1", not "slipbox ${VERSION}": nothing installed\n`, installed: false });
      const empty = run(fakeRelease({ "NOTICES.txt": "" }));
      expect(empty).toEqual({ code: 1, err: "slipbox: the pack has no slipbox in it: nothing installed\n", installed: false });
      const broken = run(fakeRelease({ slipbox: "#!/bin/sh\necho 'cannot execute' >&2\nexit 126\n" }));
      expect(broken).toEqual({ code: 1, err: "slipbox: the binary doesn't run here: cannot execute\n", installed: false });
    });

    test.if(host !== null)("no build for the machine: another system, another processor, musl, one this release hasn't", () => {
      const home = mkdtempSync(join(sandbox, "home-"));
      const uname = (s: string, m: string) => `case "$1" in -s) echo ${s} ;; -m) echo ${m} ;; esac`;
      const glibc = "echo 'ldd (GNU libc) 2.39'";
      expect(install(home, {}, { fake: { uname: uname("FreeBSD", "amd64"), ldd: glibc } }).err).toContain("no release for FreeBSD yet");
      expect(install(home, {}, { fake: { uname: uname("Linux", "riscv64"), ldd: glibc } }).err).toContain("no release for riscv64 processors");
      expect(install(home, {}, { fake: { uname: uname("Linux", "aarch64"), ldd: "echo 'musl libc (aarch64)'" } }).err).toContain("no release for musl (Alpine) yet");
      const other = host === "linux-x64" ? ["aarch64", "linux-arm64"] : ["x86_64", "linux-x64"];
      expect(install(home, {}, { fake: { uname: uname("Linux", other[0]!), ldd: glibc } }).err).toContain(`this release (${VERSION}) has no ${other[1]} build`);
      // A Mac's terminal under Rosetta says x64: the arm64 build is the one it gets.
      const mac = { uname: uname("Darwin", "x86_64"), sysctl: "echo 1" };
      expect(install(home, {}, { fake: mac }).err).toContain("has no darwin-arm64 build");
      expect(install(home, {}, { fake: { ...mac, sysctl: "echo 0" } }).err).toContain("has no darwin-x64 build");
      expect(existsSync(join(home, ".local"))).toBe(false);
    });
  });
});

describe("uninstall's plan (14.8)", () => {
  /** An install laid out as install.sh leaves it, in slipbox's folders of its own. */
  function layout(): { dirs: Stores; link: string; base: string } {
    const base = mkdtempSync(join(sandbox, "inst-"));
    const dirs: Stores = { config: join(base, "config", "slipbox"), state: join(base, "state", "slipbox"), data: join(base, "data", "slipbox"), cache: join(base, "cache", "slipbox") };
    for (const v of ["0.1.0", "0.2.0"]) {
      mkdirSync(join(dirs.data, "versions", v), { recursive: true });
      writeFileSync(join(dirs.data, "versions", v, "slipbox"), "");
    }
    symlinkSync("versions/0.2.0", join(dirs.data, "current"));
    mkdirSync(join(base, "bin"));
    const link = join(base, "bin", "slipbox");
    symlinkSync(join(dirs.data, "current", "slipbox"), link);
    writeFileSync(join(dirs.data, "bin-link"), `${link}\n`);
    mkdirSync(join(dirs.data, "spell"));
    writeFileSync(join(dirs.data, "spell", "words.txt"), "zorvex\n");
    mkdirSync(dirs.config, { recursive: true });
    mkdirSync(dirs.state, { recursive: true });
    return { dirs, link, base };
  }

  test("the installer's files listed to remove; slipbox's folders kept, unless --purge — those there only", () => {
    const { dirs, link } = layout();
    expect(installation(dirs.data)).toEqual({ versions: ["0.1.0", "0.2.0"], current: "0.2.0", link, foreignLink: null });
    const plan = uninstallPlan(false, dirs);
    expect(plan.remove).toEqual([
      { path: link, what: "the link that runs slipbox" },
      { path: join(dirs.data, "versions"), what: "slipbox 0.1.0, 0.2.0" },
      { path: join(dirs.data, "current"), what: "which version is in use" },
      { path: join(dirs.data, "bin-link"), what: "where the link is" },
    ]);
    expect(plan.keep.map((i) => i.path)).toEqual([dirs.config, dirs.state, dirs.data]);
    const purge = uninstallPlan(true, dirs);
    expect(purge.remove.slice(4).map((i) => i.path)).toEqual([dirs.config, dirs.state, dirs.data]);
    expect(purge.keep).toEqual([]);
  });

  test("removed: the installer's files; what's yours in the data folder stays, unless --purge", () => {
    const { dirs, link } = layout();
    expect(uninstall(uninstallPlan(false, dirs), dirs)).toEqual([]);
    for (const p of [link, join(dirs.data, "versions"), join(dirs.data, "current"), join(dirs.data, "bin-link")]) expect(existsSync(p)).toBe(false);
    expect(readFileSync(join(dirs.data, "spell", "words.txt"), "utf8")).toBe("zorvex\n");
    expect(uninstallPlan(false, dirs).remove).toEqual([]);
    expect(uninstall(uninstallPlan(true, dirs), dirs)).toEqual([]);
    for (const d of [dirs.config, dirs.state, dirs.data]) expect(existsSync(d)).toBe(false);
  });

  test("a link that isn't the installer's any more is left, and said; a link is removed as itself, never what it's to", () => {
    const { dirs, link, base } = layout();
    rmSync(link);
    writeFileSync(link, "#!/bin/sh\n# someone's own\n");
    // `current` turned to point outside slipbox's folders: the link goes, what it points at stays.
    const outside = join(base, "outside");
    mkdirSync(outside);
    writeFileSync(join(outside, "keep.txt"), "kept\n");
    rmSync(join(dirs.data, "current"));
    symlinkSync(outside, join(dirs.data, "current"));
    const plan = uninstallPlan(false, dirs);
    expect(plan.remove.map((i) => i.path)).not.toContain(link);
    expect(plan.notes).toEqual([`${link} isn't slipbox's link any more: left as it is`]);
    expect(uninstall(plan, dirs)).toEqual([]);
    expect(readFileSync(link, "utf8")).toBe("#!/bin/sh\n# someone's own\n");
    expect(existsSync(join(dirs.data, "current"))).toBe(false);
    expect(readFileSync(join(outside, "keep.txt"), "utf8")).toBe("kept\n");
  });

  test("only slipbox's own are removable: the installer's link, or inside a folder named slipbox", () => {
    const { dirs, link, base } = layout();
    expect(removable(link, dirs, link)).toBe(true);
    expect(removable(join(dirs.data, "versions"), dirs, link)).toBe(true);
    expect(removable(dirs.cache, dirs, link)).toBe(true);
    expect(removable(join(base, "bin"), dirs, link)).toBe(false);
    expect(removable(`${dirs.data}-other`, dirs, link)).toBe(false);
    expect(removable(join(base, "data"), dirs, link)).toBe(false);
    // A folder not named slipbox, whatever set it: nothing in it.
    const odd = { ...dirs, config: join(base, "conf") };
    expect(removable(join(base, "conf", "x"), odd, link)).toBe(false);
    // A plan naming anything else is refused, item by item.
    const victim = join(base, "victim.txt");
    writeFileSync(victim, "here\n");
    expect(uninstall({ remove: [{ path: victim, what: "x" }], keep: [], notes: [] }, dirs)).toEqual([`${victim}: not slipbox's to remove`]);
    expect(existsSync(victim)).toBe(true);
  });
});
