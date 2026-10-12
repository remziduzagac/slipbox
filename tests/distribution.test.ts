// Distribution (plan 14.x): the supply chain's gates and the notices a release ships (14.10); a release built (14.2).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ACCEPTED, type Accepted, acceptedProblems, ignoreArgs } from "../scripts/audit.ts";
import {
  bunfigProblems,
  checkDeps,
  licenceProblems,
  licenceTaken,
  notices,
  type Package,
  productionPackages,
  purl,
  repoLink,
  type Sbom,
  sbom,
  specProblems,
  workflowProblems,
  workflowShapeProblems,
} from "../scripts/check-deps.ts";
import {
  assetName,
  buildArgs,
  buildRelease,
  changelogNotes,
  finishRelease,
  homebrewFormula,
  hostTarget,
  installScript,
  onMusl,
  releaseNotes,
  releaseVersion,
  repoOf,
  sbomName,
  sha256sums,
} from "../scripts/release.ts";
import { bootstrapScript } from "../scripts/bootstrap.ts";
import { pagesBase, RELEASE, tagOf } from "../src/core/release.ts";
import {
  howToUpgrade,
  installation,
  installedBy,
  isChannel,
  noChannel,
  readChannel,
  removable,
  type Stores,
  uninstall,
  uninstallPlan,
  writeChannel,
} from "../src/core/install.ts";
import { libcCandidates } from "../src/core/crash-reports.ts";
import {
  CHECK_EVERY_MS,
  channelsBase,
  dailyUpdateCheck,
  doNotTrack,
  fetchLatest,
  fetchNewest,
  fetchPreview,
  isNewer,
  latestIn,
  previewIn,
  releasesBase,
  upgrade,
  UpgradeError,
} from "../src/core/update.ts";
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

/** A release's pack made by hand: a folder `slipbox-<version>-<target>/` holding `slipbox`, a script saying `says`. */
function fakePack(
  dir: string,
  version: string,
  target: string,
  says = `slipbox ${version}`,
): { file: string; sha: string; asset: string } {
  const name = `slipbox-${version}-${target}`;
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(join(dir, name, "slipbox"), `#!/bin/sh\necho '${says}'\n`);
  chmodSync(join(dir, name, "slipbox"), 0o755);
  const file = join(dir, `${name}.tar.gz`);
  expect(Bun.spawnSync(["tar", "-czf", file, "-C", dir, name]).exitCode).toBe(0);
  rmSync(join(dir, name), { recursive: true });
  return { file, sha: sha256sums([file]).split(" ")[0]!, asset: `${name}.tar.gz` };
}

/** A folder laid out as GitHub's releases are: `latest/download/SHA256SUMS`, `download/v<version>/<pack>`. */
function fakeReleases(
  pack: { file: string; sha: string; asset: string },
  version: string,
  sums = `${pack.sha}  ${pack.asset}\n`,
): string {
  const base = mkdtempSync(join(sandbox, "releases-"));
  mkdirSync(join(base, "latest", "download"), { recursive: true });
  writeFileSync(join(base, "latest", "download", "SHA256SUMS"), sums);
  mkdirSync(join(base, "download", `v${version}`), { recursive: true });
  copyFileSync(pack.file, join(base, "download", `v${version}`, pack.asset));
  return base;
}

const pkg = (name: string, licence: string, extra: Partial<Package> = {}): Package => ({
  name,
  version: "1.0.0",
  licence,
  dir: sandbox,
  repository: "",
  author: "",
  ...extra,
});

