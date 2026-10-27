import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness, statusRow } from "../../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

test("following a path link's fragment: a block's ^id lands on its block (an embed's header too); a % that doesn't decode doesn't throw", async () => {
  const root = makeVault();
  mkdirSync(join(root, "sub"));
  writeFileSync(join(root, "sub", "b.md"), "# B\n\nOne.\n\nThe block. ^abc\n");
  writeFileSync(join(root, "host.md"), "# Host\n\n![c](sub/b.md#^abc)\n\nOdd [x](sub/b.md#a%zz) here.\n");
  const h = await harness({ root, open: "host.md" });
  h.app.graph.build(true);
  const v = () => h.app.view!;
  const onRow = (text: string) => {
    const lines = h.app.currentLayout(v()).lines;
    const row = lines.findIndex((l) =>
      l.spans
        .map((s) => s.text)
        .join("")
        .includes(text),
    );
    h.app.moveCursor(v(), { row, col: [...lines[row]!.spans.map((s) => s.text).join("")].indexOf(text[0]!) + 1 });
  };
  h.frame();
  onRow("⧉ b ^abc");
  await h.app.run("link.follow");
  expect(v().buf.rel).toBe("sub/b.md");
  expect(statusRow(h.frame())).toMatch(/L5:/);
  expect(h.app.messages.some((m) => m.text.includes("no heading"))).toBe(false);
  await h.app.run("history.back");
  h.frame();
  onRow("Odd x here");
  await h.app.run("link.follow");
  expect(v().buf.rel).toBe("sub/b.md");
});
