import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("indentation (25.1)", () => {
  test("found in a file's lines: tabs where more lines start with one, else the step spaces go in by; too few, nothing", async () => {
    const { detectIndent } = await import("../../../../src/core/documents/editing/indent.ts");
    expect(detectIndent("func f() {\n\tx := 1\n\tif x {\n\t\ty()\n\t}\n}\n")).toEqual({ tabs: true, size: 4 });
    expect(detectIndent("def f():\n    x = 1\n    if x:\n        y()\n")).toEqual({ tabs: false, size: 4 });
    expect(detectIndent("a:\n  b:\n    c: 1\n  d: 2\n")).toEqual({ tabs: false, size: 2 });
    // A block comment's ` * ` is no step.
    expect(detectIndent("/**\n * Doc.\n * More.\n */\nfunction f() {\n  return 1;\n}\nif (x) {\n  y();\n}\n")).toEqual({
      tabs: false,
      size: 2,
    });
    // Three doc comments' one-space steps outnumber the code's two: still no indentation.
    expect(detectIndent("/**\n * a\n */\nf() {\n  x;\n}\n/**\n * b\n */\n/**\n * c\n */\ng() {\n  y;\n}\n")).toEqual({
      tabs: false,
      size: 2,
    });
    expect(detectIndent("one\ntwo\n")).toBeNull();
    expect(detectIndent("x\n  y\n")).toBeNull();
  });

  test("a language's own, by extension or name: Go and Makefiles tabs, Python and Rust four, the rest two", async () => {
    const { languageIndent } = await import("../../../../src/core/documents/editing/indent.ts");
    expect(
      ["/a/main.go", "/a/Makefile", "/a/rules.mk", "/a/app.py", "/a/lib.rs", "/a/index.ts", "/a/note.md"].map((p) =>
        languageIndent(p),
      ),
    ).toEqual([
      { tabs: true, size: 4 },
      { tabs: true, size: 4 },
      { tabs: true, size: 4 },
      { tabs: false, size: 4 },
      { tabs: false, size: 4 },
      { tabs: false, size: 2 },
      { tabs: false, size: 2 },
    ]);
  });

  test(".editorconfig's globs as the spec has them: a name alone anywhere, a path from its folder, *, **, ?, [], {a,b}, {1..3}", async () => {
    const { globRegex } = await import("../../../../src/core/documents/editing/indent.ts");
    const m = (glob: string, path: string) => globRegex(glob).test(path);
    expect([m("*.md", "a.md"), m("*.md", "x/y/a.md"), m("*.md", "a.mdx"), m("*", "x/y")]).toEqual([
      true,
      true,
      false,
      true,
    ]);
    expect([
      m("*.{js,py}", "src/a.py"),
      m("*.{js,py}", "a.ts"),
      m("v{1..3}.txt", "v2.txt"),
      m("v{1..3}.txt", "v4.txt"),
    ]).toEqual([true, false, true, false]);
    expect([
      m("[ab].c", "a.c"),
      m("[!ab].c", "a.c"),
      m("[!ab].c", "z.c"),
      m("?.c", "ab.c"),
      m("a?b.c", "a/b.c"),
      m("a?b.c", "axb.c"),
    ]).toEqual([true, false, true, false, false, true]);
    // With a `/`: from the file's folder.
    expect([
      m("lib/**.js", "lib/x/y.js"),
      m("lib/**.js", "src/lib/y.js"),
      m("/top.txt", "top.txt"),
      m("/top.txt", "x/top.txt"),
      m("docs/*.md", "docs/a/b.md"),
    ]).toEqual([true, false, true, false, false]);
    expect([m("**/test/*.ts", "test/a.ts"), m("**/test/*.ts", "x/test/a.ts")]).toEqual([true, true]);
    expect(m("a\\*b", "a*b")).toBe(true);
  });

  test(".editorconfig read from the file's folder up, until root = true: nearer over farther, later sections over earlier", async () => {
    const { editorConfigFor, parseEditorConfig } = await import("../../../../src/core/documents/editing/indent.ts");
    expect(
      parseEditorConfig("root = true\n# a comment\n[*]\nIndent_Style = Space ; why\n\n[*.go]\nindent_style=tab\n"),
    ).toEqual({
      root: true,
      sections: [
        { glob: "*", props: new Map([["indent_style", "space"]]) },
        { glob: "*.go", props: new Map([["indent_style", "tab"]]) },
      ],
    });
    const files: Record<string, string> = {
      "/home/.editorconfig": "[*]\nindent_size = 8\ninsert_final_newline = true\n",
      "/home/proj/.editorconfig": "root = true\n[*]\nindent_style = space\nindent_size = 4\n[*.md]\nindent_size = 2\n",
      "/home/proj/web/.editorconfig": "[*.ts]\nindent_size = 3\n",
    };
    const read = (p: string) => files[p] ?? null;
    expect(Object.fromEntries(editorConfigFor("/home/proj/web/a.ts", read))).toEqual({
      indent_style: "space",
      indent_size: "3",
    });
    expect(Object.fromEntries(editorConfigFor("/home/proj/notes/a.md", read))).toEqual({
      indent_style: "space",
      indent_size: "2",
    });
    // Outside the root one: home's.
    expect(Object.fromEntries(editorConfigFor("/home/other/a.ts", read))).toEqual({
      indent_size: "8",
      insert_final_newline: "true",
    });
  });

  test("a file's indent: .editorconfig's, else its own lines', else its language's; a tab's width; what a save does", async () => {
    const { indentFor, indentUnit, saveRules } = await import("../../../../src/core/documents/editing/indent.ts");
    const none = () => null;
    expect(indentFor("/p/a.go", "x\n", none)).toMatchObject({ tabs: true, size: 4, tabWidth: 4, from: "language" });
    expect(indentFor("/p/a.ts", "if (x) {\n    y();\n}\nif (z) {\n    w();\n}\n", none)).toMatchObject({
      tabs: false,
      size: 4,
      from: "file",
    });
    const ec = (text: string) => (p: string) => (p === "/p/.editorconfig" ? text : null);
    expect(
      indentFor("/p/a.ts", "if (x) {\n    y();\n}\nz\n    w\n", ec("[*]\nindent_style = space\nindent_size = 2\n")),
    ).toMatchObject({ tabs: false, size: 2, from: "editorconfig" });
    expect(indentFor("/p/a.ts", "x\n", ec("[*]\nindent_style = tab\ntab_width = 8\n"))).toMatchObject({
      tabs: true,
      size: 8,
      tabWidth: 8,
    });
    expect(indentFor("/p/a.c", "x\n", ec("[*]\nindent_style = tab\nindent_size = tab\n"))).toMatchObject({
      tabs: true,
      tabWidth: 4,
    });
    // A style said, its size not: the file's, else the language's.
    expect(indentFor("/p/a.py", "x\n", ec("[*]\nindent_style = space\n"))).toMatchObject({
      tabs: false,
      size: 4,
      from: "editorconfig",
    });
    const saving = indentFor(
      "/p/a.md",
      "x\n",
      ec("[*]\ntrim_trailing_whitespace = true\ninsert_final_newline = true\n"),
    );
    expect([saving.trimTrailing, saving.finalNewline]).toEqual([true, true]);
    expect(saveRules("a  \nb\t\nc ", saving)).toBe("a\nb\nc\n");
    expect(saveRules("a \r\nb", saving)).toBe("a\r\nb\r\n");
    expect(saveRules("", saving)).toBe("");
    const asIs = indentFor("/p/a.md", "x\n", none);
    expect([asIs.trimTrailing, asIs.finalNewline, saveRules("a  \nb", asIs)]).toEqual([false, null, "a  \nb"]);
    expect([indentUnit({ ...asIs, tabs: true }), indentUnit({ ...asIs, tabs: false, size: 3 })]).toEqual(["\t", "   "]);
  });
});
