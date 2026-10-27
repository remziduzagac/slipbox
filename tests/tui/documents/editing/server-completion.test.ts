import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import { makeSandbox, makeVault, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("completion while typing (19.16)", () => {
  const served = (c: Config) => {
    const launcher = join(sandbox, "fake-ls-launcher-3");
    writeFileSync(
      launcher,
      `#!/usr/bin/env node\nawait import(${JSON.stringify(join(import.meta.dir, "../../../fixtures", "fake-lsp.ts"))});\n`,
    );
    c["language-server"] = { fake: { command: launcher, args: ["--stdio"] } };
    c.language = [{ name: "fake", "file-types": ["fk"], "language-servers": ["fake"] }];
  };
  const until = async (ok: () => boolean, ms = 25_000) => {
    for (const t = Date.now(); !ok() && Date.now() - t < ms; ) await Bun.sleep(20);
    return ok();
  };
  const ready = async (h: Harness) => {
    h.app.languages.startServers();
    h.frame();
    expect(await until(() => (h.frame(), h.app.languages.servers!.list()[0]?.state === "running"))).toBe(true);
    h.app.languages.triggers(h.app.view!.buf.abs); // asked once its servers run
    await until(() => h.app.languages.triggers(h.app.view!.buf.abs).completion.length > 0);
  };
  const shown = (h: Harness) => h.app.completion?.shown.map((i) => i.label) ?? [];

  test("a word begun: the server's items after a pause, narrowed as it's typed, under the cursor; tab puts one in", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "alpha beta alpine\n");
    const h = await harness({ root, open: "a.fk", config: served });
    await ready(h);
    await h.keys("o", "a", "l");
    expect(await until(() => shown(h).length > 0)).toBe(true);
    expect(shown(h)).toEqual(["alpha", "alpine"]); // narrowed by "al"
    expect(h.frame()).toMatch(/alpha\s*\n.*alpine/); // drawn, one under the other
    await h.keys("p", "i");
    expect(shown(h)).toEqual(["alpine"]); // narrowed again, not asked again
    await h.keys("tab");
    expect(h.app.view!.buf.source).toBe("alpha beta alpine\nalpine\n");
    expect(h.app.completion).toBeNull();
    expect(h.app.view!.insert).toBe(true);
    await h.keys("space", "z", "q");
    await Bun.sleep(300);
    expect(h.app.completion).toBeNull(); // nothing for zq
    await h.app.languages.servers!.stopAll();
  });

  test("the open files' words (25.5) beside a server: no ask waiting replaces them; a trigger closes them, the server's come", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "alpha beta\n");
    const h = await harness({ root, open: "a.fk", config: served });
    await ready(h);
    // A word begun asks the server after a pause: ctrl+n before it, and the words stay.
    await h.keys("o", "b", "ctrl+n");
    expect(shown(h)).toEqual(["beta"]);
    await Bun.sleep(400);
    expect(h.app.completion?.words).toBe(true);
    await h.keys(".");
    expect(h.app.completion?.words).not.toBe(true);
    expect(await until(() => shown(h).length === 2)).toBe(true);
    // Asked at once by a trigger, then ctrl+n before the answer: the answer, come later, is dropped.
    await h.keys("escape", "o", "x", ".", "ctrl+n");
    await Bun.sleep(400);
    expect(h.app.completion?.words).toBe(true);
    await h.keys("escape");
    await h.app.languages.servers!.stopAll();
  });

  test("a snippet (25.8): its stops in turn — the placeholder replaced by what's typed, its mirrors following — then $0", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "SNIPPETS\n");
    const h = await harness({ root, open: "a.fk", config: served });
    await ready(h);
    const text = () => h.app.view!.buf.source;
    await h.keys("o", "f", "o");
    expect(await until(() => shown(h)[0] === "fori")).toBe(true);
    await h.keys("tab");
    // Expanded: the mirrors given the placeholder, the tab the file's two spaces, the new lines the line's indent.
    expect(text()).toBe("SNIPPETS\nfor (ix = 0; ix < n; ix++) {\n  \n}\n");
    expect(h.app.snippet).not.toBeNull();
    // The first stop's placeholder marked as selected, the cursor on it; typed over, the mirrors follow.
    const c = h.canvas();
    const y = c.rows.findIndex((r) => r.join("").includes("for (ix = 0"));
    // Its second cell: the cursor's on the first.
    expect(c.styles[y]![c.rows[y]!.join("").indexOf("x = 0")]!.bg).toBe(h.app.theme.roles.selection.bg!);
    expect(c.styles[y]![c.rows[y]!.join("").indexOf(" = 0")]!.bg).not.toBe(h.app.theme.roles.selection.bg!);
    await h.keys("j", "j");
    expect(text()).toBe("SNIPPETS\nfor (jj = 0; jj < n; jj++) {\n  \n}\n");
    await h.keys("tab", "l", "e", "n");
    expect(text()).toBe("SNIPPETS\nfor (jj = 0; jj < len; jj++) {\n  \n}\n");
    // shift+tab back to the first, then on to $0: inside the block, the session over.
    await h.keys("shift+tab", "backspace", "k", "tab", "tab");
    expect(text()).toBe("SNIPPETS\nfor (k = 0; k < len; k++) {\n  \n}\n");
    expect(h.app.snippet).toBeNull();
    await h.keys("x", "escape");
    expect(text()).toBe("SNIPPETS\nfor (k = 0; k < len; k++) {\n  x\n}\n");
    // A snippet's typing can't be repeated as keys: . has nothing.
    await h.keys(".");
    expect(text()).toBe("SNIPPETS\nfor (k = 0; k < len; k++) {\n  x\n}\n");
    await h.app.languages.servers!.stopAll();
  });

  test("a snippet's placeholder kept by a move, typed into there; a nested stop gone with its parent's placeholder; :e! ends it", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "SNIPPETS\n");
    const h = await harness({ root, open: "a.fk", config: served });
    await ready(h);
    const text = () => h.app.view!.buf.source;
    await h.keys("o", "f", "o");
    expect(await until(() => shown(h)[0] === "fori")).toBe(true);
    await h.keys("tab", "right", "q");
    // The move kept "ix": q went in after its i, the mirrors following.
    expect(text()).toBe("SNIPPETS\nfor (iqx = 0; iqx < n; iqx++) {\n  \n}\n");
    await h.keys("escape", "u");
    expect(text()).toBe("SNIPPETS\n");
    await h.keys("o", "n", "e");
    expect(await until(() => shown(h)[0] === "nest")).toBe(true);
    await h.keys("tab");
    expect(text()).toBe("SNIPPETS\nf(a, b)\n");
    // Typed over the outer placeholder: the inner stop goes with it; tab is $0, after the ).
    await h.keys("z", "tab");
    expect(h.app.snippet).toBeNull();
    await h.keys("q");
    expect(text()).toBe("SNIPPETS\nf(z)q\n");
    // A snippet when the note is reverted (:e!): over with insert.
    await h.keys("escape", "o", "f", "o");
    expect(await until(() => shown(h)[0] === "fori")).toBe(true);
    await h.keys("tab");
    expect(h.app.snippet).not.toBeNull();
    // Saved with it: reverting changes no text, and still ends it.
    await h.keys("ctrl+s");
    await h.app.run("note.revert");
    expect(h.app.snippet).toBeNull();
    await h.app.languages.servers!.stopAll();
  });

  test("a snippet's choice (the first), its variable's value; an import added above moves its stops; esc ends it", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "SNIPPETS\n");
    const h = await harness({ root, open: "a.fk", config: served });
    await ready(h);
    const text = () => h.app.view!.buf.source;
    await h.keys("o", "p", "i");
    expect(await until(() => shown(h)[0] === "pick")).toBe(true);
    await h.keys("tab");
    expect(text()).toBe("SNIPPETS\npick(one, a)\n");
    // On to the variable's stop; a backspace takes its placeholder.
    await h.keys("tab", "backspace", "b");
    expect(text()).toBe("SNIPPETS\npick(one, b)\n");
    await h.keys("escape");
    expect(h.app.snippet).toBeNull();
    // Insert again: tab indents, no stop to go to.
    await h.keys("o", "i", "m");
    expect(await until(() => shown(h)[0] === "imp")).toBe(true);
    await h.keys("tab");
    expect(text()).toBe("import x\nSNIPPETS\npick(one, b)\nuse(it)\n");
    await h.keys("z");
    expect(text()).toBe("import x\nSNIPPETS\npick(one, b)\nuse(z)\n");
    // Moving off the stop ends it: tab indents again.
    await h.keys("end", "tab");
    expect(h.app.snippet).toBeNull();
    expect(text()).toBe("import x\nSNIPPETS\npick(one, b)\n  use(z)\n");
    await h.keys("escape");
    await h.app.languages.servers!.stopAll();
  });

  test("after a trigger character at once: ctrl+n moves, enter puts it in with its import; escape closes and leaves insert", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "start\n");
    const h = await harness({ root, open: "a.fk", config: served });
    await ready(h);
    await h.keys("o", "x", ".");
    expect(await until(() => shown(h).length === 2)).toBe(true);
    expect(shown(h)).toEqual(["member", "method"]);
    await h.keys("ctrl+n", "enter");
    expect(h.app.view!.buf.source).toBe("import x\nstart\nx.method\n");
    expect(h.app.view!.insert).toBe(true);
    await h.keys("space", "y", ".");
    expect(h.app.view!.buf.source).toBe("import x\nstart\nx.method y.\n"); // the cursor moved down with its line
    expect(await until(() => shown(h).length === 2)).toBe(true);
    await h.keys("ctrl+e"); // closed, still typing
    expect(h.app.completion).toBeNull();
    expect(h.app.view!.insert).toBe(true);
    await h.keys(".");
    expect(await until(() => shown(h).length === 2)).toBe(true);
    await h.keys("escape");
    expect(h.app.completion).toBeNull();
    expect(h.app.view!.insert).toBe(false);
    await h.app.languages.servers!.stopAll();
  });

  test("the last ask's answer stands: a pause's ask gives way to a trigger's, an older answer arriving late is dropped", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "SLOW start\n");
    const h = await harness({ root, open: "a.fk", config: served });
    await ready(h);
    const members = ["member", "method"];
    // A word's pause asks (answered late); then `.` asks again before that answer comes.
    await h.keys("o", "s", "t");
    await Bun.sleep(150);
    await h.keys(".");
    expect(await until(() => shown(h).length === 2)).toBe(true);
    await Bun.sleep(400);
    expect(shown(h)).toEqual(members);
    // `.` right after a word begun: its pause never asks.
    await h.keys("escape", "o", "x", ".");
    expect(await until(() => shown(h).length === 2)).toBe(true);
    await Bun.sleep(500);
    expect(shown(h)).toEqual(members);
    await h.app.languages.servers!.stopAll();
  });

  test("signature help: after ( the signature, its parameter marked; after , the next; ) closes it", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "start\n");
    const h = await harness({ root, open: "a.fk", config: served });
    await ready(h);
    await h.keys("o", "f", "n", "(");
    expect(await until(() => h.app.signature !== null)).toBe(true);
    const marked = () => h.app.signature!.label.slice(...h.app.signature!.active!);
    expect(marked()).toBe("a: number");
    expect(h.frame()).toContain("fn(a: number, b: string)");
    await h.keys("1", ",");
    expect(await until(() => marked() === "b: string")).toBe(true);
    await h.keys(")");
    expect(h.app.signature).toBeNull();
    await h.app.languages.servers!.stopAll();
  });

  test("up (ctrl+p) from the first item wraps to the last; backspace to the word's start closes the popup", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "alpha beta alpine\n");
    const h = await harness({ root, open: "a.fk", config: served });
    await ready(h);
    await h.keys("o", "x", ".");
    expect(await until(() => shown(h).length === 2)).toBe(true);
    await h.keys("up");
    expect(h.app.completion!.selected).toBe(1);
    await h.keys("ctrl+p");
    expect(h.app.completion!.selected).toBe(0);
    await h.keys("up", "enter");
    expect(h.app.view!.buf.source).toBe("import x\nalpha beta alpine\nx.method\n");
    await h.keys("escape", "o", "a", "l");
    expect(await until(() => shown(h).length > 0)).toBe(true);
    await h.keys("backspace");
    expect(shown(h).slice(0, 2)).toEqual(["alpha", "alpine"]); // "a": open still
    await h.keys("backspace");
    expect(h.app.completion).toBeNull(); // nothing typed of a word
    await Bun.sleep(300);
    expect(h.app.completion).toBeNull(); // and not asked again
    await h.app.languages.servers!.stopAll();
  });

  test("signature help closes when the server has none for where the cursor is", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "start\n");
    const h = await harness({ root, open: "a.fk", config: served });
    await ready(h);
    await h.keys("o", "f", "n", "(");
    expect(await until(() => h.app.signature !== null)).toBe(true);
    await h.keys("enter", ","); // a new line: no call being typed there
    expect(await until(() => h.app.signature === null)).toBe(true);
    await h.app.languages.servers!.stopAll();
  });

  test("`(` ends the word: signature help slow to answer, the pause after `fn` asks for no completion (#37)", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "LATESIG start\n");
    const h = await harness({ root, open: "a.fk", config: served });
    await ready(h);
    await h.keys("o", "f", "n", "(");
    expect(await until(() => h.app.signature !== null)).toBe(true); // 300 ms: the word's pause (100 ms) long past
    expect(h.app.completion).toBeNull();
    // enter a new line, not a word picked from a popup.
    await h.keys("enter", ",");
    expect(h.app.view!.buf.source).toMatch(/^LATESIG start\nfn\(\n *,\n$/); // indented as after a `(`
    expect(await until(() => h.app.signature === null)).toBe(true);
    await h.app.languages.servers!.stopAll();
  });

  test("signature help answered late, the first argument typed meanwhile: shown all the same", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "LATESIG start\n");
    const h = await harness({ root, open: "a.fk", config: served });
    await ready(h);
    // `x` typed before the answer (300 ms) comes: the word's pause tells the server the newer text first.
    await h.keys("o", "f", "n", "(", "x");
    expect(await until(() => h.app.signature !== null, 3000)).toBe(true);
    expect(h.app.signature!.label).toBe("fn(a: number, b: string)");
    await h.app.languages.servers!.stopAll();
  });

  test("signature help answered late, after `)` closed it: it stays closed", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "LATESIG start\n");
    const h = await harness({ root, open: "a.fk", config: served });
    await ready(h);
    await h.keys("o", "f", "n", "(", ")");
    await Bun.sleep(600); // its answer come and gone
    expect(h.app.signature).toBeNull();
    await h.app.languages.servers!.stopAll();
  });

  test("`(` ends the word: the word's items asked for before it, answered late, open no popup after it (#37)", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "SLOW start\n"); // SLOW: a word's items answered 300 ms late
    const h = await harness({ root, open: "a.fk", config: served });
    await ready(h);
    await h.keys("o", "f", "n");
    await new Promise((r) => setTimeout(r, 150)); // the pause passed: asked for `fn`'s items
    await h.keys("(");
    await new Promise((r) => setTimeout(r, 450)); // their answer come
    expect(h.app.completion).toBeNull();
    await h.app.languages.servers!.stopAll();
  });
});
