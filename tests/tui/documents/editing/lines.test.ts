import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("word count, save all, the change list, moving lines", () => {
  test("alt+shift+up/down move the line, or V's lines, as one undo step; from the render too", async () => {
    const root = makeVault();
    writeFileSync(join(root, "m.md"), "a\nb\nc\nd\n");
    const h = await harness({ root, open: "m.md" });
    const v = h.app.view!;
    await h.keys("j"); // rendered: a one-paragraph note, its first row
    await h.app.run("view.source");
    await h.keys("j", "alt+shift+down");
    expect(v.buf.source).toBe("a\nc\nb\nd\n");
    await h.keys("alt+shift+up", "alt+shift+up");
    expect(v.buf.source).toBe("b\na\nc\nd\n");
    await h.keys("alt+shift+up"); // at the top: nothing
    expect(v.buf.source).toBe("b\na\nc\nd\n");
    await h.keys("shift+v", "j", "alt+shift+down", "alt+shift+down");
    expect(v.buf.source).toBe("c\nd\nb\na\n");
    expect(v.visual).toBe("line"); // still selected, lines b and a
    await h.keys("escape", "u");
    expect(v.buf.source).toBe("c\nb\na\nd\n"); // one step undone
    await h.app.run("view.source"); // back to the render: the key switches to editing first
    expect(v.source).toBe(false);
    await h.keys("alt+shift+down");
    expect(v.source || v.live).toBe(true);
  });
});

describe("review (tui): vim and editing edges", () => {
  const setup = async (text: string, name = "v.md", files: Record<string, string> = {}) => {
    const root = makeVault();
    writeFileSync(join(root, name), text);
    for (const [f, t] of Object.entries(files)) writeFileSync(join(root, f), t);
    const h = await harness({ root, open: name, width: 100, height: 30 });
    await h.keys("space", "n", "v");
    const v = h.app.view!;
    const keys = async (...ks: string[]) => {
      for (const k of ks) {
        if (k.length > 1 && !k.includes("+") && !["escape", "enter", "backspace", "space", "tab"].includes(k)) {
          for (const ch of k) await h.keys(ch === " " ? "space" : /[A-Z]/.test(ch) ? `shift+${ch.toLowerCase()}` : ch);
        } else await h.keys(k);
      }
    };
    return { h, v, keys, text: () => v.buf.source };
  };
  test("moving a CRLF note's lines keeps CRLF, with no stray \\r at the end", async () => {
    for (const [input, keys, want] of [
      ["a\r\nb", ["j", "alt+shift+up"], "b\r\na"],
      ["a\r\nb", ["alt+shift+down"], "b\r\na"],
      ["a\r\nb\r\n", ["j", "alt+shift+up"], "b\r\na\r\n"],
      ["a\r\nb\r\nc\r\n", ["alt+shift+down"], "b\r\na\r\nc\r\n"],
    ] as const) {
      const s = await setup(input);
      await s.keys(...keys);
      expect(JSON.stringify(s.text())).toBe(JSON.stringify(want));
    }
  });
});
