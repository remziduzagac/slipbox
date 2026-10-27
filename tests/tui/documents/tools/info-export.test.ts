import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { stateDir } from "../../../../src/core/foundation/platform/paths.ts";
import { writeJson } from "../../../../src/core/foundation/platform/fsutil.ts";
import { rootAt } from "../../../../src/core/workspace/vaults/vault.ts";
import { formatFor } from "../../../../src/core/rendering/export/index.ts";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { harness, makeSandbox, makeVault } from "../../../tui-harness.ts";

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

test("Info keeps export paths in memory and reloads them when the vault changes", async () => {
  const root = makeVault();
  const other = makeVault();
  const h = await harness({ root, open: "index.md" });
  writeJson(join(stateDir(h.app.loc), "export.json"), { paths: { "index.md": "/first.html" } });
  expect(h.app.exporter.lastPath("index.md")).toBe("/first.html");
  writeJson(join(stateDir(h.app.loc), "export.json"), { paths: { "index.md": "/second.html" } });
  for (let i = 0; i < 3; i++) expect(h.app.exporter.lastPath("index.md")).toBe("/first.html");
  h.app.vaults.switchVault(rootAt(other), null);
  expect(h.app.exporter.lastPath("index.md")).toBeNull();
  h.app.vaults.switchVault(rootAt(root), null);
  expect(h.app.exporter.lastPath("index.md")).toBe("/second.html");
});
