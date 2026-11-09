import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import { offsetOf, placeAt } from "../../../../src/tui/documents/editing/editing.ts";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

/** A file opened in SOURCE view (code as written, not its code view), and the cursor put on a piece of its text. */
async function open(name: string, text: string, config?: (c: Config) => void) {
  const root = makeVault();
  writeFileSync(join(root, name), text);
  const h = await harness({
    root,
    open: name,
    width: 100,
    height: 40,
    config: (c) => {
      c.render.code = false;
      config?.(c);
    },
  });
  if (name.endsWith(".md")) await h.keys("space", "n", "v");
  const v = h.app.view!;
  /** The cursor onto `needle`'s first character (its `nth` time), or `offset` after it. */
  const at = (needle: string, offset = 0, nth = 1) => {
    let i = -1;
    for (let k = 0; k < nth; k++) i = v.buf.source.indexOf(needle, i + 1);
    if (i < 0) throw new Error(`${needle} isn't in the text`);
    placeAt(h.app, v, i + offset);
  };
  /** The text from the cursor on, `n` characters of it. */
  const here = (n = 12) => {
    const offset = offsetOf(h.app, v);
    return v.buf.source.slice(offset, offset + n);
  };
  return { h, v, at, here, root };
}

const NOTE = `# Plan

Intro with a [link text](a.md) here.

## Steps

- [ ] first step
- second
  - nested one

\`\`\`ts
function add(a: number, b: number) {
  return a + b;
}
\`\`\`

## Notes

Last words.

\`\`\`py
x = 1
\`\`\`
`;

describe("a note's text objects, after the operators and in visual mode (EG-D6)", () => {
  test("d a h deletes the section around the cursor, its heading with it; d i h keeps the heading", async () => {
    const { h, v, at } = await open("n.md", NOTE);
    at("Last words");
    await h.keys("d", "i", "h");
    expect(v.buf.source.endsWith("```\n\n## Notes\n")).toBe(true);
    await h.keys("u");
    at("nested one");
    await h.keys("d", "a", "h");
    expect(v.buf.source).toBe(NOTE.slice(0, NOTE.indexOf("## Steps")) + NOTE.slice(NOTE.indexOf("## Notes")));
    // `.` does it again, on the section the cursor is in now.
    await h.keys(".");
    expect(v.buf.source).toBe(NOTE.slice(0, NOTE.indexOf("## Steps")));
  });
  test("c i k changes a link's text, its target kept", async () => {
    const { h, v, at } = await open("n.md", NOTE);
    at("text](");
    await h.keys("c", "i", "k", "N", "E", "W", "escape");
    expect(v.buf.source).toContain("Intro with a [NEW](a.md) here.");
    // Off a link, the next on the line: from the line's start.
    at("Intro");
    await h.keys("d", "a", "k");
    expect(v.buf.source).toContain("Intro with a  here.");
  });
  test("y a l copies a list item's lines; c i l changes its text, its marker and task box kept", async () => {
    const { h, v, at } = await open("n.md", NOTE);
    at("second");
    await h.keys("y", "a", "l");
    expect(h.app.vim.register).toEqual({ text: "- second\n  - nested one\n", linewise: true });
    at("first step");
    await h.keys("c", "i", "l", "d", "o", "n", "e", "escape");
    expect(v.buf.source).toContain("- [ ] done\n- second");
  });
  test("v i o selects a fenced block's lines, by whole lines; d deletes them, the fences kept", async () => {
    const { h, v, at } = await open("n.md", NOTE);
    at("return a");
    await h.keys("v", "i", "o");
    expect(v.visual).toBe("line");
    expect(h.app.views.selectionText(v)).toBe("function add(a: number, b: number) {\n  return a + b;\n}");
    await h.keys("d");
    expect(v.buf.source).toContain("```ts\n```\n");
  });
  test("in a fenced block, f c a are its code's; o is the fence", async () => {
    const { h, v, at } = await open("n.md", NOTE);
    at("b: number");
    await h.keys("d", "a", "a");
    expect(v.buf.source).toContain("function add(a: number) {");
    at("return a");
    await h.keys("d", "a", "f");
    expect(v.buf.source).toContain("```ts\n```\n");
    await h.keys("u", "u");
    // `o` on code in a fence: the fence's lines, not the function's block.
    at("return a");
    await h.keys("y", "i", "o");
    expect(h.app.vim.register?.text).toBe("function add(a: number, b: number) {\n  return a + b;\n}\n");
  });
  test("a fenced block in a list item: its code read without the item's indent, Python's too", async () => {
    const text = "- an item\n\n  ```py\n  def f(a, b):\n      return a\n  ```\n";
    const { h, v, at } = await open("n.md", text);
    at("return");
    await h.keys("d", "i", "f");
    expect(v.buf.source).toBe("- an item\n\n  ```py\n  def f(a, b):\n  ```\n");
    await h.keys("u");
    at("b)");
    await h.keys("c", "i", "a", "c", "escape");
    expect(v.buf.source).toContain("  def f(a, c):\n");
  });
  test("a fenced block in a quote: its code read without the `>`, the body's line taken whole", async () => {
    const { h, v, at } = await open("q.md", "> ```py\n> def f(a, b):\n>     return a\n> ```\n");
    at("return");
    await h.keys("d", "i", "f");
    expect(v.buf.source).toBe("> ```py\n> def f(a, b):\n> ```\n");
  });
  test("no object there: said, nothing changed", async () => {
    const { h, v, at } = await open("n.md", NOTE);
    at("Intro");
    await h.keys("d", "a", "f");
    expect(v.buf.source).toBe(NOTE);
    expect(h.app.messages.at(-1)?.text).toBe("no af here");
  });
  test("in the lens too: d a h", async () => {
    const root = makeVault();
    writeFileSync(join(root, "n.md"), NOTE);
    const h = await harness({ root, open: "n.md", width: 100, height: 40 });
    await h.keys("space", "n", "l");
    const v = h.app.view!;
    expect(v.live).toBe(true);
    placeAt(h.app, v, NOTE.indexOf("Last words"));
    await h.keys("d", "a", "h");
    expect(v.buf.source).toBe(NOTE.slice(0, NOTE.indexOf("## Notes")));
  });
});

