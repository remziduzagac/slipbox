import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { DEMO, sandbox, vault, slipbox } = makeCliProcessSandbox();

describe("the vault and the tool", () => {
  test("tags: the vault's, with counts; a tag's notes (1.6)", () => {
    // The demo's: frontmatter tags, and #tags in the text, nested (#dome/shutter under #dome).
    const all = slipbox(["tags", "--json"], { cwd: DEMO }).json.data as { tag: string; count: number }[];
    expect(all).toContainEqual({ tag: "dome", count: 2 });
    expect(all).toContainEqual({ tag: "dome/shutter", count: 2 });
    const notes = ["projects/dome-refit.md", "projects/variable-star-survey.md"];
    expect(slipbox(["tags", "#dome/shutter", "--json"], { cwd: DEMO }).json.data).toEqual({
      tag: "dome/shutter",
      notes,
    });
    expect(slipbox(["tags", "dome/shutter"], { cwd: DEMO }).out).toBe(notes.map((n) => `${n}\n`).join(""));
  });
  test("footnotes: each one's label, text and line, and where it's referred to (3.17)", () => {
    const r = slipbox(["footnotes", "people/partners-and-names.md", "--json"], { cwd: DEMO }).json.data as {
      path: string;
      footnotes: { label: string; line: number; references: { line: number }[] }[];
    };
    expect(r.path).toBe("people/partners-and-names.md");
    expect(r.footnotes.map((f) => f.label)).toEqual(["1", "charter"]);
    expect(r.footnotes[0]).toMatchObject({
      line: 97,
      text: "Counted at the Visitor Pavilion door, not from ticket sales.",
      references: [{ line: 95, column: 42 }],
    });
    expect(slipbox(["footnotes", "people/partners-and-names.md"], { cwd: DEMO }).out).toContain("[charter]  L101");
    expect(slipbox(["footnotes", "software/halley/halley.toml"], { cwd: DEMO }).code).toBe(5); // not a note
  });
  test("footnotes add, edit, rename, rm: the note's text changed as the TUI's keys change it (3.18)", () => {
    const note = join(vault, "fn-cli.md");
    writeFileSync(note, "# F\r\n\r\nA claim here.\r\n");
    const add = slipbox(["footnotes", "fn-cli.md", "add", "3:8", "The source", "--json"], { cwd: vault }).json;
    expect(add.data.footnotes).toMatchObject([{ label: "1", text: "The source" }]);
    expect(readFileSync(note, "utf8")).toBe("# F\r\n\r\nA claim[^1] here.\r\n\r\n[^1]: The source\r\n"); // CRLF kept
    slipbox(["footnotes", "fn-cli.md", "add", "3", "Second"], { cwd: vault }); // no column: the line's end
    expect(readFileSync(note, "utf8")).toContain("A claim[^1] here.[^2]");
    slipbox(["footnotes", "fn-cli.md", "edit", "1", "Better source"], { cwd: vault });
    slipbox(["footnotes", "fn-cli.md", "rename", "2", "later"], { cwd: vault });
    expect(readFileSync(note, "utf8")).toBe(
      "# F\r\n\r\nA claim[^1] here.[^later]\r\n\r\n[^1]: Better source\r\n[^later]: Second\r\n",
    );
    expect(slipbox(["footnotes", "fn-cli.md", "rename", "later", "1"], { cwd: vault }).code).toBe(5); // taken
    expect(slipbox(["footnotes", "fn-cli.md", "rm", "nope"], { cwd: vault }).code).toBe(3);
    expect(
      slipbox(["footnotes", "fn-cli.md", "rm", "1", "--if-unchanged", "0000000000000000"], { cwd: vault }).code,
    ).toBe(5);
    slipbox(["footnotes", "fn-cli.md", "rm", "1"], { cwd: vault });
    expect(readFileSync(note, "utf8")).toBe("# F\r\n\r\nA claim here.[^later]\r\n\r\n[^later]: Second\r\n");
  });
  test("stat: which root a note is in, and its properties — the frontmatter, as the Info view shows it (3.19, 21.10)", () => {
    const r = slipbox(["stat", "people/kenji-mori.md", "--json"], { cwd: DEMO }).json.data;
    expect(r).toMatchObject({ root: DEMO, name: "halden" }); // its path, and the name pointers give it
    expect(r.vault).toBeUndefined();
    expect(r.properties).toMatchObject({ title: "Kenji Mori", office: { building: "Workshop", desk: 2 } });
    expect(slipbox(["stat", "people/kenji-mori.md"], { cwd: DEMO }).out).toMatch(/vault\s+halden\n/);
  });
  test("problems: the demo's broken links; a path is never ambiguous (1.7)", () => {
    const p = slipbox(["problems", "--json"], { cwd: DEMO }).json.data;
    expect(p.broken.length).toBeGreaterThan(5);
    expect(p.ambiguous).toEqual([]); // home.md's contacts link names people/contacts.md, of the two
    expect(slipbox(["problems"], { cwd: DEMO }).out).toMatch(/^broken links \(\d+\)\n/);
  });

  test("types (22.3): each type with its notes and how many break its rules; a type's notes in order; problems lists them (22.2)", () => {
    const dir = mkdtempSync(join(sandbox, "types-"));
    const env = {
      XDG_STATE_HOME: join(dir, "state"),
      XDG_CACHE_HOME: join(dir, "cache"),
      XDG_DATA_HOME: join(dir, "data"),
    };
    const root = join(dir, "notes");
    const files: Record<string, string> = {
      ".slipbox/config.toml": '[types.memory]\npaths = ["memory/*.md"]\nrequired = ["name", "description"]\n',
      "docs/adr/0002-use-json.md": "# Use JSON\n\nStatus: Superseded by [0003](0003-node-sqlite.md)\n",
      "docs/adr/0001-use-sqlite.md": "---\nstatus: Accepted\n---\n# Use SQLite\n",
      "docs/adr/0003-node-sqlite.md": "# node:sqlite\n\n## Status\n\nAccepted\n",
      "skills/hello/SKILL.md": "---\nname: hello\ndescription: says hello\n---\n# Hello\n",
      "skills/broken/SKILL.md": "---\nname: 42\n---\n# Broken\n",
      "memory/a.md": "---\nname: a\n---\n# A\n",
    };
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(root, rel, ".."), { recursive: true });
      writeFileSync(join(root, rel), text);
    }
    const all = slipbox(["types", "--json"], { cwd: root, env }).json.data;
    expect(
      all.map((t: { name: string; source: string; notes: number; problems: number }) => [
        t.name,
        t.source,
        t.notes,
        t.problems,
      ]),
    ).toEqual([
      ["adr", "built-in", 3, 0],
      ["memory", "config", 1, 1],
      ["skill", "built-in", 2, 1],
    ]);
    const adr = slipbox(["types", "adr", "--json"], { cwd: root, env }).json.data;
    expect(
      adr.notes.map(
        (n: { path: string; title: string; number: number; status: string; supersededBy: string | null }) => [
          n.number,
          n.title,
          n.status,
          n.supersededBy,
        ],
      ),
    ).toEqual([
      [1, "Use SQLite", "Accepted", null],
      [2, "Use JSON", "Superseded by [0003](0003-node-sqlite.md)", "docs/adr/0003-node-sqlite.md"],
      [3, "node:sqlite", "Accepted", null],
    ]);
    expect(slipbox(["types", "adr"], { cwd: root, env }).out).toContain(
      "2  docs/adr/0002-use-json.md  Use JSON  (Superseded by [0003](0003-node-sqlite.md) → docs/adr/0003-node-sqlite.md)\n",
    );
    const none = slipbox(["types", "rfc", "--json"], { cwd: root, env });
    expect(none.code).toBe(3);
    expect(none.json.error?.message).toBe('no document type "rfc" here: slipbox types lists them');
    const problems = slipbox(["problems", "--json"], { cwd: root, env }).json.data;
    expect(problems.frontmatter).toEqual([
      { path: "memory/a.md", line: 1, message: 'memory: "description" is missing' },
      { path: "skills/broken/SKILL.md", line: 1, message: 'skill: "description" is missing' },
      { path: "skills/broken/SKILL.md", line: 2, message: 'skill: "name" should be a string, not a number' },
    ]);
  });
});