describe("the supply chain's gates (14.10)", () => {
  test("this repository passes them all: exact versions, the install gates, licences, actions pinned", () => {
    expect(checkDeps(ROOT).problems).toEqual([]);
  });
  test("slipbox's own licence: LICENSE is Apache-2.0's text, and package.json says so", () => {
    const text = readFileSync(join(ROOT, "LICENSE"), "utf8");
    expect(text).toContain("Apache License\n                           Version 2.0, January 2004");
    expect(text).toContain("END OF TERMS AND CONDITIONS");
    expect(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).license).toBe("Apache-2.0");
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
    expect(licenceProblems([pkg("c", "GPL-3.0-only")])).toEqual([
      "c@1.0.0: GPL-3.0-only — not a licence slipbox takes (plan 14.6, 14.10)",
    ]);
    expect(licenceProblems([pkg("d", "")])).toEqual(["d@1.0.0: names no licence"]);
    expect(licenceProblems([pkg("elkjs", "EPL-2.0"), pkg("@resvg/resvg-wasm", "MPL-2.0")])).toEqual([]);
    // Taken by name for its licence, not any: a new copyleft one, or a named package's licence changing, is asked about.
    expect(licenceProblems([pkg("elkjs", "GPL-3.0-only")])).toHaveLength(1);
    expect(licenceProblems([pkg("other", "MPL-2.0")])).toHaveLength(1);
  });

  test("package.json's versions exact: a range, a tag or a partial version is a problem", () => {
    const deps = {
      a: "1.2.3",
      b: "1.0.0-beta.1",
      c: "^1.2.3",
      d: "~1.2.3",
      e: "*",
      f: "latest",
      g: "1.2",
      h: ">=1.0.0",
    };
    expect(specProblems({ dependencies: deps, devDependencies: { t: "^5.0.0" } }).map((p) => p.split(" ")[1])).toEqual([
      "c",
      "d",
      "e",
      "f",
      "g",
      "h",
      "t",
    ]);
  });

  test("bunfig.toml's install gates: each one off is said; a key in another section doesn't count", () => {
    const good = "[install]\nignoreScripts = true\nminimumReleaseAge = 604800\nexact = true\n\n[test]\npreload = []\n";
    expect(bunfigProblems(good)).toEqual([]);
    expect(bunfigProblems(good.replace("ignoreScripts = true", "ignoreScripts = false"))).toEqual([
      "bunfig.toml: [install] ignoreScripts = true, so no install script runs",
    ]);
    expect(bunfigProblems(good.replace("604800", "86400"))).toHaveLength(1);
    expect(bunfigProblems(good.replace("exact = true\n", ""))).toHaveLength(1);
    expect(bunfigProblems("[test]\nignoreScripts = true\nminimumReleaseAge = 604800\nexact = true\n")).toHaveLength(3);
  });

  test("a workflow's actions pinned by a full commit hash; a tag, a branch or a short hash is a problem", () => {
    const sha = "3d3c42e5aac5ba805825da76410c181273ba90b1";
    const yaml = `steps:\n  - uses: actions/checkout@${sha} # v7.0.1\n  - uses: ./local/action\n  - uses: a/b@v4\n  - name: x\n    uses: "c/d@main"\n  - uses: e/f@3d3c42e\n`;
    expect(workflowProblems("w.yml", yaml).map((p) => p.split(" ")[1])).toEqual(["a/b@v4", "c/d@main", "e/f@3d3c42e"]);
  });

  test("a workflow starts from no permission, and gives every job a timeout (GR-D9)", () => {
    const job = (extra = "") => `    runs-on: ubuntu-24.04\n${extra}    steps:\n      - run: "true"\n`;
    const good =
      `on: push\npermissions: {}\njobs:\n  a:\n${job("    timeout-minutes: 5\n")}` +
      "  b:\n    uses: ./.github/workflows/x.yml\n";
    expect(workflowShapeProblems("w.yml", good)).toEqual([]);
    // Read-only by default is still a default: each job grants its own.
    expect(workflowShapeProblems("w.yml", good.replace("permissions: {}", "permissions:\n  contents: read"))).toEqual([
      "w.yml: `permissions: {}` at the top, so a job has only what it grants itself",
    ]);
    expect(workflowShapeProblems("w.yml", good.replace("permissions: {}\n", ""))).toHaveLength(1);
    expect(workflowShapeProblems("w.yml", good.replace("    timeout-minutes: 5\n", ""))).toEqual([
      "w.yml: job a has no timeout-minutes",
    ]);
    expect(workflowShapeProblems("w.yml", "jobs: [\n")[0]).toStartWith("w.yml: not YAML that parses");
  });

  test("the required check, `ci`, always runs and waits for every other job", () => {
    const ci = Bun.YAML.parse(readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8")) as {
      jobs: Record<string, { needs?: string[]; if?: string }>;
    };
    const others = Object.keys(ci.jobs).filter((j) => j !== "ci");
    expect(others.length).toBeGreaterThan(1);
    expect([...(ci.jobs.ci?.needs ?? [])].sort()).toEqual(others.sort());
    expect(ci.jobs.ci?.if).toBe("${{ always() }}");
  });

  test("Dependabot: Bun's packages and the actions, grouped, monthly, a week's cooldown as bunfig's", () => {
    const config = Bun.YAML.parse(readFileSync(join(ROOT, ".github", "dependabot.yml"), "utf8")) as {
      updates: {
        "package-ecosystem": string;
        schedule: { interval: string };
        cooldown: { "default-days": number };
        groups: Record<string, { patterns: string[] }>;
      }[];
    };
    const age = Number(/minimumReleaseAge\s*=\s*(\d+)/.exec(readFileSync(join(ROOT, "bunfig.toml"), "utf8"))?.[1]);
    expect(config.updates.map((u) => u["package-ecosystem"]).sort()).toEqual(["bun", "github-actions"]);
    for (const u of config.updates) {
      expect(u.schedule.interval).toBe("monthly");
      expect(u.cooldown["default-days"] * 86400).toBe(age);
      expect(Object.values(u.groups).flatMap((g) => g.patterns)).toContain("*");
    }
  });

  test("a package's Package URL: its scope encoded", () => {
    expect(purl("@opentui/core", "0.5.12")).toBe("pkg:npm/%40opentui/core@0.5.12");
    expect(purl("yaml", "2.9.1")).toBe("pkg:npm/yaml@2.9.1");
    expect(purl("a", "1.0.0+build.1")).toBe("pkg:npm/a@1.0.0%2Bbuild.1");
  });

  test("the SBOM (CycloneDX): slipbox, each package with its licence and source, Bun, and who depends on whom", () => {
    const root = tree({ "package.json": JSON.stringify({ license: "Apache-2.0", description: "Notes." }) });
    const walk = {
      packages: [
        pkg("@s/a", "MIT", { repository: "https://github.com/s/a", dependsOn: ["b@1.0.0"] }),
        pkg("b", "(MIT AND Zlib)", { dependsOn: [] }),
      ],
      direct: ["@s/a@1.0.0"],
    };
    const bom = sbom(walk, { version: "1.2.3", target: "linux-x64", repo: "o/r" }, root, {
      serial: "urn:uuid:00000000-0000-4000-8000-000000000000",
      timestamp: "2026-10-12T00:00:00.000Z",
    });
    expect(bom).toMatchObject({
      bomFormat: "CycloneDX",
      specVersion: "1.6",
      serialNumber: "urn:uuid:00000000-0000-4000-8000-000000000000",
      version: 1,
      metadata: {
        timestamp: "2026-10-12T00:00:00.000Z",
        component: {
          type: "application",
          "bom-ref": "slipbox",
          name: "slipbox",
          version: "1.2.3",
          purl: "pkg:github/o/r@v1.2.3",
          licenses: [{ license: { id: "Apache-2.0" } }],
          externalReferences: [{ type: "vcs", url: "https://github.com/o/r" }],
          properties: [{ name: "slipbox:target", value: "linux-x64" }],
        },
      },
    });
    // A scoped package's scope is its group; a single licence an SPDX id, a compound one its expression.
    expect(bom.components[0]).toEqual({
      type: "library",
      "bom-ref": "pkg:npm/%40s/a@1.0.0",
      group: "@s",
      name: "a",
      version: "1.0.0",
      purl: "pkg:npm/%40s/a@1.0.0",
      licenses: [{ license: { id: "MIT" } }],
      externalReferences: [{ type: "vcs", url: "https://github.com/s/a" }],
    });
    expect(bom.components[1]).toMatchObject({ name: "b", licenses: [{ expression: "(MIT AND Zlib)" }] });
    const bun = bom.components.at(-1)!;
    expect(bun).toMatchObject({ type: "platform", name: "bun", version: Bun.version });
    // Nothing compiled in that the walk doesn't bundle: Hunspell comes with hunspell-asm only.
    expect(bom.components).toHaveLength(3);
    expect(bom.dependencies).toEqual([
      { ref: "slipbox", dependsOn: ["pkg:npm/%40s/a@1.0.0", bun["bom-ref"]] },
      { ref: "pkg:npm/%40s/a@1.0.0", dependsOn: ["pkg:npm/b@1.0.0"] },
      { ref: "pkg:npm/b@1.0.0", dependsOn: [] },
      { ref: bun["bom-ref"], dependsOn: [] },
    ]);
    // A new one each time: its own serial number and time.
    const again = sbom(walk, { version: "1.2.3" }, root);
    expect(again.serialNumber).toMatch(
      /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(again.serialNumber).not.toBe(bom.serialNumber);
    expect(again.metadata.component.properties).toBeUndefined();
  });

  test("this repository's SBOM: each package the walk finds, what's compiled in, Bun; every reference resolves", () => {
    const { packages, direct } = checkDeps(ROOT);
    const bom: Sbom = sbom({ packages, direct }, { version: VERSION, target: "linux-x64", repo: "o/r" });
    const refs = new Set(["slipbox", ...bom.components.map((c) => c["bom-ref"])]);
    expect(refs.size).toBe(bom.components.length + 1);
    for (const p of packages) expect(refs.has(purl(p.name, p.version))).toBe(true);
    expect(bom.components.filter((c) => c["bom-ref"].startsWith("embedded:")).map((c) => c.name)).toEqual([
      "Hunspell",
      "libwebp",
    ]);
    expect(bom.dependencies.find((d) => d.ref.startsWith("pkg:npm/hunspell-asm@"))?.dependsOn).toContain(
      "embedded:Hunspell",
    );
    expect(bom.dependencies.map((d) => d.ref).sort()).toEqual([...refs].sort());
    for (const d of bom.dependencies) for (const r of d.dependsOn) expect(refs.has(r)).toBe(true);
    for (const c of bom.components) expect(c.licenses?.length).toBe(1);
  });

  test("the packages bundled: found as Node finds them (a nested copy first), optional ones only where installed", () => {
    const root = tree({
      "package.json": JSON.stringify({ dependencies: { a: "1.0.0", gone: "1.0.0" } }),
      "node_modules/a/package.json": JSON.stringify({
        name: "a",
        version: "1.0.0",
        license: "MIT",
        dependencies: { b: "2.0.0" },
        optionalDependencies: { "a-native": "1.0.0", "a-other": "1.0.0" },
      }),
      "node_modules/a/node_modules/b/package.json": JSON.stringify({
        name: "b",
        version: "2.0.0",
        licenses: [{ type: "ISC" }],
      }),
      "node_modules/b/package.json": JSON.stringify({ name: "b", version: "1.0.0", license: "MIT" }),
      "node_modules/a-native/package.json": JSON.stringify({
        name: "a-native",
        version: "1.0.0",
        license: { type: "MIT" },
        repository: "git@github.com:x/a-native.git",
      }),
    });
    const { packages, missing, direct } = productionPackages(root);
    expect(packages.map((p) => `${p.name}@${p.version} ${p.licence}`)).toEqual([
      "a@1.0.0 MIT",
      "a-native@1.0.0 MIT",
      "b@2.0.0 ISC",
    ]);
    expect(packages.find((p) => p.name === "a-native")?.repository).toBe("https://github.com/x/a-native");
    expect(missing).toEqual(["gone (package.json's)"]);
    // Who depends on whom, as installed: the SBOM's graph.
    expect(direct).toEqual(["a@1.0.0"]);
    expect(packages.find((p) => p.name === "a")?.dependsOn).toEqual(["b@2.0.0", "a-native@1.0.0"]);
    expect(packages.find((p) => p.name === "b")?.dependsOn).toEqual([]);
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
    const own = tree({
      LICENSE: "Copyright (c) 2020 Own Author\n\nPermission is granted.\n",
      "NOTICE.md": "A notice of its own.\n",
      "index.js": "",
    });
    const bare = tree({ "index.js": "" });
    const text = notices(
      [
        pkg("own", "MIT", { dir: own, repository: "https://github.com/x/own" }),
        pkg("bare", "MIT", { dir: bare, author: "Bare Author" }),
        pkg("mpl", "MPL-2.0", { dir: bare, repository: "https://github.com/x/mpl" }),
      ],
      "9.9.9",
      ROOT,
    );
    expect(text).toStartWith("slipbox 9.9.9: the third-party software in this program");
    const part = (title: string) =>
      text.split(/^={100}\n/m)[text.split(/^={100}\n/m).findIndex((s) => s.startsWith(title)) + 1] ?? "";
    expect(part("own 1.0.0 — MIT")).toContain("Copyright (c) 2020 Own Author");
    expect(part("own 1.0.0 — MIT")).toContain("A notice of its own.");
    expect(part("bare 1.0.0 — MIT")).toContain("Copyright (c) Bare Author");
    expect(part("bare 1.0.0 — MIT")).toContain("Permission is hereby granted, free of charge");
    // A licence that asks for the source: where it is, said.
    expect(part("mpl 1.0.0 — MPL-2.0")).toStartWith("\nIts source: https://github.com/x/mpl\n");
    expect(part("mpl 1.0.0 — MPL-2.0")).toContain("Mozilla Public License Version 2.0");
    // What's compiled into packages, and the runtime itself, are owed notices too.
    expect(part("Hunspell, compiled into hunspell-asm — MPL-1.1")).toContain(
      "Its source: https://github.com/hunspell/hunspell",
    );
    expect(part("libwebp, compiled into @jsquash/webp — BSD-3-Clause")).toContain(
      "Redistribution and use in source and binary forms",
    );
    expect(text).toContain(`Bun ${Bun.version}, the runtime the binary is built on`);
    expect(text).toContain("Bun statically links JavaScriptCore");
    expect(text).toContain("GNU LESSER GENERAL PUBLIC LICENSE");
  });
});

