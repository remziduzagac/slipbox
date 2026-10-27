import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { glyphsFor } from "../../../../src/core/rendering/theme/glyphs.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("data files read as documents (16.11–16.13)", () => {
  const fields = (tree: { children: unknown[] }) =>
    tree.children.filter((n) => (n as { type: string }).type === "dataField") as {
      key: string;
      value: string;
      kind: string;
      comment: string | null;
      keyLine: number;
      position: { start: { line: number }; end: { line: number } };
    }[];
  const headings = (tree: { children: unknown[] }) =>
    tree.children
      .filter((n) => (n as { type: string }).type === "heading")
      .map((n) => (n as { children: { value: string }[] }).children[0]!.value);
  test("TOML: sections, keys with their lines and comments, multi-line values, record arrays", async () => {
    const { parseData } = await import("../../../../src/core/documents/model/data.ts");
    const d = parseData(
      "toml",
      '# top\ntitle = "x"\n\n[a.b]\n# above\nlist = [\n  1,\n  2,\n]\ns = """\nlong\n"""\nn = 3 # three\n\n[[s]]\nname = "p"\n[[s]]\nname = "q"\n',
    );
    expect(d.error).toBeNull();
    expect(headings(d.tree)).toEqual(["a.b", "s"]);
    const f = fields(d.tree);
    expect(f.map((x) => x.key)).toEqual(["title", "list", "s", "n"]);
    // The file's opening comment is a block of its own, not the first key's (a key's is one line
    // right above it, as `# above` is list's).
    expect(f[0]).toMatchObject({
      value: "x",
      kind: "string",
      comment: null,
      position: { start: { line: 2 }, end: { line: 2 } },
    });
    expect(d.tree.children[0]).toMatchObject({ type: "dataComment", text: "top" });
    expect(f[1]).toMatchObject({ kind: "list", comment: "above", position: { start: { line: 5 }, end: { line: 9 } } });
    expect(f[2]!.value).toBe("long");
    expect(f[3]).toMatchObject({ value: "3", kind: "number", comment: "three" });
    expect(d.tree.children.some((n) => n.type === "table")).toBe(true); // [[s]] ×2 → a table
    expect(parseData("toml", "[bad\n").error).toBeTruthy();
  });
  test("YAML and JSON as a tree: a row per key with its place, branches, records as tables, positions", async () => {
    const { parseData, dataOutline } = await import("../../../../src/core/documents/model/data.ts");
    const y = parseData(
      "yaml",
      "a: 1\nb:\n  c: true\n  d: [x, y]\n  e:\n    f: 1\n    g: {h: 1, $ref: x.json}\nrows:\n  - k: 1\n  - k: 2\nv:\n  - {n: 1, deep: {z: 1}}\n  - {n: 2}\n",
    );
    expect(y.error).toBeNull();
    const rows = (
      y.tree.children as unknown as {
        type: string;
        key?: string;
        value?: string;
        keyLine?: number;
        tree?: { lasts: boolean[]; branch?: boolean };
      }[]
    ).map((n) =>
      n.type === "dataField"
        ? [
            n.key,
            n.value,
            n.tree!.lasts.map((l) => (l ? "L" : "|")).join(""),
            n.tree!.branch ? "branch" : "",
            n.keyLine,
          ]
        : [n.type],
    );
    expect(rows).toEqual([
      ["a", "1", "", "", 1],
      ["b", "", "", "branch", 2],
      ["c", "true", "|", "", 3],
      ["d", "[x, y]", "|", "", 4], // a list of scalars reads inline
      ["e", "", "L", "branch", 5],
      ["f", "1", "L|", "", 6],
      ["g", "", "LL", "branch", 7], // small, but it holds a $ref: its rows show the link
      ["h", "1", "LL|", "", 7],
      ["$ref", "x.json", "LLL", "", 7],
      ["rows", "", "", "branch", 8],
      ["table"], // records: a table in the tree
      ["v", "", "", "branch", 11],
      ["1", "", "|", "branch", 12], // one item has depth, so every object item opens
      ["n", "1", "||", "", 12],
      ["deep", "{z: 1}", "|L", "", 12],
      ["2", "", "L", "branch", 13],
      ["n", "2", "LL", "", 13],
    ]);
    expect(dataOutline(y.tree).map((h) => [h.depth, h.text])).toEqual([
      [1, "b"],
      [2, "e"],
      [3, "g"],
      [1, "rows"],
      [1, "v"],
      [2, "1"],
      [2, "2"],
    ]);
    // A document's opening comment block, on its own lines (the lens edits it, not the first key).
    const c = parseData("yaml", "# one\n# two\n\nk: 1\n---\n\n# three\n\nm: 2\n");
    expect(
      c.tree.children
        .filter((n) => n.type === ("dataComment" as never))
        .map((n) => [n.position!.start.line, n.position!.end.line]),
    ).toEqual([
      [1, 2],
      [7, 7],
    ]);
    const j = parseData("json", '{\n  "name": "s",\n  // a comment\n  "deps": {"a": "1"}\n}\n');
    expect(j.error).toBeNull(); // jsonc comments are allowed
    expect((j.tree.children[1] as unknown as { key: string; value: string }).value).toBe("{a: 1}"); // small and plain: inline
    expect(parseData("json", '{"a": }').error).toBeTruthy();
    // A tsconfig.json as editors read it: trailing commas too, after a comment as well; a comma in a
    // string stays, and every row keeps its line.
    const tsconfig = parseData("json", '{\n  "a": [1, 2,],\n  "b": "x,}", // c\n  /* d */\n}\n');
    expect(tsconfig.error).toBeNull();
    expect(fields(tsconfig.tree).map((x) => [x.key, x.value, x.keyLine])).toEqual([
      ["a", "[1, 2]", 2],
      ["b", "x,}", 3],
    ]);
    expect(parseData("json", '{"a": 1,, }').error).toBeTruthy(); // one comma too many is still an error
    expect(parseData("yaml", "a: [1, 2\n").error).toBeTruthy();
  });
  test("INI and .env; CSV with quotes, doubled quotes and a newline in a field", async () => {
    const { parseData } = await import("../../../../src/core/documents/model/data.ts");
    const ini = parseData(
      "ini",
      '; c\n[core]\nk = v ; tail\nexport X=1\nURL="https://x.invalid/#top"   # where sync goes\nB=\'one ; two\' ; c\nQ="plain"\n',
    );
    expect(headings(ini.tree)).toEqual(["core"]);
    // Quoted, a value ends at its closing quote: a # or ; inside it is its own, one after a comment.
    expect(fields(ini.tree).map((x) => [x.key, x.value, x.comment])).toEqual([
      ["k", "v", "tail"],
      ["X", "1", null],
      ["URL", "https://x.invalid/#top", "where sync goes"],
      ["B", "one ; two", "c"],
      ["Q", "plain", null],
    ]);
    // Java's .properties: `!` comments, and a value that goes on, indented, after a backslash; an
    // INI's Windows path ending in one is a value of its own line.
    const props = parseData(
      "ini",
      "a = 0\n! where\nsources = /a, \\\n    /b, \\\n    /c\nnext = 1\ndir = C:\\\nlast = 2\n",
    );
    expect(props.error).toBeNull();
    expect(fields(props.tree).map((x) => [x.key, x.value, x.comment, x.keyLine])).toEqual([
      ["a", "0", null, 1],
      ["sources", "/a, /b, /c", "where", 3],
      ["next", "1", null, 6],
      ["dir", "C:\\", null, 7],
      ["last", "2", null, 8],
    ]);
    const csv = parseData("csv", 'a,b\n"1, one","say ""hi"""\n"multi\nline",2\n');
    expect(csv.error).toBeNull();
    const t = csv.tree.children[0] as {
      children: { position: { start: { line: number } }; children: { children: { value: string }[] }[] }[];
    };
    const cells = t.children.map((r) => r.children.map((c) => c.children[0]?.value ?? ""));
    expect(cells).toEqual([
      ["a", "b"],
      ["1, one", 'say "hi"'],
      ["multi line", "2"],
    ]);
    expect(t.children.map((r) => r.position.start.line)).toEqual([1, 2, 3]);
    expect(parseData("csv", 'a\n"open\n').error).toBeTruthy();
  });
});

