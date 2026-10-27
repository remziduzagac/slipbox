import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ListOverlay } from "../../../../../src/tui/app/runtime/app.ts";
import { makeSandbox, makeVault, harness } from "../../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

test("the converter from the TUI (20.1): previewed; an ambiguous link's row picks its note, then it's planned again; enter writes it", async () => {
  const root = makeVault();
  writeFileSync(join(root, "conv.md"), "See [[beta]] and [[dup]].\n");
  mkdirSync(join(root, "x"));
  mkdirSync(join(root, "y"));
  writeFileSync(join(root, "x", "dup.md"), "# X\n");
  writeFileSync(join(root, "y", "dup.md"), "# Y\n");
  const h = await harness({ root, open: "conv.md" });
  h.app.graph.build(true);
  await h.app.run("link.convert conv");
  let o = h.app.overlay as ListOverlay;
  expect(o.title).toStartWith("links → plain paths: 1 change in 1 file");
  const rows = () => (h.app.overlay as ListOverlay).items.map((i) => i.label);
  expect(rows()).toEqual(["pick conv.md:1", "conv.md:1"]);
  // The ambiguous one: enter lists its notes; one picked, the preview comes back with it.
  await h.keys("enter");
  o = h.app.overlay as ListOverlay;
  expect(o.title).toBe("[[dup]] in conv.md:1 — which note?");
  expect(o.items.map((i) => i.label)).toEqual(["x/dup.md", "y/dup.md"]);
  await h.keys("down", "enter");
  expect((h.app.overlay as ListOverlay).title).toStartWith("links → plain paths: 1 change in 1 file"); // a line changed
  expect(rows()).toEqual(["conv.md:1"]);
  expect((h.app.overlay as ListOverlay).items[0]!.detail).toBe(
    "See [[beta]] and [[dup]].  →  See [beta](notes/beta.md) and [dup](y/dup.md).",
  );
  await h.keys("enter");
  expect(readFileSync(join(root, "conv.md"), "utf8")).toBe("See [beta](notes/beta.md) and [dup](y/dup.md).\n");
  expect(h.app.messages.at(-1)?.text).toBe("converted links to plain paths: 1 change in 1 file");
});

test("the converter's other TUI paths (20.1): every note, a note that isn't, nothing left, unsaved refused, undone", async () => {
  const root = makeVault();
  writeFileSync(join(root, "c1.md"), "[[beta]]\n");
  writeFileSync(join(root, "c2.md"), "[[beta]] too\n");
  const h = await harness({ root, open: "c1.md" });
  h.app.graph.build(true);
  await h.app.run("link.convert nope");
  expect(h.app.messages.at(-1)?.text).toBe('no note "nope"');
  // Unsaved: refused, as a rename is.
  h.app.view!.buf.edit(0, 0, "x");
  await h.app.run("link.convert c1");
  expect(h.app.messages.at(-1)?.text).toStartWith("unsaved: c1.md");
  h.app.view!.buf.edit(0, 1, "");
  await h.app.run("note.save");
  // No note named: every note's.
  await h.app.run("link.convert");
  const rows = (h.app.overlay as ListOverlay).items.map((i) => i.label);
  expect(rows).toContain("c1.md:1");
  expect(rows).toContain("c2.md:1");
  await h.keys("escape");
  await h.app.run("link.convert c1");
  await h.keys("enter");
  expect(readFileSync(join(root, "c1.md"), "utf8")).toBe("[beta](notes/beta.md)\n");
  await h.app.run("link.convert c1");
  expect((h.app.overlay as ListOverlay).items.map((i) => i.label)).toEqual(["nothing left to convert"]);
  await h.keys("escape");
  await h.app.run("rename.undo");
  await h.keys("enter");
  expect(h.app.messages.at(-1)?.text).toBe("undid the conversion to plain paths: 1 change in 1 file");
  expect(readFileSync(join(root, "c1.md"), "utf8")).toBe("[[beta]]\n");
});
