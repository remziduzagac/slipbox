import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { keyName } from "../../../../src/tui/shell/input/keys.ts";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review round 3", () => {
  test("keypad keys and legacy ctrl+j arrive under the names the keymaps use", () => {
    expect(keyName({ name: "kpenter", sequence: "\u001b[57414u" } as never)).toBe("enter");
    expect(keyName({ name: "kpleft", sequence: "\u001b[57417u" } as never)).toBe("left");
    expect(keyName({ name: "linefeed", sequence: "\n" } as never)).toBe("ctrl+j");
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
  test("shift+space (the kitty protocol's shifted space) types a space: in insert, a prompt, a list's filter, as f's character", async () => {
    const { keys, text, h, v } = await setup("x y\n");
    await keys("f", "shift+space");
    expect(v.cur.col).toBe(1);
    await keys("0", "i", "shift+h", "shift+space", "shift+w", "escape");
    expect(text()).toBe("H Wx y\n");
    await keys("/", "a", "shift+space", "b");
    expect(h.app.overlay?.kind === "prompt" && h.app.overlay.text).toBe("a b");
    await keys("escape", ":", "a", "shift+space", "b");
    expect(h.app.overlay?.kind === "list" && h.app.overlay.input).toBe("a b");
    await keys("escape");
  });
});