describe("a release (14.2)", () => {
  test("the platforms released, by name; this machine's when it's one of them", () => {
    expect(hostTarget("linux", "arm64", false)).toBe("linux-arm64");
    expect(hostTarget("darwin", "x64", false)).toBe("darwin-x64");
    // musl's Linux, Alpine's (14.5): its own build; a Mac has no such thing.
    expect(hostTarget("linux", "x64", true)).toBe("linux-x64-musl");
    expect(hostTarget("linux", "arm64", true)).toBe("linux-arm64-musl");
    expect(hostTarget("darwin", "arm64", true)).toBe("darwin-arm64");
    expect(hostTarget("freebsd", "x64")).toBeNull();
    expect(hostTarget("win32", "x64")).toBeNull(); // 14.12, when it's done
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
    const block = (_os: string, cpu: string, target: string, sum: string) =>
      `    ${cpu} do\n      url "https://github.com/o/r/releases/download/v1.2.3/slipbox-1.2.3-${target}.tar.gz"\n      sha256 "${sum}"\n    end`;
    expect(f).toContain(
      `  on_macos do\n${block("on_macos", "on_arm", "darwin-arm64", "a".repeat(64))}\n${block("on_macos", "on_intel", "darwin-x64", "b".repeat(64))}\n  end\n  on_linux do\n${block("on_linux", "on_arm", "linux-arm64", "c".repeat(64))}\n${block("on_linux", "on_intel", "linux-x64", "d".repeat(64))}\n  end`,
    );
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
    }, 240_000);

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
        // Homebrew's formula beside it, for a platform Homebrew installs on.
        if (!host!.endsWith("-musl"))
          expect(readFileSync(join(out, "slipbox.rb"), "utf8")).toContain(
            `url "https://github.com/example/slipbox/releases/download/v${VERSION}/${assetName(VERSION, host!)}"\n      sha256 "${sha256sums([pack]).split(" ")[0]}"`,
          );
      },
      60_000,
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
      60_000,
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
      60_000,
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
      60_000,
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
        const done = run(next);
        expect(done.code).toBe(0);
        expect(done.json.data).toEqual({ status: "upgraded", from: VERSION, latest: "9.9.9", removed: [] });
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
      60_000,
    );

    test.if(host !== null)(
      "installed through the Pages bootstrap: slipbox channel says the channel and sets it; upgrade follows it to a preview",
      () => {
        // The releases: this one under its tag, with its installer; a preview after it, its pack a script saying its
        // version. The site names both.
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
        const sumOf = (f: string) => sha256sums([f]).split(" ")[0]!;
        const pages = mkdtempSync(join(sandbox, "pages-"));
        writeFileSync(join(pages, "stable"), `v${VERSION} ${sumOf(join(tagDir, "install.sh"))}\n`);
        writeFileSync(join(pages, "preview"), `${tagOf(pv)} ${sumOf(join(pvDir, "install.sh"))}\n`);
        const boot = join(mkdtempSync(join(sandbox, "boot-")), "install.sh");
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
        // Previews again, and upgraded to the newest.
        expect(run("channel", "set", "preview").code).toBe(0);
        expect(JSON.parse(run("upgrade", "--json").out).data).toEqual({
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
      60_000,
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
      60_000,
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
      60_000,
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
      60_000,
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
      60_000,
    );

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
        if (host !== "darwin-x64")
          expect(install(home, {}, { fake: { ...mac, sysctl: "echo 0" } }).err).toContain("has no darwin-x64 build");
        expect(existsSync(join(home, ".local"))).toBe(false);
      },
      60_000,
    );
  });
});

