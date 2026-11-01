import { UNIT_TIMEOUT_MS } from "../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
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
import { join, resolve } from "node:path";
import { installScript, onMusl, sha256sums } from "../../scripts/release.ts";
import { bootstrapScript } from "../../scripts/bootstrap.ts";
import { pagesBase, tagOf } from "../../src/core/application/distribution/release.ts";
import {
  isChannel,
  noChannel,
  readChannel,
  type Stores,
  uninstall,
  uninstallPlan,
  writeChannel,
} from "../../src/core/application/distribution/install.ts";
import {
  channelsBase,
  dailyUpdateCheck,
  fetchNewest,
  fetchPreview,
  isNewer,
  previewIn,
  upgrade,
} from "../../src/core/application/distribution/update.ts";

import { makeDistributionSandbox, ROOT } from "../support/distribution-sandbox.ts";
import { makeDistributionPacks } from "../support/distribution-packs.ts";

setDefaultTimeout(UNIT_TIMEOUT_MS);

const { sandbox } = makeDistributionSandbox();
const { fakePack } = makeDistributionPacks(sandbox);

describe("channels: the installer on Pages, and which releases an install follows (GR-D13, GR-D14, GR-D15)", () => {
  const PREVIEW = "1.3.0-preview.202610121530.g1a2b3c4";
  const PREVIEW_TAG = "preview-202610121530-1a2b3c4";
  const sumOf = (file: string) => sha256sums([file]).split(" ")[0]!;
  const installTemplate = () => readFileSync(join(ROOT, "scripts", "install.template.sh"), "utf8");

  test("the Pages site, from the release's repository; a preview's tag, from its version, and its order", () => {
    expect(pagesBase("remziduzagac/slipbox")).toBe("https://remziduzagac.github.io/slipbox");
    expect(pagesBase("Some-One/Notes.app")).toBe("https://some-one.github.io/Notes.app");
    expect(channelsBase("o/r", {})).toBe("https://o.github.io/r");
    expect(channelsBase("o/r", { SLIPBOX_CHANNELS_URL: "file:///m/" })).toBe("file:///m");
    expect([tagOf("1.2.3"), tagOf("2.0.0-rc.1"), tagOf(PREVIEW)]).toEqual(["v1.2.3", "v2.0.0-rc.1", PREVIEW_TAG]);
    // As Bun orders them: a preview after the previews before it, before its version's release, after the last one.
    expect(isNewer(PREVIEW, "1.3.0-preview.202610121529.gfffffff")).toBe(true);
    expect(isNewer("1.3.0", PREVIEW)).toBe(true);
    expect(isNewer(PREVIEW, "1.2.3")).toBe(true);
  });

  test("the bootstrap made for a repository: it and its Pages site written in; anything odd refused", () => {
    const template = readFileSync(join(ROOT, "scripts", "bootstrap.template.sh"), "utf8");
    const made = bootstrapScript(template, "example/slipbox");
    expect(made).toContain('REPO="example/slipbox"\nPAGES="https://example.github.io/slipbox"\n');
    expect(made).toContain("#   curl -fsSL https://example.github.io/slipbox/install.sh | sh -s -- --preview");
    expect(made).not.toMatch(/@[A-Z]+@/);
    // Its body a function called on its last line: a download cut short runs nothing.
    expect(made.trimEnd().split("\n").at(-1)).toBe('main "$@"');
    expect(() => bootstrapScript(template, "o/$(r)")).toThrow("not a repository");
    expect(() => bootstrapScript(template, "https://github.com/o/r")).toThrow("not a repository");
    expect(() => bootstrapScript(`${template}@MORE@`, "o/r")).toThrow("@MORE@ left");
    // The command the Pages workflow runs, as it runs it (`bun --no-install`): the file written; a repository not one,
    // or arguments missing, refused.
    const out = join(mkdtempSync(join(sandbox, "boot-")), "install.sh");
    const script = join(ROOT, "scripts", "bootstrap.ts");
    const bun = (...args: string[]) => Bun.spawnSync([process.execPath, "--no-install", script, ...args]);
    expect(bun("example/slipbox", out).exitCode).toBe(0);
    expect(readFileSync(out, "utf8")).toBe(made);
    const odd = bun("o/$(r)", `${out}.2`);
    expect([odd.exitCode, odd.stderr.toString(), existsSync(`${out}.2`)]).toEqual([
      1,
      "bootstrap: not a repository: o/$(r) (name it owner/name)\n",
      false,
    ]);
    expect(bun("o/r").exitCode).toBe(2);
    // It needs no package: every module it reaches is slipbox's own, or Node's.
    const reached = new Set<string>();
    const walk = (file: string) => {
      if (reached.has(file)) return;
      reached.add(file);
      const source = readFileSync(file, "utf8").replace(/^#!.*/, "");
      for (const { path } of new Bun.Transpiler({ loader: "ts" }).scanImports(source)) {
        if (path.startsWith(".")) walk(resolve(file, "..", path));
        else expect(path).toStartWith("node:");
      }
    };
    walk(script);
    expect(reached.size).toBeGreaterThan(2);
  });

  // The bootstrap run as the installer is: a home of its own, an environment made from nothing, a Pages site and
  // releases through file://. uname and ldd are fakes: the machine is Linux on x64 (its C library as it is), whose
  // packs here are scripts saying their version, so it runs on any machine.
  const target = `linux-x64${onMusl() ? "-musl" : ""}`;
  const fakes = {
    uname: `case "$1" in -s) echo Linux ;; -m) echo x86_64 ;; esac`,
    ldd: "echo 'ldd (GNU libc) 2.39'",
  };
  const bootstrapFile = (() => {
    let made = "";
    return () => {
      if (made) return made;
      made = join(mkdtempSync(join(sandbox, "boot-")), "install.sh");
      writeFileSync(
        made,
        bootstrapScript(readFileSync(join(ROOT, "scripts", "bootstrap.template.sh"), "utf8"), "example/slipbox"),
      );
      return made;
    };
  })();

  /** A release in a folder laid out as GitHub's: under its tag, its pack, `SHA256SUMS` and installer; the
   *  installer's SHA-256. */
  function publish(releases: string, version: string): string {
    const dir = join(releases, "download", tagOf(version));
    mkdirSync(dir, { recursive: true });
    const pack = fakePack(mkdtempSync(join(sandbox, "p-")), version, target);
    copyFileSync(pack.file, join(dir, pack.asset));
    writeFileSync(join(dir, "SHA256SUMS"), `${pack.sha}  ${pack.asset}\n`);
    writeFileSync(
      join(dir, "install.sh"),
      installScript(installTemplate(), version, "example/slipbox", { [target]: pack.sha }),
    );
    return sumOf(join(dir, "install.sh"));
  }

  /** A Pages site: a file per channel, as given. */
  function site(channels: Record<string, string>): string {
    const pages = mkdtempSync(join(sandbox, "pages-"));
    for (const [name, line] of Object.entries(channels)) writeFileSync(join(pages, name), `${line}\n`);
    return pages;
  }

  /** Stable 1.2.3 and the preview, published, and the site naming both. */
  function both(): { pages: string; releases: string } {
    const releases = mkdtempSync(join(sandbox, "releases-"));
    const pages = site({
      stable: `v1.2.3 ${publish(releases, "1.2.3")}`,
      preview: `${PREVIEW_TAG} ${publish(releases, PREVIEW)}`,
    });
    return { pages, releases };
  }

  function bootstrap(
    home: string,
    args: string[],
    at: { pages: string; releases: string },
    env: Record<string, string> = {},
    fake: Record<string, string> = {},
  ) {
    const bin = mkdtempSync(join(sandbox, "fakebin-"));
    for (const [name, body] of Object.entries({ ...fakes, ...fake })) {
      writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
      chmodSync(join(bin, name), 0o755);
    }
    const r = Bun.spawnSync(["sh", bootstrapFile(), ...args], {
      env: {
        HOME: home,
        PATH: `${bin}:/usr/bin:/bin`,
        TMPDIR: home,
        SLIPBOX_CHANNELS_URL: `file://${at.pages}`,
        SLIPBOX_RELEASES_URL: `file://${at.releases}`,
        ...env,
      },
      cwd: home,
      timeout: 60_000,
    });
    return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
  }

  const dataOf = (home: string) => join(home, ".local", "share", "slipbox");

  test("stable, by default: the release the site names, its installer's sum checked, run — the install follows stable", () => {
    const at = both();
    const home = mkdtempSync(join(sandbox, "home-"));
    const r = bootstrap(home, [], at);
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(r.out).toStartWith(
      `slipbox: the stable channel's release: v1.2.3\nslipbox: downloading slipbox-1.2.3-${target}\n`,
    );
    expect(r.out).not.toContain("follows previews");
    expect(readFileSync(join(dataOf(home), "channel"), "utf8")).toBe("stable\n");
    expect(readlinkSync(join(dataOf(home), "current"))).toBe("versions/1.2.3");
    expect(Bun.spawnSync([join(home, ".local", "bin", "slipbox"), "--version"]).stdout.toString()).toBe(
      "slipbox 1.2.3\n",
    );
    // Nothing left behind, the bootstrap's folder nor the installer's.
    expect(readdirSync(home).filter((f) => f.startsWith("slipbox-"))).toEqual([]);
  });

  test("--preview, or SLIPBOX_CHANNEL=preview: the newest preview, fetched from its own tag — the install follows previews", () => {
    const at = both();
    for (const [args, env] of [
      [["--preview"], {}],
      [[], { SLIPBOX_CHANNEL: "preview" }],
    ] as [string[], Record<string, string>][]) {
      const home = mkdtempSync(join(sandbox, "home-"));
      const r = bootstrap(home, args, at, env);
      expect(r.err).toBe("");
      expect(r.code).toBe(0);
      expect(r.out).toStartWith(
        `slipbox: the preview channel's release: ${PREVIEW_TAG}\nslipbox: downloading slipbox-${PREVIEW}-${target}\n`,
      );
      expect(r.out).toContain(
        "slipbox: it follows previews: slipbox upgrade installs the newest (slipbox channel set stable: releases only)\n",
      );
      expect(readFileSync(join(dataOf(home), "channel"), "utf8")).toBe("preview\n");
      expect(readlinkSync(join(dataOf(home), "current"))).toBe(`versions/${PREVIEW}`);
    }
  });

  test("the arguments left, and the channel, go to the release's installer; its failure is the bootstrap's", () => {
    const releases = mkdtempSync(join(sandbox, "releases-"));
    const lines: Record<string, string> = {};
    for (const [channel, tag] of [
      ["stable", "v1.2.3"],
      ["preview", PREVIEW_TAG],
    ] as const) {
      mkdirSync(join(releases, "download", tag), { recursive: true });
      const file = join(releases, "download", tag, "install.sh");
      writeFileSync(file, `printf '%s|' "$@"; echo "$SLIPBOX_CHANNEL"; exit 7\n`);
      lines[channel] = `${tag} ${sumOf(file)}`;
    }
    const at = { pages: site(lines), releases };
    const home = mkdtempSync(join(sandbox, "home-"));
    const preview = bootstrap(home, ["a b", "--preview", "-x"], at);
    expect(preview.code).toBe(7);
    expect(preview.out).toBe(`slipbox: the preview channel's release: ${PREVIEW_TAG}\na b|-x|preview\n`);
    const stable = bootstrap(home, ["--", "c"], at);
    expect([stable.code, stable.out.split("\n")[1]]).toEqual([7, "--|c|stable"]);
    // The installer's own refusal, run through it: a system it has no build for.
    const real = both();
    const bsd = bootstrap(home, [], real, {}, { uname: `case "$1" in -s) echo FreeBSD ;; -m) echo amd64 ;; esac` });
    expect([bsd.code, bsd.err]).toEqual([
      1,
      "slipbox: no release for FreeBSD yet: macOS and Linux (Windows is to come)\n",
    ]);
    expect(existsSync(join(home, ".local"))).toBe(false);
  });

  test("a channel with no release says so — before the first release, --preview is the way — and installs nothing", () => {
    const releases = mkdtempSync(join(sandbox, "releases-"));
    const previewOnly = { pages: site({ preview: `${PREVIEW_TAG} ${publish(releases, PREVIEW)}` }), releases };
    const home = mkdtempSync(join(sandbox, "home-"));
    expect(bootstrap(home, [], previewOnly)).toEqual({
      code: 1,
      out: "",
      err: "slipbox: there's no stable release yet: the newest preview installs with --preview (curl -fsSL https://example.github.io/slipbox/install.sh | sh -s -- --preview)\n",
    });
    expect(bootstrap(home, ["--preview"], { pages: site({}), releases })).toEqual({
      code: 1,
      out: "",
      err: "slipbox: there's no preview now: the latest release installs without --preview\n",
    });
    // The site not reached at all is another matter, said with why.
    const away = bootstrap(home, [], { pages: "", releases }, { SLIPBOX_CHANNELS_URL: "https://127.0.0.1:9" });
    expect(away.code).toBe(1);
    expect(away.err).toStartWith("slipbox: couldn't download https://127.0.0.1:9/stable: curl: (7)");
    // A channel not one of the two: refused before anything is asked, by the release's installer too.
    expect(bootstrap(home, [], { pages: join(sandbox, "nowhere"), releases }, { SLIPBOX_CHANNEL: "beta" }).err).toBe(
      "slipbox: SLIPBOX_CHANNEL is stable or preview, not beta\n",
    );
    const own = Bun.spawnSync(["sh", join(releases, "download", PREVIEW_TAG, "install.sh")], {
      env: { HOME: home, PATH: "/usr/bin:/bin", TMPDIR: home, SLIPBOX_CHANNEL: "beta" },
      cwd: home,
    });
    expect([own.exitCode, own.stderr.toString()]).toEqual([
      1,
      "slipbox: SLIPBOX_CHANNEL is stable or preview, not beta\n",
    ]);
    expect(existsSync(join(home, ".local"))).toBe(false);
    expect(readdirSync(home)).toEqual([]);
  });

  test("an installer whose SHA-256 isn't the channel's is refused, never run; a channel file of another shape too", () => {
    const releases = mkdtempSync(join(sandbox, "releases-"));
    const real = publish(releases, "1.2.3");
    const home = mkdtempSync(join(sandbox, "home-"));
    const zero = "0".repeat(64);
    expect(bootstrap(home, [], { pages: site({ stable: `v1.2.3 ${zero}` }), releases })).toEqual({
      code: 1,
      out: "slipbox: the stable channel's release: v1.2.3\n",
      err: `slipbox: the installer's SHA-256 is ${real}, not the channel's ${zero}: nothing installed\n`,
    });
    for (const [channel, line] of [
      ["stable", "v1.2.3"],
      ["stable", `${PREVIEW_TAG} ${real}`],
      ["stable", `v1.2.3/../../x ${real}`],
      ["stable", `v1.2.3 ${real} more`],
      ["stable", `v1.2.3 ${real.toUpperCase()}`],
      ["stable", `v1.2.3 ${real.slice(1)}`],
      ["preview", `v1.2.3 ${real}`],
      ["preview", `preview-2026-1a2b3c4 ${real}`],
      ["preview", ""],
    ] as const) {
      const pages = site({ [channel]: line });
      expect(bootstrap(home, channel === "preview" ? ["--preview"] : [], { pages, releases })).toEqual({
        code: 1,
        out: "",
        err: `slipbox: file://${pages}/${channel} isn't a channel's file (a release's tag and a SHA-256): nothing installed\n`,
      });
    }
    expect(existsSync(join(home, ".local"))).toBe(false);
    expect(readdirSync(home)).toEqual([]);
  });

  test("the release's installer, run on its own: stable by default, a preview's from its own tag", () => {
    const releases = mkdtempSync(join(sandbox, "releases-"));
    publish(releases, PREVIEW);
    const home = mkdtempSync(join(sandbox, "home-"));
    const bin = mkdtempSync(join(sandbox, "fakebin-"));
    for (const [name, body] of Object.entries(fakes)) {
      writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
      chmodSync(join(bin, name), 0o755);
    }
    const r = Bun.spawnSync(["sh", join(releases, "download", PREVIEW_TAG, "install.sh")], {
      env: { HOME: home, PATH: `${bin}:/usr/bin:/bin`, TMPDIR: home, SLIPBOX_RELEASES_URL: `file://${releases}` },
      cwd: home,
    });
    expect(r.stderr.toString()).toBe("");
    expect(r.exitCode).toBe(0);
    expect(readlinkSync(join(dataOf(home), "current"))).toBe(`versions/${PREVIEW}`);
    expect(readFileSync(join(dataOf(home), "channel"), "utf8")).toBe("stable\n");
  });

  test("the channel, kept in the data folder: stable when there's none or it says another; uninstall takes it", () => {
    const base = mkdtempSync(join(sandbox, "ch-"));
    const dirs: Stores = {
      config: join(base, "c", "slipbox"),
      state: join(base, "s", "slipbox"),
      data: join(base, "d", "slipbox"),
      cache: join(base, "k", "slipbox"),
    };
    expect(readChannel(dirs.data)).toBe("stable");
    writeChannel(dirs.data, "preview");
    expect(readFileSync(join(dirs.data, "channel"), "utf8")).toBe("preview\n");
    expect(readChannel(dirs.data)).toBe("preview");
    expect(readdirSync(dirs.data)).toEqual(["channel"]);
    writeFileSync(join(dirs.data, "channel"), "beta\n");
    expect(readChannel(dirs.data)).toBe("stable");
    expect(["stable", "preview", "beta", ""].map(isChannel)).toEqual([true, true, false, false]);
    // The install's own: uninstall takes it with the rest; --purge takes the data folder.
    mkdirSync(join(dirs.data, "spell"));
    writeFileSync(join(dirs.data, "spell", "words.txt"), "zorvex\n");
    const plan = uninstallPlan(false, dirs);
    expect(plan.remove).toEqual([{ path: join(dirs.data, "channel"), what: "which releases it follows" }]);
    expect(uninstall(plan, dirs)).toEqual([]);
    expect(readdirSync(dirs.data)).toEqual(["spell"]);
    writeChannel(dirs.data, "stable");
    expect(uninstall(uninstallPlan(true, dirs), dirs)).toEqual([]);
    expect(existsSync(dirs.data)).toBe(false);
  });

  test("only the installer's install has a channel: Homebrew's, a binary put by hand, a source run are told how they update", () => {
    expect(noChannel({ repo: "o/r" }, "installer", "/x/slipbox")).toBeNull();
    expect(noChannel({ repo: "o/r" }, "homebrew", "/x/slipbox")).toBe(
      "this slipbox is Homebrew's: it has no channel — brew upgrade slipbox updates it, to stable releases",
    );
    expect(noChannel({ repo: "o/r" }, "other", "/opt/slipbox")).toBe(
      "this slipbox (/opt/slipbox) wasn't installed by its installer: it has no channel — releases are at https://github.com/o/r/releases",
    );
    expect(noChannel(null, "other", "/x")).toBe(
      "this slipbox runs from source (or was built by hand): it has no channel — update its checkout",
    );
  });

  describe("the newest a channel offers (upgrade, the daily check)", () => {
    const R = "https://github.com/o/r/releases";
    const P = "https://o.github.io/r";
    const sum = "a".repeat(64);
    const release = { repo: "o/r", target: "linux-x64" };
    /** A fetcher answering from addresses given; anything else, not found. */
    const answering =
      (files: Record<string, string>, asked: string[] = []) =>
      async (url: string) => (
        asked.push(url), url in files ? new Response(files[url]) : new Response("Not Found", { status: 404 })
      );
    const stableAt = (v: string) => ({
      [`${R}/latest/download/SHA256SUMS`]: `${sum}  slipbox-${v}-linux-x64.tar.gz\n`,
    });
    const previewAt = (v: string, packs = `${"c".repeat(64)}  slipbox-${v}-linux-x64.tar.gz\n`) => ({
      [`${P}/preview`]: `${tagOf(v)} ${"b".repeat(64)}\n`,
      [`${R}/download/${tagOf(v)}/SHA256SUMS`]: packs,
    });
    const newest = (channel: "stable" | "preview", files: Record<string, string>, asked?: string[]) =>
      fetchNewest({ channel, releases: R, channels: P, target: "linux-x64", fetcher: answering(files, asked) });

    test("a channel file names a preview by its tag, the line as the site writes it; anything else, none", () => {
      expect(previewIn(`${PREVIEW_TAG} ${sum}\n`)).toBe(PREVIEW_TAG);
      expect(previewIn(`v1.2.3 ${sum}`)).toBeNull();
      expect(previewIn(PREVIEW_TAG)).toBeNull();
      expect(previewIn(`${PREVIEW_TAG}/../x ${sum}`)).toBeNull();
      expect(previewIn("<html>404</html>")).toBeNull();
    });

    test("stable: the latest release; the site never asked", async () => {
      const asked: string[] = [];
      expect(await newest("stable", { ...stableAt("1.2.3"), ...previewAt(PREVIEW) }, asked)).toEqual({
        version: "1.2.3",
        asset: "slipbox-1.2.3-linux-x64.tar.gz",
        sha256: sum,
        tag: "v1.2.3",
      });
      expect(asked).toEqual([`${R}/latest/download/SHA256SUMS`]);
    });

    test("preview: the newer of the stable release and the preview — either alone when the other has none", async () => {
      // The preview newer: it, from its own tag.
      const asked: string[] = [];
      expect(await newest("preview", { ...stableAt("1.2.3"), ...previewAt(PREVIEW) }, asked)).toEqual({
        version: PREVIEW,
        asset: `slipbox-${PREVIEW}-linux-x64.tar.gz`,
        sha256: "c".repeat(64),
        tag: PREVIEW_TAG,
      });
      expect(asked).toEqual([
        `${R}/latest/download/SHA256SUMS`,
        `${P}/preview`,
        `${R}/download/${PREVIEW_TAG}/SHA256SUMS`,
      ]);
      // The stable release newer — its version released since: the release.
      expect((await newest("preview", { ...stableAt("1.3.0"), ...previewAt(PREVIEW) }))?.tag).toBe("v1.3.0");
      // No preview: the release. No release yet: the preview. Neither: nothing.
      expect((await newest("preview", stableAt("1.2.3")))?.version).toBe("1.2.3");
      expect((await newest("preview", previewAt(PREVIEW)))?.version).toBe(PREVIEW);
      expect(await newest("preview", {})).toBeNull();
      // A preview whose sums are another version's, or with no build for this platform: not that preview.
      expect(
        (
          await newest("preview", {
            ...stableAt("1.2.3"),
            ...previewAt(PREVIEW, `${sum}  slipbox-1.4.0-linux-x64.tar.gz\n`),
          })
        )?.version,
      ).toBe("1.2.3");
      expect(await fetchPreview(P, R, "linux-arm64", answering(previewAt(PREVIEW)))).toBeNull();
      expect(await fetchPreview(P, R, "linux-x64", async () => Promise.reject(new Error("offline")))).toBeNull();
    });

    test("the daily check follows the channel, and names it when it's preview", async () => {
      const files = { ...stableAt("1.2.3"), ...previewAt(PREVIEW) };
      const check = (channel?: "stable" | "preview") =>
        dailyUpdateCheck({
          release,
          version: "1.2.3",
          enabled: true,
          env: {},
          stateFile: join(mkdtempSync(join(sandbox, "upd-")), "update.json"),
          fetcher: answering(files),
          channel,
        });
      expect((await check("preview"))?.said).toBe(
        `slipbox ${PREVIEW} is out on the preview channel (this is 1.2.3): slipbox upgrade installs it`,
      );
      expect(await check("stable")).toBeNull();
      expect(await check()).toBeNull();
    });

    test("upgrade on preview: the preview downloaded from its own tag, checked, installed as a release is; back on stable, it stays", async () => {
      const data = join(mkdtempSync(join(sandbox, "upg-")), "slipbox");
      mkdirSync(join(data, "versions", "1.2.3"), { recursive: true });
      writeFileSync(join(data, "versions", "1.2.3", "slipbox"), "");
      symlinkSync("versions/1.2.3", join(data, "current"));
      writeChannel(data, "preview");
      const pack = fakePack(mkdtempSync(join(sandbox, "p-")), PREVIEW, "linux-x64");
      const files = { ...stableAt("1.2.3"), ...previewAt(PREVIEW, `${pack.sha}  ${pack.asset}\n`) };
      const asked: string[] = [];
      const fetcher = async (url: string) =>
        url.endsWith(".tar.gz")
          ? (asked.push(url), new Response(readFileSync(pack.file)))
          : answering(files, asked)(url);
      const opts = { release, data, env: {}, fetcher };
      expect(
        await upgrade({ ...opts, version: "1.2.3", execPath: join(data, "versions", "1.2.3", "slipbox") }),
      ).toMatchObject({ status: "upgraded", from: "1.2.3", latest: PREVIEW, removed: [] });
      expect(asked).toEqual([
        `${R}/latest/download/SHA256SUMS`,
        `${P}/preview`,
        `${R}/download/${PREVIEW_TAG}/SHA256SUMS`,
        `${R}/download/${PREVIEW_TAG}/${pack.asset}`,
      ]);
      expect(readlinkSync(join(data, "current"))).toBe(`versions/${PREVIEW}`);
      // Back on stable: the release isn't newer than the preview, so it stays.
      writeChannel(data, "stable");
      const on = { ...opts, version: PREVIEW, execPath: join(data, "versions", PREVIEW, "slipbox") };
      expect(await upgrade(on)).toEqual({ status: "current", from: PREVIEW, latest: "1.2.3", removed: [] });
      // On preview with nothing to be found: said, with where it looked.
      writeChannel(data, "preview");
      const none = await upgrade({ ...on, fetcher: answering({}) }).catch((e: Error) => e.message);
      expect(none).toBe(
        `couldn't find the latest release's linux-x64 build at ${R}, nor the newest preview's (${P}/preview)`,
      );
    });
  });
});
