import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("replace in every note (25.4)", () => {
  const vault = (files: Record<string, string>) => {
    const root = makeVault();
    for (const [rel, text] of Object.entries(files)) writeFileSync(join(root, rel), text);
    return root;
  };
  const label = (h: Awaited<ReturnType<typeof harness>>) => (h.app.overlay as { label: string }).label;
  const typed = (h: Awaited<ReturnType<typeof harness>>) => (h.app.overlay as { text: string }).text;

  test("asked what and with what, previewed line by line, done; the open note follows; undone as a rename is", async () => {
    const root = vault({
      "q1.md": "Zorvex here\n",
      "q2.md": "a Zorvex, a Zorvex\n",
      "q3.md": "none\n",
      "q4.yaml": "name: Zorvex\n",
      "q5.ts": "// Zorvex\n",
    });
    const h = await harness({ root, open: "q1.md", width: 160, height: 40 });
    h.app.graph.build(true);
    await h.keys("ctrl+shift+h");
    expect(label(h)).toBe("replace in every note — find");
    await h.keys(...[..."Zorvex"], "enter");
    expect(label(h)).toBe('replace "Zorvex" in every note with');
    await h.keys(...[..."Pen"], "enter");
    const list = h.app.overlay as ListOverlay;
    // The files the explorer shows too (a data file here), not the ones it doesn't (code).
    expect(list.title).toStartWith('"Zorvex" → "Pen": 3 changes in 3 files');
    expect(list.items.map((i) => [i.label, i.detail])).toEqual([
      ["q1.md:1", "Zorvex here  →  Pen here"],
      ["q2.md:1", "a Zorvex, a Zorvex  →  a Pen, a Pen"],
      ["q4.yaml:1", "name: Zorvex  →  name: Pen"],
    ]);
    await h.keys("enter");
    expect(h.app.messages.at(-1)?.text).toBe('replaced "Zorvex" with "Pen": 3 changes in 3 files');
    expect([readFileSync(join(root, "q4.yaml"), "utf8"), readFileSync(join(root, "q5.ts"), "utf8")]).toEqual([
      "name: Pen\n",
      "// Zorvex\n",
    ]);
    expect([
      readFileSync(join(root, "q1.md"), "utf8"),
      readFileSync(join(root, "q2.md"), "utf8"),
      readFileSync(join(root, "q3.md"), "utf8"),
    ]).toEqual(["Pen here\n", "a Pen, a Pen\n", "none\n"]);
    expect(h.app.view!.buf.source).toBe("Pen here\n");
    await h.app.run("rename.undo");
    expect((h.app.overlay as ListOverlay).title).toStartWith('undo: "Pen" → "Zorvex": 3 changes in 3 files');
    await h.keys("enter");
    expect(h.app.messages.at(-1)?.text).toBe('undid the replace of "Zorvex" with "Pen": 3 changes in 3 files');
    expect([readFileSync(join(root, "q1.md"), "utf8"), readFileSync(join(root, "q2.md"), "utf8")]).toEqual([
      "Zorvex here\n",
      "a Zorvex, a Zorvex\n",
    ]);
    expect(h.app.view!.buf.source).toBe("Zorvex here\n");
  });

  test("the find's query, or a selection on one line, typed already; alt+r and alt+w flip the window's toggles, said", async () => {
    const root = vault({ "q1.md": "k=1 and kk=2\n" });
    const h = await harness({ root, open: "q1.md", width: 160, height: 40 });
    h.app.graph.build(true);
    if (!h.app.view!.source) await h.keys("ctrl+k");
    await h.keys("/", ...[..."and"], "enter");
    await h.app.run("find.replace_vault");
    expect(typed(h)).toBe("and");
    await h.keys("escape", "0", "v", "l", "l");
    await h.app.run("find.replace_vault");
    expect(typed(h)).toBe("k=1");
    await h.keys("alt+r");
    expect(label(h)).toBe("replace in every note — find (regex)");
    await h.keys("alt+w");
    expect(label(h)).toBe("replace in every note — find (regex, whole words)");
    // Flipped here, they're the window's: the second question says them too.
    await h.keys("ctrl+u", ...[..."(k)=(\\d)"], "enter");
    expect(label(h)).toBe('replace "(k)=(\\\\d)" in every note with (regex, whole words)');
    // And flipped there too.
    await h.keys("alt+w");
    expect(label(h)).toBe('replace "(k)=(\\\\d)" in every note with (regex)');
    await h.keys("alt+w");
    await h.keys(...[..."$2:$1"], "enter", "enter");
    expect(readFileSync(join(root, "q1.md"), "utf8")).toBe("1:k and kk=2\n");
    // Find in every note says them as well.
    await h.app.run("find.vault");
    expect(label(h)).toBe("find in every note (regex, whole words)");
    await h.keys("alt+r");
    expect(label(h)).toBe("find in every note (whole words)");
  });

  test("a match across a line break: the lines it spans one row, each break shown", async () => {
    const root = vault({ "q1.md": "one Zorvex\ntwo\n" });
    const h = await harness({ root, open: "q1.md", width: 160, height: 40 });
    h.app.graph.build(true);
    await h.app.run("find.replace_vault");
    await h.keys("alt+r", ...[..."Zorvex\\ntwo"], "enter", ...[..."Z"], "enter");
    expect((h.app.overlay as ListOverlay).items.map((i) => [i.label, i.detail])).toEqual([
      ["q1.md:1", "one Zorvex ⏎ two  →  one Z"],
    ]);
    await h.keys("enter");
    expect(readFileSync(join(root, "q1.md"), "utf8")).toBe("one Z\n");
  });

  test("refused where an unsaved file has a match; nothing found, nothing to do; not a regex, said", async () => {
    const root = vault({ "q1.md": "Zorvex\n", "q2.md": "plain\n" });
    const h = await harness({ root, open: "q2.md", width: 160, height: 40 });
    h.app.graph.build(true);
    // Its match only in what's open: on disk there's none, and a replace from disk would miss it.
    h.app.view!.buf.edit(0, 0, "Zorvex ");
    await h.app.run("find.replace_vault");
    await h.keys(...[..."Zorvex"], "enter", ...[..."Pen"], "enter");
    expect(h.app.messages.at(-1)?.text).toBe("unsaved: q2.md — save first: the replace rewrites it");
    expect(h.app.overlay).toBeNull();
    expect(readFileSync(join(root, "q1.md"), "utf8")).toBe("Zorvex\n");
    await h.app.run("find.replace_vault");
    await h.keys("ctrl+u", ...[..."zzz"], "enter", "x", "enter");
    expect((h.app.overlay as ListOverlay).items.map((i) => i.label)).toEqual(["nothing to replace"]);
    await h.keys("enter");
    expect(h.app.overlay).toBeNull();
    // Nothing done, nothing said done.
    expect(h.app.messages.some((m) => m.text.startsWith("replaced"))).toBe(false);
    await h.app.run("find.replace_vault");
    await h.keys("alt+r", "ctrl+u", "(", "enter");
    expect(h.app.messages.at(-1)?.text).toStartWith("not a regex:");
    // Made a regex at the second question, with a file unsaved: said, as at the first.
    await h.app.run("find.replace_vault");
    await h.keys("alt+r", "ctrl+u", "(", "enter");
    expect(label(h)).toBe('replace "(" in every note with');
    await h.keys("alt+r", "x", "enter");
    expect(h.app.messages.at(-1)?.text).toStartWith("not a regex:");
  });
});