describe("the dependencies' advisories (GR-D9)", () => {
  const entry = (until: string, advisories = ["GHSA-2222-3333-4444"]): Accepted => ({
    package: "p@1.0.0",
    advisories,
    why: "not reached",
    until,
  });

  test("an advisory accepted counts again after its date: its --ignore dropped, and said", () => {
    const list = [entry("2027-01-12"), entry("2026-10-11", ["GHSA-5555-6666-7777", "GHSA-8888-9999-cccc"])];
    expect(ignoreArgs(list, "2026-10-12")).toEqual({ args: ["--ignore=GHSA-2222-3333-4444"], expired: [list[1]!] });
    // On its date it still holds.
    expect(ignoreArgs(list, "2026-10-11").args).toHaveLength(3);
    expect(ignoreArgs(list, "2027-01-13")).toEqual({ args: [], expired: list });
  });

  test("the list itself: every entry a reason, a date and GHSA ids, none twice — this repository's included", () => {
    expect(acceptedProblems(ACCEPTED)).toEqual([]);
    expect(ACCEPTED.length).toBeGreaterThan(0);
    expect(
      acceptedProblems([
        { ...entry("2027-13-45"), why: " " },
        entry("2027-01-12", ["CVE-2026-1", "GHSA-2222-3333-4444"]),
      ]),
    ).toEqual([
      'p@1.0.0: "2027-13-45" isn\'t a date (YYYY-MM-DD)',
      "p@1.0.0: no reason given",
      "p@1.0.0: CVE-2026-1 isn't a GHSA id",
      "p@1.0.0: GHSA-2222-3333-4444 is listed twice",
    ]);
  });
});

