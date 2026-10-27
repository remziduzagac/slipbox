import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("word completion without a server (25.5)", () => {
  const vault = (files: Record<string, string>) => {
    const root = makeVault();
    for (const [rel, text] of Object.entries(files)) writeFileSync(join(root, rel), text);
    return root;
  };
  const shown = (h: Harness) =>
    h.app.completion?.shown.map((i) => (i.detail ? `${i.label} (${i.detail})` : i.label)) ?? [];
  const typing = async (files: Record<string, string>, file: string, others: string[] = []) => {
    const h = await harness({ root: vault(files), open: others[0] ?? file, width: 160, height: 40 });
    for (const o of others.slice(1)) h.app.openInNewTab(o);
    if (others.length) h.app.openInNewTab(file);
    if (!h.app.view!.source) await h.keys("ctrl+k");
    return h;
  };

  test("ctrl+n: this file's words from the cursor on, around from the top, then the other open files'; ctrl+p the other way", async () => {
    const h = await typing(
      { "w1.md": "alpha zeta alphabet\nmid\nAlpine almond\n", "w2.md": "alder alpha\n" },
      "w1.md",
      ["w2.md"],
    );
    await h.app.run("cursor.goto_line 2");
    await h.keys("shift+a", "space", "a", "l", "ctrl+n");
    expect(h.app.completion?.words).toBe(true);
    // Typed in lower case, any case; each word once, the nearest kept; the word being typed not among them.
    expect(shown(h)).toEqual(["Alpine", "almond", "alpha", "alphabet", "alder (w2.md)"]);
    await h.keys("escape");
    await h.keys("a", "ctrl+p");
    expect(shown(h)).toEqual(["alphabet", "alpha", "almond", "Alpine", "alder (w2.md)"]);
    // Its keys are the popup's: ctrl+n moves on, enter puts it in.
    await h.keys("ctrl+n", "enter");
    expect(h.app.view!.buf.source).toBe("alpha zeta alphabet\nmid alpha\nAlpine almond\n");
    expect(h.app.completion).toBeNull();
  });

  test("narrowed as the word goes on, closed when it ends; a capital typed keeps to its case; none found, said", async () => {
    const h = await typing({ "w1.md": "alpha alphabet Alpine x\n\n" }, "w1.md");
    await h.app.run("cursor.goto_line 2");
    await h.keys("i", "a", "l", "ctrl+n");
    expect(shown(h)).toEqual(["alpha", "alphabet", "Alpine"]);
    await h.keys("p", "h", "a", "b");
    expect(shown(h)).toEqual(["alphabet"]);
    // Back to "alpha": the word typed is no choice of its own.
    await h.keys("backspace");
    expect(shown(h)).toEqual(["alphabet"]);
    await h.keys("backspace");
    expect(shown(h)).toEqual(["alpha", "alphabet"]);
    await h.keys("space");
    expect(h.app.completion).toBeNull();
    await h.keys("A", "l", "ctrl+n");
    expect(shown(h)).toEqual(["Alpine"]);
    // Moving closes it, though the word is still there.
    await h.keys("left");
    expect(h.app.completion).toBeNull();
    await h.keys("right", "ctrl+n");
    expect(shown(h)).toEqual(["Alpine"]);
    // Back to the word's start, every word; past it, closed.
    await h.keys("backspace", "backspace");
    // typos: off — "alph", typed.
    // The "alph" typed before it a word of the file's now; a letter alone (x) is no word to complete.
    expect(shown(h)).toEqual(["alpha", "alphabet", "Alpine", "alph"]);
    // typos: on
    await h.keys("backspace");
    expect(h.app.completion).toBeNull();
    await h.keys("escape", "a", "space", "q", "q", "ctrl+n");
    expect(h.app.completion).toBeNull();
    expect(h.app.messages.at(-1)?.text).toBe("no word in the open files starts with qq");
  });

  test("in the middle of a word, that word isn't one to offer: it's the one being completed", async () => {
    const h = await typing({ "w1.md": "alphas\nzeta alpha\n" }, "w1.md");
    await h.app.run("cursor.goto_line 2");
    await h.keys("0", "w", "l", "l", "l", "i", "ctrl+n");
    expect(shown(h)).toEqual(["alphas"]);
  });

  test("in a code file with no server too; . repeats the word put in, not the popup", async () => {
    const h = await typing({ "w.ts": "const counter = 1;\n" }, "w.ts");
    await h.keys("o", "c", "o", "ctrl+n");
    expect(shown(h)).toEqual(["const", "counter"]);
    // Narrowed by typing even where no server answers.
    await h.keys("u");
    expect(shown(h)).toEqual(["counter"]);
    await h.keys("tab", "escape");
    expect(h.app.view!.buf.source).toBe("const counter = 1;\ncounter\n");
    await h.keys(".");
    expect(h.app.view!.buf.source).toBe("const counter = 1;\ncounter\ncounter\n");
    expect(h.app.completion).toBeNull();
  });
});
