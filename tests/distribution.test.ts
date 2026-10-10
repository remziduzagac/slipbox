// Distribution (plan 14.x): the supply chain's gates and the notices a release ships (14.10).
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { bunfigProblems, checkDeps, licenceProblems, licenceTaken, notices, type Package, productionPackages, repoLink, specProblems, workflowProblems } from "../scripts/check-deps.ts";

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