describe("uninstall's plan (14.8)", () => {
  /** An install laid out as install.sh leaves it, in slipbox's folders of its own. */
  function layout(): { dirs: Stores; link: string; base: string } {
    const base = mkdtempSync(join(sandbox, "inst-"));
    const dirs: Stores = {
      config: join(base, "config", "slipbox"),
      state: join(base, "state", "slipbox"),
      data: join(base, "data", "slipbox"),
      cache: join(base, "cache", "slipbox"),
    };
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
    expect(installation(dirs.data)).toEqual({
      versions: ["0.1.0", "0.2.0"],
      current: "0.2.0",
      link,
      foreignLink: null,
    });
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
    for (const p of [link, join(dirs.data, "versions"), join(dirs.data, "current"), join(dirs.data, "bin-link")])
      expect(existsSync(p)).toBe(false);
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
    expect(uninstall({ remove: [{ path: victim, what: "x" }], keep: [], notes: [] }, dirs)).toEqual([
      `${victim}: not slipbox's to remove`,
    ]);
    expect(existsSync(victim)).toBe(true);
  });
});

describe("updates (14.4)", () => {
  const sum = "a".repeat(64);
  const release = { repo: "o/r", target: "linux-x64" };

  test("the latest release, from its SHA256SUMS: its version in the pack's name, the sum beside it", () => {
    const sums = `${"b".repeat(64)}  slipbox-1.4.0-darwin-arm64.tar.gz\n${sum}  slipbox-1.4.0-linux-x64.tar.gz\n${"c".repeat(64)} *slipbox-1.4.0-linux-arm64.tar.gz\n`;
    expect(latestIn(sums, "linux-x64")).toEqual({
      version: "1.4.0",
      asset: "slipbox-1.4.0-linux-x64.tar.gz",
      sha256: sum,
    });
    expect(latestIn(sums, "linux-arm64")?.sha256).toBe("c".repeat(64));
    expect(latestIn(sums, "linux-x64-musl")).toBeNull();
    // A glibc and a musl pack side by side: each its own.
    const both = `${"d".repeat(64)}  slipbox-1.4.0-linux-x64-musl.tar.gz\n${sum}  slipbox-1.4.0-linux-x64.tar.gz\n`;
    expect(latestIn(both, "linux-x64")?.sha256).toBe(sum);
    expect(latestIn(both, "linux-x64-musl")).toEqual({
      version: "1.4.0",
      asset: "slipbox-1.4.0-linux-x64-musl.tar.gz",
      sha256: "d".repeat(64),
    });
    expect(latestIn("<html>not found</html>", "linux-x64")).toBeNull();
    expect(latestIn(`${sum}  slipbox-1.4-linux-x64.tar.gz\n`, "linux-x64")).toBeNull();
    expect(latestIn(`${sum}  slipbox-2.0.0-rc.1-linux-x64.tar.gz\n`, "linux-x64")?.version).toBe("2.0.0-rc.1");
  });

  test("newer by semver; DO_NOT_TRACK set unless 0 or false; GitHub's releases unless SLIPBOX_RELEASES_URL says", () => {
    expect([
      isNewer("0.10.0", "0.9.0"),
      isNewer("0.2.0", "0.2.0"),
      isNewer("0.1.9", "0.2.0"),
      isNewer("1.0.0", "1.0.0-rc.1"),
    ]).toEqual([true, false, false, true]);
    expect([
      doNotTrack({}),
      doNotTrack({ DO_NOT_TRACK: "1" }),
      doNotTrack({ DO_NOT_TRACK: "true" }),
      doNotTrack({ DO_NOT_TRACK: "0" }),
      doNotTrack({ DO_NOT_TRACK: "FALSE" }),
      doNotTrack({ DO_NOT_TRACK: "" }),
    ]).toEqual([false, true, true, false, false, false]);
    expect(releasesBase("o/r", {})).toBe("https://github.com/o/r/releases");
    expect(releasesBase("o/r", { SLIPBOX_RELEASES_URL: "file:///m/" })).toBe("file:///m");
  });

  test("Bun's crash reports off at start, in the C environment, read back through libc: unless you set either switch (D221)", () => {
    const mod = join(ROOT, "src", "core", "crash-reports.ts");
    // A process of its own, its environment as given; what libc's getenv says after, on its last line.
    const after = (env: Record<string, string>, first: string): string | null => {
      const base = Object.fromEntries(
        Object.entries(process.env).filter(
          ([k]) => !k.startsWith("BUN_CRASH_REPORT") && !k.startsWith("BUN_ENABLE_CRASH"),
        ),
      );
      const script = `${first}\nconst { libc } = await import(${JSON.stringify(mod)});\nconsole.log(JSON.stringify(libc()?.getenv("BUN_ENABLE_CRASH_REPORTING") ?? null));`;
      const run = Bun.spawnSync([process.execPath, "-e", script], { env: { ...base, ...env }, cwd: ROOT });
      expect(run.stderr.toString()).toBe("");
      return JSON.parse(run.stdout.toString().trim().split("\n").at(-1)!);
    };
    const call = `const { crashReportsOff } = await import(${JSON.stringify(mod)}); crashReportsOff();`;
    expect(after({}, "")).toBeNull(); // libc reached, nothing set by itself
    expect(after({}, call)).toBe("0");
    expect(after({ BUN_ENABLE_CRASH_REPORTING: "1" }, call)).toBe("1");
    expect(after({ BUN_CRASH_REPORT_URL: "http://127.0.0.1:9/" }, call)).toBeNull();
    // slipbox's own start does it, before any command runs.
    const start = `process.argv = [process.argv[0], "slipbox", "--version"]; await import(${JSON.stringify(join(ROOT, "src", "main.ts"))});`;
    expect(after({}, start)).toBe("0");
    expect(libcCandidates("linux", "x64")).toEqual(["libc.so.6", "/lib/ld-musl-x86_64.so.1", "libc.so"]);
    expect(libcCandidates("linux", "arm64")[1]).toBe("/lib/ld-musl-aarch64.so.1");
    expect(libcCandidates("darwin", "arm64")[0]).toBe("/usr/lib/libSystem.B.dylib");
  });

  test("fetchLatest asks for latest/download/SHA256SUMS once; offline, an error page, nothing for it: null", async () => {
    const asked: string[] = [];
    const answer = (status: number, body: string) => async (url: string) => (
      asked.push(url), new Response(body, { status })
    );
    expect(
      await fetchLatest("https://x/o/r/releases", "linux-x64", answer(200, `${sum}  slipbox-3.0.0-linux-x64.tar.gz\n`)),
    ).toEqual({ version: "3.0.0", asset: "slipbox-3.0.0-linux-x64.tar.gz", sha256: sum });
    expect(asked).toEqual(["https://x/o/r/releases/latest/download/SHA256SUMS"]);
    expect(await fetchLatest("b", "linux-x64", answer(404, `${sum}  slipbox-3.0.0-linux-x64.tar.gz\n`))).toBeNull();
    expect(await fetchLatest("b", "linux-x64", async () => Promise.reject(new Error("offline")))).toBeNull();
  });

  test("the daily check: a release build, on, no DO_NOT_TRACK, a day since the last — then said when there's a newer one", async () => {
    const stateFile = join(mkdtempSync(join(sandbox, "upd-")), "state", "update.json");
    let asked = 0;
    const fetcher = async () => (asked++, new Response(`${sum}  slipbox-0.3.0-linux-x64.tar.gz\n`));
    const base = { release, version: "0.2.0", enabled: true, env: {}, stateFile, fetcher };
    // Never asked: from source, turned off, DO_NOT_TRACK.
    expect(await dailyUpdateCheck({ ...base, release: null })).toBeNull();
    expect(await dailyUpdateCheck({ ...base, enabled: false })).toBeNull();
    expect(await dailyUpdateCheck({ ...base, env: { DO_NOT_TRACK: "1" } })).toBeNull();
    expect(asked).toBe(0);
    expect(existsSync(stateFile)).toBe(false);
    const now = 1_800_000_000_000;
    expect(await dailyUpdateCheck({ ...base, now })).toBe(
      "slipbox 0.3.0 is out (this is 0.2.0): slipbox upgrade installs it",
    );
    expect(JSON.parse(readFileSync(stateFile, "utf8"))).toEqual({ checked: now, latest: "0.3.0" });
    // Within the day: not asked again.
    expect(await dailyUpdateCheck({ ...base, now: now + CHECK_EVERY_MS - 1 })).toBeNull();
    expect(asked).toBe(1);
    // A day on: asked; the latest is this one, so nothing said.
    expect(await dailyUpdateCheck({ ...base, version: "0.3.0", now: now + CHECK_EVERY_MS })).toBeNull();
    expect(asked).toBe(2);
    // A clock gone back: asked, not waited out.
    expect(await dailyUpdateCheck({ ...base, now: now - 1000 })).not.toBeNull();
    // Offline: the time kept all the same — the next try is a day off.
    const failing = async () => (asked++, Promise.reject(new Error("offline")));
    const later = now + 10 * CHECK_EVERY_MS;
    expect(await dailyUpdateCheck({ ...base, fetcher: failing, now: later })).toBeNull();
    expect(JSON.parse(readFileSync(stateFile, "utf8")).checked).toBe(later);
    const before = asked;
    expect(await dailyUpdateCheck({ ...base, now: later + 1 })).toBeNull();
    expect(asked).toBe(before);
  });

  test("upgrade, in the installer's layout: the new version added, current moved, the one replaced kept, older removed", async () => {
    const data = join(mkdtempSync(join(sandbox, "upg-")), "slipbox");
    for (const v of ["0.8.0", "0.9.0", "1.0.0"]) {
      mkdirSync(join(data, "versions", v), { recursive: true });
      writeFileSync(join(data, "versions", v, "slipbox"), "");
    }
    symlinkSync("versions/1.0.0", join(data, "current"));
    const target = "linux-x64";
    const pack = fakePack(mkdtempSync(join(sandbox, "p-")), "2.0.0", target);
    const asked: string[] = [];
    const fetcher = async (url: string) => {
      asked.push(url);
      return url.endsWith("SHA256SUMS")
        ? new Response(`${pack.sha}  ${pack.asset}\n`)
        : new Response(readFileSync(pack.file));
    };
    const opts = {
      release: { repo: "o/r", target },
      version: "1.0.0",
      data,
      execPath: join(data, "versions", "1.0.0", "slipbox"),
      env: {},
      fetcher,
    };
    expect(await upgrade(opts)).toEqual({
      status: "upgraded",
      from: "1.0.0",
      latest: "2.0.0",
      removed: ["0.8.0", "0.9.0"],
    });
    expect(asked).toEqual([
      "https://github.com/o/r/releases/latest/download/SHA256SUMS",
      `https://github.com/o/r/releases/download/v2.0.0/${pack.asset}`,
    ]);
    expect(readlinkSync(join(data, "current"))).toBe("versions/2.0.0");
    expect(Bun.spawnSync(["ls", "-A", join(data, "versions")]).stdout.toString()).toBe("1.0.0\n2.0.0\n");
    expect(Bun.spawnSync(["ls", "-A", data]).stdout.toString()).toBe("current\nversions\n");
    expect(installation(data)).toMatchObject({ versions: ["1.0.0", "2.0.0"], current: "2.0.0" });
  });

  test("upgrade refuses, changing nothing: a binary that says another version, one that doesn't run, a binary not in the layout", async () => {
    const data = join(mkdtempSync(join(sandbox, "upg-")), "slipbox");
    mkdirSync(join(data, "versions", "1.0.0"), { recursive: true });
    writeFileSync(join(data, "versions", "1.0.0", "slipbox"), "");
    symlinkSync("versions/1.0.0", join(data, "current"));
    const target = "linux-x64";
    const attempt = async (says: string, execPath = join(data, "versions", "1.0.0", "slipbox")) => {
      const pack = fakePack(mkdtempSync(join(sandbox, "p-")), "2.0.0", target, says);
      const fetcher = async (url: string) =>
        url.endsWith("SHA256SUMS")
          ? new Response(`${pack.sha}  ${pack.asset}\n`)
          : new Response(readFileSync(pack.file));
      try {
        await upgrade({ release: { repo: "o/r", target }, version: "1.0.0", data, execPath, env: {}, fetcher });
        return "upgraded";
      } catch (err) {
        expect(err).toBeInstanceOf(UpgradeError);
        return (err as Error).message;
      }
    };
    expect(await attempt("slipbox 1.9.9")).toBe(
      'the new binary says "slipbox 1.9.9", not "slipbox 2.0.0": nothing changed',
    );
    expect(readlinkSync(join(data, "current"))).toBe("versions/1.0.0");
    expect(Bun.spawnSync(["ls", "-A", join(data, "versions")]).stdout.toString()).toBe("1.0.0\n");
    const elsewhere = join(mkdtempSync(join(sandbox, "else-")), "slipbox");
    writeFileSync(elsewhere, "");
    expect(await attempt("slipbox 2.0.0", elsewhere)).toBe(
      `this slipbox (${elsewhere}) wasn't installed by its installer: upgrade it the way it was installed`,
    );
  });
});