describe("the CLI's edges: help flags, error paths, empty states", () => {
  /** A root of its own, with a state, cache and config only it knows. */
  function fresh(prefix: string): { root: string; dir: string; env: Record<string, string> } {
    const dir = mkdtempSync(join(sandbox, prefix));
    const root = join(dir, "root");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    const env = {
      XDG_STATE_HOME: join(dir, "state"),
      XDG_CACHE_HOME: join(dir, "cache"),
      XDG_DATA_HOME: join(dir, "data"),
      XDG_CONFIG_HOME: join(dir, "config"),
      SLIPBOX_CONFIG: join(dir, "config", "slipbox", "config.toml"),
    };
    return { root, dir, env };
  }
  test("footnotes: an unknown subcommand, a missing label, text or position, a line not there — usage errors, nothing written", () => {
    const { root, env } = fresh("fn-usage-");
    const text = "# F\n\nA claim[^1] here.\n\n[^1]: The source\n";
    writeFileSync(join(root, "fn.md"), text);
    const cases: [string[], string][] = [
      [["frob"], "footnotes: unknown subcommand frob (add, edit, rm, rename)"],
      [["add"], "footnotes <note> add <line[:col]> <text>"],
      [["add", "3"], "footnotes <note> add <line[:col]> <text>"],
      [["add", "x3", "a note"], "footnotes <note> add <line[:col]> <text>"],
      [["add", "9", "a note"], "fn.md has no line 9"],
      [["add", "0", "a note"], "fn.md has no line 0"],
      [["edit"], "footnotes edit needs the footnote's label"],
      [["edit", "1"], "footnotes <note> edit <label> <text>"],
      [["rename", "1"], "footnotes <note> rename <label> <new-label>"],
      [["rm"], "footnotes rm needs the footnote's label"],
    ];
    for (const [args, message] of cases) {
      const r = slipbox(["footnotes", "fn.md", ...args], { cwd: root, env });
      expect(`${args.join(" ")}: ${r.code} ${r.err}`).toBe(`${args.join(" ")}: 2 slipbox: ${message}\n`);
    }
    expect(slipbox(["footnotes", "fn.md", "frob", "--json"], { cwd: root, env }).json).toMatchObject({
      ok: false,
      error: { code: 2 },
    });
    expect(readFileSync(join(root, "fn.md"), "utf8")).toBe(text);
  });
});
