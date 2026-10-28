import { expect, test } from "bun:test";
import {
  applyOverlay,
  overlayText,
  type EditorOverlay,
} from "../../../../../src/core/workspace/graph/overlays/editor.ts";
import { extractFromSource } from "../../../../../src/core/workspace/graph/graph-extract.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCoreSandbox } from "../../../../support/core-sandbox.ts";

const sandbox = makeCoreSandbox();

test("editor overlays retain original disk identity, expose unsaved facts and release the latest underlay", () => {
  const file = { rel: "note.md", abs: join(sandbox, "note.md"), size: 10, mtimeMs: 20 };
  const disk = extractFromSource(file, "# Disk\n");
  const notes = new Map([[file.rel, disk]]);
  const overlays = new Map<string, EditorOverlay>();
  const context = { root: sandbox, notes, entry: (rel: string) => notes.get(rel) };
  expect(applyOverlay(context, overlays, "missing.md", "# Missing")).toBe(false);
  expect(applyOverlay(context, overlays, file.rel, "# Unsaved\n\n[[other]]\n")).toBe(true);
  expect(notes.get(file.rel)?.title).toBe("Unsaved");
  expect(overlays.get(file.rel)?.disk).toBe(disk);
  expect(overlayText(sandbox, overlays, file.abs)).toBe("# Unsaved\n\n[[other]]\n");
  const newer = { ...disk, title: "New disk" };
  overlays.get(file.rel)!.disk = newer;
  applyOverlay(context, overlays, file.rel, "# Still unsaved\n");
  expect(overlays.get(file.rel)?.disk).toBe(newer);
  expect(applyOverlay(context, overlays, file.rel, null)).toBe(true);
  expect(notes.get(file.rel)).toBe(newer);
  expect(applyOverlay(context, overlays, file.rel, null)).toBe(false);
  writeFileSync(file.abs, "on disk");
  expect(overlayText(sandbox, overlays, file.rel)).toBe("on disk");
  expect(overlayText(sandbox, overlays, "missing.md")).toBeNull();
});