describe("links out of data files (16.15)", () => {
  test("URLs and reference keys always; path-like values only when they resolve (the graph's call)", async () => {
    const { fieldLink } = await import("../../../../src/core/documents/model/data.ts");
    expect(fieldLink({ key: "home", value: "https://example.invalid/x" })).toEqual({
      target: "https://example.invalid/x",
      explicit: true,
    });
    expect(fieldLink({ key: "$ref", value: "./user.json#/defs/id" })).toEqual({
      target: "./user.json#/defs/id",
      explicit: true,
    });
    expect(fieldLink({ key: "include", value: "base.toml" })!.explicit).toBe(true);
    expect(fieldLink({ key: "schema_file", value: "schemas/user.json" })).toEqual({
      target: "schemas/user.json",
      explicit: false,
    });
    expect(fieldLink({ key: "docs", value: "docs/design/sync" })).toEqual({
      target: "docs/design/sync",
      explicit: false,
    });
    expect(fieldLink({ key: "out", value: "dist/" })).toBeNull(); // a folder: never a link target
    expect(fieldLink({ key: "name", value: "slipbox" })).toBeNull();
    expect(fieldLink({ key: "version", value: "1.2.3" })).toBeNull();
    expect(fieldLink({ key: "title", value: "a sentence with spaces.md" })).toBeNull();
  });
  test("a reference key's list, number, boolean or null is no link (never a broken `[base.json]`)", async () => {
    const { dataLinks, parseData } = await import("../../../../src/core/documents/model/data.ts");
    const { renderTree } = await import("../../../../src/core/rendering/layout/markdown/render.ts");
    const targets = (format: string, src: string) => dataLinks(parseData(format, src).tree).map((l) => l.target);
    expect(
      targets(
        "json",
        '{"includes": ["base.json"], "file": null, "path": 3, "schema": 2, "imports": true, "$ref": "user.json"}',
      ),
    ).toEqual(["user.json"]);
    expect(targets("toml", 'imports = ["base.toml"]\nschema = 2\ninclude = "base.toml"\n')).toEqual(["base.toml"]);
    expect(targets("yaml", "include:\n  - base.yml\nschema: 2\nincludes: base.yml\n")).toEqual(["base.yml"]);
    expect(targets("ini", "path = 3\nfile = base.ini\n")).toEqual(["base.ini"]);
    const l = renderTree(parseData("json", '{"schema": 2, "includes": ["base.json"]}').tree, {
      width: 60,
      glyphs: glyphsFor("unicode"),
      showUrls: false,
    });
    expect(l.lines.flatMap((x) => x.spans).filter((s) => s.role === "link_unresolved" || s.role === "link")).toEqual(
      [],
    );
  });
});
