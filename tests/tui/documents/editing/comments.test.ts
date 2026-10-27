import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { makeSandbox, makeVault, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("comments toggled in the editor (25.2)", () => {
  const open = async (files: Record<string, string>, file: string, line = 1) => {
    const root = makeVault();
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), text);
    }
    const h = await harness({ root, open: file });
    if (!h.app.view!.source) await h.keys("ctrl+k");
    await h.app.run(`cursor.goto_line ${line}`);
    return h;
  };
  const text = (h: Harness) => h.app.view!.buf.source;

  test("gcc and a count, gc and a motion; . does it again; u takes it back in one", async () => {
    const h = await open({ "a.ts": "const a = 1;\nconst b = 2;\nif (a) {\n  b();\n}\n" }, "a.ts", 1);
    await h.keys("g", "c", "c");
    expect(text(h)).toBe("// const a = 1;\nconst b = 2;\nif (a) {\n  b();\n}\n");
    await h.keys("g", "c", "c");
    expect(text(h)).toBe("const a = 1;\nconst b = 2;\nif (a) {\n  b();\n}\n");
    await h.keys("3", "g", "c", "c");
    expect(text(h)).toBe("// const a = 1;\n// const b = 2;\n// if (a) {\n  b();\n}\n");
    await h.keys("u");
    expect(text(h)).toBe("const a = 1;\nconst b = 2;\nif (a) {\n  b();\n}\n");
    // gc and a motion: the paragraph from line 3; . on line 1 the same.
    await h.app.run("cursor.goto_line 3");
    await h.keys("g", "c", "j");
    expect(text(h)).toBe("const a = 1;\nconst b = 2;\n// if (a) {\n//   b();\n}\n");
    await h.app.run("cursor.goto_line 1");
    await h.keys(".");
    expect(text(h)).toBe("// const a = 1;\n// const b = 2;\n// if (a) {\n//   b();\n}\n");
  });

  test("a selection's lines (V, gc); ctrl+/ on the line, and while typing, the cursor on its character", async () => {
    const h = await open({ "app.py": "def f():\n    x = 1\n    return x\n\ny = 2\nz = 3\n" }, "app.py", 2);
    await h.keys("shift+v", "j", "g", "c");
    expect(text(h)).toBe("def f():\n    # x = 1\n    # return x\n\ny = 2\nz = 3\n");
    expect(h.app.view!.visual).toBeFalsy();
    // . : the same on as many lines from here.
    await h.app.run("cursor.goto_line 5");
    await h.keys(".");
    expect(text(h)).toBe("def f():\n    # x = 1\n    # return x\n\n# y = 2\n# z = 3\n");
    // A count before ctrl+/: that many lines.
    await h.keys("2", "ctrl+/");
    expect(text(h)).toBe("def f():\n    # x = 1\n    # return x\n\ny = 2\nz = 3\n");
    await h.app.run("cursor.goto_line 2");
    await h.keys("ctrl+/");
    expect(text(h)).toBe("def f():\n    x = 1\n    # return x\n\ny = 2\nz = 3\n");
    // Typing on line 2 after "x": the comment goes in before it, the cursor stays after the x.
    await h.keys("shift+i", "right", "ctrl+/", "!", "escape");
    expect(text(h)).toBe("def f():\n    # x! = 1\n    # return x\n\ny = 2\nz = 3\n");
    await h.keys("shift+i", "ctrl+_", "escape");
    expect(text(h)).toBe("def f():\n    x! = 1\n    # return x\n\ny = 2\nz = 3\n");
  });

  test("a component's parts each in their own: its script's lines //, its template's <!-- -->", async () => {
    const h = await open(
      { "c.vue": "<template>\n  <p>hi</p>\n</template>\n<script>\nconst x = 1;\n</script>\n" },
      "c.vue",
      5,
    );
    for (const t = Date.now(); !h.app.view!.buf.syntax?.languages.size && Date.now() - t < 8000; ) {
      await Bun.sleep(30);
      h.frame();
    }
    await h.keys("g", "c", "c");
    await h.app.run("cursor.goto_line 2");
    await h.keys("g", "c", "c");
    expect(text(h)).toBe("<template>\n  <!-- <p>hi</p> -->\n</template>\n<script>\n// const x = 1;\n</script>\n");
  });

  test("a note's lines in <!-- -->; a file with no comments said so, left as it is", async () => {
    const h = await open({ "c.md": "# C\n\nsome text\n", "d.json": '{"a": 1}\n' }, "c.md", 3);
    await h.keys("g", "c", "c");
    expect(text(h)).toBe("# C\n\n<!-- some text -->\n");
    h.app.open("d.json");
    if (!h.app.view!.source) await h.keys("ctrl+k");
    await h.keys("g", "c", "c");
    expect(text(h)).toBe('{"a": 1}\n');
    expect(h.app.messages.at(-1)!.text).toBe("json has no comments");
  });
});
