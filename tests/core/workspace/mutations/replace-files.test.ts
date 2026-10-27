import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../../../src/cli/cli.ts";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";

import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("replace in every note (25.4)", () => {
  const cli = async (args: string[], cwd: string) => {
    const out: string[] = [];
    const code = await runCli([...args, "--json"], {
      out: (s: string) => out.push(s),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd,
      env: process.env,
    });
    return { code, json: JSON.parse(out.join("")) };
  };
  let made = 0;
  const vault = (files: Record<string, string | Buffer>) => {
    const dir = mkdtempSync(join(tmpdir(), `slipbox-replace-${++made}-`));
    mkdirSync(join(dir, ".slipbox"));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    return dir;
  };
  const bytes = (dir: string, rel: string) => readFileSync(join(dir, rel));
  const read = (dir: string, rel: string) => readFileSync(join(dir, rel), "utf8");

  test("every note's matches, previewed by --dry-run, then written; a text file only with --files; undo takes it all back", async () => {
    const bad = Buffer.concat([Buffer.from("Quill "), Buffer.from([0xff]), Buffer.from("\n")]);
    const dir = vault({
      "a.md": "# Quill\n\nA Quill, a quill.\n",
      "b.md": "nothing here\n",
      "sub/c.md": "\uFEFFQuill\r\n",
      "bad.md": bad,
      "code.ts": "// Quill\n",
    });
    const dry = await cli(["replace", "--all", "Quill", "Pen", "--dry-run"], dir);
    expect(dry.code).toBe(0);
    expect(dry.json.data.kind).toBe("replace");
    expect(dry.json.data.dryRun).toBe(true);
    // Smart case, as find has it: a capital in the query, so `quill` is left.
    expect(dry.json.data.files.map((f: { path: string; edits: unknown[] }) => [f.path, f.edits])).toEqual([
      [
        "a.md",
        [
          { line: 1, before: "# Quill", after: "# Pen" },
          { line: 3, before: "A Quill, a quill.", after: "A Pen, a quill." },
        ],
      ],
      ["sub/c.md", [{ line: 1, before: "Quill", after: "Pen" }]],
    ]);
    // Its invalid byte would be written back as U+FFFD: said, not rewritten.
    expect(dry.json.warnings).toContain("bad.md:1: not valid UTF-8: not rewritten");
    expect(read(dir, "a.md")).toBe("# Quill\n\nA Quill, a quill.\n");
    const done = await cli(["replace", "--all", "Quill", "Pen"], dir);
    expect(done.code).toBe(0);
    expect(read(dir, "a.md")).toBe("# Pen\n\nA Pen, a quill.\n");
    // Its byte order mark and its CRLF kept.
    expect(read(dir, "sub/c.md")).toBe("\uFEFFPen\r\n");
    expect([...bytes(dir, "bad.md")]).toEqual([...bad]);
    expect(read(dir, "code.ts")).toBe("// Quill\n");
    writeFileSync(join(dir, "z.md"), "Quill\n");
    const files = await cli(["replace", "--all", "Quill", "Pen", "--files"], dir);
    // By path, the text files among the notes.
    expect(files.json.data.files.map((f: { path: string }) => f.path)).toEqual(["code.ts", "z.md"]);
    expect(read(dir, "code.ts")).toBe("// Pen\n");
    // Undone newest first, as a rename is: the code file, then the notes; said the other way.
    const out: string[] = [];
    await runCli(["undo", "--dry-run"], {
      out: (s: string) => out.push(s),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd: dir,
      env: process.env,
    });
    expect(out.join("")).toStartWith('would undo the replace of "Quill" with "Pen": 2 changes in 2 files\n');
    expect((await cli(["undo"], dir)).code).toBe(0);
    expect([read(dir, "code.ts"), read(dir, "z.md")]).toEqual(["// Quill\n", "Quill\n"]);
    const back = await cli(["undo"], dir);
    expect(back.code).toBe(0);
    expect(back.json.data.kind).toBe("replace");
    expect(read(dir, "a.md")).toBe("# Quill\n\nA Quill, a quill.\n");
    expect(read(dir, "sub/c.md")).toBe("\uFEFFQuill\r\n");
  });

  test("regex and its groups, whole words, ignoring case; the human answer names both", async () => {
    const dir = vault({ "a.md": "k=1 and kk=2\nK=3\n" });
    const r = await cli(["replace", "--all", "(k)=(\\d)", "$2:$1", "--regex", "--whole", "--ignore-case"], dir);
    expect(r.code).toBe(0);
    expect(read(dir, "a.md")).toBe("1:k and kk=2\n3:K\n");
    const out: string[] = [];
    await runCli(["replace", "--all", "and", "or", "--dry-run"], {
      out: (s: string) => out.push(s),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd: dir,
      env: process.env,
    });
    expect(out.join("")).toStartWith(
      'would replace "and" with "or": 1 change in 1 file\n  a.md:1\n    - 1:k and kk=2\n    + 1:k or kk=2\n',
    );
  });

  test("--plan saves it for apply; refused when a file changed since; nothing to replace writes nothing", async () => {
    const dir = vault({ "a.md": "x\n", "b.md": "x\n" });
    const planned = await cli(["replace", "--all", "x", "y", "--plan"], dir);
    expect(planned.code).toBe(0);
    expect(read(dir, "a.md")).toBe("x\n");
    expect((await cli(["apply", planned.json.data.plan.id], dir)).code).toBe(0);
    expect([read(dir, "a.md"), read(dir, "b.md")]).toEqual(["y\n", "y\n"]);
    const none = await cli(["replace", "--all", "zzz", "y"], dir);
    expect(none.code).toBe(0);
    expect(none.json.data.files).toEqual([]);
    // Each match replaced by itself: no file changes.
    expect((await cli(["replace", "--all", "y", "y"], dir)).json.data.files).toEqual([]);
    // Nothing replaced isn't logged: undo takes back the last real one.
    expect((await cli(["undo"], dir)).code).toBe(0);
    expect([read(dir, "a.md"), read(dir, "b.md")]).toEqual(["x\n", "x\n"]);
  });

  test("what it finds is text, never a note: a pointer, a path to another root's file", async () => {
    const other = vault({ "x.md": "# X\n" });
    const abs = join(other, "x.md");
    const dir = vault({ "a.md": `see slipbox://gone/a.md and ${abs}\n` });
    const r = await cli(["replace", "--all", "slipbox://gone/a.md", "slipbox://here/a.md"], dir);
    expect(r.code).toBe(0);
    expect(read(dir, "a.md")).toBe(`see slipbox://here/a.md and ${abs}\n`);
    // A file's path as the text: this root's notes searched, not that file's root.
    expect(
      (await cli(["replace", "--all", abs, "elsewhere"], dir)).json.data.files.map((f: { path: string }) => f.path),
    ).toEqual(["a.md"]);
    expect(read(dir, "a.md")).toBe("see slipbox://here/a.md and elsewhere\n");
    expect(read(other, "x.md")).toBe("# X\n");
  });

  test("planned with nothing to find: refused, not a match at every place", async () => {
    const { planReplace } = await import("../../../../src/core/workspace/mutations/replace-files.ts");
    const dir = vault({ "a.md": "x\n" });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    expect(() => planReplace(g, "", "y", ["a.md"], { regex: true, whole: false })).toThrow(
      "nothing to find: an empty pattern matches nothing",
    );
  });

  test("usage: two arguments and no note; one note's flags refused with --all; --files and --plan only with it; a bad regex", async () => {
    const dir = vault({ "a.md": "x\n" });
    for (const args of [
      ["replace", "--all", "x"],
      ["replace", "--all", "a.md", "x", "y"],
      ["replace", "--all", "x", "y", "--first"],
      ["replace", "--all", "x", "y", "--lines", "1"],
      ["replace", "a", "x", "y", "--files"],
      ["replace", "a", "x", "y", "--plan"],
      ["replace", "--all", "(", "y", "--regex"],
      ["replace", "--all", "", "y"],
    ])
      expect([args, (await cli(args, dir)).code]).toEqual([args, 2]);
    expect(read(dir, "a.md")).toBe("x\n");
  });
});