describe("how slipbox was installed, and what's said for it (14.3)", () => {
  test("the installer's, Homebrew's (its Cellar, behind a link too), or another way", () => {
    const base = mkdtempSync(join(sandbox, "by-"));
    const data = join(base, "data", "slipbox");
    mkdirSync(join(data, "versions", "1.0.0"), { recursive: true });
    writeFileSync(join(data, "versions", "1.0.0", "slipbox"), "");
    expect(installedBy(join(data, "versions", "1.0.0", "slipbox"), data, "1.0.0")).toBe("installer");
    const cellar = join(base, "opt", "homebrew", "Cellar", "slipbox", "1.0.0", "bin", "slipbox");
    mkdirSync(join(cellar, ".."), { recursive: true });
    writeFileSync(cellar, "");
    mkdirSync(join(base, "opt", "homebrew", "bin"), { recursive: true });
    symlinkSync(cellar, join(base, "opt", "homebrew", "bin", "slipbox"));
    expect(installedBy(cellar, data, "1.0.0")).toBe("homebrew");
    expect(installedBy(join(base, "opt", "homebrew", "bin", "slipbox"), data, "1.0.0")).toBe("homebrew");
    expect(installedBy(join(base, "elsewhere", "slipbox"), data, "1.0.0")).toBe("other");
    // Another version's folder isn't this one's.
    expect(installedBy(join(data, "versions", "1.0.0", "slipbox"), data, "2.0.0")).toBe("other");
    expect([howToUpgrade("installer", "o/r"), howToUpgrade("homebrew", "o/r"), howToUpgrade("other", "o/r")]).toEqual([
      "slipbox upgrade installs it",
      "brew upgrade slipbox installs it",
      "it's at https://github.com/o/r/releases",
    ]);
  });

  test("Homebrew's: the daily check says brew; upgrade leaves it to brew; uninstall says brew removes it", async () => {
    const stateFile = join(mkdtempSync(join(sandbox, "upd-")), "update.json");
    const fetcher = async () => new Response(`${"a".repeat(64)}  slipbox-0.3.0-linux-x64.tar.gz\n`);
    const release = { repo: "o/r", target: "linux-x64" };
    expect(
      await dailyUpdateCheck({ release, version: "0.2.0", enabled: true, env: {}, stateFile, fetcher, by: "homebrew" }),
    ).toBe("slipbox 0.3.0 is out (this is 0.2.0): brew upgrade slipbox installs it");
    const base = mkdtempSync(join(sandbox, "brew-"));
    const cellar = join(base, "Cellar", "slipbox", "0.2.0", "bin", "slipbox");
    mkdirSync(join(cellar, ".."), { recursive: true });
    writeFileSync(cellar, "");
    let asked = 0;
    const err = await upgrade({
      release,
      version: "0.2.0",
      data: join(base, "data"),
      execPath: cellar,
      env: {},
      fetcher: async () => (asked++, new Response("")),
    }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(UpgradeError);
    expect((err as Error).message).toBe("this slipbox is Homebrew's: brew upgrade slipbox");
    expect(asked).toBe(0);
    const dirs: Stores = {
      config: join(base, "c", "slipbox"),
      state: join(base, "s", "slipbox"),
      data: join(base, "d", "slipbox"),
      cache: join(base, "k", "slipbox"),
    };
    expect(uninstallPlan(false, dirs, "homebrew").notes).toEqual([
      "this slipbox is Homebrew's: brew uninstall slipbox removes it",
    ]);
    expect(uninstallPlan(false, dirs, "other").notes).toEqual([]);
  });
});

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
      expect(await check("preview")).toBe(
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
      ).toEqual({ status: "upgraded", from: "1.2.3", latest: PREVIEW, removed: [] });
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