const TS = `export function first(a: number, b = 2) {
  return helper(a, b);
}

class Box {
  open(x: string) {
    if (x) {
      return x;
    }
  }
}
`;

const PY = `@cached
def first(a, b=2):
    if a:
        return a
    return b


class Box:
    def open(self, x):
        return x
`;

const RS = `#[inline]
fn first(a: i32, b: u8) -> i32 {
    helper(a, b)
}

struct Box {
    size: u32,
}

impl Box {
    fn open(&self, x: u32) -> u32 {
        x
    }
}
`;

describe("code's text objects, by its grammar (EG-D6)", () => {
  test("TypeScript: d a f takes the function with its export; c i a an argument; y i c a class's inside", async () => {
    const { h, v, at } = await open("a.ts", TS);
    at("helper");
    await h.keys("d", "a", "f");
    expect(v.buf.source).toBe(TS.slice(TS.indexOf("\nclass")));
    await h.keys("u");
    at("b)");
    await h.keys("c", "i", "a", "c", "escape");
    expect(v.buf.source).toContain("return helper(a, c);");
    at("x: string");
    await h.keys("d", "a", "a");
    expect(v.buf.source).toContain("  open() {");
    at("return x");
    await h.keys("y", "i", "c");
    expect(h.app.vim.register?.text).toBe("  open() {\n    if (x) {\n      return x;\n    }\n  }\n");
    // A count: the block around the one around the cursor.
    at("return x");
    await h.keys("v", "a", "o");
    expect(h.app.views.selectionText(v)).toBe("{\n      return x;\n    }");
    await h.keys("escape");
    at("return x");
    await h.keys("v", "2", "a", "o");
    expect(h.app.views.selectionText(v)).toBe("{\n    if (x) {\n      return x;\n    }\n  }");
  });
  test("Python: d a f takes the decorated function; d i f its body's lines; c i a an argument", async () => {
    const { h, v, at } = await open("a.py", PY);
    at("return b");
    await h.keys("d", "a", "f");
    expect(v.buf.source.startsWith("\n\nclass Box:")).toBe(true);
    await h.keys("u");
    at("return b");
    await h.keys("d", "i", "f");
    expect(v.buf.source.startsWith("@cached\ndef first(a, b=2):\n\n\nclass")).toBe(true);
    await h.keys("u");
    at("x):");
    await h.keys("c", "i", "a", "y", "escape");
    expect(v.buf.source).toContain("def open(self, y):");
    // `a o`: the `if` with its header line.
    at("return a");
    await h.keys("d", "a", "o");
    expect(v.buf.source).toContain("def first(a, b=2):\n    return b\n");
  });
  test("Rust: d a f takes the function with its attribute; d a c an impl; c i a an argument", async () => {
    const { h, v, at } = await open("a.rs", RS);
    at("helper");
    await h.keys("d", "a", "f");
    expect(v.buf.source.startsWith("\nstruct Box")).toBe(true);
    await h.keys("u");
    at("x\n");
    await h.keys("d", "a", "c");
    expect(v.buf.source).not.toContain("impl Box");
    await h.keys("u");
    at("b: u8");
    await h.keys("c", "i", "a", "c", ":", "space", "u", "1", "6", "escape");
    expect(v.buf.source).toContain("fn first(a: i32, c: u16) -> i32 {");
  });
  test("a key whose text changed waits for the pass of the text as it is", async () => {
    const { h, v, at } = await open("a.ts", TS);
    at("class Box");
    await h.keys("shift+o", ...[..."function made(z: number) {}"].map((c) => (c === " " ? "space" : c)), "escape");
    // No pause for the pass to run by itself: the object is the new function's.
    await h.keys("d", "a", "f");
    expect(v.buf.source).toBe(TS);
  });
});

