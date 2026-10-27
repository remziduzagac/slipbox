import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { makeSandbox, makeVault, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("indentation in the editor (25.1)", () => {
  /** A file of its own, open in source mode, the cursor on its `line`. */
  const open = async (files: Record<string, string>, file: string, line = 1) => {
    const root = makeVault();
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), text);
    }
    const h = await harness({ root, open: file });
    // Source mode, whatever the file opens in (a note's render, code's document view).
    if (!h.app.view!.source) await h.keys("ctrl+k");
    await h.app.run(`cursor.goto_line ${line}`);
    return h;
  };
  const text = (h: Harness) => h.app.view!.buf.source;

  test("a Go file: tab, shift+tab, > and < a tab a level — its language's, or its own lines'", async () => {
    const h = await open({ "main.go": "package main\n\nfunc f() {\nx()\n}\n" }, "main.go", 4);
    expect(h.app.view!.buf.indent()).toMatchObject({ tabs: true, from: "language" });
    await h.keys("i", "tab", "escape");
    expect(text(h)).toBe("package main\n\nfunc f() {\n\tx()\n}\n");
    await h.keys(">", ">");
    expect(text(h)).toBe("package main\n\nfunc f() {\n\t\tx()\n}\n");
    await h.keys("<", "<", "i", "shift+tab", "escape");
    expect(text(h)).toBe("package main\n\nfunc f() {\nx()\n}\n");
  });

  test("a Python file indented by four: > adds four spaces, < takes four away (no more)", async () => {
    const h = await open({ "app.py": "def f():\n    if x:\n        y()\nz = 1\n" }, "app.py", 4);
    await h.keys(">", ">");
    expect(text(h)).toBe("def f():\n    if x:\n        y()\n    z = 1\n");
    await h.keys(">", ">");
    expect(text(h).split("\n")[3]).toBe("        z = 1");
    await h.keys("<", "<", "<", "<", "<", "<");
    expect(text(h).split("\n")[3]).toBe("z = 1");
  });

  test(".editorconfig's indent wins over the file's and the language's; the Info view says which", async () => {
    const h = await open(
      {
        ".editorconfig": "root = true\n[*.js]\nindent_style = space\nindent_size = 3\n",
        "web/x.js": "if (a) {\n\tb();\n}\nc();\n",
      },
      "web/x.js",
      4,
    );
    expect(h.app.view!.buf.indent()).toMatchObject({ tabs: false, size: 3, from: "editorconfig" });
    await h.keys(">", ">");
    expect(text(h).split("\n")[3]).toBe("   c();");
    const info = h.app.info.rows().find((r) => r.key === "indent");
    expect(info?.value).toBe("3 spaces (.editorconfig)");
  });

  test("a tab shows as wide as .editorconfig's tab_width says, else four columns", async () => {
    const lead = (h: Harness) => {
      const row = h.app
        .currentLayout(h.app.view!)
        .lines[0]!.spans.map((s) => s.text)
        .join("");
      return row.length - row.trimStart().length;
    };
    const wide = await open({ ".editorconfig": "[*.go]\ntab_width = 8\n", "w.go": "\tx := 1\n" }, "w.go", 1);
    expect(lead(wide)).toBe(8);
    const plain = await open({ "w.go": "\tx := 1\n" }, "w.go", 1);
    expect(lead(plain)).toBe(4);
  });

  test("a save does what .editorconfig asks — trailing whitespace trimmed, a final newline — one undo step; else nothing", async () => {
    const h = await open(
      {
        ".editorconfig": "[*.md]\ntrim_trailing_whitespace = true\ninsert_final_newline = true\n",
        "trim.md": "# T\n\nkeep  \nend",
        "plain.txt": "a  \nb",
      },
      "trim.md",
      4,
    );
    // Saved while typing: the typing so far one step, the save's own another.
    await h.keys("shift+a", "!", "ctrl+s", "escape");
    expect(readFileSync(join(h.root, "trim.md"), "utf8")).toBe("# T\n\nkeep\nend!\n");
    expect(text(h)).toBe("# T\n\nkeep\nend!\n");
    expect(h.app.view!.buf.dirty).toBe(false);
    // The trim is its own undo step: u brings the spaces back (unsaved), then the edit goes.
    await h.keys("u");
    expect(text(h)).toBe("# T\n\nkeep  \nend!");
    // Nothing asked of a .txt: saved as it is.
    h.app.open("plain.txt");
    await h.keys("shift+g", "shift+a", "!", "escape", "ctrl+s");
    expect(readFileSync(join(h.root, "plain.txt"), "utf8")).toBe("a  \nb!");
  });

  test("enter in code: after an opening bracket a level in, its closing one to a line of its own; after Python's : too; not in a note", async () => {
    const h = await open({ "a.ts": "function f() {}\n", "b.py": "def g():\n", "n.md": "Items (\n" }, "a.ts", 1);
    // The cursor between { and }.
    await h.keys("shift+a", "left", "enter", "x", "escape");
    expect(text(h)).toBe("function f() {\n  x\n}\n");
    h.app.open("b.py");
    await h.keys("shift+a", "enter", "p", "escape");
    expect(text(h)).toBe("def g():\n    p\n");
    h.app.open("n.md");
    await h.keys("ctrl+k", "shift+a", "enter", "escape");
    expect(text(h)).toBe("Items (\n\n");
  });
});
