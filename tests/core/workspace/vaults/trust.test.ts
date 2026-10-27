import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../../../../src/core/application/config/config.ts";
import { type LintIssue, lintLoadsCode, runLint } from "../../../../src/core/documents/diagnostics/lint.ts";
import {
  isTrusted,
  setTrust,
  setTrustedRoots,
  trustFile,
  trustOf,
} from "../../../../src/core/workspace/vaults/trust.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const sandbox = makeCoreSandbox();

describe("trust (23.x)", () => {
  test("a root is trusted when your list names it, a folder above it, or a glob matching either; nothing is by default", () => {
    const home = mkdtempSync(join(sandbox, "trust-"));
    const proj = join(home, "Projects", "app");
    mkdirSync(join(proj, "src"), { recursive: true });
    mkdirSync(join(home, "Other", "x"), { recursive: true });
    expect(isTrusted(proj, [])).toBe(false);
    expect(isTrusted(proj, [proj])).toBe(true);
    expect(isTrusted(join(proj, "src"), [proj])).toBe(true); // inside it
    expect(isTrusted(join(home, "Projects"), [proj])).toBe(false); // above it isn't
    expect(isTrusted(join(proj, "src"), [join(home, "Projects", "*")])).toBe(true);
    expect(isTrusted(join(home, "Other", "x"), [join(home, "Projects", "*")])).toBe(false);
    expect(isTrusted(`${proj}-evil`, [proj])).toBe(false); // a name that starts the same
    // Through a symlink: the folder it is.
    symlinkSync(proj, join(home, "link"));
    expect(isTrusted(join(home, "link", "src"), [proj])).toBe(true);
    // The list set once is the one asked.
    setTrustedRoots([proj]);
    expect(isTrusted(proj)).toBe(true);
  });

  test("only your config trusts: a folder's [trust] is ignored, said why; a list of other than paths is warned of", () => {
    const dir = mkdtempSync(join(sandbox, "trustcfg-"));
    const user = join(dir, "config.toml");
    writeFileSync(user, '[trust]\nroots = ["~/Projects/*", ""]\n');
    mkdirSync(join(dir, "v", ".slipbox"), { recursive: true });
    writeFileSync(join(dir, "v", ".slipbox", "config.toml"), '[trust]\nroots = ["/"]\n');
    const r = loadConfig({ configFile: user, vaultRoot: join(dir, "v") });
    expect(r.config.trust.roots).toEqual(["~/Projects/*"]);
    expect(
      r.warnings.some((w) =>
        w.includes("sets [trust], which only your own config may set (a folder can't trust itself)"),
      ),
    ).toBe(true);
    expect(r.warnings.some((w) => w.includes("trust.roots takes paths and globs"))).toBe(true);
  });

  test("your answers, as the TUI keeps them: trusted or kept safe, the nearest counting, read again when another slipbox wrote them; your config's list wins", () => {
    const dir = realpathSync(mkdtempSync(join(sandbox, "answers-")));
    const app = join(dir, "app");
    mkdirSync(join(app, "pkg"), { recursive: true });
    expect(trustOf(app, [])).toBeNull(); // not answered: the TUI may ask
    setTrust(app, "trusted");
    expect(trustOf(join(app, "pkg"), [])).toBe("trusted"); // inside it
    setTrust(join(app, "pkg"), "restricted");
    expect(trustOf(join(app, "pkg", "x.ts"), [])).toBe("restricted"); // the nearest answer
    expect(trustOf(app, [])).toBe("trusted");
    // Another slipbox answered: read again.
    writeFileSync(trustFile(), JSON.stringify({ trusted: [], restricted: [app] }));
    utimesSync(trustFile(), new Date(), new Date(Date.now() + 5000));
    expect(trustOf(app, [])).toBe("restricted");
    expect(trustOf(app, [app])).toBe("trusted"); // your config's list
    setTrust(app, null);
    expect(trustOf(app, [])).toBeNull();
  });

  test("markdownlint-cli2 in a root you don't trust (23.5): a file under a config that is code, or names code, isn't linted — said once", async () => {
    const root = mkdtempSync(join(sandbox, "mdl-trust-"));
    for (const [rel, text] of Object.entries({
      "plain/a.md": "# A\n",
      "js/.markdownlint.cjs": "module.exports = {};\n",
      "js/deep/b.md": "# B\n",
      "rules/.markdownlint-cli2.jsonc": '{ "customRules": ["./rule.js"] }\n',
      "rules/c.md": "# C\n",
    })) {
      mkdirSync(join(root, rel, ".."), { recursive: true });
      writeFileSync(join(root, rel), text);
    }
    expect(lintLoadsCode(join(root, "plain/a.md"), root)).toBe(false);
    expect(lintLoadsCode(join(root, "js/deep/b.md"), root)).toBe(true);
    expect(lintLoadsCode(join(root, "rules/c.md"), root)).toBe(true);
    // A linter that names every file it's given: only the plain one reaches it.
    const fake = join(root, "fake-mdl");
    writeFileSync(
      fake,
      '#!/bin/sh\nfor f in "$@"; do echo "${f#:}:1 error MD041/first-line-heading First line"; done\nexit 1\n',
    );
    chmodSync(fake, 0o755);
    const said: string[] = [];
    const files = ["plain/a.md", "js/deep/b.md", "rules/c.md"].map((f) => join(root, f));
    const got = await runLint({ argv: [fake], literal: true }, files, root, undefined, (t) => said.push(t));
    expect((got as LintIssue[]).map((i) => i.file)).toEqual([join(root, "plain/a.md")]);
    expect(said).toEqual([
      `markdownlint-cli2 not run on 2 file(s): a markdownlint config there is code, or names code to load, and ${root} isn't a vault you trust — [trust] roots in your config`,
    ]);
    await runLint({ argv: [fake], literal: true }, files, root, undefined, (t) => said.push(t));
    expect(said.length).toBe(1); // said once
    setTrustedRoots([root]);
    expect(((await runLint({ argv: [fake], literal: true }, files, root)) as LintIssue[]).length).toBe(3);
  });
});
