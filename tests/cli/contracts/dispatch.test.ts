import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { VERSION } from "../../../src/version.ts";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";
import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";

setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, slipbox } = makeCliProcessSandbox();

// Every competing failure below is deliberate: admission order is observable to callers.
describe("CLI dispatch and presentation order", () => {
  test("parsing precedes version/help; version precedes help, color and root admission", () => {
    const missing = join(sandbox, "missing");
    const root = ["--root", missing];
    for (const args of [
      ["read", "--help", "--version", "--color", "bad", ...root],
      ["report", "extra", "--version", ...root],
    ]) {
      const r = slipbox([...args, "--json"]);
      expect(r).toMatchObject({ code: 0, err: "" });
      expect(r.json).toEqual({
        schema: 1,
        ok: true,
        command: "version",
        data: { version: VERSION },
        warnings: [],
        stale: [],
      });
    }
    const help = slipbox(["read", "--help", "--color", "bad", ...root, "--json"]);
    expect(help).toMatchObject({ code: 0, err: "" });
    expect(help.json).toMatchObject({ ok: true, command: "help", warnings: [], stale: [] });
    expect(help.json.data.text).toBe(slipbox(["help"]).out);
    const parse = slipbox(["--version", "--help", "--color=", "--json"]);
    expect(parse).toMatchObject({ code: 2, err: "" });
    expect(parse.json).toMatchObject({
      ok: false,
      command: "help",
      error: { code: 2, message: "--color needs a value (it was empty)" },
    });
    expect(existsSync(missing)).toBe(false);
  });

  test("report precedes roots; color precedes report usage, roots precede handler and command usage", () => {
    const root = ["--root", join(sandbox, "missing")];
    expect(slipbox(["report", ...root, "--json"]).json).toMatchObject({ ok: true, command: "report" });
    const color = slipbox(["report", "extra", "--color", "bad", ...root]);
    expect(color).toMatchObject({ code: 2, out: "", err: "slipbox: --color must be auto, always or never\n" });
    expect(slipbox(["report", "extra", ...root]).err).toBe(
      "slipbox: report takes at most 0 arguments; got 1 (extra too many)\n",
    );
    for (const args of [
      ["unknown", "--json"],
      ["read", "a", "b", "--json"],
    ]) {
      const r = slipbox([...args, ...root]);
      expect(r).toMatchObject({ code: 3, err: "" });
      expect(r.json).toMatchObject({ ok: false, command: args[0], error: { code: 3 }, warnings: [], stale: [] });
      expect(r.json.error?.message).toContain("--root");
    }
    expect(slipbox(["read", "a", "b", "--dry-run"]).err).toBe(
      "slipbox: read takes at most 1 argument; got 2 (b too many)\n",
    );
  });

  test("parse errors recover the command past valued flags and --, including malformed JSON flags", () => {
    for (const [args, command, message] of [
      [["--root", "elsewhere", "--color=never", "read", "--json=bad"], "read", "--json does not take a value"],
      [["--width", "80", "--bogus", "--json", "--", "read"], "read", "unknown option: --bogus"],
      [["--root", "elsewhere", "--json", "--width"], "help", "--width needs a value"],
    ] as const) {
      // The process helper parses only a literal --json; malformed --json=bad is checked from raw stdout.
      const r = slipbox([...args]);
      expect(r).toMatchObject({ code: 2, err: "" });
      const json = JSON.parse(r.out);
      expect(Object.keys(json)).toEqual(["schema", "ok", "command", "error", "data", "warnings", "stale"]);
      expect(json).toMatchObject({ schema: 1, ok: false, command, data: null, warnings: [], stale: [] });
      expect(json.error.code).toBe(2);
      expect(json.error.message).toStartWith(message);
      expect(r.out.split("\n")).toHaveLength(2);
    }
  });

  test("errors escape terminal controls losslessly in JSON and sanitize human diagnostics", () => {
    const root = join(sandbox, "unsafe-\u009b\u007f\u202e");
    const r = slipbox(["read", "absent", "--root", root, "--json"]);
    expect(r).toMatchObject({ code: 3, err: "" });
    expect(r.json.error?.message).toContain(root);
    for (const c of ["\u009b", "\u007f", "\u202e"]) expect(r.out).not.toContain(c);
    expect(r.out).toContain("\\u009b\\u007f\\u202e");
    const human = slipbox(["read", "absent", "--root", root]);
    expect(human).toMatchObject({ code: 3, out: "" });
    expect(human.err).toStartWith("slipbox: --root");
    for (const c of ["\u009b", "\u007f", "\u202e"]) expect(human.err).not.toContain(c);
  });

  test("missing links and refused writes retain their exit codes and structured data", () => {
    const dir = join(sandbox, "result-vault");
    mkdirSync(join(dir, ".slipbox"), { recursive: true });
    writeFileSync(join(dir, "one.md"), "# One\n");
    const unresolved = slipbox(["resolve", "absent", "--json"], { cwd: dir });
    expect(unresolved).toMatchObject({ code: 3, err: "" });
    expect(unresolved.json).toMatchObject({
      ok: false,
      command: "resolve",
      error: { code: 3, message: 'unresolved link "absent"' },
      data: { status: "unresolved", certainty: "broken" },
      warnings: [],
      stale: [],
    });
    const refused = slipbox(["write", "one.md", "changed", "--if-unchanged", "0000", "--json"], { cwd: dir });
    expect(refused).toMatchObject({ code: 5, err: "" });
    expect(refused.json).toMatchObject({ ok: false, command: "write", error: { code: 5 } });
    expect(readFileSync(join(dir, "one.md"), "utf8")).toBe("# One\n");
  });
});
