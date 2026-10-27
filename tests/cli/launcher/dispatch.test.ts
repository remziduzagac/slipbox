import { Parser, Language } from "web-tree-sitter";
import runtime from "web-tree-sitter/tree-sitter.wasm" with { type: "file" };
import grammar from "tree-sitter-typescript/tree-sitter-typescript.wasm" with { type: "file" };
import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CLI_COMMANDS, FLAGS } from "../../../src/cli/cli.ts";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { MAIN, DEMO, vault, env, slipbox, note } = makeCliProcessSandbox();

describe("the vault and the tool", () => {
  test("slipbox lsp is gone: said why on stderr (an editor's log), exit 2", () => {
    const r = slipbox(["lsp"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("slipbox lsp was removed");
  });
  test("no terminal (9.3): slipbox [path] and slipbox open [path] refuse the TUI, a hint and exit 2; --help, --version, --json run the CLI", () => {
    for (const args of [[], ["home.md"], ["open"], ["open", "home.md"], ["home.md", "--theme", "nord"]]) {
      const r = slipbox(args);
      expect([args.join(" "), r.code, r.out]).toEqual([args.join(" "), 2, ""]); // nothing painted into the pipe
      expect(r.err).toStartWith("slipbox: not starting the TUI — stdin/stdout is not a terminal.\n");
      expect(r.err).toContain("`slipbox render <note>`");
    }
    // An unknown flag is a usage error, said as one.
    expect(slipbox(["home.md", "--bogus"])).toMatchObject({
      code: 2,
      err: expect.stringContaining("unknown option: --bogus"),
    });
    // These run the CLI instead, whatever the path.
    expect(slipbox(["home.md", "--help"])).toMatchObject({
      code: 0,
      out: expect.stringContaining("slipbox find <query>"),
    });
    expect(slipbox(["home.md", "--version"]).out).toMatch(/^slipbox \d+\.\d+\.\d+\n$/);
    expect(slipbox(["--json"]).json).toMatchObject({ ok: true, command: "help" });
  });
  test("errors: usage 2, not found 3, --json always one object", () => {
    const bad = slipbox(["frobnicate", "--json"]);
    expect(bad.code).toBe(2);
    expect(bad.json).toMatchObject({ ok: false, command: "frobnicate", error: { code: 2 } });
    expect(slipbox(["ls", "--bogus"]).code).toBe(2);
    const missing = slipbox(["render", "nothing-here", "--json"]);
    expect(missing.code).toBe(3);
    expect(missing.json.ok).toBe(false);
  });
  test("review cycle 5: flags a command doesn't take are refused; dashes after --; strict stdin", () => {
    const before = note("people/kenji-mori.md");
    expect(slipbox(["write", "people/kenji-mori.md", "# gone", "--dry-run"]).code).toBe(2);
    expect(note("people/kenji-mori.md")).toBe(before);
    const weekly = note("meetings/2026-09-14-weekly.md");
    expect(slipbox(["task", "2026-09-14-weekly", "17", "--dry-run"]).code).toBe(2);
    expect(note("meetings/2026-09-14-weekly.md")).toBe(weekly);
    expect(slipbox(["capture", "x", "--if-unchanged", "abc"]).code).toBe(2);
    const dash = slipbox(["write", "people/kenji-mori.md", "- item", "--append"]);
    expect(dash.code).toBe(2);
    expect(dash.err).toContain("after --");
    expect(slipbox(["write", "people/kenji-mori.md", "--append", "--", "- item"]).code).toBe(0);
    expect(note("people/kenji-mori.md").endsWith("- item\n")).toBe(true);
    const r = Bun.spawnSync(["bun", MAIN, "write", "people/kenji-mori.md", "--stdin"], {
      cwd: vault,
      env,
      stdin: Buffer.from([0xff, 0xfe, 0x20, 0x62]),
    });
    expect(r.exitCode).toBe(5);
    expect(note("people/kenji-mori.md").endsWith("- item\n")).toBe(true);
  });

  test("every CLI command is covered by a process scenario", async () => {
    await Parser.init({ locateFile: () => runtime });
    const parser = new Parser();
    parser.setLanguage(await Language.load(grammar));
    const ran = new Set<string>();
    const ROOT = join(import.meta.dir, "../../..");
    const CLI = join(ROOT, "tests", "cli");
    const commandsIn = (source: string): string[] => {
      const tree = parser.parse(source)!;
      const commands: string[] = [];
      try {
        expect(tree.rootNode.hasError).toBe(false);
        for (const call of tree.rootNode.descendantsOfType("call_expression")) {
          if (call?.childForFieldName("function")?.text !== "slipbox") continue;
          let excluded = false;
          for (let ancestor = call?.parent; ancestor; ancestor = ancestor.parent) {
            if (
              ancestor.type === "call_expression" &&
              /^(?:test|it|describe)\.(?:skip|todo|only)(?:If)?\b/.test(
                ancestor.childForFieldName("function")?.text ?? "",
              )
            ) {
              excluded = true;
              break;
            }
          }
          if (excluded) continue;
          const args = call?.childForFieldName("arguments")?.namedChildren[0];
          if (args?.type !== "array") continue;
          const word = args.namedChildren[0];
          if (word?.type === "string") commands.push(word.text.slice(1, -1));
        }
      } finally {
        tree.delete();
      }
      return commands;
    };
    try {
      expect(
        commandsIn(`
        test("live", () => slipbox(["live"]));
        test.skip("skip", () => slipbox(["skipped"]));
        describe.skip("group", () => test("nested", () => slipbox(["grouped"])));
        test.skipIf(true)("conditional", () => slipbox(["conditional"]));
        test.todo("todo", () => slipbox(["todo"]));
        test.only("only", () => slipbox(["focused"]));
        const sample = 'slipbox(["quoted"])';
        // slipbox(["comment"]);
      `),
      ).toEqual(["live"]);
      for (const file of new Bun.Glob("**/*.test.ts").scanSync(CLI))
        for (const word of commandsIn(readFileSync(join(CLI, file), "utf8"))) ran.add(word);
    } finally {
      parser.delete();
    }
    const missing = [...CLI_COMMANDS].filter((c) => !ran.has(c));
    expect(missing).toEqual([]);
  });
});

describe("review cycle 6 (cli)", () => {
  test("extra arguments are refused, not dropped: changed, worktrees, diff; index takes a path only with --refresh", () => {
    expect(slipbox(["changed", "some-branch"]).code).toBe(2);
    expect(slipbox(["worktrees", "x"]).code).toBe(2);
    expect(slipbox(["diff", "home.md", "extra.md"]).code).toBe(2);
    const r = slipbox(["index", "handbook"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("only with --refresh");
  });
  test("review cycle 3: --not, vault-moved's, is no option any more", () => {
    const r = slipbox(["ls", "--not"], { cwd: DEMO });
    expect(r.code).toBe(2);
    expect(r.err).toContain("unknown option: --not");
  });
  test("help lists every flag each command takes, on the command's own lines", () => {
    const text = new Map<string, string>();
    let at: string | null = null;
    for (const line of slipbox(["help"]).out.split("\n")) {
      const m = /^ {2}slipbox (\S+)/.exec(line);
      if (m) at = m[1]!;
      else if (!/^ {20,}\S/.test(line)) at = null;
      if (at) text.set(at, `${text.get(at) ?? ""}${line}\n`);
    }
    for (const [command, flags] of Object.entries(FLAGS)) {
      for (const f of flags) expect(`${command}: ${text.get(command) ?? ""}`).toContain(`--${f}`);
    }
  });
});

describe("the CLI's edges: help flags, error paths, empty states", () => {
  test("-h after any command is the help, -V the version; --json wraps each", () => {
    const h = slipbox(["read", "home", "-h"]);
    expect(h.code).toBe(0);
    expect(h.out).toStartWith("slipbox ");
    expect(h.out).toContain("Exit codes: 0 ok, 1 error, 2 usage, 3 not found");
    expect(slipbox(["read", "-h", "--json"]).json).toMatchObject({ ok: true, command: "help", data: { text: h.out } });
    const v = slipbox(["ls", "-V"]);
    expect(v.code).toBe(0);
    expect(v.out).toMatch(/^slipbox \d+\.\d+\.\d+\n$/);
    expect(slipbox(["-V", "--json"]).json).toMatchObject({
      ok: true,
      command: "version",
      data: { version: v.out.trim().slice("slipbox ".length) },
    });
  });
  test("commands: the human list gives each command's CLI equivalent, or (interaction)", () => {
    const out = slipbox(["commands"]).out;
    expect(out).toMatch(/^task\.toggle +Toggle task +slipbox task <note> <line>$/m);
    expect(out).toMatch(/^cursor\.left +Cursor left +\(interaction\)$/m);
    expect(out.split("\n").filter(Boolean)).toHaveLength(slipbox(["commands", "--json"]).json.data.length);
  });
});
