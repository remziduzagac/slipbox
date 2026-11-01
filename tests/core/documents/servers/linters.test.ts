import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../../../../src/core/application/config/config.ts";
import { doctorFile } from "../../../../src/core/documents/servers/doctor.ts";
import { languageOf, serverTable } from "../../../../src/core/documents/servers/languages.ts";
import {
  commandFor,
  compileFormat,
  type Format,
  type LinterConfig,
  linterRoot,
  LINTERS,
  linterTable,
  parseFindings,
  projectPath,
  runLinter,
} from "../../../../src/core/documents/servers/linters.ts";
import { setTrustedRoots } from "../../../../src/core/workspace/vaults/trust.ts";
import { makeServerSandbox } from "../../../support/server-sandbox.ts";
import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";

setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox } = makeServerSandbox();

describe("linters without a server (19.19)", () => {
  const dir = (name: string, files: Record<string, string>) => {
    const root = join(sandbox, name);
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(root, rel, ".."), { recursive: true });
      writeFileSync(join(root, rel), text);
    }
    return root;
  };
  /** A linter as a config would write it, over efm's defaults. */
  const linter = (c: LinterConfig) => linterTable({ t: c }).t!;
  const formats = (...fs: string[]) => fs.map((f) => compileFormat(f) as Format);

  test("vim's errorformat, the part linters use: fields, patterns, lines passed over; multi-line ones refused", () => {
    const f = compileFormat("%f:%l:%c: %*[^:]: %m") as Format;
    expect(f.fields).toEqual(["f", "l", "c", "m"]);
    expect(f.re.exec("a.sh:3:7: SC2086: Double quote")?.slice(1)).toEqual(["a.sh", "3", "7", "Double quote"]);
    expect((compileFormat("%f:%l%\\s%#%m") as Format).re.exec("x:2   hi")?.slice(1)).toEqual(["x", "2", "hi"]);
    expect((compileFormat("%f(%l): %*\\d %m") as Format).re.source).toBe("^(.+?)\\((\\d+)\\): \\d+ (.*)$");
    expect((compileFormat("%-G%.%#warning%.%#") as Format).ignore).toBe(true);
    expect((compileFormat("%Wwarn %f:%l %m") as Format).type).toBe("w");
    expect(compileFormat("%C%m")).toContain("multi-line");
    expect(compileFormat("%f:%l %q")).toContain("%q isn't read");
  });

  test("findings: severity by %t, else the linter's; this file's only; columns, ends, codes, pointers", () => {
    const file = join(sandbox, "lint", "a.yaml");
    const def = { source: "yl", severity: "warning" as const };
    const fs = formats(
      "%-G%.%#ignored%.%#",
      "%f:%l:%c: [%trror] %m",
      "%f:%l:%c: [%tarning] %m",
      "%f:%l:%c-%e:%k E%n %m",
      "%f:%l %m",
      "%p^ %m",
    );
    const out = parseFindings(
      [
        "stdin:1:1: [warning] missing start",
        "-:2:5: [error] too many spaces",
        "other.yaml:3:1: [error] not this file",
        "a.yaml:4:2-5:9 E42 spans",
        "<stdin>:6 bare",
        "this is ignored here",
        "    ^ pointed",
        "noise",
      ].join("\n"),
      fs,
      def,
      file,
      join(sandbox, "lint"),
    );
    expect(
      out.map((p) => [p.start.line, p.start.column, p.end.line, p.end.column, p.severity, p.code, p.message]),
    ).toEqual([
      [1, 1, 1, 2, "warning", null, "missing start"],
      [2, 5, 2, 6, "error", null, "too many spaces"],
      [4, 2, 5, 9, "warning", "42", "spans"],
      [6, 1, 6, 1, "warning", null, "bare"],
      [1, 5, 1, 6, "warning", null, "pointed"],
    ]);
    expect(out.every((p) => p.source === "yl")).toBe(true);
  });

  test("run as efm runs it: its input the text, from its project, the project's own copy first; exit 0 is nothing found", async () => {
    setTrustedRoots([sandbox]); // a root you trust (23.x): the project's own programs and settings count
    const root = dir("efm", {
      ".fakelintrc": "",
      "src/a b's.txt": "on disk\n",
      "node_modules/.bin/fakelint": '#!/bin/sh\necho "-:1:2: [error] own copy, in $(basename "$PWD")"\nexit 1\n',
    });
    chmodSync(join(root, "node_modules/.bin/fakelint"), 0o755);
    const file = join(root, "src/a b's.txt");
    // Its input, read: a finding per line holding BAD.
    const reads = linter({
      "lint-command": "grep -n BAD | sed 's/^\\([0-9]*\\):.*/stdin:\\1:1: [error] found BAD/'; exit 1",
      "lint-formats": ["%f:%l:%c: [%trror] %m"],
    });
    expect(await runLinter(reads, file, "ok\nBAD here\n", root)).toEqual({
      problems: [
        {
          start: { line: 2, column: 1 },
          end: { line: 2, column: 2 },
          severity: "error",
          source: "t",
          code: null,
          message: "found BAD",
        },
      ],
    });
    // An exit of 0 is efm's "nothing found", whatever it printed — unless told to ignore it.
    const zero = linter({
      "lint-command": "echo 'stdin:1:1: [error] said, but exit 0'",
      "lint-formats": ["%f:%l:%c: [%trror] %m"],
    });
    expect(await runLinter(zero, file, "", root)).toEqual({ problems: [] });
    expect(await runLinter({ ...zero, ignoreExitCode: true }, file, "", root)).toMatchObject({
      problems: [{ message: "said, but exit 0" }],
    });
    // The file as saved: its path in place of ${INPUT}, quoted; appended when there's none.
    const onDisk = linter({
      "lint-command": "sed -n 's/^\\(.*\\)$/1: \\1/p' ${INPUT}; exit 1",
      "lint-stdin": false,
      "lint-formats": ["%l: %m"],
    });
    expect(await runLinter(onDisk, file, "typed, unsaved", root)).toMatchObject({
      problems: [{ start: { line: 1 }, message: "on disk" }],
    });
    expect(commandFor(linter({ "lint-command": "cat", "lint-stdin": false }), file)).toBe(
      `cat '${root}/src/a b'\\''s.txt'`,
    );
    // The project's copy, before PATH's, run from the project's top folder.
    expect(
      await runLinter(
        linter({ "lint-command": "fakelint", "lint-formats": ["%f:%l:%c: [%trror] %m"] }),
        file,
        "",
        root,
      ),
    ).toMatchObject({ problems: [{ message: "own copy, in efm" }] });
    // Not there: the shell's 127, said as missing.
    expect(await runLinter(linter({ "lint-command": "slipbox-no-such-linter" }), file, "", root)).toMatchObject({
      failed: "missing",
    });
    expect(await runLinter(linter({ "lint-command": "cat", "lint-formats": ["%C%m"] }), file, "", root)).toMatchObject({
      failed: "error",
    });
  });

  test("where it runs: the folder with its config; one needing it doesn't run without; built in by language", () => {
    const root = dir("marks", {
      ".git/HEAD": "",
      "svc/.hadolint.yaml": "",
      "svc/api/Dockerfile": "",
      "web/Dockerfile": "",
    });
    const hadolint = linterTable().hadolint!;
    expect(linterRoot(hadolint, join(root, "svc/api/Dockerfile"), root)).toBe(join(root, "svc"));
    expect(linterRoot(hadolint, join(root, "web/Dockerfile"), root)).toBeNull(); // the project doesn't ask
    expect(linterRoot({ ...hadolint, requireMarker: false }, join(root, "web/Dockerfile"), root)).toBe(root);
    expect(languageOf(serverTable(), "Dockerfile")!.linters).toEqual(["hadolint"]);
    expect(languageOf(serverTable({}, [{ name: "yaml", linters: ["mine"] }]), "a.yml")!.linters).toEqual(["mine"]);
    // A config's keys over the built-in's.
    expect(linterTable({ yamllint: { "lint-command": "yamllint --strict -f parsable -" } }).yamllint).toMatchObject({
      command: "yamllint --strict -f parsable -",
      formats: LINTERS.yamllint!.formats,
      requireMarker: true,
    });
  });

  test("a vault's config tunes known linters, never names a program", () => {
    const root = dir("lintcfg", {
      "user.toml":
        '[linter.mine]\nlint-command = "mine -"\n\n[[language]]\nname = "yaml"\nlinters = ["yamllint", "mine"]\n',
      "vault.toml":
        '[linter.yamllint]\nlint-command = "/tmp/evil"\nrequire-marker = false\n\n[linter.evil]\nlint-command = "/tmp/evil"\n',
    });
    const { config, warnings } = loadConfig({
      configFile: join(root, "user.toml"),
      vaultFile: join(root, "vault.toml"),
    });
    expect(config.linter).toEqual({ mine: { "lint-command": "mine -" }, yamllint: { "require-marker": false } });
    expect(config.language).toEqual([{ name: "yaml", linters: ["yamllint", "mine"] }]);
    expect(
      warnings.some((w) => w.includes("sets linter.yamllint.lint-command, which only your own config may set")),
    ).toBe(true);
    expect(warnings.some((w) => w.includes("adds the linter evil, which only your own config may"))).toBe(true);
  });
  test("errorformat's regex items and ranges: %\\+ %\\? %\\= and a plain backslash; %[…]; what's malformed is said", () => {
    const f = (s: string) => compileFormat(s) as Format;
    expect(f("%f:%l:%\\s%\\+%m").re.exec("x:2:   hi")?.slice(1)).toEqual(["x", "2", "hi"]);
    expect(f("%f:%l:%\\s%\\+%m").re.exec("x:2:hi")).toBeNull(); // one at least
    expect(f("%f:%l:%\\s%\\?%m").re.exec("x:2:hi")?.slice(1)).toEqual(["x", "2", "hi"]);
    expect(f("%f:%l:%\\s%\\=%m").re.exec("x:2: hi")?.slice(1)).toEqual(["x", "2", "hi"]);
    expect(f("%f:%l:%\\s%\\?%m").re.exec("x:2:  hi")?.slice(1)).toEqual(["x", "2", " hi"]); // one at most
    expect(f("%f %\\| %m").re.exec("a \\| m")?.slice(1)).toEqual(["a", "m"]); // a backslash as itself
    const range = f("%f:%l:%[A-Z] %m");
    expect(range.fields).toEqual(["f", "l", "m"]); // a range isn't captured
    expect(range.re.exec("a.sh:3:W text")?.slice(1)).toEqual(["a.sh", "3", "text"]);
    expect(range.re.exec("a.sh:3:w text")).toBeNull();
    expect(f("%f:%[^0-9]%m").re.exec("x:yes")?.slice(1)).toEqual(["x", "es"]);
    expect(f("%f:%[^0-9]%m").re.exec("x:9no")).toBeNull();
    expect(compileFormat("%f:%[A-Z")).toContain("an unclosed %[");
    expect(compileFormat("%f:%l %")).toContain("ends in a lone %");
  });

  test("a linter that takes too long is stopped, and said so; one that can't start at all says why", async () => {
    const root = dir("slowlint", { "a.txt": "" });
    const t = Date.now();
    expect(await runLinter(linter({ "lint-command": "sleep 5" }), join(root, "a.txt"), "", root, 200)).toEqual({
      failed: "timeout",
      detail: "t took longer than 0.2 s",
    });
    expect(Date.now() - t).toBeLessThan(3000);
    // Its project's folder gone (deleted while open): the shell itself can't start there.
    const gone = join(sandbox, "slowlint-gone");
    expect(await runLinter(linter({ "lint-command": "true" }), join(gone, "a.txt"), "", gone)).toMatchObject({
      failed: "error",
      detail: expect.stringMatching(/^t: .*ENOENT/),
    });
  });

  test("a linter in a root you don't trust (23.2): the project's own copy isn't on its PATH; in one you trust, first", () => {
    const root = dir("untrusted-lint", { "node_modules/.bin/x": "" });
    expect(projectPath(root, "/usr/bin")).toBe("/usr/bin");
    setTrustedRoots([root]);
    expect(projectPath(root, "/usr/bin")).toBe(`${join(root, "node_modules/.bin")}:/usr/bin`);
  });

  test("doctor for a file: each linter's own folder, its program found from there; null where the project doesn't ask", () => {
    setTrustedRoots([sandbox]); // a root you trust (23.x): the project's own programs and settings count
    const root = dir("doclint", {
      ".git/HEAD": "",
      "svc/.hadolint.yaml": "",
      "svc/api/Dockerfile": "",
      "svc/node_modules/.bin/hadolint": "#!/bin/sh\n",
      "web/Dockerfile": "",
    });
    chmodSync(join(root, "svc/node_modules/.bin/hadolint"), 0o755);
    const svc = doctorFile(serverTable(), linterTable(), join(root, "svc/api/Dockerfile"), false)!;
    expect(svc.root).toBe(root);
    expect(svc.linters).toEqual([
      expect.objectContaining({
        name: "hadolint",
        root: join(root, "svc"),
        where: "project",
        path: join(root, "svc/node_modules/.bin/hadolint"),
      }),
    ]);
    const web = doctorFile(serverTable(), linterTable(), join(root, "web/Dockerfile"), false)!;
    expect(web.linters).toEqual([expect.objectContaining({ name: "hadolint", root: null })]);
    expect(web.linters[0]!.where).not.toBe("project");
  });
});