describe("syntax jumps (EG-D6)", () => {
  test("] f and [ f go to where functions start; ] a to the next argument; ] o to the next block", async () => {
    const { h, here } = await open("a.ts", TS);
    await h.keys("]", "f");
    expect(here(10)).toBe("open(x: st");
    await h.keys("[", "f");
    expect(here(10)).toBe("export fun");
    await h.keys("]", "a");
    expect(here(9)).toBe("a: number");
    await h.keys("]", "a", "]", "a");
    expect(here(1)).toBe("a");
    await h.keys("]", "o");
    expect(here(3)).toBe("{\n ");
    // None after the last: said, the cursor left.
    await h.keys("]", "f", "]", "f");
    expect(h.app.messages.at(-1)?.text).toBe("no function after the cursor");
  });
  test("a count goes that many; after an operator, a motion: d ] f deletes up to the next function", async () => {
    const { h, v, here } = await open("a.ts", `function a() {}\nfunction b() {}\nfunction c() {}\n`);
    await h.keys("2", "]", "f");
    expect(here(10)).toBe("function c");
    await h.keys("g", "g", "d", "]", "f");
    expect(v.buf.source).toBe("function b() {}\nfunction c() {}\n");
  });
  test("in a note, ] o and [ o go from fence to fence; ] f to a function in one", async () => {
    const { h, here } = await open("n.md", NOTE);
    await h.keys("]", "o");
    expect(here(5)).toBe("```ts");
    await h.keys("]", "o");
    expect(here(5)).toBe("```py");
    await h.keys("[", "o");
    expect(here(5)).toBe("```ts");
    await h.keys("g", "g", "]", "f");
    expect(here(12)).toBe("function add");
  });
  test("while reading: ] o onto the fenced block as drawn; in the code view, ] f onto the function's row", async () => {
    const root = makeVault();
    writeFileSync(join(root, "n.md"), NOTE);
    writeFileSync(join(root, "a.ts"), TS);
    const h = await harness({ root, open: "n.md", width: 100, height: 40 });
    const v = h.app.view!;
    await h.keys("]", "o");
    expect(h.app.cursorLine(v)).toBe(11);
    h.app.open("a.ts");
    const c = h.app.view!;
    expect(h.app.isCodeDocument(c.buf) && !c.source).toBe(true);
    await h.keys("]", "f");
    expect(h.app.cursorLine(c)).toBe(6);
  });
});

describe("growing and shrinking the selection (EG-D7)", () => {
  test("in a note, alt+o from a word to its link and paragraph, and through a list to its section; alt+i back", async () => {
    const { h, v, at } = await open("n.md", NOTE);
    const grow = async (n: number) => {
      const steps: string[] = [];
      for (let k = 0; k < n; k++) {
        await h.keys("alt+o");
        steps.push(h.app.views.selectionText(v));
      }
      return steps;
    };
    at("text](");
    expect(await grow(3)).toEqual(["text", "[link text](a.md)", "Intro with a [link text](a.md) here."]);
    expect(v.visual).toBe("char");
    await h.keys("escape");
    at("nested");
    expect(await grow(6)).toEqual([
      "nested",
      "nested one",
      "- nested one",
      "- second\n  - nested one",
      "- [ ] first step\n- second\n  - nested one",
      NOTE.slice(NOTE.indexOf("## Steps"), NOTE.indexOf("\n\n## Notes")),
    ]);
    for (let k = 0; k < 5; k++) await h.keys("alt+i");
    expect(h.app.views.selectionText(v)).toBe("nested");
    // From the first step, the cursor alone again, where it was.
    await h.keys("alt+i");
    expect(v.sel).toBeNull();
    expect(v.visual).toBeNull();
    expect(offsetOf(h.app, v)).toBe(NOTE.indexOf("nested"));
  });
  test("in code, alt+o from a word through the call and statement to the function", async () => {
    const { h, v, at } = await open("a.ts", TS);
    at("helper");
    const steps: string[] = [];
    for (let k = 0; k < 5; k++) {
      await h.keys("alt+o");
      steps.push(h.app.views.selectionText(v));
    }
    expect(steps).toEqual([
      "helper",
      "helper(a, b)",
      "return helper(a, b);",
      "{\n  return helper(a, b);\n}",
      "function first(a: number, b = 2) {\n  return helper(a, b);\n}",
    ]);
    await h.keys("alt+i", "alt+i");
    expect(h.app.views.selectionText(v)).toBe("return helper(a, b);");
  });
  test("any other change of the selection drops the steps: alt+i then has none to go back along", async () => {
    const { h, v, at } = await open("n.md", NOTE);
    at("text](");
    await h.keys("alt+o", "alt+o", "l");
    await h.keys("alt+i");
    expect(h.app.messages.at(-1)?.text).toBe("alt+i goes back what alt+o grew: nothing grown to go back from");
    expect(v.sel).not.toBeNull();
  });
  test("while reading, alt+o says where it works", async () => {
    const root = makeVault();
    writeFileSync(join(root, "n.md"), NOTE);
    const h = await harness({ root, open: "n.md", width: 100, height: 40 });
    await h.keys("v", "alt+o");
    expect(h.app.messages.at(-1)?.text).toBe(
      "alt+o grows a selection by the text: in SOURCE view (space n v) or the lens",
    );
  });
});
