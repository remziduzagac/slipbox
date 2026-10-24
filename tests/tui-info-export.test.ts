import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatFor } from "../src/core/export/index.ts";
import type { ListOverlay } from "../src/tui/app.ts";
import { harness, makeSandbox, makeVault } from "./tui-harness.ts";

makeSandbox();

test("Info offers export for notes, runs note.export from row and x, and copies the last output path", async () => {
  const root = makeVault();
  const h = await harness({ root, open: "index.md" });
  let row = h.app.info.rows().at(-1)!;
  expect(row.key).toBe("Export…");
  h.app.info.openRow(row);
  expect((h.app.overlay as ListOverlay).title).toBe("Export index.md as");
  await h.keys("escape");
  await h.app.run("note.info");
  await h.keys("x");
  expect((h.app.overlay as ListOverlay).title).toBe("Export index.md as");
  await h.keys("escape");
  const output = join(root, "index.html");
  await h.app.exporter.write(["index.md"], formatFor("html")!, output);
  row = h.app.info.rows().at(-1)!;
  expect(row.value).toBe(output);
  h.app.outline.selected = h.app.info.rows().length - 1;
  h.app.info.action("copy");
  expect(h.copied.at(-1)).toBe(output);
  const restarted = await harness({ root, open: "index.md" });
  expect(restarted.app.info.rows().at(-1)!.value).toBe(output);
});

test("Info has no export row for code or data", async () => {
  const root = makeVault();
  writeFileSync(join(root, "a.ts"), "export const a = 1;\n");
  writeFileSync(join(root, "a.json"), '{"a": 1}\n');
  for (const open of ["a.ts", "a.json"]) {
    const h = await harness({ root, open });
    expect(h.app.info.rows().some((row) => row.key === "Export…")).toBe(false);
    h.app.info.action("export");
    expect(h.app.overlay).toBeNull();
  }
});
